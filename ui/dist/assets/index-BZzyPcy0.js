var Tg=Object.defineProperty;var Cg=(e,t,s)=>t in e?Tg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var et=(e,t,s)=>Cg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Eg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new kr("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new Ag(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new kr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof kr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class kr extends Error{constructor(t){super(t),this.name="AuthError"}}class Ag extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Rg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error"){this._chatPending=!1;for(const l of this._handlers.chat||[])l(a)}},this._ws.onclose=()=>{if(this._ws=null,this._stopPing(),this._latency=-1,this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const a of this._handlers.chat||[])a(n)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const W=new Eg,We=new Rg(W);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function cs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Fe={},ha=[],Ot=()=>{},fa=()=>!1,Gn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),jl=e=>e.startsWith("onUpdate:"),Pe=Object.assign,Lo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Ig=Object.prototype.hasOwnProperty,ze=(e,t)=>Ig.call(e,t),he=Array.isArray,ga=e=>Ma(e)==="[object Map]",Wn=e=>Ma(e)==="[object Set]",Yc=e=>Ma(e)==="[object Date]",Ng=e=>Ma(e)==="[object RegExp]",we=e=>typeof e=="function",Ae=e=>typeof e=="string",Bt=e=>typeof e=="symbol",je=e=>e!==null&&typeof e=="object",Oo=e=>(je(e)||we(e))&&we(e.then)&&we(e.catch),Zu=Object.prototype.toString,Ma=e=>Zu.call(e),Lg=e=>Ma(e).slice(8,-1),zl=e=>Ma(e)==="[object Object]",ql=e=>Ae(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Qs=cs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Og=cs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Kl=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Dg=/-\w/g,Qe=Kl(e=>e.replace(Dg,t=>t.slice(1).toUpperCase())),Mg=/\B([A-Z])/g,es=Kl(e=>e.replace(Mg,"-$1").toLowerCase()),Zn=Kl(e=>e.charAt(0).toUpperCase()+e.slice(1)),ma=Kl(e=>e?`on${Zn(e)}`:""),Et=(e,t)=>!Object.is(e,t),va=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Ju=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Gl=e=>{const t=parseFloat(e);return isNaN(t)?e:t},pl=e=>{const t=Ae(e)?Number(e):NaN;return isNaN(t)?e:t};let Qc;const Wl=()=>Qc||(Qc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Pg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Fg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",$g=cs(Fg);function Ri(e){if(he(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ae(n)?Yu(n):Ri(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ae(e)||je(e))return e}const Ug=/;(?![^(]*\))/g,Bg=/:([^]+)/,Hg=/\/\*[^]*?\*\//g;function Yu(e){const t={};return e.replace(Hg,"").split(Ug).forEach(s=>{if(s){const n=s.split(Bg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Ii(e){let t="";if(Ae(e))t=e;else if(he(e))for(let s=0;s<e.length;s++){const n=Ii(e[s]);n&&(t+=n+" ")}else if(je(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Vg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ae(t)&&(e.class=Ii(t)),s&&(e.style=Ri(s)),e}const jg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",zg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",qg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Kg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Gg=cs(jg),Wg=cs(zg),Zg=cs(qg),Jg=cs(Kg),Yg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Qg=cs(Yg);function Qu(e){return!!e||e===""}function Xg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=sn(e[n],t[n]);return s}function sn(e,t){if(e===t)return!0;let s=Yc(e),n=Yc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Bt(e),n=Bt(t),s||n)return e===t;if(s=he(e),n=he(t),s||n)return s&&n?Xg(e,t):!1;if(s=je(e),n=je(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!sn(e[l],t[l]))return!1}}return String(e)===String(t)}function Zl(e,t){return e.findIndex(s=>sn(s,t))}const Xu=e=>!!(e&&e.__v_isRef===!0),ef=e=>Ae(e)?e:e==null?"":he(e)||je(e)&&(e.toString===Zu||!we(e.toString))?Xu(e)?ef(e.value):JSON.stringify(e,tf,2):String(e),tf=(e,t)=>Xu(t)?tf(e,t.value):ga(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[wr(n,i)+" =>"]=a,s),{})}:Wn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>wr(s))}:Bt(t)?wr(t):je(t)&&!he(t)&&!zl(t)?String(t):t,wr=(e,t="")=>{var s;return Bt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function em(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let wt;class Do{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&wt&&(wt.active?(this.parent=wt,this.index=(wt.scopes||(wt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=wt;try{return wt=this,t()}finally{wt=s}}}on(){++this._on===1&&(this.prevScope=wt,wt=this)}off(){if(this._on>0&&--this._on===0){if(wt===this)wt=this.prevScope;else{let t=wt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function tm(e){return new Do(e)}function sf(){return wt}function sm(e,t=!1){wt&&wt.cleanups.push(e)}let st;const Sr=new WeakSet;class ui{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,wt&&(wt.active?wt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Sr.has(this)&&(Sr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||af(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Xc(this),lf(this);const t=st,s=_s;st=this,_s=!0;try{return this.fn()}finally{rf(this),st=t,_s=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Fo(t);this.deps=this.depsTail=void 0,Xc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Sr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Jr(this)&&this.run()}get dirty(){return Jr(this)}}let nf=0,ti,si;function af(e,t=!1){if(e.flags|=8,t){e.next=si,si=e;return}e.next=ti,ti=e}function Mo(){nf++}function Po(){if(--nf>0)return;if(si){let t=si;for(si=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;ti;){let t=ti;for(ti=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function lf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function rf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Fo(n),nm(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Jr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(of(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function of(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===fi)||(e.globalVersion=fi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Jr(e))))return;e.flags|=2;const t=e.dep,s=st,n=_s;st=e,_s=!0;try{lf(e);const a=e.fn(e._value);(t.version===0||Et(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{st=s,_s=n,rf(e),e.flags&=-3}}function Fo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Fo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function nm(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function am(e,t){e.effect instanceof ui&&(e=e.effect.fn);const s=new ui(e);t&&Pe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function im(e){e.effect.stop()}let _s=!0;const cf=[];function nn(){cf.push(_s),_s=!1}function an(){const e=cf.pop();_s=e===void 0?!0:e}function Xc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=st;st=void 0;try{t()}finally{st=s}}}let fi=0;class lm{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Jl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!st||!_s||st===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==st)s=this.activeLink=new lm(st,this),st.deps?(s.prevDep=st.depsTail,st.depsTail.nextDep=s,st.depsTail=s):st.deps=st.depsTail=s,df(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=st.depsTail,s.nextDep=void 0,st.depsTail.nextDep=s,st.depsTail=s,st.deps===s&&(st.deps=n)}return s}trigger(t){this.version++,fi++,this.notify(t)}notify(t){Mo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Po()}}}function df(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)df(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const hl=new WeakMap,Fn=Symbol(""),Yr=Symbol(""),pi=Symbol("");function Ft(e,t,s){if(_s&&st){let n=hl.get(e);n||hl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Jl),a.map=n,a.key=s),a.track()}}function Gs(e,t,s,n,a,i){const l=hl.get(e);if(!l){fi++;return}const r=o=>{o&&o.trigger()};if(Mo(),t==="clear")l.forEach(r);else{const o=he(e),c=o&&ql(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,f)=>{(f==="length"||f===pi||!Bt(f)&&f>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(pi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Fn)),ga(e)&&r(l.get(Yr)));break;case"delete":o||(r(l.get(Fn)),ga(e)&&r(l.get(Yr)));break;case"set":ga(e)&&r(l.get(Fn));break}}Po()}function rm(e,t){const s=hl.get(e);return s&&s.get(t)}function na(e){const t=Be(e);return t===e?t:(Ft(t,"iterate",pi),ss(e)?t:t.map(ws))}function Yl(e){return Ft(e=Be(e),"iterate",pi),e}function Os(e,t){return Ms(e)?wa(Xs(e)?ws(t):t):ws(t)}const om={__proto__:null,[Symbol.iterator](){return Tr(this,Symbol.iterator,e=>Os(this,e))},concat(...e){return na(this).concat(...e.map(t=>he(t)?na(t):t))},entries(){return Tr(this,"entries",e=>(e[1]=Os(this,e[1]),e))},every(e,t){return Us(this,"every",e,t,void 0,arguments)},filter(e,t){return Us(this,"filter",e,t,s=>s.map(n=>Os(this,n)),arguments)},find(e,t){return Us(this,"find",e,t,s=>Os(this,s),arguments)},findIndex(e,t){return Us(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Us(this,"findLast",e,t,s=>Os(this,s),arguments)},findLastIndex(e,t){return Us(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Us(this,"forEach",e,t,void 0,arguments)},includes(...e){return Cr(this,"includes",e)},indexOf(...e){return Cr(this,"indexOf",e)},join(e){return na(this).join(e)},lastIndexOf(...e){return Cr(this,"lastIndexOf",e)},map(e,t){return Us(this,"map",e,t,void 0,arguments)},pop(){return Ha(this,"pop")},push(...e){return Ha(this,"push",e)},reduce(e,...t){return ed(this,"reduce",e,t)},reduceRight(e,...t){return ed(this,"reduceRight",e,t)},shift(){return Ha(this,"shift")},some(e,t){return Us(this,"some",e,t,void 0,arguments)},splice(...e){return Ha(this,"splice",e)},toReversed(){return na(this).toReversed()},toSorted(e){return na(this).toSorted(e)},toSpliced(...e){return na(this).toSpliced(...e)},unshift(...e){return Ha(this,"unshift",e)},values(){return Tr(this,"values",e=>Os(this,e))}};function Tr(e,t,s){const n=Yl(e),a=n[t]();return n!==e&&!ss(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const cm=Array.prototype;function Us(e,t,s,n,a,i){const l=Yl(e),r=l!==e&&!ss(e),o=l[t];if(o!==cm[t]){const u=o.apply(e,i);return r?ws(u):u}let c=s;l!==e&&(r?c=function(u,f){return s.call(this,Os(e,u),f,e)}:s.length>2&&(c=function(u,f){return s.call(this,u,f,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function ed(e,t,s,n){const a=Yl(e),i=a!==e&&!ss(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=Os(e,c)),s.call(this,c,Os(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?Os(e,o):o}function Cr(e,t,s){const n=Be(e);Ft(n,"iterate",pi);const a=n[t](...s);return(a===-1||a===!1)&&Ni(s[0])?(s[0]=Be(s[0]),n[t](...s)):a}function Ha(e,t,s=[]){nn(),Mo();const n=Be(e)[t].apply(e,s);return Po(),an(),n}const dm=cs("__proto__,__v_isRef,__isVue"),uf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Bt));function um(e){Bt(e)||(e=String(e));const t=Be(this);return Ft(t,"has",e),t.hasOwnProperty(e)}class ff{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?bf:vf:i?mf:gf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=he(t);if(!a){let o;if(l&&(o=om[s]))return o;if(s==="hasOwnProperty")return um}const r=Reflect.get(t,s,yt(t)?t:n);if((Bt(s)?uf.has(s):dm(s))||(a||Ft(t,"get",s),i))return r;if(yt(r)){const o=l&&ql(s)?r:r.value;return a&&je(o)?gl(o):o}return je(r)?a?gl(r):Sn(r):r}}class pf extends ff{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=he(t)&&ql(s);if(!this._isShallow){const c=Ms(i);if(!ss(n)&&!Ms(n)&&(i=Be(i),n=Be(n)),!l&&yt(i)&&!yt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:ze(t,s),o=Reflect.set(t,s,n,yt(t)?t:a);return t===Be(a)&&(r?Et(n,i)&&Gs(t,"set",s,n):Gs(t,"add",s,n)),o}deleteProperty(t,s){const n=ze(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Gs(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Bt(s)||!uf.has(s))&&Ft(t,"has",s),n}ownKeys(t){return Ft(t,"iterate",he(t)?"length":Fn),Reflect.ownKeys(t)}}class hf extends ff{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const fm=new pf,pm=new hf,hm=new pf(!0),gm=new hf(!0),Qr=e=>e,zi=e=>Reflect.getPrototypeOf(e);function mm(e,t,s){return function(...n){const a=this.__v_raw,i=Be(a),l=ga(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?Qr:t?wa:ws;return!t&&Ft(i,"iterate",o?Yr:Fn),Pe(Object.create(c),{next(){const{value:u,done:f}=c.next();return f?{value:u,done:f}:{value:r?[d(u[0]),d(u[1])]:d(u),done:f}}})}}function qi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function vm(e,t){const s={get(a){const i=this.__v_raw,l=Be(i),r=Be(a);e||(Et(a,r)&&Ft(l,"get",a),Ft(l,"get",r));const{has:o}=zi(l),c=t?Qr:e?wa:ws;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Ft(Be(a),"iterate",Fn),a.size},has(a){const i=this.__v_raw,l=Be(i),r=Be(a);return e||(Et(a,r)&&Ft(l,"has",a),Ft(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Be(r),c=t?Qr:e?wa:ws;return!e&&Ft(o,"iterate",Fn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Pe(s,e?{add:qi("add"),set:qi("set"),delete:qi("delete"),clear:qi("clear")}:{add(a){const i=Be(this),l=zi(i),r=Be(a),o=!t&&!ss(a)&&!Ms(a)?r:a;return l.has.call(i,o)||Et(a,o)&&l.has.call(i,a)||Et(r,o)&&l.has.call(i,r)||(i.add(o),Gs(i,"add",o,o)),this},set(a,i){!t&&!ss(i)&&!Ms(i)&&(i=Be(i));const l=Be(this),{has:r,get:o}=zi(l);let c=r.call(l,a);c||(a=Be(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Et(i,d)&&Gs(l,"set",a,i):Gs(l,"add",a,i),this},delete(a){const i=Be(this),{has:l,get:r}=zi(i);let o=l.call(i,a);o||(a=Be(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Gs(i,"delete",a,void 0),c},clear(){const a=Be(this),i=a.size!==0,l=a.clear();return i&&Gs(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=mm(a,e,t)}),s}function Ql(e,t){const s=vm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(ze(s,a)&&a in n?s:n,a,i)}const bm={get:Ql(!1,!1)},ym={get:Ql(!1,!0)},xm={get:Ql(!0,!1)},_m={get:Ql(!0,!0)},gf=new WeakMap,mf=new WeakMap,vf=new WeakMap,bf=new WeakMap;function km(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Sn(e){return Ms(e)?e:Xl(e,!1,fm,bm,gf)}function $o(e){return Xl(e,!1,hm,ym,mf)}function gl(e){return Xl(e,!0,pm,xm,vf)}function wm(e){return Xl(e,!0,gm,_m,bf)}function Xl(e,t,s,n,a){if(!je(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=km(Lg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Xs(e){return Ms(e)?Xs(e.__v_raw):!!(e&&e.__v_isReactive)}function Ms(e){return!!(e&&e.__v_isReadonly)}function ss(e){return!!(e&&e.__v_isShallow)}function Ni(e){return e?!!e.__v_raw:!1}function Be(e){const t=e&&e.__v_raw;return t?Be(t):e}function yf(e){return!ze(e,"__v_skip")&&Object.isExtensible(e)&&Ju(e,"__v_skip",!0),e}const ws=e=>je(e)?Sn(e):e,wa=e=>je(e)?gl(e):e;function yt(e){return e?e.__v_isRef===!0:!1}function h(e){return xf(e,!1)}function Uo(e){return xf(e,!0)}function xf(e,t){return yt(e)?e:new Sm(e,t)}class Sm{constructor(t,s){this.dep=new Jl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Be(t),this._value=s?t:ws(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ss(t)||Ms(t);t=n?t:Be(t),Et(t,s)&&(this._rawValue=t,this._value=n?t:ws(t),this.dep.trigger())}}function Tm(e){e.dep&&e.dep.trigger()}function Ds(e){return yt(e)?e.value:e}function Cm(e){return we(e)?e():Ds(e)}const Em={get:(e,t,s)=>t==="__v_raw"?e:Ds(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return yt(a)&&!yt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Bo(e){return Xs(e)?e:new Proxy(e,Em)}class Am{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Jl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function _f(e){return new Am(e)}function Rm(e){const t=he(e)?new Array(e.length):{};for(const s in e)t[s]=kf(e,s);return t}class Im{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Bt(s)?s:String(s),this._raw=Be(t);let a=!0,i=t;if(!he(t)||Bt(this._key)||!ql(this._key))do a=!Ni(i)||ss(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Ds(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&yt(this._raw[this._key])){const s=this._object[this._key];if(yt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return rm(this._raw,this._key)}}class Nm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Lm(e,t,s){return yt(e)?e:we(e)?new Nm(e):je(e)&&arguments.length>1?kf(e,t,s):h(e)}function kf(e,t,s){return new Im(e,t,s)}class Om{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Jl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=fi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&st!==this)return af(this,!0),!0}get value(){const t=this.dep.track();return of(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Dm(e,t,s=!1){let n,a;return we(e)?n=e:(n=e.get,a=e.set),new Om(n,a,s)}const Mm={GET:"get",HAS:"has",ITERATE:"iterate"},Pm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ki={},ml=new WeakMap;let vn;function Fm(){return vn}function wf(e,t=!1,s=vn){if(s){let n=ml.get(s);n||ml.set(s,n=[]),n.push(e)}}function $m(e,t,s=Fe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:ss(_)||a===!1||a===0?Ws(_,1):Ws(_);let d,u,f,p,v=!1,g=!1;if(yt(e)?(u=()=>e.value,v=ss(e)):Xs(e)?(u=()=>c(e),v=!0):he(e)?(g=!0,v=e.some(_=>Xs(_)||ss(_)),u=()=>e.map(_=>{if(yt(_))return _.value;if(Xs(_))return c(_);if(we(_))return o?o(_,2):_()})):we(e)?t?u=o?()=>o(e,2):e:u=()=>{if(f){nn();try{f()}finally{an()}}const _=vn;vn=d;try{return o?o(e,3,[p]):e(p)}finally{vn=_}}:u=Ot,t&&a){const _=u,A=a===!0?1/0:a;u=()=>Ws(_(),A)}const E=sf(),N=()=>{d.stop(),E&&E.active&&Lo(E.effects,d)};if(i&&t){const _=t;t=(...A)=>{const D=_(...A);return N(),D}}let y=g?new Array(e.length).fill(Ki):Ki;const b=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const A=d.run();if(_||a||v||(g?A.some((D,O)=>Et(D,y[O])):Et(A,y))){f&&f();const D=vn;vn=d;try{const O=[A,y===Ki?void 0:g&&y[0]===Ki?[]:y,p];y=A,o?o(t,3,O):t(...O)}finally{vn=D}}}else d.run()};return r&&r(b),d=new ui(u),d.scheduler=l?()=>l(b,!1):b,p=_=>wf(_,!1,d),f=d.onStop=()=>{const _=ml.get(d);if(_){if(o)o(_,4);else for(const A of _)A();ml.delete(d)}},t?n?b(!0):y=d.run():l?l(b.bind(null,!0),!0):d.run(),N.pause=d.pause.bind(d),N.resume=d.resume.bind(d),N.stop=N,N}function Ws(e,t=1/0,s){if(t<=0||!je(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,yt(e))Ws(e.value,t,s);else if(he(e))for(let n=0;n<e.length;n++)Ws(e[n],t,s);else if(Wn(e)||ga(e))e.forEach(n=>{Ws(n,t,s)});else if(zl(e)){for(const n in e)Ws(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Ws(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Sf=[];function Um(e){Sf.push(e)}function Bm(){Sf.pop()}function Hm(e,t){}const Vm={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},jm={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Pa(e,t,s,n){try{return n?e(...n):e()}catch(a){Jn(a,t,s)}}function rs(e,t,s,n){if(we(e)){const a=Pa(e,t,s,n);return a&&Oo(a)&&a.catch(i=>{Jn(i,t,s)}),a}if(he(e)){const a=[];for(let i=0;i<e.length;i++)a.push(rs(e[i],t,s,n));return a}}function Jn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Fe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){nn(),Pa(i,null,10,[e,o,c]),an();return}}zm(e,s,a,n,l)}function zm(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const zt=[];let Ns=-1;const ba=[];let bn=null,oa=0;const Tf=Promise.resolve();let vl=null;function St(e){const t=vl||Tf;return e?t.then(this?e.bind(this):e):t}function qm(e){let t=Ns+1,s=zt.length;for(;t<s;){const n=t+s>>>1,a=zt[n],i=gi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Ho(e){if(!(e.flags&1)){const t=gi(e),s=zt[zt.length-1];!s||!(e.flags&2)&&t>=gi(s)?zt.push(e):zt.splice(qm(t),0,e),e.flags|=1,Cf()}}function Cf(){vl||(vl=Tf.then(Ef))}function hi(e){he(e)?ba.push(...e):bn&&e.id===-1?bn.splice(oa+1,0,e):e.flags&1||(ba.push(e),e.flags|=1),Cf()}function td(e,t,s=Ns+1){for(;s<zt.length;s++){const n=zt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;zt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function bl(e){if(ba.length){const t=[...new Set(ba)].sort((s,n)=>gi(s)-gi(n));if(ba.length=0,bn){bn.push(...t);return}for(bn=t,oa=0;oa<bn.length;oa++){const s=bn[oa];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}bn=null,oa=0}}const gi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Ef(e){try{for(Ns=0;Ns<zt.length;Ns++){const t=zt[Ns];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Pa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ns<zt.length;Ns++){const t=zt[Ns];t&&(t.flags&=-2)}Ns=-1,zt.length=0,bl(),vl=null,(zt.length||ba.length)&&Ef()}}let ca,Gi=[];function Af(e,t){var s,n;ca=e,ca?(ca.enabled=!0,Gi.forEach(({event:a,args:i})=>ca.emit(a,...i)),Gi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Af(i,t)}),setTimeout(()=>{ca||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Gi=[])},3e3)):Gi=[]}let Lt=null,er=null;function mi(e){const t=Lt;return Lt=e,er=e&&e.type.__scopeId||null,t}function Km(e){er=e}function Gm(){er=null}const Wm=e=>Vo;function Vo(e,t=Lt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&xi(-1);const i=mi(t);let l;try{l=e(...a)}finally{mi(i),n._d&&xi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Zm(e,t){if(Lt===null)return e;const s=Fi(Lt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Fe]=t[a];i&&(we(i)&&(i={mounted:i,updated:i}),i.deep&&Ws(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Ls(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(nn(),rs(o,s,8,[e.el,r,e,t]),an())}}function ni(e,t){if(Nt){let s=Nt.provides;const n=Nt.parent&&Nt.parent.provides;n===s&&(s=Nt.provides=Object.create(n)),s[e]=t}}function gs(e,t,s=!1){const n=Kt();if(n||$n){let a=$n?$n._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&we(t)?t.call(n&&n.proxy):t}}function Jm(){return!!(Kt()||$n)}const Rf=Symbol.for("v-scx"),If=()=>gs(Rf);function Ym(e,t){return Li(e,null,t)}function Qm(e,t){return Li(e,null,{flush:"post"})}function Nf(e,t){return Li(e,null,{flush:"sync"})}function ls(e,t,s){return Li(e,t,s)}function Li(e,t,s=Fe){const{immediate:n,deep:a,flush:i,once:l}=s,r=Pe({},s),o=t&&n||!t&&i!=="post";let c;if(zn){if(i==="sync"){const p=If();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Ot,p.resume=Ot,p.pause=Ot,p}}const d=Nt;r.call=(p,v,g)=>rs(p,d,v,g);let u=!1;i==="post"?r.scheduler=p=>{vt(p,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(p,v)=>{v?p():Ho(p)}),r.augmentJob=p=>{t&&(p.flags|=4),u&&(p.flags|=2,d&&(p.id=d.uid,p.i=d))};const f=$m(e,t,r);return zn&&(c?c.push(f):o&&f()),f}function Xm(e,t,s){const n=this.proxy,a=Ae(e)?e.includes(".")?Lf(n,e):()=>n[e]:e.bind(n,n);let i;we(t)?i=t:(i=t.handler,s=t);const l=Fa(this),r=Li(a,i.bind(n),s);return l(),r}function Lf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const gn=new WeakMap,Of=Symbol("_vte"),Df=e=>e.__isTeleport,On=e=>e&&(e.disabled||e.disabled===""),ev=e=>e&&(e.defer||e.defer===""),sd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,nd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Xr=(e,t)=>{const s=e&&e.to;return Ae(s)?t?t(s):null:s},tv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:f,o:{insert:p,querySelector:v,createText:g,createComment:E,parentNode:N}}=c,y=On(t.props);let{dynamicChildren:b}=t;const _=(O,C,T)=>{O.shapeFlag&16&&d(O.children,C,T,a,i,l,r,o)},A=(O=t)=>{const C=On(O.props),T=O.target=Xr(O.props,v),L=eo(T,O,g,p);T&&(l!=="svg"&&sd(T)?l="svg":l!=="mathml"&&nd(T)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(T),C||(_(O,T,L),Ja(O,!1)))},D=O=>{const C=()=>{if(gn.get(O)===C){if(gn.delete(O),On(O.props)){const T=N(O.el)||s;_(O,T,O.anchor),Ja(O,!0)}A(O)}};gn.set(O,C),vt(C,i)};if(e==null){const O=t.el=g(""),C=t.anchor=g("");if(p(O,s,n),p(C,s,n),ev(t.props)||i&&i.pendingBranch){D(t);return}y&&(_(t,s,C),Ja(t,!0)),A()}else{t.el=e.el;const O=t.anchor=e.anchor,C=gn.get(e);if(C){C.flags|=8,gn.delete(e),D(t);return}t.targetStart=e.targetStart;const T=t.target=e.target,L=t.targetAnchor=e.targetAnchor,B=On(e.props),P=B?s:T,S=B?O:L;if(l==="svg"||sd(T)?l="svg":(l==="mathml"||nd(T))&&(l="mathml"),b?(f(e.dynamicChildren,b,P,a,i,l,r),Xo(e,t,!0)):o||u(e,t,P,S,a,i,l,r,!1),y)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Wi(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const $=t.target=Xr(t.props,v);$&&Wi(t,$,null,c,0)}else B&&Wi(t,T,L,c,1);Ja(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:f}=e,p=i||!On(f),v=gn.get(e);if(v&&(v.flags|=8,gn.delete(e)),u&&(a(c),a(d)),i&&a(o),!v&&l&16)for(let g=0;g<r.length;g++){const E=r[g];n(E,t,s,p,!!E.dynamicChildren)}},move:Wi,hydrate:sv};function Wi(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!gn.has(e)&&(!u||On(d))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);u&&n(r,t,s)}function sv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function f(E,N){let y=N;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function p(E,N){N.anchor=u(l(E),N,r(E),s,n,a,i)}const v=t.target=Xr(t.props,o),g=On(t.props);if(v){const E=v._lpa||v.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(v,E),t.targetAnchor||eo(v,t,d,c,r(e)===v?e:null)):(t.anchor=l(e),f(v,E),t.targetAnchor||eo(v,t,d,c),u(E&&l(E),t,v,s,n,a,i))),Ja(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const nv=tv;function Ja(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function eo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Of]=l,e&&(n(i,e,a),n(l,e,a)),l}const fs=Symbol("_leaveCb"),Va=Symbol("_enterCb");function jo(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return He(()=>{e.isMounted=!0}),ar(()=>{e.isUnmounting=!0}),e}const us=[Function,Array],zo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:us,onEnter:us,onAfterEnter:us,onEnterCancelled:us,onBeforeLeave:us,onLeave:us,onAfterLeave:us,onLeaveCancelled:us,onBeforeAppear:us,onAppear:us,onAfterAppear:us,onAppearCancelled:us},Mf=e=>{const t=e.subTree;return t.component?Mf(t.component):t},av={name:"BaseTransition",props:zo,setup(e,{slots:t}){const s=Kt(),n=jo();return()=>{const a=t.default&&tr(t.default(),!0),i=a&&a.length?Pf(a):s.subTree?bp():void 0;if(!i)return;const l=Be(e),{mode:r}=l;if(n.isLeaving)return Er(i);const o=ad(i);if(!o)return Er(i);let c=Sa(o,l,n,s,u=>c=u);o.type!==ht&&ln(o,c);let d=s.subTree&&ad(s.subTree);if(d&&d.type!==ht&&!xs(d,o)&&Mf(s).type!==ht){let u=Sa(d,l,n,s);if(ln(d,u),r==="out-in"&&o.type!==ht)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Er(i);r==="in-out"&&o.type!==ht?u.delayLeave=(f,p,v)=>{const g=$f(n,d);g[String(d.key)]=d,f[fs]=()=>{p(),f[fs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{v(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Pf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==ht){t=s;break}}return t}const Ff=av;function $f(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Sa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:f,onLeave:p,onAfterLeave:v,onLeaveCancelled:g,onBeforeAppear:E,onAppear:N,onAfterAppear:y,onAppearCancelled:b}=t,_=String(e.key),A=$f(s,e),D=(T,L)=>{T&&rs(T,n,9,L)},O=(T,L)=>{const B=L[1];D(T,L),he(T)?T.every(P=>P.length<=1)&&B():T.length<=1&&B()},C={mode:l,persisted:r,beforeEnter(T){let L=o;if(!s.isMounted)if(i)L=E||o;else return;T[fs]&&T[fs](!0);const B=A[_];B&&xs(e,B)&&B.el[fs]&&B.el[fs](),D(L,[T])},enter(T){if(A[_]===e)return;let L=c,B=d,P=u;if(!s.isMounted)if(i)L=N||c,B=y||d,P=b||u;else return;let S=!1;T[Va]=G=>{S||(S=!0,G?D(P,[T]):D(B,[T]),C.delayedLeave&&C.delayedLeave(),T[Va]=void 0)};const $=T[Va].bind(null,!1);L?O(L,[T,$]):$()},leave(T,L){const B=String(e.key);if(T[Va]&&T[Va](!0),s.isUnmounting)return L();D(f,[T]);let P=!1;T[fs]=$=>{P||(P=!0,L(),$?D(g,[T]):D(v,[T]),T[fs]=void 0,A[B]===e&&delete A[B])};const S=T[fs].bind(null,!1);A[B]=e,p?O(p,[T,S]):S()},clone(T){const L=Sa(T,t,s,n,a);return a&&a(L),L}};return C}function Er(e){if(Di(e))return e=Ps(e),e.children=null,e}function ad(e){if(!Di(e))return Df(e.type)&&e.children?Pf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&we(s.default))return s.default()}}function ln(e,t){e.shapeFlag&6&&e.component?(e.transition=t,ln(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function tr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===At?(l.patchFlag&128&&a++,n=n.concat(tr(l.children,t,r))):(t||l.type!==ht)&&n.push(r!=null?Ps(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Oi(e,t){return we(e)?Pe({name:e.name},t,{setup:e}):e}function iv(){const e=Kt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function qo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function lv(e){const t=Kt(),s=Uo(null);if(t){const a=t.refs===Fe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function id(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const yl=new WeakMap;function ya(e,t,s,n,a=!1){if(he(e)){e.forEach((g,E)=>ya(g,t&&(he(t)?t[E]:t),s,n,a));return}if(en(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&ya(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Fi(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Fe?r.refs={}:r.refs,u=r.setupState,f=Be(u),p=u===Fe?fa:g=>id(d,g)?!1:ze(f,g),v=(g,E)=>!(E&&id(d,E));if(c!=null&&c!==o){if(ld(t),Ae(c))d[c]=null,p(c)&&(u[c]=null);else if(yt(c)){const g=t;v(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if(we(o))Pa(o,r,12,[l,d]);else{const g=Ae(o),E=yt(o);if(g||E){const N=()=>{if(e.f){const y=g?p(o)?u[o]:d[o]:v()||!e.k?o.value:d[e.k];if(a)he(y)&&Lo(y,i);else if(he(y))y.includes(i)||y.push(i);else if(g)d[o]=[i],p(o)&&(u[o]=d[o]);else{const b=[i];v(o,e.k)&&(o.value=b),e.k&&(d[e.k]=b)}}else g?(d[o]=l,p(o)&&(u[o]=l)):E&&(v(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{N(),yl.delete(e)};y.id=-1,yl.set(e,y),vt(y,s)}else ld(e),N()}}}function ld(e){const t=yl.get(e);t&&(t.flags|=8,yl.delete(e))}let rd=!1;const aa=()=>{rd||(console.error("Hydration completed but contains mismatches."),rd=!0)},rv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",ov=e=>e.namespaceURI.includes("MathML"),Zi=e=>{if(e.nodeType===1){if(rv(e))return"svg";if(ov(e))return"mathml"}},pa=e=>e.nodeType===8;function cv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(b,_)=>{if(!_.hasChildNodes()){s(null,b,_),bl(),_._vnode=b;return}u(_.firstChild,b,null,null,null),bl(),_._vnode=b},u=(b,_,A,D,O,C=!1)=>{C=C||!!_.dynamicChildren;const T=pa(b)&&b.data==="[",L=()=>g(b,_,A,D,O,T),{type:B,ref:P,shapeFlag:S,patchFlag:$}=_;let G=b.nodeType;_.el=b,$===-2&&(C=!1,_.dynamicChildren=null);let q=null;switch(B){case _n:G!==3?_.children===""?(o(_.el=a(""),l(b),b),q=b):q=L():(b.data!==_.children&&(aa(),b.data=_.children),q=i(b));break;case ht:y(b)?(q=i(b),N(_.el=b.content.firstChild,b,A)):G!==8||T?q=L():q=i(b);break;case Un:if(T&&(b=i(b),G=b.nodeType),G===1||G===3){q=b;const k=!_.children.length;for(let x=0;x<_.staticCount;x++)k&&(_.children+=q.nodeType===1?q.outerHTML:q.data),x===_.staticCount-1&&(_.anchor=q),q=i(q);return T?i(q):q}else L();break;case At:T?q=v(b,_,A,D,O,C):q=L();break;default:if(S&1)(G!==1||_.type.toLowerCase()!==b.tagName.toLowerCase())&&!y(b)?q=L():q=f(b,_,A,D,O,C);else if(S&6){_.slotScopeIds=O;const k=l(b);if(T?q=E(b):pa(b)&&b.data==="teleport start"?q=E(b,b.data,"teleport end"):q=i(b),t(_,k,null,A,D,Zi(k),C),en(_)&&!_.type.__asyncResolved){let x;T?(x=lt(At),x.anchor=q?q.previousSibling:k.lastChild):x=b.nodeType===3?tc(""):lt("div"),x.el=b,_.component.subTree=x}}else S&64?G!==8?q=L():q=_.type.hydrate(b,_,A,D,O,C,e,p):S&128&&(q=_.type.hydrate(b,_,A,D,Zi(l(b)),O,C,e,u))}return P!=null&&ya(P,null,D,_),q},f=(b,_,A,D,O,C)=>{C=C||!!_.dynamicChildren;const{type:T,props:L,patchFlag:B,shapeFlag:P,dirs:S,transition:$}=_,G=T==="input"||T==="option";if(G||B!==-1){S&&Ls(_,null,A,"created");let q=!1;if(y(b)){q=cp(null,$)&&A&&A.vnode.props&&A.vnode.props.appear;const x=b.content.firstChild;if(q){const U=x.getAttribute("class");U&&(x.$cls=U),$.beforeEnter(x)}N(x,b,A),_.el=b=x}if(P&16&&!(L&&(L.innerHTML||L.textContent))){let x=p(b.firstChild,_,b,A,D,O,C);for(x&&!Ji(b,1)&&aa();x;){const U=x;x=x.nextSibling,r(U)}}else if(P&8){let x=_.children;x[0]===`
`&&(b.tagName==="PRE"||b.tagName==="TEXTAREA")&&(x=x.slice(1));const{textContent:U}=b;U!==x&&U!==x.replace(/\r\n|\r/g,`
`)&&(Ji(b,0)||aa(),b.textContent=_.children)}if(L){if(G||!C||B&48){const x=b.tagName.includes("-");for(const U in L)(G&&(U.endsWith("value")||U==="indeterminate")||Gn(U)&&!Qs(U)||U[0]==="."||x&&!Qs(U))&&n(b,U,null,L[U],void 0,A)}else if(L.onClick)n(b,"onClick",null,L.onClick,void 0,A);else if(B&4&&Xs(L.style))for(const x in L.style)L.style[x]}let k;(k=L&&L.onVnodeBeforeMount)&&Yt(k,A,_),S&&Ls(_,null,A,"beforeMount"),((k=L&&L.onVnodeMounted)||S||q)&&pp(()=>{k&&Yt(k,A,_),q&&$.enter(b),S&&Ls(_,null,A,"mounted")},D)}return b.nextSibling},p=(b,_,A,D,O,C,T)=>{T=T||!!_.dynamicChildren;const L=_.children,B=L.length;let P=!1;for(let S=0;S<B;S++){const $=T?L[S]:L[S]=Xt(L[S]),G=$.type===_n;b?(G&&!T&&S+1<B&&Xt(L[S+1]).type===_n&&(o(a(b.data.slice($.children.length)),A,i(b)),b.data=$.children),b=u(b,$,D,O,C,T)):G&&!$.children?o($.el=a(""),A):(P||(P=!0,Ji(A,1)||aa()),s(null,$,A,null,D,O,Zi(A),C))}return b},v=(b,_,A,D,O,C)=>{const{slotScopeIds:T}=_;T&&(O=O?O.concat(T):T);const L=l(b),B=p(i(b),_,L,A,D,O,C);return B&&pa(B)&&B.data==="]"?i(_.anchor=B):(aa(),o(_.anchor=c("]"),L,B),B)},g=(b,_,A,D,O,C)=>{if(Ji(b.parentElement,1)||aa(),_.el=null,C){const B=E(b);for(;;){const P=i(b);if(P&&P!==B)r(P);else break}}const T=i(b),L=l(b);return r(b),s(null,_,L,T,A,D,Zi(L),O),A&&(A.vnode.el=_.el,lr(A,_.el)),T},E=(b,_="[",A="]")=>{let D=0;for(;b;)if(b=i(b),b&&pa(b)&&(b.data===_&&D++,b.data===A)){if(D===0)return i(b);D--}return b},N=(b,_,A)=>{const D=_.parentNode;D&&D.replaceChild(b,_);let O=A;for(;O;)O.vnode.el===_&&(O.vnode.el=O.subTree.el=b),O=O.parent},y=b=>b.nodeType===1&&b.tagName==="TEMPLATE";return[d,u]}const od="data-allow-mismatch",dv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Ji(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(od);)e=e.parentElement;const s=e&&e.getAttribute(od);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(dv[t])}}const uv=Wl().requestIdleCallback||(e=>setTimeout(e,1)),fv=Wl().cancelIdleCallback||(e=>clearTimeout(e)),pv=(e=1e4)=>t=>{const s=uv(t,{timeout:e});return()=>fv(s)};function hv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const gv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(hv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},mv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},vv=(e=[])=>(t,s)=>{Ae(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function bv(e,t){if(pa(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(pa(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const en=e=>!!e.type.__asyncLoader;function yv(e){we(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const f=()=>(u++,c=null,p()),p=()=>{let v;return c||(v=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((E,N)=>{o(g,()=>E(f()),()=>N(g),u+1)});throw g}).then(g=>v!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return Oi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(v,g,E){let N=!1;(g.bu||(g.bu=[])).push(()=>N=!0);const y=()=>{N||E()},b=i?()=>{const _=i(y,A=>bv(v,A));_&&(g.bum||(g.bum=[])).push(_)}:y;d?b():p().then(()=>!g.isUnmounted&&b())},get __asyncResolved(){return d},setup(){const v=Nt;if(qo(v),d)return()=>Yi(d,v);const g=A=>{c=null,Jn(A,v,13,!n)};if(r&&v.suspense||zn)return p().then(A=>()=>Yi(A,v)).catch(A=>(g(A),()=>n?lt(n,{error:A}):null));const E=h(!1),N=h(),y=h(!!a);let b,_;return gt(()=>{b!=null&&clearTimeout(b),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{v.isUnmounted||(y.value=!1)},a)),l!=null&&(b=setTimeout(()=>{if(!v.isUnmounted&&!E.value&&!N.value){const A=new Error(`Async component timed out after ${l}ms.`);g(A),N.value=A}},l)),p().then(()=>{v.isUnmounted||(E.value=!0,v.parent&&Di(v.parent.vnode)&&v.parent.update())}).catch(A=>{if(v.isUnmounted){c=null;return}g(A),N.value=A}),()=>{if(E.value&&d)return Yi(d,v);if(N.value&&n)return lt(n,{error:N.value});if(s&&!y.value)return Yi(s,v)}}})}function Yi(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=lt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Di=e=>e.type.__isKeepAlive,xv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Kt(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,f=u("div");n.activate=(y,b,_,A,D)=>{const O=y.component;c(y,b,_,0,r),o(O.vnode,y,b,_,O,r,A,y.slotScopeIds,D),vt(()=>{O.isDeactivated=!1,O.a&&va(O.a);const C=y.props&&y.props.onVnodeMounted;C&&Yt(C,O.parent,y)},r)},n.deactivate=y=>{const b=y.component;_l(b.m),_l(b.a),c(y,f,null,1,r),vt(()=>{b.da&&va(b.da);const _=y.props&&y.props.onVnodeUnmounted;_&&Yt(_,b.parent,y),b.isDeactivated=!0},r)};function p(y){Ar(y),d(y,s,r,!0)}function v(y){a.forEach((b,_)=>{const A=co(en(b)?b.type.__asyncResolved||{}:b.type);A&&!y(A)&&g(_)})}function g(y){const b=a.get(y);b&&(!l||!xs(b,l))?p(b):l&&Ar(l),a.delete(y),i.delete(y)}ls(()=>[e.include,e.exclude],([y,b])=>{y&&v(_=>Ya(y,_)),b&&v(_=>!Ya(b,_))},{flush:"post",deep:!0});let E=null;const N=()=>{E!=null&&(kl(s.subTree.type)?vt(()=>{a.set(E,Qi(s.subTree))},s.subTree.suspense):a.set(E,Qi(s.subTree)))};return He(N),nr(N),ar(()=>{a.forEach(y=>{const{subTree:b,suspense:_}=s,A=Qi(b);if(y.type===A.type&&y.key===A.key){Ar(A);const D=A.component.da;D&&vt(D,_);return}p(y)})}),()=>{if(E=null,!t.default)return l=null;const y=t.default(),b=y[0];if(y.length>1)return l=null,y;if(!rn(b)||!(b.shapeFlag&4)&&!(b.shapeFlag&128))return l=null,b;let _=Qi(b);if(_.type===ht)return l=null,_;const A=_.type,D=co(en(_)?_.type.__asyncResolved||{}:A),{include:O,exclude:C,max:T}=e;if(O&&(!D||!Ya(O,D))||C&&D&&Ya(C,D))return _.shapeFlag&=-257,l=_,b;const L=_.key==null?A:_.key,B=a.get(L);return _.el&&(_=Ps(_),b.shapeFlag&128&&(b.ssContent=_)),E=L,B?(_.el=B.el,_.component=B.component,_.transition&&ln(_,_.transition),_.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),T&&i.size>parseInt(T,10)&&g(i.values().next().value)),_.shapeFlag|=256,l=_,kl(b.type)?b:_}}},_v=xv;function Ya(e,t){return he(e)?e.some(s=>Ya(s,t)):Ae(e)?e.split(",").includes(t):Ng(e)?(e.lastIndex=0,e.test(t)):!1}function Mi(e,t){Uf(e,"a",t)}function Pi(e,t){Uf(e,"da",t)}function Uf(e,t,s=Nt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(sr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Di(a.parent.vnode)&&kv(n,t,s,a),a=a.parent}}function kv(e,t,s,n){const a=sr(t,e,n,!0);gt(()=>{Lo(n[t],a)},s)}function Ar(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Qi(e){return e.shapeFlag&128?e.ssContent:e}function sr(e,t,s=Nt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{nn();const r=Fa(s),o=rs(t,s,e,l);return r(),an(),o});return n?a.unshift(i):a.push(i),i}}const on=e=>(t,s=Nt)=>{(!zn||e==="sp")&&sr(e,(...n)=>t(...n),s)},Bf=on("bm"),He=on("m"),Ko=on("bu"),nr=on("u"),ar=on("bum"),gt=on("um"),Hf=on("sp"),Vf=on("rtg"),jf=on("rtc");function zf(e,t=Nt){sr("ec",e,t)}const Go="components",wv="directives";function Sv(e,t){return Wo(Go,e,!0,t)||e}const qf=Symbol.for("v-ndc");function Tv(e){return Ae(e)?Wo(Go,e,!1)||e:e||qf}function Cv(e){return Wo(wv,e)}function Wo(e,t,s=!0,n=!1){const a=Lt||Nt;if(a){const i=a.type;if(e===Go){const r=co(i,!1);if(r&&(r===t||r===Qe(t)||r===Zn(Qe(t))))return i}const l=cd(a[e]||i[e],t)||cd(a.appContext[e],t);return!l&&n?i:l}}function cd(e,t){return e&&(e[t]||e[Qe(t)]||e[Zn(Qe(t))])}function Ev(e,t,s,n){let a;const i=s&&s[n],l=he(e);if(l||Ae(e)){const r=l&&Xs(e);let o=!1,c=!1;r&&(o=!ss(e),c=Ms(e),e=Yl(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?wa(ws(e[d])):ws(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(je(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Av(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(he(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Rv(e,t,s={},n,a){if(Lt.ce||Lt.parent&&en(Lt.parent)&&Lt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),yi(),wl(At,null,[lt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),yi();const l=i&&Zo(i(s)),r=s.key||l&&l.key,o=wl(At,{key:(r&&!Bt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Zo(e){return e.some(t=>rn(t)?!(t.type===ht||t.type===At&&!Zo(t.children)):!0)?e:null}function Iv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:ma(n)]=e[n];return s}const to=e=>e?_p(e)?Fi(e):to(e.parent):null,ai=Pe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>to(e.parent),$root:e=>to(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Jo(e),$forceUpdate:e=>e.f||(e.f=()=>{Ho(e.update)}),$nextTick:e=>e.n||(e.n=St.bind(e.proxy)),$watch:e=>Xm.bind(e)}),Rr=(e,t)=>e!==Fe&&!e.__isScriptSetup&&ze(e,t),so={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Rr(n,t))return l[t]=1,n[t];if(a!==Fe&&ze(a,t))return l[t]=2,a[t];if(ze(i,t))return l[t]=3,i[t];if(s!==Fe&&ze(s,t))return l[t]=4,s[t];no&&(l[t]=0)}}const c=ai[t];let d,u;if(c)return t==="$attrs"&&Ft(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Fe&&ze(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,ze(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Rr(a,t)?(a[t]=s,!0):n!==Fe&&ze(n,t)?(n[t]=s,!0):ze(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Fe&&r[0]!=="$"&&ze(e,r)||Rr(t,r)||ze(i,r)||ze(n,r)||ze(ai,r)||ze(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:ze(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Nv=Pe({},so,{get(e,t){if(t!==Symbol.unscopables)return so.get(e,t,e)},has(e,t){return t[0]!=="_"&&!$g(t)}});function Lv(){return null}function Ov(){return null}function Dv(e){}function Mv(e){}function Pv(){return null}function Fv(){}function $v(e,t){return null}function Uv(){return Kf().slots}function Bv(){return Kf().attrs}function Kf(e){const t=Kt();return t.setupContext||(t.setupContext=Tp(t))}function vi(e){return he(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Hv(e,t){const s=vi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?he(a)||we(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Vv(e,t){return!e||!t?e||t:he(e)&&he(t)?e.concat(t):Pe({},vi(e),vi(t))}function jv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function zv(e){const t=Kt(),s=zn;let n=e();_i(),s&&_a(!1);const a=()=>{Fa(t),s&&_a(!0)},i=()=>{Kt()!==t&&t.scope.off(),_i(),s&&_a(!1)};return Oo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let no=!0;function qv(e){const t=Jo(e),s=e.proxy,n=e.ctx;no=!1,t.beforeCreate&&dd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:f,beforeUpdate:p,updated:v,activated:g,deactivated:E,beforeDestroy:N,beforeUnmount:y,destroyed:b,unmounted:_,render:A,renderTracked:D,renderTriggered:O,errorCaptured:C,serverPrefetch:T,expose:L,inheritAttrs:B,components:P,directives:S,filters:$}=t;if(c&&Kv(c,n,null),l)for(const k in l){const x=l[k];we(x)&&(n[k]=x.bind(s))}if(a){const k=a.call(s,s);je(k)&&(e.data=Sn(k))}if(no=!0,i)for(const k in i){const x=i[k],U=we(x)?x.bind(s,s):we(x.get)?x.get.bind(s,s):Ot,de=!we(x)&&we(x.set)?x.set.bind(s):Ot,ce=J({get:U,set:de});Object.defineProperty(n,k,{enumerable:!0,configurable:!0,get:()=>ce.value,set:se=>ce.value=se})}if(r)for(const k in r)Gf(r[k],n,s,k);if(o){const k=we(o)?o.call(s):o;Reflect.ownKeys(k).forEach(x=>{ni(x,k[x])})}d&&dd(d,e,"c");function q(k,x){he(x)?x.forEach(U=>k(U.bind(s))):x&&k(x.bind(s))}if(q(Bf,u),q(He,f),q(Ko,p),q(nr,v),q(Mi,g),q(Pi,E),q(zf,C),q(jf,D),q(Vf,O),q(ar,y),q(gt,_),q(Hf,T),he(L))if(L.length){const k=e.exposed||(e.exposed={});L.forEach(x=>{Object.defineProperty(k,x,{get:()=>s[x],set:U=>s[x]=U,enumerable:!0})})}else e.exposed||(e.exposed={});A&&e.render===Ot&&(e.render=A),B!=null&&(e.inheritAttrs=B),P&&(e.components=P),S&&(e.directives=S),T&&qo(e)}function Kv(e,t,s=Ot){he(e)&&(e=ao(e));for(const n in e){const a=e[n];let i;je(a)?"default"in a?i=gs(a.from||n,a.default,!0):i=gs(a.from||n):i=gs(a),yt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function dd(e,t,s){rs(he(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Gf(e,t,s,n){let a=n.includes(".")?Lf(s,n):()=>s[n];if(Ae(e)){const i=t[e];we(i)&&ls(a,i)}else if(we(e))ls(a,e.bind(s));else if(je(e))if(he(e))e.forEach(i=>Gf(i,t,s,n));else{const i=we(e.handler)?e.handler.bind(s):t[e.handler];we(i)&&ls(a,i,e)}}function Jo(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>xl(o,c,l,!0)),xl(o,t,l)),je(t)&&i.set(t,o),o}function xl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&xl(e,i,s,!0),a&&a.forEach(l=>xl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=Gv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const Gv={data:ud,props:fd,emits:fd,methods:Qa,computed:Qa,beforeCreate:Ht,created:Ht,beforeMount:Ht,mounted:Ht,beforeUpdate:Ht,updated:Ht,beforeDestroy:Ht,beforeUnmount:Ht,destroyed:Ht,unmounted:Ht,activated:Ht,deactivated:Ht,errorCaptured:Ht,serverPrefetch:Ht,components:Qa,directives:Qa,watch:Zv,provide:ud,inject:Wv};function ud(e,t){return t?e?function(){return Pe(we(e)?e.call(this,this):e,we(t)?t.call(this,this):t)}:t:e}function Wv(e,t){return Qa(ao(e),ao(t))}function ao(e){if(he(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Ht(e,t){return e?[...new Set([].concat(e,t))]:t}function Qa(e,t){return e?Pe(Object.create(null),e,t):t}function fd(e,t){return e?he(e)&&he(t)?[...new Set([...e,...t])]:Pe(Object.create(null),vi(e),vi(t??{})):t}function Zv(e,t){if(!e)return t;if(!t)return e;const s=Pe(Object.create(null),e);for(const n in t)s[n]=Ht(e[n],t[n]);return s}function Wf(){return{app:null,config:{isNativeTag:fa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Jv=0;function Yv(e,t){return function(n,a=null){we(n)||(n=Pe({},n)),a!=null&&!je(a)&&(a=null);const i=Wf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Jv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Ep,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&we(d.install)?(l.add(d),d.install(c,...u)):we(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,f){if(!o){const p=c._ceVNode||lt(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),u&&t?t(p,d):e(p,d,f),o=!0,c._container=d,d.__vue_app__=c,Fi(p.component)}},onUnmount(d){r.push(d)},unmount(){o&&(rs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=$n;$n=c;try{return d()}finally{$n=u}}};return c}}let $n=null;function Qv(e,t,s=Fe){const n=Kt(),a=Qe(t),i=es(t),l=Zf(e,a),r=_f((o,c)=>{let d,u=Fe,f;return Nf(()=>{const p=e[a];Et(d,p)&&(d=p,c())}),{get(){return o(),s.get?s.get(d):d},set(p){const v=s.set?s.set(p):p;if(!Et(v,d)&&!(u!==Fe&&Et(p,u)))return;const g=n.vnode.props,E=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));E||(d=p,c()),n.emit(`update:${t}`,v),Et(p,u)&&(Et(p,v)&&!Et(v,f)||E&&u!==Fe&&!Et(v,d))&&c(),u=p,f=v}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Fe:r,done:!1}:{done:!0}}}},r}const Zf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Qe(t)}Modifiers`]||e[`${es(t)}Modifiers`];function Xv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Fe;let a=s;const i=t.startsWith("update:"),l=i&&Zf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Ae(d)?d.trim():d)),l.number&&(a=s.map(Gl)));let r,o=n[r=ma(t)]||n[r=ma(Qe(t))];!o&&i&&(o=n[r=ma(es(t))]),o&&rs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,rs(c,e,6,a)}}const eb=new WeakMap;function Jf(e,t,s=!1){const n=s?eb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!we(e)){const o=c=>{const d=Jf(c,t,!0);d&&(r=!0,Pe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(je(e)&&n.set(e,null),null):(he(i)?i.forEach(o=>l[o]=null):Pe(l,i),je(e)&&n.set(e,l),l)}function ir(e,t){return!e||!Gn(t)?!1:(t=t.slice(2).replace(/Once$/,""),ze(e,t[0].toLowerCase()+t.slice(1))||ze(e,es(t))||ze(e,t))}function ll(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:f,setupState:p,ctx:v,inheritAttrs:g}=e,E=mi(e);let N,y;try{if(s.shapeFlag&4){const _=a||n,A=_;N=Xt(c.call(A,_,d,u,p,f,v)),y=r}else{const _=t;N=Xt(_.length>1?_(u,{attrs:r,slots:l,emit:o}):_(u,null)),y=t.props?r:sb(r)}}catch(_){ii.length=0,Jn(_,e,1),N=lt(ht)}let b=N;if(y&&g!==!1){const _=Object.keys(y),{shapeFlag:A}=b;_.length&&A&7&&(i&&_.some(jl)&&(y=nb(y,i)),b=Ps(b,y,!1,!0))}return s.dirs&&(b=Ps(b,null,!1,!0),b.dirs=b.dirs?b.dirs.concat(s.dirs):s.dirs),s.transition&&ln(b,s.transition),N=b,mi(E),N}function tb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(rn(a)){if(a.type!==ht||a.children==="v-if"){if(s)return;s=a}}else return}return s}const sb=e=>{let t;for(const s in e)(s==="class"||s==="style"||Gn(s))&&((t||(t={}))[s]=e[s]);return t},nb=(e,t)=>{const s={};for(const n in e)(!jl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function ab(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?pd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const f=d[u];if(Yf(l,n,f)&&!ir(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?pd(n,l,c):!0:!!l;return!1}function pd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Yf(t,e,i)&&!ir(s,i))return!0}return!1}function Yf(e,t,s){const n=e[s],a=t[s];return s==="style"&&je(n)&&je(a)?!sn(n,a):n!==a}function lr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Qf={},Xf=()=>Object.create(Qf),ep=e=>Object.getPrototypeOf(e)===Qf;function ib(e,t,s,n=!1){const a={},i=Xf();e.propsDefaults=Object.create(null),tp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:$o(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function lb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Be(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let f=d[u];if(ir(e.emitsOptions,f))continue;const p=t[f];if(o)if(ze(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const v=Qe(f);a[v]=io(o,r,v,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{tp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!ze(t,u)&&((d=es(u))===u||!ze(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=io(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!ze(t,u))&&(delete i[u],c=!0)}c&&Gs(e.attrs,"set","")}function tp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(Qs(o))continue;const c=t[o];let d;a&&ze(a,d=Qe(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:ir(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Be(s),c=r||Fe;for(let d=0;d<i.length;d++){const u=i[d];s[u]=io(a,o,u,c[u],e,!ze(c,u))}}return l}function io(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=ze(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&we(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Fa(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===es(s))&&(n=!0))}return n}const rb=new WeakMap;function sp(e,t,s=!1){const n=s?rb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!we(e)){const d=u=>{o=!0;const[f,p]=sp(u,t,!0);Pe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return je(e)&&n.set(e,ha),ha;if(he(i))for(let d=0;d<i.length;d++){const u=Qe(i[d]);hd(u)&&(l[u]=Fe)}else if(i)for(const d in i){const u=Qe(d);if(hd(u)){const f=i[d],p=l[u]=he(f)||we(f)?{type:f}:Pe({},f),v=p.type;let g=!1,E=!0;if(he(v))for(let N=0;N<v.length;++N){const y=v[N],b=we(y)&&y.name;if(b==="Boolean"){g=!0;break}else b==="String"&&(E=!1)}else g=we(v)&&v.name==="Boolean";p[0]=g,p[1]=E,(g||ze(p,"default"))&&r.push(u)}}const c=[l,r];return je(e)&&n.set(e,c),c}function hd(e){return e[0]!=="$"&&!Qs(e)}const Yo=e=>e==="_"||e==="_ctx"||e==="$stable",Qo=e=>he(e)?e.map(Xt):[Xt(e)],ob=(e,t,s)=>{if(t._n)return t;const n=Vo((...a)=>Qo(t(...a)),s);return n._c=!1,n},np=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Yo(a))continue;const i=e[a];if(we(i))t[a]=ob(a,i,n);else if(i!=null){const l=Qo(i);t[a]=()=>l}}},ap=(e,t)=>{const s=Qo(t);e.slots.default=()=>s},ip=(e,t,s)=>{for(const n in t)(s||!Yo(n))&&(e[n]=t[n])},cb=(e,t,s)=>{const n=e.slots=Xf();if(e.vnode.shapeFlag&32){const a=t._;a?(ip(n,t,s),s&&Ju(n,"_",a,!0)):np(t,n)}else t&&ap(e,t)},db=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Fe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:ip(a,t,s):(i=!t.$stable,np(t,a)),l=t}else t&&(ap(e,t),l={default:1});if(i)for(const r in a)!Yo(r)&&l[r]==null&&delete a[r]},vt=pp;function lp(e){return op(e)}function rp(e){return op(e,cv)}function op(e,t){const s=Wl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:f,setScopeId:p=Ot,insertStaticContent:v}=e,g=(m,R,M,Z=null,I=null,F=null,Y=void 0,ee=null,te=!!R.dynamicChildren)=>{if(m===R)return;m&&!xs(m,R)&&(Z=j(m),se(m,I,F,!0),m=null),R.patchFlag===-2&&(te=!1,R.dynamicChildren=null);const{type:X,ref:be,shapeFlag:le}=R;switch(X){case _n:E(m,R,M,Z);break;case ht:N(m,R,M,Z);break;case Un:m==null&&y(R,M,Z,Y);break;case At:P(m,R,M,Z,I,F,Y,ee,te);break;default:le&1?A(m,R,M,Z,I,F,Y,ee,te):le&6?S(m,R,M,Z,I,F,Y,ee,te):(le&64||le&128)&&X.process(m,R,M,Z,I,F,Y,ee,te,me)}be!=null&&I?ya(be,m&&m.ref,F,R||m,!R):be==null&&m&&m.ref!=null&&ya(m.ref,null,F,m,!0)},E=(m,R,M,Z)=>{if(m==null)n(R.el=r(R.children),M,Z);else{const I=R.el=m.el;R.children!==m.children&&c(I,R.children)}},N=(m,R,M,Z)=>{m==null?n(R.el=o(R.children||""),M,Z):R.el=m.el},y=(m,R,M,Z)=>{[m.el,m.anchor]=v(m.children,R,M,Z,m.el,m.anchor)},b=({el:m,anchor:R},M,Z)=>{let I;for(;m&&m!==R;)I=f(m),n(m,M,Z),m=I;n(R,M,Z)},_=({el:m,anchor:R})=>{let M;for(;m&&m!==R;)M=f(m),a(m),m=M;a(R)},A=(m,R,M,Z,I,F,Y,ee,te)=>{if(R.type==="svg"?Y="svg":R.type==="math"&&(Y="mathml"),m==null)D(R,M,Z,I,F,Y,ee,te);else{const X=m.el&&m.el._isVueCE?m.el:null;try{X&&X._beginPatch(),T(m,R,I,F,Y,ee,te)}finally{X&&X._endPatch()}}},D=(m,R,M,Z,I,F,Y,ee)=>{let te,X;const{props:be,shapeFlag:le,transition:ge,dirs:xe}=m;if(te=m.el=l(m.type,F,be&&be.is,be),le&8?d(te,m.children):le&16&&C(m.children,te,null,Z,I,Ir(m,F),Y,ee),xe&&Ls(m,null,Z,"created"),O(te,m,m.scopeId,Y,Z),be){for(const Ee in be)Ee!=="value"&&!Qs(Ee)&&i(te,Ee,null,be[Ee],F,Z);"value"in be&&i(te,"value",null,be.value,F),(X=be.onVnodeBeforeMount)&&Yt(X,Z,m)}xe&&Ls(m,null,Z,"beforeMount");const ke=cp(I,ge);ke&&ge.beforeEnter(te),n(te,R,M),((X=be&&be.onVnodeMounted)||ke||xe)&&vt(()=>{try{X&&Yt(X,Z,m),ke&&ge.enter(te),xe&&Ls(m,null,Z,"mounted")}finally{}},I)},O=(m,R,M,Z,I)=>{if(M&&p(m,M),Z)for(let F=0;F<Z.length;F++)p(m,Z[F]);if(I){let F=I.subTree;if(R===F||kl(F.type)&&(F.ssContent===R||F.ssFallback===R)){const Y=I.vnode;O(m,Y,Y.scopeId,Y.slotScopeIds,I.parent)}}},C=(m,R,M,Z,I,F,Y,ee,te=0)=>{for(let X=te;X<m.length;X++){const be=m[X]=ee?qs(m[X]):Xt(m[X]);g(null,be,R,M,Z,I,F,Y,ee)}},T=(m,R,M,Z,I,F,Y)=>{const ee=R.el=m.el;let{patchFlag:te,dynamicChildren:X,dirs:be}=R;te|=m.patchFlag&16;const le=m.props||Fe,ge=R.props||Fe;let xe;if(M&&Rn(M,!1),(xe=ge.onVnodeBeforeUpdate)&&Yt(xe,M,R,m),be&&Ls(R,m,M,"beforeUpdate"),M&&Rn(M,!0),(le.innerHTML&&ge.innerHTML==null||le.textContent&&ge.textContent==null)&&d(ee,""),X?L(m.dynamicChildren,X,ee,M,Z,Ir(R,I),F):Y||x(m,R,ee,null,M,Z,Ir(R,I),F,!1),te>0){if(te&16)B(ee,le,ge,M,I);else if(te&2&&le.class!==ge.class&&i(ee,"class",null,ge.class,I),te&4&&i(ee,"style",le.style,ge.style,I),te&8){const ke=R.dynamicProps;for(let Ee=0;Ee<ke.length;Ee++){const H=ke[Ee],re=le[H],ye=ge[H];(ye!==re||H==="value")&&i(ee,H,re,ye,I,M)}}te&1&&m.children!==R.children&&d(ee,R.children)}else!Y&&X==null&&B(ee,le,ge,M,I);((xe=ge.onVnodeUpdated)||be)&&vt(()=>{xe&&Yt(xe,M,R,m),be&&Ls(R,m,M,"updated")},Z)},L=(m,R,M,Z,I,F,Y)=>{for(let ee=0;ee<R.length;ee++){const te=m[ee],X=R[ee],be=te.el&&(te.type===At||!xs(te,X)||te.shapeFlag&198)?u(te.el):M;g(te,X,be,null,Z,I,F,Y,!0)}},B=(m,R,M,Z,I)=>{if(R!==M){if(R!==Fe)for(const F in R)!Qs(F)&&!(F in M)&&i(m,F,R[F],null,I,Z);for(const F in M){if(Qs(F))continue;const Y=M[F],ee=R[F];Y!==ee&&F!=="value"&&i(m,F,ee,Y,I,Z)}"value"in M&&i(m,"value",R.value,M.value,I)}},P=(m,R,M,Z,I,F,Y,ee,te)=>{const X=R.el=m?m.el:r(""),be=R.anchor=m?m.anchor:r("");let{patchFlag:le,dynamicChildren:ge,slotScopeIds:xe}=R;xe&&(ee=ee?ee.concat(xe):xe),m==null?(n(X,M,Z),n(be,M,Z),C(R.children||[],M,be,I,F,Y,ee,te)):le>0&&le&64&&ge&&m.dynamicChildren&&m.dynamicChildren.length===ge.length?(L(m.dynamicChildren,ge,M,I,F,Y,ee),(R.key!=null||I&&R===I.subTree)&&Xo(m,R,!0)):x(m,R,M,be,I,F,Y,ee,te)},S=(m,R,M,Z,I,F,Y,ee,te)=>{R.slotScopeIds=ee,m==null?R.shapeFlag&512?I.ctx.activate(R,M,Z,Y,te):$(R,M,Z,I,F,Y,te):G(m,R,te)},$=(m,R,M,Z,I,F,Y)=>{const ee=m.component=xp(m,Z,I);if(Di(m)&&(ee.ctx.renderer=me),kp(ee,!1,Y),ee.asyncDep){if(I&&I.registerDep(ee,q,Y),!m.el){const te=ee.subTree=lt(ht);N(null,te,R,M),m.placeholder=te.el}}else q(ee,m,R,M,I,F,Y)},G=(m,R,M)=>{const Z=R.component=m.component;if(ab(m,R,M))if(Z.asyncDep&&!Z.asyncResolved){k(Z,R,M);return}else Z.next=R,Z.update();else R.el=m.el,Z.vnode=R},q=(m,R,M,Z,I,F,Y)=>{const ee=()=>{if(m.isMounted){let{next:le,bu:ge,u:xe,parent:ke,vnode:Ee}=m;{const Ue=dp(m);if(Ue){le&&(le.el=Ee.el,k(m,le,Y)),Ue.asyncDep.then(()=>{vt(()=>{m.isUnmounted||X()},I)});return}}let H=le,re;Rn(m,!1),le?(le.el=Ee.el,k(m,le,Y)):le=Ee,ge&&va(ge),(re=le.props&&le.props.onVnodeBeforeUpdate)&&Yt(re,ke,le,Ee),Rn(m,!0);const ye=ll(m),Me=m.subTree;m.subTree=ye,g(Me,ye,u(Me.el),j(Me),m,I,F),le.el=ye.el,H===null&&lr(m,ye.el),xe&&vt(xe,I),(re=le.props&&le.props.onVnodeUpdated)&&vt(()=>Yt(re,ke,le,Ee),I)}else{let le;const{el:ge,props:xe}=R,{bm:ke,m:Ee,parent:H,root:re,type:ye}=m,Me=en(R);if(Rn(m,!1),ke&&va(ke),!Me&&(le=xe&&xe.onVnodeBeforeMount)&&Yt(le,H,R),Rn(m,!0),ge&&Le){const Ue=()=>{m.subTree=ll(m),Le(ge,m.subTree,m,I,null)};Me&&ye.__asyncHydrate?ye.__asyncHydrate(ge,m,Ue):Ue()}else{re.ce&&re.ce._hasShadowRoot()&&re.ce._injectChildStyle(ye,m.parent?m.parent.type:void 0);const Ue=m.subTree=ll(m);g(null,Ue,M,Z,m,I,F),R.el=Ue.el}if(Ee&&vt(Ee,I),!Me&&(le=xe&&xe.onVnodeMounted)){const Ue=R;vt(()=>Yt(le,H,Ue),I)}(R.shapeFlag&256||H&&en(H.vnode)&&H.vnode.shapeFlag&256)&&m.a&&vt(m.a,I),m.isMounted=!0,R=M=Z=null}};m.scope.on();const te=m.effect=new ui(ee);m.scope.off();const X=m.update=te.run.bind(te),be=m.job=te.runIfDirty.bind(te);be.i=m,be.id=m.uid,te.scheduler=()=>Ho(be),Rn(m,!0),X()},k=(m,R,M)=>{R.component=m;const Z=m.vnode.props;m.vnode=R,m.next=null,lb(m,R.props,Z,M),db(m,R.children,M),nn(),td(m),an()},x=(m,R,M,Z,I,F,Y,ee,te=!1)=>{const X=m&&m.children,be=m?m.shapeFlag:0,le=R.children,{patchFlag:ge,shapeFlag:xe}=R;if(ge>0){if(ge&128){de(X,le,M,Z,I,F,Y,ee,te);return}else if(ge&256){U(X,le,M,Z,I,F,Y,ee,te);return}}xe&8?(be&16&&Ie(X,I,F),le!==X&&d(M,le)):be&16?xe&16?de(X,le,M,Z,I,F,Y,ee,te):Ie(X,I,F,!0):(be&8&&d(M,""),xe&16&&C(le,M,Z,I,F,Y,ee,te))},U=(m,R,M,Z,I,F,Y,ee,te)=>{m=m||ha,R=R||ha;const X=m.length,be=R.length,le=Math.min(X,be);let ge;for(ge=0;ge<le;ge++){const xe=R[ge]=te?qs(R[ge]):Xt(R[ge]);g(m[ge],xe,M,null,I,F,Y,ee,te)}X>be?Ie(m,I,F,!0,!1,le):C(R,M,Z,I,F,Y,ee,te,le)},de=(m,R,M,Z,I,F,Y,ee,te)=>{let X=0;const be=R.length;let le=m.length-1,ge=be-1;for(;X<=le&&X<=ge;){const xe=m[X],ke=R[X]=te?qs(R[X]):Xt(R[X]);if(xs(xe,ke))g(xe,ke,M,null,I,F,Y,ee,te);else break;X++}for(;X<=le&&X<=ge;){const xe=m[le],ke=R[ge]=te?qs(R[ge]):Xt(R[ge]);if(xs(xe,ke))g(xe,ke,M,null,I,F,Y,ee,te);else break;le--,ge--}if(X>le){if(X<=ge){const xe=ge+1,ke=xe<be?R[xe].el:Z;for(;X<=ge;)g(null,R[X]=te?qs(R[X]):Xt(R[X]),M,ke,I,F,Y,ee,te),X++}}else if(X>ge)for(;X<=le;)se(m[X],I,F,!0),X++;else{const xe=X,ke=X,Ee=new Map;for(X=ke;X<=ge;X++){const Ye=R[X]=te?qs(R[X]):Xt(R[X]);Ye.key!=null&&Ee.set(Ye.key,X)}let H,re=0;const ye=ge-ke+1;let Me=!1,Ue=0;const Je=new Array(ye);for(X=0;X<ye;X++)Je[X]=0;for(X=xe;X<=le;X++){const Ye=m[X];if(re>=ye){se(Ye,I,F,!0);continue}let Ke;if(Ye.key!=null)Ke=Ee.get(Ye.key);else for(H=ke;H<=ge;H++)if(Je[H-ke]===0&&xs(Ye,R[H])){Ke=H;break}Ke===void 0?se(Ye,I,F,!0):(Je[Ke-ke]=X+1,Ke>=Ue?Ue=Ke:Me=!0,g(Ye,R[Ke],M,null,I,F,Y,ee,te),re++)}const ut=Me?ub(Je):ha;for(H=ut.length-1,X=ye-1;X>=0;X--){const Ye=ke+X,Ke=R[Ye],Wt=R[Ye+1],bs=Ye+1<be?Wt.el||up(Wt):Z;Je[X]===0?g(null,Ke,M,bs,I,F,Y,ee,te):Me&&(H<0||X!==ut[H]?ce(Ke,M,bs,2):H--)}}},ce=(m,R,M,Z,I=null)=>{const{el:F,type:Y,transition:ee,children:te,shapeFlag:X}=m;if(X&6){ce(m.component.subTree,R,M,Z);return}if(X&128){m.suspense.move(R,M,Z);return}if(X&64){Y.move(m,R,M,me);return}if(Y===At){n(F,R,M);for(let le=0;le<te.length;le++)ce(te[le],R,M,Z);n(m.anchor,R,M);return}if(Y===Un){b(m,R,M);return}if(Z!==2&&X&1&&ee)if(Z===0)ee.persisted&&!F[fs]?n(F,R,M):(ee.beforeEnter(F),n(F,R,M),vt(()=>ee.enter(F),I));else{const{leave:le,delayLeave:ge,afterLeave:xe}=ee,ke=()=>{m.ctx.isUnmounted?a(F):n(F,R,M)},Ee=()=>{const H=F._isLeaving||!!F[fs];F._isLeaving&&F[fs](!0),ee.persisted&&!H?ke():le(F,()=>{ke(),xe&&xe()})};ge?ge(F,ke,Ee):Ee()}else n(F,R,M)},se=(m,R,M,Z=!1,I=!1)=>{const{type:F,props:Y,ref:ee,children:te,dynamicChildren:X,shapeFlag:be,patchFlag:le,dirs:ge,cacheIndex:xe,memo:ke}=m;if(le===-2&&(I=!1),ee!=null&&(nn(),ya(ee,null,M,m,!0),an()),xe!=null&&(R.renderCache[xe]=void 0),be&256){R.ctx.deactivate(m);return}const Ee=be&1&&ge,H=!en(m);let re;if(H&&(re=Y&&Y.onVnodeBeforeUnmount)&&Yt(re,R,m),be&6)ue(m.component,M,Z);else{if(be&128){m.suspense.unmount(M,Z);return}Ee&&Ls(m,null,R,"beforeUnmount"),be&64?m.type.remove(m,R,M,me,Z):X&&!X.hasOnce&&(F!==At||le>0&&le&64)?Ie(X,R,M,!1,!0):(F===At&&le&384||!I&&be&16)&&Ie(te,R,M),Z&&fe(m)}const ye=ke!=null&&xe==null;(H&&(re=Y&&Y.onVnodeUnmounted)||Ee||ye)&&vt(()=>{re&&Yt(re,R,m),Ee&&Ls(m,null,R,"unmounted"),ye&&(m.el=null)},M)},fe=m=>{const{type:R,el:M,anchor:Z,transition:I}=m;if(R===At){Q(M,Z);return}if(R===Un){_(m);return}const F=()=>{a(M),I&&!I.persisted&&I.afterLeave&&I.afterLeave()};if(m.shapeFlag&1&&I&&!I.persisted){const{leave:Y,delayLeave:ee}=I,te=()=>Y(M,F);ee?ee(m.el,F,te):te()}else F()},Q=(m,R)=>{let M;for(;m!==R;)M=f(m),a(m),m=M;a(R)},ue=(m,R,M)=>{const{bum:Z,scope:I,job:F,subTree:Y,um:ee,m:te,a:X}=m;_l(te),_l(X),Z&&va(Z),I.stop(),F&&(F.flags|=8,se(Y,m,R,M)),ee&&vt(ee,R),vt(()=>{m.isUnmounted=!0},R)},Ie=(m,R,M,Z=!1,I=!1,F=0)=>{for(let Y=F;Y<m.length;Y++)se(m[Y],R,M,Z,I)},j=m=>{if(m.shapeFlag&6)return j(m.component.subTree);if(m.shapeFlag&128)return m.suspense.next();const R=f(m.anchor||m.el),M=R&&R[Of];return M?f(M):R};let oe=!1;const ie=(m,R,M)=>{let Z;m==null?R._vnode&&(se(R._vnode,null,null,!0),Z=R._vnode.component):g(R._vnode||null,m,R,null,null,null,M),R._vnode=m,oe||(oe=!0,td(Z),bl(),oe=!1)},me={p:g,um:se,m:ce,r:fe,mt:$,mc:C,pc:x,pbc:L,n:j,o:e};let pe,Le;return t&&([pe,Le]=t(me)),{render:ie,hydrate:pe,createApp:Yv(ie,pe)}}function Ir({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function cp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Xo(e,t,s=!1){const n=e.children,a=t.children;if(he(n)&&he(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=qs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Xo(l,r)),r.type===_n&&(r.patchFlag===-1&&(r=a[i]=qs(r)),r.el=l.el),r.type===ht&&!r.el&&(r.el=l.el)}}function ub(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function dp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:dp(t)}function _l(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function up(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?up(t.subTree):null}const kl=e=>e.__isSuspense;let lo=0;const fb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)hb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}gb(e,t,s,n,a,l,r,o,c)}},hydrate:mb,normalize:vb},pb=fb;function bi(e,t){const s=e.props&&e.props[t];we(s)&&s()}function hb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),f=e.suspense=fp(e,a,n,t,u,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,u,null,n,f,i,l),f.deps>0?(bi(e,"onPending"),bi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),xa(f,e.ssFallback)):f.resolve(!1,!0)}function gb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:v,pendingBranch:g,isInFallback:E,isHydrating:N}=u;if(g)u.pendingBranch=f,xs(g,f)?(o(g,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():E&&(N||(o(v,p,s,n,a,null,i,l,r),xa(u,p)))):(u.pendingId=lo++,N?(u.isHydrating=!1,u.activeBranch=g):c(g,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(v,p,s,n,a,null,i,l,r),xa(u,p))):v&&xs(v,f)?(o(v,f,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(v&&xs(v,f))o(v,f,s,n,a,u,i,l,r),xa(u,f);else if(bi(t,"onPending"),u.pendingBranch=f,f.shapeFlag&512?u.pendingId=f.component.suspenseId:u.pendingId=lo++,o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:b}=u;y>0?setTimeout(()=>{u.pendingId===b&&u.fallback(p)},y):y===0&&u.fallback(p)}}function fp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:f,um:p,n:v,o:{parentNode:g,remove:E}}=c;let N;const y=bb(e);y&&t&&t.pendingBranch&&(N=t.pendingId,t.deps++);const b=e.props?pl(e.props.timeout):void 0,_=i,A={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:lo++,timeout:typeof b=="number"?b:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(D=!1,O=!1){const{vnode:C,activeBranch:T,pendingBranch:L,pendingId:B,effects:P,parentComponent:S,container:$,isInFallback:G}=A;let q=!1;if(A.isHydrating)A.isHydrating=!1;else if(!D){q=T&&L.transition&&L.transition.mode==="out-in";let U=!1;q&&(T.transition.afterLeave=()=>{B===A.pendingId&&(f(L,$,i===_&&!U?v(T):i,0),hi(P),G&&C.ssFallback&&(C.ssFallback.el=null))}),T&&!A.isFallbackMountPending&&(g(T.el)===$&&(i=v(T),U=!0),p(T,S,A,!0),!q&&G&&C.ssFallback&&vt(()=>C.ssFallback.el=null,A)),q||f(L,$,i,0)}A.isFallbackMountPending=!1,xa(A,L),A.pendingBranch=null,A.isInFallback=!1;let k=A.parent,x=!1;for(;k;){if(k.pendingBranch){k.effects.push(...P),x=!0;break}k=k.parent}!x&&!q&&hi(P),A.effects=[],y&&t&&t.pendingBranch&&N===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),bi(C,"onResolve")},fallback(D){if(!A.pendingBranch)return;const{vnode:O,activeBranch:C,parentComponent:T,container:L,namespace:B}=A;bi(O,"onFallback");const P=v(C),S=()=>{A.isFallbackMountPending=!1,A.isInFallback&&(u(null,D,L,P,T,null,B,r,o),xa(A,D))},$=D.transition&&D.transition.mode==="out-in";$&&(A.isFallbackMountPending=!0,C.transition.afterLeave=S),A.isInFallback=!0,p(C,T,null,!0),$||S()},move(D,O,C){A.activeBranch&&f(A.activeBranch,D,O,C),A.container=D},next(){return A.activeBranch&&v(A.activeBranch)},registerDep(D,O,C){const T=!!A.pendingBranch;T&&A.deps++;const L=D.vnode.el;D.asyncDep.catch(B=>{Jn(B,D,0)}).then(B=>{if(D.isUnmounted||A.isUnmounted||A.pendingId!==D.suspenseId)return;_i(),D.asyncResolved=!0;const{vnode:P}=D;ro(D,B,!1),L&&(P.el=L);const S=!L&&D.subTree.el;O(D,P,g(L||D.subTree.el),L?null:v(D.subTree),A,l,C),S&&(P.placeholder=null,E(S)),lr(D,P.el),T&&--A.deps===0&&A.resolve()})},unmount(D,O){A.isUnmounted=!0,A.activeBranch&&p(A.activeBranch,s,D,O),A.pendingBranch&&p(A.pendingBranch,s,D,O)}};return A}function mb(e,t,s,n,a,i,l,r,o){const c=t.suspense=fp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function vb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=gd(n?s.default:s),e.ssFallback=n?gd(s.fallback):lt(ht)}function gd(e){let t;if(we(e)){const s=jn&&e._c;s&&(e._d=!1,yi()),e=e(),s&&(e._d=!0,t=$t,hp())}return he(e)&&(e=tb(e)),e=Xt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function pp(e,t){t&&t.pendingBranch?he(e)?t.effects.push(...e):t.effects.push(e):hi(e)}function xa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,lr(n,a))}function bb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const At=Symbol.for("v-fgt"),_n=Symbol.for("v-txt"),ht=Symbol.for("v-cmt"),Un=Symbol.for("v-stc"),ii=[];let $t=null;function yi(e=!1){ii.push($t=e?null:[])}function hp(){ii.pop(),$t=ii[ii.length-1]||null}let jn=1;function xi(e,t=!1){jn+=e,e<0&&$t&&t&&($t.hasOnce=!0)}function gp(e){return e.dynamicChildren=jn>0?$t||ha:null,hp(),jn>0&&$t&&$t.push(e),e}function yb(e,t,s,n,a,i){return gp(ec(e,t,s,n,a,i,!0))}function wl(e,t,s,n,a){return gp(lt(e,t,s,n,a,!0))}function rn(e){return e?e.__v_isVNode===!0:!1}function xs(e,t){return e.type===t.type&&e.key===t.key}function xb(e){}const mp=({key:e})=>e??null,rl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ae(e)||yt(e)||we(e)?{i:Lt,r:e,k:t,f:!!s}:e:null);function ec(e,t=null,s=null,n=0,a=null,i=e===At?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&mp(t),ref:t&&rl(t),scopeId:er,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Lt};return r?(sc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Ae(s)?8:16),jn>0&&!l&&$t&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&$t.push(o),o}const lt=_b;function _b(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===qf)&&(e=ht),rn(e)){const r=Ps(e,t,!0);return s&&sc(r,s),jn>0&&!i&&$t&&(r.shapeFlag&6?$t[$t.indexOf(e)]=r:$t.push(r)),r.patchFlag=-2,r}if(Ab(e)&&(e=e.__vccOpts),t){t=vp(t);let{class:r,style:o}=t;r&&!Ae(r)&&(t.class=Ii(r)),je(o)&&(Ni(o)&&!he(o)&&(o=Pe({},o)),t.style=Ri(o))}const l=Ae(e)?1:kl(e)?128:Df(e)?64:je(e)?4:we(e)?2:0;return ec(e,t,s,n,a,l,i,!0)}function vp(e){return e?Ni(e)||ep(e)?Pe({},e):e:null}function Ps(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?yp(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&mp(c),ref:t&&t.ref?s&&i?he(i)?i.concat(rl(t)):[i,rl(t)]:rl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==At?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ps(e.ssContent),ssFallback:e.ssFallback&&Ps(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&ln(d,o.clone(d)),d}function tc(e=" ",t=0){return lt(_n,null,e,t)}function kb(e,t){const s=lt(Un,null,e);return s.staticCount=t,s}function bp(e="",t=!1){return t?(yi(),wl(ht,null,e)):lt(ht,null,e)}function Xt(e){return e==null||typeof e=="boolean"?lt(ht):he(e)?lt(At,null,e.slice()):rn(e)?qs(e):lt(_n,null,String(e))}function qs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ps(e)}function sc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(he(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),sc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!ep(t)?t._ctx=Lt:a===3&&Lt&&(Lt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else we(t)?(t={default:t,_ctx:Lt},s=32):(t=String(t),n&64?(s=16,t=[tc(t)]):s=8);e.children=t,e.shapeFlag|=s}function yp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Ii([t.class,n.class]));else if(a==="style")t.style=Ri([t.style,n.style]);else if(Gn(a)){const i=t[a],l=n[a];l&&i!==l&&!(he(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!jl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Yt(e,t,s,n=null){rs(e,t,7,[s,n])}const wb=Wf();let Sb=0;function xp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||wb,i={uid:Sb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Do(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:sp(n,a),emitsOptions:Jf(n,a),emit:null,emitted:null,propsDefaults:Fe,inheritAttrs:n.inheritAttrs,ctx:Fe,data:Fe,props:Fe,attrs:Fe,slots:Fe,refs:Fe,setupState:Fe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Xv.bind(null,i),e.ce&&e.ce(i),i}let Nt=null;const Kt=()=>Nt||Lt;let Sl,_a;{const e=Wl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Sl=t("__VUE_INSTANCE_SETTERS__",s=>Nt=s),_a=t("__VUE_SSR_SETTERS__",s=>zn=s)}const Fa=e=>{const t=Nt;return Sl(e),e.scope.on(),()=>{e.scope.off(),Sl(t)}},_i=()=>{Nt&&Nt.scope.off(),Sl(null)};function _p(e){return e.vnode.shapeFlag&4}let zn=!1;function kp(e,t=!1,s=!1){t&&_a(t);const{props:n,children:a}=e.vnode,i=_p(e);ib(e,n,i,t),cb(e,a,s||t);const l=i?Tb(e,t):void 0;return t&&_a(!1),l}function Tb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,so);const{setup:n}=s;if(n){nn();const a=e.setupContext=n.length>1?Tp(e):null,i=Fa(e),l=Pa(n,e,0,[e.props,a]),r=Oo(l);if(an(),i(),(r||e.sp)&&!en(e)&&qo(e),r){if(l.then(_i,_i),t)return l.then(o=>{ro(e,o,t)}).catch(o=>{Jn(o,e,0)});e.asyncDep=l}else ro(e,l,t)}else Sp(e,t)}function ro(e,t,s){we(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:je(t)&&(e.setupState=Bo(t)),Sp(e,s)}let Tl,oo;function wp(e){Tl=e,oo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Nv))}}const Cb=()=>!Tl;function Sp(e,t,s){const n=e.type;if(!e.render){if(!t&&Tl&&!n.render){const a=n.template||Jo(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Pe(Pe({isCustomElement:i,delimiters:r},l),o);n.render=Tl(a,c)}}e.render=n.render||Ot,oo&&oo(e)}{const a=Fa(e);nn();try{qv(e)}finally{an(),a()}}}const Eb={get(e,t){return Ft(e,"get",""),e[t]}};function Tp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Eb),slots:e.slots,emit:e.emit,expose:t}}function Fi(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Bo(yf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ai)return ai[s](e)},has(t,s){return s in t||s in ai}})):e.proxy}function co(e,t=!0){return we(e)?e.displayName||e.name:e.name||t&&e.__name}function Ab(e){return we(e)&&"__vccOpts"in e}const J=(e,t)=>Dm(e,t,zn);function Ta(e,t,s){try{xi(-1);const n=arguments.length;return n===2?je(t)&&!he(t)?rn(t)?lt(e,null,[t]):lt(e,t):lt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&rn(s)&&(s=[s]),lt(e,t,s))}finally{xi(1)}}function Rb(){}function Ib(e,t,s,n){const a=s[n];if(a&&Cp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Cp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Et(s[n],t[n]))return!1;return jn>0&&$t&&$t.push(e),!0}const Ep="3.5.38",Nb=Ot,Lb=jm,Ob=ca,Db=Af,Mb={createComponentInstance:xp,setupComponent:kp,renderComponentRoot:ll,setCurrentRenderingInstance:mi,isVNode:rn,normalizeVNode:Xt,getComponentPublicInstance:Fi,ensureValidVNode:Zo,pushWarningContext:Um,popWarningContext:Bm},Pb=Mb,Fb=null,$b=null,Ub=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let uo;const md=typeof window<"u"&&window.trustedTypes;if(md)try{uo=md.createPolicy("vue",{createHTML:e=>e})}catch{}const Ap=uo?e=>uo.createHTML(e):e=>e,Bb="http://www.w3.org/2000/svg",Hb="http://www.w3.org/1998/Math/MathML",zs=typeof document<"u"?document:null,vd=zs&&zs.createElement("template"),Rp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?zs.createElementNS(Bb,e):t==="mathml"?zs.createElementNS(Hb,e):s?zs.createElement(e,{is:s}):zs.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>zs.createTextNode(e),createComment:e=>zs.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>zs.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{vd.innerHTML=Ap(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=vd.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},fn="transition",ja="animation",Ca=Symbol("_vtc"),Ip={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Np=Pe({},zo,Ip),Vb=e=>(e.displayName="Transition",e.props=Np,e),jb=Vb((e,{slots:t})=>Ta(Ff,Lp(e),t)),In=(e,t=[])=>{he(e)?e.forEach(s=>s(...t)):e&&e(...t)},bd=e=>e?he(e)?e.some(t=>t.length>1):e.length>1:!1;function Lp(e){const t={};for(const P in e)P in Ip||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,v=zb(a),g=v&&v[0],E=v&&v[1],{onBeforeEnter:N,onEnter:y,onEnterCancelled:b,onLeave:_,onLeaveCancelled:A,onBeforeAppear:D=N,onAppear:O=y,onAppearCancelled:C=b}=t,T=(P,S,$,G)=>{P._enterCancelled=G,mn(P,S?d:r),mn(P,S?c:l),$&&$()},L=(P,S)=>{P._isLeaving=!1,mn(P,u),mn(P,p),mn(P,f),S&&S()},B=P=>(S,$)=>{const G=P?O:y,q=()=>T(S,P,$);In(G,[S,q]),yd(()=>{mn(S,P?o:i),As(S,P?d:r),bd(G)||xd(S,n,g,q)})};return Pe(t,{onBeforeEnter(P){In(N,[P]),As(P,i),As(P,l)},onBeforeAppear(P){In(D,[P]),As(P,o),As(P,c)},onEnter:B(!1),onAppear:B(!0),onLeave(P,S){P._isLeaving=!0;const $=()=>L(P,S);As(P,u),P._enterCancelled?(As(P,f),fo(P)):(fo(P),As(P,f)),yd(()=>{P._isLeaving&&(mn(P,u),As(P,p),bd(_)||xd(P,n,E,$))}),In(_,[P,$])},onEnterCancelled(P){T(P,!1,void 0,!0),In(b,[P])},onAppearCancelled(P){T(P,!0,void 0,!0),In(C,[P])},onLeaveCancelled(P){L(P),In(A,[P])}})}function zb(e){if(e==null)return null;if(je(e))return[Nr(e.enter),Nr(e.leave)];{const t=Nr(e);return[t,t]}}function Nr(e){return pl(e)}function As(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ca]||(e[Ca]=new Set)).add(t)}function mn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ca];s&&(s.delete(t),s.size||(e[Ca]=void 0))}function yd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let qb=0;function xd(e,t,s,n){const a=e._endId=++qb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Op(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,f)}function Op(e,t){const s=window.getComputedStyle(e),n=v=>(s[v]||"").split(", "),a=n(`${fn}Delay`),i=n(`${fn}Duration`),l=_d(a,i),r=n(`${ja}Delay`),o=n(`${ja}Duration`),c=_d(r,o);let d=null,u=0,f=0;t===fn?l>0&&(d=fn,u=l,f=i.length):t===ja?c>0&&(d=ja,u=c,f=o.length):(u=Math.max(l,c),d=u>0?l>c?fn:ja:null,f=d?d===fn?i.length:o.length:0);const p=d===fn&&/\b(?:transform|all)(?:,|$)/.test(n(`${fn}Property`).toString());return{type:d,timeout:u,propCount:f,hasTransform:p}}function _d(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>kd(s)+kd(e[n])))}function kd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function fo(e){return(e?e.ownerDocument:document).body.offsetHeight}function Kb(e,t,s){const n=e[Ca];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Cl=Symbol("_vod"),nc=Symbol("_vsh"),Dp={name:"show",beforeMount(e,{value:t},{transition:s}){e[Cl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):za(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),za(e,!0),n.enter(e)):n.leave(e,()=>{za(e,!1)}):za(e,t))},beforeUnmount(e,{value:t}){za(e,t)}};function za(e,t){e.style.display=t?e[Cl]:"none",e[nc]=!t}function Gb(){Dp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Mp=Symbol("");function Wb(e){const t=Kt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>El(i,a))},n=()=>{const a=e(t.proxy);t.ce?El(t.ce,a):po(t.subTree,a),s(a)};Ko(()=>{hi(n)}),He(()=>{ls(n,Ot,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),gt(()=>a.disconnect())})}function po(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{po(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)El(e.el,t);else if(e.type===At)e.children.forEach(s=>po(s,t));else if(e.type===Un){let{el:s,anchor:n}=e;for(;s&&(El(s,t),s!==n);)s=s.nextSibling}}function El(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=em(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Mp]=n}}const Zb=/(?:^|;)\s*display\s*:/;function Jb(e,t,s){const n=e.style,a=Ae(s);let i=!1;if(s&&!a){if(t)if(Ae(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Xa(n,r,"")}else for(const l in t)s[l]==null&&Xa(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Qb(e,l,!Ae(t)&&t?t[l]:void 0,r)||Xa(n,l,r):Xa(n,l,"")}}else if(a){if(t!==s){const l=n[Mp];l&&(s+=";"+l),n.cssText=s,i=Zb.test(s)}}else t&&e.removeAttribute("style");Cl in e&&(e[Cl]=i?n.display:"",e[nc]&&(n.display="none"))}const wd=/\s*!important$/;function Xa(e,t,s){if(he(s))s.forEach(n=>Xa(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Yb(e,t);wd.test(s)?e.setProperty(es(n),s.replace(wd,""),"important"):e[n]=s}}const Sd=["Webkit","Moz","ms"],Lr={};function Yb(e,t){const s=Lr[t];if(s)return s;let n=Qe(t);if(n!=="filter"&&n in e)return Lr[t]=n;n=Zn(n);for(let a=0;a<Sd.length;a++){const i=Sd[a]+n;if(i in e)return Lr[t]=i}return t}function Qb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ae(n)&&s===n}const Td="http://www.w3.org/1999/xlink";function Cd(e,t,s,n,a,i=Qg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Td,t.slice(6,t.length)):e.setAttributeNS(Td,t,s):s==null||i&&!Qu(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Bt(s)?String(s):s)}function Ed(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ap(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Qu(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Zs(e,t,s,n){e.addEventListener(t,s,n)}function Xb(e,t,s,n){e.removeEventListener(t,s,n)}const Ad=Symbol("_vei");function ey(e,t,s,n,a=null){const i=e[Ad]||(e[Ad]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=ty(t);if(n){const c=i[t]=ay(n,a);Zs(e,r,c,o)}else l&&(Xb(e,r,l,o),i[t]=void 0)}}const Rd=/(?:Once|Passive|Capture)$/;function ty(e){let t;if(Rd.test(e)){t={};let n;for(;n=e.match(Rd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):es(e.slice(2)),t]}let Or=0;const sy=Promise.resolve(),ny=()=>Or||(sy.then(()=>Or=0),Or=Date.now());function ay(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(he(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&rs(c,t,5,r)}}else rs(a,t,5,[n])};return s.value=e,s.attached=ny(),s}const Id=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Pp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Kb(e,n,l):t==="style"?Jb(e,s,n):Gn(t)?jl(t)||ey(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):iy(e,t,n,l))?(Ed(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Cd(e,t,n,l,i,t!=="value")):e._isVueCE&&(ly(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ae(n)))?Ed(e,Qe(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Cd(e,t,n,l))};function iy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Id(t)&&we(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Id(t)&&Ae(s)?!1:t in e}function ly(e,t){const s=e._def.props;if(!s)return!1;const n=Qe(t);return Array.isArray(s)?s.some(a=>Qe(a)===n):Object.keys(s).some(a=>Qe(a)===n)}const Nd={};function Fp(e,t,s){let n=Oi(e,t);zl(n)&&(n=Pe({},n,t));class a extends rr{constructor(l){super(n,l,s)}}return a.def=n,a}const ry=((e,t)=>Fp(e,t,Jp)),oy=typeof HTMLElement<"u"?HTMLElement:class{};class rr extends oy{constructor(t,s={},n=Il){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Il?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Pe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof rr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,St(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!he(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=pl(this._props[o])),(r||(r=Object.create(null)))[Qe(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)ze(this,n)||Object.defineProperty(this,n,{get:()=>Ds(s[n])})}_resolveProps(t){const{props:s}=t,n=he(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Qe))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Nd;const a=Qe(t);s&&this._numberProps&&this._numberProps[a]&&(n=pl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Nd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(es(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(es(t),s+""):s||this.removeAttribute(es(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Zp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=lt(this._def,Pe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,zl(l[0])?Pe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),es(i)!==i&&a(es(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function $p(e){const t=Kt(),s=t&&t.ce;return s||null}function cy(){const e=$p();return e&&e.shadowRoot}function dy(e="$style"){{const t=Kt();if(!t)return Fe;const s=t.type.__cssModules;if(!s)return Fe;const n=s[e];return n||Fe}}const Up=new WeakMap,Bp=new WeakMap,Al=Symbol("_moveCb"),Ld=Symbol("_enterCb"),uy=e=>(delete e.props.mode,e),fy=uy({name:"TransitionGroup",props:Pe({},Np,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Kt(),n=jo();let a,i;return nr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!vy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(hy),a.forEach(gy);const r=a.filter(my);fo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;As(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Al]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Al]=null,mn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Be(e),r=Lp(l);let o=l.tag||At;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[nc]&&(a.push(d),ln(d,Sa(d,r,n,s)),Up.set(d,Hp(d.el)))}i=t.default?tr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&ln(d,Sa(d,r,n,s))}return lt(o,null,i)}}}),py=fy;function hy(e){const t=e.el;t[Al]&&t[Al](),t[Ld]&&t[Ld]()}function gy(e){Bp.set(e,Hp(e.el))}function my(e){const t=Up.get(e),s=Bp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Hp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function vy(e,t,s){const n=e.cloneNode(),a=e[Ca];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Op(n);return i.removeChild(n),l}const wn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return he(t)?s=>va(t,s):t};function by(e){e.target.composing=!0}function Od(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const ms=Symbol("_assign");function Dd(e,t,s){return t&&(e=e.trim()),s&&(e=Gl(e)),e}const Rl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[ms]=wn(a);const i=n||a.props&&a.props.type==="number";Zs(e,t?"change":"input",l=>{l.target.composing||e[ms](Dd(e.value,s,i))}),(s||i)&&Zs(e,"change",()=>{e.value=Dd(e.value,s,i)}),t||(Zs(e,"compositionstart",by),Zs(e,"compositionend",Od),Zs(e,"change",Od))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[ms]=wn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Gl(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},ac={deep:!0,created(e,t,s){e[ms]=wn(s),Zs(e,"change",()=>{const n=e._modelValue,a=Ea(e),i=e.checked,l=e[ms];if(he(n)){const r=Zl(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Wn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(jp(e,i))})},mounted:Md,beforeUpdate(e,t,s){e[ms]=wn(s),Md(e,t,s)}};function Md(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(he(t))a=Zl(t,n.props.value)>-1;else if(Wn(t))a=t.has(n.props.value);else{if(t===s)return;a=sn(t,jp(e,!0))}e.checked!==a&&(e.checked=a)}const ic={created(e,{value:t},s){e.checked=sn(t,s.props.value),e[ms]=wn(s),Zs(e,"change",()=>{e[ms](Ea(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[ms]=wn(n),t!==s&&(e.checked=sn(t,n.props.value))}},Vp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Wn(t);Zs(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Gl(Ea(l)):Ea(l));e[ms](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,St(()=>{e._assigning=!1})}),e[ms]=wn(n)},mounted(e,{value:t}){Pd(e,t)},beforeUpdate(e,t,s){e[ms]=wn(s)},updated(e,{value:t}){e._assigning||Pd(e,t)}};function Pd(e,t){const s=e.multiple,n=he(t);if(!(s&&!n&&!Wn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ea(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=Zl(t,r)>-1}else l.selected=t.has(r);else if(sn(Ea(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ea(e){return"_value"in e?e._value:e.value}function jp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const zp={created(e,t,s){Xi(e,t,s,null,"created")},mounted(e,t,s){Xi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Xi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Xi(e,t,s,n,"updated")}};function qp(e,t){switch(e){case"SELECT":return Vp;case"TEXTAREA":return Rl;default:switch(t){case"checkbox":return ac;case"radio":return ic;default:return Rl}}}function Xi(e,t,s,n,a){const l=qp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function yy(){Rl.getSSRProps=({value:e})=>({value:e}),ic.getSSRProps=({value:e},t)=>{if(t.props&&sn(t.props.value,e))return{checked:!0}},ac.getSSRProps=({value:e},t)=>{if(he(e)){if(t.props&&Zl(e,t.props.value)>-1)return{checked:!0}}else if(Wn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},zp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=qp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const xy=["ctrl","shift","alt","meta"],_y={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>xy.some(s=>e[`${s}Key`]&&!t.includes(s))},ky=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=_y[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},wy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Sy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=es(a.key);if(t.some(l=>l===i||wy[l]===i))return e(a)}))},Kp=Pe({patchProp:Pp},Rp);let li,Fd=!1;function Gp(){return li||(li=lp(Kp))}function Wp(){return li=Fd?li:rp(Kp),Fd=!0,li}const Zp=((...e)=>{Gp().render(...e)}),Ty=((...e)=>{Wp().hydrate(...e)}),Il=((...e)=>{const t=Gp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Qp(n);if(!a)return;const i=t._component;!we(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Yp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Jp=((...e)=>{const t=Wp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Qp(n);if(a)return s(a,!0,Yp(a))},t});function Yp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Qp(e){return Ae(e)?document.querySelector(e):e}let $d=!1;const Cy=()=>{$d||($d=!0,yy(),Gb())},Ey=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Ff,BaseTransitionPropsValidators:zo,Comment:ht,DeprecationTypes:Ub,EffectScope:Do,ErrorCodes:Vm,ErrorTypeStrings:Lb,Fragment:At,KeepAlive:_v,ReactiveEffect:ui,Static:Un,Suspense:pb,Teleport:nv,Text:_n,TrackOpTypes:Mm,Transition:jb,TransitionGroup:py,TriggerOpTypes:Pm,VueElement:rr,assertNumber:Hm,callWithAsyncErrorHandling:rs,callWithErrorHandling:Pa,camelize:Qe,capitalize:Zn,cloneVNode:Ps,compatUtils:$b,computed:J,createApp:Il,createBlock:wl,createCommentVNode:bp,createElementBlock:yb,createElementVNode:ec,createHydrationRenderer:rp,createPropsRestProxy:jv,createRenderer:lp,createSSRApp:Jp,createSlots:Av,createStaticVNode:kb,createTextVNode:tc,createVNode:lt,customRef:_f,defineAsyncComponent:yv,defineComponent:Oi,defineCustomElement:Fp,defineEmits:Ov,defineExpose:Dv,defineModel:Fv,defineOptions:Mv,defineProps:Lv,defineSSRCustomElement:ry,defineSlots:Pv,devtools:Ob,effect:am,effectScope:tm,getCurrentInstance:Kt,getCurrentScope:sf,getCurrentWatcher:Fm,getTransitionRawChildren:tr,guardReactiveProps:vp,h:Ta,handleError:Jn,hasInjectionContext:Jm,hydrate:Ty,hydrateOnIdle:pv,hydrateOnInteraction:vv,hydrateOnMediaQuery:mv,hydrateOnVisible:gv,initCustomFormatter:Rb,initDirectivesForSSR:Cy,inject:gs,isMemoSame:Cp,isProxy:Ni,isReactive:Xs,isReadonly:Ms,isRef:yt,isRuntimeOnly:Cb,isShallow:ss,isVNode:rn,markRaw:yf,mergeDefaults:Hv,mergeModels:Vv,mergeProps:yp,nextTick:St,nodeOps:Rp,normalizeClass:Ii,normalizeProps:Vg,normalizeStyle:Ri,onActivated:Mi,onBeforeMount:Bf,onBeforeUnmount:ar,onBeforeUpdate:Ko,onDeactivated:Pi,onErrorCaptured:zf,onMounted:He,onRenderTracked:jf,onRenderTriggered:Vf,onScopeDispose:sm,onServerPrefetch:Hf,onUnmounted:gt,onUpdated:nr,onWatcherCleanup:wf,openBlock:yi,patchProp:Pp,popScopeId:Gm,provide:ni,proxyRefs:Bo,pushScopeId:Km,queuePostFlushCb:hi,reactive:Sn,readonly:gl,ref:h,registerRuntimeCompiler:wp,render:Zp,renderList:Ev,renderSlot:Rv,resolveComponent:Sv,resolveDirective:Cv,resolveDynamicComponent:Tv,resolveFilter:Fb,resolveTransitionHooks:Sa,setBlockTracking:xi,setDevtoolsHook:Db,setTransitionHooks:ln,shallowReactive:$o,shallowReadonly:wm,shallowRef:Uo,ssrContextKey:Rf,ssrUtils:Pb,stop:im,toDisplayString:ef,toHandlerKey:ma,toHandlers:Iv,toRaw:Be,toRef:Lm,toRefs:Rm,toValue:Cm,transformVNodeArgs:xb,triggerRef:Tm,unref:Ds,useAttrs:Bv,useCssModule:dy,useCssVars:Wb,useHost:$p,useId:iv,useModel:Qv,useSSRContext:If,useShadowRoot:cy,useSlots:Uv,useTemplateRef:lv,useTransitionState:jo,vModelCheckbox:ac,vModelDynamic:zp,vModelRadio:ic,vModelSelect:Vp,vModelText:Rl,vShow:Dp,version:Ep,warn:Nb,watch:ls,watchEffect:Ym,watchPostEffect:Qm,watchSyncEffect:Nf,withAsyncContext:zv,withCtx:Vo,withDefaults:$v,withDirectives:Zm,withKeys:Sy,withMemo:Ib,withModifiers:ky,withScopeId:Wm},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ki=Symbol(""),ri=Symbol(""),lc=Symbol(""),Nl=Symbol(""),Xp=Symbol(""),qn=Symbol(""),eh=Symbol(""),th=Symbol(""),rc=Symbol(""),oc=Symbol(""),$i=Symbol(""),cc=Symbol(""),sh=Symbol(""),dc=Symbol(""),uc=Symbol(""),fc=Symbol(""),pc=Symbol(""),hc=Symbol(""),gc=Symbol(""),nh=Symbol(""),ah=Symbol(""),or=Symbol(""),Ll=Symbol(""),mc=Symbol(""),vc=Symbol(""),wi=Symbol(""),Ui=Symbol(""),bc=Symbol(""),ho=Symbol(""),Ay=Symbol(""),go=Symbol(""),Ol=Symbol(""),Ry=Symbol(""),Iy=Symbol(""),yc=Symbol(""),Ny=Symbol(""),Ly=Symbol(""),xc=Symbol(""),ih=Symbol(""),Aa={[ki]:"Fragment",[ri]:"Teleport",[lc]:"Suspense",[Nl]:"KeepAlive",[Xp]:"BaseTransition",[qn]:"openBlock",[eh]:"createBlock",[th]:"createElementBlock",[rc]:"createVNode",[oc]:"createElementVNode",[$i]:"createCommentVNode",[cc]:"createTextVNode",[sh]:"createStaticVNode",[dc]:"resolveComponent",[uc]:"resolveDynamicComponent",[fc]:"resolveDirective",[pc]:"resolveFilter",[hc]:"withDirectives",[gc]:"renderList",[nh]:"renderSlot",[ah]:"createSlots",[or]:"toDisplayString",[Ll]:"mergeProps",[mc]:"normalizeClass",[vc]:"normalizeStyle",[wi]:"normalizeProps",[Ui]:"guardReactiveProps",[bc]:"toHandlers",[ho]:"camelize",[Ay]:"capitalize",[go]:"toHandlerKey",[Ol]:"setBlockTracking",[Ry]:"pushScopeId",[Iy]:"popScopeId",[yc]:"withCtx",[Ny]:"unref",[Ly]:"isRef",[xc]:"withMemo",[ih]:"isMemoSame"};function Oy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Aa[t]=e[t]})}const ds={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Dy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:ds}}function Si(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=ds){return e&&(r?(e.helper(qn),e.helper(Na(e.inSSR,c))):e.helper(Ia(e.inSSR,c)),l&&e.helper(hc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function Bn(e,t=ds){return{type:17,loc:t,elements:e}}function hs(e,t=ds){return{type:15,loc:t,properties:e}}function bt(e,t){return{type:16,loc:ds,key:Ae(e)?Ne(e,!0):e,value:t}}function Ne(e,t=!1,s=ds,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function ks(e,t=ds){return{type:8,loc:t,children:e}}function Tt(e,t=[],s=ds){return{type:14,loc:s,callee:e,arguments:t}}function Ra(e,t=void 0,s=!1,n=!1,a=ds){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function mo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:ds}}function My(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:ds}}function Py(e){return{type:21,body:e,loc:ds}}function Ia(e,t){return e||t?rc:oc}function Na(e,t){return e||t?eh:th}function _c(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Ia(n,e.isComponent)),t(qn),t(Na(n,e.isComponent)))}const Ud=new Uint8Array([123,123]),Bd=new Uint8Array([125,125]);function Hd(e){return e>=97&&e<=122||e>=65&&e<=90}function as(e){return e===32||e===10||e===9||e===12||e===13}function pn(e){return e===47||e===62||as(e)}function Dl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Dt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Fy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Ud,this.delimiterClose=Bd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Ud,this.delimiterClose=Bd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?pn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||as(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Dt.TitleEnd||this.currentSequence===Dt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Dt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Dt.Cdata.length&&(this.state=28,this.currentSequence=Dt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Hd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){pn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(pn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Dl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){as(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Hd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||as(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):as(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):as(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||pn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||pn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||pn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||pn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||pn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):as(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):as(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){as(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Dt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Dt.ScriptEnd[3]?this.startSpecial(Dt.ScriptEnd,4):t===Dt.StyleEnd[3]?this.startSpecial(Dt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Dt.TitleEnd[3]?this.startSpecial(Dt.TitleEnd,4):t===Dt.TextareaEnd[3]?this.startSpecial(Dt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Vd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Hn(e,t){const s=Vd("MODE",t),n=Vd(e,t);return s===3?n===!0:n!==!1}function Ti(e,t,s,...n){return Hn(e,t)}function kc(e){throw e}function lh(e){}function at(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ts=e=>e.type===4&&e.isStatic;function rh(e){switch(e){case"Teleport":case"teleport":return ri;case"Suspense":case"suspense":return lc;case"KeepAlive":case"keep-alive":return Nl;case"BaseTransition":case"base-transition":return Xp}}const $y=/^$|^\d|[^\$\w\xA0-\uFFFF]/,wc=e=>!$y.test(e),oh=/[A-Za-z_$\xA0-\uFFFF]/,Uy=/[\.\?\w$\xA0-\uFFFF]/,By=/\s+[.[]\s*|\s*[.[]\s+/g,ch=e=>e.type===4?e.content:e.loc.source,Hy=e=>{const t=ch(e).trim().replace(By,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?oh:Uy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},dh=Hy,Vy=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,jy=e=>Vy.test(ch(e)),zy=jy;function ps(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ae(t)?a.name===t:t.test(a.name)))return a}}function cr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Dn(i.arg,t))return i}}function Dn(e,t){return!!(e&&ts(e)&&e.content===t)}function qy(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Dr(e){return e.type===5||e.type===2}function jd(e){return e.type===7&&e.name==="pre"}function Ky(e){return e.type===7&&e.name==="slot"}function Ml(e){return e.type===1&&e.tagType===3}function Pl(e){return e.type===1&&e.tagType===2}const Gy=new Set([wi,Ui]);function uh(e,t=[]){if(e&&!Ae(e)&&e.type===14){const s=e.callee;if(!Ae(s)&&Gy.has(s))return uh(e.arguments[0],t.concat(e))}return[e,t]}function Fl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ae(a)&&a.type===14){const r=uh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Ae(a))n=hs([t]);else if(a.type===14){const r=a.arguments[0];!Ae(r)&&r.type===15?zd(t,r)||r.properties.unshift(t):a.callee===bc?n=Tt(s.helper(Ll),[hs([t]),a]):a.arguments.unshift(hs([t])),!n&&(n=a)}else a.type===15?(zd(t,a)||a.properties.unshift(t),n=a):(n=Tt(s.helper(Ll),[hs([t]),a]),l&&l.callee===Ui&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function zd(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Ci(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Wy(e){return e.type===14&&e.callee===xc?e.arguments[1].returns:e}const Zy=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function fh(e){for(let t=0;t<e.length;t++)if(!as(e.charCodeAt(t)))return!1;return!0}function Sc(e){return e.type===2&&fh(e.content)||e.type===12&&Sc(e.content)}function ph(e){return e.type===3||Sc(e)}const hh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:fa,isPreTag:fa,isIgnoreNewlineTag:fa,isCustomElement:fa,onError:kc,onWarn:lh,comments:!1,prefixIdentifiers:!1};let Ve=hh,Ei=null,tn="",Pt=null,$e=null,Jt="",js=-1,Ln=-1,Tc=0,yn=!1,vo=null;const nt=[],dt=new Fy(nt,{onerr:Bs,ontext(e,t){el(It(e,t),e,t)},ontextentity(e,t,s){el(e,t,s)},oninterpolation(e,t){if(yn)return el(It(e,t),e,t);let s=e+dt.delimiterOpen.length,n=t-dt.delimiterClose.length;for(;as(tn.charCodeAt(s));)s++;for(;as(tn.charCodeAt(n-1));)n--;let a=It(s,n);a.includes("&")&&(a=Ve.decodeEntities(a,!1)),bo({type:5,content:cl(a,!1,pt(s,n)),loc:pt(e,t)})},onopentagname(e,t){const s=It(e,t);Pt={type:1,tag:s,ns:Ve.getNamespace(s,nt[0],Ve.ns),tagType:0,props:[],children:[],loc:pt(e-1,t),codegenNode:void 0}},onopentagend(e){Kd(e)},onclosetag(e,t){const s=It(e,t);if(!Ve.isVoidTag(s)){let n=!1;for(let a=0;a<nt.length;a++)if(nt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Bs(24,nt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=nt.shift();ol(r,t,l<a)}break}n||Bs(23,gh(e,60))}},onselfclosingtag(e){const t=Pt.tag;Pt.isSelfClosing=!0,Kd(e),nt[0]&&nt[0].tag===t&&ol(nt.shift(),e)},onattribname(e,t){$e={type:6,name:It(e,t),nameLoc:pt(e,t),value:void 0,loc:pt(e)}},ondirname(e,t){const s=It(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!yn&&n===""&&Bs(26,e),yn||n==="")$e={type:6,name:s,nameLoc:pt(e,t),value:void 0,loc:pt(e)};else if($e={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ne("prop")]:[],loc:pt(e)},n==="pre"){yn=dt.inVPre=!0,vo=Pt;const a=Pt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=ix(a[i]))}},ondirarg(e,t){if(e===t)return;const s=It(e,t);if(yn&&!jd($e))$e.name+=s,Mn($e.nameLoc,t);else{const n=s[0]!=="[";$e.arg=cl(n?s:s.slice(1,-1),n,pt(e,t),n?3:0)}},ondirmodifier(e,t){const s=It(e,t);if(yn&&!jd($e))$e.name+="."+s,Mn($e.nameLoc,t);else if($e.name==="slot"){const n=$e.arg;n&&(n.content+="."+s,Mn(n.loc,t))}else{const n=Ne(s,!0,pt(e,t));$e.modifiers.push(n)}},onattribdata(e,t){Jt+=It(e,t),js<0&&(js=e),Ln=t},onattribentity(e,t,s){Jt+=e,js<0&&(js=t),Ln=s},onattribnameend(e){const t=$e.loc.start.offset,s=It(t,e);$e.type===7&&($e.rawName=s),Pt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Bs(2,t)},onattribend(e,t){if(Pt&&$e){if(Mn($e.loc,t),e!==0)if(Jt.includes("&")&&(Jt=Ve.decodeEntities(Jt,!0)),$e.type===6)$e.name==="class"&&(Jt=vh(Jt).trim()),e===1&&!Jt&&Bs(13,t),$e.value={type:2,content:Jt,loc:e===1?pt(js,Ln):pt(js-1,Ln+1)},dt.inSFCRoot&&Pt.tag==="template"&&$e.name==="lang"&&Jt&&Jt!=="html"&&dt.enterRCDATA(Dl("</template"),0);else{let s=0;$e.exp=cl(Jt,!1,pt(js,Ln),0,s),$e.name==="for"&&($e.forParseResult=Yy($e.exp));let n=-1;$e.name==="bind"&&(n=$e.modifiers.findIndex(a=>a.content==="sync"))>-1&&Ti("COMPILER_V_BIND_SYNC",Ve,$e.loc,$e.arg.loc.source)&&($e.name="model",$e.modifiers.splice(n,1))}($e.type!==7||$e.name!=="pre")&&Pt.props.push($e)}Jt="",js=Ln=-1},oncomment(e,t){Ve.comments&&bo({type:3,content:It(e,t),loc:pt(e-4,t+3)})},onend(){const e=tn.length;for(let t=0;t<nt.length;t++)ol(nt[t],e-1),Bs(24,nt[t].loc.start.offset)},oncdata(e,t){(nt[0]?nt[0].ns:Ve.ns)!==0?el(It(e,t),e,t):Bs(1,e-9)},onprocessinginstruction(e){(nt[0]?nt[0].ns:Ve.ns)===0&&Bs(21,e-1)}}),qd=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Jy=/^\(|\)$/g;function Yy(e){const t=e.loc,s=e.content,n=s.match(Zy);if(!n)return;const[,a,i]=n,l=(u,f,p=!1)=>{const v=t.start.offset+f,g=v+u.length;return cl(u,!1,pt(v,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Jy,"").trim();const c=a.indexOf(o),d=o.match(qd);if(d){o=o.replace(qd,"").trim();const u=d[1].trim();let f;if(u&&(f=s.indexOf(u,c+o.length),r.key=l(u,f,!0)),d[2]){const p=d[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function It(e,t){return tn.slice(e,t)}function Kd(e){dt.inSFCRoot&&(Pt.innerLoc=pt(e+1,e+1)),bo(Pt);const{tag:t,ns:s}=Pt;s===0&&Ve.isPreTag(t)&&Tc++,Ve.isVoidTag(t)?ol(Pt,e):(nt.unshift(Pt),(s===1||s===2)&&(dt.inXML=!0)),Pt=null}function el(e,t,s){{const i=nt[0]&&nt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ve.decodeEntities(e,!1))}const n=nt[0]||Ei,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Mn(a.loc,s)):n.children.push({type:2,content:e,loc:pt(t,s)})}function ol(e,t,s=!1){s?Mn(e.loc,gh(t,60)):Mn(e.loc,Qy(t,62)+1),dt.inSFCRoot&&(e.children.length?e.innerLoc.end=Pe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Pe({},e.innerLoc.start),e.innerLoc.source=It(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(yn||(n==="slot"?e.tagType=2:Gd(e)?e.tagType=3:ex(e)&&(e.tagType=1)),dt.inRCDATA||(e.children=mh(i)),a===0&&Ve.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ve.isPreTag(n)&&Tc--,vo===e&&(yn=dt.inVPre=!1,vo=null),dt.inXML&&(nt[0]?nt[0].ns:Ve.ns)===0&&(dt.inXML=!1);{const l=e.props;if(!dt.inSFCRoot&&Hn("COMPILER_NATIVE_TEMPLATE",Ve)&&e.tag==="template"&&!Gd(e)){const o=nt[0]||Ei,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Ti("COMPILER_INLINE_TEMPLATE",Ve,r.loc)&&e.children.length&&(r.value={type:2,content:It(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Qy(e,t){let s=e;for(;tn.charCodeAt(s)!==t&&s<tn.length-1;)s++;return s}function gh(e,t){let s=e;for(;tn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Xy=new Set(["if","else","else-if","for","slot"]);function Gd({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Xy.has(t[s].name))return!0}return!1}function ex({tag:e,props:t}){if(Ve.isCustomElement(e))return!1;if(e==="component"||tx(e.charCodeAt(0))||rh(e)||Ve.isBuiltInComponent&&Ve.isBuiltInComponent(e)||Ve.isNativeTag&&!Ve.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Ti("COMPILER_IS_ON_ELEMENT",Ve,n.loc))return!0}}else if(n.name==="bind"&&Dn(n.arg,"is")&&Ti("COMPILER_IS_ON_ELEMENT",Ve,n.loc))return!0}return!1}function tx(e){return e>64&&e<91}const sx=/\r\n/g;function mh(e){const t=Ve.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Tc)a.content=a.content.replace(sx,`
`);else if(fh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&nx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=vh(a.content))}return s?e.filter(Boolean):e}function nx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function vh(e){let t="",s=!1;for(let n=0;n<e.length;n++)as(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function bo(e){(nt[0]||Ei).children.push(e)}function pt(e,t){return{start:dt.getPos(e),end:t==null?t:dt.getPos(t),source:t==null?t:It(e,t)}}function ax(e){return pt(e.start.offset,e.end.offset)}function Mn(e,t){e.end=dt.getPos(t),e.source=It(e.start.offset,t)}function ix(e){const t={type:6,name:e.rawName,nameLoc:pt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function cl(e,t=!1,s,n=0,a=0){return Ne(e,t,s,n)}function Bs(e,t,s){Ve.onError(at(e,pt(t,t)))}function lx(){dt.reset(),Pt=null,$e=null,Jt="",js=-1,Ln=-1,nt.length=0}function rx(e,t){if(lx(),tn=e,Ve=Pe({},hh),t){let a;for(a in t)t[a]!=null&&(Ve[a]=t[a])}dt.mode=Ve.parseMode==="html"?1:Ve.parseMode==="sfc"?2:0,dt.inXML=Ve.ns===1||Ve.ns===2;const s=t&&t.delimiters;s&&(dt.delimiterOpen=Dl(s[0]),dt.delimiterClose=Dl(s[1]));const n=Ei=Dy([],e);return dt.parse(tn),n.loc=pt(0,e.length),n.children=mh(n.children),Ei=null,n}function ox(e,t){dl(e,void 0,t,!!bh(e))}function bh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Pl(t[0])?t[0]:null}function dl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const f=n?0:is(u,s);if(f>0){if(f>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const p=u.codegenNode;if(p.type===13){const v=p.patchFlag;if((v===void 0||v===512||v===1)&&xh(u,s)>=2){const g=_h(u);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(u.type===12&&(n?0:is(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const f=u.tagType===1;f&&s.scopes.vSlot++,dl(u,e,s,!1,a),f&&s.scopes.vSlot--}else if(u.type===11)dl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let f=0;f<u.branches.length;f++)dl(u.branches[f],e,s,u.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&he(e.codegenNode.children))e.codegenNode.children=o(Bn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!he(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(Bn(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!he(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ps(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(Bn(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!he(d.children)&&d.children.type===15){const f=d.children.properties.find(p=>p.key===u||p.key.content===u);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function is(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=xh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=is(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=is(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(qn),t.removeHelper(Na(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Ia(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return is(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Ae(r)||Bt(r))continue;const o=is(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const cx=new Set([mc,vc,wi,Ui]);function yh(e,t){if(e.type===14&&!Ae(e.callee)&&cx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return is(s,t);if(s.type===14)return yh(s,t)}return 0}function xh(e,t){let s=3;const n=_h(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=is(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=is(r,t):r.type===14?c=yh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function _h(e){const t=e.codegenNode;if(t.type===13)return t.props}function dx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ot,isCustomElement:d=Ot,expressionPlugins:u=[],scopeId:f=null,slotted:p=!0,ssr:v=!1,inSSR:g=!1,ssrCssVars:E="",bindingMetadata:N=Fe,inline:y=!1,isTS:b=!1,onError:_=kc,onWarn:A=lh,compatConfig:D}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:O&&Zn(Qe(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:f,slotted:p,ssr:v,inSSR:g,ssrCssVars:E,bindingMetadata:N,inline:y,isTS:b,onError:_,onWarn:A,compatConfig:D,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(T){const L=C.helpers.get(T)||0;return C.helpers.set(T,L+1),T},removeHelper(T){const L=C.helpers.get(T);if(L){const B=L-1;B?C.helpers.set(T,B):C.helpers.delete(T)}},helperString(T){return`_${Aa[C.helper(T)]}`},replaceNode(T){C.parent.children[C.childIndex]=C.currentNode=T},removeNode(T){const L=C.parent.children,B=T?L.indexOf(T):C.currentNode?C.childIndex:-1;!T||T===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>B&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(B,1)},onNodeRemoved:Ot,addIdentifiers(T){},removeIdentifiers(T){},hoist(T){Ae(T)&&(T=Ne(T)),C.hoists.push(T);const L=Ne(`_hoisted_${C.hoists.length}`,!1,T.loc,2);return L.hoisted=T,L},cache(T,L=!1,B=!1){const P=My(C.cached.length,T,L,B);return C.cached.push(P),P}};return C.filters=new Set,C}function ux(e,t){const s=dx(e,t);dr(e,s),t.hoistStatic&&ox(e,s),t.ssr||fx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function fx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=bh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&_c(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Si(t,s(ki),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function px(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ae(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,dr(a,t))}}function dr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(he(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper($i);break;case 5:t.ssr||t.helper(or);break;case 9:for(let i=0;i<e.branches.length;i++)dr(e.branches[i],t);break;case 10:case 11:case 1:case 0:px(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function kh(e,t){const s=Ae(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Ky))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const ur="/*@__PURE__*/",wh=e=>`${Aa[e]}: _${Aa[e]}`;function hx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Aa[g]}`},push(g,E=-2,N){p.code+=g},indent(){v(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:v(--p.indentLevel)},newline(){v(p.indentLevel)}};function v(g){p.push(`
`+"  ".repeat(g),0)}return p}function gx(e,t={}){const s=hx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),f=u.length>0,p=!i&&n!=="module";mx(e,s);const g=d?"ssrRender":"render",N=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${N}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${u.map(wh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Mr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Mr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Mr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Ut(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function mx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[rc,oc,$i,cc,sh].filter(f=>d.includes(f)).map(wh).join(", ");a(`const { ${u} } = _Vue
`,-1)}vx(e.hoists,t),i(),a("return ")}function Mr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?pc:t==="component"?dc:fc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Ci(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function vx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Ut(i,t),n())}t.pure=!1}function Cc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Bi(e,t,s),s&&t.deindent(),t.push("]")}function Bi(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Ae(r)?a(r,-3):he(r)?Cc(r,t):Ut(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Ut(e,t){if(Ae(e)){t.push(e,-3);return}if(Bt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Ut(e.codegenNode,t);break;case 2:bx(e,t);break;case 4:Sh(e,t);break;case 5:yx(e,t);break;case 12:Ut(e.codegenNode,t);break;case 8:Th(e,t);break;case 3:_x(e,t);break;case 13:kx(e,t);break;case 14:Sx(e,t);break;case 15:Tx(e,t);break;case 17:Cx(e,t);break;case 18:Ex(e,t);break;case 19:Ax(e,t);break;case 20:Rx(e,t);break;case 21:Bi(e.body,t,!0,!1);break}}function bx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Sh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function yx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(ur),s(`${n(or)}(`),Ut(e.content,t),s(")")}function Th(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ae(n)?t.push(n,-3):Ut(n,t)}}function xx(e,t){const{push:s}=t;if(e.type===8)s("["),Th(e,t),s("]");else if(e.isStatic){const n=wc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function _x(e,t){const{push:s,helper:n,pure:a}=t;a&&s(ur),s(`${n($i)}(${JSON.stringify(e.content)})`,-3,e)}function kx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:f,isComponent:p}=e;let v;o&&(v=String(o)),d&&s(n(hc)+"("),u&&s(`(${n(qn)}(${f?"true":""}), `),a&&s(ur);const g=u?Na(t.inSSR,p):Ia(t.inSSR,p);s(n(g)+"(",-2,e),Bi(wx([i,l,r,v,c]),t),s(")"),u&&s(")"),d&&(s(", "),Ut(d,t),s(")"))}function wx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Sx(e,t){const{push:s,helper:n,pure:a}=t,i=Ae(e.callee)?e.callee:n(e.callee);a&&s(ur),s(i+"(",-2,e),Bi(e.arguments,t),s(")")}function Tx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];xx(c,t),s(": "),Ut(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Cx(e,t){Cc(e.elements,t)}function Ex(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Aa[yc]}(`),s("(",-2,e),he(i)?Bi(i,t):i&&Ut(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),he(l)?Cc(l,t):Ut(l,t)):r&&Ut(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Ax(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!wc(s.content);u&&l("("),Sh(s,t),u&&l(")")}else l("("),Ut(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Ut(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Ut(a,t),d||t.indentLevel--,i&&o(!0)}function Rx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Ol)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Ut(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Ol)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Ix=kh(/^(?:if|else|else-if)$/,(e,t,s)=>Nx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Zd(a,o,s);else{const c=Lx(n.codegenNode);c.alternate=Zd(a,o+n.branches.length-1,s)}}}));function Nx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(at(28,t.loc)),t.exp=Ne("true",!1,a)}if(t.name==="if"){const a=Wd(e,t),i={type:9,loc:ax(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&ph(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(at(30,e.loc)),s.removeNode();const r=Wd(e,t);l.branches.push(r);const o=n&&n(l,r,!1);dr(r,s),o&&o(),s.currentNode=null}else s.onError(at(30,e.loc));break}}}function Wd(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ps(e,"for")?e.children:[e],userKey:cr(e,"key"),isTemplateIf:s}}function Zd(e,t,s){return e.condition?mo(e.condition,Jd(e,t,s),Tt(s.helper($i),['""',"true"])):Jd(e,t,s)}function Jd(e,t,s){const{helper:n}=s,a=bt("key",Ne(`${t}`,!1,ds,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Fl(o,a,s),o}else return Si(s,n(ki),hs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Wy(o);return c.type===13&&_c(c,s),Fl(c,a,s),o}}function Lx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Ox=kh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Dx(e,t,s,i=>{const l=Tt(n(gc),[i.source]),r=Ml(e),o=ps(e,"memo"),c=cr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ne(c.value.content,!0):void 0:c.exp);const u=d?bt("key",d):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=Si(s,n(ki),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let v;const{children:g}=i,E=g.length!==1||g[0].type!==1,N=Pl(e)?e:r&&e.children.length===1&&Pl(e.children[0])?e.children[0]:null;if(N?(v=N.codegenNode,r&&u&&Fl(v,u,s)):E?v=Si(s,n(ki),u?hs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(v=g[0].codegenNode,r&&u&&Fl(v,u,s),v.isBlock!==!f&&(v.isBlock?(a(qn),a(Na(s.inSSR,v.isComponent))):a(Ia(s.inSSR,v.isComponent))),v.isBlock=!f,v.isBlock?(n(qn),n(Na(s.inSSR,v.isComponent))):n(Ia(s.inSSR,v.isComponent))),o){const y=Ra(yo(i.parseResult,[Ne("_cached")]));y.body=Py([ks(["const _memo = (",o.exp,")"]),ks(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(ih)}(_cached, _memo)) return _cached`]),ks(["const _item = ",v]),Ne("_item.memo = _memo"),Ne("return _item")]),l.arguments.push(y,Ne("_cache"),Ne(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Ra(yo(i.parseResult),v,!0))}})});function Dx(e,t,s,n){if(!t.exp){s.onError(at(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(at(32,t.loc));return}Ch(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Ml(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Ch(e,t){e.finalized||(e.finalized=!0)}function yo({value:e,key:t,index:s},n=[]){return Mx([e,t,s,...n])}function Mx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ne("_".repeat(n+1),!1))}const Yd=Ne("undefined",!1),Px=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ps(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Fx=(e,t,s,n)=>Ra(e,s,!1,!0,s.length?s[0].loc:n);function $x(e,t,s=Fx){t.helper(yc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ps(e,"slot",!0);if(o){const{arg:E,exp:N}=o;E&&!ts(E)&&(r=!0),i.push(bt(E||Ne("default",!0),s(N,void 0,n,a)))}let c=!1,d=!1;const u=[],f=new Set;let p=0;for(let E=0;E<n.length;E++){const N=n[E];let y;if(!Ml(N)||!(y=ps(N,"slot",!0))){N.type!==3&&u.push(N);continue}if(o){t.onError(at(37,y.loc));break}c=!0;const{children:b,loc:_}=N,{arg:A=Ne("default",!0),exp:D,loc:O}=y;let C;ts(A)?C=A?A.content:"default":r=!0;const T=ps(N,"for"),L=s(D,T,b,_);let B,P;if(B=ps(N,"if"))r=!0,l.push(mo(B.exp,tl(A,L,p++),Yd));else if(P=ps(N,/^else(?:-if)?$/,!0)){let S=E,$;for(;S--&&($=n[S],!!ph($)););if($&&Ml($)&&ps($,/^(?:else-)?if$/)){let G=l[l.length-1];for(;G.alternate.type===19;)G=G.alternate;G.alternate=P.exp?mo(P.exp,tl(A,L,p++),Yd):tl(A,L,p++)}else t.onError(at(30,P.loc))}else if(T){r=!0;const S=T.forParseResult;S?(Ch(S),l.push(Tt(t.helper(gc),[S.source,Ra(yo(S),tl(A,L),!0)]))):t.onError(at(32,T.loc))}else{if(C){if(f.has(C)){t.onError(at(38,O));continue}f.add(C),C==="default"&&(d=!0)}i.push(bt(A,L))}}if(!o){const E=(N,y)=>{const b=s(N,void 0,y,a);return t.compatConfig&&(b.isNonScopedSlot=!0),bt("default",b)};c?u.length&&!u.every(Sc)&&(d?t.onError(at(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,n))}const v=r?2:ul(e.children)?3:1;let g=hs(i.concat(bt("_",Ne(v+"",!1))),a);return l.length&&(g=Tt(t.helper(ah),[g,Bn(l)])),{slots:g,hasDynamicSlots:r}}function tl(e,t,s){const n=[bt("name",e),bt("fn",t)];return s!=null&&n.push(bt("key",Ne(String(s),!0))),hs(n)}function ul(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||ul(s.children))return!0;break;case 9:if(ul(s.branches))return!0;break;case 10:case 11:if(ul(s.children))return!0;break}}return!1}const Eh=new WeakMap,Ux=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?Bx(e,t):`"${n}"`;const r=je(l)&&l.callee===uc;let o,c,d=0,u,f,p,v=r||l===ri||l===lc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=Ah(e,t,void 0,i,r);o=g.props,d=g.patchFlag,f=g.dynamicPropNames;const E=g.directives;p=E&&E.length?Bn(E.map(N=>Vx(N,t))):void 0,g.shouldUseBlock&&(v=!0)}if(e.children.length>0)if(l===Nl&&(v=!0,d|=1024),i&&l!==ri&&l!==Nl){const{slots:E,hasDynamicSlots:N}=$x(e,t);c=E,N&&(d|=1024)}else if(e.children.length===1&&l!==ri){const E=e.children[0],N=E.type,y=N===5||N===8;y&&is(E,t)===0&&(d|=1),y||N===2?c=E:c=e.children}else c=e.children;f&&f.length&&(u=jx(f)),e.codegenNode=Si(t,l,o,c,d===0?void 0:d,u,p,!!v,!1,i,e.loc)};function Bx(e,t,s=!1){let{tag:n}=e;const a=xo(n),i=cr(e,"is",!1,!0);if(i)if(a||Hn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ne(i.value.content,!0):(r=i.exp,r||(r=Ne("is",!1,i.arg.loc))),r)return Tt(t.helper(uc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=rh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(dc),t.components.add(n),Ci(n,"component"))}function Ah(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],f=o.length>0;let p=!1,v=0,g=!1,E=!1,N=!1,y=!1,b=!1,_=!1;const A=[],D=L=>{c.length&&(d.push(hs(Qd(c),r)),c=[]),L&&d.push(L)},O=()=>{t.scopes.vFor>0&&c.push(bt(Ne("ref_for",!0),Ne("true")))},C=({key:L,value:B})=>{if(ts(L)){const P=L.content,S=Gn(P);if(S&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!Qs(P)&&(y=!0),S&&Qs(P)&&(_=!0),S&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&is(B,t)>0)return;P==="ref"?g=!0:P==="class"?E=!0:P==="style"?N=!0:P!=="key"&&!A.includes(P)&&A.push(P),n&&(P==="class"||P==="style")&&!A.includes(P)&&A.push(P)}else b=!0};for(let L=0;L<s.length;L++){const B=s[L];if(B.type===6){const{loc:P,name:S,nameLoc:$,value:G}=B;let q=!0;if(S==="ref"&&(g=!0,O()),S==="is"&&(xo(l)||G&&G.content.startsWith("vue:")||Hn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(bt(Ne(S,!0,$),Ne(G?G.content:"",q,G?G.loc:P)))}else{const{name:P,arg:S,exp:$,loc:G,modifiers:q}=B,k=P==="bind",x=P==="on";if(P==="slot"){n||t.onError(at(40,G));continue}if(P==="once"||P==="memo"||P==="is"||k&&Dn(S,"is")&&(xo(l)||Hn("COMPILER_IS_ON_ELEMENT",t))||x&&i)continue;if((k&&Dn(S,"key")||x&&f&&Dn(S,"vue:before-update"))&&(p=!0),k&&Dn(S,"ref")&&O(),!S&&(k||x)){if(b=!0,$)if(k){if(D(),Hn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift($);continue}O(),D(),d.push($)}else D({type:14,loc:G,callee:t.helper(bc),arguments:n?[$]:[$,"true"]});else t.onError(at(k?34:35,G));continue}k&&q.some(de=>de.content==="prop")&&(v|=32);const U=t.directiveTransforms[P];if(U){const{props:de,needRuntime:ce}=U(B,e,t);!i&&de.forEach(C),x&&S&&!ts(S)?D(hs(de,r)):c.push(...de),ce&&(u.push(B),Bt(ce)&&Eh.set(B,ce))}else Og(P)||(u.push(B),f&&(p=!0))}}let T;if(d.length?(D(),d.length>1?T=Tt(t.helper(Ll),d,r):T=d[0]):c.length&&(T=hs(Qd(c),r)),b?v|=16:(E&&!n&&(v|=2),N&&!n&&(v|=4),A.length&&(v|=8),y&&(v|=32)),!p&&(v===0||v===32)&&(g||_||u.length>0)&&(v|=512),!t.inSSR&&T)switch(T.type){case 15:let L=-1,B=-1,P=!1;for(let G=0;G<T.properties.length;G++){const q=T.properties[G].key;ts(q)?q.content==="class"?L=G:q.content==="style"&&(B=G):q.isHandlerKey||(P=!0)}const S=T.properties[L],$=T.properties[B];P?T=Tt(t.helper(wi),[T]):(S&&!ts(S.value)&&(S.value=Tt(t.helper(mc),[S.value])),$&&(N||$.value.type===4&&$.value.content.trim()[0]==="["||$.value.type===17)&&($.value=Tt(t.helper(vc),[$.value])));break;case 14:break;default:T=Tt(t.helper(wi),[Tt(t.helper(Ui),[T])]);break}return{props:T,directives:u,patchFlag:v,dynamicPropNames:A,shouldUseBlock:p}}function Qd(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Gn(i))&&Hx(l,a):(t.set(i,a),s.push(a))}return s}function Hx(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Bn([e.value,t.value],e.loc)}function Vx(e,t){const s=[],n=Eh.get(e);n?s.push(t.helperString(n)):(t.helper(fc),t.directives.add(e.name),s.push(Ci(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ne("true",!1,a);s.push(hs(e.modifiers.map(l=>bt(l,i)),a))}return Bn(s,e.loc)}function jx(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function xo(e){return e==="component"||e==="Component"}const zx=(e,t)=>{if(Pl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=qx(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Ra([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Tt(t.helper(nh),l,n)}};function qx(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Qe(l.name),a.push(l)));else if(l.name==="bind"&&Dn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Qe(l.arg.content);s=l.exp=Ne(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ts(l.arg)&&(l.arg.content=Qe(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Ah(e,t,a,!1,!1);n=i,l.length&&t.onError(at(36,l[0].loc))}return{slotName:s,slotProps:n}}const Rh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(at(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const f=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?ma(Qe(u)):`on:${u}`;r=Ne(f,!0,l.loc)}else r=ks([`${s.helperString(go)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(go)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=dh(o),f=!(u||zy(o)),p=o.content.includes(";");(f||c&&u)&&(o=ks([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let d={props:[bt(r,o||Ne("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Kx=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Qe(i.content):i.content=`${s.helperString(ho)}(${i.content})`:(i.children.unshift(`${s.helperString(ho)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Xd(i,"."),n.some(r=>r.content==="attr")&&Xd(i,"^")),{props:[bt(i,l)]}},Xd=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Gx=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Dr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Dr(o))n||(n=s[i]=ks([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Dr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&is(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Tt(t.helper(cc),r)}}}}},eu=new WeakSet,Wx=(e,t)=>{if(e.type===1&&ps(e,"once",!0))return eu.has(e)||t.inVOnce||t.inSSR?void 0:(eu.add(e),t.inVOnce=!0,t.helper(Ol),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Ih=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(at(41,e.loc)),qa();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(at(44,n.loc)),qa();if(r==="literal-const"||r==="setup-const")return s.onError(at(45,n.loc)),qa();if(!l.trim()||!dh(n))return s.onError(at(42,n.loc)),qa();const o=a||Ne("modelValue",!0),c=a?ts(a)?`onUpdate:${Qe(a.content)}`:ks(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=ks([`${u} => ((`,n,") = $event)"]);const f=[bt(o,e.exp),bt(c,d)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(wc(g)?g:JSON.stringify(g))+": true").join(", "),v=a?ts(a)?`${a.content}Modifiers`:ks([a,' + "Modifiers"']):"modelModifiers";f.push(bt(v,Ne(`{ ${p} }`,!1,e.loc,2)))}return qa(f)};function qa(e=[]){return{props:e}}const Zx=/[\w).+\-_$\]]/,Jx=(e,t)=>{Hn("COMPILER_FILTERS",t)&&(e.type===5?$l(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&$l(s.exp,t)}))};function $l(e,t){if(e.type===4)tu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?tu(n,t):n.type===8?$l(e,t):n.type===5&&$l(n.content,t))}}function tu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,f,p,v,g=[];for(p=0;p<s.length;p++)if(f=u,u=s.charCodeAt(p),n)u===39&&f!==92&&(n=!1);else if(a)u===34&&f!==92&&(a=!1);else if(i)u===96&&f!==92&&(i=!1);else if(l)u===47&&f!==92&&(l=!1);else if(u===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)v===void 0?(d=p+1,v=s.slice(0,p).trim()):E();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let N=p-1,y;for(;N>=0&&(y=s.charAt(N),y===" ");N--);(!y||!Zx.test(y))&&(l=!0)}}v===void 0?v=s.slice(0,p).trim():d!==0&&E();function E(){g.push(s.slice(d,p).trim()),d=p+1}if(g.length){for(p=0;p<g.length;p++)v=Yx(v,g[p],t);e.content=v,e.ast=void 0}}function Yx(e,t,s){s.helper(pc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Ci(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Ci(a,"filter")}(${e}${i!==")"?","+i:i}`}}const su=new WeakSet,Qx=(e,t)=>{if(e.type===1){const s=ps(e,"memo");return!s||su.has(e)||t.inSSR?void 0:(su.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&_c(n,t),e.codegenNode=Tt(t.helper(xc),[s.exp,Ra(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},Xx=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(at(53,n.loc)),s.exp=Ne("",!0,n.loc);else{const a=Qe(n.content);(oh.test(a[0])||a[0]==="-")&&(s.exp=Ne(a,!1,n.loc))}}}};function e0(e){return[[Xx,Wx,Ix,Qx,Ox,Jx,zx,Ux,Px,Gx],{on:Rh,bind:Kx,model:Ih}]}function t0(e,t={}){const s=t.onError||kc,n=t.mode==="module";t.prefixIdentifiers===!0?s(at(48)):n&&s(at(49));const a=!1;t.cacheHandlers&&s(at(50)),t.scopeId&&!n&&s(at(51));const i=Pe({},t,{prefixIdentifiers:a}),l=Ae(e)?rx(e,i):e,[r,o]=e0();return ux(l,Pe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Pe({},o,t.directiveTransforms||{})})),gx(l,i)}const s0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Nh=Symbol(""),Lh=Symbol(""),Oh=Symbol(""),Dh=Symbol(""),_o=Symbol(""),Mh=Symbol(""),Ph=Symbol(""),Fh=Symbol(""),$h=Symbol(""),Uh=Symbol("");Oy({[Nh]:"vModelRadio",[Lh]:"vModelCheckbox",[Oh]:"vModelText",[Dh]:"vModelSelect",[_o]:"vModelDynamic",[Mh]:"withModifiers",[Ph]:"withKeys",[Fh]:"vShow",[$h]:"Transition",[Uh]:"TransitionGroup"});let ia;function n0(e,t=!1){return ia||(ia=document.createElement("div")),t?(ia.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,ia.children[0].getAttribute("foo")):(ia.innerHTML=e,ia.textContent)}const a0={parseMode:"html",isVoidTag:Jg,isNativeTag:e=>Gg(e)||Wg(e)||Zg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:n0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return $h;if(e==="TransitionGroup"||e==="transition-group")return Uh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},i0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ne("style",!0,t.loc),exp:l0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},l0=(e,t)=>{const s=Yu(e);return Ne(JSON.stringify(s),!1,t,3)};function kn(e,t){return at(e,t)}const r0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(54,a)),t.children.length&&(s.onError(kn(55,a)),t.children.length=0),{props:[bt(Ne("innerHTML",!0,a),n||Ne("",!0))]}},o0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(56,a)),t.children.length&&(s.onError(kn(57,a)),t.children.length=0),{props:[bt(Ne("textContent",!0),n?is(n,s)>0?n:Tt(s.helperString(or),[n],a):Ne("",!0))]}},c0=(e,t,s)=>{const n=Ih(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(kn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Oh,r=!1;if(a==="input"||i){const o=cr(t,"type");if(o){if(o.type===7)l=_o;else if(o.value)switch(o.value.content){case"radio":l=Nh;break;case"checkbox":l=Lh;break;case"file":r=!0,s.onError(kn(60,e.loc));break}}else qy(t)&&(l=_o)}else a==="select"&&(l=Dh);r||(n.needRuntime=s.helper(l))}else s.onError(kn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},d0=cs("passive,once,capture"),u0=cs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),f0=cs("left,right"),Bh=cs("onkeyup,onkeydown,onkeypress"),p0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Ti("COMPILER_V_ON_NATIVE",s)||d0(o)?l.push(o):f0(o)?ts(e)?Bh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):u0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},nu=(e,t)=>ts(e)&&e.content.toLowerCase()==="onclick"?Ne(t,!0):e.type!==4?ks(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,h0=(e,t,s)=>Rh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=p0(i,a,s,e.loc);if(o.includes("right")&&(i=nu(i,"onContextmenu")),o.includes("middle")&&(i=nu(i,"onMouseup")),o.length&&(l=Tt(s.helper(Mh),[l,JSON.stringify(o)])),r.length&&(!ts(i)||Bh(i.content.toLowerCase()))&&(l=Tt(s.helper(Ph),[l,JSON.stringify(r)])),c.length){const d=c.map(Zn).join("");i=ts(i)?Ne(`${i.content}${d}`,!0):ks(["(",i,`) + "${d}"`])}return{props:[bt(i,l)]}}),g0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(62,a)),{props:[],needRuntime:s.helper(Fh)}},m0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},v0=[i0],b0={cloak:s0,html:r0,text:o0,model:c0,on:h0,show:g0};function y0(e,t={}){return t0(e,Pe({},a0,t,{nodeTransforms:[m0,...v0,...t.nodeTransforms||[]],directiveTransforms:Pe({},b0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const au=Object.create(null);function x0(e,t){if(!Ae(e))if(e.nodeType)e=e.innerHTML;else return Ot;const s=Pg(e,t),n=au[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Pe({hoistStatic:!0,onError:void 0,onWarn:Ot},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=y0(e,a),l=new Function("Vue",i)(Ey);return l._rc=!0,au[s]=l}wp(x0);const Ul=Sn({items:[]});let _0=1;function fr(e,t="info",s=3e3){const n=_0++;return Ul.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Ec(n),s),n}function Ec(e){const t=Ul.items.findIndex(s=>s.id===e);t>=0&&Ul.items.splice(t,1)}function _e(e,t="info",s=3e3){return fr(e,t,s)}_e.success=(e,t=3e3)=>fr(e,"success",t);_e.error=(e,t=5e3)=>fr(e,"error",t);_e.info=(e,t=3e3)=>fr(e,"info",t);_e.dismiss=Ec;const k0={setup(){return{state:Ul,dismiss:Ec}},template:`
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
  `},Ks=Sn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ka=null;function os({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ka&&ka(!1),Ks.title=e,Ks.message=t,Ks.confirmLabel=s,Ks.cancelLabel=n,Ks.danger=a,Ks.open=!0,new Promise(i=>{ka=i})}function iu(e){Ks.open=!1,ka&&(ka(e),ka=null)}const w0={setup(){function e(t){Ks.open&&t.key==="Escape"&&(t.stopPropagation(),iu(!1))}return He(()=>document.addEventListener("keydown",e,!0)),gt(()=>document.removeEventListener("keydown",e,!0)),{state:Ks,settle:iu}},template:`
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
 */const da=typeof document<"u";function Hh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function S0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Hh(e.default)}const Ge=Object.assign;function Pr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ss(a)?a.map(e):e(a)}return s}const oi=()=>{},Ss=Array.isArray;function lu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Vh=/#/g,T0=/&/g,C0=/\//g,E0=/=/g,A0=/\?/g,jh=/\+/g,R0=/%5B/g,I0=/%5D/g,zh=/%5E/g,N0=/%60/g,qh=/%7B/g,L0=/%7C/g,Kh=/%7D/g,O0=/%20/g;function Ac(e){return e==null?"":encodeURI(""+e).replace(L0,"|").replace(R0,"[").replace(I0,"]")}function D0(e){return Ac(e).replace(qh,"{").replace(Kh,"}").replace(zh,"^")}function ko(e){return Ac(e).replace(jh,"%2B").replace(O0,"+").replace(Vh,"%23").replace(T0,"%26").replace(N0,"`").replace(qh,"{").replace(Kh,"}").replace(zh,"^")}function M0(e){return ko(e).replace(E0,"%3D")}function P0(e){return Ac(e).replace(Vh,"%23").replace(A0,"%3F")}function F0(e){return P0(e).replace(C0,"%2F")}function Ai(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const $0=/\/$/,U0=e=>e.replace($0,"");function Fr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=j0(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Ai(l)}}function B0(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ru(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function H0(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&La(t.matched[n],s.matched[a])&&Gh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function La(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Gh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!V0(e[s],t[s]))return!1;return!0}function V0(e,t){return Ss(e)?ou(e,t):Ss(t)?ou(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function ou(e,t){return Ss(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function j0(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const hn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let wo=(function(e){return e.pop="pop",e.push="push",e})({}),$r=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function z0(e){if(!e)if(da){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),U0(e)}const q0=/^[^#]+#/;function K0(e,t){return e.replace(q0,"#")+t}function G0(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const pr=()=>({left:window.scrollX,top:window.scrollY});function W0(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=G0(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function cu(e,t){return(history.state?history.state.position-t:-1)+e}const So=new Map;function Z0(e,t){So.set(e,t)}function J0(e){const t=So.get(e);return So.delete(e),t}function Y0(e){return typeof e=="string"||e&&typeof e=="object"}function Wh(e){return typeof e=="string"||typeof e=="symbol"}let ct=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Zh=Symbol("");ct.MATCHER_NOT_FOUND+"",ct.NAVIGATION_GUARD_REDIRECT+"",ct.NAVIGATION_ABORTED+"",ct.NAVIGATION_CANCELLED+"",ct.NAVIGATION_DUPLICATED+"";function Oa(e,t){return Ge(new Error,{type:e,[Zh]:!0},t)}function Hs(e,t){return e instanceof Error&&Zh in e&&(t==null||!!(e.type&t))}const Q0=["params","query","hash"];function X0(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Q0)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function e_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(jh," "),i=a.indexOf("="),l=Ai(i<0?a:a.slice(0,i)),r=i<0?null:Ai(a.slice(i+1));if(l in t){let o=t[l];Ss(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function du(e){let t="";for(let s in e){const n=e[s];if(s=M0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ss(n)?n.map(a=>a&&ko(a)):[n&&ko(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function t_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ss(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const s_=Symbol(""),uu=Symbol(""),hr=Symbol(""),Rc=Symbol(""),To=Symbol("");function Ka(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function xn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Oa(ct.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):Y0(f)?o(Oa(ct.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(f=>o(f))})}function Ur(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Hh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(xn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=S0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const f=(u.__vccOpts||u)[t];return f&&xn(f,s,n,l,r,a)()}))}}return i}function n_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>La(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>La(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let a_=()=>location.protocol+"//"+location.host;function Jh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),ru(r,"")}return ru(s,e)+n+a}function i_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=Jh(e,location),v=s.value,g=t.value;let E=0;if(f){if(s.value=p,t.value=f,l&&l===v){l=null;return}E=g?f.position-g.position:0}else n(p);a.forEach(N=>{N(s.value,v,{delta:E,type:wo.pop,direction:E?E>0?$r.forward:$r.back:$r.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const v=a.indexOf(f);v>-1&&a.splice(v,1)};return i.push(p),p}function d(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(Ge({},f.state,{scroll:pr()}),"")}}function u(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function fu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?pr():null}}function l_(e){const{history:t,location:s}=window,n={value:Jh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),f=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:a_()+e+o;try{t[d?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[d?"replace":"assign"](f)}}function l(o,c){i(o,Ge({},t.state,fu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=Ge({},a.value,t.state,{forward:o,scroll:pr()});i(d.current,d,!0),i(o,Ge({},fu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function r_(e){e=z0(e);const t=l_(e),s=i_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=Ge({location:"",base:e,go:n,createHref:K0.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function o_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),r_(e)}let Pn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var kt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(kt||{});const c_={type:Pn.Static,value:""},d_=/[a-zA-Z0-9_]/;function u_(e){if(!e)return[[]];if(e==="/")return[[c_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=kt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===kt.Static?i.push({type:Pn.Static,value:c}):s===kt.Param||s===kt.ParamRegExp||s===kt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Pn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==kt.ParamRegExp){n=s,s=kt.EscapeNext;continue}switch(s){case kt.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=kt.Param):f();break;case kt.EscapeNext:f(),s=n;break;case kt.Param:o==="("?s=kt.ParamRegExp:d_.test(o)?f():(u(),s=kt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case kt.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=kt.ParamRegExpEnd:d+=o;break;case kt.ParamRegExpEnd:u(),s=kt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===kt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const pu="[^/]+?",f_={sensitive:!1,strict:!1,start:!0,end:!0};var jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(jt||{});const p_=/[.+*?^${}()[\]/\\]/g;function h_(e,t){const s=Ge({},f_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[jt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const f=c[u];let p=jt.Segment+(s.sensitive?jt.BonusCaseSensitive:0);if(f.type===Pn.Static)u||(a+="/"),a+=f.value.replace(p_,"\\$&"),p+=jt.Static;else if(f.type===Pn.Param){const{value:v,repeatable:g,optional:E,regexp:N}=f;i.push({name:v,repeatable:g,optional:E});const y=N||pu;if(y!==pu){p+=jt.BonusCustomRegExp;try{`${y}`}catch(_){throw new Error(`Invalid custom RegExp for param "${v}" (${y}): `+_.message)}}let b=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(b=E&&c.length<2?`(?:/${b})`:"/"+b),E&&(b+="?"),a+=b,p+=jt.Dynamic,E&&(p+=jt.BonusOptional),g&&(p+=jt.BonusRepeatable),y===".*"&&(p+=jt.BonusWildcard)}d.push(p)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let f=1;f<d.length;f++){const p=d[f]||"",v=i[f-1];u[v.name]=p&&v.repeatable?p.split("/"):p}return u}function o(c){let d="",u=!1;for(const f of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const p of f)if(p.type===Pn.Static)d+=p.value;else if(p.type===Pn.Param){const{value:v,repeatable:g,optional:E}=p,N=v in c?c[v]:"";if(Ss(N)&&!g)throw new Error(`Provided param "${v}" is an array but it is not repeatable (* or + modifiers)`);const y=Ss(N)?N.join("/"):N;if(!y)if(E)f.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${v}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function g_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===jt.Static+jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===jt.Static+jt.Segment?1:-1:0}function Yh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=g_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(hu(n))return 1;if(hu(a))return-1}return a.length-n.length}function hu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const m_={strict:!1,end:!0,sensitive:!1};function v_(e,t,s){const n=h_(u_(e.path),s),a=Ge(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function b_(e,t){const s=[],n=new Map;t=lu(m_,t);function a(u){return n.get(u)}function i(u,f,p){const v=!p,g=mu(u);g.aliasOf=p&&p.record;const E=lu(t,u),N=[g];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const A of _)N.push(mu(Ge({},g,{components:p?p.record.components:g.components,path:A,aliasOf:p?p.record:g})))}let y,b;for(const _ of N){const{path:A}=_;if(f&&A[0]!=="/"){const D=f.record.path,O=D[D.length-1]==="/"?"":"/";_.path=f.record.path+(A&&O+A)}if(y=v_(_,f,E),p?p.alias.push(y):(b=b||y,b!==y&&b.alias.push(y),v&&u.name&&!vu(y)&&l(u.name)),Qh(y)&&o(y),g.children){const D=g.children;for(let O=0;O<D.length;O++)i(D[O],y,p&&p.children[O])}p=p||y}return b?()=>{l(b)}:oi}function l(u){if(Wh(u)){const f=n.get(u);f&&(n.delete(u),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(u);f>-1&&(s.splice(f,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const f=__(u,s);s.splice(f,0,u),u.record.name&&!vu(u)&&n.set(u.record.name,u)}function c(u,f){let p,v={},g,E;if("name"in u&&u.name){if(p=n.get(u.name),!p)throw Oa(ct.MATCHER_NOT_FOUND,{location:u});E=p.record.name,v=Ge(gu(f.params,p.keys.filter(b=>!b.optional).concat(p.parent?p.parent.keys.filter(b=>b.optional):[]).map(b=>b.name)),u.params&&gu(u.params,p.keys.map(b=>b.name))),g=p.stringify(v)}else if(u.path!=null)g=u.path,p=s.find(b=>b.re.test(g)),p&&(v=p.parse(g),E=p.record.name);else{if(p=f.name?n.get(f.name):s.find(b=>b.re.test(f.path)),!p)throw Oa(ct.MATCHER_NOT_FOUND,{location:u,currentLocation:f});E=p.record.name,v=Ge({},f.params,u.params),g=p.stringify(v)}const N=[];let y=p;for(;y;)N.unshift(y.record),y=y.parent;return{name:E,path:g,params:v,matched:N,meta:x_(N)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function gu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function mu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:y_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function y_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function vu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function x_(e){return e.reduce((t,s)=>Ge(t,s.meta),{})}function __(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Yh(e,t[i])<0?n=i:s=i+1}const a=k_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function k_(e){let t=e;for(;t=t.parent;)if(Qh(t)&&Yh(e,t)===0)return t}function Qh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function bu(e){const t=gs(hr),s=gs(Rc),n=J(()=>{const o=Ds(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const f=u.findIndex(La.bind(null,d));if(f>-1)return f;const p=yu(o[c-2]);return c>1&&yu(d)===p&&u[u.length-1].path!==p?u.findIndex(La.bind(null,o[c-2])):f}),i=J(()=>a.value>-1&&E_(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&Gh(s.params,n.value.params));function r(o={}){if(C_(o)){const c=t[Ds(e.replace)?"replace":"push"](Ds(e.to)).catch(oi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function w_(e){return e.length===1?e[0]:e}const S_=Oi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:bu,setup(e,{slots:t}){const s=Sn(bu(e)),{options:n}=gs(hr),a=J(()=>({[xu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[xu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&w_(t.default(s));return e.custom?i:Ta("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),T_=S_;function C_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function E_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ss(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function yu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const xu=(e,t,s)=>e??t??s,A_=Oi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=gs(To),a=J(()=>e.route||n.value),i=gs(uu,0),l=J(()=>{let c=Ds(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);ni(uu,J(()=>l.value+1)),ni(s_,r),ni(To,a);const o=h();return ls(()=>[o.value,r.value,e.name],([c,d,u],[f,p,v])=>{d&&(d.instances[u]=c,p&&p!==d&&c&&c===f&&(d.leaveGuards.size||(d.leaveGuards=p.leaveGuards),d.updateGuards.size||(d.updateGuards=p.updateGuards))),c&&d&&(!p||!La(d,p)||!f)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,f=u&&u.components[d];if(!f)return _u(s.default,{Component:f,route:c});const p=u.props[d],v=p?p===!0?c.params:typeof p=="function"?p(c):p:null,E=Ta(f,Ge({},v,t,{onVnodeUnmounted:N=>{N.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return _u(s.default,{Component:E,route:c})||E}}});function _u(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const R_=A_;function I_(e){const t=b_(e.routes,e),s=e.parseQuery||e_,n=e.stringifyQuery||du,a=e.history,i=Ka(),l=Ka(),r=Ka(),o=Uo(hn);let c=hn;da&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Pr.bind(null,j=>""+j),u=Pr.bind(null,F0),f=Pr.bind(null,Ai);function p(j,oe){let ie,me;return Wh(j)?(ie=t.getRecordMatcher(j),me=oe):me=j,t.addRoute(me,ie)}function v(j){const oe=t.getRecordMatcher(j);oe&&t.removeRoute(oe)}function g(){return t.getRoutes().map(j=>j.record)}function E(j){return!!t.getRecordMatcher(j)}function N(j,oe){if(oe=Ge({},oe||o.value),typeof j=="string"){const R=Fr(s,j,oe.path),M=t.resolve({path:R.path},oe),Z=a.createHref(R.fullPath);return Ge(R,M,{params:f(M.params),hash:Ai(R.hash),redirectedFrom:void 0,href:Z})}let ie;if(j.path!=null)ie=Ge({},j,{path:Fr(s,j.path,oe.path).path});else{const R=Ge({},j.params);for(const M in R)R[M]==null&&delete R[M];ie=Ge({},j,{params:u(R)}),oe.params=u(oe.params)}const me=t.resolve(ie,oe),pe=j.hash||"";me.params=d(f(me.params));const Le=B0(n,Ge({},j,{hash:D0(pe),path:me.path})),m=a.createHref(Le);return Ge({fullPath:Le,hash:pe,query:n===du?t_(j.query):j.query||{}},me,{redirectedFrom:void 0,href:m})}function y(j){return typeof j=="string"?Fr(s,j,o.value.path):Ge({},j)}function b(j,oe){if(c!==j)return Oa(ct.NAVIGATION_CANCELLED,{from:oe,to:j})}function _(j){return O(j)}function A(j){return _(Ge(y(j),{replace:!0}))}function D(j,oe){const ie=j.matched[j.matched.length-1];if(ie&&ie.redirect){const{redirect:me}=ie;let pe=typeof me=="function"?me(j,oe):me;return typeof pe=="string"&&(pe=pe.includes("?")||pe.includes("#")?pe=y(pe):{path:pe},pe.params={}),Ge({query:j.query,hash:j.hash,params:pe.path!=null?{}:j.params},pe)}}function O(j,oe){const ie=c=N(j),me=o.value,pe=j.state,Le=j.force,m=j.replace===!0,R=D(ie,me);if(R)return O(Ge(y(R),{state:typeof R=="object"?Ge({},pe,R.state):pe,force:Le,replace:m}),oe||ie);const M=ie;M.redirectedFrom=oe;let Z;return!Le&&H0(n,me,ie)&&(Z=Oa(ct.NAVIGATION_DUPLICATED,{to:M,from:me}),ce(me,me,!0,!1)),(Z?Promise.resolve(Z):L(M,me)).catch(I=>Hs(I)?Hs(I,ct.NAVIGATION_GUARD_REDIRECT)?I:de(I):x(I,M,me)).then(I=>{if(I){if(Hs(I,ct.NAVIGATION_GUARD_REDIRECT))return O(Ge({replace:m},y(I.to),{state:typeof I.to=="object"?Ge({},pe,I.to.state):pe,force:Le}),oe||M)}else I=P(M,me,!0,m,pe);return B(M,me,I),I})}function C(j,oe){const ie=b(j,oe);return ie?Promise.reject(ie):Promise.resolve()}function T(j){const oe=Q.values().next().value;return oe&&typeof oe.runWithContext=="function"?oe.runWithContext(j):j()}function L(j,oe){let ie;const[me,pe,Le]=n_(j,oe);ie=Ur(me.reverse(),"beforeRouteLeave",j,oe);for(const R of me)R.leaveGuards.forEach(M=>{ie.push(xn(M,j,oe))});const m=C.bind(null,j,oe);return ie.push(m),Ie(ie).then(()=>{ie=[];for(const R of i.list())ie.push(xn(R,j,oe));return ie.push(m),Ie(ie)}).then(()=>{ie=Ur(pe,"beforeRouteUpdate",j,oe);for(const R of pe)R.updateGuards.forEach(M=>{ie.push(xn(M,j,oe))});return ie.push(m),Ie(ie)}).then(()=>{ie=[];for(const R of Le)if(R.beforeEnter)if(Ss(R.beforeEnter))for(const M of R.beforeEnter)ie.push(xn(M,j,oe));else ie.push(xn(R.beforeEnter,j,oe));return ie.push(m),Ie(ie)}).then(()=>(j.matched.forEach(R=>R.enterCallbacks={}),ie=Ur(Le,"beforeRouteEnter",j,oe,T),ie.push(m),Ie(ie))).then(()=>{ie=[];for(const R of l.list())ie.push(xn(R,j,oe));return ie.push(m),Ie(ie)}).catch(R=>Hs(R,ct.NAVIGATION_CANCELLED)?R:Promise.reject(R))}function B(j,oe,ie){r.list().forEach(me=>T(()=>me(j,oe,ie)))}function P(j,oe,ie,me,pe){const Le=b(j,oe);if(Le)return Le;const m=oe===hn,R=da?history.state:{};ie&&(me||m?a.replace(j.fullPath,Ge({scroll:m&&R&&R.scroll},pe)):a.push(j.fullPath,pe)),o.value=j,ce(j,oe,ie,m),de()}let S;function $(){S||(S=a.listen((j,oe,ie)=>{if(!ue.listening)return;const me=N(j),pe=D(me,ue.currentRoute.value);if(pe){O(Ge(pe,{replace:!0,force:!0}),me).catch(oi);return}c=me;const Le=o.value;da&&Z0(cu(Le.fullPath,ie.delta),pr()),L(me,Le).catch(m=>Hs(m,ct.NAVIGATION_ABORTED|ct.NAVIGATION_CANCELLED)?m:Hs(m,ct.NAVIGATION_GUARD_REDIRECT)?(O(Ge(y(m.to),{force:!0}),me).then(R=>{Hs(R,ct.NAVIGATION_ABORTED|ct.NAVIGATION_DUPLICATED)&&!ie.delta&&ie.type===wo.pop&&a.go(-1,!1)}).catch(oi),Promise.reject()):(ie.delta&&a.go(-ie.delta,!1),x(m,me,Le))).then(m=>{m=m||P(me,Le,!1),m&&(ie.delta&&!Hs(m,ct.NAVIGATION_CANCELLED)?a.go(-ie.delta,!1):ie.type===wo.pop&&Hs(m,ct.NAVIGATION_ABORTED|ct.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(me,Le,m)}).catch(oi)}))}let G=Ka(),q=Ka(),k;function x(j,oe,ie){de(j);const me=q.list();return me.length?me.forEach(pe=>pe(j,oe,ie)):console.error(j),Promise.reject(j)}function U(){return k&&o.value!==hn?Promise.resolve():new Promise((j,oe)=>{G.add([j,oe])})}function de(j){return k||(k=!j,$(),G.list().forEach(([oe,ie])=>j?ie(j):oe()),G.reset()),j}function ce(j,oe,ie,me){const{scrollBehavior:pe}=e;if(!da||!pe)return Promise.resolve();const Le=!ie&&J0(cu(j.fullPath,0))||(me||!ie)&&history.state&&history.state.scroll||null;return St().then(()=>pe(j,oe,Le)).then(m=>m&&W0(m)).catch(m=>x(m,j,oe))}const se=j=>a.go(j);let fe;const Q=new Set,ue={currentRoute:o,listening:!0,addRoute:p,removeRoute:v,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:g,resolve:N,options:e,push:_,replace:A,go:se,back:()=>se(-1),forward:()=>se(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:q.add,isReady:U,install(j){j.component("RouterLink",T_),j.component("RouterView",R_),j.config.globalProperties.$router=ue,Object.defineProperty(j.config.globalProperties,"$route",{enumerable:!0,get:()=>Ds(o)}),da&&!fe&&o.value===hn&&(fe=!0,_(a.location).catch(me=>{}));const oe={};for(const me in hn)Object.defineProperty(oe,me,{get:()=>o.value[me],enumerable:!0});j.provide(hr,ue),j.provide(Rc,$o(oe)),j.provide(To,o);const ie=j.unmount;Q.add(j),j.unmount=function(){Q.delete(j),Q.size<1&&(c=hn,S&&S(),S=null,o.value=hn,fe=!1,k=!1),ie()}}};function Ie(j){return j.reduce((oe,ie)=>oe.then(()=>T(ie)),Promise.resolve())}return ue}function Xh(){return gs(hr)}function N_(e){return gs(Rc)}const L_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],Qt=Sn({open:!1,query:"",selected:0});function ku(){Qt.query="",Qt.selected=0,Qt.open=!0}function Br(){Qt.open=!1}function O_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const D_={setup(){const e=Xh(),t=h(null),s=J(()=>{const i=Qt.query.trim().toLowerCase();return L_.map(l=>({...l,_score:O_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ls(()=>Qt.open,async i=>{var l;i&&(await St(),(l=t.value)==null||l.focus())}),ls(()=>Qt.query,()=>{Qt.selected=0});function n(i){Br(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Br();return}if(i.key==="ArrowDown")i.preventDefault(),Qt.selected=Math.min(Qt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Qt.selected=Math.max(Qt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Qt.selected];l&&n(l)}}return{state:Qt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Br}},template:`
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
  `},Co={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Co));const M_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ta("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ta("path",{d:Co[e.name]||Co.info})])}},P_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function wu(e){return[...e.querySelectorAll(P_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const F_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=wu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||wu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Ic(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Yn(e){const t=Ic(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Nc(e){const t=Ic(e);return t?t.toLocaleTimeString():"—"}function eg(e){const t=Ic(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Da(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Lc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function tg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Su(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function sg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function ng(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const $_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const f=J(()=>{const S=e.value.uptime_seconds||0,$=Math.floor(S/86400),G=Math.floor(S%86400/3600),q=Math.floor(S%3600/60),k=[];return $>0&&k.push(`${$}d`),G>0&&k.push(`${G}h`),(k.length===0||$===0&&G===0)&&k.push(`${q}m`),k.join(" ")}),p=J(()=>{const S=e.value.uptime_seconds||0;return 125.66*(1-Math.min(S/86400,1))}),v=J(()=>{const S=e.value;return[{label:"Guilds",value:S.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:S.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:S.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${S.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:S.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:S.loop_count>0?"text-green-400":"",highlight:S.loop_count>0},{label:"Agents",value:S.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:S.agent_count>0?`${S.agent_count} total`:"",subColor:"text-gray-500",highlight:(S.agent_running??0)>0},{label:"Processes",value:S.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:S.process_count>0?`${S.process_count} total`:"",subColor:"text-gray-500",highlight:(S.process_running??0)>0},{label:"Schedules",value:S.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(S.schedule_failing>0?`${S.schedule_failing} failing`:"")+(S.schedule_failing>0&&S.schedule_paused>0?", ":"")+(S.schedule_paused>0?`${S.schedule_paused} paused`:"")||void 0,subColor:S.schedule_failing>0?"text-red-400":"text-yellow-400",color:S.schedule_failing>0?"text-red-400":"",highlight:S.schedule_failing>0},{label:"Users",value:S.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=J(()=>{const S=e.value,$=[];return $.push({label:"Bot",status:S.status==="online"?"ok":"warn",detail:S.status==="online"?"Online":"Starting"}),(S.schedule_failing||0)>0?$.push({label:"Schedules",status:"error",detail:`${S.schedule_failing} failing`}):(S.schedule_count||0)>0&&$.push({label:"Schedules",status:"ok",detail:`${S.schedule_count} configured`}),(S.loop_count||0)>0&&$.push({label:"Loops",status:"ok",detail:`${S.loop_count} active`}),(S.agent_running||0)>0&&$.push({label:"Agents",status:"ok",detail:`${S.agent_running} running`}),(S.process_running||0)>0&&$.push({label:"Processes",status:"ok",detail:`${S.process_running} running`}),$});async function E(){try{e.value=await W.get("/api/status"),s.value=null}catch(S){s.value=S.message}finally{t.value=!1}}async function N(){a.value=!0;try{n.value=await W.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await W.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function b(){try{const S=await W.get("/api/knowledge");c.value=(Array.isArray(S)?S:[]).reduce(($,G)=>$+(G.chunks||0),0)}catch{c.value=null}}async function _(){try{const S=await W.get("/api/agents");r.value=S.filter($=>$.status==="running")}catch{}}async function A(){d.value={...d.value,reload:!0};try{await W.post("/api/reload"),_e.success("Config reloaded")}catch(S){_e.error(S.message)}d.value={...d.value,reload:!1}}async function D(){if(!await os({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const $=e.value.session_count;e.value={...e.value,session_count:0};try{const G=await W.post("/api/sessions/clear-all");_e.success(`Cleared ${G.count} session${G.count!==1?"s":""}`),await E()}catch(G){e.value={...e.value,session_count:$},_e.error(G.message)}d.value={...d.value,clearSessions:!1}}async function O(){if(!await os({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const $=e.value.loop_count;e.value={...e.value,loop_count:0};try{const G=await W.post("/api/loops/stop-all");_e.success(G.result),await E()}catch(G){e.value={...e.value,loop_count:$},_e.error(G.message)}d.value={...d.value,stopLoops:!1}}function C(){t.value=!0,s.value=null,E(),N(),y(),_()}let T=null,L=null,B=null;function P(S){if(S.payload&&S.payload.tool_name){const $={...S.payload,_isNew:!0,_key:++u};n.value.unshift($),n.value.length>10&&n.value.pop(),o.value++,$.error&&(i.value.unshift($),i.value.length>5&&i.value.pop()),setTimeout(()=>{$._isNew=!1},1500),clearTimeout(B),B=setTimeout(()=>{o.value=0},1e4)}}return He(async()=>{await Promise.all([E(),N(),y(),_(),b()]),T=setInterval(E,15e3),L=setInterval(_,1e4),We.subscribe("events",P)}),gt(()=>{T&&clearInterval(T),L&&clearInterval(L),clearTimeout(B),We.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:v,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:N,fetchStatus:E,formatTime:Nc,formatDuration:Da,retry:C,reloadConfig:A,clearSessions:D,stopAllLoops:O}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Tu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function U_(e){if(Array.isArray(e))return e}function B_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function H_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function V_(e,t){return U_(e)||B_(e,t)||j_(e,t)||H_()}function j_(e,t){if(e){if(typeof e=="string")return Tu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Tu(e,t):void 0}}const ag=Object.entries,Cu=Object.setPrototypeOf,z_=Object.isFrozen,q_=Object.getPrototypeOf,K_=Object.getOwnPropertyDescriptor;let Gt=Object.freeze,vs=Object.seal,ua=Object.create,ig=typeof Reflect<"u"&&Reflect,Eo=ig.apply,Ao=ig.construct;Gt||(Gt=function(t){return t});vs||(vs=function(t){return t});Eo||(Eo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Ao||(Ao=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Vs=xt(Array.prototype.forEach),G_=xt(Array.prototype.lastIndexOf),Eu=xt(Array.prototype.pop),la=xt(Array.prototype.push),W_=xt(Array.prototype.splice),Vt=Array.isArray,ei=xt(String.prototype.toLowerCase),Hr=xt(String.prototype.toString),Au=xt(String.prototype.match),ra=xt(String.prototype.replace),Ru=xt(String.prototype.indexOf),Z_=xt(String.prototype.trim),J_=xt(Number.prototype.toString),Y_=xt(Boolean.prototype.toString),Iu=typeof BigInt>"u"?null:xt(BigInt.prototype.toString),Nu=typeof Symbol>"u"?null:xt(Symbol.prototype.toString),ot=xt(Object.prototype.hasOwnProperty),Ga=xt(Object.prototype.toString),Rt=xt(RegExp.prototype.test),Nn=Q_(TypeError);function xt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Eo(e,t,n)}}function Q_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Ao(e,s)}}function Oe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:ei;if(Cu&&Cu(e,null),!Vt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(z_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function X_(e){for(let t=0;t<e.length;t++)ot(e,t)||(e[t]=null);return e}function Mt(e){const t=ua(null);for(const n of ag(e)){var s=V_(n,2);const a=s[0],i=s[1];ot(e,a)&&(Vt(i)?t[a]=X_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Mt(i):t[a]=i)}return t}function ek(e){switch(typeof e){case"string":return e;case"number":return J_(e);case"boolean":return Y_(e);case"bigint":return Iu?Iu(e):"0";case"symbol":return Nu?Nu(e):"Symbol()";case"undefined":return Ga(e);case"function":case"object":{if(e===null)return Ga(e);const t=e,s=Rs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Ga(n)}return Ga(e)}default:return Ga(e)}}function Rs(e,t){for(;e!==null;){const n=K_(e,t);if(n){if(n.get)return xt(n.get);if(typeof n.value=="function")return xt(n.value)}e=q_(e)}function s(){return null}return s}function tk(e){try{return Rt(e,""),!0}catch{return!1}}const Lu=Gt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Vr=Gt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),jr=Gt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),sk=Gt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),zr=Gt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),nk=Gt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Ou=Gt(["#text"]),Du=Gt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),qr=Gt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Mu=Gt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),sl=Gt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),ak=vs(/{{[\w\W]*|^[\w\W]*}}/g),ik=vs(/<%[\w\W]*|^[\w\W]*%>/g),lk=vs(/\${[\w\W]*/g),rk=vs(/^data-[\-\w.\u00B7-\uFFFF]+$/),ok=vs(/^aria-[\-\w]+$/),Pu=vs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),ck=vs(/^(?:\w+script|data):/i),dk=vs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),uk=vs(/^html$/i),fk=vs(/^[a-z][.\w]*(-[.\w]+)+$/i),Es={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},pk=function(){return typeof window>"u"?null:window},hk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Fu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function lg(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:pk();const t=ve=>lg(ve);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Es.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,f=r.prototype,p=Rs(f,"cloneNode"),v=Rs(f,"remove"),g=Rs(f,"nextSibling"),E=Rs(f,"childNodes"),N=Rs(f,"parentNode"),y=Rs(f,"shadowRoot"),b=Rs(f,"attributes"),_=l&&l.prototype?Rs(l.prototype,"nodeType"):null,A=l&&l.prototype?Rs(l.prototype,"nodeName"):null;if(typeof i=="function"){const ve=s.createElement("template");ve.content&&ve.content.ownerDocument&&(s=ve.content.ownerDocument)}let D,O="",C,T=!1,L=0;const B=function(){if(L>0)throw Nn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(w){B(),L++;try{return D.createHTML(w)}finally{L--}},S=function(w){B(),L++;try{return D.createScriptURL(w)}finally{L--}},$=function(){return T||(C=hk(u,a),T=!0),C},G=s,q=G.implementation,k=G.createNodeIterator,x=G.createDocumentFragment,U=G.getElementsByTagName,de=n.importNode;let ce=Fu();t.isSupported=typeof ag=="function"&&typeof N=="function"&&q&&q.createHTMLDocument!==void 0;const se=ak,fe=ik,Q=lk,ue=rk,Ie=ok,j=ck,oe=dk,ie=fk;let me=Pu,pe=null;const Le=Oe({},[...Lu,...Vr,...jr,...zr,...Ou]);let m=null;const R=Oe({},[...Du,...qr,...Mu,...sl]);let M=Object.seal(ua(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),Z=null,I=null;const F=Object.seal(ua(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Y=!0,ee=!0,te=!1,X=!0,be=!1,le=!0,ge=!1,xe=!1,ke=!1,Ee=!1,H=!1,re=!1,ye=!0,Me=!1;const Ue="user-content-";let Je=!0,ut=!1,Ye={},Ke=null;const Wt=Oe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let bs=null;const Ts=Oe({},["audio","video","img","source","image","track"]);let Cn=null;const Xn=Oe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),cn="http://www.w3.org/1998/Math/MathML",dn="http://www.w3.org/2000/svg",z="http://www.w3.org/1999/xhtml";let Se=z,Cs=!1,En=null;const br=Oe({},[cn,dn,z],Hr);let $a=Oe({},["mi","mo","mn","ms","mtext"]),Ua=Oe({},["annotation-xml"]);const yr=Oe({},["title","style","font","a","script"]);let ys=null;const ea=["application/xhtml+xml","text/html"],ta="text/html";let it=null,Fs=null;const V=s.createElement("form"),ne=function(w){return w instanceof RegExp||w instanceof Function},Te=function(){let w=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Fs&&Fs===w)return;(!w||typeof w!="object")&&(w={}),w=Mt(w),ys=ea.indexOf(w.PARSER_MEDIA_TYPE)===-1?ta:w.PARSER_MEDIA_TYPE,it=ys==="application/xhtml+xml"?Hr:ei,pe=ot(w,"ALLOWED_TAGS")&&Vt(w.ALLOWED_TAGS)?Oe({},w.ALLOWED_TAGS,it):Le,m=ot(w,"ALLOWED_ATTR")&&Vt(w.ALLOWED_ATTR)?Oe({},w.ALLOWED_ATTR,it):R,En=ot(w,"ALLOWED_NAMESPACES")&&Vt(w.ALLOWED_NAMESPACES)?Oe({},w.ALLOWED_NAMESPACES,Hr):br,Cn=ot(w,"ADD_URI_SAFE_ATTR")&&Vt(w.ADD_URI_SAFE_ATTR)?Oe(Mt(Xn),w.ADD_URI_SAFE_ATTR,it):Xn,bs=ot(w,"ADD_DATA_URI_TAGS")&&Vt(w.ADD_DATA_URI_TAGS)?Oe(Mt(Ts),w.ADD_DATA_URI_TAGS,it):Ts,Ke=ot(w,"FORBID_CONTENTS")&&Vt(w.FORBID_CONTENTS)?Oe({},w.FORBID_CONTENTS,it):Wt,Z=ot(w,"FORBID_TAGS")&&Vt(w.FORBID_TAGS)?Oe({},w.FORBID_TAGS,it):Mt({}),I=ot(w,"FORBID_ATTR")&&Vt(w.FORBID_ATTR)?Oe({},w.FORBID_ATTR,it):Mt({}),Ye=ot(w,"USE_PROFILES")?w.USE_PROFILES&&typeof w.USE_PROFILES=="object"?Mt(w.USE_PROFILES):w.USE_PROFILES:!1,Y=w.ALLOW_ARIA_ATTR!==!1,ee=w.ALLOW_DATA_ATTR!==!1,te=w.ALLOW_UNKNOWN_PROTOCOLS||!1,X=w.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=w.SAFE_FOR_TEMPLATES||!1,le=w.SAFE_FOR_XML!==!1,ge=w.WHOLE_DOCUMENT||!1,Ee=w.RETURN_DOM||!1,H=w.RETURN_DOM_FRAGMENT||!1,re=w.RETURN_TRUSTED_TYPE||!1,ke=w.FORCE_BODY||!1,ye=w.SANITIZE_DOM!==!1,Me=w.SANITIZE_NAMED_PROPS||!1,Je=w.KEEP_CONTENT!==!1,ut=w.IN_PLACE||!1,me=tk(w.ALLOWED_URI_REGEXP)?w.ALLOWED_URI_REGEXP:Pu,Se=typeof w.NAMESPACE=="string"?w.NAMESPACE:z,$a=ot(w,"MATHML_TEXT_INTEGRATION_POINTS")&&w.MATHML_TEXT_INTEGRATION_POINTS&&typeof w.MATHML_TEXT_INTEGRATION_POINTS=="object"?Mt(w.MATHML_TEXT_INTEGRATION_POINTS):Oe({},["mi","mo","mn","ms","mtext"]),Ua=ot(w,"HTML_INTEGRATION_POINTS")&&w.HTML_INTEGRATION_POINTS&&typeof w.HTML_INTEGRATION_POINTS=="object"?Mt(w.HTML_INTEGRATION_POINTS):Oe({},["annotation-xml"]);const K=ot(w,"CUSTOM_ELEMENT_HANDLING")&&w.CUSTOM_ELEMENT_HANDLING&&typeof w.CUSTOM_ELEMENT_HANDLING=="object"?Mt(w.CUSTOM_ELEMENT_HANDLING):ua(null);if(M=ua(null),ot(K,"tagNameCheck")&&ne(K.tagNameCheck)&&(M.tagNameCheck=K.tagNameCheck),ot(K,"attributeNameCheck")&&ne(K.attributeNameCheck)&&(M.attributeNameCheck=K.attributeNameCheck),ot(K,"allowCustomizedBuiltInElements")&&typeof K.allowCustomizedBuiltInElements=="boolean"&&(M.allowCustomizedBuiltInElements=K.allowCustomizedBuiltInElements),be&&(ee=!1),H&&(Ee=!0),Ye&&(pe=Oe({},Ou),m=ua(null),Ye.html===!0&&(Oe(pe,Lu),Oe(m,Du)),Ye.svg===!0&&(Oe(pe,Vr),Oe(m,qr),Oe(m,sl)),Ye.svgFilters===!0&&(Oe(pe,jr),Oe(m,qr),Oe(m,sl)),Ye.mathMl===!0&&(Oe(pe,zr),Oe(m,Mu),Oe(m,sl))),F.tagCheck=null,F.attributeCheck=null,ot(w,"ADD_TAGS")&&(typeof w.ADD_TAGS=="function"?F.tagCheck=w.ADD_TAGS:Vt(w.ADD_TAGS)&&(pe===Le&&(pe=Mt(pe)),Oe(pe,w.ADD_TAGS,it))),ot(w,"ADD_ATTR")&&(typeof w.ADD_ATTR=="function"?F.attributeCheck=w.ADD_ATTR:Vt(w.ADD_ATTR)&&(m===R&&(m=Mt(m)),Oe(m,w.ADD_ATTR,it))),ot(w,"ADD_URI_SAFE_ATTR")&&Vt(w.ADD_URI_SAFE_ATTR)&&Oe(Cn,w.ADD_URI_SAFE_ATTR,it),ot(w,"FORBID_CONTENTS")&&Vt(w.FORBID_CONTENTS)&&(Ke===Wt&&(Ke=Mt(Ke)),Oe(Ke,w.FORBID_CONTENTS,it)),ot(w,"ADD_FORBID_CONTENTS")&&Vt(w.ADD_FORBID_CONTENTS)&&(Ke===Wt&&(Ke=Mt(Ke)),Oe(Ke,w.ADD_FORBID_CONTENTS,it)),Je&&(pe["#text"]=!0),ge&&Oe(pe,["html","head","body"]),pe.table&&(Oe(pe,["tbody"]),delete Z.tbody),w.TRUSTED_TYPES_POLICY){if(typeof w.TRUSTED_TYPES_POLICY.createHTML!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof w.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=D;D=w.TRUSTED_TYPES_POLICY;try{O=P("")}catch(Ce){throw D=ae,Ce}}else w.TRUSTED_TYPES_POLICY===null?(D=void 0,O=""):(D===void 0&&(D=$()),D&&typeof O=="string"&&(O=P("")));(ce.uponSanitizeElement.length>0||ce.uponSanitizeAttribute.length>0)&&pe===Le&&(pe=Mt(pe)),ce.uponSanitizeAttribute.length>0&&m===R&&(m=Mt(m)),Gt&&Gt(w),Fs=w},Xe=Oe({},[...Vr,...jr,...sk]),rt=Oe({},[...zr,...nk]),Zt=function(w){let K=N(w);(!K||!K.tagName)&&(K={namespaceURI:Se,tagName:"template"});const ae=ei(w.tagName),Ce=ei(K.tagName);return En[w.namespaceURI]?w.namespaceURI===dn?K.namespaceURI===z?ae==="svg":K.namespaceURI===cn?ae==="svg"&&(Ce==="annotation-xml"||$a[Ce]):!!Xe[ae]:w.namespaceURI===cn?K.namespaceURI===z?ae==="math":K.namespaceURI===dn?ae==="math"&&Ua[Ce]:!!rt[ae]:w.namespaceURI===z?K.namespaceURI===dn&&!Ua[Ce]||K.namespaceURI===cn&&!$a[Ce]?!1:!rt[ae]&&(yr[ae]||!Xe[ae]):!!(ys==="application/xhtml+xml"&&En[w.namespaceURI]):!1},ns=function(w){la(t.removed,{element:w});try{N(w).removeChild(w)}catch{if(v(w),!N(w))throw Nn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Vc=function(w){const K=E?E(w):w.childNodes;if(K){const Ce=[];Vs(K,Re=>{la(Ce,Re)}),Vs(Ce,Re=>{try{v(Re)}catch{}})}const ae=b?b(w):null;if(ae)for(let Ce=ae.length-1;Ce>=0;--Ce){const Re=ae[Ce],De=Re&&Re.name;if(typeof De=="string")try{w.removeAttribute(De)}catch{}}},An=function(w,K){try{la(t.removed,{attribute:K.getAttributeNode(w),from:K})}catch{la(t.removed,{attribute:null,from:K})}if(K.removeAttribute(w),w==="is")if(Ee||H)try{ns(K)}catch{}else try{K.setAttribute(w,"")}catch{}},kg=function(w){const K=b?b(w):w.attributes;if(K)for(let ae=K.length-1;ae>=0;--ae){const Ce=K[ae],Re=Ce&&Ce.name;if(!(typeof Re!="string"||m[it(Re)]))try{w.removeAttribute(Re)}catch{}}},wg=function(w){const K=[w];for(;K.length>0;){const ae=K.pop();(_?_(ae):ae.nodeType)===Es.element&&kg(ae);const Re=E?E(ae):ae.childNodes;if(Re)for(let De=Re.length-1;De>=0;--De)K.push(Re[De])}},jc=function(w){let K=null,ae=null;if(ke)w="<remove></remove>"+w;else{const De=Au(w,/^[\r\n\t ]+/);ae=De&&De[0]}ys==="application/xhtml+xml"&&Se===z&&(w='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+w+"</body></html>");const Ce=D?P(w):w;if(Se===z)try{K=new d().parseFromString(Ce,ys)}catch{}if(!K||!K.documentElement){K=q.createDocument(Se,"template",null);try{K.documentElement.innerHTML=Cs?O:Ce}catch{}}const Re=K.body||K.documentElement;return w&&ae&&Re.insertBefore(s.createTextNode(ae),Re.childNodes[0]||null),Se===z?U.call(K,ge?"html":"body")[0]:ge?K.documentElement:Re},zc=function(w){return k.call(w.ownerDocument||w,w,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},xr=function(w){var K,ae;w.normalize();const Ce=k.call(w.ownerDocument||w,w,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Re=Ce.nextNode();for(;Re;){let _t=Re.data;Vs([se,fe,Q],tt=>{_t=ra(_t,tt," ")}),Re.data=_t,Re=Ce.nextNode()}const De=(K=(ae=w.querySelectorAll)===null||ae===void 0?void 0:ae.call(w,"template"))!==null&&K!==void 0?K:[];Vs(Array.from(De),_t=>{sa(_t.content)&&xr(_t.content)})},Vi=function(w){const K=A?A(w):null;return typeof K!="string"||it(K)!=="form"?!1:typeof w.nodeName!="string"||typeof w.textContent!="string"||typeof w.removeChild!="function"||w.attributes!==b(w)||typeof w.removeAttribute!="function"||typeof w.setAttribute!="function"||typeof w.namespaceURI!="string"||typeof w.insertBefore!="function"||typeof w.hasChildNodes!="function"||w.nodeType!==_(w)||w.childNodes!==E(w)},sa=function(w){if(!_||typeof w!="object"||w===null)return!1;try{return _(w)===Es.documentFragment}catch{return!1}},Ba=function(w){if(!_||typeof w!="object"||w===null)return!1;try{return typeof _(w)=="number"}catch{return!1}};function $s(ve,w,K){Vs(ve,ae=>{ae.call(t,w,K,Fs)})}const qc=function(w){let K=null;if($s(ce.beforeSanitizeElements,w,null),Vi(w))return ns(w),!0;const ae=it(A?A(w):w.nodeName);if($s(ce.uponSanitizeElement,w,{tagName:ae,allowedTags:pe}),le&&w.hasChildNodes()&&!Ba(w.firstElementChild)&&Rt(/<[/\w!]/g,w.innerHTML)&&Rt(/<[/\w!]/g,w.textContent)||le&&w.namespaceURI===z&&ae==="style"&&Ba(w.firstElementChild)||w.nodeType===Es.progressingInstruction||le&&w.nodeType===Es.comment&&Rt(/<[/\w]/g,w.data))return ns(w),!0;if(Z[ae]||!(F.tagCheck instanceof Function&&F.tagCheck(ae))&&!pe[ae]){if(!Z[ae]&&Gc(ae)&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,ae)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ae)))return!1;if(Je&&!Ke[ae]){const Re=N(w),De=E(w);if(De&&Re){const _t=De.length;for(let tt=_t-1;tt>=0;--tt){const ft=ut?De[tt]:p(De[tt],!0);Re.insertBefore(ft,g(w))}}}return ns(w),!0}return(_?_(w):w.nodeType)===Es.element&&!Zt(w)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&Rt(/<\/no(script|embed|frames)/i,w.innerHTML)?(ns(w),!0):(be&&w.nodeType===Es.text&&(K=w.textContent,Vs([se,fe,Q],Re=>{K=ra(K,Re," ")}),w.textContent!==K&&(la(t.removed,{element:w.cloneNode()}),w.textContent=K)),$s(ce.afterSanitizeElements,w,null),!1)},Kc=function(w,K,ae){if(I[K]||ye&&(K==="id"||K==="name")&&(ae in s||ae in V))return!1;const Ce=m[K]||F.attributeCheck instanceof Function&&F.attributeCheck(K,w);if(!(ee&&!I[K]&&Rt(ue,K))){if(!(Y&&Rt(Ie,K))){if(!Ce||I[K]){if(!(Gc(w)&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,w)||M.tagNameCheck instanceof Function&&M.tagNameCheck(w))&&(M.attributeNameCheck instanceof RegExp&&Rt(M.attributeNameCheck,K)||M.attributeNameCheck instanceof Function&&M.attributeNameCheck(K,w))||K==="is"&&M.allowCustomizedBuiltInElements&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,ae)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ae))))return!1}else if(!Cn[K]){if(!Rt(me,ra(ae,oe,""))){if(!((K==="src"||K==="xlink:href"||K==="href")&&w!=="script"&&Ru(ae,"data:")===0&&bs[w])){if(!(te&&!Rt(j,ra(ae,oe,"")))){if(ae)return!1}}}}}}return!0},Sg=Oe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Gc=function(w){return!Sg[ei(w)]&&Rt(ie,w)},Wc=function(w){$s(ce.beforeSanitizeAttributes,w,null);const K=w.attributes;if(!K||Vi(w))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:m,forceKeepAttr:void 0};let Ce=K.length;for(;Ce--;){const Re=K[Ce],De=Re.name,_t=Re.namespaceURI,tt=Re.value,ft=it(De),un=tt;let Ct=De==="value"?un:Z_(un);if(ae.attrName=ft,ae.attrValue=Ct,ae.keepAttr=!0,ae.forceKeepAttr=void 0,$s(ce.uponSanitizeAttribute,w,ae),Ct=ae.attrValue,Me&&(ft==="id"||ft==="name")&&Ru(Ct,Ue)!==0&&(An(De,w),Ct=Ue+Ct),le&&Rt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Ct)){An(De,w);continue}if(ft==="attributename"&&Au(Ct,"href")){An(De,w);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){An(De,w);continue}if(!X&&Rt(/\/>/i,Ct)){An(De,w);continue}be&&Vs([se,fe,Q],Jc=>{Ct=ra(Ct,Jc," ")});const Zc=it(w.nodeName);if(!Kc(Zc,ft,Ct)){An(De,w);continue}if(D&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!_t)switch(u.getAttributeType(Zc,ft)){case"TrustedHTML":{Ct=P(Ct);break}case"TrustedScriptURL":{Ct=S(Ct);break}}if(Ct!==un)try{_t?w.setAttributeNS(_t,De,Ct):w.setAttribute(De,Ct),Vi(w)?ns(w):Eu(t.removed)}catch{An(De,w)}}$s(ce.afterSanitizeAttributes,w,null)},ji=function(w){let K=null;const ae=zc(w);for($s(ce.beforeSanitizeShadowDOM,w,null);K=ae.nextNode();)if($s(ce.uponSanitizeShadowNode,K,null),qc(K),Wc(K),sa(K.content)&&ji(K.content),(_?_(K):K.nodeType)===Es.element){const Re=y?y(K):K.shadowRoot;sa(Re)&&(_r(Re),ji(Re))}$s(ce.afterSanitizeShadowDOM,w,null)},_r=function(w){const K=[{node:w,shadow:null}];for(;K.length>0;){const ae=K.pop();if(ae.shadow){ji(ae.shadow);continue}const Ce=ae.node,De=(_?_(Ce):Ce.nodeType)===Es.element,_t=E?E(Ce):Ce.childNodes;if(_t)for(let tt=_t.length-1;tt>=0;--tt)K.push({node:_t[tt],shadow:null});if(De){const tt=A?A(Ce):null;if(typeof tt=="string"&&it(tt)==="template"){const ft=Ce.content;sa(ft)&&K.push({node:ft,shadow:null})}}if(De){const tt=y?y(Ce):Ce.shadowRoot;sa(tt)&&K.push({node:null,shadow:tt},{node:tt,shadow:null})}}};return t.sanitize=function(ve){let w=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},K=null,ae=null,Ce=null,Re=null;if(Cs=!ve,Cs&&(ve="<!-->"),typeof ve!="string"&&!Ba(ve)&&(ve=ek(ve),typeof ve!="string"))throw Nn("dirty is not a string, aborting");if(!t.isSupported)return ve;xe||Te(w),t.removed=[];const De=ut&&typeof ve!="string"&&Ba(ve);if(De){const ft=A?A(ve):ve.nodeName;if(typeof ft=="string"){const un=it(ft);if(!pe[un]||Z[un])throw Nn("root node is forbidden and cannot be sanitized in-place")}if(Vi(ve))throw Nn("root node is clobbered and cannot be sanitized in-place");try{_r(ve)}catch(un){throw Vc(ve),un}}else if(Ba(ve))K=jc("<!---->"),ae=K.ownerDocument.importNode(ve,!0),ae.nodeType===Es.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?K=ae:K.appendChild(ae),_r(ae);else{if(!Ee&&!be&&!ge&&ve.indexOf("<")===-1)return D&&re?P(ve):ve;if(K=jc(ve),!K)return Ee?null:re?O:""}K&&ke&&ns(K.firstChild);const _t=zc(De?ve:K);try{for(;Ce=_t.nextNode();)qc(Ce),Wc(Ce),sa(Ce.content)&&ji(Ce.content)}catch(ft){throw De&&Vc(ve),ft}if(De)return Vs(t.removed,ft=>{ft.element&&wg(ft.element)}),be&&xr(ve),ve;if(Ee){if(be&&xr(K),H)for(Re=x.call(K.ownerDocument);K.firstChild;)Re.appendChild(K.firstChild);else Re=K;return(m.shadowroot||m.shadowrootmode)&&(Re=de.call(n,Re,!0)),Re}let tt=ge?K.outerHTML:K.innerHTML;return ge&&pe["!doctype"]&&K.ownerDocument&&K.ownerDocument.doctype&&K.ownerDocument.doctype.name&&Rt(uk,K.ownerDocument.doctype.name)&&(tt="<!DOCTYPE "+K.ownerDocument.doctype.name+`>
`+tt),be&&Vs([se,fe,Q],ft=>{tt=ra(tt,ft," ")}),D&&re?P(tt):tt},t.setConfig=function(){let ve=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(ve),xe=!0},t.clearConfig=function(){Fs=null,xe=!1,D=C,O=""},t.isValidAttribute=function(ve,w,K){Fs||Te({});const ae=it(ve),Ce=it(w);return Kc(ae,Ce,K)},t.addHook=function(ve,w){typeof w=="function"&&la(ce[ve],w)},t.removeHook=function(ve,w){if(w!==void 0){const K=G_(ce[ve],w);return K===-1?void 0:W_(ce[ve],K,1)[0]}return Eu(ce[ve])},t.removeHooks=function(ve){ce[ve]=[]},t.removeAllHooks=function(){ce=Fu()},t}var $u=lg();function Oc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Qn=Oc();function rg(e){Qn=e}var ci={exec:()=>null};function Ze(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},gk=/^(?:[ \t]*(?:\n|$))+/,mk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,vk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Hi=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,bk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Dc=/(?:[*+-]|\d{1,9}[.)])/,og=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,cg=Ze(og).replace(/bull/g,Dc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),yk=Ze(og).replace(/bull/g,Dc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Mc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,xk=/^[^\n]+/,Pc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,_k=Ze(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Pc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),kk=Ze(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Dc).getRegex(),gr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Fc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,wk=Ze("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Fc).replace("tag",gr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),dg=Ze(Mc).replace("hr",Hi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",gr).getRegex(),Sk=Ze(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",dg).getRegex(),$c={blockquote:Sk,code:mk,def:_k,fences:vk,heading:bk,hr:Hi,html:wk,lheading:cg,list:kk,newline:gk,paragraph:dg,table:ci,text:xk},Uu=Ze("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Hi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",gr).getRegex(),Tk={...$c,lheading:yk,table:Uu,paragraph:Ze(Mc).replace("hr",Hi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Uu).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",gr).getRegex()},Ck={...$c,html:Ze(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Fc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:ci,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:Ze(Mc).replace("hr",Hi).replace("heading",` *#{1,6} *[^
]`).replace("lheading",cg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Ek=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Ak=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,ug=/^( {2,}|\\)\n(?!\s*$)/,Rk=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,mr=/[\p{P}\p{S}]/u,Uc=/[\s\p{P}\p{S}]/u,fg=/[^\s\p{P}\p{S}]/u,Ik=Ze(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Uc).getRegex(),pg=/(?!~)[\p{P}\p{S}]/u,Nk=/(?!~)[\s\p{P}\p{S}]/u,Lk=/(?:[^\s\p{P}\p{S}]|~)/u,Ok=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,hg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Dk=Ze(hg,"u").replace(/punct/g,mr).getRegex(),Mk=Ze(hg,"u").replace(/punct/g,pg).getRegex(),gg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Pk=Ze(gg,"gu").replace(/notPunctSpace/g,fg).replace(/punctSpace/g,Uc).replace(/punct/g,mr).getRegex(),Fk=Ze(gg,"gu").replace(/notPunctSpace/g,Lk).replace(/punctSpace/g,Nk).replace(/punct/g,pg).getRegex(),$k=Ze("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,fg).replace(/punctSpace/g,Uc).replace(/punct/g,mr).getRegex(),Uk=Ze(/\\(punct)/,"gu").replace(/punct/g,mr).getRegex(),Bk=Ze(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Hk=Ze(Fc).replace("(?:-->|$)","-->").getRegex(),Vk=Ze("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Hk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Bl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,jk=Ze(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Bl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),mg=Ze(/^!?\[(label)\]\[(ref)\]/).replace("label",Bl).replace("ref",Pc).getRegex(),vg=Ze(/^!?\[(ref)\](?:\[\])?/).replace("ref",Pc).getRegex(),zk=Ze("reflink|nolink(?!\\()","g").replace("reflink",mg).replace("nolink",vg).getRegex(),Bc={_backpedal:ci,anyPunctuation:Uk,autolink:Bk,blockSkip:Ok,br:ug,code:Ak,del:ci,emStrongLDelim:Dk,emStrongRDelimAst:Pk,emStrongRDelimUnd:$k,escape:Ek,link:jk,nolink:vg,punctuation:Ik,reflink:mg,reflinkSearch:zk,tag:Vk,text:Rk,url:ci},qk={...Bc,link:Ze(/^!?\[(label)\]\((.*?)\)/).replace("label",Bl).getRegex(),reflink:Ze(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Bl).getRegex()},Ro={...Bc,emStrongRDelimAst:Fk,emStrongLDelim:Mk,url:Ze(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Kk={...Ro,br:Ze(ug).replace("{2,}","*").getRegex(),text:Ze(Ro.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},nl={normal:$c,gfm:Tk,pedantic:Ck},Wa={normal:Bc,gfm:Ro,breaks:Kk,pedantic:qk},Gk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Bu=e=>Gk[e];function Is(e,t){if(t){if(qt.escapeTest.test(e))return e.replace(qt.escapeReplace,Bu)}else if(qt.escapeTestNoEncode.test(e))return e.replace(qt.escapeReplaceNoEncode,Bu);return e}function Hu(e){try{e=encodeURI(e).replace(qt.percentDecode,"%")}catch{return null}return e}function Vu(e,t){var i;const s=e.replace(qt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(qt.slashPipe,"|");return n}function Za(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function Wk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function ju(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function Zk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Hl=class{constructor(e){et(this,"options");et(this,"rules");et(this,"lexer");this.options=e||Qn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Za(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=Zk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Za(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Za(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Za(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,v=p.raw+`
`+s.join(`
`),g=this.blockquote(v);i[i.length-1]=g,n=n.substring(0,n.length-p.raw.length)+g.raw,a=a.substring(0,a.length-p.text.length)+g.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,v=p.raw+`
`+s.join(`
`),g=this.list(v);i[i.length-1]=g,n=n.substring(0,n.length-f.raw.length)+g.raw,a=a.substring(0,a.length-p.raw.length)+g.raw,s=v.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,N=>" ".repeat(3*N.length)),f=e.split(`
`,1)[0],p=!u.trim(),v=0;if(this.options.pedantic?(v=2,d=u.trimStart()):p?v=t[1].length+1:(v=t[2].search(this.rules.other.nonSpaceChar),v=v>4?1:v,d=u.slice(v),v+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const N=this.rules.other.nextBulletRegex(v),y=this.rules.other.hrRegex(v),b=this.rules.other.fencesBeginRegex(v),_=this.rules.other.headingBeginRegex(v),A=this.rules.other.htmlBeginRegex(v);for(;e;){const D=e.split(`
`,1)[0];let O;if(f=D,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),O=f):O=f.replace(this.rules.other.tabCharGlobal,"    "),b.test(f)||_.test(f)||A.test(f)||N.test(f)||y.test(f))break;if(O.search(this.rules.other.nonSpaceChar)>=v||!f.trim())d+=`
`+O.slice(v);else{if(p||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||b.test(u)||_.test(u)||y.test(u))break;d+=`
`+f}!p&&!f.trim()&&(p=!0),c+=D+`
`,e=e.substring(D.length+1),u=O.slice(v)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,E;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(E=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:E,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Vu(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Vu(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Za(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Wk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),ju(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return ju(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,f=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const v=f.slice(1,-1);return{type:"em",raw:f,text:v,tokens:this.lexer.inlineTokens(v)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Js=class Io{constructor(t){et(this,"tokens");et(this,"options");et(this,"state");et(this,"tokenizer");et(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Qn,this.options.tokenizer=this.options.tokenizer||new Hl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:qt,block:nl.normal,inline:Wa.normal};this.options.pedantic?(s.block=nl.pedantic,s.inline=Wa.pedantic):this.options.gfm&&(s.block=nl.gfm,this.options.breaks?s.inline=Wa.breaks:s.inline=Wa.gfm),this.tokenizer.rules=s}static get rules(){return{block:nl,inline:Wa}}static lex(t,s){return new Io(s).lex(t)}static lexInline(t,s){return new Io(s).inlineTokens(t)}lex(t){t=t.replace(qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(qt.tabCharGlobal,"    ").replace(qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(f=>{u=f.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(d=f.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const f=s.at(-1);d.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let v;this.options.extensions.startInline.forEach(g=>{v=g.call({lexer:this},p),typeof v=="number"&&v>=0&&(f=Math.min(f,v))}),f<1/0&&f>=0&&(u=t.substring(0,f+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Vl=class{constructor(e){et(this,"options");et(this,"parser");this.options=e||Qn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(qt.notSpaceStart))==null?void 0:i[0],a=e.replace(qt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Is(n)+'">'+(s?a:Is(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Is(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Is(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Is(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Hu(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Is(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Hu(e);if(a===null)return Is(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Is(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Is(e.text)}},Hc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ys=class No{constructor(t){et(this,"options");et(this,"renderer");et(this,"textRenderer");this.options=t||Qn,this.options.renderer=this.options.renderer||new Vl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Hc}static parse(t,s){return new No(s).parse(t)}static parseInline(t,s){return new No(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Zr,fl=(Zr=class{constructor(e){et(this,"options");et(this,"block");this.options=e||Qn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Js.lex:Js.lexInline}provideParser(){return this.block?Ys.parse:Ys.parseInline}},et(Zr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Zr),Jk=class{constructor(...e){et(this,"defaults",Oc());et(this,"options",this.setOptions);et(this,"parse",this.parseMarkdown(!0));et(this,"parseInline",this.parseMarkdown(!1));et(this,"Parser",Ys);et(this,"Renderer",Vl);et(this,"TextRenderer",Hc);et(this,"Lexer",Js);et(this,"Tokenizer",Hl);et(this,"Hooks",fl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Vl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Hl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new fl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];fl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Js.lex(e,t??this.defaults)}parser(e,t){return Ys.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?Js.lex:Js.lexInline,o=i.hooks?i.hooks.provideParser():e?Ys.parse:Ys.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Is(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Kn=new Jk;function qe(e,t){return Kn.parse(e,t)}qe.options=qe.setOptions=function(e){return Kn.setOptions(e),qe.defaults=Kn.defaults,rg(qe.defaults),qe};qe.getDefaults=Oc;qe.defaults=Qn;qe.use=function(...e){return Kn.use(...e),qe.defaults=Kn.defaults,rg(qe.defaults),qe};qe.walkTokens=function(e,t){return Kn.walkTokens(e,t)};qe.parseInline=Kn.parseInline;qe.Parser=Ys;qe.parser=Ys.parse;qe.Renderer=Vl;qe.TextRenderer=Hc;qe.Lexer=Js;qe.lexer=Js.lex;qe.Tokenizer=Hl;qe.Hooks=fl;qe.parse=qe;qe.options;qe.setOptions;qe.use;qe.walkTokens;qe.parseInline;Ys.parse;Js.lex;const Yk={breaks:!0,gfm:!0};function zu(e){if(!e)return"";try{if(typeof qe<"u"&&qe.parse){const t=qe.parse(e,Yk);return typeof $u<"u"?$u.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Qk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Xk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function ew(e){return Xk[e]||"wrench"}const tw=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function qu(e){if(!e)return[];const t=e.match(tw);return t?[...new Set(t)]:[]}const sw={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=J(()=>t.value.trim().length>0&&!s.value),u=J(()=>{const S=We.state;return S==="connected"?"Connected":S==="reconnecting"?"Reconnecting…":S==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=J(()=>{const S=Math.floor(i.value/4)%f.length,$=i.value;return $>3?`${f[S]} (${$}s)`:f[0]});function v(){St(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const S=a.value;S.style.height="auto",S.style.height=Math.min(S.scrollHeight,120)+"px"}function E(S,$,G={}){const q={id:++o,role:S,content:$,timestamp:Date.now(),html:S==="bot"?zu($):"",tools_used:G.tools_used||[],is_error:G.is_error||!1,images:S==="bot"?qu($):[],files:G.files||[],_showTools:!1};return e.value.push(q),v(),S==="bot"&&St(()=>N()),q}function N(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach($=>{$.setAttribute("data-copy","true"),$.style.position="relative";const G=document.createElement("button");G.className="chat-code-copy",G.textContent="Copy",G.addEventListener("click",()=>{const q=$.querySelector("code"),k=q?q.textContent:$.textContent;navigator.clipboard.writeText(k).then(()=>{G.textContent="Copied!",setTimeout(()=>{G.textContent="Copy"},1500)}).catch(()=>{})}),$.appendChild(G)})}function y(S){if(S===0)return!0;const $=e.value[S-1],G=e.value[S],q=new Date($.timestamp).toDateString(),k=new Date(G.timestamp).toDateString();return q!==k}function b(S){const $=new Date(S),G=new Date;if($.toDateString()===G.toDateString())return"Today";const q=new Date(G);return q.setDate(q.getDate()-1),$.toDateString()===q.toDateString()?"Yesterday":$.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function _(S){t.value=S,St(()=>B())}function A(S){window.open(S,"_blank","noopener")}function D(S){S.target.style.display="none"}function O(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function C(){r&&(clearInterval(r),r=null),i.value=0}function T(S){s.value&&(s.value=!1,C(),S.type==="chat_response"?E("bot",S.content,{tools_used:S.tools_used||[],is_error:S.is_error||!1,files:S.files||[]}):S.type==="chat_error"&&E("bot",S.error||"Unknown error",{is_error:!0}),St(()=>{var $;return($=a.value)==null?void 0:$.focus()}))}async function L(S){try{const $=await W.post("/api/chat",{content:S,channel_id:l.value});E("bot",$.response,{tools_used:$.tools_used||[],is_error:$.is_error||!1,files:$.files||[]})}catch($){E("bot",$.message||"Failed to send message",{is_error:!0})}}async function B(){const S=t.value.trim();if(!S||s.value)return;E("user",S),t.value="",s.value=!0,O(),a.value&&(a.value.style.height="auto"),We.connected&&We.sendChat(S,{channelId:l.value})||(await L(S),s.value=!1,C()),St(()=>{var G;return(G=a.value)==null?void 0:G.focus()})}async function P(){try{if(!l.value){const $=await W.get("/api/auth/session");l.value=$.channel_id||$.user_id||"web-user"}const S=await W.get("/api/sessions/"+encodeURIComponent(l.value));if(S&&S.messages&&S.messages.length>0){for(const $ of S.messages){const G=$.role==="user"?"user":"bot";let q=$.content||"";if(G==="user"){const x=q.match(/^\[.*?\]:\s*/);x&&(q=q.slice(x[0].length))}if(!q.trim())continue;const k={id:++o,role:G,content:q,timestamp:$.timestamp?$.timestamp*1e3:Date.now(),html:G==="bot"?zu(q):"",tools_used:[],is_error:!1,images:G==="bot"?qu(q):[],files:[],_showTools:!1};e.value.push(k)}St(()=>{v(),N()})}}catch{}}return He(()=>{We.subscribe("chat",T),P(),St(()=>{var S;return(S=a.value)==null?void 0:S.focus()})}),gt(()=>{We.unsubscribe("chat",T),C()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:u,typingText:p,suggestions:c,send:B,autoResize:g,formatTime:Qk,formatDate:b,showDateSeparator:y,useSuggestion:_,openImage:A,onImageError:D,getToolIcon:ew}}},vr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=N_(),s=Xh(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ls(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},nw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,v;const d=c.payload||c,u=d.type||c.type;if(u==="tool_start"){const g={id:`${d.action}-${Date.now()}`,tool:d.action,actor:d.actor||"",channel:d.channel_id||"",iteration:((f=d.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(u==="tool_end"){const g=e.value.findIndex(E=>E.tool===d.action&&E.status==="running");if(g>=0){const E=e.value[g];E.status=(p=d.metadata)!=null&&p.error?"error":"success",E.elapsed=((v=d.metadata)==null?void 0:v.elapsed_ms)||Date.now()-E.startTime,E.result=d.detail||"",E.fadingOut=!0,setTimeout(()=>{const N=e.value.indexOf(E);N>=0&&e.value.splice(N,1),t.value.unshift(E),t.value.length>n&&t.value.pop()},5e3)}return}if(u==="tool_stream"){const g=d.tool_name||"unknown";if(d.finished)delete s.value[g];else{const N=((s.value[g]||"")+(d.chunk||"")).split(`
`);s.value[g]=N.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(d=>{d.status==="running"&&(d.elapsed=c-d.startTime)})}He(()=>{We.on("events",a),i=setInterval(l,500)}),gt(()=>{We.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"clock":c==="success"?"success":c==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
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
  `},bg=Symbol("agent-detail-cancelled"),aw=15e3;function iw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((p,v)=>{o=p,c=v});function u(p,v){r||(r=!0,l!==null&&a(l),l=null,(p?o:c)(v))}let f;try{f=e(i==null?void 0:i.signal)}catch(p){u(!1,p)}return r||Promise.resolve(f).then(p=>u(!0,p),p=>u(!1,p)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const p=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${p}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,bg),i==null||i.abort()}}}function yg({state:e,requestDetail:t,timeoutMs:s=aw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const f=l;l=null,f==null||f.cancel()}function o(f,{initial:p,coalesce:v}){if(!f)return Promise.resolve();if(v&&l&&l.agentId===f&&e.detailId===f)return l.promise;r();const g={agentId:f,cancel:null,promise:null};l=g,p?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=iw(N=>t(f,{signal:N}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return g.cancel=E.cancel,g.promise=(async()=>{let N=null,y=null;try{N=await E.promise}catch(b){y=b}N!==bg&&(l!==g||e.detailId!==f||(l=null,!y&&(N===null||typeof N!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=N,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(f){return e.detailId=f,o(f,{initial:!0,coalesce:!1})}function d(){const f=e.detailId;return f?o(f,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function lw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const rw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=J(()=>e.value.filter(x=>x.status==="running").length),o=J(()=>e.value.filter(x=>x.status==="completed").length),c=J(()=>e.value.filter(x=>["failed","timeout","killed"].includes(x.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(x=>["failed","timeout","killed"].includes(x.status)):e.value.filter(x=>x.status===i.value));function f(x){const U=Number(x.max_iterations)||0;return U<=0?0:Math.min(100,Math.round(x.iteration_count/U*100))}function p(x){return(Number(x.max_iterations)||0)>0}function v(x,U){return x?x==="N/A"?"N/A":U==="current_inheritance"?`inherit (currently ${x})`:x:"unknown"}function g(x){return v(x.display_model,x.display_model_source||x.display_source)}function E(x){return v(x.display_reasoning_effort,x.display_reasoning_effort_source||x.display_source)}function N(x){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[x]||""}const y=h(null),b=h(null),_=h(!1),A=h(null),D=h(""),C=yg({state:{get detail(){return y.value},set detail(x){y.value=x},get detailId(){return b.value},set detailId(x){b.value=x},get detailLoading(){return _.value},set detailLoading(x){_.value=x},get detailError(){return A.value},set detailError(x){A.value=x}},requestDetail:(x,{signal:U})=>W.get(`/api/agents/${encodeURIComponent(x)}`,{signal:U})});async function T(x){D.value="",await C.open(x.id)}function L(){C.close(),D.value=""}async function B(){await C.refresh()}async function P(x,U){try{await navigator.clipboard.writeText(U||""),D.value=x,setTimeout(()=>{D.value===x&&(D.value="")},1500)}catch{_e.error("Copy failed")}}async function S(x=!1){x=x===!0,x||(t.value=!0);try{const U=await W.get("/api/agents");e.value=Array.isArray(U)?U:[],s.value=null}catch(U){x||(s.value=U.message)}x||(t.value=!1)}async function $(x){const U=e.value.find(ce=>ce.id===x);if(await os({title:"Kill agent",message:`Kill agent "${(U==null?void 0:U.label)||x}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=x;try{await W.del(`/api/agents/${encodeURIComponent(x)}`),_e.success("Agent killed"),await S()}catch(ce){_e.error(ce.message||"Failed to kill agent")}n.value=null}}const G=lw({isEnabled:()=>a.value&&l,refreshList:()=>S(!0),hasOpenDetail:()=>!!b.value,refreshDetail:B});function q(){G.start()}function k(){G.stop()}return ls(a,()=>G.sync()),He(()=>{l=!0,S(),q()}),Mi(()=>{l=!0,S(!0),q()}),Pi(()=>{l=!1,k()}),gt(()=>{l=!1,k(),C.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Yn,formatDuration:Da,progressPercent:f,hasProgress:p,displayModelText:g,displayEffortText:E,displaySourceLabel:N,detail:y,detailId:b,detailLoading:_,detailError:A,copied:D,openDetail:T,closeDetail:L,copyText:P,fetchAgents:S,killAgent:$,startAutoRefresh:q,stopAutoRefresh:k}}},ow={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),f=h(null),p=h("");let v=!1;const E=yg({state:{get detail(){return c.value},set detail(k){c.value=k},get detailId(){return d.value},set detailId(k){d.value=k},get detailLoading(){return u.value},set detailLoading(k){u.value=k},get detailError(){return f.value},set detailError(k){f.value=k}},detailLabel:"Loop detail",requestDetail:(k,{signal:x})=>W.get(`/api/loops/${encodeURIComponent(k)}?limit=100`,{signal:x})});async function N(k){p.value="",await E.open(k.id)}function y(){E.close(),p.value=""}async function b(k,x){try{await navigator.clipboard.writeText(x||""),p.value=k,setTimeout(()=>{p.value===k&&(p.value="")},1500)}catch{_e.error("Copy failed")}}const _=J(()=>e.value.reduce((k,x)=>k+(x.iteration_count||0),0)),A=J(()=>e.value.filter(k=>k.status==="running").length);function D(k){return k==="running"?"loop-status-running":k==="error"?"loop-status-error":"loop-status-stopped"}function O(k){return k==="running"?"badge-success":k==="error"?"badge-danger":k==="completed"?"badge-info":"badge-warning"}function C(k){return k==="act"?"badge-warning":k==="silent"?"badge-info":"badge-success"}async function T(k=!1){k=k===!0,k||(t.value=!0);try{const x=await W.get("/api/loops");e.value=Array.isArray(x)?x:[],s.value=null}catch(x){k||(s.value=x.message)}k||(t.value=!1)}async function L(){l.value=null;const k=a.value;if(!k.goal.trim()){l.value="Goal is required";return}if(!k.channel_id.trim()){l.value="Channel ID is required";return}const x={goal:k.goal.trim(),channel_id:k.channel_id.trim(),interval_seconds:k.interval_seconds||60,mode:k.mode,max_iterations:k.max_iterations||50};k.stop_condition.trim()&&(x.stop_condition=k.stop_condition.trim()),i.value=!0;try{const U=await W.post("/api/loops",x);_e.success(`Loop started: ${U.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await T()}catch(U){l.value=U.message}i.value=!1}async function B(k){if(await os({title:"Stop loop",message:`Stop loop ${k}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=k;try{await W.del(`/api/loops/${encodeURIComponent(k)}`),_e.success("Loop stopped"),await T()}catch(U){_e.error(U.message||"Failed to stop loop")}r.value=null}}async function P(k){o.value=k;try{await W.post(`/api/loops/${encodeURIComponent(k)}/restart`),_e.success("Loop restarted"),await T()}catch(x){_e.error(x.message||"Failed to restart loop")}o.value=null}function S(k){v&&k.payload&&(k.payload.loop_id||k.payload.type==="loop")&&(T(!0),d.value&&E.refresh())}let $=null;function G(){$!==null&&clearInterval($),$=null}function q(){G(),v&&($=setInterval(()=>{T(!0),d.value&&E.refresh()},5e3))}return He(()=>{v=!0,T(),We.subscribe("events",S),q()}),Mi(()=>{v=!0,T(!0),q()}),Pi(()=>{v=!1,G()}),gt(()=>{v=!1,We.unsubscribe("events",S),G(),E.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:f,copied:p,totalIterations:_,runningCount:A,statusDotClass:D,statusBadge:O,modeBadge:C,formatAge:eg,formatDuration:Da,formatTs:Yn,formatTokens:ng,openDetail:N,closeDetail:y,copyText:b,fetchLoops:T,doCreate:L,doStop:B,doRestart:P}}},cw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=J(()=>e.value.filter(g=>g.status==="running").length),r=J(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function d(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await W.get("/api/processes"),s.value=null}catch(E){g||(s.value=E.message)}g||(t.value=!1)}function u(){f(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ls(n,g=>{g?u():f()});async function p(g){if(await os({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await W.del(`/api/processes/${g}`),_e.success(`Process ${g} killed`),await d()}catch(N){_e.error(N.message||"Failed to kill process")}i.value=null}}function v(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&d(!0)}return He(()=>{d(),We.subscribe("events",v),u()}),gt(()=>{We.unsubscribe("events",v),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Da,fetchProcesses:d,doKill:p}}},dw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],d=h(null),u=h(null),f=h(null),p=h(null),v=h(null),g=h([]),E=h(!1),N=J(()=>e.value.filter(k=>k.cron&&!k.one_time).length),y=J(()=>e.value.filter(k=>k.one_time).length),b=J(()=>e.value.filter(k=>k.trigger).length),_=J(()=>e.value.filter(k=>k.paused).length),A=J(()=>e.value.filter(k=>k.consecutive_failures>0).length);function D(k){if(!k)return"-";const x=Date.now(),de=(new Date(k).getTime()-x)/1e3;if(de<0)return"overdue";if(de<60)return"in < 1 min";if(de<3600)return`in ${Math.floor(de/60)} min`;if(de<86400){const se=Math.floor(de/3600),fe=Math.floor(de%3600/60);return fe>0?`in ${se}h ${fe}m`:`in ${se}h`}const ce=Math.floor(de/86400);return`in ${ce} day${ce!==1?"s":""}`}function O(k){return k==null?"-":k<1e3?`${k}ms`:k<6e4?`${(k/1e3).toFixed(1)}s`:Da(k/1e3)}function C(){r.value=null}async function T(){const k=a.value.cron.trim();if(k){o.value=!0;try{r.value=await W.post("/api/schedules/validate-cron",{expression:k})}catch(x){r.value={valid:!1,error:x.message}}o.value=!1}}async function L(){t.value=!0,s.value=null;try{e.value=await W.get("/api/schedules")}catch(k){s.value=k.message}t.value=!1}async function B(k){if(v.value===k){v.value=null,g.value=[];return}v.value=k,E.value=!0,g.value=[];try{g.value=await W.get(`/api/schedules/${encodeURIComponent(k)}/history?limit=10`)}catch{g.value=[]}E.value=!1}async function P(){l.value=null;const k=a.value;if(!k.description.trim()){l.value="Description is required";return}if(!k.channel_id.trim()){l.value="Channel ID is required";return}if(!k.cron.trim()&&!k.run_at.trim()){l.value="Cron expression or run_at time is required";return}const x={description:k.description.trim(),action:k.action,channel_id:k.channel_id.trim()};if(k.cron.trim()&&(x.cron=k.cron.trim()),k.run_at.trim()&&(x.run_at=k.run_at.trim()),k.action==="reminder"&&k.message.trim()&&(x.message=k.message.trim()),k.action==="check"&&(k.tool_name.trim()&&(x.tool_name=k.tool_name.trim()),k.tool_input_str.trim()))try{x.tool_input=JSON.parse(k.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await W.post("/api/schedules",x),_e.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await L()}catch(U){l.value=U.message}i.value=!1}async function S(k){d.value=k;try{const x=await W.post(`/api/schedules/${encodeURIComponent(k)}/run`);if(x.status==="failure")_e.error(`Execution failed: ${x.error||"unknown error"}`);else{const U=x.warning?`Executed (${x.warning})`:"Executed successfully";_e.success(U)}await L()}catch(x){_e.error(x.message||"Failed to trigger")}d.value=null}async function $(k){f.value=k.id;const x=!k.paused;try{await W.put(`/api/schedules/${encodeURIComponent(k.id)}`,{paused:x}),_e.success(x?"Schedule paused":"Schedule resumed"),await L()}catch(U){_e.error(U.message||"Failed to update schedule")}f.value=null}async function G(k){p.value=k;try{await W.post(`/api/schedules/${encodeURIComponent(k)}/reset-failures`),_e.success("Failure counters reset"),await L()}catch(x){_e.error(x.message||"Failed to reset")}p.value=null}async function q(k){const x=e.value.find(de=>de.id===k);if(await os({title:"Delete schedule",message:`Delete "${(x==null?void 0:x.description)||k}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){u.value=k;try{await W.del(`/api/schedules/${encodeURIComponent(k)}`),_e.success("Schedule deleted"),await L()}catch(de){_e.error(de.message||"Failed to delete schedule")}u.value=null}}return He(()=>{L()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:d,deletingId:u,togglingId:f,resettingId:p,expandedId:v,history:g,historyLoading:E,cronCount:N,oneTimeCount:y,webhookCount:b,pausedCount:_,failingCount:A,formatTs:Yn,formatAge:eg,formatFuture:D,formatMs:O,formatDuration:Da,onCronInput:C,validateCron:T,toggleExpand:B,fetchSchedules:L,doCreate:P,doRunNow:S,doTogglePause:$,doResetFailures:G,doDelete:q}}},uw={components:{TabbedPage:vr},setup(){return{tabs:[{id:"live",label:"Live",component:nw},{id:"agents",label:"Agents",component:rw},{id:"loops",label:"Loops",component:ow},{id:"processes",label:"Processes",component:cw},{id:"schedules",label:"Schedules",component:dw}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},fw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await W.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return He(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Yn,formatDetail:i,truncateBlock:tg,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Ku=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],pw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),d=h("all"),u=h(""),f=h("last_active"),p=h(!1),v=Ku,g=pw,E=h([]),N=h(!1),y=h(""),b=h("flat"),_=h(new Set),A=h(""),D=h(""),O=h(""),C=h(null),T=h(!1);function L(){try{const H=localStorage.getItem("odin-session-presets");H&&(E.value=JSON.parse(H))}catch{}}function B(){try{localStorage.setItem("odin-session-presets",JSON.stringify(E.value))}catch{}}const P=J(()=>u.value.trim()!==""||d.value!=="all"),S=J(()=>{let H=[...e.value];const re=Ku.find(Je=>Je.id===d.value),ye=re?re.filters:{};if(ye.source&&(H=H.filter(Je=>Je.source===ye.source)),ye.minMessages&&(H=H.filter(Je=>Je.message_count>=ye.minMessages)),ye.hasCompaction&&(H=H.filter(Je=>Je.has_summary)),ye.maxAge!=null){const Je=Date.now()/1e3;H=H.filter(ut=>ut.last_active&&Je-ut.last_active<=ye.maxAge)}if(u.value.trim()){const Je=u.value.toLowerCase().trim();H=H.filter(ut=>(ut.channel_id||"").toLowerCase().includes(Je)||(ut.last_user_id||"").toLowerCase().includes(Je)||(ut.source||"").toLowerCase().includes(Je))}const Me=f.value,Ue=p.value?1:-1;return H.sort((Je,ut)=>{const Ye=Je[Me]||0,Ke=ut[Me]||0;return(Ye-Ke)*Ue}),H}),$=J(()=>{if(!a.value||!a.value.messages)return[];const H=a.value.messages;if(H.length===0)return[];const re=[];let ye=[];for(const Me of H)Me.role==="user"&&ye.length>0&&(re.push(ye),ye=[]),ye.push(Me);return ye.length>0&&re.push(ye),re}),G=J(()=>S.value.length>0&&o.value.size===S.value.length);function q(H){const re=H.find(ye=>ye.role==="user");if(re&&re.content){const ye=re.content.slice(0,120);return ye.length<re.content.length?ye+"...":ye}return"(no user message)"}function k(H){const re=new Set(_.value);re.has(H)?re.delete(H):re.add(H),_.value=re}function x(H){d.value=H}function U(H){d.value=H.id,H.filters.searchQuery!=null&&(u.value=H.filters.searchQuery),H.filters.sortBy&&(f.value=H.filters.sortBy)}function de(){if(!y.value.trim())return;const H={id:"custom-"+Date.now(),name:y.value.trim(),filters:{searchQuery:u.value,sortBy:f.value}};E.value=[...E.value,H],B(),N.value=!1,y.value=""}function ce(H){E.value=E.value.filter(re=>re.id!==H),B(),d.value===H&&(d.value="all")}function se(){d.value="all",u.value="",f.value="last_active",p.value=!1}function fe(H){if(!H)return"—";const re=Date.now()/1e3-H;if(re<60)return"just now";if(re<3600){const Me=Math.floor(re/60);return`${Me} minute${Me!==1?"s":""} ago`}if(re<86400){const Me=Math.floor(re/3600);return`${Me} hour${Me!==1?"s":""} ago`}const ye=Math.floor(re/86400);return`${ye} day${ye!==1?"s":""} ago`}function Q(H){if(!H)return"";try{return new Date(H*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ue(H){if(!H)return"";try{return new Date(H*1e3).toLocaleString()}catch{return""}}function Ie(H){return H==="user"?"bg-gray-900/50 border border-gray-800":H==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function j(H){return H==="user"?"sess-msg-user":H==="assistant"?"sess-msg-assistant":"sess-msg-system"}function oe(H){return H==="user"?"badge-info":H==="assistant"?"badge-success":"badge-warning"}function ie(H){return H==="user"?"sess-dot-user":H==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(H){return H==="user"?"text-cyan-400":H==="assistant"?"text-indigo-400":"text-gray-500"}function pe(H){return H?H.length>2e3?H.slice(0,2e3)+`
... (truncated)`:H:""}async function Le(){const H=A.value.trim();if(H){T.value=!0;try{let re=`/api/sessions/search?q=${encodeURIComponent(H)}&limit=50`;D.value.trim()&&(re+=`&channel_id=${encodeURIComponent(D.value.trim())}`),O.value.trim()&&(re+=`&user_id=${encodeURIComponent(O.value.trim())}`);const ye=await W.get(re);C.value=ye.results||[]}catch{C.value=[]}T.value=!1}}function m(){A.value="",D.value="",O.value="",C.value=null}function R(H){return H?H.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function M(H){return H==="user"?"fts-result-user":H==="assistant"?"fts-result-assistant":H==="summary"?"fts-result-summary":H==="fts"?"fts-result-fts":H==="channel"?"fts-result-channel":"fts-result-default"}function Z(H){return H==="user"?"badge-info":H==="assistant"?"badge-success":H==="summary"?"badge-warning":H==="fts"?"badge-success":"badge-info"}async function I(){t.value=!0,s.value=null;try{e.value=await W.get("/api/sessions")}catch(H){s.value=H.message}t.value=!1}function F(){s.value=null,I()}async function Y(H){if(n.value===H){n.value=null,a.value=null,_.value=new Set;return}n.value=H,a.value=null,i.value=!0,_.value=new Set;try{a.value=await W.get(`/api/sessions/${encodeURIComponent(H)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function ee(H){const re=new Set(o.value);re.has(H)?re.delete(H):re.add(H),o.value=re}function te(){G.value?o.value=new Set:o.value=new Set(S.value.map(H=>H.channel_id))}function X(H){l.value=H}async function be(){if(l.value){r.value=!0;try{await W.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await I()}catch(H){s.value=H.message||"Failed to clear session"}r.value=!1,l.value=null}}function le(){c.value=!0}async function ge(){if(o.value.size!==0){r.value=!0;try{await W.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await I()}catch(H){s.value=H.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function xe(H,re){const ye=W._token;let Me=`/api/sessions/${encodeURIComponent(H)}/export?format=${re}`;ye&&(Me+=`&token=${encodeURIComponent(ye)}`);const Ue=document.createElement("a");Ue.href=Me,Ue.download=`session-${H}.${re==="text"?"txt":"json"}`,document.body.appendChild(Ue),Ue.click(),document.body.removeChild(Ue)}let ke=null;function Ee(H){H.payload&&H.payload.channel_id&&(clearTimeout(ke),ke=setTimeout(()=>{I(),n.value&&H.payload.channel_id===n.value&&W.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(re=>{a.value=re}).catch(()=>{})},2e3))}return He(()=>{L(),I(),We.subscribe("events",Ee)}),gt(()=>{We.unsubscribe("events",Ee),clearTimeout(ke)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:G,bulkClearing:c,activePreset:d,searchQuery:u,sortBy:f,sortAsc:p,filterPresets:v,sortOptions:g,filteredSessions:S,hasActiveFilters:P,customPresets:E,showSavePreset:N,newPresetName:y,threadView:b,threads:$,collapsedThreads:_,ftsQuery:A,ftsChannelId:D,ftsUserId:O,ftsResults:C,ftsSearching:T,formatAge:fe,formatTimestamp:Q,formatFullTimestamp:ue,messageClass:Ie,threadMsgClass:j,roleBadge:oe,roleDotClass:ie,roleLabelClass:me,truncateContent:pe,threadSummary:q,fetchSessions:I,retry:F,toggleSession:Y,toggleSelect:ee,toggleSelectAll:te,confirmClear:X,clearSession:be,confirmBulkClear:le,doBulkClear:ge,exportSession:xe,applyPreset:x,applyCustomPreset:U,saveCustomPreset:de,removeCustomPreset:ce,resetFilters:se,toggleThread:k,runFtsSearch:Le,clearFtsSearch:m,highlightSnippet:R,ftsResultClass:M,ftsTypeBadge:Z}}},gw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:ng}}},mw={components:{ContextAssemblyPanel:gw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(O){if(!O)return"—";try{const C=new Date(O);return isNaN(C.getTime())?O:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function f(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function p(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function v(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function g(O){a.value===O?a.value=null:(a.value=O,c.value={})}function E(O,C){const T=O+"-"+C;c.value={...c.value,[T]:!c.value[T]}}function N(O,C){return!!c.value[O+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,A()}async function b(){try{const O=await W.get("/api/trajectories");e.value=O.files||[],o.value=O.count||0}catch{}}let _=0;async function A(){const O=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const C=await W.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(O!==_)return;let T=C.entries||[];d.value.tool_name&&(T=T.filter(L=>(L.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(T=T.filter(L=>L.is_error)),d.value.channel_id&&(T=T.filter(L=>L.channel_id===d.value.channel_id)),d.value.user_id&&(T=T.filter(L=>L.user_id===d.value.user_id)),t.value=T}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const T=C.toString(),L=await W.get(`/api/trajectories/search/query?${T}`);if(O!==_)return;t.value=L.results||[]}}catch(C){if(O!==_)return;n.value=C.message}O===_&&(s.value=!1)}async function D(){if(!l.value.trim())return;const O=++_;s.value=!0,n.value=null,c.value={};try{const C=await W.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==_)return;i.value=C.entry||null,i.value||(n.value="No trace found for this message ID")}catch(C){if(O!==_)return;C.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=C.message}O===_&&(s.value=!1)}return He(async()=>{await b(),await A()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:f,formatTokens:p,formatJSON:v,truncateBlock:tg,toggleExpand:g,toggleIteration:E,isIterationExpanded:N,clearFilters:y,fetchFiles:b,fetchTraces:A,lookupMessage:D}}},vw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=J(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const d=await W.get("/api/usage");s.value=d,n.value=d.totals||n.value,t.value=null}catch(d){t.value=d.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return He(()=>{o(),i=setInterval(o,15e3)}),gt(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:sg,formatTime:Nc,retry:c}}},bw={components:{TabbedPage:vr},setup(){return{tabs:[{id:"audit",label:"Audit",component:fw},{id:"sessions",label:"Sessions",component:hw},{id:"traces",label:"Traces",component:mw},{id:"usage",label:"Usage",component:vw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Kr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=J(()=>e.value.filter(y=>y.is_core).length),c=J(()=>e.value.filter(y=>!y.is_core).length),d=J(()=>Object.values(a.value).reduce((y,b)=>y+b,0));function u(y){for(const b of Kr)if(b.id!=="other"&&b.match(y))return b.id;return"other"}const f=J(()=>{let y=e.value;if(n.value){const b=n.value.toLowerCase();y=y.filter(_=>_.name.toLowerCase().includes(b)||(_.description||"").toLowerCase().includes(b))}return r.value&&(y=y.filter(b=>u(b.name)===r.value)),y}),p=J(()=>{const y=new Set;for(const b of e.value)y.add(u(b.name));return Kr.filter(b=>y.has(b.id))}),v=J(()=>{const y=f.value,b={};for(const A of y){const D=u(A.name);b[D]||(b[D]=[]),b[D].push(A)}const _=[];for(const A of Kr)b[A.id]&&b[A.id].length>0&&_.push({label:A.label,icon:A.icon,tools:b[A.id].sort((D,O)=>D.name.localeCompare(O.name))});return _});function g(y){i.value={...i.value,[y]:!i.value[y]}}async function E(){t.value=!0,s.value=null;try{const[y,b]=await Promise.all([W.get("/api/tools"),W.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=b||{};const _=Object.values(b||{}).filter(A=>A>0).sort((A,D)=>A-D)}catch(y){s.value=y.message}t.value=!1}function N(){E()}return He(()=>{E()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:f,groupedTools:v,usedCategories:p,truncate:Lc,toggleExpand:g,refresh:N}}};function xw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function _w(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const kw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),f=h(null),p=h(null),v=h(!1),g=h(null),E=h(null),N=h(!1),y=J(()=>e.value.length),b=J(()=>e.value.reduce((Q,ue)=>Q+(ue.execution_count||0),0)),_=J(()=>e.value.reduce((Q,ue)=>Q+L(ue.code),0)),A=J(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(Q)||(ue.description||"").toLowerCase().includes(Q))}),D=J(()=>u.value?u.value.split(`
`).length:0),O=J(()=>{const Q=Math.max(D.value,1);return Array.from({length:Q},(ue,Ie)=>Ie+1).join(`
`)}),C=J(()=>{const Q=u.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function T(Q){return xw(Q)}function L(Q){return Q?Q.split(`
`).length:0}function B(Q){return _w(Q)}function P(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function S(Q){try{await navigator.clipboard.writeText(Q);const ue=e.value.find(Ie=>Ie.code===Q);ue&&(r.value=ue.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function $(Q){if(Q.key==="Tab"){Q.preventDefault();const ue=Q.target,Ie=ue.selectionStart,j=ue.selectionEnd;u.value=u.value.substring(0,Ie)+"    "+u.value.substring(j),St(()=>{ue.selectionStart=ue.selectionEnd=Ie+4})}}function G(Q){const ue=Q.target.previousElementSibling;ue&&(ue.scrollTop=Q.target.scrollTop)}async function q(){t.value=!0,s.value=null;try{e.value=await W.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function k(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const ue=await W.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:ue}}catch(ue){a.value={...a.value,[Q]:{result:ue.message,is_error:!0}}}i.value=null}function x(){o.value=!0,c.value="create",d.value="",u.value="",f.value=null,p.value=null}function U(Q){o.value=!0,c.value="edit",d.value=Q.name,u.value=Q.code||"",f.value=null,p.value=null}function de(){o.value=!1,f.value=null,p.value=null}async function ce(){f.value=null,p.value=null;const Q=d.value.trim(),ue=u.value.trim();if(!Q){f.value="Name is required";return}if(!ue){f.value="Code is required";return}v.value=!0;try{c.value==="create"?(await W.post("/api/skills",{name:Q,code:ue}),p.value="Skill created successfully"):(await W.put(`/api/skills/${encodeURIComponent(Q)}`,{code:ue}),p.value="Skill updated successfully"),await q(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}v.value=!1}function se(Q){E.value=Q}async function fe(){if(E.value){N.value=!0;try{await W.del(`/api/skills/${encodeURIComponent(E.value)}`),await q()}catch{}N.value=!1,E.value=null}}return He(()=>{q()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:f,editSuccess:p,saving:v,editorRef:g,deleteTarget:E,deleting:N,enabledCount:y,totalExecutions:b,totalLines:_,displayedSkills:A,editLineCount:D,editorLineNums:O,editValidation:C,highlight:T,truncate:Lc,formatTs:Yn,countLines:L,getLineNumbers:B,toggleCode:P,copyCode:S,handleEditorKey:$,syncScroll:G,fetchSkills:q,testSkill:k,showCreate:x,editSkill:U,cancelEdit:de,saveSkill:ce,confirmDelete:se,doDelete:fe}}};function ww(e,t){if(!e||!t)return Su(e);const s=Su(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Sw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),f=h(null),p=h(!1),v=h(null),g=h(null);let E=null;const N=h(null),y=h(!1),b=h({}),_=h({}),A=h(null),D=h(null),O=J(()=>e.value.reduce((x,U)=>x+(U.chunks||0),0)),C=J(()=>new Set(e.value.map(U=>U.uploader).filter(Boolean)).size);function T(x,U){const de=_.value[U];if(!de||de.length===0)return 0;const ce=Math.max(...de.map(se=>se.char_count||0));return ce===0?0:Math.round(x.char_count/ce*100)}async function L(){t.value=!0,s.value=null;try{const x=await W.get("/api/knowledge");e.value=Array.isArray(x)?x:[]}catch(x){s.value=x.message}t.value=!1}async function B(x){if(b.value[x]){b.value[x]=!1,D.value=null;return}if(b.value[x]=!0,!(_.value[x]||A.value===x)){A.value=x;try{const U=await W.get(`/api/knowledge/${encodeURIComponent(x)}/chunks`);_.value[x]=Array.isArray(U)?U:[]}catch(U){_.value[x]=[],_e.error(`Failed to load chunks: ${U.message}`)}A.value=null}}async function P(){const x=n.value.trim();if(x){i.value=!0,r.value=null,l.value=x;try{const U=await W.get(`/api/knowledge/search?q=${encodeURIComponent(x)}`);a.value=Array.isArray(U)?U:[]}catch(U){a.value=[],r.value=U.message||"Search failed"}i.value=!1}}function S(){a.value=null,n.value="",r.value=null}async function $(){u.value=null,f.value=null;const x=c.value.trim(),U=d.value.trim();if(!x){u.value="Source name is required";return}if(!U){u.value="Content is required";return}p.value=!0;try{const de=await W.post("/api/knowledge",{source:x,content:U});f.value=`Ingested ${de.chunks||0} chunks from "${x}"`,c.value="",d.value="",_.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(de){u.value=de.message}p.value=!1}async function G(x){v.value=x,g.value=null,E&&(clearTimeout(E),E=null);try{const U=await W.post(`/api/knowledge/${encodeURIComponent(x)}/reingest`);g.value={source:x,error:!1,message:`Re-ingested ${U.chunks||0} chunks`},delete _.value[x],await L(),E=setTimeout(()=>{g.value=null,E=null},3e3)}catch(U){g.value={source:x,error:!0,message:U.message}}v.value=null}function q(x){N.value=x}async function k(){if(N.value){y.value=!0;try{await W.del(`/api/knowledge/${encodeURIComponent(N.value)}`),delete _.value[N.value],await L()}catch{}y.value=!1,N.value=null}}return He(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:f,ingesting:p,reingesting:v,reingestResult:g,deleteTarget:N,deleting:y,expanded:b,sourceChunks:_,loadingChunks:A,selectedChunk:D,totalChunks:O,uploaderCount:C,truncate:Lc,formatTs:Yn,highlightTerms:ww,chunkBarWidth:T,fetchSources:L,toggleSource:B,doSearch:P,clearSearch:S,doIngest:$,doReingest:G,confirmDelete:q,doDelete:k}}},Tw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),f=h(null),p=h(""),v=h(!1),g=h(null),E=h(null),N=h(new Set),y=h(null),b=h(!1),_=h(!1),A=J(()=>e.value.reduce((se,fe)=>se+fe.count,0)),D=J(()=>N.value.size);function O(se){const fe=t.value[se];if(!fe)return[];if(!l.value.trim())return fe;const Q=l.value.trim().toLowerCase();return fe.filter(ue=>ue.key.toLowerCase().includes(Q)||ue.value&&ue.value.toLowerCase().includes(Q))}function C(se,fe){return N.value.has(se+"/"+fe)}function T(se,fe){const Q=se+"/"+fe,ue=new Set(N.value);ue.has(Q)?ue.delete(Q):ue.add(Q),N.value=ue}function L(se){const fe=t.value[se];return!fe||fe.length===0?!1:fe.every(Q=>N.value.has(se+"/"+Q.key))}function B(se,fe){const Q=t.value[se];if(!Q)return;const ue=new Set(N.value);for(const Ie of Q){const j=se+"/"+Ie.key;fe?ue.add(j):ue.delete(j)}N.value=ue}async function P(){s.value=!0,n.value=null;try{const se=await W.get("/api/memory");e.value=Object.entries(se).map(([fe,Q])=>({name:fe,keys:Q.keys||[],count:Q.count||0}))}catch(se){n.value=se.message}s.value=!1}async function S(se){if(a.value[se]){a.value[se]=!1;return}a.value[se]=!0;const fe=e.value.find(ue=>ue.name===se);if(!fe||t.value[se]||i.value===se)return;i.value=se;const Q=await Promise.all(fe.keys.map(async ue=>{try{const Ie=await W.get(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(ue)}`);return{key:ue,value:Ie.value||""}}catch{return{key:ue,value:"(error loading)"}}}));t.value[se]=Q,i.value=null}function $(se,fe,Q){f.value=se+"/"+fe,p.value=Q}async function G(se,fe){v.value=!0,g.value=null;try{await W.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`,{value:p.value});const Q=t.value[se];if(Q){const ue=Q.find(Ie=>Ie.key===fe);ue&&(ue.value=p.value)}f.value=null}catch(Q){g.value=`Failed to save: ${Q.message||"unknown error"}`}v.value=!1}async function q(se,fe){try{await navigator.clipboard.writeText(fe.value),E.value=se+"/"+fe.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function k(){d.value=null,u.value=null;const se=o.value.scope.trim(),fe=o.value.key.trim(),Q=o.value.value.trim();if(!se){d.value="Scope is required";return}if(!fe){d.value="Key is required";return}if(!Q){d.value="Value is required";return}c.value=!0;try{await W.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`,{value:Q}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(ue){d.value=ue.message}c.value=!1}function x(se,fe){y.value={scope:se,key:fe}}async function U(){if(!y.value)return;b.value=!0,g.value=null;const{scope:se,key:fe}=y.value;try{await W.del(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`);const Q=t.value[se];Q&&(t.value[se]=Q.filter(j=>j.key!==fe));const ue=e.value.find(j=>j.name===se);ue&&(ue.count--,ue.keys=ue.keys.filter(j=>j!==fe));const Ie=new Set(N.value);Ie.delete(se+"/"+fe),N.value=Ie}catch(Q){g.value=`Failed to delete: ${Q.message||"unknown error"}`}b.value=!1,y.value=null}function de(){_.value=!0}async function ce(){b.value=!0,g.value=null;const se=[];for(const fe of N.value){const Q=fe.indexOf("/");se.push({scope:fe.slice(0,Q),key:fe.slice(Q+1)})}try{await W.post("/api/memory/bulk-delete",{entries:se}),N.value=new Set,t.value={},await P()}catch(fe){g.value=`Bulk delete failed: ${fe.message||"unknown error"}`}b.value=!1,_.value=!1}return He(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:f,editValue:p,saving:v,actionError:g,copied:E,selected:N,selectedCount:D,totalEntries:A,deleteTarget:y,deleting:b,showBulkDelete:_,fetchMemory:P,toggleScope:S,startEdit:$,doEdit:G,copyValue:q,doAdd:k,confirmDelete:x,doDelete:U,confirmBulkDelete:de,doBulkDelete:ce,isSelected:C,toggleSelect:T,isScopeAllSelected:L,toggleSelectAll:B,filteredEntries:O}}},Cw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=J(()=>[...new Set(e.value.map(E=>E.category))].sort()),o=J(()=>{const g={};return e.value.forEach(E=>{g[E.category]=(g[E.category]||0)+1}),g}),c=J(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function d(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function u(g){i.value=g.key,l.value=g.content}async function f(g){try{await W.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,_e.success("Entry updated"),await v()}catch(E){_e.error(E.message||"Failed to save entry")}}async function p(g){if(await os({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/learned/"+encodeURIComponent(g)),_e.success("Entry deleted"),await v()}catch(N){_e.error(N.message||"Failed to delete entry")}}async function v(){s.value=!0,n.value=null;try{const g=await W.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return He(v),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:Yn,startEdit:u,saveEdit:f,deleteEntry:p,fetchEntries:v}}},Ew={components:{TabbedPage:vr},setup(){return{tabs:[{id:"tools",label:"Tools",component:yw},{id:"skills",label:"Skills",component:kw},{id:"knowledge",label:"Knowledge",component:Sw},{id:"memory",label:"Memory",component:Tw},{id:"learned",label:"Learned",component:Cw}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Aw={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),f=h(!1),p=h(!1),v=J(()=>e.value==="custom"),g=J(()=>[...i.value,...l.value]),E=J(()=>l.value.includes(e.value)),N=J(()=>{var C;return v.value?t.value||"Odin":((C=a.value[e.value])==null?void 0:C.name)||e.value}),y=J(()=>{var C;return v.value?s.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.identity)||""}),b=J(()=>{var C;return v.value?n.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.voice)||""});async function _(){d.value=!0;try{const C=await W.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",n.value=C.custom_voice||"",a.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function A(){r.value=!0,c.value=null,o.value=!1;try{await W.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(C){c.value=C.message}finally{r.value=!1}}async function D(){const C=u.value.trim();if(C){p.value=!0,c.value=null;try{await W.post("/api/personality/presets",{name:C,display_name:N.value,identity:y.value,voice:b.value}),f.value=!1,u.value="",await _(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(T){c.value=T.message}finally{p.value=!1}}}async function O(){if(await os({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await W.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(T){c.value=T.message}}}return He(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:v,isUserPreset:E,previewName:N,previewIdentity:y,previewVoice:b,saving:r,saved:o,error:c,loading:d,save:A,showSavePreset:f,newPresetName:u,savingPreset:p,saveAsPreset:D,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
  `},Rw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Iw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Nw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Lw={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=J(()=>e.value.components||[]),i=J(()=>Nw[e.value.overall]||"text-gray-400"),l=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=J(()=>{const y=e.value.overall;return y==="healthy"?"All Systems Healthy":y==="degraded"?"Some Systems Degraded":y==="unhealthy"?"System Issues Detected":"Unknown"});function o(y){return Rw[y]||"text-gray-400"}function c(y){return Iw[y]||"info"}function d(y){return y==="ok"?"badge-success":y==="degraded"?"badge-warning":y==="down"?"badge-danger":"badge-info"}function u(y){return y==="closed"?"text-green-400":y==="half_open"?"text-yellow-400":y==="open"?"text-red-400":"text-gray-400"}function f(y){return y.replace(/_/g," ").replace(/\b\w/g,b=>b.toUpperCase())}function p(y){if(!y)return"—";try{return new Date(y).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return y}}function v(y){return y>=1e6?(y/1e6).toFixed(1)+"M":y>=1e3?(y/1e3).toFixed(1)+"K":String(y)}async function g(){n.value=!0;try{e.value=await W.get("/api/health/components"),s.value=null}catch(y){s.value=y.message}finally{t.value=!1,n.value=!1}}function E(){t.value=!0,s.value=null,g()}let N=null;return He(async()=>{await g(),N=setInterval(g,3e4)}),gt(()=>{N&&clearInterval(N)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:d,circuitColor:u,formatName:f,formatTime:p,formatNumber:v,fetchHealth:g,retry:E}}},Ow={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=J(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=J(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await W.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function d(){s.value=!0,await c()}function u(){e.value=!0,t.value=null,c()}return He(()=>{c(),i=setInterval(c,3e4)}),gt(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:sg,refresh:d,retry:u}}},Dw=["INFO","WARNING","ERROR"],Mw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Gr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Pw=[50,100,200,500],Fw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(We.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),f=h(null),p=2e3,v=Dw,g=Mw,E=Gr,N=h("all"),y=h(""),b=h([]),_=h(!1),A=h(""),D=h([]);function O(){try{const V=localStorage.getItem("odin-log-presets");V&&(b.value=JSON.parse(V))}catch{}}function C(){try{localStorage.setItem("odin-log-presets",JSON.stringify(b.value))}catch{}}const T=J(()=>a.value!==""||i.value.trim()!==""||y.value!==""),L=J(()=>{const V=Gr.find(ne=>ne.value===y.value);return V?V.label:""}),B=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),P=24,S=J(()=>{if(t.value.length===0)return[];const V=[],ne=new Date,Te=3600*1e3;for(let Xe=P-1;Xe>=0;Xe--){const rt=new Date(ne.getTime()-(Xe+1)*Te),Zt=new Date(ne.getTime()-Xe*Te);V.push({start:rt,end:Zt,label:k(rt,Zt),shortLabel:Zt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Xe of t.value){if(!Xe._time)continue;const rt=Xe._time.getTime();for(const Zt of V)if(rt>=Zt.start.getTime()&&rt<Zt.end.getTime()){Zt.total++,Xe.level==="ERROR"?Zt.errors++:Xe.level==="WARNING"?Zt.warnings++:Zt.info++;break}}return V}),$=J(()=>{let V=1;for(const ne of S.value)ne.total>V&&(V=ne.total);return V}),G=J(()=>S.value.length===0?"":"Last 24 hours"),q=J(()=>Math.ceil(P/8));function k(V,ne){const Te={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],Te)+" - "+ne.toLocaleTimeString([],Te)}function x(V,ne){return!ne||!V?"0px":Math.max(2,V/ne*100)+"%"}function U(V){const ne=de.value.findIndex(Te=>Te._time&&Te._time.getTime()>=V.start.getTime()&&Te._time.getTime()<V.end.getTime());if(ne>=0&&d.value){const Te=d.value.querySelectorAll(".log-line");Te[ne]&&(Te[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const de=J(()=>{let V=t.value;if(a.value&&(V=V.filter(ne=>(ne.level||"INFO")===a.value)),y.value){const ne=Gr.find(Te=>Te.value===y.value);if(ne&&ne.seconds){const Te=new Date(Date.now()-ne.seconds*1e3);V=V.filter(Xe=>Xe._time&&Xe._time>=Te)}}if(i.value&&!B.value)if(l.value)try{const ne=new RegExp(i.value,"i");V=V.filter(Te=>{const Xe=Te.text||Te.raw||"",rt=Te.tool||"";return ne.test(Xe)||ne.test(rt)})}catch{}else{const ne=i.value.toLowerCase();V=V.filter(Te=>{const Xe=(Te.text||Te.raw||"").toLowerCase(),rt=(Te.tool||"").toLowerCase();return Xe.includes(ne)||rt.includes(ne)})}return V});function ce(V){if(V.type==="log"&&V.line)try{const ne=typeof V.line=="string"?JSON.parse(V.line):V.line,Te=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Te.toLocaleTimeString(),_time:Te,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const ne=V.payload,Te=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Te.toLocaleTimeString(),_time:Te,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function se(V){const ne=ce(V);if(s.value){D.value.push(ne);return}fe(ne)}function fe(V){t.value.push(V),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&St(()=>Q())}function Q(V=!1){const ne=d.value;ne&&ne.scrollTo({top:ne.scrollHeight,behavior:V?"smooth":"instant"})}function ue(){n.value=!0,u.value=!1,St(()=>Q(!0))}const Ie=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function j(){const V=d.value;if(!V)return;const ne=V.scrollHeight-V.scrollTop-V.clientHeight<40;u.value=!n.value&&!ne&&t.value.length>0,pe.value&&oe()}function oe(){const V=d.value;!V||!n.value||V.scrollHeight-V.scrollTop-V.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function ie(){n.value&&requestAnimationFrame(oe)}function me(V){Ie.has(V.key)&&ie()}const pe=h(!1);function Le(){n.value&&(pe.value=!0,requestAnimationFrame(oe))}function m(){pe.value&&(pe.value=!1,oe())}function R(){n.value&&(u.value=!1,St(()=>Q()))}function M(){if(s.value=!s.value,!s.value&&D.value.length>0){for(const V of D.value)fe(V);D.value=[]}}function Z(){t.value=[],D.value=[],u.value=!1}function I(){let V;e.value==="search"?V=Wt.value.map(rt=>{const Zt=rt.error?"ERROR":"INFO",ns=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Zt} ${ns}${rt.result_summary||rt.message||""}`}).join(`
`):V=de.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const ne=new Blob([V],{type:"text/plain"}),Te=URL.createObjectURL(ne),Xe=document.createElement("a");Xe.href=Te,Xe.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Xe.click(),URL.revokeObjectURL(Te)}function F(V,ne){const Te=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(Te).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function Y(V){a.value=a.value===V?"":V,N.value="all"}function ee(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function te(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function X(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function be(V){N.value=V.id;const ne=V.filters;a.value=ne.level||"",y.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function le(V){N.value=V.id,a.value=V.filters.level||"",y.value=V.filters.timeRange||"",i.value=V.filters.text||""}function ge(){if(!A.value.trim())return;const V={id:"custom-"+Date.now(),name:A.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};b.value=[...b.value,V],C(),_.value=!1,A.value=""}function xe(V){b.value=b.value.filter(ne=>ne.id!==V),C(),N.value===V&&(N.value="all")}const ke=h("all"),Ee=h(""),H=h(""),re=h(""),ye=h(""),Me=h(""),Ue=h(100),Je=Pw,ut=h(!1),Ye=h(!1),Ke=h(""),Wt=h([]),bs=h(null),Ts=h(null);function Cn(){e.value="search",bs.value||Xn()}async function Xn(){try{bs.value=await W.get("/api/logs/stats")}catch{}}function cn(){const V=Me.value;if(!V){re.value="",ye.value="";return}const Te={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(Te){const Xe=new Date(Date.now()-Te*1e3);re.value=dn(Xe),ye.value=""}}function dn(V){const ne=Te=>String(Te).padStart(2,"0");return`${V.getFullYear()}-${ne(V.getMonth()+1)}-${ne(V.getDate())}T${ne(V.getHours())}:${ne(V.getMinutes())}`}function z(V){if(!V)return"";const ne=new Date(V);return isNaN(ne.getTime())?"":ne.toISOString()}async function Se(){ut.value=!0,Ke.value="",Ye.value=!0,Ts.value=null;try{const V=new URLSearchParams;ke.value&&ke.value!=="all"&&V.set("level",ke.value),Ee.value&&V.set("tool",Ee.value),H.value&&V.set("q",H.value);const ne=z(re.value),Te=z(ye.value);ne&&V.set("start",ne),Te&&V.set("end",Te),V.set("limit",String(Ue.value));const Xe=await W.get(`/api/logs/search?${V.toString()}`);Wt.value=Xe.entries||[]}catch(V){Ke.value=V.message||"Search failed",Wt.value=[]}finally{ut.value=!1}}function Cs(){ke.value="all",Ee.value="",H.value="",re.value="",ye.value="",Me.value="",Ue.value=100,Wt.value=[],Ye.value=!1,Ke.value="",Ts.value=null}function En(V){Ts.value=Ts.value===V?null:V}function br(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function $a(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function Ua(V){return V.error?"log-line-error":"text-gray-300"}function yr(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let ys=null,ea=null,ta=!1;function it(){ta||(ta=!0,We.subscribe("logs",se),r.value=We.connected,o.value=We.state||"disconnected",ys=We.onStateChange,ea=(V,ne)=>{o.value=V,r.value=V==="connected",ys&&ys(V,ne)},We.onStateChange=ea)}function Fs(){ta&&(ta=!1,We.unsubscribe("logs",se),We.onStateChange===ea&&(We.onStateChange=ys),ea=null,ys=null)}return He(()=>{O(),window.addEventListener("pointerup",m),window.addEventListener("pointercancel",m)}),Mi(it),Pi(Fs),gt(()=>{Fs(),window.removeEventListener("pointerup",m),window.removeEventListener("pointercancel",m)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:de,pauseBuffer:D,showJumpBottom:u,copiedIndex:f,regexError:B,levels:v,logPresets:g,timeRanges:E,timeRange:y,activeLogPreset:N,customLogPresets:b,showSaveLogPreset:_,newLogPresetName:A,hasActiveLogFilters:T,timeRangeLabel:L,timelineBuckets:S,timelineMax:$,timelineSpanLabel:G,timelineLabelSkip:q,togglePause:M,clearLogs:Z,exportLogs:I,logLineClass:ee,levelClass:te,levelChipClass:X,toggleLevel:Y,copyLine:F,jumpToBottom:ue,onScroll:j,onUserScrollIntent:ie,onUserScrollKey:me,onAutoScrollToggle:R,onPointerDown:Le,applyLogPreset:be,applyCustomLogPreset:le,saveLogCustomPreset:ge,removeLogCustomPreset:xe,segmentHeight:x,jumpToTimelineBucket:U,searchLevel:ke,searchTool:Ee,searchKeyword:H,searchStart:re,searchEnd:ye,searchTimePreset:Me,searchLimit:Ue,searchLimits:Je,searching:ut,searchRan:Ye,searchError:Ke,searchResults:Wt,searchStats:bs,expandedSearch:Ts,switchToSearch:Cn,runSearch:Se,clearSearchFilters:Cs,toggleSearchExpand:En,formatSearchTs:br,searchEntryText:$a,searchLogLineClass:Ua,formatJson:yr,applySearchTimePreset:cn}}},$w=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Uw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Bw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1–128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},Wr=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"database",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"server",sections:["tools"]},{key:"ui",label:"Web UI",icon:"globe",sections:["web"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"puzzle",sections:["issue_tracker"]}],xg="••••••••",Hw=50;function Vw(e){return $w.has(e)}function jw(e){return e===xg}function al(e){return JSON.parse(JSON.stringify(e))}function Vn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function zw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Vn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Vn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function qw(e,t,s){const n=Bw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Gu(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Vn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Vn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Kw={template:`
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),d=h(!1),u=h([]),f=h([]),p=J(()=>u.value.length>0),v=J(()=>f.value.length>0),g=J(()=>r.value&&t.value?t.value:e.value),E=J(()=>!e.value||!t.value?!1:!Vn(e.value,t.value)),N=J(()=>!e.value||!t.value?0:Gu(e.value,t.value).length),y=J(()=>{if(!r.value||!t.value)return{};const I={};for(const F of Object.keys(t.value)){const Y=t.value[F];if(typeof Y=="object"&&Y!==null&&!Array.isArray(Y))for(const ee of Object.keys(Y)){const te=qw(F,ee,Y[ee]);te&&(I[F+"."+ee]=te)}}return I}),b=J(()=>Object.keys(y.value).length>0),_=J(()=>e.value?Object.keys(e.value).length:0),A=J(()=>O.value.length),D=J(()=>!e.value||!t.value?[]:Gu(e.value,t.value)),O=J(()=>e.value?Wr.map(I=>({...I,sections:I.sections.filter(F=>F in e.value)})).filter(I=>I.sections.length>0):[]),C=J(()=>{if(!e.value)return[];const I=new Set(Wr.flatMap(F=>F.sections));return Object.keys(e.value).filter(F=>!I.has(F))});function T(I){return g.value?g.value[I]:null}function L(I){return!e.value||!t.value?!1:!Vn(e.value[I],t.value[I])}function B(I){return I.sections.some(F=>L(F))}function P(I,F){if(!e.value||!t.value)return!1;const Y=e.value[I],ee=t.value[I];return!Y||!ee?!1:!Vn(Y[F],ee[F])}function S(I){return t.value?t.value[I]:e.value[I]}function $(I,F){const Y=t.value||e.value;return Y[I]?Y[I][F]:void 0}function G(I,F){const Y=r.value&&t.value?t.value:e.value;return Y[I]?Y[I][F]:!1}function q(I,F){return y.value[I+"."+F]||null}function k(I,F){return Uw[I+"."+F]||null}function x(I,F,Y){t.value&&(F===null?t.value[I]=Y:(t.value[I]||(t.value[I]={}),t.value[I][F]=Y),t.value={...t.value})}function U(I,F,Y){if(!t.value)return;const ee=al(t.value);x(I,F,Y),u.value.push(ee),u.value.length>Hw&&u.value.shift(),f.value=[]}function de(I,F,Y){try{const ee=JSON.parse(Y);U(I,F,ee)}catch{}}function ce(){u.value.length!==0&&(f.value.push(al(t.value)),t.value=u.value.pop())}function se(){f.value.length!==0&&(u.value.push(al(t.value)),t.value=f.value.pop())}function fe(I,F,Y){if(!t.value||!t.value[I])return;const ee=[...t.value[I][F]];ee.splice(Y,1),U(I,F,ee)}function Q(I,F){if(!t.value||!t.value[I])return;const Y=[...t.value[I][F]||[]],ee=prompt("Enter new value:");ee!==null&&(Y.push(ee),U(I,F,Y))}function ue(I){a.value={...a.value,[I]:!a.value[I]}}function Ie(I){l.value={...l.value,[I]:!l.value[I]}}function j(I){i.value={...i.value,[I]:!i.value[I]}}function oe(I){try{return JSON.stringify(I,null,2)}catch{return String(I)}}function ie(I){return I==null?"null":typeof I=="object"?JSON.stringify(I,null,2):String(I)}function me(I,F){c.value={type:I,message:F},setTimeout(()=>{c.value=null},3e3)}function pe(){t.value=al(e.value),r.value=!0,u.value=[],f.value=[]}function Le(){r.value=!1,t.value=null,u.value=[],f.value=[]}function m(){d.value=!0}async function R(){if(!(!E.value||b.value)){o.value=!0;try{const I=zw(e.value,t.value);if(Object.keys(I).length===0){me("success","No changes to save."),o.value=!1;return}const F=await W.put("/api/config",I);e.value=F,r.value=!1,t.value=null,u.value=[],f.value=[],me("success","Config saved successfully.")}catch(I){me("error",I.message||"Failed to save config")}o.value=!1}}async function M(){s.value=!0,n.value=null;try{e.value=await W.get("/api/config");for(const I of Object.keys(e.value))a.value[I]===void 0&&(a.value[I]=!0);for(const I of Wr)l.value[I.key]===void 0&&(l.value[I.key]=!0)}catch(I){n.value=I.message}s.value=!1}function Z(I){if(!r.value)return;const F=I.target;F instanceof HTMLElement&&(F.matches("input, textarea, select")||F.isContentEditable)||((I.ctrlKey||I.metaKey)&&!I.shiftKey&&I.key.toLowerCase()==="z"?(I.preventDefault(),ce()):(I.ctrlKey||I.metaKey)&&(I.key==="y"||I.shiftKey&&I.key==="z"||I.shiftKey&&I.key==="Z")&&(I.preventDefault(),se()))}return He(()=>{M(),document.addEventListener("keydown",Z)}),gt(()=>{document.removeEventListener("keydown",Z)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:E,hasErrors:b,changeCount:N,REDACTED:xg,showDiffModal:d,diffEntries:D,canUndo:p,canRedo:v,sectionCount:_,groupCount:A,visibleGroups:O,ungroupedSections:C,validationErrors:y,isSensitiveKey:Vw,isRedacted:jw,sectionChanged:L,groupChanged:B,fieldChanged:P,getDisplay:T,getEdited:S,getEditedField:$,getDisplayBool:G,pushEdit:U,pushEditJson:de,getValidationError:q,getEnumOptions:k,removeArrayItem:fe,addArrayItem:Q,toggleSection:ue,toggleGroup:Ie,toggleNested:j,formatJson:oe,formatDiffVal:ie,showToast:me,showDiff:m,fetchConfig:M,startEdit:pe,cancelEdit:Le,saveConfig:R,undo:ce,redo:se}}},Gw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await W.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function d(p,v,g){try{await W.put("/api/discord/guild/"+p+"/config",{[v]:g}),await c()}catch(E){s.value=E.message}}async function u(p,v,g,E){try{await W.put("/api/discord/channel/"+p+"/config",{[g]:E}),await c()}catch(N){s.value=N.message}}async function f(p,v){try{await W.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return He(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:d,setChannelConfig:u,clearOverride:f}}},Ww={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),d=h([]),u=h(null),f=J(()=>{const x={};for(const U of d.value)x[U.id]=U;return x});function p(x){return f.value[x]||null}const v=J(()=>/^\d{15,25}$/.test(r.value.trim())),g=J(()=>{if(o.value){if(E.value[c.value])return"host-user-option-"+c.value;if(v.value)return"host-user-option-raw"}}),E=J(()=>{const x=r.value.toLowerCase().trim();return x?d.value.filter(U=>!i.value[U.id]&&(U.display_name.toLowerCase().includes(x)||U.username.toLowerCase().includes(x)||U.id.includes(x))):d.value.filter(U=>!i.value[U.id])});function N(x,U){return x?x.allowed_hosts===null||x.allowed_hosts===void 0?{allowed_hosts:[...U],default_host:x.default_host||"",allow_all:!0}:{allowed_hosts:x.allowed_hosts,default_host:x.default_host||"",allow_all:!1}:{allowed_hosts:[...U],default_host:U[0]||"",allow_all:!0}}async function y(){e.value=!0,t.value="";try{const x=await W.get("/api/host-access");s.value=x,n.value=x.available_hosts||[],a.value=N(x.default_policy,n.value);const U=x.users||{},de={};for(const[ce,se]of Object.entries(U))de[ce]=N(se,n.value);i.value=de}catch(x){t.value=x.message||"Failed to fetch host access data"}finally{e.value=!1}try{d.value=await W.get("/api/discord/members")||[]}catch{d.value=[]}}async function b(){try{const x=a.value.allow_all?null:a.value.allowed_hosts;await W.put("/api/host-access/default-policy",{allowed_hosts:x,default_host:a.value.default_host}),_e.success("Default policy updated")}catch(x){_e.error(x.message||"Failed to save")}}function _(x,U){a.value.allow_all=!1,U?a.value.allowed_hosts.includes(x)||a.value.allowed_hosts.push(x):(a.value.allowed_hosts=a.value.allowed_hosts.filter(de=>de!==x),a.value.default_host===x&&(a.value.default_host=a.value.allowed_hosts[0]||"")),b()}async function A(x){const U=i.value[x];if(U)try{const de=U.allow_all?null:U.allowed_hosts;await W.put(`/api/host-access/user/${x}`,{allowed_hosts:de,default_host:U.default_host});const ce=p(x);_e.success(`Updated access for ${ce?ce.display_name:x}`)}catch(de){_e.error(de.message||"Failed to save")}}function D(x,U,de){const ce=i.value[x];ce&&(ce.allow_all=!1,de?ce.allowed_hosts.includes(U)||ce.allowed_hosts.push(U):(ce.allowed_hosts=ce.allowed_hosts.filter(se=>se!==U),ce.default_host===U&&(ce.default_host=ce.allowed_hosts[0]||"")),A(x))}function O(x,U){const de=i.value[x];de&&(de.default_host=U,A(x))}function C(){l.value=!0,r.value="",c.value=0,St(()=>{u.value&&u.value.focus()})}function T(){o.value=!0,c.value=0}function L(){c.value<E.value.length-1&&c.value++}function B(){c.value>0&&c.value--}function P(){const x=E.value[c.value];if(x){$(x);return}v.value&&S()}function S(){const x=r.value.trim();/^\d{15,25}$/.test(x)&&(i.value[x]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(x),r.value="",o.value=!1,l.value=!1)}function $(x){i.value[x.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(x.id),r.value="",o.value=!1,l.value=!1}function G(){o.value=!1}function q(){setTimeout(()=>{o.value=!1},150)}async function k(x){const U=p(x);if(await os({title:"Remove user override",message:`Remove the host access override for ${U?U.display_name:x}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await W.del(`/api/host-access/user/${x}`),delete i.value[x],_e.success(`Removed override for ${U?U.display_name:x}`)}catch(ce){_e.error(ce.message||"Failed to delete")}}return He(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:d,filteredMembers:E,isRawId:v,activeOptionId:g,searchInput:u,fetchData:y,saveDefaultPolicy:b,toggleDefaultHost:_,getMember:p,toggleUserHost:D,setUserDefault:O,openAddUser:C,deleteUser:k,onSearchInput:T,highlightNext:L,highlightPrev:B,selectHighlighted:P,selectMember:$,closeDropdown:G,onBlur:q,addRawId:S}}},Zw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function p(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function v(){e.value=!0,t.value="";try{const C=await W.get("/api/tokens");s.value=C.tokens||[],n.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function g(C){return!C||!C.trim()?[]:C.split(",").map(T=>T.trim()).filter(Boolean)}function E(C,T){const L=c.value.allowed_hosts;if(T&&!L.includes(C)&&L.push(C),!T){const B=L.indexOf(C);B>=0&&L.splice(B,1)}}function N(C,T){const L=d.value.allowed_hosts;if(T&&!L.includes(C)&&L.push(C),!T){const B=L.indexOf(C);B>=0&&L.splice(B,1)}}async function y(){var C;i.value=!0;try{const T=g(c.value.allowed_tools_str),L=c.value.host_mode,B=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:T.length?T:[]};B!==null&&(P.allowed_hosts=B),P.default_host=c.value.default_host||"";const S=await W.post("/api/tokens",P);l.value=S.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,_e.success("Token created"),await v()}catch(T){_e.error(((C=T.data)==null?void 0:C.error)||T.message||"Failed to create token")}finally{i.value=!1}}function b(C){r.value=C;const T=C.allowed_hosts;let L="default";T==null?L="default":Array.isArray(T)&&T.length===0?L="none":Array.isArray(T)&&(L="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:L,allowed_hosts:Array.isArray(T)?[...T]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function _(){var C;if(r.value){o.value=!0;try{const T=g(d.value.allowed_tools_str),L=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:T};L==="none"?B.allowed_hosts=[]:L==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await W.put("/api/tokens/"+encodeURIComponent(r.value.user_id),B),r.value=null,_e.success("Token updated"),await v()}catch(T){_e.error(((C=T.data)==null?void 0:C.error)||T.message||"Failed to update")}finally{o.value=!1}}}async function A(C){var L;if(await os({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await W.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=B.token,_e.success("Token regenerated")}catch(B){_e.error(((L=B.data)==null?void 0:L.error)||B.message||"Failed to regenerate")}}async function D(C){var L;if(await os({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/tokens/"+encodeURIComponent(C.user_id)),_e.success("Token deleted"),await v()}catch(B){_e.error(((L=B.data)==null?void 0:L.error)||B.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),_e.success("Copied to clipboard")}catch{_e.error("Copy failed — select and copy manually")}}return He(v),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:f,fetchData:v,tierBadge:p,toggleCreateHost:E,toggleEditHost:N,createToken:y,startEdit:b,saveEdit:_,confirmRegenerate:A,confirmDelete:D,copyToken:O}}};function il(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Jw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=J(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=J(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=J(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=J(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),d=J(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),u=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),f=z=>r.includes(z)&&d.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),v=h({unavailable_reason:null}),g=J(()=>{const z=p.value.model;return z&&!a.includes(z)?[z,...a]:a});function E(z){const Se=z.target.value;p.value.enabled=Se!=="",Se!==""&&(p.value.model=Se),ye()}const N=h(!1),y=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),b=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),_=h(!1),A=h(!1),D=h(!1),O=h(!1),C=h(!1),T=h(!1),L=h(!1),B=h({configured:!1}),P=h([]),S=h(""),$=h(!1),G=h(!1),q=h({configured:!1}),k=h([]),x=h(""),U=h(!1),de=h(!1),ce=h(!0),se=h(""),fe=h({configured:!1,accounts:[]}),Q=h(null),ue=h(null),Ie=h(""),j=h(null),oe=h(!1),ie=h(null),me=h(null),pe=h("");let Le=null;function m(z,Se="success"){_e(z,Se==="error"?"error":"success")}function R(z){if(!z)return"?";const Se=z/(1024*1024*1024);return Se>=1?Se.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}async function M(){e.value=!0,await Promise.all([Z(),I(),be(),F()]),e.value=!1}async function Z(){try{const z=await W.get("/api/llm/status");t.value=z,s.value=z.active_provider||"codex",z.codex&&!re.pending()&&(n.value.enabled=z.codex.enabled,n.value.model=z.codex.model||"gpt-5.5",n.value.reasoning_effort=z.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=z.codex.agent_reasoning_effort||"",n.value.agent_model=z.codex.agent_model||"",n.value.max_tokens=z.codex.max_tokens||4096),z.ollama&&!Me.pending()&&(y.value.enabled=z.ollama.enabled,y.value.base_url=z.ollama.base_url||"",y.value.model=z.ollama.model||"",y.value.max_tokens=z.ollama.max_tokens||4096),z.kimi&&!Ue.pending()&&(b.value.enabled=z.kimi.enabled,b.value.model=z.kimi.model||"",b.value.max_tokens=z.kimi.max_tokens||4096),z.auxiliary&&(v.value=z.auxiliary,ye.pending()||(p.value.enabled=z.auxiliary.enabled,p.value.model=z.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function I(){try{if(B.value=await W.get("/api/ollama/status"),B.value.model&&(S.value=B.value.model),B.value.configured)try{const z=await W.get("/api/ollama/models");P.value=z.models||[]}catch{P.value=[]}else if(y.value.base_url)try{const z=await W.post("/api/ollama/probe-models",{base_url:y.value.base_url});P.value=z.models||[]}catch{P.value=[]}}catch{B.value={configured:!1}}}async function F(){ce.value=!0,se.value="";try{fe.value=await W.get("/api/codex/status")}catch(z){se.value=z.message||"Failed to fetch Codex status"}finally{ce.value=!1}}async function Y(){const z=t.value?t.value.active_provider:"codex";L.value=!0;try{const Se=await W.post("/api/llm/switch",{provider:s.value});Se.error?(s.value=z,m(Se.error,"error")):(m("Switched to "+s.value+" ("+Se.model+")"),await M())}catch(Se){s.value=z,m(Se.message||"Switch failed","error")}finally{L.value=!1}}async function ee(){$.value=!0;try{const z=await W.post("/api/ollama/reload");m(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await M()}catch(z){m(z.message||"Reload failed","error")}finally{$.value=!1}}async function te(){G.value=!0;try{await W.post("/api/ollama/model",{model:S.value}),m("Model set to "+S.value),await M()}catch(z){m(z.message||"Failed","error")}finally{G.value=!1}}async function X(){const z=y.value.base_url;if(!z){m("Enter a base URL first","error");return}T.value=!0;try{const Se=await W.post("/api/ollama/probe-models",{base_url:z});P.value=Se.models||[],P.value.length?(m(P.value.length+" model(s) found"),!y.value.model&&P.value.length&&(y.value.model=P.value[0].name)):m("No models found at "+z,"error")}catch(Se){m(Se.message||"Could not reach Ollama","error")}finally{T.value=!1}}async function be(){try{if(q.value=await W.get("/api/kimi/status"),q.value.model&&(x.value=q.value.model),q.value.configured)try{const z=await W.get("/api/kimi/models");k.value=z.models||[]}catch{k.value=[]}}catch{q.value={configured:!1}}}async function le(){U.value=!0;try{const z=await W.post("/api/kimi/reload");m(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await M()}catch(z){m(z.message||"Reload failed","error")}finally{U.value=!1}}async function ge(){de.value=!0;try{await W.post("/api/kimi/model",{model:x.value}),m("Model set to "+x.value),await M()}catch(z){m(z.message||"Failed","error")}finally{de.value=!1}}async function xe(){if(D.value){re();return}D.value=!0;try{await W.put("/api/llm/codex/config",n.value),m("Codex config saved"),await Promise.all([Z(),F()])}catch(z){m(z.message||"Failed","error"),await Promise.all([Z(),F()])}finally{D.value=!1}}async function ke(){if(O.value){Me();return}O.value=!0;try{const z={...y.value},Se=_.value?y.value.api_key:null;Se===null&&delete z.api_key,await W.put("/api/llm/ollama/config",z),m("Ollama config saved"),Se!==null&&y.value.api_key===Se&&(y.value.api_key="",_.value=!1),await Promise.all([Z(),I()])}catch(z){m(z.message||"Failed","error")}finally{O.value=!1}}async function Ee(){if(C.value){Ue();return}C.value=!0;try{const z={...b.value},Se=A.value?b.value.api_key:null;Se===null&&delete z.api_key,await W.put("/api/llm/kimi/config",z),m("Kimi config saved"),Se!==null&&b.value.api_key===Se&&(b.value.api_key="",A.value=!1),await Promise.all([Z(),be()])}catch(z){m(z.message||"Failed","error")}finally{C.value=!1}}async function H(){if(N.value){ye();return}N.value=!0;try{await W.put("/api/llm/auxiliary/config",p.value),m("Auxiliary config saved"),await Z()}catch(z){m(z.message||"Failed","error"),await Z()}finally{N.value=!1}}const re=il(xe),ye=il(H),Me=il(ke),Ue=il(Ee),Je=()=>(re.cancel(),xe()),ut=()=>(Me.cancel(),ke()),Ye=()=>(Ue.cancel(),Ee());async function Ke(z){try{await W.post("/api/codex/account/"+z+"/activate"),m("Active account switched"),await F()}catch(Se){m(Se.message||"Failed","error")}}async function Wt(z){Q.value=z;try{await W.post("/api/codex/account/"+z+"/refresh"),m("Token refreshed"),await F()}catch(Se){m(Se.message||"Refresh failed","error")}finally{Q.value=null}}function bs(z,Se){ue.value=z,Ie.value=Se||""}async function Ts(z){try{await W.put("/api/codex/account/"+z+"/label",{label:Ie.value}),m("Label updated"),ue.value=null,await F()}catch(Se){m(Se.message||"Failed","error")}}async function Cn(z,Se){if(await os({title:"Delete Codex account",message:`Delete ${Se||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/codex/account/"+z),m("Deleted. Pool reloaded."),await F()}catch(En){m(En.message||"Failed","error")}}async function Xn(){oe.value=!0;try{const z=await W.post("/api/codex/device-code");ie.value=z,j.value="pending",cn(z)}catch(z){m(z.message||"Failed","error")}finally{oe.value=!1}}async function cn(z){Le={cancelled:!1};const Se=Le;try{const Cs=await W.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(Se.cancelled)return;me.value=Cs,j.value="success",await M()}catch(Cs){if(Se.cancelled)return;pe.value=Cs.message||"Device login failed",j.value="error"}}function dn(){Le&&(Le.cancelled=!0),j.value=null,ie.value=null}return He(M),gt(()=>{Le&&(Le.cancelled=!0),re.cancel(),ye.cancel(),Me.cancel(),Ue.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:L,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:f,auxForm:p,auxData:v,auxModelOptions:g,onAuxModelChange:E,savingAux:N,saveAuxConfigDebounced:ye,ollamaForm:y,kimiForm:b,savingCodex:D,savingOllama:O,savingKimi:C,probingOllama:T,ollamaKeyDirty:_,kimiKeyDirty:A,ollamaStatus:B,ollamaModels:P,ollamaSelectedModel:S,reloading:$,settingModel:G,kimiStatus:q,kimiModels:k,kimiSelectedModel:x,reloadingKimi:U,settingKimiModel:de,codexLoading:ce,codexError:se,codexData:fe,refreshing:Q,editingLabel:ue,labelValue:Ie,deviceState:j,deviceLoading:oe,deviceInfo:ie,deviceResult:me,deviceError:pe,fetchAll:M,switchProvider:Y,reloadOllama:ee,setOllamaModel:te,reloadKimi:le,setKimiModel:ge,probeOllamaModels:X,saveCodexConfig:xe,saveOllamaConfig:ke,saveKimiConfig:Ee,saveCodexConfigDebounced:re,saveOllamaConfigDebounced:Me,saveKimiConfigDebounced:Ue,saveCodexConfigNow:Je,saveOllamaConfigNow:ut,saveKimiConfigNow:Ye,activateAccount:Ke,refreshAccount:Wt,startEditLabel:bs,saveLabel:Ts,deleteAccount:Cn,startDeviceLogin:Xn,cancelDeviceLogin:dn,formatSize:R}}},Wu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Yw(e){return Wu[e]||Wu[(e||"").toLowerCase()]||"text-gray-400"}const Qw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null);let d=null;async function u(){const f=await Promise.allSettled([W.get("/api/startup/diagnostics"),W.get("/api/subsystems/status"),W.get("/api/pools/ssh"),W.get("/api/pools/http"),W.get("/api/risk/stats"),W.get("/api/recovery/stats"),W.get("/api/compression/stats"),W.get("/api/freshness/stats"),W.get("/api/governor/stats")]),p=g=>f[g].status==="fulfilled"?f[g].value:null;t.value=p(0)||{};const v=p(1);s.value=Array.isArray(v)?v:v&&v.subsystems||[],n.value=p(2)||{},a.value=p(3)||{},i.value=p(4),l.value=p(5),r.value=p(6),o.value=p(7),c.value=p(8),e.value=!1}return He(()=>{u(),d=setInterval(u,3e4)}),gt(()=>{d&&clearInterval(d)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Yw,formatTime:Nc}}},Xw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await W.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await os({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await W.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return He(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},e1={components:{TabbedPage:vr},setup(){return{tabs:[{id:"health",label:"Health",component:Lw},{id:"resources",label:"Resources",component:Ow},{id:"logs",label:"Logs",component:Fw},{id:"config",label:"Config",component:Kw},{id:"discord",label:"Discord",component:Gw},{id:"host-access",label:"Host Access",component:Ww},{id:"api-tokens",label:"API Tokens",component:Zw},{id:"llm",label:"LLM Config",component:Jw},{id:"internals",label:"Internals",component:Qw},{id:"update",label:"Update",component:Xw}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},mt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),_g=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:$_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:sw,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:uw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:bw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ew,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:Aw,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:e1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:mt("/operations","live")},{path:"/agents",redirect:mt("/operations","agents")},{path:"/loops",redirect:mt("/operations","loops")},{path:"/processes",redirect:mt("/operations","processes")},{path:"/schedules",redirect:mt("/operations","schedules")},{path:"/audit",redirect:mt("/history","audit")},{path:"/sessions",redirect:mt("/history","sessions")},{path:"/traces",redirect:mt("/history","traces")},{path:"/usage",redirect:mt("/history","usage")},{path:"/tools",redirect:mt("/capabilities","tools")},{path:"/skills",redirect:mt("/capabilities","skills")},{path:"/knowledge",redirect:mt("/capabilities","knowledge")},{path:"/memory",redirect:mt("/capabilities","memory")},{path:"/learned",redirect:mt("/capabilities","learned")},{path:"/health",redirect:mt("/system","health")},{path:"/resources",redirect:mt("/system","resources")},{path:"/logs",redirect:mt("/system","logs")},{path:"/config",redirect:mt("/system","config")},{path:"/host-access",redirect:mt("/system","host-access")},{path:"/internals",redirect:mt("/system","internals")}],di=I_({history:o_(),routes:_g});di.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const t1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{W.setPersist(a.value),await W.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},s1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),f=h(null);let p=null;const v=h("starting"),g=h(""),E=_g.filter(k=>k.meta),N=J(()=>["Workspace","Operate","Observe","Manage"].map(k=>({name:k,routes:E.filter(x=>x.meta.section===k)})).filter(k=>k.routes.length)),y=J(()=>{var k;return((k=di.currentRoute.value.meta)==null?void 0:k.label)||"Odin"}),b=J(()=>{var k;return((k=di.currentRoute.value.meta)==null?void 0:k.section)||"Management"}),_=J(()=>{var k;return((k=di.currentRoute.value.meta)==null?void 0:k.description)||"Management console"});W.onSessionExpired=()=>{t.value=!0,We.disconnect(),W.setToken(""),e.value="login"};function A(k){var x;if((k.ctrlKey||k.metaKey)&&k.key.toLowerCase()==="k"){e.value==="ready"&&(k.preventDefault(),ku());return}if(n.value&&k.key==="Tab"){const U=[...((x=a.value)==null?void 0:x.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(U.length){const de=U[0],ce=U[U.length-1];if(k.shiftKey&&(document.activeElement===de||!a.value.contains(document.activeElement))){k.preventDefault(),ce.focus();return}if(!k.shiftKey&&(document.activeElement===ce||!a.value.contains(document.activeElement))){k.preventDefault(),de.focus();return}}}if(k.key==="Escape"&&n.value){n.value=!1,k.preventDefault();return}if(k.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(k.target.tagName)){k.preventDefault();const U=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');U&&U.focus()}}function D(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}He(async()=>{document.addEventListener("keydown",A),r=window.matchMedia("(max-width: 900px)"),D(),r.addEventListener("change",D);const k=await W.check();k.ok?(e.value="ready",G()):k.needsAuth?e.value="login":(e.value="ready",G())});function O(){t.value=!1,e.value="ready",G()}async function C(){await W.logout(),We.disconnect(),e.value="login"}function T(){s.value=!s.value}function L(){n.value=!n.value}ls(n,async k=>{var x,U;if(k)o=document.activeElement,await St(),(U=(x=a.value)==null?void 0:x.querySelector(".nav-item"))==null||U.focus();else if(o!=null&&o.isConnected){const de=o;o=null,requestAnimationFrame(()=>de.focus())}});const B=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(k,x="info",U=3e3){f.value={text:k,level:x},clearTimeout(p),p=setTimeout(()=>{f.value=null},U)}let S=null,$=!1;function G(){We.onStatusChange=k=>{c.value=k},We.onStateChange=(k,x)=>{d.value=k,u.value=x.latency??-1,k==="connected"?($&&P("Connection restored","success"),$=!0):k==="reconnecting"&&x.attempt===1&&P("Connection lost — reconnecting…","warn")},We.connect(),q(),S&&clearInterval(S),S=setInterval(q,15e3)}async function q(){try{const k=await W.get("/api/status");v.value=k.status==="online"?"online":"starting";const x=k.uptime_seconds||0,U=Math.floor(x/3600),de=Math.floor(x%3600/60);g.value=`${U}h ${de}m uptime`}catch{v.value="offline",g.value=""}}return gt(()=>{S&&clearInterval(S),We.disconnect(),document.removeEventListener("keydown",A),r==null||r.removeEventListener("change",D)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:B,wsToast:f,botStatus:v,botUptime:g,navRoutes:E,navGroups:N,currentPage:y,currentSection:b,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:O,logout:C,toggleSidebar:T,toggleMobileNavigation:L,openPalette:ku}}},Tn=Il(s1);Tn.component("odin-icon",M_);Tn.component("login-screen",t1);Tn.component("toast-container",k0);Tn.component("confirm-host",w0);Tn.component("command-palette",D_);Tn.directive("modal-focus",F_);Tn.use(di);Tn.mount("#app");
