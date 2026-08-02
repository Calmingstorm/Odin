var kg=Object.defineProperty;var wg=(e,t,s)=>t in e?kg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var et=(e,t,s)=>wg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Sg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null){this._lastActivity=Date.now();const a={method:t,headers:this._headers()};n!==null&&(a.body=JSON.stringify(n));const i=await fetch(s,a);if(i.status===401)throw new vr("Unauthorized");const l=await i.json().catch(()=>null);if(!i.ok){const r=(l==null?void 0:l.error)||`HTTP ${i.status}`;throw new Tg(r,i.status,l)}return l}get(t){return this._request("GET",t)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new vr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof vr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class vr extends Error{constructor(t){super(t),this.name="AuthError"}}class Tg extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Cg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error"){this._chatPending=!1;for(const l of this._handlers.chat||[])l(a)}},this._ws.onclose=()=>{if(this._ws=null,this._stopPing(),this._latency=-1,this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const a of this._handlers.chat||[])a(n)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const G=new Sg,Je=new Cg(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function is(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Fe={},fa=[],Ot=()=>{},ua=()=>!1,Gn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Ul=e=>e.startsWith("onUpdate:"),Pe=Object.assign,Eo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Eg=Object.prototype.hasOwnProperty,Ke=(e,t)=>Eg.call(e,t),he=Array.isArray,pa=e=>La(e)==="[object Map]",Wn=e=>La(e)==="[object Set]",Jc=e=>La(e)==="[object Date]",Ag=e=>La(e)==="[object RegExp]",Se=e=>typeof e=="function",Ee=e=>typeof e=="string",Ut=e=>typeof e=="symbol",ze=e=>e!==null&&typeof e=="object",Ao=e=>(ze(e)||Se(e))&&Se(e.then)&&Se(e.catch),Wd=Object.prototype.toString,La=e=>Wd.call(e),Rg=e=>La(e).slice(8,-1),Bl=e=>La(e)==="[object Object]",Hl=e=>Ee(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ws=is(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Ig=is("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Vl=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Ng=/-\w/g,Qe=Vl(e=>e.replace(Ng,t=>t.slice(1).toUpperCase())),Og=/\B([A-Z])/g,Qt=Vl(e=>e.replace(Og,"-$1").toLowerCase()),Zn=Vl(e=>e.charAt(0).toUpperCase()+e.slice(1)),ha=Vl(e=>e?`on${Zn(e)}`:""),Ct=(e,t)=>!Object.is(e,t),ga=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Zd=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},jl=e=>{const t=parseFloat(e);return isNaN(t)?e:t},cl=e=>{const t=Ee(e)?Number(e):NaN;return isNaN(t)?e:t};let Yc;const zl=()=>Yc||(Yc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Lg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Dg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Mg=is(Dg);function Ei(e){if(he(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ee(n)?Jd(n):Ei(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ee(e)||ze(e))return e}const Pg=/;(?![^(]*\))/g,Fg=/:([^]+)/,$g=/\/\*[^]*?\*\//g;function Jd(e){const t={};return e.replace($g,"").split(Pg).forEach(s=>{if(s){const n=s.split(Fg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Ai(e){let t="";if(Ee(e))t=e;else if(he(e))for(let s=0;s<e.length;s++){const n=Ai(e[s]);n&&(t+=n+" ")}else if(ze(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Ug(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ee(t)&&(e.class=Ai(t)),s&&(e.style=Ei(s)),e}const Bg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Hg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Vg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",jg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",zg=is(Bg),qg=is(Hg),Kg=is(Vg),Gg=is(jg),Wg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Zg=is(Wg);function Yd(e){return!!e||e===""}function Jg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Qs(e[n],t[n]);return s}function Qs(e,t){if(e===t)return!0;let s=Jc(e),n=Jc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Ut(e),n=Ut(t),s||n)return e===t;if(s=he(e),n=he(t),s||n)return s&&n?Jg(e,t):!1;if(s=ze(e),n=ze(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!Qs(e[l],t[l]))return!1}}return String(e)===String(t)}function ql(e,t){return e.findIndex(s=>Qs(s,t))}const Qd=e=>!!(e&&e.__v_isRef===!0),Xd=e=>Ee(e)?e:e==null?"":he(e)||ze(e)&&(e.toString===Wd||!Se(e.toString))?Qd(e)?Xd(e.value):JSON.stringify(e,ef,2):String(e),ef=(e,t)=>Qd(t)?ef(e,t.value):pa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[br(n,i)+" =>"]=a,s),{})}:Wn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>br(s))}:Ut(t)?br(t):ze(t)&&!he(t)&&!Bl(t)?String(t):t,br=(e,t="")=>{var s;return Ut(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Yg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let kt;class Ro{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&kt&&(kt.active?(this.parent=kt,this.index=(kt.scopes||(kt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=kt;try{return kt=this,t()}finally{kt=s}}}on(){++this._on===1&&(this.prevScope=kt,kt=this)}off(){if(this._on>0&&--this._on===0){if(kt===this)kt=this.prevScope;else{let t=kt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Qg(e){return new Ro(e)}function tf(){return kt}function Xg(e,t=!1){kt&&kt.cleanups.push(e)}let st;const yr=new WeakSet;class ci{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,kt&&(kt.active?kt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,yr.has(this)&&(yr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||nf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Qc(this),af(this);const t=st,s=vs;st=this,vs=!0;try{return this.fn()}finally{lf(this),st=t,vs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Oo(t);this.deps=this.depsTail=void 0,Qc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?yr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){qr(this)&&this.run()}get dirty(){return qr(this)}}let sf=0,Xa,ei;function nf(e,t=!1){if(e.flags|=8,t){e.next=ei,ei=e;return}e.next=Xa,Xa=e}function Io(){sf++}function No(){if(--sf>0)return;if(ei){let t=ei;for(ei=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Xa;){let t=Xa;for(Xa=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function af(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function lf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Oo(n),em(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function qr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(rf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function rf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===ui)||(e.globalVersion=ui,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!qr(e))))return;e.flags|=2;const t=e.dep,s=st,n=vs;st=e,vs=!0;try{af(e);const a=e.fn(e._value);(t.version===0||Ct(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{st=s,vs=n,lf(e),e.flags&=-3}}function Oo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Oo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function em(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function tm(e,t){e.effect instanceof ci&&(e=e.effect.fn);const s=new ci(e);t&&Pe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function sm(e){e.effect.stop()}let vs=!0;const of=[];function Xs(){of.push(vs),vs=!1}function en(){const e=of.pop();vs=e===void 0?!0:e}function Qc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=st;st=void 0;try{t()}finally{st=s}}}let ui=0;class nm{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Kl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!st||!vs||st===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==st)s=this.activeLink=new nm(st,this),st.deps?(s.prevDep=st.depsTail,st.depsTail.nextDep=s,st.depsTail=s):st.deps=st.depsTail=s,cf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=st.depsTail,s.nextDep=void 0,st.depsTail.nextDep=s,st.depsTail=s,st.deps===s&&(st.deps=n)}return s}trigger(t){this.version++,ui++,this.notify(t)}notify(t){Io();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{No()}}}function cf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)cf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const ul=new WeakMap,Fn=Symbol(""),Kr=Symbol(""),di=Symbol("");function Pt(e,t,s){if(vs&&st){let n=ul.get(e);n||ul.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Kl),a.map=n,a.key=s),a.track()}}function js(e,t,s,n,a,i){const l=ul.get(e);if(!l){ui++;return}const r=o=>{o&&o.trigger()};if(Io(),t==="clear")l.forEach(r);else{const o=he(e),c=o&&Hl(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===di||!Ut(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(di)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Fn)),pa(e)&&r(l.get(Kr)));break;case"delete":o||(r(l.get(Fn)),pa(e)&&r(l.get(Kr)));break;case"set":pa(e)&&r(l.get(Fn));break}}No()}function am(e,t){const s=ul.get(e);return s&&s.get(t)}function ta(e){const t=Be(e);return t===e?t:(Pt(t,"iterate",di),es(e)?t:t.map(ys))}function Gl(e){return Pt(e=Be(e),"iterate",di),e}function Rs(e,t){return Ns(e)?_a(Zs(e)?ys(t):t):ys(t)}const im={__proto__:null,[Symbol.iterator](){return xr(this,Symbol.iterator,e=>Rs(this,e))},concat(...e){return ta(this).concat(...e.map(t=>he(t)?ta(t):t))},entries(){return xr(this,"entries",e=>(e[1]=Rs(this,e[1]),e))},every(e,t){return Ms(this,"every",e,t,void 0,arguments)},filter(e,t){return Ms(this,"filter",e,t,s=>s.map(n=>Rs(this,n)),arguments)},find(e,t){return Ms(this,"find",e,t,s=>Rs(this,s),arguments)},findIndex(e,t){return Ms(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ms(this,"findLast",e,t,s=>Rs(this,s),arguments)},findLastIndex(e,t){return Ms(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ms(this,"forEach",e,t,void 0,arguments)},includes(...e){return _r(this,"includes",e)},indexOf(...e){return _r(this,"indexOf",e)},join(e){return ta(this).join(e)},lastIndexOf(...e){return _r(this,"lastIndexOf",e)},map(e,t){return Ms(this,"map",e,t,void 0,arguments)},pop(){return Ua(this,"pop")},push(...e){return Ua(this,"push",e)},reduce(e,...t){return Xc(this,"reduce",e,t)},reduceRight(e,...t){return Xc(this,"reduceRight",e,t)},shift(){return Ua(this,"shift")},some(e,t){return Ms(this,"some",e,t,void 0,arguments)},splice(...e){return Ua(this,"splice",e)},toReversed(){return ta(this).toReversed()},toSorted(e){return ta(this).toSorted(e)},toSpliced(...e){return ta(this).toSpliced(...e)},unshift(...e){return Ua(this,"unshift",e)},values(){return xr(this,"values",e=>Rs(this,e))}};function xr(e,t,s){const n=Gl(e),a=n[t]();return n!==e&&!es(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const lm=Array.prototype;function Ms(e,t,s,n,a,i){const l=Gl(e),r=l!==e&&!es(e),o=l[t];if(o!==lm[t]){const d=o.apply(e,i);return r?ys(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,Rs(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function Xc(e,t,s,n){const a=Gl(e),i=a!==e&&!es(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=Rs(e,c)),s.call(this,c,Rs(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?Rs(e,o):o}function _r(e,t,s){const n=Be(e);Pt(n,"iterate",di);const a=n[t](...s);return(a===-1||a===!1)&&Ri(s[0])?(s[0]=Be(s[0]),n[t](...s)):a}function Ua(e,t,s=[]){Xs(),Io();const n=Be(e)[t].apply(e,s);return No(),en(),n}const rm=is("__proto__,__v_isRef,__isVue"),uf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Ut));function om(e){Ut(e)||(e=String(e));const t=Be(this);return Pt(t,"has",e),t.hasOwnProperty(e)}class df{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?vf:mf:i?gf:hf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=he(t);if(!a){let o;if(l&&(o=im[s]))return o;if(s==="hasOwnProperty")return om}const r=Reflect.get(t,s,bt(t)?t:n);if((Ut(s)?uf.has(s):rm(s))||(a||Pt(t,"get",s),i))return r;if(bt(r)){const o=l&&Hl(s)?r:r.value;return a&&ze(o)?dl(o):o}return ze(r)?a?dl(r):Sn(r):r}}class ff extends df{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=he(t)&&Hl(s);if(!this._isShallow){const c=Ns(i);if(!es(n)&&!Ns(n)&&(i=Be(i),n=Be(n)),!l&&bt(i)&&!bt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:Ke(t,s),o=Reflect.set(t,s,n,bt(t)?t:a);return t===Be(a)&&(r?Ct(n,i)&&js(t,"set",s,n):js(t,"add",s,n)),o}deleteProperty(t,s){const n=Ke(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&js(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Ut(s)||!uf.has(s))&&Pt(t,"has",s),n}ownKeys(t){return Pt(t,"iterate",he(t)?"length":Fn),Reflect.ownKeys(t)}}class pf extends df{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const cm=new ff,um=new pf,dm=new ff(!0),fm=new pf(!0),Gr=e=>e,Bi=e=>Reflect.getPrototypeOf(e);function pm(e,t,s){return function(...n){const a=this.__v_raw,i=Be(a),l=pa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?Gr:t?_a:ys;return!t&&Pt(i,"iterate",o?Kr:Fn),Pe(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function Hi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function hm(e,t){const s={get(a){const i=this.__v_raw,l=Be(i),r=Be(a);e||(Ct(a,r)&&Pt(l,"get",a),Pt(l,"get",r));const{has:o}=Bi(l),c=t?Gr:e?_a:ys;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Pt(Be(a),"iterate",Fn),a.size},has(a){const i=this.__v_raw,l=Be(i),r=Be(a);return e||(Ct(a,r)&&Pt(l,"has",a),Pt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Be(r),c=t?Gr:e?_a:ys;return!e&&Pt(o,"iterate",Fn),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return Pe(s,e?{add:Hi("add"),set:Hi("set"),delete:Hi("delete"),clear:Hi("clear")}:{add(a){const i=Be(this),l=Bi(i),r=Be(a),o=!t&&!es(a)&&!Ns(a)?r:a;return l.has.call(i,o)||Ct(a,o)&&l.has.call(i,a)||Ct(r,o)&&l.has.call(i,r)||(i.add(o),js(i,"add",o,o)),this},set(a,i){!t&&!es(i)&&!Ns(i)&&(i=Be(i));const l=Be(this),{has:r,get:o}=Bi(l);let c=r.call(l,a);c||(a=Be(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?Ct(i,u)&&js(l,"set",a,i):js(l,"add",a,i),this},delete(a){const i=Be(this),{has:l,get:r}=Bi(i);let o=l.call(i,a);o||(a=Be(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&js(i,"delete",a,void 0),c},clear(){const a=Be(this),i=a.size!==0,l=a.clear();return i&&js(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=pm(a,e,t)}),s}function Wl(e,t){const s=hm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(Ke(s,a)&&a in n?s:n,a,i)}const gm={get:Wl(!1,!1)},mm={get:Wl(!1,!0)},vm={get:Wl(!0,!1)},bm={get:Wl(!0,!0)},hf=new WeakMap,gf=new WeakMap,mf=new WeakMap,vf=new WeakMap;function ym(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Sn(e){return Ns(e)?e:Zl(e,!1,cm,gm,hf)}function Lo(e){return Zl(e,!1,dm,mm,gf)}function dl(e){return Zl(e,!0,um,vm,mf)}function xm(e){return Zl(e,!0,fm,bm,vf)}function Zl(e,t,s,n,a){if(!ze(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=ym(Rg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Zs(e){return Ns(e)?Zs(e.__v_raw):!!(e&&e.__v_isReactive)}function Ns(e){return!!(e&&e.__v_isReadonly)}function es(e){return!!(e&&e.__v_isShallow)}function Ri(e){return e?!!e.__v_raw:!1}function Be(e){const t=e&&e.__v_raw;return t?Be(t):e}function bf(e){return!Ke(e,"__v_skip")&&Object.isExtensible(e)&&Zd(e,"__v_skip",!0),e}const ys=e=>ze(e)?Sn(e):e,_a=e=>ze(e)?dl(e):e;function bt(e){return e?e.__v_isRef===!0:!1}function h(e){return yf(e,!1)}function Do(e){return yf(e,!0)}function yf(e,t){return bt(e)?e:new _m(e,t)}class _m{constructor(t,s){this.dep=new Kl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Be(t),this._value=s?t:ys(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||es(t)||Ns(t);t=n?t:Be(t),Ct(t,s)&&(this._rawValue=t,this._value=n?t:ys(t),this.dep.trigger())}}function km(e){e.dep&&e.dep.trigger()}function Is(e){return bt(e)?e.value:e}function wm(e){return Se(e)?e():Is(e)}const Sm={get:(e,t,s)=>t==="__v_raw"?e:Is(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return bt(a)&&!bt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Mo(e){return Zs(e)?e:new Proxy(e,Sm)}class Tm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Kl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function xf(e){return new Tm(e)}function Cm(e){const t=he(e)?new Array(e.length):{};for(const s in e)t[s]=_f(e,s);return t}class Em{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Ut(s)?s:String(s),this._raw=Be(t);let a=!0,i=t;if(!he(t)||Ut(this._key)||!Hl(this._key))do a=!Ri(i)||es(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Is(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&bt(this._raw[this._key])){const s=this._object[this._key];if(bt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return am(this._raw,this._key)}}class Am{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Rm(e,t,s){return bt(e)?e:Se(e)?new Am(e):ze(e)&&arguments.length>1?_f(e,t,s):h(e)}function _f(e,t,s){return new Em(e,t,s)}class Im{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Kl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=ui-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&st!==this)return nf(this,!0),!0}get value(){const t=this.dep.track();return rf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Nm(e,t,s=!1){let n,a;return Se(e)?n=e:(n=e.get,a=e.set),new Im(n,a,s)}const Om={GET:"get",HAS:"has",ITERATE:"iterate"},Lm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Vi={},fl=new WeakMap;let vn;function Dm(){return vn}function kf(e,t=!1,s=vn){if(s){let n=fl.get(s);n||fl.set(s,n=[]),n.push(e)}}function Mm(e,t,s=Fe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:es(x)||a===!1||a===0?zs(x,1):zs(x);let u,d,f,p,b=!1,g=!1;if(bt(e)?(d=()=>e.value,b=es(e)):Zs(e)?(d=()=>c(e),b=!0):he(e)?(g=!0,b=e.some(x=>Zs(x)||es(x)),d=()=>e.map(x=>{if(bt(x))return x.value;if(Zs(x))return c(x);if(Se(x))return o?o(x,2):x()})):Se(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){Xs();try{f()}finally{en()}}const x=vn;vn=u;try{return o?o(e,3,[p]):e(p)}finally{vn=x}}:d=Ot,t&&a){const x=d,k=a===!0?1/0:a;d=()=>zs(x(),k)}const T=tf(),N=()=>{u.stop(),T&&T.active&&Eo(T.effects,u)};if(i&&t){const x=t;t=(...k)=>{const I=x(...k);return N(),I}}let y=g?new Array(e.length).fill(Vi):Vi;const v=x=>{if(!(!(u.flags&1)||!u.dirty&&!x))if(t){const k=u.run();if(x||a||b||(g?k.some((I,O)=>Ct(I,y[O])):Ct(k,y))){f&&f();const I=vn;vn=u;try{const O=[k,y===Vi?void 0:g&&y[0]===Vi?[]:y,p];y=k,o?o(t,3,O):t(...O)}finally{vn=I}}}else u.run()};return r&&r(v),u=new ci(d),u.scheduler=l?()=>l(v,!1):v,p=x=>kf(x,!1,u),f=u.onStop=()=>{const x=fl.get(u);if(x){if(o)o(x,4);else for(const k of x)k();fl.delete(u)}},t?n?v(!0):y=u.run():l?l(v.bind(null,!0),!0):u.run(),N.pause=u.pause.bind(u),N.resume=u.resume.bind(u),N.stop=N,N}function zs(e,t=1/0,s){if(t<=0||!ze(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,bt(e))zs(e.value,t,s);else if(he(e))for(let n=0;n<e.length;n++)zs(e[n],t,s);else if(Wn(e)||pa(e))e.forEach(n=>{zs(n,t,s)});else if(Bl(e)){for(const n in e)zs(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&zs(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const wf=[];function Pm(e){wf.push(e)}function Fm(){wf.pop()}function $m(e,t){}const Um={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Bm={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Da(e,t,s,n){try{return n?e(...n):e()}catch(a){Jn(a,t,s)}}function ns(e,t,s,n){if(Se(e)){const a=Da(e,t,s,n);return a&&Ao(a)&&a.catch(i=>{Jn(i,t,s)}),a}if(he(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ns(e[i],t,s,n));return a}}function Jn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Fe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){Xs(),Da(i,null,10,[e,o,c]),en();return}}Hm(e,s,a,n,l)}function Hm(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const zt=[];let Es=-1;const ma=[];let bn=null,la=0;const Sf=Promise.resolve();let pl=null;function wt(e){const t=pl||Sf;return e?t.then(this?e.bind(this):e):t}function Vm(e){let t=Es+1,s=zt.length;for(;t<s;){const n=t+s>>>1,a=zt[n],i=pi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Po(e){if(!(e.flags&1)){const t=pi(e),s=zt[zt.length-1];!s||!(e.flags&2)&&t>=pi(s)?zt.push(e):zt.splice(Vm(t),0,e),e.flags|=1,Tf()}}function Tf(){pl||(pl=Sf.then(Cf))}function fi(e){he(e)?ma.push(...e):bn&&e.id===-1?bn.splice(la+1,0,e):e.flags&1||(ma.push(e),e.flags|=1),Tf()}function eu(e,t,s=Es+1){for(;s<zt.length;s++){const n=zt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;zt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function hl(e){if(ma.length){const t=[...new Set(ma)].sort((s,n)=>pi(s)-pi(n));if(ma.length=0,bn){bn.push(...t);return}for(bn=t,la=0;la<bn.length;la++){const s=bn[la];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}bn=null,la=0}}const pi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Cf(e){try{for(Es=0;Es<zt.length;Es++){const t=zt[Es];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Da(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Es<zt.length;Es++){const t=zt[Es];t&&(t.flags&=-2)}Es=-1,zt.length=0,hl(),pl=null,(zt.length||ma.length)&&Cf()}}let ra,ji=[];function Ef(e,t){var s,n;ra=e,ra?(ra.enabled=!0,ji.forEach(({event:a,args:i})=>ra.emit(a,...i)),ji=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Ef(i,t)}),setTimeout(()=>{ra||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ji=[])},3e3)):ji=[]}let Nt=null,Jl=null;function hi(e){const t=Nt;return Nt=e,Jl=e&&e.type.__scopeId||null,t}function jm(e){Jl=e}function zm(){Jl=null}const qm=e=>Fo;function Fo(e,t=Nt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&bi(-1);const i=hi(t);let l;try{l=e(...a)}finally{hi(i),n._d&&bi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Km(e,t){if(Nt===null)return e;const s=Li(Nt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Fe]=t[a];i&&(Se(i)&&(i={mounted:i,updated:i}),i.deep&&zs(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function As(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Xs(),ns(o,s,8,[e.el,r,e,t]),en())}}function ti(e,t){if(It){let s=It.provides;const n=It.parent&&It.parent.provides;n===s&&(s=It.provides=Object.create(n)),s[e]=t}}function ds(e,t,s=!1){const n=Kt();if(n||$n){let a=$n?$n._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Se(t)?t.call(n&&n.proxy):t}}function Gm(){return!!(Kt()||$n)}const Af=Symbol.for("v-scx"),Rf=()=>ds(Af);function Wm(e,t){return Ii(e,null,t)}function Zm(e,t){return Ii(e,null,{flush:"post"})}function If(e,t){return Ii(e,null,{flush:"sync"})}function fs(e,t,s){return Ii(e,t,s)}function Ii(e,t,s=Fe){const{immediate:n,deep:a,flush:i,once:l}=s,r=Pe({},s),o=t&&n||!t&&i!=="post";let c;if(zn){if(i==="sync"){const p=Rf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Ot,p.resume=Ot,p.pause=Ot,p}}const u=It;r.call=(p,b,g)=>ns(p,u,b,g);let d=!1;i==="post"?r.scheduler=p=>{mt(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,b)=>{b?p():Po(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Mm(e,t,r);return zn&&(c?c.push(f):o&&f()),f}function Jm(e,t,s){const n=this.proxy,a=Ee(e)?e.includes(".")?Nf(n,e):()=>n[e]:e.bind(n,n);let i;Se(t)?i=t:(i=t.handler,s=t);const l=Ma(this),r=Ii(a,i.bind(n),s);return l(),r}function Nf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const gn=new WeakMap,Of=Symbol("_vte"),Lf=e=>e.__isTeleport,Ln=e=>e&&(e.disabled||e.disabled===""),Ym=e=>e&&(e.defer||e.defer===""),tu=e=>typeof SVGElement<"u"&&e instanceof SVGElement,su=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Wr=(e,t)=>{const s=e&&e.to;return Ee(s)?t?t(s):null:s},Qm={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:b,createText:g,createComment:T,parentNode:N}}=c,y=Ln(t.props);let{dynamicChildren:v}=t;const x=(O,w,E)=>{O.shapeFlag&16&&u(O.children,w,E,a,i,l,r,o)},k=(O=t)=>{const w=Ln(O.props),E=O.target=Wr(O.props,b),L=Zr(E,O,g,p);E&&(l!=="svg"&&tu(E)?l="svg":l!=="mathml"&&su(E)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(E),w||(x(O,E,L),Wa(O,!1)))},I=O=>{const w=()=>{if(gn.get(O)===w){if(gn.delete(O),Ln(O.props)){const E=N(O.el)||s;x(O,E,O.anchor),Wa(O,!0)}k(O)}};gn.set(O,w),mt(w,i)};if(e==null){const O=t.el=g(""),w=t.anchor=g("");if(p(O,s,n),p(w,s,n),Ym(t.props)||i&&i.pendingBranch){I(t);return}y&&(x(t,s,w),Wa(t,!0)),k()}else{t.el=e.el;const O=t.anchor=e.anchor,w=gn.get(e);if(w){w.flags|=8,gn.delete(e),I(t);return}t.targetStart=e.targetStart;const E=t.target=e.target,L=t.targetAnchor=e.targetAnchor,U=Ln(e.props),F=U?s:E,S=U?O:L;if(l==="svg"||tu(E)?l="svg":(l==="mathml"||su(E))&&(l="mathml"),v?(f(e.dynamicChildren,v,F,a,i,l,r),Jo(e,t,!0)):o||d(e,t,F,S,a,i,l,r,!1),y)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):zi(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const M=t.target=Wr(t.props,b);M&&zi(t,M,null,c,0)}else U&&zi(t,E,L,c,1);Wa(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!Ln(f),b=gn.get(e);if(b&&(b.flags|=8,gn.delete(e)),d&&(a(c),a(u)),i&&a(o),!b&&l&16)for(let g=0;g<r.length;g++){const T=r[g];n(T,t,s,p,!!T.dynamicChildren)}},move:zi,hydrate:Xm};function zi(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!gn.has(e)&&(!d||Ln(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function Xm(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(T,N){let y=N;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,T._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function p(T,N){N.anchor=d(l(T),N,r(T),s,n,a,i)}const b=t.target=Wr(t.props,o),g=Ln(t.props);if(b){const T=b._lpa||b.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(b,T),t.targetAnchor||Zr(b,t,u,c,r(e)===b?e:null)):(t.anchor=l(e),f(b,T),t.targetAnchor||Zr(b,t,u,c),d(T&&l(T),t,b,s,n,a,i))),Wa(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const ev=Qm;function Wa(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Zr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Of]=l,e&&(n(i,e,a),n(l,e,a)),l}const os=Symbol("_leaveCb"),Ba=Symbol("_enterCb");function $o(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return He(()=>{e.isMounted=!0}),er(()=>{e.isUnmounting=!0}),e}const rs=[Function,Array],Uo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:rs,onEnter:rs,onAfterEnter:rs,onEnterCancelled:rs,onBeforeLeave:rs,onLeave:rs,onAfterLeave:rs,onLeaveCancelled:rs,onBeforeAppear:rs,onAppear:rs,onAfterAppear:rs,onAppearCancelled:rs},Df=e=>{const t=e.subTree;return t.component?Df(t.component):t},tv={name:"BaseTransition",props:Uo,setup(e,{slots:t}){const s=Kt(),n=$o();return()=>{const a=t.default&&Yl(t.default(),!0),i=a&&a.length?Mf(a):s.subTree?vp():void 0;if(!i)return;const l=Be(e),{mode:r}=l;if(n.isLeaving)return kr(i);const o=nu(i);if(!o)return kr(i);let c=ka(o,l,n,s,d=>c=d);o.type!==pt&&tn(o,c);let u=s.subTree&&nu(s.subTree);if(u&&u.type!==pt&&!ms(u,o)&&Df(s).type!==pt){let d=ka(u,l,n,s);if(tn(u,d),r==="out-in"&&o.type!==pt)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},kr(i);r==="in-out"&&o.type!==pt?d.delayLeave=(f,p,b)=>{const g=Ff(n,u);g[String(u.key)]=u,f[os]=()=>{p(),f[os]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{b(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Mf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==pt){t=s;break}}return t}const Pf=tv;function Ff(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ka(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:b,onLeaveCancelled:g,onBeforeAppear:T,onAppear:N,onAfterAppear:y,onAppearCancelled:v}=t,x=String(e.key),k=Ff(s,e),I=(E,L)=>{E&&ns(E,n,9,L)},O=(E,L)=>{const U=L[1];I(E,L),he(E)?E.every(F=>F.length<=1)&&U():E.length<=1&&U()},w={mode:l,persisted:r,beforeEnter(E){let L=o;if(!s.isMounted)if(i)L=T||o;else return;E[os]&&E[os](!0);const U=k[x];U&&ms(e,U)&&U.el[os]&&U.el[os](),I(L,[E])},enter(E){if(k[x]===e)return;let L=c,U=u,F=d;if(!s.isMounted)if(i)L=N||c,U=y||u,F=v||d;else return;let S=!1;E[Ba]=H=>{S||(S=!0,H?I(F,[E]):I(U,[E]),w.delayedLeave&&w.delayedLeave(),E[Ba]=void 0)};const M=E[Ba].bind(null,!1);L?O(L,[E,M]):M()},leave(E,L){const U=String(e.key);if(E[Ba]&&E[Ba](!0),s.isUnmounting)return L();I(f,[E]);let F=!1;E[os]=M=>{F||(F=!0,L(),M?I(g,[E]):I(b,[E]),E[os]=void 0,k[U]===e&&delete k[U])};const S=E[os].bind(null,!1);k[U]=e,p?O(p,[E,S]):S()},clone(E){const L=ka(E,t,s,n,a);return a&&a(L),L}};return w}function kr(e){if(Oi(e))return e=Os(e),e.children=null,e}function nu(e){if(!Oi(e))return Lf(e.type)&&e.children?Mf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Se(s.default))return s.default()}}function tn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,tn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Yl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Et?(l.patchFlag&128&&a++,n=n.concat(Yl(l.children,t,r))):(t||l.type!==pt)&&n.push(r!=null?Os(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Ni(e,t){return Se(e)?Pe({name:e.name},t,{setup:e}):e}function sv(){const e=Kt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Bo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function nv(e){const t=Kt(),s=Do(null);if(t){const a=t.refs===Fe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function au(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const gl=new WeakMap;function va(e,t,s,n,a=!1){if(he(e)){e.forEach((g,T)=>va(g,t&&(he(t)?t[T]:t),s,n,a));return}if(Js(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&va(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Li(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Fe?r.refs={}:r.refs,d=r.setupState,f=Be(d),p=d===Fe?ua:g=>au(u,g)?!1:Ke(f,g),b=(g,T)=>!(T&&au(u,T));if(c!=null&&c!==o){if(iu(t),Ee(c))u[c]=null,p(c)&&(d[c]=null);else if(bt(c)){const g=t;b(c,g.k)&&(c.value=null),g.k&&(u[g.k]=null)}}if(Se(o))Da(o,r,12,[l,u]);else{const g=Ee(o),T=bt(o);if(g||T){const N=()=>{if(e.f){const y=g?p(o)?d[o]:u[o]:b()||!e.k?o.value:u[e.k];if(a)he(y)&&Eo(y,i);else if(he(y))y.includes(i)||y.push(i);else if(g)u[o]=[i],p(o)&&(d[o]=u[o]);else{const v=[i];b(o,e.k)&&(o.value=v),e.k&&(u[e.k]=v)}}else g?(u[o]=l,p(o)&&(d[o]=l)):T&&(b(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const y=()=>{N(),gl.delete(e)};y.id=-1,gl.set(e,y),mt(y,s)}else iu(e),N()}}}function iu(e){const t=gl.get(e);t&&(t.flags|=8,gl.delete(e))}let lu=!1;const sa=()=>{lu||(console.error("Hydration completed but contains mismatches."),lu=!0)},av=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",iv=e=>e.namespaceURI.includes("MathML"),qi=e=>{if(e.nodeType===1){if(av(e))return"svg";if(iv(e))return"mathml"}},da=e=>e.nodeType===8;function lv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(v,x)=>{if(!x.hasChildNodes()){s(null,v,x),hl(),x._vnode=v;return}d(x.firstChild,v,null,null,null),hl(),x._vnode=v},d=(v,x,k,I,O,w=!1)=>{w=w||!!x.dynamicChildren;const E=da(v)&&v.data==="[",L=()=>g(v,x,k,I,O,E),{type:U,ref:F,shapeFlag:S,patchFlag:M}=x;let H=v.nodeType;x.el=v,M===-2&&(w=!1,x.dynamicChildren=null);let W=null;switch(U){case _n:H!==3?x.children===""?(o(x.el=a(""),l(v),v),W=v):W=L():(v.data!==x.children&&(sa(),v.data=x.children),W=i(v));break;case pt:y(v)?(W=i(v),N(x.el=v.content.firstChild,v,k)):H!==8||E?W=L():W=i(v);break;case Un:if(E&&(v=i(v),H=v.nodeType),H===1||H===3){W=v;const D=!x.children.length;for(let R=0;R<x.staticCount;R++)D&&(x.children+=W.nodeType===1?W.outerHTML:W.data),R===x.staticCount-1&&(x.anchor=W),W=i(W);return E?i(W):W}else L();break;case Et:E?W=b(v,x,k,I,O,w):W=L();break;default:if(S&1)(H!==1||x.type.toLowerCase()!==v.tagName.toLowerCase())&&!y(v)?W=L():W=f(v,x,k,I,O,w);else if(S&6){x.slotScopeIds=O;const D=l(v);if(E?W=T(v):da(v)&&v.data==="teleport start"?W=T(v,v.data,"teleport end"):W=i(v),t(x,D,null,k,I,qi(D),w),Js(x)&&!x.type.__asyncResolved){let R;E?(R=it(Et),R.anchor=W?W.previousSibling:D.lastChild):R=v.nodeType===3?Qo(""):it("div"),R.el=v,x.component.subTree=R}}else S&64?H!==8?W=L():W=x.type.hydrate(v,x,k,I,O,w,e,p):S&128&&(W=x.type.hydrate(v,x,k,I,qi(l(v)),O,w,e,d))}return F!=null&&va(F,null,I,x),W},f=(v,x,k,I,O,w)=>{w=w||!!x.dynamicChildren;const{type:E,props:L,patchFlag:U,shapeFlag:F,dirs:S,transition:M}=x,H=E==="input"||E==="option";if(H||U!==-1){S&&As(x,null,k,"created");let W=!1;if(y(v)){W=op(null,M)&&k&&k.vnode.props&&k.vnode.props.appear;const R=v.content.firstChild;if(W){const q=R.getAttribute("class");q&&(R.$cls=q),M.beforeEnter(R)}N(R,v,k),x.el=v=R}if(F&16&&!(L&&(L.innerHTML||L.textContent))){let R=p(v.firstChild,x,v,k,I,O,w);for(R&&!Ki(v,1)&&sa();R;){const q=R;R=R.nextSibling,r(q)}}else if(F&8){let R=x.children;R[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(R=R.slice(1));const{textContent:q}=v;q!==R&&q!==R.replace(/\r\n|\r/g,`
`)&&(Ki(v,0)||sa(),v.textContent=x.children)}if(L){if(H||!w||U&48){const R=v.tagName.includes("-");for(const q in L)(H&&(q.endsWith("value")||q==="indeterminate")||Gn(q)&&!Ws(q)||q[0]==="."||R&&!Ws(q))&&n(v,q,null,L[q],void 0,k)}else if(L.onClick)n(v,"onClick",null,L.onClick,void 0,k);else if(U&4&&Zs(L.style))for(const R in L.style)L.style[R]}let D;(D=L&&L.onVnodeBeforeMount)&&Zt(D,k,x),S&&As(x,null,k,"beforeMount"),((D=L&&L.onVnodeMounted)||S||W)&&fp(()=>{D&&Zt(D,k,x),W&&M.enter(v),S&&As(x,null,k,"mounted")},I)}return v.nextSibling},p=(v,x,k,I,O,w,E)=>{E=E||!!x.dynamicChildren;const L=x.children,U=L.length;let F=!1;for(let S=0;S<U;S++){const M=E?L[S]:L[S]=Yt(L[S]),H=M.type===_n;v?(H&&!E&&S+1<U&&Yt(L[S+1]).type===_n&&(o(a(v.data.slice(M.children.length)),k,i(v)),v.data=M.children),v=d(v,M,I,O,w,E)):H&&!M.children?o(M.el=a(""),k):(F||(F=!0,Ki(k,1)||sa()),s(null,M,k,null,I,O,qi(k),w))}return v},b=(v,x,k,I,O,w)=>{const{slotScopeIds:E}=x;E&&(O=O?O.concat(E):E);const L=l(v),U=p(i(v),x,L,k,I,O,w);return U&&da(U)&&U.data==="]"?i(x.anchor=U):(sa(),o(x.anchor=c("]"),L,U),U)},g=(v,x,k,I,O,w)=>{if(Ki(v.parentElement,1)||sa(),x.el=null,w){const U=T(v);for(;;){const F=i(v);if(F&&F!==U)r(F);else break}}const E=i(v),L=l(v);return r(v),s(null,x,L,E,k,I,qi(L),O),k&&(k.vnode.el=x.el,sr(k,x.el)),E},T=(v,x="[",k="]")=>{let I=0;for(;v;)if(v=i(v),v&&da(v)&&(v.data===x&&I++,v.data===k)){if(I===0)return i(v);I--}return v},N=(v,x,k)=>{const I=x.parentNode;I&&I.replaceChild(v,x);let O=k;for(;O;)O.vnode.el===x&&(O.vnode.el=O.subTree.el=v),O=O.parent},y=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[u,d]}const ru="data-allow-mismatch",rv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Ki(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(ru);)e=e.parentElement;const s=e&&e.getAttribute(ru);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(rv[t])}}const ov=zl().requestIdleCallback||(e=>setTimeout(e,1)),cv=zl().cancelIdleCallback||(e=>clearTimeout(e)),uv=(e=1e4)=>t=>{const s=ov(t,{timeout:e});return()=>cv(s)};function dv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const fv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(dv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},pv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},hv=(e=[])=>(t,s)=>{Ee(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function gv(e,t){if(da(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(da(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Js=e=>!!e.type.__asyncLoader;function mv(e){Se(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let b;return c||(b=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((T,N)=>{o(g,()=>T(f()),()=>N(g),d+1)});throw g}).then(g=>b!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),u=g,g)))};return Ni({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(b,g,T){let N=!1;(g.bu||(g.bu=[])).push(()=>N=!0);const y=()=>{N||T()},v=i?()=>{const x=i(y,k=>gv(b,k));x&&(g.bum||(g.bum=[])).push(x)}:y;u?v():p().then(()=>!g.isUnmounted&&v())},get __asyncResolved(){return u},setup(){const b=It;if(Bo(b),u)return()=>Gi(u,b);const g=k=>{c=null,Jn(k,b,13,!n)};if(r&&b.suspense||zn)return p().then(k=>()=>Gi(k,b)).catch(k=>(g(k),()=>n?it(n,{error:k}):null));const T=h(!1),N=h(),y=h(!!a);let v,x;return ht(()=>{v!=null&&clearTimeout(v),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{b.isUnmounted||(y.value=!1)},a)),l!=null&&(v=setTimeout(()=>{if(!b.isUnmounted&&!T.value&&!N.value){const k=new Error(`Async component timed out after ${l}ms.`);g(k),N.value=k}},l)),p().then(()=>{b.isUnmounted||(T.value=!0,b.parent&&Oi(b.parent.vnode)&&b.parent.update())}).catch(k=>{if(b.isUnmounted){c=null;return}g(k),N.value=k}),()=>{if(T.value&&u)return Gi(u,b);if(N.value&&n)return it(n,{error:N.value});if(s&&!y.value)return Gi(s,b)}}})}function Gi(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=it(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Oi=e=>e.type.__isKeepAlive,vv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Kt(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(y,v,x,k,I)=>{const O=y.component;c(y,v,x,0,r),o(O.vnode,y,v,x,O,r,k,y.slotScopeIds,I),mt(()=>{O.isDeactivated=!1,O.a&&ga(O.a);const w=y.props&&y.props.onVnodeMounted;w&&Zt(w,O.parent,y)},r)},n.deactivate=y=>{const v=y.component;vl(v.m),vl(v.a),c(y,f,null,1,r),mt(()=>{v.da&&ga(v.da);const x=y.props&&y.props.onVnodeUnmounted;x&&Zt(x,v.parent,y),v.isDeactivated=!0},r)};function p(y){wr(y),u(y,s,r,!0)}function b(y){a.forEach((v,x)=>{const k=ao(Js(v)?v.type.__asyncResolved||{}:v.type);k&&!y(k)&&g(x)})}function g(y){const v=a.get(y);v&&(!l||!ms(v,l))?p(v):l&&wr(l),a.delete(y),i.delete(y)}fs(()=>[e.include,e.exclude],([y,v])=>{y&&b(x=>Za(y,x)),v&&b(x=>!Za(v,x))},{flush:"post",deep:!0});let T=null;const N=()=>{T!=null&&(bl(s.subTree.type)?mt(()=>{a.set(T,Wi(s.subTree))},s.subTree.suspense):a.set(T,Wi(s.subTree)))};return He(N),Xl(N),er(()=>{a.forEach(y=>{const{subTree:v,suspense:x}=s,k=Wi(v);if(y.type===k.type&&y.key===k.key){wr(k);const I=k.component.da;I&&mt(I,x);return}p(y)})}),()=>{if(T=null,!t.default)return l=null;const y=t.default(),v=y[0];if(y.length>1)return l=null,y;if(!sn(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let x=Wi(v);if(x.type===pt)return l=null,x;const k=x.type,I=ao(Js(x)?x.type.__asyncResolved||{}:k),{include:O,exclude:w,max:E}=e;if(O&&(!I||!Za(O,I))||w&&I&&Za(w,I))return x.shapeFlag&=-257,l=x,v;const L=x.key==null?k:x.key,U=a.get(L);return x.el&&(x=Os(x),v.shapeFlag&128&&(v.ssContent=x)),T=L,U?(x.el=U.el,x.component=U.component,x.transition&&tn(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),E&&i.size>parseInt(E,10)&&g(i.values().next().value)),x.shapeFlag|=256,l=x,bl(v.type)?v:x}}},bv=vv;function Za(e,t){return he(e)?e.some(s=>Za(s,t)):Ee(e)?e.split(",").includes(t):Ag(e)?(e.lastIndex=0,e.test(t)):!1}function Ho(e,t){$f(e,"a",t)}function Vo(e,t){$f(e,"da",t)}function $f(e,t,s=It){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Ql(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Oi(a.parent.vnode)&&yv(n,t,s,a),a=a.parent}}function yv(e,t,s,n){const a=Ql(t,e,n,!0);ht(()=>{Eo(n[t],a)},s)}function wr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Wi(e){return e.shapeFlag&128?e.ssContent:e}function Ql(e,t,s=It,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Xs();const r=Ma(s),o=ns(t,s,e,l);return r(),en(),o});return n?a.unshift(i):a.push(i),i}}const nn=e=>(t,s=It)=>{(!zn||e==="sp")&&Ql(e,(...n)=>t(...n),s)},Uf=nn("bm"),He=nn("m"),jo=nn("bu"),Xl=nn("u"),er=nn("bum"),ht=nn("um"),Bf=nn("sp"),Hf=nn("rtg"),Vf=nn("rtc");function jf(e,t=It){Ql("ec",e,t)}const zo="components",xv="directives";function _v(e,t){return qo(zo,e,!0,t)||e}const zf=Symbol.for("v-ndc");function kv(e){return Ee(e)?qo(zo,e,!1)||e:e||zf}function wv(e){return qo(xv,e)}function qo(e,t,s=!0,n=!1){const a=Nt||It;if(a){const i=a.type;if(e===zo){const r=ao(i,!1);if(r&&(r===t||r===Qe(t)||r===Zn(Qe(t))))return i}const l=ou(a[e]||i[e],t)||ou(a.appContext[e],t);return!l&&n?i:l}}function ou(e,t){return e&&(e[t]||e[Qe(t)]||e[Zn(Qe(t))])}function Sv(e,t,s,n){let a;const i=s&&s[n],l=he(e);if(l||Ee(e)){const r=l&&Zs(e);let o=!1,c=!1;r&&(o=!es(e),c=Ns(e),e=Gl(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?_a(ys(e[u])):ys(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(ze(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Tv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(he(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Cv(e,t,s={},n,a){if(Nt.ce||Nt.parent&&Js(Nt.parent)&&Nt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),vi(),yl(Et,null,[it("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),vi();const l=i&&Ko(i(s)),r=s.key||l&&l.key,o=yl(Et,{key:(r&&!Ut(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Ko(e){return e.some(t=>sn(t)?!(t.type===pt||t.type===Et&&!Ko(t.children)):!0)?e:null}function Ev(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:ha(n)]=e[n];return s}const Jr=e=>e?xp(e)?Li(e):Jr(e.parent):null,si=Pe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Jr(e.parent),$root:e=>Jr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Go(e),$forceUpdate:e=>e.f||(e.f=()=>{Po(e.update)}),$nextTick:e=>e.n||(e.n=wt.bind(e.proxy)),$watch:e=>Jm.bind(e)}),Sr=(e,t)=>e!==Fe&&!e.__isScriptSetup&&Ke(e,t),Yr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Sr(n,t))return l[t]=1,n[t];if(a!==Fe&&Ke(a,t))return l[t]=2,a[t];if(Ke(i,t))return l[t]=3,i[t];if(s!==Fe&&Ke(s,t))return l[t]=4,s[t];Qr&&(l[t]=0)}}const c=si[t];let u,d;if(c)return t==="$attrs"&&Pt(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Fe&&Ke(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,Ke(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Sr(a,t)?(a[t]=s,!0):n!==Fe&&Ke(n,t)?(n[t]=s,!0):Ke(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Fe&&r[0]!=="$"&&Ke(e,r)||Sr(t,r)||Ke(i,r)||Ke(n,r)||Ke(si,r)||Ke(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:Ke(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Av=Pe({},Yr,{get(e,t){if(t!==Symbol.unscopables)return Yr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Mg(t)}});function Rv(){return null}function Iv(){return null}function Nv(e){}function Ov(e){}function Lv(){return null}function Dv(){}function Mv(e,t){return null}function Pv(){return qf().slots}function Fv(){return qf().attrs}function qf(e){const t=Kt();return t.setupContext||(t.setupContext=Sp(t))}function gi(e){return he(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function $v(e,t){const s=gi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?he(a)||Se(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Uv(e,t){return!e||!t?e||t:he(e)&&he(t)?e.concat(t):Pe({},gi(e),gi(t))}function Bv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Hv(e){const t=Kt(),s=zn;let n=e();yi(),s&&ya(!1);const a=()=>{Ma(t),s&&ya(!0)},i=()=>{Kt()!==t&&t.scope.off(),yi(),s&&ya(!1)};return Ao(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Qr=!0;function Vv(e){const t=Go(e),s=e.proxy,n=e.ctx;Qr=!1,t.beforeCreate&&cu(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:b,activated:g,deactivated:T,beforeDestroy:N,beforeUnmount:y,destroyed:v,unmounted:x,render:k,renderTracked:I,renderTriggered:O,errorCaptured:w,serverPrefetch:E,expose:L,inheritAttrs:U,components:F,directives:S,filters:M}=t;if(c&&jv(c,n,null),l)for(const D in l){const R=l[D];Se(R)&&(n[D]=R.bind(s))}if(a){const D=a.call(s,s);ze(D)&&(e.data=Sn(D))}if(Qr=!0,i)for(const D in i){const R=i[D],q=Se(R)?R.bind(s,s):Se(R.get)?R.get.bind(s,s):Ot,ce=!Se(R)&&Se(R.set)?R.set.bind(s):Ot,de=J({get:q,set:ce});Object.defineProperty(n,D,{enumerable:!0,configurable:!0,get:()=>de.value,set:se=>de.value=se})}if(r)for(const D in r)Kf(r[D],n,s,D);if(o){const D=Se(o)?o.call(s):o;Reflect.ownKeys(D).forEach(R=>{ti(R,D[R])})}u&&cu(u,e,"c");function W(D,R){he(R)?R.forEach(q=>D(q.bind(s))):R&&D(R.bind(s))}if(W(Uf,d),W(He,f),W(jo,p),W(Xl,b),W(Ho,g),W(Vo,T),W(jf,w),W(Vf,I),W(Hf,O),W(er,y),W(ht,x),W(Bf,E),he(L))if(L.length){const D=e.exposed||(e.exposed={});L.forEach(R=>{Object.defineProperty(D,R,{get:()=>s[R],set:q=>s[R]=q,enumerable:!0})})}else e.exposed||(e.exposed={});k&&e.render===Ot&&(e.render=k),U!=null&&(e.inheritAttrs=U),F&&(e.components=F),S&&(e.directives=S),E&&Bo(e)}function jv(e,t,s=Ot){he(e)&&(e=Xr(e));for(const n in e){const a=e[n];let i;ze(a)?"default"in a?i=ds(a.from||n,a.default,!0):i=ds(a.from||n):i=ds(a),bt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function cu(e,t,s){ns(he(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Kf(e,t,s,n){let a=n.includes(".")?Nf(s,n):()=>s[n];if(Ee(e)){const i=t[e];Se(i)&&fs(a,i)}else if(Se(e))fs(a,e.bind(s));else if(ze(e))if(he(e))e.forEach(i=>Kf(i,t,s,n));else{const i=Se(e.handler)?e.handler.bind(s):t[e.handler];Se(i)&&fs(a,i,e)}}function Go(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>ml(o,c,l,!0)),ml(o,t,l)),ze(t)&&i.set(t,o),o}function ml(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&ml(e,i,s,!0),a&&a.forEach(l=>ml(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=zv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const zv={data:uu,props:du,emits:du,methods:Ja,computed:Ja,beforeCreate:Ht,created:Ht,beforeMount:Ht,mounted:Ht,beforeUpdate:Ht,updated:Ht,beforeDestroy:Ht,beforeUnmount:Ht,destroyed:Ht,unmounted:Ht,activated:Ht,deactivated:Ht,errorCaptured:Ht,serverPrefetch:Ht,components:Ja,directives:Ja,watch:Kv,provide:uu,inject:qv};function uu(e,t){return t?e?function(){return Pe(Se(e)?e.call(this,this):e,Se(t)?t.call(this,this):t)}:t:e}function qv(e,t){return Ja(Xr(e),Xr(t))}function Xr(e){if(he(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Ht(e,t){return e?[...new Set([].concat(e,t))]:t}function Ja(e,t){return e?Pe(Object.create(null),e,t):t}function du(e,t){return e?he(e)&&he(t)?[...new Set([...e,...t])]:Pe(Object.create(null),gi(e),gi(t??{})):t}function Kv(e,t){if(!e)return t;if(!t)return e;const s=Pe(Object.create(null),e);for(const n in t)s[n]=Ht(e[n],t[n]);return s}function Gf(){return{app:null,config:{isNativeTag:ua,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Gv=0;function Wv(e,t){return function(n,a=null){Se(n)||(n=Pe({},n)),a!=null&&!ze(a)&&(a=null);const i=Gf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Gv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Cp,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&Se(u.install)?(l.add(u),u.install(c,...d)):Se(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||it(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,Li(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(ns(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=$n;$n=c;try{return u()}finally{$n=d}}};return c}}let $n=null;function Zv(e,t,s=Fe){const n=Kt(),a=Qe(t),i=Qt(t),l=Wf(e,a),r=xf((o,c)=>{let u,d=Fe,f;return If(()=>{const p=e[a];Ct(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const b=s.set?s.set(p):p;if(!Ct(b,u)&&!(d!==Fe&&Ct(p,d)))return;const g=n.vnode.props,T=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));T||(u=p,c()),n.emit(`update:${t}`,b),Ct(p,d)&&(Ct(p,b)&&!Ct(b,f)||T&&d!==Fe&&!Ct(b,u))&&c(),d=p,f=b}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Fe:r,done:!1}:{done:!0}}}},r}const Wf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Qe(t)}Modifiers`]||e[`${Qt(t)}Modifiers`];function Jv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Fe;let a=s;const i=t.startsWith("update:"),l=i&&Wf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Ee(u)?u.trim():u)),l.number&&(a=s.map(jl)));let r,o=n[r=ha(t)]||n[r=ha(Qe(t))];!o&&i&&(o=n[r=ha(Qt(t))]),o&&ns(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ns(c,e,6,a)}}const Yv=new WeakMap;function Zf(e,t,s=!1){const n=s?Yv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Se(e)){const o=c=>{const u=Zf(c,t,!0);u&&(r=!0,Pe(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(ze(e)&&n.set(e,null),null):(he(i)?i.forEach(o=>l[o]=null):Pe(l,i),ze(e)&&n.set(e,l),l)}function tr(e,t){return!e||!Gn(t)?!1:(t=t.slice(2).replace(/Once$/,""),Ke(e,t[0].toLowerCase()+t.slice(1))||Ke(e,Qt(t))||Ke(e,t))}function sl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:b,inheritAttrs:g}=e,T=hi(e);let N,y;try{if(s.shapeFlag&4){const x=a||n,k=x;N=Yt(c.call(k,x,u,d,p,f,b)),y=r}else{const x=t;N=Yt(x.length>1?x(d,{attrs:r,slots:l,emit:o}):x(d,null)),y=t.props?r:Xv(r)}}catch(x){ni.length=0,Jn(x,e,1),N=it(pt)}let v=N;if(y&&g!==!1){const x=Object.keys(y),{shapeFlag:k}=v;x.length&&k&7&&(i&&x.some(Ul)&&(y=eb(y,i)),v=Os(v,y,!1,!0))}return s.dirs&&(v=Os(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&tn(v,s.transition),N=v,hi(T),N}function Qv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(sn(a)){if(a.type!==pt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Xv=e=>{let t;for(const s in e)(s==="class"||s==="style"||Gn(s))&&((t||(t={}))[s]=e[s]);return t},eb=(e,t)=>{const s={};for(const n in e)(!Ul(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function tb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?fu(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(Jf(l,n,f)&&!tr(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?fu(n,l,c):!0:!!l;return!1}function fu(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Jf(t,e,i)&&!tr(s,i))return!0}return!1}function Jf(e,t,s){const n=e[s],a=t[s];return s==="style"&&ze(n)&&ze(a)?!Qs(n,a):n!==a}function sr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Yf={},Qf=()=>Object.create(Yf),Xf=e=>Object.getPrototypeOf(e)===Yf;function sb(e,t,s,n=!1){const a={},i=Qf();e.propsDefaults=Object.create(null),ep(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Lo(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function nb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Be(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(tr(e.emitsOptions,f))continue;const p=t[f];if(o)if(Ke(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const b=Qe(f);a[b]=eo(o,r,b,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{ep(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!Ke(t,d)&&((u=Qt(d))===d||!Ke(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=eo(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!Ke(t,d))&&(delete i[d],c=!0)}c&&js(e.attrs,"set","")}function ep(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(Ws(o))continue;const c=t[o];let u;a&&Ke(a,u=Qe(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:tr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Be(s),c=r||Fe;for(let u=0;u<i.length;u++){const d=i[u];s[d]=eo(a,o,d,c[d],e,!Ke(c,d))}}return l}function eo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=Ke(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Se(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Ma(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===Qt(s))&&(n=!0))}return n}const ab=new WeakMap;function tp(e,t,s=!1){const n=s?ab:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Se(e)){const u=d=>{o=!0;const[f,p]=tp(d,t,!0);Pe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return ze(e)&&n.set(e,fa),fa;if(he(i))for(let u=0;u<i.length;u++){const d=Qe(i[u]);pu(d)&&(l[d]=Fe)}else if(i)for(const u in i){const d=Qe(u);if(pu(d)){const f=i[u],p=l[d]=he(f)||Se(f)?{type:f}:Pe({},f),b=p.type;let g=!1,T=!0;if(he(b))for(let N=0;N<b.length;++N){const y=b[N],v=Se(y)&&y.name;if(v==="Boolean"){g=!0;break}else v==="String"&&(T=!1)}else g=Se(b)&&b.name==="Boolean";p[0]=g,p[1]=T,(g||Ke(p,"default"))&&r.push(d)}}const c=[l,r];return ze(e)&&n.set(e,c),c}function pu(e){return e[0]!=="$"&&!Ws(e)}const Wo=e=>e==="_"||e==="_ctx"||e==="$stable",Zo=e=>he(e)?e.map(Yt):[Yt(e)],ib=(e,t,s)=>{if(t._n)return t;const n=Fo((...a)=>Zo(t(...a)),s);return n._c=!1,n},sp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Wo(a))continue;const i=e[a];if(Se(i))t[a]=ib(a,i,n);else if(i!=null){const l=Zo(i);t[a]=()=>l}}},np=(e,t)=>{const s=Zo(t);e.slots.default=()=>s},ap=(e,t,s)=>{for(const n in t)(s||!Wo(n))&&(e[n]=t[n])},lb=(e,t,s)=>{const n=e.slots=Qf();if(e.vnode.shapeFlag&32){const a=t._;a?(ap(n,t,s),s&&Zd(n,"_",a,!0)):sp(t,n)}else t&&np(e,t)},rb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Fe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:ap(a,t,s):(i=!t.$stable,sp(t,a)),l=t}else t&&(np(e,t),l={default:1});if(i)for(const r in a)!Wo(r)&&l[r]==null&&delete a[r]},mt=fp;function ip(e){return rp(e)}function lp(e){return rp(e,lv)}function rp(e,t){const s=zl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=Ot,insertStaticContent:b}=e,g=(m,C,P,Z=null,A=null,$=null,Y=void 0,ee=null,te=!!C.dynamicChildren)=>{if(m===C)return;m&&!ms(m,C)&&(Z=j(m),se(m,A,$,!0),m=null),C.patchFlag===-2&&(te=!1,C.dynamicChildren=null);const{type:X,ref:ge,shapeFlag:ie}=C;switch(X){case _n:T(m,C,P,Z);break;case pt:N(m,C,P,Z);break;case Un:m==null&&y(C,P,Z,Y);break;case Et:F(m,C,P,Z,A,$,Y,ee,te);break;default:ie&1?k(m,C,P,Z,A,$,Y,ee,te):ie&6?S(m,C,P,Z,A,$,Y,ee,te):(ie&64||ie&128)&&X.process(m,C,P,Z,A,$,Y,ee,te,me)}ge!=null&&A?va(ge,m&&m.ref,$,C||m,!C):ge==null&&m&&m.ref!=null&&va(m.ref,null,$,m,!0)},T=(m,C,P,Z)=>{if(m==null)n(C.el=r(C.children),P,Z);else{const A=C.el=m.el;C.children!==m.children&&c(A,C.children)}},N=(m,C,P,Z)=>{m==null?n(C.el=o(C.children||""),P,Z):C.el=m.el},y=(m,C,P,Z)=>{[m.el,m.anchor]=b(m.children,C,P,Z,m.el,m.anchor)},v=({el:m,anchor:C},P,Z)=>{let A;for(;m&&m!==C;)A=f(m),n(m,P,Z),m=A;n(C,P,Z)},x=({el:m,anchor:C})=>{let P;for(;m&&m!==C;)P=f(m),a(m),m=P;a(C)},k=(m,C,P,Z,A,$,Y,ee,te)=>{if(C.type==="svg"?Y="svg":C.type==="math"&&(Y="mathml"),m==null)I(C,P,Z,A,$,Y,ee,te);else{const X=m.el&&m.el._isVueCE?m.el:null;try{X&&X._beginPatch(),E(m,C,A,$,Y,ee,te)}finally{X&&X._endPatch()}}},I=(m,C,P,Z,A,$,Y,ee)=>{let te,X;const{props:ge,shapeFlag:ie,transition:fe,dirs:xe}=m;if(te=m.el=l(m.type,$,ge&&ge.is,ge),ie&8?u(te,m.children):ie&16&&w(m.children,te,null,Z,A,Tr(m,$),Y,ee),xe&&As(m,null,Z,"created"),O(te,m,m.scopeId,Y,Z),ge){for(const Ae in ge)Ae!=="value"&&!Ws(Ae)&&i(te,Ae,null,ge[Ae],$,Z);"value"in ge&&i(te,"value",null,ge.value,$),(X=ge.onVnodeBeforeMount)&&Zt(X,Z,m)}xe&&As(m,null,Z,"beforeMount");const we=op(A,fe);we&&fe.beforeEnter(te),n(te,C,P),((X=ge&&ge.onVnodeMounted)||we||xe)&&mt(()=>{try{X&&Zt(X,Z,m),we&&fe.enter(te),xe&&As(m,null,Z,"mounted")}finally{}},A)},O=(m,C,P,Z,A)=>{if(P&&p(m,P),Z)for(let $=0;$<Z.length;$++)p(m,Z[$]);if(A){let $=A.subTree;if(C===$||bl($.type)&&($.ssContent===C||$.ssFallback===C)){const Y=A.vnode;O(m,Y,Y.scopeId,Y.slotScopeIds,A.parent)}}},w=(m,C,P,Z,A,$,Y,ee,te=0)=>{for(let X=te;X<m.length;X++){const ge=m[X]=ee?Hs(m[X]):Yt(m[X]);g(null,ge,C,P,Z,A,$,Y,ee)}},E=(m,C,P,Z,A,$,Y)=>{const ee=C.el=m.el;let{patchFlag:te,dynamicChildren:X,dirs:ge}=C;te|=m.patchFlag&16;const ie=m.props||Fe,fe=C.props||Fe;let xe;if(P&&Rn(P,!1),(xe=fe.onVnodeBeforeUpdate)&&Zt(xe,P,C,m),ge&&As(C,m,P,"beforeUpdate"),P&&Rn(P,!0),(ie.innerHTML&&fe.innerHTML==null||ie.textContent&&fe.textContent==null)&&u(ee,""),X?L(m.dynamicChildren,X,ee,P,Z,Tr(C,A),$):Y||R(m,C,ee,null,P,Z,Tr(C,A),$,!1),te>0){if(te&16)U(ee,ie,fe,P,A);else if(te&2&&ie.class!==fe.class&&i(ee,"class",null,fe.class,A),te&4&&i(ee,"style",ie.style,fe.style,A),te&8){const we=C.dynamicProps;for(let Ae=0;Ae<we.length;Ae++){const B=we[Ae],oe=ie[B],_e=fe[B];(_e!==oe||B==="value")&&i(ee,B,oe,_e,A,P)}}te&1&&m.children!==C.children&&u(ee,C.children)}else!Y&&X==null&&U(ee,ie,fe,P,A);((xe=fe.onVnodeUpdated)||ge)&&mt(()=>{xe&&Zt(xe,P,C,m),ge&&As(C,m,P,"updated")},Z)},L=(m,C,P,Z,A,$,Y)=>{for(let ee=0;ee<C.length;ee++){const te=m[ee],X=C[ee],ge=te.el&&(te.type===Et||!ms(te,X)||te.shapeFlag&198)?d(te.el):P;g(te,X,ge,null,Z,A,$,Y,!0)}},U=(m,C,P,Z,A)=>{if(C!==P){if(C!==Fe)for(const $ in C)!Ws($)&&!($ in P)&&i(m,$,C[$],null,A,Z);for(const $ in P){if(Ws($))continue;const Y=P[$],ee=C[$];Y!==ee&&$!=="value"&&i(m,$,ee,Y,A,Z)}"value"in P&&i(m,"value",C.value,P.value,A)}},F=(m,C,P,Z,A,$,Y,ee,te)=>{const X=C.el=m?m.el:r(""),ge=C.anchor=m?m.anchor:r("");let{patchFlag:ie,dynamicChildren:fe,slotScopeIds:xe}=C;xe&&(ee=ee?ee.concat(xe):xe),m==null?(n(X,P,Z),n(ge,P,Z),w(C.children||[],P,ge,A,$,Y,ee,te)):ie>0&&ie&64&&fe&&m.dynamicChildren&&m.dynamicChildren.length===fe.length?(L(m.dynamicChildren,fe,P,A,$,Y,ee),(C.key!=null||A&&C===A.subTree)&&Jo(m,C,!0)):R(m,C,P,ge,A,$,Y,ee,te)},S=(m,C,P,Z,A,$,Y,ee,te)=>{C.slotScopeIds=ee,m==null?C.shapeFlag&512?A.ctx.activate(C,P,Z,Y,te):M(C,P,Z,A,$,Y,te):H(m,C,te)},M=(m,C,P,Z,A,$,Y)=>{const ee=m.component=yp(m,Z,A);if(Oi(m)&&(ee.ctx.renderer=me),_p(ee,!1,Y),ee.asyncDep){if(A&&A.registerDep(ee,W,Y),!m.el){const te=ee.subTree=it(pt);N(null,te,C,P),m.placeholder=te.el}}else W(ee,m,C,P,A,$,Y)},H=(m,C,P)=>{const Z=C.component=m.component;if(tb(m,C,P))if(Z.asyncDep&&!Z.asyncResolved){D(Z,C,P);return}else Z.next=C,Z.update();else C.el=m.el,Z.vnode=C},W=(m,C,P,Z,A,$,Y)=>{const ee=()=>{if(m.isMounted){let{next:ie,bu:fe,u:xe,parent:we,vnode:Ae}=m;{const Ue=cp(m);if(Ue){ie&&(ie.el=Ae.el,D(m,ie,Y)),Ue.asyncDep.then(()=>{mt(()=>{m.isUnmounted||X()},A)});return}}let B=ie,oe;Rn(m,!1),ie?(ie.el=Ae.el,D(m,ie,Y)):ie=Ae,fe&&ga(fe),(oe=ie.props&&ie.props.onVnodeBeforeUpdate)&&Zt(oe,we,ie,Ae),Rn(m,!0);const _e=sl(m),Me=m.subTree;m.subTree=_e,g(Me,_e,d(Me.el),j(Me),m,A,$),ie.el=_e.el,B===null&&sr(m,_e.el),xe&&mt(xe,A),(oe=ie.props&&ie.props.onVnodeUpdated)&&mt(()=>Zt(oe,we,ie,Ae),A)}else{let ie;const{el:fe,props:xe}=C,{bm:we,m:Ae,parent:B,root:oe,type:_e}=m,Me=Js(C);if(Rn(m,!1),we&&ga(we),!Me&&(ie=xe&&xe.onVnodeBeforeMount)&&Zt(ie,B,C),Rn(m,!0),fe&&Oe){const Ue=()=>{m.subTree=sl(m),Oe(fe,m.subTree,m,A,null)};Me&&_e.__asyncHydrate?_e.__asyncHydrate(fe,m,Ue):Ue()}else{oe.ce&&oe.ce._hasShadowRoot()&&oe.ce._injectChildStyle(_e,m.parent?m.parent.type:void 0);const Ue=m.subTree=sl(m);g(null,Ue,P,Z,m,A,$),C.el=Ue.el}if(Ae&&mt(Ae,A),!Me&&(ie=xe&&xe.onVnodeMounted)){const Ue=C;mt(()=>Zt(ie,B,Ue),A)}(C.shapeFlag&256||B&&Js(B.vnode)&&B.vnode.shapeFlag&256)&&m.a&&mt(m.a,A),m.isMounted=!0,C=P=Z=null}};m.scope.on();const te=m.effect=new ci(ee);m.scope.off();const X=m.update=te.run.bind(te),ge=m.job=te.runIfDirty.bind(te);ge.i=m,ge.id=m.uid,te.scheduler=()=>Po(ge),Rn(m,!0),X()},D=(m,C,P)=>{C.component=m;const Z=m.vnode.props;m.vnode=C,m.next=null,nb(m,C.props,Z,P),rb(m,C.children,P),Xs(),eu(m),en()},R=(m,C,P,Z,A,$,Y,ee,te=!1)=>{const X=m&&m.children,ge=m?m.shapeFlag:0,ie=C.children,{patchFlag:fe,shapeFlag:xe}=C;if(fe>0){if(fe&128){ce(X,ie,P,Z,A,$,Y,ee,te);return}else if(fe&256){q(X,ie,P,Z,A,$,Y,ee,te);return}}xe&8?(ge&16&&Ie(X,A,$),ie!==X&&u(P,ie)):ge&16?xe&16?ce(X,ie,P,Z,A,$,Y,ee,te):Ie(X,A,$,!0):(ge&8&&u(P,""),xe&16&&w(ie,P,Z,A,$,Y,ee,te))},q=(m,C,P,Z,A,$,Y,ee,te)=>{m=m||fa,C=C||fa;const X=m.length,ge=C.length,ie=Math.min(X,ge);let fe;for(fe=0;fe<ie;fe++){const xe=C[fe]=te?Hs(C[fe]):Yt(C[fe]);g(m[fe],xe,P,null,A,$,Y,ee,te)}X>ge?Ie(m,A,$,!0,!1,ie):w(C,P,Z,A,$,Y,ee,te,ie)},ce=(m,C,P,Z,A,$,Y,ee,te)=>{let X=0;const ge=C.length;let ie=m.length-1,fe=ge-1;for(;X<=ie&&X<=fe;){const xe=m[X],we=C[X]=te?Hs(C[X]):Yt(C[X]);if(ms(xe,we))g(xe,we,P,null,A,$,Y,ee,te);else break;X++}for(;X<=ie&&X<=fe;){const xe=m[ie],we=C[fe]=te?Hs(C[fe]):Yt(C[fe]);if(ms(xe,we))g(xe,we,P,null,A,$,Y,ee,te);else break;ie--,fe--}if(X>ie){if(X<=fe){const xe=fe+1,we=xe<ge?C[xe].el:Z;for(;X<=fe;)g(null,C[X]=te?Hs(C[X]):Yt(C[X]),P,we,A,$,Y,ee,te),X++}}else if(X>fe)for(;X<=ie;)se(m[X],A,$,!0),X++;else{const xe=X,we=X,Ae=new Map;for(X=we;X<=fe;X++){const We=C[X]=te?Hs(C[X]):Yt(C[X]);We.key!=null&&Ae.set(We.key,X)}let B,oe=0;const _e=fe-we+1;let Me=!1,Ue=0;const Ve=new Array(_e);for(X=0;X<_e;X++)Ve[X]=0;for(X=xe;X<=ie;X++){const We=m[X];if(oe>=_e){se(We,A,$,!0);continue}let Xe;if(We.key!=null)Xe=Ae.get(We.key);else for(B=we;B<=fe;B++)if(Ve[B-we]===0&&ms(We,C[B])){Xe=B;break}Xe===void 0?se(We,A,$,!0):(Ve[Xe-we]=X+1,Xe>=Ue?Ue=Xe:Me=!0,g(We,C[Xe],P,null,A,$,Y,ee,te),oe++)}const ut=Me?ob(Ve):fa;for(B=ut.length-1,X=_e-1;X>=0;X--){const We=we+X,Xe=C[We],_s=C[We+1],Ls=We+1<ge?_s.el||up(_s):Z;Ve[X]===0?g(null,Xe,P,Ls,A,$,Y,ee,te):Me&&(B<0||X!==ut[B]?de(Xe,P,Ls,2):B--)}}},de=(m,C,P,Z,A=null)=>{const{el:$,type:Y,transition:ee,children:te,shapeFlag:X}=m;if(X&6){de(m.component.subTree,C,P,Z);return}if(X&128){m.suspense.move(C,P,Z);return}if(X&64){Y.move(m,C,P,me);return}if(Y===Et){n($,C,P);for(let ie=0;ie<te.length;ie++)de(te[ie],C,P,Z);n(m.anchor,C,P);return}if(Y===Un){v(m,C,P);return}if(Z!==2&&X&1&&ee)if(Z===0)ee.persisted&&!$[os]?n($,C,P):(ee.beforeEnter($),n($,C,P),mt(()=>ee.enter($),A));else{const{leave:ie,delayLeave:fe,afterLeave:xe}=ee,we=()=>{m.ctx.isUnmounted?a($):n($,C,P)},Ae=()=>{const B=$._isLeaving||!!$[os];$._isLeaving&&$[os](!0),ee.persisted&&!B?we():ie($,()=>{we(),xe&&xe()})};fe?fe($,we,Ae):Ae()}else n($,C,P)},se=(m,C,P,Z=!1,A=!1)=>{const{type:$,props:Y,ref:ee,children:te,dynamicChildren:X,shapeFlag:ge,patchFlag:ie,dirs:fe,cacheIndex:xe,memo:we}=m;if(ie===-2&&(A=!1),ee!=null&&(Xs(),va(ee,null,P,m,!0),en()),xe!=null&&(C.renderCache[xe]=void 0),ge&256){C.ctx.deactivate(m);return}const Ae=ge&1&&fe,B=!Js(m);let oe;if(B&&(oe=Y&&Y.onVnodeBeforeUnmount)&&Zt(oe,C,m),ge&6)ue(m.component,P,Z);else{if(ge&128){m.suspense.unmount(P,Z);return}Ae&&As(m,null,C,"beforeUnmount"),ge&64?m.type.remove(m,C,P,me,Z):X&&!X.hasOnce&&($!==Et||ie>0&&ie&64)?Ie(X,C,P,!1,!0):($===Et&&ie&384||!A&&ge&16)&&Ie(te,C,P),Z&&pe(m)}const _e=we!=null&&xe==null;(B&&(oe=Y&&Y.onVnodeUnmounted)||Ae||_e)&&mt(()=>{oe&&Zt(oe,C,m),Ae&&As(m,null,C,"unmounted"),_e&&(m.el=null)},P)},pe=m=>{const{type:C,el:P,anchor:Z,transition:A}=m;if(C===Et){Q(P,Z);return}if(C===Un){x(m);return}const $=()=>{a(P),A&&!A.persisted&&A.afterLeave&&A.afterLeave()};if(m.shapeFlag&1&&A&&!A.persisted){const{leave:Y,delayLeave:ee}=A,te=()=>Y(P,$);ee?ee(m.el,$,te):te()}else $()},Q=(m,C)=>{let P;for(;m!==C;)P=f(m),a(m),m=P;a(C)},ue=(m,C,P)=>{const{bum:Z,scope:A,job:$,subTree:Y,um:ee,m:te,a:X}=m;vl(te),vl(X),Z&&ga(Z),A.stop(),$&&($.flags|=8,se(Y,m,C,P)),ee&&mt(ee,C),mt(()=>{m.isUnmounted=!0},C)},Ie=(m,C,P,Z=!1,A=!1,$=0)=>{for(let Y=$;Y<m.length;Y++)se(m[Y],C,P,Z,A)},j=m=>{if(m.shapeFlag&6)return j(m.component.subTree);if(m.shapeFlag&128)return m.suspense.next();const C=f(m.anchor||m.el),P=C&&C[Of];return P?f(P):C};let re=!1;const le=(m,C,P)=>{let Z;m==null?C._vnode&&(se(C._vnode,null,null,!0),Z=C._vnode.component):g(C._vnode||null,m,C,null,null,null,P),C._vnode=m,re||(re=!0,eu(Z),hl(),re=!1)},me={p:g,um:se,m:de,r:pe,mt:M,mc:w,pc:R,pbc:L,n:j,o:e};let be,Oe;return t&&([be,Oe]=t(me)),{render:le,hydrate:be,createApp:Wv(le,be)}}function Tr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function op(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Jo(e,t,s=!1){const n=e.children,a=t.children;if(he(n)&&he(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=Hs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Jo(l,r)),r.type===_n&&(r.patchFlag===-1&&(r=a[i]=Hs(r)),r.el=l.el),r.type===pt&&!r.el&&(r.el=l.el)}}function ob(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function cp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:cp(t)}function vl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function up(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?up(t.subTree):null}const bl=e=>e.__isSuspense;let to=0;const cb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)db(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}fb(e,t,s,n,a,l,r,o,c)}},hydrate:pb,normalize:hb},ub=cb;function mi(e,t){const s=e.props&&e.props[t];Se(s)&&s()}function db(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=dp(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(mi(e,"onPending"),mi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ba(f,e.ssFallback)):f.resolve(!1,!0)}function fb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:b,pendingBranch:g,isInFallback:T,isHydrating:N}=d;if(g)d.pendingBranch=f,ms(g,f)?(o(g,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():T&&(N||(o(b,p,s,n,a,null,i,l,r),ba(d,p)))):(d.pendingId=to++,N?(d.isHydrating=!1,d.activeBranch=g):c(g,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),T?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(b,p,s,n,a,null,i,l,r),ba(d,p))):b&&ms(b,f)?(o(b,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(b&&ms(b,f))o(b,f,s,n,a,d,i,l,r),ba(d,f);else if(mi(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=to++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:y,pendingId:v}=d;y>0?setTimeout(()=>{d.pendingId===v&&d.fallback(p)},y):y===0&&d.fallback(p)}}function dp(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:b,o:{parentNode:g,remove:T}}=c;let N;const y=gb(e);y&&t&&t.pendingBranch&&(N=t.pendingId,t.deps++);const v=e.props?cl(e.props.timeout):void 0,x=i,k={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:to++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(I=!1,O=!1){const{vnode:w,activeBranch:E,pendingBranch:L,pendingId:U,effects:F,parentComponent:S,container:M,isInFallback:H}=k;let W=!1;if(k.isHydrating)k.isHydrating=!1;else if(!I){W=E&&L.transition&&L.transition.mode==="out-in";let q=!1;W&&(E.transition.afterLeave=()=>{U===k.pendingId&&(f(L,M,i===x&&!q?b(E):i,0),fi(F),H&&w.ssFallback&&(w.ssFallback.el=null))}),E&&!k.isFallbackMountPending&&(g(E.el)===M&&(i=b(E),q=!0),p(E,S,k,!0),!W&&H&&w.ssFallback&&mt(()=>w.ssFallback.el=null,k)),W||f(L,M,i,0)}k.isFallbackMountPending=!1,ba(k,L),k.pendingBranch=null,k.isInFallback=!1;let D=k.parent,R=!1;for(;D;){if(D.pendingBranch){D.effects.push(...F),R=!0;break}D=D.parent}!R&&!W&&fi(F),k.effects=[],y&&t&&t.pendingBranch&&N===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),mi(w,"onResolve")},fallback(I){if(!k.pendingBranch)return;const{vnode:O,activeBranch:w,parentComponent:E,container:L,namespace:U}=k;mi(O,"onFallback");const F=b(w),S=()=>{k.isFallbackMountPending=!1,k.isInFallback&&(d(null,I,L,F,E,null,U,r,o),ba(k,I))},M=I.transition&&I.transition.mode==="out-in";M&&(k.isFallbackMountPending=!0,w.transition.afterLeave=S),k.isInFallback=!0,p(w,E,null,!0),M||S()},move(I,O,w){k.activeBranch&&f(k.activeBranch,I,O,w),k.container=I},next(){return k.activeBranch&&b(k.activeBranch)},registerDep(I,O,w){const E=!!k.pendingBranch;E&&k.deps++;const L=I.vnode.el;I.asyncDep.catch(U=>{Jn(U,I,0)}).then(U=>{if(I.isUnmounted||k.isUnmounted||k.pendingId!==I.suspenseId)return;yi(),I.asyncResolved=!0;const{vnode:F}=I;so(I,U,!1),L&&(F.el=L);const S=!L&&I.subTree.el;O(I,F,g(L||I.subTree.el),L?null:b(I.subTree),k,l,w),S&&(F.placeholder=null,T(S)),sr(I,F.el),E&&--k.deps===0&&k.resolve()})},unmount(I,O){k.isUnmounted=!0,k.activeBranch&&p(k.activeBranch,s,I,O),k.pendingBranch&&p(k.pendingBranch,s,I,O)}};return k}function pb(e,t,s,n,a,i,l,r,o){const c=t.suspense=dp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function hb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=hu(n?s.default:s),e.ssFallback=n?hu(s.fallback):it(pt)}function hu(e){let t;if(Se(e)){const s=jn&&e._c;s&&(e._d=!1,vi()),e=e(),s&&(e._d=!0,t=Ft,pp())}return he(e)&&(e=Qv(e)),e=Yt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function fp(e,t){t&&t.pendingBranch?he(e)?t.effects.push(...e):t.effects.push(e):fi(e)}function ba(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,sr(n,a))}function gb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Et=Symbol.for("v-fgt"),_n=Symbol.for("v-txt"),pt=Symbol.for("v-cmt"),Un=Symbol.for("v-stc"),ni=[];let Ft=null;function vi(e=!1){ni.push(Ft=e?null:[])}function pp(){ni.pop(),Ft=ni[ni.length-1]||null}let jn=1;function bi(e,t=!1){jn+=e,e<0&&Ft&&t&&(Ft.hasOnce=!0)}function hp(e){return e.dynamicChildren=jn>0?Ft||fa:null,pp(),jn>0&&Ft&&Ft.push(e),e}function mb(e,t,s,n,a,i){return hp(Yo(e,t,s,n,a,i,!0))}function yl(e,t,s,n,a){return hp(it(e,t,s,n,a,!0))}function sn(e){return e?e.__v_isVNode===!0:!1}function ms(e,t){return e.type===t.type&&e.key===t.key}function vb(e){}const gp=({key:e})=>e??null,nl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ee(e)||bt(e)||Se(e)?{i:Nt,r:e,k:t,f:!!s}:e:null);function Yo(e,t=null,s=null,n=0,a=null,i=e===Et?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&gp(t),ref:t&&nl(t),scopeId:Jl,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Nt};return r?(Xo(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Ee(s)?8:16),jn>0&&!l&&Ft&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Ft.push(o),o}const it=bb;function bb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===zf)&&(e=pt),sn(e)){const r=Os(e,t,!0);return s&&Xo(r,s),jn>0&&!i&&Ft&&(r.shapeFlag&6?Ft[Ft.indexOf(e)]=r:Ft.push(r)),r.patchFlag=-2,r}if(Tb(e)&&(e=e.__vccOpts),t){t=mp(t);let{class:r,style:o}=t;r&&!Ee(r)&&(t.class=Ai(r)),ze(o)&&(Ri(o)&&!he(o)&&(o=Pe({},o)),t.style=Ei(o))}const l=Ee(e)?1:bl(e)?128:Lf(e)?64:ze(e)?4:Se(e)?2:0;return Yo(e,t,s,n,a,l,i,!0)}function mp(e){return e?Ri(e)||Xf(e)?Pe({},e):e:null}function Os(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?bp(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&gp(c),ref:t&&t.ref?s&&i?he(i)?i.concat(nl(t)):[i,nl(t)]:nl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Et?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Os(e.ssContent),ssFallback:e.ssFallback&&Os(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&tn(u,o.clone(u)),u}function Qo(e=" ",t=0){return it(_n,null,e,t)}function yb(e,t){const s=it(Un,null,e);return s.staticCount=t,s}function vp(e="",t=!1){return t?(vi(),yl(pt,null,e)):it(pt,null,e)}function Yt(e){return e==null||typeof e=="boolean"?it(pt):he(e)?it(Et,null,e.slice()):sn(e)?Hs(e):it(_n,null,String(e))}function Hs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Os(e)}function Xo(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(he(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Xo(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Xf(t)?t._ctx=Nt:a===3&&Nt&&(Nt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Se(t)?(t={default:t,_ctx:Nt},s=32):(t=String(t),n&64?(s=16,t=[Qo(t)]):s=8);e.children=t,e.shapeFlag|=s}function bp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Ai([t.class,n.class]));else if(a==="style")t.style=Ei([t.style,n.style]);else if(Gn(a)){const i=t[a],l=n[a];l&&i!==l&&!(he(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Ul(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Zt(e,t,s,n=null){ns(e,t,7,[s,n])}const xb=Gf();let _b=0;function yp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||xb,i={uid:_b++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Ro(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:tp(n,a),emitsOptions:Zf(n,a),emit:null,emitted:null,propsDefaults:Fe,inheritAttrs:n.inheritAttrs,ctx:Fe,data:Fe,props:Fe,attrs:Fe,slots:Fe,refs:Fe,setupState:Fe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Jv.bind(null,i),e.ce&&e.ce(i),i}let It=null;const Kt=()=>It||Nt;let xl,ya;{const e=zl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};xl=t("__VUE_INSTANCE_SETTERS__",s=>It=s),ya=t("__VUE_SSR_SETTERS__",s=>zn=s)}const Ma=e=>{const t=It;return xl(e),e.scope.on(),()=>{e.scope.off(),xl(t)}},yi=()=>{It&&It.scope.off(),xl(null)};function xp(e){return e.vnode.shapeFlag&4}let zn=!1;function _p(e,t=!1,s=!1){t&&ya(t);const{props:n,children:a}=e.vnode,i=xp(e);sb(e,n,i,t),lb(e,a,s||t);const l=i?kb(e,t):void 0;return t&&ya(!1),l}function kb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Yr);const{setup:n}=s;if(n){Xs();const a=e.setupContext=n.length>1?Sp(e):null,i=Ma(e),l=Da(n,e,0,[e.props,a]),r=Ao(l);if(en(),i(),(r||e.sp)&&!Js(e)&&Bo(e),r){if(l.then(yi,yi),t)return l.then(o=>{so(e,o,t)}).catch(o=>{Jn(o,e,0)});e.asyncDep=l}else so(e,l,t)}else wp(e,t)}function so(e,t,s){Se(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:ze(t)&&(e.setupState=Mo(t)),wp(e,s)}let _l,no;function kp(e){_l=e,no=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Av))}}const wb=()=>!_l;function wp(e,t,s){const n=e.type;if(!e.render){if(!t&&_l&&!n.render){const a=n.template||Go(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Pe(Pe({isCustomElement:i,delimiters:r},l),o);n.render=_l(a,c)}}e.render=n.render||Ot,no&&no(e)}{const a=Ma(e);Xs();try{Vv(e)}finally{en(),a()}}}const Sb={get(e,t){return Pt(e,"get",""),e[t]}};function Sp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Sb),slots:e.slots,emit:e.emit,expose:t}}function Li(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Mo(bf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in si)return si[s](e)},has(t,s){return s in t||s in si}})):e.proxy}function ao(e,t=!0){return Se(e)?e.displayName||e.name:e.name||t&&e.__name}function Tb(e){return Se(e)&&"__vccOpts"in e}const J=(e,t)=>Nm(e,t,zn);function wa(e,t,s){try{bi(-1);const n=arguments.length;return n===2?ze(t)&&!he(t)?sn(t)?it(e,null,[t]):it(e,t):it(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&sn(s)&&(s=[s]),it(e,t,s))}finally{bi(1)}}function Cb(){}function Eb(e,t,s,n){const a=s[n];if(a&&Tp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Tp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Ct(s[n],t[n]))return!1;return jn>0&&Ft&&Ft.push(e),!0}const Cp="3.5.38",Ab=Ot,Rb=Bm,Ib=ra,Nb=Ef,Ob={createComponentInstance:yp,setupComponent:_p,renderComponentRoot:sl,setCurrentRenderingInstance:hi,isVNode:sn,normalizeVNode:Yt,getComponentPublicInstance:Li,ensureValidVNode:Ko,pushWarningContext:Pm,popWarningContext:Fm},Lb=Ob,Db=null,Mb=null,Pb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let io;const gu=typeof window<"u"&&window.trustedTypes;if(gu)try{io=gu.createPolicy("vue",{createHTML:e=>e})}catch{}const Ep=io?e=>io.createHTML(e):e=>e,Fb="http://www.w3.org/2000/svg",$b="http://www.w3.org/1998/Math/MathML",Bs=typeof document<"u"?document:null,mu=Bs&&Bs.createElement("template"),Ap={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?Bs.createElementNS(Fb,e):t==="mathml"?Bs.createElementNS($b,e):s?Bs.createElement(e,{is:s}):Bs.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>Bs.createTextNode(e),createComment:e=>Bs.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Bs.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{mu.innerHTML=Ep(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=mu.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},fn="transition",Ha="animation",Sa=Symbol("_vtc"),Rp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Ip=Pe({},Uo,Rp),Ub=e=>(e.displayName="Transition",e.props=Ip,e),Bb=Ub((e,{slots:t})=>wa(Pf,Np(e),t)),In=(e,t=[])=>{he(e)?e.forEach(s=>s(...t)):e&&e(...t)},vu=e=>e?he(e)?e.some(t=>t.length>1):e.length>1:!1;function Np(e){const t={};for(const F in e)F in Rp||(t[F]=e[F]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,b=Hb(a),g=b&&b[0],T=b&&b[1],{onBeforeEnter:N,onEnter:y,onEnterCancelled:v,onLeave:x,onLeaveCancelled:k,onBeforeAppear:I=N,onAppear:O=y,onAppearCancelled:w=v}=t,E=(F,S,M,H)=>{F._enterCancelled=H,mn(F,S?u:r),mn(F,S?c:l),M&&M()},L=(F,S)=>{F._isLeaving=!1,mn(F,d),mn(F,p),mn(F,f),S&&S()},U=F=>(S,M)=>{const H=F?O:y,W=()=>E(S,F,M);In(H,[S,W]),bu(()=>{mn(S,F?o:i),Ss(S,F?u:r),vu(H)||yu(S,n,g,W)})};return Pe(t,{onBeforeEnter(F){In(N,[F]),Ss(F,i),Ss(F,l)},onBeforeAppear(F){In(I,[F]),Ss(F,o),Ss(F,c)},onEnter:U(!1),onAppear:U(!0),onLeave(F,S){F._isLeaving=!0;const M=()=>L(F,S);Ss(F,d),F._enterCancelled?(Ss(F,f),lo(F)):(lo(F),Ss(F,f)),bu(()=>{F._isLeaving&&(mn(F,d),Ss(F,p),vu(x)||yu(F,n,T,M))}),In(x,[F,M])},onEnterCancelled(F){E(F,!1,void 0,!0),In(v,[F])},onAppearCancelled(F){E(F,!0,void 0,!0),In(w,[F])},onLeaveCancelled(F){L(F),In(k,[F])}})}function Hb(e){if(e==null)return null;if(ze(e))return[Cr(e.enter),Cr(e.leave)];{const t=Cr(e);return[t,t]}}function Cr(e){return cl(e)}function Ss(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Sa]||(e[Sa]=new Set)).add(t)}function mn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Sa];s&&(s.delete(t),s.size||(e[Sa]=void 0))}function bu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Vb=0;function yu(e,t,s,n){const a=e._endId=++Vb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Op(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Op(e,t){const s=window.getComputedStyle(e),n=b=>(s[b]||"").split(", "),a=n(`${fn}Delay`),i=n(`${fn}Duration`),l=xu(a,i),r=n(`${Ha}Delay`),o=n(`${Ha}Duration`),c=xu(r,o);let u=null,d=0,f=0;t===fn?l>0&&(u=fn,d=l,f=i.length):t===Ha?c>0&&(u=Ha,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?fn:Ha:null,f=u?u===fn?i.length:o.length:0);const p=u===fn&&/\b(?:transform|all)(?:,|$)/.test(n(`${fn}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function xu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>_u(s)+_u(e[n])))}function _u(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function lo(e){return(e?e.ownerDocument:document).body.offsetHeight}function jb(e,t,s){const n=e[Sa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const kl=Symbol("_vod"),ec=Symbol("_vsh"),Lp={name:"show",beforeMount(e,{value:t},{transition:s}){e[kl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Va(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Va(e,!0),n.enter(e)):n.leave(e,()=>{Va(e,!1)}):Va(e,t))},beforeUnmount(e,{value:t}){Va(e,t)}};function Va(e,t){e.style.display=t?e[kl]:"none",e[ec]=!t}function zb(){Lp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Dp=Symbol("");function qb(e){const t=Kt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>wl(i,a))},n=()=>{const a=e(t.proxy);t.ce?wl(t.ce,a):ro(t.subTree,a),s(a)};jo(()=>{fi(n)}),He(()=>{fs(n,Ot,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ht(()=>a.disconnect())})}function ro(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{ro(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)wl(e.el,t);else if(e.type===Et)e.children.forEach(s=>ro(s,t));else if(e.type===Un){let{el:s,anchor:n}=e;for(;s&&(wl(s,t),s!==n);)s=s.nextSibling}}function wl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Yg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Dp]=n}}const Kb=/(?:^|;)\s*display\s*:/;function Gb(e,t,s){const n=e.style,a=Ee(s);let i=!1;if(s&&!a){if(t)if(Ee(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Ya(n,r,"")}else for(const l in t)s[l]==null&&Ya(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Zb(e,l,!Ee(t)&&t?t[l]:void 0,r)||Ya(n,l,r):Ya(n,l,"")}}else if(a){if(t!==s){const l=n[Dp];l&&(s+=";"+l),n.cssText=s,i=Kb.test(s)}}else t&&e.removeAttribute("style");kl in e&&(e[kl]=i?n.display:"",e[ec]&&(n.display="none"))}const ku=/\s*!important$/;function Ya(e,t,s){if(he(s))s.forEach(n=>Ya(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Wb(e,t);ku.test(s)?e.setProperty(Qt(n),s.replace(ku,""),"important"):e[n]=s}}const wu=["Webkit","Moz","ms"],Er={};function Wb(e,t){const s=Er[t];if(s)return s;let n=Qe(t);if(n!=="filter"&&n in e)return Er[t]=n;n=Zn(n);for(let a=0;a<wu.length;a++){const i=wu[a]+n;if(i in e)return Er[t]=i}return t}function Zb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ee(n)&&s===n}const Su="http://www.w3.org/1999/xlink";function Tu(e,t,s,n,a,i=Zg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Su,t.slice(6,t.length)):e.setAttributeNS(Su,t,s):s==null||i&&!Yd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Ut(s)?String(s):s)}function Cu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ep(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Yd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function qs(e,t,s,n){e.addEventListener(t,s,n)}function Jb(e,t,s,n){e.removeEventListener(t,s,n)}const Eu=Symbol("_vei");function Yb(e,t,s,n,a=null){const i=e[Eu]||(e[Eu]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Qb(t);if(n){const c=i[t]=ty(n,a);qs(e,r,c,o)}else l&&(Jb(e,r,l,o),i[t]=void 0)}}const Au=/(?:Once|Passive|Capture)$/;function Qb(e){let t;if(Au.test(e)){t={};let n;for(;n=e.match(Au);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Qt(e.slice(2)),t]}let Ar=0;const Xb=Promise.resolve(),ey=()=>Ar||(Xb.then(()=>Ar=0),Ar=Date.now());function ty(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(he(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ns(c,t,5,r)}}else ns(a,t,5,[n])};return s.value=e,s.attached=ey(),s}const Ru=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Mp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?jb(e,n,l):t==="style"?Gb(e,s,n):Gn(t)?Ul(t)||Yb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):sy(e,t,n,l))?(Cu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Tu(e,t,n,l,i,t!=="value")):e._isVueCE&&(ny(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ee(n)))?Cu(e,Qe(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Tu(e,t,n,l))};function sy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Ru(t)&&Se(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Ru(t)&&Ee(s)?!1:t in e}function ny(e,t){const s=e._def.props;if(!s)return!1;const n=Qe(t);return Array.isArray(s)?s.some(a=>Qe(a)===n):Object.keys(s).some(a=>Qe(a)===n)}const Iu={};function Pp(e,t,s){let n=Ni(e,t);Bl(n)&&(n=Pe({},n,t));class a extends nr{constructor(l){super(n,l,s)}}return a.def=n,a}const ay=((e,t)=>Pp(e,t,Zp)),iy=typeof HTMLElement<"u"?HTMLElement:class{};class nr extends iy{constructor(t,s={},n=Cl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Cl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Pe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof nr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,wt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!he(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=cl(this._props[o])),(r||(r=Object.create(null)))[Qe(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)Ke(this,n)||Object.defineProperty(this,n,{get:()=>Is(s[n])})}_resolveProps(t){const{props:s}=t,n=he(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Qe))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Iu;const a=Qe(t);s&&this._numberProps&&this._numberProps[a]&&(n=cl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Iu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Qt(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Qt(t),s+""):s||this.removeAttribute(Qt(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Wp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=it(this._def,Pe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Bl(l[0])?Pe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),Qt(i)!==i&&a(Qt(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Fp(e){const t=Kt(),s=t&&t.ce;return s||null}function ly(){const e=Fp();return e&&e.shadowRoot}function ry(e="$style"){{const t=Kt();if(!t)return Fe;const s=t.type.__cssModules;if(!s)return Fe;const n=s[e];return n||Fe}}const $p=new WeakMap,Up=new WeakMap,Sl=Symbol("_moveCb"),Nu=Symbol("_enterCb"),oy=e=>(delete e.props.mode,e),cy=oy({name:"TransitionGroup",props:Pe({},Ip,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Kt(),n=$o();let a,i;return Xl(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!hy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(dy),a.forEach(fy);const r=a.filter(py);lo(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;Ss(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[Sl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[Sl]=null,mn(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Be(e),r=Np(l);let o=l.tag||Et;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[ec]&&(a.push(u),tn(u,ka(u,r,n,s)),$p.set(u,Bp(u.el)))}i=t.default?Yl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&tn(u,ka(u,r,n,s))}return it(o,null,i)}}}),uy=cy;function dy(e){const t=e.el;t[Sl]&&t[Sl](),t[Nu]&&t[Nu]()}function fy(e){Up.set(e,Bp(e.el))}function py(e){const t=$p.get(e),s=Up.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Bp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function hy(e,t,s){const n=e.cloneNode(),a=e[Sa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Op(n);return i.removeChild(n),l}const wn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return he(t)?s=>ga(t,s):t};function gy(e){e.target.composing=!0}function Ou(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const ps=Symbol("_assign");function Lu(e,t,s){return t&&(e=e.trim()),s&&(e=jl(e)),e}const Tl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[ps]=wn(a);const i=n||a.props&&a.props.type==="number";qs(e,t?"change":"input",l=>{l.target.composing||e[ps](Lu(e.value,s,i))}),(s||i)&&qs(e,"change",()=>{e.value=Lu(e.value,s,i)}),t||(qs(e,"compositionstart",gy),qs(e,"compositionend",Ou),qs(e,"change",Ou))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[ps]=wn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?jl(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},tc={deep:!0,created(e,t,s){e[ps]=wn(s),qs(e,"change",()=>{const n=e._modelValue,a=Ta(e),i=e.checked,l=e[ps];if(he(n)){const r=ql(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Wn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Vp(e,i))})},mounted:Du,beforeUpdate(e,t,s){e[ps]=wn(s),Du(e,t,s)}};function Du(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(he(t))a=ql(t,n.props.value)>-1;else if(Wn(t))a=t.has(n.props.value);else{if(t===s)return;a=Qs(t,Vp(e,!0))}e.checked!==a&&(e.checked=a)}const sc={created(e,{value:t},s){e.checked=Qs(t,s.props.value),e[ps]=wn(s),qs(e,"change",()=>{e[ps](Ta(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[ps]=wn(n),t!==s&&(e.checked=Qs(t,n.props.value))}},Hp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Wn(t);qs(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?jl(Ta(l)):Ta(l));e[ps](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,wt(()=>{e._assigning=!1})}),e[ps]=wn(n)},mounted(e,{value:t}){Mu(e,t)},beforeUpdate(e,t,s){e[ps]=wn(s)},updated(e,{value:t}){e._assigning||Mu(e,t)}};function Mu(e,t){const s=e.multiple,n=he(t);if(!(s&&!n&&!Wn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ta(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=ql(t,r)>-1}else l.selected=t.has(r);else if(Qs(Ta(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ta(e){return"_value"in e?e._value:e.value}function Vp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const jp={created(e,t,s){Zi(e,t,s,null,"created")},mounted(e,t,s){Zi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Zi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Zi(e,t,s,n,"updated")}};function zp(e,t){switch(e){case"SELECT":return Hp;case"TEXTAREA":return Tl;default:switch(t){case"checkbox":return tc;case"radio":return sc;default:return Tl}}}function Zi(e,t,s,n,a){const l=zp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function my(){Tl.getSSRProps=({value:e})=>({value:e}),sc.getSSRProps=({value:e},t)=>{if(t.props&&Qs(t.props.value,e))return{checked:!0}},tc.getSSRProps=({value:e},t)=>{if(he(e)){if(t.props&&ql(e,t.props.value)>-1)return{checked:!0}}else if(Wn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},jp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=zp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const vy=["ctrl","shift","alt","meta"],by={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>vy.some(s=>e[`${s}Key`]&&!t.includes(s))},yy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=by[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},xy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},_y=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=Qt(a.key);if(t.some(l=>l===i||xy[l]===i))return e(a)}))},qp=Pe({patchProp:Mp},Ap);let ai,Pu=!1;function Kp(){return ai||(ai=ip(qp))}function Gp(){return ai=Pu?ai:lp(qp),Pu=!0,ai}const Wp=((...e)=>{Kp().render(...e)}),ky=((...e)=>{Gp().hydrate(...e)}),Cl=((...e)=>{const t=Kp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Yp(n);if(!a)return;const i=t._component;!Se(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Jp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Zp=((...e)=>{const t=Gp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Yp(n);if(a)return s(a,!0,Jp(a))},t});function Jp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Yp(e){return Ee(e)?document.querySelector(e):e}let Fu=!1;const wy=()=>{Fu||(Fu=!0,my(),zb())},Sy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Pf,BaseTransitionPropsValidators:Uo,Comment:pt,DeprecationTypes:Pb,EffectScope:Ro,ErrorCodes:Um,ErrorTypeStrings:Rb,Fragment:Et,KeepAlive:bv,ReactiveEffect:ci,Static:Un,Suspense:ub,Teleport:ev,Text:_n,TrackOpTypes:Om,Transition:Bb,TransitionGroup:uy,TriggerOpTypes:Lm,VueElement:nr,assertNumber:$m,callWithAsyncErrorHandling:ns,callWithErrorHandling:Da,camelize:Qe,capitalize:Zn,cloneVNode:Os,compatUtils:Mb,computed:J,createApp:Cl,createBlock:yl,createCommentVNode:vp,createElementBlock:mb,createElementVNode:Yo,createHydrationRenderer:lp,createPropsRestProxy:Bv,createRenderer:ip,createSSRApp:Zp,createSlots:Tv,createStaticVNode:yb,createTextVNode:Qo,createVNode:it,customRef:xf,defineAsyncComponent:mv,defineComponent:Ni,defineCustomElement:Pp,defineEmits:Iv,defineExpose:Nv,defineModel:Dv,defineOptions:Ov,defineProps:Rv,defineSSRCustomElement:ay,defineSlots:Lv,devtools:Ib,effect:tm,effectScope:Qg,getCurrentInstance:Kt,getCurrentScope:tf,getCurrentWatcher:Dm,getTransitionRawChildren:Yl,guardReactiveProps:mp,h:wa,handleError:Jn,hasInjectionContext:Gm,hydrate:ky,hydrateOnIdle:uv,hydrateOnInteraction:hv,hydrateOnMediaQuery:pv,hydrateOnVisible:fv,initCustomFormatter:Cb,initDirectivesForSSR:wy,inject:ds,isMemoSame:Tp,isProxy:Ri,isReactive:Zs,isReadonly:Ns,isRef:bt,isRuntimeOnly:wb,isShallow:es,isVNode:sn,markRaw:bf,mergeDefaults:$v,mergeModels:Uv,mergeProps:bp,nextTick:wt,nodeOps:Ap,normalizeClass:Ai,normalizeProps:Ug,normalizeStyle:Ei,onActivated:Ho,onBeforeMount:Uf,onBeforeUnmount:er,onBeforeUpdate:jo,onDeactivated:Vo,onErrorCaptured:jf,onMounted:He,onRenderTracked:Vf,onRenderTriggered:Hf,onScopeDispose:Xg,onServerPrefetch:Bf,onUnmounted:ht,onUpdated:Xl,onWatcherCleanup:kf,openBlock:vi,patchProp:Mp,popScopeId:zm,provide:ti,proxyRefs:Mo,pushScopeId:jm,queuePostFlushCb:fi,reactive:Sn,readonly:dl,ref:h,registerRuntimeCompiler:kp,render:Wp,renderList:Sv,renderSlot:Cv,resolveComponent:_v,resolveDirective:wv,resolveDynamicComponent:kv,resolveFilter:Db,resolveTransitionHooks:ka,setBlockTracking:bi,setDevtoolsHook:Nb,setTransitionHooks:tn,shallowReactive:Lo,shallowReadonly:xm,shallowRef:Do,ssrContextKey:Af,ssrUtils:Lb,stop:sm,toDisplayString:Xd,toHandlerKey:ha,toHandlers:Ev,toRaw:Be,toRef:Rm,toRefs:Cm,toValue:wm,transformVNodeArgs:vb,triggerRef:km,unref:Is,useAttrs:Fv,useCssModule:ry,useCssVars:qb,useHost:Fp,useId:sv,useModel:Zv,useSSRContext:Rf,useShadowRoot:ly,useSlots:Pv,useTemplateRef:nv,useTransitionState:$o,vModelCheckbox:tc,vModelDynamic:jp,vModelRadio:sc,vModelSelect:Hp,vModelText:Tl,vShow:Lp,version:Cp,warn:Ab,watch:fs,watchEffect:Wm,watchPostEffect:Zm,watchSyncEffect:If,withAsyncContext:Hv,withCtx:Fo,withDefaults:Mv,withDirectives:Km,withKeys:_y,withMemo:Eb,withModifiers:yy,withScopeId:qm},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const xi=Symbol(""),ii=Symbol(""),nc=Symbol(""),El=Symbol(""),Qp=Symbol(""),qn=Symbol(""),Xp=Symbol(""),eh=Symbol(""),ac=Symbol(""),ic=Symbol(""),Di=Symbol(""),lc=Symbol(""),th=Symbol(""),rc=Symbol(""),oc=Symbol(""),cc=Symbol(""),uc=Symbol(""),dc=Symbol(""),fc=Symbol(""),sh=Symbol(""),nh=Symbol(""),ar=Symbol(""),Al=Symbol(""),pc=Symbol(""),hc=Symbol(""),_i=Symbol(""),Mi=Symbol(""),gc=Symbol(""),oo=Symbol(""),Ty=Symbol(""),co=Symbol(""),Rl=Symbol(""),Cy=Symbol(""),Ey=Symbol(""),mc=Symbol(""),Ay=Symbol(""),Ry=Symbol(""),vc=Symbol(""),ah=Symbol(""),Ca={[xi]:"Fragment",[ii]:"Teleport",[nc]:"Suspense",[El]:"KeepAlive",[Qp]:"BaseTransition",[qn]:"openBlock",[Xp]:"createBlock",[eh]:"createElementBlock",[ac]:"createVNode",[ic]:"createElementVNode",[Di]:"createCommentVNode",[lc]:"createTextVNode",[th]:"createStaticVNode",[rc]:"resolveComponent",[oc]:"resolveDynamicComponent",[cc]:"resolveDirective",[uc]:"resolveFilter",[dc]:"withDirectives",[fc]:"renderList",[sh]:"renderSlot",[nh]:"createSlots",[ar]:"toDisplayString",[Al]:"mergeProps",[pc]:"normalizeClass",[hc]:"normalizeStyle",[_i]:"normalizeProps",[Mi]:"guardReactiveProps",[gc]:"toHandlers",[oo]:"camelize",[Ty]:"capitalize",[co]:"toHandlerKey",[Rl]:"setBlockTracking",[Cy]:"pushScopeId",[Ey]:"popScopeId",[mc]:"withCtx",[Ay]:"unref",[Ry]:"isRef",[vc]:"withMemo",[ah]:"isMemoSame"};function Iy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Ca[t]=e[t]})}const ls={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ny(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:ls}}function ki(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=ls){return e&&(r?(e.helper(qn),e.helper(Ra(e.inSSR,c))):e.helper(Aa(e.inSSR,c)),l&&e.helper(dc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function Bn(e,t=ls){return{type:17,loc:t,elements:e}}function us(e,t=ls){return{type:15,loc:t,properties:e}}function vt(e,t){return{type:16,loc:ls,key:Ee(e)?Ne(e,!0):e,value:t}}function Ne(e,t=!1,s=ls,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function bs(e,t=ls){return{type:8,loc:t,children:e}}function St(e,t=[],s=ls){return{type:14,loc:s,callee:e,arguments:t}}function Ea(e,t=void 0,s=!1,n=!1,a=ls){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function uo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:ls}}function Oy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:ls}}function Ly(e){return{type:21,body:e,loc:ls}}function Aa(e,t){return e||t?ac:ic}function Ra(e,t){return e||t?Xp:eh}function bc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Aa(n,e.isComponent)),t(qn),t(Ra(n,e.isComponent)))}const $u=new Uint8Array([123,123]),Uu=new Uint8Array([125,125]);function Bu(e){return e>=97&&e<=122||e>=65&&e<=90}function ts(e){return e===32||e===10||e===9||e===12||e===13}function pn(e){return e===47||e===62||ts(e)}function Il(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Lt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Dy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=$u,this.delimiterClose=Uu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=$u,this.delimiterClose=Uu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?pn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||ts(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Lt.TitleEnd||this.currentSequence===Lt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Lt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Lt.Cdata.length&&(this.state=28,this.currentSequence=Lt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Lt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Bu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){pn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(pn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Il("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){ts(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Bu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||ts(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):ts(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):ts(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||pn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||pn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||pn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||pn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||pn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):ts(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):ts(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){ts(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Lt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Lt.ScriptEnd[3]?this.startSpecial(Lt.ScriptEnd,4):t===Lt.StyleEnd[3]?this.startSpecial(Lt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Lt.TitleEnd[3]?this.startSpecial(Lt.TitleEnd,4):t===Lt.TextareaEnd[3]?this.startSpecial(Lt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Lt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Hu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Hn(e,t){const s=Hu("MODE",t),n=Hu(e,t);return s===3?n===!0:n!==!1}function wi(e,t,s,...n){return Hn(e,t)}function yc(e){throw e}function ih(e){}function at(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const Xt=e=>e.type===4&&e.isStatic;function lh(e){switch(e){case"Teleport":case"teleport":return ii;case"Suspense":case"suspense":return nc;case"KeepAlive":case"keep-alive":return El;case"BaseTransition":case"base-transition":return Qp}}const My=/^$|^\d|[^\$\w\xA0-\uFFFF]/,xc=e=>!My.test(e),rh=/[A-Za-z_$\xA0-\uFFFF]/,Py=/[\.\?\w$\xA0-\uFFFF]/,Fy=/\s+[.[]\s*|\s*[.[]\s+/g,oh=e=>e.type===4?e.content:e.loc.source,$y=e=>{const t=oh(e).trim().replace(Fy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?rh:Py).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},ch=$y,Uy=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,By=e=>Uy.test(oh(e)),Hy=By;function cs(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ee(t)?a.name===t:t.test(a.name)))return a}}function ir(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Dn(i.arg,t))return i}}function Dn(e,t){return!!(e&&Xt(e)&&e.content===t)}function Vy(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Rr(e){return e.type===5||e.type===2}function Vu(e){return e.type===7&&e.name==="pre"}function jy(e){return e.type===7&&e.name==="slot"}function Nl(e){return e.type===1&&e.tagType===3}function Ol(e){return e.type===1&&e.tagType===2}const zy=new Set([_i,Mi]);function uh(e,t=[]){if(e&&!Ee(e)&&e.type===14){const s=e.callee;if(!Ee(s)&&zy.has(s))return uh(e.arguments[0],t.concat(e))}return[e,t]}function Ll(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ee(a)&&a.type===14){const r=uh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Ee(a))n=us([t]);else if(a.type===14){const r=a.arguments[0];!Ee(r)&&r.type===15?ju(t,r)||r.properties.unshift(t):a.callee===gc?n=St(s.helper(Al),[us([t]),a]):a.arguments.unshift(us([t])),!n&&(n=a)}else a.type===15?(ju(t,a)||a.properties.unshift(t),n=a):(n=St(s.helper(Al),[us([t]),a]),l&&l.callee===Mi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function ju(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Si(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function qy(e){return e.type===14&&e.callee===vc?e.arguments[1].returns:e}const Ky=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function dh(e){for(let t=0;t<e.length;t++)if(!ts(e.charCodeAt(t)))return!1;return!0}function _c(e){return e.type===2&&dh(e.content)||e.type===12&&_c(e.content)}function fh(e){return e.type===3||_c(e)}const ph={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ua,isPreTag:ua,isIgnoreNewlineTag:ua,isCustomElement:ua,onError:yc,onWarn:ih,comments:!1,prefixIdentifiers:!1};let je=ph,Ti=null,Ys="",Mt=null,$e=null,Wt="",Us=-1,On=-1,kc=0,yn=!1,fo=null;const nt=[],ct=new Dy(nt,{onerr:Ps,ontext(e,t){Ji(Rt(e,t),e,t)},ontextentity(e,t,s){Ji(e,t,s)},oninterpolation(e,t){if(yn)return Ji(Rt(e,t),e,t);let s=e+ct.delimiterOpen.length,n=t-ct.delimiterClose.length;for(;ts(Ys.charCodeAt(s));)s++;for(;ts(Ys.charCodeAt(n-1));)n--;let a=Rt(s,n);a.includes("&")&&(a=je.decodeEntities(a,!1)),po({type:5,content:il(a,!1,ft(s,n)),loc:ft(e,t)})},onopentagname(e,t){const s=Rt(e,t);Mt={type:1,tag:s,ns:je.getNamespace(s,nt[0],je.ns),tagType:0,props:[],children:[],loc:ft(e-1,t),codegenNode:void 0}},onopentagend(e){qu(e)},onclosetag(e,t){const s=Rt(e,t);if(!je.isVoidTag(s)){let n=!1;for(let a=0;a<nt.length;a++)if(nt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ps(24,nt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=nt.shift();al(r,t,l<a)}break}n||Ps(23,hh(e,60))}},onselfclosingtag(e){const t=Mt.tag;Mt.isSelfClosing=!0,qu(e),nt[0]&&nt[0].tag===t&&al(nt.shift(),e)},onattribname(e,t){$e={type:6,name:Rt(e,t),nameLoc:ft(e,t),value:void 0,loc:ft(e)}},ondirname(e,t){const s=Rt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!yn&&n===""&&Ps(26,e),yn||n==="")$e={type:6,name:s,nameLoc:ft(e,t),value:void 0,loc:ft(e)};else if($e={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ne("prop")]:[],loc:ft(e)},n==="pre"){yn=ct.inVPre=!0,fo=Mt;const a=Mt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=s0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Rt(e,t);if(yn&&!Vu($e))$e.name+=s,Mn($e.nameLoc,t);else{const n=s[0]!=="[";$e.arg=il(n?s:s.slice(1,-1),n,ft(e,t),n?3:0)}},ondirmodifier(e,t){const s=Rt(e,t);if(yn&&!Vu($e))$e.name+="."+s,Mn($e.nameLoc,t);else if($e.name==="slot"){const n=$e.arg;n&&(n.content+="."+s,Mn(n.loc,t))}else{const n=Ne(s,!0,ft(e,t));$e.modifiers.push(n)}},onattribdata(e,t){Wt+=Rt(e,t),Us<0&&(Us=e),On=t},onattribentity(e,t,s){Wt+=e,Us<0&&(Us=t),On=s},onattribnameend(e){const t=$e.loc.start.offset,s=Rt(t,e);$e.type===7&&($e.rawName=s),Mt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ps(2,t)},onattribend(e,t){if(Mt&&$e){if(Mn($e.loc,t),e!==0)if(Wt.includes("&")&&(Wt=je.decodeEntities(Wt,!0)),$e.type===6)$e.name==="class"&&(Wt=mh(Wt).trim()),e===1&&!Wt&&Ps(13,t),$e.value={type:2,content:Wt,loc:e===1?ft(Us,On):ft(Us-1,On+1)},ct.inSFCRoot&&Mt.tag==="template"&&$e.name==="lang"&&Wt&&Wt!=="html"&&ct.enterRCDATA(Il("</template"),0);else{let s=0;$e.exp=il(Wt,!1,ft(Us,On),0,s),$e.name==="for"&&($e.forParseResult=Wy($e.exp));let n=-1;$e.name==="bind"&&(n=$e.modifiers.findIndex(a=>a.content==="sync"))>-1&&wi("COMPILER_V_BIND_SYNC",je,$e.loc,$e.arg.loc.source)&&($e.name="model",$e.modifiers.splice(n,1))}($e.type!==7||$e.name!=="pre")&&Mt.props.push($e)}Wt="",Us=On=-1},oncomment(e,t){je.comments&&po({type:3,content:Rt(e,t),loc:ft(e-4,t+3)})},onend(){const e=Ys.length;for(let t=0;t<nt.length;t++)al(nt[t],e-1),Ps(24,nt[t].loc.start.offset)},oncdata(e,t){(nt[0]?nt[0].ns:je.ns)!==0?Ji(Rt(e,t),e,t):Ps(1,e-9)},onprocessinginstruction(e){(nt[0]?nt[0].ns:je.ns)===0&&Ps(21,e-1)}}),zu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Gy=/^\(|\)$/g;function Wy(e){const t=e.loc,s=e.content,n=s.match(Ky);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const b=t.start.offset+f,g=b+d.length;return il(d,!1,ft(b,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Gy,"").trim();const c=a.indexOf(o),u=o.match(zu);if(u){o=o.replace(zu,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Rt(e,t){return Ys.slice(e,t)}function qu(e){ct.inSFCRoot&&(Mt.innerLoc=ft(e+1,e+1)),po(Mt);const{tag:t,ns:s}=Mt;s===0&&je.isPreTag(t)&&kc++,je.isVoidTag(t)?al(Mt,e):(nt.unshift(Mt),(s===1||s===2)&&(ct.inXML=!0)),Mt=null}function Ji(e,t,s){{const i=nt[0]&&nt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=je.decodeEntities(e,!1))}const n=nt[0]||Ti,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Mn(a.loc,s)):n.children.push({type:2,content:e,loc:ft(t,s)})}function al(e,t,s=!1){s?Mn(e.loc,hh(t,60)):Mn(e.loc,Zy(t,62)+1),ct.inSFCRoot&&(e.children.length?e.innerLoc.end=Pe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Pe({},e.innerLoc.start),e.innerLoc.source=Rt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(yn||(n==="slot"?e.tagType=2:Ku(e)?e.tagType=3:Yy(e)&&(e.tagType=1)),ct.inRCDATA||(e.children=gh(i)),a===0&&je.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&je.isPreTag(n)&&kc--,fo===e&&(yn=ct.inVPre=!1,fo=null),ct.inXML&&(nt[0]?nt[0].ns:je.ns)===0&&(ct.inXML=!1);{const l=e.props;if(!ct.inSFCRoot&&Hn("COMPILER_NATIVE_TEMPLATE",je)&&e.tag==="template"&&!Ku(e)){const o=nt[0]||Ti,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&wi("COMPILER_INLINE_TEMPLATE",je,r.loc)&&e.children.length&&(r.value={type:2,content:Rt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Zy(e,t){let s=e;for(;Ys.charCodeAt(s)!==t&&s<Ys.length-1;)s++;return s}function hh(e,t){let s=e;for(;Ys.charCodeAt(s)!==t&&s>=0;)s--;return s}const Jy=new Set(["if","else","else-if","for","slot"]);function Ku({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Jy.has(t[s].name))return!0}return!1}function Yy({tag:e,props:t}){if(je.isCustomElement(e))return!1;if(e==="component"||Qy(e.charCodeAt(0))||lh(e)||je.isBuiltInComponent&&je.isBuiltInComponent(e)||je.isNativeTag&&!je.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(wi("COMPILER_IS_ON_ELEMENT",je,n.loc))return!0}}else if(n.name==="bind"&&Dn(n.arg,"is")&&wi("COMPILER_IS_ON_ELEMENT",je,n.loc))return!0}return!1}function Qy(e){return e>64&&e<91}const Xy=/\r\n/g;function gh(e){const t=je.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(kc)a.content=a.content.replace(Xy,`
`);else if(dh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&e0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=mh(a.content))}return s?e.filter(Boolean):e}function e0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function mh(e){let t="",s=!1;for(let n=0;n<e.length;n++)ts(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function po(e){(nt[0]||Ti).children.push(e)}function ft(e,t){return{start:ct.getPos(e),end:t==null?t:ct.getPos(t),source:t==null?t:Rt(e,t)}}function t0(e){return ft(e.start.offset,e.end.offset)}function Mn(e,t){e.end=ct.getPos(t),e.source=Rt(e.start.offset,t)}function s0(e){const t={type:6,name:e.rawName,nameLoc:ft(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function il(e,t=!1,s,n=0,a=0){return Ne(e,t,s,n)}function Ps(e,t,s){je.onError(at(e,ft(t,t)))}function n0(){ct.reset(),Mt=null,$e=null,Wt="",Us=-1,On=-1,nt.length=0}function a0(e,t){if(n0(),Ys=e,je=Pe({},ph),t){let a;for(a in t)t[a]!=null&&(je[a]=t[a])}ct.mode=je.parseMode==="html"?1:je.parseMode==="sfc"?2:0,ct.inXML=je.ns===1||je.ns===2;const s=t&&t.delimiters;s&&(ct.delimiterOpen=Il(s[0]),ct.delimiterClose=Il(s[1]));const n=Ti=Ny([],e);return ct.parse(Ys),n.loc=ft(0,e.length),n.children=gh(n.children),Ti=null,n}function i0(e,t){ll(e,void 0,t,!!vh(e))}function vh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Ol(t[0])?t[0]:null}function ll(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:ss(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const b=p.patchFlag;if((b===void 0||b===512||b===1)&&yh(d,s)>=2){const g=xh(d);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:ss(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,ll(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)ll(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)ll(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&he(e.codegenNode.children))e.codegenNode.children=o(Bn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!he(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(Bn(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!he(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=cs(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(Bn(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!he(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ss(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=yh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ss(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=ss(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(qn),t.removeHelper(Ra(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Aa(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ss(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Ee(r)||Ut(r))continue;const o=ss(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const l0=new Set([pc,hc,_i,Mi]);function bh(e,t){if(e.type===14&&!Ee(e.callee)&&l0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ss(s,t);if(s.type===14)return bh(s,t)}return 0}function yh(e,t){let s=3;const n=xh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ss(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ss(r,t):r.type===14?c=bh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function xh(e){const t=e.codegenNode;if(t.type===13)return t.props}function r0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ot,isCustomElement:u=Ot,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:b=!1,inSSR:g=!1,ssrCssVars:T="",bindingMetadata:N=Fe,inline:y=!1,isTS:v=!1,onError:x=yc,onWarn:k=ih,compatConfig:I}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),w={filename:t,selfName:O&&Zn(Qe(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:b,inSSR:g,ssrCssVars:T,bindingMetadata:N,inline:y,isTS:v,onError:x,onWarn:k,compatConfig:I,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(E){const L=w.helpers.get(E)||0;return w.helpers.set(E,L+1),E},removeHelper(E){const L=w.helpers.get(E);if(L){const U=L-1;U?w.helpers.set(E,U):w.helpers.delete(E)}},helperString(E){return`_${Ca[w.helper(E)]}`},replaceNode(E){w.parent.children[w.childIndex]=w.currentNode=E},removeNode(E){const L=w.parent.children,U=E?L.indexOf(E):w.currentNode?w.childIndex:-1;!E||E===w.currentNode?(w.currentNode=null,w.onNodeRemoved()):w.childIndex>U&&(w.childIndex--,w.onNodeRemoved()),w.parent.children.splice(U,1)},onNodeRemoved:Ot,addIdentifiers(E){},removeIdentifiers(E){},hoist(E){Ee(E)&&(E=Ne(E)),w.hoists.push(E);const L=Ne(`_hoisted_${w.hoists.length}`,!1,E.loc,2);return L.hoisted=E,L},cache(E,L=!1,U=!1){const F=Oy(w.cached.length,E,L,U);return w.cached.push(F),F}};return w.filters=new Set,w}function o0(e,t){const s=r0(e,t);lr(e,s),t.hoistStatic&&i0(e,s),t.ssr||c0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function c0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=vh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&bc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=ki(t,s(xi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function u0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ee(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,lr(a,t))}}function lr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(he(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Di);break;case 5:t.ssr||t.helper(ar);break;case 9:for(let i=0;i<e.branches.length;i++)lr(e.branches[i],t);break;case 10:case 11:case 1:case 0:u0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function _h(e,t){const s=Ee(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(jy))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const rr="/*@__PURE__*/",kh=e=>`${Ca[e]}: _${Ca[e]}`;function d0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Ca[g]}`},push(g,T=-2,N){p.code+=g},indent(){b(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:b(--p.indentLevel)},newline(){b(p.indentLevel)}};function b(g){p.push(`
`+"  ".repeat(g),0)}return p}function f0(e,t={}){const s=d0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";p0(e,s);const g=u?"ssrRender":"render",N=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${N}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(kh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Ir(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Ir(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Ir(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?$t(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function p0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[ac,ic,Di,lc,th].filter(f=>u.includes(f)).map(kh).join(", ");a(`const { ${d} } = _Vue
`,-1)}h0(e.hoists,t),i(),a("return ")}function Ir(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?uc:t==="component"?rc:cc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Si(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function h0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),$t(i,t),n())}t.pure=!1}function wc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Pi(e,t,s),s&&t.deindent(),t.push("]")}function Pi(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Ee(r)?a(r,-3):he(r)?wc(r,t):$t(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function $t(e,t){if(Ee(e)){t.push(e,-3);return}if(Ut(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:$t(e.codegenNode,t);break;case 2:g0(e,t);break;case 4:wh(e,t);break;case 5:m0(e,t);break;case 12:$t(e.codegenNode,t);break;case 8:Sh(e,t);break;case 3:b0(e,t);break;case 13:y0(e,t);break;case 14:_0(e,t);break;case 15:k0(e,t);break;case 17:w0(e,t);break;case 18:S0(e,t);break;case 19:T0(e,t);break;case 20:C0(e,t);break;case 21:Pi(e.body,t,!0,!1);break}}function g0(e,t){t.push(JSON.stringify(e.content),-3,e)}function wh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function m0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(rr),s(`${n(ar)}(`),$t(e.content,t),s(")")}function Sh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ee(n)?t.push(n,-3):$t(n,t)}}function v0(e,t){const{push:s}=t;if(e.type===8)s("["),Sh(e,t),s("]");else if(e.isStatic){const n=xc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function b0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(rr),s(`${n(Di)}(${JSON.stringify(e.content)})`,-3,e)}function y0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let b;o&&(b=String(o)),u&&s(n(dc)+"("),d&&s(`(${n(qn)}(${f?"true":""}), `),a&&s(rr);const g=d?Ra(t.inSSR,p):Aa(t.inSSR,p);s(n(g)+"(",-2,e),Pi(x0([i,l,r,b,c]),t),s(")"),d&&s(")"),u&&(s(", "),$t(u,t),s(")"))}function x0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function _0(e,t){const{push:s,helper:n,pure:a}=t,i=Ee(e.callee)?e.callee:n(e.callee);a&&s(rr),s(i+"(",-2,e),Pi(e.arguments,t),s(")")}function k0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];v0(c,t),s(": "),$t(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function w0(e,t){wc(e.elements,t)}function S0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Ca[mc]}(`),s("(",-2,e),he(i)?Pi(i,t):i&&$t(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),he(l)?wc(l,t):$t(l,t)):r&&$t(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function T0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!xc(s.content);d&&l("("),wh(s,t),d&&l(")")}else l("("),$t(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),$t(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,$t(a,t),u||t.indentLevel--,i&&o(!0)}function C0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Rl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),$t(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Rl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const E0=_h(/^(?:if|else|else-if)$/,(e,t,s)=>A0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Wu(a,o,s);else{const c=R0(n.codegenNode);c.alternate=Wu(a,o+n.branches.length-1,s)}}}));function A0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(at(28,t.loc)),t.exp=Ne("true",!1,a)}if(t.name==="if"){const a=Gu(e,t),i={type:9,loc:t0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&fh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(at(30,e.loc)),s.removeNode();const r=Gu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);lr(r,s),o&&o(),s.currentNode=null}else s.onError(at(30,e.loc));break}}}function Gu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!cs(e,"for")?e.children:[e],userKey:ir(e,"key"),isTemplateIf:s}}function Wu(e,t,s){return e.condition?uo(e.condition,Zu(e,t,s),St(s.helper(Di),['""',"true"])):Zu(e,t,s)}function Zu(e,t,s){const{helper:n}=s,a=vt("key",Ne(`${t}`,!1,ls,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Ll(o,a,s),o}else return ki(s,n(xi),us([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=qy(o);return c.type===13&&bc(c,s),Ll(c,a,s),o}}function R0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const I0=_h("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return N0(e,t,s,i=>{const l=St(n(fc),[i.source]),r=Nl(e),o=cs(e,"memo"),c=ir(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Ne(c.value.content,!0):void 0:c.exp);const d=u?vt("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=ki(s,n(xi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let b;const{children:g}=i,T=g.length!==1||g[0].type!==1,N=Ol(e)?e:r&&e.children.length===1&&Ol(e.children[0])?e.children[0]:null;if(N?(b=N.codegenNode,r&&d&&Ll(b,d,s)):T?b=ki(s,n(xi),d?us([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(b=g[0].codegenNode,r&&d&&Ll(b,d,s),b.isBlock!==!f&&(b.isBlock?(a(qn),a(Ra(s.inSSR,b.isComponent))):a(Aa(s.inSSR,b.isComponent))),b.isBlock=!f,b.isBlock?(n(qn),n(Ra(s.inSSR,b.isComponent))):n(Aa(s.inSSR,b.isComponent))),o){const y=Ea(ho(i.parseResult,[Ne("_cached")]));y.body=Ly([bs(["const _memo = (",o.exp,")"]),bs(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(ah)}(_cached, _memo)) return _cached`]),bs(["const _item = ",b]),Ne("_item.memo = _memo"),Ne("return _item")]),l.arguments.push(y,Ne("_cache"),Ne(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Ea(ho(i.parseResult),b,!0))}})});function N0(e,t,s,n){if(!t.exp){s.onError(at(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(at(32,t.loc));return}Th(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:Nl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Th(e,t){e.finalized||(e.finalized=!0)}function ho({value:e,key:t,index:s},n=[]){return O0([e,t,s,...n])}function O0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ne("_".repeat(n+1),!1))}const Ju=Ne("undefined",!1),L0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=cs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},D0=(e,t,s,n)=>Ea(e,s,!1,!0,s.length?s[0].loc:n);function M0(e,t,s=D0){t.helper(mc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=cs(e,"slot",!0);if(o){const{arg:T,exp:N}=o;T&&!Xt(T)&&(r=!0),i.push(vt(T||Ne("default",!0),s(N,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let T=0;T<n.length;T++){const N=n[T];let y;if(!Nl(N)||!(y=cs(N,"slot",!0))){N.type!==3&&d.push(N);continue}if(o){t.onError(at(37,y.loc));break}c=!0;const{children:v,loc:x}=N,{arg:k=Ne("default",!0),exp:I,loc:O}=y;let w;Xt(k)?w=k?k.content:"default":r=!0;const E=cs(N,"for"),L=s(I,E,v,x);let U,F;if(U=cs(N,"if"))r=!0,l.push(uo(U.exp,Yi(k,L,p++),Ju));else if(F=cs(N,/^else(?:-if)?$/,!0)){let S=T,M;for(;S--&&(M=n[S],!!fh(M)););if(M&&Nl(M)&&cs(M,/^(?:else-)?if$/)){let H=l[l.length-1];for(;H.alternate.type===19;)H=H.alternate;H.alternate=F.exp?uo(F.exp,Yi(k,L,p++),Ju):Yi(k,L,p++)}else t.onError(at(30,F.loc))}else if(E){r=!0;const S=E.forParseResult;S?(Th(S),l.push(St(t.helper(fc),[S.source,Ea(ho(S),Yi(k,L),!0)]))):t.onError(at(32,E.loc))}else{if(w){if(f.has(w)){t.onError(at(38,O));continue}f.add(w),w==="default"&&(u=!0)}i.push(vt(k,L))}}if(!o){const T=(N,y)=>{const v=s(N,void 0,y,a);return t.compatConfig&&(v.isNonScopedSlot=!0),vt("default",v)};c?d.length&&!d.every(_c)&&(u?t.onError(at(39,d[0].loc)):i.push(T(void 0,d))):i.push(T(void 0,n))}const b=r?2:rl(e.children)?3:1;let g=us(i.concat(vt("_",Ne(b+"",!1))),a);return l.length&&(g=St(t.helper(nh),[g,Bn(l)])),{slots:g,hasDynamicSlots:r}}function Yi(e,t,s){const n=[vt("name",e),vt("fn",t)];return s!=null&&n.push(vt("key",Ne(String(s),!0))),us(n)}function rl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||rl(s.children))return!0;break;case 9:if(rl(s.branches))return!0;break;case 10:case 11:if(rl(s.children))return!0;break}}return!1}const Ch=new WeakMap,P0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?F0(e,t):`"${n}"`;const r=ze(l)&&l.callee===oc;let o,c,u=0,d,f,p,b=r||l===ii||l===nc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=Eh(e,t,void 0,i,r);o=g.props,u=g.patchFlag,f=g.dynamicPropNames;const T=g.directives;p=T&&T.length?Bn(T.map(N=>U0(N,t))):void 0,g.shouldUseBlock&&(b=!0)}if(e.children.length>0)if(l===El&&(b=!0,u|=1024),i&&l!==ii&&l!==El){const{slots:T,hasDynamicSlots:N}=M0(e,t);c=T,N&&(u|=1024)}else if(e.children.length===1&&l!==ii){const T=e.children[0],N=T.type,y=N===5||N===8;y&&ss(T,t)===0&&(u|=1),y||N===2?c=T:c=e.children}else c=e.children;f&&f.length&&(d=B0(f)),e.codegenNode=ki(t,l,o,c,u===0?void 0:u,d,p,!!b,!1,i,e.loc)};function F0(e,t,s=!1){let{tag:n}=e;const a=go(n),i=ir(e,"is",!1,!0);if(i)if(a||Hn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ne(i.value.content,!0):(r=i.exp,r||(r=Ne("is",!1,i.arg.loc))),r)return St(t.helper(oc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=lh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(rc),t.components.add(n),Si(n,"component"))}function Eh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,b=0,g=!1,T=!1,N=!1,y=!1,v=!1,x=!1;const k=[],I=L=>{c.length&&(u.push(us(Yu(c),r)),c=[]),L&&u.push(L)},O=()=>{t.scopes.vFor>0&&c.push(vt(Ne("ref_for",!0),Ne("true")))},w=({key:L,value:U})=>{if(Xt(L)){const F=L.content,S=Gn(F);if(S&&(!n||a)&&F.toLowerCase()!=="onclick"&&F!=="onUpdate:modelValue"&&!Ws(F)&&(y=!0),S&&Ws(F)&&(x=!0),S&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&ss(U,t)>0)return;F==="ref"?g=!0:F==="class"?T=!0:F==="style"?N=!0:F!=="key"&&!k.includes(F)&&k.push(F),n&&(F==="class"||F==="style")&&!k.includes(F)&&k.push(F)}else v=!0};for(let L=0;L<s.length;L++){const U=s[L];if(U.type===6){const{loc:F,name:S,nameLoc:M,value:H}=U;let W=!0;if(S==="ref"&&(g=!0,O()),S==="is"&&(go(l)||H&&H.content.startsWith("vue:")||Hn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(vt(Ne(S,!0,M),Ne(H?H.content:"",W,H?H.loc:F)))}else{const{name:F,arg:S,exp:M,loc:H,modifiers:W}=U,D=F==="bind",R=F==="on";if(F==="slot"){n||t.onError(at(40,H));continue}if(F==="once"||F==="memo"||F==="is"||D&&Dn(S,"is")&&(go(l)||Hn("COMPILER_IS_ON_ELEMENT",t))||R&&i)continue;if((D&&Dn(S,"key")||R&&f&&Dn(S,"vue:before-update"))&&(p=!0),D&&Dn(S,"ref")&&O(),!S&&(D||R)){if(v=!0,M)if(D){if(I(),Hn("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift(M);continue}O(),I(),u.push(M)}else I({type:14,loc:H,callee:t.helper(gc),arguments:n?[M]:[M,"true"]});else t.onError(at(D?34:35,H));continue}D&&W.some(ce=>ce.content==="prop")&&(b|=32);const q=t.directiveTransforms[F];if(q){const{props:ce,needRuntime:de}=q(U,e,t);!i&&ce.forEach(w),R&&S&&!Xt(S)?I(us(ce,r)):c.push(...ce),de&&(d.push(U),Ut(de)&&Ch.set(U,de))}else Ig(F)||(d.push(U),f&&(p=!0))}}let E;if(u.length?(I(),u.length>1?E=St(t.helper(Al),u,r):E=u[0]):c.length&&(E=us(Yu(c),r)),v?b|=16:(T&&!n&&(b|=2),N&&!n&&(b|=4),k.length&&(b|=8),y&&(b|=32)),!p&&(b===0||b===32)&&(g||x||d.length>0)&&(b|=512),!t.inSSR&&E)switch(E.type){case 15:let L=-1,U=-1,F=!1;for(let H=0;H<E.properties.length;H++){const W=E.properties[H].key;Xt(W)?W.content==="class"?L=H:W.content==="style"&&(U=H):W.isHandlerKey||(F=!0)}const S=E.properties[L],M=E.properties[U];F?E=St(t.helper(_i),[E]):(S&&!Xt(S.value)&&(S.value=St(t.helper(pc),[S.value])),M&&(N||M.value.type===4&&M.value.content.trim()[0]==="["||M.value.type===17)&&(M.value=St(t.helper(hc),[M.value])));break;case 14:break;default:E=St(t.helper(_i),[St(t.helper(Mi),[E])]);break}return{props:E,directives:d,patchFlag:b,dynamicPropNames:k,shouldUseBlock:p}}function Yu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Gn(i))&&$0(l,a):(t.set(i,a),s.push(a))}return s}function $0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Bn([e.value,t.value],e.loc)}function U0(e,t){const s=[],n=Ch.get(e);n?s.push(t.helperString(n)):(t.helper(cc),t.directives.add(e.name),s.push(Si(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ne("true",!1,a);s.push(us(e.modifiers.map(l=>vt(l,i)),a))}return Bn(s,e.loc)}function B0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function go(e){return e==="component"||e==="Component"}const H0=(e,t)=>{if(Ol(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=V0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Ea([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=St(t.helper(sh),l,n)}};function V0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Qe(l.name),a.push(l)));else if(l.name==="bind"&&Dn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Qe(l.arg.content);s=l.exp=Ne(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Xt(l.arg)&&(l.arg.content=Qe(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Eh(e,t,a,!1,!1);n=i,l.length&&t.onError(at(36,l[0].loc))}return{slotName:s,slotProps:n}}const Ah=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(at(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?ha(Qe(d)):`on:${d}`;r=Ne(f,!0,l.loc)}else r=bs([`${s.helperString(co)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(co)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=ch(o),f=!(d||Hy(o)),p=o.content.includes(";");(f||c&&d)&&(o=bs([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[vt(r,o||Ne("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},j0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Qe(i.content):i.content=`${s.helperString(oo)}(${i.content})`:(i.children.unshift(`${s.helperString(oo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Qu(i,"."),n.some(r=>r.content==="attr")&&Qu(i,"^")),{props:[vt(i,l)]}},Qu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},z0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Rr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Rr(o))n||(n=s[i]=bs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Rr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ss(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:St(t.helper(lc),r)}}}}},Xu=new WeakSet,q0=(e,t)=>{if(e.type===1&&cs(e,"once",!0))return Xu.has(e)||t.inVOnce||t.inSSR?void 0:(Xu.add(e),t.inVOnce=!0,t.helper(Rl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Rh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(at(41,e.loc)),ja();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(at(44,n.loc)),ja();if(r==="literal-const"||r==="setup-const")return s.onError(at(45,n.loc)),ja();if(!l.trim()||!ch(n))return s.onError(at(42,n.loc)),ja();const o=a||Ne("modelValue",!0),c=a?Xt(a)?`onUpdate:${Qe(a.content)}`:bs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=bs([`${d} => ((`,n,") = $event)"]);const f=[vt(o,e.exp),vt(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(xc(g)?g:JSON.stringify(g))+": true").join(", "),b=a?Xt(a)?`${a.content}Modifiers`:bs([a,' + "Modifiers"']):"modelModifiers";f.push(vt(b,Ne(`{ ${p} }`,!1,e.loc,2)))}return ja(f)};function ja(e=[]){return{props:e}}const K0=/[\w).+\-_$\]]/,G0=(e,t)=>{Hn("COMPILER_FILTERS",t)&&(e.type===5?Dl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Dl(s.exp,t)}))};function Dl(e,t){if(e.type===4)ed(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?ed(n,t):n.type===8?Dl(e,t):n.type===5&&Dl(n.content,t))}}function ed(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,b,g=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)b===void 0?(u=p+1,b=s.slice(0,p).trim()):T();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let N=p-1,y;for(;N>=0&&(y=s.charAt(N),y===" ");N--);(!y||!K0.test(y))&&(l=!0)}}b===void 0?b=s.slice(0,p).trim():u!==0&&T();function T(){g.push(s.slice(u,p).trim()),u=p+1}if(g.length){for(p=0;p<g.length;p++)b=W0(b,g[p],t);e.content=b,e.ast=void 0}}function W0(e,t,s){s.helper(uc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Si(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Si(a,"filter")}(${e}${i!==")"?","+i:i}`}}const td=new WeakSet,Z0=(e,t)=>{if(e.type===1){const s=cs(e,"memo");return!s||td.has(e)||t.inSSR?void 0:(td.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&bc(n,t),e.codegenNode=St(t.helper(vc),[s.exp,Ea(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},J0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(at(53,n.loc)),s.exp=Ne("",!0,n.loc);else{const a=Qe(n.content);(rh.test(a[0])||a[0]==="-")&&(s.exp=Ne(a,!1,n.loc))}}}};function Y0(e){return[[J0,q0,E0,Z0,I0,G0,H0,P0,L0,z0],{on:Ah,bind:j0,model:Rh}]}function Q0(e,t={}){const s=t.onError||yc,n=t.mode==="module";t.prefixIdentifiers===!0?s(at(48)):n&&s(at(49));const a=!1;t.cacheHandlers&&s(at(50)),t.scopeId&&!n&&s(at(51));const i=Pe({},t,{prefixIdentifiers:a}),l=Ee(e)?a0(e,i):e,[r,o]=Y0();return o0(l,Pe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Pe({},o,t.directiveTransforms||{})})),f0(l,i)}const X0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ih=Symbol(""),Nh=Symbol(""),Oh=Symbol(""),Lh=Symbol(""),mo=Symbol(""),Dh=Symbol(""),Mh=Symbol(""),Ph=Symbol(""),Fh=Symbol(""),$h=Symbol("");Iy({[Ih]:"vModelRadio",[Nh]:"vModelCheckbox",[Oh]:"vModelText",[Lh]:"vModelSelect",[mo]:"vModelDynamic",[Dh]:"withModifiers",[Mh]:"withKeys",[Ph]:"vShow",[Fh]:"Transition",[$h]:"TransitionGroup"});let na;function ex(e,t=!1){return na||(na=document.createElement("div")),t?(na.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,na.children[0].getAttribute("foo")):(na.innerHTML=e,na.textContent)}const tx={parseMode:"html",isVoidTag:Gg,isNativeTag:e=>zg(e)||qg(e)||Kg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:ex,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Fh;if(e==="TransitionGroup"||e==="transition-group")return $h},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},sx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ne("style",!0,t.loc),exp:nx(t.value.content,t.loc),modifiers:[],loc:t.loc})})},nx=(e,t)=>{const s=Jd(e);return Ne(JSON.stringify(s),!1,t,3)};function kn(e,t){return at(e,t)}const ax=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(54,a)),t.children.length&&(s.onError(kn(55,a)),t.children.length=0),{props:[vt(Ne("innerHTML",!0,a),n||Ne("",!0))]}},ix=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(56,a)),t.children.length&&(s.onError(kn(57,a)),t.children.length=0),{props:[vt(Ne("textContent",!0),n?ss(n,s)>0?n:St(s.helperString(ar),[n],a):Ne("",!0))]}},lx=(e,t,s)=>{const n=Rh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(kn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Oh,r=!1;if(a==="input"||i){const o=ir(t,"type");if(o){if(o.type===7)l=mo;else if(o.value)switch(o.value.content){case"radio":l=Ih;break;case"checkbox":l=Nh;break;case"file":r=!0,s.onError(kn(60,e.loc));break}}else Vy(t)&&(l=mo)}else a==="select"&&(l=Lh);r||(n.needRuntime=s.helper(l))}else s.onError(kn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},rx=is("passive,once,capture"),ox=is("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),cx=is("left,right"),Uh=is("onkeyup,onkeydown,onkeypress"),ux=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&wi("COMPILER_V_ON_NATIVE",s)||rx(o)?l.push(o):cx(o)?Xt(e)?Uh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):ox(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},sd=(e,t)=>Xt(e)&&e.content.toLowerCase()==="onclick"?Ne(t,!0):e.type!==4?bs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,dx=(e,t,s)=>Ah(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=ux(i,a,s,e.loc);if(o.includes("right")&&(i=sd(i,"onContextmenu")),o.includes("middle")&&(i=sd(i,"onMouseup")),o.length&&(l=St(s.helper(Dh),[l,JSON.stringify(o)])),r.length&&(!Xt(i)||Uh(i.content.toLowerCase()))&&(l=St(s.helper(Mh),[l,JSON.stringify(r)])),c.length){const u=c.map(Zn).join("");i=Xt(i)?Ne(`${i.content}${u}`,!0):bs(["(",i,`) + "${u}"`])}return{props:[vt(i,l)]}}),fx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(62,a)),{props:[],needRuntime:s.helper(Ph)}},px=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},hx=[sx],gx={cloak:X0,html:ax,text:ix,model:lx,on:dx,show:fx};function mx(e,t={}){return Q0(e,Pe({},tx,t,{nodeTransforms:[px,...hx,...t.nodeTransforms||[]],directiveTransforms:Pe({},gx,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const nd=Object.create(null);function vx(e,t){if(!Ee(e))if(e.nodeType)e=e.innerHTML;else return Ot;const s=Lg(e,t),n=nd[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Pe({hoistStatic:!0,onError:void 0,onWarn:Ot},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=mx(e,a),l=new Function("Vue",i)(Sy);return l._rc=!0,nd[s]=l}kp(vx);const Ml=Sn({items:[]});let bx=1;function or(e,t="info",s=3e3){const n=bx++;return Ml.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Sc(n),s),n}function Sc(e){const t=Ml.items.findIndex(s=>s.id===e);t>=0&&Ml.items.splice(t,1)}function ke(e,t="info",s=3e3){return or(e,t,s)}ke.success=(e,t=3e3)=>or(e,"success",t);ke.error=(e,t=5e3)=>or(e,"error",t);ke.info=(e,t=3e3)=>or(e,"info",t);ke.dismiss=Sc;const yx={setup(){return{state:Ml,dismiss:Sc}},template:`
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
  `},Vs=Sn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let xa=null;function as({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return xa&&xa(!1),Vs.title=e,Vs.message=t,Vs.confirmLabel=s,Vs.cancelLabel=n,Vs.danger=a,Vs.open=!0,new Promise(i=>{xa=i})}function ad(e){Vs.open=!1,xa&&(xa(e),xa=null)}const xx={setup(){function e(t){Vs.open&&t.key==="Escape"&&(t.stopPropagation(),ad(!1))}return He(()=>document.addEventListener("keydown",e,!0)),ht(()=>document.removeEventListener("keydown",e,!0)),{state:Vs,settle:ad}},template:`
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
 */const oa=typeof document<"u";function Bh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function _x(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Bh(e.default)}const Ze=Object.assign;function Nr(e,t){const s={};for(const n in t){const a=t[n];s[n]=xs(a)?a.map(e):e(a)}return s}const li=()=>{},xs=Array.isArray;function id(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Hh=/#/g,kx=/&/g,wx=/\//g,Sx=/=/g,Tx=/\?/g,Vh=/\+/g,Cx=/%5B/g,Ex=/%5D/g,jh=/%5E/g,Ax=/%60/g,zh=/%7B/g,Rx=/%7C/g,qh=/%7D/g,Ix=/%20/g;function Tc(e){return e==null?"":encodeURI(""+e).replace(Rx,"|").replace(Cx,"[").replace(Ex,"]")}function Nx(e){return Tc(e).replace(zh,"{").replace(qh,"}").replace(jh,"^")}function vo(e){return Tc(e).replace(Vh,"%2B").replace(Ix,"+").replace(Hh,"%23").replace(kx,"%26").replace(Ax,"`").replace(zh,"{").replace(qh,"}").replace(jh,"^")}function Ox(e){return vo(e).replace(Sx,"%3D")}function Lx(e){return Tc(e).replace(Hh,"%23").replace(Tx,"%3F")}function Dx(e){return Lx(e).replace(wx,"%2F")}function Ci(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Mx=/\/$/,Px=e=>e.replace(Mx,"");function Or(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=Bx(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Ci(l)}}function Fx(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ld(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function $x(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ia(t.matched[n],s.matched[a])&&Kh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ia(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Kh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Ux(e[s],t[s]))return!1;return!0}function Ux(e,t){return xs(e)?rd(e,t):xs(t)?rd(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function rd(e,t){return xs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function Bx(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const hn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let bo=(function(e){return e.pop="pop",e.push="push",e})({}),Lr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Hx(e){if(!e)if(oa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Px(e)}const Vx=/^[^#]+#/;function jx(e,t){return e.replace(Vx,"#")+t}function zx(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const cr=()=>({left:window.scrollX,top:window.scrollY});function qx(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=zx(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function od(e,t){return(history.state?history.state.position-t:-1)+e}const yo=new Map;function Kx(e,t){yo.set(e,t)}function Gx(e){const t=yo.get(e);return yo.delete(e),t}function Wx(e){return typeof e=="string"||e&&typeof e=="object"}function Gh(e){return typeof e=="string"||typeof e=="symbol"}let ot=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Wh=Symbol("");ot.MATCHER_NOT_FOUND+"",ot.NAVIGATION_GUARD_REDIRECT+"",ot.NAVIGATION_ABORTED+"",ot.NAVIGATION_CANCELLED+"",ot.NAVIGATION_DUPLICATED+"";function Na(e,t){return Ze(new Error,{type:e,[Wh]:!0},t)}function Fs(e,t){return e instanceof Error&&Wh in e&&(t==null||!!(e.type&t))}const Zx=["params","query","hash"];function Jx(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Zx)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Yx(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Vh," "),i=a.indexOf("="),l=Ci(i<0?a:a.slice(0,i)),r=i<0?null:Ci(a.slice(i+1));if(l in t){let o=t[l];xs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function cd(e){let t="";for(let s in e){const n=e[s];if(s=Ox(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(xs(n)?n.map(a=>a&&vo(a)):[n&&vo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function Qx(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=xs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Xx=Symbol(""),ud=Symbol(""),ur=Symbol(""),Cc=Symbol(""),xo=Symbol("");function za(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function xn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Na(ot.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):Wx(f)?o(Na(ot.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Dr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Bh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(xn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=_x(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&xn(f,s,n,l,r,a)()}))}}return i}function e_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ia(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ia(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let t_=()=>location.protocol+"//"+location.host;function Zh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),ld(r,"")}return ld(s,e)+n+a}function s_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=Zh(e,location),b=s.value,g=t.value;let T=0;if(f){if(s.value=p,t.value=f,l&&l===b){l=null;return}T=g?f.position-g.position:0}else n(p);a.forEach(N=>{N(s.value,b,{delta:T,type:bo.pop,direction:T?T>0?Lr.forward:Lr.back:Lr.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const b=a.indexOf(f);b>-1&&a.splice(b,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(Ze({},f.state,{scroll:cr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function dd(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?cr():null}}function n_(e){const{history:t,location:s}=window,n={value:Zh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:t_()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,Ze({},t.state,dd(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=Ze({},a.value,t.state,{forward:o,scroll:cr()});i(u.current,u,!0),i(o,Ze({},dd(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function a_(e){e=Hx(e);const t=n_(e),s=s_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=Ze({location:"",base:e,go:n,createHref:jx.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function i_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),a_(e)}let Pn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var _t=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(_t||{});const l_={type:Pn.Static,value:""},r_=/[a-zA-Z0-9_]/;function o_(e){if(!e)return[[]];if(e==="/")return[[l_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=_t.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===_t.Static?i.push({type:Pn.Static,value:c}):s===_t.Param||s===_t.ParamRegExp||s===_t.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Pn.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==_t.ParamRegExp){n=s,s=_t.EscapeNext;continue}switch(s){case _t.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=_t.Param):f();break;case _t.EscapeNext:f(),s=n;break;case _t.Param:o==="("?s=_t.ParamRegExp:r_.test(o)?f():(d(),s=_t.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case _t.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=_t.ParamRegExpEnd:u+=o;break;case _t.ParamRegExpEnd:d(),s=_t.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===_t.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const fd="[^/]+?",c_={sensitive:!1,strict:!1,start:!0,end:!0};var jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(jt||{});const u_=/[.+*?^${}()[\]/\\]/g;function d_(e,t){const s=Ze({},c_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[jt.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=jt.Segment+(s.sensitive?jt.BonusCaseSensitive:0);if(f.type===Pn.Static)d||(a+="/"),a+=f.value.replace(u_,"\\$&"),p+=jt.Static;else if(f.type===Pn.Param){const{value:b,repeatable:g,optional:T,regexp:N}=f;i.push({name:b,repeatable:g,optional:T});const y=N||fd;if(y!==fd){p+=jt.BonusCustomRegExp;try{`${y}`}catch(x){throw new Error(`Invalid custom RegExp for param "${b}" (${y}): `+x.message)}}let v=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;d||(v=T&&c.length<2?`(?:/${v})`:"/"+v),T&&(v+="?"),a+=v,p+=jt.Dynamic,T&&(p+=jt.BonusOptional),g&&(p+=jt.BonusRepeatable),y===".*"&&(p+=jt.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",b=i[f-1];d[b.name]=p&&b.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Pn.Static)u+=p.value;else if(p.type===Pn.Param){const{value:b,repeatable:g,optional:T}=p,N=b in c?c[b]:"";if(xs(N)&&!g)throw new Error(`Provided param "${b}" is an array but it is not repeatable (* or + modifiers)`);const y=xs(N)?N.join("/"):N;if(!y)if(T)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${b}"`);u+=y}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function f_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===jt.Static+jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===jt.Static+jt.Segment?1:-1:0}function Jh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=f_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(pd(n))return 1;if(pd(a))return-1}return a.length-n.length}function pd(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const p_={strict:!1,end:!0,sensitive:!1};function h_(e,t,s){const n=d_(o_(e.path),s),a=Ze(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function g_(e,t){const s=[],n=new Map;t=id(p_,t);function a(d){return n.get(d)}function i(d,f,p){const b=!p,g=gd(d);g.aliasOf=p&&p.record;const T=id(t,d),N=[g];if("alias"in d){const x=typeof d.alias=="string"?[d.alias]:d.alias;for(const k of x)N.push(gd(Ze({},g,{components:p?p.record.components:g.components,path:k,aliasOf:p?p.record:g})))}let y,v;for(const x of N){const{path:k}=x;if(f&&k[0]!=="/"){const I=f.record.path,O=I[I.length-1]==="/"?"":"/";x.path=f.record.path+(k&&O+k)}if(y=h_(x,f,T),p?p.alias.push(y):(v=v||y,v!==y&&v.alias.push(y),b&&d.name&&!md(y)&&l(d.name)),Yh(y)&&o(y),g.children){const I=g.children;for(let O=0;O<I.length;O++)i(I[O],y,p&&p.children[O])}p=p||y}return v?()=>{l(v)}:li}function l(d){if(Gh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=b_(d,s);s.splice(f,0,d),d.record.name&&!md(d)&&n.set(d.record.name,d)}function c(d,f){let p,b={},g,T;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw Na(ot.MATCHER_NOT_FOUND,{location:d});T=p.record.name,b=Ze(hd(f.params,p.keys.filter(v=>!v.optional).concat(p.parent?p.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),d.params&&hd(d.params,p.keys.map(v=>v.name))),g=p.stringify(b)}else if(d.path!=null)g=d.path,p=s.find(v=>v.re.test(g)),p&&(b=p.parse(g),T=p.record.name);else{if(p=f.name?n.get(f.name):s.find(v=>v.re.test(f.path)),!p)throw Na(ot.MATCHER_NOT_FOUND,{location:d,currentLocation:f});T=p.record.name,b=Ze({},f.params,d.params),g=p.stringify(b)}const N=[];let y=p;for(;y;)N.unshift(y.record),y=y.parent;return{name:T,path:g,params:b,matched:N,meta:v_(N)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function hd(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function gd(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:m_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function m_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function md(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function v_(e){return e.reduce((t,s)=>Ze(t,s.meta),{})}function b_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Jh(e,t[i])<0?n=i:s=i+1}const a=y_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function y_(e){let t=e;for(;t=t.parent;)if(Yh(t)&&Jh(e,t)===0)return t}function Yh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function vd(e){const t=ds(ur),s=ds(Cc),n=J(()=>{const o=Is(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(Ia.bind(null,u));if(f>-1)return f;const p=bd(o[c-2]);return c>1&&bd(u)===p&&d[d.length-1].path!==p?d.findIndex(Ia.bind(null,o[c-2])):f}),i=J(()=>a.value>-1&&S_(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&Kh(s.params,n.value.params));function r(o={}){if(w_(o)){const c=t[Is(e.replace)?"replace":"push"](Is(e.to)).catch(li);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function x_(e){return e.length===1?e[0]:e}const __=Ni({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:vd,setup(e,{slots:t}){const s=Sn(vd(e)),{options:n}=ds(ur),a=J(()=>({[yd(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[yd(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&x_(t.default(s));return e.custom?i:wa("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),k_=__;function w_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function S_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!xs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function bd(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const yd=(e,t,s)=>e??t??s,T_=Ni({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=ds(xo),a=J(()=>e.route||n.value),i=ds(ud,0),l=J(()=>{let c=Is(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);ti(ud,J(()=>l.value+1)),ti(Xx,r),ti(xo,a);const o=h();return fs(()=>[o.value,r.value,e.name],([c,u,d],[f,p,b])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!Ia(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return xd(s.default,{Component:f,route:c});const p=d.props[u],b=p?p===!0?c.params:typeof p=="function"?p(c):p:null,T=wa(f,Ze({},b,t,{onVnodeUnmounted:N=>{N.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return xd(s.default,{Component:T,route:c})||T}}});function xd(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const C_=T_;function E_(e){const t=g_(e.routes,e),s=e.parseQuery||Yx,n=e.stringifyQuery||cd,a=e.history,i=za(),l=za(),r=za(),o=Do(hn);let c=hn;oa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Nr.bind(null,j=>""+j),d=Nr.bind(null,Dx),f=Nr.bind(null,Ci);function p(j,re){let le,me;return Gh(j)?(le=t.getRecordMatcher(j),me=re):me=j,t.addRoute(me,le)}function b(j){const re=t.getRecordMatcher(j);re&&t.removeRoute(re)}function g(){return t.getRoutes().map(j=>j.record)}function T(j){return!!t.getRecordMatcher(j)}function N(j,re){if(re=Ze({},re||o.value),typeof j=="string"){const C=Or(s,j,re.path),P=t.resolve({path:C.path},re),Z=a.createHref(C.fullPath);return Ze(C,P,{params:f(P.params),hash:Ci(C.hash),redirectedFrom:void 0,href:Z})}let le;if(j.path!=null)le=Ze({},j,{path:Or(s,j.path,re.path).path});else{const C=Ze({},j.params);for(const P in C)C[P]==null&&delete C[P];le=Ze({},j,{params:d(C)}),re.params=d(re.params)}const me=t.resolve(le,re),be=j.hash||"";me.params=u(f(me.params));const Oe=Fx(n,Ze({},j,{hash:Nx(be),path:me.path})),m=a.createHref(Oe);return Ze({fullPath:Oe,hash:be,query:n===cd?Qx(j.query):j.query||{}},me,{redirectedFrom:void 0,href:m})}function y(j){return typeof j=="string"?Or(s,j,o.value.path):Ze({},j)}function v(j,re){if(c!==j)return Na(ot.NAVIGATION_CANCELLED,{from:re,to:j})}function x(j){return O(j)}function k(j){return x(Ze(y(j),{replace:!0}))}function I(j,re){const le=j.matched[j.matched.length-1];if(le&&le.redirect){const{redirect:me}=le;let be=typeof me=="function"?me(j,re):me;return typeof be=="string"&&(be=be.includes("?")||be.includes("#")?be=y(be):{path:be},be.params={}),Ze({query:j.query,hash:j.hash,params:be.path!=null?{}:j.params},be)}}function O(j,re){const le=c=N(j),me=o.value,be=j.state,Oe=j.force,m=j.replace===!0,C=I(le,me);if(C)return O(Ze(y(C),{state:typeof C=="object"?Ze({},be,C.state):be,force:Oe,replace:m}),re||le);const P=le;P.redirectedFrom=re;let Z;return!Oe&&$x(n,me,le)&&(Z=Na(ot.NAVIGATION_DUPLICATED,{to:P,from:me}),de(me,me,!0,!1)),(Z?Promise.resolve(Z):L(P,me)).catch(A=>Fs(A)?Fs(A,ot.NAVIGATION_GUARD_REDIRECT)?A:ce(A):R(A,P,me)).then(A=>{if(A){if(Fs(A,ot.NAVIGATION_GUARD_REDIRECT))return O(Ze({replace:m},y(A.to),{state:typeof A.to=="object"?Ze({},be,A.to.state):be,force:Oe}),re||P)}else A=F(P,me,!0,m,be);return U(P,me,A),A})}function w(j,re){const le=v(j,re);return le?Promise.reject(le):Promise.resolve()}function E(j){const re=Q.values().next().value;return re&&typeof re.runWithContext=="function"?re.runWithContext(j):j()}function L(j,re){let le;const[me,be,Oe]=e_(j,re);le=Dr(me.reverse(),"beforeRouteLeave",j,re);for(const C of me)C.leaveGuards.forEach(P=>{le.push(xn(P,j,re))});const m=w.bind(null,j,re);return le.push(m),Ie(le).then(()=>{le=[];for(const C of i.list())le.push(xn(C,j,re));return le.push(m),Ie(le)}).then(()=>{le=Dr(be,"beforeRouteUpdate",j,re);for(const C of be)C.updateGuards.forEach(P=>{le.push(xn(P,j,re))});return le.push(m),Ie(le)}).then(()=>{le=[];for(const C of Oe)if(C.beforeEnter)if(xs(C.beforeEnter))for(const P of C.beforeEnter)le.push(xn(P,j,re));else le.push(xn(C.beforeEnter,j,re));return le.push(m),Ie(le)}).then(()=>(j.matched.forEach(C=>C.enterCallbacks={}),le=Dr(Oe,"beforeRouteEnter",j,re,E),le.push(m),Ie(le))).then(()=>{le=[];for(const C of l.list())le.push(xn(C,j,re));return le.push(m),Ie(le)}).catch(C=>Fs(C,ot.NAVIGATION_CANCELLED)?C:Promise.reject(C))}function U(j,re,le){r.list().forEach(me=>E(()=>me(j,re,le)))}function F(j,re,le,me,be){const Oe=v(j,re);if(Oe)return Oe;const m=re===hn,C=oa?history.state:{};le&&(me||m?a.replace(j.fullPath,Ze({scroll:m&&C&&C.scroll},be)):a.push(j.fullPath,be)),o.value=j,de(j,re,le,m),ce()}let S;function M(){S||(S=a.listen((j,re,le)=>{if(!ue.listening)return;const me=N(j),be=I(me,ue.currentRoute.value);if(be){O(Ze(be,{replace:!0,force:!0}),me).catch(li);return}c=me;const Oe=o.value;oa&&Kx(od(Oe.fullPath,le.delta),cr()),L(me,Oe).catch(m=>Fs(m,ot.NAVIGATION_ABORTED|ot.NAVIGATION_CANCELLED)?m:Fs(m,ot.NAVIGATION_GUARD_REDIRECT)?(O(Ze(y(m.to),{force:!0}),me).then(C=>{Fs(C,ot.NAVIGATION_ABORTED|ot.NAVIGATION_DUPLICATED)&&!le.delta&&le.type===bo.pop&&a.go(-1,!1)}).catch(li),Promise.reject()):(le.delta&&a.go(-le.delta,!1),R(m,me,Oe))).then(m=>{m=m||F(me,Oe,!1),m&&(le.delta&&!Fs(m,ot.NAVIGATION_CANCELLED)?a.go(-le.delta,!1):le.type===bo.pop&&Fs(m,ot.NAVIGATION_ABORTED|ot.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),U(me,Oe,m)}).catch(li)}))}let H=za(),W=za(),D;function R(j,re,le){ce(j);const me=W.list();return me.length?me.forEach(be=>be(j,re,le)):console.error(j),Promise.reject(j)}function q(){return D&&o.value!==hn?Promise.resolve():new Promise((j,re)=>{H.add([j,re])})}function ce(j){return D||(D=!j,M(),H.list().forEach(([re,le])=>j?le(j):re()),H.reset()),j}function de(j,re,le,me){const{scrollBehavior:be}=e;if(!oa||!be)return Promise.resolve();const Oe=!le&&Gx(od(j.fullPath,0))||(me||!le)&&history.state&&history.state.scroll||null;return wt().then(()=>be(j,re,Oe)).then(m=>m&&qx(m)).catch(m=>R(m,j,re))}const se=j=>a.go(j);let pe;const Q=new Set,ue={currentRoute:o,listening:!0,addRoute:p,removeRoute:b,clearRoutes:t.clearRoutes,hasRoute:T,getRoutes:g,resolve:N,options:e,push:x,replace:k,go:se,back:()=>se(-1),forward:()=>se(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:W.add,isReady:q,install(j){j.component("RouterLink",k_),j.component("RouterView",C_),j.config.globalProperties.$router=ue,Object.defineProperty(j.config.globalProperties,"$route",{enumerable:!0,get:()=>Is(o)}),oa&&!pe&&o.value===hn&&(pe=!0,x(a.location).catch(me=>{}));const re={};for(const me in hn)Object.defineProperty(re,me,{get:()=>o.value[me],enumerable:!0});j.provide(ur,ue),j.provide(Cc,Lo(re)),j.provide(xo,o);const le=j.unmount;Q.add(j),j.unmount=function(){Q.delete(j),Q.size<1&&(c=hn,S&&S(),S=null,o.value=hn,pe=!1,D=!1),le()}}};function Ie(j){return j.reduce((re,le)=>re.then(()=>E(le)),Promise.resolve())}return ue}function Qh(){return ds(ur)}function A_(e){return ds(Cc)}const R_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],Jt=Sn({open:!1,query:"",selected:0});function _d(){Jt.query="",Jt.selected=0,Jt.open=!0}function Mr(){Jt.open=!1}function I_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const N_={setup(){const e=Qh(),t=h(null),s=J(()=>{const i=Jt.query.trim().toLowerCase();return R_.map(l=>({...l,_score:I_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});fs(()=>Jt.open,async i=>{var l;i&&(await wt(),(l=t.value)==null||l.focus())}),fs(()=>Jt.query,()=>{Jt.selected=0});function n(i){Mr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Mr();return}if(i.key==="ArrowDown")i.preventDefault(),Jt.selected=Math.min(Jt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Jt.selected=Math.max(Jt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Jt.selected];l&&n(l)}}return{state:Jt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Mr}},template:`
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
  `},_o={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(_o));const O_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>wa("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[wa("path",{d:_o[e.name]||_o.info})])}},L_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function kd(e){return[...e.querySelectorAll(L_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const D_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=kd(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||kd(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Ec(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Pa(e){const t=Ec(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Ac(e){const t=Ec(e);return t?t.toLocaleTimeString():"—"}function Xh(e){const t=Ec(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Oa(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Rc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function eg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function wd(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function tg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function M_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const P_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=J(()=>{const S=e.value.uptime_seconds||0,M=Math.floor(S/86400),H=Math.floor(S%86400/3600),W=Math.floor(S%3600/60),D=[];return M>0&&D.push(`${M}d`),H>0&&D.push(`${H}h`),(D.length===0||M===0&&H===0)&&D.push(`${W}m`),D.join(" ")}),p=J(()=>{const S=e.value.uptime_seconds||0;return 125.66*(1-Math.min(S/86400,1))}),b=J(()=>{const S=e.value;return[{label:"Guilds",value:S.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:S.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:S.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${S.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:S.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:S.loop_count>0?"text-green-400":"",highlight:S.loop_count>0},{label:"Agents",value:S.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:S.agent_count>0?`${S.agent_count} total`:"",subColor:"text-gray-500",highlight:(S.agent_running??0)>0},{label:"Processes",value:S.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:S.process_count>0?`${S.process_count} total`:"",subColor:"text-gray-500",highlight:(S.process_running??0)>0},{label:"Schedules",value:S.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(S.schedule_failing>0?`${S.schedule_failing} failing`:"")+(S.schedule_failing>0&&S.schedule_paused>0?", ":"")+(S.schedule_paused>0?`${S.schedule_paused} paused`:"")||void 0,subColor:S.schedule_failing>0?"text-red-400":"text-yellow-400",color:S.schedule_failing>0?"text-red-400":"",highlight:S.schedule_failing>0},{label:"Users",value:S.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=J(()=>{const S=e.value,M=[];return M.push({label:"Bot",status:S.status==="online"?"ok":"warn",detail:S.status==="online"?"Online":"Starting"}),(S.schedule_failing||0)>0?M.push({label:"Schedules",status:"error",detail:`${S.schedule_failing} failing`}):(S.schedule_count||0)>0&&M.push({label:"Schedules",status:"ok",detail:`${S.schedule_count} configured`}),(S.loop_count||0)>0&&M.push({label:"Loops",status:"ok",detail:`${S.loop_count} active`}),(S.agent_running||0)>0&&M.push({label:"Agents",status:"ok",detail:`${S.agent_running} running`}),(S.process_running||0)>0&&M.push({label:"Processes",status:"ok",detail:`${S.process_running} running`}),M});async function T(){try{e.value=await G.get("/api/status"),s.value=null}catch(S){s.value=S.message}finally{t.value=!1}}async function N(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function v(){try{const S=await G.get("/api/knowledge");c.value=(Array.isArray(S)?S:[]).reduce((M,H)=>M+(H.chunks||0),0)}catch{c.value=null}}async function x(){try{const S=await G.get("/api/agents");r.value=S.filter(M=>M.status==="running")}catch{}}async function k(){u.value={...u.value,reload:!0};try{await G.post("/api/reload"),ke.success("Config reloaded")}catch(S){ke.error(S.message)}u.value={...u.value,reload:!1}}async function I(){if(!await as({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const M=e.value.session_count;e.value={...e.value,session_count:0};try{const H=await G.post("/api/sessions/clear-all");ke.success(`Cleared ${H.count} session${H.count!==1?"s":""}`),await T()}catch(H){e.value={...e.value,session_count:M},ke.error(H.message)}u.value={...u.value,clearSessions:!1}}async function O(){if(!await as({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const M=e.value.loop_count;e.value={...e.value,loop_count:0};try{const H=await G.post("/api/loops/stop-all");ke.success(H.result),await T()}catch(H){e.value={...e.value,loop_count:M},ke.error(H.message)}u.value={...u.value,stopLoops:!1}}function w(){t.value=!0,s.value=null,T(),N(),y(),x()}let E=null,L=null,U=null;function F(S){if(S.payload&&S.payload.tool_name){const M={...S.payload,_isNew:!0,_key:++d};n.value.unshift(M),n.value.length>10&&n.value.pop(),o.value++,M.error&&(i.value.unshift(M),i.value.length>5&&i.value.pop()),setTimeout(()=>{M._isNew=!1},1500),clearTimeout(U),U=setTimeout(()=>{o.value=0},1e4)}}return He(async()=>{await Promise.all([T(),N(),y(),x(),v()]),E=setInterval(T,15e3),L=setInterval(x,1e4),Je.subscribe("events",F)}),ht(()=>{E&&clearInterval(E),L&&clearInterval(L),clearTimeout(U),Je.unsubscribe("events",F)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:b,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:N,fetchStatus:T,formatTime:Ac,formatDuration:Oa,retry:w,reloadConfig:k,clearSessions:I,stopAllLoops:O}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Sd(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function F_(e){if(Array.isArray(e))return e}function $_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function U_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function B_(e,t){return F_(e)||$_(e,t)||H_(e,t)||U_()}function H_(e,t){if(e){if(typeof e=="string")return Sd(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Sd(e,t):void 0}}const sg=Object.entries,Td=Object.setPrototypeOf,V_=Object.isFrozen,j_=Object.getPrototypeOf,z_=Object.getOwnPropertyDescriptor;let Gt=Object.freeze,hs=Object.seal,ca=Object.create,ng=typeof Reflect<"u"&&Reflect,ko=ng.apply,wo=ng.construct;Gt||(Gt=function(t){return t});hs||(hs=function(t){return t});ko||(ko=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});wo||(wo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const $s=yt(Array.prototype.forEach),q_=yt(Array.prototype.lastIndexOf),Cd=yt(Array.prototype.pop),aa=yt(Array.prototype.push),K_=yt(Array.prototype.splice),Vt=Array.isArray,Qa=yt(String.prototype.toLowerCase),Pr=yt(String.prototype.toString),Ed=yt(String.prototype.match),ia=yt(String.prototype.replace),Ad=yt(String.prototype.indexOf),G_=yt(String.prototype.trim),W_=yt(Number.prototype.toString),Z_=yt(Boolean.prototype.toString),Rd=typeof BigInt>"u"?null:yt(BigInt.prototype.toString),Id=typeof Symbol>"u"?null:yt(Symbol.prototype.toString),rt=yt(Object.prototype.hasOwnProperty),qa=yt(Object.prototype.toString),At=yt(RegExp.prototype.test),Nn=J_(TypeError);function yt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return ko(e,t,n)}}function J_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return wo(e,s)}}function Le(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Qa;if(Td&&Td(e,null),!Vt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(V_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Y_(e){for(let t=0;t<e.length;t++)rt(e,t)||(e[t]=null);return e}function Dt(e){const t=ca(null);for(const n of sg(e)){var s=B_(n,2);const a=s[0],i=s[1];rt(e,a)&&(Vt(i)?t[a]=Y_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Dt(i):t[a]=i)}return t}function Q_(e){switch(typeof e){case"string":return e;case"number":return W_(e);case"boolean":return Z_(e);case"bigint":return Rd?Rd(e):"0";case"symbol":return Id?Id(e):"Symbol()";case"undefined":return qa(e);case"function":case"object":{if(e===null)return qa(e);const t=e,s=Ts(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:qa(n)}return qa(e)}default:return qa(e)}}function Ts(e,t){for(;e!==null;){const n=z_(e,t);if(n){if(n.get)return yt(n.get);if(typeof n.value=="function")return yt(n.value)}e=j_(e)}function s(){return null}return s}function X_(e){try{return At(e,""),!0}catch{return!1}}const Nd=Gt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Fr=Gt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),$r=Gt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),ek=Gt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Ur=Gt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tk=Gt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Od=Gt(["#text"]),Ld=Gt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Br=Gt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Dd=Gt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Qi=Gt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sk=hs(/{{[\w\W]*|^[\w\W]*}}/g),nk=hs(/<%[\w\W]*|^[\w\W]*%>/g),ak=hs(/\${[\w\W]*/g),ik=hs(/^data-[\-\w.\u00B7-\uFFFF]+$/),lk=hs(/^aria-[\-\w]+$/),Md=hs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),rk=hs(/^(?:\w+script|data):/i),ok=hs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),ck=hs(/^html$/i),uk=hs(/^[a-z][.\w]*(-[.\w]+)+$/i),ws={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},dk=function(){return typeof window>"u"?null:window},fk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Pd=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function ag(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:dk();const t=ve=>ag(ve);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==ws.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=Ts(f,"cloneNode"),b=Ts(f,"remove"),g=Ts(f,"nextSibling"),T=Ts(f,"childNodes"),N=Ts(f,"parentNode"),y=Ts(f,"shadowRoot"),v=Ts(f,"attributes"),x=l&&l.prototype?Ts(l.prototype,"nodeType"):null,k=l&&l.prototype?Ts(l.prototype,"nodeName"):null;if(typeof i=="function"){const ve=s.createElement("template");ve.content&&ve.content.ownerDocument&&(s=ve.content.ownerDocument)}let I,O="",w,E=!1,L=0;const U=function(){if(L>0)throw Nn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},F=function(_){U(),L++;try{return I.createHTML(_)}finally{L--}},S=function(_){U(),L++;try{return I.createScriptURL(_)}finally{L--}},M=function(){return E||(w=fk(d,a),E=!0),w},H=s,W=H.implementation,D=H.createNodeIterator,R=H.createDocumentFragment,q=H.getElementsByTagName,ce=n.importNode;let de=Pd();t.isSupported=typeof sg=="function"&&typeof N=="function"&&W&&W.createHTMLDocument!==void 0;const se=sk,pe=nk,Q=ak,ue=ik,Ie=lk,j=rk,re=ok,le=uk;let me=Md,be=null;const Oe=Le({},[...Nd,...Fr,...$r,...Ur,...Od]);let m=null;const C=Le({},[...Ld,...Br,...Dd,...Qi]);let P=Object.seal(ca(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),Z=null,A=null;const $=Object.seal(ca(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Y=!0,ee=!0,te=!1,X=!0,ge=!1,ie=!0,fe=!1,xe=!1,we=!1,Ae=!1,B=!1,oe=!1,_e=!0,Me=!1;const Ue="user-content-";let Ve=!0,ut=!1,We={},Xe=null;const _s=Le({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ls=null;const Qn=Le({},["audio","video","img","source","image","track"]);let an=null;const Xn=Le({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),ln="http://www.w3.org/1998/Math/MathML",rn="http://www.w3.org/2000/svg",z="http://www.w3.org/1999/xhtml";let Te=z,ks=!1,Cn=null;const En=Le({},[ln,rn,z],Pr);let on=Le({},["mi","mo","mn","ms","mtext"]),cn=Le({},["annotation-xml"]);const hr=Le({},["title","style","font","a","script"]);let un=null;const V=["application/xhtml+xml","text/html"],ne="text/html";let ye=null,qe=null;const lt=s.createElement("form"),Bt=function(_){return _ instanceof RegExp||_ instanceof Function},Fa=function(){let _=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(qe&&qe===_)return;(!_||typeof _!="object")&&(_={}),_=Dt(_),un=V.indexOf(_.PARSER_MEDIA_TYPE)===-1?ne:_.PARSER_MEDIA_TYPE,ye=un==="application/xhtml+xml"?Pr:Qa,be=rt(_,"ALLOWED_TAGS")&&Vt(_.ALLOWED_TAGS)?Le({},_.ALLOWED_TAGS,ye):Oe,m=rt(_,"ALLOWED_ATTR")&&Vt(_.ALLOWED_ATTR)?Le({},_.ALLOWED_ATTR,ye):C,Cn=rt(_,"ALLOWED_NAMESPACES")&&Vt(_.ALLOWED_NAMESPACES)?Le({},_.ALLOWED_NAMESPACES,Pr):En,an=rt(_,"ADD_URI_SAFE_ATTR")&&Vt(_.ADD_URI_SAFE_ATTR)?Le(Dt(Xn),_.ADD_URI_SAFE_ATTR,ye):Xn,Ls=rt(_,"ADD_DATA_URI_TAGS")&&Vt(_.ADD_DATA_URI_TAGS)?Le(Dt(Qn),_.ADD_DATA_URI_TAGS,ye):Qn,Xe=rt(_,"FORBID_CONTENTS")&&Vt(_.FORBID_CONTENTS)?Le({},_.FORBID_CONTENTS,ye):_s,Z=rt(_,"FORBID_TAGS")&&Vt(_.FORBID_TAGS)?Le({},_.FORBID_TAGS,ye):Dt({}),A=rt(_,"FORBID_ATTR")&&Vt(_.FORBID_ATTR)?Le({},_.FORBID_ATTR,ye):Dt({}),We=rt(_,"USE_PROFILES")?_.USE_PROFILES&&typeof _.USE_PROFILES=="object"?Dt(_.USE_PROFILES):_.USE_PROFILES:!1,Y=_.ALLOW_ARIA_ATTR!==!1,ee=_.ALLOW_DATA_ATTR!==!1,te=_.ALLOW_UNKNOWN_PROTOCOLS||!1,X=_.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ge=_.SAFE_FOR_TEMPLATES||!1,ie=_.SAFE_FOR_XML!==!1,fe=_.WHOLE_DOCUMENT||!1,Ae=_.RETURN_DOM||!1,B=_.RETURN_DOM_FRAGMENT||!1,oe=_.RETURN_TRUSTED_TYPE||!1,we=_.FORCE_BODY||!1,_e=_.SANITIZE_DOM!==!1,Me=_.SANITIZE_NAMED_PROPS||!1,Ve=_.KEEP_CONTENT!==!1,ut=_.IN_PLACE||!1,me=X_(_.ALLOWED_URI_REGEXP)?_.ALLOWED_URI_REGEXP:Md,Te=typeof _.NAMESPACE=="string"?_.NAMESPACE:z,on=rt(_,"MATHML_TEXT_INTEGRATION_POINTS")&&_.MATHML_TEXT_INTEGRATION_POINTS&&typeof _.MATHML_TEXT_INTEGRATION_POINTS=="object"?Dt(_.MATHML_TEXT_INTEGRATION_POINTS):Le({},["mi","mo","mn","ms","mtext"]),cn=rt(_,"HTML_INTEGRATION_POINTS")&&_.HTML_INTEGRATION_POINTS&&typeof _.HTML_INTEGRATION_POINTS=="object"?Dt(_.HTML_INTEGRATION_POINTS):Le({},["annotation-xml"]);const K=rt(_,"CUSTOM_ELEMENT_HANDLING")&&_.CUSTOM_ELEMENT_HANDLING&&typeof _.CUSTOM_ELEMENT_HANDLING=="object"?Dt(_.CUSTOM_ELEMENT_HANDLING):ca(null);if(P=ca(null),rt(K,"tagNameCheck")&&Bt(K.tagNameCheck)&&(P.tagNameCheck=K.tagNameCheck),rt(K,"attributeNameCheck")&&Bt(K.attributeNameCheck)&&(P.attributeNameCheck=K.attributeNameCheck),rt(K,"allowCustomizedBuiltInElements")&&typeof K.allowCustomizedBuiltInElements=="boolean"&&(P.allowCustomizedBuiltInElements=K.allowCustomizedBuiltInElements),ge&&(ee=!1),B&&(Ae=!0),We&&(be=Le({},Od),m=ca(null),We.html===!0&&(Le(be,Nd),Le(m,Ld)),We.svg===!0&&(Le(be,Fr),Le(m,Br),Le(m,Qi)),We.svgFilters===!0&&(Le(be,$r),Le(m,Br),Le(m,Qi)),We.mathMl===!0&&(Le(be,Ur),Le(m,Dd),Le(m,Qi))),$.tagCheck=null,$.attributeCheck=null,rt(_,"ADD_TAGS")&&(typeof _.ADD_TAGS=="function"?$.tagCheck=_.ADD_TAGS:Vt(_.ADD_TAGS)&&(be===Oe&&(be=Dt(be)),Le(be,_.ADD_TAGS,ye))),rt(_,"ADD_ATTR")&&(typeof _.ADD_ATTR=="function"?$.attributeCheck=_.ADD_ATTR:Vt(_.ADD_ATTR)&&(m===C&&(m=Dt(m)),Le(m,_.ADD_ATTR,ye))),rt(_,"ADD_URI_SAFE_ATTR")&&Vt(_.ADD_URI_SAFE_ATTR)&&Le(an,_.ADD_URI_SAFE_ATTR,ye),rt(_,"FORBID_CONTENTS")&&Vt(_.FORBID_CONTENTS)&&(Xe===_s&&(Xe=Dt(Xe)),Le(Xe,_.FORBID_CONTENTS,ye)),rt(_,"ADD_FORBID_CONTENTS")&&Vt(_.ADD_FORBID_CONTENTS)&&(Xe===_s&&(Xe=Dt(Xe)),Le(Xe,_.ADD_FORBID_CONTENTS,ye)),Ve&&(be["#text"]=!0),fe&&Le(be,["html","head","body"]),be.table&&(Le(be,["tbody"]),delete Z.tbody),_.TRUSTED_TYPES_POLICY){if(typeof _.TRUSTED_TYPES_POLICY.createHTML!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof _.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=I;I=_.TRUSTED_TYPES_POLICY;try{O=F("")}catch(Ce){throw I=ae,Ce}}else _.TRUSTED_TYPES_POLICY===null?(I=void 0,O=""):(I===void 0&&(I=M()),I&&typeof O=="string"&&(O=F("")));(de.uponSanitizeElement.length>0||de.uponSanitizeAttribute.length>0)&&be===Oe&&(be=Dt(be)),de.uponSanitizeAttribute.length>0&&m===C&&(m=Dt(m)),Gt&&Gt(_),qe=_},Uc=Le({},[...Fr,...$r,...ek]),Bc=Le({},[...Ur,...tk]),bg=function(_){let K=N(_);(!K||!K.tagName)&&(K={namespaceURI:Te,tagName:"template"});const ae=Qa(_.tagName),Ce=Qa(K.tagName);return Cn[_.namespaceURI]?_.namespaceURI===rn?K.namespaceURI===z?ae==="svg":K.namespaceURI===ln?ae==="svg"&&(Ce==="annotation-xml"||on[Ce]):!!Uc[ae]:_.namespaceURI===ln?K.namespaceURI===z?ae==="math":K.namespaceURI===rn?ae==="math"&&cn[Ce]:!!Bc[ae]:_.namespaceURI===z?K.namespaceURI===rn&&!cn[Ce]||K.namespaceURI===ln&&!on[Ce]?!1:!Bc[ae]&&(hr[ae]||!Uc[ae]):!!(un==="application/xhtml+xml"&&Cn[_.namespaceURI]):!1},gs=function(_){aa(t.removed,{element:_});try{N(_).removeChild(_)}catch{if(b(_),!N(_))throw Nn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Hc=function(_){const K=T?T(_):_.childNodes;if(K){const Ce=[];$s(K,Re=>{aa(Ce,Re)}),$s(Ce,Re=>{try{b(Re)}catch{}})}const ae=v?v(_):null;if(ae)for(let Ce=ae.length-1;Ce>=0;--Ce){const Re=ae[Ce],De=Re&&Re.name;if(typeof De=="string")try{_.removeAttribute(De)}catch{}}},An=function(_,K){try{aa(t.removed,{attribute:K.getAttributeNode(_),from:K})}catch{aa(t.removed,{attribute:null,from:K})}if(K.removeAttribute(_),_==="is")if(Ae||B)try{gs(K)}catch{}else try{K.setAttribute(_,"")}catch{}},yg=function(_){const K=v?v(_):_.attributes;if(K)for(let ae=K.length-1;ae>=0;--ae){const Ce=K[ae],Re=Ce&&Ce.name;if(!(typeof Re!="string"||m[ye(Re)]))try{_.removeAttribute(Re)}catch{}}},xg=function(_){const K=[_];for(;K.length>0;){const ae=K.pop();(x?x(ae):ae.nodeType)===ws.element&&yg(ae);const Re=T?T(ae):ae.childNodes;if(Re)for(let De=Re.length-1;De>=0;--De)K.push(Re[De])}},Vc=function(_){let K=null,ae=null;if(we)_="<remove></remove>"+_;else{const De=Ed(_,/^[\r\n\t ]+/);ae=De&&De[0]}un==="application/xhtml+xml"&&Te===z&&(_='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+_+"</body></html>");const Ce=I?F(_):_;if(Te===z)try{K=new u().parseFromString(Ce,un)}catch{}if(!K||!K.documentElement){K=W.createDocument(Te,"template",null);try{K.documentElement.innerHTML=ks?O:Ce}catch{}}const Re=K.body||K.documentElement;return _&&ae&&Re.insertBefore(s.createTextNode(ae),Re.childNodes[0]||null),Te===z?q.call(K,fe?"html":"body")[0]:fe?K.documentElement:Re},jc=function(_){return D.call(_.ownerDocument||_,_,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},gr=function(_){var K,ae;_.normalize();const Ce=D.call(_.ownerDocument||_,_,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Re=Ce.nextNode();for(;Re;){let xt=Re.data;$s([se,pe,Q],tt=>{xt=ia(xt,tt," ")}),Re.data=xt,Re=Ce.nextNode()}const De=(K=(ae=_.querySelectorAll)===null||ae===void 0?void 0:ae.call(_,"template"))!==null&&K!==void 0?K:[];$s(Array.from(De),xt=>{ea(xt.content)&&gr(xt.content)})},$i=function(_){const K=k?k(_):null;return typeof K!="string"||ye(K)!=="form"?!1:typeof _.nodeName!="string"||typeof _.textContent!="string"||typeof _.removeChild!="function"||_.attributes!==v(_)||typeof _.removeAttribute!="function"||typeof _.setAttribute!="function"||typeof _.namespaceURI!="string"||typeof _.insertBefore!="function"||typeof _.hasChildNodes!="function"||_.nodeType!==x(_)||_.childNodes!==T(_)},ea=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return x(_)===ws.documentFragment}catch{return!1}},$a=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return typeof x(_)=="number"}catch{return!1}};function Ds(ve,_,K){$s(ve,ae=>{ae.call(t,_,K,qe)})}const zc=function(_){let K=null;if(Ds(de.beforeSanitizeElements,_,null),$i(_))return gs(_),!0;const ae=ye(k?k(_):_.nodeName);if(Ds(de.uponSanitizeElement,_,{tagName:ae,allowedTags:be}),ie&&_.hasChildNodes()&&!$a(_.firstElementChild)&&At(/<[/\w!]/g,_.innerHTML)&&At(/<[/\w!]/g,_.textContent)||ie&&_.namespaceURI===z&&ae==="style"&&$a(_.firstElementChild)||_.nodeType===ws.progressingInstruction||ie&&_.nodeType===ws.comment&&At(/<[/\w]/g,_.data))return gs(_),!0;if(Z[ae]||!($.tagCheck instanceof Function&&$.tagCheck(ae))&&!be[ae]){if(!Z[ae]&&Kc(ae)&&(P.tagNameCheck instanceof RegExp&&At(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae)))return!1;if(Ve&&!Xe[ae]){const Re=N(_),De=T(_);if(De&&Re){const xt=De.length;for(let tt=xt-1;tt>=0;--tt){const dt=ut?De[tt]:p(De[tt],!0);Re.insertBefore(dt,g(_))}}}return gs(_),!0}return(x?x(_):_.nodeType)===ws.element&&!bg(_)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&At(/<\/no(script|embed|frames)/i,_.innerHTML)?(gs(_),!0):(ge&&_.nodeType===ws.text&&(K=_.textContent,$s([se,pe,Q],Re=>{K=ia(K,Re," ")}),_.textContent!==K&&(aa(t.removed,{element:_.cloneNode()}),_.textContent=K)),Ds(de.afterSanitizeElements,_,null),!1)},qc=function(_,K,ae){if(A[K]||_e&&(K==="id"||K==="name")&&(ae in s||ae in lt))return!1;const Ce=m[K]||$.attributeCheck instanceof Function&&$.attributeCheck(K,_);if(!(ee&&!A[K]&&At(ue,K))){if(!(Y&&At(Ie,K))){if(!Ce||A[K]){if(!(Kc(_)&&(P.tagNameCheck instanceof RegExp&&At(P.tagNameCheck,_)||P.tagNameCheck instanceof Function&&P.tagNameCheck(_))&&(P.attributeNameCheck instanceof RegExp&&At(P.attributeNameCheck,K)||P.attributeNameCheck instanceof Function&&P.attributeNameCheck(K,_))||K==="is"&&P.allowCustomizedBuiltInElements&&(P.tagNameCheck instanceof RegExp&&At(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae))))return!1}else if(!an[K]){if(!At(me,ia(ae,re,""))){if(!((K==="src"||K==="xlink:href"||K==="href")&&_!=="script"&&Ad(ae,"data:")===0&&Ls[_])){if(!(te&&!At(j,ia(ae,re,"")))){if(ae)return!1}}}}}}return!0},_g=Le({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Kc=function(_){return!_g[Qa(_)]&&At(le,_)},Gc=function(_){Ds(de.beforeSanitizeAttributes,_,null);const K=_.attributes;if(!K||$i(_))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:m,forceKeepAttr:void 0};let Ce=K.length;for(;Ce--;){const Re=K[Ce],De=Re.name,xt=Re.namespaceURI,tt=Re.value,dt=ye(De),dn=tt;let Tt=De==="value"?dn:G_(dn);if(ae.attrName=dt,ae.attrValue=Tt,ae.keepAttr=!0,ae.forceKeepAttr=void 0,Ds(de.uponSanitizeAttribute,_,ae),Tt=ae.attrValue,Me&&(dt==="id"||dt==="name")&&Ad(Tt,Ue)!==0&&(An(De,_),Tt=Ue+Tt),ie&&At(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Tt)){An(De,_);continue}if(dt==="attributename"&&Ed(Tt,"href")){An(De,_);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){An(De,_);continue}if(!X&&At(/\/>/i,Tt)){An(De,_);continue}ge&&$s([se,pe,Q],Zc=>{Tt=ia(Tt,Zc," ")});const Wc=ye(_.nodeName);if(!qc(Wc,dt,Tt)){An(De,_);continue}if(I&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!xt)switch(d.getAttributeType(Wc,dt)){case"TrustedHTML":{Tt=F(Tt);break}case"TrustedScriptURL":{Tt=S(Tt);break}}if(Tt!==dn)try{xt?_.setAttributeNS(xt,De,Tt):_.setAttribute(De,Tt),$i(_)?gs(_):Cd(t.removed)}catch{An(De,_)}}Ds(de.afterSanitizeAttributes,_,null)},Ui=function(_){let K=null;const ae=jc(_);for(Ds(de.beforeSanitizeShadowDOM,_,null);K=ae.nextNode();)if(Ds(de.uponSanitizeShadowNode,K,null),zc(K),Gc(K),ea(K.content)&&Ui(K.content),(x?x(K):K.nodeType)===ws.element){const Re=y?y(K):K.shadowRoot;ea(Re)&&(mr(Re),Ui(Re))}Ds(de.afterSanitizeShadowDOM,_,null)},mr=function(_){const K=[{node:_,shadow:null}];for(;K.length>0;){const ae=K.pop();if(ae.shadow){Ui(ae.shadow);continue}const Ce=ae.node,De=(x?x(Ce):Ce.nodeType)===ws.element,xt=T?T(Ce):Ce.childNodes;if(xt)for(let tt=xt.length-1;tt>=0;--tt)K.push({node:xt[tt],shadow:null});if(De){const tt=k?k(Ce):null;if(typeof tt=="string"&&ye(tt)==="template"){const dt=Ce.content;ea(dt)&&K.push({node:dt,shadow:null})}}if(De){const tt=y?y(Ce):Ce.shadowRoot;ea(tt)&&K.push({node:null,shadow:tt},{node:tt,shadow:null})}}};return t.sanitize=function(ve){let _=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},K=null,ae=null,Ce=null,Re=null;if(ks=!ve,ks&&(ve="<!-->"),typeof ve!="string"&&!$a(ve)&&(ve=Q_(ve),typeof ve!="string"))throw Nn("dirty is not a string, aborting");if(!t.isSupported)return ve;xe||Fa(_),t.removed=[];const De=ut&&typeof ve!="string"&&$a(ve);if(De){const dt=k?k(ve):ve.nodeName;if(typeof dt=="string"){const dn=ye(dt);if(!be[dn]||Z[dn])throw Nn("root node is forbidden and cannot be sanitized in-place")}if($i(ve))throw Nn("root node is clobbered and cannot be sanitized in-place");try{mr(ve)}catch(dn){throw Hc(ve),dn}}else if($a(ve))K=Vc("<!---->"),ae=K.ownerDocument.importNode(ve,!0),ae.nodeType===ws.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?K=ae:K.appendChild(ae),mr(ae);else{if(!Ae&&!ge&&!fe&&ve.indexOf("<")===-1)return I&&oe?F(ve):ve;if(K=Vc(ve),!K)return Ae?null:oe?O:""}K&&we&&gs(K.firstChild);const xt=jc(De?ve:K);try{for(;Ce=xt.nextNode();)zc(Ce),Gc(Ce),ea(Ce.content)&&Ui(Ce.content)}catch(dt){throw De&&Hc(ve),dt}if(De)return $s(t.removed,dt=>{dt.element&&xg(dt.element)}),ge&&gr(ve),ve;if(Ae){if(ge&&gr(K),B)for(Re=R.call(K.ownerDocument);K.firstChild;)Re.appendChild(K.firstChild);else Re=K;return(m.shadowroot||m.shadowrootmode)&&(Re=ce.call(n,Re,!0)),Re}let tt=fe?K.outerHTML:K.innerHTML;return fe&&be["!doctype"]&&K.ownerDocument&&K.ownerDocument.doctype&&K.ownerDocument.doctype.name&&At(ck,K.ownerDocument.doctype.name)&&(tt="<!DOCTYPE "+K.ownerDocument.doctype.name+`>
`+tt),ge&&$s([se,pe,Q],dt=>{tt=ia(tt,dt," ")}),I&&oe?F(tt):tt},t.setConfig=function(){let ve=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Fa(ve),xe=!0},t.clearConfig=function(){qe=null,xe=!1,I=w,O=""},t.isValidAttribute=function(ve,_,K){qe||Fa({});const ae=ye(ve),Ce=ye(_);return qc(ae,Ce,K)},t.addHook=function(ve,_){typeof _=="function"&&aa(de[ve],_)},t.removeHook=function(ve,_){if(_!==void 0){const K=q_(de[ve],_);return K===-1?void 0:K_(de[ve],K,1)[0]}return Cd(de[ve])},t.removeHooks=function(ve){de[ve]=[]},t.removeAllHooks=function(){de=Pd()},t}var Fd=ag();function Ic(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Yn=Ic();function ig(e){Yn=e}var ri={exec:()=>null};function Ye(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},pk=/^(?:[ \t]*(?:\n|$))+/,hk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,gk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Fi=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,mk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Nc=/(?:[*+-]|\d{1,9}[.)])/,lg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,rg=Ye(lg).replace(/bull/g,Nc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),vk=Ye(lg).replace(/bull/g,Nc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Oc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bk=/^[^\n]+/,Lc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yk=Ye(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Lc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xk=Ye(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Nc).getRegex(),dr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Dc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_k=Ye("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Dc).replace("tag",dr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),og=Ye(Oc).replace("hr",Fi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",dr).getRegex(),kk=Ye(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",og).getRegex(),Mc={blockquote:kk,code:hk,def:yk,fences:gk,heading:mk,hr:Fi,html:_k,lheading:rg,list:xk,newline:pk,paragraph:og,table:ri,text:bk},$d=Ye("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Fi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",dr).getRegex(),wk={...Mc,lheading:vk,table:$d,paragraph:Ye(Oc).replace("hr",Fi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",$d).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",dr).getRegex()},Sk={...Mc,html:Ye(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Dc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:ri,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:Ye(Oc).replace("hr",Fi).replace("heading",` *#{1,6} *[^
]`).replace("lheading",rg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Tk=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Ck=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,cg=/^( {2,}|\\)\n(?!\s*$)/,Ek=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,fr=/[\p{P}\p{S}]/u,Pc=/[\s\p{P}\p{S}]/u,ug=/[^\s\p{P}\p{S}]/u,Ak=Ye(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Pc).getRegex(),dg=/(?!~)[\p{P}\p{S}]/u,Rk=/(?!~)[\s\p{P}\p{S}]/u,Ik=/(?:[^\s\p{P}\p{S}]|~)/u,Nk=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,fg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Ok=Ye(fg,"u").replace(/punct/g,fr).getRegex(),Lk=Ye(fg,"u").replace(/punct/g,dg).getRegex(),pg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Dk=Ye(pg,"gu").replace(/notPunctSpace/g,ug).replace(/punctSpace/g,Pc).replace(/punct/g,fr).getRegex(),Mk=Ye(pg,"gu").replace(/notPunctSpace/g,Ik).replace(/punctSpace/g,Rk).replace(/punct/g,dg).getRegex(),Pk=Ye("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,ug).replace(/punctSpace/g,Pc).replace(/punct/g,fr).getRegex(),Fk=Ye(/\\(punct)/,"gu").replace(/punct/g,fr).getRegex(),$k=Ye(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Uk=Ye(Dc).replace("(?:-->|$)","-->").getRegex(),Bk=Ye("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Uk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Pl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Hk=Ye(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Pl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),hg=Ye(/^!?\[(label)\]\[(ref)\]/).replace("label",Pl).replace("ref",Lc).getRegex(),gg=Ye(/^!?\[(ref)\](?:\[\])?/).replace("ref",Lc).getRegex(),Vk=Ye("reflink|nolink(?!\\()","g").replace("reflink",hg).replace("nolink",gg).getRegex(),Fc={_backpedal:ri,anyPunctuation:Fk,autolink:$k,blockSkip:Nk,br:cg,code:Ck,del:ri,emStrongLDelim:Ok,emStrongRDelimAst:Dk,emStrongRDelimUnd:Pk,escape:Tk,link:Hk,nolink:gg,punctuation:Ak,reflink:hg,reflinkSearch:Vk,tag:Bk,text:Ek,url:ri},jk={...Fc,link:Ye(/^!?\[(label)\]\((.*?)\)/).replace("label",Pl).getRegex(),reflink:Ye(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Pl).getRegex()},So={...Fc,emStrongRDelimAst:Mk,emStrongLDelim:Lk,url:Ye(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},zk={...So,br:Ye(cg).replace("{2,}","*").getRegex(),text:Ye(So.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Xi={normal:Mc,gfm:wk,pedantic:Sk},Ka={normal:Fc,gfm:So,breaks:zk,pedantic:jk},qk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Ud=e=>qk[e];function Cs(e,t){if(t){if(qt.escapeTest.test(e))return e.replace(qt.escapeReplace,Ud)}else if(qt.escapeTestNoEncode.test(e))return e.replace(qt.escapeReplaceNoEncode,Ud);return e}function Bd(e){try{e=encodeURI(e).replace(qt.percentDecode,"%")}catch{return null}return e}function Hd(e,t){var i;const s=e.replace(qt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(qt.slashPipe,"|");return n}function Ga(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function Kk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Vd(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function Gk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Fl=class{constructor(e){et(this,"options");et(this,"rules");et(this,"lexer");this.options=e||Yn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Ga(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=Gk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Ga(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Ga(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Ga(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),u=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${u}`:u;const d=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(u,i,!0),this.lexer.state.top=d,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,b=p.raw+`
`+s.join(`
`),g=this.blockquote(b);i[i.length-1]=g,n=n.substring(0,n.length-p.raw.length)+g.raw,a=a.substring(0,a.length-p.text.length)+g.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,b=p.raw+`
`+s.join(`
`),g=this.list(b);i[i.length-1]=g,n=n.substring(0,n.length-f.raw.length)+g.raw,a=a.substring(0,a.length-p.raw.length)+g.raw,s=b.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",u="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let d=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,N=>" ".repeat(3*N.length)),f=e.split(`
`,1)[0],p=!d.trim(),b=0;if(this.options.pedantic?(b=2,u=d.trimStart()):p?b=t[1].length+1:(b=t[2].search(this.rules.other.nonSpaceChar),b=b>4?1:b,u=d.slice(b),b+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const N=this.rules.other.nextBulletRegex(b),y=this.rules.other.hrRegex(b),v=this.rules.other.fencesBeginRegex(b),x=this.rules.other.headingBeginRegex(b),k=this.rules.other.htmlBeginRegex(b);for(;e;){const I=e.split(`
`,1)[0];let O;if(f=I,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),O=f):O=f.replace(this.rules.other.tabCharGlobal,"    "),v.test(f)||x.test(f)||k.test(f)||N.test(f)||y.test(f))break;if(O.search(this.rules.other.nonSpaceChar)>=b||!f.trim())u+=`
`+O.slice(b);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(d)||x.test(d)||y.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=I+`
`,e=e.substring(I.length+1),d=O.slice(b)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,T;this.options.gfm&&(g=this.rules.other.listIsTask.exec(u),g&&(T=g[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:T,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Hd(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Hd(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Ga(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Kk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Vd(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Vd(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const b=f.slice(1,-1);return{type:"em",raw:f,text:b,tokens:this.lexer.inlineTokens(b)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Ks=class To{constructor(t){et(this,"tokens");et(this,"options");et(this,"state");et(this,"tokenizer");et(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Yn,this.options.tokenizer=this.options.tokenizer||new Fl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:qt,block:Xi.normal,inline:Ka.normal};this.options.pedantic?(s.block=Xi.pedantic,s.inline=Ka.pedantic):this.options.gfm&&(s.block=Xi.gfm,this.options.breaks?s.inline=Ka.breaks:s.inline=Ka.gfm),this.tokenizer.rules=s}static get rules(){return{block:Xi,inline:Ka}}static lex(t,s){return new To(s).lex(t)}static lexInline(t,s){return new To(s).inlineTokens(t)}lex(t){t=t.replace(qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(qt.tabCharGlobal,"    ").replace(qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const u=t.slice(1);let d;this.options.extensions.startBlock.forEach(f=>{d=f.call({lexer:this},u),typeof d=="number"&&d>=0&&(c=Math.min(c,d))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const u=Object.keys(this.tokens.links);if(u.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)u.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let u;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(u=f.call({lexer:this},t,s))?(t=t.substring(u.raw.length),s.push(u),!0):!1))continue;if(u=this.tokenizer.escape(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.tag(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.link(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(u.raw.length);const f=s.at(-1);u.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(u=this.tokenizer.emStrong(t,n,l)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.codespan(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.br(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.del(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.autolink(t)){t=t.substring(u.raw.length),s.push(u);continue}if(!this.state.inLink&&(u=this.tokenizer.url(t))){t=t.substring(u.raw.length),s.push(u);continue}let d=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let b;this.options.extensions.startInline.forEach(g=>{b=g.call({lexer:this},p),typeof b=="number"&&b>=0&&(f=Math.min(f,b))}),f<1/0&&f>=0&&(d=t.substring(0,f+1))}if(u=this.tokenizer.inlineText(d)){t=t.substring(u.raw.length),u.raw.slice(-1)!=="_"&&(l=u.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},$l=class{constructor(e){et(this,"options");et(this,"parser");this.options=e||Yn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(qt.notSpaceStart))==null?void 0:i[0],a=e.replace(qt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Cs(n)+'">'+(s?a:Cs(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Cs(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Cs(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Cs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Bd(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Cs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Bd(e);if(a===null)return Cs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Cs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Cs(e.text)}},$c=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Gs=class Co{constructor(t){et(this,"options");et(this,"renderer");et(this,"textRenderer");this.options=t||Yn,this.options.renderer=this.options.renderer||new $l,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new $c}static parse(t,s){return new Co(s).parse(t)}static parseInline(t,s){return new Co(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},zr,ol=(zr=class{constructor(e){et(this,"options");et(this,"block");this.options=e||Yn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Ks.lex:Ks.lexInline}provideParser(){return this.block?Gs.parse:Gs.parseInline}},et(zr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),zr),Wk=class{constructor(...e){et(this,"defaults",Ic());et(this,"options",this.setOptions);et(this,"parse",this.parseMarkdown(!0));et(this,"parseInline",this.parseMarkdown(!1));et(this,"Parser",Gs);et(this,"Renderer",$l);et(this,"TextRenderer",$c);et(this,"Lexer",Ks);et(this,"Tokenizer",Fl);et(this,"Hooks",ol);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new $l(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Fl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new ol;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];ol.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Ks.lex(e,t??this.defaults)}parser(e,t){return Gs.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?Ks.lex:Ks.lexInline,o=i.hooks?i.hooks.provideParser():e?Gs.parse:Gs.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Cs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Kn=new Wk;function Ge(e,t){return Kn.parse(e,t)}Ge.options=Ge.setOptions=function(e){return Kn.setOptions(e),Ge.defaults=Kn.defaults,ig(Ge.defaults),Ge};Ge.getDefaults=Ic;Ge.defaults=Yn;Ge.use=function(...e){return Kn.use(...e),Ge.defaults=Kn.defaults,ig(Ge.defaults),Ge};Ge.walkTokens=function(e,t){return Kn.walkTokens(e,t)};Ge.parseInline=Kn.parseInline;Ge.Parser=Gs;Ge.parser=Gs.parse;Ge.Renderer=$l;Ge.TextRenderer=$c;Ge.Lexer=Ks;Ge.lexer=Ks.lex;Ge.Tokenizer=Fl;Ge.Hooks=ol;Ge.parse=Ge;Ge.options;Ge.setOptions;Ge.use;Ge.walkTokens;Ge.parseInline;Gs.parse;Ks.lex;const Zk={breaks:!0,gfm:!0};function jd(e){if(!e)return"";try{if(typeof Ge<"u"&&Ge.parse){const t=Ge.parse(e,Zk);return typeof Fd<"u"?Fd.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Jk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Yk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function Qk(e){return Yk[e]||"wrench"}const Xk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function zd(e){if(!e)return[];const t=e.match(Xk);return t?[...new Set(t)]:[]}const ew={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=J(()=>t.value.trim().length>0&&!s.value),d=J(()=>{const S=Je.state;return S==="connected"?"Connected":S==="reconnecting"?"Reconnecting…":S==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=J(()=>{const S=Math.floor(i.value/4)%f.length,M=i.value;return M>3?`${f[S]} (${M}s)`:f[0]});function b(){wt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const S=a.value;S.style.height="auto",S.style.height=Math.min(S.scrollHeight,120)+"px"}function T(S,M,H={}){const W={id:++o,role:S,content:M,timestamp:Date.now(),html:S==="bot"?jd(M):"",tools_used:H.tools_used||[],is_error:H.is_error||!1,images:S==="bot"?zd(M):[],files:H.files||[],_showTools:!1};return e.value.push(W),b(),S==="bot"&&wt(()=>N()),W}function N(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(M=>{M.setAttribute("data-copy","true"),M.style.position="relative";const H=document.createElement("button");H.className="chat-code-copy",H.textContent="Copy",H.addEventListener("click",()=>{const W=M.querySelector("code"),D=W?W.textContent:M.textContent;navigator.clipboard.writeText(D).then(()=>{H.textContent="Copied!",setTimeout(()=>{H.textContent="Copy"},1500)}).catch(()=>{})}),M.appendChild(H)})}function y(S){if(S===0)return!0;const M=e.value[S-1],H=e.value[S],W=new Date(M.timestamp).toDateString(),D=new Date(H.timestamp).toDateString();return W!==D}function v(S){const M=new Date(S),H=new Date;if(M.toDateString()===H.toDateString())return"Today";const W=new Date(H);return W.setDate(W.getDate()-1),M.toDateString()===W.toDateString()?"Yesterday":M.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function x(S){t.value=S,wt(()=>U())}function k(S){window.open(S,"_blank","noopener")}function I(S){S.target.style.display="none"}function O(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function w(){r&&(clearInterval(r),r=null),i.value=0}function E(S){s.value&&(s.value=!1,w(),S.type==="chat_response"?T("bot",S.content,{tools_used:S.tools_used||[],is_error:S.is_error||!1,files:S.files||[]}):S.type==="chat_error"&&T("bot",S.error||"Unknown error",{is_error:!0}),wt(()=>{var M;return(M=a.value)==null?void 0:M.focus()}))}async function L(S){try{const M=await G.post("/api/chat",{content:S,channel_id:l.value});T("bot",M.response,{tools_used:M.tools_used||[],is_error:M.is_error||!1,files:M.files||[]})}catch(M){T("bot",M.message||"Failed to send message",{is_error:!0})}}async function U(){const S=t.value.trim();if(!S||s.value)return;T("user",S),t.value="",s.value=!0,O(),a.value&&(a.value.style.height="auto"),Je.connected&&Je.sendChat(S,{channelId:l.value})||(await L(S),s.value=!1,w()),wt(()=>{var H;return(H=a.value)==null?void 0:H.focus()})}async function F(){try{if(!l.value){const M=await G.get("/api/auth/session");l.value=M.channel_id||M.user_id||"web-user"}const S=await G.get("/api/sessions/"+encodeURIComponent(l.value));if(S&&S.messages&&S.messages.length>0){for(const M of S.messages){const H=M.role==="user"?"user":"bot";let W=M.content||"";if(H==="user"){const R=W.match(/^\[.*?\]:\s*/);R&&(W=W.slice(R[0].length))}if(!W.trim())continue;const D={id:++o,role:H,content:W,timestamp:M.timestamp?M.timestamp*1e3:Date.now(),html:H==="bot"?jd(W):"",tools_used:[],is_error:!1,images:H==="bot"?zd(W):[],files:[],_showTools:!1};e.value.push(D)}wt(()=>{b(),N()})}}catch{}}return He(()=>{Je.subscribe("chat",E),F(),wt(()=>{var S;return(S=a.value)==null?void 0:S.focus()})}),ht(()=>{Je.unsubscribe("chat",E),w()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:U,autoResize:g,formatTime:Jk,formatDate:v,showDateSeparator:y,useSuggestion:x,openImage:k,onImageError:I,getToolIcon:Qk}}},pr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=A_(),s=Qh(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});fs(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var u;return(u=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:u.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},tw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,b;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const g={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(d==="tool_end"){const g=e.value.findIndex(T=>T.tool===u.action&&T.status==="running");if(g>=0){const T=e.value[g];T.status=(p=u.metadata)!=null&&p.error?"error":"success",T.elapsed=((b=u.metadata)==null?void 0:b.elapsed_ms)||Date.now()-T.startTime,T.result=u.detail||"",T.fadingOut=!0,setTimeout(()=>{const N=e.value.indexOf(T);N>=0&&e.value.splice(N,1),t.value.unshift(T),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const g=u.tool_name||"unknown";if(u.finished)delete s.value[g];else{const N=((s.value[g]||"")+(u.chunk||"")).split(`
`);s.value[g]=N.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(u=>{u.status==="running"&&(u.elapsed=c-u.startTime)})}He(()=>{Je.on("events",a),i=setInterval(l,500)}),ht(()=>{Je.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"clock":c==="success"?"success":c==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
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
             class="ag-card ag-card-clickable" :class="'ag-card-' + agent.status" role="listitem"
             tabindex="0" :aria-label="'Open details for agent ' + agent.label"
             @click="openDetail(agent)"
             @keydown.enter.prevent="openDetail(agent)"
             @keydown.space.prevent="openDetail(agent)">
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

          <!-- Model / reasoning provenance -->
          <div class="ag-card-policy" :title="displaySourceLabel(agent.display_source)">
            <span class="ag-policy-chip">{{ displayModelText(agent) }}</span>
            <span class="ag-policy-chip ag-policy-effort">{{ displayEffortText(agent) }}</span>
          </div>

          <!-- Progress bar (running agents, honest cap only) -->
          <div v-if="agent.status === 'running' && hasProgress(agent)" class="ag-progress-bar"
               role="progressbar" :aria-valuenow="agent.iteration_count"
               :aria-valuemin="0" :aria-valuemax="agent.max_iterations"
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

          <!-- Kill button (running only) — a separate action: it must never
               open the detail modal on its way through. -->
          <div v-if="agent.status === 'running'" class="ag-card-actions">
            <button @click.stop="killAgent(agent.id)" @keydown.enter.stop @keydown.space.stop
                    class="btn btn-danger text-xs" :disabled="killing === agent.id">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=null;const r=J(()=>e.value.filter(M=>M.status==="running").length),o=J(()=>e.value.filter(M=>M.status==="completed").length),c=J(()=>e.value.filter(M=>["failed","timeout","killed"].includes(M.status)).length),u=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(M=>["failed","timeout","killed"].includes(M.status)):e.value.filter(M=>M.status===i.value));function f(M){const H=Number(M.max_iterations)||0;return H<=0?0:Math.min(100,Math.round(M.iteration_count/H*100))}function p(M){return(Number(M.max_iterations)||0)>0}function b(M){const H=M.display_model||"";return H?M.display_source==="current_inheritance"?`inherit (currently ${H})`:H:"unknown"}function g(M){const H=M.display_reasoning_effort||"";return H?H==="N/A"?"N/A":M.display_source==="current_inheritance"?`inherit (currently ${H})`:H:"unknown"}function T(M){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[M]||""}const N=h(null),y=h(null),v=h(!1),x=h(null),k=h("");async function I(M){y.value=M.id,N.value=null,x.value=null,v.value=!0;try{N.value=await G.get(`/api/agents/${encodeURIComponent(M.id)}`)}catch(H){x.value=H.message||"Failed to load agent detail"}v.value=!1}function O(){y.value=null,N.value=null,x.value=null,k.value=""}async function w(){if(y.value)try{N.value=await G.get(`/api/agents/${encodeURIComponent(y.value)}`)}catch{}}async function E(M,H){try{await navigator.clipboard.writeText(H||""),k.value=M,setTimeout(()=>{k.value===M&&(k.value="")},1500)}catch{ke.error("Copy failed")}}async function L(M=!1){M=M===!0,M||(t.value=!0);try{const H=await G.get("/api/agents");e.value=Array.isArray(H)?H:[],s.value=null}catch(H){M||(s.value=H.message)}M||(t.value=!1)}async function U(M){const H=e.value.find(D=>D.id===M);if(await as({title:"Kill agent",message:`Kill agent "${(H==null?void 0:H.label)||M}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=M;try{await G.del(`/api/agents/${encodeURIComponent(M)}`),ke.success("Agent killed"),await L()}catch(D){ke.error(D.message||"Failed to kill agent")}n.value=null}}function F(){S(),a.value&&(l=setInterval(()=>{a.value&&(L(!0),y.value&&w())},5e3))}function S(){l&&(clearInterval(l),l=null)}return He(()=>{L(),F()}),ht(()=>{S()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:Pa,formatDuration:Oa,progressPercent:f,hasProgress:p,displayModelText:b,displayEffortText:g,displaySourceLabel:T,detail:N,detailId:y,detailLoading:v,detailError:x,copied:k,openDetail:I,closeDetail:O,copyText:E,fetchAgents:L,killAgent:U,startAutoRefresh:F,stopAutoRefresh:S}}},nw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=J(()=>e.value.reduce((I,O)=>I+(O.iteration_count||0),0)),d=J(()=>e.value.filter(I=>I.status==="running").length);function f(I){return I==="running"?"loop-status-running":I==="error"?"loop-status-error":"loop-status-stopped"}function p(I){return I==="running"?"badge-success":I==="error"?"badge-danger":I==="completed"?"badge-info":"badge-warning"}function b(I){return I==="act"?"badge-warning":I==="silent"?"badge-info":"badge-success"}function g(I){c.value={...c.value,[I]:!c.value[I]}}async function T(I=!1){I=I===!0,I||(t.value=!0);try{e.value=await G.get("/api/loops"),s.value=null}catch(O){I||(s.value=O.message)}I||(t.value=!1)}async function N(){l.value=null;const I=a.value;if(!I.goal.trim()){l.value="Goal is required";return}if(!I.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:I.goal.trim(),channel_id:I.channel_id.trim(),interval_seconds:I.interval_seconds||60,mode:I.mode,max_iterations:I.max_iterations||50};I.stop_condition.trim()&&(O.stop_condition=I.stop_condition.trim()),i.value=!0;try{const w=await G.post("/api/loops",O);ke.success(`Loop started: ${w.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await T()}catch(w){l.value=w.message}i.value=!1}async function y(I){if(await as({title:"Stop loop",message:`Stop loop ${I}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=I;try{await G.del(`/api/loops/${encodeURIComponent(I)}`),ke.success("Loop stopped"),await T()}catch(w){ke.error(w.message||"Failed to stop loop")}r.value=null}}async function v(I){o.value=I;try{await G.post(`/api/loops/${encodeURIComponent(I)}/restart`),ke.success("Loop restarted"),await T()}catch(O){ke.error(O.message||"Failed to restart loop")}o.value=null}function x(I){I.payload&&(I.payload.loop_id||I.payload.type==="loop")&&T(!0)}let k=null;return He(()=>{T(),Je.subscribe("events",x),k=setInterval(()=>{T(!0)},5e3)}),ht(()=>{Je.unsubscribe("events",x),k&&clearInterval(k)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:b,formatDuration:Oa,formatAge:Xh,toggleHistory:g,fetchLoops:T,doCreate:N,doStop:y,doRestart:v}}},aw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=J(()=>e.value.filter(g=>g.status==="running").length),r=J(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function u(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(T){g||(s.value=T.message)}g||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}fs(n,g=>{g?d():f()});async function p(g){if(await as({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await G.del(`/api/processes/${g}`),ke.success(`Process ${g} killed`),await u()}catch(N){ke.error(N.message||"Failed to kill process")}i.value=null}}function b(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&u(!0)}return He(()=>{u(),Je.subscribe("events",b),d()}),ht(()=>{Je.unsubscribe("events",b),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Oa,fetchProcesses:u,doKill:p}}},iw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),b=h(null),g=h([]),T=h(!1),N=J(()=>e.value.filter(D=>D.cron&&!D.one_time).length),y=J(()=>e.value.filter(D=>D.one_time).length),v=J(()=>e.value.filter(D=>D.trigger).length),x=J(()=>e.value.filter(D=>D.paused).length),k=J(()=>e.value.filter(D=>D.consecutive_failures>0).length);function I(D){if(!D)return"-";const R=Date.now(),ce=(new Date(D).getTime()-R)/1e3;if(ce<0)return"overdue";if(ce<60)return"in < 1 min";if(ce<3600)return`in ${Math.floor(ce/60)} min`;if(ce<86400){const se=Math.floor(ce/3600),pe=Math.floor(ce%3600/60);return pe>0?`in ${se}h ${pe}m`:`in ${se}h`}const de=Math.floor(ce/86400);return`in ${de} day${de!==1?"s":""}`}function O(D){return D==null?"-":D<1e3?`${D}ms`:D<6e4?`${(D/1e3).toFixed(1)}s`:Oa(D/1e3)}function w(){r.value=null}async function E(){const D=a.value.cron.trim();if(D){o.value=!0;try{r.value=await G.post("/api/schedules/validate-cron",{expression:D})}catch(R){r.value={valid:!1,error:R.message}}o.value=!1}}async function L(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(D){s.value=D.message}t.value=!1}async function U(D){if(b.value===D){b.value=null,g.value=[];return}b.value=D,T.value=!0,g.value=[];try{g.value=await G.get(`/api/schedules/${encodeURIComponent(D)}/history?limit=10`)}catch{g.value=[]}T.value=!1}async function F(){l.value=null;const D=a.value;if(!D.description.trim()){l.value="Description is required";return}if(!D.channel_id.trim()){l.value="Channel ID is required";return}if(!D.cron.trim()&&!D.run_at.trim()){l.value="Cron expression or run_at time is required";return}const R={description:D.description.trim(),action:D.action,channel_id:D.channel_id.trim()};if(D.cron.trim()&&(R.cron=D.cron.trim()),D.run_at.trim()&&(R.run_at=D.run_at.trim()),D.action==="reminder"&&D.message.trim()&&(R.message=D.message.trim()),D.action==="check"&&(D.tool_name.trim()&&(R.tool_name=D.tool_name.trim()),D.tool_input_str.trim()))try{R.tool_input=JSON.parse(D.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",R),ke.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await L()}catch(q){l.value=q.message}i.value=!1}async function S(D){u.value=D;try{const R=await G.post(`/api/schedules/${encodeURIComponent(D)}/run`);if(R.status==="failure")ke.error(`Execution failed: ${R.error||"unknown error"}`);else{const q=R.warning?`Executed (${R.warning})`:"Executed successfully";ke.success(q)}await L()}catch(R){ke.error(R.message||"Failed to trigger")}u.value=null}async function M(D){f.value=D.id;const R=!D.paused;try{await G.put(`/api/schedules/${encodeURIComponent(D.id)}`,{paused:R}),ke.success(R?"Schedule paused":"Schedule resumed"),await L()}catch(q){ke.error(q.message||"Failed to update schedule")}f.value=null}async function H(D){p.value=D;try{await G.post(`/api/schedules/${encodeURIComponent(D)}/reset-failures`),ke.success("Failure counters reset"),await L()}catch(R){ke.error(R.message||"Failed to reset")}p.value=null}async function W(D){const R=e.value.find(ce=>ce.id===D);if(await as({title:"Delete schedule",message:`Delete "${(R==null?void 0:R.description)||D}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=D;try{await G.del(`/api/schedules/${encodeURIComponent(D)}`),ke.success("Schedule deleted"),await L()}catch(ce){ke.error(ce.message||"Failed to delete schedule")}d.value=null}}return He(()=>{L()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:b,history:g,historyLoading:T,cronCount:N,oneTimeCount:y,webhookCount:v,pausedCount:x,failingCount:k,formatTs:Pa,formatAge:Xh,formatFuture:I,formatMs:O,formatDuration:Oa,onCronInput:w,validateCron:E,toggleExpand:U,fetchSchedules:L,doCreate:F,doRunNow:S,doTogglePause:M,doResetFailures:H,doDelete:W}}},lw={components:{TabbedPage:pr},setup(){return{tabs:[{id:"live",label:"Live",component:tw},{id:"agents",label:"Agents",component:sw},{id:"loops",label:"Loops",component:nw},{id:"processes",label:"Processes",component:aw},{id:"schedules",label:"Schedules",component:iw}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},rw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await G.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return He(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Pa,formatDetail:i,truncateBlock:eg,toggleExpand:l,clearFilters:r,fetchAudit:o}}},qd=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],ow=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),b=qd,g=ow,T=h([]),N=h(!1),y=h(""),v=h("flat"),x=h(new Set),k=h(""),I=h(""),O=h(""),w=h(null),E=h(!1);function L(){try{const B=localStorage.getItem("odin-session-presets");B&&(T.value=JSON.parse(B))}catch{}}function U(){try{localStorage.setItem("odin-session-presets",JSON.stringify(T.value))}catch{}}const F=J(()=>d.value.trim()!==""||u.value!=="all"),S=J(()=>{let B=[...e.value];const oe=qd.find(Ve=>Ve.id===u.value),_e=oe?oe.filters:{};if(_e.source&&(B=B.filter(Ve=>Ve.source===_e.source)),_e.minMessages&&(B=B.filter(Ve=>Ve.message_count>=_e.minMessages)),_e.hasCompaction&&(B=B.filter(Ve=>Ve.has_summary)),_e.maxAge!=null){const Ve=Date.now()/1e3;B=B.filter(ut=>ut.last_active&&Ve-ut.last_active<=_e.maxAge)}if(d.value.trim()){const Ve=d.value.toLowerCase().trim();B=B.filter(ut=>(ut.channel_id||"").toLowerCase().includes(Ve)||(ut.last_user_id||"").toLowerCase().includes(Ve)||(ut.source||"").toLowerCase().includes(Ve))}const Me=f.value,Ue=p.value?1:-1;return B.sort((Ve,ut)=>{const We=Ve[Me]||0,Xe=ut[Me]||0;return(We-Xe)*Ue}),B}),M=J(()=>{if(!a.value||!a.value.messages)return[];const B=a.value.messages;if(B.length===0)return[];const oe=[];let _e=[];for(const Me of B)Me.role==="user"&&_e.length>0&&(oe.push(_e),_e=[]),_e.push(Me);return _e.length>0&&oe.push(_e),oe}),H=J(()=>S.value.length>0&&o.value.size===S.value.length);function W(B){const oe=B.find(_e=>_e.role==="user");if(oe&&oe.content){const _e=oe.content.slice(0,120);return _e.length<oe.content.length?_e+"...":_e}return"(no user message)"}function D(B){const oe=new Set(x.value);oe.has(B)?oe.delete(B):oe.add(B),x.value=oe}function R(B){u.value=B}function q(B){u.value=B.id,B.filters.searchQuery!=null&&(d.value=B.filters.searchQuery),B.filters.sortBy&&(f.value=B.filters.sortBy)}function ce(){if(!y.value.trim())return;const B={id:"custom-"+Date.now(),name:y.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};T.value=[...T.value,B],U(),N.value=!1,y.value=""}function de(B){T.value=T.value.filter(oe=>oe.id!==B),U(),u.value===B&&(u.value="all")}function se(){u.value="all",d.value="",f.value="last_active",p.value=!1}function pe(B){if(!B)return"—";const oe=Date.now()/1e3-B;if(oe<60)return"just now";if(oe<3600){const Me=Math.floor(oe/60);return`${Me} minute${Me!==1?"s":""} ago`}if(oe<86400){const Me=Math.floor(oe/3600);return`${Me} hour${Me!==1?"s":""} ago`}const _e=Math.floor(oe/86400);return`${_e} day${_e!==1?"s":""} ago`}function Q(B){if(!B)return"";try{return new Date(B*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ue(B){if(!B)return"";try{return new Date(B*1e3).toLocaleString()}catch{return""}}function Ie(B){return B==="user"?"bg-gray-900/50 border border-gray-800":B==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function j(B){return B==="user"?"sess-msg-user":B==="assistant"?"sess-msg-assistant":"sess-msg-system"}function re(B){return B==="user"?"badge-info":B==="assistant"?"badge-success":"badge-warning"}function le(B){return B==="user"?"sess-dot-user":B==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(B){return B==="user"?"text-cyan-400":B==="assistant"?"text-indigo-400":"text-gray-500"}function be(B){return B?B.length>2e3?B.slice(0,2e3)+`
... (truncated)`:B:""}async function Oe(){const B=k.value.trim();if(B){E.value=!0;try{let oe=`/api/sessions/search?q=${encodeURIComponent(B)}&limit=50`;I.value.trim()&&(oe+=`&channel_id=${encodeURIComponent(I.value.trim())}`),O.value.trim()&&(oe+=`&user_id=${encodeURIComponent(O.value.trim())}`);const _e=await G.get(oe);w.value=_e.results||[]}catch{w.value=[]}E.value=!1}}function m(){k.value="",I.value="",O.value="",w.value=null}function C(B){return B?B.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function P(B){return B==="user"?"fts-result-user":B==="assistant"?"fts-result-assistant":B==="summary"?"fts-result-summary":B==="fts"?"fts-result-fts":B==="channel"?"fts-result-channel":"fts-result-default"}function Z(B){return B==="user"?"badge-info":B==="assistant"?"badge-success":B==="summary"?"badge-warning":B==="fts"?"badge-success":"badge-info"}async function A(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(B){s.value=B.message}t.value=!1}function $(){s.value=null,A()}async function Y(B){if(n.value===B){n.value=null,a.value=null,x.value=new Set;return}n.value=B,a.value=null,i.value=!0,x.value=new Set;try{a.value=await G.get(`/api/sessions/${encodeURIComponent(B)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function ee(B){const oe=new Set(o.value);oe.has(B)?oe.delete(B):oe.add(B),o.value=oe}function te(){H.value?o.value=new Set:o.value=new Set(S.value.map(B=>B.channel_id))}function X(B){l.value=B}async function ge(){if(l.value){r.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await A()}catch(B){s.value=B.message||"Failed to clear session"}r.value=!1,l.value=null}}function ie(){c.value=!0}async function fe(){if(o.value.size!==0){r.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await A()}catch(B){s.value=B.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function xe(B,oe){const _e=G._token;let Me=`/api/sessions/${encodeURIComponent(B)}/export?format=${oe}`;_e&&(Me+=`&token=${encodeURIComponent(_e)}`);const Ue=document.createElement("a");Ue.href=Me,Ue.download=`session-${B}.${oe==="text"?"txt":"json"}`,document.body.appendChild(Ue),Ue.click(),document.body.removeChild(Ue)}let we=null;function Ae(B){B.payload&&B.payload.channel_id&&(clearTimeout(we),we=setTimeout(()=>{A(),n.value&&B.payload.channel_id===n.value&&G.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(oe=>{a.value=oe}).catch(()=>{})},2e3))}return He(()=>{L(),A(),Je.subscribe("events",Ae)}),ht(()=>{Je.unsubscribe("events",Ae),clearTimeout(we)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:H,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:b,sortOptions:g,filteredSessions:S,hasActiveFilters:F,customPresets:T,showSavePreset:N,newPresetName:y,threadView:v,threads:M,collapsedThreads:x,ftsQuery:k,ftsChannelId:I,ftsUserId:O,ftsResults:w,ftsSearching:E,formatAge:pe,formatTimestamp:Q,formatFullTimestamp:ue,messageClass:Ie,threadMsgClass:j,roleBadge:re,roleDotClass:le,roleLabelClass:me,truncateContent:be,threadSummary:W,fetchSessions:A,retry:$,toggleSession:Y,toggleSelect:ee,toggleSelectAll:te,confirmClear:X,clearSession:ge,confirmBulkClear:ie,doBulkClear:fe,exportSession:xe,applyPreset:R,applyCustomPreset:q,saveCustomPreset:ce,removeCustomPreset:de,resetFilters:se,toggleThread:D,runFtsSearch:Oe,clearFtsSearch:m,highlightSnippet:C,ftsResultClass:P,ftsTypeBadge:Z}}},uw={props:["trace"],template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(O){if(!O)return"—";try{const w=new Date(O);return isNaN(w.getTime())?O:w.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function f(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function p(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function b(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function g(O){a.value===O?a.value=null:(a.value=O,c.value={})}function T(O,w){const E=O+"-"+w;c.value={...c.value,[E]:!c.value[E]}}function N(O,w){return!!c.value[O+"-"+w]}function y(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,k()}async function v(){try{const O=await G.get("/api/trajectories");e.value=O.files||[],o.value=O.count||0}catch{}}let x=0;async function k(){const O=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const w=await G.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(O!==x)return;let E=w.entries||[];u.value.tool_name&&(E=E.filter(L=>(L.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(E=E.filter(L=>L.is_error)),u.value.channel_id&&(E=E.filter(L=>L.channel_id===u.value.channel_id)),u.value.user_id&&(E=E.filter(L=>L.user_id===u.value.user_id)),t.value=E}else{const w=new URLSearchParams;u.value.channel_id&&w.set("channel_id",u.value.channel_id),u.value.user_id&&w.set("user_id",u.value.user_id),u.value.tool_name&&w.set("tool_name",u.value.tool_name),u.value.errors_only&&w.set("errors_only","true"),w.set("limit",String(u.value.limit));const E=w.toString(),L=await G.get(`/api/trajectories/search/query?${E}`);if(O!==x)return;t.value=L.results||[]}}catch(w){if(O!==x)return;n.value=w.message}O===x&&(s.value=!1)}async function I(){if(!l.value.trim())return;const O=++x;s.value=!0,n.value=null,c.value={};try{const w=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==x)return;i.value=w.entry||null,i.value||(n.value="No trace found for this message ID")}catch(w){if(O!==x)return;w.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=w.message}O===x&&(s.value=!1)}return He(async()=>{await v(),await k()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:b,truncateBlock:eg,toggleExpand:g,toggleIteration:T,isIterationExpanded:N,clearFilters:y,fetchFiles:v,fetchTraces:k,lookupMessage:I}}},fw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=J(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await G.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return He(()=>{o(),i=setInterval(o,15e3)}),ht(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:tg,formatTime:Ac,retry:c}}},pw={components:{TabbedPage:pr},setup(){return{tabs:[{id:"audit",label:"Audit",component:rw},{id:"sessions",label:"Sessions",component:cw},{id:"traces",label:"Traces",component:dw},{id:"usage",label:"Usage",component:fw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Hr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=J(()=>e.value.filter(y=>y.is_core).length),c=J(()=>e.value.filter(y=>!y.is_core).length),u=J(()=>Object.values(a.value).reduce((y,v)=>y+v,0));function d(y){for(const v of Hr)if(v.id!=="other"&&v.match(y))return v.id;return"other"}const f=J(()=>{let y=e.value;if(n.value){const v=n.value.toLowerCase();y=y.filter(x=>x.name.toLowerCase().includes(v)||(x.description||"").toLowerCase().includes(v))}return r.value&&(y=y.filter(v=>d(v.name)===r.value)),y}),p=J(()=>{const y=new Set;for(const v of e.value)y.add(d(v.name));return Hr.filter(v=>y.has(v.id))}),b=J(()=>{const y=f.value,v={};for(const k of y){const I=d(k.name);v[I]||(v[I]=[]),v[I].push(k)}const x=[];for(const k of Hr)v[k.id]&&v[k.id].length>0&&x.push({label:k.label,icon:k.icon,tools:v[k.id].sort((I,O)=>I.name.localeCompare(O.name))});return x});function g(y){i.value={...i.value,[y]:!i.value[y]}}async function T(){t.value=!0,s.value=null;try{const[y,v]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=v||{};const x=Object.values(v||{}).filter(k=>k>0).sort((k,I)=>k-I)}catch(y){s.value=y.message}t.value=!1}function N(){T()}return He(()=>{T()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:b,usedCategories:p,truncate:Rc,toggleExpand:g,refresh:N}}};function gw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function mw(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),b=h(!1),g=h(null),T=h(null),N=h(!1),y=J(()=>e.value.length),v=J(()=>e.value.reduce((Q,ue)=>Q+(ue.execution_count||0),0)),x=J(()=>e.value.reduce((Q,ue)=>Q+L(ue.code),0)),k=J(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(Q)||(ue.description||"").toLowerCase().includes(Q))}),I=J(()=>d.value?d.value.split(`
`).length:0),O=J(()=>{const Q=Math.max(I.value,1);return Array.from({length:Q},(ue,Ie)=>Ie+1).join(`
`)}),w=J(()=>{const Q=d.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function E(Q){return gw(Q)}function L(Q){return Q?Q.split(`
`).length:0}function U(Q){return mw(Q)}function F(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function S(Q){try{await navigator.clipboard.writeText(Q);const ue=e.value.find(Ie=>Ie.code===Q);ue&&(r.value=ue.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function M(Q){if(Q.key==="Tab"){Q.preventDefault();const ue=Q.target,Ie=ue.selectionStart,j=ue.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(j),wt(()=>{ue.selectionStart=ue.selectionEnd=Ie+4})}}function H(Q){const ue=Q.target.previousElementSibling;ue&&(ue.scrollTop=Q.target.scrollTop)}async function W(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function D(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const ue=await G.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:ue}}catch(ue){a.value={...a.value,[Q]:{result:ue.message,is_error:!0}}}i.value=null}function R(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function q(Q){o.value=!0,c.value="edit",u.value=Q.name,d.value=Q.code||"",f.value=null,p.value=null}function ce(){o.value=!1,f.value=null,p.value=null}async function de(){f.value=null,p.value=null;const Q=u.value.trim(),ue=d.value.trim();if(!Q){f.value="Name is required";return}if(!ue){f.value="Code is required";return}b.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:Q,code:ue}),p.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(Q)}`,{code:ue}),p.value="Skill updated successfully"),await W(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}b.value=!1}function se(Q){T.value=Q}async function pe(){if(T.value){N.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(T.value)}`),await W()}catch{}N.value=!1,T.value=null}}return He(()=>{W()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:b,editorRef:g,deleteTarget:T,deleting:N,enabledCount:y,totalExecutions:v,totalLines:x,displayedSkills:k,editLineCount:I,editorLineNums:O,editValidation:w,highlight:E,truncate:Rc,formatTs:Pa,countLines:L,getLineNumbers:U,toggleCode:F,copyCode:S,handleEditorKey:M,syncScroll:H,fetchSkills:W,testSkill:D,showCreate:R,editSkill:q,cancelEdit:ce,saveSkill:de,confirmDelete:se,doDelete:pe}}};function bw(e,t){if(!e||!t)return wd(e);const s=wd(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),b=h(null),g=h(null);let T=null;const N=h(null),y=h(!1),v=h({}),x=h({}),k=h(null),I=h(null),O=J(()=>e.value.reduce((R,q)=>R+(q.chunks||0),0)),w=J(()=>new Set(e.value.map(q=>q.uploader).filter(Boolean)).size);function E(R,q){const ce=x.value[q];if(!ce||ce.length===0)return 0;const de=Math.max(...ce.map(se=>se.char_count||0));return de===0?0:Math.round(R.char_count/de*100)}async function L(){t.value=!0,s.value=null;try{const R=await G.get("/api/knowledge");e.value=Array.isArray(R)?R:[]}catch(R){s.value=R.message}t.value=!1}async function U(R){if(v.value[R]){v.value[R]=!1,I.value=null;return}if(v.value[R]=!0,!(x.value[R]||k.value===R)){k.value=R;try{const q=await G.get(`/api/knowledge/${encodeURIComponent(R)}/chunks`);x.value[R]=Array.isArray(q)?q:[]}catch(q){x.value[R]=[],ke.error(`Failed to load chunks: ${q.message}`)}k.value=null}}async function F(){const R=n.value.trim();if(R){i.value=!0,r.value=null,l.value=R;try{const q=await G.get(`/api/knowledge/search?q=${encodeURIComponent(R)}`);a.value=Array.isArray(q)?q:[]}catch(q){a.value=[],r.value=q.message||"Search failed"}i.value=!1}}function S(){a.value=null,n.value="",r.value=null}async function M(){d.value=null,f.value=null;const R=c.value.trim(),q=u.value.trim();if(!R){d.value="Source name is required";return}if(!q){d.value="Content is required";return}p.value=!0;try{const ce=await G.post("/api/knowledge",{source:R,content:q});f.value=`Ingested ${ce.chunks||0} chunks from "${R}"`,c.value="",u.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(ce){d.value=ce.message}p.value=!1}async function H(R){b.value=R,g.value=null,T&&(clearTimeout(T),T=null);try{const q=await G.post(`/api/knowledge/${encodeURIComponent(R)}/reingest`);g.value={source:R,error:!1,message:`Re-ingested ${q.chunks||0} chunks`},delete x.value[R],await L(),T=setTimeout(()=>{g.value=null,T=null},3e3)}catch(q){g.value={source:R,error:!0,message:q.message}}b.value=null}function W(R){N.value=R}async function D(){if(N.value){y.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(N.value)}`),delete x.value[N.value],await L()}catch{}y.value=!1,N.value=null}}return He(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:b,reingestResult:g,deleteTarget:N,deleting:y,expanded:v,sourceChunks:x,loadingChunks:k,selectedChunk:I,totalChunks:O,uploaderCount:w,truncate:Rc,formatTs:Pa,highlightTerms:bw,chunkBarWidth:E,fetchSources:L,toggleSource:U,doSearch:F,clearSearch:S,doIngest:M,doReingest:H,confirmDelete:W,doDelete:D}}},xw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),b=h(!1),g=h(null),T=h(null),N=h(new Set),y=h(null),v=h(!1),x=h(!1),k=J(()=>e.value.reduce((se,pe)=>se+pe.count,0)),I=J(()=>N.value.size);function O(se){const pe=t.value[se];if(!pe)return[];if(!l.value.trim())return pe;const Q=l.value.trim().toLowerCase();return pe.filter(ue=>ue.key.toLowerCase().includes(Q)||ue.value&&ue.value.toLowerCase().includes(Q))}function w(se,pe){return N.value.has(se+"/"+pe)}function E(se,pe){const Q=se+"/"+pe,ue=new Set(N.value);ue.has(Q)?ue.delete(Q):ue.add(Q),N.value=ue}function L(se){const pe=t.value[se];return!pe||pe.length===0?!1:pe.every(Q=>N.value.has(se+"/"+Q.key))}function U(se,pe){const Q=t.value[se];if(!Q)return;const ue=new Set(N.value);for(const Ie of Q){const j=se+"/"+Ie.key;pe?ue.add(j):ue.delete(j)}N.value=ue}async function F(){s.value=!0,n.value=null;try{const se=await G.get("/api/memory");e.value=Object.entries(se).map(([pe,Q])=>({name:pe,keys:Q.keys||[],count:Q.count||0}))}catch(se){n.value=se.message}s.value=!1}async function S(se){if(a.value[se]){a.value[se]=!1;return}a.value[se]=!0;const pe=e.value.find(ue=>ue.name===se);if(!pe||t.value[se]||i.value===se)return;i.value=se;const Q=await Promise.all(pe.keys.map(async ue=>{try{const Ie=await G.get(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(ue)}`);return{key:ue,value:Ie.value||""}}catch{return{key:ue,value:"(error loading)"}}}));t.value[se]=Q,i.value=null}function M(se,pe,Q){f.value=se+"/"+pe,p.value=Q}async function H(se,pe){b.value=!0,g.value=null;try{await G.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(pe)}`,{value:p.value});const Q=t.value[se];if(Q){const ue=Q.find(Ie=>Ie.key===pe);ue&&(ue.value=p.value)}f.value=null}catch(Q){g.value=`Failed to save: ${Q.message||"unknown error"}`}b.value=!1}async function W(se,pe){try{await navigator.clipboard.writeText(pe.value),T.value=se+"/"+pe.key,setTimeout(()=>{T.value=null},1500)}catch{}}async function D(){u.value=null,d.value=null;const se=o.value.scope.trim(),pe=o.value.key.trim(),Q=o.value.value.trim();if(!se){u.value="Scope is required";return}if(!pe){u.value="Key is required";return}if(!Q){u.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(pe)}`,{value:Q}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await F(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(ue){u.value=ue.message}c.value=!1}function R(se,pe){y.value={scope:se,key:pe}}async function q(){if(!y.value)return;v.value=!0,g.value=null;const{scope:se,key:pe}=y.value;try{await G.del(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(pe)}`);const Q=t.value[se];Q&&(t.value[se]=Q.filter(j=>j.key!==pe));const ue=e.value.find(j=>j.name===se);ue&&(ue.count--,ue.keys=ue.keys.filter(j=>j!==pe));const Ie=new Set(N.value);Ie.delete(se+"/"+pe),N.value=Ie}catch(Q){g.value=`Failed to delete: ${Q.message||"unknown error"}`}v.value=!1,y.value=null}function ce(){x.value=!0}async function de(){v.value=!0,g.value=null;const se=[];for(const pe of N.value){const Q=pe.indexOf("/");se.push({scope:pe.slice(0,Q),key:pe.slice(Q+1)})}try{await G.post("/api/memory/bulk-delete",{entries:se}),N.value=new Set,t.value={},await F()}catch(pe){g.value=`Bulk delete failed: ${pe.message||"unknown error"}`}v.value=!1,x.value=!1}return He(()=>{F()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:b,actionError:g,copied:T,selected:N,selectedCount:I,totalEntries:k,deleteTarget:y,deleting:v,showBulkDelete:x,fetchMemory:F,toggleScope:S,startEdit:M,doEdit:H,copyValue:W,doAdd:D,confirmDelete:R,doDelete:q,confirmBulkDelete:ce,doBulkDelete:de,isSelected:w,toggleSelect:E,isScopeAllSelected:L,toggleSelectAll:U,filteredEntries:O}}},_w={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=J(()=>[...new Set(e.value.map(T=>T.category))].sort()),o=J(()=>{const g={};return e.value.forEach(T=>{g[T.category]=(g[T.category]||0)+1}),g}),c=J(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function u(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function d(g){i.value=g.key,l.value=g.content}async function f(g){try{await G.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,ke.success("Entry updated"),await b()}catch(T){ke.error(T.message||"Failed to save entry")}}async function p(g){if(await as({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(g)),ke.success("Entry deleted"),await b()}catch(N){ke.error(N.message||"Failed to delete entry")}}async function b(){s.value=!0,n.value=null;try{const g=await G.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return He(b),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:Pa,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:b}}},kw={components:{TabbedPage:pr},setup(){return{tabs:[{id:"tools",label:"Tools",component:hw},{id:"skills",label:"Skills",component:vw},{id:"knowledge",label:"Knowledge",component:yw},{id:"memory",label:"Memory",component:xw},{id:"learned",label:"Learned",component:_w}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},ww={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),b=J(()=>e.value==="custom"),g=J(()=>[...i.value,...l.value]),T=J(()=>l.value.includes(e.value)),N=J(()=>{var w;return b.value?t.value||"Odin":((w=a.value[e.value])==null?void 0:w.name)||e.value}),y=J(()=>{var w;return b.value?s.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.identity)||""}),v=J(()=>{var w;return b.value?n.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.voice)||""});async function x(){u.value=!0;try{const w=await G.get("/api/personality");e.value=w.preset||"odin",t.value=w.custom_name||"",s.value=w.custom_identity||"",n.value=w.custom_voice||"",a.value=w.presets||{},i.value=w.builtin_presets||[],l.value=w.user_presets||[]}catch(w){c.value=w.message}finally{u.value=!1}}async function k(){r.value=!0,c.value=null,o.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(w){c.value=w.message}finally{r.value=!1}}async function I(){const w=d.value.trim();if(w){p.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:w,display_name:N.value,identity:y.value,voice:v.value}),f.value=!1,d.value="",await x(),e.value=w.toLowerCase().replace(/ /g,"_")}catch(E){c.value=E.message}finally{p.value=!1}}}async function O(){if(await as({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(E){c.value=E.message}}}return He(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:b,isUserPreset:T,previewName:N,previewIdentity:y,previewVoice:v,saving:r,saved:o,error:c,loading:u,save:k,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:I,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=J(()=>e.value.components||[]),i=J(()=>Cw[e.value.overall]||"text-gray-400"),l=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=J(()=>{const y=e.value.overall;return y==="healthy"?"All Systems Healthy":y==="degraded"?"Some Systems Degraded":y==="unhealthy"?"System Issues Detected":"Unknown"});function o(y){return Sw[y]||"text-gray-400"}function c(y){return Tw[y]||"info"}function u(y){return y==="ok"?"badge-success":y==="degraded"?"badge-warning":y==="down"?"badge-danger":"badge-info"}function d(y){return y==="closed"?"text-green-400":y==="half_open"?"text-yellow-400":y==="open"?"text-red-400":"text-gray-400"}function f(y){return y.replace(/_/g," ").replace(/\b\w/g,v=>v.toUpperCase())}function p(y){if(!y)return"—";try{return new Date(y).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return y}}function b(y){return y>=1e6?(y/1e6).toFixed(1)+"M":y>=1e3?(y/1e3).toFixed(1)+"K":String(y)}async function g(){n.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null}catch(y){s.value=y.message}finally{t.value=!1,n.value=!1}}function T(){t.value=!0,s.value=null,g()}let N=null;return He(async()=>{await g(),N=setInterval(g,3e4)}),ht(()=>{N&&clearInterval(N)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:b,fetchHealth:g,retry:T}}},Aw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=J(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=J(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await G.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return He(()=>{c(),i=setInterval(c,3e4)}),ht(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:tg,refresh:u,retry:d}}},Rw=["INFO","WARNING","ERROR"],Iw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Vr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Nw=[50,100,200,500],Ow={template:`
    <div class="p-6 page-fade-in flex flex-col" style="height: calc(100vh - var(--hm-topbar-h));">
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
               @mousedown="onUserScrollIntent" @keydown="onUserScrollKey"
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Je.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,b=Rw,g=Iw,T=Vr,N=h("all"),y=h(""),v=h([]),x=h(!1),k=h(""),I=h([]);function O(){try{const V=localStorage.getItem("odin-log-presets");V&&(v.value=JSON.parse(V))}catch{}}function w(){try{localStorage.setItem("odin-log-presets",JSON.stringify(v.value))}catch{}}const E=J(()=>a.value!==""||i.value.trim()!==""||y.value!==""),L=J(()=>{const V=Vr.find(ne=>ne.value===y.value);return V?V.label:""}),U=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),F=24,S=J(()=>{if(t.value.length===0)return[];const V=[],ne=new Date,ye=3600*1e3;for(let qe=F-1;qe>=0;qe--){const lt=new Date(ne.getTime()-(qe+1)*ye),Bt=new Date(ne.getTime()-qe*ye);V.push({start:lt,end:Bt,label:D(lt,Bt),shortLabel:Bt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const qe of t.value){if(!qe._time)continue;const lt=qe._time.getTime();for(const Bt of V)if(lt>=Bt.start.getTime()&&lt<Bt.end.getTime()){Bt.total++,qe.level==="ERROR"?Bt.errors++:qe.level==="WARNING"?Bt.warnings++:Bt.info++;break}}return V}),M=J(()=>{let V=1;for(const ne of S.value)ne.total>V&&(V=ne.total);return V}),H=J(()=>S.value.length===0?"":"Last 24 hours"),W=J(()=>Math.ceil(F/8));function D(V,ne){const ye={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],ye)+" - "+ne.toLocaleTimeString([],ye)}function R(V,ne){return!ne||!V?"0px":Math.max(2,V/ne*100)+"%"}function q(V){const ne=ce.value.findIndex(ye=>ye._time&&ye._time.getTime()>=V.start.getTime()&&ye._time.getTime()<V.end.getTime());if(ne>=0&&u.value){const ye=u.value.querySelectorAll(".log-line");ye[ne]&&(ye[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const ce=J(()=>{let V=t.value;if(a.value&&(V=V.filter(ne=>(ne.level||"INFO")===a.value)),y.value){const ne=Vr.find(ye=>ye.value===y.value);if(ne&&ne.seconds){const ye=new Date(Date.now()-ne.seconds*1e3);V=V.filter(qe=>qe._time&&qe._time>=ye)}}if(i.value&&!U.value)if(l.value)try{const ne=new RegExp(i.value,"i");V=V.filter(ye=>{const qe=ye.text||ye.raw||"",lt=ye.tool||"";return ne.test(qe)||ne.test(lt)})}catch{}else{const ne=i.value.toLowerCase();V=V.filter(ye=>{const qe=(ye.text||ye.raw||"").toLowerCase(),lt=(ye.tool||"").toLowerCase();return qe.includes(ne)||lt.includes(ne)})}return V});function de(V){if(V.type==="log"&&V.line)try{const ne=typeof V.line=="string"?JSON.parse(V.line):V.line,ye=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:ye.toLocaleTimeString(),_time:ye,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const ne=V.payload,ye=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:ye.toLocaleTimeString(),_time:ye,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function se(V){const ne=de(V);if(s.value){I.value.push(ne);return}pe(ne)}function pe(V){t.value.push(V),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&wt(()=>Q())}function Q(V=!1){const ne=u.value;ne&&ne.scrollTo({top:ne.scrollHeight,behavior:V?"smooth":"instant"})}function ue(){n.value=!0,d.value=!1,wt(()=>Q(!0))}const Ie=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function j(){const V=u.value;if(!V)return;const ne=V.scrollHeight-V.scrollTop-V.clientHeight<40;d.value=!n.value&&!ne&&t.value.length>0}function re(){!n.value||!u.value||requestAnimationFrame(()=>{const ne=u.value;!ne||!n.value||ne.scrollHeight-ne.scrollTop-ne.clientHeight>=40&&(n.value=!1,d.value=t.value.length>0)})}function le(V){Ie.has(V.key)&&re()}function me(){n.value&&(d.value=!1,wt(()=>Q()))}function be(){if(s.value=!s.value,!s.value&&I.value.length>0){for(const V of I.value)pe(V);I.value=[]}}function Oe(){t.value=[],I.value=[],d.value=!1}function m(){let V;e.value==="search"?V=Ve.value.map(lt=>{const Bt=lt.error?"ERROR":"INFO",Fa=lt.tool_name?`[${lt.tool_name}] `:"";return`${lt.timestamp||""} ${Bt} ${Fa}${lt.result_summary||lt.message||""}`}).join(`
`):V=ce.value.map(lt=>`${lt.ts} ${lt.level} ${lt.text}`).join(`
`);const ne=new Blob([V],{type:"text/plain"}),ye=URL.createObjectURL(ne),qe=document.createElement("a");qe.href=ye,qe.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,qe.click(),URL.revokeObjectURL(ye)}function C(V,ne){const ye=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(ye).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function P(V){a.value=a.value===V?"":V,N.value="all"}function Z(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function A(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function $(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function Y(V){N.value=V.id;const ne=V.filters;a.value=ne.level||"",y.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function ee(V){N.value=V.id,a.value=V.filters.level||"",y.value=V.filters.timeRange||"",i.value=V.filters.text||""}function te(){if(!k.value.trim())return;const V={id:"custom-"+Date.now(),name:k.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};v.value=[...v.value,V],w(),x.value=!1,k.value=""}function X(V){v.value=v.value.filter(ne=>ne.id!==V),w(),N.value===V&&(N.value="all")}const ge=h("all"),ie=h(""),fe=h(""),xe=h(""),we=h(""),Ae=h(""),B=h(100),oe=Nw,_e=h(!1),Me=h(!1),Ue=h(""),Ve=h([]),ut=h(null),We=h(null);function Xe(){e.value="search",ut.value||_s()}async function _s(){try{ut.value=await G.get("/api/logs/stats")}catch{}}function Ls(){const V=Ae.value;if(!V){xe.value="",we.value="";return}const ye={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(ye){const qe=new Date(Date.now()-ye*1e3);xe.value=Qn(qe),we.value=""}}function Qn(V){const ne=ye=>String(ye).padStart(2,"0");return`${V.getFullYear()}-${ne(V.getMonth()+1)}-${ne(V.getDate())}T${ne(V.getHours())}:${ne(V.getMinutes())}`}function an(V){if(!V)return"";const ne=new Date(V);return isNaN(ne.getTime())?"":ne.toISOString()}async function Xn(){_e.value=!0,Ue.value="",Me.value=!0,We.value=null;try{const V=new URLSearchParams;ge.value&&ge.value!=="all"&&V.set("level",ge.value),ie.value&&V.set("tool",ie.value),fe.value&&V.set("q",fe.value);const ne=an(xe.value),ye=an(we.value);ne&&V.set("start",ne),ye&&V.set("end",ye),V.set("limit",String(B.value));const qe=await G.get(`/api/logs/search?${V.toString()}`);Ve.value=qe.entries||[]}catch(V){Ue.value=V.message||"Search failed",Ve.value=[]}finally{_e.value=!1}}function ln(){ge.value="all",ie.value="",fe.value="",xe.value="",we.value="",Ae.value="",B.value=100,Ve.value=[],Me.value=!1,Ue.value="",We.value=null}function rn(V){We.value=We.value===V?null:V}function z(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function Te(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function ks(V){return V.error?"log-line-error":"text-gray-300"}function Cn(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let En=null,on=null,cn=!1;function hr(){cn||(cn=!0,Je.subscribe("logs",se),r.value=Je.connected,o.value=Je.state||"disconnected",En=Je.onStateChange,on=(V,ne)=>{o.value=V,r.value=V==="connected",En&&En(V,ne)},Je.onStateChange=on)}function un(){cn&&(cn=!1,Je.unsubscribe("logs",se),Je.onStateChange===on&&(Je.onStateChange=En),on=null,En=null)}return He(O),Ho(hr),Vo(un),ht(un),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:ce,pauseBuffer:I,showJumpBottom:d,copiedIndex:f,regexError:U,levels:b,logPresets:g,timeRanges:T,timeRange:y,activeLogPreset:N,customLogPresets:v,showSaveLogPreset:x,newLogPresetName:k,hasActiveLogFilters:E,timeRangeLabel:L,timelineBuckets:S,timelineMax:M,timelineSpanLabel:H,timelineLabelSkip:W,togglePause:be,clearLogs:Oe,exportLogs:m,logLineClass:Z,levelClass:A,levelChipClass:$,toggleLevel:P,copyLine:C,jumpToBottom:ue,onScroll:j,onUserScrollIntent:re,onUserScrollKey:le,onAutoScrollToggle:me,applyLogPreset:Y,applyCustomLogPreset:ee,saveLogCustomPreset:te,removeLogCustomPreset:X,segmentHeight:R,jumpToTimelineBucket:q,searchLevel:ge,searchTool:ie,searchKeyword:fe,searchStart:xe,searchEnd:we,searchTimePreset:Ae,searchLimit:B,searchLimits:oe,searching:_e,searchRan:Me,searchError:Ue,searchResults:Ve,searchStats:ut,expandedSearch:We,switchToSearch:Xe,runSearch:Xn,clearSearchFilters:ln,toggleSearchExpand:rn,formatSearchTs:z,searchEntryText:Te,searchLogLineClass:ks,formatJson:Cn,applySearchTimePreset:Ls}}},Lw=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Dw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Mw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1–128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},jr=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"database",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"server",sections:["tools"]},{key:"ui",label:"Web UI",icon:"globe",sections:["web"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"puzzle",sections:["issue_tracker"]}],mg="••••••••",Pw=50;function Fw(e){return Lw.has(e)}function $w(e){return e===mg}function el(e){return JSON.parse(JSON.stringify(e))}function Vn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Uw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Vn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Vn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function Bw(e,t,s){const n=Mw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Kd(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Vn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Vn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Hw={template:`
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=J(()=>d.value.length>0),b=J(()=>f.value.length>0),g=J(()=>r.value&&t.value?t.value:e.value),T=J(()=>!e.value||!t.value?!1:!Vn(e.value,t.value)),N=J(()=>!e.value||!t.value?0:Kd(e.value,t.value).length),y=J(()=>{if(!r.value||!t.value)return{};const A={};for(const $ of Object.keys(t.value)){const Y=t.value[$];if(typeof Y=="object"&&Y!==null&&!Array.isArray(Y))for(const ee of Object.keys(Y)){const te=Bw($,ee,Y[ee]);te&&(A[$+"."+ee]=te)}}return A}),v=J(()=>Object.keys(y.value).length>0),x=J(()=>e.value?Object.keys(e.value).length:0),k=J(()=>O.value.length),I=J(()=>!e.value||!t.value?[]:Kd(e.value,t.value)),O=J(()=>e.value?jr.map(A=>({...A,sections:A.sections.filter($=>$ in e.value)})).filter(A=>A.sections.length>0):[]),w=J(()=>{if(!e.value)return[];const A=new Set(jr.flatMap($=>$.sections));return Object.keys(e.value).filter($=>!A.has($))});function E(A){return g.value?g.value[A]:null}function L(A){return!e.value||!t.value?!1:!Vn(e.value[A],t.value[A])}function U(A){return A.sections.some($=>L($))}function F(A,$){if(!e.value||!t.value)return!1;const Y=e.value[A],ee=t.value[A];return!Y||!ee?!1:!Vn(Y[$],ee[$])}function S(A){return t.value?t.value[A]:e.value[A]}function M(A,$){const Y=t.value||e.value;return Y[A]?Y[A][$]:void 0}function H(A,$){const Y=r.value&&t.value?t.value:e.value;return Y[A]?Y[A][$]:!1}function W(A,$){return y.value[A+"."+$]||null}function D(A,$){return Dw[A+"."+$]||null}function R(A,$,Y){t.value&&($===null?t.value[A]=Y:(t.value[A]||(t.value[A]={}),t.value[A][$]=Y),t.value={...t.value})}function q(A,$,Y){if(!t.value)return;const ee=el(t.value);R(A,$,Y),d.value.push(ee),d.value.length>Pw&&d.value.shift(),f.value=[]}function ce(A,$,Y){try{const ee=JSON.parse(Y);q(A,$,ee)}catch{}}function de(){d.value.length!==0&&(f.value.push(el(t.value)),t.value=d.value.pop())}function se(){f.value.length!==0&&(d.value.push(el(t.value)),t.value=f.value.pop())}function pe(A,$,Y){if(!t.value||!t.value[A])return;const ee=[...t.value[A][$]];ee.splice(Y,1),q(A,$,ee)}function Q(A,$){if(!t.value||!t.value[A])return;const Y=[...t.value[A][$]||[]],ee=prompt("Enter new value:");ee!==null&&(Y.push(ee),q(A,$,Y))}function ue(A){a.value={...a.value,[A]:!a.value[A]}}function Ie(A){l.value={...l.value,[A]:!l.value[A]}}function j(A){i.value={...i.value,[A]:!i.value[A]}}function re(A){try{return JSON.stringify(A,null,2)}catch{return String(A)}}function le(A){return A==null?"null":typeof A=="object"?JSON.stringify(A,null,2):String(A)}function me(A,$){c.value={type:A,message:$},setTimeout(()=>{c.value=null},3e3)}function be(){t.value=el(e.value),r.value=!0,d.value=[],f.value=[]}function Oe(){r.value=!1,t.value=null,d.value=[],f.value=[]}function m(){u.value=!0}async function C(){if(!(!T.value||v.value)){o.value=!0;try{const A=Uw(e.value,t.value);if(Object.keys(A).length===0){me("success","No changes to save."),o.value=!1;return}const $=await G.put("/api/config",A);e.value=$,r.value=!1,t.value=null,d.value=[],f.value=[],me("success","Config saved successfully.")}catch(A){me("error",A.message||"Failed to save config")}o.value=!1}}async function P(){s.value=!0,n.value=null;try{e.value=await G.get("/api/config");for(const A of Object.keys(e.value))a.value[A]===void 0&&(a.value[A]=!0);for(const A of jr)l.value[A.key]===void 0&&(l.value[A.key]=!0)}catch(A){n.value=A.message}s.value=!1}function Z(A){if(!r.value)return;const $=A.target;$ instanceof HTMLElement&&($.matches("input, textarea, select")||$.isContentEditable)||((A.ctrlKey||A.metaKey)&&!A.shiftKey&&A.key.toLowerCase()==="z"?(A.preventDefault(),de()):(A.ctrlKey||A.metaKey)&&(A.key==="y"||A.shiftKey&&A.key==="z"||A.shiftKey&&A.key==="Z")&&(A.preventDefault(),se()))}return He(()=>{P(),document.addEventListener("keydown",Z)}),ht(()=>{document.removeEventListener("keydown",Z)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:T,hasErrors:v,changeCount:N,REDACTED:mg,showDiffModal:u,diffEntries:I,canUndo:p,canRedo:b,sectionCount:x,groupCount:k,visibleGroups:O,ungroupedSections:w,validationErrors:y,isSensitiveKey:Fw,isRedacted:$w,sectionChanged:L,groupChanged:U,fieldChanged:F,getDisplay:E,getEdited:S,getEditedField:M,getDisplayBool:H,pushEdit:q,pushEditJson:ce,getValidationError:W,getEnumOptions:D,removeArrayItem:pe,addArrayItem:Q,toggleSection:ue,toggleGroup:Ie,toggleNested:j,formatJson:re,formatDiffVal:le,showToast:me,showDiff:m,fetchConfig:P,startEdit:be,cancelEdit:Oe,saveConfig:C,undo:de,redo:se}}},Vw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await G.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,b,g){try{await G.put("/api/discord/guild/"+p+"/config",{[b]:g}),await c()}catch(T){s.value=T.message}}async function d(p,b,g,T){try{await G.put("/api/discord/channel/"+p+"/config",{[g]:T}),await c()}catch(N){s.value=N.message}}async function f(p,b){try{await G.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return He(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},jw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=J(()=>{const R={};for(const q of u.value)R[q.id]=q;return R});function p(R){return f.value[R]||null}const b=J(()=>/^\d{15,25}$/.test(r.value.trim())),g=J(()=>{if(o.value){if(T.value[c.value])return"host-user-option-"+c.value;if(b.value)return"host-user-option-raw"}}),T=J(()=>{const R=r.value.toLowerCase().trim();return R?u.value.filter(q=>!i.value[q.id]&&(q.display_name.toLowerCase().includes(R)||q.username.toLowerCase().includes(R)||q.id.includes(R))):u.value.filter(q=>!i.value[q.id])});function N(R,q){return R?R.allowed_hosts===null||R.allowed_hosts===void 0?{allowed_hosts:[...q],default_host:R.default_host||"",allow_all:!0}:{allowed_hosts:R.allowed_hosts,default_host:R.default_host||"",allow_all:!1}:{allowed_hosts:[...q],default_host:q[0]||"",allow_all:!0}}async function y(){e.value=!0,t.value="";try{const R=await G.get("/api/host-access");s.value=R,n.value=R.available_hosts||[],a.value=N(R.default_policy,n.value);const q=R.users||{},ce={};for(const[de,se]of Object.entries(q))ce[de]=N(se,n.value);i.value=ce}catch(R){t.value=R.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await G.get("/api/discord/members")||[]}catch{u.value=[]}}async function v(){try{const R=a.value.allow_all?null:a.value.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:R,default_host:a.value.default_host}),ke.success("Default policy updated")}catch(R){ke.error(R.message||"Failed to save")}}function x(R,q){a.value.allow_all=!1,q?a.value.allowed_hosts.includes(R)||a.value.allowed_hosts.push(R):(a.value.allowed_hosts=a.value.allowed_hosts.filter(ce=>ce!==R),a.value.default_host===R&&(a.value.default_host=a.value.allowed_hosts[0]||"")),v()}async function k(R){const q=i.value[R];if(q)try{const ce=q.allow_all?null:q.allowed_hosts;await G.put(`/api/host-access/user/${R}`,{allowed_hosts:ce,default_host:q.default_host});const de=p(R);ke.success(`Updated access for ${de?de.display_name:R}`)}catch(ce){ke.error(ce.message||"Failed to save")}}function I(R,q,ce){const de=i.value[R];de&&(de.allow_all=!1,ce?de.allowed_hosts.includes(q)||de.allowed_hosts.push(q):(de.allowed_hosts=de.allowed_hosts.filter(se=>se!==q),de.default_host===q&&(de.default_host=de.allowed_hosts[0]||"")),k(R))}function O(R,q){const ce=i.value[R];ce&&(ce.default_host=q,k(R))}function w(){l.value=!0,r.value="",c.value=0,wt(()=>{d.value&&d.value.focus()})}function E(){o.value=!0,c.value=0}function L(){c.value<T.value.length-1&&c.value++}function U(){c.value>0&&c.value--}function F(){const R=T.value[c.value];if(R){M(R);return}b.value&&S()}function S(){const R=r.value.trim();/^\d{15,25}$/.test(R)&&(i.value[R]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},k(R),r.value="",o.value=!1,l.value=!1)}function M(R){i.value[R.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},k(R.id),r.value="",o.value=!1,l.value=!1}function H(){o.value=!1}function W(){setTimeout(()=>{o.value=!1},150)}async function D(R){const q=p(R);if(await as({title:"Remove user override",message:`Remove the host access override for ${q?q.display_name:R}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await G.del(`/api/host-access/user/${R}`),delete i.value[R],ke.success(`Removed override for ${q?q.display_name:R}`)}catch(de){ke.error(de.message||"Failed to delete")}}return He(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:T,isRawId:b,activeOptionId:g,searchInput:d,fetchData:y,saveDefaultPolicy:v,toggleDefaultHost:x,getMember:p,toggleUserHost:I,setUserDefault:O,openAddUser:w,deleteUser:D,onSearchInput:E,highlightNext:L,highlightPrev:U,selectHighlighted:F,selectMember:M,closeDropdown:H,onBlur:W,addRawId:S}}},zw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=J(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(w){return w==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":w==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function b(){e.value=!0,t.value="";try{const w=await G.get("/api/tokens");s.value=w.tokens||[],n.value=w.available_hosts||[]}catch(w){t.value=w.message||"Failed to load tokens"}finally{e.value=!1}}function g(w){return!w||!w.trim()?[]:w.split(",").map(E=>E.trim()).filter(Boolean)}function T(w,E){const L=c.value.allowed_hosts;if(E&&!L.includes(w)&&L.push(w),!E){const U=L.indexOf(w);U>=0&&L.splice(U,1)}}function N(w,E){const L=u.value.allowed_hosts;if(E&&!L.includes(w)&&L.push(w),!E){const U=L.indexOf(w);U>=0&&L.splice(U,1)}}async function y(){var w;i.value=!0;try{const E=g(c.value.allowed_tools_str),L=c.value.host_mode,U=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,F={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:E.length?E:[]};U!==null&&(F.allowed_hosts=U),F.default_host=c.value.default_host||"";const S=await G.post("/api/tokens",F);l.value=S.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,ke.success("Token created"),await b()}catch(E){ke.error(((w=E.data)==null?void 0:w.error)||E.message||"Failed to create token")}finally{i.value=!1}}function v(w){r.value=w;const E=w.allowed_hosts;let L="default";E==null?L="default":Array.isArray(E)&&E.length===0?L="none":Array.isArray(E)&&(L="select"),u.value={username:w.username||"",tier:w.tier||"admin",label:w.label||"",host_mode:L,allowed_hosts:Array.isArray(E)?[...E]:[],default_host:w.default_host||"",allowed_tools_str:(w.allowed_tools||[]).join(", ")}}async function x(){var w;if(r.value){o.value=!0;try{const E=g(u.value.allowed_tools_str),L=u.value.host_mode,U={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:E};L==="none"?U.allowed_hosts=[]:L==="select"?U.allowed_hosts=u.value.allowed_hosts:U.allowed_hosts=null,U.default_host=u.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(r.value.user_id),U),r.value=null,ke.success("Token updated"),await b()}catch(E){ke.error(((w=E.data)==null?void 0:w.error)||E.message||"Failed to update")}finally{o.value=!1}}}async function k(w){var L;if(await as({title:"Regenerate token",message:`Regenerate token for ${w.username||w.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await G.post("/api/tokens/"+encodeURIComponent(w.user_id)+"/regenerate");l.value=U.token,ke.success("Token regenerated")}catch(U){ke.error(((L=U.data)==null?void 0:L.error)||U.message||"Failed to regenerate")}}async function I(w){var L;if(await as({title:"Delete token",message:`Delete token for ${w.username||w.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(w.user_id)),ke.success("Token deleted"),await b()}catch(U){ke.error(((L=U.data)==null?void 0:L.error)||U.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),ke.success("Copied to clipboard")}catch{ke.error("Copy failed — select and copy manually")}}return He(b),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:b,tierBadge:p,toggleCreateHost:T,toggleEditHost:N,createToken:y,startEdit:v,saveEdit:x,confirmRegenerate:k,confirmDelete:I,copyToken:O}}};function tl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const qw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=J(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=J(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=J(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=J(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),u=J(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),d=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&u.value),f=z=>r.includes(z)&&u.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),b=h({unavailable_reason:null}),g=J(()=>{const z=p.value.model;return z&&!a.includes(z)?[z,...a]:a});function T(z){const Te=z.target.value;p.value.enabled=Te!=="",Te!==""&&(p.value.model=Te),_e()}const N=h(!1),y=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),v=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),x=h(!1),k=h(!1),I=h(!1),O=h(!1),w=h(!1),E=h(!1),L=h(!1),U=h({configured:!1}),F=h([]),S=h(""),M=h(!1),H=h(!1),W=h({configured:!1}),D=h([]),R=h(""),q=h(!1),ce=h(!1),de=h(!0),se=h(""),pe=h({configured:!1,accounts:[]}),Q=h(null),ue=h(null),Ie=h(""),j=h(null),re=h(!1),le=h(null),me=h(null),be=h("");let Oe=null;function m(z,Te="success"){ke(z,Te==="error"?"error":"success")}function C(z){if(!z)return"?";const Te=z/(1024*1024*1024);return Te>=1?Te.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}async function P(){e.value=!0,await Promise.all([Z(),A(),ge(),$()]),e.value=!1}async function Z(){try{const z=await G.get("/api/llm/status");t.value=z,s.value=z.active_provider||"codex",z.codex&&!oe.pending()&&(n.value.enabled=z.codex.enabled,n.value.model=z.codex.model||"gpt-5.5",n.value.reasoning_effort=z.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=z.codex.agent_reasoning_effort||"",n.value.agent_model=z.codex.agent_model||"",n.value.max_tokens=z.codex.max_tokens||4096),z.ollama&&!Me.pending()&&(y.value.enabled=z.ollama.enabled,y.value.base_url=z.ollama.base_url||"",y.value.model=z.ollama.model||"",y.value.max_tokens=z.ollama.max_tokens||4096),z.kimi&&!Ue.pending()&&(v.value.enabled=z.kimi.enabled,v.value.model=z.kimi.model||"",v.value.max_tokens=z.kimi.max_tokens||4096),z.auxiliary&&(b.value=z.auxiliary,_e.pending()||(p.value.enabled=z.auxiliary.enabled,p.value.model=z.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function A(){try{if(U.value=await G.get("/api/ollama/status"),U.value.model&&(S.value=U.value.model),U.value.configured)try{const z=await G.get("/api/ollama/models");F.value=z.models||[]}catch{F.value=[]}else if(y.value.base_url)try{const z=await G.post("/api/ollama/probe-models",{base_url:y.value.base_url});F.value=z.models||[]}catch{F.value=[]}}catch{U.value={configured:!1}}}async function $(){de.value=!0,se.value="";try{pe.value=await G.get("/api/codex/status")}catch(z){se.value=z.message||"Failed to fetch Codex status"}finally{de.value=!1}}async function Y(){const z=t.value?t.value.active_provider:"codex";L.value=!0;try{const Te=await G.post("/api/llm/switch",{provider:s.value});Te.error?(s.value=z,m(Te.error,"error")):(m("Switched to "+s.value+" ("+Te.model+")"),await P())}catch(Te){s.value=z,m(Te.message||"Switch failed","error")}finally{L.value=!1}}async function ee(){M.value=!0;try{const z=await G.post("/api/ollama/reload");m(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await P()}catch(z){m(z.message||"Reload failed","error")}finally{M.value=!1}}async function te(){H.value=!0;try{await G.post("/api/ollama/model",{model:S.value}),m("Model set to "+S.value),await P()}catch(z){m(z.message||"Failed","error")}finally{H.value=!1}}async function X(){const z=y.value.base_url;if(!z){m("Enter a base URL first","error");return}E.value=!0;try{const Te=await G.post("/api/ollama/probe-models",{base_url:z});F.value=Te.models||[],F.value.length?(m(F.value.length+" model(s) found"),!y.value.model&&F.value.length&&(y.value.model=F.value[0].name)):m("No models found at "+z,"error")}catch(Te){m(Te.message||"Could not reach Ollama","error")}finally{E.value=!1}}async function ge(){try{if(W.value=await G.get("/api/kimi/status"),W.value.model&&(R.value=W.value.model),W.value.configured)try{const z=await G.get("/api/kimi/models");D.value=z.models||[]}catch{D.value=[]}}catch{W.value={configured:!1}}}async function ie(){q.value=!0;try{const z=await G.post("/api/kimi/reload");m(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await P()}catch(z){m(z.message||"Reload failed","error")}finally{q.value=!1}}async function fe(){ce.value=!0;try{await G.post("/api/kimi/model",{model:R.value}),m("Model set to "+R.value),await P()}catch(z){m(z.message||"Failed","error")}finally{ce.value=!1}}async function xe(){if(I.value){oe();return}I.value=!0;try{await G.put("/api/llm/codex/config",n.value),m("Codex config saved"),await Promise.all([Z(),$()])}catch(z){m(z.message||"Failed","error"),await Promise.all([Z(),$()])}finally{I.value=!1}}async function we(){if(O.value){Me();return}O.value=!0;try{const z={...y.value},Te=x.value?y.value.api_key:null;Te===null&&delete z.api_key,await G.put("/api/llm/ollama/config",z),m("Ollama config saved"),Te!==null&&y.value.api_key===Te&&(y.value.api_key="",x.value=!1),await Promise.all([Z(),A()])}catch(z){m(z.message||"Failed","error")}finally{O.value=!1}}async function Ae(){if(w.value){Ue();return}w.value=!0;try{const z={...v.value},Te=k.value?v.value.api_key:null;Te===null&&delete z.api_key,await G.put("/api/llm/kimi/config",z),m("Kimi config saved"),Te!==null&&v.value.api_key===Te&&(v.value.api_key="",k.value=!1),await Promise.all([Z(),ge()])}catch(z){m(z.message||"Failed","error")}finally{w.value=!1}}async function B(){if(N.value){_e();return}N.value=!0;try{await G.put("/api/llm/auxiliary/config",p.value),m("Auxiliary config saved"),await Z()}catch(z){m(z.message||"Failed","error"),await Z()}finally{N.value=!1}}const oe=tl(xe),_e=tl(B),Me=tl(we),Ue=tl(Ae),Ve=()=>(oe.cancel(),xe()),ut=()=>(Me.cancel(),we()),We=()=>(Ue.cancel(),Ae());async function Xe(z){try{await G.post("/api/codex/account/"+z+"/activate"),m("Active account switched"),await $()}catch(Te){m(Te.message||"Failed","error")}}async function _s(z){Q.value=z;try{await G.post("/api/codex/account/"+z+"/refresh"),m("Token refreshed"),await $()}catch(Te){m(Te.message||"Refresh failed","error")}finally{Q.value=null}}function Ls(z,Te){ue.value=z,Ie.value=Te||""}async function Qn(z){try{await G.put("/api/codex/account/"+z+"/label",{label:Ie.value}),m("Label updated"),ue.value=null,await $()}catch(Te){m(Te.message||"Failed","error")}}async function an(z,Te){if(await as({title:"Delete Codex account",message:`Delete ${Te||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+z),m("Deleted. Pool reloaded."),await $()}catch(Cn){m(Cn.message||"Failed","error")}}async function Xn(){re.value=!0;try{const z=await G.post("/api/codex/device-code");le.value=z,j.value="pending",ln(z)}catch(z){m(z.message||"Failed","error")}finally{re.value=!1}}async function ln(z){Oe={cancelled:!1};const Te=Oe;try{const ks=await G.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(Te.cancelled)return;me.value=ks,j.value="success",await P()}catch(ks){if(Te.cancelled)return;be.value=ks.message||"Device login failed",j.value="error"}}function rn(){Oe&&(Oe.cancelled=!0),j.value=null,le.value=null}return He(P),ht(()=>{Oe&&(Oe.cancelled=!0),oe.cancel(),_e.cancel(),Me.cancel(),Ue.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:L,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:d,agentModelOptionDisabled:f,auxForm:p,auxData:b,auxModelOptions:g,onAuxModelChange:T,savingAux:N,saveAuxConfigDebounced:_e,ollamaForm:y,kimiForm:v,savingCodex:I,savingOllama:O,savingKimi:w,probingOllama:E,ollamaKeyDirty:x,kimiKeyDirty:k,ollamaStatus:U,ollamaModels:F,ollamaSelectedModel:S,reloading:M,settingModel:H,kimiStatus:W,kimiModels:D,kimiSelectedModel:R,reloadingKimi:q,settingKimiModel:ce,codexLoading:de,codexError:se,codexData:pe,refreshing:Q,editingLabel:ue,labelValue:Ie,deviceState:j,deviceLoading:re,deviceInfo:le,deviceResult:me,deviceError:be,fetchAll:P,switchProvider:Y,reloadOllama:ee,setOllamaModel:te,reloadKimi:ie,setKimiModel:fe,probeOllamaModels:X,saveCodexConfig:xe,saveOllamaConfig:we,saveKimiConfig:Ae,saveCodexConfigDebounced:oe,saveOllamaConfigDebounced:Me,saveKimiConfigDebounced:Ue,saveCodexConfigNow:Ve,saveOllamaConfigNow:ut,saveKimiConfigNow:We,activateAccount:Xe,refreshAccount:_s,startEditLabel:Ls,saveLabel:Qn,deleteAccount:an,startDeviceLogin:Xn,cancelDeviceLogin:rn,formatSize:C}}},Gd={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Kw(e){return Gd[e]||Gd[(e||"").toLowerCase()]||"text-gray-400"}const Gw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null);let u=null;async function d(){const f=await Promise.allSettled([G.get("/api/startup/diagnostics"),G.get("/api/subsystems/status"),G.get("/api/pools/ssh"),G.get("/api/pools/http"),G.get("/api/risk/stats"),G.get("/api/recovery/stats"),G.get("/api/compression/stats"),G.get("/api/freshness/stats"),G.get("/api/governor/stats")]),p=g=>f[g].status==="fulfilled"?f[g].value:null;t.value=p(0)||{};const b=p(1);s.value=Array.isArray(b)?b:b&&b.subsystems||[],n.value=p(2)||{},a.value=p(3)||{},i.value=p(4),l.value=p(5),r.value=p(6),o.value=p(7),c.value=p(8),e.value=!1}return He(()=>{d(),u=setInterval(d,3e4)}),ht(()=>{u&&clearInterval(u)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Kw,formatTime:Ac}}},Ww={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await G.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await as({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return He(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},Zw={components:{TabbedPage:pr},setup(){return{tabs:[{id:"health",label:"Health",component:Ew},{id:"resources",label:"Resources",component:Aw},{id:"logs",label:"Logs",component:Ow},{id:"config",label:"Config",component:Hw},{id:"discord",label:"Discord",component:Vw},{id:"host-access",label:"Host Access",component:jw},{id:"api-tokens",label:"API Tokens",component:zw},{id:"llm",label:"LLM Config",component:qw},{id:"internals",label:"Internals",component:Gw},{id:"update",label:"Update",component:Ww}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},gt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),vg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:P_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:ew,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:lw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:pw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:kw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:ww,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Zw,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:gt("/operations","live")},{path:"/agents",redirect:gt("/operations","agents")},{path:"/loops",redirect:gt("/operations","loops")},{path:"/processes",redirect:gt("/operations","processes")},{path:"/schedules",redirect:gt("/operations","schedules")},{path:"/audit",redirect:gt("/history","audit")},{path:"/sessions",redirect:gt("/history","sessions")},{path:"/traces",redirect:gt("/history","traces")},{path:"/usage",redirect:gt("/history","usage")},{path:"/tools",redirect:gt("/capabilities","tools")},{path:"/skills",redirect:gt("/capabilities","skills")},{path:"/knowledge",redirect:gt("/capabilities","knowledge")},{path:"/memory",redirect:gt("/capabilities","memory")},{path:"/learned",redirect:gt("/capabilities","learned")},{path:"/health",redirect:gt("/system","health")},{path:"/resources",redirect:gt("/system","resources")},{path:"/logs",redirect:gt("/system","logs")},{path:"/config",redirect:gt("/system","config")},{path:"/host-access",redirect:gt("/system","host-access")},{path:"/internals",redirect:gt("/system","internals")}],oi=E_({history:i_(),routes:vg});oi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const Jw={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},Yw={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),u=h("disconnected"),d=h(-1),f=h(null);let p=null;const b=h("starting"),g=h(""),T=vg.filter(D=>D.meta),N=J(()=>["Workspace","Operate","Observe","Manage"].map(D=>({name:D,routes:T.filter(R=>R.meta.section===D)})).filter(D=>D.routes.length)),y=J(()=>{var D;return((D=oi.currentRoute.value.meta)==null?void 0:D.label)||"Odin"}),v=J(()=>{var D;return((D=oi.currentRoute.value.meta)==null?void 0:D.section)||"Management"}),x=J(()=>{var D;return((D=oi.currentRoute.value.meta)==null?void 0:D.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,Je.disconnect(),G.setToken(""),e.value="login"};function k(D){var R;if((D.ctrlKey||D.metaKey)&&D.key.toLowerCase()==="k"){e.value==="ready"&&(D.preventDefault(),_d());return}if(n.value&&D.key==="Tab"){const q=[...((R=a.value)==null?void 0:R.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(q.length){const ce=q[0],de=q[q.length-1];if(D.shiftKey&&(document.activeElement===ce||!a.value.contains(document.activeElement))){D.preventDefault(),de.focus();return}if(!D.shiftKey&&(document.activeElement===de||!a.value.contains(document.activeElement))){D.preventDefault(),ce.focus();return}}}if(D.key==="Escape"&&n.value){n.value=!1,D.preventDefault();return}if(D.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(D.target.tagName)){D.preventDefault();const q=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');q&&q.focus()}}function I(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}He(async()=>{document.addEventListener("keydown",k),r=window.matchMedia("(max-width: 900px)"),I(),r.addEventListener("change",I);const D=await G.check();D.ok?(e.value="ready",H()):D.needsAuth?e.value="login":(e.value="ready",H())});function O(){t.value=!1,e.value="ready",H()}async function w(){await G.logout(),Je.disconnect(),e.value="login"}function E(){s.value=!s.value}function L(){n.value=!n.value}fs(n,async D=>{var R,q;if(D)o=document.activeElement,await wt(),(q=(R=a.value)==null?void 0:R.querySelector(".nav-item"))==null||q.focus();else if(o!=null&&o.isConnected){const ce=o;o=null,requestAnimationFrame(()=>ce.focus())}});const U=J(()=>{switch(u.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function F(D,R="info",q=3e3){f.value={text:D,level:R},clearTimeout(p),p=setTimeout(()=>{f.value=null},q)}let S=null,M=!1;function H(){Je.onStatusChange=D=>{c.value=D},Je.onStateChange=(D,R)=>{u.value=D,d.value=R.latency??-1,D==="connected"?(M&&F("Connection restored","success"),M=!0):D==="reconnecting"&&R.attempt===1&&F("Connection lost — reconnecting…","warn")},Je.connect(),W(),S&&clearInterval(S),S=setInterval(W,15e3)}async function W(){try{const D=await G.get("/api/status");b.value=D.status==="online"?"online":"starting";const R=D.uptime_seconds||0,q=Math.floor(R/3600),ce=Math.floor(R%3600/60);g.value=`${q}h ${ce}m uptime`}catch{b.value="offline",g.value=""}}return ht(()=>{S&&clearInterval(S),Je.disconnect(),document.removeEventListener("keydown",k),r==null||r.removeEventListener("change",I)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:u,wsLatency:d,wsLabel:U,wsToast:f,botStatus:b,botUptime:g,navRoutes:T,navGroups:N,currentPage:y,currentSection:v,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:O,logout:w,toggleSidebar:E,toggleMobileNavigation:L,openPalette:_d}}},Tn=Cl(Yw);Tn.component("odin-icon",O_);Tn.component("login-screen",Jw);Tn.component("toast-container",yx);Tn.component("confirm-host",xx);Tn.component("command-palette",N_);Tn.directive("modal-focus",D_);Tn.use(oi);Tn.mount("#app");
