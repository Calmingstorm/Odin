var km=Object.defineProperty;var wm=(e,t,s)=>t in e?km(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var Xe=(e,t,s)=>wm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Sm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null){this._lastActivity=Date.now();const a={method:t,headers:this._headers()};n!==null&&(a.body=JSON.stringify(n));const i=await fetch(s,a);if(i.status===401)throw new mr("Unauthorized");const l=await i.json().catch(()=>null);if(!i.ok){const r=(l==null?void 0:l.error)||`HTTP ${i.status}`;throw new Tm(r,i.status,l)}return l}get(t){return this._request("GET",t)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new mr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof mr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class mr extends Error{constructor(t){super(t),this.name="AuthError"}}class Tm extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Cm{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error"){this._chatPending=!1;for(const l of this._handlers.chat||[])l(a)}},this._ws.onclose=()=>{if(this._ws=null,this._stopPing(),this._latency=-1,this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const a of this._handlers.chat||[])a(n)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const K=new Sm,Ge=new Cm(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function rs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Fe={},ca=[],Lt=()=>{},ra=()=>!1,zn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Fl=e=>e.startsWith("onUpdate:"),De=Object.assign,To=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Em=Object.prototype.hasOwnProperty,je=(e,t)=>Em.call(e,t),ve=Array.isArray,ua=e=>Ia(e)==="[object Map]",Kn=e=>Ia(e)==="[object Set]",Zc=e=>Ia(e)==="[object Date]",Am=e=>Ia(e)==="[object RegExp]",we=e=>typeof e=="function",Ee=e=>typeof e=="string",Ht=e=>typeof e=="symbol",Ve=e=>e!==null&&typeof e=="object",Co=e=>(Ve(e)||we(e))&&we(e.then)&&we(e.catch),Gd=Object.prototype.toString,Ia=e=>Gd.call(e),Rm=e=>Ia(e).slice(8,-1),$l=e=>Ia(e)==="[object Object]",Bl=e=>Ee(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ys=rs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Im=rs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ul=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Nm=/-\w/g,Qe=Ul(e=>e.replace(Nm,t=>t.slice(1).toUpperCase())),Om=/\B([A-Z])/g,es=Ul(e=>e.replace(Om,"-$1").toLowerCase()),qn=Ul(e=>e.charAt(0).toUpperCase()+e.slice(1)),da=Ul(e=>e?`on${qn(e)}`:""),Ct=(e,t)=>!Object.is(e,t),fa=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Wd=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Hl=e=>{const t=parseFloat(e);return isNaN(t)?e:t},rl=e=>{const t=Ee(e)?Number(e):NaN;return isNaN(t)?e:t};let Jc;const Vl=()=>Jc||(Jc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Lm(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Dm="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Mm=rs(Dm);function Si(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ee(n)?Zd(n):Si(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ee(e)||Ve(e))return e}const Pm=/;(?![^(]*\))/g,Fm=/:([^]+)/,$m=/\/\*[^]*?\*\//g;function Zd(e){const t={};return e.replace($m,"").split(Pm).forEach(s=>{if(s){const n=s.split(Fm);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Ti(e){let t="";if(Ee(e))t=e;else if(ve(e))for(let s=0;s<e.length;s++){const n=Ti(e[s]);n&&(t+=n+" ")}else if(Ve(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Bm(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ee(t)&&(e.class=Ti(t)),s&&(e.style=Si(s)),e}const Um="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Hm="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Vm="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",jm="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",zm=rs(Um),Km=rs(Hm),qm=rs(Vm),Gm=rs(jm),Wm="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Zm=rs(Wm);function Jd(e){return!!e||e===""}function Jm(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=tn(e[n],t[n]);return s}function tn(e,t){if(e===t)return!0;let s=Zc(e),n=Zc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Ht(e),n=Ht(t),s||n)return e===t;if(s=ve(e),n=ve(t),s||n)return s&&n?Jm(e,t):!1;if(s=Ve(e),n=Ve(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!tn(e[l],t[l]))return!1}}return String(e)===String(t)}function jl(e,t){return e.findIndex(s=>tn(s,t))}const Yd=e=>!!(e&&e.__v_isRef===!0),Qd=e=>Ee(e)?e:e==null?"":ve(e)||Ve(e)&&(e.toString===Gd||!we(e.toString))?Yd(e)?Qd(e.value):JSON.stringify(e,Xd,2):String(e),Xd=(e,t)=>Yd(t)?Xd(e,t.value):ua(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[gr(n,i)+" =>"]=a,s),{})}:Kn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>gr(s))}:Ht(t)?gr(t):Ve(t)&&!ve(t)&&!$l(t)?String(t):t,gr=(e,t="")=>{var s;return Ht(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Ym(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let wt;class Eo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&wt&&(wt.active?(this.parent=wt,this.index=(wt.scopes||(wt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=wt;try{return wt=this,t()}finally{wt=s}}}on(){++this._on===1&&(this.prevScope=wt,wt=this)}off(){if(this._on>0&&--this._on===0){if(wt===this)wt=this.prevScope;else{let t=wt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Qm(e){return new Eo(e)}function ef(){return wt}function Xm(e,t=!1){wt&&wt.cleanups.push(e)}let st;const vr=new WeakSet;class li{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,wt&&(wt.active?wt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,vr.has(this)&&(vr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||sf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Yc(this),nf(this);const t=st,s=xs;st=this,xs=!0;try{return this.fn()}finally{af(this),st=t,xs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Io(t);this.deps=this.depsTail=void 0,Yc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?vr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){jr(this)&&this.run()}get dirty(){return jr(this)}}let tf=0,Ja,Ya;function sf(e,t=!1){if(e.flags|=8,t){e.next=Ya,Ya=e;return}e.next=Ja,Ja=e}function Ao(){tf++}function Ro(){if(--tf>0)return;if(Ya){let t=Ya;for(Ya=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ja;){let t=Ja;for(Ja=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function nf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function af(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Io(n),eg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function jr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(lf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function lf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===ri)||(e.globalVersion=ri,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!jr(e))))return;e.flags|=2;const t=e.dep,s=st,n=xs;st=e,xs=!0;try{nf(e);const a=e.fn(e._value);(t.version===0||Ct(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{st=s,xs=n,af(e),e.flags&=-3}}function Io(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Io(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function eg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function tg(e,t){e.effect instanceof li&&(e=e.effect.fn);const s=new li(e);t&&De(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function sg(e){e.effect.stop()}let xs=!0;const rf=[];function sn(){rf.push(xs),xs=!1}function nn(){const e=rf.pop();xs=e===void 0?!0:e}function Yc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=st;st=void 0;try{t()}finally{st=s}}}let ri=0;class ng{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class zl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!st||!xs||st===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==st)s=this.activeLink=new ng(st,this),st.deps?(s.prevDep=st.depsTail,st.depsTail.nextDep=s,st.depsTail=s):st.deps=st.depsTail=s,of(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=st.depsTail,s.nextDep=void 0,st.depsTail.nextDep=s,st.depsTail=s,st.deps===s&&(st.deps=n)}return s}trigger(t){this.version++,ri++,this.notify(t)}notify(t){Ao();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Ro()}}}function of(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)of(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const ol=new WeakMap,Dn=Symbol(""),zr=Symbol(""),oi=Symbol("");function $t(e,t,s){if(xs&&st){let n=ol.get(e);n||ol.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new zl),a.map=n,a.key=s),a.track()}}function qs(e,t,s,n,a,i){const l=ol.get(e);if(!l){ri++;return}const r=o=>{o&&o.trigger()};if(Ao(),t==="clear")l.forEach(r);else{const o=ve(e),c=o&&Bl(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===oi||!Ht(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(oi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Dn)),ua(e)&&r(l.get(zr)));break;case"delete":o||(r(l.get(Dn)),ua(e)&&r(l.get(zr)));break;case"set":ua(e)&&r(l.get(Dn));break}}Ro()}function ag(e,t){const s=ol.get(e);return s&&s.get(t)}function Qn(e){const t=Be(e);return t===e?t:($t(t,"iterate",oi),ss(e)?t:t.map(ks))}function Kl(e){return $t(e=Be(e),"iterate",oi),e}function Ns(e,t){return Ls(e)?ba(Qs(e)?ks(t):t):ks(t)}const ig={__proto__:null,[Symbol.iterator](){return br(this,Symbol.iterator,e=>Ns(this,e))},concat(...e){return Qn(this).concat(...e.map(t=>ve(t)?Qn(t):t))},entries(){return br(this,"entries",e=>(e[1]=Ns(this,e[1]),e))},every(e,t){return $s(this,"every",e,t,void 0,arguments)},filter(e,t){return $s(this,"filter",e,t,s=>s.map(n=>Ns(this,n)),arguments)},find(e,t){return $s(this,"find",e,t,s=>Ns(this,s),arguments)},findIndex(e,t){return $s(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return $s(this,"findLast",e,t,s=>Ns(this,s),arguments)},findLastIndex(e,t){return $s(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return $s(this,"forEach",e,t,void 0,arguments)},includes(...e){return yr(this,"includes",e)},indexOf(...e){return yr(this,"indexOf",e)},join(e){return Qn(this).join(e)},lastIndexOf(...e){return yr(this,"lastIndexOf",e)},map(e,t){return $s(this,"map",e,t,void 0,arguments)},pop(){return Pa(this,"pop")},push(...e){return Pa(this,"push",e)},reduce(e,...t){return Qc(this,"reduce",e,t)},reduceRight(e,...t){return Qc(this,"reduceRight",e,t)},shift(){return Pa(this,"shift")},some(e,t){return $s(this,"some",e,t,void 0,arguments)},splice(...e){return Pa(this,"splice",e)},toReversed(){return Qn(this).toReversed()},toSorted(e){return Qn(this).toSorted(e)},toSpliced(...e){return Qn(this).toSpliced(...e)},unshift(...e){return Pa(this,"unshift",e)},values(){return br(this,"values",e=>Ns(this,e))}};function br(e,t,s){const n=Kl(e),a=n[t]();return n!==e&&!ss(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const lg=Array.prototype;function $s(e,t,s,n,a,i){const l=Kl(e),r=l!==e&&!ss(e),o=l[t];if(o!==lg[t]){const d=o.apply(e,i);return r?ks(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,Ns(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function Qc(e,t,s,n){const a=Kl(e),i=a!==e&&!ss(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=Ns(e,c)),s.call(this,c,Ns(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?Ns(e,o):o}function yr(e,t,s){const n=Be(e);$t(n,"iterate",oi);const a=n[t](...s);return(a===-1||a===!1)&&Ci(s[0])?(s[0]=Be(s[0]),n[t](...s)):a}function Pa(e,t,s=[]){sn(),Ao();const n=Be(e)[t].apply(e,s);return Ro(),nn(),n}const rg=rs("__proto__,__v_isRef,__isVue"),cf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Ht));function og(e){Ht(e)||(e=String(e));const t=Be(this);return $t(t,"has",e),t.hasOwnProperty(e)}class uf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?gf:mf:i?hf:pf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=ve(t);if(!a){let o;if(l&&(o=ig[s]))return o;if(s==="hasOwnProperty")return og}const r=Reflect.get(t,s,bt(t)?t:n);if((Ht(s)?cf.has(s):rg(s))||(a||$t(t,"get",s),i))return r;if(bt(r)){const o=l&&Bl(s)?r:r.value;return a&&Ve(o)?cl(o):o}return Ve(r)?a?cl(r):wn(r):r}}class df extends uf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=ve(t)&&Bl(s);if(!this._isShallow){const c=Ls(i);if(!ss(n)&&!Ls(n)&&(i=Be(i),n=Be(n)),!l&&bt(i)&&!bt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:je(t,s),o=Reflect.set(t,s,n,bt(t)?t:a);return t===Be(a)&&(r?Ct(n,i)&&qs(t,"set",s,n):qs(t,"add",s,n)),o}deleteProperty(t,s){const n=je(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&qs(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Ht(s)||!cf.has(s))&&$t(t,"has",s),n}ownKeys(t){return $t(t,"iterate",ve(t)?"length":Dn),Reflect.ownKeys(t)}}class ff extends uf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const cg=new df,ug=new ff,dg=new df(!0),fg=new ff(!0),Kr=e=>e,$i=e=>Reflect.getPrototypeOf(e);function pg(e,t,s){return function(...n){const a=this.__v_raw,i=Be(a),l=ua(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?Kr:t?ba:ks;return!t&&$t(i,"iterate",o?zr:Dn),De(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function Bi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function hg(e,t){const s={get(a){const i=this.__v_raw,l=Be(i),r=Be(a);e||(Ct(a,r)&&$t(l,"get",a),$t(l,"get",r));const{has:o}=$i(l),c=t?Kr:e?ba:ks;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&$t(Be(a),"iterate",Dn),a.size},has(a){const i=this.__v_raw,l=Be(i),r=Be(a);return e||(Ct(a,r)&&$t(l,"has",a),$t(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Be(r),c=t?Kr:e?ba:ks;return!e&&$t(o,"iterate",Dn),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return De(s,e?{add:Bi("add"),set:Bi("set"),delete:Bi("delete"),clear:Bi("clear")}:{add(a){const i=Be(this),l=$i(i),r=Be(a),o=!t&&!ss(a)&&!Ls(a)?r:a;return l.has.call(i,o)||Ct(a,o)&&l.has.call(i,a)||Ct(r,o)&&l.has.call(i,r)||(i.add(o),qs(i,"add",o,o)),this},set(a,i){!t&&!ss(i)&&!Ls(i)&&(i=Be(i));const l=Be(this),{has:r,get:o}=$i(l);let c=r.call(l,a);c||(a=Be(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?Ct(i,u)&&qs(l,"set",a,i):qs(l,"add",a,i),this},delete(a){const i=Be(this),{has:l,get:r}=$i(i);let o=l.call(i,a);o||(a=Be(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&qs(i,"delete",a,void 0),c},clear(){const a=Be(this),i=a.size!==0,l=a.clear();return i&&qs(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=pg(a,e,t)}),s}function ql(e,t){const s=hg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(je(s,a)&&a in n?s:n,a,i)}const mg={get:ql(!1,!1)},gg={get:ql(!1,!0)},vg={get:ql(!0,!1)},bg={get:ql(!0,!0)},pf=new WeakMap,hf=new WeakMap,mf=new WeakMap,gf=new WeakMap;function yg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function wn(e){return Ls(e)?e:Gl(e,!1,cg,mg,pf)}function No(e){return Gl(e,!1,dg,gg,hf)}function cl(e){return Gl(e,!0,ug,vg,mf)}function xg(e){return Gl(e,!0,fg,bg,gf)}function Gl(e,t,s,n,a){if(!Ve(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=yg(Rm(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Qs(e){return Ls(e)?Qs(e.__v_raw):!!(e&&e.__v_isReactive)}function Ls(e){return!!(e&&e.__v_isReadonly)}function ss(e){return!!(e&&e.__v_isShallow)}function Ci(e){return e?!!e.__v_raw:!1}function Be(e){const t=e&&e.__v_raw;return t?Be(t):e}function vf(e){return!je(e,"__v_skip")&&Object.isExtensible(e)&&Wd(e,"__v_skip",!0),e}const ks=e=>Ve(e)?wn(e):e,ba=e=>Ve(e)?cl(e):e;function bt(e){return e?e.__v_isRef===!0:!1}function h(e){return bf(e,!1)}function Oo(e){return bf(e,!0)}function bf(e,t){return bt(e)?e:new _g(e,t)}class _g{constructor(t,s){this.dep=new zl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Be(t),this._value=s?t:ks(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ss(t)||Ls(t);t=n?t:Be(t),Ct(t,s)&&(this._rawValue=t,this._value=n?t:ks(t),this.dep.trigger())}}function kg(e){e.dep&&e.dep.trigger()}function Os(e){return bt(e)?e.value:e}function wg(e){return we(e)?e():Os(e)}const Sg={get:(e,t,s)=>t==="__v_raw"?e:Os(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return bt(a)&&!bt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Lo(e){return Qs(e)?e:new Proxy(e,Sg)}class Tg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new zl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function yf(e){return new Tg(e)}function Cg(e){const t=ve(e)?new Array(e.length):{};for(const s in e)t[s]=xf(e,s);return t}class Eg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Ht(s)?s:String(s),this._raw=Be(t);let a=!0,i=t;if(!ve(t)||Ht(this._key)||!Bl(this._key))do a=!Ci(i)||ss(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Os(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&bt(this._raw[this._key])){const s=this._object[this._key];if(bt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return ag(this._raw,this._key)}}class Ag{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Rg(e,t,s){return bt(e)?e:we(e)?new Ag(e):Ve(e)&&arguments.length>1?xf(e,t,s):h(e)}function xf(e,t,s){return new Eg(e,t,s)}class Ig{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new zl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=ri-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&st!==this)return sf(this,!0),!0}get value(){const t=this.dep.track();return lf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Ng(e,t,s=!1){let n,a;return we(e)?n=e:(n=e.get,a=e.set),new Ig(n,a,s)}const Og={GET:"get",HAS:"has",ITERATE:"iterate"},Lg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ui={},ul=new WeakMap;let gn;function Dg(){return gn}function _f(e,t=!1,s=gn){if(s){let n=ul.get(s);n||ul.set(s,n=[]),n.push(e)}}function Mg(e,t,s=Fe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:ss(x)||a===!1||a===0?Gs(x,1):Gs(x);let u,d,f,p,g=!1,m=!1;if(bt(e)?(d=()=>e.value,g=ss(e)):Qs(e)?(d=()=>c(e),g=!0):ve(e)?(m=!0,g=e.some(x=>Qs(x)||ss(x)),d=()=>e.map(x=>{if(bt(x))return x.value;if(Qs(x))return c(x);if(we(x))return o?o(x,2):x()})):we(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){sn();try{f()}finally{nn()}}const x=gn;gn=u;try{return o?o(e,3,[p]):e(p)}finally{gn=x}}:d=Lt,t&&a){const x=d,T=a===!0?1/0:a;d=()=>Gs(x(),T)}const k=ef(),E=()=>{u.stop(),k&&k.active&&To(k.effects,u)};if(i&&t){const x=t;t=(...T)=>{const N=x(...T);return E(),N}}let y=m?new Array(e.length).fill(Ui):Ui;const v=x=>{if(!(!(u.flags&1)||!u.dirty&&!x))if(t){const T=u.run();if(x||a||g||(m?T.some((N,O)=>Ct(N,y[O])):Ct(T,y))){f&&f();const N=gn;gn=u;try{const O=[T,y===Ui?void 0:m&&y[0]===Ui?[]:y,p];y=T,o?o(t,3,O):t(...O)}finally{gn=N}}}else u.run()};return r&&r(v),u=new li(d),u.scheduler=l?()=>l(v,!1):v,p=x=>_f(x,!1,u),f=u.onStop=()=>{const x=ul.get(u);if(x){if(o)o(x,4);else for(const T of x)T();ul.delete(u)}},t?n?v(!0):y=u.run():l?l(v.bind(null,!0),!0):u.run(),E.pause=u.pause.bind(u),E.resume=u.resume.bind(u),E.stop=E,E}function Gs(e,t=1/0,s){if(t<=0||!Ve(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,bt(e))Gs(e.value,t,s);else if(ve(e))for(let n=0;n<e.length;n++)Gs(e[n],t,s);else if(Kn(e)||ua(e))e.forEach(n=>{Gs(n,t,s)});else if($l(e)){for(const n in e)Gs(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Gs(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const kf=[];function Pg(e){kf.push(e)}function Fg(){kf.pop()}function $g(e,t){}const Bg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Ug={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Na(e,t,s,n){try{return n?e(...n):e()}catch(a){Gn(a,t,s)}}function is(e,t,s,n){if(we(e)){const a=Na(e,t,s,n);return a&&Co(a)&&a.catch(i=>{Gn(i,t,s)}),a}if(ve(e)){const a=[];for(let i=0;i<e.length;i++)a.push(is(e[i],t,s,n));return a}}function Gn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Fe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){sn(),Na(i,null,10,[e,o,c]),nn();return}}Hg(e,s,a,n,l)}function Hg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Kt=[];let Rs=-1;const pa=[];let vn=null,na=0;const wf=Promise.resolve();let dl=null;function Et(e){const t=dl||wf;return e?t.then(this?e.bind(this):e):t}function Vg(e){let t=Rs+1,s=Kt.length;for(;t<s;){const n=t+s>>>1,a=Kt[n],i=ui(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Do(e){if(!(e.flags&1)){const t=ui(e),s=Kt[Kt.length-1];!s||!(e.flags&2)&&t>=ui(s)?Kt.push(e):Kt.splice(Vg(t),0,e),e.flags|=1,Sf()}}function Sf(){dl||(dl=wf.then(Tf))}function ci(e){ve(e)?pa.push(...e):vn&&e.id===-1?vn.splice(na+1,0,e):e.flags&1||(pa.push(e),e.flags|=1),Sf()}function Xc(e,t,s=Rs+1){for(;s<Kt.length;s++){const n=Kt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Kt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function fl(e){if(pa.length){const t=[...new Set(pa)].sort((s,n)=>ui(s)-ui(n));if(pa.length=0,vn){vn.push(...t);return}for(vn=t,na=0;na<vn.length;na++){const s=vn[na];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}vn=null,na=0}}const ui=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Tf(e){try{for(Rs=0;Rs<Kt.length;Rs++){const t=Kt[Rs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Na(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Rs<Kt.length;Rs++){const t=Kt[Rs];t&&(t.flags&=-2)}Rs=-1,Kt.length=0,fl(),dl=null,(Kt.length||pa.length)&&Tf()}}let aa,Hi=[];function Cf(e,t){var s,n;aa=e,aa?(aa.enabled=!0,Hi.forEach(({event:a,args:i})=>aa.emit(a,...i)),Hi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Cf(i,t)}),setTimeout(()=>{aa||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Hi=[])},3e3)):Hi=[]}let Ot=null,Wl=null;function di(e){const t=Ot;return Ot=e,Wl=e&&e.type.__scopeId||null,t}function jg(e){Wl=e}function zg(){Wl=null}const Kg=e=>Mo;function Mo(e,t=Ot,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&mi(-1);const i=di(t);let l;try{l=e(...a)}finally{di(i),n._d&&mi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function qg(e,t){if(Ot===null)return e;const s=Ii(Ot),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Fe]=t[a];i&&(we(i)&&(i={mounted:i,updated:i}),i.deep&&Gs(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Is(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(sn(),is(o,s,8,[e.el,r,e,t]),nn())}}function Qa(e,t){if(Nt){let s=Nt.provides;const n=Nt.parent&&Nt.parent.provides;n===s&&(s=Nt.provides=Object.create(n)),s[e]=t}}function ps(e,t,s=!1){const n=Gt();if(n||Mn){let a=Mn?Mn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&we(t)?t.call(n&&n.proxy):t}}function Gg(){return!!(Gt()||Mn)}const Ef=Symbol.for("v-scx"),Af=()=>ps(Ef);function Wg(e,t){return Ei(e,null,t)}function Zg(e,t){return Ei(e,null,{flush:"post"})}function Rf(e,t){return Ei(e,null,{flush:"sync"})}function hs(e,t,s){return Ei(e,t,s)}function Ei(e,t,s=Fe){const{immediate:n,deep:a,flush:i,once:l}=s,r=De({},s),o=t&&n||!t&&i!=="post";let c;if(Hn){if(i==="sync"){const p=Af();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Lt,p.resume=Lt,p.pause=Lt,p}}const u=Nt;r.call=(p,g,m)=>is(p,u,g,m);let d=!1;i==="post"?r.scheduler=p=>{gt(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,g)=>{g?p():Do(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Mg(e,t,r);return Hn&&(c?c.push(f):o&&f()),f}function Jg(e,t,s){const n=this.proxy,a=Ee(e)?e.includes(".")?If(n,e):()=>n[e]:e.bind(n,n);let i;we(t)?i=t:(i=t.handler,s=t);const l=Oa(this),r=Ei(a,i.bind(n),s);return l(),r}function If(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const hn=new WeakMap,Nf=Symbol("_vte"),Of=e=>e.__isTeleport,In=e=>e&&(e.disabled||e.disabled===""),Yg=e=>e&&(e.defer||e.defer===""),eu=e=>typeof SVGElement<"u"&&e instanceof SVGElement,tu=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,qr=(e,t)=>{const s=e&&e.to;return Ee(s)?t?t(s):null:s},Qg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:g,createText:m,createComment:k,parentNode:E}}=c,y=In(t.props);let{dynamicChildren:v}=t;const x=(O,w,A)=>{O.shapeFlag&16&&u(O.children,w,A,a,i,l,r,o)},T=(O=t)=>{const w=In(O.props),A=O.target=qr(O.props,g),L=Gr(A,O,m,p);A&&(l!=="svg"&&eu(A)?l="svg":l!=="mathml"&&tu(A)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(A),w||(x(O,A,L),Ka(O,!1)))},N=O=>{const w=()=>{if(hn.get(O)===w){if(hn.delete(O),In(O.props)){const A=E(O.el)||s;x(O,A,O.anchor),Ka(O,!0)}T(O)}};hn.set(O,w),gt(w,i)};if(e==null){const O=t.el=m(""),w=t.anchor=m("");if(p(O,s,n),p(w,s,n),Yg(t.props)||i&&i.pendingBranch){N(t);return}y&&(x(t,s,w),Ka(t,!0)),T()}else{t.el=e.el;const O=t.anchor=e.anchor,w=hn.get(e);if(w){w.flags|=8,hn.delete(e),N(t);return}t.targetStart=e.targetStart;const A=t.target=e.target,L=t.targetAnchor=e.targetAnchor,B=In(e.props),P=B?s:A,S=B?O:L;if(l==="svg"||eu(A)?l="svg":(l==="mathml"||tu(A))&&(l="mathml"),v?(f(e.dynamicChildren,v,P,a,i,l,r),Wo(e,t,!0)):o||d(e,t,P,S,a,i,l,r,!1),y)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Vi(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const $=t.target=qr(t.props,g);$&&Vi(t,$,null,c,0)}else B&&Vi(t,A,L,c,1);Ka(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!In(f),g=hn.get(e);if(g&&(g.flags|=8,hn.delete(e)),d&&(a(c),a(u)),i&&a(o),!g&&l&16)for(let m=0;m<r.length;m++){const k=r[m];n(k,t,s,p,!!k.dynamicChildren)}},move:Vi,hydrate:Xg};function Vi(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!hn.has(e)&&(!d||In(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function Xg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(k,E){let y=E;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function p(k,E){E.anchor=d(l(k),E,r(k),s,n,a,i)}const g=t.target=qr(t.props,o),m=In(t.props);if(g){const k=g._lpa||g.firstChild;t.shapeFlag&16&&(m?(p(e,t),f(g,k),t.targetAnchor||Gr(g,t,u,c,r(e)===g?e:null)):(t.anchor=l(e),f(g,k),t.targetAnchor||Gr(g,t,u,c),d(k&&l(k),t,g,s,n,a,i))),Ka(t,m)}else m&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const ev=Qg;function Ka(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Gr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Nf]=l,e&&(n(i,e,a),n(l,e,a)),l}const us=Symbol("_leaveCb"),Fa=Symbol("_enterCb");function Po(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ue(()=>{e.isMounted=!0}),Ql(()=>{e.isUnmounting=!0}),e}const cs=[Function,Array],Fo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:cs,onEnter:cs,onAfterEnter:cs,onEnterCancelled:cs,onBeforeLeave:cs,onLeave:cs,onAfterLeave:cs,onLeaveCancelled:cs,onBeforeAppear:cs,onAppear:cs,onAfterAppear:cs,onAppearCancelled:cs},Lf=e=>{const t=e.subTree;return t.component?Lf(t.component):t},tv={name:"BaseTransition",props:Fo,setup(e,{slots:t}){const s=Gt(),n=Po();return()=>{const a=t.default&&Zl(t.default(),!0),i=a&&a.length?Df(a):s.subTree?gp():void 0;if(!i)return;const l=Be(e),{mode:r}=l;if(n.isLeaving)return xr(i);const o=su(i);if(!o)return xr(i);let c=ya(o,l,n,s,d=>c=d);o.type!==pt&&an(o,c);let u=s.subTree&&su(s.subTree);if(u&&u.type!==pt&&!ys(u,o)&&Lf(s).type!==pt){let d=ya(u,l,n,s);if(an(u,d),r==="out-in"&&o.type!==pt)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},xr(i);r==="in-out"&&o.type!==pt?d.delayLeave=(f,p,g)=>{const m=Pf(n,u);m[String(u.key)]=u,f[us]=()=>{p(),f[us]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{g(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Df(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==pt){t=s;break}}return t}const Mf=tv;function Pf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ya(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:g,onLeaveCancelled:m,onBeforeAppear:k,onAppear:E,onAfterAppear:y,onAppearCancelled:v}=t,x=String(e.key),T=Pf(s,e),N=(A,L)=>{A&&is(A,n,9,L)},O=(A,L)=>{const B=L[1];N(A,L),ve(A)?A.every(P=>P.length<=1)&&B():A.length<=1&&B()},w={mode:l,persisted:r,beforeEnter(A){let L=o;if(!s.isMounted)if(i)L=k||o;else return;A[us]&&A[us](!0);const B=T[x];B&&ys(e,B)&&B.el[us]&&B.el[us](),N(L,[A])},enter(A){if(T[x]===e)return;let L=c,B=u,P=d;if(!s.isMounted)if(i)L=E||c,B=y||u,P=v||d;else return;let S=!1;A[Fa]=q=>{S||(S=!0,q?N(P,[A]):N(B,[A]),w.delayedLeave&&w.delayedLeave(),A[Fa]=void 0)};const $=A[Fa].bind(null,!1);L?O(L,[A,$]):$()},leave(A,L){const B=String(e.key);if(A[Fa]&&A[Fa](!0),s.isUnmounting)return L();N(f,[A]);let P=!1;A[us]=$=>{P||(P=!0,L(),$?N(m,[A]):N(g,[A]),A[us]=void 0,T[B]===e&&delete T[B])};const S=A[us].bind(null,!1);T[B]=e,p?O(p,[A,S]):S()},clone(A){const L=ya(A,t,s,n,a);return a&&a(L),L}};return w}function xr(e){if(Ri(e))return e=Ds(e),e.children=null,e}function su(e){if(!Ri(e))return Of(e.type)&&e.children?Df(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&we(s.default))return s.default()}}function an(e,t){e.shapeFlag&6&&e.component?(e.transition=t,an(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Zl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===At?(l.patchFlag&128&&a++,n=n.concat(Zl(l.children,t,r))):(t||l.type!==pt)&&n.push(r!=null?Ds(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Ai(e,t){return we(e)?De({name:e.name},t,{setup:e}):e}function sv(){const e=Gt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function $o(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function nv(e){const t=Gt(),s=Oo(null);if(t){const a=t.refs===Fe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function nu(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const pl=new WeakMap;function ha(e,t,s,n,a=!1){if(ve(e)){e.forEach((m,k)=>ha(m,t&&(ve(t)?t[k]:t),s,n,a));return}if(Xs(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&ha(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Ii(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Fe?r.refs={}:r.refs,d=r.setupState,f=Be(d),p=d===Fe?ra:m=>nu(u,m)?!1:je(f,m),g=(m,k)=>!(k&&nu(u,k));if(c!=null&&c!==o){if(au(t),Ee(c))u[c]=null,p(c)&&(d[c]=null);else if(bt(c)){const m=t;g(c,m.k)&&(c.value=null),m.k&&(u[m.k]=null)}}if(we(o))Na(o,r,12,[l,u]);else{const m=Ee(o),k=bt(o);if(m||k){const E=()=>{if(e.f){const y=m?p(o)?d[o]:u[o]:g()||!e.k?o.value:u[e.k];if(a)ve(y)&&To(y,i);else if(ve(y))y.includes(i)||y.push(i);else if(m)u[o]=[i],p(o)&&(d[o]=u[o]);else{const v=[i];g(o,e.k)&&(o.value=v),e.k&&(u[e.k]=v)}}else m?(u[o]=l,p(o)&&(d[o]=l)):k&&(g(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const y=()=>{E(),pl.delete(e)};y.id=-1,pl.set(e,y),gt(y,s)}else au(e),E()}}}function au(e){const t=pl.get(e);t&&(t.flags|=8,pl.delete(e))}let iu=!1;const Xn=()=>{iu||(console.error("Hydration completed but contains mismatches."),iu=!0)},av=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",iv=e=>e.namespaceURI.includes("MathML"),ji=e=>{if(e.nodeType===1){if(av(e))return"svg";if(iv(e))return"mathml"}},oa=e=>e.nodeType===8;function lv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(v,x)=>{if(!x.hasChildNodes()){s(null,v,x),fl(),x._vnode=v;return}d(x.firstChild,v,null,null,null),fl(),x._vnode=v},d=(v,x,T,N,O,w=!1)=>{w=w||!!x.dynamicChildren;const A=oa(v)&&v.data==="[",L=()=>m(v,x,T,N,O,A),{type:B,ref:P,shapeFlag:S,patchFlag:$}=x;let q=v.nodeType;x.el=v,$===-2&&(w=!1,x.dynamicChildren=null);let G=null;switch(B){case xn:q!==3?x.children===""?(o(x.el=a(""),l(v),v),G=v):G=L():(v.data!==x.children&&(Xn(),v.data=x.children),G=i(v));break;case pt:y(v)?(G=i(v),E(x.el=v.content.firstChild,v,T)):q!==8||A?G=L():G=i(v);break;case Pn:if(A&&(v=i(v),q=v.nodeType),q===1||q===3){G=v;const D=!x.children.length;for(let I=0;I<x.staticCount;I++)D&&(x.children+=G.nodeType===1?G.outerHTML:G.data),I===x.staticCount-1&&(x.anchor=G),G=i(G);return A?i(G):G}else L();break;case At:A?G=g(v,x,T,N,O,w):G=L();break;default:if(S&1)(q!==1||x.type.toLowerCase()!==v.tagName.toLowerCase())&&!y(v)?G=L():G=f(v,x,T,N,O,w);else if(S&6){x.slotScopeIds=O;const D=l(v);if(A?G=k(v):oa(v)&&v.data==="teleport start"?G=k(v,v.data,"teleport end"):G=i(v),t(x,D,null,T,N,ji(D),w),Xs(x)&&!x.type.__asyncResolved){let I;A?(I=lt(At),I.anchor=G?G.previousSibling:D.lastChild):I=v.nodeType===3?Jo(""):lt("div"),I.el=v,x.component.subTree=I}}else S&64?q!==8?G=L():G=x.type.hydrate(v,x,T,N,O,w,e,p):S&128&&(G=x.type.hydrate(v,x,T,N,ji(l(v)),O,w,e,d))}return P!=null&&ha(P,null,N,x),G},f=(v,x,T,N,O,w)=>{w=w||!!x.dynamicChildren;const{type:A,props:L,patchFlag:B,shapeFlag:P,dirs:S,transition:$}=x,q=A==="input"||A==="option";if(q||B!==-1){S&&Is(x,null,T,"created");let G=!1;if(y(v)){G=rp(null,$)&&T&&T.vnode.props&&T.vnode.props.appear;const I=v.content.firstChild;if(G){const j=I.getAttribute("class");j&&(I.$cls=j),$.beforeEnter(I)}E(I,v,T),x.el=v=I}if(P&16&&!(L&&(L.innerHTML||L.textContent))){let I=p(v.firstChild,x,v,T,N,O,w);for(I&&!zi(v,1)&&Xn();I;){const j=I;I=I.nextSibling,r(j)}}else if(P&8){let I=x.children;I[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(I=I.slice(1));const{textContent:j}=v;j!==I&&j!==I.replace(/\r\n|\r/g,`
`)&&(zi(v,0)||Xn(),v.textContent=x.children)}if(L){if(q||!w||B&48){const I=v.tagName.includes("-");for(const j in L)(q&&(j.endsWith("value")||j==="indeterminate")||zn(j)&&!Ys(j)||j[0]==="."||I&&!Ys(j))&&n(v,j,null,L[j],void 0,T)}else if(L.onClick)n(v,"onClick",null,L.onClick,void 0,T);else if(B&4&&Qs(L.style))for(const I in L.style)L.style[I]}let D;(D=L&&L.onVnodeBeforeMount)&&Yt(D,T,x),S&&Is(x,null,T,"beforeMount"),((D=L&&L.onVnodeMounted)||S||G)&&dp(()=>{D&&Yt(D,T,x),G&&$.enter(v),S&&Is(x,null,T,"mounted")},N)}return v.nextSibling},p=(v,x,T,N,O,w,A)=>{A=A||!!x.dynamicChildren;const L=x.children,B=L.length;let P=!1;for(let S=0;S<B;S++){const $=A?L[S]:L[S]=Xt(L[S]),q=$.type===xn;v?(q&&!A&&S+1<B&&Xt(L[S+1]).type===xn&&(o(a(v.data.slice($.children.length)),T,i(v)),v.data=$.children),v=d(v,$,N,O,w,A)):q&&!$.children?o($.el=a(""),T):(P||(P=!0,zi(T,1)||Xn()),s(null,$,T,null,N,O,ji(T),w))}return v},g=(v,x,T,N,O,w)=>{const{slotScopeIds:A}=x;A&&(O=O?O.concat(A):A);const L=l(v),B=p(i(v),x,L,T,N,O,w);return B&&oa(B)&&B.data==="]"?i(x.anchor=B):(Xn(),o(x.anchor=c("]"),L,B),B)},m=(v,x,T,N,O,w)=>{if(zi(v.parentElement,1)||Xn(),x.el=null,w){const B=k(v);for(;;){const P=i(v);if(P&&P!==B)r(P);else break}}const A=i(v),L=l(v);return r(v),s(null,x,L,A,T,N,ji(L),O),T&&(T.vnode.el=x.el,er(T,x.el)),A},k=(v,x="[",T="]")=>{let N=0;for(;v;)if(v=i(v),v&&oa(v)&&(v.data===x&&N++,v.data===T)){if(N===0)return i(v);N--}return v},E=(v,x,T)=>{const N=x.parentNode;N&&N.replaceChild(v,x);let O=T;for(;O;)O.vnode.el===x&&(O.vnode.el=O.subTree.el=v),O=O.parent},y=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[u,d]}const lu="data-allow-mismatch",rv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function zi(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(lu);)e=e.parentElement;const s=e&&e.getAttribute(lu);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(rv[t])}}const ov=Vl().requestIdleCallback||(e=>setTimeout(e,1)),cv=Vl().cancelIdleCallback||(e=>clearTimeout(e)),uv=(e=1e4)=>t=>{const s=ov(t,{timeout:e});return()=>cv(s)};function dv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const fv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(dv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},pv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},hv=(e=[])=>(t,s)=>{Ee(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function mv(e,t){if(oa(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(oa(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Xs=e=>!!e.type.__asyncLoader;function gv(e){we(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let g;return c||(g=c=t().catch(m=>{if(m=m instanceof Error?m:new Error(String(m)),o)return new Promise((k,E)=>{o(m,()=>k(f()),()=>E(m),d+1)});throw m}).then(m=>g!==c&&c?c:(m&&(m.__esModule||m[Symbol.toStringTag]==="Module")&&(m=m.default),u=m,m)))};return Ai({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(g,m,k){let E=!1;(m.bu||(m.bu=[])).push(()=>E=!0);const y=()=>{E||k()},v=i?()=>{const x=i(y,T=>mv(g,T));x&&(m.bum||(m.bum=[])).push(x)}:y;u?v():p().then(()=>!m.isUnmounted&&v())},get __asyncResolved(){return u},setup(){const g=Nt;if($o(g),u)return()=>Ki(u,g);const m=T=>{c=null,Gn(T,g,13,!n)};if(r&&g.suspense||Hn)return p().then(T=>()=>Ki(T,g)).catch(T=>(m(T),()=>n?lt(n,{error:T}):null));const k=h(!1),E=h(),y=h(!!a);let v,x;return ht(()=>{v!=null&&clearTimeout(v),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{g.isUnmounted||(y.value=!1)},a)),l!=null&&(v=setTimeout(()=>{if(!g.isUnmounted&&!k.value&&!E.value){const T=new Error(`Async component timed out after ${l}ms.`);m(T),E.value=T}},l)),p().then(()=>{g.isUnmounted||(k.value=!0,g.parent&&Ri(g.parent.vnode)&&g.parent.update())}).catch(T=>{if(g.isUnmounted){c=null;return}m(T),E.value=T}),()=>{if(k.value&&u)return Ki(u,g);if(E.value&&n)return lt(n,{error:E.value});if(s&&!y.value)return Ki(s,g)}}})}function Ki(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=lt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Ri=e=>e.type.__isKeepAlive,vv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Gt(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(y,v,x,T,N)=>{const O=y.component;c(y,v,x,0,r),o(O.vnode,y,v,x,O,r,T,y.slotScopeIds,N),gt(()=>{O.isDeactivated=!1,O.a&&fa(O.a);const w=y.props&&y.props.onVnodeMounted;w&&Yt(w,O.parent,y)},r)},n.deactivate=y=>{const v=y.component;ml(v.m),ml(v.a),c(y,f,null,1,r),gt(()=>{v.da&&fa(v.da);const x=y.props&&y.props.onVnodeUnmounted;x&&Yt(x,v.parent,y),v.isDeactivated=!0},r)};function p(y){_r(y),u(y,s,r,!0)}function g(y){a.forEach((v,x)=>{const T=so(Xs(v)?v.type.__asyncResolved||{}:v.type);T&&!y(T)&&m(x)})}function m(y){const v=a.get(y);v&&(!l||!ys(v,l))?p(v):l&&_r(l),a.delete(y),i.delete(y)}hs(()=>[e.include,e.exclude],([y,v])=>{y&&g(x=>qa(y,x)),v&&g(x=>!qa(v,x))},{flush:"post",deep:!0});let k=null;const E=()=>{k!=null&&(gl(s.subTree.type)?gt(()=>{a.set(k,qi(s.subTree))},s.subTree.suspense):a.set(k,qi(s.subTree)))};return Ue(E),Yl(E),Ql(()=>{a.forEach(y=>{const{subTree:v,suspense:x}=s,T=qi(v);if(y.type===T.type&&y.key===T.key){_r(T);const N=T.component.da;N&&gt(N,x);return}p(y)})}),()=>{if(k=null,!t.default)return l=null;const y=t.default(),v=y[0];if(y.length>1)return l=null,y;if(!ln(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let x=qi(v);if(x.type===pt)return l=null,x;const T=x.type,N=so(Xs(x)?x.type.__asyncResolved||{}:T),{include:O,exclude:w,max:A}=e;if(O&&(!N||!qa(O,N))||w&&N&&qa(w,N))return x.shapeFlag&=-257,l=x,v;const L=x.key==null?T:x.key,B=a.get(L);return x.el&&(x=Ds(x),v.shapeFlag&128&&(v.ssContent=x)),k=L,B?(x.el=B.el,x.component=B.component,x.transition&&an(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),A&&i.size>parseInt(A,10)&&m(i.values().next().value)),x.shapeFlag|=256,l=x,gl(v.type)?v:x}}},bv=vv;function qa(e,t){return ve(e)?e.some(s=>qa(s,t)):Ee(e)?e.split(",").includes(t):Am(e)?(e.lastIndex=0,e.test(t)):!1}function Bo(e,t){Ff(e,"a",t)}function Uo(e,t){Ff(e,"da",t)}function Ff(e,t,s=Nt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Jl(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Ri(a.parent.vnode)&&yv(n,t,s,a),a=a.parent}}function yv(e,t,s,n){const a=Jl(t,e,n,!0);ht(()=>{To(n[t],a)},s)}function _r(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function qi(e){return e.shapeFlag&128?e.ssContent:e}function Jl(e,t,s=Nt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{sn();const r=Oa(s),o=is(t,s,e,l);return r(),nn(),o});return n?a.unshift(i):a.push(i),i}}const rn=e=>(t,s=Nt)=>{(!Hn||e==="sp")&&Jl(e,(...n)=>t(...n),s)},$f=rn("bm"),Ue=rn("m"),Ho=rn("bu"),Yl=rn("u"),Ql=rn("bum"),ht=rn("um"),Bf=rn("sp"),Uf=rn("rtg"),Hf=rn("rtc");function Vf(e,t=Nt){Jl("ec",e,t)}const Vo="components",xv="directives";function _v(e,t){return jo(Vo,e,!0,t)||e}const jf=Symbol.for("v-ndc");function kv(e){return Ee(e)?jo(Vo,e,!1)||e:e||jf}function wv(e){return jo(xv,e)}function jo(e,t,s=!0,n=!1){const a=Ot||Nt;if(a){const i=a.type;if(e===Vo){const r=so(i,!1);if(r&&(r===t||r===Qe(t)||r===qn(Qe(t))))return i}const l=ru(a[e]||i[e],t)||ru(a.appContext[e],t);return!l&&n?i:l}}function ru(e,t){return e&&(e[t]||e[Qe(t)]||e[qn(Qe(t))])}function Sv(e,t,s,n){let a;const i=s&&s[n],l=ve(e);if(l||Ee(e)){const r=l&&Qs(e);let o=!1,c=!1;r&&(o=!ss(e),c=Ls(e),e=Kl(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?ba(ks(e[u])):ks(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Ve(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Tv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(ve(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Cv(e,t,s={},n,a){if(Ot.ce||Ot.parent&&Xs(Ot.parent)&&Ot.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),hi(),vl(At,null,[lt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),hi();const l=i&&zo(i(s)),r=s.key||l&&l.key,o=vl(At,{key:(r&&!Ht(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function zo(e){return e.some(t=>ln(t)?!(t.type===pt||t.type===At&&!zo(t.children)):!0)?e:null}function Ev(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:da(n)]=e[n];return s}const Wr=e=>e?yp(e)?Ii(e):Wr(e.parent):null,Xa=De(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Wr(e.parent),$root:e=>Wr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Ko(e),$forceUpdate:e=>e.f||(e.f=()=>{Do(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Jg.bind(e)}),kr=(e,t)=>e!==Fe&&!e.__isScriptSetup&&je(e,t),Zr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(kr(n,t))return l[t]=1,n[t];if(a!==Fe&&je(a,t))return l[t]=2,a[t];if(je(i,t))return l[t]=3,i[t];if(s!==Fe&&je(s,t))return l[t]=4,s[t];Jr&&(l[t]=0)}}const c=Xa[t];let u,d;if(c)return t==="$attrs"&&$t(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Fe&&je(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,je(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return kr(a,t)?(a[t]=s,!0):n!==Fe&&je(n,t)?(n[t]=s,!0):je(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Fe&&r[0]!=="$"&&je(e,r)||kr(t,r)||je(i,r)||je(n,r)||je(Xa,r)||je(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:je(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Av=De({},Zr,{get(e,t){if(t!==Symbol.unscopables)return Zr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Mm(t)}});function Rv(){return null}function Iv(){return null}function Nv(e){}function Ov(e){}function Lv(){return null}function Dv(){}function Mv(e,t){return null}function Pv(){return zf().slots}function Fv(){return zf().attrs}function zf(e){const t=Gt();return t.setupContext||(t.setupContext=wp(t))}function fi(e){return ve(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function $v(e,t){const s=fi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?ve(a)||we(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Bv(e,t){return!e||!t?e||t:ve(e)&&ve(t)?e.concat(t):De({},fi(e),fi(t))}function Uv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Hv(e){const t=Gt(),s=Hn;let n=e();gi(),s&&ga(!1);const a=()=>{Oa(t),s&&ga(!0)},i=()=>{Gt()!==t&&t.scope.off(),gi(),s&&ga(!1)};return Co(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Jr=!0;function Vv(e){const t=Ko(e),s=e.proxy,n=e.ctx;Jr=!1,t.beforeCreate&&ou(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:g,activated:m,deactivated:k,beforeDestroy:E,beforeUnmount:y,destroyed:v,unmounted:x,render:T,renderTracked:N,renderTriggered:O,errorCaptured:w,serverPrefetch:A,expose:L,inheritAttrs:B,components:P,directives:S,filters:$}=t;if(c&&jv(c,n,null),l)for(const D in l){const I=l[D];we(I)&&(n[D]=I.bind(s))}if(a){const D=a.call(s,s);Ve(D)&&(e.data=wn(D))}if(Jr=!0,i)for(const D in i){const I=i[D],j=we(I)?I.bind(s,s):we(I.get)?I.get.bind(s,s):Lt,ue=!we(I)&&we(I.set)?I.set.bind(s):Lt,fe=Q({get:j,set:ue});Object.defineProperty(n,D,{enumerable:!0,configurable:!0,get:()=>fe.value,set:ne=>fe.value=ne})}if(r)for(const D in r)Kf(r[D],n,s,D);if(o){const D=we(o)?o.call(s):o;Reflect.ownKeys(D).forEach(I=>{Qa(I,D[I])})}u&&ou(u,e,"c");function G(D,I){ve(I)?I.forEach(j=>D(j.bind(s))):I&&D(I.bind(s))}if(G($f,d),G(Ue,f),G(Ho,p),G(Yl,g),G(Bo,m),G(Uo,k),G(Vf,w),G(Hf,N),G(Uf,O),G(Ql,y),G(ht,x),G(Bf,A),ve(L))if(L.length){const D=e.exposed||(e.exposed={});L.forEach(I=>{Object.defineProperty(D,I,{get:()=>s[I],set:j=>s[I]=j,enumerable:!0})})}else e.exposed||(e.exposed={});T&&e.render===Lt&&(e.render=T),B!=null&&(e.inheritAttrs=B),P&&(e.components=P),S&&(e.directives=S),A&&$o(e)}function jv(e,t,s=Lt){ve(e)&&(e=Yr(e));for(const n in e){const a=e[n];let i;Ve(a)?"default"in a?i=ps(a.from||n,a.default,!0):i=ps(a.from||n):i=ps(a),bt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function ou(e,t,s){is(ve(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Kf(e,t,s,n){let a=n.includes(".")?If(s,n):()=>s[n];if(Ee(e)){const i=t[e];we(i)&&hs(a,i)}else if(we(e))hs(a,e.bind(s));else if(Ve(e))if(ve(e))e.forEach(i=>Kf(i,t,s,n));else{const i=we(e.handler)?e.handler.bind(s):t[e.handler];we(i)&&hs(a,i,e)}}function Ko(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>hl(o,c,l,!0)),hl(o,t,l)),Ve(t)&&i.set(t,o),o}function hl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&hl(e,i,s,!0),a&&a.forEach(l=>hl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=zv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const zv={data:cu,props:uu,emits:uu,methods:Ga,computed:Ga,beforeCreate:Vt,created:Vt,beforeMount:Vt,mounted:Vt,beforeUpdate:Vt,updated:Vt,beforeDestroy:Vt,beforeUnmount:Vt,destroyed:Vt,unmounted:Vt,activated:Vt,deactivated:Vt,errorCaptured:Vt,serverPrefetch:Vt,components:Ga,directives:Ga,watch:qv,provide:cu,inject:Kv};function cu(e,t){return t?e?function(){return De(we(e)?e.call(this,this):e,we(t)?t.call(this,this):t)}:t:e}function Kv(e,t){return Ga(Yr(e),Yr(t))}function Yr(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Vt(e,t){return e?[...new Set([].concat(e,t))]:t}function Ga(e,t){return e?De(Object.create(null),e,t):t}function uu(e,t){return e?ve(e)&&ve(t)?[...new Set([...e,...t])]:De(Object.create(null),fi(e),fi(t??{})):t}function qv(e,t){if(!e)return t;if(!t)return e;const s=De(Object.create(null),e);for(const n in t)s[n]=Vt(e[n],t[n]);return s}function qf(){return{app:null,config:{isNativeTag:ra,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Gv=0;function Wv(e,t){return function(n,a=null){we(n)||(n=De({},n)),a!=null&&!Ve(a)&&(a=null);const i=qf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Gv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Tp,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&we(u.install)?(l.add(u),u.install(c,...d)):we(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||lt(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,Ii(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(is(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=Mn;Mn=c;try{return u()}finally{Mn=d}}};return c}}let Mn=null;function Zv(e,t,s=Fe){const n=Gt(),a=Qe(t),i=es(t),l=Gf(e,a),r=yf((o,c)=>{let u,d=Fe,f;return Rf(()=>{const p=e[a];Ct(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const g=s.set?s.set(p):p;if(!Ct(g,u)&&!(d!==Fe&&Ct(p,d)))return;const m=n.vnode.props,k=!!(m&&(t in m||a in m||i in m)&&(`onUpdate:${t}`in m||`onUpdate:${a}`in m||`onUpdate:${i}`in m));k||(u=p,c()),n.emit(`update:${t}`,g),Ct(p,d)&&(Ct(p,g)&&!Ct(g,f)||k&&d!==Fe&&!Ct(g,u))&&c(),d=p,f=g}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Fe:r,done:!1}:{done:!0}}}},r}const Gf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Qe(t)}Modifiers`]||e[`${es(t)}Modifiers`];function Jv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Fe;let a=s;const i=t.startsWith("update:"),l=i&&Gf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Ee(u)?u.trim():u)),l.number&&(a=s.map(Hl)));let r,o=n[r=da(t)]||n[r=da(Qe(t))];!o&&i&&(o=n[r=da(es(t))]),o&&is(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,is(c,e,6,a)}}const Yv=new WeakMap;function Wf(e,t,s=!1){const n=s?Yv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!we(e)){const o=c=>{const u=Wf(c,t,!0);u&&(r=!0,De(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Ve(e)&&n.set(e,null),null):(ve(i)?i.forEach(o=>l[o]=null):De(l,i),Ve(e)&&n.set(e,l),l)}function Xl(e,t){return!e||!zn(t)?!1:(t=t.slice(2).replace(/Once$/,""),je(e,t[0].toLowerCase()+t.slice(1))||je(e,es(t))||je(e,t))}function el(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:g,inheritAttrs:m}=e,k=di(e);let E,y;try{if(s.shapeFlag&4){const x=a||n,T=x;E=Xt(c.call(T,x,u,d,p,f,g)),y=r}else{const x=t;E=Xt(x.length>1?x(d,{attrs:r,slots:l,emit:o}):x(d,null)),y=t.props?r:Xv(r)}}catch(x){ei.length=0,Gn(x,e,1),E=lt(pt)}let v=E;if(y&&m!==!1){const x=Object.keys(y),{shapeFlag:T}=v;x.length&&T&7&&(i&&x.some(Fl)&&(y=eb(y,i)),v=Ds(v,y,!1,!0))}return s.dirs&&(v=Ds(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&an(v,s.transition),E=v,di(k),E}function Qv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(ln(a)){if(a.type!==pt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Xv=e=>{let t;for(const s in e)(s==="class"||s==="style"||zn(s))&&((t||(t={}))[s]=e[s]);return t},eb=(e,t)=>{const s={};for(const n in e)(!Fl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function tb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?du(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(Zf(l,n,f)&&!Xl(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?du(n,l,c):!0:!!l;return!1}function du(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Zf(t,e,i)&&!Xl(s,i))return!0}return!1}function Zf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Ve(n)&&Ve(a)?!tn(n,a):n!==a}function er({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Jf={},Yf=()=>Object.create(Jf),Qf=e=>Object.getPrototypeOf(e)===Jf;function sb(e,t,s,n=!1){const a={},i=Yf();e.propsDefaults=Object.create(null),Xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:No(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function nb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Be(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(Xl(e.emitsOptions,f))continue;const p=t[f];if(o)if(je(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const g=Qe(f);a[g]=Qr(o,r,g,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{Xf(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!je(t,d)&&((u=es(d))===d||!je(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=Qr(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!je(t,d))&&(delete i[d],c=!0)}c&&qs(e.attrs,"set","")}function Xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(Ys(o))continue;const c=t[o];let u;a&&je(a,u=Qe(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:Xl(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Be(s),c=r||Fe;for(let u=0;u<i.length;u++){const d=i[u];s[d]=Qr(a,o,d,c[d],e,!je(c,d))}}return l}function Qr(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=je(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&we(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Oa(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===es(s))&&(n=!0))}return n}const ab=new WeakMap;function ep(e,t,s=!1){const n=s?ab:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!we(e)){const u=d=>{o=!0;const[f,p]=ep(d,t,!0);De(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return Ve(e)&&n.set(e,ca),ca;if(ve(i))for(let u=0;u<i.length;u++){const d=Qe(i[u]);fu(d)&&(l[d]=Fe)}else if(i)for(const u in i){const d=Qe(u);if(fu(d)){const f=i[u],p=l[d]=ve(f)||we(f)?{type:f}:De({},f),g=p.type;let m=!1,k=!0;if(ve(g))for(let E=0;E<g.length;++E){const y=g[E],v=we(y)&&y.name;if(v==="Boolean"){m=!0;break}else v==="String"&&(k=!1)}else m=we(g)&&g.name==="Boolean";p[0]=m,p[1]=k,(m||je(p,"default"))&&r.push(d)}}const c=[l,r];return Ve(e)&&n.set(e,c),c}function fu(e){return e[0]!=="$"&&!Ys(e)}const qo=e=>e==="_"||e==="_ctx"||e==="$stable",Go=e=>ve(e)?e.map(Xt):[Xt(e)],ib=(e,t,s)=>{if(t._n)return t;const n=Mo((...a)=>Go(t(...a)),s);return n._c=!1,n},tp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(qo(a))continue;const i=e[a];if(we(i))t[a]=ib(a,i,n);else if(i!=null){const l=Go(i);t[a]=()=>l}}},sp=(e,t)=>{const s=Go(t);e.slots.default=()=>s},np=(e,t,s)=>{for(const n in t)(s||!qo(n))&&(e[n]=t[n])},lb=(e,t,s)=>{const n=e.slots=Yf();if(e.vnode.shapeFlag&32){const a=t._;a?(np(n,t,s),s&&Wd(n,"_",a,!0)):tp(t,n)}else t&&sp(e,t)},rb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Fe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:np(a,t,s):(i=!t.$stable,tp(t,a)),l=t}else t&&(sp(e,t),l={default:1});if(i)for(const r in a)!qo(r)&&l[r]==null&&delete a[r]},gt=dp;function ap(e){return lp(e)}function ip(e){return lp(e,lv)}function lp(e,t){const s=Vl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=Lt,insertStaticContent:g}=e,m=(b,C,M,W=null,R=null,F=null,Z=void 0,X=null,se=!!C.dynamicChildren)=>{if(b===C)return;b&&!ys(b,C)&&(W=V(b),ne(b,R,F,!0),b=null),C.patchFlag===-2&&(se=!1,C.dynamicChildren=null);const{type:J,ref:ge,shapeFlag:le}=C;switch(J){case xn:k(b,C,M,W);break;case pt:E(b,C,M,W);break;case Pn:b==null&&y(C,M,W,Z);break;case At:P(b,C,M,W,R,F,Z,X,se);break;default:le&1?T(b,C,M,W,R,F,Z,X,se):le&6?S(b,C,M,W,R,F,Z,X,se):(le&64||le&128)&&J.process(b,C,M,W,R,F,Z,X,se,de)}ge!=null&&R?ha(ge,b&&b.ref,F,C||b,!C):ge==null&&b&&b.ref!=null&&ha(b.ref,null,F,b,!0)},k=(b,C,M,W)=>{if(b==null)n(C.el=r(C.children),M,W);else{const R=C.el=b.el;C.children!==b.children&&c(R,C.children)}},E=(b,C,M,W)=>{b==null?n(C.el=o(C.children||""),M,W):C.el=b.el},y=(b,C,M,W)=>{[b.el,b.anchor]=g(b.children,C,M,W,b.el,b.anchor)},v=({el:b,anchor:C},M,W)=>{let R;for(;b&&b!==C;)R=f(b),n(b,M,W),b=R;n(C,M,W)},x=({el:b,anchor:C})=>{let M;for(;b&&b!==C;)M=f(b),a(b),b=M;a(C)},T=(b,C,M,W,R,F,Z,X,se)=>{if(C.type==="svg"?Z="svg":C.type==="math"&&(Z="mathml"),b==null)N(C,M,W,R,F,Z,X,se);else{const J=b.el&&b.el._isVueCE?b.el:null;try{J&&J._beginPatch(),A(b,C,R,F,Z,X,se)}finally{J&&J._endPatch()}}},N=(b,C,M,W,R,F,Z,X)=>{let se,J;const{props:ge,shapeFlag:le,transition:ce,dirs:ye}=b;if(se=b.el=l(b.type,F,ge&&ge.is,ge),le&8?u(se,b.children):le&16&&w(b.children,se,null,W,R,wr(b,F),Z,X),ye&&Is(b,null,W,"created"),O(se,b,b.scopeId,Z,W),ge){for(const Te in ge)Te!=="value"&&!Ys(Te)&&i(se,Te,null,ge[Te],F,W);"value"in ge&&i(se,"value",null,ge.value,F),(J=ge.onVnodeBeforeMount)&&Yt(J,W,b)}ye&&Is(b,null,W,"beforeMount");const _e=rp(R,ce);_e&&ce.beforeEnter(se),n(se,C,M),((J=ge&&ge.onVnodeMounted)||_e||ye)&&gt(()=>{try{J&&Yt(J,W,b),_e&&ce.enter(se),ye&&Is(b,null,W,"mounted")}finally{}},R)},O=(b,C,M,W,R)=>{if(M&&p(b,M),W)for(let F=0;F<W.length;F++)p(b,W[F]);if(R){let F=R.subTree;if(C===F||gl(F.type)&&(F.ssContent===C||F.ssFallback===C)){const Z=R.vnode;O(b,Z,Z.scopeId,Z.slotScopeIds,R.parent)}}},w=(b,C,M,W,R,F,Z,X,se=0)=>{for(let J=se;J<b.length;J++){const ge=b[J]=X?zs(b[J]):Xt(b[J]);m(null,ge,C,M,W,R,F,Z,X)}},A=(b,C,M,W,R,F,Z)=>{const X=C.el=b.el;let{patchFlag:se,dynamicChildren:J,dirs:ge}=C;se|=b.patchFlag&16;const le=b.props||Fe,ce=C.props||Fe;let ye;if(M&&Cn(M,!1),(ye=ce.onVnodeBeforeUpdate)&&Yt(ye,M,C,b),ge&&Is(C,b,M,"beforeUpdate"),M&&Cn(M,!0),(le.innerHTML&&ce.innerHTML==null||le.textContent&&ce.textContent==null)&&u(X,""),J?L(b.dynamicChildren,J,X,M,W,wr(C,R),F):Z||I(b,C,X,null,M,W,wr(C,R),F,!1),se>0){if(se&16)B(X,le,ce,M,R);else if(se&2&&le.class!==ce.class&&i(X,"class",null,ce.class,R),se&4&&i(X,"style",le.style,ce.style,R),se&8){const _e=C.dynamicProps;for(let Te=0;Te<_e.length;Te++){const U=_e[Te],oe=le[U],xe=ce[U];(xe!==oe||U==="value")&&i(X,U,oe,xe,R,M)}}se&1&&b.children!==C.children&&u(X,C.children)}else!Z&&J==null&&B(X,le,ce,M,R);((ye=ce.onVnodeUpdated)||ge)&&gt(()=>{ye&&Yt(ye,M,C,b),ge&&Is(C,b,M,"updated")},W)},L=(b,C,M,W,R,F,Z)=>{for(let X=0;X<C.length;X++){const se=b[X],J=C[X],ge=se.el&&(se.type===At||!ys(se,J)||se.shapeFlag&198)?d(se.el):M;m(se,J,ge,null,W,R,F,Z,!0)}},B=(b,C,M,W,R)=>{if(C!==M){if(C!==Fe)for(const F in C)!Ys(F)&&!(F in M)&&i(b,F,C[F],null,R,W);for(const F in M){if(Ys(F))continue;const Z=M[F],X=C[F];Z!==X&&F!=="value"&&i(b,F,X,Z,R,W)}"value"in M&&i(b,"value",C.value,M.value,R)}},P=(b,C,M,W,R,F,Z,X,se)=>{const J=C.el=b?b.el:r(""),ge=C.anchor=b?b.anchor:r("");let{patchFlag:le,dynamicChildren:ce,slotScopeIds:ye}=C;ye&&(X=X?X.concat(ye):ye),b==null?(n(J,M,W),n(ge,M,W),w(C.children||[],M,ge,R,F,Z,X,se)):le>0&&le&64&&ce&&b.dynamicChildren&&b.dynamicChildren.length===ce.length?(L(b.dynamicChildren,ce,M,R,F,Z,X),(C.key!=null||R&&C===R.subTree)&&Wo(b,C,!0)):I(b,C,M,ge,R,F,Z,X,se)},S=(b,C,M,W,R,F,Z,X,se)=>{C.slotScopeIds=X,b==null?C.shapeFlag&512?R.ctx.activate(C,M,W,Z,se):$(C,M,W,R,F,Z,se):q(b,C,se)},$=(b,C,M,W,R,F,Z)=>{const X=b.component=bp(b,W,R);if(Ri(b)&&(X.ctx.renderer=de),xp(X,!1,Z),X.asyncDep){if(R&&R.registerDep(X,G,Z),!b.el){const se=X.subTree=lt(pt);E(null,se,C,M),b.placeholder=se.el}}else G(X,b,C,M,R,F,Z)},q=(b,C,M)=>{const W=C.component=b.component;if(tb(b,C,M))if(W.asyncDep&&!W.asyncResolved){D(W,C,M);return}else W.next=C,W.update();else C.el=b.el,W.vnode=C},G=(b,C,M,W,R,F,Z)=>{const X=()=>{if(b.isMounted){let{next:le,bu:ce,u:ye,parent:_e,vnode:Te}=b;{const Je=op(b);if(Je){le&&(le.el=Te.el,D(b,le,Z)),Je.asyncDep.then(()=>{gt(()=>{b.isUnmounted||J()},R)});return}}let U=le,oe;Cn(b,!1),le?(le.el=Te.el,D(b,le,Z)):le=Te,ce&&fa(ce),(oe=le.props&&le.props.onVnodeBeforeUpdate)&&Yt(oe,_e,le,Te),Cn(b,!0);const xe=el(b),Pe=b.subTree;b.subTree=xe,m(Pe,xe,d(Pe.el),V(Pe),b,R,F),le.el=xe.el,U===null&&er(b,xe.el),ye&&gt(ye,R),(oe=le.props&&le.props.onVnodeUpdated)&&gt(()=>Yt(oe,_e,le,Te),R)}else{let le;const{el:ce,props:ye}=C,{bm:_e,m:Te,parent:U,root:oe,type:xe}=b,Pe=Xs(C);if(Cn(b,!1),_e&&fa(_e),!Pe&&(le=ye&&ye.onVnodeBeforeMount)&&Yt(le,U,C),Cn(b,!0),ce&&Me){const Je=()=>{b.subTree=el(b),Me(ce,b.subTree,b,R,null)};Pe&&xe.__asyncHydrate?xe.__asyncHydrate(ce,b,Je):Je()}else{oe.ce&&oe.ce._hasShadowRoot()&&oe.ce._injectChildStyle(xe,b.parent?b.parent.type:void 0);const Je=b.subTree=el(b);m(null,Je,M,W,b,R,F),C.el=Je.el}if(Te&&gt(Te,R),!Pe&&(le=ye&&ye.onVnodeMounted)){const Je=C;gt(()=>Yt(le,U,Je),R)}(C.shapeFlag&256||U&&Xs(U.vnode)&&U.vnode.shapeFlag&256)&&b.a&&gt(b.a,R),b.isMounted=!0,C=M=W=null}};b.scope.on();const se=b.effect=new li(X);b.scope.off();const J=b.update=se.run.bind(se),ge=b.job=se.runIfDirty.bind(se);ge.i=b,ge.id=b.uid,se.scheduler=()=>Do(ge),Cn(b,!0),J()},D=(b,C,M)=>{C.component=b;const W=b.vnode.props;b.vnode=C,b.next=null,nb(b,C.props,W,M),rb(b,C.children,M),sn(),Xc(b),nn()},I=(b,C,M,W,R,F,Z,X,se=!1)=>{const J=b&&b.children,ge=b?b.shapeFlag:0,le=C.children,{patchFlag:ce,shapeFlag:ye}=C;if(ce>0){if(ce&128){ue(J,le,M,W,R,F,Z,X,se);return}else if(ce&256){j(J,le,M,W,R,F,Z,X,se);return}}ye&8?(ge&16&&Ie(J,R,F),le!==J&&u(M,le)):ge&16?ye&16?ue(J,le,M,W,R,F,Z,X,se):Ie(J,R,F,!0):(ge&8&&u(M,""),ye&16&&w(le,M,W,R,F,Z,X,se))},j=(b,C,M,W,R,F,Z,X,se)=>{b=b||ca,C=C||ca;const J=b.length,ge=C.length,le=Math.min(J,ge);let ce;for(ce=0;ce<le;ce++){const ye=C[ce]=se?zs(C[ce]):Xt(C[ce]);m(b[ce],ye,M,null,R,F,Z,X,se)}J>ge?Ie(b,R,F,!0,!1,le):w(C,M,W,R,F,Z,X,se,le)},ue=(b,C,M,W,R,F,Z,X,se)=>{let J=0;const ge=C.length;let le=b.length-1,ce=ge-1;for(;J<=le&&J<=ce;){const ye=b[J],_e=C[J]=se?zs(C[J]):Xt(C[J]);if(ys(ye,_e))m(ye,_e,M,null,R,F,Z,X,se);else break;J++}for(;J<=le&&J<=ce;){const ye=b[le],_e=C[ce]=se?zs(C[ce]):Xt(C[ce]);if(ys(ye,_e))m(ye,_e,M,null,R,F,Z,X,se);else break;le--,ce--}if(J>le){if(J<=ce){const ye=ce+1,_e=ye<ge?C[ye].el:W;for(;J<=ce;)m(null,C[J]=se?zs(C[J]):Xt(C[J]),M,_e,R,F,Z,X,se),J++}}else if(J>ce)for(;J<=le;)ne(b[J],R,F,!0),J++;else{const ye=J,_e=J,Te=new Map;for(J=_e;J<=ce;J++){const et=C[J]=se?zs(C[J]):Xt(C[J]);et.key!=null&&Te.set(et.key,J)}let U,oe=0;const xe=ce-_e+1;let Pe=!1,Je=0;const Ze=new Array(xe);for(J=0;J<xe;J++)Ze[J]=0;for(J=ye;J<=le;J++){const et=b[J];if(oe>=xe){ne(et,R,F,!0);continue}let Ye;if(et.key!=null)Ye=Te.get(et.key);else for(U=_e;U<=ce;U++)if(Ze[U-_e]===0&&ys(et,C[U])){Ye=U;break}Ye===void 0?ne(et,R,F,!0):(Ze[Ye-_e]=J+1,Ye>=Je?Je=Ye:Pe=!0,m(et,C[Ye],M,null,R,F,Z,X,se),oe++)}const xt=Pe?ob(Ze):ca;for(U=xt.length-1,J=xe-1;J>=0;J--){const et=_e+J,Ye=C[et],Ss=C[et+1],Ms=et+1<ge?Ss.el||cp(Ss):W;Ze[J]===0?m(null,Ye,M,Ms,R,F,Z,X,se):Pe&&(U<0||J!==xt[U]?fe(Ye,M,Ms,2):U--)}}},fe=(b,C,M,W,R=null)=>{const{el:F,type:Z,transition:X,children:se,shapeFlag:J}=b;if(J&6){fe(b.component.subTree,C,M,W);return}if(J&128){b.suspense.move(C,M,W);return}if(J&64){Z.move(b,C,M,de);return}if(Z===At){n(F,C,M);for(let le=0;le<se.length;le++)fe(se[le],C,M,W);n(b.anchor,C,M);return}if(Z===Pn){v(b,C,M);return}if(W!==2&&J&1&&X)if(W===0)X.persisted&&!F[us]?n(F,C,M):(X.beforeEnter(F),n(F,C,M),gt(()=>X.enter(F),R));else{const{leave:le,delayLeave:ce,afterLeave:ye}=X,_e=()=>{b.ctx.isUnmounted?a(F):n(F,C,M)},Te=()=>{const U=F._isLeaving||!!F[us];F._isLeaving&&F[us](!0),X.persisted&&!U?_e():le(F,()=>{_e(),ye&&ye()})};ce?ce(F,_e,Te):Te()}else n(F,C,M)},ne=(b,C,M,W=!1,R=!1)=>{const{type:F,props:Z,ref:X,children:se,dynamicChildren:J,shapeFlag:ge,patchFlag:le,dirs:ce,cacheIndex:ye,memo:_e}=b;if(le===-2&&(R=!1),X!=null&&(sn(),ha(X,null,M,b,!0),nn()),ye!=null&&(C.renderCache[ye]=void 0),ge&256){C.ctx.deactivate(b);return}const Te=ge&1&&ce,U=!Xs(b);let oe;if(U&&(oe=Z&&Z.onVnodeBeforeUnmount)&&Yt(oe,C,b),ge&6)pe(b.component,M,W);else{if(ge&128){b.suspense.unmount(M,W);return}Te&&Is(b,null,C,"beforeUnmount"),ge&64?b.type.remove(b,C,M,de,W):J&&!J.hasOnce&&(F!==At||le>0&&le&64)?Ie(J,C,M,!1,!0):(F===At&&le&384||!R&&ge&16)&&Ie(se,C,M),W&&me(b)}const xe=_e!=null&&ye==null;(U&&(oe=Z&&Z.onVnodeUnmounted)||Te||xe)&&gt(()=>{oe&&Yt(oe,C,b),Te&&Is(b,null,C,"unmounted"),xe&&(b.el=null)},M)},me=b=>{const{type:C,el:M,anchor:W,transition:R}=b;if(C===At){ee(M,W);return}if(C===Pn){x(b);return}const F=()=>{a(M),R&&!R.persisted&&R.afterLeave&&R.afterLeave()};if(b.shapeFlag&1&&R&&!R.persisted){const{leave:Z,delayLeave:X}=R,se=()=>Z(M,F);X?X(b.el,F,se):se()}else F()},ee=(b,C)=>{let M;for(;b!==C;)M=f(b),a(b),b=M;a(C)},pe=(b,C,M)=>{const{bum:W,scope:R,job:F,subTree:Z,um:X,m:se,a:J}=b;ml(se),ml(J),W&&fa(W),R.stop(),F&&(F.flags|=8,ne(Z,b,C,M)),X&&gt(X,C),gt(()=>{b.isUnmounted=!0},C)},Ie=(b,C,M,W=!1,R=!1,F=0)=>{for(let Z=F;Z<b.length;Z++)ne(b[Z],C,M,W,R)},V=b=>{if(b.shapeFlag&6)return V(b.component.subTree);if(b.shapeFlag&128)return b.suspense.next();const C=f(b.anchor||b.el),M=C&&C[Nf];return M?f(M):C};let te=!1;const re=(b,C,M)=>{let W;b==null?C._vnode&&(ne(C._vnode,null,null,!0),W=C._vnode.component):m(C._vnode||null,b,C,null,null,null,M),C._vnode=b,te||(te=!0,Xc(W),fl(),te=!1)},de={p:m,um:ne,m:fe,r:me,mt:$,mc:w,pc:I,pbc:L,n:V,o:e};let he,Me;return t&&([he,Me]=t(de)),{render:re,hydrate:he,createApp:Wv(re,he)}}function wr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Cn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function rp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Wo(e,t,s=!1){const n=e.children,a=t.children;if(ve(n)&&ve(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=zs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Wo(l,r)),r.type===xn&&(r.patchFlag===-1&&(r=a[i]=zs(r)),r.el=l.el),r.type===pt&&!r.el&&(r.el=l.el)}}function ob(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function op(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:op(t)}function ml(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function cp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?cp(t.subTree):null}const gl=e=>e.__isSuspense;let Xr=0;const cb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)db(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}fb(e,t,s,n,a,l,r,o,c)}},hydrate:pb,normalize:hb},ub=cb;function pi(e,t){const s=e.props&&e.props[t];we(s)&&s()}function db(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=up(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(pi(e,"onPending"),pi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ma(f,e.ssFallback)):f.resolve(!1,!0)}function fb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:g,pendingBranch:m,isInFallback:k,isHydrating:E}=d;if(m)d.pendingBranch=f,ys(m,f)?(o(m,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():k&&(E||(o(g,p,s,n,a,null,i,l,r),ma(d,p)))):(d.pendingId=Xr++,E?(d.isHydrating=!1,d.activeBranch=m):c(m,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),k?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(g,p,s,n,a,null,i,l,r),ma(d,p))):g&&ys(g,f)?(o(g,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(g&&ys(g,f))o(g,f,s,n,a,d,i,l,r),ma(d,f);else if(pi(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=Xr++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:y,pendingId:v}=d;y>0?setTimeout(()=>{d.pendingId===v&&d.fallback(p)},y):y===0&&d.fallback(p)}}function up(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:g,o:{parentNode:m,remove:k}}=c;let E;const y=mb(e);y&&t&&t.pendingBranch&&(E=t.pendingId,t.deps++);const v=e.props?rl(e.props.timeout):void 0,x=i,T={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Xr++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(N=!1,O=!1){const{vnode:w,activeBranch:A,pendingBranch:L,pendingId:B,effects:P,parentComponent:S,container:$,isInFallback:q}=T;let G=!1;if(T.isHydrating)T.isHydrating=!1;else if(!N){G=A&&L.transition&&L.transition.mode==="out-in";let j=!1;G&&(A.transition.afterLeave=()=>{B===T.pendingId&&(f(L,$,i===x&&!j?g(A):i,0),ci(P),q&&w.ssFallback&&(w.ssFallback.el=null))}),A&&!T.isFallbackMountPending&&(m(A.el)===$&&(i=g(A),j=!0),p(A,S,T,!0),!G&&q&&w.ssFallback&&gt(()=>w.ssFallback.el=null,T)),G||f(L,$,i,0)}T.isFallbackMountPending=!1,ma(T,L),T.pendingBranch=null,T.isInFallback=!1;let D=T.parent,I=!1;for(;D;){if(D.pendingBranch){D.effects.push(...P),I=!0;break}D=D.parent}!I&&!G&&ci(P),T.effects=[],y&&t&&t.pendingBranch&&E===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),pi(w,"onResolve")},fallback(N){if(!T.pendingBranch)return;const{vnode:O,activeBranch:w,parentComponent:A,container:L,namespace:B}=T;pi(O,"onFallback");const P=g(w),S=()=>{T.isFallbackMountPending=!1,T.isInFallback&&(d(null,N,L,P,A,null,B,r,o),ma(T,N))},$=N.transition&&N.transition.mode==="out-in";$&&(T.isFallbackMountPending=!0,w.transition.afterLeave=S),T.isInFallback=!0,p(w,A,null,!0),$||S()},move(N,O,w){T.activeBranch&&f(T.activeBranch,N,O,w),T.container=N},next(){return T.activeBranch&&g(T.activeBranch)},registerDep(N,O,w){const A=!!T.pendingBranch;A&&T.deps++;const L=N.vnode.el;N.asyncDep.catch(B=>{Gn(B,N,0)}).then(B=>{if(N.isUnmounted||T.isUnmounted||T.pendingId!==N.suspenseId)return;gi(),N.asyncResolved=!0;const{vnode:P}=N;eo(N,B,!1),L&&(P.el=L);const S=!L&&N.subTree.el;O(N,P,m(L||N.subTree.el),L?null:g(N.subTree),T,l,w),S&&(P.placeholder=null,k(S)),er(N,P.el),A&&--T.deps===0&&T.resolve()})},unmount(N,O){T.isUnmounted=!0,T.activeBranch&&p(T.activeBranch,s,N,O),T.pendingBranch&&p(T.pendingBranch,s,N,O)}};return T}function pb(e,t,s,n,a,i,l,r,o){const c=t.suspense=up(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function hb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=pu(n?s.default:s),e.ssFallback=n?pu(s.fallback):lt(pt)}function pu(e){let t;if(we(e)){const s=Un&&e._c;s&&(e._d=!1,hi()),e=e(),s&&(e._d=!0,t=Bt,fp())}return ve(e)&&(e=Qv(e)),e=Xt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function dp(e,t){t&&t.pendingBranch?ve(e)?t.effects.push(...e):t.effects.push(e):ci(e)}function ma(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,er(n,a))}function mb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const At=Symbol.for("v-fgt"),xn=Symbol.for("v-txt"),pt=Symbol.for("v-cmt"),Pn=Symbol.for("v-stc"),ei=[];let Bt=null;function hi(e=!1){ei.push(Bt=e?null:[])}function fp(){ei.pop(),Bt=ei[ei.length-1]||null}let Un=1;function mi(e,t=!1){Un+=e,e<0&&Bt&&t&&(Bt.hasOnce=!0)}function pp(e){return e.dynamicChildren=Un>0?Bt||ca:null,fp(),Un>0&&Bt&&Bt.push(e),e}function gb(e,t,s,n,a,i){return pp(Zo(e,t,s,n,a,i,!0))}function vl(e,t,s,n,a){return pp(lt(e,t,s,n,a,!0))}function ln(e){return e?e.__v_isVNode===!0:!1}function ys(e,t){return e.type===t.type&&e.key===t.key}function vb(e){}const hp=({key:e})=>e??null,tl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ee(e)||bt(e)||we(e)?{i:Ot,r:e,k:t,f:!!s}:e:null);function Zo(e,t=null,s=null,n=0,a=null,i=e===At?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&hp(t),ref:t&&tl(t),scopeId:Wl,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ot};return r?(Yo(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Ee(s)?8:16),Un>0&&!l&&Bt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Bt.push(o),o}const lt=bb;function bb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===jf)&&(e=pt),ln(e)){const r=Ds(e,t,!0);return s&&Yo(r,s),Un>0&&!i&&Bt&&(r.shapeFlag&6?Bt[Bt.indexOf(e)]=r:Bt.push(r)),r.patchFlag=-2,r}if(Tb(e)&&(e=e.__vccOpts),t){t=mp(t);let{class:r,style:o}=t;r&&!Ee(r)&&(t.class=Ti(r)),Ve(o)&&(Ci(o)&&!ve(o)&&(o=De({},o)),t.style=Si(o))}const l=Ee(e)?1:gl(e)?128:Of(e)?64:Ve(e)?4:we(e)?2:0;return Zo(e,t,s,n,a,l,i,!0)}function mp(e){return e?Ci(e)||Qf(e)?De({},e):e:null}function Ds(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?vp(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&hp(c),ref:t&&t.ref?s&&i?ve(i)?i.concat(tl(t)):[i,tl(t)]:tl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==At?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ds(e.ssContent),ssFallback:e.ssFallback&&Ds(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&an(u,o.clone(u)),u}function Jo(e=" ",t=0){return lt(xn,null,e,t)}function yb(e,t){const s=lt(Pn,null,e);return s.staticCount=t,s}function gp(e="",t=!1){return t?(hi(),vl(pt,null,e)):lt(pt,null,e)}function Xt(e){return e==null||typeof e=="boolean"?lt(pt):ve(e)?lt(At,null,e.slice()):ln(e)?zs(e):lt(xn,null,String(e))}function zs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ds(e)}function Yo(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(ve(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Yo(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Qf(t)?t._ctx=Ot:a===3&&Ot&&(Ot.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else we(t)?(t={default:t,_ctx:Ot},s=32):(t=String(t),n&64?(s=16,t=[Jo(t)]):s=8);e.children=t,e.shapeFlag|=s}function vp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Ti([t.class,n.class]));else if(a==="style")t.style=Si([t.style,n.style]);else if(zn(a)){const i=t[a],l=n[a];l&&i!==l&&!(ve(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Fl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Yt(e,t,s,n=null){is(e,t,7,[s,n])}const xb=qf();let _b=0;function bp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||xb,i={uid:_b++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Eo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:ep(n,a),emitsOptions:Wf(n,a),emit:null,emitted:null,propsDefaults:Fe,inheritAttrs:n.inheritAttrs,ctx:Fe,data:Fe,props:Fe,attrs:Fe,slots:Fe,refs:Fe,setupState:Fe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Jv.bind(null,i),e.ce&&e.ce(i),i}let Nt=null;const Gt=()=>Nt||Ot;let bl,ga;{const e=Vl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};bl=t("__VUE_INSTANCE_SETTERS__",s=>Nt=s),ga=t("__VUE_SSR_SETTERS__",s=>Hn=s)}const Oa=e=>{const t=Nt;return bl(e),e.scope.on(),()=>{e.scope.off(),bl(t)}},gi=()=>{Nt&&Nt.scope.off(),bl(null)};function yp(e){return e.vnode.shapeFlag&4}let Hn=!1;function xp(e,t=!1,s=!1){t&&ga(t);const{props:n,children:a}=e.vnode,i=yp(e);sb(e,n,i,t),lb(e,a,s||t);const l=i?kb(e,t):void 0;return t&&ga(!1),l}function kb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Zr);const{setup:n}=s;if(n){sn();const a=e.setupContext=n.length>1?wp(e):null,i=Oa(e),l=Na(n,e,0,[e.props,a]),r=Co(l);if(nn(),i(),(r||e.sp)&&!Xs(e)&&$o(e),r){if(l.then(gi,gi),t)return l.then(o=>{eo(e,o,t)}).catch(o=>{Gn(o,e,0)});e.asyncDep=l}else eo(e,l,t)}else kp(e,t)}function eo(e,t,s){we(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Ve(t)&&(e.setupState=Lo(t)),kp(e,s)}let yl,to;function _p(e){yl=e,to=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Av))}}const wb=()=>!yl;function kp(e,t,s){const n=e.type;if(!e.render){if(!t&&yl&&!n.render){const a=n.template||Ko(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=De(De({isCustomElement:i,delimiters:r},l),o);n.render=yl(a,c)}}e.render=n.render||Lt,to&&to(e)}{const a=Oa(e);sn();try{Vv(e)}finally{nn(),a()}}}const Sb={get(e,t){return $t(e,"get",""),e[t]}};function wp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Sb),slots:e.slots,emit:e.emit,expose:t}}function Ii(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Lo(vf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Xa)return Xa[s](e)},has(t,s){return s in t||s in Xa}})):e.proxy}function so(e,t=!0){return we(e)?e.displayName||e.name:e.name||t&&e.__name}function Tb(e){return we(e)&&"__vccOpts"in e}const Q=(e,t)=>Ng(e,t,Hn);function xa(e,t,s){try{mi(-1);const n=arguments.length;return n===2?Ve(t)&&!ve(t)?ln(t)?lt(e,null,[t]):lt(e,t):lt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&ln(s)&&(s=[s]),lt(e,t,s))}finally{mi(1)}}function Cb(){}function Eb(e,t,s,n){const a=s[n];if(a&&Sp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Sp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Ct(s[n],t[n]))return!1;return Un>0&&Bt&&Bt.push(e),!0}const Tp="3.5.38",Ab=Lt,Rb=Ug,Ib=aa,Nb=Cf,Ob={createComponentInstance:bp,setupComponent:xp,renderComponentRoot:el,setCurrentRenderingInstance:di,isVNode:ln,normalizeVNode:Xt,getComponentPublicInstance:Ii,ensureValidVNode:zo,pushWarningContext:Pg,popWarningContext:Fg},Lb=Ob,Db=null,Mb=null,Pb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let no;const hu=typeof window<"u"&&window.trustedTypes;if(hu)try{no=hu.createPolicy("vue",{createHTML:e=>e})}catch{}const Cp=no?e=>no.createHTML(e):e=>e,Fb="http://www.w3.org/2000/svg",$b="http://www.w3.org/1998/Math/MathML",js=typeof document<"u"?document:null,mu=js&&js.createElement("template"),Ep={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?js.createElementNS(Fb,e):t==="mathml"?js.createElementNS($b,e):s?js.createElement(e,{is:s}):js.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>js.createTextNode(e),createComment:e=>js.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>js.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{mu.innerHTML=Cp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=mu.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},dn="transition",$a="animation",_a=Symbol("_vtc"),Ap={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Rp=De({},Fo,Ap),Bb=e=>(e.displayName="Transition",e.props=Rp,e),Ub=Bb((e,{slots:t})=>xa(Mf,Ip(e),t)),En=(e,t=[])=>{ve(e)?e.forEach(s=>s(...t)):e&&e(...t)},gu=e=>e?ve(e)?e.some(t=>t.length>1):e.length>1:!1;function Ip(e){const t={};for(const P in e)P in Ap||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,g=Hb(a),m=g&&g[0],k=g&&g[1],{onBeforeEnter:E,onEnter:y,onEnterCancelled:v,onLeave:x,onLeaveCancelled:T,onBeforeAppear:N=E,onAppear:O=y,onAppearCancelled:w=v}=t,A=(P,S,$,q)=>{P._enterCancelled=q,mn(P,S?u:r),mn(P,S?c:l),$&&$()},L=(P,S)=>{P._isLeaving=!1,mn(P,d),mn(P,p),mn(P,f),S&&S()},B=P=>(S,$)=>{const q=P?O:y,G=()=>A(S,P,$);En(q,[S,G]),vu(()=>{mn(S,P?o:i),Cs(S,P?u:r),gu(q)||bu(S,n,m,G)})};return De(t,{onBeforeEnter(P){En(E,[P]),Cs(P,i),Cs(P,l)},onBeforeAppear(P){En(N,[P]),Cs(P,o),Cs(P,c)},onEnter:B(!1),onAppear:B(!0),onLeave(P,S){P._isLeaving=!0;const $=()=>L(P,S);Cs(P,d),P._enterCancelled?(Cs(P,f),ao(P)):(ao(P),Cs(P,f)),vu(()=>{P._isLeaving&&(mn(P,d),Cs(P,p),gu(x)||bu(P,n,k,$))}),En(x,[P,$])},onEnterCancelled(P){A(P,!1,void 0,!0),En(v,[P])},onAppearCancelled(P){A(P,!0,void 0,!0),En(w,[P])},onLeaveCancelled(P){L(P),En(T,[P])}})}function Hb(e){if(e==null)return null;if(Ve(e))return[Sr(e.enter),Sr(e.leave)];{const t=Sr(e);return[t,t]}}function Sr(e){return rl(e)}function Cs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[_a]||(e[_a]=new Set)).add(t)}function mn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[_a];s&&(s.delete(t),s.size||(e[_a]=void 0))}function vu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Vb=0;function bu(e,t,s,n){const a=e._endId=++Vb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Np(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Np(e,t){const s=window.getComputedStyle(e),n=g=>(s[g]||"").split(", "),a=n(`${dn}Delay`),i=n(`${dn}Duration`),l=yu(a,i),r=n(`${$a}Delay`),o=n(`${$a}Duration`),c=yu(r,o);let u=null,d=0,f=0;t===dn?l>0&&(u=dn,d=l,f=i.length):t===$a?c>0&&(u=$a,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?dn:$a:null,f=u?u===dn?i.length:o.length:0);const p=u===dn&&/\b(?:transform|all)(?:,|$)/.test(n(`${dn}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function yu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>xu(s)+xu(e[n])))}function xu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function ao(e){return(e?e.ownerDocument:document).body.offsetHeight}function jb(e,t,s){const n=e[_a];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const xl=Symbol("_vod"),Qo=Symbol("_vsh"),Op={name:"show",beforeMount(e,{value:t},{transition:s}){e[xl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ba(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Ba(e,!0),n.enter(e)):n.leave(e,()=>{Ba(e,!1)}):Ba(e,t))},beforeUnmount(e,{value:t}){Ba(e,t)}};function Ba(e,t){e.style.display=t?e[xl]:"none",e[Qo]=!t}function zb(){Op.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Lp=Symbol("");function Kb(e){const t=Gt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>_l(i,a))},n=()=>{const a=e(t.proxy);t.ce?_l(t.ce,a):io(t.subTree,a),s(a)};Ho(()=>{ci(n)}),Ue(()=>{hs(n,Lt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ht(()=>a.disconnect())})}function io(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{io(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)_l(e.el,t);else if(e.type===At)e.children.forEach(s=>io(s,t));else if(e.type===Pn){let{el:s,anchor:n}=e;for(;s&&(_l(s,t),s!==n);)s=s.nextSibling}}function _l(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Ym(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Lp]=n}}const qb=/(?:^|;)\s*display\s*:/;function Gb(e,t,s){const n=e.style,a=Ee(s);let i=!1;if(s&&!a){if(t)if(Ee(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Wa(n,r,"")}else for(const l in t)s[l]==null&&Wa(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Zb(e,l,!Ee(t)&&t?t[l]:void 0,r)||Wa(n,l,r):Wa(n,l,"")}}else if(a){if(t!==s){const l=n[Lp];l&&(s+=";"+l),n.cssText=s,i=qb.test(s)}}else t&&e.removeAttribute("style");xl in e&&(e[xl]=i?n.display:"",e[Qo]&&(n.display="none"))}const _u=/\s*!important$/;function Wa(e,t,s){if(ve(s))s.forEach(n=>Wa(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Wb(e,t);_u.test(s)?e.setProperty(es(n),s.replace(_u,""),"important"):e[n]=s}}const ku=["Webkit","Moz","ms"],Tr={};function Wb(e,t){const s=Tr[t];if(s)return s;let n=Qe(t);if(n!=="filter"&&n in e)return Tr[t]=n;n=qn(n);for(let a=0;a<ku.length;a++){const i=ku[a]+n;if(i in e)return Tr[t]=i}return t}function Zb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ee(n)&&s===n}const wu="http://www.w3.org/1999/xlink";function Su(e,t,s,n,a,i=Zm(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(wu,t.slice(6,t.length)):e.setAttributeNS(wu,t,s):s==null||i&&!Jd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Ht(s)?String(s):s)}function Tu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Cp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Jd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Ws(e,t,s,n){e.addEventListener(t,s,n)}function Jb(e,t,s,n){e.removeEventListener(t,s,n)}const Cu=Symbol("_vei");function Yb(e,t,s,n,a=null){const i=e[Cu]||(e[Cu]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Qb(t);if(n){const c=i[t]=ty(n,a);Ws(e,r,c,o)}else l&&(Jb(e,r,l,o),i[t]=void 0)}}const Eu=/(?:Once|Passive|Capture)$/;function Qb(e){let t;if(Eu.test(e)){t={};let n;for(;n=e.match(Eu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):es(e.slice(2)),t]}let Cr=0;const Xb=Promise.resolve(),ey=()=>Cr||(Xb.then(()=>Cr=0),Cr=Date.now());function ty(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(ve(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&is(c,t,5,r)}}else is(a,t,5,[n])};return s.value=e,s.attached=ey(),s}const Au=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Dp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?jb(e,n,l):t==="style"?Gb(e,s,n):zn(t)?Fl(t)||Yb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):sy(e,t,n,l))?(Tu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Su(e,t,n,l,i,t!=="value")):e._isVueCE&&(ny(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ee(n)))?Tu(e,Qe(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Su(e,t,n,l))};function sy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Au(t)&&we(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Au(t)&&Ee(s)?!1:t in e}function ny(e,t){const s=e._def.props;if(!s)return!1;const n=Qe(t);return Array.isArray(s)?s.some(a=>Qe(a)===n):Object.keys(s).some(a=>Qe(a)===n)}const Ru={};function Mp(e,t,s){let n=Ai(e,t);$l(n)&&(n=De({},n,t));class a extends tr{constructor(l){super(n,l,s)}}return a.def=n,a}const ay=((e,t)=>Mp(e,t,Wp)),iy=typeof HTMLElement<"u"?HTMLElement:class{};class tr extends iy{constructor(t,s={},n=Sl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Sl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(De({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof tr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!ve(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=rl(this._props[o])),(r||(r=Object.create(null)))[Qe(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)je(this,n)||Object.defineProperty(this,n,{get:()=>Os(s[n])})}_resolveProps(t){const{props:s}=t,n=ve(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Qe))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Ru;const a=Qe(t);s&&this._numberProps&&this._numberProps[a]&&(n=rl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Ru?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(es(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(es(t),s+""):s||this.removeAttribute(es(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Gp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=lt(this._def,De(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,$l(l[0])?De({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),es(i)!==i&&a(es(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Pp(e){const t=Gt(),s=t&&t.ce;return s||null}function ly(){const e=Pp();return e&&e.shadowRoot}function ry(e="$style"){{const t=Gt();if(!t)return Fe;const s=t.type.__cssModules;if(!s)return Fe;const n=s[e];return n||Fe}}const Fp=new WeakMap,$p=new WeakMap,kl=Symbol("_moveCb"),Iu=Symbol("_enterCb"),oy=e=>(delete e.props.mode,e),cy=oy({name:"TransitionGroup",props:De({},Rp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Gt(),n=Po();let a,i;return Yl(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!hy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(dy),a.forEach(fy);const r=a.filter(py);ao(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;Cs(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[kl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[kl]=null,mn(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Be(e),r=Ip(l);let o=l.tag||At;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[Qo]&&(a.push(u),an(u,ya(u,r,n,s)),Fp.set(u,Bp(u.el)))}i=t.default?Zl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&an(u,ya(u,r,n,s))}return lt(o,null,i)}}}),uy=cy;function dy(e){const t=e.el;t[kl]&&t[kl](),t[Iu]&&t[Iu]()}function fy(e){$p.set(e,Bp(e.el))}function py(e){const t=Fp.get(e),s=$p.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Bp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function hy(e,t,s){const n=e.cloneNode(),a=e[_a];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Np(n);return i.removeChild(n),l}const kn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return ve(t)?s=>fa(t,s):t};function my(e){e.target.composing=!0}function Nu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const ms=Symbol("_assign");function Ou(e,t,s){return t&&(e=e.trim()),s&&(e=Hl(e)),e}const wl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[ms]=kn(a);const i=n||a.props&&a.props.type==="number";Ws(e,t?"change":"input",l=>{l.target.composing||e[ms](Ou(e.value,s,i))}),(s||i)&&Ws(e,"change",()=>{e.value=Ou(e.value,s,i)}),t||(Ws(e,"compositionstart",my),Ws(e,"compositionend",Nu),Ws(e,"change",Nu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[ms]=kn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Hl(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Xo={deep:!0,created(e,t,s){e[ms]=kn(s),Ws(e,"change",()=>{const n=e._modelValue,a=ka(e),i=e.checked,l=e[ms];if(ve(n)){const r=jl(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Kn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Hp(e,i))})},mounted:Lu,beforeUpdate(e,t,s){e[ms]=kn(s),Lu(e,t,s)}};function Lu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(ve(t))a=jl(t,n.props.value)>-1;else if(Kn(t))a=t.has(n.props.value);else{if(t===s)return;a=tn(t,Hp(e,!0))}e.checked!==a&&(e.checked=a)}const ec={created(e,{value:t},s){e.checked=tn(t,s.props.value),e[ms]=kn(s),Ws(e,"change",()=>{e[ms](ka(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[ms]=kn(n),t!==s&&(e.checked=tn(t,n.props.value))}},Up={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Kn(t);Ws(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Hl(ka(l)):ka(l));e[ms](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[ms]=kn(n)},mounted(e,{value:t}){Du(e,t)},beforeUpdate(e,t,s){e[ms]=kn(s)},updated(e,{value:t}){e._assigning||Du(e,t)}};function Du(e,t){const s=e.multiple,n=ve(t);if(!(s&&!n&&!Kn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ka(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=jl(t,r)>-1}else l.selected=t.has(r);else if(tn(ka(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ka(e){return"_value"in e?e._value:e.value}function Hp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Vp={created(e,t,s){Gi(e,t,s,null,"created")},mounted(e,t,s){Gi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Gi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Gi(e,t,s,n,"updated")}};function jp(e,t){switch(e){case"SELECT":return Up;case"TEXTAREA":return wl;default:switch(t){case"checkbox":return Xo;case"radio":return ec;default:return wl}}}function Gi(e,t,s,n,a){const l=jp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function gy(){wl.getSSRProps=({value:e})=>({value:e}),ec.getSSRProps=({value:e},t)=>{if(t.props&&tn(t.props.value,e))return{checked:!0}},Xo.getSSRProps=({value:e},t)=>{if(ve(e)){if(t.props&&jl(e,t.props.value)>-1)return{checked:!0}}else if(Kn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Vp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=jp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const vy=["ctrl","shift","alt","meta"],by={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>vy.some(s=>e[`${s}Key`]&&!t.includes(s))},yy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=by[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},xy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},_y=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=es(a.key);if(t.some(l=>l===i||xy[l]===i))return e(a)}))},zp=De({patchProp:Dp},Ep);let ti,Mu=!1;function Kp(){return ti||(ti=ap(zp))}function qp(){return ti=Mu?ti:ip(zp),Mu=!0,ti}const Gp=((...e)=>{Kp().render(...e)}),ky=((...e)=>{qp().hydrate(...e)}),Sl=((...e)=>{const t=Kp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Jp(n);if(!a)return;const i=t._component;!we(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Zp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Wp=((...e)=>{const t=qp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Jp(n);if(a)return s(a,!0,Zp(a))},t});function Zp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Jp(e){return Ee(e)?document.querySelector(e):e}let Pu=!1;const wy=()=>{Pu||(Pu=!0,gy(),zb())},Sy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Mf,BaseTransitionPropsValidators:Fo,Comment:pt,DeprecationTypes:Pb,EffectScope:Eo,ErrorCodes:Bg,ErrorTypeStrings:Rb,Fragment:At,KeepAlive:bv,ReactiveEffect:li,Static:Pn,Suspense:ub,Teleport:ev,Text:xn,TrackOpTypes:Og,Transition:Ub,TransitionGroup:uy,TriggerOpTypes:Lg,VueElement:tr,assertNumber:$g,callWithAsyncErrorHandling:is,callWithErrorHandling:Na,camelize:Qe,capitalize:qn,cloneVNode:Ds,compatUtils:Mb,computed:Q,createApp:Sl,createBlock:vl,createCommentVNode:gp,createElementBlock:gb,createElementVNode:Zo,createHydrationRenderer:ip,createPropsRestProxy:Uv,createRenderer:ap,createSSRApp:Wp,createSlots:Tv,createStaticVNode:yb,createTextVNode:Jo,createVNode:lt,customRef:yf,defineAsyncComponent:gv,defineComponent:Ai,defineCustomElement:Mp,defineEmits:Iv,defineExpose:Nv,defineModel:Dv,defineOptions:Ov,defineProps:Rv,defineSSRCustomElement:ay,defineSlots:Lv,devtools:Ib,effect:tg,effectScope:Qm,getCurrentInstance:Gt,getCurrentScope:ef,getCurrentWatcher:Dg,getTransitionRawChildren:Zl,guardReactiveProps:mp,h:xa,handleError:Gn,hasInjectionContext:Gg,hydrate:ky,hydrateOnIdle:uv,hydrateOnInteraction:hv,hydrateOnMediaQuery:pv,hydrateOnVisible:fv,initCustomFormatter:Cb,initDirectivesForSSR:wy,inject:ps,isMemoSame:Sp,isProxy:Ci,isReactive:Qs,isReadonly:Ls,isRef:bt,isRuntimeOnly:wb,isShallow:ss,isVNode:ln,markRaw:vf,mergeDefaults:$v,mergeModels:Bv,mergeProps:vp,nextTick:Et,nodeOps:Ep,normalizeClass:Ti,normalizeProps:Bm,normalizeStyle:Si,onActivated:Bo,onBeforeMount:$f,onBeforeUnmount:Ql,onBeforeUpdate:Ho,onDeactivated:Uo,onErrorCaptured:Vf,onMounted:Ue,onRenderTracked:Hf,onRenderTriggered:Uf,onScopeDispose:Xm,onServerPrefetch:Bf,onUnmounted:ht,onUpdated:Yl,onWatcherCleanup:_f,openBlock:hi,patchProp:Dp,popScopeId:zg,provide:Qa,proxyRefs:Lo,pushScopeId:jg,queuePostFlushCb:ci,reactive:wn,readonly:cl,ref:h,registerRuntimeCompiler:_p,render:Gp,renderList:Sv,renderSlot:Cv,resolveComponent:_v,resolveDirective:wv,resolveDynamicComponent:kv,resolveFilter:Db,resolveTransitionHooks:ya,setBlockTracking:mi,setDevtoolsHook:Nb,setTransitionHooks:an,shallowReactive:No,shallowReadonly:xg,shallowRef:Oo,ssrContextKey:Ef,ssrUtils:Lb,stop:sg,toDisplayString:Qd,toHandlerKey:da,toHandlers:Ev,toRaw:Be,toRef:Rg,toRefs:Cg,toValue:wg,transformVNodeArgs:vb,triggerRef:kg,unref:Os,useAttrs:Fv,useCssModule:ry,useCssVars:Kb,useHost:Pp,useId:sv,useModel:Zv,useSSRContext:Af,useShadowRoot:ly,useSlots:Pv,useTemplateRef:nv,useTransitionState:Po,vModelCheckbox:Xo,vModelDynamic:Vp,vModelRadio:ec,vModelSelect:Up,vModelText:wl,vShow:Op,version:Tp,warn:Ab,watch:hs,watchEffect:Wg,watchPostEffect:Zg,watchSyncEffect:Rf,withAsyncContext:Hv,withCtx:Mo,withDefaults:Mv,withDirectives:qg,withKeys:_y,withMemo:Eb,withModifiers:yy,withScopeId:Kg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const vi=Symbol(""),si=Symbol(""),tc=Symbol(""),Tl=Symbol(""),Yp=Symbol(""),Vn=Symbol(""),Qp=Symbol(""),Xp=Symbol(""),sc=Symbol(""),nc=Symbol(""),Ni=Symbol(""),ac=Symbol(""),eh=Symbol(""),ic=Symbol(""),lc=Symbol(""),rc=Symbol(""),oc=Symbol(""),cc=Symbol(""),uc=Symbol(""),th=Symbol(""),sh=Symbol(""),sr=Symbol(""),Cl=Symbol(""),dc=Symbol(""),fc=Symbol(""),bi=Symbol(""),Oi=Symbol(""),pc=Symbol(""),lo=Symbol(""),Ty=Symbol(""),ro=Symbol(""),El=Symbol(""),Cy=Symbol(""),Ey=Symbol(""),hc=Symbol(""),Ay=Symbol(""),Ry=Symbol(""),mc=Symbol(""),nh=Symbol(""),wa={[vi]:"Fragment",[si]:"Teleport",[tc]:"Suspense",[Tl]:"KeepAlive",[Yp]:"BaseTransition",[Vn]:"openBlock",[Qp]:"createBlock",[Xp]:"createElementBlock",[sc]:"createVNode",[nc]:"createElementVNode",[Ni]:"createCommentVNode",[ac]:"createTextVNode",[eh]:"createStaticVNode",[ic]:"resolveComponent",[lc]:"resolveDynamicComponent",[rc]:"resolveDirective",[oc]:"resolveFilter",[cc]:"withDirectives",[uc]:"renderList",[th]:"renderSlot",[sh]:"createSlots",[sr]:"toDisplayString",[Cl]:"mergeProps",[dc]:"normalizeClass",[fc]:"normalizeStyle",[bi]:"normalizeProps",[Oi]:"guardReactiveProps",[pc]:"toHandlers",[lo]:"camelize",[Ty]:"capitalize",[ro]:"toHandlerKey",[El]:"setBlockTracking",[Cy]:"pushScopeId",[Ey]:"popScopeId",[hc]:"withCtx",[Ay]:"unref",[Ry]:"isRef",[mc]:"withMemo",[nh]:"isMemoSame"};function Iy(e){Object.getOwnPropertySymbols(e).forEach(t=>{wa[t]=e[t]})}const os={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ny(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:os}}function yi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=os){return e&&(r?(e.helper(Vn),e.helper(Ca(e.inSSR,c))):e.helper(Ta(e.inSSR,c)),l&&e.helper(cc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function Fn(e,t=os){return{type:17,loc:t,elements:e}}function fs(e,t=os){return{type:15,loc:t,properties:e}}function vt(e,t){return{type:16,loc:os,key:Ee(e)?Re(e,!0):e,value:t}}function Re(e,t=!1,s=os,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function _s(e,t=os){return{type:8,loc:t,children:e}}function St(e,t=[],s=os){return{type:14,loc:s,callee:e,arguments:t}}function Sa(e,t=void 0,s=!1,n=!1,a=os){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function oo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:os}}function Oy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:os}}function Ly(e){return{type:21,body:e,loc:os}}function Ta(e,t){return e||t?sc:nc}function Ca(e,t){return e||t?Qp:Xp}function gc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Ta(n,e.isComponent)),t(Vn),t(Ca(n,e.isComponent)))}const Fu=new Uint8Array([123,123]),$u=new Uint8Array([125,125]);function Bu(e){return e>=97&&e<=122||e>=65&&e<=90}function ns(e){return e===32||e===10||e===9||e===12||e===13}function fn(e){return e===47||e===62||ns(e)}function Al(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Mt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Dy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Fu,this.delimiterClose=$u,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Fu,this.delimiterClose=$u}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?fn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||ns(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Mt.TitleEnd||this.currentSequence===Mt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Mt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Mt.Cdata.length&&(this.state=28,this.currentSequence=Mt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Mt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Bu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){fn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(fn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Al("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){ns(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Bu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||ns(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):ns(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):ns(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||fn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||fn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||fn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||fn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||fn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):ns(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):ns(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){ns(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Mt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Mt.ScriptEnd[3]?this.startSpecial(Mt.ScriptEnd,4):t===Mt.StyleEnd[3]?this.startSpecial(Mt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Mt.TitleEnd[3]?this.startSpecial(Mt.TitleEnd,4):t===Mt.TextareaEnd[3]?this.startSpecial(Mt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Mt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Uu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function $n(e,t){const s=Uu("MODE",t),n=Uu(e,t);return s===3?n===!0:n!==!1}function xi(e,t,s,...n){return $n(e,t)}function vc(e){throw e}function ah(e){}function at(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ts=e=>e.type===4&&e.isStatic;function ih(e){switch(e){case"Teleport":case"teleport":return si;case"Suspense":case"suspense":return tc;case"KeepAlive":case"keep-alive":return Tl;case"BaseTransition":case"base-transition":return Yp}}const My=/^$|^\d|[^\$\w\xA0-\uFFFF]/,bc=e=>!My.test(e),lh=/[A-Za-z_$\xA0-\uFFFF]/,Py=/[\.\?\w$\xA0-\uFFFF]/,Fy=/\s+[.[]\s*|\s*[.[]\s+/g,rh=e=>e.type===4?e.content:e.loc.source,$y=e=>{const t=rh(e).trim().replace(Fy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?lh:Py).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},oh=$y,By=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Uy=e=>By.test(rh(e)),Hy=Uy;function ds(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ee(t)?a.name===t:t.test(a.name)))return a}}function nr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Nn(i.arg,t))return i}}function Nn(e,t){return!!(e&&ts(e)&&e.content===t)}function Vy(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Er(e){return e.type===5||e.type===2}function Hu(e){return e.type===7&&e.name==="pre"}function jy(e){return e.type===7&&e.name==="slot"}function Rl(e){return e.type===1&&e.tagType===3}function Il(e){return e.type===1&&e.tagType===2}const zy=new Set([bi,Oi]);function ch(e,t=[]){if(e&&!Ee(e)&&e.type===14){const s=e.callee;if(!Ee(s)&&zy.has(s))return ch(e.arguments[0],t.concat(e))}return[e,t]}function Nl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ee(a)&&a.type===14){const r=ch(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Ee(a))n=fs([t]);else if(a.type===14){const r=a.arguments[0];!Ee(r)&&r.type===15?Vu(t,r)||r.properties.unshift(t):a.callee===pc?n=St(s.helper(Cl),[fs([t]),a]):a.arguments.unshift(fs([t])),!n&&(n=a)}else a.type===15?(Vu(t,a)||a.properties.unshift(t),n=a):(n=St(s.helper(Cl),[fs([t]),a]),l&&l.callee===Oi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Vu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function _i(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Ky(e){return e.type===14&&e.callee===mc?e.arguments[1].returns:e}const qy=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function uh(e){for(let t=0;t<e.length;t++)if(!ns(e.charCodeAt(t)))return!1;return!0}function yc(e){return e.type===2&&uh(e.content)||e.type===12&&yc(e.content)}function dh(e){return e.type===3||yc(e)}const fh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ra,isPreTag:ra,isIgnoreNewlineTag:ra,isCustomElement:ra,onError:vc,onWarn:ah,comments:!1,prefixIdentifiers:!1};let He=fh,ki=null,en="",Ft=null,$e=null,Jt="",Vs=-1,Rn=-1,xc=0,bn=!1,co=null;const nt=[],ut=new Dy(nt,{onerr:Bs,ontext(e,t){Wi(It(e,t),e,t)},ontextentity(e,t,s){Wi(e,t,s)},oninterpolation(e,t){if(bn)return Wi(It(e,t),e,t);let s=e+ut.delimiterOpen.length,n=t-ut.delimiterClose.length;for(;ns(en.charCodeAt(s));)s++;for(;ns(en.charCodeAt(n-1));)n--;let a=It(s,n);a.includes("&")&&(a=He.decodeEntities(a,!1)),uo({type:5,content:nl(a,!1,ft(s,n)),loc:ft(e,t)})},onopentagname(e,t){const s=It(e,t);Ft={type:1,tag:s,ns:He.getNamespace(s,nt[0],He.ns),tagType:0,props:[],children:[],loc:ft(e-1,t),codegenNode:void 0}},onopentagend(e){zu(e)},onclosetag(e,t){const s=It(e,t);if(!He.isVoidTag(s)){let n=!1;for(let a=0;a<nt.length;a++)if(nt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Bs(24,nt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=nt.shift();sl(r,t,l<a)}break}n||Bs(23,ph(e,60))}},onselfclosingtag(e){const t=Ft.tag;Ft.isSelfClosing=!0,zu(e),nt[0]&&nt[0].tag===t&&sl(nt.shift(),e)},onattribname(e,t){$e={type:6,name:It(e,t),nameLoc:ft(e,t),value:void 0,loc:ft(e)}},ondirname(e,t){const s=It(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!bn&&n===""&&Bs(26,e),bn||n==="")$e={type:6,name:s,nameLoc:ft(e,t),value:void 0,loc:ft(e)};else if($e={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Re("prop")]:[],loc:ft(e)},n==="pre"){bn=ut.inVPre=!0,co=Ft;const a=Ft.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=s0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=It(e,t);if(bn&&!Hu($e))$e.name+=s,On($e.nameLoc,t);else{const n=s[0]!=="[";$e.arg=nl(n?s:s.slice(1,-1),n,ft(e,t),n?3:0)}},ondirmodifier(e,t){const s=It(e,t);if(bn&&!Hu($e))$e.name+="."+s,On($e.nameLoc,t);else if($e.name==="slot"){const n=$e.arg;n&&(n.content+="."+s,On(n.loc,t))}else{const n=Re(s,!0,ft(e,t));$e.modifiers.push(n)}},onattribdata(e,t){Jt+=It(e,t),Vs<0&&(Vs=e),Rn=t},onattribentity(e,t,s){Jt+=e,Vs<0&&(Vs=t),Rn=s},onattribnameend(e){const t=$e.loc.start.offset,s=It(t,e);$e.type===7&&($e.rawName=s),Ft.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Bs(2,t)},onattribend(e,t){if(Ft&&$e){if(On($e.loc,t),e!==0)if(Jt.includes("&")&&(Jt=He.decodeEntities(Jt,!0)),$e.type===6)$e.name==="class"&&(Jt=mh(Jt).trim()),e===1&&!Jt&&Bs(13,t),$e.value={type:2,content:Jt,loc:e===1?ft(Vs,Rn):ft(Vs-1,Rn+1)},ut.inSFCRoot&&Ft.tag==="template"&&$e.name==="lang"&&Jt&&Jt!=="html"&&ut.enterRCDATA(Al("</template"),0);else{let s=0;$e.exp=nl(Jt,!1,ft(Vs,Rn),0,s),$e.name==="for"&&($e.forParseResult=Wy($e.exp));let n=-1;$e.name==="bind"&&(n=$e.modifiers.findIndex(a=>a.content==="sync"))>-1&&xi("COMPILER_V_BIND_SYNC",He,$e.loc,$e.arg.loc.source)&&($e.name="model",$e.modifiers.splice(n,1))}($e.type!==7||$e.name!=="pre")&&Ft.props.push($e)}Jt="",Vs=Rn=-1},oncomment(e,t){He.comments&&uo({type:3,content:It(e,t),loc:ft(e-4,t+3)})},onend(){const e=en.length;for(let t=0;t<nt.length;t++)sl(nt[t],e-1),Bs(24,nt[t].loc.start.offset)},oncdata(e,t){(nt[0]?nt[0].ns:He.ns)!==0?Wi(It(e,t),e,t):Bs(1,e-9)},onprocessinginstruction(e){(nt[0]?nt[0].ns:He.ns)===0&&Bs(21,e-1)}}),ju=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Gy=/^\(|\)$/g;function Wy(e){const t=e.loc,s=e.content,n=s.match(qy);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const g=t.start.offset+f,m=g+d.length;return nl(d,!1,ft(g,m),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Gy,"").trim();const c=a.indexOf(o),u=o.match(ju);if(u){o=o.replace(ju,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function It(e,t){return en.slice(e,t)}function zu(e){ut.inSFCRoot&&(Ft.innerLoc=ft(e+1,e+1)),uo(Ft);const{tag:t,ns:s}=Ft;s===0&&He.isPreTag(t)&&xc++,He.isVoidTag(t)?sl(Ft,e):(nt.unshift(Ft),(s===1||s===2)&&(ut.inXML=!0)),Ft=null}function Wi(e,t,s){{const i=nt[0]&&nt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=He.decodeEntities(e,!1))}const n=nt[0]||ki,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,On(a.loc,s)):n.children.push({type:2,content:e,loc:ft(t,s)})}function sl(e,t,s=!1){s?On(e.loc,ph(t,60)):On(e.loc,Zy(t,62)+1),ut.inSFCRoot&&(e.children.length?e.innerLoc.end=De({},e.children[e.children.length-1].loc.end):e.innerLoc.end=De({},e.innerLoc.start),e.innerLoc.source=It(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(bn||(n==="slot"?e.tagType=2:Ku(e)?e.tagType=3:Yy(e)&&(e.tagType=1)),ut.inRCDATA||(e.children=hh(i)),a===0&&He.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&He.isPreTag(n)&&xc--,co===e&&(bn=ut.inVPre=!1,co=null),ut.inXML&&(nt[0]?nt[0].ns:He.ns)===0&&(ut.inXML=!1);{const l=e.props;if(!ut.inSFCRoot&&$n("COMPILER_NATIVE_TEMPLATE",He)&&e.tag==="template"&&!Ku(e)){const o=nt[0]||ki,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&xi("COMPILER_INLINE_TEMPLATE",He,r.loc)&&e.children.length&&(r.value={type:2,content:It(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Zy(e,t){let s=e;for(;en.charCodeAt(s)!==t&&s<en.length-1;)s++;return s}function ph(e,t){let s=e;for(;en.charCodeAt(s)!==t&&s>=0;)s--;return s}const Jy=new Set(["if","else","else-if","for","slot"]);function Ku({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Jy.has(t[s].name))return!0}return!1}function Yy({tag:e,props:t}){if(He.isCustomElement(e))return!1;if(e==="component"||Qy(e.charCodeAt(0))||ih(e)||He.isBuiltInComponent&&He.isBuiltInComponent(e)||He.isNativeTag&&!He.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(xi("COMPILER_IS_ON_ELEMENT",He,n.loc))return!0}}else if(n.name==="bind"&&Nn(n.arg,"is")&&xi("COMPILER_IS_ON_ELEMENT",He,n.loc))return!0}return!1}function Qy(e){return e>64&&e<91}const Xy=/\r\n/g;function hh(e){const t=He.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(xc)a.content=a.content.replace(Xy,`
`);else if(uh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&e0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=mh(a.content))}return s?e.filter(Boolean):e}function e0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function mh(e){let t="",s=!1;for(let n=0;n<e.length;n++)ns(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function uo(e){(nt[0]||ki).children.push(e)}function ft(e,t){return{start:ut.getPos(e),end:t==null?t:ut.getPos(t),source:t==null?t:It(e,t)}}function t0(e){return ft(e.start.offset,e.end.offset)}function On(e,t){e.end=ut.getPos(t),e.source=It(e.start.offset,t)}function s0(e){const t={type:6,name:e.rawName,nameLoc:ft(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function nl(e,t=!1,s,n=0,a=0){return Re(e,t,s,n)}function Bs(e,t,s){He.onError(at(e,ft(t,t)))}function n0(){ut.reset(),Ft=null,$e=null,Jt="",Vs=-1,Rn=-1,nt.length=0}function a0(e,t){if(n0(),en=e,He=De({},fh),t){let a;for(a in t)t[a]!=null&&(He[a]=t[a])}ut.mode=He.parseMode==="html"?1:He.parseMode==="sfc"?2:0,ut.inXML=He.ns===1||He.ns===2;const s=t&&t.delimiters;s&&(ut.delimiterOpen=Al(s[0]),ut.delimiterClose=Al(s[1]));const n=ki=Ny([],e);return ut.parse(en),n.loc=ft(0,e.length),n.children=hh(n.children),ki=null,n}function i0(e,t){al(e,void 0,t,!!gh(e))}function gh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Il(t[0])?t[0]:null}function al(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:as(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const g=p.patchFlag;if((g===void 0||g===512||g===1)&&bh(d,s)>=2){const m=yh(d);m&&(p.props=s.hoist(m))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:as(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,al(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)al(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)al(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&ve(e.codegenNode.children))e.codegenNode.children=o(Fn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!ve(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(Fn(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!ve(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=ds(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(Fn(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!ve(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function as(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=bh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=as(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=as(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(Vn),t.removeHelper(Ca(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Ta(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return as(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Ee(r)||Ht(r))continue;const o=as(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const l0=new Set([dc,fc,bi,Oi]);function vh(e,t){if(e.type===14&&!Ee(e.callee)&&l0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return as(s,t);if(s.type===14)return vh(s,t)}return 0}function bh(e,t){let s=3;const n=yh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=as(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=as(r,t):r.type===14?c=vh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function yh(e){const t=e.codegenNode;if(t.type===13)return t.props}function r0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Lt,isCustomElement:u=Lt,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:g=!1,inSSR:m=!1,ssrCssVars:k="",bindingMetadata:E=Fe,inline:y=!1,isTS:v=!1,onError:x=vc,onWarn:T=ah,compatConfig:N}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),w={filename:t,selfName:O&&qn(Qe(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:g,inSSR:m,ssrCssVars:k,bindingMetadata:E,inline:y,isTS:v,onError:x,onWarn:T,compatConfig:N,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(A){const L=w.helpers.get(A)||0;return w.helpers.set(A,L+1),A},removeHelper(A){const L=w.helpers.get(A);if(L){const B=L-1;B?w.helpers.set(A,B):w.helpers.delete(A)}},helperString(A){return`_${wa[w.helper(A)]}`},replaceNode(A){w.parent.children[w.childIndex]=w.currentNode=A},removeNode(A){const L=w.parent.children,B=A?L.indexOf(A):w.currentNode?w.childIndex:-1;!A||A===w.currentNode?(w.currentNode=null,w.onNodeRemoved()):w.childIndex>B&&(w.childIndex--,w.onNodeRemoved()),w.parent.children.splice(B,1)},onNodeRemoved:Lt,addIdentifiers(A){},removeIdentifiers(A){},hoist(A){Ee(A)&&(A=Re(A)),w.hoists.push(A);const L=Re(`_hoisted_${w.hoists.length}`,!1,A.loc,2);return L.hoisted=A,L},cache(A,L=!1,B=!1){const P=Oy(w.cached.length,A,L,B);return w.cached.push(P),P}};return w.filters=new Set,w}function o0(e,t){const s=r0(e,t);ar(e,s),t.hoistStatic&&i0(e,s),t.ssr||c0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function c0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=gh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&gc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=yi(t,s(vi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function u0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ee(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,ar(a,t))}}function ar(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(ve(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Ni);break;case 5:t.ssr||t.helper(sr);break;case 9:for(let i=0;i<e.branches.length;i++)ar(e.branches[i],t);break;case 10:case 11:case 1:case 0:u0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function xh(e,t){const s=Ee(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(jy))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const ir="/*@__PURE__*/",_h=e=>`${wa[e]}: _${wa[e]}`;function d0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(m){return`_${wa[m]}`},push(m,k=-2,E){p.code+=m},indent(){g(++p.indentLevel)},deindent(m=!1){m?--p.indentLevel:g(--p.indentLevel)},newline(){g(p.indentLevel)}};function g(m){p.push(`
`+"  ".repeat(m),0)}return p}function f0(e,t={}){const s=d0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";p0(e,s);const m=u?"ssrRender":"render",E=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${m}(${E}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(_h).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Ar(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Ar(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Ar(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?Ut(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function p0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[sc,nc,Ni,ac,eh].filter(f=>u.includes(f)).map(_h).join(", ");a(`const { ${d} } = _Vue
`,-1)}h0(e.hoists,t),i(),a("return ")}function Ar(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?oc:t==="component"?ic:rc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${_i(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function h0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Ut(i,t),n())}t.pure=!1}function _c(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Li(e,t,s),s&&t.deindent(),t.push("]")}function Li(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Ee(r)?a(r,-3):ve(r)?_c(r,t):Ut(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Ut(e,t){if(Ee(e)){t.push(e,-3);return}if(Ht(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Ut(e.codegenNode,t);break;case 2:m0(e,t);break;case 4:kh(e,t);break;case 5:g0(e,t);break;case 12:Ut(e.codegenNode,t);break;case 8:wh(e,t);break;case 3:b0(e,t);break;case 13:y0(e,t);break;case 14:_0(e,t);break;case 15:k0(e,t);break;case 17:w0(e,t);break;case 18:S0(e,t);break;case 19:T0(e,t);break;case 20:C0(e,t);break;case 21:Li(e.body,t,!0,!1);break}}function m0(e,t){t.push(JSON.stringify(e.content),-3,e)}function kh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function g0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(ir),s(`${n(sr)}(`),Ut(e.content,t),s(")")}function wh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ee(n)?t.push(n,-3):Ut(n,t)}}function v0(e,t){const{push:s}=t;if(e.type===8)s("["),wh(e,t),s("]");else if(e.isStatic){const n=bc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function b0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(ir),s(`${n(Ni)}(${JSON.stringify(e.content)})`,-3,e)}function y0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let g;o&&(g=String(o)),u&&s(n(cc)+"("),d&&s(`(${n(Vn)}(${f?"true":""}), `),a&&s(ir);const m=d?Ca(t.inSSR,p):Ta(t.inSSR,p);s(n(m)+"(",-2,e),Li(x0([i,l,r,g,c]),t),s(")"),d&&s(")"),u&&(s(", "),Ut(u,t),s(")"))}function x0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function _0(e,t){const{push:s,helper:n,pure:a}=t,i=Ee(e.callee)?e.callee:n(e.callee);a&&s(ir),s(i+"(",-2,e),Li(e.arguments,t),s(")")}function k0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];v0(c,t),s(": "),Ut(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function w0(e,t){_c(e.elements,t)}function S0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${wa[hc]}(`),s("(",-2,e),ve(i)?Li(i,t):i&&Ut(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),ve(l)?_c(l,t):Ut(l,t)):r&&Ut(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function T0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!bc(s.content);d&&l("("),kh(s,t),d&&l(")")}else l("("),Ut(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Ut(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,Ut(a,t),u||t.indentLevel--,i&&o(!0)}function C0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(El)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Ut(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(El)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const E0=xh(/^(?:if|else|else-if)$/,(e,t,s)=>A0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Gu(a,o,s);else{const c=R0(n.codegenNode);c.alternate=Gu(a,o+n.branches.length-1,s)}}}));function A0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(at(28,t.loc)),t.exp=Re("true",!1,a)}if(t.name==="if"){const a=qu(e,t),i={type:9,loc:t0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&dh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(at(30,e.loc)),s.removeNode();const r=qu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);ar(r,s),o&&o(),s.currentNode=null}else s.onError(at(30,e.loc));break}}}function qu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ds(e,"for")?e.children:[e],userKey:nr(e,"key"),isTemplateIf:s}}function Gu(e,t,s){return e.condition?oo(e.condition,Wu(e,t,s),St(s.helper(Ni),['""',"true"])):Wu(e,t,s)}function Wu(e,t,s){const{helper:n}=s,a=vt("key",Re(`${t}`,!1,os,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Nl(o,a,s),o}else return yi(s,n(vi),fs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Ky(o);return c.type===13&&gc(c,s),Nl(c,a,s),o}}function R0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const I0=xh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return N0(e,t,s,i=>{const l=St(n(uc),[i.source]),r=Rl(e),o=ds(e,"memo"),c=nr(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Re(c.value.content,!0):void 0:c.exp);const d=u?vt("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=yi(s,n(vi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let g;const{children:m}=i,k=m.length!==1||m[0].type!==1,E=Il(e)?e:r&&e.children.length===1&&Il(e.children[0])?e.children[0]:null;if(E?(g=E.codegenNode,r&&d&&Nl(g,d,s)):k?g=yi(s,n(vi),d?fs([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(g=m[0].codegenNode,r&&d&&Nl(g,d,s),g.isBlock!==!f&&(g.isBlock?(a(Vn),a(Ca(s.inSSR,g.isComponent))):a(Ta(s.inSSR,g.isComponent))),g.isBlock=!f,g.isBlock?(n(Vn),n(Ca(s.inSSR,g.isComponent))):n(Ta(s.inSSR,g.isComponent))),o){const y=Sa(fo(i.parseResult,[Re("_cached")]));y.body=Ly([_s(["const _memo = (",o.exp,")"]),_s(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(nh)}(_cached, _memo)) return _cached`]),_s(["const _item = ",g]),Re("_item.memo = _memo"),Re("return _item")]),l.arguments.push(y,Re("_cache"),Re(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Sa(fo(i.parseResult),g,!0))}})});function N0(e,t,s,n){if(!t.exp){s.onError(at(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(at(32,t.loc));return}Sh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:Rl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Sh(e,t){e.finalized||(e.finalized=!0)}function fo({value:e,key:t,index:s},n=[]){return O0([e,t,s,...n])}function O0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Re("_".repeat(n+1),!1))}const Zu=Re("undefined",!1),L0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ds(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},D0=(e,t,s,n)=>Sa(e,s,!1,!0,s.length?s[0].loc:n);function M0(e,t,s=D0){t.helper(hc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ds(e,"slot",!0);if(o){const{arg:k,exp:E}=o;k&&!ts(k)&&(r=!0),i.push(vt(k||Re("default",!0),s(E,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let k=0;k<n.length;k++){const E=n[k];let y;if(!Rl(E)||!(y=ds(E,"slot",!0))){E.type!==3&&d.push(E);continue}if(o){t.onError(at(37,y.loc));break}c=!0;const{children:v,loc:x}=E,{arg:T=Re("default",!0),exp:N,loc:O}=y;let w;ts(T)?w=T?T.content:"default":r=!0;const A=ds(E,"for"),L=s(N,A,v,x);let B,P;if(B=ds(E,"if"))r=!0,l.push(oo(B.exp,Zi(T,L,p++),Zu));else if(P=ds(E,/^else(?:-if)?$/,!0)){let S=k,$;for(;S--&&($=n[S],!!dh($)););if($&&Rl($)&&ds($,/^(?:else-)?if$/)){let q=l[l.length-1];for(;q.alternate.type===19;)q=q.alternate;q.alternate=P.exp?oo(P.exp,Zi(T,L,p++),Zu):Zi(T,L,p++)}else t.onError(at(30,P.loc))}else if(A){r=!0;const S=A.forParseResult;S?(Sh(S),l.push(St(t.helper(uc),[S.source,Sa(fo(S),Zi(T,L),!0)]))):t.onError(at(32,A.loc))}else{if(w){if(f.has(w)){t.onError(at(38,O));continue}f.add(w),w==="default"&&(u=!0)}i.push(vt(T,L))}}if(!o){const k=(E,y)=>{const v=s(E,void 0,y,a);return t.compatConfig&&(v.isNonScopedSlot=!0),vt("default",v)};c?d.length&&!d.every(yc)&&(u?t.onError(at(39,d[0].loc)):i.push(k(void 0,d))):i.push(k(void 0,n))}const g=r?2:il(e.children)?3:1;let m=fs(i.concat(vt("_",Re(g+"",!1))),a);return l.length&&(m=St(t.helper(sh),[m,Fn(l)])),{slots:m,hasDynamicSlots:r}}function Zi(e,t,s){const n=[vt("name",e),vt("fn",t)];return s!=null&&n.push(vt("key",Re(String(s),!0))),fs(n)}function il(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||il(s.children))return!0;break;case 9:if(il(s.branches))return!0;break;case 10:case 11:if(il(s.children))return!0;break}}return!1}const Th=new WeakMap,P0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?F0(e,t):`"${n}"`;const r=Ve(l)&&l.callee===lc;let o,c,u=0,d,f,p,g=r||l===si||l===tc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const m=Ch(e,t,void 0,i,r);o=m.props,u=m.patchFlag,f=m.dynamicPropNames;const k=m.directives;p=k&&k.length?Fn(k.map(E=>B0(E,t))):void 0,m.shouldUseBlock&&(g=!0)}if(e.children.length>0)if(l===Tl&&(g=!0,u|=1024),i&&l!==si&&l!==Tl){const{slots:k,hasDynamicSlots:E}=M0(e,t);c=k,E&&(u|=1024)}else if(e.children.length===1&&l!==si){const k=e.children[0],E=k.type,y=E===5||E===8;y&&as(k,t)===0&&(u|=1),y||E===2?c=k:c=e.children}else c=e.children;f&&f.length&&(d=U0(f)),e.codegenNode=yi(t,l,o,c,u===0?void 0:u,d,p,!!g,!1,i,e.loc)};function F0(e,t,s=!1){let{tag:n}=e;const a=po(n),i=nr(e,"is",!1,!0);if(i)if(a||$n("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Re(i.value.content,!0):(r=i.exp,r||(r=Re("is",!1,i.arg.loc))),r)return St(t.helper(lc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=ih(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(ic),t.components.add(n),_i(n,"component"))}function Ch(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,g=0,m=!1,k=!1,E=!1,y=!1,v=!1,x=!1;const T=[],N=L=>{c.length&&(u.push(fs(Ju(c),r)),c=[]),L&&u.push(L)},O=()=>{t.scopes.vFor>0&&c.push(vt(Re("ref_for",!0),Re("true")))},w=({key:L,value:B})=>{if(ts(L)){const P=L.content,S=zn(P);if(S&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!Ys(P)&&(y=!0),S&&Ys(P)&&(x=!0),S&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&as(B,t)>0)return;P==="ref"?m=!0:P==="class"?k=!0:P==="style"?E=!0:P!=="key"&&!T.includes(P)&&T.push(P),n&&(P==="class"||P==="style")&&!T.includes(P)&&T.push(P)}else v=!0};for(let L=0;L<s.length;L++){const B=s[L];if(B.type===6){const{loc:P,name:S,nameLoc:$,value:q}=B;let G=!0;if(S==="ref"&&(m=!0,O()),S==="is"&&(po(l)||q&&q.content.startsWith("vue:")||$n("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(vt(Re(S,!0,$),Re(q?q.content:"",G,q?q.loc:P)))}else{const{name:P,arg:S,exp:$,loc:q,modifiers:G}=B,D=P==="bind",I=P==="on";if(P==="slot"){n||t.onError(at(40,q));continue}if(P==="once"||P==="memo"||P==="is"||D&&Nn(S,"is")&&(po(l)||$n("COMPILER_IS_ON_ELEMENT",t))||I&&i)continue;if((D&&Nn(S,"key")||I&&f&&Nn(S,"vue:before-update"))&&(p=!0),D&&Nn(S,"ref")&&O(),!S&&(D||I)){if(v=!0,$)if(D){if(N(),$n("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift($);continue}O(),N(),u.push($)}else N({type:14,loc:q,callee:t.helper(pc),arguments:n?[$]:[$,"true"]});else t.onError(at(D?34:35,q));continue}D&&G.some(ue=>ue.content==="prop")&&(g|=32);const j=t.directiveTransforms[P];if(j){const{props:ue,needRuntime:fe}=j(B,e,t);!i&&ue.forEach(w),I&&S&&!ts(S)?N(fs(ue,r)):c.push(...ue),fe&&(d.push(B),Ht(fe)&&Th.set(B,fe))}else Im(P)||(d.push(B),f&&(p=!0))}}let A;if(u.length?(N(),u.length>1?A=St(t.helper(Cl),u,r):A=u[0]):c.length&&(A=fs(Ju(c),r)),v?g|=16:(k&&!n&&(g|=2),E&&!n&&(g|=4),T.length&&(g|=8),y&&(g|=32)),!p&&(g===0||g===32)&&(m||x||d.length>0)&&(g|=512),!t.inSSR&&A)switch(A.type){case 15:let L=-1,B=-1,P=!1;for(let q=0;q<A.properties.length;q++){const G=A.properties[q].key;ts(G)?G.content==="class"?L=q:G.content==="style"&&(B=q):G.isHandlerKey||(P=!0)}const S=A.properties[L],$=A.properties[B];P?A=St(t.helper(bi),[A]):(S&&!ts(S.value)&&(S.value=St(t.helper(dc),[S.value])),$&&(E||$.value.type===4&&$.value.content.trim()[0]==="["||$.value.type===17)&&($.value=St(t.helper(fc),[$.value])));break;case 14:break;default:A=St(t.helper(bi),[St(t.helper(Oi),[A])]);break}return{props:A,directives:d,patchFlag:g,dynamicPropNames:T,shouldUseBlock:p}}function Ju(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||zn(i))&&$0(l,a):(t.set(i,a),s.push(a))}return s}function $0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Fn([e.value,t.value],e.loc)}function B0(e,t){const s=[],n=Th.get(e);n?s.push(t.helperString(n)):(t.helper(rc),t.directives.add(e.name),s.push(_i(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Re("true",!1,a);s.push(fs(e.modifiers.map(l=>vt(l,i)),a))}return Fn(s,e.loc)}function U0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function po(e){return e==="component"||e==="Component"}const H0=(e,t)=>{if(Il(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=V0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Sa([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=St(t.helper(th),l,n)}};function V0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Qe(l.name),a.push(l)));else if(l.name==="bind"&&Nn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Qe(l.arg.content);s=l.exp=Re(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ts(l.arg)&&(l.arg.content=Qe(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Ch(e,t,a,!1,!1);n=i,l.length&&t.onError(at(36,l[0].loc))}return{slotName:s,slotProps:n}}const Eh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(at(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?da(Qe(d)):`on:${d}`;r=Re(f,!0,l.loc)}else r=_s([`${s.helperString(ro)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(ro)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=oh(o),f=!(d||Hy(o)),p=o.content.includes(";");(f||c&&d)&&(o=_s([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[vt(r,o||Re("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},j0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Qe(i.content):i.content=`${s.helperString(lo)}(${i.content})`:(i.children.unshift(`${s.helperString(lo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Yu(i,"."),n.some(r=>r.content==="attr")&&Yu(i,"^")),{props:[vt(i,l)]}},Yu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},z0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Er(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Er(o))n||(n=s[i]=_s([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Er(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&as(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:St(t.helper(ac),r)}}}}},Qu=new WeakSet,K0=(e,t)=>{if(e.type===1&&ds(e,"once",!0))return Qu.has(e)||t.inVOnce||t.inSSR?void 0:(Qu.add(e),t.inVOnce=!0,t.helper(El),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Ah=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(at(41,e.loc)),Ua();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(at(44,n.loc)),Ua();if(r==="literal-const"||r==="setup-const")return s.onError(at(45,n.loc)),Ua();if(!l.trim()||!oh(n))return s.onError(at(42,n.loc)),Ua();const o=a||Re("modelValue",!0),c=a?ts(a)?`onUpdate:${Qe(a.content)}`:_s(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=_s([`${d} => ((`,n,") = $event)"]);const f=[vt(o,e.exp),vt(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(m=>m.content).map(m=>(bc(m)?m:JSON.stringify(m))+": true").join(", "),g=a?ts(a)?`${a.content}Modifiers`:_s([a,' + "Modifiers"']):"modelModifiers";f.push(vt(g,Re(`{ ${p} }`,!1,e.loc,2)))}return Ua(f)};function Ua(e=[]){return{props:e}}const q0=/[\w).+\-_$\]]/,G0=(e,t)=>{$n("COMPILER_FILTERS",t)&&(e.type===5?Ol(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Ol(s.exp,t)}))};function Ol(e,t){if(e.type===4)Xu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Xu(n,t):n.type===8?Ol(e,t):n.type===5&&Ol(n.content,t))}}function Xu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,g,m=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)g===void 0?(u=p+1,g=s.slice(0,p).trim()):k();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let E=p-1,y;for(;E>=0&&(y=s.charAt(E),y===" ");E--);(!y||!q0.test(y))&&(l=!0)}}g===void 0?g=s.slice(0,p).trim():u!==0&&k();function k(){m.push(s.slice(u,p).trim()),u=p+1}if(m.length){for(p=0;p<m.length;p++)g=W0(g,m[p],t);e.content=g,e.ast=void 0}}function W0(e,t,s){s.helper(oc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${_i(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${_i(a,"filter")}(${e}${i!==")"?","+i:i}`}}const ed=new WeakSet,Z0=(e,t)=>{if(e.type===1){const s=ds(e,"memo");return!s||ed.has(e)||t.inSSR?void 0:(ed.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&gc(n,t),e.codegenNode=St(t.helper(mc),[s.exp,Sa(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},J0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(at(53,n.loc)),s.exp=Re("",!0,n.loc);else{const a=Qe(n.content);(lh.test(a[0])||a[0]==="-")&&(s.exp=Re(a,!1,n.loc))}}}};function Y0(e){return[[J0,K0,E0,Z0,I0,G0,H0,P0,L0,z0],{on:Eh,bind:j0,model:Ah}]}function Q0(e,t={}){const s=t.onError||vc,n=t.mode==="module";t.prefixIdentifiers===!0?s(at(48)):n&&s(at(49));const a=!1;t.cacheHandlers&&s(at(50)),t.scopeId&&!n&&s(at(51));const i=De({},t,{prefixIdentifiers:a}),l=Ee(e)?a0(e,i):e,[r,o]=Y0();return o0(l,De({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:De({},o,t.directiveTransforms||{})})),f0(l,i)}const X0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Rh=Symbol(""),Ih=Symbol(""),Nh=Symbol(""),Oh=Symbol(""),ho=Symbol(""),Lh=Symbol(""),Dh=Symbol(""),Mh=Symbol(""),Ph=Symbol(""),Fh=Symbol("");Iy({[Rh]:"vModelRadio",[Ih]:"vModelCheckbox",[Nh]:"vModelText",[Oh]:"vModelSelect",[ho]:"vModelDynamic",[Lh]:"withModifiers",[Dh]:"withKeys",[Mh]:"vShow",[Ph]:"Transition",[Fh]:"TransitionGroup"});let ea;function ex(e,t=!1){return ea||(ea=document.createElement("div")),t?(ea.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,ea.children[0].getAttribute("foo")):(ea.innerHTML=e,ea.textContent)}const tx={parseMode:"html",isVoidTag:Gm,isNativeTag:e=>zm(e)||Km(e)||qm(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:ex,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Ph;if(e==="TransitionGroup"||e==="transition-group")return Fh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},sx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Re("style",!0,t.loc),exp:nx(t.value.content,t.loc),modifiers:[],loc:t.loc})})},nx=(e,t)=>{const s=Zd(e);return Re(JSON.stringify(s),!1,t,3)};function _n(e,t){return at(e,t)}const ax=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(_n(54,a)),t.children.length&&(s.onError(_n(55,a)),t.children.length=0),{props:[vt(Re("innerHTML",!0,a),n||Re("",!0))]}},ix=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(_n(56,a)),t.children.length&&(s.onError(_n(57,a)),t.children.length=0),{props:[vt(Re("textContent",!0),n?as(n,s)>0?n:St(s.helperString(sr),[n],a):Re("",!0))]}},lx=(e,t,s)=>{const n=Ah(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(_n(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Nh,r=!1;if(a==="input"||i){const o=nr(t,"type");if(o){if(o.type===7)l=ho;else if(o.value)switch(o.value.content){case"radio":l=Rh;break;case"checkbox":l=Ih;break;case"file":r=!0,s.onError(_n(60,e.loc));break}}else Vy(t)&&(l=ho)}else a==="select"&&(l=Oh);r||(n.needRuntime=s.helper(l))}else s.onError(_n(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},rx=rs("passive,once,capture"),ox=rs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),cx=rs("left,right"),$h=rs("onkeyup,onkeydown,onkeypress"),ux=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&xi("COMPILER_V_ON_NATIVE",s)||rx(o)?l.push(o):cx(o)?ts(e)?$h(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):ox(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},td=(e,t)=>ts(e)&&e.content.toLowerCase()==="onclick"?Re(t,!0):e.type!==4?_s(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,dx=(e,t,s)=>Eh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=ux(i,a,s,e.loc);if(o.includes("right")&&(i=td(i,"onContextmenu")),o.includes("middle")&&(i=td(i,"onMouseup")),o.length&&(l=St(s.helper(Lh),[l,JSON.stringify(o)])),r.length&&(!ts(i)||$h(i.content.toLowerCase()))&&(l=St(s.helper(Dh),[l,JSON.stringify(r)])),c.length){const u=c.map(qn).join("");i=ts(i)?Re(`${i.content}${u}`,!0):_s(["(",i,`) + "${u}"`])}return{props:[vt(i,l)]}}),fx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(_n(62,a)),{props:[],needRuntime:s.helper(Mh)}},px=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},hx=[sx],mx={cloak:X0,html:ax,text:ix,model:lx,on:dx,show:fx};function gx(e,t={}){return Q0(e,De({},tx,t,{nodeTransforms:[px,...hx,...t.nodeTransforms||[]],directiveTransforms:De({},mx,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const sd=Object.create(null);function vx(e,t){if(!Ee(e))if(e.nodeType)e=e.innerHTML;else return Lt;const s=Lm(e,t),n=sd[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=De({hoistStatic:!0,onError:void 0,onWarn:Lt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=gx(e,a),l=new Function("Vue",i)(Sy);return l._rc=!0,sd[s]=l}_p(vx);const Ll=wn({items:[]});let bx=1;function lr(e,t="info",s=3e3){const n=bx++;return Ll.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>kc(n),s),n}function kc(e){const t=Ll.items.findIndex(s=>s.id===e);t>=0&&Ll.items.splice(t,1)}function ke(e,t="info",s=3e3){return lr(e,t,s)}ke.success=(e,t=3e3)=>lr(e,"success",t);ke.error=(e,t=5e3)=>lr(e,"error",t);ke.info=(e,t=3e3)=>lr(e,"info",t);ke.dismiss=kc;const yx={setup(){return{state:Ll,dismiss:kc}},template:`
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
  `},Ks=wn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let va=null;function ls({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return va&&va(!1),Ks.title=e,Ks.message=t,Ks.confirmLabel=s,Ks.cancelLabel=n,Ks.danger=a,Ks.open=!0,new Promise(i=>{va=i})}function nd(e){Ks.open=!1,va&&(va(e),va=null)}const xx={setup(){function e(t){Ks.open&&t.key==="Escape"&&(t.stopPropagation(),nd(!1))}return Ue(()=>document.addEventListener("keydown",e,!0)),ht(()=>document.removeEventListener("keydown",e,!0)),{state:Ks,settle:nd}},template:`
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
 */const ia=typeof document<"u";function Bh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function _x(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Bh(e.default)}const qe=Object.assign;function Rr(e,t){const s={};for(const n in t){const a=t[n];s[n]=ws(a)?a.map(e):e(a)}return s}const ni=()=>{},ws=Array.isArray;function ad(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Uh=/#/g,kx=/&/g,wx=/\//g,Sx=/=/g,Tx=/\?/g,Hh=/\+/g,Cx=/%5B/g,Ex=/%5D/g,Vh=/%5E/g,Ax=/%60/g,jh=/%7B/g,Rx=/%7C/g,zh=/%7D/g,Ix=/%20/g;function wc(e){return e==null?"":encodeURI(""+e).replace(Rx,"|").replace(Cx,"[").replace(Ex,"]")}function Nx(e){return wc(e).replace(jh,"{").replace(zh,"}").replace(Vh,"^")}function mo(e){return wc(e).replace(Hh,"%2B").replace(Ix,"+").replace(Uh,"%23").replace(kx,"%26").replace(Ax,"`").replace(jh,"{").replace(zh,"}").replace(Vh,"^")}function Ox(e){return mo(e).replace(Sx,"%3D")}function Lx(e){return wc(e).replace(Uh,"%23").replace(Tx,"%3F")}function Dx(e){return Lx(e).replace(wx,"%2F")}function wi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Mx=/\/$/,Px=e=>e.replace(Mx,"");function Ir(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=Ux(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:wi(l)}}function Fx(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function id(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function $x(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ea(t.matched[n],s.matched[a])&&Kh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ea(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Kh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Bx(e[s],t[s]))return!1;return!0}function Bx(e,t){return ws(e)?ld(e,t):ws(t)?ld(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function ld(e,t){return ws(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function Ux(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const pn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let go=(function(e){return e.pop="pop",e.push="push",e})({}),Nr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Hx(e){if(!e)if(ia){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Px(e)}const Vx=/^[^#]+#/;function jx(e,t){return e.replace(Vx,"#")+t}function zx(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const rr=()=>({left:window.scrollX,top:window.scrollY});function Kx(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=zx(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function rd(e,t){return(history.state?history.state.position-t:-1)+e}const vo=new Map;function qx(e,t){vo.set(e,t)}function Gx(e){const t=vo.get(e);return vo.delete(e),t}function Wx(e){return typeof e=="string"||e&&typeof e=="object"}function qh(e){return typeof e=="string"||typeof e=="symbol"}let ct=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Gh=Symbol("");ct.MATCHER_NOT_FOUND+"",ct.NAVIGATION_GUARD_REDIRECT+"",ct.NAVIGATION_ABORTED+"",ct.NAVIGATION_CANCELLED+"",ct.NAVIGATION_DUPLICATED+"";function Aa(e,t){return qe(new Error,{type:e,[Gh]:!0},t)}function Us(e,t){return e instanceof Error&&Gh in e&&(t==null||!!(e.type&t))}const Zx=["params","query","hash"];function Jx(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Zx)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Yx(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Hh," "),i=a.indexOf("="),l=wi(i<0?a:a.slice(0,i)),r=i<0?null:wi(a.slice(i+1));if(l in t){let o=t[l];ws(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function od(e){let t="";for(let s in e){const n=e[s];if(s=Ox(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(ws(n)?n.map(a=>a&&mo(a)):[n&&mo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function Qx(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=ws(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Xx=Symbol(""),cd=Symbol(""),or=Symbol(""),Sc=Symbol(""),bo=Symbol("");function Ha(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function yn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Aa(ct.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):Wx(f)?o(Aa(ct.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Or(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Bh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(yn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=_x(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&yn(f,s,n,l,r,a)()}))}}return i}function e_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ea(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ea(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let t_=()=>location.protocol+"//"+location.host;function Wh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),id(r,"")}return id(s,e)+n+a}function s_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=Wh(e,location),g=s.value,m=t.value;let k=0;if(f){if(s.value=p,t.value=f,l&&l===g){l=null;return}k=m?f.position-m.position:0}else n(p);a.forEach(E=>{E(s.value,g,{delta:k,type:go.pop,direction:k?k>0?Nr.forward:Nr.back:Nr.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const g=a.indexOf(f);g>-1&&a.splice(g,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(qe({},f.state,{scroll:rr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function ud(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?rr():null}}function n_(e){const{history:t,location:s}=window,n={value:Wh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:t_()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,qe({},t.state,ud(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=qe({},a.value,t.state,{forward:o,scroll:rr()});i(u.current,u,!0),i(o,qe({},ud(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function a_(e){e=Hx(e);const t=n_(e),s=s_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=qe({location:"",base:e,go:n,createHref:jx.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function i_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),a_(e)}let Ln=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var kt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(kt||{});const l_={type:Ln.Static,value:""},r_=/[a-zA-Z0-9_]/;function o_(e){if(!e)return[[]];if(e==="/")return[[l_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=kt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===kt.Static?i.push({type:Ln.Static,value:c}):s===kt.Param||s===kt.ParamRegExp||s===kt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Ln.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==kt.ParamRegExp){n=s,s=kt.EscapeNext;continue}switch(s){case kt.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=kt.Param):f();break;case kt.EscapeNext:f(),s=n;break;case kt.Param:o==="("?s=kt.ParamRegExp:r_.test(o)?f():(d(),s=kt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case kt.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=kt.ParamRegExpEnd:u+=o;break;case kt.ParamRegExpEnd:d(),s=kt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===kt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const dd="[^/]+?",c_={sensitive:!1,strict:!1,start:!0,end:!0};var zt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(zt||{});const u_=/[.+*?^${}()[\]/\\]/g;function d_(e,t){const s=qe({},c_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[zt.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=zt.Segment+(s.sensitive?zt.BonusCaseSensitive:0);if(f.type===Ln.Static)d||(a+="/"),a+=f.value.replace(u_,"\\$&"),p+=zt.Static;else if(f.type===Ln.Param){const{value:g,repeatable:m,optional:k,regexp:E}=f;i.push({name:g,repeatable:m,optional:k});const y=E||dd;if(y!==dd){p+=zt.BonusCustomRegExp;try{`${y}`}catch(x){throw new Error(`Invalid custom RegExp for param "${g}" (${y}): `+x.message)}}let v=m?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;d||(v=k&&c.length<2?`(?:/${v})`:"/"+v),k&&(v+="?"),a+=v,p+=zt.Dynamic,k&&(p+=zt.BonusOptional),m&&(p+=zt.BonusRepeatable),y===".*"&&(p+=zt.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=zt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",g=i[f-1];d[g.name]=p&&g.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Ln.Static)u+=p.value;else if(p.type===Ln.Param){const{value:g,repeatable:m,optional:k}=p,E=g in c?c[g]:"";if(ws(E)&&!m)throw new Error(`Provided param "${g}" is an array but it is not repeatable (* or + modifiers)`);const y=ws(E)?E.join("/"):E;if(!y)if(k)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${g}"`);u+=y}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function f_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===zt.Static+zt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===zt.Static+zt.Segment?1:-1:0}function Zh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=f_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(fd(n))return 1;if(fd(a))return-1}return a.length-n.length}function fd(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const p_={strict:!1,end:!0,sensitive:!1};function h_(e,t,s){const n=d_(o_(e.path),s),a=qe(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function m_(e,t){const s=[],n=new Map;t=ad(p_,t);function a(d){return n.get(d)}function i(d,f,p){const g=!p,m=hd(d);m.aliasOf=p&&p.record;const k=ad(t,d),E=[m];if("alias"in d){const x=typeof d.alias=="string"?[d.alias]:d.alias;for(const T of x)E.push(hd(qe({},m,{components:p?p.record.components:m.components,path:T,aliasOf:p?p.record:m})))}let y,v;for(const x of E){const{path:T}=x;if(f&&T[0]!=="/"){const N=f.record.path,O=N[N.length-1]==="/"?"":"/";x.path=f.record.path+(T&&O+T)}if(y=h_(x,f,k),p?p.alias.push(y):(v=v||y,v!==y&&v.alias.push(y),g&&d.name&&!md(y)&&l(d.name)),Jh(y)&&o(y),m.children){const N=m.children;for(let O=0;O<N.length;O++)i(N[O],y,p&&p.children[O])}p=p||y}return v?()=>{l(v)}:ni}function l(d){if(qh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=b_(d,s);s.splice(f,0,d),d.record.name&&!md(d)&&n.set(d.record.name,d)}function c(d,f){let p,g={},m,k;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw Aa(ct.MATCHER_NOT_FOUND,{location:d});k=p.record.name,g=qe(pd(f.params,p.keys.filter(v=>!v.optional).concat(p.parent?p.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),d.params&&pd(d.params,p.keys.map(v=>v.name))),m=p.stringify(g)}else if(d.path!=null)m=d.path,p=s.find(v=>v.re.test(m)),p&&(g=p.parse(m),k=p.record.name);else{if(p=f.name?n.get(f.name):s.find(v=>v.re.test(f.path)),!p)throw Aa(ct.MATCHER_NOT_FOUND,{location:d,currentLocation:f});k=p.record.name,g=qe({},f.params,d.params),m=p.stringify(g)}const E=[];let y=p;for(;y;)E.unshift(y.record),y=y.parent;return{name:k,path:m,params:g,matched:E,meta:v_(E)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function pd(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function hd(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:g_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function g_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function md(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function v_(e){return e.reduce((t,s)=>qe(t,s.meta),{})}function b_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Zh(e,t[i])<0?n=i:s=i+1}const a=y_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function y_(e){let t=e;for(;t=t.parent;)if(Jh(t)&&Zh(e,t)===0)return t}function Jh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function gd(e){const t=ps(or),s=ps(Sc),n=Q(()=>{const o=Os(e.to);return t.resolve(o)}),a=Q(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(Ea.bind(null,u));if(f>-1)return f;const p=vd(o[c-2]);return c>1&&vd(u)===p&&d[d.length-1].path!==p?d.findIndex(Ea.bind(null,o[c-2])):f}),i=Q(()=>a.value>-1&&S_(s.params,n.value.params)),l=Q(()=>a.value>-1&&a.value===s.matched.length-1&&Kh(s.params,n.value.params));function r(o={}){if(w_(o)){const c=t[Os(e.replace)?"replace":"push"](Os(e.to)).catch(ni);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:Q(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function x_(e){return e.length===1?e[0]:e}const __=Ai({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:gd,setup(e,{slots:t}){const s=wn(gd(e)),{options:n}=ps(or),a=Q(()=>({[bd(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[bd(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&x_(t.default(s));return e.custom?i:xa("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),k_=__;function w_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function S_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!ws(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function vd(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const bd=(e,t,s)=>e??t??s,T_=Ai({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=ps(bo),a=Q(()=>e.route||n.value),i=ps(cd,0),l=Q(()=>{let c=Os(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=Q(()=>a.value.matched[l.value]);Qa(cd,Q(()=>l.value+1)),Qa(Xx,r),Qa(bo,a);const o=h();return hs(()=>[o.value,r.value,e.name],([c,u,d],[f,p,g])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!Ea(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(m=>m(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return yd(s.default,{Component:f,route:c});const p=d.props[u],g=p?p===!0?c.params:typeof p=="function"?p(c):p:null,k=xa(f,qe({},g,t,{onVnodeUnmounted:E=>{E.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return yd(s.default,{Component:k,route:c})||k}}});function yd(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const C_=T_;function E_(e){const t=m_(e.routes,e),s=e.parseQuery||Yx,n=e.stringifyQuery||od,a=e.history,i=Ha(),l=Ha(),r=Ha(),o=Oo(pn);let c=pn;ia&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Rr.bind(null,V=>""+V),d=Rr.bind(null,Dx),f=Rr.bind(null,wi);function p(V,te){let re,de;return qh(V)?(re=t.getRecordMatcher(V),de=te):de=V,t.addRoute(de,re)}function g(V){const te=t.getRecordMatcher(V);te&&t.removeRoute(te)}function m(){return t.getRoutes().map(V=>V.record)}function k(V){return!!t.getRecordMatcher(V)}function E(V,te){if(te=qe({},te||o.value),typeof V=="string"){const C=Ir(s,V,te.path),M=t.resolve({path:C.path},te),W=a.createHref(C.fullPath);return qe(C,M,{params:f(M.params),hash:wi(C.hash),redirectedFrom:void 0,href:W})}let re;if(V.path!=null)re=qe({},V,{path:Ir(s,V.path,te.path).path});else{const C=qe({},V.params);for(const M in C)C[M]==null&&delete C[M];re=qe({},V,{params:d(C)}),te.params=d(te.params)}const de=t.resolve(re,te),he=V.hash||"";de.params=u(f(de.params));const Me=Fx(n,qe({},V,{hash:Nx(he),path:de.path})),b=a.createHref(Me);return qe({fullPath:Me,hash:he,query:n===od?Qx(V.query):V.query||{}},de,{redirectedFrom:void 0,href:b})}function y(V){return typeof V=="string"?Ir(s,V,o.value.path):qe({},V)}function v(V,te){if(c!==V)return Aa(ct.NAVIGATION_CANCELLED,{from:te,to:V})}function x(V){return O(V)}function T(V){return x(qe(y(V),{replace:!0}))}function N(V,te){const re=V.matched[V.matched.length-1];if(re&&re.redirect){const{redirect:de}=re;let he=typeof de=="function"?de(V,te):de;return typeof he=="string"&&(he=he.includes("?")||he.includes("#")?he=y(he):{path:he},he.params={}),qe({query:V.query,hash:V.hash,params:he.path!=null?{}:V.params},he)}}function O(V,te){const re=c=E(V),de=o.value,he=V.state,Me=V.force,b=V.replace===!0,C=N(re,de);if(C)return O(qe(y(C),{state:typeof C=="object"?qe({},he,C.state):he,force:Me,replace:b}),te||re);const M=re;M.redirectedFrom=te;let W;return!Me&&$x(n,de,re)&&(W=Aa(ct.NAVIGATION_DUPLICATED,{to:M,from:de}),fe(de,de,!0,!1)),(W?Promise.resolve(W):L(M,de)).catch(R=>Us(R)?Us(R,ct.NAVIGATION_GUARD_REDIRECT)?R:ue(R):I(R,M,de)).then(R=>{if(R){if(Us(R,ct.NAVIGATION_GUARD_REDIRECT))return O(qe({replace:b},y(R.to),{state:typeof R.to=="object"?qe({},he,R.to.state):he,force:Me}),te||M)}else R=P(M,de,!0,b,he);return B(M,de,R),R})}function w(V,te){const re=v(V,te);return re?Promise.reject(re):Promise.resolve()}function A(V){const te=ee.values().next().value;return te&&typeof te.runWithContext=="function"?te.runWithContext(V):V()}function L(V,te){let re;const[de,he,Me]=e_(V,te);re=Or(de.reverse(),"beforeRouteLeave",V,te);for(const C of de)C.leaveGuards.forEach(M=>{re.push(yn(M,V,te))});const b=w.bind(null,V,te);return re.push(b),Ie(re).then(()=>{re=[];for(const C of i.list())re.push(yn(C,V,te));return re.push(b),Ie(re)}).then(()=>{re=Or(he,"beforeRouteUpdate",V,te);for(const C of he)C.updateGuards.forEach(M=>{re.push(yn(M,V,te))});return re.push(b),Ie(re)}).then(()=>{re=[];for(const C of Me)if(C.beforeEnter)if(ws(C.beforeEnter))for(const M of C.beforeEnter)re.push(yn(M,V,te));else re.push(yn(C.beforeEnter,V,te));return re.push(b),Ie(re)}).then(()=>(V.matched.forEach(C=>C.enterCallbacks={}),re=Or(Me,"beforeRouteEnter",V,te,A),re.push(b),Ie(re))).then(()=>{re=[];for(const C of l.list())re.push(yn(C,V,te));return re.push(b),Ie(re)}).catch(C=>Us(C,ct.NAVIGATION_CANCELLED)?C:Promise.reject(C))}function B(V,te,re){r.list().forEach(de=>A(()=>de(V,te,re)))}function P(V,te,re,de,he){const Me=v(V,te);if(Me)return Me;const b=te===pn,C=ia?history.state:{};re&&(de||b?a.replace(V.fullPath,qe({scroll:b&&C&&C.scroll},he)):a.push(V.fullPath,he)),o.value=V,fe(V,te,re,b),ue()}let S;function $(){S||(S=a.listen((V,te,re)=>{if(!pe.listening)return;const de=E(V),he=N(de,pe.currentRoute.value);if(he){O(qe(he,{replace:!0,force:!0}),de).catch(ni);return}c=de;const Me=o.value;ia&&qx(rd(Me.fullPath,re.delta),rr()),L(de,Me).catch(b=>Us(b,ct.NAVIGATION_ABORTED|ct.NAVIGATION_CANCELLED)?b:Us(b,ct.NAVIGATION_GUARD_REDIRECT)?(O(qe(y(b.to),{force:!0}),de).then(C=>{Us(C,ct.NAVIGATION_ABORTED|ct.NAVIGATION_DUPLICATED)&&!re.delta&&re.type===go.pop&&a.go(-1,!1)}).catch(ni),Promise.reject()):(re.delta&&a.go(-re.delta,!1),I(b,de,Me))).then(b=>{b=b||P(de,Me,!1),b&&(re.delta&&!Us(b,ct.NAVIGATION_CANCELLED)?a.go(-re.delta,!1):re.type===go.pop&&Us(b,ct.NAVIGATION_ABORTED|ct.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(de,Me,b)}).catch(ni)}))}let q=Ha(),G=Ha(),D;function I(V,te,re){ue(V);const de=G.list();return de.length?de.forEach(he=>he(V,te,re)):console.error(V),Promise.reject(V)}function j(){return D&&o.value!==pn?Promise.resolve():new Promise((V,te)=>{q.add([V,te])})}function ue(V){return D||(D=!V,$(),q.list().forEach(([te,re])=>V?re(V):te()),q.reset()),V}function fe(V,te,re,de){const{scrollBehavior:he}=e;if(!ia||!he)return Promise.resolve();const Me=!re&&Gx(rd(V.fullPath,0))||(de||!re)&&history.state&&history.state.scroll||null;return Et().then(()=>he(V,te,Me)).then(b=>b&&Kx(b)).catch(b=>I(b,V,te))}const ne=V=>a.go(V);let me;const ee=new Set,pe={currentRoute:o,listening:!0,addRoute:p,removeRoute:g,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:m,resolve:E,options:e,push:x,replace:T,go:ne,back:()=>ne(-1),forward:()=>ne(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:G.add,isReady:j,install(V){V.component("RouterLink",k_),V.component("RouterView",C_),V.config.globalProperties.$router=pe,Object.defineProperty(V.config.globalProperties,"$route",{enumerable:!0,get:()=>Os(o)}),ia&&!me&&o.value===pn&&(me=!0,x(a.location).catch(de=>{}));const te={};for(const de in pn)Object.defineProperty(te,de,{get:()=>o.value[de],enumerable:!0});V.provide(or,pe),V.provide(Sc,No(te)),V.provide(bo,o);const re=V.unmount;ee.add(V),V.unmount=function(){ee.delete(V),ee.size<1&&(c=pn,S&&S(),S=null,o.value=pn,me=!1,D=!1),re()}}};function Ie(V){return V.reduce((te,re)=>te.then(()=>A(re)),Promise.resolve())}return pe}function Yh(){return ps(or)}function A_(e){return ps(Sc)}const R_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],Qt=wn({open:!1,query:"",selected:0});function xd(){Qt.query="",Qt.selected=0,Qt.open=!0}function Lr(){Qt.open=!1}function I_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const N_={setup(){const e=Yh(),t=h(null),s=Q(()=>{const i=Qt.query.trim().toLowerCase();return R_.map(l=>({...l,_score:I_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});hs(()=>Qt.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),hs(()=>Qt.query,()=>{Qt.selected=0});function n(i){Lr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Lr();return}if(i.key==="ArrowDown")i.preventDefault(),Qt.selected=Math.min(Qt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Qt.selected=Math.max(Qt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Qt.selected];l&&n(l)}}return{state:Qt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Lr}},template:`
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
  `},yo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(yo));const O_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>xa("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[xa("path",{d:yo[e.name]||yo.info})])}},L_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function _d(e){return[...e.querySelectorAll(L_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const D_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=_d(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||_d(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Tc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function La(e){const t=Tc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Cc(e){const t=Tc(e);return t?t.toLocaleTimeString():"—"}function Qh(e){const t=Tc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Ra(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Ec(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Xh(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function kd(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function em(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function M_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const P_={template:`
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
                  <span v-if="a.tools_used.length > 0" class="dash-agent-tools">{{ a.tools_used.length }} tools</span>
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=Q(()=>{const S=e.value.uptime_seconds||0,$=Math.floor(S/86400),q=Math.floor(S%86400/3600),G=Math.floor(S%3600/60),D=[];return $>0&&D.push(`${$}d`),q>0&&D.push(`${q}h`),(D.length===0||$===0&&q===0)&&D.push(`${G}m`),D.join(" ")}),p=Q(()=>{const S=e.value.uptime_seconds||0;return 125.66*(1-Math.min(S/86400,1))}),g=Q(()=>{const S=e.value;return[{label:"Guilds",value:S.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:S.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:S.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${S.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:S.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:S.loop_count>0?"text-green-400":"",highlight:S.loop_count>0},{label:"Agents",value:S.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:S.agent_count>0?`${S.agent_count} total`:"",subColor:"text-gray-500",highlight:(S.agent_running??0)>0},{label:"Processes",value:S.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:S.process_count>0?`${S.process_count} total`:"",subColor:"text-gray-500",highlight:(S.process_running??0)>0},{label:"Schedules",value:S.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(S.schedule_failing>0?`${S.schedule_failing} failing`:"")+(S.schedule_failing>0&&S.schedule_paused>0?", ":"")+(S.schedule_paused>0?`${S.schedule_paused} paused`:"")||void 0,subColor:S.schedule_failing>0?"text-red-400":"text-yellow-400",color:S.schedule_failing>0?"text-red-400":"",highlight:S.schedule_failing>0},{label:"Users",value:S.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),m=Q(()=>{const S=e.value,$=[];return $.push({label:"Bot",status:S.status==="online"?"ok":"warn",detail:S.status==="online"?"Online":"Starting"}),(S.schedule_failing||0)>0?$.push({label:"Schedules",status:"error",detail:`${S.schedule_failing} failing`}):(S.schedule_count||0)>0&&$.push({label:"Schedules",status:"ok",detail:`${S.schedule_count} configured`}),(S.loop_count||0)>0&&$.push({label:"Loops",status:"ok",detail:`${S.loop_count} active`}),(S.agent_running||0)>0&&$.push({label:"Agents",status:"ok",detail:`${S.agent_running} running`}),(S.process_running||0)>0&&$.push({label:"Processes",status:"ok",detail:`${S.process_running} running`}),$});async function k(){try{e.value=await K.get("/api/status"),s.value=null}catch(S){s.value=S.message}finally{t.value=!1}}async function E(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function v(){try{const S=await K.get("/api/knowledge");c.value=(Array.isArray(S)?S:[]).reduce(($,q)=>$+(q.chunks||0),0)}catch{c.value=null}}async function x(){try{const S=await K.get("/api/agents");r.value=S.filter($=>$.status==="running")}catch{}}async function T(){u.value={...u.value,reload:!0};try{await K.post("/api/reload"),ke.success("Config reloaded")}catch(S){ke.error(S.message)}u.value={...u.value,reload:!1}}async function N(){if(!await ls({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const $=e.value.session_count;e.value={...e.value,session_count:0};try{const q=await K.post("/api/sessions/clear-all");ke.success(`Cleared ${q.count} session${q.count!==1?"s":""}`),await k()}catch(q){e.value={...e.value,session_count:$},ke.error(q.message)}u.value={...u.value,clearSessions:!1}}async function O(){if(!await ls({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const $=e.value.loop_count;e.value={...e.value,loop_count:0};try{const q=await K.post("/api/loops/stop-all");ke.success(q.result),await k()}catch(q){e.value={...e.value,loop_count:$},ke.error(q.message)}u.value={...u.value,stopLoops:!1}}function w(){t.value=!0,s.value=null,k(),E(),y(),x()}let A=null,L=null,B=null;function P(S){if(S.payload&&S.payload.tool_name){const $={...S.payload,_isNew:!0,_key:++d};n.value.unshift($),n.value.length>10&&n.value.pop(),o.value++,$.error&&(i.value.unshift($),i.value.length>5&&i.value.pop()),setTimeout(()=>{$._isNew=!1},1500),clearTimeout(B),B=setTimeout(()=>{o.value=0},1e4)}}return Ue(async()=>{await Promise.all([k(),E(),y(),x(),v()]),A=setInterval(k,15e3),L=setInterval(x,1e4),Ge.subscribe("events",P)}),ht(()=>{A&&clearInterval(A),L&&clearInterval(L),clearTimeout(B),Ge.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:g,healthIndicators:m,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:E,fetchStatus:k,formatTime:Cc,formatDuration:Ra,retry:w,reloadConfig:T,clearSessions:N,stopAllLoops:O}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function wd(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function F_(e){if(Array.isArray(e))return e}function $_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function B_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function U_(e,t){return F_(e)||$_(e,t)||H_(e,t)||B_()}function H_(e,t){if(e){if(typeof e=="string")return wd(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?wd(e,t):void 0}}const tm=Object.entries,Sd=Object.setPrototypeOf,V_=Object.isFrozen,j_=Object.getPrototypeOf,z_=Object.getOwnPropertyDescriptor;let Wt=Object.freeze,gs=Object.seal,la=Object.create,sm=typeof Reflect<"u"&&Reflect,xo=sm.apply,_o=sm.construct;Wt||(Wt=function(t){return t});gs||(gs=function(t){return t});xo||(xo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});_o||(_o=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Hs=yt(Array.prototype.forEach),K_=yt(Array.prototype.lastIndexOf),Td=yt(Array.prototype.pop),ta=yt(Array.prototype.push),q_=yt(Array.prototype.splice),jt=Array.isArray,Za=yt(String.prototype.toLowerCase),Dr=yt(String.prototype.toString),Cd=yt(String.prototype.match),sa=yt(String.prototype.replace),Ed=yt(String.prototype.indexOf),G_=yt(String.prototype.trim),W_=yt(Number.prototype.toString),Z_=yt(Boolean.prototype.toString),Ad=typeof BigInt>"u"?null:yt(BigInt.prototype.toString),Rd=typeof Symbol>"u"?null:yt(Symbol.prototype.toString),ot=yt(Object.prototype.hasOwnProperty),Va=yt(Object.prototype.toString),Rt=yt(RegExp.prototype.test),An=J_(TypeError);function yt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return xo(e,t,n)}}function J_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return _o(e,s)}}function Oe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Za;if(Sd&&Sd(e,null),!jt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(V_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Y_(e){for(let t=0;t<e.length;t++)ot(e,t)||(e[t]=null);return e}function Pt(e){const t=la(null);for(const n of tm(e)){var s=U_(n,2);const a=s[0],i=s[1];ot(e,a)&&(jt(i)?t[a]=Y_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Pt(i):t[a]=i)}return t}function Q_(e){switch(typeof e){case"string":return e;case"number":return W_(e);case"boolean":return Z_(e);case"bigint":return Ad?Ad(e):"0";case"symbol":return Rd?Rd(e):"Symbol()";case"undefined":return Va(e);case"function":case"object":{if(e===null)return Va(e);const t=e,s=Es(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Va(n)}return Va(e)}default:return Va(e)}}function Es(e,t){for(;e!==null;){const n=z_(e,t);if(n){if(n.get)return yt(n.get);if(typeof n.value=="function")return yt(n.value)}e=j_(e)}function s(){return null}return s}function X_(e){try{return Rt(e,""),!0}catch{return!1}}const Id=Wt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Mr=Wt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Pr=Wt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),ek=Wt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Fr=Wt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tk=Wt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Nd=Wt(["#text"]),Od=Wt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),$r=Wt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Ld=Wt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Ji=Wt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sk=gs(/{{[\w\W]*|^[\w\W]*}}/g),nk=gs(/<%[\w\W]*|^[\w\W]*%>/g),ak=gs(/\${[\w\W]*/g),ik=gs(/^data-[\-\w.\u00B7-\uFFFF]+$/),lk=gs(/^aria-[\-\w]+$/),Dd=gs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),rk=gs(/^(?:\w+script|data):/i),ok=gs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),ck=gs(/^html$/i),uk=gs(/^[a-z][.\w]*(-[.\w]+)+$/i),Ts={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},dk=function(){return typeof window>"u"?null:window},fk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Md=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function nm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:dk();const t=be=>nm(be);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ts.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=Es(f,"cloneNode"),g=Es(f,"remove"),m=Es(f,"nextSibling"),k=Es(f,"childNodes"),E=Es(f,"parentNode"),y=Es(f,"shadowRoot"),v=Es(f,"attributes"),x=l&&l.prototype?Es(l.prototype,"nodeType"):null,T=l&&l.prototype?Es(l.prototype,"nodeName"):null;if(typeof i=="function"){const be=s.createElement("template");be.content&&be.content.ownerDocument&&(s=be.content.ownerDocument)}let N,O="",w,A=!1,L=0;const B=function(){if(L>0)throw An('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(_){B(),L++;try{return N.createHTML(_)}finally{L--}},S=function(_){B(),L++;try{return N.createScriptURL(_)}finally{L--}},$=function(){return A||(w=fk(d,a),A=!0),w},q=s,G=q.implementation,D=q.createNodeIterator,I=q.createDocumentFragment,j=q.getElementsByTagName,ue=n.importNode;let fe=Md();t.isSupported=typeof tm=="function"&&typeof E=="function"&&G&&G.createHTMLDocument!==void 0;const ne=sk,me=nk,ee=ak,pe=ik,Ie=lk,V=rk,te=ok,re=uk;let de=Dd,he=null;const Me=Oe({},[...Id,...Mr,...Pr,...Fr,...Nd]);let b=null;const C=Oe({},[...Od,...$r,...Ld,...Ji]);let M=Object.seal(la(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),W=null,R=null;const F=Object.seal(la(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Z=!0,X=!0,se=!1,J=!0,ge=!1,le=!0,ce=!1,ye=!1,_e=!1,Te=!1,U=!1,oe=!1,xe=!0,Pe=!1;const Je="user-content-";let Ze=!0,xt=!1,et={},Ye=null;const Ss=Oe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ms=null;const Y=Oe({},["audio","video","img","source","image","track"]);let Ne=null;const Ps=Oe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),on="http://www.w3.org/1998/Math/MathML",Zn="http://www.w3.org/2000/svg",Dt="http://www.w3.org/1999/xhtml";let vs=Dt,cn=!1,Da=null;const Mi=Oe({},[on,Zn,Dt],Dr);let H=Oe({},["mi","mo","mn","ms","mtext"]),ae=Oe({},["annotation-xml"]);const Ce=Oe({},["title","style","font","a","script"]);let Ke=null;const rt=["application/xhtml+xml","text/html"],Zt="text/html";let it=null,Jn=null;const vm=s.createElement("form"),Fc=function(_){return _ instanceof RegExp||_ instanceof Function},fr=function(){let _=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Jn&&Jn===_)return;(!_||typeof _!="object")&&(_={}),_=Pt(_),Ke=rt.indexOf(_.PARSER_MEDIA_TYPE)===-1?Zt:_.PARSER_MEDIA_TYPE,it=Ke==="application/xhtml+xml"?Dr:Za,he=ot(_,"ALLOWED_TAGS")&&jt(_.ALLOWED_TAGS)?Oe({},_.ALLOWED_TAGS,it):Me,b=ot(_,"ALLOWED_ATTR")&&jt(_.ALLOWED_ATTR)?Oe({},_.ALLOWED_ATTR,it):C,Da=ot(_,"ALLOWED_NAMESPACES")&&jt(_.ALLOWED_NAMESPACES)?Oe({},_.ALLOWED_NAMESPACES,Dr):Mi,Ne=ot(_,"ADD_URI_SAFE_ATTR")&&jt(_.ADD_URI_SAFE_ATTR)?Oe(Pt(Ps),_.ADD_URI_SAFE_ATTR,it):Ps,Ms=ot(_,"ADD_DATA_URI_TAGS")&&jt(_.ADD_DATA_URI_TAGS)?Oe(Pt(Y),_.ADD_DATA_URI_TAGS,it):Y,Ye=ot(_,"FORBID_CONTENTS")&&jt(_.FORBID_CONTENTS)?Oe({},_.FORBID_CONTENTS,it):Ss,W=ot(_,"FORBID_TAGS")&&jt(_.FORBID_TAGS)?Oe({},_.FORBID_TAGS,it):Pt({}),R=ot(_,"FORBID_ATTR")&&jt(_.FORBID_ATTR)?Oe({},_.FORBID_ATTR,it):Pt({}),et=ot(_,"USE_PROFILES")?_.USE_PROFILES&&typeof _.USE_PROFILES=="object"?Pt(_.USE_PROFILES):_.USE_PROFILES:!1,Z=_.ALLOW_ARIA_ATTR!==!1,X=_.ALLOW_DATA_ATTR!==!1,se=_.ALLOW_UNKNOWN_PROTOCOLS||!1,J=_.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ge=_.SAFE_FOR_TEMPLATES||!1,le=_.SAFE_FOR_XML!==!1,ce=_.WHOLE_DOCUMENT||!1,Te=_.RETURN_DOM||!1,U=_.RETURN_DOM_FRAGMENT||!1,oe=_.RETURN_TRUSTED_TYPE||!1,_e=_.FORCE_BODY||!1,xe=_.SANITIZE_DOM!==!1,Pe=_.SANITIZE_NAMED_PROPS||!1,Ze=_.KEEP_CONTENT!==!1,xt=_.IN_PLACE||!1,de=X_(_.ALLOWED_URI_REGEXP)?_.ALLOWED_URI_REGEXP:Dd,vs=typeof _.NAMESPACE=="string"?_.NAMESPACE:Dt,H=ot(_,"MATHML_TEXT_INTEGRATION_POINTS")&&_.MATHML_TEXT_INTEGRATION_POINTS&&typeof _.MATHML_TEXT_INTEGRATION_POINTS=="object"?Pt(_.MATHML_TEXT_INTEGRATION_POINTS):Oe({},["mi","mo","mn","ms","mtext"]),ae=ot(_,"HTML_INTEGRATION_POINTS")&&_.HTML_INTEGRATION_POINTS&&typeof _.HTML_INTEGRATION_POINTS=="object"?Pt(_.HTML_INTEGRATION_POINTS):Oe({},["annotation-xml"]);const z=ot(_,"CUSTOM_ELEMENT_HANDLING")&&_.CUSTOM_ELEMENT_HANDLING&&typeof _.CUSTOM_ELEMENT_HANDLING=="object"?Pt(_.CUSTOM_ELEMENT_HANDLING):la(null);if(M=la(null),ot(z,"tagNameCheck")&&Fc(z.tagNameCheck)&&(M.tagNameCheck=z.tagNameCheck),ot(z,"attributeNameCheck")&&Fc(z.attributeNameCheck)&&(M.attributeNameCheck=z.attributeNameCheck),ot(z,"allowCustomizedBuiltInElements")&&typeof z.allowCustomizedBuiltInElements=="boolean"&&(M.allowCustomizedBuiltInElements=z.allowCustomizedBuiltInElements),ge&&(X=!1),U&&(Te=!0),et&&(he=Oe({},Nd),b=la(null),et.html===!0&&(Oe(he,Id),Oe(b,Od)),et.svg===!0&&(Oe(he,Mr),Oe(b,$r),Oe(b,Ji)),et.svgFilters===!0&&(Oe(he,Pr),Oe(b,$r),Oe(b,Ji)),et.mathMl===!0&&(Oe(he,Fr),Oe(b,Ld),Oe(b,Ji))),F.tagCheck=null,F.attributeCheck=null,ot(_,"ADD_TAGS")&&(typeof _.ADD_TAGS=="function"?F.tagCheck=_.ADD_TAGS:jt(_.ADD_TAGS)&&(he===Me&&(he=Pt(he)),Oe(he,_.ADD_TAGS,it))),ot(_,"ADD_ATTR")&&(typeof _.ADD_ATTR=="function"?F.attributeCheck=_.ADD_ATTR:jt(_.ADD_ATTR)&&(b===C&&(b=Pt(b)),Oe(b,_.ADD_ATTR,it))),ot(_,"ADD_URI_SAFE_ATTR")&&jt(_.ADD_URI_SAFE_ATTR)&&Oe(Ne,_.ADD_URI_SAFE_ATTR,it),ot(_,"FORBID_CONTENTS")&&jt(_.FORBID_CONTENTS)&&(Ye===Ss&&(Ye=Pt(Ye)),Oe(Ye,_.FORBID_CONTENTS,it)),ot(_,"ADD_FORBID_CONTENTS")&&jt(_.ADD_FORBID_CONTENTS)&&(Ye===Ss&&(Ye=Pt(Ye)),Oe(Ye,_.ADD_FORBID_CONTENTS,it)),Ze&&(he["#text"]=!0),ce&&Oe(he,["html","head","body"]),he.table&&(Oe(he,["tbody"]),delete W.tbody),_.TRUSTED_TYPES_POLICY){if(typeof _.TRUSTED_TYPES_POLICY.createHTML!="function")throw An('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof _.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw An('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ie=N;N=_.TRUSTED_TYPES_POLICY;try{O=P("")}catch(Se){throw N=ie,Se}}else _.TRUSTED_TYPES_POLICY===null?(N=void 0,O=""):(N===void 0&&(N=$()),N&&typeof O=="string"&&(O=P("")));(fe.uponSanitizeElement.length>0||fe.uponSanitizeAttribute.length>0)&&he===Me&&(he=Pt(he)),fe.uponSanitizeAttribute.length>0&&b===C&&(b=Pt(b)),Wt&&Wt(_),Jn=_},$c=Oe({},[...Mr,...Pr,...ek]),Bc=Oe({},[...Fr,...tk]),bm=function(_){let z=E(_);(!z||!z.tagName)&&(z={namespaceURI:vs,tagName:"template"});const ie=Za(_.tagName),Se=Za(z.tagName);return Da[_.namespaceURI]?_.namespaceURI===Zn?z.namespaceURI===Dt?ie==="svg":z.namespaceURI===on?ie==="svg"&&(Se==="annotation-xml"||H[Se]):!!$c[ie]:_.namespaceURI===on?z.namespaceURI===Dt?ie==="math":z.namespaceURI===Zn?ie==="math"&&ae[Se]:!!Bc[ie]:_.namespaceURI===Dt?z.namespaceURI===Zn&&!ae[Se]||z.namespaceURI===on&&!H[Se]?!1:!Bc[ie]&&(Ce[ie]||!$c[ie]):!!(Ke==="application/xhtml+xml"&&Da[_.namespaceURI]):!1},bs=function(_){ta(t.removed,{element:_});try{E(_).removeChild(_)}catch{if(g(_),!E(_))throw An("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Uc=function(_){const z=k?k(_):_.childNodes;if(z){const Se=[];Hs(z,Ae=>{ta(Se,Ae)}),Hs(Se,Ae=>{try{g(Ae)}catch{}})}const ie=v?v(_):null;if(ie)for(let Se=ie.length-1;Se>=0;--Se){const Ae=ie[Se],Le=Ae&&Ae.name;if(typeof Le=="string")try{_.removeAttribute(Le)}catch{}}},Tn=function(_,z){try{ta(t.removed,{attribute:z.getAttributeNode(_),from:z})}catch{ta(t.removed,{attribute:null,from:z})}if(z.removeAttribute(_),_==="is")if(Te||U)try{bs(z)}catch{}else try{z.setAttribute(_,"")}catch{}},ym=function(_){const z=v?v(_):_.attributes;if(z)for(let ie=z.length-1;ie>=0;--ie){const Se=z[ie],Ae=Se&&Se.name;if(!(typeof Ae!="string"||b[it(Ae)]))try{_.removeAttribute(Ae)}catch{}}},xm=function(_){const z=[_];for(;z.length>0;){const ie=z.pop();(x?x(ie):ie.nodeType)===Ts.element&&ym(ie);const Ae=k?k(ie):ie.childNodes;if(Ae)for(let Le=Ae.length-1;Le>=0;--Le)z.push(Ae[Le])}},Hc=function(_){let z=null,ie=null;if(_e)_="<remove></remove>"+_;else{const Le=Cd(_,/^[\r\n\t ]+/);ie=Le&&Le[0]}Ke==="application/xhtml+xml"&&vs===Dt&&(_='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+_+"</body></html>");const Se=N?P(_):_;if(vs===Dt)try{z=new u().parseFromString(Se,Ke)}catch{}if(!z||!z.documentElement){z=G.createDocument(vs,"template",null);try{z.documentElement.innerHTML=cn?O:Se}catch{}}const Ae=z.body||z.documentElement;return _&&ie&&Ae.insertBefore(s.createTextNode(ie),Ae.childNodes[0]||null),vs===Dt?j.call(z,ce?"html":"body")[0]:ce?z.documentElement:Ae},Vc=function(_){return D.call(_.ownerDocument||_,_,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},pr=function(_){var z,ie;_.normalize();const Se=D.call(_.ownerDocument||_,_,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Ae=Se.nextNode();for(;Ae;){let _t=Ae.data;Hs([ne,me,ee],tt=>{_t=sa(_t,tt," ")}),Ae.data=_t,Ae=Se.nextNode()}const Le=(z=(ie=_.querySelectorAll)===null||ie===void 0?void 0:ie.call(_,"template"))!==null&&z!==void 0?z:[];Hs(Array.from(Le),_t=>{Yn(_t.content)&&pr(_t.content)})},Pi=function(_){const z=T?T(_):null;return typeof z!="string"||it(z)!=="form"?!1:typeof _.nodeName!="string"||typeof _.textContent!="string"||typeof _.removeChild!="function"||_.attributes!==v(_)||typeof _.removeAttribute!="function"||typeof _.setAttribute!="function"||typeof _.namespaceURI!="string"||typeof _.insertBefore!="function"||typeof _.hasChildNodes!="function"||_.nodeType!==x(_)||_.childNodes!==k(_)},Yn=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return x(_)===Ts.documentFragment}catch{return!1}},Ma=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return typeof x(_)=="number"}catch{return!1}};function Fs(be,_,z){Hs(be,ie=>{ie.call(t,_,z,Jn)})}const jc=function(_){let z=null;if(Fs(fe.beforeSanitizeElements,_,null),Pi(_))return bs(_),!0;const ie=it(T?T(_):_.nodeName);if(Fs(fe.uponSanitizeElement,_,{tagName:ie,allowedTags:he}),le&&_.hasChildNodes()&&!Ma(_.firstElementChild)&&Rt(/<[/\w!]/g,_.innerHTML)&&Rt(/<[/\w!]/g,_.textContent)||le&&_.namespaceURI===Dt&&ie==="style"&&Ma(_.firstElementChild)||_.nodeType===Ts.progressingInstruction||le&&_.nodeType===Ts.comment&&Rt(/<[/\w]/g,_.data))return bs(_),!0;if(W[ie]||!(F.tagCheck instanceof Function&&F.tagCheck(ie))&&!he[ie]){if(!W[ie]&&Kc(ie)&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,ie)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ie)))return!1;if(Ze&&!Ye[ie]){const Ae=E(_),Le=k(_);if(Le&&Ae){const _t=Le.length;for(let tt=_t-1;tt>=0;--tt){const dt=xt?Le[tt]:p(Le[tt],!0);Ae.insertBefore(dt,m(_))}}}return bs(_),!0}return(x?x(_):_.nodeType)===Ts.element&&!bm(_)||(ie==="noscript"||ie==="noembed"||ie==="noframes")&&Rt(/<\/no(script|embed|frames)/i,_.innerHTML)?(bs(_),!0):(ge&&_.nodeType===Ts.text&&(z=_.textContent,Hs([ne,me,ee],Ae=>{z=sa(z,Ae," ")}),_.textContent!==z&&(ta(t.removed,{element:_.cloneNode()}),_.textContent=z)),Fs(fe.afterSanitizeElements,_,null),!1)},zc=function(_,z,ie){if(R[z]||xe&&(z==="id"||z==="name")&&(ie in s||ie in vm))return!1;const Se=b[z]||F.attributeCheck instanceof Function&&F.attributeCheck(z,_);if(!(X&&!R[z]&&Rt(pe,z))){if(!(Z&&Rt(Ie,z))){if(!Se||R[z]){if(!(Kc(_)&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,_)||M.tagNameCheck instanceof Function&&M.tagNameCheck(_))&&(M.attributeNameCheck instanceof RegExp&&Rt(M.attributeNameCheck,z)||M.attributeNameCheck instanceof Function&&M.attributeNameCheck(z,_))||z==="is"&&M.allowCustomizedBuiltInElements&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,ie)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ie))))return!1}else if(!Ne[z]){if(!Rt(de,sa(ie,te,""))){if(!((z==="src"||z==="xlink:href"||z==="href")&&_!=="script"&&Ed(ie,"data:")===0&&Ms[_])){if(!(se&&!Rt(V,sa(ie,te,"")))){if(ie)return!1}}}}}}return!0},_m=Oe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Kc=function(_){return!_m[Za(_)]&&Rt(re,_)},qc=function(_){Fs(fe.beforeSanitizeAttributes,_,null);const z=_.attributes;if(!z||Pi(_))return;const ie={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:b,forceKeepAttr:void 0};let Se=z.length;for(;Se--;){const Ae=z[Se],Le=Ae.name,_t=Ae.namespaceURI,tt=Ae.value,dt=it(Le),un=tt;let Tt=Le==="value"?un:G_(un);if(ie.attrName=dt,ie.attrValue=Tt,ie.keepAttr=!0,ie.forceKeepAttr=void 0,Fs(fe.uponSanitizeAttribute,_,ie),Tt=ie.attrValue,Pe&&(dt==="id"||dt==="name")&&Ed(Tt,Je)!==0&&(Tn(Le,_),Tt=Je+Tt),le&&Rt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Tt)){Tn(Le,_);continue}if(dt==="attributename"&&Cd(Tt,"href")){Tn(Le,_);continue}if(ie.forceKeepAttr)continue;if(!ie.keepAttr){Tn(Le,_);continue}if(!J&&Rt(/\/>/i,Tt)){Tn(Le,_);continue}ge&&Hs([ne,me,ee],Wc=>{Tt=sa(Tt,Wc," ")});const Gc=it(_.nodeName);if(!zc(Gc,dt,Tt)){Tn(Le,_);continue}if(N&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!_t)switch(d.getAttributeType(Gc,dt)){case"TrustedHTML":{Tt=P(Tt);break}case"TrustedScriptURL":{Tt=S(Tt);break}}if(Tt!==un)try{_t?_.setAttributeNS(_t,Le,Tt):_.setAttribute(Le,Tt),Pi(_)?bs(_):Td(t.removed)}catch{Tn(Le,_)}}Fs(fe.afterSanitizeAttributes,_,null)},Fi=function(_){let z=null;const ie=Vc(_);for(Fs(fe.beforeSanitizeShadowDOM,_,null);z=ie.nextNode();)if(Fs(fe.uponSanitizeShadowNode,z,null),jc(z),qc(z),Yn(z.content)&&Fi(z.content),(x?x(z):z.nodeType)===Ts.element){const Ae=y?y(z):z.shadowRoot;Yn(Ae)&&(hr(Ae),Fi(Ae))}Fs(fe.afterSanitizeShadowDOM,_,null)},hr=function(_){const z=[{node:_,shadow:null}];for(;z.length>0;){const ie=z.pop();if(ie.shadow){Fi(ie.shadow);continue}const Se=ie.node,Le=(x?x(Se):Se.nodeType)===Ts.element,_t=k?k(Se):Se.childNodes;if(_t)for(let tt=_t.length-1;tt>=0;--tt)z.push({node:_t[tt],shadow:null});if(Le){const tt=T?T(Se):null;if(typeof tt=="string"&&it(tt)==="template"){const dt=Se.content;Yn(dt)&&z.push({node:dt,shadow:null})}}if(Le){const tt=y?y(Se):Se.shadowRoot;Yn(tt)&&z.push({node:null,shadow:tt},{node:tt,shadow:null})}}};return t.sanitize=function(be){let _=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},z=null,ie=null,Se=null,Ae=null;if(cn=!be,cn&&(be="<!-->"),typeof be!="string"&&!Ma(be)&&(be=Q_(be),typeof be!="string"))throw An("dirty is not a string, aborting");if(!t.isSupported)return be;ye||fr(_),t.removed=[];const Le=xt&&typeof be!="string"&&Ma(be);if(Le){const dt=T?T(be):be.nodeName;if(typeof dt=="string"){const un=it(dt);if(!he[un]||W[un])throw An("root node is forbidden and cannot be sanitized in-place")}if(Pi(be))throw An("root node is clobbered and cannot be sanitized in-place");try{hr(be)}catch(un){throw Uc(be),un}}else if(Ma(be))z=Hc("<!---->"),ie=z.ownerDocument.importNode(be,!0),ie.nodeType===Ts.element&&ie.nodeName==="BODY"||ie.nodeName==="HTML"?z=ie:z.appendChild(ie),hr(ie);else{if(!Te&&!ge&&!ce&&be.indexOf("<")===-1)return N&&oe?P(be):be;if(z=Hc(be),!z)return Te?null:oe?O:""}z&&_e&&bs(z.firstChild);const _t=Vc(Le?be:z);try{for(;Se=_t.nextNode();)jc(Se),qc(Se),Yn(Se.content)&&Fi(Se.content)}catch(dt){throw Le&&Uc(be),dt}if(Le)return Hs(t.removed,dt=>{dt.element&&xm(dt.element)}),ge&&pr(be),be;if(Te){if(ge&&pr(z),U)for(Ae=I.call(z.ownerDocument);z.firstChild;)Ae.appendChild(z.firstChild);else Ae=z;return(b.shadowroot||b.shadowrootmode)&&(Ae=ue.call(n,Ae,!0)),Ae}let tt=ce?z.outerHTML:z.innerHTML;return ce&&he["!doctype"]&&z.ownerDocument&&z.ownerDocument.doctype&&z.ownerDocument.doctype.name&&Rt(ck,z.ownerDocument.doctype.name)&&(tt="<!DOCTYPE "+z.ownerDocument.doctype.name+`>
`+tt),ge&&Hs([ne,me,ee],dt=>{tt=sa(tt,dt," ")}),N&&oe?P(tt):tt},t.setConfig=function(){let be=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};fr(be),ye=!0},t.clearConfig=function(){Jn=null,ye=!1,N=w,O=""},t.isValidAttribute=function(be,_,z){Jn||fr({});const ie=it(be),Se=it(_);return zc(ie,Se,z)},t.addHook=function(be,_){typeof _=="function"&&ta(fe[be],_)},t.removeHook=function(be,_){if(_!==void 0){const z=K_(fe[be],_);return z===-1?void 0:q_(fe[be],z,1)[0]}return Td(fe[be])},t.removeHooks=function(be){fe[be]=[]},t.removeAllHooks=function(){fe=Md()},t}var Pd=nm();function Ac(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Wn=Ac();function am(e){Wn=e}var ai={exec:()=>null};function We(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},pk=/^(?:[ \t]*(?:\n|$))+/,hk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Di=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,gk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Rc=/(?:[*+-]|\d{1,9}[.)])/,im=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,lm=We(im).replace(/bull/g,Rc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),vk=We(im).replace(/bull/g,Rc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Ic=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bk=/^[^\n]+/,Nc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yk=We(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Nc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xk=We(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Rc).getRegex(),cr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Oc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_k=We("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Oc).replace("tag",cr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),rm=We(Ic).replace("hr",Di).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",cr).getRegex(),kk=We(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",rm).getRegex(),Lc={blockquote:kk,code:hk,def:yk,fences:mk,heading:gk,hr:Di,html:_k,lheading:lm,list:xk,newline:pk,paragraph:rm,table:ai,text:bk},Fd=We("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Di).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",cr).getRegex(),wk={...Lc,lheading:vk,table:Fd,paragraph:We(Ic).replace("hr",Di).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Fd).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",cr).getRegex()},Sk={...Lc,html:We(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Oc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:ai,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:We(Ic).replace("hr",Di).replace("heading",` *#{1,6} *[^
]`).replace("lheading",lm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Tk=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Ck=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,om=/^( {2,}|\\)\n(?!\s*$)/,Ek=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,ur=/[\p{P}\p{S}]/u,Dc=/[\s\p{P}\p{S}]/u,cm=/[^\s\p{P}\p{S}]/u,Ak=We(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Dc).getRegex(),um=/(?!~)[\p{P}\p{S}]/u,Rk=/(?!~)[\s\p{P}\p{S}]/u,Ik=/(?:[^\s\p{P}\p{S}]|~)/u,Nk=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,dm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Ok=We(dm,"u").replace(/punct/g,ur).getRegex(),Lk=We(dm,"u").replace(/punct/g,um).getRegex(),fm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Dk=We(fm,"gu").replace(/notPunctSpace/g,cm).replace(/punctSpace/g,Dc).replace(/punct/g,ur).getRegex(),Mk=We(fm,"gu").replace(/notPunctSpace/g,Ik).replace(/punctSpace/g,Rk).replace(/punct/g,um).getRegex(),Pk=We("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,cm).replace(/punctSpace/g,Dc).replace(/punct/g,ur).getRegex(),Fk=We(/\\(punct)/,"gu").replace(/punct/g,ur).getRegex(),$k=We(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Bk=We(Oc).replace("(?:-->|$)","-->").getRegex(),Uk=We("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Bk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Dl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Hk=We(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Dl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),pm=We(/^!?\[(label)\]\[(ref)\]/).replace("label",Dl).replace("ref",Nc).getRegex(),hm=We(/^!?\[(ref)\](?:\[\])?/).replace("ref",Nc).getRegex(),Vk=We("reflink|nolink(?!\\()","g").replace("reflink",pm).replace("nolink",hm).getRegex(),Mc={_backpedal:ai,anyPunctuation:Fk,autolink:$k,blockSkip:Nk,br:om,code:Ck,del:ai,emStrongLDelim:Ok,emStrongRDelimAst:Dk,emStrongRDelimUnd:Pk,escape:Tk,link:Hk,nolink:hm,punctuation:Ak,reflink:pm,reflinkSearch:Vk,tag:Uk,text:Ek,url:ai},jk={...Mc,link:We(/^!?\[(label)\]\((.*?)\)/).replace("label",Dl).getRegex(),reflink:We(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Dl).getRegex()},ko={...Mc,emStrongRDelimAst:Mk,emStrongLDelim:Lk,url:We(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},zk={...ko,br:We(om).replace("{2,}","*").getRegex(),text:We(ko.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Yi={normal:Lc,gfm:wk,pedantic:Sk},ja={normal:Mc,gfm:ko,breaks:zk,pedantic:jk},Kk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},$d=e=>Kk[e];function As(e,t){if(t){if(qt.escapeTest.test(e))return e.replace(qt.escapeReplace,$d)}else if(qt.escapeTestNoEncode.test(e))return e.replace(qt.escapeReplaceNoEncode,$d);return e}function Bd(e){try{e=encodeURI(e).replace(qt.percentDecode,"%")}catch{return null}return e}function Ud(e,t){var i;const s=e.replace(qt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(qt.slashPipe,"|");return n}function za(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function qk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Hd(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function Gk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Ml=class{constructor(e){Xe(this,"options");Xe(this,"rules");Xe(this,"lexer");this.options=e||Wn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:za(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=Gk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=za(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:za(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=za(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),u=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${u}`:u;const d=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(u,i,!0),this.lexer.state.top=d,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,g=p.raw+`
`+s.join(`
`),m=this.blockquote(g);i[i.length-1]=m,n=n.substring(0,n.length-p.raw.length)+m.raw,a=a.substring(0,a.length-p.text.length)+m.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,g=p.raw+`
`+s.join(`
`),m=this.list(g);i[i.length-1]=m,n=n.substring(0,n.length-f.raw.length)+m.raw,a=a.substring(0,a.length-p.raw.length)+m.raw,s=g.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",u="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let d=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,E=>" ".repeat(3*E.length)),f=e.split(`
`,1)[0],p=!d.trim(),g=0;if(this.options.pedantic?(g=2,u=d.trimStart()):p?g=t[1].length+1:(g=t[2].search(this.rules.other.nonSpaceChar),g=g>4?1:g,u=d.slice(g),g+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const E=this.rules.other.nextBulletRegex(g),y=this.rules.other.hrRegex(g),v=this.rules.other.fencesBeginRegex(g),x=this.rules.other.headingBeginRegex(g),T=this.rules.other.htmlBeginRegex(g);for(;e;){const N=e.split(`
`,1)[0];let O;if(f=N,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),O=f):O=f.replace(this.rules.other.tabCharGlobal,"    "),v.test(f)||x.test(f)||T.test(f)||E.test(f)||y.test(f))break;if(O.search(this.rules.other.nonSpaceChar)>=g||!f.trim())u+=`
`+O.slice(g);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(d)||x.test(d)||y.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=N+`
`,e=e.substring(N.length+1),d=O.slice(g)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let m=null,k;this.options.gfm&&(m=this.rules.other.listIsTask.exec(u),m&&(k=m[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!m,checked:k,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Ud(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Ud(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=za(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=qk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Hd(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Hd(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const g=f.slice(1,-1);return{type:"em",raw:f,text:g,tokens:this.lexer.inlineTokens(g)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Zs=class wo{constructor(t){Xe(this,"tokens");Xe(this,"options");Xe(this,"state");Xe(this,"tokenizer");Xe(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Wn,this.options.tokenizer=this.options.tokenizer||new Ml,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:qt,block:Yi.normal,inline:ja.normal};this.options.pedantic?(s.block=Yi.pedantic,s.inline=ja.pedantic):this.options.gfm&&(s.block=Yi.gfm,this.options.breaks?s.inline=ja.breaks:s.inline=ja.gfm),this.tokenizer.rules=s}static get rules(){return{block:Yi,inline:ja}}static lex(t,s){return new wo(s).lex(t)}static lexInline(t,s){return new wo(s).inlineTokens(t)}lex(t){t=t.replace(qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(qt.tabCharGlobal,"    ").replace(qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const u=t.slice(1);let d;this.options.extensions.startBlock.forEach(f=>{d=f.call({lexer:this},u),typeof d=="number"&&d>=0&&(c=Math.min(c,d))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const u=Object.keys(this.tokens.links);if(u.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)u.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let u;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(u=f.call({lexer:this},t,s))?(t=t.substring(u.raw.length),s.push(u),!0):!1))continue;if(u=this.tokenizer.escape(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.tag(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.link(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(u.raw.length);const f=s.at(-1);u.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(u=this.tokenizer.emStrong(t,n,l)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.codespan(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.br(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.del(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.autolink(t)){t=t.substring(u.raw.length),s.push(u);continue}if(!this.state.inLink&&(u=this.tokenizer.url(t))){t=t.substring(u.raw.length),s.push(u);continue}let d=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let g;this.options.extensions.startInline.forEach(m=>{g=m.call({lexer:this},p),typeof g=="number"&&g>=0&&(f=Math.min(f,g))}),f<1/0&&f>=0&&(d=t.substring(0,f+1))}if(u=this.tokenizer.inlineText(d)){t=t.substring(u.raw.length),u.raw.slice(-1)!=="_"&&(l=u.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Pl=class{constructor(e){Xe(this,"options");Xe(this,"parser");this.options=e||Wn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(qt.notSpaceStart))==null?void 0:i[0],a=e.replace(qt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+As(n)+'">'+(s?a:As(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:As(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+As(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${As(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Bd(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+As(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Bd(e);if(a===null)return As(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${As(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:As(e.text)}},Pc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Js=class So{constructor(t){Xe(this,"options");Xe(this,"renderer");Xe(this,"textRenderer");this.options=t||Wn,this.options.renderer=this.options.renderer||new Pl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Pc}static parse(t,s){return new So(s).parse(t)}static parseInline(t,s){return new So(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Vr,ll=(Vr=class{constructor(e){Xe(this,"options");Xe(this,"block");this.options=e||Wn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Zs.lex:Zs.lexInline}provideParser(){return this.block?Js.parse:Js.parseInline}},Xe(Vr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Vr),Wk=class{constructor(...e){Xe(this,"defaults",Ac());Xe(this,"options",this.setOptions);Xe(this,"parse",this.parseMarkdown(!0));Xe(this,"parseInline",this.parseMarkdown(!1));Xe(this,"Parser",Js);Xe(this,"Renderer",Pl);Xe(this,"TextRenderer",Pc);Xe(this,"Lexer",Zs);Xe(this,"Tokenizer",Ml);Xe(this,"Hooks",ll);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Pl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Ml(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new ll;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];ll.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Zs.lex(e,t??this.defaults)}parser(e,t){return Js.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?Zs.lex:Zs.lexInline,o=i.hooks?i.hooks.provideParser():e?Js.parse:Js.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+As(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},jn=new Wk;function ze(e,t){return jn.parse(e,t)}ze.options=ze.setOptions=function(e){return jn.setOptions(e),ze.defaults=jn.defaults,am(ze.defaults),ze};ze.getDefaults=Ac;ze.defaults=Wn;ze.use=function(...e){return jn.use(...e),ze.defaults=jn.defaults,am(ze.defaults),ze};ze.walkTokens=function(e,t){return jn.walkTokens(e,t)};ze.parseInline=jn.parseInline;ze.Parser=Js;ze.parser=Js.parse;ze.Renderer=Pl;ze.TextRenderer=Pc;ze.Lexer=Zs;ze.lexer=Zs.lex;ze.Tokenizer=Ml;ze.Hooks=ll;ze.parse=ze;ze.options;ze.setOptions;ze.use;ze.walkTokens;ze.parseInline;Js.parse;Zs.lex;const Zk={breaks:!0,gfm:!0};function Vd(e){if(!e)return"";try{if(typeof ze<"u"&&ze.parse){const t=ze.parse(e,Zk);return typeof Pd<"u"?Pd.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Jk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Yk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function Qk(e){return Yk[e]||"wrench"}const Xk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function jd(e){if(!e)return[];const t=e.match(Xk);return t?[...new Set(t)]:[]}const ew={template:`
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
          <span class="chat-connection-status" :class="wsStatus === 'WebSocket' ? 'chat-ws-on' : 'chat-ws-off'">
            <span class="chat-status-dot"></span>
            {{ wsStatus }}
          </span>
        </div>
      </div>
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=Q(()=>t.value.trim().length>0&&!s.value),d=Q(()=>{const S=Ge.state;return S==="connected"?"Connected":S==="reconnecting"?"Reconnecting…":S==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=Q(()=>{const S=Math.floor(i.value/4)%f.length,$=i.value;return $>3?`${f[S]} (${$}s)`:f[0]});function g(){Et(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function m(){if(!a.value)return;const S=a.value;S.style.height="auto",S.style.height=Math.min(S.scrollHeight,120)+"px"}function k(S,$,q={}){const G={id:++o,role:S,content:$,timestamp:Date.now(),html:S==="bot"?Vd($):"",tools_used:q.tools_used||[],is_error:q.is_error||!1,images:S==="bot"?jd($):[],files:q.files||[],_showTools:!1};return e.value.push(G),g(),S==="bot"&&Et(()=>E()),G}function E(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach($=>{$.setAttribute("data-copy","true"),$.style.position="relative";const q=document.createElement("button");q.className="chat-code-copy",q.textContent="Copy",q.addEventListener("click",()=>{const G=$.querySelector("code"),D=G?G.textContent:$.textContent;navigator.clipboard.writeText(D).then(()=>{q.textContent="Copied!",setTimeout(()=>{q.textContent="Copy"},1500)}).catch(()=>{})}),$.appendChild(q)})}function y(S){if(S===0)return!0;const $=e.value[S-1],q=e.value[S],G=new Date($.timestamp).toDateString(),D=new Date(q.timestamp).toDateString();return G!==D}function v(S){const $=new Date(S),q=new Date;if($.toDateString()===q.toDateString())return"Today";const G=new Date(q);return G.setDate(G.getDate()-1),$.toDateString()===G.toDateString()?"Yesterday":$.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function x(S){t.value=S,Et(()=>B())}function T(S){window.open(S,"_blank","noopener")}function N(S){S.target.style.display="none"}function O(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function w(){r&&(clearInterval(r),r=null),i.value=0}function A(S){s.value&&(s.value=!1,w(),S.type==="chat_response"?k("bot",S.content,{tools_used:S.tools_used||[],is_error:S.is_error||!1,files:S.files||[]}):S.type==="chat_error"&&k("bot",S.error||"Unknown error",{is_error:!0}),Et(()=>{var $;return($=a.value)==null?void 0:$.focus()}))}async function L(S){try{const $=await K.post("/api/chat",{content:S,channel_id:l.value});k("bot",$.response,{tools_used:$.tools_used||[],is_error:$.is_error||!1,files:$.files||[]})}catch($){k("bot",$.message||"Failed to send message",{is_error:!0})}}async function B(){const S=t.value.trim();if(!S||s.value)return;k("user",S),t.value="",s.value=!0,O(),a.value&&(a.value.style.height="auto"),Ge.connected&&Ge.sendChat(S,{channelId:l.value})||(await L(S),s.value=!1,w()),Et(()=>{var q;return(q=a.value)==null?void 0:q.focus()})}async function P(){try{if(!l.value){const $=await K.get("/api/auth/session");l.value=$.channel_id||$.user_id||"web-user"}const S=await K.get("/api/sessions/"+encodeURIComponent(l.value));if(S&&S.messages&&S.messages.length>0){for(const $ of S.messages){const q=$.role==="user"?"user":"bot";let G=$.content||"";if(q==="user"){const I=G.match(/^\[.*?\]:\s*/);I&&(G=G.slice(I[0].length))}if(!G.trim())continue;const D={id:++o,role:q,content:G,timestamp:$.timestamp?$.timestamp*1e3:Date.now(),html:q==="bot"?Vd(G):"",tools_used:[],is_error:!1,images:q==="bot"?jd(G):[],files:[],_showTools:!1};e.value.push(D)}Et(()=>{g(),E()})}}catch{}}return Ue(()=>{Ge.subscribe("chat",A),P(),Et(()=>{var S;return(S=a.value)==null?void 0:S.focus()})}),ht(()=>{Ge.unsubscribe("chat",A),w()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:B,autoResize:m,formatTime:Jk,formatDate:v,showDateSeparator:y,useSuggestion:x,openImage:T,onImageError:N,getToolIcon:Qk}}},dr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=A_(),s=Yh(),n=Q({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=Q(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=Q(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});hs(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var u;return(u=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:u.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},tw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,g;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const m={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(m);return}if(d==="tool_end"){const m=e.value.findIndex(k=>k.tool===u.action&&k.status==="running");if(m>=0){const k=e.value[m];k.status=(p=u.metadata)!=null&&p.error?"error":"success",k.elapsed=((g=u.metadata)==null?void 0:g.elapsed_ms)||Date.now()-k.startTime,k.result=u.detail||"",k.fadingOut=!0,setTimeout(()=>{const E=e.value.indexOf(k);E>=0&&e.value.splice(E,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const m=u.tool_name||"unknown";if(u.finished)delete s.value[m];else{const E=((s.value[m]||"")+(u.chunk||"")).split(`
`);s.value[m]=E.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(u=>{u.status==="running"&&(u.elapsed=c-u.startTime)})}Ue(()=>{Ge.on("events",a),i=setInterval(l,500)}),ht(()=>{Ge.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"clock":c==="success"?"success":c==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
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
  `},sw={template:`
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
        <div v-for="agent in filteredAgents" :key="agent.id"
             class="ag-card" :class="'ag-card-' + agent.status" role="listitem">
          <!-- Card header -->
          <div class="ag-card-header">
            <div class="ag-card-title-row">
              <span class="ag-status-dot" :class="'ag-dot-' + agent.status" role="img" :aria-label="'Status: ' + agent.status"></span>
              <span class="ag-card-label">{{ agent.label }}</span>
              <span class="ag-card-id">{{ agent.id }}</span>
            </div>
            <span class="ag-status-badge" :class="'ag-badge-' + agent.status">{{ agent.status }}</span>
          </div>

          <!-- Goal -->
          <div class="ag-card-goal">{{ agent.goal }}</div>

          <!-- Progress bar (running agents) -->
          <div v-if="agent.status === 'running'" class="ag-progress-bar">
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
              <span class="ag-card-stat-value">{{ (agent.tools_used || []).length }}</span>
            </div>
          </div>

          <!-- Tools used -->
          <div v-if="agent.tools_used && agent.tools_used.length > 0" class="ag-card-tools">
            <span v-for="tool in agent.tools_used" :key="tool" class="ag-tool-chip">{{ tool }}</span>
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

          <!-- Kill button (running only) -->
          <div v-if="agent.status === 'running'" class="ag-card-actions">
            <button @click="killAgent(agent.id)" class="btn btn-danger text-xs"
                    :disabled="killing === agent.id">
              {{ killing === agent.id ? 'Killing...' : 'Kill Agent' }}
            </button>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=null;const r=Q(()=>e.value.filter(E=>E.status==="running").length),o=Q(()=>e.value.filter(E=>E.status==="completed").length),c=Q(()=>e.value.filter(E=>["failed","timeout","killed"].includes(E.status)).length),u=Q(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=Q(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(E=>["failed","timeout","killed"].includes(E.status)):e.value.filter(E=>E.status===i.value));function f(E){return Math.min(100,Math.round(E.iteration_count/30*100))}async function p(E=!1){E=E===!0,E||(t.value=!0);try{const y=await K.get("/api/agents");e.value=Array.isArray(y)?y:[],s.value=null}catch(y){E||(s.value=y.message)}E||(t.value=!1)}async function g(E){const y=e.value.find(x=>x.id===E);if(await ls({title:"Kill agent",message:`Kill agent "${(y==null?void 0:y.label)||E}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=E;try{await K.del(`/api/agents/${encodeURIComponent(E)}`),ke.success("Agent killed"),await p()}catch(x){ke.error(x.message||"Failed to kill agent")}n.value=null}}function m(){k(),a.value&&(l=setInterval(()=>{a.value&&p(!0)},5e3))}function k(){l&&(clearInterval(l),l=null)}return Ue(()=>{p(),m()}),ht(()=>{k()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:La,formatDuration:Ra,progressPercent:f,fetchAgents:p,killAgent:g,startAutoRefresh:m,stopAutoRefresh:k}}},nw={template:`
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
          <div v-for="loop in loops" :key="loop.id" class="hm-card">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="loop-status-dot" :class="statusDotClass(loop.status)"></span>
                <span class="badge" :class="statusBadge(loop.status)">{{ loop.status || 'running' }}</span>
                <span class="badge" :class="modeBadge(loop.mode)">{{ loop.mode }}</span>
                <span class="font-mono text-xs text-gray-500">{{ loop.id }}</span>
              </div>
              <div class="flex gap-2">
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

            <div class="text-sm text-gray-200 mb-2">{{ loop.goal }}</div>

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
                {{ loop.last_trigger ? formatAge(loop.last_trigger) : 'pending' }}
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

            <!-- Iteration history -->
            <div v-if="loop.iteration_history && loop.iteration_history.length > 0" class="mt-3">
              <button @click="toggleHistory(loop.id)" class="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-1">
                <span class="tool-expand-icon" aria-hidden="true"><odin-icon :name="expandedHistory[loop.id] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                Recent iterations ({{ loop.iteration_history.length }})
              </button>
              <div v-if="expandedHistory[loop.id]" class="loop-history">
                <div v-for="(entry, i) in loop.iteration_history" :key="i"
                     class="loop-history-entry">
                  {{ entry }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=Q(()=>e.value.reduce((N,O)=>N+(O.iteration_count||0),0)),d=Q(()=>e.value.filter(N=>N.status==="running").length);function f(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function p(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function g(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}function m(N){c.value={...c.value,[N]:!c.value[N]}}async function k(N=!1){N=N===!0,N||(t.value=!0);try{e.value=await K.get("/api/loops"),s.value=null}catch(O){N||(s.value=O.message)}N||(t.value=!1)}async function E(){l.value=null;const N=a.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(O.stop_condition=N.stop_condition.trim()),i.value=!0;try{const w=await K.post("/api/loops",O);ke.success(`Loop started: ${w.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await k()}catch(w){l.value=w.message}i.value=!1}async function y(N){if(await ls({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=N;try{await K.del(`/api/loops/${encodeURIComponent(N)}`),ke.success("Loop stopped"),await k()}catch(w){ke.error(w.message||"Failed to stop loop")}r.value=null}}async function v(N){o.value=N;try{await K.post(`/api/loops/${encodeURIComponent(N)}/restart`),ke.success("Loop restarted"),await k()}catch(O){ke.error(O.message||"Failed to restart loop")}o.value=null}function x(N){N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&k(!0)}let T=null;return Ue(()=>{k(),Ge.subscribe("events",x),T=setInterval(()=>{k(!0)},5e3)}),ht(()=>{Ge.unsubscribe("events",x),T&&clearInterval(T)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:g,formatDuration:Ra,formatAge:Qh,toggleHistory:m,fetchLoops:k,doCreate:E,doStop:y,doRestart:v}}},aw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=Q(()=>e.value.filter(m=>m.status==="running").length),r=Q(()=>e.value.filter(m=>m.status!=="running").length);function o(m){return m==="running"?"loop-status-running":m==="failed"||m==="error"?"loop-status-error":"loop-status-stopped"}function c(m){return m==="running"?"badge-success":m==="completed"||m==="exited"?"badge-info":m==="killed"||m==="error"||m==="failed"?"badge-danger":"badge-warning"}async function u(m=!1){m=m===!0,m||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(k){m||(s.value=k.message)}m||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}hs(n,m=>{m?d():f()});async function p(m){if(await ls({title:"Kill process",message:`Kill process ${m}?`,confirmLabel:"Kill",danger:!0})){i.value=m;try{await K.del(`/api/processes/${m}`),ke.success(`Process ${m} killed`),await u()}catch(E){ke.error(E.message||"Failed to kill process")}i.value=null}}function g(m){m.payload&&(m.payload.pid||m.payload.type==="process")&&u(!0)}return Ue(()=>{u(),Ge.subscribe("events",g),d()}),ht(()=>{Ge.unsubscribe("events",g),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Ra,fetchProcesses:u,doKill:p}}},iw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),g=h(null),m=h([]),k=h(!1),E=Q(()=>e.value.filter(D=>D.cron&&!D.one_time).length),y=Q(()=>e.value.filter(D=>D.one_time).length),v=Q(()=>e.value.filter(D=>D.trigger).length),x=Q(()=>e.value.filter(D=>D.paused).length),T=Q(()=>e.value.filter(D=>D.consecutive_failures>0).length);function N(D){if(!D)return"-";const I=Date.now(),ue=(new Date(D).getTime()-I)/1e3;if(ue<0)return"overdue";if(ue<60)return"in < 1 min";if(ue<3600)return`in ${Math.floor(ue/60)} min`;if(ue<86400){const ne=Math.floor(ue/3600),me=Math.floor(ue%3600/60);return me>0?`in ${ne}h ${me}m`:`in ${ne}h`}const fe=Math.floor(ue/86400);return`in ${fe} day${fe!==1?"s":""}`}function O(D){return D==null?"-":D<1e3?`${D}ms`:D<6e4?`${(D/1e3).toFixed(1)}s`:Ra(D/1e3)}function w(){r.value=null}async function A(){const D=a.value.cron.trim();if(D){o.value=!0;try{r.value=await K.post("/api/schedules/validate-cron",{expression:D})}catch(I){r.value={valid:!1,error:I.message}}o.value=!1}}async function L(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(D){s.value=D.message}t.value=!1}async function B(D){if(g.value===D){g.value=null,m.value=[];return}g.value=D,k.value=!0,m.value=[];try{m.value=await K.get(`/api/schedules/${encodeURIComponent(D)}/history?limit=10`)}catch{m.value=[]}k.value=!1}async function P(){l.value=null;const D=a.value;if(!D.description.trim()){l.value="Description is required";return}if(!D.channel_id.trim()){l.value="Channel ID is required";return}if(!D.cron.trim()&&!D.run_at.trim()){l.value="Cron expression or run_at time is required";return}const I={description:D.description.trim(),action:D.action,channel_id:D.channel_id.trim()};if(D.cron.trim()&&(I.cron=D.cron.trim()),D.run_at.trim()&&(I.run_at=D.run_at.trim()),D.action==="reminder"&&D.message.trim()&&(I.message=D.message.trim()),D.action==="check"&&(D.tool_name.trim()&&(I.tool_name=D.tool_name.trim()),D.tool_input_str.trim()))try{I.tool_input=JSON.parse(D.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",I),ke.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await L()}catch(j){l.value=j.message}i.value=!1}async function S(D){u.value=D;try{const I=await K.post(`/api/schedules/${encodeURIComponent(D)}/run`);if(I.status==="failure")ke.error(`Execution failed: ${I.error||"unknown error"}`);else{const j=I.warning?`Executed (${I.warning})`:"Executed successfully";ke.success(j)}await L()}catch(I){ke.error(I.message||"Failed to trigger")}u.value=null}async function $(D){f.value=D.id;const I=!D.paused;try{await K.put(`/api/schedules/${encodeURIComponent(D.id)}`,{paused:I}),ke.success(I?"Schedule paused":"Schedule resumed"),await L()}catch(j){ke.error(j.message||"Failed to update schedule")}f.value=null}async function q(D){p.value=D;try{await K.post(`/api/schedules/${encodeURIComponent(D)}/reset-failures`),ke.success("Failure counters reset"),await L()}catch(I){ke.error(I.message||"Failed to reset")}p.value=null}async function G(D){const I=e.value.find(ue=>ue.id===D);if(await ls({title:"Delete schedule",message:`Delete "${(I==null?void 0:I.description)||D}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=D;try{await K.del(`/api/schedules/${encodeURIComponent(D)}`),ke.success("Schedule deleted"),await L()}catch(ue){ke.error(ue.message||"Failed to delete schedule")}d.value=null}}return Ue(()=>{L()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:g,history:m,historyLoading:k,cronCount:E,oneTimeCount:y,webhookCount:v,pausedCount:x,failingCount:T,formatTs:La,formatAge:Qh,formatFuture:N,formatMs:O,formatDuration:Ra,onCronInput:w,validateCron:A,toggleExpand:B,fetchSchedules:L,doCreate:P,doRunNow:S,doTogglePause:$,doResetFailures:q,doDelete:G}}},lw={components:{TabbedPage:dr},setup(){return{tabs:[{id:"live",label:"Live",component:tw},{id:"agents",label:"Agents",component:sw},{id:"loops",label:"Loops",component:nw},{id:"processes",label:"Processes",component:aw},{id:"schedules",label:"Schedules",component:iw}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},rw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await K.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return Ue(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:La,formatDetail:i,truncateBlock:Xh,toggleExpand:l,clearFilters:r,fetchAudit:o}}},zd=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],ow=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),g=zd,m=ow,k=h([]),E=h(!1),y=h(""),v=h("flat"),x=h(new Set),T=h(""),N=h(""),O=h(""),w=h(null),A=h(!1);function L(){try{const U=localStorage.getItem("odin-session-presets");U&&(k.value=JSON.parse(U))}catch{}}function B(){try{localStorage.setItem("odin-session-presets",JSON.stringify(k.value))}catch{}}const P=Q(()=>d.value.trim()!==""||u.value!=="all"),S=Q(()=>{let U=[...e.value];const oe=zd.find(Ze=>Ze.id===u.value),xe=oe?oe.filters:{};if(xe.source&&(U=U.filter(Ze=>Ze.source===xe.source)),xe.minMessages&&(U=U.filter(Ze=>Ze.message_count>=xe.minMessages)),xe.hasCompaction&&(U=U.filter(Ze=>Ze.has_summary)),xe.maxAge!=null){const Ze=Date.now()/1e3;U=U.filter(xt=>xt.last_active&&Ze-xt.last_active<=xe.maxAge)}if(d.value.trim()){const Ze=d.value.toLowerCase().trim();U=U.filter(xt=>(xt.channel_id||"").toLowerCase().includes(Ze)||(xt.last_user_id||"").toLowerCase().includes(Ze)||(xt.source||"").toLowerCase().includes(Ze))}const Pe=f.value,Je=p.value?1:-1;return U.sort((Ze,xt)=>{const et=Ze[Pe]||0,Ye=xt[Pe]||0;return(et-Ye)*Je}),U}),$=Q(()=>{if(!a.value||!a.value.messages)return[];const U=a.value.messages;if(U.length===0)return[];const oe=[];let xe=[];for(const Pe of U)Pe.role==="user"&&xe.length>0&&(oe.push(xe),xe=[]),xe.push(Pe);return xe.length>0&&oe.push(xe),oe}),q=Q(()=>S.value.length>0&&o.value.size===S.value.length);function G(U){const oe=U.find(xe=>xe.role==="user");if(oe&&oe.content){const xe=oe.content.slice(0,120);return xe.length<oe.content.length?xe+"...":xe}return"(no user message)"}function D(U){const oe=new Set(x.value);oe.has(U)?oe.delete(U):oe.add(U),x.value=oe}function I(U){u.value=U}function j(U){u.value=U.id,U.filters.searchQuery!=null&&(d.value=U.filters.searchQuery),U.filters.sortBy&&(f.value=U.filters.sortBy)}function ue(){if(!y.value.trim())return;const U={id:"custom-"+Date.now(),name:y.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};k.value=[...k.value,U],B(),E.value=!1,y.value=""}function fe(U){k.value=k.value.filter(oe=>oe.id!==U),B(),u.value===U&&(u.value="all")}function ne(){u.value="all",d.value="",f.value="last_active",p.value=!1}function me(U){if(!U)return"—";const oe=Date.now()/1e3-U;if(oe<60)return"just now";if(oe<3600){const Pe=Math.floor(oe/60);return`${Pe} minute${Pe!==1?"s":""} ago`}if(oe<86400){const Pe=Math.floor(oe/3600);return`${Pe} hour${Pe!==1?"s":""} ago`}const xe=Math.floor(oe/86400);return`${xe} day${xe!==1?"s":""} ago`}function ee(U){if(!U)return"";try{return new Date(U*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function pe(U){if(!U)return"";try{return new Date(U*1e3).toLocaleString()}catch{return""}}function Ie(U){return U==="user"?"bg-gray-900/50 border border-gray-800":U==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function V(U){return U==="user"?"sess-msg-user":U==="assistant"?"sess-msg-assistant":"sess-msg-system"}function te(U){return U==="user"?"badge-info":U==="assistant"?"badge-success":"badge-warning"}function re(U){return U==="user"?"sess-dot-user":U==="assistant"?"sess-dot-assistant":"sess-dot-system"}function de(U){return U==="user"?"text-cyan-400":U==="assistant"?"text-indigo-400":"text-gray-500"}function he(U){return U?U.length>2e3?U.slice(0,2e3)+`
... (truncated)`:U:""}async function Me(){const U=T.value.trim();if(U){A.value=!0;try{let oe=`/api/sessions/search?q=${encodeURIComponent(U)}&limit=50`;N.value.trim()&&(oe+=`&channel_id=${encodeURIComponent(N.value.trim())}`),O.value.trim()&&(oe+=`&user_id=${encodeURIComponent(O.value.trim())}`);const xe=await K.get(oe);w.value=xe.results||[]}catch{w.value=[]}A.value=!1}}function b(){T.value="",N.value="",O.value="",w.value=null}function C(U){return U?U.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function M(U){return U==="user"?"fts-result-user":U==="assistant"?"fts-result-assistant":U==="summary"?"fts-result-summary":U==="fts"?"fts-result-fts":U==="channel"?"fts-result-channel":"fts-result-default"}function W(U){return U==="user"?"badge-info":U==="assistant"?"badge-success":U==="summary"?"badge-warning":U==="fts"?"badge-success":"badge-info"}async function R(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(U){s.value=U.message}t.value=!1}function F(){s.value=null,R()}async function Z(U){if(n.value===U){n.value=null,a.value=null,x.value=new Set;return}n.value=U,a.value=null,i.value=!0,x.value=new Set;try{a.value=await K.get(`/api/sessions/${encodeURIComponent(U)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function X(U){const oe=new Set(o.value);oe.has(U)?oe.delete(U):oe.add(U),o.value=oe}function se(){q.value?o.value=new Set:o.value=new Set(S.value.map(U=>U.channel_id))}function J(U){l.value=U}async function ge(){if(l.value){r.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await R()}catch(U){s.value=U.message||"Failed to clear session"}r.value=!1,l.value=null}}function le(){c.value=!0}async function ce(){if(o.value.size!==0){r.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await R()}catch(U){s.value=U.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function ye(U,oe){const xe=K._token;let Pe=`/api/sessions/${encodeURIComponent(U)}/export?format=${oe}`;xe&&(Pe+=`&token=${encodeURIComponent(xe)}`);const Je=document.createElement("a");Je.href=Pe,Je.download=`session-${U}.${oe==="text"?"txt":"json"}`,document.body.appendChild(Je),Je.click(),document.body.removeChild(Je)}let _e=null;function Te(U){U.payload&&U.payload.channel_id&&(clearTimeout(_e),_e=setTimeout(()=>{R(),n.value&&U.payload.channel_id===n.value&&K.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(oe=>{a.value=oe}).catch(()=>{})},2e3))}return Ue(()=>{L(),R(),Ge.subscribe("events",Te)}),ht(()=>{Ge.unsubscribe("events",Te),clearTimeout(_e)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:q,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:g,sortOptions:m,filteredSessions:S,hasActiveFilters:P,customPresets:k,showSavePreset:E,newPresetName:y,threadView:v,threads:$,collapsedThreads:x,ftsQuery:T,ftsChannelId:N,ftsUserId:O,ftsResults:w,ftsSearching:A,formatAge:me,formatTimestamp:ee,formatFullTimestamp:pe,messageClass:Ie,threadMsgClass:V,roleBadge:te,roleDotClass:re,roleLabelClass:de,truncateContent:he,threadSummary:G,fetchSessions:R,retry:F,toggleSession:Z,toggleSelect:X,toggleSelectAll:se,confirmClear:J,clearSession:ge,confirmBulkClear:le,doBulkClear:ce,exportSession:ye,applyPreset:I,applyCustomPreset:j,saveCustomPreset:ue,removeCustomPreset:fe,resetFilters:ne,toggleThread:D,runFtsSearch:Me,clearFtsSearch:b,highlightSnippet:C,ftsResultClass:M,ftsTypeBadge:W}}},uw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:M_}}},dw={components:{ContextAssemblyPanel:uw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(O){if(!O)return"—";try{const w=new Date(O);return isNaN(w.getTime())?O:w.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function f(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function p(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function g(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function m(O){a.value===O?a.value=null:(a.value=O,c.value={})}function k(O,w){const A=O+"-"+w;c.value={...c.value,[A]:!c.value[A]}}function E(O,w){return!!c.value[O+"-"+w]}function y(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,T()}async function v(){try{const O=await K.get("/api/trajectories");e.value=O.files||[],o.value=O.count||0}catch{}}let x=0;async function T(){const O=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const w=await K.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(O!==x)return;let A=w.entries||[];u.value.tool_name&&(A=A.filter(L=>(L.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(A=A.filter(L=>L.is_error)),u.value.channel_id&&(A=A.filter(L=>L.channel_id===u.value.channel_id)),u.value.user_id&&(A=A.filter(L=>L.user_id===u.value.user_id)),t.value=A}else{const w=new URLSearchParams;u.value.channel_id&&w.set("channel_id",u.value.channel_id),u.value.user_id&&w.set("user_id",u.value.user_id),u.value.tool_name&&w.set("tool_name",u.value.tool_name),u.value.errors_only&&w.set("errors_only","true"),w.set("limit",String(u.value.limit));const A=w.toString(),L=await K.get(`/api/trajectories/search/query?${A}`);if(O!==x)return;t.value=L.results||[]}}catch(w){if(O!==x)return;n.value=w.message}O===x&&(s.value=!1)}async function N(){if(!l.value.trim())return;const O=++x;s.value=!0,n.value=null,c.value={};try{const w=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==x)return;i.value=w.entry||null,i.value||(n.value="No trace found for this message ID")}catch(w){if(O!==x)return;w.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=w.message}O===x&&(s.value=!1)}return Ue(async()=>{await v(),await T()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:g,truncateBlock:Xh,toggleExpand:m,toggleIteration:k,isIterationExpanded:E,clearFilters:y,fetchFiles:v,fetchTraces:T,lookupMessage:N}}},fw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=Q(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await K.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return Ue(()=>{o(),i=setInterval(o,15e3)}),ht(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:em,formatTime:Cc,retry:c}}},pw={components:{TabbedPage:dr},setup(){return{tabs:[{id:"audit",label:"Audit",component:rw},{id:"sessions",label:"Sessions",component:cw},{id:"traces",label:"Traces",component:dw},{id:"usage",label:"Usage",component:fw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Br=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=Q(()=>e.value.filter(y=>y.is_core).length),c=Q(()=>e.value.filter(y=>!y.is_core).length),u=Q(()=>Object.values(a.value).reduce((y,v)=>y+v,0));function d(y){for(const v of Br)if(v.id!=="other"&&v.match(y))return v.id;return"other"}const f=Q(()=>{let y=e.value;if(n.value){const v=n.value.toLowerCase();y=y.filter(x=>x.name.toLowerCase().includes(v)||(x.description||"").toLowerCase().includes(v))}return r.value&&(y=y.filter(v=>d(v.name)===r.value)),y}),p=Q(()=>{const y=new Set;for(const v of e.value)y.add(d(v.name));return Br.filter(v=>y.has(v.id))}),g=Q(()=>{const y=f.value,v={};for(const T of y){const N=d(T.name);v[N]||(v[N]=[]),v[N].push(T)}const x=[];for(const T of Br)v[T.id]&&v[T.id].length>0&&x.push({label:T.label,icon:T.icon,tools:v[T.id].sort((N,O)=>N.name.localeCompare(O.name))});return x});function m(y){i.value={...i.value,[y]:!i.value[y]}}async function k(){t.value=!0,s.value=null;try{const[y,v]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=v||{};const x=Object.values(v||{}).filter(T=>T>0).sort((T,N)=>T-N)}catch(y){s.value=y.message}t.value=!1}function E(){k()}return Ue(()=>{k()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:g,usedCategories:p,truncate:Ec,toggleExpand:m,refresh:E}}};function mw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function gw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const vw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),g=h(!1),m=h(null),k=h(null),E=h(!1),y=Q(()=>e.value.length),v=Q(()=>e.value.reduce((ee,pe)=>ee+(pe.execution_count||0),0)),x=Q(()=>e.value.reduce((ee,pe)=>ee+L(pe.code),0)),T=Q(()=>{if(!l.value)return e.value;const ee=l.value.toLowerCase();return e.value.filter(pe=>pe.name.toLowerCase().includes(ee)||(pe.description||"").toLowerCase().includes(ee))}),N=Q(()=>d.value?d.value.split(`
`).length:0),O=Q(()=>{const ee=Math.max(N.value,1);return Array.from({length:ee},(pe,Ie)=>Ie+1).join(`
`)}),w=Q(()=>{const ee=d.value.trim();return ee?ee.includes("SKILL_DEFINITION")?ee.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function A(ee){return mw(ee)}function L(ee){return ee?ee.split(`
`).length:0}function B(ee){return gw(ee)}function P(ee){n.value={...n.value,[ee]:!n.value[ee]}}async function S(ee){try{await navigator.clipboard.writeText(ee);const pe=e.value.find(Ie=>Ie.code===ee);pe&&(r.value=pe.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function $(ee){if(ee.key==="Tab"){ee.preventDefault();const pe=ee.target,Ie=pe.selectionStart,V=pe.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(V),Et(()=>{pe.selectionStart=pe.selectionEnd=Ie+4})}}function q(ee){const pe=ee.target.previousElementSibling;pe&&(pe.scrollTop=ee.target.scrollTop)}async function G(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(ee){s.value=ee.message}t.value=!1}async function D(ee){i.value=ee,delete a.value[ee],a.value={...a.value};try{const pe=await K.post(`/api/skills/${encodeURIComponent(ee)}/test`);a.value={...a.value,[ee]:pe}}catch(pe){a.value={...a.value,[ee]:{result:pe.message,is_error:!0}}}i.value=null}function I(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function j(ee){o.value=!0,c.value="edit",u.value=ee.name,d.value=ee.code||"",f.value=null,p.value=null}function ue(){o.value=!1,f.value=null,p.value=null}async function fe(){f.value=null,p.value=null;const ee=u.value.trim(),pe=d.value.trim();if(!ee){f.value="Name is required";return}if(!pe){f.value="Code is required";return}g.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:ee,code:pe}),p.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(ee)}`,{code:pe}),p.value="Skill updated successfully"),await G(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}g.value=!1}function ne(ee){k.value=ee}async function me(){if(k.value){E.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(k.value)}`),await G()}catch{}E.value=!1,k.value=null}}return Ue(()=>{G()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:g,editorRef:m,deleteTarget:k,deleting:E,enabledCount:y,totalExecutions:v,totalLines:x,displayedSkills:T,editLineCount:N,editorLineNums:O,editValidation:w,highlight:A,truncate:Ec,formatTs:La,countLines:L,getLineNumbers:B,toggleCode:P,copyCode:S,handleEditorKey:$,syncScroll:q,fetchSkills:G,testSkill:D,showCreate:I,editSkill:j,cancelEdit:ue,saveSkill:fe,confirmDelete:ne,doDelete:me}}};function bw(e,t){if(!e||!t)return kd(e);const s=kd(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),g=h(null),m=h(null);let k=null;const E=h(null),y=h(!1),v=h({}),x=h({}),T=h(null),N=h(null),O=Q(()=>e.value.reduce((I,j)=>I+(j.chunks||0),0)),w=Q(()=>new Set(e.value.map(j=>j.uploader).filter(Boolean)).size);function A(I,j){const ue=x.value[j];if(!ue||ue.length===0)return 0;const fe=Math.max(...ue.map(ne=>ne.char_count||0));return fe===0?0:Math.round(I.char_count/fe*100)}async function L(){t.value=!0,s.value=null;try{const I=await K.get("/api/knowledge");e.value=Array.isArray(I)?I:[]}catch(I){s.value=I.message}t.value=!1}async function B(I){if(v.value[I]){v.value[I]=!1,N.value=null;return}if(v.value[I]=!0,!(x.value[I]||T.value===I)){T.value=I;try{const j=await K.get(`/api/knowledge/${encodeURIComponent(I)}/chunks`);x.value[I]=Array.isArray(j)?j:[]}catch(j){x.value[I]=[],ke.error(`Failed to load chunks: ${j.message}`)}T.value=null}}async function P(){const I=n.value.trim();if(I){i.value=!0,r.value=null,l.value=I;try{const j=await K.get(`/api/knowledge/search?q=${encodeURIComponent(I)}`);a.value=Array.isArray(j)?j:[]}catch(j){a.value=[],r.value=j.message||"Search failed"}i.value=!1}}function S(){a.value=null,n.value="",r.value=null}async function $(){d.value=null,f.value=null;const I=c.value.trim(),j=u.value.trim();if(!I){d.value="Source name is required";return}if(!j){d.value="Content is required";return}p.value=!0;try{const ue=await K.post("/api/knowledge",{source:I,content:j});f.value=`Ingested ${ue.chunks||0} chunks from "${I}"`,c.value="",u.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(ue){d.value=ue.message}p.value=!1}async function q(I){g.value=I,m.value=null,k&&(clearTimeout(k),k=null);try{const j=await K.post(`/api/knowledge/${encodeURIComponent(I)}/reingest`);m.value={source:I,error:!1,message:`Re-ingested ${j.chunks||0} chunks`},delete x.value[I],await L(),k=setTimeout(()=>{m.value=null,k=null},3e3)}catch(j){m.value={source:I,error:!0,message:j.message}}g.value=null}function G(I){E.value=I}async function D(){if(E.value){y.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(E.value)}`),delete x.value[E.value],await L()}catch{}y.value=!1,E.value=null}}return Ue(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:g,reingestResult:m,deleteTarget:E,deleting:y,expanded:v,sourceChunks:x,loadingChunks:T,selectedChunk:N,totalChunks:O,uploaderCount:w,truncate:Ec,formatTs:La,highlightTerms:bw,chunkBarWidth:A,fetchSources:L,toggleSource:B,doSearch:P,clearSearch:S,doIngest:$,doReingest:q,confirmDelete:G,doDelete:D}}},xw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),g=h(!1),m=h(null),k=h(null),E=h(new Set),y=h(null),v=h(!1),x=h(!1),T=Q(()=>e.value.reduce((ne,me)=>ne+me.count,0)),N=Q(()=>E.value.size);function O(ne){const me=t.value[ne];if(!me)return[];if(!l.value.trim())return me;const ee=l.value.trim().toLowerCase();return me.filter(pe=>pe.key.toLowerCase().includes(ee)||pe.value&&pe.value.toLowerCase().includes(ee))}function w(ne,me){return E.value.has(ne+"/"+me)}function A(ne,me){const ee=ne+"/"+me,pe=new Set(E.value);pe.has(ee)?pe.delete(ee):pe.add(ee),E.value=pe}function L(ne){const me=t.value[ne];return!me||me.length===0?!1:me.every(ee=>E.value.has(ne+"/"+ee.key))}function B(ne,me){const ee=t.value[ne];if(!ee)return;const pe=new Set(E.value);for(const Ie of ee){const V=ne+"/"+Ie.key;me?pe.add(V):pe.delete(V)}E.value=pe}async function P(){s.value=!0,n.value=null;try{const ne=await K.get("/api/memory");e.value=Object.entries(ne).map(([me,ee])=>({name:me,keys:ee.keys||[],count:ee.count||0}))}catch(ne){n.value=ne.message}s.value=!1}async function S(ne){if(a.value[ne]){a.value[ne]=!1;return}a.value[ne]=!0;const me=e.value.find(pe=>pe.name===ne);if(!me||t.value[ne]||i.value===ne)return;i.value=ne;const ee=await Promise.all(me.keys.map(async pe=>{try{const Ie=await K.get(`/api/memory/${encodeURIComponent(ne)}/${encodeURIComponent(pe)}`);return{key:pe,value:Ie.value||""}}catch{return{key:pe,value:"(error loading)"}}}));t.value[ne]=ee,i.value=null}function $(ne,me,ee){f.value=ne+"/"+me,p.value=ee}async function q(ne,me){g.value=!0,m.value=null;try{await K.put(`/api/memory/${encodeURIComponent(ne)}/${encodeURIComponent(me)}`,{value:p.value});const ee=t.value[ne];if(ee){const pe=ee.find(Ie=>Ie.key===me);pe&&(pe.value=p.value)}f.value=null}catch(ee){m.value=`Failed to save: ${ee.message||"unknown error"}`}g.value=!1}async function G(ne,me){try{await navigator.clipboard.writeText(me.value),k.value=ne+"/"+me.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function D(){u.value=null,d.value=null;const ne=o.value.scope.trim(),me=o.value.key.trim(),ee=o.value.value.trim();if(!ne){u.value="Scope is required";return}if(!me){u.value="Key is required";return}if(!ee){u.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(ne)}/${encodeURIComponent(me)}`,{value:ee}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(pe){u.value=pe.message}c.value=!1}function I(ne,me){y.value={scope:ne,key:me}}async function j(){if(!y.value)return;v.value=!0,m.value=null;const{scope:ne,key:me}=y.value;try{await K.del(`/api/memory/${encodeURIComponent(ne)}/${encodeURIComponent(me)}`);const ee=t.value[ne];ee&&(t.value[ne]=ee.filter(V=>V.key!==me));const pe=e.value.find(V=>V.name===ne);pe&&(pe.count--,pe.keys=pe.keys.filter(V=>V!==me));const Ie=new Set(E.value);Ie.delete(ne+"/"+me),E.value=Ie}catch(ee){m.value=`Failed to delete: ${ee.message||"unknown error"}`}v.value=!1,y.value=null}function ue(){x.value=!0}async function fe(){v.value=!0,m.value=null;const ne=[];for(const me of E.value){const ee=me.indexOf("/");ne.push({scope:me.slice(0,ee),key:me.slice(ee+1)})}try{await K.post("/api/memory/bulk-delete",{entries:ne}),E.value=new Set,t.value={},await P()}catch(me){m.value=`Bulk delete failed: ${me.message||"unknown error"}`}v.value=!1,x.value=!1}return Ue(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:g,actionError:m,copied:k,selected:E,selectedCount:N,totalEntries:T,deleteTarget:y,deleting:v,showBulkDelete:x,fetchMemory:P,toggleScope:S,startEdit:$,doEdit:q,copyValue:G,doAdd:D,confirmDelete:I,doDelete:j,confirmBulkDelete:ue,doBulkDelete:fe,isSelected:w,toggleSelect:A,isScopeAllSelected:L,toggleSelectAll:B,filteredEntries:O}}},_w={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=Q(()=>[...new Set(e.value.map(k=>k.category))].sort()),o=Q(()=>{const m={};return e.value.forEach(k=>{m[k.category]=(m[k.category]||0)+1}),m}),c=Q(()=>a.value?e.value.filter(m=>m.category===a.value):e.value);function u(m){return m==="correction"?"badge-warning":m==="operational"?"badge-info":m==="preference"?"badge-success":"badge-info"}function d(m){i.value=m.key,l.value=m.content}async function f(m){try{await K.put("/api/learned/"+encodeURIComponent(m),{content:l.value}),i.value=null,ke.success("Entry updated"),await g()}catch(k){ke.error(k.message||"Failed to save entry")}}async function p(m){if(await ls({title:"Delete learned entry",message:`Delete "${m}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(m)),ke.success("Entry deleted"),await g()}catch(E){ke.error(E.message||"Failed to delete entry")}}async function g(){s.value=!0,n.value=null;try{const m=await K.get("/api/learned");e.value=m.entries||[],t.value={last_reflection:m.last_reflection,count:m.count}}catch(m){n.value=m.message}s.value=!1}return Ue(g),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:La,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:g}}},kw={components:{TabbedPage:dr},setup(){return{tabs:[{id:"tools",label:"Tools",component:hw},{id:"skills",label:"Skills",component:vw},{id:"knowledge",label:"Knowledge",component:yw},{id:"memory",label:"Memory",component:xw},{id:"learned",label:"Learned",component:_w}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},ww={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),g=Q(()=>e.value==="custom"),m=Q(()=>[...i.value,...l.value]),k=Q(()=>l.value.includes(e.value)),E=Q(()=>{var w;return g.value?t.value||"Odin":((w=a.value[e.value])==null?void 0:w.name)||e.value}),y=Q(()=>{var w;return g.value?s.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.identity)||""}),v=Q(()=>{var w;return g.value?n.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.voice)||""});async function x(){u.value=!0;try{const w=await K.get("/api/personality");e.value=w.preset||"odin",t.value=w.custom_name||"",s.value=w.custom_identity||"",n.value=w.custom_voice||"",a.value=w.presets||{},i.value=w.builtin_presets||[],l.value=w.user_presets||[]}catch(w){c.value=w.message}finally{u.value=!1}}async function T(){r.value=!0,c.value=null,o.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(w){c.value=w.message}finally{r.value=!1}}async function N(){const w=d.value.trim();if(w){p.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:w,display_name:E.value,identity:y.value,voice:v.value}),f.value=!1,d.value="",await x(),e.value=w.toLowerCase().replace(/ /g,"_")}catch(A){c.value=A.message}finally{p.value=!1}}}async function O(){if(await ls({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(A){c.value=A.message}}}return Ue(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:m,isCustom:g,isUserPreset:k,previewName:E,previewIdentity:y,previewVoice:v,saving:r,saved:o,error:c,loading:u,save:T,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:N,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
  `},Sw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Tw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Cw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ew={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=Q(()=>e.value.components||[]),i=Q(()=>Cw[e.value.overall]||"text-gray-400"),l=Q(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=Q(()=>{const y=e.value.overall;return y==="healthy"?"All Systems Healthy":y==="degraded"?"Some Systems Degraded":y==="unhealthy"?"System Issues Detected":"Unknown"});function o(y){return Sw[y]||"text-gray-400"}function c(y){return Tw[y]||"info"}function u(y){return y==="ok"?"badge-success":y==="degraded"?"badge-warning":y==="down"?"badge-danger":"badge-info"}function d(y){return y==="closed"?"text-green-400":y==="half_open"?"text-yellow-400":y==="open"?"text-red-400":"text-gray-400"}function f(y){return y.replace(/_/g," ").replace(/\b\w/g,v=>v.toUpperCase())}function p(y){if(!y)return"—";try{return new Date(y).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return y}}function g(y){return y>=1e6?(y/1e6).toFixed(1)+"M":y>=1e3?(y/1e3).toFixed(1)+"K":String(y)}async function m(){n.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null}catch(y){s.value=y.message}finally{t.value=!1,n.value=!1}}function k(){t.value=!0,s.value=null,m()}let E=null;return Ue(async()=>{await m(),E=setInterval(m,3e4)}),ht(()=>{E&&clearInterval(E)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:g,fetchHealth:m,retry:k}}},Aw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=Q(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=Q(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await K.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return Ue(()=>{c(),i=setInterval(c,3e4)}),ht(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:em,refresh:u,retry:d}}},Rw=["INFO","WARNING","ERROR"],Iw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Ur=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Nw=[50,100,200,500],Ow={template:`
    <div class="p-6 page-fade-in flex flex-col" style="height: calc(100vh - 56px);">
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

          <div class="flex-1" style="min-width:0;">
            <div class="flex gap-1.5 items-center">
              <input v-model="textFilter" type="text" class="hm-input flex-1"
                     :placeholder="useRegex ? 'Regex pattern...' : 'Filter logs...'"
                     :class="{ 'border-red-700': regexError }"
                     style="min-width:120px;" />
              <button @click="useRegex = !useRegex" class="btn text-xs"
                      :class="useRegex ? 'btn-primary' : 'btn-ghost'"
                      title="Toggle regex filtering">.*</button>
            </div>
            <div v-if="regexError" class="text-red-400 text-xs mt-0.5">{{ regexError }}</div>
          </div>

          <label class="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-pointer flex-shrink-0">
            <input type="checkbox" v-model="autoScroll" class="rounded" />
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ge.state||"disconnected"),c=Q(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,g=Rw,m=Iw,k=Ur,E=h("all"),y=h(""),v=h([]),x=h(!1),T=h(""),N=h([]);function O(){try{const H=localStorage.getItem("odin-log-presets");H&&(v.value=JSON.parse(H))}catch{}}function w(){try{localStorage.setItem("odin-log-presets",JSON.stringify(v.value))}catch{}}const A=Q(()=>a.value!==""||i.value.trim()!==""||y.value!==""),L=Q(()=>{const H=Ur.find(ae=>ae.value===y.value);return H?H.label:""}),B=Q(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(H){return H.message}}),P=24,S=Q(()=>{if(t.value.length===0)return[];const H=[],ae=new Date,Ce=3600*1e3;for(let Ke=P-1;Ke>=0;Ke--){const rt=new Date(ae.getTime()-(Ke+1)*Ce),Zt=new Date(ae.getTime()-Ke*Ce);H.push({start:rt,end:Zt,label:D(rt,Zt),shortLabel:Zt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ke of t.value){if(!Ke._time)continue;const rt=Ke._time.getTime();for(const Zt of H)if(rt>=Zt.start.getTime()&&rt<Zt.end.getTime()){Zt.total++,Ke.level==="ERROR"?Zt.errors++:Ke.level==="WARNING"?Zt.warnings++:Zt.info++;break}}return H}),$=Q(()=>{let H=1;for(const ae of S.value)ae.total>H&&(H=ae.total);return H}),q=Q(()=>S.value.length===0?"":"Last 24 hours"),G=Q(()=>Math.ceil(P/8));function D(H,ae){const Ce={hour:"2-digit",minute:"2-digit"};return H.toLocaleTimeString([],Ce)+" - "+ae.toLocaleTimeString([],Ce)}function I(H,ae){return!ae||!H?"0px":Math.max(2,H/ae*100)+"%"}function j(H){const ae=ue.value.findIndex(Ce=>Ce._time&&Ce._time.getTime()>=H.start.getTime()&&Ce._time.getTime()<H.end.getTime());if(ae>=0&&u.value){const Ce=u.value.querySelectorAll(".log-line");Ce[ae]&&(Ce[ae].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const ue=Q(()=>{let H=t.value;if(a.value&&(H=H.filter(ae=>(ae.level||"INFO")===a.value)),y.value){const ae=Ur.find(Ce=>Ce.value===y.value);if(ae&&ae.seconds){const Ce=new Date(Date.now()-ae.seconds*1e3);H=H.filter(Ke=>Ke._time&&Ke._time>=Ce)}}if(i.value&&!B.value)if(l.value)try{const ae=new RegExp(i.value,"i");H=H.filter(Ce=>{const Ke=Ce.text||Ce.raw||"",rt=Ce.tool||"";return ae.test(Ke)||ae.test(rt)})}catch{}else{const ae=i.value.toLowerCase();H=H.filter(Ce=>{const Ke=(Ce.text||Ce.raw||"").toLowerCase(),rt=(Ce.tool||"").toLowerCase();return Ke.includes(ae)||rt.includes(ae)})}return H});function fe(H){if(H.type==="log"&&H.line)try{const ae=typeof H.line=="string"?JSON.parse(H.line):H.line,Ce=ae.timestamp?new Date(ae.timestamp):new Date;return{ts:Ce.toLocaleTimeString(),_time:Ce,level:ae.error?"ERROR":"INFO",text:ae.tool_name?`[${ae.tool_name}] ${ae.result_summary||""}`.trim():ae.message||JSON.stringify(ae),tool:ae.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(H.line),tool:"",raw:String(H.line)}}if(H.payload){const ae=H.payload,Ce=ae.timestamp?new Date(ae.timestamp):new Date;return{ts:Ce.toLocaleTimeString(),_time:Ce,level:ae.error?"ERROR":"INFO",text:ae.tool_name?`[${ae.tool_name}] ${ae.result_summary||""}`.trim():ae.message||JSON.stringify(ae),tool:ae.tool_name||"",raw:null}}return typeof H=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:H,tool:"",raw:H}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(H),tool:"",raw:null}}function ne(H){const ae=fe(H);if(s.value){N.value.push(ae);return}me(ae)}function me(H){t.value.push(H),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Et(()=>ee())}function ee(){const H=u.value;if(H){const ae=H.scrollHeight-H.scrollTop-H.clientHeight;H.scrollTo({top:H.scrollHeight,behavior:ae<500?"smooth":"instant"})}}function pe(){n.value=!0,d.value=!1,Et(()=>ee())}function Ie(){const H=u.value;if(!H)return;const ae=H.scrollHeight-H.scrollTop-H.clientHeight<40;d.value=!ae&&t.value.length>0,!ae&&n.value&&(n.value=!1)}function V(){if(s.value=!s.value,!s.value&&N.value.length>0){for(const H of N.value)me(H);N.value=[]}}function te(){t.value=[],N.value=[],d.value=!1}function re(){let H;e.value==="search"?H=oe.value.map(rt=>{const Zt=rt.error?"ERROR":"INFO",it=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Zt} ${it}${rt.result_summary||rt.message||""}`}).join(`
`):H=ue.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const ae=new Blob([H],{type:"text/plain"}),Ce=URL.createObjectURL(ae),Ke=document.createElement("a");Ke.href=Ce,Ke.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ke.click(),URL.revokeObjectURL(Ce)}function de(H,ae){const Ce=`${H.ts} ${H.level} ${H.text||H.raw||""}`;navigator.clipboard.writeText(Ce).then(()=>{f.value=ae,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function he(H){a.value=a.value===H?"":H,E.value="all"}function Me(H){return H.level==="ERROR"?"log-line-error":H.level==="WARNING"?"log-line-warning":"text-gray-300"}function b(H){return H==="ERROR"?"text-red-500 font-semibold":H==="WARNING"?"text-yellow-500":"text-blue-500"}function C(H){return H==="ERROR"?"log-chip-error":H==="WARNING"?"log-chip-warning":"log-chip-info"}function M(H){E.value=H.id;const ae=H.filters;a.value=ae.level||"",y.value=ae.timeRange||"",i.value=ae.text||"",ae.levels&&(a.value=ae.levels[0]||""),ae.hasToolName&&(i.value="")}function W(H){E.value=H.id,a.value=H.filters.level||"",y.value=H.filters.timeRange||"",i.value=H.filters.text||""}function R(){if(!T.value.trim())return;const H={id:"custom-"+Date.now(),name:T.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};v.value=[...v.value,H],w(),x.value=!1,T.value=""}function F(H){v.value=v.value.filter(ae=>ae.id!==H),w(),E.value===H&&(E.value="all")}const Z=h("all"),X=h(""),se=h(""),J=h(""),ge=h(""),le=h(""),ce=h(100),ye=Nw,_e=h(!1),Te=h(!1),U=h(""),oe=h([]),xe=h(null),Pe=h(null);function Je(){e.value="search",xe.value||Ze()}async function Ze(){try{xe.value=await K.get("/api/logs/stats")}catch{}}function xt(){const H=le.value;if(!H){J.value="",ge.value="";return}const Ce={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[H];if(Ce){const Ke=new Date(Date.now()-Ce*1e3);J.value=et(Ke),ge.value=""}}function et(H){const ae=Ce=>String(Ce).padStart(2,"0");return`${H.getFullYear()}-${ae(H.getMonth()+1)}-${ae(H.getDate())}T${ae(H.getHours())}:${ae(H.getMinutes())}`}function Ye(H){if(!H)return"";const ae=new Date(H);return isNaN(ae.getTime())?"":ae.toISOString()}async function Ss(){_e.value=!0,U.value="",Te.value=!0,Pe.value=null;try{const H=new URLSearchParams;Z.value&&Z.value!=="all"&&H.set("level",Z.value),X.value&&H.set("tool",X.value),se.value&&H.set("q",se.value);const ae=Ye(J.value),Ce=Ye(ge.value);ae&&H.set("start",ae),Ce&&H.set("end",Ce),H.set("limit",String(ce.value));const Ke=await K.get(`/api/logs/search?${H.toString()}`);oe.value=Ke.entries||[]}catch(H){U.value=H.message||"Search failed",oe.value=[]}finally{_e.value=!1}}function Ms(){Z.value="all",X.value="",se.value="",J.value="",ge.value="",le.value="",ce.value=100,oe.value=[],Te.value=!1,U.value="",Pe.value=null}function Y(H){Pe.value=Pe.value===H?null:H}function Ne(H){if(!H.timestamp)return"";try{return new Date(H.timestamp).toLocaleString()}catch{return H.timestamp}}function Ps(H){return H.type==="web_action"?`${H.status||""} (${H.execution_time_ms||0}ms)`:(H.result_summary||"").slice(0,200)}function on(H){return H.error?"log-line-error":"text-gray-300"}function Zn(H){try{return JSON.stringify(H,null,2)}catch{return String(H)}}let Dt=null,vs=null,cn=!1;function Da(){cn||(cn=!0,Ge.subscribe("logs",ne),r.value=Ge.connected,o.value=Ge.state||"disconnected",Dt=Ge.onStateChange,vs=(H,ae)=>{o.value=H,r.value=H==="connected",Dt&&Dt(H,ae)},Ge.onStateChange=vs)}function Mi(){cn&&(cn=!1,Ge.unsubscribe("logs",ne),Ge.onStateChange===vs&&(Ge.onStateChange=Dt),vs=null,Dt=null)}return Ue(O),Bo(Da),Uo(Mi),ht(Mi),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:ue,pauseBuffer:N,showJumpBottom:d,copiedIndex:f,regexError:B,levels:g,logPresets:m,timeRanges:k,timeRange:y,activeLogPreset:E,customLogPresets:v,showSaveLogPreset:x,newLogPresetName:T,hasActiveLogFilters:A,timeRangeLabel:L,timelineBuckets:S,timelineMax:$,timelineSpanLabel:q,timelineLabelSkip:G,togglePause:V,clearLogs:te,exportLogs:re,logLineClass:Me,levelClass:b,levelChipClass:C,toggleLevel:he,copyLine:de,jumpToBottom:pe,onScroll:Ie,applyLogPreset:M,applyCustomLogPreset:W,saveLogCustomPreset:R,removeLogCustomPreset:F,segmentHeight:I,jumpToTimelineBucket:j,searchLevel:Z,searchTool:X,searchKeyword:se,searchStart:J,searchEnd:ge,searchTimePreset:le,searchLimit:ce,searchLimits:ye,searching:_e,searchRan:Te,searchError:U,searchResults:oe,searchStats:xe,expandedSearch:Pe,switchToSearch:Je,runSearch:Ss,clearSearchFilters:Ms,toggleSearchExpand:Y,formatSearchTs:Ne,searchEntryText:Ps,searchLogLineClass:on,formatJson:Zn,applySearchTimePreset:xt}}},Lw=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Dw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Mw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1–128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},Hr=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"database",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"server",sections:["tools"]},{key:"ui",label:"Web UI",icon:"globe",sections:["web"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"puzzle",sections:["issue_tracker"]}],mm="••••••••",Pw=50;function Fw(e){return Lw.has(e)}function $w(e){return e===mm}function Qi(e){return JSON.parse(JSON.stringify(e))}function Bn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Bw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Bn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Bn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function Uw(e,t,s){const n=Mw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Kd(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Bn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Bn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Hw={template:`
    <div class="p-6 page-fade-in">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 class="text-xl font-semibold">Configuration</h1>
          <p class="text-xs text-gray-500 mt-1" v-if="config">
            {{ sectionCount }} sections across {{ groupCount }} groups
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <template v-if="editing">
            <button @click="undo" class="btn btn-ghost text-xs cfg-undo-btn" :disabled="!canUndo" title="Undo (Ctrl+Z)">
              <odin-icon name="undo" :size="14" /> Undo
            </button>
            <button @click="redo" class="btn btn-ghost text-xs cfg-redo-btn" :disabled="!canRedo" title="Redo (Ctrl+Y)">
              <odin-icon name="redo" :size="14" /> Redo
            </button>
            <span class="cfg-change-count" v-if="changeCount > 0">
              {{ changeCount }} change{{ changeCount !== 1 ? 's' : '' }}
            </span>
            <button @click="cancelEdit" class="btn btn-ghost text-xs">Cancel</button>
            <button @click="showDiff" class="btn btn-ghost text-xs cfg-diff-btn" :disabled="!hasChanges">
              Review
            </button>
            <button @click="saveConfig" class="btn btn-primary text-xs" :disabled="saving || !hasChanges || hasErrors">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </template>
          <template v-else>
            <button @click="startEdit" class="btn btn-ghost text-xs" :disabled="!config">Edit</button>
            <button @click="fetchConfig" class="btn btn-ghost text-xs" :disabled="loading">
              {{ loading ? 'Loading...' : 'Refresh' }}
            </button>
          </template>
        </div>
      </div>

      <!-- Toast -->
      <div v-if="toast" :class="['toast', toast.type === 'success' ? 'toast-success' : 'toast-error']" role="status" aria-live="polite">
        {{ toast.message }}
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading && !config" class="space-y-3">
        <div v-for="n in 4" :key="n" class="hm-card">
          <div class="skeleton skeleton-text" style="width:100px;"></div>
          <div class="skeleton skeleton-row mt-2"></div>
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchConfig" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <!-- Grouped config sections -->
      <div v-else-if="config" class="space-y-4">
        <div v-for="group in visibleGroups" :key="group.key" class="cfg-group">
          <!-- Group header -->
          <div class="cfg-group-header cursor-pointer select-none" @click="toggleGroup(group.key)"
               role="button" tabindex="0" @keydown.enter="toggleGroup(group.key)" @keydown.space.prevent="toggleGroup(group.key)"
               :aria-expanded="!!expandedGroups[group.key]">
            <span class="cfg-group-icon" aria-hidden="true"><odin-icon :name="group.icon" :size="17" /></span>
            <span class="cfg-group-label">{{ group.label }}</span>
            <span class="badge badge-info text-xs">{{ group.sections.length }}</span>
            <span v-if="editing && groupChanged(group)" class="badge badge-warning text-xs">modified</span>
            <span class="cfg-group-arrow" aria-hidden="true"><odin-icon :name="expandedGroups[group.key] ? 'chevronUp' : 'chevronDown'" :size="14" /></span>
          </div>

          <!-- Group content -->
          <div v-if="expandedGroups[group.key]" class="cfg-group-body">
            <div v-for="section in group.sections" :key="section" class="cfg-section">
              <!-- Section header -->
              <div class="cfg-section-header cursor-pointer select-none" role="button" tabindex="0"
                     :aria-expanded="expanded[section]" @click="toggleSection(section)"
                     @keydown.enter="toggleSection(section)" @keydown.space.prevent="toggleSection(section)">
                <span class="text-xs text-gray-500" aria-hidden="true"><odin-icon :name="expanded[section] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                <span class="cfg-section-name">{{ section }}</span>
                <span class="badge badge-info text-xs"
                      v-if="typeof getDisplay(section) === 'object' && getDisplay(section) !== null && !Array.isArray(getDisplay(section))">
                  {{ Object.keys(getDisplay(section)).length }} fields
                </span>
                <span v-if="editing && sectionChanged(section)" class="badge badge-warning text-xs">modified</span>
              </div>

              <div v-if="expanded[section]" class="cfg-section-body">
                <!-- Scalar top-level field (e.g. timezone) -->
                <div v-if="typeof getDisplay(section) !== 'object' || getDisplay(section) === null" class="pl-4">
                  <template v-if="editing">
                    <input class="hm-input font-mono text-sm" style="max-width:300px"
                           :value="getEdited(section)"
                           @input="pushEdit(section, null, $event.target.value)" />
                  </template>
                  <template v-else>
                    <span class="text-sm font-mono text-gray-300">{{ getDisplay(section) === '' ? '(empty)' : getDisplay(section) }}</span>
                  </template>
                </div>

                <!-- Object section -->
                <div v-else-if="!Array.isArray(getDisplay(section))">
                  <table class="hm-table">
                    <thead>
                      <tr>
                        <th class="config-key-col" style="width:30%">Key</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(v, k) in getDisplay(section)" :key="k"
                          :class="{'field-changed': editing && fieldChanged(section, k)}">
                        <td class="font-mono text-xs text-gray-400">
                          {{ k }}
                          <div v-if="getValidationError(section, k)" class="cfg-field-error">
                            {{ getValidationError(section, k) }}
                          </div>
                        </td>
                        <td>
                          <!-- Sensitive field: always masked -->
                          <template v-if="isSensitiveKey(k) || isRedacted(v)">
                            <span class="text-gray-500 font-mono text-xs flex items-center gap-2">
                              {{ REDACTED }}
                              <span class="badge badge-warning text-xs">sensitive</span>
                            </span>
                          </template>

                          <!-- Boolean: toggle switch -->
                          <template v-else-if="typeof v === 'boolean'">
                            <div class="flex items-center gap-2">
                              <label class="toggle-switch" v-if="editing">
                                <input type="checkbox" :checked="getEditedField(section, k)"
                                       @change="pushEdit(section, k, $event.target.checked)" />
                                <span class="toggle-slider"></span>
                              </label>
                              <span :class="getDisplayBool(section, k) ? 'text-green-400' : 'text-red-400'"
                                    class="text-sm font-mono">
                                {{ getDisplayBool(section, k) }}
                              </span>
                            </div>
                          </template>

                          <!-- Enum field: dropdown -->
                          <template v-else-if="editing && getEnumOptions(section, k)">
                            <select class="hm-select"
                                    :value="getEditedField(section, k)"
                                    @change="pushEdit(section, k, $event.target.value)">
                              <option v-for="opt in getEnumOptions(section, k)" :key="opt" :value="opt">{{ opt }}</option>
                            </select>
                          </template>

                          <!-- Number field -->
                          <template v-else-if="typeof v === 'number'">
                            <template v-if="editing">
                              <input type="number"
                                     :class="['hm-input font-mono text-sm', getValidationError(section, k) ? 'cfg-input-error' : '']"
                                     style="max-width:200px"
                                     :value="getEditedField(section, k)"
                                     @input="pushEdit(section, k, Number($event.target.value))" />
                            </template>
                            <template v-else>
                              <span class="text-sm font-mono text-gray-300">{{ v }}</span>
                            </template>
                          </template>

                          <!-- Array field: tags -->
                          <template v-else-if="Array.isArray(v)">
                            <div class="flex flex-wrap gap-1 items-center">
                              <template v-if="editing">
                                <span v-for="(item, i) in getEditedField(section, k)" :key="i" class="config-tag">
                                  {{ typeof item === 'object' ? JSON.stringify(item) : item }}
                                  <button @click="removeArrayItem(section, k, i)">&times;</button>
                                </span>
                                <button class="btn btn-ghost text-xs" @click="addArrayItem(section, k)">+ Add</button>
                              </template>
                              <template v-else>
                                <template v-if="v.length === 0">
                                  <span class="text-gray-500 text-sm">(empty list)</span>
                                </template>
                                <span v-else v-for="(item, i) in v" :key="i" class="config-tag">
                                  {{ typeof item === 'object' ? JSON.stringify(item) : item }}
                                </span>
                              </template>
                            </div>
                          </template>

                          <!-- Nested object: expandable JSON -->
                          <template v-else-if="typeof v === 'object' && v !== null">
                            <div>
                              <button @click="toggleNested(section + '.' + k)" class="btn btn-ghost text-xs">
                                {{ expandedNested[section + '.' + k] ? 'Collapse' : 'Expand' }}
                                ({{ Object.keys(v).length }} fields)
                              </button>
                              <div v-if="expandedNested[section + '.' + k]" class="mt-2">
                                <template v-if="editing">
                                  <textarea class="hm-input font-mono text-xs" rows="6"
                                            :value="formatJson(getEditedField(section, k))"
                                            @blur="pushEditJson(section, k, $event.target.value)"></textarea>
                                  <p class="text-xs text-gray-500 mt-1">Edit as JSON</p>
                                </template>
                                <pre v-else
                                     class="p-2 rounded bg-gray-900 text-xs text-gray-300 overflow-x-auto font-mono">{{ formatJson(v) }}</pre>
                              </div>
                            </div>
                          </template>

                          <!-- String field: text input -->
                          <template v-else>
                            <template v-if="editing">
                              <input class="hm-input font-mono text-sm"
                                     :value="getEditedField(section, k)"
                                     @input="pushEdit(section, k, $event.target.value)" />
                            </template>
                            <template v-else>
                              <span class="text-sm font-mono text-gray-300">{{ v === '' ? '(empty)' : v }}</span>
                            </template>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Array top-level section -->
                <div v-else>
                  <div v-if="getDisplay(section).length === 0" class="text-gray-500 text-sm pl-4">(empty list)</div>
                  <ul v-else class="pl-4 space-y-1">
                    <li v-for="(item, i) in getDisplay(section)" :key="i" class="text-sm font-mono text-gray-300">
                      {{ typeof item === 'object' ? JSON.stringify(item) : item }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Ungrouped sections (fallback) -->
        <div v-for="section in ungroupedSections" :key="section" class="hm-card">
          <div class="cfg-section-header cursor-pointer select-none" role="button" tabindex="0"
                     :aria-expanded="expanded[section]" @click="toggleSection(section)"
                     @keydown.enter="toggleSection(section)" @keydown.space.prevent="toggleSection(section)">
            <span class="text-xs text-gray-500" aria-hidden="true"><odin-icon :name="expanded[section] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
            <span class="cfg-section-name">{{ section }}</span>
          </div>
          <div v-if="expanded[section]" class="pl-4 mt-2">
            <pre class="text-xs font-mono text-gray-300">{{ formatJson(getDisplay(section)) }}</pre>
          </div>
        </div>

        <div class="mt-4 text-xs text-gray-500">
          Fields marked <span class="badge badge-warning">sensitive</span> are redacted by the server and cannot be edited here.
        </div>
      </div>

      <!-- Diff modal -->
      <div v-if="showDiffModal" class="modal-overlay" v-modal-focus @click.self="showDiffModal = false" @keyup.escape="showDiffModal = false" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="cfg-diff-title">
        <div class="modal-content" style="max-width:700px">
          <div class="flex items-center justify-between mb-4">
            <h2 id="cfg-diff-title" class="text-lg font-semibold">Review Changes</h2>
            <button @click="showDiffModal = false" class="icon-btn" aria-label="Close review"><odin-icon name="close" :size="17" /></button>
          </div>
          <div v-if="diffEntries.length === 0" class="text-gray-500 text-sm py-4 text-center">No changes to review.</div>
          <div v-else class="cfg-diff-list">
            <div v-for="(entry, i) in diffEntries" :key="i" class="cfg-diff-entry">
              <div class="cfg-diff-path">
                <span class="font-mono text-xs">{{ entry.section }}</span>
                <span v-if="entry.key" class="font-mono text-xs text-gray-500">{{ '.' + entry.key }}</span>
              </div>
              <div class="cfg-diff-values">
                <div class="cfg-diff-old">
                  <span class="cfg-diff-label">−</span>
                  <span class="font-mono text-xs">{{ formatDiffVal(entry.oldVal) }}</span>
                </div>
                <div class="cfg-diff-new">
                  <span class="cfg-diff-label">+</span>
                  <span class="font-mono text-xs">{{ formatDiffVal(entry.newVal) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button @click="showDiffModal = false" class="btn btn-ghost text-xs">Close</button>
            <button @click="showDiffModal = false; saveConfig()" class="btn btn-primary text-xs" :disabled="hasErrors">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=Q(()=>d.value.length>0),g=Q(()=>f.value.length>0),m=Q(()=>r.value&&t.value?t.value:e.value),k=Q(()=>!e.value||!t.value?!1:!Bn(e.value,t.value)),E=Q(()=>!e.value||!t.value?0:Kd(e.value,t.value).length),y=Q(()=>{if(!r.value||!t.value)return{};const R={};for(const F of Object.keys(t.value)){const Z=t.value[F];if(typeof Z=="object"&&Z!==null&&!Array.isArray(Z))for(const X of Object.keys(Z)){const se=Uw(F,X,Z[X]);se&&(R[F+"."+X]=se)}}return R}),v=Q(()=>Object.keys(y.value).length>0),x=Q(()=>e.value?Object.keys(e.value).length:0),T=Q(()=>O.value.length),N=Q(()=>!e.value||!t.value?[]:Kd(e.value,t.value)),O=Q(()=>e.value?Hr.map(R=>({...R,sections:R.sections.filter(F=>F in e.value)})).filter(R=>R.sections.length>0):[]),w=Q(()=>{if(!e.value)return[];const R=new Set(Hr.flatMap(F=>F.sections));return Object.keys(e.value).filter(F=>!R.has(F))});function A(R){return m.value?m.value[R]:null}function L(R){return!e.value||!t.value?!1:!Bn(e.value[R],t.value[R])}function B(R){return R.sections.some(F=>L(F))}function P(R,F){if(!e.value||!t.value)return!1;const Z=e.value[R],X=t.value[R];return!Z||!X?!1:!Bn(Z[F],X[F])}function S(R){return t.value?t.value[R]:e.value[R]}function $(R,F){const Z=t.value||e.value;return Z[R]?Z[R][F]:void 0}function q(R,F){const Z=r.value&&t.value?t.value:e.value;return Z[R]?Z[R][F]:!1}function G(R,F){return y.value[R+"."+F]||null}function D(R,F){return Dw[R+"."+F]||null}function I(R,F,Z){t.value&&(F===null?t.value[R]=Z:(t.value[R]||(t.value[R]={}),t.value[R][F]=Z),t.value={...t.value})}function j(R,F,Z){if(!t.value)return;const X=Qi(t.value);I(R,F,Z),d.value.push(X),d.value.length>Pw&&d.value.shift(),f.value=[]}function ue(R,F,Z){try{const X=JSON.parse(Z);j(R,F,X)}catch{}}function fe(){d.value.length!==0&&(f.value.push(Qi(t.value)),t.value=d.value.pop())}function ne(){f.value.length!==0&&(d.value.push(Qi(t.value)),t.value=f.value.pop())}function me(R,F,Z){if(!t.value||!t.value[R])return;const X=[...t.value[R][F]];X.splice(Z,1),j(R,F,X)}function ee(R,F){if(!t.value||!t.value[R])return;const Z=[...t.value[R][F]||[]],X=prompt("Enter new value:");X!==null&&(Z.push(X),j(R,F,Z))}function pe(R){a.value={...a.value,[R]:!a.value[R]}}function Ie(R){l.value={...l.value,[R]:!l.value[R]}}function V(R){i.value={...i.value,[R]:!i.value[R]}}function te(R){try{return JSON.stringify(R,null,2)}catch{return String(R)}}function re(R){return R==null?"null":typeof R=="object"?JSON.stringify(R,null,2):String(R)}function de(R,F){c.value={type:R,message:F},setTimeout(()=>{c.value=null},3e3)}function he(){t.value=Qi(e.value),r.value=!0,d.value=[],f.value=[]}function Me(){r.value=!1,t.value=null,d.value=[],f.value=[]}function b(){u.value=!0}async function C(){if(!(!k.value||v.value)){o.value=!0;try{const R=Bw(e.value,t.value);if(Object.keys(R).length===0){de("success","No changes to save."),o.value=!1;return}const F=await K.put("/api/config",R);e.value=F,r.value=!1,t.value=null,d.value=[],f.value=[],de("success","Config saved successfully.")}catch(R){de("error",R.message||"Failed to save config")}o.value=!1}}async function M(){s.value=!0,n.value=null;try{e.value=await K.get("/api/config");for(const R of Object.keys(e.value))a.value[R]===void 0&&(a.value[R]=!0);for(const R of Hr)l.value[R.key]===void 0&&(l.value[R.key]=!0)}catch(R){n.value=R.message}s.value=!1}function W(R){if(!r.value)return;const F=R.target;F instanceof HTMLElement&&(F.matches("input, textarea, select")||F.isContentEditable)||((R.ctrlKey||R.metaKey)&&!R.shiftKey&&R.key.toLowerCase()==="z"?(R.preventDefault(),fe()):(R.ctrlKey||R.metaKey)&&(R.key==="y"||R.shiftKey&&R.key==="z"||R.shiftKey&&R.key==="Z")&&(R.preventDefault(),ne()))}return Ue(()=>{M(),document.addEventListener("keydown",W)}),ht(()=>{document.removeEventListener("keydown",W)}),{config:e,displayConfig:m,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:k,hasErrors:v,changeCount:E,REDACTED:mm,showDiffModal:u,diffEntries:N,canUndo:p,canRedo:g,sectionCount:x,groupCount:T,visibleGroups:O,ungroupedSections:w,validationErrors:y,isSensitiveKey:Fw,isRedacted:$w,sectionChanged:L,groupChanged:B,fieldChanged:P,getDisplay:A,getEdited:S,getEditedField:$,getDisplayBool:q,pushEdit:j,pushEditJson:ue,getValidationError:G,getEnumOptions:D,removeArrayItem:me,addArrayItem:ee,toggleSection:pe,toggleGroup:Ie,toggleNested:V,formatJson:te,formatDiffVal:re,showToast:de,showDiff:b,fetchConfig:M,startEdit:he,cancelEdit:Me,saveConfig:C,undo:fe,redo:ne}}},Vw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await K.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,g,m){try{await K.put("/api/discord/guild/"+p+"/config",{[g]:m}),await c()}catch(k){s.value=k.message}}async function d(p,g,m,k){try{await K.put("/api/discord/channel/"+p+"/config",{[m]:k}),await c()}catch(E){s.value=E.message}}async function f(p,g){try{await K.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(m){s.value=m.message}}return Ue(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},jw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=Q(()=>{const I={};for(const j of u.value)I[j.id]=j;return I});function p(I){return f.value[I]||null}const g=Q(()=>/^\d{15,25}$/.test(r.value.trim())),m=Q(()=>{if(o.value){if(k.value[c.value])return"host-user-option-"+c.value;if(g.value)return"host-user-option-raw"}}),k=Q(()=>{const I=r.value.toLowerCase().trim();return I?u.value.filter(j=>!i.value[j.id]&&(j.display_name.toLowerCase().includes(I)||j.username.toLowerCase().includes(I)||j.id.includes(I))):u.value.filter(j=>!i.value[j.id])});function E(I,j){return I?I.allowed_hosts===null||I.allowed_hosts===void 0?{allowed_hosts:[...j],default_host:I.default_host||"",allow_all:!0}:{allowed_hosts:I.allowed_hosts,default_host:I.default_host||"",allow_all:!1}:{allowed_hosts:[...j],default_host:j[0]||"",allow_all:!0}}async function y(){e.value=!0,t.value="";try{const I=await K.get("/api/host-access");s.value=I,n.value=I.available_hosts||[],a.value=E(I.default_policy,n.value);const j=I.users||{},ue={};for(const[fe,ne]of Object.entries(j))ue[fe]=E(ne,n.value);i.value=ue}catch(I){t.value=I.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await K.get("/api/discord/members")||[]}catch{u.value=[]}}async function v(){try{const I=a.value.allow_all?null:a.value.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:I,default_host:a.value.default_host}),ke.success("Default policy updated")}catch(I){ke.error(I.message||"Failed to save")}}function x(I,j){a.value.allow_all=!1,j?a.value.allowed_hosts.includes(I)||a.value.allowed_hosts.push(I):(a.value.allowed_hosts=a.value.allowed_hosts.filter(ue=>ue!==I),a.value.default_host===I&&(a.value.default_host=a.value.allowed_hosts[0]||"")),v()}async function T(I){const j=i.value[I];if(j)try{const ue=j.allow_all?null:j.allowed_hosts;await K.put(`/api/host-access/user/${I}`,{allowed_hosts:ue,default_host:j.default_host});const fe=p(I);ke.success(`Updated access for ${fe?fe.display_name:I}`)}catch(ue){ke.error(ue.message||"Failed to save")}}function N(I,j,ue){const fe=i.value[I];fe&&(fe.allow_all=!1,ue?fe.allowed_hosts.includes(j)||fe.allowed_hosts.push(j):(fe.allowed_hosts=fe.allowed_hosts.filter(ne=>ne!==j),fe.default_host===j&&(fe.default_host=fe.allowed_hosts[0]||"")),T(I))}function O(I,j){const ue=i.value[I];ue&&(ue.default_host=j,T(I))}function w(){l.value=!0,r.value="",c.value=0,Et(()=>{d.value&&d.value.focus()})}function A(){o.value=!0,c.value=0}function L(){c.value<k.value.length-1&&c.value++}function B(){c.value>0&&c.value--}function P(){const I=k.value[c.value];if(I){$(I);return}g.value&&S()}function S(){const I=r.value.trim();/^\d{15,25}$/.test(I)&&(i.value[I]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},T(I),r.value="",o.value=!1,l.value=!1)}function $(I){i.value[I.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},T(I.id),r.value="",o.value=!1,l.value=!1}function q(){o.value=!1}function G(){setTimeout(()=>{o.value=!1},150)}async function D(I){const j=p(I);if(await ls({title:"Remove user override",message:`Remove the host access override for ${j?j.display_name:I}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await K.del(`/api/host-access/user/${I}`),delete i.value[I],ke.success(`Removed override for ${j?j.display_name:I}`)}catch(fe){ke.error(fe.message||"Failed to delete")}}return Ue(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:k,isRawId:g,activeOptionId:m,searchInput:d,fetchData:y,saveDefaultPolicy:v,toggleDefaultHost:x,getMember:p,toggleUserHost:N,setUserDefault:O,openAddUser:w,deleteUser:D,onSearchInput:A,highlightNext:L,highlightPrev:B,selectHighlighted:P,selectMember:$,closeDropdown:q,onBlur:G,addRawId:S}}},zw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=Q(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=Q(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(w){return w==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":w==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function g(){e.value=!0,t.value="";try{const w=await K.get("/api/tokens");s.value=w.tokens||[],n.value=w.available_hosts||[]}catch(w){t.value=w.message||"Failed to load tokens"}finally{e.value=!1}}function m(w){return!w||!w.trim()?[]:w.split(",").map(A=>A.trim()).filter(Boolean)}function k(w,A){const L=c.value.allowed_hosts;if(A&&!L.includes(w)&&L.push(w),!A){const B=L.indexOf(w);B>=0&&L.splice(B,1)}}function E(w,A){const L=u.value.allowed_hosts;if(A&&!L.includes(w)&&L.push(w),!A){const B=L.indexOf(w);B>=0&&L.splice(B,1)}}async function y(){var w;i.value=!0;try{const A=m(c.value.allowed_tools_str),L=c.value.host_mode,B=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:A.length?A:[]};B!==null&&(P.allowed_hosts=B),P.default_host=c.value.default_host||"";const S=await K.post("/api/tokens",P);l.value=S.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,ke.success("Token created"),await g()}catch(A){ke.error(((w=A.data)==null?void 0:w.error)||A.message||"Failed to create token")}finally{i.value=!1}}function v(w){r.value=w;const A=w.allowed_hosts;let L="default";A==null?L="default":Array.isArray(A)&&A.length===0?L="none":Array.isArray(A)&&(L="select"),u.value={username:w.username||"",tier:w.tier||"admin",label:w.label||"",host_mode:L,allowed_hosts:Array.isArray(A)?[...A]:[],default_host:w.default_host||"",allowed_tools_str:(w.allowed_tools||[]).join(", ")}}async function x(){var w;if(r.value){o.value=!0;try{const A=m(u.value.allowed_tools_str),L=u.value.host_mode,B={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:A};L==="none"?B.allowed_hosts=[]:L==="select"?B.allowed_hosts=u.value.allowed_hosts:B.allowed_hosts=null,B.default_host=u.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(r.value.user_id),B),r.value=null,ke.success("Token updated"),await g()}catch(A){ke.error(((w=A.data)==null?void 0:w.error)||A.message||"Failed to update")}finally{o.value=!1}}}async function T(w){var L;if(await ls({title:"Regenerate token",message:`Regenerate token for ${w.username||w.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await K.post("/api/tokens/"+encodeURIComponent(w.user_id)+"/regenerate");l.value=B.token,ke.success("Token regenerated")}catch(B){ke.error(((L=B.data)==null?void 0:L.error)||B.message||"Failed to regenerate")}}async function N(w){var L;if(await ls({title:"Delete token",message:`Delete token for ${w.username||w.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(w.user_id)),ke.success("Token deleted"),await g()}catch(B){ke.error(((L=B.data)==null?void 0:L.error)||B.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),ke.success("Copied to clipboard")}catch{ke.error("Copy failed — select and copy manually")}}return Ue(g),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:g,tierBadge:p,toggleCreateHost:k,toggleEditHost:E,createToken:y,startEdit:v,saveEdit:x,confirmRegenerate:T,confirmDelete:N,copyToken:O}}};function Xi(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Kw={template:`
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
                <option v-for="m in codexModelOptions" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Model
              <select v-model="codexForm.agent_model" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat model</option>
                <option v-for="m in codexAgentModelOptions" :key="m" :value="m">{{ m }}</option>
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
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Reasoning
              <select v-model="codexForm.agent_reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat setting</option>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
              </select>
              </label>
            </div>
            <div class="sm:col-span-2">
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="codexForm.max_tokens" type="number" @keydown.enter="saveCodexConfigNow"
                     class="hm-input" style="max-width: 240px" />
              </label>
            </div>
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

        <!-- ==================== Auxiliary (cheap-model) Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Auxiliary Model (Codex)</h2>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="auxForm.enabled" @change="saveAuxConfigDebounced" class="provider-control" />
              <span class="text-xs text-gray-400">Enabled</span>
            </label>
          </div>
          <p class="text-xs text-gray-500 mb-3">
            A cheaper Codex model for selected background jobs (routes with automatic fallback to the primary). Only jobs with a live consumer can be delegated.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="auxForm.model" @change="saveAuxConfigDebounced" class="hm-input">
                <option v-for="m in auxModelOptions" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-400 mb-2">Delegated tasks</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <label v-for="t in auxKnownTasks" :key="t"
                     class="flex items-center gap-2"
                     :class="auxConsumerBacked.includes(t) ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'">
                <input type="checkbox" :value="t" v-model="auxForm.tasks"
                       :disabled="!auxConsumerBacked.includes(t)"
                       @change="saveAuxConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-300">{{ t }}</span>
                <span v-if="!auxConsumerBacked.includes(t)" class="text-xs text-gray-500">— No consumer yet</span>
              </label>
            </div>
          </div>
          <div v-if="auxData.unavailable_reason"
               class="text-sm text-yellow-400 bg-yellow-900/20 rounded p-2 border border-yellow-800 mt-3">
            {{ auxData.unavailable_reason }}
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=Q(()=>{const Y=n.value.model;return Y&&!a.includes(Y)?[Y,...a]:a}),l=Q(()=>{const Y=n.value.agent_model;return Y&&!a.includes(Y)?[Y,...a]:a}),r=h({enabled:!1,model:"gpt-5.6-luna",tasks:[]}),o=h({known_tasks:[],consumer_backed_tasks:[],unavailable_reason:null}),c=Q(()=>o.value.known_tasks||[]),u=Q(()=>o.value.consumer_backed_tasks||[]),d=Q(()=>{const Y=r.value.model;return Y&&!a.includes(Y)?[Y,...a]:a}),f=h(!1),p=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),g=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),m=h(!1),k=h(!1),E=h(!1),y=h(!1),v=h(!1),x=h(!1),T=h(!1),N=h({configured:!1}),O=h([]),w=h(""),A=h(!1),L=h(!1),B=h({configured:!1}),P=h([]),S=h(""),$=h(!1),q=h(!1),G=h(!0),D=h(""),I=h({configured:!1,accounts:[]}),j=h(null),ue=h(null),fe=h(""),ne=h(null),me=h(!1),ee=h(null),pe=h(null),Ie=h("");let V=null;function te(Y,Ne="success"){ke(Y,Ne==="error"?"error":"success")}function re(Y){if(!Y)return"?";const Ne=Y/(1024*1024*1024);return Ne>=1?Ne.toFixed(1)+" GB":(Y/(1024*1024)).toFixed(0)+" MB"}async function de(){e.value=!0,await Promise.all([he(),Me(),F(),b()]),e.value=!1}async function he(){try{const Y=await K.get("/api/llm/status");t.value=Y,s.value=Y.active_provider||"codex",Y.codex&&!ce.pending()&&(n.value.enabled=Y.codex.enabled,n.value.model=Y.codex.model||"gpt-5.5",n.value.reasoning_effort=Y.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Y.codex.agent_reasoning_effort||"",n.value.agent_model=Y.codex.agent_model||"",n.value.max_tokens=Y.codex.max_tokens||4096),Y.ollama&&!_e.pending()&&(p.value.enabled=Y.ollama.enabled,p.value.base_url=Y.ollama.base_url||"",p.value.model=Y.ollama.model||"",p.value.max_tokens=Y.ollama.max_tokens||4096),Y.kimi&&!Te.pending()&&(g.value.enabled=Y.kimi.enabled,g.value.model=Y.kimi.model||"",g.value.max_tokens=Y.kimi.max_tokens||4096),Y.auxiliary&&(o.value=Y.auxiliary,ye.pending()||(r.value.enabled=Y.auxiliary.enabled,r.value.model=Y.auxiliary.model||"gpt-5.6-luna",r.value.tasks=[...Y.auxiliary.tasks||[]]))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Me(){try{if(N.value=await K.get("/api/ollama/status"),N.value.model&&(w.value=N.value.model),N.value.configured)try{const Y=await K.get("/api/ollama/models");O.value=Y.models||[]}catch{O.value=[]}else if(p.value.base_url)try{const Y=await K.post("/api/ollama/probe-models",{base_url:p.value.base_url});O.value=Y.models||[]}catch{O.value=[]}}catch{N.value={configured:!1}}}async function b(){G.value=!0,D.value="";try{I.value=await K.get("/api/codex/status")}catch(Y){D.value=Y.message||"Failed to fetch Codex status"}finally{G.value=!1}}async function C(){const Y=t.value?t.value.active_provider:"codex";T.value=!0;try{const Ne=await K.post("/api/llm/switch",{provider:s.value});Ne.error?(s.value=Y,te(Ne.error,"error")):(te("Switched to "+s.value+" ("+Ne.model+")"),await de())}catch(Ne){s.value=Y,te(Ne.message||"Switch failed","error")}finally{T.value=!1}}async function M(){A.value=!0;try{const Y=await K.post("/api/ollama/reload");te(Y.configured?"Ollama reloaded":Y.reason||"Ollama not configured",Y.configured?"success":"error"),await de()}catch(Y){te(Y.message||"Reload failed","error")}finally{A.value=!1}}async function W(){L.value=!0;try{await K.post("/api/ollama/model",{model:w.value}),te("Model set to "+w.value),await de()}catch(Y){te(Y.message||"Failed","error")}finally{L.value=!1}}async function R(){const Y=p.value.base_url;if(!Y){te("Enter a base URL first","error");return}x.value=!0;try{const Ne=await K.post("/api/ollama/probe-models",{base_url:Y});O.value=Ne.models||[],O.value.length?(te(O.value.length+" model(s) found"),!p.value.model&&O.value.length&&(p.value.model=O.value[0].name)):te("No models found at "+Y,"error")}catch(Ne){te(Ne.message||"Could not reach Ollama","error")}finally{x.value=!1}}async function F(){try{if(B.value=await K.get("/api/kimi/status"),B.value.model&&(S.value=B.value.model),B.value.configured)try{const Y=await K.get("/api/kimi/models");P.value=Y.models||[]}catch{P.value=[]}}catch{B.value={configured:!1}}}async function Z(){$.value=!0;try{const Y=await K.post("/api/kimi/reload");te(Y.configured?"Kimi reloaded":Y.reason||"Kimi not configured",Y.configured?"success":"error"),await de()}catch(Y){te(Y.message||"Reload failed","error")}finally{$.value=!1}}async function X(){q.value=!0;try{await K.post("/api/kimi/model",{model:S.value}),te("Model set to "+S.value),await de()}catch(Y){te(Y.message||"Failed","error")}finally{q.value=!1}}async function se(){if(E.value){ce();return}E.value=!0;try{await K.put("/api/llm/codex/config",n.value),te("Codex config saved"),await Promise.all([he(),b()])}catch(Y){te(Y.message||"Failed","error"),await Promise.all([he(),b()])}finally{E.value=!1}}async function J(){if(y.value){_e();return}y.value=!0;try{const Y={...p.value},Ne=m.value?p.value.api_key:null;Ne===null&&delete Y.api_key,await K.put("/api/llm/ollama/config",Y),te("Ollama config saved"),Ne!==null&&p.value.api_key===Ne&&(p.value.api_key="",m.value=!1),await Promise.all([he(),Me()])}catch(Y){te(Y.message||"Failed","error")}finally{y.value=!1}}async function ge(){if(v.value){Te();return}v.value=!0;try{const Y={...g.value},Ne=k.value?g.value.api_key:null;Ne===null&&delete Y.api_key,await K.put("/api/llm/kimi/config",Y),te("Kimi config saved"),Ne!==null&&g.value.api_key===Ne&&(g.value.api_key="",k.value=!1),await Promise.all([he(),F()])}catch(Y){te(Y.message||"Failed","error")}finally{v.value=!1}}async function le(){if(f.value){ye();return}f.value=!0;try{await K.put("/api/llm/auxiliary/config",r.value),te("Auxiliary config saved"),await he()}catch(Y){te(Y.message||"Failed","error"),await he()}finally{f.value=!1}}const ce=Xi(se),ye=Xi(le),_e=Xi(J),Te=Xi(ge),U=()=>(ce.cancel(),se()),oe=()=>(_e.cancel(),J()),xe=()=>(Te.cancel(),ge());async function Pe(Y){try{await K.post("/api/codex/account/"+Y+"/activate"),te("Active account switched"),await b()}catch(Ne){te(Ne.message||"Failed","error")}}async function Je(Y){j.value=Y;try{await K.post("/api/codex/account/"+Y+"/refresh"),te("Token refreshed"),await b()}catch(Ne){te(Ne.message||"Refresh failed","error")}finally{j.value=null}}function Ze(Y,Ne){ue.value=Y,fe.value=Ne||""}async function xt(Y){try{await K.put("/api/codex/account/"+Y+"/label",{label:fe.value}),te("Label updated"),ue.value=null,await b()}catch(Ne){te(Ne.message||"Failed","error")}}async function et(Y,Ne){if(await ls({title:"Delete Codex account",message:`Delete ${Ne||"account #"+(Y+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+Y),te("Deleted. Pool reloaded."),await b()}catch(on){te(on.message||"Failed","error")}}async function Ye(){me.value=!0;try{const Y=await K.post("/api/codex/device-code");ee.value=Y,ne.value="pending",Ss(Y)}catch(Y){te(Y.message||"Failed","error")}finally{me.value=!1}}async function Ss(Y){V={cancelled:!1};const Ne=V;try{const Ps=await K.post("/api/codex/device-poll",{device_auth_id:Y.device_auth_id,user_code:Y.user_code,interval:Y.interval});if(Ne.cancelled)return;pe.value=Ps,ne.value="success",await de()}catch(Ps){if(Ne.cancelled)return;Ie.value=Ps.message||"Device login failed",ne.value="error"}}function Ms(){V&&(V.cancelled=!0),ne.value=null,ee.value=null}return Ue(de),ht(()=>{V&&(V.cancelled=!0),ce.cancel(),ye.cancel(),_e.cancel(),Te.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:T,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,auxForm:r,auxData:o,auxKnownTasks:c,auxConsumerBacked:u,auxModelOptions:d,savingAux:f,saveAuxConfigDebounced:ye,ollamaForm:p,kimiForm:g,savingCodex:E,savingOllama:y,savingKimi:v,probingOllama:x,ollamaKeyDirty:m,kimiKeyDirty:k,ollamaStatus:N,ollamaModels:O,ollamaSelectedModel:w,reloading:A,settingModel:L,kimiStatus:B,kimiModels:P,kimiSelectedModel:S,reloadingKimi:$,settingKimiModel:q,codexLoading:G,codexError:D,codexData:I,refreshing:j,editingLabel:ue,labelValue:fe,deviceState:ne,deviceLoading:me,deviceInfo:ee,deviceResult:pe,deviceError:Ie,fetchAll:de,switchProvider:C,reloadOllama:M,setOllamaModel:W,reloadKimi:Z,setKimiModel:X,probeOllamaModels:R,saveCodexConfig:se,saveOllamaConfig:J,saveKimiConfig:ge,saveCodexConfigDebounced:ce,saveOllamaConfigDebounced:_e,saveKimiConfigDebounced:Te,saveCodexConfigNow:U,saveOllamaConfigNow:oe,saveKimiConfigNow:xe,activateAccount:Pe,refreshAccount:Je,startEditLabel:Ze,saveLabel:xt,deleteAccount:et,startDeviceLogin:Ye,cancelDeviceLogin:Ms,formatSize:re}}},qd={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function qw(e){return qd[e]||qd[(e||"").toLowerCase()]||"text-gray-400"}const Gw={template:`
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

          <!-- Model Routing -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Model Routing</h3>
            <div v-if="routingStats" class="text-xs text-gray-400 space-y-1">
              <div>Total routed: {{ routingStats.total || 0 }}</div>
              <div>Cheap model: {{ routingStats.cheap || 0 }}</div>
              <div>Strong model: {{ routingStats.strong || 0 }}</div>
            </div>
            <p v-else class="text-xs text-gray-500">Routing disabled or no data</p>
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),u=h(null);let d=null;async function f(){const p=await Promise.allSettled([K.get("/api/startup/diagnostics"),K.get("/api/subsystems/status"),K.get("/api/pools/ssh"),K.get("/api/pools/http"),K.get("/api/risk/stats"),K.get("/api/recovery/stats"),K.get("/api/compression/stats"),K.get("/api/routing/stats"),K.get("/api/freshness/stats"),K.get("/api/governor/stats")]),g=k=>p[k].status==="fulfilled"?p[k].value:null;t.value=g(0)||{};const m=g(1);s.value=Array.isArray(m)?m:m&&m.subsystems||[],n.value=g(2)||{},a.value=g(3)||{},i.value=g(4),l.value=g(5),r.value=g(6),o.value=g(7),c.value=g(8),u.value=g(9),e.value=!1}return Ue(()=>{f(),d=setInterval(f,3e4)}),ht(()=>{d&&clearInterval(d)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,routingStats:o,freshnessStats:c,governorStats:u,statusColor:qw,formatTime:Cc}}},Ww={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await K.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await ls({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return Ue(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},Zw={components:{TabbedPage:dr},setup(){return{tabs:[{id:"health",label:"Health",component:Ew},{id:"resources",label:"Resources",component:Aw},{id:"logs",label:"Logs",component:Ow},{id:"config",label:"Config",component:Hw},{id:"discord",label:"Discord",component:Vw},{id:"host-access",label:"Host Access",component:jw},{id:"api-tokens",label:"API Tokens",component:zw},{id:"llm",label:"LLM Config",component:Kw},{id:"internals",label:"Internals",component:Gw},{id:"update",label:"Update",component:Ww}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},mt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),gm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:P_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:ew,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:lw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:pw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:kw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:ww,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Zw,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:mt("/operations","live")},{path:"/agents",redirect:mt("/operations","agents")},{path:"/loops",redirect:mt("/operations","loops")},{path:"/processes",redirect:mt("/operations","processes")},{path:"/schedules",redirect:mt("/operations","schedules")},{path:"/audit",redirect:mt("/history","audit")},{path:"/sessions",redirect:mt("/history","sessions")},{path:"/traces",redirect:mt("/history","traces")},{path:"/usage",redirect:mt("/history","usage")},{path:"/tools",redirect:mt("/capabilities","tools")},{path:"/skills",redirect:mt("/capabilities","skills")},{path:"/knowledge",redirect:mt("/capabilities","knowledge")},{path:"/memory",redirect:mt("/capabilities","memory")},{path:"/learned",redirect:mt("/capabilities","learned")},{path:"/health",redirect:mt("/system","health")},{path:"/resources",redirect:mt("/system","resources")},{path:"/logs",redirect:mt("/system","logs")},{path:"/config",redirect:mt("/system","config")},{path:"/host-access",redirect:mt("/system","host-access")},{path:"/internals",redirect:mt("/system","internals")}],ii=E_({history:i_(),routes:gm});ii.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const Jw={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},Yw={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),u=h("disconnected"),d=h(-1),f=h(null);let p=null;const g=h("starting"),m=h(""),k=gm.filter(D=>D.meta),E=Q(()=>["Workspace","Operate","Observe","Manage"].map(D=>({name:D,routes:k.filter(I=>I.meta.section===D)})).filter(D=>D.routes.length)),y=Q(()=>{var D;return((D=ii.currentRoute.value.meta)==null?void 0:D.label)||"Odin"}),v=Q(()=>{var D;return((D=ii.currentRoute.value.meta)==null?void 0:D.section)||"Management"}),x=Q(()=>{var D;return((D=ii.currentRoute.value.meta)==null?void 0:D.description)||"Management console"});K.onSessionExpired=()=>{t.value=!0,Ge.disconnect(),K.setToken(""),e.value="login"};function T(D){var I;if((D.ctrlKey||D.metaKey)&&D.key.toLowerCase()==="k"){e.value==="ready"&&(D.preventDefault(),xd());return}if(n.value&&D.key==="Tab"){const j=[...((I=a.value)==null?void 0:I.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(j.length){const ue=j[0],fe=j[j.length-1];if(D.shiftKey&&(document.activeElement===ue||!a.value.contains(document.activeElement))){D.preventDefault(),fe.focus();return}if(!D.shiftKey&&(document.activeElement===fe||!a.value.contains(document.activeElement))){D.preventDefault(),ue.focus();return}}}if(D.key==="Escape"&&n.value){n.value=!1,D.preventDefault();return}if(D.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(D.target.tagName)){D.preventDefault();const j=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');j&&j.focus()}}function N(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ue(async()=>{document.addEventListener("keydown",T),r=window.matchMedia("(max-width: 900px)"),N(),r.addEventListener("change",N);const D=await K.check();D.ok?(e.value="ready",q()):D.needsAuth?e.value="login":(e.value="ready",q())});function O(){t.value=!1,e.value="ready",q()}async function w(){await K.logout(),Ge.disconnect(),e.value="login"}function A(){s.value=!s.value}function L(){n.value=!n.value}hs(n,async D=>{var I,j;if(D)o=document.activeElement,await Et(),(j=(I=a.value)==null?void 0:I.querySelector(".nav-item"))==null||j.focus();else if(o!=null&&o.isConnected){const ue=o;o=null,requestAnimationFrame(()=>ue.focus())}});const B=Q(()=>{switch(u.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(D,I="info",j=3e3){f.value={text:D,level:I},clearTimeout(p),p=setTimeout(()=>{f.value=null},j)}let S=null,$=!1;function q(){Ge.onStatusChange=D=>{c.value=D},Ge.onStateChange=(D,I)=>{u.value=D,d.value=I.latency??-1,D==="connected"?($&&P("Connection restored","success"),$=!0):D==="reconnecting"&&I.attempt===1&&P("Connection lost — reconnecting…","warn")},Ge.connect(),G(),S&&clearInterval(S),S=setInterval(G,15e3)}async function G(){try{const D=await K.get("/api/status");g.value=D.status==="online"?"online":"starting";const I=D.uptime_seconds||0,j=Math.floor(I/3600),ue=Math.floor(I%3600/60);m.value=`${j}h ${ue}m uptime`}catch{g.value="offline",m.value=""}}return ht(()=>{S&&clearInterval(S),Ge.disconnect(),document.removeEventListener("keydown",T),r==null||r.removeEventListener("change",N)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:u,wsLatency:d,wsLabel:B,wsToast:f,botStatus:g,botUptime:m,navRoutes:k,navGroups:E,currentPage:y,currentSection:v,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:O,logout:w,toggleSidebar:A,toggleMobileNavigation:L,openPalette:xd}}},Sn=Sl(Yw);Sn.component("odin-icon",O_);Sn.component("login-screen",Jw);Sn.component("toast-container",yx);Sn.component("confirm-host",xx);Sn.component("command-palette",N_);Sn.directive("modal-focus",D_);Sn.use(ii);Sn.mount("#app");
