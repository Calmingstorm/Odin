var Ym=Object.defineProperty;var Qm=(e,t,s)=>t in e?Ym(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ot=(e,t,s)=>Qm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Xm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new ul("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new cd(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new ul("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new cd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ul((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ul?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ul extends Error{constructor(t){super(t),this.name="AuthError"}}class cd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class eg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const G=new Xm,je=new eg(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function _s(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},Da=[],zt=()=>{},La=()=>!1,ha=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),pr=e=>e.startsWith("onUpdate:"),Ve=Object.assign,Xo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},tg=Object.prototype.hasOwnProperty,tt=(e,t)=>tg.call(e,t),ke=Array.isArray,Pa=e=>ni(e)==="[object Map]",ma=e=>ni(e)==="[object Set]",dd=e=>ni(e)==="[object Date]",sg=e=>ni(e)==="[object RegExp]",Pe=e=>typeof e=="function",Fe=e=>typeof e=="string",Jt=e=>typeof e=="symbol",et=e=>e!==null&&typeof e=="object",ec=e=>(et(e)||Pe(e))&&Pe(e.then)&&Pe(e.catch),hp=Object.prototype.toString,ni=e=>hp.call(e),ng=e=>ni(e).slice(8,-1),fr=e=>ni(e)==="[object Object]",hr=e=>Fe(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,bn=_s(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),ag=_s("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),mr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},ig=/-\w/g,lt=mr(e=>e.replace(ig,t=>t.slice(1).toUpperCase())),lg=/\B([A-Z])/g,fs=mr(e=>e.replace(lg,"-$1").toLowerCase()),ga=mr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Fa=mr(e=>e?`on${ga(e)}`:""),Mt=(e,t)=>!Object.is(e,t),$a=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},mp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},gr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Pl=e=>{const t=Fe(e)?Number(e):NaN;return isNaN(t)?e:t};let ud;const vr=()=>ud||(ud=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function rg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const og="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",cg=_s(og);function Qi(e){if(ke(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Fe(n)?gp(n):Qi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Fe(e)||et(e))return e}const dg=/;(?![^(]*\))/g,ug=/:([^]+)/,pg=/\/\*[^]*?\*\//g;function gp(e){const t={};return e.replace(pg,"").split(dg).forEach(s=>{if(s){const n=s.split(ug);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Xi(e){let t="";if(Fe(e))t=e;else if(ke(e))for(let s=0;s<e.length;s++){const n=Xi(e[s]);n&&(t+=n+" ")}else if(et(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function fg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Fe(t)&&(e.class=Xi(t)),s&&(e.style=Qi(s)),e}const hg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",mg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",gg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",vg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",bg=_s(hg),yg=_s(mg),xg=_s(gg),_g=_s(vg),wg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",kg=_s(wg);function vp(e){return!!e||e===""}function Sg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=wn(e[n],t[n]);return s}function wn(e,t){if(e===t)return!0;let s=dd(e),n=dd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Jt(e),n=Jt(t),s||n)return e===t;if(s=ke(e),n=ke(t),s||n)return s&&n?Sg(e,t):!1;if(s=et(e),n=et(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!wn(e[l],t[l]))return!1}}return String(e)===String(t)}function br(e,t){return e.findIndex(s=>wn(s,t))}const bp=e=>!!(e&&e.__v_isRef===!0),yp=e=>Fe(e)?e:e==null?"":ke(e)||et(e)&&(e.toString===hp||!Pe(e.toString))?bp(e)?yp(e.value):JSON.stringify(e,xp,2):String(e),xp=(e,t)=>bp(t)?xp(e,t.value):Pa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[zr(n,i)+" =>"]=a,s),{})}:ma(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>zr(s))}:Jt(t)?zr(t):et(t)&&!ke(t)&&!fr(t)?String(t):t,zr=(e,t="")=>{var s;return Jt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Tg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Ot;class tc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Ot&&(Ot.active?(this.parent=Ot,this.index=(Ot.scopes||(Ot.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Ot;try{return Ot=this,t()}finally{Ot=s}}}on(){++this._on===1&&(this.prevScope=Ot,Ot=this)}off(){if(this._on>0&&--this._on===0){if(Ot===this)Ot=this.prevScope;else{let t=Ot;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Cg(e){return new tc(e)}function _p(){return Ot}function Eg(e,t=!1){Ot&&Ot.cleanups.push(e)}let ct;const jr=new WeakSet;class Mi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Ot&&(Ot.active?Ot.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,jr.has(this)&&(jr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||kp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,pd(this),Sp(this);const t=ct,s=Bs;ct=this,Bs=!0;try{return this.fn()}finally{Tp(this),ct=t,Bs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)ac(t);this.deps=this.depsTail=void 0,pd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?jr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){bo(this)&&this.run()}get dirty(){return bo(this)}}let wp=0,ki,Si;function kp(e,t=!1){if(e.flags|=8,t){e.next=Si,Si=e;return}e.next=ki,ki=e}function sc(){wp++}function nc(){if(--wp>0)return;if(Si){let t=Si;for(Si=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;ki;){let t=ki;for(ki=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Sp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Tp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),ac(n),Ag(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function bo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Cp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Cp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Di)||(e.globalVersion=Di,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!bo(e))))return;e.flags|=2;const t=e.dep,s=ct,n=Bs;ct=e,Bs=!0;try{Sp(e);const a=e.fn(e._value);(t.version===0||Mt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ct=s,Bs=n,Tp(e),e.flags&=-3}}function ac(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)ac(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Ag(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Rg(e,t){e.effect instanceof Mi&&(e=e.effect.fn);const s=new Mi(e);t&&Ve(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Ig(e){e.effect.stop()}let Bs=!0;const Ep=[];function kn(){Ep.push(Bs),Bs=!1}function Sn(){const e=Ep.pop();Bs=e===void 0?!0:e}function pd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ct;ct=void 0;try{t()}finally{ct=s}}}let Di=0;class Og{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class yr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ct||!Bs||ct===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ct)s=this.activeLink=new Og(ct,this),ct.deps?(s.prevDep=ct.depsTail,ct.depsTail.nextDep=s,ct.depsTail=s):ct.deps=ct.depsTail=s,Ap(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ct.depsTail,s.nextDep=void 0,ct.depsTail.nextDep=s,ct.depsTail=s,ct.deps===s&&(ct.deps=n)}return s}trigger(t){this.version++,Di++,this.notify(t)}notify(t){sc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{nc()}}}function Ap(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Ap(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Fl=new WeakMap,ia=Symbol(""),yo=Symbol(""),Pi=Symbol("");function Gt(e,t,s){if(Bs&&ct){let n=Fl.get(e);n||Fl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new yr),a.map=n,a.key=s),a.track()}}function fn(e,t,s,n,a,i){const l=Fl.get(e);if(!l){Di++;return}const r=o=>{o&&o.trigger()};if(sc(),t==="clear")l.forEach(r);else{const o=ke(e),c=o&&hr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Pi||!Jt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Pi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(ia)),Pa(e)&&r(l.get(yo)));break;case"delete":o||(r(l.get(ia)),Pa(e)&&r(l.get(yo)));break;case"set":Pa(e)&&r(l.get(ia));break}}nc()}function Ng(e,t){const s=Fl.get(e);return s&&s.get(t)}function ka(e){const t=Ye(e);return t===e?t:(Gt(t,"iterate",Pi),ms(e)?t:t.map(zs))}function xr(e){return Gt(e=Ye(e),"iterate",Pi),e}function Xs(e,t){return tn(e)?qa(yn(e)?zs(t):t):zs(t)}const Lg={__proto__:null,[Symbol.iterator](){return Vr(this,Symbol.iterator,e=>Xs(this,e))},concat(...e){return ka(this).concat(...e.map(t=>ke(t)?ka(t):t))},entries(){return Vr(this,"entries",e=>(e[1]=Xs(this,e[1]),e))},every(e,t){return an(this,"every",e,t,void 0,arguments)},filter(e,t){return an(this,"filter",e,t,s=>s.map(n=>Xs(this,n)),arguments)},find(e,t){return an(this,"find",e,t,s=>Xs(this,s),arguments)},findIndex(e,t){return an(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return an(this,"findLast",e,t,s=>Xs(this,s),arguments)},findLastIndex(e,t){return an(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return an(this,"forEach",e,t,void 0,arguments)},includes(...e){return qr(this,"includes",e)},indexOf(...e){return qr(this,"indexOf",e)},join(e){return ka(this).join(e)},lastIndexOf(...e){return qr(this,"lastIndexOf",e)},map(e,t){return an(this,"map",e,t,void 0,arguments)},pop(){return ci(this,"pop")},push(...e){return ci(this,"push",e)},reduce(e,...t){return fd(this,"reduce",e,t)},reduceRight(e,...t){return fd(this,"reduceRight",e,t)},shift(){return ci(this,"shift")},some(e,t){return an(this,"some",e,t,void 0,arguments)},splice(...e){return ci(this,"splice",e)},toReversed(){return ka(this).toReversed()},toSorted(e){return ka(this).toSorted(e)},toSpliced(...e){return ka(this).toSpliced(...e)},unshift(...e){return ci(this,"unshift",e)},values(){return Vr(this,"values",e=>Xs(this,e))}};function Vr(e,t,s){const n=xr(e),a=n[t]();return n!==e&&!ms(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Mg=Array.prototype;function an(e,t,s,n,a,i){const l=xr(e),r=l!==e&&!ms(e),o=l[t];if(o!==Mg[t]){const u=o.apply(e,i);return r?zs(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,Xs(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function fd(e,t,s,n){const a=xr(e),i=a!==e&&!ms(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=Xs(e,c)),s.call(this,c,Xs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?Xs(e,o):o}function qr(e,t,s){const n=Ye(e);Gt(n,"iterate",Pi);const a=n[t](...s);return(a===-1||a===!1)&&el(s[0])?(s[0]=Ye(s[0]),n[t](...s)):a}function ci(e,t,s=[]){kn(),sc();const n=Ye(e)[t].apply(e,s);return nc(),Sn(),n}const Dg=_s("__proto__,__v_isRef,__isVue"),Rp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Jt));function Pg(e){Jt(e)||(e=String(e));const t=Ye(this);return Gt(t,"has",e),t.hasOwnProperty(e)}class Ip{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Pp:Dp:i?Mp:Lp).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=ke(t);if(!a){let o;if(l&&(o=Lg[s]))return o;if(s==="hasOwnProperty")return Pg}const r=Reflect.get(t,s,At(t)?t:n);if((Jt(s)?Rp.has(s):Dg(s))||(a||Gt(t,"get",s),i))return r;if(At(r)){const o=l&&hr(s)?r:r.value;return a&&et(o)?$l(o):o}return et(r)?a?$l(r):zn(r):r}}class Op extends Ip{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=ke(t)&&hr(s);if(!this._isShallow){const c=tn(i);if(!ms(n)&&!tn(n)&&(i=Ye(i),n=Ye(n)),!l&&At(i)&&!At(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:tt(t,s),o=Reflect.set(t,s,n,At(t)?t:a);return t===Ye(a)&&(r?Mt(n,i)&&fn(t,"set",s,n):fn(t,"add",s,n)),o}deleteProperty(t,s){const n=tt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&fn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Jt(s)||!Rp.has(s))&&Gt(t,"has",s),n}ownKeys(t){return Gt(t,"iterate",ke(t)?"length":ia),Reflect.ownKeys(t)}}class Np extends Ip{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Fg=new Op,$g=new Np,Ug=new Op(!0),Bg=new Np(!0),xo=e=>e,pl=e=>Reflect.getPrototypeOf(e);function Hg(e,t,s){return function(...n){const a=this.__v_raw,i=Ye(a),l=Pa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?xo:t?qa:zs;return!t&&Gt(i,"iterate",o?yo:ia),Ve(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function fl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function zg(e,t){const s={get(a){const i=this.__v_raw,l=Ye(i),r=Ye(a);e||(Mt(a,r)&&Gt(l,"get",a),Gt(l,"get",r));const{has:o}=pl(l),c=t?xo:e?qa:zs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Gt(Ye(a),"iterate",ia),a.size},has(a){const i=this.__v_raw,l=Ye(i),r=Ye(a);return e||(Mt(a,r)&&Gt(l,"has",a),Gt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ye(r),c=t?xo:e?qa:zs;return!e&&Gt(o,"iterate",ia),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ve(s,e?{add:fl("add"),set:fl("set"),delete:fl("delete"),clear:fl("clear")}:{add(a){const i=Ye(this),l=pl(i),r=Ye(a),o=!t&&!ms(a)&&!tn(a)?r:a;return l.has.call(i,o)||Mt(a,o)&&l.has.call(i,a)||Mt(r,o)&&l.has.call(i,r)||(i.add(o),fn(i,"add",o,o)),this},set(a,i){!t&&!ms(i)&&!tn(i)&&(i=Ye(i));const l=Ye(this),{has:r,get:o}=pl(l);let c=r.call(l,a);c||(a=Ye(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Mt(i,d)&&fn(l,"set",a,i):fn(l,"add",a,i),this},delete(a){const i=Ye(this),{has:l,get:r}=pl(i);let o=l.call(i,a);o||(a=Ye(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&fn(i,"delete",a,void 0),c},clear(){const a=Ye(this),i=a.size!==0,l=a.clear();return i&&fn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Hg(a,e,t)}),s}function _r(e,t){const s=zg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(tt(s,a)&&a in n?s:n,a,i)}const jg={get:_r(!1,!1)},Vg={get:_r(!1,!0)},qg={get:_r(!0,!1)},Gg={get:_r(!0,!0)},Lp=new WeakMap,Mp=new WeakMap,Dp=new WeakMap,Pp=new WeakMap;function Kg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function zn(e){return tn(e)?e:wr(e,!1,Fg,jg,Lp)}function ic(e){return wr(e,!1,Ug,Vg,Mp)}function $l(e){return wr(e,!0,$g,qg,Dp)}function Wg(e){return wr(e,!0,Bg,Gg,Pp)}function wr(e,t,s,n,a){if(!et(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Kg(ng(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function yn(e){return tn(e)?yn(e.__v_raw):!!(e&&e.__v_isReactive)}function tn(e){return!!(e&&e.__v_isReadonly)}function ms(e){return!!(e&&e.__v_isShallow)}function el(e){return e?!!e.__v_raw:!1}function Ye(e){const t=e&&e.__v_raw;return t?Ye(t):e}function Fp(e){return!tt(e,"__v_skip")&&Object.isExtensible(e)&&mp(e,"__v_skip",!0),e}const zs=e=>et(e)?zn(e):e,qa=e=>et(e)?$l(e):e;function At(e){return e?e.__v_isRef===!0:!1}function h(e){return $p(e,!1)}function lc(e){return $p(e,!0)}function $p(e,t){return At(e)?e:new Zg(e,t)}class Zg{constructor(t,s){this.dep=new yr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ye(t),this._value=s?t:zs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ms(t)||tn(t);t=n?t:Ye(t),Mt(t,s)&&(this._rawValue=t,this._value=n?t:zs(t),this.dep.trigger())}}function Jg(e){e.dep&&e.dep.trigger()}function en(e){return At(e)?e.value:e}function Yg(e){return Pe(e)?e():en(e)}const Qg={get:(e,t,s)=>t==="__v_raw"?e:en(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return At(a)&&!At(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function rc(e){return yn(e)?e:new Proxy(e,Qg)}class Xg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new yr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Up(e){return new Xg(e)}function ev(e){const t=ke(e)?new Array(e.length):{};for(const s in e)t[s]=Bp(e,s);return t}class tv{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Jt(s)?s:String(s),this._raw=Ye(t);let a=!0,i=t;if(!ke(t)||Jt(this._key)||!hr(this._key))do a=!el(i)||ms(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=en(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&At(this._raw[this._key])){const s=this._object[this._key];if(At(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Ng(this._raw,this._key)}}class sv{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function nv(e,t,s){return At(e)?e:Pe(e)?new sv(e):et(e)&&arguments.length>1?Bp(e,t,s):h(e)}function Bp(e,t,s){return new tv(e,t,s)}class av{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new yr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Di-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ct!==this)return kp(this,!0),!0}get value(){const t=this.dep.track();return Cp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function iv(e,t,s=!1){let n,a;return Pe(e)?n=e:(n=e.get,a=e.set),new av(n,a,s)}const lv={GET:"get",HAS:"has",ITERATE:"iterate"},rv={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},hl={},Ul=new WeakMap;let Dn;function ov(){return Dn}function Hp(e,t=!1,s=Dn){if(s){let n=Ul.get(s);n||Ul.set(s,n=[]),n.push(e)}}function cv(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:ms(x)||a===!1||a===0?hn(x,1):hn(x);let d,u,p,f,g=!1,b=!1;if(At(e)?(u=()=>e.value,g=ms(e)):yn(e)?(u=()=>c(e),g=!0):ke(e)?(b=!0,g=e.some(x=>yn(x)||ms(x)),u=()=>e.map(x=>{if(At(x))return x.value;if(yn(x))return c(x);if(Pe(x))return o?o(x,2):x()})):Pe(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){kn();try{p()}finally{Sn()}}const x=Dn;Dn=d;try{return o?o(e,3,[f]):e(f)}finally{Dn=x}}:u=zt,t&&a){const x=u,S=a===!0?1/0:a;u=()=>hn(x(),S)}const E=_p(),O=()=>{d.stop(),E&&E.active&&Xo(E.effects,d)};if(i&&t){const x=t;t=(...S)=>{const v=x(...S);return O(),v}}let y=b?new Array(e.length).fill(hl):hl;const m=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const S=d.run();if(x||a||g||(b?S.some((v,k)=>Mt(v,y[k])):Mt(S,y))){p&&p();const v=Dn;Dn=d;try{const k=[S,y===hl?void 0:b&&y[0]===hl?[]:y,f];y=S,o?o(t,3,k):t(...k)}finally{Dn=v}}}else d.run()};return r&&r(m),d=new Mi(u),d.scheduler=l?()=>l(m,!1):m,f=x=>Hp(x,!1,d),p=d.onStop=()=>{const x=Ul.get(d);if(x){if(o)o(x,4);else for(const S of x)S();Ul.delete(d)}},t?n?m(!0):y=d.run():l?l(m.bind(null,!0),!0):d.run(),O.pause=d.pause.bind(d),O.resume=d.resume.bind(d),O.stop=O,O}function hn(e,t=1/0,s){if(t<=0||!et(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,At(e))hn(e.value,t,s);else if(ke(e))for(let n=0;n<e.length;n++)hn(e[n],t,s);else if(ma(e)||Pa(e))e.forEach(n=>{hn(n,t,s)});else if(fr(e)){for(const n in e)hn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&hn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const zp=[];function dv(e){zp.push(e)}function uv(){zp.pop()}function pv(e,t){}const fv={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},hv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function ai(e,t,s,n){try{return n?e(...n):e()}catch(a){va(a,t,s)}}function xs(e,t,s,n){if(Pe(e)){const a=ai(e,t,s,n);return a&&ec(a)&&a.catch(i=>{va(i,t,s)}),a}if(ke(e)){const a=[];for(let i=0;i<e.length;i++)a.push(xs(e[i],t,s,n));return a}}function va(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){kn(),ai(i,null,10,[e,o,c]),Sn();return}}mv(e,s,a,n,l)}function mv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ss=[];let Ys=-1;const Ua=[];let Pn=null,Ra=0;const jp=Promise.resolve();let Bl=null;function Ct(e){const t=Bl||jp;return e?t.then(this?e.bind(this):e):t}function gv(e){let t=Ys+1,s=ss.length;for(;t<s;){const n=t+s>>>1,a=ss[n],i=$i(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function oc(e){if(!(e.flags&1)){const t=$i(e),s=ss[ss.length-1];!s||!(e.flags&2)&&t>=$i(s)?ss.push(e):ss.splice(gv(t),0,e),e.flags|=1,Vp()}}function Vp(){Bl||(Bl=jp.then(qp))}function Fi(e){ke(e)?Ua.push(...e):Pn&&e.id===-1?Pn.splice(Ra+1,0,e):e.flags&1||(Ua.push(e),e.flags|=1),Vp()}function hd(e,t,s=Ys+1){for(;s<ss.length;s++){const n=ss[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ss.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Hl(e){if(Ua.length){const t=[...new Set(Ua)].sort((s,n)=>$i(s)-$i(n));if(Ua.length=0,Pn){Pn.push(...t);return}for(Pn=t,Ra=0;Ra<Pn.length;Ra++){const s=Pn[Ra];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Pn=null,Ra=0}}const $i=e=>e.id==null?e.flags&2?-1:1/0:e.id;function qp(e){try{for(Ys=0;Ys<ss.length;Ys++){const t=ss[Ys];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),ai(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ys<ss.length;Ys++){const t=ss[Ys];t&&(t.flags&=-2)}Ys=-1,ss.length=0,Hl(),Bl=null,(ss.length||Ua.length)&&qp()}}let Ia,ml=[];function Gp(e,t){var s,n;Ia=e,Ia?(Ia.enabled=!0,ml.forEach(({event:a,args:i})=>Ia.emit(a,...i)),ml=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Gp(i,t)}),setTimeout(()=>{Ia||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ml=[])},3e3)):ml=[]}let Ht=null,kr=null;function Ui(e){const t=Ht;return Ht=e,kr=e&&e.type.__scopeId||null,t}function vv(e){kr=e}function bv(){kr=null}const yv=e=>cc;function cc(e,t=Ht,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&ji(-1);const i=Ui(t);let l;try{l=e(...a)}finally{Ui(i),n._d&&ji(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function xv(e,t){if(Ht===null)return e;const s=al(Ht),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ke]=t[a];i&&(Pe(i)&&(i={mounted:i,updated:i}),i.deep&&hn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Qs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(kn(),xs(o,s,8,[e.el,r,e,t]),Sn())}}function Ti(e,t){if(Bt){let s=Bt.provides;const n=Bt.parent&&Bt.parent.provides;n===s&&(s=Bt.provides=Object.create(n)),s[e]=t}}function Ns(e,t,s=!1){const n=is();if(n||la){let a=la?la._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Pe(t)?t.call(n&&n.proxy):t}}function _v(){return!!(is()||la)}const Kp=Symbol.for("v-scx"),Wp=()=>Ns(Kp);function wv(e,t){return tl(e,null,t)}function kv(e,t){return tl(e,null,{flush:"post"})}function Zp(e,t){return tl(e,null,{flush:"sync"})}function as(e,t,s){return tl(e,t,s)}function tl(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,r=Ve({},s),o=t&&n||!t&&i!=="post";let c;if(ua){if(i==="sync"){const f=Wp();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!o){const f=()=>{};return f.stop=zt,f.resume=zt,f.pause=zt,f}}const d=Bt;r.call=(f,g,b)=>xs(f,d,g,b);let u=!1;i==="post"?r.scheduler=f=>{Tt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(f,g)=>{g?f():oc(f)}),r.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=cv(e,t,r);return ua&&(c?c.push(p):o&&p()),p}function Sv(e,t,s){const n=this.proxy,a=Fe(e)?e.includes(".")?Jp(n,e):()=>n[e]:e.bind(n,n);let i;Pe(t)?i=t:(i=t.handler,s=t);const l=ii(this),r=tl(a,i.bind(n),s);return l(),r}function Jp(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Ln=new WeakMap,Yp=Symbol("_vte"),Qp=e=>e.__isTeleport,ta=e=>e&&(e.disabled||e.disabled===""),Tv=e=>e&&(e.defer||e.defer===""),md=e=>typeof SVGElement<"u"&&e instanceof SVGElement,gd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,_o=(e,t)=>{const s=e&&e.to;return Fe(s)?t?t(s):null:s},Cv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:g,createText:b,createComment:E,parentNode:O}}=c,y=ta(t.props);let{dynamicChildren:m}=t;const x=(k,T,C)=>{k.shapeFlag&16&&d(k.children,T,C,a,i,l,r,o)},S=(k=t)=>{const T=ta(k.props),C=k.target=_o(k.props,g),D=wo(C,k,b,f);C&&(l!=="svg"&&md(C)?l="svg":l!=="mathml"&&gd(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),T||(x(k,C,D),bi(k,!1)))},v=k=>{const T=()=>{if(Ln.get(k)===T){if(Ln.delete(k),ta(k.props)){const C=O(k.el)||s;x(k,C,k.anchor),bi(k,!0)}S(k)}};Ln.set(k,T),Tt(T,i)};if(e==null){const k=t.el=b(""),T=t.anchor=b("");if(f(k,s,n),f(T,s,n),Tv(t.props)||i&&i.pendingBranch){v(t);return}y&&(x(t,s,T),bi(t,!0)),S()}else{t.el=e.el;const k=t.anchor=e.anchor,T=Ln.get(e);if(T){T.flags|=8,Ln.delete(e),v(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,D=t.targetAnchor=e.targetAnchor,H=ta(e.props),P=H?s:C,R=H?k:D;if(l==="svg"||md(C)?l="svg":(l==="mathml"||gd(C))&&(l="mathml"),m?(p(e.dynamicChildren,m,P,a,i,l,r),xc(e,t,!0)):o||u(e,t,P,R,a,i,l,r,!1),y)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):gl(t,s,k,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=_o(t.props,g);V&&gl(t,V,null,c,0)}else H&&gl(t,C,D,c,1);bi(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!ta(p),g=Ln.get(e);if(g&&(g.flags|=8,Ln.delete(e)),u&&(a(c),a(d)),i&&a(o),!g&&l&16)for(let b=0;b<r.length;b++){const E=r[b];n(E,t,s,f,!!E.dynamicChildren)}},move:gl,hydrate:Ev};function gl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Ln.has(e)&&(!u||ta(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function Ev(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(E,O){let y=O;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function f(E,O){O.anchor=u(l(E),O,r(E),s,n,a,i)}const g=t.target=_o(t.props,o),b=ta(t.props);if(g){const E=g._lpa||g.firstChild;t.shapeFlag&16&&(b?(f(e,t),p(g,E),t.targetAnchor||wo(g,t,d,c,r(e)===g?e:null)):(t.anchor=l(e),p(g,E),t.targetAnchor||wo(g,t,d,c),u(E&&l(E),t,g,s,n,a,i))),bi(t,b)}else b&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Av=Cv;function bi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function wo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Yp]=l,e&&(n(i,e,a),n(l,e,a)),l}const As=Symbol("_leaveCb"),di=Symbol("_enterCb");function dc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ze(()=>{e.isMounted=!0}),Er(()=>{e.isUnmounting=!0}),e}const Es=[Function,Array],uc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Es,onEnter:Es,onAfterEnter:Es,onEnterCancelled:Es,onBeforeLeave:Es,onLeave:Es,onAfterLeave:Es,onLeaveCancelled:Es,onBeforeAppear:Es,onAppear:Es,onAfterAppear:Es,onAppearCancelled:Es},Xp=e=>{const t=e.subTree;return t.component?Xp(t.component):t},Rv={name:"BaseTransition",props:uc,setup(e,{slots:t}){const s=is(),n=dc();return()=>{const a=t.default&&Sr(t.default(),!0),i=a&&a.length?ef(a):s.subTree?Ff():void 0;if(!i)return;const l=Ye(e),{mode:r}=l;if(n.isLeaving)return Gr(i);const o=vd(i);if(!o)return Gr(i);let c=Ga(o,l,n,s,u=>c=u);o.type!==St&&Tn(o,c);let d=s.subTree&&vd(s.subTree);if(d&&d.type!==St&&!Us(d,o)&&Xp(s).type!==St){let u=Ga(d,l,n,s);if(Tn(d,u),r==="out-in"&&o.type!==St)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Gr(i);r==="in-out"&&o.type!==St?u.delayLeave=(p,f,g)=>{const b=sf(n,d);b[String(d.key)]=d,p[As]=()=>{f(),p[As]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{g(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function ef(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==St){t=s;break}}return t}const tf=Rv;function sf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Ga(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:g,onLeaveCancelled:b,onBeforeAppear:E,onAppear:O,onAfterAppear:y,onAppearCancelled:m}=t,x=String(e.key),S=sf(s,e),v=(C,D)=>{C&&xs(C,n,9,D)},k=(C,D)=>{const H=D[1];v(C,D),ke(C)?C.every(P=>P.length<=1)&&H():C.length<=1&&H()},T={mode:l,persisted:r,beforeEnter(C){let D=o;if(!s.isMounted)if(i)D=E||o;else return;C[As]&&C[As](!0);const H=S[x];H&&Us(e,H)&&H.el[As]&&H.el[As](),v(D,[C])},enter(C){if(S[x]===e)return;let D=c,H=d,P=u;if(!s.isMounted)if(i)D=O||c,H=y||d,P=m||u;else return;let R=!1;C[di]=X=>{R||(R=!0,X?v(P,[C]):v(H,[C]),T.delayedLeave&&T.delayedLeave(),C[di]=void 0)};const V=C[di].bind(null,!1);D?k(D,[C,V]):V()},leave(C,D){const H=String(e.key);if(C[di]&&C[di](!0),s.isUnmounting)return D();v(p,[C]);let P=!1;C[As]=V=>{P||(P=!0,D(),V?v(b,[C]):v(g,[C]),C[As]=void 0,S[H]===e&&delete S[H])};const R=C[As].bind(null,!1);S[H]=e,f?k(f,[C,R]):R()},clone(C){const D=Ga(C,t,s,n,a);return a&&a(D),D}};return T}function Gr(e){if(nl(e))return e=sn(e),e.children=null,e}function vd(e){if(!nl(e))return Qp(e.type)&&e.children?ef(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Pe(s.default))return s.default()}}function Tn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Tn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Sr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Dt?(l.patchFlag&128&&a++,n=n.concat(Sr(l.children,t,r))):(t||l.type!==St)&&n.push(r!=null?sn(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function sl(e,t){return Pe(e)?Ve({name:e.name},t,{setup:e}):e}function Iv(){const e=is();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function pc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Ov(e){const t=is(),s=lc(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function bd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const zl=new WeakMap;function Ba(e,t,s,n,a=!1){if(ke(e)){e.forEach((b,E)=>Ba(b,t&&(ke(t)?t[E]:t),s,n,a));return}if(xn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ba(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?al(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ke?r.refs={}:r.refs,u=r.setupState,p=Ye(u),f=u===Ke?La:b=>bd(d,b)?!1:tt(p,b),g=(b,E)=>!(E&&bd(d,E));if(c!=null&&c!==o){if(yd(t),Fe(c))d[c]=null,f(c)&&(u[c]=null);else if(At(c)){const b=t;g(c,b.k)&&(c.value=null),b.k&&(d[b.k]=null)}}if(Pe(o))ai(o,r,12,[l,d]);else{const b=Fe(o),E=At(o);if(b||E){const O=()=>{if(e.f){const y=b?f(o)?u[o]:d[o]:g()||!e.k?o.value:d[e.k];if(a)ke(y)&&Xo(y,i);else if(ke(y))y.includes(i)||y.push(i);else if(b)d[o]=[i],f(o)&&(u[o]=d[o]);else{const m=[i];g(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else b?(d[o]=l,f(o)&&(u[o]=l)):E&&(g(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{O(),zl.delete(e)};y.id=-1,zl.set(e,y),Tt(y,s)}else yd(e),O()}}}function yd(e){const t=zl.get(e);t&&(t.flags|=8,zl.delete(e))}let xd=!1;const Sa=()=>{xd||(console.error("Hydration completed but contains mismatches."),xd=!0)},Nv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Lv=e=>e.namespaceURI.includes("MathML"),vl=e=>{if(e.nodeType===1){if(Nv(e))return"svg";if(Lv(e))return"mathml"}},Ma=e=>e.nodeType===8;function Mv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,x)=>{if(!x.hasChildNodes()){s(null,m,x),Hl(),x._vnode=m;return}u(x.firstChild,m,null,null,null),Hl(),x._vnode=m},u=(m,x,S,v,k,T=!1)=>{T=T||!!x.dynamicChildren;const C=Ma(m)&&m.data==="[",D=()=>b(m,x,S,v,k,C),{type:H,ref:P,shapeFlag:R,patchFlag:V}=x;let X=m.nodeType;x.el=m,V===-2&&(T=!1,x.dynamicChildren=null);let U=null;switch(H){case Un:X!==3?x.children===""?(o(x.el=a(""),l(m),m),U=m):U=D():(m.data!==x.children&&(Sa(),m.data=x.children),U=i(m));break;case St:y(m)?(U=i(m),O(x.el=m.content.firstChild,m,S)):X!==8||C?U=D():U=i(m);break;case ra:if(C&&(m=i(m),X=m.nodeType),X===1||X===3){U=m;const N=!x.children.length;for(let I=0;I<x.staticCount;I++)N&&(x.children+=U.nodeType===1?U.outerHTML:U.data),I===x.staticCount-1&&(x.anchor=U),U=i(U);return C?i(U):U}else D();break;case Dt:C?U=g(m,x,S,v,k,T):U=D();break;default:if(R&1)(X!==1||x.type.toLowerCase()!==m.tagName.toLowerCase())&&!y(m)?U=D():U=p(m,x,S,v,k,T);else if(R&6){x.slotScopeIds=k;const N=l(m);if(C?U=E(m):Ma(m)&&m.data==="teleport start"?U=E(m,m.data,"teleport end"):U=i(m),t(x,N,null,S,v,vl(N),T),xn(x)&&!x.type.__asyncResolved){let I;C?(I=ht(Dt),I.anchor=U?U.previousSibling:N.lastChild):I=m.nodeType===3?wc(""):ht("div"),I.el=m,x.component.subTree=I}}else R&64?X!==8?U=D():U=x.type.hydrate(m,x,S,v,k,T,e,f):R&128&&(U=x.type.hydrate(m,x,S,v,vl(l(m)),k,T,e,u))}return P!=null&&Ba(P,null,v,x),U},p=(m,x,S,v,k,T)=>{T=T||!!x.dynamicChildren;const{type:C,props:D,patchFlag:H,shapeFlag:P,dirs:R,transition:V}=x,X=C==="input"||C==="option";if(X||H!==-1){R&&Qs(x,null,S,"created");let U=!1;if(y(m)){U=Af(null,V)&&S&&S.vnode.props&&S.vnode.props.appear;const I=m.content.firstChild;if(U){const W=I.getAttribute("class");W&&(I.$cls=W),V.beforeEnter(I)}O(I,m,S),x.el=m=I}if(P&16&&!(D&&(D.innerHTML||D.textContent))){let I=f(m.firstChild,x,m,S,v,k,T);for(I&&!bl(m,1)&&Sa();I;){const W=I;I=I.nextSibling,r(W)}}else if(P&8){let I=x.children;I[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(I=I.slice(1));const{textContent:W}=m;W!==I&&W!==I.replace(/\r\n|\r/g,`
`)&&(bl(m,0)||Sa(),m.textContent=x.children)}if(D){if(X||!T||H&48){const I=m.tagName.includes("-");for(const W in D)(X&&(W.endsWith("value")||W==="indeterminate")||ha(W)&&!bn(W)||W[0]==="."||I&&!bn(W))&&n(m,W,null,D[W],void 0,S)}else if(D.onClick)n(m,"onClick",null,D.onClick,void 0,S);else if(H&4&&yn(D.style))for(const I in D.style)D.style[I]}let N;(N=D&&D.onVnodeBeforeMount)&&ds(N,S,x),R&&Qs(x,null,S,"beforeMount"),((N=D&&D.onVnodeMounted)||R||U)&&Nf(()=>{N&&ds(N,S,x),U&&V.enter(m),R&&Qs(x,null,S,"mounted")},v)}return m.nextSibling},f=(m,x,S,v,k,T,C)=>{C=C||!!x.dynamicChildren;const D=x.children,H=D.length;let P=!1;for(let R=0;R<H;R++){const V=C?D[R]:D[R]=ps(D[R]),X=V.type===Un;m?(X&&!C&&R+1<H&&ps(D[R+1]).type===Un&&(o(a(m.data.slice(V.children.length)),S,i(m)),m.data=V.children),m=u(m,V,v,k,T,C)):X&&!V.children?o(V.el=a(""),S):(P||(P=!0,bl(S,1)||Sa()),s(null,V,S,null,v,k,vl(S),T))}return m},g=(m,x,S,v,k,T)=>{const{slotScopeIds:C}=x;C&&(k=k?k.concat(C):C);const D=l(m),H=f(i(m),x,D,S,v,k,T);return H&&Ma(H)&&H.data==="]"?i(x.anchor=H):(Sa(),o(x.anchor=c("]"),D,H),H)},b=(m,x,S,v,k,T)=>{if(bl(m.parentElement,1)||Sa(),x.el=null,T){const H=E(m);for(;;){const P=i(m);if(P&&P!==H)r(P);else break}}const C=i(m),D=l(m);return r(m),s(null,x,D,C,S,v,vl(D),k),S&&(S.vnode.el=x.el,Rr(S,x.el)),C},E=(m,x="[",S="]")=>{let v=0;for(;m;)if(m=i(m),m&&Ma(m)&&(m.data===x&&v++,m.data===S)){if(v===0)return i(m);v--}return m},O=(m,x,S)=>{const v=x.parentNode;v&&v.replaceChild(m,x);let k=S;for(;k;)k.vnode.el===x&&(k.vnode.el=k.subTree.el=m),k=k.parent},y=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const _d="data-allow-mismatch",Dv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function bl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(_d);)e=e.parentElement;const s=e&&e.getAttribute(_d);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Dv[t])}}const Pv=vr().requestIdleCallback||(e=>setTimeout(e,1)),Fv=vr().cancelIdleCallback||(e=>clearTimeout(e)),$v=(e=1e4)=>t=>{const s=Pv(t,{timeout:e});return()=>Fv(s)};function Uv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Bv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Uv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Hv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},zv=(e=[])=>(t,s)=>{Fe(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function jv(e,t){if(Ma(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ma(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const xn=e=>!!e.type.__asyncLoader;function Vv(e){Pe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let g;return c||(g=c=t().catch(b=>{if(b=b instanceof Error?b:new Error(String(b)),o)return new Promise((E,O)=>{o(b,()=>E(p()),()=>O(b),u+1)});throw b}).then(b=>g!==c&&c?c:(b&&(b.__esModule||b[Symbol.toStringTag]==="Module")&&(b=b.default),d=b,b)))};return sl({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(g,b,E){let O=!1;(b.bu||(b.bu=[])).push(()=>O=!0);const y=()=>{O||E()},m=i?()=>{const x=i(y,S=>jv(g,S));x&&(b.bum||(b.bum=[])).push(x)}:y;d?m():f().then(()=>!b.isUnmounted&&m())},get __asyncResolved(){return d},setup(){const g=Bt;if(pc(g),d)return()=>yl(d,g);const b=S=>{c=null,va(S,g,13,!n)};if(r&&g.suspense||ua)return f().then(S=>()=>yl(S,g)).catch(S=>(b(S),()=>n?ht(n,{error:S}):null));const E=h(!1),O=h(),y=h(!!a);let m,x;return xt(()=>{m!=null&&clearTimeout(m),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{g.isUnmounted||(y.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!g.isUnmounted&&!E.value&&!O.value){const S=new Error(`Async component timed out after ${l}ms.`);b(S),O.value=S}},l)),f().then(()=>{g.isUnmounted||(E.value=!0,g.parent&&nl(g.parent.vnode)&&g.parent.update())}).catch(S=>{if(g.isUnmounted){c=null;return}b(S),O.value=S}),()=>{if(E.value&&d)return yl(d,g);if(O.value&&n)return ht(n,{error:O.value});if(s&&!y.value)return yl(s,g)}}})}function yl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ht(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const nl=e=>e.type.__isKeepAlive,qv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=is(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,m,x,S,v)=>{const k=y.component;c(y,m,x,0,r),o(k.vnode,y,m,x,k,r,S,y.slotScopeIds,v),Tt(()=>{k.isDeactivated=!1,k.a&&$a(k.a);const T=y.props&&y.props.onVnodeMounted;T&&ds(T,k.parent,y)},r)},n.deactivate=y=>{const m=y.component;Vl(m.m),Vl(m.a),c(y,p,null,1,r),Tt(()=>{m.da&&$a(m.da);const x=y.props&&y.props.onVnodeUnmounted;x&&ds(x,m.parent,y),m.isDeactivated=!0},r)};function f(y){Kr(y),d(y,s,r,!0)}function g(y){a.forEach((m,x)=>{const S=Oo(xn(m)?m.type.__asyncResolved||{}:m.type);S&&!y(S)&&b(x)})}function b(y){const m=a.get(y);m&&(!l||!Us(m,l))?f(m):l&&Kr(l),a.delete(y),i.delete(y)}as(()=>[e.include,e.exclude],([y,m])=>{y&&g(x=>yi(y,x)),m&&g(x=>!yi(m,x))},{flush:"post",deep:!0});let E=null;const O=()=>{E!=null&&(ql(s.subTree.type)?Tt(()=>{a.set(E,xl(s.subTree))},s.subTree.suspense):a.set(E,xl(s.subTree)))};return Ze(O),Cr(O),Er(()=>{a.forEach(y=>{const{subTree:m,suspense:x}=s,S=xl(m);if(y.type===S.type&&y.key===S.key){Kr(S);const v=S.component.da;v&&Tt(v,x);return}f(y)})}),()=>{if(E=null,!t.default)return l=null;const y=t.default(),m=y[0];if(y.length>1)return l=null,y;if(!Cn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let x=xl(m);if(x.type===St)return l=null,x;const S=x.type,v=Oo(xn(x)?x.type.__asyncResolved||{}:S),{include:k,exclude:T,max:C}=e;if(k&&(!v||!yi(k,v))||T&&v&&yi(T,v))return x.shapeFlag&=-257,l=x,m;const D=x.key==null?S:x.key,H=a.get(D);return x.el&&(x=sn(x),m.shapeFlag&128&&(m.ssContent=x)),E=D,H?(x.el=H.el,x.component=H.component,x.transition&&Tn(x,x.transition),x.shapeFlag|=512,i.delete(D),i.add(D)):(i.add(D),C&&i.size>parseInt(C,10)&&b(i.values().next().value)),x.shapeFlag|=256,l=x,ql(m.type)?m:x}}},Gv=qv;function yi(e,t){return ke(e)?e.some(s=>yi(s,t)):Fe(e)?e.split(",").includes(t):sg(e)?(e.lastIndex=0,e.test(t)):!1}function ws(e,t){nf(e,"a",t)}function ks(e,t){nf(e,"da",t)}function nf(e,t,s=Bt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Tr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)nl(a.parent.vnode)&&Kv(n,t,s,a),a=a.parent}}function Kv(e,t,s,n){const a=Tr(t,e,n,!0);xt(()=>{Xo(n[t],a)},s)}function Kr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function xl(e){return e.shapeFlag&128?e.ssContent:e}function Tr(e,t,s=Bt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{kn();const r=ii(s),o=xs(t,s,e,l);return r(),Sn(),o});return n?a.unshift(i):a.push(i),i}}const En=e=>(t,s=Bt)=>{(!ua||e==="sp")&&Tr(e,(...n)=>t(...n),s)},af=En("bm"),Ze=En("m"),fc=En("bu"),Cr=En("u"),Er=En("bum"),xt=En("um"),lf=En("sp"),rf=En("rtg"),of=En("rtc");function cf(e,t=Bt){Tr("ec",e,t)}const hc="components",Wv="directives";function Zv(e,t){return mc(hc,e,!0,t)||e}const df=Symbol.for("v-ndc");function Jv(e){return Fe(e)?mc(hc,e,!1)||e:e||df}function Yv(e){return mc(Wv,e)}function mc(e,t,s=!0,n=!1){const a=Ht||Bt;if(a){const i=a.type;if(e===hc){const r=Oo(i,!1);if(r&&(r===t||r===lt(t)||r===ga(lt(t))))return i}const l=wd(a[e]||i[e],t)||wd(a.appContext[e],t);return!l&&n?i:l}}function wd(e,t){return e&&(e[t]||e[lt(t)]||e[ga(lt(t))])}function Qv(e,t,s,n){let a;const i=s&&s[n],l=ke(e);if(l||Fe(e)){const r=l&&yn(e);let o=!1,c=!1;r&&(o=!ms(e),c=tn(e),e=xr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?qa(zs(e[d])):zs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(et(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Xv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(ke(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function eb(e,t,s={},n,a){if(Ht.ce||Ht.parent&&xn(Ht.parent)&&Ht.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),zi(),Gl(Dt,null,[ht("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),zi();const l=i&&gc(i(s)),r=s.key||l&&l.key,o=Gl(Dt,{key:(r&&!Jt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function gc(e){return e.some(t=>Cn(t)?!(t.type===St||t.type===Dt&&!gc(t.children)):!0)?e:null}function tb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Fa(n)]=e[n];return s}const ko=e=>e?Bf(e)?al(e):ko(e.parent):null,Ci=Ve(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>ko(e.parent),$root:e=>ko(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>vc(e),$forceUpdate:e=>e.f||(e.f=()=>{oc(e.update)}),$nextTick:e=>e.n||(e.n=Ct.bind(e.proxy)),$watch:e=>Sv.bind(e)}),Wr=(e,t)=>e!==Ke&&!e.__isScriptSetup&&tt(e,t),So={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Wr(n,t))return l[t]=1,n[t];if(a!==Ke&&tt(a,t))return l[t]=2,a[t];if(tt(i,t))return l[t]=3,i[t];if(s!==Ke&&tt(s,t))return l[t]=4,s[t];To&&(l[t]=0)}}const c=Ci[t];let d,u;if(c)return t==="$attrs"&&Gt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&tt(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,tt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Wr(a,t)?(a[t]=s,!0):n!==Ke&&tt(n,t)?(n[t]=s,!0):tt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ke&&r[0]!=="$"&&tt(e,r)||Wr(t,r)||tt(i,r)||tt(n,r)||tt(Ci,r)||tt(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:tt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},sb=Ve({},So,{get(e,t){if(t!==Symbol.unscopables)return So.get(e,t,e)},has(e,t){return t[0]!=="_"&&!cg(t)}});function nb(){return null}function ab(){return null}function ib(e){}function lb(e){}function rb(){return null}function ob(){}function cb(e,t){return null}function db(){return uf().slots}function ub(){return uf().attrs}function uf(e){const t=is();return t.setupContext||(t.setupContext=Vf(t))}function Bi(e){return ke(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function pb(e,t){const s=Bi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?ke(a)||Pe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function fb(e,t){return!e||!t?e||t:ke(e)&&ke(t)?e.concat(t):Ve({},Bi(e),Bi(t))}function hb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function mb(e){const t=is(),s=ua;let n=e();Vi(),s&&za(!1);const a=()=>{ii(t),s&&za(!0)},i=()=>{is()!==t&&t.scope.off(),Vi(),s&&za(!1)};return ec(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let To=!0;function gb(e){const t=vc(e),s=e.proxy,n=e.ctx;To=!1,t.beforeCreate&&kd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:g,activated:b,deactivated:E,beforeDestroy:O,beforeUnmount:y,destroyed:m,unmounted:x,render:S,renderTracked:v,renderTriggered:k,errorCaptured:T,serverPrefetch:C,expose:D,inheritAttrs:H,components:P,directives:R,filters:V}=t;if(c&&vb(c,n,null),l)for(const N in l){const I=l[N];Pe(I)&&(n[N]=I.bind(s))}if(a){const N=a.call(s,s);et(N)&&(e.data=zn(N))}if(To=!0,i)for(const N in i){const I=i[N],W=Pe(I)?I.bind(s,s):Pe(I.get)?I.get.bind(s,s):zt,Te=!Pe(I)&&Pe(I.set)?I.set.bind(s):zt,Ce=K({get:W,set:Te});Object.defineProperty(n,N,{enumerable:!0,configurable:!0,get:()=>Ce.value,set:re=>Ce.value=re})}if(r)for(const N in r)pf(r[N],n,s,N);if(o){const N=Pe(o)?o.call(s):o;Reflect.ownKeys(N).forEach(I=>{Ti(I,N[I])})}d&&kd(d,e,"c");function U(N,I){ke(I)?I.forEach(W=>N(W.bind(s))):I&&N(I.bind(s))}if(U(af,u),U(Ze,p),U(fc,f),U(Cr,g),U(ws,b),U(ks,E),U(cf,T),U(of,v),U(rf,k),U(Er,y),U(xt,x),U(lf,C),ke(D))if(D.length){const N=e.exposed||(e.exposed={});D.forEach(I=>{Object.defineProperty(N,I,{get:()=>s[I],set:W=>s[I]=W,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===zt&&(e.render=S),H!=null&&(e.inheritAttrs=H),P&&(e.components=P),R&&(e.directives=R),C&&pc(e)}function vb(e,t,s=zt){ke(e)&&(e=Co(e));for(const n in e){const a=e[n];let i;et(a)?"default"in a?i=Ns(a.from||n,a.default,!0):i=Ns(a.from||n):i=Ns(a),At(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function kd(e,t,s){xs(ke(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function pf(e,t,s,n){let a=n.includes(".")?Jp(s,n):()=>s[n];if(Fe(e)){const i=t[e];Pe(i)&&as(a,i)}else if(Pe(e))as(a,e.bind(s));else if(et(e))if(ke(e))e.forEach(i=>pf(i,t,s,n));else{const i=Pe(e.handler)?e.handler.bind(s):t[e.handler];Pe(i)&&as(a,i,e)}}function vc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>jl(o,c,l,!0)),jl(o,t,l)),et(t)&&i.set(t,o),o}function jl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&jl(e,i,s,!0),a&&a.forEach(l=>jl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=bb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const bb={data:Sd,props:Td,emits:Td,methods:xi,computed:xi,beforeCreate:Xt,created:Xt,beforeMount:Xt,mounted:Xt,beforeUpdate:Xt,updated:Xt,beforeDestroy:Xt,beforeUnmount:Xt,destroyed:Xt,unmounted:Xt,activated:Xt,deactivated:Xt,errorCaptured:Xt,serverPrefetch:Xt,components:xi,directives:xi,watch:xb,provide:Sd,inject:yb};function Sd(e,t){return t?e?function(){return Ve(Pe(e)?e.call(this,this):e,Pe(t)?t.call(this,this):t)}:t:e}function yb(e,t){return xi(Co(e),Co(t))}function Co(e){if(ke(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Xt(e,t){return e?[...new Set([].concat(e,t))]:t}function xi(e,t){return e?Ve(Object.create(null),e,t):t}function Td(e,t){return e?ke(e)&&ke(t)?[...new Set([...e,...t])]:Ve(Object.create(null),Bi(e),Bi(t??{})):t}function xb(e,t){if(!e)return t;if(!t)return e;const s=Ve(Object.create(null),e);for(const n in t)s[n]=Xt(e[n],t[n]);return s}function ff(){return{app:null,config:{isNativeTag:La,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let _b=0;function wb(e,t){return function(n,a=null){Pe(n)||(n=Ve({},n)),a!=null&&!et(a)&&(a=null);const i=ff(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:_b++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Gf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Pe(d.install)?(l.add(d),d.install(c,...u)):Pe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const f=c._ceVNode||ht(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),o=!0,c._container=d,d.__vue_app__=c,al(f.component)}},onUnmount(d){r.push(d)},unmount(){o&&(xs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=la;la=c;try{return d()}finally{la=u}}};return c}}let la=null;function kb(e,t,s=Ke){const n=is(),a=lt(t),i=fs(t),l=hf(e,a),r=Up((o,c)=>{let d,u=Ke,p;return Zp(()=>{const f=e[a];Mt(d,f)&&(d=f,c())}),{get(){return o(),s.get?s.get(d):d},set(f){const g=s.set?s.set(f):f;if(!Mt(g,d)&&!(u!==Ke&&Mt(f,u)))return;const b=n.vnode.props,E=!!(b&&(t in b||a in b||i in b)&&(`onUpdate:${t}`in b||`onUpdate:${a}`in b||`onUpdate:${i}`in b));E||(d=f,c()),n.emit(`update:${t}`,g),Mt(f,u)&&(Mt(f,g)&&!Mt(g,p)||E&&u!==Ke&&!Mt(g,d))&&c(),u=f,p=g}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ke:r,done:!1}:{done:!0}}}},r}const hf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${lt(t)}Modifiers`]||e[`${fs(t)}Modifiers`];function Sb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&hf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Fe(d)?d.trim():d)),l.number&&(a=s.map(gr)));let r,o=n[r=Fa(t)]||n[r=Fa(lt(t))];!o&&i&&(o=n[r=Fa(fs(t))]),o&&xs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,xs(c,e,6,a)}}const Tb=new WeakMap;function mf(e,t,s=!1){const n=s?Tb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Pe(e)){const o=c=>{const d=mf(c,t,!0);d&&(r=!0,Ve(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(et(e)&&n.set(e,null),null):(ke(i)?i.forEach(o=>l[o]=null):Ve(l,i),et(e)&&n.set(e,l),l)}function Ar(e,t){return!e||!ha(t)?!1:(t=t.slice(2).replace(/Once$/,""),tt(e,t[0].toLowerCase()+t.slice(1))||tt(e,fs(t))||tt(e,t))}function Rl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:g,inheritAttrs:b}=e,E=Ui(e);let O,y;try{if(s.shapeFlag&4){const x=a||n,S=x;O=ps(c.call(S,x,d,u,f,p,g)),y=r}else{const x=t;O=ps(x.length>1?x(u,{attrs:r,slots:l,emit:o}):x(u,null)),y=t.props?r:Eb(r)}}catch(x){Ei.length=0,va(x,e,1),O=ht(St)}let m=O;if(y&&b!==!1){const x=Object.keys(y),{shapeFlag:S}=m;x.length&&S&7&&(i&&x.some(pr)&&(y=Ab(y,i)),m=sn(m,y,!1,!0))}return s.dirs&&(m=sn(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition&&Tn(m,s.transition),O=m,Ui(E),O}function Cb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Cn(a)){if(a.type!==St||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Eb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ha(s))&&((t||(t={}))[s]=e[s]);return t},Ab=(e,t)=>{const s={};for(const n in e)(!pr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Rb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?Cd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(gf(l,n,p)&&!Ar(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?Cd(n,l,c):!0:!!l;return!1}function Cd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(gf(t,e,i)&&!Ar(s,i))return!0}return!1}function gf(e,t,s){const n=e[s],a=t[s];return s==="style"&&et(n)&&et(a)?!wn(n,a):n!==a}function Rr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const vf={},bf=()=>Object.create(vf),yf=e=>Object.getPrototypeOf(e)===vf;function Ib(e,t,s,n=!1){const a={},i=bf();e.propsDefaults=Object.create(null),xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:ic(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Ob(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ye(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Ar(e.emitsOptions,p))continue;const f=t[p];if(o)if(tt(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const g=lt(p);a[g]=Eo(o,r,g,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{xf(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!tt(t,u)&&((d=fs(u))===u||!tt(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Eo(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!tt(t,u))&&(delete i[u],c=!0)}c&&fn(e.attrs,"set","")}function xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(bn(o))continue;const c=t[o];let d;a&&tt(a,d=lt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Ar(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ye(s),c=r||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Eo(a,o,u,c[u],e,!tt(c,u))}}return l}function Eo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=tt(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Pe(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=ii(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===fs(s))&&(n=!0))}return n}const Nb=new WeakMap;function _f(e,t,s=!1){const n=s?Nb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Pe(e)){const d=u=>{o=!0;const[p,f]=_f(u,t,!0);Ve(l,p),f&&r.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return et(e)&&n.set(e,Da),Da;if(ke(i))for(let d=0;d<i.length;d++){const u=lt(i[d]);Ed(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=lt(d);if(Ed(u)){const p=i[d],f=l[u]=ke(p)||Pe(p)?{type:p}:Ve({},p),g=f.type;let b=!1,E=!0;if(ke(g))for(let O=0;O<g.length;++O){const y=g[O],m=Pe(y)&&y.name;if(m==="Boolean"){b=!0;break}else m==="String"&&(E=!1)}else b=Pe(g)&&g.name==="Boolean";f[0]=b,f[1]=E,(b||tt(f,"default"))&&r.push(u)}}const c=[l,r];return et(e)&&n.set(e,c),c}function Ed(e){return e[0]!=="$"&&!bn(e)}const bc=e=>e==="_"||e==="_ctx"||e==="$stable",yc=e=>ke(e)?e.map(ps):[ps(e)],Lb=(e,t,s)=>{if(t._n)return t;const n=cc((...a)=>yc(t(...a)),s);return n._c=!1,n},wf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(bc(a))continue;const i=e[a];if(Pe(i))t[a]=Lb(a,i,n);else if(i!=null){const l=yc(i);t[a]=()=>l}}},kf=(e,t)=>{const s=yc(t);e.slots.default=()=>s},Sf=(e,t,s)=>{for(const n in t)(s||!bc(n))&&(e[n]=t[n])},Mb=(e,t,s)=>{const n=e.slots=bf();if(e.vnode.shapeFlag&32){const a=t._;a?(Sf(n,t,s),s&&mp(n,"_",a,!0)):wf(t,n)}else t&&kf(e,t)},Db=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Sf(a,t,s):(i=!t.$stable,wf(t,a)),l=t}else t&&(kf(e,t),l={default:1});if(i)for(const r in a)!bc(r)&&l[r]==null&&delete a[r]},Tt=Nf;function Tf(e){return Ef(e)}function Cf(e){return Ef(e,Mv)}function Ef(e,t){const s=vr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=zt,insertStaticContent:g}=e,b=(w,L,$,te=null,Y=null,ee=null,he=void 0,de=null,oe=!!L.dynamicChildren)=>{if(w===L)return;w&&!Us(w,L)&&(te=B(w),re(w,Y,ee,!0),w=null),L.patchFlag===-2&&(oe=!1,L.dynamicChildren=null);const{type:se,ref:ae,shapeFlag:me}=L;switch(se){case Un:E(w,L,$,te);break;case St:O(w,L,$,te);break;case ra:w==null&&y(L,$,te,he);break;case Dt:P(w,L,$,te,Y,ee,he,de,oe);break;default:me&1?S(w,L,$,te,Y,ee,he,de,oe):me&6?R(w,L,$,te,Y,ee,he,de,oe):(me&64||me&128)&&se.process(w,L,$,te,Y,ee,he,de,oe,_e)}ae!=null&&Y?Ba(ae,w&&w.ref,ee,L||w,!L):ae==null&&w&&w.ref!=null&&Ba(w.ref,null,ee,w,!0)},E=(w,L,$,te)=>{if(w==null)n(L.el=r(L.children),$,te);else{const Y=L.el=w.el;L.children!==w.children&&c(Y,L.children)}},O=(w,L,$,te)=>{w==null?n(L.el=o(L.children||""),$,te):L.el=w.el},y=(w,L,$,te)=>{[w.el,w.anchor]=g(w.children,L,$,te,w.el,w.anchor)},m=({el:w,anchor:L},$,te)=>{let Y;for(;w&&w!==L;)Y=p(w),n(w,$,te),w=Y;n(L,$,te)},x=({el:w,anchor:L})=>{let $;for(;w&&w!==L;)$=p(w),a(w),w=$;a(L)},S=(w,L,$,te,Y,ee,he,de,oe)=>{if(L.type==="svg"?he="svg":L.type==="math"&&(he="mathml"),w==null)v(L,$,te,Y,ee,he,de,oe);else{const se=w.el&&w.el._isVueCE?w.el:null;try{se&&se._beginPatch(),C(w,L,Y,ee,he,de,oe)}finally{se&&se._endPatch()}}},v=(w,L,$,te,Y,ee,he,de)=>{let oe,se;const{props:ae,shapeFlag:me,transition:F,dirs:ce}=w;if(oe=w.el=l(w.type,ee,ae&&ae.is,ae),me&8?d(oe,w.children):me&16&&T(w.children,oe,null,te,Y,Zr(w,ee),he,de),ce&&Qs(w,null,te,"created"),k(oe,w,w.scopeId,he,te),ae){for(const Ae in ae)Ae!=="value"&&!bn(Ae)&&i(oe,Ae,null,ae[Ae],ee,te);"value"in ae&&i(oe,"value",null,ae.value,ee),(se=ae.onVnodeBeforeMount)&&ds(se,te,w)}ce&&Qs(w,null,te,"beforeMount");const xe=Af(Y,F);xe&&F.beforeEnter(oe),n(oe,L,$),((se=ae&&ae.onVnodeMounted)||xe||ce)&&Tt(()=>{try{se&&ds(se,te,w),xe&&F.enter(oe),ce&&Qs(w,null,te,"mounted")}finally{}},Y)},k=(w,L,$,te,Y)=>{if($&&f(w,$),te)for(let ee=0;ee<te.length;ee++)f(w,te[ee]);if(Y){let ee=Y.subTree;if(L===ee||ql(ee.type)&&(ee.ssContent===L||ee.ssFallback===L)){const he=Y.vnode;k(w,he,he.scopeId,he.slotScopeIds,Y.parent)}}},T=(w,L,$,te,Y,ee,he,de,oe=0)=>{for(let se=oe;se<w.length;se++){const ae=w[se]=de?un(w[se]):ps(w[se]);b(null,ae,L,$,te,Y,ee,he,de)}},C=(w,L,$,te,Y,ee,he)=>{const de=L.el=w.el;let{patchFlag:oe,dynamicChildren:se,dirs:ae}=L;oe|=w.patchFlag&16;const me=w.props||Ke,F=L.props||Ke;let ce;if($&&Jn($,!1),(ce=F.onVnodeBeforeUpdate)&&ds(ce,$,L,w),ae&&Qs(L,w,$,"beforeUpdate"),$&&Jn($,!0),(me.innerHTML&&F.innerHTML==null||me.textContent&&F.textContent==null)&&d(de,""),se?D(w.dynamicChildren,se,de,$,te,Zr(L,Y),ee):he||I(w,L,de,null,$,te,Zr(L,Y),ee,!1),oe>0){if(oe&16)H(de,me,F,$,Y);else if(oe&2&&me.class!==F.class&&i(de,"class",null,F.class,Y),oe&4&&i(de,"style",me.style,F.style,Y),oe&8){const xe=L.dynamicProps;for(let Ae=0;Ae<xe.length;Ae++){const Oe=xe[Ae],ze=me[Oe],qe=F[Oe];(qe!==ze||Oe==="value")&&i(de,Oe,ze,qe,Y,$)}}oe&1&&w.children!==L.children&&d(de,L.children)}else!he&&se==null&&H(de,me,F,$,Y);((ce=F.onVnodeUpdated)||ae)&&Tt(()=>{ce&&ds(ce,$,L,w),ae&&Qs(L,w,$,"updated")},te)},D=(w,L,$,te,Y,ee,he)=>{for(let de=0;de<L.length;de++){const oe=w[de],se=L[de],ae=oe.el&&(oe.type===Dt||!Us(oe,se)||oe.shapeFlag&198)?u(oe.el):$;b(oe,se,ae,null,te,Y,ee,he,!0)}},H=(w,L,$,te,Y)=>{if(L!==$){if(L!==Ke)for(const ee in L)!bn(ee)&&!(ee in $)&&i(w,ee,L[ee],null,Y,te);for(const ee in $){if(bn(ee))continue;const he=$[ee],de=L[ee];he!==de&&ee!=="value"&&i(w,ee,de,he,Y,te)}"value"in $&&i(w,"value",L.value,$.value,Y)}},P=(w,L,$,te,Y,ee,he,de,oe)=>{const se=L.el=w?w.el:r(""),ae=L.anchor=w?w.anchor:r("");let{patchFlag:me,dynamicChildren:F,slotScopeIds:ce}=L;ce&&(de=de?de.concat(ce):ce),w==null?(n(se,$,te),n(ae,$,te),T(L.children||[],$,ae,Y,ee,he,de,oe)):me>0&&me&64&&F&&w.dynamicChildren&&w.dynamicChildren.length===F.length?(D(w.dynamicChildren,F,$,Y,ee,he,de),(L.key!=null||Y&&L===Y.subTree)&&xc(w,L,!0)):I(w,L,$,ae,Y,ee,he,de,oe)},R=(w,L,$,te,Y,ee,he,de,oe)=>{L.slotScopeIds=de,w==null?L.shapeFlag&512?Y.ctx.activate(L,$,te,he,oe):V(L,$,te,Y,ee,he,oe):X(w,L,oe)},V=(w,L,$,te,Y,ee,he)=>{const de=w.component=Uf(w,te,Y);if(nl(w)&&(de.ctx.renderer=_e),Hf(de,!1,he),de.asyncDep){if(Y&&Y.registerDep(de,U,he),!w.el){const oe=de.subTree=ht(St);O(null,oe,L,$),w.placeholder=oe.el}}else U(de,w,L,$,Y,ee,he)},X=(w,L,$)=>{const te=L.component=w.component;if(Rb(w,L,$))if(te.asyncDep&&!te.asyncResolved){N(te,L,$);return}else te.next=L,te.update();else L.el=w.el,te.vnode=L},U=(w,L,$,te,Y,ee,he)=>{const de=()=>{if(w.isMounted){let{next:me,bu:F,u:ce,parent:xe,vnode:Ae}=w;{const J=Rf(w);if(J){me&&(me.el=Ae.el,N(w,me,he)),J.asyncDep.then(()=>{Tt(()=>{w.isUnmounted||se()},Y)});return}}let Oe=me,ze;Jn(w,!1),me?(me.el=Ae.el,N(w,me,he)):me=Ae,F&&$a(F),(ze=me.props&&me.props.onVnodeBeforeUpdate)&&ds(ze,xe,me,Ae),Jn(w,!0);const qe=Rl(w),dt=w.subTree;w.subTree=qe,b(dt,qe,u(dt.el),B(dt),w,Y,ee),me.el=qe.el,Oe===null&&Rr(w,qe.el),ce&&Tt(ce,Y),(ze=me.props&&me.props.onVnodeUpdated)&&Tt(()=>ds(ze,xe,me,Ae),Y)}else{let me;const{el:F,props:ce}=L,{bm:xe,m:Ae,parent:Oe,root:ze,type:qe}=w,dt=xn(L);if(Jn(w,!1),xe&&$a(xe),!dt&&(me=ce&&ce.onVnodeBeforeMount)&&ds(me,Oe,L),Jn(w,!0),F&&$e){const J=()=>{w.subTree=Rl(w),$e(F,w.subTree,w,Y,null)};dt&&qe.__asyncHydrate?qe.__asyncHydrate(F,w,J):J()}else{ze.ce&&ze.ce._hasShadowRoot()&&ze.ce._injectChildStyle(qe,w.parent?w.parent.type:void 0);const J=w.subTree=Rl(w);b(null,J,$,te,w,Y,ee),L.el=J.el}if(Ae&&Tt(Ae,Y),!dt&&(me=ce&&ce.onVnodeMounted)){const J=L;Tt(()=>ds(me,Oe,J),Y)}(L.shapeFlag&256||Oe&&xn(Oe.vnode)&&Oe.vnode.shapeFlag&256)&&w.a&&Tt(w.a,Y),w.isMounted=!0,L=$=te=null}};w.scope.on();const oe=w.effect=new Mi(de);w.scope.off();const se=w.update=oe.run.bind(oe),ae=w.job=oe.runIfDirty.bind(oe);ae.i=w,ae.id=w.uid,oe.scheduler=()=>oc(ae),Jn(w,!0),se()},N=(w,L,$)=>{L.component=w;const te=w.vnode.props;w.vnode=L,w.next=null,Ob(w,L.props,te,$),Db(w,L.children,$),kn(),hd(w),Sn()},I=(w,L,$,te,Y,ee,he,de,oe=!1)=>{const se=w&&w.children,ae=w?w.shapeFlag:0,me=L.children,{patchFlag:F,shapeFlag:ce}=L;if(F>0){if(F&128){Te(se,me,$,te,Y,ee,he,de,oe);return}else if(F&256){W(se,me,$,te,Y,ee,he,de,oe);return}}ce&8?(ae&16&&Z(se,Y,ee),me!==se&&d($,me)):ae&16?ce&16?Te(se,me,$,te,Y,ee,he,de,oe):Z(se,Y,ee,!0):(ae&8&&d($,""),ce&16&&T(me,$,te,Y,ee,he,de,oe))},W=(w,L,$,te,Y,ee,he,de,oe)=>{w=w||Da,L=L||Da;const se=w.length,ae=L.length,me=Math.min(se,ae);let F;for(F=0;F<me;F++){const ce=L[F]=oe?un(L[F]):ps(L[F]);b(w[F],ce,$,null,Y,ee,he,de,oe)}se>ae?Z(w,Y,ee,!0,!1,me):T(L,$,te,Y,ee,he,de,oe,me)},Te=(w,L,$,te,Y,ee,he,de,oe)=>{let se=0;const ae=L.length;let me=w.length-1,F=ae-1;for(;se<=me&&se<=F;){const ce=w[se],xe=L[se]=oe?un(L[se]):ps(L[se]);if(Us(ce,xe))b(ce,xe,$,null,Y,ee,he,de,oe);else break;se++}for(;se<=me&&se<=F;){const ce=w[me],xe=L[F]=oe?un(L[F]):ps(L[F]);if(Us(ce,xe))b(ce,xe,$,null,Y,ee,he,de,oe);else break;me--,F--}if(se>me){if(se<=F){const ce=F+1,xe=ce<ae?L[ce].el:te;for(;se<=F;)b(null,L[se]=oe?un(L[se]):ps(L[se]),$,xe,Y,ee,he,de,oe),se++}}else if(se>F)for(;se<=me;)re(w[se],Y,ee,!0),se++;else{const ce=se,xe=se,Ae=new Map;for(se=xe;se<=F;se++){const Me=L[se]=oe?un(L[se]):ps(L[se]);Me.key!=null&&Ae.set(Me.key,se)}let Oe,ze=0;const qe=F-xe+1;let dt=!1,J=0;const Se=new Array(qe);for(se=0;se<qe;se++)Se[se]=0;for(se=ce;se<=me;se++){const Me=w[se];if(ze>=qe){re(Me,Y,ee,!0);continue}let Ge;if(Me.key!=null)Ge=Ae.get(Me.key);else for(Oe=xe;Oe<=F;Oe++)if(Se[Oe-xe]===0&&Us(Me,L[Oe])){Ge=Oe;break}Ge===void 0?re(Me,Y,ee,!0):(Se[Ge-xe]=se+1,Ge>=J?J=Ge:dt=!0,b(Me,L[Ge],$,null,Y,ee,he,de,oe),ze++)}const Ie=dt?Pb(Se):Da;for(Oe=Ie.length-1,se=qe-1;se>=0;se--){const Me=xe+se,Ge=L[Me],Ue=L[Me+1],mt=Me+1<ae?Ue.el||If(Ue):te;Se[se]===0?b(null,Ge,$,mt,Y,ee,he,de,oe):dt&&(Oe<0||se!==Ie[Oe]?Ce(Ge,$,mt,2):Oe--)}}},Ce=(w,L,$,te,Y=null)=>{const{el:ee,type:he,transition:de,children:oe,shapeFlag:se}=w;if(se&6){Ce(w.component.subTree,L,$,te);return}if(se&128){w.suspense.move(L,$,te);return}if(se&64){he.move(w,L,$,_e);return}if(he===Dt){n(ee,L,$);for(let me=0;me<oe.length;me++)Ce(oe[me],L,$,te);n(w.anchor,L,$);return}if(he===ra){m(w,L,$);return}if(te!==2&&se&1&&de)if(te===0)de.persisted&&!ee[As]?n(ee,L,$):(de.beforeEnter(ee),n(ee,L,$),Tt(()=>de.enter(ee),Y));else{const{leave:me,delayLeave:F,afterLeave:ce}=de,xe=()=>{w.ctx.isUnmounted?a(ee):n(ee,L,$)},Ae=()=>{const Oe=ee._isLeaving||!!ee[As];ee._isLeaving&&ee[As](!0),de.persisted&&!Oe?xe():me(ee,()=>{xe(),ce&&ce()})};F?F(ee,xe,Ae):Ae()}else n(ee,L,$)},re=(w,L,$,te=!1,Y=!1)=>{const{type:ee,props:he,ref:de,children:oe,dynamicChildren:se,shapeFlag:ae,patchFlag:me,dirs:F,cacheIndex:ce,memo:xe}=w;if(me===-2&&(Y=!1),de!=null&&(kn(),Ba(de,null,$,w,!0),Sn()),ce!=null&&(L.renderCache[ce]=void 0),ae&256){L.ctx.deactivate(w);return}const Ae=ae&1&&F,Oe=!xn(w);let ze;if(Oe&&(ze=he&&he.onVnodeBeforeUnmount)&&ds(ze,L,w),ae&6)be(w.component,$,te);else{if(ae&128){w.suspense.unmount($,te);return}Ae&&Qs(w,null,L,"beforeUnmount"),ae&64?w.type.remove(w,L,$,_e,te):se&&!se.hasOnce&&(ee!==Dt||me>0&&me&64)?Z(se,L,$,!1,!0):(ee===Dt&&me&384||!Y&&ae&16)&&Z(oe,L,$),te&&ve(w)}const qe=xe!=null&&ce==null;(Oe&&(ze=he&&he.onVnodeUnmounted)||Ae||qe)&&Tt(()=>{ze&&ds(ze,L,w),Ae&&Qs(w,null,L,"unmounted"),qe&&(w.el=null)},$)},ve=w=>{const{type:L,el:$,anchor:te,transition:Y}=w;if(L===Dt){ne($,te);return}if(L===ra){x(w);return}const ee=()=>{a($),Y&&!Y.persisted&&Y.afterLeave&&Y.afterLeave()};if(w.shapeFlag&1&&Y&&!Y.persisted){const{leave:he,delayLeave:de}=Y,oe=()=>he($,ee);de?de(w.el,ee,oe):oe()}else ee()},ne=(w,L)=>{let $;for(;w!==L;)$=p(w),a(w),w=$;a(L)},be=(w,L,$)=>{const{bum:te,scope:Y,job:ee,subTree:he,um:de,m:oe,a:se}=w;Vl(oe),Vl(se),te&&$a(te),Y.stop(),ee&&(ee.flags|=8,re(he,w,L,$)),de&&Tt(de,L),Tt(()=>{w.isUnmounted=!0},L)},Z=(w,L,$,te=!1,Y=!1,ee=0)=>{for(let he=ee;he<w.length;he++)re(w[he],L,$,te,Y)},B=w=>{if(w.shapeFlag&6)return B(w.component.subTree);if(w.shapeFlag&128)return w.suspense.next();const L=p(w.anchor||w.el),$=L&&L[Yp];return $?p($):L};let ie=!1;const le=(w,L,$)=>{let te;w==null?L._vnode&&(re(L._vnode,null,null,!0),te=L._vnode.component):b(L._vnode||null,w,L,null,null,null,$),L._vnode=w,ie||(ie=!0,hd(te),Hl(),ie=!1)},_e={p:b,um:re,m:Ce,r:ve,mt:V,mc:T,pc:I,pbc:D,n:B,o:e};let ye,$e;return t&&([ye,$e]=t(_e)),{render:le,hydrate:ye,createApp:wb(le,ye)}}function Zr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Jn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Af(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function xc(e,t,s=!1){const n=e.children,a=t.children;if(ke(n)&&ke(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=un(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&xc(l,r)),r.type===Un&&(r.patchFlag===-1&&(r=a[i]=un(r)),r.el=l.el),r.type===St&&!r.el&&(r.el=l.el)}}function Pb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Rf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Rf(t)}function Vl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function If(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?If(t.subTree):null}const ql=e=>e.__isSuspense;let Ao=0;const Fb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Ub(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Bb(e,t,s,n,a,l,r,o,c)}},hydrate:Hb,normalize:zb},$b=Fb;function Hi(e,t){const s=e.props&&e.props[t];Pe(s)&&s()}function Ub(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=Of(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Hi(e,"onPending"),Hi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ha(p,e.ssFallback)):p.resolve(!1,!0)}function Bb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:g,pendingBranch:b,isInFallback:E,isHydrating:O}=u;if(b)u.pendingBranch=p,Us(b,p)?(o(b,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():E&&(O||(o(g,f,s,n,a,null,i,l,r),Ha(u,f)))):(u.pendingId=Ao++,O?(u.isHydrating=!1,u.activeBranch=b):c(b,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(g,f,s,n,a,null,i,l,r),Ha(u,f))):g&&Us(g,p)?(o(g,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(g&&Us(g,p))o(g,p,s,n,a,u,i,l,r),Ha(u,p);else if(Hi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Ao++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:m}=u;y>0?setTimeout(()=>{u.pendingId===m&&u.fallback(f)},y):y===0&&u.fallback(f)}}function Of(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:f,n:g,o:{parentNode:b,remove:E}}=c;let O;const y=jb(e);y&&t&&t.pendingBranch&&(O=t.pendingId,t.deps++);const m=e.props?Pl(e.props.timeout):void 0,x=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Ao++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(v=!1,k=!1){const{vnode:T,activeBranch:C,pendingBranch:D,pendingId:H,effects:P,parentComponent:R,container:V,isInFallback:X}=S;let U=!1;if(S.isHydrating)S.isHydrating=!1;else if(!v){U=C&&D.transition&&D.transition.mode==="out-in";let W=!1;U&&(C.transition.afterLeave=()=>{H===S.pendingId&&(p(D,V,i===x&&!W?g(C):i,0),Fi(P),X&&T.ssFallback&&(T.ssFallback.el=null))}),C&&!S.isFallbackMountPending&&(b(C.el)===V&&(i=g(C),W=!0),f(C,R,S,!0),!U&&X&&T.ssFallback&&Tt(()=>T.ssFallback.el=null,S)),U||p(D,V,i,0)}S.isFallbackMountPending=!1,Ha(S,D),S.pendingBranch=null,S.isInFallback=!1;let N=S.parent,I=!1;for(;N;){if(N.pendingBranch){N.effects.push(...P),I=!0;break}N=N.parent}!I&&!U&&Fi(P),S.effects=[],y&&t&&t.pendingBranch&&O===t.pendingId&&(t.deps--,t.deps===0&&!k&&t.resolve()),Hi(T,"onResolve")},fallback(v){if(!S.pendingBranch)return;const{vnode:k,activeBranch:T,parentComponent:C,container:D,namespace:H}=S;Hi(k,"onFallback");const P=g(T),R=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,v,D,P,C,null,H,r,o),Ha(S,v))},V=v.transition&&v.transition.mode==="out-in";V&&(S.isFallbackMountPending=!0,T.transition.afterLeave=R),S.isInFallback=!0,f(T,C,null,!0),V||R()},move(v,k,T){S.activeBranch&&p(S.activeBranch,v,k,T),S.container=v},next(){return S.activeBranch&&g(S.activeBranch)},registerDep(v,k,T){const C=!!S.pendingBranch;C&&S.deps++;const D=v.vnode.el;v.asyncDep.catch(H=>{va(H,v,0)}).then(H=>{if(v.isUnmounted||S.isUnmounted||S.pendingId!==v.suspenseId)return;Vi(),v.asyncResolved=!0;const{vnode:P}=v;Ro(v,H,!1),D&&(P.el=D);const R=!D&&v.subTree.el;k(v,P,b(D||v.subTree.el),D?null:g(v.subTree),S,l,T),R&&(P.placeholder=null,E(R)),Rr(v,P.el),C&&--S.deps===0&&S.resolve()})},unmount(v,k){S.isUnmounted=!0,S.activeBranch&&f(S.activeBranch,s,v,k),S.pendingBranch&&f(S.pendingBranch,s,v,k)}};return S}function Hb(e,t,s,n,a,i,l,r,o){const c=t.suspense=Of(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function zb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Ad(n?s.default:s),e.ssFallback=n?Ad(s.fallback):ht(St)}function Ad(e){let t;if(Pe(e)){const s=da&&e._c;s&&(e._d=!1,zi()),e=e(),s&&(e._d=!0,t=Kt,Lf())}return ke(e)&&(e=Cb(e)),e=ps(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Nf(e,t){t&&t.pendingBranch?ke(e)?t.effects.push(...e):t.effects.push(e):Fi(e)}function Ha(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Rr(n,a))}function jb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Dt=Symbol.for("v-fgt"),Un=Symbol.for("v-txt"),St=Symbol.for("v-cmt"),ra=Symbol.for("v-stc"),Ei=[];let Kt=null;function zi(e=!1){Ei.push(Kt=e?null:[])}function Lf(){Ei.pop(),Kt=Ei[Ei.length-1]||null}let da=1;function ji(e,t=!1){da+=e,e<0&&Kt&&t&&(Kt.hasOnce=!0)}function Mf(e){return e.dynamicChildren=da>0?Kt||Da:null,Lf(),da>0&&Kt&&Kt.push(e),e}function Vb(e,t,s,n,a,i){return Mf(_c(e,t,s,n,a,i,!0))}function Gl(e,t,s,n,a){return Mf(ht(e,t,s,n,a,!0))}function Cn(e){return e?e.__v_isVNode===!0:!1}function Us(e,t){return e.type===t.type&&e.key===t.key}function qb(e){}const Df=({key:e})=>e??null,Il=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Fe(e)||At(e)||Pe(e)?{i:Ht,r:e,k:t,f:!!s}:e:null);function _c(e,t=null,s=null,n=0,a=null,i=e===Dt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Df(t),ref:t&&Il(t),scopeId:kr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ht};return r?(kc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Fe(s)?8:16),da>0&&!l&&Kt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Kt.push(o),o}const ht=Gb;function Gb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===df)&&(e=St),Cn(e)){const r=sn(e,t,!0);return s&&kc(r,s),da>0&&!i&&Kt&&(r.shapeFlag&6?Kt[Kt.indexOf(e)]=r:Kt.push(r)),r.patchFlag=-2,r}if(Xb(e)&&(e=e.__vccOpts),t){t=Pf(t);let{class:r,style:o}=t;r&&!Fe(r)&&(t.class=Xi(r)),et(o)&&(el(o)&&!ke(o)&&(o=Ve({},o)),t.style=Qi(o))}const l=Fe(e)?1:ql(e)?128:Qp(e)?64:et(e)?4:Pe(e)?2:0;return _c(e,t,s,n,a,l,i,!0)}function Pf(e){return e?el(e)||yf(e)?Ve({},e):e:null}function sn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?$f(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Df(c),ref:t&&t.ref?s&&i?ke(i)?i.concat(Il(t)):[i,Il(t)]:Il(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Dt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&sn(e.ssContent),ssFallback:e.ssFallback&&sn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Tn(d,o.clone(d)),d}function wc(e=" ",t=0){return ht(Un,null,e,t)}function Kb(e,t){const s=ht(ra,null,e);return s.staticCount=t,s}function Ff(e="",t=!1){return t?(zi(),Gl(St,null,e)):ht(St,null,e)}function ps(e){return e==null||typeof e=="boolean"?ht(St):ke(e)?ht(Dt,null,e.slice()):Cn(e)?un(e):ht(Un,null,String(e))}function un(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:sn(e)}function kc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(ke(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),kc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!yf(t)?t._ctx=Ht:a===3&&Ht&&(Ht.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Pe(t)?(t={default:t,_ctx:Ht},s=32):(t=String(t),n&64?(s=16,t=[wc(t)]):s=8);e.children=t,e.shapeFlag|=s}function $f(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Xi([t.class,n.class]));else if(a==="style")t.style=Qi([t.style,n.style]);else if(ha(a)){const i=t[a],l=n[a];l&&i!==l&&!(ke(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!pr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ds(e,t,s,n=null){xs(e,t,7,[s,n])}const Wb=ff();let Zb=0;function Uf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Wb,i={uid:Zb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new tc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:_f(n,a),emitsOptions:mf(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Sb.bind(null,i),e.ce&&e.ce(i),i}let Bt=null;const is=()=>Bt||Ht;let Kl,za;{const e=vr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Kl=t("__VUE_INSTANCE_SETTERS__",s=>Bt=s),za=t("__VUE_SSR_SETTERS__",s=>ua=s)}const ii=e=>{const t=Bt;return Kl(e),e.scope.on(),()=>{e.scope.off(),Kl(t)}},Vi=()=>{Bt&&Bt.scope.off(),Kl(null)};function Bf(e){return e.vnode.shapeFlag&4}let ua=!1;function Hf(e,t=!1,s=!1){t&&za(t);const{props:n,children:a}=e.vnode,i=Bf(e);Ib(e,n,i,t),Mb(e,a,s||t);const l=i?Jb(e,t):void 0;return t&&za(!1),l}function Jb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,So);const{setup:n}=s;if(n){kn();const a=e.setupContext=n.length>1?Vf(e):null,i=ii(e),l=ai(n,e,0,[e.props,a]),r=ec(l);if(Sn(),i(),(r||e.sp)&&!xn(e)&&pc(e),r){if(l.then(Vi,Vi),t)return l.then(o=>{Ro(e,o,t)}).catch(o=>{va(o,e,0)});e.asyncDep=l}else Ro(e,l,t)}else jf(e,t)}function Ro(e,t,s){Pe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:et(t)&&(e.setupState=rc(t)),jf(e,s)}let Wl,Io;function zf(e){Wl=e,Io=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,sb))}}const Yb=()=>!Wl;function jf(e,t,s){const n=e.type;if(!e.render){if(!t&&Wl&&!n.render){const a=n.template||vc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Ve(Ve({isCustomElement:i,delimiters:r},l),o);n.render=Wl(a,c)}}e.render=n.render||zt,Io&&Io(e)}{const a=ii(e);kn();try{gb(e)}finally{Sn(),a()}}}const Qb={get(e,t){return Gt(e,"get",""),e[t]}};function Vf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Qb),slots:e.slots,emit:e.emit,expose:t}}function al(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(rc(Fp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ci)return Ci[s](e)},has(t,s){return s in t||s in Ci}})):e.proxy}function Oo(e,t=!0){return Pe(e)?e.displayName||e.name:e.name||t&&e.__name}function Xb(e){return Pe(e)&&"__vccOpts"in e}const K=(e,t)=>iv(e,t,ua);function Ka(e,t,s){try{ji(-1);const n=arguments.length;return n===2?et(t)&&!ke(t)?Cn(t)?ht(e,null,[t]):ht(e,t):ht(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Cn(s)&&(s=[s]),ht(e,t,s))}finally{ji(1)}}function ey(){}function ty(e,t,s,n){const a=s[n];if(a&&qf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function qf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Mt(s[n],t[n]))return!1;return da>0&&Kt&&Kt.push(e),!0}const Gf="3.5.38",sy=zt,ny=hv,ay=Ia,iy=Gp,ly={createComponentInstance:Uf,setupComponent:Hf,renderComponentRoot:Rl,setCurrentRenderingInstance:Ui,isVNode:Cn,normalizeVNode:ps,getComponentPublicInstance:al,ensureValidVNode:gc,pushWarningContext:dv,popWarningContext:uv},ry=ly,oy=null,cy=null,dy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let No;const Rd=typeof window<"u"&&window.trustedTypes;if(Rd)try{No=Rd.createPolicy("vue",{createHTML:e=>e})}catch{}const Kf=No?e=>No.createHTML(e):e=>e,uy="http://www.w3.org/2000/svg",py="http://www.w3.org/1998/Math/MathML",dn=typeof document<"u"?document:null,Id=dn&&dn.createElement("template"),Wf={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?dn.createElementNS(uy,e):t==="mathml"?dn.createElementNS(py,e):s?dn.createElement(e,{is:s}):dn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>dn.createTextNode(e),createComment:e=>dn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>dn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Id.innerHTML=Kf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Id.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},In="transition",ui="animation",Wa=Symbol("_vtc"),Zf={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Jf=Ve({},uc,Zf),fy=e=>(e.displayName="Transition",e.props=Jf,e),hy=fy((e,{slots:t})=>Ka(tf,Yf(e),t)),Yn=(e,t=[])=>{ke(e)?e.forEach(s=>s(...t)):e&&e(...t)},Od=e=>e?ke(e)?e.some(t=>t.length>1):e.length>1:!1;function Yf(e){const t={};for(const P in e)P in Zf||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,g=my(a),b=g&&g[0],E=g&&g[1],{onBeforeEnter:O,onEnter:y,onEnterCancelled:m,onLeave:x,onLeaveCancelled:S,onBeforeAppear:v=O,onAppear:k=y,onAppearCancelled:T=m}=t,C=(P,R,V,X)=>{P._enterCancelled=X,Mn(P,R?d:r),Mn(P,R?c:l),V&&V()},D=(P,R)=>{P._isLeaving=!1,Mn(P,u),Mn(P,f),Mn(P,p),R&&R()},H=P=>(R,V)=>{const X=P?k:y,U=()=>C(R,P,V);Yn(X,[R,U]),Nd(()=>{Mn(R,P?o:i),Ws(R,P?d:r),Od(X)||Ld(R,n,b,U)})};return Ve(t,{onBeforeEnter(P){Yn(O,[P]),Ws(P,i),Ws(P,l)},onBeforeAppear(P){Yn(v,[P]),Ws(P,o),Ws(P,c)},onEnter:H(!1),onAppear:H(!0),onLeave(P,R){P._isLeaving=!0;const V=()=>D(P,R);Ws(P,u),P._enterCancelled?(Ws(P,p),Lo(P)):(Lo(P),Ws(P,p)),Nd(()=>{P._isLeaving&&(Mn(P,u),Ws(P,f),Od(x)||Ld(P,n,E,V))}),Yn(x,[P,V])},onEnterCancelled(P){C(P,!1,void 0,!0),Yn(m,[P])},onAppearCancelled(P){C(P,!0,void 0,!0),Yn(T,[P])},onLeaveCancelled(P){D(P),Yn(S,[P])}})}function my(e){if(e==null)return null;if(et(e))return[Jr(e.enter),Jr(e.leave)];{const t=Jr(e);return[t,t]}}function Jr(e){return Pl(e)}function Ws(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Wa]||(e[Wa]=new Set)).add(t)}function Mn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Wa];s&&(s.delete(t),s.size||(e[Wa]=void 0))}function Nd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let gy=0;function Ld(e,t,s,n){const a=e._endId=++gy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Qf(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function Qf(e,t){const s=window.getComputedStyle(e),n=g=>(s[g]||"").split(", "),a=n(`${In}Delay`),i=n(`${In}Duration`),l=Md(a,i),r=n(`${ui}Delay`),o=n(`${ui}Duration`),c=Md(r,o);let d=null,u=0,p=0;t===In?l>0&&(d=In,u=l,p=i.length):t===ui?c>0&&(d=ui,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?In:ui:null,p=d?d===In?i.length:o.length:0);const f=d===In&&/\b(?:transform|all)(?:,|$)/.test(n(`${In}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function Md(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Dd(s)+Dd(e[n])))}function Dd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Lo(e){return(e?e.ownerDocument:document).body.offsetHeight}function vy(e,t,s){const n=e[Wa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Zl=Symbol("_vod"),Sc=Symbol("_vsh"),Xf={name:"show",beforeMount(e,{value:t},{transition:s}){e[Zl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):pi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),pi(e,!0),n.enter(e)):n.leave(e,()=>{pi(e,!1)}):pi(e,t))},beforeUnmount(e,{value:t}){pi(e,t)}};function pi(e,t){e.style.display=t?e[Zl]:"none",e[Sc]=!t}function by(){Xf.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const eh=Symbol("");function yy(e){const t=is();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Jl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Jl(t.ce,a):Mo(t.subTree,a),s(a)};fc(()=>{Fi(n)}),Ze(()=>{as(n,zt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),xt(()=>a.disconnect())})}function Mo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Mo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Jl(e.el,t);else if(e.type===Dt)e.children.forEach(s=>Mo(s,t));else if(e.type===ra){let{el:s,anchor:n}=e;for(;s&&(Jl(s,t),s!==n);)s=s.nextSibling}}function Jl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Tg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[eh]=n}}const xy=/(?:^|;)\s*display\s*:/;function _y(e,t,s){const n=e.style,a=Fe(s);let i=!1;if(s&&!a){if(t)if(Fe(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&_i(n,r,"")}else for(const l in t)s[l]==null&&_i(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?ky(e,l,!Fe(t)&&t?t[l]:void 0,r)||_i(n,l,r):_i(n,l,"")}}else if(a){if(t!==s){const l=n[eh];l&&(s+=";"+l),n.cssText=s,i=xy.test(s)}}else t&&e.removeAttribute("style");Zl in e&&(e[Zl]=i?n.display:"",e[Sc]&&(n.display="none"))}const Pd=/\s*!important$/;function _i(e,t,s){if(ke(s))s.forEach(n=>_i(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=wy(e,t);Pd.test(s)?e.setProperty(fs(n),s.replace(Pd,""),"important"):e[n]=s}}const Fd=["Webkit","Moz","ms"],Yr={};function wy(e,t){const s=Yr[t];if(s)return s;let n=lt(t);if(n!=="filter"&&n in e)return Yr[t]=n;n=ga(n);for(let a=0;a<Fd.length;a++){const i=Fd[a]+n;if(i in e)return Yr[t]=i}return t}function ky(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Fe(n)&&s===n}const $d="http://www.w3.org/1999/xlink";function Ud(e,t,s,n,a,i=kg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS($d,t.slice(6,t.length)):e.setAttributeNS($d,t,s):s==null||i&&!vp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Jt(s)?String(s):s)}function Bd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Kf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=vp(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function mn(e,t,s,n){e.addEventListener(t,s,n)}function Sy(e,t,s,n){e.removeEventListener(t,s,n)}const Hd=Symbol("_vei");function Ty(e,t,s,n,a=null){const i=e[Hd]||(e[Hd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Cy(t);if(n){const c=i[t]=Ry(n,a);mn(e,r,c,o)}else l&&(Sy(e,r,l,o),i[t]=void 0)}}const zd=/(?:Once|Passive|Capture)$/;function Cy(e){let t;if(zd.test(e)){t={};let n;for(;n=e.match(zd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):fs(e.slice(2)),t]}let Qr=0;const Ey=Promise.resolve(),Ay=()=>Qr||(Ey.then(()=>Qr=0),Qr=Date.now());function Ry(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(ke(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&xs(c,t,5,r)}}else xs(a,t,5,[n])};return s.value=e,s.attached=Ay(),s}const jd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,th=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?vy(e,n,l):t==="style"?_y(e,s,n):ha(t)?pr(t)||Ty(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Iy(e,t,n,l))?(Bd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Ud(e,t,n,l,i,t!=="value")):e._isVueCE&&(Oy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Fe(n)))?Bd(e,lt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Ud(e,t,n,l))};function Iy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&jd(t)&&Pe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return jd(t)&&Fe(s)?!1:t in e}function Oy(e,t){const s=e._def.props;if(!s)return!1;const n=lt(t);return Array.isArray(s)?s.some(a=>lt(a)===n):Object.keys(s).some(a=>lt(a)===n)}const Vd={};function sh(e,t,s){let n=sl(e,t);fr(n)&&(n=Ve({},n,t));class a extends Ir{constructor(l){super(n,l,s)}}return a.def=n,a}const Ny=((e,t)=>sh(e,t,mh)),Ly=typeof HTMLElement<"u"?HTMLElement:class{};class Ir extends Ly{constructor(t,s={},n=Xl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Xl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ve({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Ir){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ct(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!ke(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Pl(this._props[o])),(r||(r=Object.create(null)))[lt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)tt(this,n)||Object.defineProperty(this,n,{get:()=>en(s[n])})}_resolveProps(t){const{props:s}=t,n=ke(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(lt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Vd;const a=lt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Pl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Vd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(fs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(fs(t),s+""):s||this.removeAttribute(fs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),hh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ht(this._def,Ve(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,fr(l[0])?Ve({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),fs(i)!==i&&a(fs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function nh(e){const t=is(),s=t&&t.ce;return s||null}function My(){const e=nh();return e&&e.shadowRoot}function Dy(e="$style"){{const t=is();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const ah=new WeakMap,ih=new WeakMap,Yl=Symbol("_moveCb"),qd=Symbol("_enterCb"),Py=e=>(delete e.props.mode,e),Fy=Py({name:"TransitionGroup",props:Ve({},Jf,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=is(),n=dc();let a,i;return Cr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!zy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Uy),a.forEach(By);const r=a.filter(Hy);Lo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Ws(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Yl]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Yl]=null,Mn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ye(e),r=Yf(l);let o=l.tag||Dt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Sc]&&(a.push(d),Tn(d,Ga(d,r,n,s)),ah.set(d,lh(d.el)))}i=t.default?Sr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Tn(d,Ga(d,r,n,s))}return ht(o,null,i)}}}),$y=Fy;function Uy(e){const t=e.el;t[Yl]&&t[Yl](),t[qd]&&t[qd]()}function By(e){ih.set(e,lh(e.el))}function Hy(e){const t=ah.get(e),s=ih.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function lh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function zy(e,t,s){const n=e.cloneNode(),a=e[Wa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Qf(n);return i.removeChild(n),l}const Hn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return ke(t)?s=>$a(t,s):t};function jy(e){e.target.composing=!0}function Gd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ls=Symbol("_assign");function Kd(e,t,s){return t&&(e=e.trim()),s&&(e=gr(e)),e}const Ql={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ls]=Hn(a);const i=n||a.props&&a.props.type==="number";mn(e,t?"change":"input",l=>{l.target.composing||e[Ls](Kd(e.value,s,i))}),(s||i)&&mn(e,"change",()=>{e.value=Kd(e.value,s,i)}),t||(mn(e,"compositionstart",jy),mn(e,"compositionend",Gd),mn(e,"change",Gd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ls]=Hn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?gr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Tc={deep:!0,created(e,t,s){e[Ls]=Hn(s),mn(e,"change",()=>{const n=e._modelValue,a=Za(e),i=e.checked,l=e[Ls];if(ke(n)){const r=br(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(ma(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(oh(e,i))})},mounted:Wd,beforeUpdate(e,t,s){e[Ls]=Hn(s),Wd(e,t,s)}};function Wd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(ke(t))a=br(t,n.props.value)>-1;else if(ma(t))a=t.has(n.props.value);else{if(t===s)return;a=wn(t,oh(e,!0))}e.checked!==a&&(e.checked=a)}const Cc={created(e,{value:t},s){e.checked=wn(t,s.props.value),e[Ls]=Hn(s),mn(e,"change",()=>{e[Ls](Za(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ls]=Hn(n),t!==s&&(e.checked=wn(t,n.props.value))}},rh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=ma(t);mn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?gr(Za(l)):Za(l));e[Ls](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ct(()=>{e._assigning=!1})}),e[Ls]=Hn(n)},mounted(e,{value:t}){Zd(e,t)},beforeUpdate(e,t,s){e[Ls]=Hn(s)},updated(e,{value:t}){e._assigning||Zd(e,t)}};function Zd(e,t){const s=e.multiple,n=ke(t);if(!(s&&!n&&!ma(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Za(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=br(t,r)>-1}else l.selected=t.has(r);else if(wn(Za(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Za(e){return"_value"in e?e._value:e.value}function oh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ch={created(e,t,s){_l(e,t,s,null,"created")},mounted(e,t,s){_l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){_l(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){_l(e,t,s,n,"updated")}};function dh(e,t){switch(e){case"SELECT":return rh;case"TEXTAREA":return Ql;default:switch(t){case"checkbox":return Tc;case"radio":return Cc;default:return Ql}}}function _l(e,t,s,n,a){const l=dh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Vy(){Ql.getSSRProps=({value:e})=>({value:e}),Cc.getSSRProps=({value:e},t)=>{if(t.props&&wn(t.props.value,e))return{checked:!0}},Tc.getSSRProps=({value:e},t)=>{if(ke(e)){if(t.props&&br(e,t.props.value)>-1)return{checked:!0}}else if(ma(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ch.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=dh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const qy=["ctrl","shift","alt","meta"],Gy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>qy.some(s=>e[`${s}Key`]&&!t.includes(s))},Ky=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Gy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Wy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Zy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=fs(a.key);if(t.some(l=>l===i||Wy[l]===i))return e(a)}))},uh=Ve({patchProp:th},Wf);let Ai,Jd=!1;function ph(){return Ai||(Ai=Tf(uh))}function fh(){return Ai=Jd?Ai:Cf(uh),Jd=!0,Ai}const hh=((...e)=>{ph().render(...e)}),Jy=((...e)=>{fh().hydrate(...e)}),Xl=((...e)=>{const t=ph().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=vh(n);if(!a)return;const i=t._component;!Pe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,gh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),mh=((...e)=>{const t=fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=vh(n);if(a)return s(a,!0,gh(a))},t});function gh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function vh(e){return Fe(e)?document.querySelector(e):e}let Yd=!1;const Yy=()=>{Yd||(Yd=!0,Vy(),by())},Qy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:tf,BaseTransitionPropsValidators:uc,Comment:St,DeprecationTypes:dy,EffectScope:tc,ErrorCodes:fv,ErrorTypeStrings:ny,Fragment:Dt,KeepAlive:Gv,ReactiveEffect:Mi,Static:ra,Suspense:$b,Teleport:Av,Text:Un,TrackOpTypes:lv,Transition:hy,TransitionGroup:$y,TriggerOpTypes:rv,VueElement:Ir,assertNumber:pv,callWithAsyncErrorHandling:xs,callWithErrorHandling:ai,camelize:lt,capitalize:ga,cloneVNode:sn,compatUtils:cy,computed:K,createApp:Xl,createBlock:Gl,createCommentVNode:Ff,createElementBlock:Vb,createElementVNode:_c,createHydrationRenderer:Cf,createPropsRestProxy:hb,createRenderer:Tf,createSSRApp:mh,createSlots:Xv,createStaticVNode:Kb,createTextVNode:wc,createVNode:ht,customRef:Up,defineAsyncComponent:Vv,defineComponent:sl,defineCustomElement:sh,defineEmits:ab,defineExpose:ib,defineModel:ob,defineOptions:lb,defineProps:nb,defineSSRCustomElement:Ny,defineSlots:rb,devtools:ay,effect:Rg,effectScope:Cg,getCurrentInstance:is,getCurrentScope:_p,getCurrentWatcher:ov,getTransitionRawChildren:Sr,guardReactiveProps:Pf,h:Ka,handleError:va,hasInjectionContext:_v,hydrate:Jy,hydrateOnIdle:$v,hydrateOnInteraction:zv,hydrateOnMediaQuery:Hv,hydrateOnVisible:Bv,initCustomFormatter:ey,initDirectivesForSSR:Yy,inject:Ns,isMemoSame:qf,isProxy:el,isReactive:yn,isReadonly:tn,isRef:At,isRuntimeOnly:Yb,isShallow:ms,isVNode:Cn,markRaw:Fp,mergeDefaults:pb,mergeModels:fb,mergeProps:$f,nextTick:Ct,nodeOps:Wf,normalizeClass:Xi,normalizeProps:fg,normalizeStyle:Qi,onActivated:ws,onBeforeMount:af,onBeforeUnmount:Er,onBeforeUpdate:fc,onDeactivated:ks,onErrorCaptured:cf,onMounted:Ze,onRenderTracked:of,onRenderTriggered:rf,onScopeDispose:Eg,onServerPrefetch:lf,onUnmounted:xt,onUpdated:Cr,onWatcherCleanup:Hp,openBlock:zi,patchProp:th,popScopeId:bv,provide:Ti,proxyRefs:rc,pushScopeId:vv,queuePostFlushCb:Fi,reactive:zn,readonly:$l,ref:h,registerRuntimeCompiler:zf,render:hh,renderList:Qv,renderSlot:eb,resolveComponent:Zv,resolveDirective:Yv,resolveDynamicComponent:Jv,resolveFilter:oy,resolveTransitionHooks:Ga,setBlockTracking:ji,setDevtoolsHook:iy,setTransitionHooks:Tn,shallowReactive:ic,shallowReadonly:Wg,shallowRef:lc,ssrContextKey:Kp,ssrUtils:ry,stop:Ig,toDisplayString:yp,toHandlerKey:Fa,toHandlers:tb,toRaw:Ye,toRef:nv,toRefs:ev,toValue:Yg,transformVNodeArgs:qb,triggerRef:Jg,unref:en,useAttrs:ub,useCssModule:Dy,useCssVars:yy,useHost:nh,useId:Iv,useModel:kb,useSSRContext:Wp,useShadowRoot:My,useSlots:db,useTemplateRef:Ov,useTransitionState:dc,vModelCheckbox:Tc,vModelDynamic:ch,vModelRadio:Cc,vModelSelect:rh,vModelText:Ql,vShow:Xf,version:Gf,warn:sy,watch:as,watchEffect:wv,watchPostEffect:kv,watchSyncEffect:Zp,withAsyncContext:mb,withCtx:cc,withDefaults:cb,withDirectives:xv,withKeys:Zy,withMemo:ty,withModifiers:Ky,withScopeId:yv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qi=Symbol(""),Ri=Symbol(""),Ec=Symbol(""),er=Symbol(""),bh=Symbol(""),pa=Symbol(""),yh=Symbol(""),xh=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),il=Symbol(""),Ic=Symbol(""),_h=Symbol(""),Oc=Symbol(""),Nc=Symbol(""),Lc=Symbol(""),Mc=Symbol(""),Dc=Symbol(""),Pc=Symbol(""),wh=Symbol(""),kh=Symbol(""),Or=Symbol(""),tr=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Gi=Symbol(""),ll=Symbol(""),Uc=Symbol(""),Do=Symbol(""),Xy=Symbol(""),Po=Symbol(""),sr=Symbol(""),ex=Symbol(""),tx=Symbol(""),Bc=Symbol(""),sx=Symbol(""),nx=Symbol(""),Hc=Symbol(""),Sh=Symbol(""),Ja={[qi]:"Fragment",[Ri]:"Teleport",[Ec]:"Suspense",[er]:"KeepAlive",[bh]:"BaseTransition",[pa]:"openBlock",[yh]:"createBlock",[xh]:"createElementBlock",[Ac]:"createVNode",[Rc]:"createElementVNode",[il]:"createCommentVNode",[Ic]:"createTextVNode",[_h]:"createStaticVNode",[Oc]:"resolveComponent",[Nc]:"resolveDynamicComponent",[Lc]:"resolveDirective",[Mc]:"resolveFilter",[Dc]:"withDirectives",[Pc]:"renderList",[wh]:"renderSlot",[kh]:"createSlots",[Or]:"toDisplayString",[tr]:"mergeProps",[Fc]:"normalizeClass",[$c]:"normalizeStyle",[Gi]:"normalizeProps",[ll]:"guardReactiveProps",[Uc]:"toHandlers",[Do]:"camelize",[Xy]:"capitalize",[Po]:"toHandlerKey",[sr]:"setBlockTracking",[ex]:"pushScopeId",[tx]:"popScopeId",[Bc]:"withCtx",[sx]:"unref",[nx]:"isRef",[Hc]:"withMemo",[Sh]:"isMemoSame"};function ax(e){Object.getOwnPropertySymbols(e).forEach(t=>{Ja[t]=e[t]})}const Ss={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ix(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ss}}function Ki(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=Ss){return e&&(r?(e.helper(pa),e.helper(Xa(e.inSSR,c))):e.helper(Qa(e.inSSR,c)),l&&e.helper(Dc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function oa(e,t=Ss){return{type:17,loc:t,elements:e}}function Os(e,t=Ss){return{type:15,loc:t,properties:e}}function Et(e,t){return{type:16,loc:Ss,key:Fe(e)?Be(e,!0):e,value:t}}function Be(e,t=!1,s=Ss,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Hs(e,t=Ss){return{type:8,loc:t,children:e}}function Nt(e,t=[],s=Ss){return{type:14,loc:s,callee:e,arguments:t}}function Ya(e,t=void 0,s=!1,n=!1,a=Ss){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Fo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Ss}}function lx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Ss}}function rx(e){return{type:21,body:e,loc:Ss}}function Qa(e,t){return e||t?Ac:Rc}function Xa(e,t){return e||t?yh:xh}function zc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Qa(n,e.isComponent)),t(pa),t(Xa(n,e.isComponent)))}const Qd=new Uint8Array([123,123]),Xd=new Uint8Array([125,125]);function eu(e){return e>=97&&e<=122||e>=65&&e<=90}function bs(e){return e===32||e===10||e===9||e===12||e===13}function On(e){return e===47||e===62||bs(e)}function nr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const jt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class ox{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Qd,this.delimiterClose=Xd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Qd,this.delimiterClose=Xd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?On(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||bs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===jt.TitleEnd||this.currentSequence===jt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===jt.Cdata[this.sequenceIndex]?++this.sequenceIndex===jt.Cdata.length&&(this.state=28,this.currentSequence=jt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):eu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){On(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(On(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(nr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){bs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=eu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||bs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):bs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):bs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||On(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||On(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||On(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||On(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||On(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):bs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):bs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){bs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=jt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===jt.ScriptEnd[3]?this.startSpecial(jt.ScriptEnd,4):t===jt.StyleEnd[3]?this.startSpecial(jt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===jt.TitleEnd[3]?this.startSpecial(jt.TitleEnd,4):t===jt.TextareaEnd[3]?this.startSpecial(jt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function tu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ca(e,t){const s=tu("MODE",t),n=tu(e,t);return s===3?n===!0:n!==!1}function Wi(e,t,s,...n){return ca(e,t)}function jc(e){throw e}function Th(e){}function ft(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const hs=e=>e.type===4&&e.isStatic;function Ch(e){switch(e){case"Teleport":case"teleport":return Ri;case"Suspense":case"suspense":return Ec;case"KeepAlive":case"keep-alive":return er;case"BaseTransition":case"base-transition":return bh}}const cx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Vc=e=>!cx.test(e),Eh=/[A-Za-z_$\xA0-\uFFFF]/,dx=/[\.\?\w$\xA0-\uFFFF]/,ux=/\s+[.[]\s*|\s*[.[]\s+/g,Ah=e=>e.type===4?e.content:e.loc.source,px=e=>{const t=Ah(e).trim().replace(ux,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Eh:dx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Rh=px,fx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,hx=e=>fx.test(Ah(e)),mx=hx;function Is(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Fe(t)?a.name===t:t.test(a.name)))return a}}function Nr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&sa(i.arg,t))return i}}function sa(e,t){return!!(e&&hs(e)&&e.content===t)}function gx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Xr(e){return e.type===5||e.type===2}function su(e){return e.type===7&&e.name==="pre"}function vx(e){return e.type===7&&e.name==="slot"}function ar(e){return e.type===1&&e.tagType===3}function ir(e){return e.type===1&&e.tagType===2}const bx=new Set([Gi,ll]);function Ih(e,t=[]){if(e&&!Fe(e)&&e.type===14){const s=e.callee;if(!Fe(s)&&bx.has(s))return Ih(e.arguments[0],t.concat(e))}return[e,t]}function lr(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Fe(a)&&a.type===14){const r=Ih(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Fe(a))n=Os([t]);else if(a.type===14){const r=a.arguments[0];!Fe(r)&&r.type===15?nu(t,r)||r.properties.unshift(t):a.callee===Uc?n=Nt(s.helper(tr),[Os([t]),a]):a.arguments.unshift(Os([t])),!n&&(n=a)}else a.type===15?(nu(t,a)||a.properties.unshift(t),n=a):(n=Nt(s.helper(tr),[Os([t]),a]),l&&l.callee===ll&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function nu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Zi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function yx(e){return e.type===14&&e.callee===Hc?e.arguments[1].returns:e}const xx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Oh(e){for(let t=0;t<e.length;t++)if(!bs(e.charCodeAt(t)))return!1;return!0}function qc(e){return e.type===2&&Oh(e.content)||e.type===12&&qc(e.content)}function Nh(e){return e.type===3||qc(e)}const Lh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:La,isPreTag:La,isIgnoreNewlineTag:La,isCustomElement:La,onError:jc,onWarn:Th,comments:!1,prefixIdentifiers:!1};let Xe=Lh,Ji=null,_n="",qt=null,We=null,cs="",cn=-1,Xn=-1,Gc=0,Fn=!1,$o=null;const pt=[],yt=new ox(pt,{onerr:ln,ontext(e,t){wl(Ut(e,t),e,t)},ontextentity(e,t,s){wl(e,t,s)},oninterpolation(e,t){if(Fn)return wl(Ut(e,t),e,t);let s=e+yt.delimiterOpen.length,n=t-yt.delimiterClose.length;for(;bs(_n.charCodeAt(s));)s++;for(;bs(_n.charCodeAt(n-1));)n--;let a=Ut(s,n);a.includes("&")&&(a=Xe.decodeEntities(a,!1)),Uo({type:5,content:Nl(a,!1,kt(s,n)),loc:kt(e,t)})},onopentagname(e,t){const s=Ut(e,t);qt={type:1,tag:s,ns:Xe.getNamespace(s,pt[0],Xe.ns),tagType:0,props:[],children:[],loc:kt(e-1,t),codegenNode:void 0}},onopentagend(e){iu(e)},onclosetag(e,t){const s=Ut(e,t);if(!Xe.isVoidTag(s)){let n=!1;for(let a=0;a<pt.length;a++)if(pt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&ln(24,pt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=pt.shift();Ol(r,t,l<a)}break}n||ln(23,Mh(e,60))}},onselfclosingtag(e){const t=qt.tag;qt.isSelfClosing=!0,iu(e),pt[0]&&pt[0].tag===t&&Ol(pt.shift(),e)},onattribname(e,t){We={type:6,name:Ut(e,t),nameLoc:kt(e,t),value:void 0,loc:kt(e)}},ondirname(e,t){const s=Ut(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Fn&&n===""&&ln(26,e),Fn||n==="")We={type:6,name:s,nameLoc:kt(e,t),value:void 0,loc:kt(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Be("prop")]:[],loc:kt(e)},n==="pre"){Fn=yt.inVPre=!0,$o=qt;const a=qt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Ix(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ut(e,t);if(Fn&&!su(We))We.name+=s,na(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=Nl(n?s:s.slice(1,-1),n,kt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ut(e,t);if(Fn&&!su(We))We.name+="."+s,na(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,na(n.loc,t))}else{const n=Be(s,!0,kt(e,t));We.modifiers.push(n)}},onattribdata(e,t){cs+=Ut(e,t),cn<0&&(cn=e),Xn=t},onattribentity(e,t,s){cs+=e,cn<0&&(cn=t),Xn=s},onattribnameend(e){const t=We.loc.start.offset,s=Ut(t,e);We.type===7&&(We.rawName=s),qt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&ln(2,t)},onattribend(e,t){if(qt&&We){if(na(We.loc,t),e!==0)if(cs.includes("&")&&(cs=Xe.decodeEntities(cs,!0)),We.type===6)We.name==="class"&&(cs=Ph(cs).trim()),e===1&&!cs&&ln(13,t),We.value={type:2,content:cs,loc:e===1?kt(cn,Xn):kt(cn-1,Xn+1)},yt.inSFCRoot&&qt.tag==="template"&&We.name==="lang"&&cs&&cs!=="html"&&yt.enterRCDATA(nr("</template"),0);else{let s=0;We.exp=Nl(cs,!1,kt(cn,Xn),0,s),We.name==="for"&&(We.forParseResult=wx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&Wi("COMPILER_V_BIND_SYNC",Xe,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&qt.props.push(We)}cs="",cn=Xn=-1},oncomment(e,t){Xe.comments&&Uo({type:3,content:Ut(e,t),loc:kt(e-4,t+3)})},onend(){const e=_n.length;for(let t=0;t<pt.length;t++)Ol(pt[t],e-1),ln(24,pt[t].loc.start.offset)},oncdata(e,t){(pt[0]?pt[0].ns:Xe.ns)!==0?wl(Ut(e,t),e,t):ln(1,e-9)},onprocessinginstruction(e){(pt[0]?pt[0].ns:Xe.ns)===0&&ln(21,e-1)}}),au=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,_x=/^\(|\)$/g;function wx(e){const t=e.loc,s=e.content,n=s.match(xx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const g=t.start.offset+p,b=g+u.length;return Nl(u,!1,kt(g,b),0,f?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(_x,"").trim();const c=a.indexOf(o),d=o.match(au);if(d){o=o.replace(au,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(r.index=l(f,s.indexOf(f,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ut(e,t){return _n.slice(e,t)}function iu(e){yt.inSFCRoot&&(qt.innerLoc=kt(e+1,e+1)),Uo(qt);const{tag:t,ns:s}=qt;s===0&&Xe.isPreTag(t)&&Gc++,Xe.isVoidTag(t)?Ol(qt,e):(pt.unshift(qt),(s===1||s===2)&&(yt.inXML=!0)),qt=null}function wl(e,t,s){{const i=pt[0]&&pt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Xe.decodeEntities(e,!1))}const n=pt[0]||Ji,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,na(a.loc,s)):n.children.push({type:2,content:e,loc:kt(t,s)})}function Ol(e,t,s=!1){s?na(e.loc,Mh(t,60)):na(e.loc,kx(t,62)+1),yt.inSFCRoot&&(e.children.length?e.innerLoc.end=Ve({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ve({},e.innerLoc.start),e.innerLoc.source=Ut(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Fn||(n==="slot"?e.tagType=2:lu(e)?e.tagType=3:Tx(e)&&(e.tagType=1)),yt.inRCDATA||(e.children=Dh(i)),a===0&&Xe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Xe.isPreTag(n)&&Gc--,$o===e&&(Fn=yt.inVPre=!1,$o=null),yt.inXML&&(pt[0]?pt[0].ns:Xe.ns)===0&&(yt.inXML=!1);{const l=e.props;if(!yt.inSFCRoot&&ca("COMPILER_NATIVE_TEMPLATE",Xe)&&e.tag==="template"&&!lu(e)){const o=pt[0]||Ji,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Wi("COMPILER_INLINE_TEMPLATE",Xe,r.loc)&&e.children.length&&(r.value={type:2,content:Ut(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function kx(e,t){let s=e;for(;_n.charCodeAt(s)!==t&&s<_n.length-1;)s++;return s}function Mh(e,t){let s=e;for(;_n.charCodeAt(s)!==t&&s>=0;)s--;return s}const Sx=new Set(["if","else","else-if","for","slot"]);function lu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Sx.has(t[s].name))return!0}return!1}function Tx({tag:e,props:t}){if(Xe.isCustomElement(e))return!1;if(e==="component"||Cx(e.charCodeAt(0))||Ch(e)||Xe.isBuiltInComponent&&Xe.isBuiltInComponent(e)||Xe.isNativeTag&&!Xe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Wi("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}}else if(n.name==="bind"&&sa(n.arg,"is")&&Wi("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}return!1}function Cx(e){return e>64&&e<91}const Ex=/\r\n/g;function Dh(e){const t=Xe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Gc)a.content=a.content.replace(Ex,`
`);else if(Oh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Ax(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Ph(a.content))}return s?e.filter(Boolean):e}function Ax(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Ph(e){let t="",s=!1;for(let n=0;n<e.length;n++)bs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Uo(e){(pt[0]||Ji).children.push(e)}function kt(e,t){return{start:yt.getPos(e),end:t==null?t:yt.getPos(t),source:t==null?t:Ut(e,t)}}function Rx(e){return kt(e.start.offset,e.end.offset)}function na(e,t){e.end=yt.getPos(t),e.source=Ut(e.start.offset,t)}function Ix(e){const t={type:6,name:e.rawName,nameLoc:kt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Nl(e,t=!1,s,n=0,a=0){return Be(e,t,s,n)}function ln(e,t,s){Xe.onError(ft(e,kt(t,t)))}function Ox(){yt.reset(),qt=null,We=null,cs="",cn=-1,Xn=-1,pt.length=0}function Nx(e,t){if(Ox(),_n=e,Xe=Ve({},Lh),t){let a;for(a in t)t[a]!=null&&(Xe[a]=t[a])}yt.mode=Xe.parseMode==="html"?1:Xe.parseMode==="sfc"?2:0,yt.inXML=Xe.ns===1||Xe.ns===2;const s=t&&t.delimiters;s&&(yt.delimiterOpen=nr(s[0]),yt.delimiterClose=nr(s[1]));const n=Ji=ix([],e);return yt.parse(_n),n.loc=kt(0,e.length),n.children=Dh(n.children),Ji=null,n}function Lx(e,t){Ll(e,void 0,t,!!Fh(e))}function Fh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!ir(t[0])?t[0]:null}function Ll(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:ys(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const g=f.patchFlag;if((g===void 0||g===512||g===1)&&Uh(u,s)>=2){const b=Bh(u);b&&(f.props=s.hoist(b))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:ys(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Ll(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Ll(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Ll(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&ke(e.codegenNode.children))e.codegenNode.children=o(oa(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!ke(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(oa(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!ke(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Is(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(oa(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!ke(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ys(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Uh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ys(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ys(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(pa),t.removeHelper(Xa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Qa(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ys(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Fe(r)||Jt(r))continue;const o=ys(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Mx=new Set([Fc,$c,Gi,ll]);function $h(e,t){if(e.type===14&&!Fe(e.callee)&&Mx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ys(s,t);if(s.type===14)return $h(s,t)}return 0}function Uh(e,t){let s=3;const n=Bh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ys(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ys(r,t):r.type===14?c=$h(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Bh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Dx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=zt,isCustomElement:d=zt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:g=!1,inSSR:b=!1,ssrCssVars:E="",bindingMetadata:O=Ke,inline:y=!1,isTS:m=!1,onError:x=jc,onWarn:S=Th,compatConfig:v}){const k=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:k&&ga(lt(k[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:g,inSSR:b,ssrCssVars:E,bindingMetadata:O,inline:y,isTS:m,onError:x,onWarn:S,compatConfig:v,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const D=T.helpers.get(C)||0;return T.helpers.set(C,D+1),C},removeHelper(C){const D=T.helpers.get(C);if(D){const H=D-1;H?T.helpers.set(C,H):T.helpers.delete(C)}},helperString(C){return`_${Ja[T.helper(C)]}`},replaceNode(C){T.parent.children[T.childIndex]=T.currentNode=C},removeNode(C){const D=T.parent.children,H=C?D.indexOf(C):T.currentNode?T.childIndex:-1;!C||C===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>H&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(H,1)},onNodeRemoved:zt,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){Fe(C)&&(C=Be(C)),T.hoists.push(C);const D=Be(`_hoisted_${T.hoists.length}`,!1,C.loc,2);return D.hoisted=C,D},cache(C,D=!1,H=!1){const P=lx(T.cached.length,C,D,H);return T.cached.push(P),P}};return T.filters=new Set,T}function Px(e,t){const s=Dx(e,t);Lr(e,s),t.hoistStatic&&Lx(e,s),t.ssr||Fx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Fx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Fh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&zc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ki(t,s(qi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function $x(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Fe(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Lr(a,t))}}function Lr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(ke(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(il);break;case 5:t.ssr||t.helper(Or);break;case 9:for(let i=0;i<e.branches.length;i++)Lr(e.branches[i],t);break;case 10:case 11:case 1:case 0:$x(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Hh(e,t){const s=Fe(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(vx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Mr="/*@__PURE__*/",zh=e=>`${Ja[e]}: _${Ja[e]}`;function Ux(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(b){return`_${Ja[b]}`},push(b,E=-2,O){f.code+=b},indent(){g(++f.indentLevel)},deindent(b=!1){b?--f.indentLevel:g(--f.indentLevel)},newline(){g(f.indentLevel)}};function g(b){f.push(`
`+"  ".repeat(b),0)}return f}function Bx(e,t={}){const s=Ux(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";Hx(e,s);const b=d?"ssrRender":"render",O=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${b}(${O}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(zh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(eo(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(eo(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),eo(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Wt(e.codegenNode,s):a("null"),f&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Hx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Ac,Rc,il,Ic,_h].filter(p=>d.includes(p)).map(zh).join(", ");a(`const { ${u} } = _Vue
`,-1)}zx(e.hoists,t),i(),a("return ")}function eo(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Mc:t==="component"?Oc:Lc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Zi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function zx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Wt(i,t),n())}t.pure=!1}function Kc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),rl(e,t,s),s&&t.deindent(),t.push("]")}function rl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Fe(r)?a(r,-3):ke(r)?Kc(r,t):Wt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Wt(e,t){if(Fe(e)){t.push(e,-3);return}if(Jt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Wt(e.codegenNode,t);break;case 2:jx(e,t);break;case 4:jh(e,t);break;case 5:Vx(e,t);break;case 12:Wt(e.codegenNode,t);break;case 8:Vh(e,t);break;case 3:Gx(e,t);break;case 13:Kx(e,t);break;case 14:Zx(e,t);break;case 15:Jx(e,t);break;case 17:Yx(e,t);break;case 18:Qx(e,t);break;case 19:Xx(e,t);break;case 20:e0(e,t);break;case 21:rl(e.body,t,!0,!1);break}}function jx(e,t){t.push(JSON.stringify(e.content),-3,e)}function jh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Vx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mr),s(`${n(Or)}(`),Wt(e.content,t),s(")")}function Vh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Fe(n)?t.push(n,-3):Wt(n,t)}}function qx(e,t){const{push:s}=t;if(e.type===8)s("["),Vh(e,t),s("]");else if(e.isStatic){const n=Vc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Gx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mr),s(`${n(il)}(${JSON.stringify(e.content)})`,-3,e)}function Kx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let g;o&&(g=String(o)),d&&s(n(Dc)+"("),u&&s(`(${n(pa)}(${p?"true":""}), `),a&&s(Mr);const b=u?Xa(t.inSSR,f):Qa(t.inSSR,f);s(n(b)+"(",-2,e),rl(Wx([i,l,r,g,c]),t),s(")"),u&&s(")"),d&&(s(", "),Wt(d,t),s(")"))}function Wx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Zx(e,t){const{push:s,helper:n,pure:a}=t,i=Fe(e.callee)?e.callee:n(e.callee);a&&s(Mr),s(i+"(",-2,e),rl(e.arguments,t),s(")")}function Jx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];qx(c,t),s(": "),Wt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Yx(e,t){Kc(e.elements,t)}function Qx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Ja[Bc]}(`),s("(",-2,e),ke(i)?rl(i,t):i&&Wt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),ke(l)?Kc(l,t):Wt(l,t)):r&&Wt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Xx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Vc(s.content);u&&l("("),jh(s,t),u&&l(")")}else l("("),Wt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Wt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Wt(a,t),d||t.indentLevel--,i&&o(!0)}function e0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(sr)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Wt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(sr)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const t0=Hh(/^(?:if|else|else-if)$/,(e,t,s)=>s0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=ou(a,o,s);else{const c=n0(n.codegenNode);c.alternate=ou(a,o+n.branches.length-1,s)}}}));function s0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ft(28,t.loc)),t.exp=Be("true",!1,a)}if(t.name==="if"){const a=ru(e,t),i={type:9,loc:Rx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Nh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ft(30,e.loc)),s.removeNode();const r=ru(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Lr(r,s),o&&o(),s.currentNode=null}else s.onError(ft(30,e.loc));break}}}function ru(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Is(e,"for")?e.children:[e],userKey:Nr(e,"key"),isTemplateIf:s}}function ou(e,t,s){return e.condition?Fo(e.condition,cu(e,t,s),Nt(s.helper(il),['""',"true"])):cu(e,t,s)}function cu(e,t,s){const{helper:n}=s,a=Et("key",Be(`${t}`,!1,Ss,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return lr(o,a,s),o}else return Ki(s,n(qi),Os([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=yx(o);return c.type===13&&zc(c,s),lr(c,a,s),o}}function n0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const a0=Hh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return i0(e,t,s,i=>{const l=Nt(n(Pc),[i.source]),r=ar(e),o=Is(e,"memo"),c=Nr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Be(c.value.content,!0):void 0:c.exp);const u=d?Et("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=Ki(s,n(qi),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let g;const{children:b}=i,E=b.length!==1||b[0].type!==1,O=ir(e)?e:r&&e.children.length===1&&ir(e.children[0])?e.children[0]:null;if(O?(g=O.codegenNode,r&&u&&lr(g,u,s)):E?g=Ki(s,n(qi),u?Os([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(g=b[0].codegenNode,r&&u&&lr(g,u,s),g.isBlock!==!p&&(g.isBlock?(a(pa),a(Xa(s.inSSR,g.isComponent))):a(Qa(s.inSSR,g.isComponent))),g.isBlock=!p,g.isBlock?(n(pa),n(Xa(s.inSSR,g.isComponent))):n(Qa(s.inSSR,g.isComponent))),o){const y=Ya(Bo(i.parseResult,[Be("_cached")]));y.body=rx([Hs(["const _memo = (",o.exp,")"]),Hs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Sh)}(_cached, _memo)) return _cached`]),Hs(["const _item = ",g]),Be("_item.memo = _memo"),Be("return _item")]),l.arguments.push(y,Be("_cache"),Be(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Ya(Bo(i.parseResult),g,!0))}})});function i0(e,t,s,n){if(!t.exp){s.onError(ft(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ft(32,t.loc));return}qh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:ar(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const f=n&&n(p);return()=>{r.vFor--,f&&f()}}function qh(e,t){e.finalized||(e.finalized=!0)}function Bo({value:e,key:t,index:s},n=[]){return l0([e,t,s,...n])}function l0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Be("_".repeat(n+1),!1))}const du=Be("undefined",!1),r0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Is(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},o0=(e,t,s,n)=>Ya(e,s,!1,!0,s.length?s[0].loc:n);function c0(e,t,s=o0){t.helper(Bc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=Is(e,"slot",!0);if(o){const{arg:E,exp:O}=o;E&&!hs(E)&&(r=!0),i.push(Et(E||Be("default",!0),s(O,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let E=0;E<n.length;E++){const O=n[E];let y;if(!ar(O)||!(y=Is(O,"slot",!0))){O.type!==3&&u.push(O);continue}if(o){t.onError(ft(37,y.loc));break}c=!0;const{children:m,loc:x}=O,{arg:S=Be("default",!0),exp:v,loc:k}=y;let T;hs(S)?T=S?S.content:"default":r=!0;const C=Is(O,"for"),D=s(v,C,m,x);let H,P;if(H=Is(O,"if"))r=!0,l.push(Fo(H.exp,kl(S,D,f++),du));else if(P=Is(O,/^else(?:-if)?$/,!0)){let R=E,V;for(;R--&&(V=n[R],!!Nh(V)););if(V&&ar(V)&&Is(V,/^(?:else-)?if$/)){let X=l[l.length-1];for(;X.alternate.type===19;)X=X.alternate;X.alternate=P.exp?Fo(P.exp,kl(S,D,f++),du):kl(S,D,f++)}else t.onError(ft(30,P.loc))}else if(C){r=!0;const R=C.forParseResult;R?(qh(R),l.push(Nt(t.helper(Pc),[R.source,Ya(Bo(R),kl(S,D),!0)]))):t.onError(ft(32,C.loc))}else{if(T){if(p.has(T)){t.onError(ft(38,k));continue}p.add(T),T==="default"&&(d=!0)}i.push(Et(S,D))}}if(!o){const E=(O,y)=>{const m=s(O,void 0,y,a);return t.compatConfig&&(m.isNonScopedSlot=!0),Et("default",m)};c?u.length&&!u.every(qc)&&(d?t.onError(ft(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,n))}const g=r?2:Ml(e.children)?3:1;let b=Os(i.concat(Et("_",Be(g+"",!1))),a);return l.length&&(b=Nt(t.helper(kh),[b,oa(l)])),{slots:b,hasDynamicSlots:r}}function kl(e,t,s){const n=[Et("name",e),Et("fn",t)];return s!=null&&n.push(Et("key",Be(String(s),!0))),Os(n)}function Ml(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Ml(s.children))return!0;break;case 9:if(Ml(s.branches))return!0;break;case 10:case 11:if(Ml(s.children))return!0;break}}return!1}const Gh=new WeakMap,d0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?u0(e,t):`"${n}"`;const r=et(l)&&l.callee===Nc;let o,c,d=0,u,p,f,g=r||l===Ri||l===Ec||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const b=Kh(e,t,void 0,i,r);o=b.props,d=b.patchFlag,p=b.dynamicPropNames;const E=b.directives;f=E&&E.length?oa(E.map(O=>f0(O,t))):void 0,b.shouldUseBlock&&(g=!0)}if(e.children.length>0)if(l===er&&(g=!0,d|=1024),i&&l!==Ri&&l!==er){const{slots:E,hasDynamicSlots:O}=c0(e,t);c=E,O&&(d|=1024)}else if(e.children.length===1&&l!==Ri){const E=e.children[0],O=E.type,y=O===5||O===8;y&&ys(E,t)===0&&(d|=1),y||O===2?c=E:c=e.children}else c=e.children;p&&p.length&&(u=h0(p)),e.codegenNode=Ki(t,l,o,c,d===0?void 0:d,u,f,!!g,!1,i,e.loc)};function u0(e,t,s=!1){let{tag:n}=e;const a=Ho(n),i=Nr(e,"is",!1,!0);if(i)if(a||ca("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Be(i.value.content,!0):(r=i.exp,r||(r=Be("is",!1,i.arg.loc))),r)return Nt(t.helper(Nc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Ch(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Oc),t.components.add(n),Zi(n,"component"))}function Kh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let f=!1,g=0,b=!1,E=!1,O=!1,y=!1,m=!1,x=!1;const S=[],v=D=>{c.length&&(d.push(Os(uu(c),r)),c=[]),D&&d.push(D)},k=()=>{t.scopes.vFor>0&&c.push(Et(Be("ref_for",!0),Be("true")))},T=({key:D,value:H})=>{if(hs(D)){const P=D.content,R=ha(P);if(R&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!bn(P)&&(y=!0),R&&bn(P)&&(x=!0),R&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ys(H,t)>0)return;P==="ref"?b=!0:P==="class"?E=!0:P==="style"?O=!0:P!=="key"&&!S.includes(P)&&S.push(P),n&&(P==="class"||P==="style")&&!S.includes(P)&&S.push(P)}else m=!0};for(let D=0;D<s.length;D++){const H=s[D];if(H.type===6){const{loc:P,name:R,nameLoc:V,value:X}=H;let U=!0;if(R==="ref"&&(b=!0,k()),R==="is"&&(Ho(l)||X&&X.content.startsWith("vue:")||ca("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Et(Be(R,!0,V),Be(X?X.content:"",U,X?X.loc:P)))}else{const{name:P,arg:R,exp:V,loc:X,modifiers:U}=H,N=P==="bind",I=P==="on";if(P==="slot"){n||t.onError(ft(40,X));continue}if(P==="once"||P==="memo"||P==="is"||N&&sa(R,"is")&&(Ho(l)||ca("COMPILER_IS_ON_ELEMENT",t))||I&&i)continue;if((N&&sa(R,"key")||I&&p&&sa(R,"vue:before-update"))&&(f=!0),N&&sa(R,"ref")&&k(),!R&&(N||I)){if(m=!0,V)if(N){if(v(),ca("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}k(),v(),d.push(V)}else v({type:14,loc:X,callee:t.helper(Uc),arguments:n?[V]:[V,"true"]});else t.onError(ft(N?34:35,X));continue}N&&U.some(Te=>Te.content==="prop")&&(g|=32);const W=t.directiveTransforms[P];if(W){const{props:Te,needRuntime:Ce}=W(H,e,t);!i&&Te.forEach(T),I&&R&&!hs(R)?v(Os(Te,r)):c.push(...Te),Ce&&(u.push(H),Jt(Ce)&&Gh.set(H,Ce))}else ag(P)||(u.push(H),p&&(f=!0))}}let C;if(d.length?(v(),d.length>1?C=Nt(t.helper(tr),d,r):C=d[0]):c.length&&(C=Os(uu(c),r)),m?g|=16:(E&&!n&&(g|=2),O&&!n&&(g|=4),S.length&&(g|=8),y&&(g|=32)),!f&&(g===0||g===32)&&(b||x||u.length>0)&&(g|=512),!t.inSSR&&C)switch(C.type){case 15:let D=-1,H=-1,P=!1;for(let X=0;X<C.properties.length;X++){const U=C.properties[X].key;hs(U)?U.content==="class"?D=X:U.content==="style"&&(H=X):U.isHandlerKey||(P=!0)}const R=C.properties[D],V=C.properties[H];P?C=Nt(t.helper(Gi),[C]):(R&&!hs(R.value)&&(R.value=Nt(t.helper(Fc),[R.value])),V&&(O||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=Nt(t.helper($c),[V.value])));break;case 14:break;default:C=Nt(t.helper(Gi),[Nt(t.helper(ll),[C])]);break}return{props:C,directives:u,patchFlag:g,dynamicPropNames:S,shouldUseBlock:f}}function uu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ha(i))&&p0(l,a):(t.set(i,a),s.push(a))}return s}function p0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=oa([e.value,t.value],e.loc)}function f0(e,t){const s=[],n=Gh.get(e);n?s.push(t.helperString(n)):(t.helper(Lc),t.directives.add(e.name),s.push(Zi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Be("true",!1,a);s.push(Os(e.modifiers.map(l=>Et(l,i)),a))}return oa(s,e.loc)}function h0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Ho(e){return e==="component"||e==="Component"}const m0=(e,t)=>{if(ir(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=g0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Ya([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Nt(t.helper(wh),l,n)}};function g0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=lt(l.name),a.push(l)));else if(l.name==="bind"&&sa(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=lt(l.arg.content);s=l.exp=Be(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&hs(l.arg)&&(l.arg.content=lt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Kh(e,t,a,!1,!1);n=i,l.length&&t.onError(ft(36,l[0].loc))}return{slotName:s,slotProps:n}}const Wh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ft(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Fa(lt(u)):`on:${u}`;r=Be(p,!0,l.loc)}else r=Hs([`${s.helperString(Po)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Po)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Rh(o),p=!(u||mx(o)),f=o.content.includes(";");(p||c&&u)&&(o=Hs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,o,f?"}":")"]))}let d={props:[Et(r,o||Be("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},v0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=lt(i.content):i.content=`${s.helperString(Do)}(${i.content})`:(i.children.unshift(`${s.helperString(Do)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&pu(i,"."),n.some(r=>r.content==="attr")&&pu(i,"^")),{props:[Et(i,l)]}},pu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},b0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Xr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Xr(o))n||(n=s[i]=Hs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Xr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ys(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Nt(t.helper(Ic),r)}}}}},fu=new WeakSet,y0=(e,t)=>{if(e.type===1&&Is(e,"once",!0))return fu.has(e)||t.inVOnce||t.inSSR?void 0:(fu.add(e),t.inVOnce=!0,t.helper(sr),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Zh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ft(41,e.loc)),fi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ft(44,n.loc)),fi();if(r==="literal-const"||r==="setup-const")return s.onError(ft(45,n.loc)),fi();if(!l.trim()||!Rh(n))return s.onError(ft(42,n.loc)),fi();const o=a||Be("modelValue",!0),c=a?hs(a)?`onUpdate:${lt(a.content)}`:Hs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Hs([`${u} => ((`,n,") = $event)"]);const p=[Et(o,e.exp),Et(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(b=>b.content).map(b=>(Vc(b)?b:JSON.stringify(b))+": true").join(", "),g=a?hs(a)?`${a.content}Modifiers`:Hs([a,' + "Modifiers"']):"modelModifiers";p.push(Et(g,Be(`{ ${f} }`,!1,e.loc,2)))}return fi(p)};function fi(e=[]){return{props:e}}const x0=/[\w).+\-_$\]]/,_0=(e,t)=>{ca("COMPILER_FILTERS",t)&&(e.type===5?rr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&rr(s.exp,t)}))};function rr(e,t){if(e.type===4)hu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?hu(n,t):n.type===8?rr(e,t):n.type===5&&rr(n.content,t))}}function hu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,f,g,b=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!r&&!o&&!c)g===void 0?(d=f+1,g=s.slice(0,f).trim()):E();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let O=f-1,y;for(;O>=0&&(y=s.charAt(O),y===" ");O--);(!y||!x0.test(y))&&(l=!0)}}g===void 0?g=s.slice(0,f).trim():d!==0&&E();function E(){b.push(s.slice(d,f).trim()),d=f+1}if(b.length){for(f=0;f<b.length;f++)g=w0(g,b[f],t);e.content=g,e.ast=void 0}}function w0(e,t,s){s.helper(Mc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Zi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Zi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const mu=new WeakSet,k0=(e,t)=>{if(e.type===1){const s=Is(e,"memo");return!s||mu.has(e)||t.inSSR?void 0:(mu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&zc(n,t),e.codegenNode=Nt(t.helper(Hc),[s.exp,Ya(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},S0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ft(53,n.loc)),s.exp=Be("",!0,n.loc);else{const a=lt(n.content);(Eh.test(a[0])||a[0]==="-")&&(s.exp=Be(a,!1,n.loc))}}}};function T0(e){return[[S0,y0,t0,k0,a0,_0,m0,d0,r0,b0],{on:Wh,bind:v0,model:Zh}]}function C0(e,t={}){const s=t.onError||jc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ft(48)):n&&s(ft(49));const a=!1;t.cacheHandlers&&s(ft(50)),t.scopeId&&!n&&s(ft(51));const i=Ve({},t,{prefixIdentifiers:a}),l=Fe(e)?Nx(e,i):e,[r,o]=T0();return Px(l,Ve({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Ve({},o,t.directiveTransforms||{})})),Bx(l,i)}const E0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Jh=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),zo=Symbol(""),em=Symbol(""),tm=Symbol(""),sm=Symbol(""),nm=Symbol(""),am=Symbol("");ax({[Jh]:"vModelRadio",[Yh]:"vModelCheckbox",[Qh]:"vModelText",[Xh]:"vModelSelect",[zo]:"vModelDynamic",[em]:"withModifiers",[tm]:"withKeys",[sm]:"vShow",[nm]:"Transition",[am]:"TransitionGroup"});let Ta;function A0(e,t=!1){return Ta||(Ta=document.createElement("div")),t?(Ta.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ta.children[0].getAttribute("foo")):(Ta.innerHTML=e,Ta.textContent)}const R0={parseMode:"html",isVoidTag:_g,isNativeTag:e=>bg(e)||yg(e)||xg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:A0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return nm;if(e==="TransitionGroup"||e==="transition-group")return am},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},I0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Be("style",!0,t.loc),exp:O0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},O0=(e,t)=>{const s=gp(e);return Be(JSON.stringify(s),!1,t,3)};function Bn(e,t){return ft(e,t)}const N0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Bn(54,a)),t.children.length&&(s.onError(Bn(55,a)),t.children.length=0),{props:[Et(Be("innerHTML",!0,a),n||Be("",!0))]}},L0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Bn(56,a)),t.children.length&&(s.onError(Bn(57,a)),t.children.length=0),{props:[Et(Be("textContent",!0),n?ys(n,s)>0?n:Nt(s.helperString(Or),[n],a):Be("",!0))]}},M0=(e,t,s)=>{const n=Zh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Bn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Qh,r=!1;if(a==="input"||i){const o=Nr(t,"type");if(o){if(o.type===7)l=zo;else if(o.value)switch(o.value.content){case"radio":l=Jh;break;case"checkbox":l=Yh;break;case"file":r=!0,s.onError(Bn(60,e.loc));break}}else gx(t)&&(l=zo)}else a==="select"&&(l=Xh);r||(n.needRuntime=s.helper(l))}else s.onError(Bn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},D0=_s("passive,once,capture"),P0=_s("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),F0=_s("left,right"),im=_s("onkeyup,onkeydown,onkeypress"),$0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Wi("COMPILER_V_ON_NATIVE",s)||D0(o)?l.push(o):F0(o)?hs(e)?im(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):P0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},gu=(e,t)=>hs(e)&&e.content.toLowerCase()==="onclick"?Be(t,!0):e.type!==4?Hs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,U0=(e,t,s)=>Wh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=$0(i,a,s,e.loc);if(o.includes("right")&&(i=gu(i,"onContextmenu")),o.includes("middle")&&(i=gu(i,"onMouseup")),o.length&&(l=Nt(s.helper(em),[l,JSON.stringify(o)])),r.length&&(!hs(i)||im(i.content.toLowerCase()))&&(l=Nt(s.helper(tm),[l,JSON.stringify(r)])),c.length){const d=c.map(ga).join("");i=hs(i)?Be(`${i.content}${d}`,!0):Hs(["(",i,`) + "${d}"`])}return{props:[Et(i,l)]}}),B0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Bn(62,a)),{props:[],needRuntime:s.helper(sm)}},H0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},z0=[I0],j0={cloak:E0,html:N0,text:L0,model:M0,on:U0,show:B0};function V0(e,t={}){return C0(e,Ve({},R0,t,{nodeTransforms:[H0,...z0,...t.nodeTransforms||[]],directiveTransforms:Ve({},j0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const vu=Object.create(null);function q0(e,t){if(!Fe(e))if(e.nodeType)e=e.innerHTML;else return zt;const s=rg(e,t),n=vu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Ve({hoistStatic:!0,onError:void 0,onWarn:zt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=V0(e,a),l=new Function("Vue",i)(Qy);return l._rc=!0,vu[s]=l}zf(q0);const or=zn({items:[]});let G0=1;function Dr(e,t="info",s=3e3){const n=G0++;return or.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Wc(n),s),n}function Wc(e){const t=or.items.findIndex(s=>s.id===e);t>=0&&or.items.splice(t,1)}function Re(e,t="info",s=3e3){return Dr(e,t,s)}Re.success=(e,t=3e3)=>Dr(e,"success",t);Re.error=(e,t=5e3)=>Dr(e,"error",t);Re.info=(e,t=3e3)=>Dr(e,"info",t);Re.dismiss=Wc;const K0={setup(){return{state:or,dismiss:Wc}},template:`
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
  `},pn=zn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ja=null;function Zt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ja&&ja(!1),pn.title=e,pn.message=t,pn.confirmLabel=s,pn.cancelLabel=n,pn.danger=a,pn.open=!0,new Promise(i=>{ja=i})}function bu(e){pn.open=!1,ja&&(ja(e),ja=null)}const W0={setup(){function e(t){pn.open&&t.key==="Escape"&&(t.stopPropagation(),bu(!1))}return Ze(()=>document.addEventListener("keydown",e,!0)),xt(()=>document.removeEventListener("keydown",e,!0)),{state:pn,settle:bu}},template:`
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
 */const Oa=typeof document<"u";function lm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Z0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&lm(e.default)}const nt=Object.assign;function to(e,t){const s={};for(const n in t){const a=t[n];s[n]=js(a)?a.map(e):e(a)}return s}const Ii=()=>{},js=Array.isArray;function yu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const rm=/#/g,J0=/&/g,Y0=/\//g,Q0=/=/g,X0=/\?/g,om=/\+/g,e_=/%5B/g,t_=/%5D/g,cm=/%5E/g,s_=/%60/g,dm=/%7B/g,n_=/%7C/g,um=/%7D/g,a_=/%20/g;function Zc(e){return e==null?"":encodeURI(""+e).replace(n_,"|").replace(e_,"[").replace(t_,"]")}function i_(e){return Zc(e).replace(dm,"{").replace(um,"}").replace(cm,"^")}function jo(e){return Zc(e).replace(om,"%2B").replace(a_,"+").replace(rm,"%23").replace(J0,"%26").replace(s_,"`").replace(dm,"{").replace(um,"}").replace(cm,"^")}function l_(e){return jo(e).replace(Q0,"%3D")}function r_(e){return Zc(e).replace(rm,"%23").replace(X0,"%3F")}function o_(e){return r_(e).replace(Y0,"%2F")}function Yi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const c_=/\/$/,d_=e=>e.replace(c_,"");function so(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=h_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Yi(l)}}function u_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function xu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function p_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ei(t.matched[n],s.matched[a])&&pm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ei(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function pm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!f_(e[s],t[s]))return!1;return!0}function f_(e,t){return js(e)?_u(e,t):js(t)?_u(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function _u(e,t){return js(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function h_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Nn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Vo=(function(e){return e.pop="pop",e.push="push",e})({}),no=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function m_(e){if(!e)if(Oa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),d_(e)}const g_=/^[^#]+#/;function v_(e,t){return e.replace(g_,"#")+t}function b_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Pr=()=>({left:window.scrollX,top:window.scrollY});function y_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=b_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function wu(e,t){return(history.state?history.state.position-t:-1)+e}const qo=new Map;function x_(e,t){qo.set(e,t)}function __(e){const t=qo.get(e);return qo.delete(e),t}function w_(e){return typeof e=="string"||e&&typeof e=="object"}function fm(e){return typeof e=="string"||typeof e=="symbol"}let bt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const hm=Symbol("");bt.MATCHER_NOT_FOUND+"",bt.NAVIGATION_GUARD_REDIRECT+"",bt.NAVIGATION_ABORTED+"",bt.NAVIGATION_CANCELLED+"",bt.NAVIGATION_DUPLICATED+"";function ti(e,t){return nt(new Error,{type:e,[hm]:!0},t)}function rn(e,t){return e instanceof Error&&hm in e&&(t==null||!!(e.type&t))}const k_=["params","query","hash"];function S_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of k_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function T_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(om," "),i=a.indexOf("="),l=Yi(i<0?a:a.slice(0,i)),r=i<0?null:Yi(a.slice(i+1));if(l in t){let o=t[l];js(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function ku(e){let t="";for(let s in e){const n=e[s];if(s=l_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(js(n)?n.map(a=>a&&jo(a)):[n&&jo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function C_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=js(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const E_=Symbol(""),Su=Symbol(""),Fr=Symbol(""),Jc=Symbol(""),Go=Symbol("");function hi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function $n(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(ti(bt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):w_(p)?o(ti(bt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function ao(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(lm(o)){const c=(o.__vccOpts||o)[t];c&&i.push($n(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=Z0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&$n(p,s,n,l,r,a)()}))}}return i}function A_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>ei(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>ei(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let R_=()=>location.protocol+"//"+location.host;function mm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),xu(r,"")}return xu(s,e)+n+a}function I_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const f=mm(e,location),g=s.value,b=t.value;let E=0;if(p){if(s.value=f,t.value=p,l&&l===g){l=null;return}E=b?p.position-b.position:0}else n(f);a.forEach(O=>{O(s.value,g,{delta:E,type:Vo.pop,direction:E?E>0?no.forward:no.back:no.unknown})})};function o(){l=s.value}function c(p){a.push(p);const f=()=>{const g=a.indexOf(p);g>-1&&a.splice(g,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(nt({},p.state,{scroll:Pr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function Tu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Pr():null}}function O_(e){const{history:t,location:s}=window,n={value:mm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:R_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(o,c){i(o,nt({},t.state,Tu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=nt({},a.value,t.state,{forward:o,scroll:Pr()});i(d.current,d,!0),i(o,nt({},Tu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function N_(e){e=m_(e);const t=O_(e),s=I_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=nt({location:"",base:e,go:n,createHref:v_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function L_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),N_(e)}let aa=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var It=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(It||{});const M_={type:aa.Static,value:""},D_=/[a-zA-Z0-9_]/;function P_(e){if(!e)return[[]];if(e==="/")return[[M_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=It.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===It.Static?i.push({type:aa.Static,value:c}):s===It.Param||s===It.ParamRegExp||s===It.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:aa.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==It.ParamRegExp){n=s,s=It.EscapeNext;continue}switch(s){case It.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=It.Param):p();break;case It.EscapeNext:p(),s=n;break;case It.Param:o==="("?s=It.ParamRegExp:D_.test(o)?p():(u(),s=It.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case It.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=It.ParamRegExpEnd:d+=o;break;case It.ParamRegExpEnd:u(),s=It.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===It.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Cu="[^/]+?",F_={sensitive:!1,strict:!1,start:!0,end:!0};var ts=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ts||{});const $_=/[.+*?^${}()[\]/\\]/g;function U_(e,t){const s=nt({},F_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ts.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ts.Segment+(s.sensitive?ts.BonusCaseSensitive:0);if(p.type===aa.Static)u||(a+="/"),a+=p.value.replace($_,"\\$&"),f+=ts.Static;else if(p.type===aa.Param){const{value:g,repeatable:b,optional:E,regexp:O}=p;i.push({name:g,repeatable:b,optional:E});const y=O||Cu;if(y!==Cu){f+=ts.BonusCustomRegExp;try{`${y}`}catch(x){throw new Error(`Invalid custom RegExp for param "${g}" (${y}): `+x.message)}}let m=b?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(m=E&&c.length<2?`(?:/${m})`:"/"+m),E&&(m+="?"),a+=m,f+=ts.Dynamic,E&&(f+=ts.BonusOptional),b&&(f+=ts.BonusRepeatable),y===".*"&&(f+=ts.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ts.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",g=i[p-1];u[g.name]=f&&g.repeatable?f.split("/"):f}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===aa.Static)d+=f.value;else if(f.type===aa.Param){const{value:g,repeatable:b,optional:E}=f,O=g in c?c[g]:"";if(js(O)&&!b)throw new Error(`Provided param "${g}" is an array but it is not repeatable (* or + modifiers)`);const y=js(O)?O.join("/"):O;if(!y)if(E)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${g}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function B_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ts.Static+ts.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ts.Static+ts.Segment?1:-1:0}function gm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=B_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Eu(n))return 1;if(Eu(a))return-1}return a.length-n.length}function Eu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const H_={strict:!1,end:!0,sensitive:!1};function z_(e,t,s){const n=U_(P_(e.path),s),a=nt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function j_(e,t){const s=[],n=new Map;t=yu(H_,t);function a(u){return n.get(u)}function i(u,p,f){const g=!f,b=Ru(u);b.aliasOf=f&&f.record;const E=yu(t,u),O=[b];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of x)O.push(Ru(nt({},b,{components:f?f.record.components:b.components,path:S,aliasOf:f?f.record:b})))}let y,m;for(const x of O){const{path:S}=x;if(p&&S[0]!=="/"){const v=p.record.path,k=v[v.length-1]==="/"?"":"/";x.path=p.record.path+(S&&k+S)}if(y=z_(x,p,E),f?f.alias.push(y):(m=m||y,m!==y&&m.alias.push(y),g&&u.name&&!Iu(y)&&l(u.name)),vm(y)&&o(y),b.children){const v=b.children;for(let k=0;k<v.length;k++)i(v[k],y,f&&f.children[k])}f=f||y}return m?()=>{l(m)}:Ii}function l(u){if(fm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=G_(u,s);s.splice(p,0,u),u.record.name&&!Iu(u)&&n.set(u.record.name,u)}function c(u,p){let f,g={},b,E;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw ti(bt.MATCHER_NOT_FOUND,{location:u});E=f.record.name,g=nt(Au(p.params,f.keys.filter(m=>!m.optional).concat(f.parent?f.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&Au(u.params,f.keys.map(m=>m.name))),b=f.stringify(g)}else if(u.path!=null)b=u.path,f=s.find(m=>m.re.test(b)),f&&(g=f.parse(b),E=f.record.name);else{if(f=p.name?n.get(p.name):s.find(m=>m.re.test(p.path)),!f)throw ti(bt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});E=f.record.name,g=nt({},p.params,u.params),b=f.stringify(g)}const O=[];let y=f;for(;y;)O.unshift(y.record),y=y.parent;return{name:E,path:b,params:g,matched:O,meta:q_(O)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Au(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Ru(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:V_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function V_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Iu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function q_(e){return e.reduce((t,s)=>nt(t,s.meta),{})}function G_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;gm(e,t[i])<0?n=i:s=i+1}const a=K_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function K_(e){let t=e;for(;t=t.parent;)if(vm(t)&&gm(e,t)===0)return t}function vm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Ou(e){const t=Ns(Fr),s=Ns(Jc),n=K(()=>{const o=en(e.to);return t.resolve(o)}),a=K(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ei.bind(null,d));if(p>-1)return p;const f=Nu(o[c-2]);return c>1&&Nu(d)===f&&u[u.length-1].path!==f?u.findIndex(ei.bind(null,o[c-2])):p}),i=K(()=>a.value>-1&&Q_(s.params,n.value.params)),l=K(()=>a.value>-1&&a.value===s.matched.length-1&&pm(s.params,n.value.params));function r(o={}){if(Y_(o)){const c=t[en(e.replace)?"replace":"push"](en(e.to)).catch(Ii);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:K(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function W_(e){return e.length===1?e[0]:e}const Z_=sl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Ou,setup(e,{slots:t}){const s=zn(Ou(e)),{options:n}=Ns(Fr),a=K(()=>({[Lu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Lu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&W_(t.default(s));return e.custom?i:Ka("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),J_=Z_;function Y_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Q_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!js(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Nu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Lu=(e,t,s)=>e??t??s,X_=sl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ns(Go),a=K(()=>e.route||n.value),i=Ns(Su,0),l=K(()=>{let c=en(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=K(()=>a.value.matched[l.value]);Ti(Su,K(()=>l.value+1)),Ti(E_,r),Ti(Go,a);const o=h();return as(()=>[o.value,r.value,e.name],([c,d,u],[p,f,g])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!ei(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(b=>b(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Mu(s.default,{Component:p,route:c});const f=u.props[d],g=f?f===!0?c.params:typeof f=="function"?f(c):f:null,E=Ka(p,nt({},g,t,{onVnodeUnmounted:O=>{O.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Mu(s.default,{Component:E,route:c})||E}}});function Mu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const ew=X_;function tw(e){const t=j_(e.routes,e),s=e.parseQuery||T_,n=e.stringifyQuery||ku,a=e.history,i=hi(),l=hi(),r=hi(),o=lc(Nn);let c=Nn;Oa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=to.bind(null,B=>""+B),u=to.bind(null,o_),p=to.bind(null,Yi);function f(B,ie){let le,_e;return fm(B)?(le=t.getRecordMatcher(B),_e=ie):_e=B,t.addRoute(_e,le)}function g(B){const ie=t.getRecordMatcher(B);ie&&t.removeRoute(ie)}function b(){return t.getRoutes().map(B=>B.record)}function E(B){return!!t.getRecordMatcher(B)}function O(B,ie){if(ie=nt({},ie||o.value),typeof B=="string"){const L=so(s,B,ie.path),$=t.resolve({path:L.path},ie),te=a.createHref(L.fullPath);return nt(L,$,{params:p($.params),hash:Yi(L.hash),redirectedFrom:void 0,href:te})}let le;if(B.path!=null)le=nt({},B,{path:so(s,B.path,ie.path).path});else{const L=nt({},B.params);for(const $ in L)L[$]==null&&delete L[$];le=nt({},B,{params:u(L)}),ie.params=u(ie.params)}const _e=t.resolve(le,ie),ye=B.hash||"";_e.params=d(p(_e.params));const $e=u_(n,nt({},B,{hash:i_(ye),path:_e.path})),w=a.createHref($e);return nt({fullPath:$e,hash:ye,query:n===ku?C_(B.query):B.query||{}},_e,{redirectedFrom:void 0,href:w})}function y(B){return typeof B=="string"?so(s,B,o.value.path):nt({},B)}function m(B,ie){if(c!==B)return ti(bt.NAVIGATION_CANCELLED,{from:ie,to:B})}function x(B){return k(B)}function S(B){return x(nt(y(B),{replace:!0}))}function v(B,ie){const le=B.matched[B.matched.length-1];if(le&&le.redirect){const{redirect:_e}=le;let ye=typeof _e=="function"?_e(B,ie):_e;return typeof ye=="string"&&(ye=ye.includes("?")||ye.includes("#")?ye=y(ye):{path:ye},ye.params={}),nt({query:B.query,hash:B.hash,params:ye.path!=null?{}:B.params},ye)}}function k(B,ie){const le=c=O(B),_e=o.value,ye=B.state,$e=B.force,w=B.replace===!0,L=v(le,_e);if(L)return k(nt(y(L),{state:typeof L=="object"?nt({},ye,L.state):ye,force:$e,replace:w}),ie||le);const $=le;$.redirectedFrom=ie;let te;return!$e&&p_(n,_e,le)&&(te=ti(bt.NAVIGATION_DUPLICATED,{to:$,from:_e}),Ce(_e,_e,!0,!1)),(te?Promise.resolve(te):D($,_e)).catch(Y=>rn(Y)?rn(Y,bt.NAVIGATION_GUARD_REDIRECT)?Y:Te(Y):I(Y,$,_e)).then(Y=>{if(Y){if(rn(Y,bt.NAVIGATION_GUARD_REDIRECT))return k(nt({replace:w},y(Y.to),{state:typeof Y.to=="object"?nt({},ye,Y.to.state):ye,force:$e}),ie||$)}else Y=P($,_e,!0,w,ye);return H($,_e,Y),Y})}function T(B,ie){const le=m(B,ie);return le?Promise.reject(le):Promise.resolve()}function C(B){const ie=ne.values().next().value;return ie&&typeof ie.runWithContext=="function"?ie.runWithContext(B):B()}function D(B,ie){let le;const[_e,ye,$e]=A_(B,ie);le=ao(_e.reverse(),"beforeRouteLeave",B,ie);for(const L of _e)L.leaveGuards.forEach($=>{le.push($n($,B,ie))});const w=T.bind(null,B,ie);return le.push(w),Z(le).then(()=>{le=[];for(const L of i.list())le.push($n(L,B,ie));return le.push(w),Z(le)}).then(()=>{le=ao(ye,"beforeRouteUpdate",B,ie);for(const L of ye)L.updateGuards.forEach($=>{le.push($n($,B,ie))});return le.push(w),Z(le)}).then(()=>{le=[];for(const L of $e)if(L.beforeEnter)if(js(L.beforeEnter))for(const $ of L.beforeEnter)le.push($n($,B,ie));else le.push($n(L.beforeEnter,B,ie));return le.push(w),Z(le)}).then(()=>(B.matched.forEach(L=>L.enterCallbacks={}),le=ao($e,"beforeRouteEnter",B,ie,C),le.push(w),Z(le))).then(()=>{le=[];for(const L of l.list())le.push($n(L,B,ie));return le.push(w),Z(le)}).catch(L=>rn(L,bt.NAVIGATION_CANCELLED)?L:Promise.reject(L))}function H(B,ie,le){r.list().forEach(_e=>C(()=>_e(B,ie,le)))}function P(B,ie,le,_e,ye){const $e=m(B,ie);if($e)return $e;const w=ie===Nn,L=Oa?history.state:{};le&&(_e||w?a.replace(B.fullPath,nt({scroll:w&&L&&L.scroll},ye)):a.push(B.fullPath,ye)),o.value=B,Ce(B,ie,le,w),Te()}let R;function V(){R||(R=a.listen((B,ie,le)=>{if(!be.listening)return;const _e=O(B),ye=v(_e,be.currentRoute.value);if(ye){k(nt(ye,{replace:!0,force:!0}),_e).catch(Ii);return}c=_e;const $e=o.value;Oa&&x_(wu($e.fullPath,le.delta),Pr()),D(_e,$e).catch(w=>rn(w,bt.NAVIGATION_ABORTED|bt.NAVIGATION_CANCELLED)?w:rn(w,bt.NAVIGATION_GUARD_REDIRECT)?(k(nt(y(w.to),{force:!0}),_e).then(L=>{rn(L,bt.NAVIGATION_ABORTED|bt.NAVIGATION_DUPLICATED)&&!le.delta&&le.type===Vo.pop&&a.go(-1,!1)}).catch(Ii),Promise.reject()):(le.delta&&a.go(-le.delta,!1),I(w,_e,$e))).then(w=>{w=w||P(_e,$e,!1),w&&(le.delta&&!rn(w,bt.NAVIGATION_CANCELLED)?a.go(-le.delta,!1):le.type===Vo.pop&&rn(w,bt.NAVIGATION_ABORTED|bt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(_e,$e,w)}).catch(Ii)}))}let X=hi(),U=hi(),N;function I(B,ie,le){Te(B);const _e=U.list();return _e.length?_e.forEach(ye=>ye(B,ie,le)):console.error(B),Promise.reject(B)}function W(){return N&&o.value!==Nn?Promise.resolve():new Promise((B,ie)=>{X.add([B,ie])})}function Te(B){return N||(N=!B,V(),X.list().forEach(([ie,le])=>B?le(B):ie()),X.reset()),B}function Ce(B,ie,le,_e){const{scrollBehavior:ye}=e;if(!Oa||!ye)return Promise.resolve();const $e=!le&&__(wu(B.fullPath,0))||(_e||!le)&&history.state&&history.state.scroll||null;return Ct().then(()=>ye(B,ie,$e)).then(w=>w&&y_(w)).catch(w=>I(w,B,ie))}const re=B=>a.go(B);let ve;const ne=new Set,be={currentRoute:o,listening:!0,addRoute:f,removeRoute:g,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:b,resolve:O,options:e,push:x,replace:S,go:re,back:()=>re(-1),forward:()=>re(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:U.add,isReady:W,install(B){B.component("RouterLink",J_),B.component("RouterView",ew),B.config.globalProperties.$router=be,Object.defineProperty(B.config.globalProperties,"$route",{enumerable:!0,get:()=>en(o)}),Oa&&!ve&&o.value===Nn&&(ve=!0,x(a.location).catch(_e=>{}));const ie={};for(const _e in Nn)Object.defineProperty(ie,_e,{get:()=>o.value[_e],enumerable:!0});B.provide(Fr,be),B.provide(Jc,ic(ie)),B.provide(Go,o);const le=B.unmount;ne.add(B),B.unmount=function(){ne.delete(B),ne.size<1&&(c=Nn,R&&R(),R=null,o.value=Nn,ve=!1,N=!1),le()}}};function Z(B){return B.reduce((ie,le)=>ie.then(()=>C(le)),Promise.resolve())}return be}function bm(){return Ns(Fr)}function sw(e){return Ns(Jc)}const $r={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=sw(),s=bm(),n=K({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=K(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=K(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});as(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},nw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var b,E,O,y,m;const f=p.payload||p,g=f.type||p.type;if(g==="tool_start"){const x=((b=f.metadata)==null?void 0:b.call_id)||null,S={callId:x,id:x||`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((E=f.metadata)==null?void 0:E.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(g==="tool_end"){const x=((O=f.metadata)==null?void 0:O.call_id)||null;let S=-1;if(x&&(S=e.value.findIndex(v=>v.callId===x&&v.status==="running")),S<0&&!x)for(let v=e.value.length-1;v>=0;v--){const k=e.value[v];if(k.tool===f.action&&k.status==="running"){S=v;break}}if(S>=0){const v=e.value[S];v.status=(y=f.metadata)!=null&&y.error?"error":"success",v.elapsed=((m=f.metadata)==null?void 0:m.elapsed_ms)||Date.now()-v.startTime,v.result=f.detail||"",v.fadingOut=!0,setTimeout(()=>{const k=e.value.indexOf(v);k>=0&&e.value.splice(k,1),t.value.unshift(v),t.value.length>n&&t.value.pop()},5e3)}return}if(g==="tool_stream"){const x=f.call_id||f.tool_name||"unknown";if(f.finished){const S={...s.value};delete S[x],s.value=S}else{const v=((s.value[x]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[x]:v.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let r=!1;function o(){r||(r=!0,je.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,je.off("events",a),i&&(clearInterval(i),i=null))}Ze(o),ws(o),ks(c),xt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Yc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ba(e){const t=Yc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function ym(e){const t=Yc(e);return t?t.toLocaleTimeString():"—"}function xm(e){const t=Yc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function aw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function si(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Qc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function _m(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Du(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function wm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function km(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Sm=Symbol("agent-detail-cancelled"),iw=15e3;function lw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((f,g)=>{o=f,c=g});function u(f,g){r||(r=!0,l!==null&&a(l),l=null,(f?o:c)(g))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return r||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Sm),i==null||i.abort()}}}function Tm({state:e,requestDetail:t,timeoutMs:s=iw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:f,coalesce:g}){if(!p)return Promise.resolve();if(g&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const b={agentId:p,cancel:null,promise:null};l=b,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=lw(O=>t(p,{signal:O}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return b.cancel=E.cancel,b.promise=(async()=>{let O=null,y=null;try{O=await E.promise}catch(m){y=m}O!==Sm&&(l!==b||e.detailId!==p||(l=null,!y&&(O===null||typeof O!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=O,e.detailError=null),e.detailLoading=!1))})(),b.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function rw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const ow={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=K(()=>e.value.filter(I=>I.status==="running").length),o=K(()=>e.value.filter(I=>I.status==="completed").length),c=K(()=>e.value.filter(I=>["failed","timeout","killed"].includes(I.status)).length),d=K(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=K(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(I=>["failed","timeout","killed"].includes(I.status)):e.value.filter(I=>I.status===i.value));function p(I){const W=Number(I.max_iterations)||0;return W<=0?0:Math.min(100,Math.round(I.iteration_count/W*100))}function f(I){return(Number(I.max_iterations)||0)>0}function g(I,W){return I?I==="N/A"?"N/A":W==="current_inheritance"?`inherit (currently ${I})`:I:"unknown"}function b(I){return g(I.display_model,I.display_model_source||I.display_source)}function E(I){return g(I.display_reasoning_effort,I.display_reasoning_effort_source||I.display_source)}function O(I){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[I]||""}const y=h(null),m=h(null),x=h(!1),S=h(null),v=h(""),T=Tm({state:{get detail(){return y.value},set detail(I){y.value=I},get detailId(){return m.value},set detailId(I){m.value=I},get detailLoading(){return x.value},set detailLoading(I){x.value=I},get detailError(){return S.value},set detailError(I){S.value=I}},requestDetail:(I,{signal:W})=>G.get(`/api/agents/${encodeURIComponent(I)}`,{signal:W})});async function C(I){v.value="",await T.open(I.id)}function D(){T.close(),v.value=""}async function H(){await T.refresh()}async function P(I,W){try{await navigator.clipboard.writeText(W||""),v.value=I,setTimeout(()=>{v.value===I&&(v.value="")},1500)}catch{Re.error("Copy failed")}}async function R(I=!1){I=I===!0,I||(t.value=!0);try{const W=await G.get("/api/agents");e.value=Array.isArray(W)?W:[],s.value=null}catch(W){I||(s.value=W.message)}I||(t.value=!1)}async function V(I){const W=e.value.find(Ce=>Ce.id===I);if(await Zt({title:"Kill agent",message:`Kill agent "${(W==null?void 0:W.label)||I}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=I;try{await G.del(`/api/agents/${encodeURIComponent(I)}`),Re.success("Agent killed"),await R()}catch(Ce){Re.error(Ce.message||"Failed to kill agent")}n.value=null}}const X=rw({isEnabled:()=>a.value&&l,refreshList:()=>R(!0),hasOpenDetail:()=>!!m.value,refreshDetail:H});function U(){X.start()}function N(){X.stop()}return as(a,()=>X.sync()),Ze(()=>{l=!0,R(),U()}),ws(()=>{l=!0,R(!0),U()}),ks(()=>{l=!1,N()}),xt(()=>{l=!1,N(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ba,formatDuration:si,progressPercent:p,hasProgress:f,displayModelText:b,displayEffortText:E,displaySourceLabel:O,detail:y,detailId:m,detailLoading:x,detailError:S,copied:v,openDetail:C,closeDetail:D,copyText:P,fetchAgents:R,killAgent:V,startAutoRefresh:U,stopAutoRefresh:N}}},cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let g=!1;const E=Tm({state:{get detail(){return c.value},set detail(N){c.value=N},get detailId(){return d.value},set detailId(N){d.value=N},get detailLoading(){return u.value},set detailLoading(N){u.value=N},get detailError(){return p.value},set detailError(N){p.value=N}},detailLabel:"Loop detail",requestDetail:(N,{signal:I})=>G.get(`/api/loops/${encodeURIComponent(N)}?limit=100`,{signal:I})});async function O(N){f.value="",await E.open(N.id)}function y(){E.close(),f.value=""}async function m(N,I){try{await navigator.clipboard.writeText(I||""),f.value=N,setTimeout(()=>{f.value===N&&(f.value="")},1500)}catch{Re.error("Copy failed")}}const x=K(()=>e.value.reduce((N,I)=>N+(I.iteration_count||0),0)),S=K(()=>e.value.filter(N=>N.status==="running").length);function v(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function k(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function T(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}async function C(N=!1){N=N===!0,N||(t.value=!0);try{const I=await G.get("/api/loops");e.value=Array.isArray(I)?I:[],s.value=null}catch(I){N||(s.value=I.message)}N||(t.value=!1)}async function D(){l.value=null;const N=a.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const I={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(I.stop_condition=N.stop_condition.trim()),i.value=!0;try{const W=await G.post("/api/loops",I);Re.success(`Loop started: ${W.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(W){l.value=W.message}i.value=!1}async function H(N){if(await Zt({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=N;try{await G.del(`/api/loops/${encodeURIComponent(N)}`),Re.success("Loop stopped"),await C()}catch(W){Re.error(W.message||"Failed to stop loop")}r.value=null}}async function P(N){o.value=N;try{await G.post(`/api/loops/${encodeURIComponent(N)}/restart`),Re.success("Loop restarted"),await C()}catch(I){Re.error(I.message||"Failed to restart loop")}o.value=null}function R(N){g&&N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&(C(!0),d.value&&E.refresh())}let V=null;function X(){V!==null&&clearInterval(V),V=null}function U(){X(),g&&(V=setInterval(()=>{C(!0),d.value&&E.refresh()},5e3))}return Ze(()=>{g=!0,C(),je.subscribe("events",R),U()}),ws(()=>{g=!0,C(!0),U()}),ks(()=>{g=!1,X()}),xt(()=>{g=!1,je.unsubscribe("events",R),X(),E.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:x,runningCount:S,statusDotClass:v,statusBadge:k,modeBadge:T,formatAge:xm,formatDuration:si,formatTs:ba,formatTokens:km,openDetail:O,closeDetail:y,copyText:m,fetchLoops:C,doCreate:D,doStop:H,doRestart:P}}},dw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=K(()=>e.value.filter(y=>y.status==="running").length),r=K(()=>e.value.filter(y=>y.status!=="running").length);function o(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(m){y||(s.value=m.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}as(n,y=>{y?u():p()});async function f(y){if(await Zt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await G.del(`/api/processes/${y}`),Re.success(`Process ${y} killed`),await d()}catch(x){Re.error(x.message||"Failed to kill process")}i.value=null}}function g(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let b=!1;function E(){b||(b=!0,d(),je.subscribe("events",g),u())}function O(){b&&(b=!1,je.unsubscribe("events",g),p())}return Ze(E),ws(E),ks(O),xt(O),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:si,fetchProcesses:d,doKill:f}}},uw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Pu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function pw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function fw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function hw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=uw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),g=[];for(const E of new Set([p,f])){const O=new Date(u+E*6e4);pw(O,c)===d&&(g.some(y=>y.getTime()===O.getTime())||g.push(O))}if(g.sort((E,O)=>E.getTime()-O.getTime()),g.length===0)return{state:"nonexistent",typed:t};if(g.length>1)return{state:"ambiguous",typed:t,options:g.map(E=>({instant:E,offset:fw(E),iso:E.toISOString()}))};const b=g[0];return{state:"ok",typed:t,instant:b,iso:b.toISOString()}}const mw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),r=h(null),o=K(()=>hw(a.value.run_at));as(()=>a.value.run_at,()=>{r.value=null});const c=K(()=>{var B;const Z=o.value;return Z.state==="ok"?Z.instant:Z.state==="ambiguous"&&r.value!==null&&((B=Z.options[r.value])==null?void 0:B.instant)||null}),d=K(()=>{const Z=c.value;return Z?`${Z.toLocaleString()} local — ${Z.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],g=h(null),b=h(null),E=h(null),O=h(null),y=h(null),m=h(null),x=h([]),S=h(!1),v=h("");let k=0;const T=K(()=>e.value.filter(Z=>Z.cron&&!Z.one_time).length),C=K(()=>e.value.filter(Z=>Z.one_time).length),D=K(()=>e.value.filter(Z=>Z.trigger).length),H=K(()=>e.value.filter(Z=>Z.paused).length),P=K(()=>e.value.filter(Z=>Z.consecutive_failures>0).length);function R(Z){if(!Z)return"-";const B=Date.now(),le=(new Date(Z).getTime()-B)/1e3;if(le<0)return"overdue";if(le<60)return"in < 1 min";if(le<3600)return`in ${Math.floor(le/60)} min`;if(le<86400){const ye=Math.floor(le/3600),$e=Math.floor(le%3600/60);return $e>0?`in ${ye}h ${$e}m`:`in ${ye}h`}const _e=Math.floor(le/86400);return`in ${_e} day${_e!==1?"s":""}`}function V(Z){return Z==null?"-":Z<1e3?`${Z}ms`:Z<6e4?`${(Z/1e3).toFixed(1)}s`:si(Z/1e3)}function X(Z=a.value.cron){a.value.cron=Z,Pu(a.value,"cron"),u.value=null}function U(Z=a.value.run_at){a.value.run_at=Z,Pu(a.value,"run_at"),u.value=null}async function N(){const Z=a.value.cron.trim();if(Z){p.value=!0;try{u.value=await G.post("/api/schedules/validate-cron",{expression:Z})}catch(B){u.value={valid:!1,error:B.message}}p.value=!1}}async function I(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(Z){s.value=Z.message}t.value=!1}async function W(Z){if(m.value===Z){m.value=null,x.value=[];return}m.value=Z,S.value=!0,x.value=[];const B=++k;try{const ie=await G.get(`/api/schedules/${encodeURIComponent(Z)}/history?limit=10`);if(B!==k||m.value!==Z)return;x.value=ie,v.value=""}catch(ie){if(B!==k||m.value!==Z)return;x.value=[],v.value=ie.message||"Failed to load execution history"}B===k&&(S.value=!1)}async function Te(){l.value=null;const Z=a.value;if(!Z.description.trim()){l.value="Description is required";return}if(!Z.channel_id.trim()){l.value="Channel ID is required";return}if(!Z.cron.trim()&&!Z.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(Z.cron.trim()&&Z.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const B={description:Z.description.trim(),action:Z.action,channel_id:Z.channel_id.trim()};if(Z.cron.trim()&&(B.cron=Z.cron.trim()),Z.run_at.trim()){const ie=o.value;if(ie.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ie.state==="invalid"){l.value="One-time run time is not a valid date";return}const le=c.value;if(ie.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!le){l.value="One-time run time could not be resolved";return}B.run_at=le.toISOString()}if(Z.action==="reminder"&&Z.message.trim()&&(B.message=Z.message.trim()),Z.action==="check"&&(Z.tool_name.trim()&&(B.tool_name=Z.tool_name.trim()),Z.report_format&&(B.report_format=Z.report_format),Z.tool_input_str.trim()))try{B.tool_input=JSON.parse(Z.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",B),Re.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await I()}catch(ie){l.value=ie.message}i.value=!1}async function Ce(Z){g.value=Z;try{const B=await G.post(`/api/schedules/${encodeURIComponent(Z)}/run`);if(B.status==="failure")Re.error(`Execution failed: ${B.error||"unknown error"}`);else{const ie=B.warning?`Executed (${B.warning})`:"Executed successfully";Re.success(ie)}await I()}catch(B){Re.error(B.message||"Failed to trigger")}g.value=null}async function re(Z){E.value=Z.id;const B=!Z.paused;try{await G.put(`/api/schedules/${encodeURIComponent(Z.id)}`,{paused:B}),Re.success(B?"Schedule paused":"Schedule resumed"),await I()}catch(ie){Re.error(ie.message||"Failed to update schedule")}E.value=null}async function ve(Z,B){y.value=Z.id;try{await G.put(`/api/schedules/${encodeURIComponent(Z.id)}`,{report_format:B}),Re.success(B?"Structured report enabled":"Plain-text report enabled")}catch(ie){Re.error(`Update failed: ${ie.message}`)}finally{await I(),y.value=null}}async function ne(Z){O.value=Z;try{await G.post(`/api/schedules/${encodeURIComponent(Z)}/reset-failures`),Re.success("Failure counters reset"),await I()}catch(B){Re.error(B.message||"Failed to reset")}O.value=null}async function be(Z){const B=e.value.find(le=>le.id===Z);if(await Zt({title:"Delete schedule",message:`Delete "${(B==null?void 0:B.description)||Z}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){b.value=Z;try{await G.del(`/api/schedules/${encodeURIComponent(Z)}`),Re.success("Schedule deleted"),await I()}catch(le){Re.error(le.message||"Failed to delete schedule")}b.value=null}}return Ze(()=>{I()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:f,runningId:g,deletingId:b,togglingId:E,resettingId:O,reportUpdatingId:y,expandedId:m,history:x,historyLoading:S,historyError:v,cronCount:T,oneTimeCount:C,webhookCount:D,pausedCount:H,failingCount:P,formatTs:ba,formatAge:xm,formatFuture:R,formatMs:V,formatDuration:si,onCronInput:X,onRunAtInput:U,validateCron:N,toggleExpand:W,fetchSchedules:I,doCreate:Te,doRunNow:Ce,doTogglePause:re,doUpdateReportFormat:ve,doResetFailures:ne,doDelete:be}}},Cm=[{id:"live",label:"Live",component:nw},{id:"agents",label:"Agents",component:ow},{id:"loops",label:"Loops",component:cw},{id:"processes",label:"Processes",component:dw},{id:"schedules",label:"Schedules",component:mw}],gw={components:{TabbedPage:$r},setup(){return{tabs:Cm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},vw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await G.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ze(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ba,formatDetail:i,truncateBlock:_m,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Fu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],bw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),g=h(!1),b=Fu,E=bw,O=h([]),y=h(!1),m=h(""),x=h("flat"),S=h(new Set),v=h(""),k=h(""),T=h(""),C=h(null),D=h(!1);function H(){try{const J=localStorage.getItem("odin-session-presets");J&&(O.value=JSON.parse(J))}catch{}}function P(){try{localStorage.setItem("odin-session-presets",JSON.stringify(O.value))}catch{}}const R=K(()=>p.value.trim()!==""||u.value!=="all"),V=K(()=>{let J=[...e.value];const Se=Fu.find(Ue=>Ue.id===u.value),Ie=Se?Se.filters:{};if(Ie.source&&(J=J.filter(Ue=>Ue.source===Ie.source)),Ie.minMessages&&(J=J.filter(Ue=>Ue.message_count>=Ie.minMessages)),Ie.hasCompaction&&(J=J.filter(Ue=>Ue.has_summary)),Ie.maxAge!=null){const Ue=Date.now()/1e3;J=J.filter(mt=>mt.last_active&&Ue-mt.last_active<=Ie.maxAge)}if(p.value.trim()){const Ue=p.value.toLowerCase().trim();J=J.filter(mt=>(mt.channel_id||"").toLowerCase().includes(Ue)||(mt.last_user_id||"").toLowerCase().includes(Ue)||(mt.source||"").toLowerCase().includes(Ue))}const Me=f.value,Ge=g.value?1:-1;return J.sort((Ue,mt)=>{const Yt=Ue[Me]||0,Ds=mt[Me]||0;return(Yt-Ds)*Ge}),J}),X=K(()=>{if(!a.value||!a.value.messages)return[];const J=a.value.messages;if(J.length===0)return[];const Se=[];let Ie=[];for(const Me of J)Me.role==="user"&&Ie.length>0&&(Se.push(Ie),Ie=[]),Ie.push(Me);return Ie.length>0&&Se.push(Ie),Se}),U=K(()=>V.value.length>0&&c.value.size===V.value.length);function N(J){const Se=J.find(Ie=>Ie.role==="user");if(Se&&Se.content){const Ie=Se.content.slice(0,120);return Ie.length<Se.content.length?Ie+"...":Ie}return"(no user message)"}function I(J){const Se=new Set(S.value);Se.has(J)?Se.delete(J):Se.add(J),S.value=Se}function W(J){u.value=J}function Te(J){u.value=J.id,J.filters.searchQuery!=null&&(p.value=J.filters.searchQuery),J.filters.sortBy&&(f.value=J.filters.sortBy)}function Ce(){if(!m.value.trim())return;const J={id:"custom-"+Date.now(),name:m.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};O.value=[...O.value,J],P(),y.value=!1,m.value=""}function re(J){O.value=O.value.filter(Se=>Se.id!==J),P(),u.value===J&&(u.value="all")}function ve(){u.value="all",p.value="",f.value="last_active",g.value=!1}function ne(J){if(!J)return"—";const Se=Date.now()/1e3-J;if(Se<60)return"just now";if(Se<3600){const Me=Math.floor(Se/60);return`${Me} minute${Me!==1?"s":""} ago`}if(Se<86400){const Me=Math.floor(Se/3600);return`${Me} hour${Me!==1?"s":""} ago`}const Ie=Math.floor(Se/86400);return`${Ie} day${Ie!==1?"s":""} ago`}function be(J){if(!J)return"";try{return new Date(J*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Z(J){if(!J)return"";try{return new Date(J*1e3).toLocaleString()}catch{return""}}function B(J){return J==="user"?"bg-gray-900/50 border border-gray-800":J==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ie(J){return J==="user"?"sess-msg-user":J==="assistant"?"sess-msg-assistant":"sess-msg-system"}function le(J){return J==="user"?"badge-info":J==="assistant"?"badge-success":"badge-warning"}function _e(J){return J==="user"?"sess-dot-user":J==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ye(J){return J==="user"?"text-cyan-400":J==="assistant"?"text-indigo-400":"text-gray-500"}function $e(J){return J?J.length>2e3?J.slice(0,2e3)+`
... (truncated)`:J:""}async function w(){const J=v.value.trim();if(J){D.value=!0;try{let Se=`/api/sessions/search?q=${encodeURIComponent(J)}&limit=50`;k.value.trim()&&(Se+=`&channel_id=${encodeURIComponent(k.value.trim())}`),T.value.trim()&&(Se+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ie=await G.get(Se);C.value=Ie.results||[]}catch{C.value=[]}D.value=!1}}function L(){v.value="",k.value="",T.value="",C.value=null}function $(J){return J?J.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function te(J){return J==="user"?"fts-result-user":J==="assistant"?"fts-result-assistant":J==="summary"?"fts-result-summary":J==="fts"?"fts-result-fts":J==="channel"?"fts-result-channel":"fts-result-default"}function Y(J){return J==="user"?"badge-info":J==="assistant"?"badge-success":J==="summary"?"badge-warning":J==="fts"?"badge-success":"badge-info"}async function ee(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(J){s.value=J.message}t.value=!1}function he(){s.value=null,ee()}async function de(J){if(n.value===J){n.value=null,a.value=null,S.value=new Set;return}n.value=J,a.value=null,i.value=!0,S.value=new Set;const Se=++l;try{const Ie=await G.get(`/api/sessions/${encodeURIComponent(J)}`);Se===l&&n.value===J&&(a.value=Ie)}catch(Ie){Se===l&&n.value===J&&(a.value={messages:[],summary:"",error:Ie.message||"Failed to load session"})}finally{Se===l&&(i.value=!1)}}function oe(J){const Se=new Set(c.value);Se.has(J)?Se.delete(J):Se.add(J),c.value=Se}function se(){U.value?c.value=new Set:c.value=new Set(V.value.map(J=>J.channel_id))}function ae(J){r.value=J}async function me(){if(r.value){o.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await ee()}catch(J){s.value=J.message||"Failed to clear session"}o.value=!1,r.value=null}}function F(){d.value=!0}async function ce(){if(c.value.size!==0){o.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await ee()}catch(J){s.value=J.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function xe(J,Se){const Ie=`/api/sessions/${encodeURIComponent(J)}/export?format=${Se}`;try{const Me=await G.getBlob(Ie),Ge=URL.createObjectURL(Me),Ue=document.createElement("a");Ue.href=Ge,Ue.download=`session-${J}.${Se==="text"?"txt":"json"}`,Ue.click(),URL.revokeObjectURL(Ge)}catch(Me){s.value=Me.message||"Failed to export session"}}let Ae=null;function Oe(J){J.payload&&J.payload.channel_id&&(clearTimeout(Ae),Ae=setTimeout(()=>{if(ee(),n.value&&J.payload.channel_id===n.value){const Se=n.value,Ie=l;G.get(`/api/sessions/${encodeURIComponent(Se)}`).then(Me=>{Ie!==l||n.value!==Se||(a.value=Me)}).catch(()=>{})}},2e3))}let ze=!1;function qe(){ze||(ze=!0,ee(),je.subscribe("events",Oe))}Ze(()=>{H(),qe()}),ws(()=>{qe()});function dt(){ze&&(ze=!1,je.unsubscribe("events",Oe),clearTimeout(Ae))}return ks(dt),xt(dt),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:g,filterPresets:b,sortOptions:E,filteredSessions:V,hasActiveFilters:R,customPresets:O,showSavePreset:y,newPresetName:m,threadView:x,threads:X,collapsedThreads:S,ftsQuery:v,ftsChannelId:k,ftsUserId:T,ftsResults:C,ftsSearching:D,formatAge:ne,formatTimestamp:be,formatFullTimestamp:Z,messageClass:B,threadMsgClass:ie,roleBadge:le,roleDotClass:_e,roleLabelClass:ye,truncateContent:$e,threadSummary:N,fetchSessions:ee,retry:he,toggleSession:de,toggleSelect:oe,toggleSelectAll:se,confirmClear:ae,clearSession:me,confirmBulkClear:F,doBulkClear:ce,exportSession:xe,applyPreset:W,applyCustomPreset:Te,saveCustomPreset:Ce,removeCustomPreset:re,resetFilters:ve,toggleThread:I,runFtsSearch:w,clearFtsSearch:L,highlightSnippet:$,ftsResultClass:te,ftsTypeBadge:Y}}},xw={props:["trace"],template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(k){if(!k)return"—";try{const T=new Date(k);return isNaN(T.getTime())?k:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function p(k){return!k&&k!==0?"—":k<1e3?k+"ms":(k/1e3).toFixed(1)+"s"}function f(k){return!k&&k!==0?"—":k>=1e3?(k/1e3).toFixed(1)+"k":String(k)}function g(k){if(!k)return"";if(typeof k=="string")return k;try{return JSON.stringify(k,null,2)}catch{return String(k)}}function b(k){a.value===k?a.value=null:(a.value=k,c.value={})}function E(k,T){const C=k+"-"+T;c.value={...c.value,[C]:!c.value[C]}}function O(k,T){return!!c.value[k+"-"+T]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function m(){try{const k=await G.get("/api/trajectories");e.value=k.files||[],o.value=k.count||0}catch{}}let x=0;async function S(){const k=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await G.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(k!==x)return;let C=T.entries||[];d.value.tool_name&&(C=C.filter(D=>(D.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(D=>D.is_error)),d.value.channel_id&&(C=C.filter(D=>D.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(D=>D.user_id===d.value.user_id)),t.value=C}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const C=T.toString(),D=await G.get(`/api/trajectories/search/query?${C}`);if(k!==x)return;t.value=D.results||[]}}catch(T){if(k!==x)return;n.value=T.message}k===x&&(s.value=!1)}async function v(){if(!l.value.trim())return;const k=++x;s.value=!0,n.value=null,c.value={};try{const T=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(k!==x)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(k!==x)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}k===x&&(s.value=!1)}return Ze(async()=>{await m(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:g,truncateBlock:_m,toggleExpand:b,toggleIteration:E,isIterationExpanded:O,clearFilters:y,fetchFiles:m,fetchTraces:S,lookupMessage:v}}},ww={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=K(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const g=await G.get("/api/usage");n.value=g,a.value=g.totals||a.value,t.value=null,s.value=!0}catch(g){t.value=g.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function f(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ze(p),ws(p),ks(f),xt(f),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:wm,formatTime:ym,retry:d}}},Em=[{id:"audit",label:"Audit",component:vw},{id:"sessions",label:"Sessions",component:yw},{id:"traces",label:"Traces",component:_w},{id:"usage",label:"Usage",component:ww}],kw={components:{TabbedPage:$r},setup(){return{tabs:Em}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},io=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Sw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=K(()=>e.value.filter(y=>y.is_core).length),c=K(()=>e.value.filter(y=>!y.is_core).length),d=K(()=>Object.values(a.value).reduce((y,m)=>y+m,0));function u(y){for(const m of io)if(m.id!=="other"&&m.match(y))return m.id;return"other"}const p=K(()=>{let y=e.value;if(n.value){const m=n.value.toLowerCase();y=y.filter(x=>x.name.toLowerCase().includes(m)||(x.description||"").toLowerCase().includes(m))}return r.value&&(y=y.filter(m=>u(m.name)===r.value)),y}),f=K(()=>{const y=new Set;for(const m of e.value)y.add(u(m.name));return io.filter(m=>y.has(m.id))}),g=K(()=>{const y=p.value,m={};for(const S of y){const v=u(S.name);m[v]||(m[v]=[]),m[v].push(S)}const x=[];for(const S of io)m[S.id]&&m[S.id].length>0&&x.push({label:S.label,icon:S.icon,tools:m[S.id].sort((v,k)=>v.name.localeCompare(k.name))});return x});function b(y){i.value={...i.value,[y]:!i.value[y]}}async function E(){t.value=!0,s.value=null;try{const[y,m]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=m||{};const x=Object.values(m||{}).filter(S=>S>0).sort((S,v)=>S-v)}catch(y){s.value=y.message}t.value=!1}function O(){E()}return Ze(()=>{E()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:p,groupedTools:g,usedCategories:f,truncate:Qc,toggleExpand:b,refresh:O}}};function Tw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Cw(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),g=h(!1),b=h(null),E=h(null),O=h(!1),y=K(()=>e.value.length),m=K(()=>e.value.reduce((ne,be)=>ne+(be.execution_count||0),0)),x=K(()=>e.value.reduce((ne,be)=>ne+D(be.code),0)),S=K(()=>{if(!l.value)return e.value;const ne=l.value.toLowerCase();return e.value.filter(be=>be.name.toLowerCase().includes(ne)||(be.description||"").toLowerCase().includes(ne))}),v=K(()=>u.value?u.value.split(`
`).length:0),k=K(()=>{const ne=Math.max(v.value,1);return Array.from({length:ne},(be,Z)=>Z+1).join(`
`)}),T=K(()=>{const ne=u.value.trim();return ne?ne.includes("SKILL_DEFINITION")?ne.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(ne){return Tw(ne)}function D(ne){return ne?ne.split(`
`).length:0}function H(ne){return Cw(ne)}function P(ne){n.value={...n.value,[ne]:!n.value[ne]}}async function R(ne){try{await navigator.clipboard.writeText(ne);const be=e.value.find(Z=>Z.code===ne);be&&(r.value=be.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function V(ne){if(ne.key==="Tab"){ne.preventDefault();const be=ne.target,Z=be.selectionStart,B=be.selectionEnd;u.value=u.value.substring(0,Z)+"    "+u.value.substring(B),Ct(()=>{be.selectionStart=be.selectionEnd=Z+4})}}function X(ne){const be=ne.target.previousElementSibling;be&&(be.scrollTop=ne.target.scrollTop)}async function U(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(ne){s.value=ne.message}t.value=!1}async function N(ne){i.value=ne,delete a.value[ne],a.value={...a.value};try{const be=await G.post(`/api/skills/${encodeURIComponent(ne)}/test`);a.value={...a.value,[ne]:be}}catch(be){a.value={...a.value,[ne]:{result:be.message,is_error:!0}}}i.value=null}function I(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function W(ne){o.value=!0,c.value="edit",d.value=ne.name,u.value=ne.code||"",p.value=null,f.value=null}function Te(){o.value=!1,p.value=null,f.value=null}async function Ce(){p.value=null,f.value=null;const ne=d.value.trim(),be=u.value.trim();if(!ne){p.value="Name is required";return}if(!be){p.value="Code is required";return}g.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:ne,code:be}),f.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(ne)}`,{code:be}),f.value="Skill updated successfully"),await U(),setTimeout(()=>{o.value=!1},800)}catch(Z){p.value=Z.message}g.value=!1}function re(ne){E.value=ne}async function ve(){if(E.value){O.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(E.value)}`),await U()}catch(ne){Re.error(`Failed to delete skill: ${ne.message||"unknown error"}`)}O.value=!1,E.value=null}}return Ze(()=>{U()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:g,editorRef:b,deleteTarget:E,deleting:O,enabledCount:y,totalExecutions:m,totalLines:x,displayedSkills:S,editLineCount:v,editorLineNums:k,editValidation:T,highlight:C,truncate:Qc,formatTs:ba,countLines:D,getLineNumbers:H,toggleCode:P,copyCode:R,handleEditorKey:V,syncScroll:X,fetchSkills:U,testSkill:N,showCreate:I,editSkill:W,cancelEdit:Te,saveSkill:Ce,confirmDelete:re,doDelete:ve}}};class Rs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Aw=/^[A-Za-z_][A-Za-z0-9_]*$/;function $u(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Uu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const r=String((l==null?void 0:l.key)||"").trim(),o=String((l==null?void 0:l.value)??"");if(!(!r&&!o)){if(!r)throw new Rs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(r))throw new Rs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,r))throw new Rs(`${s} key “${r}” appears more than once.`,"authentication");if(i.has(r))throw new Rs(`${s} key “${r}” cannot be replaced and removed in the same save.`,"authentication");n[r]=o}}return{set:n,remove:a}}function Rw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Iw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Rs("Server name is required.","name");if(a.length>128||!Aw.test(a))throw new Rs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,r={enabled:!!e.enabled,transport:i};if(n&&(r.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Rs("An executable path is required for a new stdio connection.","command");if(d&&(r.command=d),(n||e.replaceArgs)&&(r.args=$u(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Rs("Working directory must be an absolute path.","cwd");r.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Rs("An HTTP endpoint is required for this connection.","url");if(d&&!Rw(d))throw new Rs("Endpoint must be a valid http:// or https:// URL.","url");d&&(r.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Rs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");r.timeout_seconds=d}(n||e.replaceAllowlist)&&(r.tool_allowlist=$u(e.allowlistText));const o=Uu(e.headerRows,e.headersRemove,"Header"),c=Uu(e.envRows,e.envRemove,"Environment variable");return Object.keys(o.set).length&&(r.headers_set=o.set),o.remove.length&&(r.headers_remove=o.remove),Object.keys(c.set).length&&(r.env_set=c.set),c.remove.length&&(r.env_remove=c.remove),r}function Ow(e,t){return t?e.transport!==t||!!String(e.command||"").trim()||!!String(e.url||"").trim()||!!e.replaceArgs||!!e.replaceCwd:!1}function Nw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Lw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Mw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Dw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Pw=1e4,Fw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function lo(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function $w(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Uw={template:`
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

          <article v-for="server in servers" :key="server.name" :class="['mcp-server-card', 'state-' + serverState(server)]">
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),r=h({}),o=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),g=h(lo()),b=h(""),E=h(!1);let O=null,y=0,m=!1,x=!1;const S=Mw,v=K(()=>{var F;return((F=e.value)==null?void 0:F.servers)||[]}),k=K(()=>{var F;return!!((F=e.value)!=null&&F.enabled)}),T=K(()=>{var F,ce,xe,Ae;return{serverCount:((F=e.value)==null?void 0:F.server_count)||0,enabledCount:((ce=e.value)==null?void 0:ce.enabled_server_count)||0,connectedCount:((xe=e.value)==null?void 0:xe.connected_count)||0,toolCount:((Ae=e.value)==null?void 0:Ae.published_tool_count)||0}}),C=K(()=>{var F;return((F=f.value)==null?void 0:F.header_keys)||[]}),D=K(()=>{var F;return((F=f.value)==null?void 0:F.env_keys)||[]}),H=K(()=>{var F;return u.value==="edit"&&((F=f.value)==null?void 0:F.transport)==="http"}),P=K(()=>u.value==="add"||!H.value),R=K(()=>H.value?"Replace endpoint URL":"Endpoint URL"),V=K(()=>H.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function X(){U(),O=window.setInterval(()=>N({quiet:!0}),Pw)}function U(){O&&window.clearInterval(O),O=null}async function N({quiet:F=!1}={}){const ce=++y;F||(t.value=!0);try{const xe=await G.get("/api/mcp/status");if(ce!==y||!m)return;e.value=xe,n.value="";const Ae=new Set((xe.servers||[]).map(Oe=>Oe.name));i.value=new Set([...i.value].filter(Oe=>Ae.has(Oe)))}catch(xe){ce===y&&m&&(n.value=xe.message||"Failed to load MCP status")}finally{ce===y&&(t.value=!1)}}function I(F){return s.value||a.value.has(F)}function W(F,ce){const xe=new Set(a.value);ce?xe.add(F):xe.delete(F),a.value=xe}function Te(F){return Nw(F.state)}function Ce(F){return Fw[Te(F)]}function re(F){return F.transport==="http"?"Streamable HTTP":"stdio"}function ve(F){return F.negotiated_version?`${F.era?`${String(F.era).charAt(0).toUpperCase()}${String(F.era).slice(1)}`:"Protocol"} · ${F.negotiated_version}`:"Not negotiated"}function ne(F){return F.discovered_count?`${F.published_count||0} published · ${F.excluded_count||0} excluded`:"No tools discovered"}async function be(F){if(F!==k.value&&!(!F&&!await Zt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await G.post("/api/mcp/enabled",{enabled:F}),Re.success(F?"MCP enabled":"MCP disabled"),await N({quiet:!0})}catch(ce){Re.error(ce.message||"Failed to update MCP state"),await N({quiet:!0})}finally{s.value=!1}}}async function Z(F){W(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/reconnect`,{}),Re.success(`Reconnected ${F.name}`)}catch(ce){Re.error(ce.message||`Failed to reconnect ${F.name}`)}finally{W(F.name,!1),await N({quiet:!0})}}async function B(F){W(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/refresh-tools`,{}),Re.success(`Refreshed tools from ${F.name}`),await _e(F.name,!0)}catch(ce){Re.error(ce.message||`Failed to refresh ${F.name}`)}finally{W(F.name,!1),await N({quiet:!0})}}async function ie(F){if(await Zt({title:`Remove ${F.name}`,message:`Remove this saved MCP server? Its ${F.published_count||0} published tool${F.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){W(F.name,!0);try{await G.del(`/api/mcp/servers/${encodeURIComponent(F.name)}`),Re.success(`Removed ${F.name}`),delete r.value[F.name]}catch(xe){Re.error(xe.message||`Failed to remove ${F.name}`)}finally{W(F.name,!1),await N({quiet:!0})}}}async function le(F){const ce=new Set(i.value);if(ce.has(F.name)){ce.delete(F.name),i.value=ce;return}ce.add(F.name),i.value=ce,Object.hasOwn(r.value,F.name)||await _e(F.name)}async function _e(F,ce=!1){if(!ce&&Object.hasOwn(r.value,F))return;const xe=new Set(c.value);xe.add(F),c.value=xe,o.value={...o.value,[F]:""};try{const Ae=await G.get(`/api/mcp/servers/${encodeURIComponent(F)}/tools`);r.value={...r.value,[F]:Ae.tools||[]}}catch(Ae){o.value={...o.value,[F]:Ae.message||"Failed to load tools"}}finally{const Ae=new Set(c.value);Ae.delete(F),c.value=Ae}}function ye(F){return(r.value[F]||[]).filter(ce=>Lw(ce,l.value[F]))}function $e(F,ce){l.value={...l.value,[F]:ce}}function w(){u.value="add",p.value="",f.value=null,g.value=lo(),b.value="",d.value=!0}function L(F){u.value="edit",p.value=F.name,f.value=F,g.value={...lo(),name:F.name,enabled:!!F.enabled,transport:F.transport||"stdio"},b.value="",d.value=!0}function $(){E.value||(d.value=!1)}function te(F){d.value&&Dw(F)}function Y(F){const ce=F==="headers"?"headerRows":"envRows";g.value[ce].push({key:"",value:""})}function ee(F,ce){const xe=F==="headers"?"headerRows":"envRows";g.value[xe].splice(ce,1)}function he(F,ce){const xe=F==="headers"?"headersRemove":"envRemove",Ae=g.value[xe];g.value[xe]=Ae.includes(ce)?Ae.filter(Oe=>Oe!==ce):[...Ae,ce]}async function de(){var ce,xe,Ae;b.value="";let F;try{F=Iw(g.value,{mode:u.value,originalTransport:((ce=f.value)==null?void 0:ce.transport)||""})}catch(Oe){b.value=Oe instanceof Rs?Oe.message:"Invalid MCP server configuration",await Ct(),(xe=document.querySelector(".mcp-editor"))==null||xe.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Ow(g.value,(Ae=f.value)==null?void 0:Ae.transport)&&!await Zt({title:`Change ${p.value} connection`,message:"This edit changes the command, endpoint, transport, arguments, or working directory. The current MCP connection will be retired and rebuilt, and its tools will be unpublished during the transition.",confirmLabel:"Save and reconnect",danger:!0}))){E.value=!0;try{u.value==="add"?await G.post("/api/mcp/servers",F):await G.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,F),Re.success(u.value==="add"?`Saved ${F.name}`:`Updated ${p.value}`),d.value=!1,await N({quiet:!0})}catch(Oe){b.value=Oe.message||"Failed to save MCP server"}finally{E.value=!1}}}let oe=null;function se(F){`${(F==null?void 0:F.event)||""} ${(F==null?void 0:F.type)||""} ${(F==null?void 0:F.tool)||""} ${(F==null?void 0:F.message)||""}`.toLowerCase().includes("mcp")&&(oe&&window.clearTimeout(oe),oe=window.setTimeout(()=>N({quiet:!0}),200))}function ae(){m||(m=!0,x||(je.subscribe("events",se),x=!0),N(),X())}function me(){m=!1,U(),oe&&window.clearTimeout(oe),oe=null,x&&(je.unsubscribe("events",se),x=!1)}return Ze(ae),ws(ae),ks(me),xt(me),{status:e,loading:t,mutating:s,pageError:n,servers:v,masterEnabled:k,aggregate:T,expandedServers:i,toolQueries:l,toolErrors:o,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,form:g,formError:b,saving:E,editorGroups:S,configuredHeaderKeys:C,configuredEnvKeys:D,savedHttpEndpoint:H,endpointRequired:P,endpointFieldLabel:R,endpointPlaceholder:V,refreshAll:N,busy:I,serverState:Te,stateLabel:Ce,transportLabel:re,protocolLabel:ve,toolSummary:ne,formatAge:$w,setMasterEnabled:be,reconnect:Z,refreshTools:B,removeServer:ie,toggleTools:le,filteredTools:ye,setToolQuery:$e,openAdd:w,openEdit:L,closeEditor:$,jumpToEditorGroup:te,addSecretRow:Y,removeSecretRow:ee,toggleSecretRemoval:he,saveServer:de}}};function Bw(e,t){if(!e||!t)return Du(e);const s=Du(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),g=h(null),b=h(null);let E=null;const O=h(null),y=h(!1),m=h({}),x=h({}),S=h(null),v=h(null),k=K(()=>e.value.reduce((I,W)=>I+(W.chunks||0),0)),T=K(()=>new Set(e.value.map(W=>W.uploader).filter(Boolean)).size);function C(I,W){const Te=x.value[W];if(!Te||Te.length===0)return 0;const Ce=Math.max(...Te.map(re=>re.char_count||0));return Ce===0?0:Math.round(I.char_count/Ce*100)}async function D(){t.value=!0,s.value=null;try{const I=await G.get("/api/knowledge");e.value=Array.isArray(I)?I:[]}catch(I){s.value=I.message}t.value=!1}async function H(I){if(m.value[I]){m.value[I]=!1,v.value=null;return}if(m.value[I]=!0,!(x.value[I]||S.value===I)){S.value=I;try{const W=await G.get(`/api/knowledge/${encodeURIComponent(I)}/chunks`);x.value[I]=Array.isArray(W)?W:[]}catch(W){x.value[I]=[],Re.error(`Failed to load chunks: ${W.message}`)}S.value=null}}async function P(){const I=n.value.trim();if(I){i.value=!0,r.value=null,l.value=I;try{const W=await G.get(`/api/knowledge/search?q=${encodeURIComponent(I)}`);a.value=Array.isArray(W)?W:[]}catch(W){a.value=[],r.value=W.message||"Search failed"}i.value=!1}}function R(){a.value=null,n.value="",r.value=null}async function V(){u.value=null,p.value=null;const I=c.value.trim(),W=d.value.trim();if(!I){u.value="Source name is required";return}if(!W){u.value="Content is required";return}f.value=!0;try{const Te=await G.post("/api/knowledge",{source:I,content:W});p.value=`Ingested ${Te.chunks||0} chunks from "${I}"`,c.value="",d.value="",x.value={},await D(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(Te){u.value=Te.message}f.value=!1}async function X(I){g.value=I,b.value=null,E&&(clearTimeout(E),E=null);try{const W=await G.post(`/api/knowledge/${encodeURIComponent(I)}/reingest`);b.value={source:I,error:!1,message:`Re-ingested ${W.chunks||0} chunks`},delete x.value[I],await D(),E=setTimeout(()=>{b.value=null,E=null},3e3)}catch(W){b.value={source:I,error:!0,message:W.message}}g.value=null}function U(I){O.value=I}async function N(){if(O.value){y.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(O.value)}`),delete x.value[O.value],await D()}catch(I){Re.error(`Failed to delete source: ${I.message||"unknown error"}`)}y.value=!1,O.value=null}}return Ze(()=>{D()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:g,reingestResult:b,deleteTarget:O,deleting:y,expanded:m,sourceChunks:x,loadingChunks:S,selectedChunk:v,totalChunks:k,uploaderCount:T,truncate:Qc,formatTs:ba,highlightTerms:Bw,chunkBarWidth:C,fetchSources:D,toggleSource:H,doSearch:P,clearSearch:R,doIngest:V,doReingest:X,confirmDelete:U,doDelete:N}}},zw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),g=h(!1),b=h(null),E=h(null),O=h(new Set),y=h(null),m=h(!1),x=h(!1),S=K(()=>e.value.reduce((re,ve)=>re+ve.count,0)),v=K(()=>O.value.size);function k(re){const ve=t.value[re];if(!ve)return[];if(!l.value.trim())return ve;const ne=l.value.trim().toLowerCase();return ve.filter(be=>be.key.toLowerCase().includes(ne)||be.value&&be.value.toLowerCase().includes(ne))}function T(re,ve){return O.value.has(re+"/"+ve)}function C(re,ve){const ne=re+"/"+ve,be=new Set(O.value);be.has(ne)?be.delete(ne):be.add(ne),O.value=be}function D(re){const ve=t.value[re];return!ve||ve.length===0?!1:ve.every(ne=>O.value.has(re+"/"+ne.key))}function H(re,ve){const ne=t.value[re];if(!ne)return;const be=new Set(O.value);for(const Z of ne){const B=re+"/"+Z.key;ve?be.add(B):be.delete(B)}O.value=be}async function P(){s.value=!0,n.value=null;try{const re=await G.get("/api/memory");e.value=Object.entries(re).map(([ve,ne])=>({name:ve,keys:ne.keys||[],count:ne.count||0}))}catch(re){n.value=re.message}s.value=!1}async function R(re){if(a.value[re]){a.value[re]=!1;return}a.value[re]=!0;const ve=e.value.find(be=>be.name===re);if(!ve||t.value[re]||i.value===re)return;i.value=re;let ne;try{const Z=(await G.get(`/api/memory/${encodeURIComponent(re)}`)).entries||{};ne=ve.keys.map(B=>Object.prototype.hasOwnProperty.call(Z,B)?{key:B,value:Z[B]||"",failed:!1}:{key:B,value:"",failed:!0,error:"Not found in scope"})}catch(be){ne=ve.keys.map(Z=>({key:Z,value:"",failed:!0,error:be.message||"Failed to load"}))}t.value[re]=ne,i.value=null}function V(re,ve,ne){p.value=re+"/"+ve,f.value=ne}async function X(re,ve){g.value=!0,b.value=null;try{await G.put(`/api/memory/${encodeURIComponent(re)}/${encodeURIComponent(ve)}`,{value:f.value});const ne=t.value[re];if(ne){const be=ne.find(Z=>Z.key===ve);be&&(be.value=f.value)}p.value=null}catch(ne){b.value=`Failed to save: ${ne.message||"unknown error"}`}g.value=!1}async function U(re,ve){try{await navigator.clipboard.writeText(ve.value),E.value=re+"/"+ve.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function N(){d.value=null,u.value=null;const re=o.value.scope.trim(),ve=o.value.key.trim(),ne=o.value.value.trim();if(!re){d.value="Scope is required";return}if(!ve){d.value="Key is required";return}if(!ne){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(re)}/${encodeURIComponent(ve)}`,{value:ne}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(be){d.value=be.message}c.value=!1}function I(re,ve){y.value={scope:re,key:ve}}async function W(){if(!y.value)return;m.value=!0,b.value=null;const{scope:re,key:ve}=y.value;try{await G.del(`/api/memory/${encodeURIComponent(re)}/${encodeURIComponent(ve)}`);const ne=t.value[re];ne&&(t.value[re]=ne.filter(B=>B.key!==ve));const be=e.value.find(B=>B.name===re);be&&(be.count--,be.keys=be.keys.filter(B=>B!==ve));const Z=new Set(O.value);Z.delete(re+"/"+ve),O.value=Z}catch(ne){b.value=`Failed to delete: ${ne.message||"unknown error"}`}m.value=!1,y.value=null}function Te(){x.value=!0}async function Ce(){m.value=!0,b.value=null;const re=[];for(const ve of O.value){const ne=ve.indexOf("/");re.push({scope:ve.slice(0,ne),key:ve.slice(ne+1)})}try{await G.post("/api/memory/bulk-delete",{entries:re}),O.value=new Set,t.value={},await P()}catch(ve){b.value=`Bulk delete failed: ${ve.message||"unknown error"}`}m.value=!1,x.value=!1}return Ze(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:g,actionError:b,copied:E,selected:O,selectedCount:v,totalEntries:S,deleteTarget:y,deleting:m,showBulkDelete:x,fetchMemory:P,toggleScope:R,startEdit:V,doEdit:X,copyValue:U,doAdd:N,confirmDelete:I,doDelete:W,confirmBulkDelete:Te,doBulkDelete:Ce,isSelected:T,toggleSelect:C,isScopeAllSelected:D,toggleSelectAll:H,filteredEntries:k}}},jw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=K(()=>[...new Set(e.value.map(E=>E.category))].sort()),o=K(()=>{const b={};return e.value.forEach(E=>{b[E.category]=(b[E.category]||0)+1}),b}),c=K(()=>a.value?e.value.filter(b=>b.category===a.value):e.value);function d(b){return b==="correction"?"badge-warning":b==="operational"?"badge-info":b==="preference"?"badge-success":"badge-info"}function u(b){i.value=b.key,l.value=b.content}async function p(b){try{await G.put("/api/learned/"+encodeURIComponent(b),{content:l.value}),i.value=null,Re.success("Entry updated"),await g()}catch(E){Re.error(E.message||"Failed to save entry")}}async function f(b){if(await Zt({title:"Delete learned entry",message:`Delete "${b}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(b)),Re.success("Entry deleted"),await g()}catch(O){Re.error(O.message||"Failed to delete entry")}}async function g(){s.value=!0,n.value=null;try{const b=await G.get("/api/learned");e.value=b.entries||[],t.value={last_reflection:b.last_reflection,count:b.count}}catch(b){n.value=b.message}s.value=!1}return Ze(g),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ba,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:g}}},Am=[{id:"tools",label:"Tools",component:Sw},{id:"skills",label:"Skills",component:Ew},{id:"mcp-servers",label:"MCP Servers",component:Uw},{id:"knowledge",label:"Knowledge",component:Hw},{id:"memory",label:"Memory",component:zw},{id:"learned",label:"Learned",component:jw}],Vw={components:{TabbedPage:$r},setup(){return{tabs:Am}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},qw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Gw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Kw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ww={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=K(()=>e.value.components||[]),l=K(()=>Kw[e.value.overall]||"text-gray-400"),r=K(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=K(()=>{const v=e.value.overall;return v==="healthy"?"All Systems Healthy":v==="degraded"?"Some Systems Degraded":v==="unhealthy"?"System Issues Detected":"Unknown"});function c(v){return qw[v]||"text-gray-400"}function d(v){return Gw[v]||"info"}function u(v){return v==="ok"?"badge-success":v==="degraded"?"badge-warning":v==="down"?"badge-danger":"badge-info"}function p(v){return v==="closed"?"text-green-400":v==="half_open"?"text-yellow-400":v==="open"?"text-red-400":"text-gray-400"}function f(v){return v.replace(/_/g," ").replace(/\b\w/g,k=>k.toUpperCase())}function g(v){if(!v)return"—";try{return new Date(v).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return v}}function b(v){return v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":String(v)}async function E(){a.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null,n.value=!0}catch(v){s.value=v.message}finally{t.value=!1,a.value=!1}}function O(){t.value=!0,s.value=null,E()}let y=null,m=!1;function x(){m||(m=!0,E(),y||(y=setInterval(E,3e4)))}function S(){m&&(m=!1,y&&(clearInterval(y),y=null))}return Ze(x),ws(x),ks(S),xt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:g,formatNumber:b,fetchHealth:E,retry:O}}},Zw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=K(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=K(()=>{if(!i.value)return[];const E=i.value,O=E.storage_total_bytes||1;return[{label:"Session Persistence",mb:E.sessions.persist_dir.total_mb,bytes:E.sessions.persist_dir.total_bytes,files:E.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(E.sessions.persist_dir.total_bytes/O*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:E.knowledge.db_file.total_mb,bytes:E.knowledge.db_file.total_bytes,files:E.knowledge.db_file.file_count,pct:Math.min(100,Math.round(E.knowledge.db_file.total_bytes/O*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:E.trajectories.message_dir.total_mb,bytes:E.trajectories.message_dir.total_bytes,files:E.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.message_dir.total_bytes/O*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:E.trajectories.agent_dir.total_mb,bytes:E.trajectories.agent_dir.total_bytes,files:E.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.agent_dir.total_bytes/O*100)),color:"res-bar-amber"}]});async function d(){try{const E=await G.get("/api/resource-usage");i.value=E,t.value=null,s.value=!0}catch(E){t.value=E.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function g(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function b(){f&&(f=!1,l&&(clearInterval(l),l=null))}return Ze(g),ws(g),ks(b),xt(b),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:wm,refresh:u,retry:p}}},Jw=["INFO","WARNING","ERROR"],Yw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],ro=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Qw=[50,100,200,500],Xw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(je.state||"disconnected"),c=K(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,g=Jw,b=Yw,E=ro,O=h("all"),y=h(""),m=h([]),x=h(!1),S=h(""),v=h([]);function k(){try{const q=localStorage.getItem("odin-log-presets");q&&(m.value=JSON.parse(q))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const C=K(()=>a.value!==""||i.value.trim()!==""||y.value!==""),D=K(()=>{const q=ro.find(ue=>ue.value===y.value);return q?q.label:""}),H=K(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(q){return q.message}}),P=24,R=K(()=>{if(Te.value.length===0)return[];const q=[],ue=new Date,Ne=3600*1e3;for(let Je=P-1;Je>=0;Je--){const rt=new Date(ue.getTime()-(Je+1)*Ne),Lt=new Date(ue.getTime()-Je*Ne);q.push({start:rt,end:Lt,label:N(rt,Lt),shortLabel:Lt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Je of Te.value){if(!Je._time)continue;const rt=Je._time.getTime();for(const Lt of q)if(rt>=Lt.start.getTime()&&rt<Lt.end.getTime()){Lt.total++,Je.level==="ERROR"?Lt.errors++:Je.level==="WARNING"?Lt.warnings++:Lt.info++;break}}return q}),V=K(()=>{let q=1;for(const ue of R.value)ue.total>q&&(q=ue.total);return q}),X=K(()=>{if(R.value.length===0)return"";const q=Te.value.map(Je=>Je._time&&Je._time.getTime()).filter(Boolean);if(q.length===0)return"";const ue=new Date(Math.min(...q));return`${Te.value.length} shown, oldest ${ue.toLocaleTimeString()}`}),U=K(()=>Math.ceil(P/8));function N(q,ue){const Ne={hour:"2-digit",minute:"2-digit"};return q.toLocaleTimeString([],Ne)+" - "+ue.toLocaleTimeString([],Ne)}function I(q,ue){return!ue||!q?"0px":Math.max(2,q/ue*100)+"%"}function W(q){const ue=Te.value.findIndex(Ne=>Ne._time&&Ne._time.getTime()>=q.start.getTime()&&Ne._time.getTime()<q.end.getTime());if(ue>=0&&d.value){const Ne=d.value.querySelectorAll(".log-line");Ne[ue]&&(Ne[ue].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const Te=K(()=>{let q=t.value;if(a.value&&(q=q.filter(ue=>(ue.level||"INFO")===a.value)),y.value){const ue=ro.find(Ne=>Ne.value===y.value);if(ue&&ue.seconds){const Ne=new Date(Date.now()-ue.seconds*1e3);q=q.filter(Je=>Je._time&&Je._time>=Ne)}}if(i.value&&!H.value)if(l.value)try{const ue=new RegExp(i.value,"i");q=q.filter(Ne=>{const Je=Ne.text||Ne.raw||"",rt=Ne.tool||"";return ue.test(Je)||ue.test(rt)})}catch{}else{const ue=i.value.toLowerCase();q=q.filter(Ne=>{const Je=(Ne.text||Ne.raw||"").toLowerCase(),rt=(Ne.tool||"").toLowerCase();return Je.includes(ue)||rt.includes(ue)})}return q});function Ce(q){if(q.type==="log"&&q.line)try{const ue=typeof q.line=="string"?JSON.parse(q.line):q.line,Ne=ue.timestamp?new Date(ue.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:ue.error?"ERROR":"INFO",text:ue.tool_name?`[${ue.tool_name}] ${ue.result_summary||""}`.trim():ue.message||JSON.stringify(ue),tool:ue.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(q.line),tool:"",raw:String(q.line)}}if(q.payload){const ue=q.payload,Ne=ue.timestamp?new Date(ue.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:ue.error?"ERROR":"INFO",text:ue.tool_name?`[${ue.tool_name}] ${ue.result_summary||""}`.trim():ue.message||JSON.stringify(ue),tool:ue.tool_name||"",raw:null}}return typeof q=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:q,tool:"",raw:q}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(q),tool:"",raw:null}}function re(q){const ue=Ce(q);if(s.value){v.value.push(ue);return}ve(ue)}function ve(q){t.value.push(q),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&Ct(()=>ne())}function ne(q=!1){const ue=d.value;ue&&ue.scrollTo({top:ue.scrollHeight,behavior:q?"smooth":"instant"})}function be(){n.value=!0,u.value=!1,Ct(()=>ne(!0))}const Z=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function B(){const q=d.value;if(!q)return;const ue=q.scrollHeight-q.scrollTop-q.clientHeight<40;u.value=!n.value&&!ue&&t.value.length>0,ye.value&&ie()}function ie(){const q=d.value;!q||!n.value||q.scrollHeight-q.scrollTop-q.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function le(){n.value&&requestAnimationFrame(ie)}function _e(q){Z.has(q.key)&&le()}const ye=h(!1);function $e(){n.value&&(ye.value=!0,requestAnimationFrame(ie))}function w(){ye.value&&(ye.value=!1,ie())}function L(){n.value&&(u.value=!1,Ct(()=>ne()))}function $(){if(s.value=!s.value,!s.value&&v.value.length>0){for(const q of v.value)ve(q);v.value=[]}}function te(){t.value=[],v.value=[],u.value=!1}function Y(){let q;e.value==="search"?q=Ue.value.map(rt=>{const Lt=rt.error?"ERROR":"INFO",Ft=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Lt} ${Ft}${rt.result_summary||rt.message||""}`}).join(`
`):q=Te.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const ue=new Blob([q],{type:"text/plain"}),Ne=URL.createObjectURL(ue),Je=document.createElement("a");Je.href=Ne,Je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Je.click(),URL.revokeObjectURL(Ne)}function ee(q,ue){const Ne=`${q.ts} ${q.level} ${q.text||q.raw||""}`;navigator.clipboard.writeText(Ne).then(()=>{p.value=ue,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function he(q){a.value=a.value===q?"":q,O.value="all"}function de(q){return q.level==="ERROR"?"log-line-error":q.level==="WARNING"?"log-line-warning":"text-gray-300"}function oe(q){return q==="ERROR"?"text-red-500 font-semibold":q==="WARNING"?"text-yellow-500":"text-blue-500"}function se(q){return q==="ERROR"?"log-chip-error":q==="WARNING"?"log-chip-warning":"log-chip-info"}function ae(q){O.value=q.id;const ue=q.filters;a.value=ue.level||"",y.value=ue.timeRange||"",i.value=ue.text||"",ue.levels&&(a.value=ue.levels[0]||""),ue.hasToolName&&(i.value="")}function me(q){O.value=q.id,a.value=q.filters.level||"",y.value=q.filters.timeRange||"",i.value=q.filters.text||""}function F(){if(!S.value.trim())return;const q={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};m.value=[...m.value,q],T(),x.value=!1,S.value=""}function ce(q){m.value=m.value.filter(ue=>ue.id!==q),T(),O.value===q&&(O.value="all")}const xe=h("all"),Ae=h(""),Oe=h(""),ze=h(""),qe=h(""),dt=h(""),J=h(100),Se=Qw,Ie=h(!1),Me=h(!1),Ge=h(""),Ue=h([]),mt=h(null),Yt=h(null);function Ds(){e.value="search",mt.value||An()}async function An(){try{mt.value=await G.get("/api/logs/stats")}catch{}}function Ts(){const q=dt.value;if(!q){ze.value="",qe.value="";return}const Ne={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[q];if(Ne){const Je=new Date(Date.now()-Ne*1e3);ze.value=Ps(Je),qe.value=""}}function Ps(q){const ue=Ne=>String(Ne).padStart(2,"0");return`${q.getFullYear()}-${ue(q.getMonth()+1)}-${ue(q.getDate())}T${ue(q.getHours())}:${ue(q.getMinutes())}`}function Pt(q){if(!q)return"";const ue=new Date(q);return isNaN(ue.getTime())?"":ue.toISOString()}async function Qt(){Ie.value=!0,Ge.value="",Me.value=!0,Yt.value=null;try{const q=new URLSearchParams;xe.value&&xe.value!=="all"&&q.set("level",xe.value),Ae.value&&q.set("tool",Ae.value),Oe.value&&q.set("q",Oe.value);const ue=Pt(ze.value),Ne=Pt(qe.value);ue&&q.set("start",ue),Ne&&q.set("end",Ne),q.set("limit",String(J.value));const Je=await G.get(`/api/logs/search?${q.toString()}`);Ue.value=Je.entries||[]}catch(q){Ge.value=q.message||"Search failed",Ue.value=[]}finally{Ie.value=!1}}function Vs(){xe.value="all",Ae.value="",Oe.value="",ze.value="",qe.value="",dt.value="",J.value=100,Ue.value=[],Me.value=!1,Ge.value="",Yt.value=null}function Cs(q){Yt.value=Yt.value===q?null:q}function nn(q){if(!q.timestamp)return"";try{return new Date(q.timestamp).toLocaleString()}catch{return q.timestamp}}function Fs(q){return q.type==="web_action"?`${q.status||""} (${q.execution_time_ms||0}ms)`:(q.result_summary||"").slice(0,200)}function qs(q){return q.error?"log-line-error":"text-gray-300"}function Vn(q){try{return JSON.stringify(q,null,2)}catch{return String(q)}}let ut=null,rs=null,os=!1;function Qe(){os||(os=!0,je.subscribe("logs",re),r.value=je.connected,o.value=je.state||"disconnected",ut=je.onStateChange,rs=(q,ue)=>{o.value=q,r.value=q==="connected",ut&&ut(q,ue)},je.onStateChange=rs)}function gs(){os&&(os=!1,je.unsubscribe("logs",re),je.onStateChange===rs&&(je.onStateChange=ut),rs=null,ut=null)}return Ze(()=>{k(),window.addEventListener("pointerup",w),window.addEventListener("pointercancel",w)}),ws(Qe),ks(gs),xt(()=>{gs(),window.removeEventListener("pointerup",w),window.removeEventListener("pointercancel",w)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:Te,pauseBuffer:v,showJumpBottom:u,copiedIndex:p,regexError:H,levels:g,logPresets:b,timeRanges:E,timeRange:y,activeLogPreset:O,customLogPresets:m,showSaveLogPreset:x,newLogPresetName:S,hasActiveLogFilters:C,timeRangeLabel:D,timelineBuckets:R,timelineMax:V,timelineSpanLabel:X,timelineLabelSkip:U,togglePause:$,clearLogs:te,exportLogs:Y,logLineClass:de,levelClass:oe,levelChipClass:se,toggleLevel:he,copyLine:ee,jumpToBottom:be,onScroll:B,onUserScrollIntent:le,onUserScrollKey:_e,onAutoScrollToggle:L,onPointerDown:$e,applyLogPreset:ae,applyCustomLogPreset:me,saveLogCustomPreset:F,removeLogCustomPreset:ce,segmentHeight:I,jumpToTimelineBucket:W,searchLevel:xe,searchTool:Ae,searchKeyword:Oe,searchStart:ze,searchEnd:qe,searchTimePreset:dt,searchLimit:J,searchLimits:Se,searching:Ie,searchRan:Me,searchError:Ge,searchResults:Ue,searchStats:mt,expandedSearch:Yt,switchToSearch:Ds,runSearch:Qt,clearSearchFilters:Vs,toggleSearchExpand:Cs,formatSearchTs:nn,searchEntryText:Fs,searchLogLineClass:qs,formatJson:Vn,applySearchTimePreset:Ts}}};function Sl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const ek=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Va=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},oo=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),nk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Bu(e){return nk.some(t=>e===t||e.startsWith(`${t}.`))}const Rm="odin_config_center_expanded_v1",Im="odin_config_center_category_v1",ak=50,ik=650,co=()=>G.get("/api/config/meta");function ea(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Oi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Ca(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function rk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Om(e,t){if(Oi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ea(t);const n={};for(const[a,i]of Object.entries(t)){const l=Om(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function ok(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Om(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Nm(e,t,s,n){if(Oi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Nm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function ck(){try{const e=JSON.parse(localStorage.getItem(Rm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dk(){try{const e=localStorage.getItem(Im);return Va.some(t=>t.key===e)?e:Va[0].key}catch{return Va[0].key}}const uk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),r=h(null),o=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(dk()),g=h(ck()),b=h({}),E=h({}),O=h(""),y=h({}),m=h({}),x=h([]),S=h([]),v=h(!1),k=h(!1),T=h(!1);let C=null,D=null,H={path:null,at:0},P=0;const R=K(()=>{var _;return(((_=t.value)==null?void 0:_.fields)||[]).filter(M=>!oo.has(M.path.split(".")[0])&&!Bu(M.path))}),V=K(()=>new Map(R.value.map(_=>[_.path,_]))),X=K(()=>Te.value.reduce((_,M)=>_+M.sections.length,0)),U=K(()=>R.value.length),N=K(()=>ek),I=K(()=>x.value.length>0),W=K(()=>S.value.length>0),Te=K(()=>{if(!e.value)return[];const _=new Set(Va.flatMap(pe=>pe.sections)),M=Va.map(pe=>({...pe,sections:pe.sections.filter(De=>Object.hasOwn(e.value,De)&&!oo.has(De))})).filter(pe=>pe.sections.length),j=Object.keys(e.value).filter(pe=>!_.has(pe)&&!oo.has(pe));return j.length&&M.push({key:"other",label:"Other",icon:"folder",sections:j}),M}),Ce=K(()=>e.value?{...e.value,...b.value}:null),re=K(()=>{if(!e.value)return[];const _=[];for(const[M,j]of Object.entries(b.value))Nm(e.value[M],j,M,_);return _.filter(M=>!Oi(M.oldVal,M.newVal)).map(M=>{const j=L(M.path);return{...M,label:(j==null?void 0:j.label)||Ca(M.path.split(".").at(-1)),apply_mode:(j==null?void 0:j.apply_mode)||he(M.path.split(".")[0])}})}),ve=K(()=>re.value.length>0),ne=K(()=>re.value.length),be=K(()=>new Set(re.value.map(_=>_.path.split(".")[0])).size),Z=K(()=>!!u.value||p.value!=="all"),B=K(()=>{const _={...m.value};for(const M of re.value){const j=L(M.path),pe=xa(j,M.newVal);pe&&(_[M.path]=pe)}return _}),ie=K(()=>Object.keys(B.value).length>0),le=K(()=>e.value?(Z.value?Te.value:Te.value.filter(M=>M.key===f.value)).map(M=>({...M,sections:M.sections.filter(j=>Ie(j))})).filter(M=>M.sections.length):[]),_e=K(()=>{const _=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],M=new Map(_.map(j=>[j,[]]));for(const j of re.value){const pe=M.has(j.apply_mode)?j.apply_mode:"restart";M.get(pe).push(j)}return _.filter(j=>M.get(j).length).map(j=>({key:j,label:ge(j),entries:M.get(j)}))}),ye=K(()=>re.value.filter(_=>_.apply_mode==="restart").length),$e=K(()=>R.value.filter(_=>_.pending_restart)),w=K(()=>$e.value.length);function L(_){const M=V.value.get(_);return M?{...M,apply_details:Sl([M])}:null}function $(_){const M=`${_}.`;return R.value.filter(j=>j.path===_||j.path.startsWith(M))}function te(_){return $(_).length}function Y(_){return Ca(_)}function ee(_){const M=$(_);if(!M.length)return`${Ca(_)} configuration.`;const j=M.find(gt=>gt.sensitivity==="public"&&gt.description)||M.find(gt=>gt.description),pe=(j==null?void 0:j.description)||"";return pe.match(/setting for (.+)\.$/i)?`${Ca(_)} settings and runtime behaviour.`:pe}function he(_){const M=[...new Set($(_).map(j=>j.apply_mode))];return M.length===1?M[0]:M.includes("restart")?"restart":M.includes("activation_required")?"activation_required":M[0]||"restart"}function de(_){const M=[...new Set($(_).map(j=>ge(j.apply_mode)))];return M.length?M.length===1?M[0]:`Mixed apply behaviour: ${M.join(" · ")}`:""}function oe(_){return Sl($(_))}function se(_){var M;return Object.hasOwn(b.value,_)?b.value[_]:(M=e.value)==null?void 0:M[_]}function ae(){const _=se("mcp")||{},M=Object.keys(_.servers||{}).length;return`${_.enabled?"Globally enabled":"Globally disabled"} · ${M} configured server${M===1?"":"s"}.`}function me(_,M){return M.split(".").reduce((j,pe)=>j==null?void 0:j[pe],_)}function F(_){const M=Ce.value;return $(_).filter(j=>Bu(j.path)?!1:j.path.split(".").length<=2?!0:!j.path.includes(".*")).map(j=>({...j,key:j.path.split(".").at(-1),value:me(M,j.path),apply_details:Sl([j]),editor:j.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ce(_){const M=_.path.split(".");return M.length>2?M.slice(0,2).join("."):null}function xe(_){const M=new Map;for(const j of F(_)){const pe=ce(j),De=pe||`${_}.__root`;M.has(De)||M.set(De,{key:De,path:pe,entries:[]}),M.get(De).entries.push(j)}return[...M.values()].map(j=>{const pe=j.entries.find(De=>De.group_description);return{...j,label:j.path?Ca(j.path.split(".").at(-1)):null,description:(pe==null?void 0:pe.group_description)||null,apply_details:Sl(j.entries),runtime_summaries:Oe(j.entries)}})}function Ae(_){return{save:_.save_effect||(_.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:_.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[_.apply_mode]||"Effective runtime state is not currently observable."}}function Oe(_){const M=new Map;for(const j of _){const pe=Ae(j),De=`${j.apply_mode}|${pe.save}|${pe.runtime}`;M.has(De)||M.set(De,{key:De,label:ge(j.apply_mode),save:pe.save,runtime:pe.runtime})}return[...M.values()]}function ze(_){if(qe(_))return _.runtime_effect||_.activation_policy||"";if(_.apply_mode==="activation_required"){const M=_.activation_policy||_.runtime_effect;return M?`Not active after saving. No activation control exists in this release. ${M}`:"Not active after saving; no activation control exists in this release."}return""}function qe(_){return _.action_available===!0&&!!(_.action_label&&_.action_endpoint)}async function dt(_){if(qe(_))try{if(Yt(_.path))throw new Error("Save this setting before applying its action.");const M=String(_.action_method||"POST").toLowerCase(),j={post:G.post.bind(G),put:G.put.bind(G),delete:G.del.bind(G)}[M];if(!j)throw new Error("Unsupported configuration action");await j(_.action_endpoint,_.action_body||void 0),await Q(),Rn("success",`${_.action_label} completed.`)}catch(M){Rn("error",M.message||`${_.action_label} failed`)}}function J(_,M){return[_.label,_.path,_.description,..._.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(M)}function Se(_){const M=u.value.trim().toLowerCase();return M?$(_).filter(j=>J(j,M)):[]}function Ie(_){const M=$(_);if(p.value!=="all"&&!M.some(pe=>pe.apply_state===p.value))return!1;const j=u.value.trim().toLowerCase();return!j||`${Y(_)} ${_}`.toLowerCase().includes(j)?!0:M.some(pe=>J(pe,j))}function Me(_,M){return $(_).filter(j=>j.apply_state===M).length}function Ge(_){return _==="all"?U.value:R.value.filter(M=>M.apply_state===_).length}function Ue(_){const M=_.sections.flatMap(j=>$(j));return{fields:M.length,modified:re.value.filter(j=>_.sections.includes(j.path.split(".")[0])).length,pending_restart:M.filter(j=>j.apply_state==="pending_restart").length,invalid:M.filter(j=>j.apply_state==="invalid").length,dormant:M.filter(j=>j.apply_state==="dormant").length}}function mt(_){var M;return Object.hasOwn(b.value,_)&&!Oi((M=e.value)==null?void 0:M[_],b.value[_])}function Yt(_){return re.value.some(M=>M.path===_||M.path.startsWith(`${_}.`))}function Ds(_){f.value=_,u.value="",p.value="all";try{localStorage.setItem(Im,_)}catch{}}function An(_){p.value=_}function Ts(){u.value="",p.value="all"}function Ps(_){var M;return((M=Te.value.find(j=>j.sections.includes(_)))==null?void 0:M.sections)||[]}function Pt(_){const M=Ps(_),j=M.find(pe=>g.value[pe]===!0);return j||M.find(pe=>g.value[pe]!==!1)||null}function Qt(_){return u.value&&!T.value&&Ie(_)?!0:T.value?Pt(_)===_:Object.hasOwn(g.value,_)?g.value[_]===!0:!0}function Vs(_){const M=!Qt(_);if(T.value){const j={...g.value};for(const pe of Ps(_))j[pe]===!0&&(j[pe]=!1);j[_]=M,g.value=j;return}g.value={...g.value,[_]:M}}function Cs(){x.value.push(ea(b.value)),x.value.length>ak&&x.value.shift(),S.value=[]}function nn(){ve.value&&(Cs(),b.value={},m.value={},v.value=!1)}function Fs(_,M=!1){const j=Date.now();if(M&&H.path===_&&j-H.at<ik){H.at=j;return}Cs(),H={path:_,at:j}}function qs(_,M,j){if(!M.length)return j;const pe=ea(_??{});let De=pe;for(let gt=0;gt<M.length-1;gt+=1){const it=M[gt];De[it]=ea(De[it]??{}),De=De[it]}return De[M.at(-1)]=j,pe}function Vn(_){var M;return Object.hasOwn(b.value,_)?b.value[_]:ea((M=e.value)==null?void 0:M[_])}function ut(_,M,j={}){var oi;const[pe,...De]=_.path.split(".");Fs(_.path,!!j.coalesce);const gt=Vn(pe),it=De.length?qs(gt,De,M):M,Gs={...b.value};if(Oi(it,(oi=e.value)==null?void 0:oi[pe])?delete Gs[pe]:Gs[pe]=it,b.value=Gs,m.value[_.path]){const od={...m.value};delete od[_.path],m.value=od}}function rs(_){H={path:null,at:0},E.value={...E.value,[_]:String(me(Ce.value,_)??"")}}function os(_){if(H={path:null,at:0},!Object.hasOwn(E.value,_))return;const M={...E.value};delete M[_],E.value=M}function Qe(_){const M=E.value[_.path];if(H={path:null,at:0},M===""){m.value={...m.value,[_.path]:"Enter a number."};return}const j=Number(M);if(Number.isNaN(j)||_.type==="integer"&&!Number.isInteger(j)){m.value={...m.value,[_.path]:_.type==="integer"?"Enter a whole number.":"Enter a number."};return}const pe={...E.value};delete pe[_.path],E.value=pe,ut(_,j,{coalesce:!0})}function gs(_){return Object.hasOwn(E.value,_.path)?E.value[_.path]:_.value??""}function q(_,M){if(E.value={...E.value,[_.path]:M},M===""){m.value={...m.value,[_.path]:"Enter a number."};return}const j=Number(M);if(!Number.isFinite(j)||_.type==="integer"&&!Number.isInteger(j)){m.value={...m.value,[_.path]:_.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(m.value[_.path]){const pe={...m.value};delete pe[_.path],m.value=pe}ut(_,j,{coalesce:!0})}function ue(_){const M=Number.parseInt(O.value,10);if(!Number.isInteger(M)||M<1){m.value={...m.value,[_.path]:"Warning thresholds must be positive whole numbers."};return}const j=[...new Set([..._.value||[],M])].sort((pe,De)=>De-pe);O.value="",ut(_,j)}function Ne(_,M){ut(_,(_.value||[]).filter(j=>j!==M))}function Je(_){return _.apply_mode==="live_read"?"Odin reads the saved file value on next use.":_.apply_mode==="live_for_new_work"?"New work uses the saved file value.":_.apply_mode==="live_apply"?_.apply_handler?`Apply the saved value through ${_.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":_.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":_.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":_.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function rt(_){return _.type==="array"&&Array.isArray(_.value)&&!_.structured_container&&!_.structured_container_child&&_.sensitivity==="public"&&_.value.every(M=>["string","number","boolean"].includes(typeof M))}function Lt(_){const M=String(y.value[_.path]??"").trim();if(!M)return;const j=[...new Set([..._.value||[],M])];y.value={...y.value,[_.path]:""},ut(_,j)}function Ft(_,M){ut(_,(_.value||[]).filter(j=>j!==M))}function xa(_,M){var pe;if(!_)return null;if((pe=_.enum)!=null&&pe.length&&!_.enum.includes(M))return`Choose one of: ${_.enum.join(", ")}`;if(_.path==="agents.final_warning_iterations"&&(!Array.isArray(M)||!M.length))return"Add at least one warning threshold.";const j=_.constraints||{};if((_.type==="integer"||_.type==="number")&&typeof M=="number"){if(j.minimum!==void 0&&M<j.minimum)return`Must be at least ${j.minimum}${_.unit?` ${_.unit}`:""}`;if(j.maximum!==void 0&&M>j.maximum)return`Must be at most ${j.maximum}${_.unit?` ${_.unit}`:""}`}return null}function $s(_){return B.value[_.path]||null}function li(_){const M=`${_}.`;return Object.keys(B.value).some(j=>j===_||j.startsWith(M))}function _a(){x.value.length&&(S.value.push(ea(b.value)),b.value=x.value.pop(),m.value={},E.value={},H={path:null,at:0})}function qn(){S.value.length&&(x.value.push(ea(b.value)),b.value=S.value.pop(),m.value={},E.value={},H={path:null,at:0})}function wa(){!ve.value||ie.value||(v.value=!0,k.value=!1)}function Gn(){v.value=!1}function z(){nn()}function ge(_){return sk[_]||Ca(_||"unknown")}function Ee(_){return`apply-${String(_||"unknown").replaceAll("_","-")}`}function _t(_){return`cfgc-field-${_.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Kn(_){return`${_t(_)}-input`}function Wn(_){const M=document.getElementById(_t(_))||document.getElementById(_t(_.split(".").slice(0,2).join(".")));M==null||M.scrollIntoView({behavior:"smooth",block:"center"})}function Rn(_,M){l.value={type:_,message:M},window.setTimeout(()=>{var j;((j=l.value)==null?void 0:j.message)===M&&(l.value=null)},3500)}function cl(){o.value=!1,p.value="pending_restart",u.value="";const _=tk(n.value);_&&(_.scrollTop=0)}function dl(){o.value=!1}function Zn(_=1800){D&&window.clearTimeout(D),D=window.setTimeout(ri,_)}async function ri(){if(c.value){if(P+=1,P>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await co(),w.value===0){c.value=!1,d.value=null,Rn("success","Odin restarted and the saved startup settings are active.");return}}catch{}Zn(2e3)}}async function we(){if(!c.value){d.value=null;try{await G.post("/api/restart",{}),c.value=!0,P=0,o.value=!1,Zn()}catch(_){d.value=_.message||"Odin could not schedule a restart."}}}async function A(){if(!(!ve.value||ie.value||a.value)){a.value=!0;try{const _=ok(e.value,b.value),M=await G.put("/api/config",_);e.value=M,b.value={},x.value=[],S.value=[],m.value={},v.value=!1;try{t.value=await co(),r.value=null,o.value=w.value>0,Rn("success",w.value?`Configuration saved. ${w.value} setting${w.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(j){r.value=j.message||"Unknown metadata error.",Rn("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(_){Rn("error",_.message||"Configuration could not be saved")}finally{a.value=!1}}}async function Q(){var _,M;if(!ve.value){s.value=!0,i.value=null;try{const j=await G.get("/api/config"),pe=await co();e.value=j,t.value=pe,r.value=null;const De=Te.value;if(De.some(gt=>gt.key===f.value)||(f.value=((_=De[0])==null?void 0:_.key)||Va[0].key),T.value){const it=(((M=De.find(Gs=>Gs.key===f.value))==null?void 0:M.sections)||[]).find(Gs=>g.value[Gs]===!0);g.value=it?{...g.value,[it]:!0}:{}}}catch(j){i.value=j.message||"Unknown configuration error"}finally{s.value=!1}}}function fe(_){if(v.value||!(_.ctrlKey||_.metaKey))return;const M=_.target;M instanceof HTMLElement&&(M.matches("input, textarea, select")||M.isContentEditable)||(!_.shiftKey&&_.key.toLowerCase()==="z"?(_.preventDefault(),_a()):(_.key.toLowerCase()==="y"||_.shiftKey&&_.key.toLowerCase()==="z")&&(_.preventDefault(),qn()))}function Le(_){T.value=_.matches}return as(g,_=>{try{localStorage.setItem(Rm,JSON.stringify(_))}catch{}},{deep:!0}),Ze(()=>{var _;Q(),document.addEventListener("keydown",fe),C=window.matchMedia("(max-width: 760px)"),Le(C),(_=C.addEventListener)==null||_.call(C,"change",Le)}),xt(()=>{var _;document.removeEventListener("keydown",fe),(_=C==null?void 0:C.removeEventListener)==null||_.call(C,"change",Le),D&&window.clearTimeout(D)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:v,mobileOverflowOpen:k,warningThresholdInput:O,arrayInputs:y,healthFilters:N,visibleCategories:Te,displayGroups:le,reviewGroups:_e,sectionCount:X,fieldCount:U,hasChanges:ve,changeCount:ne,changedSectionCount:be,hasDraftErrors:ie,canUndo:I,canRedo:W,globalFilterActive:Z,reviewRestartCount:ye,pendingRestartCount:w,pendingRestartFields:$e,healthCount:Ge,categoryStats:Ue,selectCategory:Ds,selectHealthFilter:An,clearFilters:Ts,sectionLabel:Y,sectionDescription:ee,sectionFieldCount:te,sectionHealthCount:Me,sectionApplySummary:de,sectionApplyDetails:oe,sectionEntries:F,fieldGroups:xe,sectionSearchHits:Se,mcpConfigSummary:ae,fieldRuntimeCopy:Ae,fieldSpecificRuntimeNote:ze,hasHonestAction:qe,runFieldAction:dt,sectionChanged:mt,fieldChanged:Yt,isSectionExpanded:Qt,toggleSection:Vs,discardAllDrafts:nn,setFieldValue:ut,setNumberFieldValue:q,numberInputValue:gs,beginInputEdit:rs,endTextInputEdit:os,endInputEdit:Qe,addWarningThreshold:ue,removeWarningThreshold:Ne,isScalarArray:rt,addScalarArrayItem:Lt,removeScalarArrayItem:Ft,fieldError:$s,sectionHasErrors:li,undo:_a,redo:qn,openReview:wa,closeReview:Gn,mobileCancel:z,applyModeLabel:ge,applyClass:Ee,compactValue:lk,formatValue:rk,structuredApplyCopy:Je,fieldId:_t,fieldInputId:Kn,focusField:Wn,fetchConfig:Q,saveConfig:A,restartOdin:we,restartLater:dl,reviewPendingRestart:cl}}},pk=/^\d{15,25}$/;function Lm(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Mm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=K(()=>new Set((e.excludedIds||[]).map(String))),r=K(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(v=>l.value.has(String(v.id))?!1:S?u(v).toLowerCase().includes(S)||String(v.username||"").toLowerCase().includes(S)||String(v.id).includes(S):!0)}),o=K(()=>{const S=s.value.trim();return r.value.length===0&&pk.test(S)&&!l.value.has(S)?S:""}),c=K(()=>r.value.length+(o.value?1:0)),d=K(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return Lm(S)}function p(){n.value=!0,a.value=0}function f(){p()}function g(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function b(){a.value=Math.max(a.value-1,0)}function E(){const S=r.value[a.value];S?O(S):o.value&&a.value===r.value.length&&y(o.value)}function O(S){y(String(S.id))}function y(S){t("select",S),s.value="",n.value=!1,a.value=0}function m(){n.value=!1}function x(){setTimeout(m,150)}return Ze(()=>{e.autofocus&&Ct(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:g,highlightPrevious:b,selectHighlighted:E,selectMember:O,selectId:y,closeOptions:m,onBlur:x}}};function Hu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const fk={components:{DiscordUserCombobox:Mm},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),r=h(null),o=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=K(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=K(()=>new Map(c.value.map(R=>[String(R.id),R])));function g(R){return R.config&&R.config.enabled!==void 0?R.config.enabled:!0}function b(R){return Hu(R,"require_mention",a.value)}function E(R){return Hu(R,"respond_to_bots",a.value)}function O(R){return R.config&&Object.keys(R.config).length>0}function y(R){n.value[R]=!n.value[R]}function m(R){const V=R.discord||{};return{allowed_users:[...V.allowed_users||[]],channels:[...V.channels||[]],respond_to_bots:!!V.respond_to_bots,require_mention:!!V.require_mention,ignore_bot_ids:[...V.ignore_bot_ids||[]]}}async function x({showLoading:R=!0}={}){const V=++d;R&&(t.value=!0),s.value=null;try{const X=await G.get("/api/discord/guilds");V===d&&(e.value=X)}catch(X){V===d&&(s.value=X.message)}finally{R&&V===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[R,V,X]=await Promise.all([G.get("/api/discord/guilds"),G.get("/api/discord/members").catch(()=>[]),G.get("/api/config")]),U=m(X),N=p.value;a.value=U,N||(i.value=JSON.parse(JSON.stringify(U))),c.value=V,e.value=R,r.value=null}catch(R){s.value=R.message}finally{t.value=!1}}async function v(R,V,X){try{await G.put("/api/discord/guild/"+R+"/config",{[V]:X}),await x({showLoading:!1})}catch(U){s.value=U.message}}async function k(R,V,X,U){try{await G.put("/api/discord/channel/"+R+"/config",{[X]:U}),await x({showLoading:!1})}catch(N){s.value=N.message}}async function T(R,V){try{await G.put("/api/discord/channel/"+R+"/config",{clear:!0}),await x({showLoading:!1})}catch(X){s.value=X.message}}function C(R,V){const X=String(V);if(!R.userAutocomplete)return X;const U=f.value.get(X);return U?Lm(U):X}function D(R,V=null){const X=String(V??o.value[R]??"").trim();!X||i.value[R].includes(X)||(i.value[R]=[...i.value[R],X],o.value={...o.value,[R]:""})}function H(R,V){i.value[R]=i.value[R].filter(X=>X!==V)}async function P(){if(!(!p.value||l.value)){l.value=!0,r.value=null;try{const V=(await G.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...V.allowed_users||[]],channels:[...V.channels||[]],respond_to_bots:!!V.respond_to_bots,require_mention:!!V.require_mention,ignore_bot_ids:[...V.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(R){r.value=R.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ze(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:g,guildMention:b,guildBots:E,hasOverride:O,toggleGuild:y,fetchAll:S,fetchGuilds:x,setGuildConfig:v,setChannelConfig:k,clearOverride:T,globalItemLabel:C,addGlobalItem:D,removeGlobalItem:H,saveGlobalDefaults:P}}},vs=e=>e==null?e:JSON.parse(JSON.stringify(e));function hk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const g=new Map;function b(v){d+=1;const k=c.then(v,v);return c=k.catch(()=>{}),k}function E(v,k){f=vs(v),g.clear();for(const[T,C]of Object.entries(k||{}))g.set(T,vs(C))}function O(v){const k=vs(v),T=++u;return b(async()=>{try{await e(vs(k)),f=vs(k),T===u&&n(vs(k))}catch(C){T===u&&(a(vs(f)),o(C,{kind:"default"}))}})}function y(v,k){const T=vs(k),C=(p.get(v)||0)+1;return p.set(v,C),b(async()=>{try{await t(v,vs(T)),g.set(v,vs(T)),C===p.get(v)&&i(v,vs(T))}catch(D){C===p.get(v)&&(l(v,vs(g.get(v)??null)),o(D,{kind:"user",uid:v}))}})}function m(v){const k=(p.get(v)||0)+1;return p.set(v,k),b(async()=>{try{await s(v),g.delete(v),k===p.get(v)&&r(v)}catch(T){k===p.get(v)&&(l(v,vs(g.get(v)??null)),o(T,{kind:"delete",uid:v}))}})}async function x(){for(;;){const v=c;if(await v,v===c)return d}}async function S(v){for(;;){const k=await x(),T=await v();if(k===d)return T}}return{seed:E,saveDefault:O,saveUser:y,deleteUser:m,whenIdle:x,readSnapshot:S,get revision(){return d}}}const mk={components:{DiscordUserCombobox:Mm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h([]),o=K(()=>{const v={};for(const k of r.value)v[k.id]=k;return v});function c(v){return o.value[v]||null}function d(v,k){return v?v.allowed_hosts===null||v.allowed_hosts===void 0?{allowed_hosts:[...k],default_host:v.default_host||"",allow_all:!0}:{allowed_hosts:v.allowed_hosts,default_host:v.default_host||"",allow_all:!1}:{allowed_hosts:[...k],default_host:k[0]||"",allow_all:!0}}const u=hk({applyDefault:async v=>{const k=v.allow_all?null:v.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:k,default_host:v.default_host})},applyUser:async(v,k)=>{const T=k.allow_all?null:k.allowed_hosts;await G.put(`/api/host-access/user/${v}`,{allowed_hosts:T,default_host:k.default_host})},applyDelete:v=>G.del(`/api/host-access/user/${v}`),onDefaultConfirmed:()=>Re.success("Default policy updated"),onDefaultRollback:v=>{v&&(a.value=v)},onUserConfirmed:v=>{const k=c(v);Re.success(`Updated access for ${k?k.display_name:v}`)},onUserRollback:(v,k)=>{const T={...i.value};k?T[v]=k:delete T[v],i.value=T},onUserDeleted:v=>{const k={...i.value};delete k[v],i.value=k},onError:(v,k)=>{var C;const T=k.uid?` ${((C=c(k.uid))==null?void 0:C.display_name)||k.uid}`:"";Re.error(`${v.message||"Failed to save"} — reverted${T}`)}});let p=0;async function f(){const v=++p;e.value=!0,t.value="";try{const k=await u.readSnapshot(()=>G.get("/api/host-access"));if(v!==p)return;s.value=k,n.value=k.available_hosts||[],a.value=d(k.default_policy,n.value);const T=k.users||{},C={};for(const[D,H]of Object.entries(T))C[D]=d(H,n.value);i.value=C,u.seed(a.value,C)}catch(k){v===p&&(t.value=k.message||"Failed to fetch host access data")}finally{v===p&&(e.value=!1)}try{const k=await G.get("/api/discord/members")||[];v===p&&(r.value=k)}catch{v===p&&(r.value=[])}}function g(){u.saveDefault(a.value)}function b(v,k){a.value.allow_all=!1,k?a.value.allowed_hosts.includes(v)||a.value.allowed_hosts.push(v):(a.value.allowed_hosts=a.value.allowed_hosts.filter(T=>T!==v),a.value.default_host===v&&(a.value.default_host=a.value.allowed_hosts[0]||"")),g()}function E(v){const k=i.value[v];k&&u.saveUser(v,k)}function O(v,k,T){const C=i.value[v];C&&(C.allow_all=!1,T?C.allowed_hosts.includes(k)||C.allowed_hosts.push(k):(C.allowed_hosts=C.allowed_hosts.filter(D=>D!==k),C.default_host===k&&(C.default_host=C.allowed_hosts[0]||"")),E(v))}function y(v,k){const T=i.value[v];T&&(T.default_host=k,E(v))}function m(){l.value=!0}function x(v){!/^\d{15,25}$/.test(v)||i.value[v]||(i.value[v]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},E(v),l.value=!1)}async function S(v){const k=c(v);await Zt({title:"Remove user override",message:`Remove the host access override for ${k?k.display_name:v}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(v),i.value[v]||Re.success(`Removed override for ${k?k.display_name:v}`))}return Ze(f),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:f,saveDefaultPolicy:g,toggleDefaultHost:b,getMember:c,toggleUserHost:O,setUserDefault:y,openAddUser:m,addUserById:x,deleteUser:S}}},gk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=K(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=K(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function g(){e.value=!0,t.value="";try{const T=await G.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function b(T){return!T||!T.trim()?[]:T.split(",").map(C=>C.trim()).filter(Boolean)}function E(T,C){const D=c.value.allowed_hosts;if(C&&!D.includes(T)&&D.push(T),!C){const H=D.indexOf(T);H>=0&&D.splice(H,1)}}function O(T,C){const D=d.value.allowed_hosts;if(C&&!D.includes(T)&&D.push(T),!C){const H=D.indexOf(T);H>=0&&D.splice(H,1)}}async function y(){var T;i.value=!0;try{const C=b(c.value.allowed_tools_str),D=c.value.host_mode,H=D==="none"?[]:D==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};H!==null&&(P.allowed_hosts=H),P.default_host=c.value.default_host||"";const R=await G.post("/api/tokens",P);l.value=R.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Re.success("Token created"),await g()}catch(C){Re.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to create token")}finally{i.value=!1}}function m(T){r.value=T;const C=T.allowed_hosts;let D="default";C==null?D="default":Array.isArray(C)&&C.length===0?D="none":Array.isArray(C)&&(D="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:D,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function x(){var T;if(r.value){o.value=!0;try{const C=b(d.value.allowed_tools_str),D=d.value.host_mode,H={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};D==="none"?H.allowed_hosts=[]:D==="select"?H.allowed_hosts=d.value.allowed_hosts:H.allowed_hosts=null,H.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,Re.success("Token updated"),await g()}catch(C){Re.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function S(T){var D;if(await Zt({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await G.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=H.token,Re.success("Token regenerated")}catch(H){Re.error(((D=H.data)==null?void 0:D.error)||H.message||"Failed to regenerate")}}async function v(T){var D;if(await Zt({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(T.user_id)),Re.success("Token deleted"),await g()}catch(H){Re.error(((D=H.data)==null?void 0:D.error)||H.message||"Failed to delete")}}async function k(){if(l.value)try{await navigator.clipboard.writeText(l.value),Re.success("Copied to clipboard")}catch{Re.error("Copy failed — select and copy manually")}}return Ze(g),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:g,tierBadge:f,toggleCreateHost:E,toggleEditHost:O,createToken:y,startEdit:m,saveEdit:x,confirmRegenerate:S,confirmDelete:v,copyToken:k}}},vk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),bk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),yk=Object.freeze(["enabled","base_url","model","max_tokens"]),xk=Object.freeze(["enabled","model","max_tokens"]);function Ur(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function zu(e){return Ur(e,vk)}function ju(e){return Ur(e,bk)}function _k(e,{includeApiKey:t=!1}={}){const s=Ur(e,yk);return t&&(s.api_key=e.api_key),s}function wk(e){return{timeout:e.timeout}}function kk(e,{includeApiKey:t=!1}={}){const s=Ur(e,xk);return t&&(s.api_key=e.api_key),s}function Sk(e){return{timeout:e.timeout}}function Tl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Tk={template:`
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
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="kimiForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveKimiAdvancedConfigNow" :disabled="savingKimi">Save timeout</button></div>
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
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="ollamaForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveOllamaAdvancedConfigNow" :disabled="savingOllama">Save timeout</button></div>
            </div>
          </details>
          <div v-if="ollamaStatus.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=K(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=K(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=K(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=K(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),d=K(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),u=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),p=z=>r.includes(z)&&d.value,f=h({enabled:!1,model:"gpt-5.6-luna"}),g=h({unavailable_reason:null}),b=K(()=>{const z=f.value.model;return z&&!a.includes(z)?[z,...a]:a});function E(z){const ge=z.target.value;f.value.enabled=ge!=="",ge!==""&&(f.value.model=ge),rs()}const O=h(!1),y=h({codex:!1,ollama:!1,kimi:!1}),m=h(null),x=h(!1),S=h(""),v=h(null),k=h(!1);let T=0;const C=K(()=>{var z;return Object.entries(((z=m.value)==null?void 0:z.models)||{}).map(([ge,Ee])=>{var _t,Kn,Wn;return{model:ge,floor:Ee.floor,override:Ee.override,effectiveBudget:(_t=Ee.effective)==null?void 0:_t.effective_budget,configuredPrimaryChars:(Kn=Ee.configured)==null?void 0:Kn.primary_chars,primaryChars:(Wn=Ee.effective)==null?void 0:Wn.primary_chars,provenance:Ee.provenance,clampExpiresAt:Ee.clamp_expires_at}})}),D=K(()=>{var z;return((z=m.value)==null?void 0:z.clamps)||[]}),H=K(()=>{var z,ge;return((ge=(z=m.value)==null?void 0:z.models)==null?void 0:ge[n.value.model])||null}),P=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),R=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),V=h(!1),X=h(!1),U=h(!1),N=h(!1),I=h(!1),W=h(!1),Te=h(!1),Ce=h({configured:!1}),re=h([]),ve=h(""),ne=h(!1),be=h(!1),Z=h({configured:!1}),B=h([]),ie=h(""),le=h(!1),_e=h(!1),ye=h(!0),$e=h(""),w=h({configured:!1,accounts:[]}),L=h(null),$=h(null),te=h(""),Y=h(null),ee=h(!1),he=h(null),de=h(null),oe=h("");let se=null;function ae(z,ge="success"){Re(z,ge==="error"?"error":"success")}function me(z){if(!z)return"?";const ge=z/(1024*1024*1024);return ge>=1?ge.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}function F(z){return Number.isFinite(Number(z))?Number(z).toLocaleString():"—"}function ce(z){return z==null?"automatic (model-derived)":Number(z).toLocaleString()+" characters"}function xe(z){const ge=new Date(z);return Number.isNaN(ge.getTime())?"unknown":ge.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Ae(z){return typeof z=="string"&&z.length>12?z.slice(0,8)+"…"+z.slice(-4):z}function Oe(z){return z==="temporary learned clamp"?"is-clamp":z==="override"?"is-override":"is-built-in"}function ze(z){const ge=n.value.context_budget_overrides[z.model];return z.floor!=null&&Number.isFinite(Number(ge))&&Number(ge)>z.floor}function qe(z,ge){const Ee={...n.value.context_budget_overrides};ge.target.value===""?delete Ee[z]:Ee[z]=Number(ge.target.value),n.value.context_budget_overrides=Ee,k.value=!0}function dt(z){n.value.context_utilization=z.target.value===""?"":Number(z.target.value),k.value=!0}function J(z){const ge={...n.value.context_budget_overrides};delete ge[z],n.value.context_budget_overrides=ge,k.value=!0}async function Se(){e.value=!0,await Promise.all([Ie(),Ge(),Ts(),Ue(),Me()]),e.value=!1}async function Ie({preserveBasic:z=!1,preserveAdvanced:ge=!1}={}){try{const Ee=await G.get("/api/llm/status");t.value=Ee,s.value=Ee.active_provider||"codex",Ee.codex&&!ut.pending()&&(z||(n.value.enabled=Ee.codex.enabled,n.value.model=Ee.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ee.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ee.codex.agent_reasoning_effort||"",n.value.agent_model=Ee.codex.agent_model||""),ge||(n.value.request_timeout_seconds=Ee.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ee.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ee.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ee.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ee.codex.context_compression||{}},!k.value&&!U.value&&(n.value.context_budget_overrides={...Ee.codex.context_budget_overrides||{}},n.value.context_utilization=Ee.codex.context_utilization??n.value.context_utilization))),Ee.ollama&&!os.pending()&&(z||(P.value.enabled=Ee.ollama.enabled,P.value.base_url=Ee.ollama.base_url||"",P.value.model=Ee.ollama.model||"",P.value.max_tokens=Ee.ollama.max_tokens||4096),ge||(P.value.timeout=Ee.ollama.timeout??P.value.timeout)),Ee.kimi&&!Qe.pending()&&(z||(R.value.enabled=Ee.kimi.enabled,R.value.model=Ee.kimi.model||"",R.value.max_tokens=Ee.kimi.max_tokens||4096),ge||(R.value.timeout=Ee.kimi.timeout??R.value.timeout)),Ee.auxiliary&&(g.value=Ee.auxiliary,rs.pending()||(f.value.enabled=Ee.auxiliary.enabled,f.value.model=Ee.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Me(){const z=++T;x.value=!0,S.value="";try{const ge=await G.get("/api/context/windows");if(z!==T)return;m.value=ge,!U.value&&!k.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(ge.models||{}).filter(([,Ee])=>Ee.override!=null).map(([Ee,_t])=>[Ee,_t.override])),n.value.context_utilization=ge.utilization??n.value.context_utilization)}catch(ge){z===T&&(S.value=ge.message||"Failed to load context budgets")}finally{z===T&&(x.value=!1)}}async function Ge(){try{if(Ce.value=await G.get("/api/ollama/status"),Ce.value.model&&(ve.value=Ce.value.model),Ce.value.configured)try{const z=await G.get("/api/ollama/models");re.value=z.models||[]}catch{re.value=[]}else if(P.value.base_url)try{const z=await G.post("/api/ollama/probe-models",{base_url:P.value.base_url});re.value=z.models||[]}catch{re.value=[]}}catch{Ce.value={configured:!1}}}async function Ue(){ye.value=!0,$e.value="";try{w.value=await G.get("/api/codex/status")}catch(z){$e.value=z.message||"Failed to fetch Codex status"}finally{ye.value=!1}}async function mt(){const z=t.value?t.value.active_provider:"codex";Te.value=!0;try{const ge=await G.post("/api/llm/switch",{provider:s.value});ge.error?(s.value=z,ae(ge.error,"error")):(ae("Switched to "+s.value+" ("+ge.model+")"),await Se())}catch(ge){s.value=z,ae(ge.message||"Switch failed","error")}finally{Te.value=!1}}async function Yt(){ne.value=!0;try{const z=await G.post("/api/ollama/reload");ae(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await Se()}catch(z){ae(z.message||"Reload failed","error")}finally{ne.value=!1}}async function Ds(){be.value=!0;try{await G.post("/api/ollama/model",{model:ve.value}),ae("Model set to "+ve.value),await Se()}catch(z){ae(z.message||"Failed","error")}finally{be.value=!1}}async function An(){const z=P.value.base_url;if(!z){ae("Enter a base URL first","error");return}W.value=!0;try{const ge=await G.post("/api/ollama/probe-models",{base_url:z});re.value=ge.models||[],re.value.length?(ae(re.value.length+" model(s) found"),!P.value.model&&re.value.length&&(P.value.model=re.value[0].name)):ae("No models found at "+z,"error")}catch(ge){ae(ge.message||"Could not reach Ollama","error")}finally{W.value=!1}}async function Ts(){try{if(Z.value=await G.get("/api/kimi/status"),Z.value.model&&(ie.value=Z.value.model),Z.value.configured)try{const z=await G.get("/api/kimi/models");B.value=z.models||[]}catch{B.value=[]}}catch{Z.value={configured:!1}}}async function Ps(){le.value=!0;try{const z=await G.post("/api/kimi/reload");ae(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await Se()}catch(z){ae(z.message||"Reload failed","error")}finally{le.value=!1}}async function Pt(){_e.value=!0;try{await G.post("/api/kimi/model",{model:ie.value}),ae("Model set to "+ie.value),await Se()}catch(z){ae(z.message||"Failed","error")}finally{_e.value=!1}}async function Qt(){if(U.value){ut();return}U.value=!0;const z=zu(n.value);try{await G.put("/api/llm/codex/config",z),ae("Codex config saved"),await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:!0}),Ue()])}catch(ge){ae(ge.message||"Failed","error");const Ee=JSON.stringify(zu(n.value))!==JSON.stringify(z);await Promise.all([Ie({preserveBasic:Ee,preserveAdvanced:!0}),Ue()])}finally{U.value=!1}}async function Vs(){if(U.value)return;U.value=!0;const z=ju(n.value);try{await G.put("/api/llm/codex/config",z),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:z.context_budget_overrides,context_utilization:z.context_utilization})&&(k.value=!1),ae("Codex advanced settings saved"),await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:!0}),Ue(),Me()])}catch(ge){ae(ge.message||"Failed","error");const Ee=JSON.stringify(ju(n.value))!==JSON.stringify(z);await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:Ee}),Ue(),Me()])}finally{U.value=!1}}async function Cs(){if(N.value){os();return}N.value=!0;try{const z=V.value?P.value.api_key:null,ge=_k(P.value,{includeApiKey:z!==null});await G.put("/api/llm/ollama/config",ge),ae("Ollama config saved"),z!==null&&P.value.api_key===z&&(P.value.api_key="",V.value=!1),await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:!0}),Ge()])}catch(z){ae(z.message||"Failed","error")}finally{N.value=!1}}async function nn(){if(!N.value){N.value=!0;try{await G.put("/api/llm/ollama/config",wk(P.value)),ae("Ollama timeout saved"),await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:!0}),Ge()])}catch(z){ae(z.message||"Failed","error")}finally{N.value=!1}}}async function Fs(){if(I.value){Qe();return}I.value=!0;try{const z=X.value?R.value.api_key:null,ge=kk(R.value,{includeApiKey:z!==null});await G.put("/api/llm/kimi/config",ge),ae("Kimi config saved"),z!==null&&R.value.api_key===z&&(R.value.api_key="",X.value=!1),await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:!0}),Ts()])}catch(z){ae(z.message||"Failed","error")}finally{I.value=!1}}async function qs(){if(!I.value){I.value=!0;try{await G.put("/api/llm/kimi/config",Sk(R.value)),ae("Kimi timeout saved"),await Promise.all([Ie({preserveBasic:!0,preserveAdvanced:!0}),Ts()])}catch(z){ae(z.message||"Failed","error")}finally{I.value=!1}}}async function Vn(){if(O.value){rs();return}O.value=!0;try{await G.put("/api/llm/auxiliary/config",f.value),ae("Auxiliary config saved"),await Ie()}catch(z){ae(z.message||"Failed","error"),await Ie()}finally{O.value=!1}}const ut=Tl(Qt),rs=Tl(Vn),os=Tl(Cs),Qe=Tl(Fs),gs=()=>(ut.cancel(),Qt()),q=()=>(os.cancel(),Cs()),ue=()=>(Qe.cancel(),Fs()),Ne=()=>Vs(),Je=()=>nn(),rt=()=>qs();async function Lt(z){const ge=z.account_key+":"+z.model;v.value=ge;try{const Ee=await G.post("/api/context/windows/clear",{account_key:z.account_key,model:z.model});ae(Ee.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Me()}catch(Ee){ae(Ee.message||"Failed to clear clamp","error"),await Me()}finally{v.value=null}}async function Ft(z){try{await G.post("/api/codex/account/"+z+"/activate"),ae("Active account switched"),await Ue()}catch(ge){ae(ge.message||"Failed","error")}}async function xa(z){L.value=z;try{await G.post("/api/codex/account/"+z+"/refresh"),ae("Token refreshed"),await Ue()}catch(ge){ae(ge.message||"Refresh failed","error")}finally{L.value=null}}function $s(z,ge){$.value=z,te.value=ge||""}async function li(z){try{await G.put("/api/codex/account/"+z+"/label",{label:te.value}),ae("Label updated"),$.value=null,await Ue()}catch(ge){ae(ge.message||"Failed","error")}}async function _a(z,ge){if(await Zt({title:"Delete Codex account",message:`Delete ${ge||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+z),ae("Deleted. Pool reloaded."),await Ue()}catch(_t){ae(_t.message||"Failed","error")}}async function qn(){ee.value=!0;try{const z=await G.post("/api/codex/device-code");he.value=z,Y.value="pending",wa(z)}catch(z){ae(z.message||"Failed","error")}finally{ee.value=!1}}async function wa(z){se={cancelled:!1};const ge=se;try{const Ee=await G.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(ge.cancelled)return;de.value=Ee,Y.value="success",await Se()}catch(Ee){if(ge.cancelled)return;oe.value=Ee.message||"Device login failed",Y.value="error"}}function Gn(){se&&(se.cancelled=!0),Y.value=null,he.value=null}return Ze(Se),xt(()=>{se&&(se.cancelled=!0),ut.cancel(),rs.cancel(),os.cancel(),Qe.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:Te,advancedOpen:y,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:p,auxForm:f,auxData:g,auxModelOptions:b,onAuxModelChange:E,savingAux:O,saveAuxConfigDebounced:rs,ollamaForm:P,kimiForm:R,savingCodex:U,savingOllama:N,savingKimi:I,probingOllama:W,ollamaKeyDirty:V,kimiKeyDirty:X,ollamaStatus:Ce,ollamaModels:re,ollamaSelectedModel:ve,reloading:ne,settingModel:be,kimiStatus:Z,kimiModels:B,kimiSelectedModel:ie,reloadingKimi:le,settingKimiModel:_e,codexLoading:ye,codexError:$e,codexData:w,refreshing:L,editingLabel:$,labelValue:te,contextWindows:m,contextWindowsLoading:x,contextWindowsError:S,contextBudgetRows:C,activeClampRows:D,activeContextBudget:H,clearingClamp:v,contextPolicyDirty:k,deviceState:Y,deviceLoading:ee,deviceInfo:he,deviceResult:de,deviceError:oe,fetchAll:Se,switchProvider:mt,reloadOllama:Yt,setOllamaModel:Ds,reloadKimi:Ps,setKimiModel:Pt,probeOllamaModels:An,saveCodexConfig:Qt,saveOllamaConfig:Cs,saveKimiConfig:Fs,saveCodexAdvancedConfig:Vs,saveOllamaAdvancedConfig:nn,saveKimiAdvancedConfig:qs,saveCodexConfigDebounced:ut,saveOllamaConfigDebounced:os,saveKimiConfigDebounced:Qe,saveCodexConfigNow:gs,saveOllamaConfigNow:q,saveKimiConfigNow:ue,saveCodexAdvancedConfigNow:Ne,saveOllamaAdvancedConfigNow:Je,saveKimiAdvancedConfigNow:rt,activateAccount:Ft,refreshAccount:xa,startEditLabel:$s,saveLabel:li,deleteAccount:_a,startDeviceLogin:qn,cancelDeviceLogin:Gn,formatSize:me,fetchContextWindows:Me,clearContextClamp:Lt,setContextOverride:qe,setContextUtilization:dt,resetContextOverride:J,overrideAboveFloor:ze,formatCount:F,formatContextCeiling:ce,formatExpiry:xe,shortAccountKey:Ae,provenanceClass:Oe}}},Vu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Ck(e){return Vu[e]||Vu[(e||"").toLowerCase()]||"text-gray-400"}const Ek={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=K(()=>{var v;return Object.values(((v=i.value)==null?void 0:v.totals)||{}).reduce((k,T)=>k+Number(T||0),0)}),u=h(""),p=h(0),f=h([]),g=K(()=>f.value.map(v=>`${v.label} (${v.path}${v.reason?`: ${v.reason}`:""})`).join("; ")),b=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let E=null;async function O(){var D;const v=await Promise.allSettled(b.map(H=>G.get(H.path))),k=H=>v[H].status==="fulfilled"?v[H].value:null;t.value=k(0)||{};const T=k(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=k(2)||{},a.value=k(3)||{},i.value=k(4),l.value=k(5),r.value=k(6),o.value=k(7),c.value=k(8);const C=v.filter(H=>H.status==="rejected");if(f.value=v.flatMap((H,P)=>{var R;return H.status==="rejected"?[{...b[P],reason:((R=H.reason)==null?void 0:R.message)||"request failed"}]:[]}),p.value=f.value.length,C.length===v.length){const H=(D=C[0])==null?void 0:D.reason;u.value=(H==null?void 0:H.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",O()}let m=!1;function x(){m||(m=!0,O(),E||(E=setInterval(O,3e4)))}function S(){m&&(m=!1,E&&(clearInterval(E),E=null))}return Ze(x),ws(x),ks(S),xt(S),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:g,endpoints:b,retry:y,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Ck,formatAgeSeconds:aw}}},Ak={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await Zt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return Ze(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Dm=[{id:"health",label:"Health",component:Ww},{id:"resources",label:"Resources",component:Zw},{id:"logs",label:"Logs",component:Xw},{id:"config",label:"Config",component:uk},{id:"discord",label:"Discord",component:fk},{id:"host-access",label:"Host Access",component:mk},{id:"api-tokens",label:"API Tokens",component:gk},{id:"llm",label:"LLM Config",component:Tk},{id:"internals",label:"Internals",component:Ek},{id:"update",label:"Update",component:Ak}],Rk={components:{TabbedPage:$r},setup(){return{tabs:Dm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Cl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Ik=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Cl("Operations","operations","/operations",Cm),...Cl("History","history","/history",Em),...Cl("Capabilities","capabilities","/capabilities",Am),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Cl("System","system","/system",Dm)],us=zn({open:!1,query:"",selected:0});function qu(){us.query="",us.selected=0,us.open=!0}function uo(){us.open=!1}function Ok(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Nk={setup(){const e=bm(),t=h(null),s=K(()=>{const i=us.query.trim().toLowerCase();return Ik.map(l=>({...l,_score:Ok(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});as(()=>us.open,async i=>{var l;i&&(await Ct(),(l=t.value)==null||l.focus())}),as(()=>us.query,()=>{us.selected=0});function n(i){uo(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),uo();return}if(i.key==="ArrowDown")i.preventDefault(),us.selected=Math.min(us.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),us.selected=Math.max(us.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[us.selected];l&&n(l)}}return{state:us,results:s,inputEl:t,go:n,onKeydown:a,closePalette:uo}},template:`
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
  `},Ko={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Ko));const Lk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ka("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ka("path",{d:Ko[e.name]||Ko.info})])}},Mk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Gu(e){return[...e.querySelectorAll(Mk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Dk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Gu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Gu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Pk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const p=K(()=>{const R=e.value.uptime_seconds||0,V=Math.floor(R/86400),X=Math.floor(R%86400/3600),U=Math.floor(R%3600/60),N=[];return V>0&&N.push(`${V}d`),X>0&&N.push(`${X}h`),(N.length===0||V===0&&X===0)&&N.push(`${U}m`),N.join(" ")}),f=K(()=>{const R=e.value.uptime_seconds||0;return 125.66*(1-Math.min(R/86400,1))}),g=K(()=>{const R=e.value;return[{label:"Guilds",value:R.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:R.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:R.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${R.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:R.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:R.loop_count>0?"text-green-400":"",highlight:R.loop_count>0},{label:"Agents",value:R.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:R.agent_count>0?`${R.agent_count} total`:"",subColor:"text-gray-500",highlight:(R.agent_running??0)>0},{label:"Processes",value:R.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:R.process_count>0?`${R.process_count} total`:"",subColor:"text-gray-500",highlight:(R.process_running??0)>0},{label:"Schedules",value:R.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(R.schedule_failing>0?`${R.schedule_failing} failing`:"")+(R.schedule_failing>0&&R.schedule_paused>0?", ":"")+(R.schedule_paused>0?`${R.schedule_paused} paused`:"")||void 0,subColor:R.schedule_failing>0?"text-red-400":"text-yellow-400",color:R.schedule_failing>0?"text-red-400":"",highlight:R.schedule_failing>0},{label:"Users",value:R.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),b=K(()=>{const R=e.value,V=[];return V.push({label:"Bot",status:R.status==="online"?"ok":"warn",detail:R.status==="online"?"Online":"Starting"}),(R.schedule_failing||0)>0?V.push({label:"Schedules",status:"error",detail:`${R.schedule_failing} failing`}):(R.schedule_count||0)>0&&V.push({label:"Schedules",status:"ok",detail:`${R.schedule_count} configured`}),(R.loop_count||0)>0&&V.push({label:"Loops",status:"ok",detail:`${R.loop_count} active`}),(R.agent_running||0)>0&&V.push({label:"Agents",status:"ok",detail:`${R.agent_running} running`}),(R.process_running||0)>0&&V.push({label:"Processes",status:"ok",detail:`${R.process_running} running`}),V});async function E(){try{e.value=await G.get("/api/status"),s.value=null}catch(R){s.value=R.message}finally{t.value=!1}}async function O(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const R=await G.get("/api/knowledge");c.value=(Array.isArray(R)?R:[]).reduce((V,X)=>V+(X.chunks||0),0)}catch{c.value=null}}async function x(){try{const R=await G.get("/api/agents");r.value=R.filter(V=>V.status==="running")}catch{}}async function S(){d.value={...d.value,reload:!0};try{await G.post("/api/reload"),Re.success("Config reloaded")}catch(R){Re.error(R.message)}d.value={...d.value,reload:!1}}async function v(){if(!await Zt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const V=e.value.session_count;e.value={...e.value,session_count:0};try{const X=await G.post("/api/sessions/clear-all");Re.success(`Cleared ${X.count} session${X.count!==1?"s":""}`),await E()}catch(X){e.value={...e.value,session_count:V},Re.error(X.message)}d.value={...d.value,clearSessions:!1}}async function k(){if(!await Zt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const V=e.value.loop_count;e.value={...e.value,loop_count:0};try{const X=await G.post("/api/loops/stop-all");Re.success(X.result),await E()}catch(X){e.value={...e.value,loop_count:V},Re.error(X.message)}d.value={...d.value,stopLoops:!1}}function T(){t.value=!0,s.value=null,E(),O(),y(),x()}let C=null,D=null,H=null;function P(R){if(R.payload&&R.payload.tool_name){const V={...R.payload,_isNew:!0,_key:++u};n.value.unshift(V),n.value.length>10&&n.value.pop(),o.value++,V.error&&(i.value.unshift(V),i.value.length>5&&i.value.pop()),setTimeout(()=>{V._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return Ze(async()=>{await Promise.all([E(),O(),y(),x(),m()]),C=setInterval(E,15e3),D=setInterval(x,1e4),je.subscribe("events",P)}),xt(()=>{C&&clearInterval(C),D&&clearInterval(D),clearTimeout(H),je.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:p,uptimeRingOffset:f,stats:g,healthIndicators:b,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:O,fetchStatus:E,formatTime:ym,formatDuration:si,retry:T,reloadConfig:S,clearSessions:v,stopAllLoops:k}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Ku(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Fk(e){if(Array.isArray(e))return e}function $k(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function Uk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Bk(e,t){return Fk(e)||$k(e,t)||Hk(e,t)||Uk()}function Hk(e,t){if(e){if(typeof e=="string")return Ku(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Ku(e,t):void 0}}const Pm=Object.entries,Wu=Object.setPrototypeOf,zk=Object.isFrozen,jk=Object.getPrototypeOf,Vk=Object.getOwnPropertyDescriptor;let ls=Object.freeze,Ms=Object.seal,Na=Object.create,Fm=typeof Reflect<"u"&&Reflect,Wo=Fm.apply,Zo=Fm.construct;ls||(ls=function(t){return t});Ms||(Ms=function(t){return t});Wo||(Wo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Zo||(Zo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const on=Rt(Array.prototype.forEach),qk=Rt(Array.prototype.lastIndexOf),Zu=Rt(Array.prototype.pop),Ea=Rt(Array.prototype.push),Gk=Rt(Array.prototype.splice),es=Array.isArray,wi=Rt(String.prototype.toLowerCase),po=Rt(String.prototype.toString),Ju=Rt(String.prototype.match),Aa=Rt(String.prototype.replace),Yu=Rt(String.prototype.indexOf),Kk=Rt(String.prototype.trim),Wk=Rt(Number.prototype.toString),Zk=Rt(Boolean.prototype.toString),Qu=typeof BigInt>"u"?null:Rt(BigInt.prototype.toString),Xu=typeof Symbol>"u"?null:Rt(Symbol.prototype.toString),vt=Rt(Object.prototype.hasOwnProperty),mi=Rt(Object.prototype.toString),$t=Rt(RegExp.prototype.test),Qn=Jk(TypeError);function Rt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Wo(e,t,n)}}function Jk(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Zo(e,s)}}function He(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:wi;if(Wu&&Wu(e,null),!es(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(zk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Yk(e){for(let t=0;t<e.length;t++)vt(e,t)||(e[t]=null);return e}function Vt(e){const t=Na(null);for(const n of Pm(e)){var s=Bk(n,2);const a=s[0],i=s[1];vt(e,a)&&(es(i)?t[a]=Yk(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Vt(i):t[a]=i)}return t}function Qk(e){switch(typeof e){case"string":return e;case"number":return Wk(e);case"boolean":return Zk(e);case"bigint":return Qu?Qu(e):"0";case"symbol":return Xu?Xu(e):"Symbol()";case"undefined":return mi(e);case"function":case"object":{if(e===null)return mi(e);const t=e,s=Zs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:mi(n)}return mi(e)}default:return mi(e)}}function Zs(e,t){for(;e!==null;){const n=Vk(e,t);if(n){if(n.get)return Rt(n.get);if(typeof n.value=="function")return Rt(n.value)}e=jk(e)}function s(){return null}return s}function Xk(e){try{return $t(e,""),!0}catch{return!1}}const ep=ls(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),fo=ls(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),ho=ls(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),eS=ls(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),mo=ls(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tS=ls(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),tp=ls(["#text"]),sp=ls(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),go=ls(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),np=ls(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),El=ls(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sS=Ms(/{{[\w\W]*|^[\w\W]*}}/g),nS=Ms(/<%[\w\W]*|^[\w\W]*%>/g),aS=Ms(/\${[\w\W]*/g),iS=Ms(/^data-[\-\w.\u00B7-\uFFFF]+$/),lS=Ms(/^aria-[\-\w]+$/),ap=Ms(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),rS=Ms(/^(?:\w+script|data):/i),oS=Ms(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),cS=Ms(/^html$/i),dS=Ms(/^[a-z][.\w]*(-[.\w]+)+$/i),Ks={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},uS=function(){return typeof window>"u"?null:window},pS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},ip=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function $m(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:uS();const t=we=>$m(we);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ks.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,f=Zs(p,"cloneNode"),g=Zs(p,"remove"),b=Zs(p,"nextSibling"),E=Zs(p,"childNodes"),O=Zs(p,"parentNode"),y=Zs(p,"shadowRoot"),m=Zs(p,"attributes"),x=l&&l.prototype?Zs(l.prototype,"nodeType"):null,S=l&&l.prototype?Zs(l.prototype,"nodeName"):null;if(typeof i=="function"){const we=s.createElement("template");we.content&&we.content.ownerDocument&&(s=we.content.ownerDocument)}let v,k="",T,C=!1,D=0;const H=function(){if(D>0)throw Qn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(A){H(),D++;try{return v.createHTML(A)}finally{D--}},R=function(A){H(),D++;try{return v.createScriptURL(A)}finally{D--}},V=function(){return C||(T=pS(u,a),C=!0),T},X=s,U=X.implementation,N=X.createNodeIterator,I=X.createDocumentFragment,W=X.getElementsByTagName,Te=n.importNode;let Ce=ip();t.isSupported=typeof Pm=="function"&&typeof O=="function"&&U&&U.createHTMLDocument!==void 0;const re=sS,ve=nS,ne=aS,be=iS,Z=lS,B=rS,ie=oS,le=dS;let _e=ap,ye=null;const $e=He({},[...ep,...fo,...ho,...mo,...tp]);let w=null;const L=He({},[...sp,...go,...np,...El]);let $=Object.seal(Na(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),te=null,Y=null;const ee=Object.seal(Na(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let he=!0,de=!0,oe=!1,se=!0,ae=!1,me=!0,F=!1,ce=!1,xe=!1,Ae=!1,Oe=!1,ze=!1,qe=!0,dt=!1;const J="user-content-";let Se=!0,Ie=!1,Me={},Ge=null;const Ue=He({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let mt=null;const Yt=He({},["audio","video","img","source","image","track"]);let Ds=null;const An=He({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ts="http://www.w3.org/1998/Math/MathML",Ps="http://www.w3.org/2000/svg",Pt="http://www.w3.org/1999/xhtml";let Qt=Pt,Vs=!1,Cs=null;const nn=He({},[Ts,Ps,Pt],po);let Fs=He({},["mi","mo","mn","ms","mtext"]),qs=He({},["annotation-xml"]);const Vn=He({},["title","style","font","a","script"]);let ut=null;const rs=["application/xhtml+xml","text/html"],os="text/html";let Qe=null,gs=null;const q=s.createElement("form"),ue=function(A){return A instanceof RegExp||A instanceof Function},Ne=function(){let A=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(gs&&gs===A)return;(!A||typeof A!="object")&&(A={}),A=Vt(A),ut=rs.indexOf(A.PARSER_MEDIA_TYPE)===-1?os:A.PARSER_MEDIA_TYPE,Qe=ut==="application/xhtml+xml"?po:wi,ye=vt(A,"ALLOWED_TAGS")&&es(A.ALLOWED_TAGS)?He({},A.ALLOWED_TAGS,Qe):$e,w=vt(A,"ALLOWED_ATTR")&&es(A.ALLOWED_ATTR)?He({},A.ALLOWED_ATTR,Qe):L,Cs=vt(A,"ALLOWED_NAMESPACES")&&es(A.ALLOWED_NAMESPACES)?He({},A.ALLOWED_NAMESPACES,po):nn,Ds=vt(A,"ADD_URI_SAFE_ATTR")&&es(A.ADD_URI_SAFE_ATTR)?He(Vt(An),A.ADD_URI_SAFE_ATTR,Qe):An,mt=vt(A,"ADD_DATA_URI_TAGS")&&es(A.ADD_DATA_URI_TAGS)?He(Vt(Yt),A.ADD_DATA_URI_TAGS,Qe):Yt,Ge=vt(A,"FORBID_CONTENTS")&&es(A.FORBID_CONTENTS)?He({},A.FORBID_CONTENTS,Qe):Ue,te=vt(A,"FORBID_TAGS")&&es(A.FORBID_TAGS)?He({},A.FORBID_TAGS,Qe):Vt({}),Y=vt(A,"FORBID_ATTR")&&es(A.FORBID_ATTR)?He({},A.FORBID_ATTR,Qe):Vt({}),Me=vt(A,"USE_PROFILES")?A.USE_PROFILES&&typeof A.USE_PROFILES=="object"?Vt(A.USE_PROFILES):A.USE_PROFILES:!1,he=A.ALLOW_ARIA_ATTR!==!1,de=A.ALLOW_DATA_ATTR!==!1,oe=A.ALLOW_UNKNOWN_PROTOCOLS||!1,se=A.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ae=A.SAFE_FOR_TEMPLATES||!1,me=A.SAFE_FOR_XML!==!1,F=A.WHOLE_DOCUMENT||!1,Ae=A.RETURN_DOM||!1,Oe=A.RETURN_DOM_FRAGMENT||!1,ze=A.RETURN_TRUSTED_TYPE||!1,xe=A.FORCE_BODY||!1,qe=A.SANITIZE_DOM!==!1,dt=A.SANITIZE_NAMED_PROPS||!1,Se=A.KEEP_CONTENT!==!1,Ie=A.IN_PLACE||!1,_e=Xk(A.ALLOWED_URI_REGEXP)?A.ALLOWED_URI_REGEXP:ap,Qt=typeof A.NAMESPACE=="string"?A.NAMESPACE:Pt,Fs=vt(A,"MATHML_TEXT_INTEGRATION_POINTS")&&A.MATHML_TEXT_INTEGRATION_POINTS&&typeof A.MATHML_TEXT_INTEGRATION_POINTS=="object"?Vt(A.MATHML_TEXT_INTEGRATION_POINTS):He({},["mi","mo","mn","ms","mtext"]),qs=vt(A,"HTML_INTEGRATION_POINTS")&&A.HTML_INTEGRATION_POINTS&&typeof A.HTML_INTEGRATION_POINTS=="object"?Vt(A.HTML_INTEGRATION_POINTS):He({},["annotation-xml"]);const Q=vt(A,"CUSTOM_ELEMENT_HANDLING")&&A.CUSTOM_ELEMENT_HANDLING&&typeof A.CUSTOM_ELEMENT_HANDLING=="object"?Vt(A.CUSTOM_ELEMENT_HANDLING):Na(null);if($=Na(null),vt(Q,"tagNameCheck")&&ue(Q.tagNameCheck)&&($.tagNameCheck=Q.tagNameCheck),vt(Q,"attributeNameCheck")&&ue(Q.attributeNameCheck)&&($.attributeNameCheck=Q.attributeNameCheck),vt(Q,"allowCustomizedBuiltInElements")&&typeof Q.allowCustomizedBuiltInElements=="boolean"&&($.allowCustomizedBuiltInElements=Q.allowCustomizedBuiltInElements),ae&&(de=!1),Oe&&(Ae=!0),Me&&(ye=He({},tp),w=Na(null),Me.html===!0&&(He(ye,ep),He(w,sp)),Me.svg===!0&&(He(ye,fo),He(w,go),He(w,El)),Me.svgFilters===!0&&(He(ye,ho),He(w,go),He(w,El)),Me.mathMl===!0&&(He(ye,mo),He(w,np),He(w,El))),ee.tagCheck=null,ee.attributeCheck=null,vt(A,"ADD_TAGS")&&(typeof A.ADD_TAGS=="function"?ee.tagCheck=A.ADD_TAGS:es(A.ADD_TAGS)&&(ye===$e&&(ye=Vt(ye)),He(ye,A.ADD_TAGS,Qe))),vt(A,"ADD_ATTR")&&(typeof A.ADD_ATTR=="function"?ee.attributeCheck=A.ADD_ATTR:es(A.ADD_ATTR)&&(w===L&&(w=Vt(w)),He(w,A.ADD_ATTR,Qe))),vt(A,"ADD_URI_SAFE_ATTR")&&es(A.ADD_URI_SAFE_ATTR)&&He(Ds,A.ADD_URI_SAFE_ATTR,Qe),vt(A,"FORBID_CONTENTS")&&es(A.FORBID_CONTENTS)&&(Ge===Ue&&(Ge=Vt(Ge)),He(Ge,A.FORBID_CONTENTS,Qe)),vt(A,"ADD_FORBID_CONTENTS")&&es(A.ADD_FORBID_CONTENTS)&&(Ge===Ue&&(Ge=Vt(Ge)),He(Ge,A.ADD_FORBID_CONTENTS,Qe)),Se&&(ye["#text"]=!0),F&&He(ye,["html","head","body"]),ye.table&&(He(ye,["tbody"]),delete te.tbody),A.TRUSTED_TYPES_POLICY){if(typeof A.TRUSTED_TYPES_POLICY.createHTML!="function")throw Qn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof A.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Qn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const fe=v;v=A.TRUSTED_TYPES_POLICY;try{k=P("")}catch(Le){throw v=fe,Le}}else A.TRUSTED_TYPES_POLICY===null?(v=void 0,k=""):(v===void 0&&(v=V()),v&&typeof k=="string"&&(k=P("")));(Ce.uponSanitizeElement.length>0||Ce.uponSanitizeAttribute.length>0)&&ye===$e&&(ye=Vt(ye)),Ce.uponSanitizeAttribute.length>0&&w===L&&(w=Vt(w)),ls&&ls(A),gs=A},Je=He({},[...fo,...ho,...eS]),rt=He({},[...mo,...tS]),Lt=function(A){let Q=O(A);(!Q||!Q.tagName)&&(Q={namespaceURI:Qt,tagName:"template"});const fe=wi(A.tagName),Le=wi(Q.tagName);return Cs[A.namespaceURI]?A.namespaceURI===Ps?Q.namespaceURI===Pt?fe==="svg":Q.namespaceURI===Ts?fe==="svg"&&(Le==="annotation-xml"||Fs[Le]):!!Je[fe]:A.namespaceURI===Ts?Q.namespaceURI===Pt?fe==="math":Q.namespaceURI===Ps?fe==="math"&&qs[Le]:!!rt[fe]:A.namespaceURI===Pt?Q.namespaceURI===Ps&&!qs[Le]||Q.namespaceURI===Ts&&!Fs[Le]?!1:!rt[fe]&&(Vn[fe]||!Je[fe]):!!(ut==="application/xhtml+xml"&&Cs[A.namespaceURI]):!1},Ft=function(A){Ea(t.removed,{element:A});try{O(A).removeChild(A)}catch{if(g(A),!O(A))throw Qn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},xa=function(A){const Q=E?E(A):A.childNodes;if(Q){const Le=[];on(Q,_=>{Ea(Le,_)}),on(Le,_=>{try{g(_)}catch{}})}const fe=m?m(A):null;if(fe)for(let Le=fe.length-1;Le>=0;--Le){const _=fe[Le],M=_&&_.name;if(typeof M=="string")try{A.removeAttribute(M)}catch{}}},$s=function(A,Q){try{Ea(t.removed,{attribute:Q.getAttributeNode(A),from:Q})}catch{Ea(t.removed,{attribute:null,from:Q})}if(Q.removeAttribute(A),A==="is")if(Ae||Oe)try{Ft(Q)}catch{}else try{Q.setAttribute(A,"")}catch{}},li=function(A){const Q=m?m(A):A.attributes;if(Q)for(let fe=Q.length-1;fe>=0;--fe){const Le=Q[fe],_=Le&&Le.name;if(!(typeof _!="string"||w[Qe(_)]))try{A.removeAttribute(_)}catch{}}},_a=function(A){const Q=[A];for(;Q.length>0;){const fe=Q.pop();(x?x(fe):fe.nodeType)===Ks.element&&li(fe);const _=E?E(fe):fe.childNodes;if(_)for(let M=_.length-1;M>=0;--M)Q.push(_[M])}},qn=function(A){let Q=null,fe=null;if(xe)A="<remove></remove>"+A;else{const M=Ju(A,/^[\r\n\t ]+/);fe=M&&M[0]}ut==="application/xhtml+xml"&&Qt===Pt&&(A='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+A+"</body></html>");const Le=v?P(A):A;if(Qt===Pt)try{Q=new d().parseFromString(Le,ut)}catch{}if(!Q||!Q.documentElement){Q=U.createDocument(Qt,"template",null);try{Q.documentElement.innerHTML=Vs?k:Le}catch{}}const _=Q.body||Q.documentElement;return A&&fe&&_.insertBefore(s.createTextNode(fe),_.childNodes[0]||null),Qt===Pt?W.call(Q,F?"html":"body")[0]:F?Q.documentElement:_},wa=function(A){return N.call(A.ownerDocument||A,A,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Gn=function(A){var Q,fe;A.normalize();const Le=N.call(A.ownerDocument||A,A,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let _=Le.nextNode();for(;_;){let j=_.data;on([re,ve,ne],pe=>{j=Aa(j,pe," ")}),_.data=j,_=Le.nextNode()}const M=(Q=(fe=A.querySelectorAll)===null||fe===void 0?void 0:fe.call(A,"template"))!==null&&Q!==void 0?Q:[];on(Array.from(M),j=>{ge(j.content)&&Gn(j.content)})},z=function(A){const Q=S?S(A):null;return typeof Q!="string"||Qe(Q)!=="form"?!1:typeof A.nodeName!="string"||typeof A.textContent!="string"||typeof A.removeChild!="function"||A.attributes!==m(A)||typeof A.removeAttribute!="function"||typeof A.setAttribute!="function"||typeof A.namespaceURI!="string"||typeof A.insertBefore!="function"||typeof A.hasChildNodes!="function"||A.nodeType!==x(A)||A.childNodes!==E(A)},ge=function(A){if(!x||typeof A!="object"||A===null)return!1;try{return x(A)===Ks.documentFragment}catch{return!1}},Ee=function(A){if(!x||typeof A!="object"||A===null)return!1;try{return typeof x(A)=="number"}catch{return!1}};function _t(we,A,Q){on(we,fe=>{fe.call(t,A,Q,gs)})}const Kn=function(A){let Q=null;if(_t(Ce.beforeSanitizeElements,A,null),z(A))return Ft(A),!0;const fe=Qe(S?S(A):A.nodeName);if(_t(Ce.uponSanitizeElement,A,{tagName:fe,allowedTags:ye}),me&&A.hasChildNodes()&&!Ee(A.firstElementChild)&&$t(/<[/\w!]/g,A.innerHTML)&&$t(/<[/\w!]/g,A.textContent)||me&&A.namespaceURI===Pt&&fe==="style"&&Ee(A.firstElementChild)||A.nodeType===Ks.progressingInstruction||me&&A.nodeType===Ks.comment&&$t(/<[/\w]/g,A.data))return Ft(A),!0;if(te[fe]||!(ee.tagCheck instanceof Function&&ee.tagCheck(fe))&&!ye[fe]){if(!te[fe]&&cl(fe)&&($.tagNameCheck instanceof RegExp&&$t($.tagNameCheck,fe)||$.tagNameCheck instanceof Function&&$.tagNameCheck(fe)))return!1;if(Se&&!Ge[fe]){const _=O(A),M=E(A);if(M&&_){const j=M.length;for(let pe=j-1;pe>=0;--pe){const De=Ie?M[pe]:f(M[pe],!0);_.insertBefore(De,b(A))}}}return Ft(A),!0}return(x?x(A):A.nodeType)===Ks.element&&!Lt(A)||(fe==="noscript"||fe==="noembed"||fe==="noframes")&&$t(/<\/no(script|embed|frames)/i,A.innerHTML)?(Ft(A),!0):(ae&&A.nodeType===Ks.text&&(Q=A.textContent,on([re,ve,ne],_=>{Q=Aa(Q,_," ")}),A.textContent!==Q&&(Ea(t.removed,{element:A.cloneNode()}),A.textContent=Q)),_t(Ce.afterSanitizeElements,A,null),!1)},Wn=function(A,Q,fe){if(Y[Q]||qe&&(Q==="id"||Q==="name")&&(fe in s||fe in q))return!1;const Le=w[Q]||ee.attributeCheck instanceof Function&&ee.attributeCheck(Q,A);if(!(de&&!Y[Q]&&$t(be,Q))){if(!(he&&$t(Z,Q))){if(!Le||Y[Q]){if(!(cl(A)&&($.tagNameCheck instanceof RegExp&&$t($.tagNameCheck,A)||$.tagNameCheck instanceof Function&&$.tagNameCheck(A))&&($.attributeNameCheck instanceof RegExp&&$t($.attributeNameCheck,Q)||$.attributeNameCheck instanceof Function&&$.attributeNameCheck(Q,A))||Q==="is"&&$.allowCustomizedBuiltInElements&&($.tagNameCheck instanceof RegExp&&$t($.tagNameCheck,fe)||$.tagNameCheck instanceof Function&&$.tagNameCheck(fe))))return!1}else if(!Ds[Q]){if(!$t(_e,Aa(fe,ie,""))){if(!((Q==="src"||Q==="xlink:href"||Q==="href")&&A!=="script"&&Yu(fe,"data:")===0&&mt[A])){if(!(oe&&!$t(B,Aa(fe,ie,"")))){if(fe)return!1}}}}}}return!0},Rn=He({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),cl=function(A){return!Rn[wi(A)]&&$t(le,A)},dl=function(A){_t(Ce.beforeSanitizeAttributes,A,null);const Q=A.attributes;if(!Q||z(A))return;const fe={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:w,forceKeepAttr:void 0};let Le=Q.length;for(;Le--;){const _=Q[Le],M=_.name,j=_.namespaceURI,pe=_.value,De=Qe(M),gt=pe;let it=M==="value"?gt:Kk(gt);if(fe.attrName=De,fe.attrValue=it,fe.keepAttr=!0,fe.forceKeepAttr=void 0,_t(Ce.uponSanitizeAttribute,A,fe),it=fe.attrValue,dt&&(De==="id"||De==="name")&&Yu(it,J)!==0&&($s(M,A),it=J+it),me&&$t(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,it)){$s(M,A);continue}if(De==="attributename"&&Ju(it,"href")){$s(M,A);continue}if(fe.forceKeepAttr)continue;if(!fe.keepAttr){$s(M,A);continue}if(!se&&$t(/\/>/i,it)){$s(M,A);continue}ae&&on([re,ve,ne],oi=>{it=Aa(it,oi," ")});const Gs=Qe(A.nodeName);if(!Wn(Gs,De,it)){$s(M,A);continue}if(v&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!j)switch(u.getAttributeType(Gs,De)){case"TrustedHTML":{it=P(it);break}case"TrustedScriptURL":{it=R(it);break}}if(it!==gt)try{j?A.setAttributeNS(j,M,it):A.setAttribute(M,it),z(A)?Ft(A):Zu(t.removed)}catch{$s(M,A)}}_t(Ce.afterSanitizeAttributes,A,null)},Zn=function(A){let Q=null;const fe=wa(A);for(_t(Ce.beforeSanitizeShadowDOM,A,null);Q=fe.nextNode();)if(_t(Ce.uponSanitizeShadowNode,Q,null),Kn(Q),dl(Q),ge(Q.content)&&Zn(Q.content),(x?x(Q):Q.nodeType)===Ks.element){const _=y?y(Q):Q.shadowRoot;ge(_)&&(ri(_),Zn(_))}_t(Ce.afterSanitizeShadowDOM,A,null)},ri=function(A){const Q=[{node:A,shadow:null}];for(;Q.length>0;){const fe=Q.pop();if(fe.shadow){Zn(fe.shadow);continue}const Le=fe.node,M=(x?x(Le):Le.nodeType)===Ks.element,j=E?E(Le):Le.childNodes;if(j)for(let pe=j.length-1;pe>=0;--pe)Q.push({node:j[pe],shadow:null});if(M){const pe=S?S(Le):null;if(typeof pe=="string"&&Qe(pe)==="template"){const De=Le.content;ge(De)&&Q.push({node:De,shadow:null})}}if(M){const pe=y?y(Le):Le.shadowRoot;ge(pe)&&Q.push({node:null,shadow:pe},{node:pe,shadow:null})}}};return t.sanitize=function(we){let A=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},Q=null,fe=null,Le=null,_=null;if(Vs=!we,Vs&&(we="<!-->"),typeof we!="string"&&!Ee(we)&&(we=Qk(we),typeof we!="string"))throw Qn("dirty is not a string, aborting");if(!t.isSupported)return we;ce||Ne(A),t.removed=[];const M=Ie&&typeof we!="string"&&Ee(we);if(M){const De=S?S(we):we.nodeName;if(typeof De=="string"){const gt=Qe(De);if(!ye[gt]||te[gt])throw Qn("root node is forbidden and cannot be sanitized in-place")}if(z(we))throw Qn("root node is clobbered and cannot be sanitized in-place");try{ri(we)}catch(gt){throw xa(we),gt}}else if(Ee(we))Q=qn("<!---->"),fe=Q.ownerDocument.importNode(we,!0),fe.nodeType===Ks.element&&fe.nodeName==="BODY"||fe.nodeName==="HTML"?Q=fe:Q.appendChild(fe),ri(fe);else{if(!Ae&&!ae&&!F&&we.indexOf("<")===-1)return v&&ze?P(we):we;if(Q=qn(we),!Q)return Ae?null:ze?k:""}Q&&xe&&Ft(Q.firstChild);const j=wa(M?we:Q);try{for(;Le=j.nextNode();)Kn(Le),dl(Le),ge(Le.content)&&Zn(Le.content)}catch(De){throw M&&xa(we),De}if(M)return on(t.removed,De=>{De.element&&_a(De.element)}),ae&&Gn(we),we;if(Ae){if(ae&&Gn(Q),Oe)for(_=I.call(Q.ownerDocument);Q.firstChild;)_.appendChild(Q.firstChild);else _=Q;return(w.shadowroot||w.shadowrootmode)&&(_=Te.call(n,_,!0)),_}let pe=F?Q.outerHTML:Q.innerHTML;return F&&ye["!doctype"]&&Q.ownerDocument&&Q.ownerDocument.doctype&&Q.ownerDocument.doctype.name&&$t(cS,Q.ownerDocument.doctype.name)&&(pe="<!DOCTYPE "+Q.ownerDocument.doctype.name+`>
`+pe),ae&&on([re,ve,ne],De=>{pe=Aa(pe,De," ")}),v&&ze?P(pe):pe},t.setConfig=function(){let we=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ne(we),ce=!0},t.clearConfig=function(){gs=null,ce=!1,v=T,k=""},t.isValidAttribute=function(we,A,Q){gs||Ne({});const fe=Qe(we),Le=Qe(A);return Wn(fe,Le,Q)},t.addHook=function(we,A){typeof A=="function"&&Ea(Ce[we],A)},t.removeHook=function(we,A){if(A!==void 0){const Q=qk(Ce[we],A);return Q===-1?void 0:Gk(Ce[we],Q,1)[0]}return Zu(Ce[we])},t.removeHooks=function(we){Ce[we]=[]},t.removeAllHooks=function(){Ce=ip()},t}var lp=$m();function Xc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ya=Xc();function Um(e){ya=e}var Ni={exec:()=>null};function at(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ns.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ns={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},fS=/^(?:[ \t]*(?:\n|$))+/,hS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,ol=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,gS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,ed=/(?:[*+-]|\d{1,9}[.)])/,Bm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Hm=at(Bm).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),vS=at(Bm).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),td=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bS=/^[^\n]+/,sd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yS=at(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",sd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xS=at(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,ed).getRegex(),Br="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",nd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_S=at("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",nd).replace("tag",Br).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),zm=at(td).replace("hr",ol).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Br).getRegex(),wS=at(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",zm).getRegex(),ad={blockquote:wS,code:hS,def:yS,fences:mS,heading:gS,hr:ol,html:_S,lheading:Hm,list:xS,newline:fS,paragraph:zm,table:Ni,text:bS},rp=at("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",ol).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Br).getRegex(),kS={...ad,lheading:vS,table:rp,paragraph:at(td).replace("hr",ol).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",rp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Br).getRegex()},SS={...ad,html:at(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",nd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Ni,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:at(td).replace("hr",ol).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Hm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},TS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,CS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,jm=/^( {2,}|\\)\n(?!\s*$)/,ES=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Hr=/[\p{P}\p{S}]/u,id=/[\s\p{P}\p{S}]/u,Vm=/[^\s\p{P}\p{S}]/u,AS=at(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,id).getRegex(),qm=/(?!~)[\p{P}\p{S}]/u,RS=/(?!~)[\s\p{P}\p{S}]/u,IS=/(?:[^\s\p{P}\p{S}]|~)/u,OS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Gm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,NS=at(Gm,"u").replace(/punct/g,Hr).getRegex(),LS=at(Gm,"u").replace(/punct/g,qm).getRegex(),Km="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",MS=at(Km,"gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,Hr).getRegex(),DS=at(Km,"gu").replace(/notPunctSpace/g,IS).replace(/punctSpace/g,RS).replace(/punct/g,qm).getRegex(),PS=at("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,Hr).getRegex(),FS=at(/\\(punct)/,"gu").replace(/punct/g,Hr).getRegex(),$S=at(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),US=at(nd).replace("(?:-->|$)","-->").getRegex(),BS=at("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",US).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),cr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,HS=at(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",cr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Wm=at(/^!?\[(label)\]\[(ref)\]/).replace("label",cr).replace("ref",sd).getRegex(),Zm=at(/^!?\[(ref)\](?:\[\])?/).replace("ref",sd).getRegex(),zS=at("reflink|nolink(?!\\()","g").replace("reflink",Wm).replace("nolink",Zm).getRegex(),ld={_backpedal:Ni,anyPunctuation:FS,autolink:$S,blockSkip:OS,br:jm,code:CS,del:Ni,emStrongLDelim:NS,emStrongRDelimAst:MS,emStrongRDelimUnd:PS,escape:TS,link:HS,nolink:Zm,punctuation:AS,reflink:Wm,reflinkSearch:zS,tag:BS,text:ES,url:Ni},jS={...ld,link:at(/^!?\[(label)\]\((.*?)\)/).replace("label",cr).getRegex(),reflink:at(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",cr).getRegex()},Jo={...ld,emStrongRDelimAst:DS,emStrongLDelim:LS,url:at(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},VS={...Jo,br:at(jm).replace("{2,}","*").getRegex(),text:at(Jo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Al={normal:ad,gfm:kS,pedantic:SS},gi={normal:ld,gfm:Jo,breaks:VS,pedantic:jS},qS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},op=e=>qS[e];function Js(e,t){if(t){if(ns.escapeTest.test(e))return e.replace(ns.escapeReplace,op)}else if(ns.escapeTestNoEncode.test(e))return e.replace(ns.escapeReplaceNoEncode,op);return e}function cp(e){try{e=encodeURI(e).replace(ns.percentDecode,"%")}catch{return null}return e}function dp(e,t){var i;const s=e.replace(ns.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ns.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ns.slashPipe,"|");return n}function vi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function GS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function up(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function KS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var dr=class{constructor(e){ot(this,"options");ot(this,"rules");ot(this,"lexer");this.options=e||ya}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:vi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=KS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=vi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:vi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=vi(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,g=f.raw+`
`+s.join(`
`),b=this.blockquote(g);i[i.length-1]=b,n=n.substring(0,n.length-f.raw.length)+b.raw,a=a.substring(0,a.length-f.text.length)+b.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,g=f.raw+`
`+s.join(`
`),b=this.list(g);i[i.length-1]=b,n=n.substring(0,n.length-p.raw.length)+b.raw,a=a.substring(0,a.length-f.raw.length)+b.raw,s=g.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,O=>" ".repeat(3*O.length)),p=e.split(`
`,1)[0],f=!u.trim(),g=0;if(this.options.pedantic?(g=2,d=u.trimStart()):f?g=t[1].length+1:(g=t[2].search(this.rules.other.nonSpaceChar),g=g>4?1:g,d=u.slice(g),g+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const O=this.rules.other.nextBulletRegex(g),y=this.rules.other.hrRegex(g),m=this.rules.other.fencesBeginRegex(g),x=this.rules.other.headingBeginRegex(g),S=this.rules.other.htmlBeginRegex(g);for(;e;){const v=e.split(`
`,1)[0];let k;if(p=v,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),k=p):k=p.replace(this.rules.other.tabCharGlobal,"    "),m.test(p)||x.test(p)||S.test(p)||O.test(p)||y.test(p))break;if(k.search(this.rules.other.nonSpaceChar)>=g||!p.trim())d+=`
`+k.slice(g);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||x.test(u)||y.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=v+`
`,e=e.substring(v.length+1),u=k.slice(g)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let b=null,E;this.options.gfm&&(b=this.rules.other.listIsTask.exec(d),b&&(E=b[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!b,checked:E,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=dp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(dp(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=vi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=GS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),up(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return up(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const g=p.slice(1,-1);return{type:"em",raw:p,text:g,tokens:this.lexer.inlineTokens(g)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},gn=class Yo{constructor(t){ot(this,"tokens");ot(this,"options");ot(this,"state");ot(this,"tokenizer");ot(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ya,this.options.tokenizer=this.options.tokenizer||new dr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ns,block:Al.normal,inline:gi.normal};this.options.pedantic?(s.block=Al.pedantic,s.inline=gi.pedantic):this.options.gfm&&(s.block=Al.gfm,this.options.breaks?s.inline=gi.breaks:s.inline=gi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Al,inline:gi}}static lex(t,s){return new Yo(s).lex(t)}static lexInline(t,s){return new Yo(s).inlineTokens(t)}lex(t){t=t.replace(ns.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ns.tabCharGlobal,"    ").replace(ns.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let g;this.options.extensions.startInline.forEach(b=>{g=b.call({lexer:this},f),typeof g=="number"&&g>=0&&(p=Math.min(p,g))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},ur=class{constructor(e){ot(this,"options");ot(this,"parser");this.options=e||ya}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ns.notSpaceStart))==null?void 0:i[0],a=e.replace(ns.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Js(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=cp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Js(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=cp(e);if(a===null)return Js(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Js(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Js(e.text)}},rd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},vn=class Qo{constructor(t){ot(this,"options");ot(this,"renderer");ot(this,"textRenderer");this.options=t||ya,this.options.renderer=this.options.renderer||new ur,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new rd}static parse(t,s){return new Qo(s).parse(t)}static parseInline(t,s){return new Qo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},vo,Dl=(vo=class{constructor(e){ot(this,"options");ot(this,"block");this.options=e||ya}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?gn.lex:gn.lexInline}provideParser(){return this.block?vn.parse:vn.parseInline}},ot(vo,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),vo),WS=class{constructor(...e){ot(this,"defaults",Xc());ot(this,"options",this.setOptions);ot(this,"parse",this.parseMarkdown(!0));ot(this,"parseInline",this.parseMarkdown(!1));ot(this,"Parser",vn);ot(this,"Renderer",ur);ot(this,"TextRenderer",rd);ot(this,"Lexer",gn);ot(this,"Tokenizer",dr);ot(this,"Hooks",Dl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new ur(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new dr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Dl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Dl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return gn.lex(e,t??this.defaults)}parser(e,t){return vn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?gn.lex:gn.lexInline,o=i.hooks?i.hooks.provideParser():e?vn.parse:vn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Js(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},fa=new WS;function st(e,t){return fa.parse(e,t)}st.options=st.setOptions=function(e){return fa.setOptions(e),st.defaults=fa.defaults,Um(st.defaults),st};st.getDefaults=Xc;st.defaults=ya;st.use=function(...e){return fa.use(...e),st.defaults=fa.defaults,Um(st.defaults),st};st.walkTokens=function(e,t){return fa.walkTokens(e,t)};st.parseInline=fa.parseInline;st.Parser=vn;st.parser=vn.parse;st.Renderer=ur;st.TextRenderer=rd;st.Lexer=gn;st.lexer=gn.lex;st.Tokenizer=dr;st.Hooks=Dl;st.parse=st;st.options;st.setOptions;st.use;st.walkTokens;st.parseInline;vn.parse;gn.lex;const ZS={breaks:!0,gfm:!0};function pp(e){if(!e)return"";try{if(typeof st<"u"&&st.parse){const t=st.parse(e,ZS);return typeof lp<"u"?lp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function JS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const YS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function QS(e){return YS[e]||"wrench"}const XS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function fp(e){if(!e)return[];const t=e.match(XS);return t?[...new Set(t)]:[]}const e1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=K(()=>t.value.trim().length>0&&!s.value),u=h(je.state||"disconnected");let p=null,f=null;const g=K(()=>{const U=u.value;return U==="connected"?"Connected":U==="reconnecting"?"Reconnecting…":U==="connecting"?"Connecting…":"REST fallback"}),b=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],E=K(()=>{const U=Math.floor(i.value/4)%b.length,N=i.value;return N>3?`${b[U]} (${N}s)`:b[0]});function O(){Ct(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!a.value)return;const U=a.value;U.style.height="auto",U.style.height=Math.min(U.scrollHeight,120)+"px"}function m(U,N,I={}){const W={id:++o,role:U,content:N,timestamp:Date.now(),html:U==="bot"?pp(N):"",tools_used:I.tools_used||[],is_error:I.is_error||!1,images:U==="bot"?fp(N):[],files:I.files||[],_showTools:!1};return e.value.push(W),O(),U==="bot"&&Ct(()=>x()),W}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(N=>{N.setAttribute("data-copy","true"),N.style.position="relative";const I=document.createElement("button");I.className="chat-code-copy",I.textContent="Copy",I.addEventListener("click",()=>{const W=N.querySelector("code"),Te=W?W.textContent:N.textContent;navigator.clipboard.writeText(Te).then(()=>{I.textContent="Copied!",setTimeout(()=>{I.textContent="Copy"},1500)}).catch(()=>{})}),N.appendChild(I)})}function S(U){if(U===0)return!0;const N=e.value[U-1],I=e.value[U],W=new Date(N.timestamp).toDateString(),Te=new Date(I.timestamp).toDateString();return W!==Te}function v(U){const N=new Date(U),I=new Date;if(N.toDateString()===I.toDateString())return"Today";const W=new Date(I);return W.setDate(W.getDate()-1),N.toDateString()===W.toDateString()?"Yesterday":N.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function k(U){t.value=U,Ct(()=>V())}function T(U){window.open(U,"_blank","noopener")}function C(U){U.target.style.display="none"}function D(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function H(){r&&(clearInterval(r),r=null),i.value=0}function P(U){s.value&&(s.value=!1,H(),U.type==="chat_response"?m("bot",U.content,{tools_used:U.tools_used||[],is_error:U.is_error||!1,files:U.files||[]}):U.type==="chat_error"&&m("bot",U.error||"Unknown error",{is_error:!0}),Ct(()=>{var N;return(N=a.value)==null?void 0:N.focus()}))}async function R(U){try{const N=await G.post("/api/chat",{content:U,channel_id:l.value});m("bot",N.response,{tools_used:N.tools_used||[],is_error:N.is_error||!1,files:N.files||[]})}catch(N){m("bot",N.message||"Failed to send message",{is_error:!0})}}async function V(){const U=t.value.trim();if(!U||s.value)return;m("user",U),t.value="",s.value=!0,D(),a.value&&(a.value.style.height="auto"),je.connected&&je.sendChat(U,{channelId:l.value})||(await R(U),s.value=!1,H()),Ct(()=>{var I;return(I=a.value)==null?void 0:I.focus()})}async function X(){try{if(!l.value){const N=await G.get("/api/auth/session");l.value=N.channel_id||N.user_id||"web-user"}const U=await G.get("/api/sessions/"+encodeURIComponent(l.value));if(U&&U.messages&&U.messages.length>0){for(const N of U.messages){const I=N.role==="user"?"user":"bot";let W=N.content||"";if(I==="user"){const Ce=W.match(/^\[.*?\]:\s*/);Ce&&(W=W.slice(Ce[0].length))}if(!W.trim())continue;const Te={id:++o,role:I,content:W,timestamp:N.timestamp?N.timestamp*1e3:Date.now(),html:I==="bot"?pp(W):"",tools_used:[],is_error:!1,images:I==="bot"?fp(W):[],files:[],_showTools:!1};e.value.push(Te)}Ct(()=>{O(),x()})}}catch{}}return Ze(()=>{je.subscribe("chat",P),u.value=je.state||"disconnected",p=je.onStateChange,f=(U,N)=>{u.value=U,p&&p(U,N)},je.onStateChange=f,X(),Ct(()=>{var U;return(U=a.value)==null?void 0:U.focus()})}),xt(()=>{je.unsubscribe("chat",P),je.onStateChange===f&&(je.onStateChange=p),H()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:g,typingText:E,suggestions:c,send:V,autoResize:y,formatTime:JS,formatDate:v,showDateSeparator:S,useSuggestion:k,openImage:T,onImageError:C,getToolIcon:QS}}},t1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),g=K(()=>e.value==="custom"),b=K(()=>[...i.value,...l.value]),E=K(()=>l.value.includes(e.value)),O=K(()=>{var T;return g.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),y=K(()=>{var T;return g.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),m=K(()=>{var T;return g.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function x(){d.value=!0;try{const T=await G.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function v(){const T=u.value.trim();if(T){f.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:T,display_name:O.value,identity:y.value,voice:m.value}),p.value=!1,u.value="",await x(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{f.value=!1}}}async function k(){if(await Zt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(C){c.value=C.message}}}return Ze(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:b,isCustom:g,isUserPreset:E,previewName:O,previewIdentity:y,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:v,deletePreset:k,builtinPresets:i,userPresets:l}},template:`
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
  `},wt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Jm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Pk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:e1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:gw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:kw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Vw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:t1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Rk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:wt("/operations","live")},{path:"/agents",redirect:wt("/operations","agents")},{path:"/loops",redirect:wt("/operations","loops")},{path:"/processes",redirect:wt("/operations","processes")},{path:"/schedules",redirect:wt("/operations","schedules")},{path:"/audit",redirect:wt("/history","audit")},{path:"/sessions",redirect:wt("/history","sessions")},{path:"/traces",redirect:wt("/history","traces")},{path:"/usage",redirect:wt("/history","usage")},{path:"/tools",redirect:wt("/capabilities","tools")},{path:"/skills",redirect:wt("/capabilities","skills")},{path:"/mcp",redirect:wt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:wt("/capabilities","knowledge")},{path:"/memory",redirect:wt("/capabilities","memory")},{path:"/learned",redirect:wt("/capabilities","learned")},{path:"/health",redirect:wt("/system","health")},{path:"/resources",redirect:wt("/system","resources")},{path:"/logs",redirect:wt("/system","logs")},{path:"/config",redirect:wt("/system","config")},{path:"/host-access",redirect:wt("/system","host-access")},{path:"/internals",redirect:wt("/system","internals")}],Li=tw({history:L_(),routes:Jm});Li.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const s1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const g=h("starting"),b=h(""),E=Jm.filter(N=>N.meta),O=K(()=>["Workspace","Operate","Observe","Manage"].map(N=>({name:N,routes:E.filter(I=>I.meta.section===N)})).filter(N=>N.routes.length)),y=K(()=>{var N;return((N=Li.currentRoute.value.meta)==null?void 0:N.label)||"Odin"}),m=K(()=>{var N;return((N=Li.currentRoute.value.meta)==null?void 0:N.section)||"Management"}),x=K(()=>{var N;return((N=Li.currentRoute.value.meta)==null?void 0:N.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,je.disconnect(),G.setToken(""),e.value="login"};function S(N){var I;if((N.ctrlKey||N.metaKey)&&N.key.toLowerCase()==="k"){e.value==="ready"&&(N.preventDefault(),qu());return}if(n.value&&N.key==="Tab"){const W=[...((I=a.value)==null?void 0:I.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(W.length){const Te=W[0],Ce=W[W.length-1];if(N.shiftKey&&(document.activeElement===Te||!a.value.contains(document.activeElement))){N.preventDefault(),Ce.focus();return}if(!N.shiftKey&&(document.activeElement===Ce||!a.value.contains(document.activeElement))){N.preventDefault(),Te.focus();return}}}if(N.key==="Escape"&&n.value){n.value=!1,N.preventDefault();return}if(N.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(N.target.tagName)){N.preventDefault();const W=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');W&&W.focus()}}function v(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ze(async()=>{document.addEventListener("keydown",S),r=window.matchMedia("(max-width: 900px)"),v(),r.addEventListener("change",v);const N=await G.check();N.ok?(e.value="ready",X()):N.needsAuth?e.value="login":(e.value="ready",X())});function k(){t.value=!1,e.value="ready",X()}async function T(){await G.logout(),je.disconnect(),e.value="login"}function C(){s.value=!s.value}function D(){n.value=!n.value}as(n,async N=>{var I,W;if(N)o=document.activeElement,await Ct(),(W=(I=a.value)==null?void 0:I.querySelector(".nav-item"))==null||W.focus();else if(o!=null&&o.isConnected){const Te=o;o=null,requestAnimationFrame(()=>Te.focus())}});const H=K(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(N,I="info",W=3e3){p.value={text:N,level:I},clearTimeout(f),f=setTimeout(()=>{p.value=null},W)}let R=null,V=!1;function X(){je.onStatusChange=N=>{c.value=N},je.onLatency=N=>{u.value=N},je.onStateChange=(N,I)=>{d.value=N,N==="connected"?(V&&P("Connection restored","success"),V=!0):N==="reconnecting"&&I.attempt===1&&P("Connection lost — reconnecting…","warn")},je.connect(),U(),R&&clearInterval(R),R=setInterval(U,15e3)}async function U(){try{const N=await G.get("/api/status");g.value=N.status==="online"?"online":"starting";const I=N.uptime_seconds||0,W=Math.floor(I/3600),Te=Math.floor(I%3600/60);b.value=`${W}h ${Te}m uptime`}catch{g.value="offline",b.value=""}}return xt(()=>{R&&clearInterval(R),je.disconnect(),document.removeEventListener("keydown",S),r==null||r.removeEventListener("change",v)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:H,wsToast:p,botStatus:g,botUptime:b,navRoutes:E,navGroups:O,currentPage:y,currentSection:m,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:k,logout:T,toggleSidebar:C,toggleMobileNavigation:D,openPalette:qu}}},jn=Xl(n1);jn.component("odin-icon",Lk);jn.component("login-screen",s1);jn.component("toast-container",K0);jn.component("confirm-host",W0);jn.component("command-palette",Nk);jn.directive("modal-focus",Dk);jn.use(Li);jn.mount("#app");
