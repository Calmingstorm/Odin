var wg=Object.defineProperty;var Sg=(e,t,s)=>t in e?wg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var et=(e,t,s)=>Sg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Tg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new kr("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new Cg(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new kr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof kr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class kr extends Error{constructor(t){super(t),this.name="AuthError"}}class Cg extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Eg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error"){this._chatPending=!1;for(const l of this._handlers.chat||[])l(a)}},this._ws.onclose=()=>{if(this._ws=null,this._stopPing(),this._latency=-1,this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const a of this._handlers.chat||[])a(n)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const G=new Tg,We=new Eg(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function cs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Fe={},pa=[],Ot=()=>{},da=()=>!1,Gn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Hl=e=>e.startsWith("onUpdate:"),Pe=Object.assign,Lo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Ag=Object.prototype.hasOwnProperty,ze=(e,t)=>Ag.call(e,t),he=Array.isArray,ha=e=>Da(e)==="[object Map]",Wn=e=>Da(e)==="[object Set]",Yc=e=>Da(e)==="[object Date]",Rg=e=>Da(e)==="[object RegExp]",we=e=>typeof e=="function",Ae=e=>typeof e=="string",Bt=e=>typeof e=="symbol",je=e=>e!==null&&typeof e=="object",Oo=e=>(je(e)||we(e))&&we(e.then)&&we(e.catch),Zd=Object.prototype.toString,Da=e=>Zd.call(e),Ig=e=>Da(e).slice(8,-1),Vl=e=>Da(e)==="[object Object]",jl=e=>Ae(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Qs=cs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Ng=cs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),zl=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Lg=/-\w/g,Qe=zl(e=>e.replace(Lg,t=>t.slice(1).toUpperCase())),Og=/\B([A-Z])/g,es=zl(e=>e.replace(Og,"-$1").toLowerCase()),Zn=zl(e=>e.charAt(0).toUpperCase()+e.slice(1)),ga=zl(e=>e?`on${Zn(e)}`:""),Et=(e,t)=>!Object.is(e,t),ma=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Jd=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},ql=e=>{const t=parseFloat(e);return isNaN(t)?e:t},dl=e=>{const t=Ae(e)?Number(e):NaN;return isNaN(t)?e:t};let Qc;const Kl=()=>Qc||(Qc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Dg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Mg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Pg=cs(Mg);function Ri(e){if(he(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ae(n)?Yd(n):Ri(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ae(e)||je(e))return e}const Fg=/;(?![^(]*\))/g,$g=/:([^]+)/,Ug=/\/\*[^]*?\*\//g;function Yd(e){const t={};return e.replace(Ug,"").split(Fg).forEach(s=>{if(s){const n=s.split($g);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Ii(e){let t="";if(Ae(e))t=e;else if(he(e))for(let s=0;s<e.length;s++){const n=Ii(e[s]);n&&(t+=n+" ")}else if(je(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Bg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ae(t)&&(e.class=Ii(t)),s&&(e.style=Ri(s)),e}const Hg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Vg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",jg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",zg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",qg=cs(Hg),Kg=cs(Vg),Gg=cs(jg),Wg=cs(zg),Zg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Jg=cs(Zg);function Qd(e){return!!e||e===""}function Yg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=sn(e[n],t[n]);return s}function sn(e,t){if(e===t)return!0;let s=Yc(e),n=Yc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Bt(e),n=Bt(t),s||n)return e===t;if(s=he(e),n=he(t),s||n)return s&&n?Yg(e,t):!1;if(s=je(e),n=je(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!sn(e[l],t[l]))return!1}}return String(e)===String(t)}function Gl(e,t){return e.findIndex(s=>sn(s,t))}const Xd=e=>!!(e&&e.__v_isRef===!0),ef=e=>Ae(e)?e:e==null?"":he(e)||je(e)&&(e.toString===Zd||!we(e.toString))?Xd(e)?ef(e.value):JSON.stringify(e,tf,2):String(e),tf=(e,t)=>Xd(t)?tf(e,t.value):ha(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[wr(n,i)+" =>"]=a,s),{})}:Wn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>wr(s))}:Bt(t)?wr(t):je(t)&&!he(t)&&!Vl(t)?String(t):t,wr=(e,t="")=>{var s;return Bt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Qg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let wt;class Do{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&wt&&(wt.active?(this.parent=wt,this.index=(wt.scopes||(wt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=wt;try{return wt=this,t()}finally{wt=s}}}on(){++this._on===1&&(this.prevScope=wt,wt=this)}off(){if(this._on>0&&--this._on===0){if(wt===this)wt=this.prevScope;else{let t=wt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Xg(e){return new Do(e)}function sf(){return wt}function em(e,t=!1){wt&&wt.cleanups.push(e)}let st;const Sr=new WeakSet;class di{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,wt&&(wt.active?wt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Sr.has(this)&&(Sr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||af(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Xc(this),lf(this);const t=st,s=_s;st=this,_s=!0;try{return this.fn()}finally{rf(this),st=t,_s=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Fo(t);this.deps=this.depsTail=void 0,Xc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Sr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Jr(this)&&this.run()}get dirty(){return Jr(this)}}let nf=0,ti,si;function af(e,t=!1){if(e.flags|=8,t){e.next=si,si=e;return}e.next=ti,ti=e}function Mo(){nf++}function Po(){if(--nf>0)return;if(si){let t=si;for(si=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;ti;){let t=ti;for(ti=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function lf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function rf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Fo(n),tm(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Jr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(of(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function of(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===fi)||(e.globalVersion=fi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Jr(e))))return;e.flags|=2;const t=e.dep,s=st,n=_s;st=e,_s=!0;try{lf(e);const a=e.fn(e._value);(t.version===0||Et(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{st=s,_s=n,rf(e),e.flags&=-3}}function Fo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Fo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function tm(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function sm(e,t){e.effect instanceof di&&(e=e.effect.fn);const s=new di(e);t&&Pe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function nm(e){e.effect.stop()}let _s=!0;const cf=[];function nn(){cf.push(_s),_s=!1}function an(){const e=cf.pop();_s=e===void 0?!0:e}function Xc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=st;st=void 0;try{t()}finally{st=s}}}let fi=0;class am{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Wl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!st||!_s||st===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==st)s=this.activeLink=new am(st,this),st.deps?(s.prevDep=st.depsTail,st.depsTail.nextDep=s,st.depsTail=s):st.deps=st.depsTail=s,uf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=st.depsTail,s.nextDep=void 0,st.depsTail.nextDep=s,st.depsTail=s,st.deps===s&&(st.deps=n)}return s}trigger(t){this.version++,fi++,this.notify(t)}notify(t){Mo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Po()}}}function uf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)uf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const fl=new WeakMap,Fn=Symbol(""),Yr=Symbol(""),pi=Symbol("");function Ft(e,t,s){if(_s&&st){let n=fl.get(e);n||fl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Wl),a.map=n,a.key=s),a.track()}}function Gs(e,t,s,n,a,i){const l=fl.get(e);if(!l){fi++;return}const r=o=>{o&&o.trigger()};if(Mo(),t==="clear")l.forEach(r);else{const o=he(e),c=o&&jl(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===pi||!Bt(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(pi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Fn)),ha(e)&&r(l.get(Yr)));break;case"delete":o||(r(l.get(Fn)),ha(e)&&r(l.get(Yr)));break;case"set":ha(e)&&r(l.get(Fn));break}}Po()}function im(e,t){const s=fl.get(e);return s&&s.get(t)}function sa(e){const t=Be(e);return t===e?t:(Ft(t,"iterate",pi),ss(e)?t:t.map(ws))}function Zl(e){return Ft(e=Be(e),"iterate",pi),e}function Os(e,t){return Ms(e)?ka(Xs(e)?ws(t):t):ws(t)}const lm={__proto__:null,[Symbol.iterator](){return Tr(this,Symbol.iterator,e=>Os(this,e))},concat(...e){return sa(this).concat(...e.map(t=>he(t)?sa(t):t))},entries(){return Tr(this,"entries",e=>(e[1]=Os(this,e[1]),e))},every(e,t){return Us(this,"every",e,t,void 0,arguments)},filter(e,t){return Us(this,"filter",e,t,s=>s.map(n=>Os(this,n)),arguments)},find(e,t){return Us(this,"find",e,t,s=>Os(this,s),arguments)},findIndex(e,t){return Us(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Us(this,"findLast",e,t,s=>Os(this,s),arguments)},findLastIndex(e,t){return Us(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Us(this,"forEach",e,t,void 0,arguments)},includes(...e){return Cr(this,"includes",e)},indexOf(...e){return Cr(this,"indexOf",e)},join(e){return sa(this).join(e)},lastIndexOf(...e){return Cr(this,"lastIndexOf",e)},map(e,t){return Us(this,"map",e,t,void 0,arguments)},pop(){return Ha(this,"pop")},push(...e){return Ha(this,"push",e)},reduce(e,...t){return eu(this,"reduce",e,t)},reduceRight(e,...t){return eu(this,"reduceRight",e,t)},shift(){return Ha(this,"shift")},some(e,t){return Us(this,"some",e,t,void 0,arguments)},splice(...e){return Ha(this,"splice",e)},toReversed(){return sa(this).toReversed()},toSorted(e){return sa(this).toSorted(e)},toSpliced(...e){return sa(this).toSpliced(...e)},unshift(...e){return Ha(this,"unshift",e)},values(){return Tr(this,"values",e=>Os(this,e))}};function Tr(e,t,s){const n=Zl(e),a=n[t]();return n!==e&&!ss(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const rm=Array.prototype;function Us(e,t,s,n,a,i){const l=Zl(e),r=l!==e&&!ss(e),o=l[t];if(o!==rm[t]){const d=o.apply(e,i);return r?ws(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,Os(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function eu(e,t,s,n){const a=Zl(e),i=a!==e&&!ss(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=Os(e,c)),s.call(this,c,Os(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?Os(e,o):o}function Cr(e,t,s){const n=Be(e);Ft(n,"iterate",pi);const a=n[t](...s);return(a===-1||a===!1)&&Ni(s[0])?(s[0]=Be(s[0]),n[t](...s)):a}function Ha(e,t,s=[]){nn(),Mo();const n=Be(e)[t].apply(e,s);return Po(),an(),n}const om=cs("__proto__,__v_isRef,__isVue"),df=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Bt));function cm(e){Bt(e)||(e=String(e));const t=Be(this);return Ft(t,"has",e),t.hasOwnProperty(e)}class ff{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?bf:vf:i?mf:gf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=he(t);if(!a){let o;if(l&&(o=lm[s]))return o;if(s==="hasOwnProperty")return cm}const r=Reflect.get(t,s,yt(t)?t:n);if((Bt(s)?df.has(s):om(s))||(a||Ft(t,"get",s),i))return r;if(yt(r)){const o=l&&jl(s)?r:r.value;return a&&je(o)?pl(o):o}return je(r)?a?pl(r):Sn(r):r}}class pf extends ff{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=he(t)&&jl(s);if(!this._isShallow){const c=Ms(i);if(!ss(n)&&!Ms(n)&&(i=Be(i),n=Be(n)),!l&&yt(i)&&!yt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:ze(t,s),o=Reflect.set(t,s,n,yt(t)?t:a);return t===Be(a)&&(r?Et(n,i)&&Gs(t,"set",s,n):Gs(t,"add",s,n)),o}deleteProperty(t,s){const n=ze(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Gs(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Bt(s)||!df.has(s))&&Ft(t,"has",s),n}ownKeys(t){return Ft(t,"iterate",he(t)?"length":Fn),Reflect.ownKeys(t)}}class hf extends ff{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const um=new pf,dm=new hf,fm=new pf(!0),pm=new hf(!0),Qr=e=>e,Vi=e=>Reflect.getPrototypeOf(e);function hm(e,t,s){return function(...n){const a=this.__v_raw,i=Be(a),l=ha(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?Qr:t?ka:ws;return!t&&Ft(i,"iterate",o?Yr:Fn),Pe(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function ji(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function gm(e,t){const s={get(a){const i=this.__v_raw,l=Be(i),r=Be(a);e||(Et(a,r)&&Ft(l,"get",a),Ft(l,"get",r));const{has:o}=Vi(l),c=t?Qr:e?ka:ws;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Ft(Be(a),"iterate",Fn),a.size},has(a){const i=this.__v_raw,l=Be(i),r=Be(a);return e||(Et(a,r)&&Ft(l,"has",a),Ft(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Be(r),c=t?Qr:e?ka:ws;return!e&&Ft(o,"iterate",Fn),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return Pe(s,e?{add:ji("add"),set:ji("set"),delete:ji("delete"),clear:ji("clear")}:{add(a){const i=Be(this),l=Vi(i),r=Be(a),o=!t&&!ss(a)&&!Ms(a)?r:a;return l.has.call(i,o)||Et(a,o)&&l.has.call(i,a)||Et(r,o)&&l.has.call(i,r)||(i.add(o),Gs(i,"add",o,o)),this},set(a,i){!t&&!ss(i)&&!Ms(i)&&(i=Be(i));const l=Be(this),{has:r,get:o}=Vi(l);let c=r.call(l,a);c||(a=Be(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?Et(i,u)&&Gs(l,"set",a,i):Gs(l,"add",a,i),this},delete(a){const i=Be(this),{has:l,get:r}=Vi(i);let o=l.call(i,a);o||(a=Be(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Gs(i,"delete",a,void 0),c},clear(){const a=Be(this),i=a.size!==0,l=a.clear();return i&&Gs(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=hm(a,e,t)}),s}function Jl(e,t){const s=gm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(ze(s,a)&&a in n?s:n,a,i)}const mm={get:Jl(!1,!1)},vm={get:Jl(!1,!0)},bm={get:Jl(!0,!1)},ym={get:Jl(!0,!0)},gf=new WeakMap,mf=new WeakMap,vf=new WeakMap,bf=new WeakMap;function xm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Sn(e){return Ms(e)?e:Yl(e,!1,um,mm,gf)}function $o(e){return Yl(e,!1,fm,vm,mf)}function pl(e){return Yl(e,!0,dm,bm,vf)}function _m(e){return Yl(e,!0,pm,ym,bf)}function Yl(e,t,s,n,a){if(!je(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=xm(Ig(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Xs(e){return Ms(e)?Xs(e.__v_raw):!!(e&&e.__v_isReactive)}function Ms(e){return!!(e&&e.__v_isReadonly)}function ss(e){return!!(e&&e.__v_isShallow)}function Ni(e){return e?!!e.__v_raw:!1}function Be(e){const t=e&&e.__v_raw;return t?Be(t):e}function yf(e){return!ze(e,"__v_skip")&&Object.isExtensible(e)&&Jd(e,"__v_skip",!0),e}const ws=e=>je(e)?Sn(e):e,ka=e=>je(e)?pl(e):e;function yt(e){return e?e.__v_isRef===!0:!1}function h(e){return xf(e,!1)}function Uo(e){return xf(e,!0)}function xf(e,t){return yt(e)?e:new km(e,t)}class km{constructor(t,s){this.dep=new Wl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Be(t),this._value=s?t:ws(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ss(t)||Ms(t);t=n?t:Be(t),Et(t,s)&&(this._rawValue=t,this._value=n?t:ws(t),this.dep.trigger())}}function wm(e){e.dep&&e.dep.trigger()}function Ds(e){return yt(e)?e.value:e}function Sm(e){return we(e)?e():Ds(e)}const Tm={get:(e,t,s)=>t==="__v_raw"?e:Ds(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return yt(a)&&!yt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Bo(e){return Xs(e)?e:new Proxy(e,Tm)}class Cm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Wl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function _f(e){return new Cm(e)}function Em(e){const t=he(e)?new Array(e.length):{};for(const s in e)t[s]=kf(e,s);return t}class Am{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Bt(s)?s:String(s),this._raw=Be(t);let a=!0,i=t;if(!he(t)||Bt(this._key)||!jl(this._key))do a=!Ni(i)||ss(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Ds(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&yt(this._raw[this._key])){const s=this._object[this._key];if(yt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return im(this._raw,this._key)}}class Rm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Im(e,t,s){return yt(e)?e:we(e)?new Rm(e):je(e)&&arguments.length>1?kf(e,t,s):h(e)}function kf(e,t,s){return new Am(e,t,s)}class Nm{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Wl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=fi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&st!==this)return af(this,!0),!0}get value(){const t=this.dep.track();return of(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Lm(e,t,s=!1){let n,a;return we(e)?n=e:(n=e.get,a=e.set),new Nm(n,a,s)}const Om={GET:"get",HAS:"has",ITERATE:"iterate"},Dm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},zi={},hl=new WeakMap;let vn;function Mm(){return vn}function wf(e,t=!1,s=vn){if(s){let n=hl.get(s);n||hl.set(s,n=[]),n.push(e)}}function Pm(e,t,s=Fe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:ss(_)||a===!1||a===0?Ws(_,1):Ws(_);let u,d,f,p,v=!1,g=!1;if(yt(e)?(d=()=>e.value,v=ss(e)):Xs(e)?(d=()=>c(e),v=!0):he(e)?(g=!0,v=e.some(_=>Xs(_)||ss(_)),d=()=>e.map(_=>{if(yt(_))return _.value;if(Xs(_))return c(_);if(we(_))return o?o(_,2):_()})):we(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){nn();try{f()}finally{an()}}const _=vn;vn=u;try{return o?o(e,3,[p]):e(p)}finally{vn=_}}:d=Ot,t&&a){const _=d,C=a===!0?1/0:a;d=()=>Ws(_(),C)}const w=sf(),N=()=>{u.stop(),w&&w.active&&Lo(w.effects,u)};if(i&&t){const _=t;t=(...C)=>{const I=_(...C);return N(),I}}let y=g?new Array(e.length).fill(zi):zi;const b=_=>{if(!(!(u.flags&1)||!u.dirty&&!_))if(t){const C=u.run();if(_||a||v||(g?C.some((I,L)=>Et(I,y[L])):Et(C,y))){f&&f();const I=vn;vn=u;try{const L=[C,y===zi?void 0:g&&y[0]===zi?[]:y,p];y=C,o?o(t,3,L):t(...L)}finally{vn=I}}}else u.run()};return r&&r(b),u=new di(d),u.scheduler=l?()=>l(b,!1):b,p=_=>wf(_,!1,u),f=u.onStop=()=>{const _=hl.get(u);if(_){if(o)o(_,4);else for(const C of _)C();hl.delete(u)}},t?n?b(!0):y=u.run():l?l(b.bind(null,!0),!0):u.run(),N.pause=u.pause.bind(u),N.resume=u.resume.bind(u),N.stop=N,N}function Ws(e,t=1/0,s){if(t<=0||!je(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,yt(e))Ws(e.value,t,s);else if(he(e))for(let n=0;n<e.length;n++)Ws(e[n],t,s);else if(Wn(e)||ha(e))e.forEach(n=>{Ws(n,t,s)});else if(Vl(e)){for(const n in e)Ws(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Ws(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Sf=[];function Fm(e){Sf.push(e)}function $m(){Sf.pop()}function Um(e,t){}const Bm={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Hm={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ma(e,t,s,n){try{return n?e(...n):e()}catch(a){Jn(a,t,s)}}function rs(e,t,s,n){if(we(e)){const a=Ma(e,t,s,n);return a&&Oo(a)&&a.catch(i=>{Jn(i,t,s)}),a}if(he(e)){const a=[];for(let i=0;i<e.length;i++)a.push(rs(e[i],t,s,n));return a}}function Jn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Fe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){nn(),Ma(i,null,10,[e,o,c]),an();return}}Vm(e,s,a,n,l)}function Vm(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const zt=[];let Ns=-1;const va=[];let bn=null,ra=0;const Tf=Promise.resolve();let gl=null;function St(e){const t=gl||Tf;return e?t.then(this?e.bind(this):e):t}function jm(e){let t=Ns+1,s=zt.length;for(;t<s;){const n=t+s>>>1,a=zt[n],i=gi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Ho(e){if(!(e.flags&1)){const t=gi(e),s=zt[zt.length-1];!s||!(e.flags&2)&&t>=gi(s)?zt.push(e):zt.splice(jm(t),0,e),e.flags|=1,Cf()}}function Cf(){gl||(gl=Tf.then(Ef))}function hi(e){he(e)?va.push(...e):bn&&e.id===-1?bn.splice(ra+1,0,e):e.flags&1||(va.push(e),e.flags|=1),Cf()}function tu(e,t,s=Ns+1){for(;s<zt.length;s++){const n=zt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;zt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function ml(e){if(va.length){const t=[...new Set(va)].sort((s,n)=>gi(s)-gi(n));if(va.length=0,bn){bn.push(...t);return}for(bn=t,ra=0;ra<bn.length;ra++){const s=bn[ra];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}bn=null,ra=0}}const gi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Ef(e){try{for(Ns=0;Ns<zt.length;Ns++){const t=zt[Ns];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ma(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ns<zt.length;Ns++){const t=zt[Ns];t&&(t.flags&=-2)}Ns=-1,zt.length=0,ml(),gl=null,(zt.length||va.length)&&Ef()}}let oa,qi=[];function Af(e,t){var s,n;oa=e,oa?(oa.enabled=!0,qi.forEach(({event:a,args:i})=>oa.emit(a,...i)),qi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Af(i,t)}),setTimeout(()=>{oa||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,qi=[])},3e3)):qi=[]}let Lt=null,Ql=null;function mi(e){const t=Lt;return Lt=e,Ql=e&&e.type.__scopeId||null,t}function zm(e){Ql=e}function qm(){Ql=null}const Km=e=>Vo;function Vo(e,t=Lt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&xi(-1);const i=mi(t);let l;try{l=e(...a)}finally{mi(i),n._d&&xi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Gm(e,t){if(Lt===null)return e;const s=Mi(Lt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Fe]=t[a];i&&(we(i)&&(i={mounted:i,updated:i}),i.deep&&Ws(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Ls(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(nn(),rs(o,s,8,[e.el,r,e,t]),an())}}function ni(e,t){if(Nt){let s=Nt.provides;const n=Nt.parent&&Nt.parent.provides;n===s&&(s=Nt.provides=Object.create(n)),s[e]=t}}function gs(e,t,s=!1){const n=Kt();if(n||$n){let a=$n?$n._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&we(t)?t.call(n&&n.proxy):t}}function Wm(){return!!(Kt()||$n)}const Rf=Symbol.for("v-scx"),If=()=>gs(Rf);function Zm(e,t){return Li(e,null,t)}function Jm(e,t){return Li(e,null,{flush:"post"})}function Nf(e,t){return Li(e,null,{flush:"sync"})}function ls(e,t,s){return Li(e,t,s)}function Li(e,t,s=Fe){const{immediate:n,deep:a,flush:i,once:l}=s,r=Pe({},s),o=t&&n||!t&&i!=="post";let c;if(zn){if(i==="sync"){const p=If();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Ot,p.resume=Ot,p.pause=Ot,p}}const u=Nt;r.call=(p,v,g)=>rs(p,u,v,g);let d=!1;i==="post"?r.scheduler=p=>{vt(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,v)=>{v?p():Ho(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Pm(e,t,r);return zn&&(c?c.push(f):o&&f()),f}function Ym(e,t,s){const n=this.proxy,a=Ae(e)?e.includes(".")?Lf(n,e):()=>n[e]:e.bind(n,n);let i;we(t)?i=t:(i=t.handler,s=t);const l=Pa(this),r=Li(a,i.bind(n),s);return l(),r}function Lf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const gn=new WeakMap,Of=Symbol("_vte"),Df=e=>e.__isTeleport,On=e=>e&&(e.disabled||e.disabled===""),Qm=e=>e&&(e.defer||e.defer===""),su=e=>typeof SVGElement<"u"&&e instanceof SVGElement,nu=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Xr=(e,t)=>{const s=e&&e.to;return Ae(s)?t?t(s):null:s},Xm={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:v,createText:g,createComment:w,parentNode:N}}=c,y=On(t.props);let{dynamicChildren:b}=t;const _=(L,S,A)=>{L.shapeFlag&16&&u(L.children,S,A,a,i,l,r,o)},C=(L=t)=>{const S=On(L.props),A=L.target=Xr(L.props,v),O=eo(A,L,g,p);A&&(l!=="svg"&&su(A)?l="svg":l!=="mathml"&&nu(A)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(A),S||(_(L,A,O),Ja(L,!1)))},I=L=>{const S=()=>{if(gn.get(L)===S){if(gn.delete(L),On(L.props)){const A=N(L.el)||s;_(L,A,L.anchor),Ja(L,!0)}C(L)}};gn.set(L,S),vt(S,i)};if(e==null){const L=t.el=g(""),S=t.anchor=g("");if(p(L,s,n),p(S,s,n),Qm(t.props)||i&&i.pendingBranch){I(t);return}y&&(_(t,s,S),Ja(t,!0)),C()}else{t.el=e.el;const L=t.anchor=e.anchor,S=gn.get(e);if(S){S.flags|=8,gn.delete(e),I(t);return}t.targetStart=e.targetStart;const A=t.target=e.target,O=t.targetAnchor=e.targetAnchor,U=On(e.props),P=U?s:A,T=U?L:O;if(l==="svg"||su(A)?l="svg":(l==="mathml"||nu(A))&&(l="mathml"),b?(f(e.dynamicChildren,b,P,a,i,l,r),Xo(e,t,!0)):o||d(e,t,P,T,a,i,l,r,!1),y)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Ki(t,s,L,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const $=t.target=Xr(t.props,v);$&&Ki(t,$,null,c,0)}else U&&Ki(t,A,O,c,1);Ja(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!On(f),v=gn.get(e);if(v&&(v.flags|=8,gn.delete(e)),d&&(a(c),a(u)),i&&a(o),!v&&l&16)for(let g=0;g<r.length;g++){const w=r[g];n(w,t,s,p,!!w.dynamicChildren)}},move:Ki,hydrate:ev};function Ki(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!gn.has(e)&&(!d||On(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function ev(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(w,N){let y=N;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function p(w,N){N.anchor=d(l(w),N,r(w),s,n,a,i)}const v=t.target=Xr(t.props,o),g=On(t.props);if(v){const w=v._lpa||v.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(v,w),t.targetAnchor||eo(v,t,u,c,r(e)===v?e:null)):(t.anchor=l(e),f(v,w),t.targetAnchor||eo(v,t,u,c),d(w&&l(w),t,v,s,n,a,i))),Ja(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const tv=Xm;function Ja(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function eo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Of]=l,e&&(n(i,e,a),n(l,e,a)),l}const fs=Symbol("_leaveCb"),Va=Symbol("_enterCb");function jo(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return He(()=>{e.isMounted=!0}),ar(()=>{e.isUnmounting=!0}),e}const ds=[Function,Array],zo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ds,onEnter:ds,onAfterEnter:ds,onEnterCancelled:ds,onBeforeLeave:ds,onLeave:ds,onAfterLeave:ds,onLeaveCancelled:ds,onBeforeAppear:ds,onAppear:ds,onAfterAppear:ds,onAppearCancelled:ds},Mf=e=>{const t=e.subTree;return t.component?Mf(t.component):t},sv={name:"BaseTransition",props:zo,setup(e,{slots:t}){const s=Kt(),n=jo();return()=>{const a=t.default&&Xl(t.default(),!0),i=a&&a.length?Pf(a):s.subTree?bp():void 0;if(!i)return;const l=Be(e),{mode:r}=l;if(n.isLeaving)return Er(i);const o=au(i);if(!o)return Er(i);let c=wa(o,l,n,s,d=>c=d);o.type!==ht&&ln(o,c);let u=s.subTree&&au(s.subTree);if(u&&u.type!==ht&&!xs(u,o)&&Mf(s).type!==ht){let d=wa(u,l,n,s);if(ln(u,d),r==="out-in"&&o.type!==ht)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},Er(i);r==="in-out"&&o.type!==ht?d.delayLeave=(f,p,v)=>{const g=$f(n,u);g[String(u.key)]=u,f[fs]=()=>{p(),f[fs]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{v(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Pf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==ht){t=s;break}}return t}const Ff=sv;function $f(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function wa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:v,onLeaveCancelled:g,onBeforeAppear:w,onAppear:N,onAfterAppear:y,onAppearCancelled:b}=t,_=String(e.key),C=$f(s,e),I=(A,O)=>{A&&rs(A,n,9,O)},L=(A,O)=>{const U=O[1];I(A,O),he(A)?A.every(P=>P.length<=1)&&U():A.length<=1&&U()},S={mode:l,persisted:r,beforeEnter(A){let O=o;if(!s.isMounted)if(i)O=w||o;else return;A[fs]&&A[fs](!0);const U=C[_];U&&xs(e,U)&&U.el[fs]&&U.el[fs](),I(O,[A])},enter(A){if(C[_]===e)return;let O=c,U=u,P=d;if(!s.isMounted)if(i)O=N||c,U=y||u,P=b||d;else return;let T=!1;A[Va]=W=>{T||(T=!0,W?I(P,[A]):I(U,[A]),S.delayedLeave&&S.delayedLeave(),A[Va]=void 0)};const $=A[Va].bind(null,!1);O?L(O,[A,$]):$()},leave(A,O){const U=String(e.key);if(A[Va]&&A[Va](!0),s.isUnmounting)return O();I(f,[A]);let P=!1;A[fs]=$=>{P||(P=!0,O(),$?I(g,[A]):I(v,[A]),A[fs]=void 0,C[U]===e&&delete C[U])};const T=A[fs].bind(null,!1);C[U]=e,p?L(p,[A,T]):T()},clone(A){const O=wa(A,t,s,n,a);return a&&a(O),O}};return S}function Er(e){if(Di(e))return e=Ps(e),e.children=null,e}function au(e){if(!Di(e))return Df(e.type)&&e.children?Pf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&we(s.default))return s.default()}}function ln(e,t){e.shapeFlag&6&&e.component?(e.transition=t,ln(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Xl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===At?(l.patchFlag&128&&a++,n=n.concat(Xl(l.children,t,r))):(t||l.type!==ht)&&n.push(r!=null?Ps(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Oi(e,t){return we(e)?Pe({name:e.name},t,{setup:e}):e}function nv(){const e=Kt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function qo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function av(e){const t=Kt(),s=Uo(null);if(t){const a=t.refs===Fe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function iu(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const vl=new WeakMap;function ba(e,t,s,n,a=!1){if(he(e)){e.forEach((g,w)=>ba(g,t&&(he(t)?t[w]:t),s,n,a));return}if(en(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&ba(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Mi(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Fe?r.refs={}:r.refs,d=r.setupState,f=Be(d),p=d===Fe?da:g=>iu(u,g)?!1:ze(f,g),v=(g,w)=>!(w&&iu(u,w));if(c!=null&&c!==o){if(lu(t),Ae(c))u[c]=null,p(c)&&(d[c]=null);else if(yt(c)){const g=t;v(c,g.k)&&(c.value=null),g.k&&(u[g.k]=null)}}if(we(o))Ma(o,r,12,[l,u]);else{const g=Ae(o),w=yt(o);if(g||w){const N=()=>{if(e.f){const y=g?p(o)?d[o]:u[o]:v()||!e.k?o.value:u[e.k];if(a)he(y)&&Lo(y,i);else if(he(y))y.includes(i)||y.push(i);else if(g)u[o]=[i],p(o)&&(d[o]=u[o]);else{const b=[i];v(o,e.k)&&(o.value=b),e.k&&(u[e.k]=b)}}else g?(u[o]=l,p(o)&&(d[o]=l)):w&&(v(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const y=()=>{N(),vl.delete(e)};y.id=-1,vl.set(e,y),vt(y,s)}else lu(e),N()}}}function lu(e){const t=vl.get(e);t&&(t.flags|=8,vl.delete(e))}let ru=!1;const na=()=>{ru||(console.error("Hydration completed but contains mismatches."),ru=!0)},iv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",lv=e=>e.namespaceURI.includes("MathML"),Gi=e=>{if(e.nodeType===1){if(iv(e))return"svg";if(lv(e))return"mathml"}},fa=e=>e.nodeType===8;function rv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(b,_)=>{if(!_.hasChildNodes()){s(null,b,_),ml(),_._vnode=b;return}d(_.firstChild,b,null,null,null),ml(),_._vnode=b},d=(b,_,C,I,L,S=!1)=>{S=S||!!_.dynamicChildren;const A=fa(b)&&b.data==="[",O=()=>g(b,_,C,I,L,A),{type:U,ref:P,shapeFlag:T,patchFlag:$}=_;let W=b.nodeType;_.el=b,$===-2&&(S=!1,_.dynamicChildren=null);let K=null;switch(U){case _n:W!==3?_.children===""?(o(_.el=a(""),l(b),b),K=b):K=O():(b.data!==_.children&&(na(),b.data=_.children),K=i(b));break;case ht:y(b)?(K=i(b),N(_.el=b.content.firstChild,b,C)):W!==8||A?K=O():K=i(b);break;case Un:if(A&&(b=i(b),W=b.nodeType),W===1||W===3){K=b;const D=!_.children.length;for(let x=0;x<_.staticCount;x++)D&&(_.children+=K.nodeType===1?K.outerHTML:K.data),x===_.staticCount-1&&(_.anchor=K),K=i(K);return A?i(K):K}else O();break;case At:A?K=v(b,_,C,I,L,S):K=O();break;default:if(T&1)(W!==1||_.type.toLowerCase()!==b.tagName.toLowerCase())&&!y(b)?K=O():K=f(b,_,C,I,L,S);else if(T&6){_.slotScopeIds=L;const D=l(b);if(A?K=w(b):fa(b)&&b.data==="teleport start"?K=w(b,b.data,"teleport end"):K=i(b),t(_,D,null,C,I,Gi(D),S),en(_)&&!_.type.__asyncResolved){let x;A?(x=lt(At),x.anchor=K?K.previousSibling:D.lastChild):x=b.nodeType===3?tc(""):lt("div"),x.el=b,_.component.subTree=x}}else T&64?W!==8?K=O():K=_.type.hydrate(b,_,C,I,L,S,e,p):T&128&&(K=_.type.hydrate(b,_,C,I,Gi(l(b)),L,S,e,d))}return P!=null&&ba(P,null,I,_),K},f=(b,_,C,I,L,S)=>{S=S||!!_.dynamicChildren;const{type:A,props:O,patchFlag:U,shapeFlag:P,dirs:T,transition:$}=_,W=A==="input"||A==="option";if(W||U!==-1){T&&Ls(_,null,C,"created");let K=!1;if(y(b)){K=cp(null,$)&&C&&C.vnode.props&&C.vnode.props.appear;const x=b.content.firstChild;if(K){const B=x.getAttribute("class");B&&(x.$cls=B),$.beforeEnter(x)}N(x,b,C),_.el=b=x}if(P&16&&!(O&&(O.innerHTML||O.textContent))){let x=p(b.firstChild,_,b,C,I,L,S);for(x&&!Wi(b,1)&&na();x;){const B=x;x=x.nextSibling,r(B)}}else if(P&8){let x=_.children;x[0]===`
`&&(b.tagName==="PRE"||b.tagName==="TEXTAREA")&&(x=x.slice(1));const{textContent:B}=b;B!==x&&B!==x.replace(/\r\n|\r/g,`
`)&&(Wi(b,0)||na(),b.textContent=_.children)}if(O){if(W||!S||U&48){const x=b.tagName.includes("-");for(const B in O)(W&&(B.endsWith("value")||B==="indeterminate")||Gn(B)&&!Qs(B)||B[0]==="."||x&&!Qs(B))&&n(b,B,null,O[B],void 0,C)}else if(O.onClick)n(b,"onClick",null,O.onClick,void 0,C);else if(U&4&&Xs(O.style))for(const x in O.style)O.style[x]}let D;(D=O&&O.onVnodeBeforeMount)&&Yt(D,C,_),T&&Ls(_,null,C,"beforeMount"),((D=O&&O.onVnodeMounted)||T||K)&&pp(()=>{D&&Yt(D,C,_),K&&$.enter(b),T&&Ls(_,null,C,"mounted")},I)}return b.nextSibling},p=(b,_,C,I,L,S,A)=>{A=A||!!_.dynamicChildren;const O=_.children,U=O.length;let P=!1;for(let T=0;T<U;T++){const $=A?O[T]:O[T]=Xt(O[T]),W=$.type===_n;b?(W&&!A&&T+1<U&&Xt(O[T+1]).type===_n&&(o(a(b.data.slice($.children.length)),C,i(b)),b.data=$.children),b=d(b,$,I,L,S,A)):W&&!$.children?o($.el=a(""),C):(P||(P=!0,Wi(C,1)||na()),s(null,$,C,null,I,L,Gi(C),S))}return b},v=(b,_,C,I,L,S)=>{const{slotScopeIds:A}=_;A&&(L=L?L.concat(A):A);const O=l(b),U=p(i(b),_,O,C,I,L,S);return U&&fa(U)&&U.data==="]"?i(_.anchor=U):(na(),o(_.anchor=c("]"),O,U),U)},g=(b,_,C,I,L,S)=>{if(Wi(b.parentElement,1)||na(),_.el=null,S){const U=w(b);for(;;){const P=i(b);if(P&&P!==U)r(P);else break}}const A=i(b),O=l(b);return r(b),s(null,_,O,A,C,I,Gi(O),L),C&&(C.vnode.el=_.el,lr(C,_.el)),A},w=(b,_="[",C="]")=>{let I=0;for(;b;)if(b=i(b),b&&fa(b)&&(b.data===_&&I++,b.data===C)){if(I===0)return i(b);I--}return b},N=(b,_,C)=>{const I=_.parentNode;I&&I.replaceChild(b,_);let L=C;for(;L;)L.vnode.el===_&&(L.vnode.el=L.subTree.el=b),L=L.parent},y=b=>b.nodeType===1&&b.tagName==="TEMPLATE";return[u,d]}const ou="data-allow-mismatch",ov={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Wi(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(ou);)e=e.parentElement;const s=e&&e.getAttribute(ou);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(ov[t])}}const cv=Kl().requestIdleCallback||(e=>setTimeout(e,1)),uv=Kl().cancelIdleCallback||(e=>clearTimeout(e)),dv=(e=1e4)=>t=>{const s=cv(t,{timeout:e});return()=>uv(s)};function fv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const pv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(fv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},hv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},gv=(e=[])=>(t,s)=>{Ae(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function mv(e,t){if(fa(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(fa(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const en=e=>!!e.type.__asyncLoader;function vv(e){we(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let v;return c||(v=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((w,N)=>{o(g,()=>w(f()),()=>N(g),d+1)});throw g}).then(g=>v!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),u=g,g)))};return Oi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(v,g,w){let N=!1;(g.bu||(g.bu=[])).push(()=>N=!0);const y=()=>{N||w()},b=i?()=>{const _=i(y,C=>mv(v,C));_&&(g.bum||(g.bum=[])).push(_)}:y;u?b():p().then(()=>!g.isUnmounted&&b())},get __asyncResolved(){return u},setup(){const v=Nt;if(qo(v),u)return()=>Zi(u,v);const g=C=>{c=null,Jn(C,v,13,!n)};if(r&&v.suspense||zn)return p().then(C=>()=>Zi(C,v)).catch(C=>(g(C),()=>n?lt(n,{error:C}):null));const w=h(!1),N=h(),y=h(!!a);let b,_;return gt(()=>{b!=null&&clearTimeout(b),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{v.isUnmounted||(y.value=!1)},a)),l!=null&&(b=setTimeout(()=>{if(!v.isUnmounted&&!w.value&&!N.value){const C=new Error(`Async component timed out after ${l}ms.`);g(C),N.value=C}},l)),p().then(()=>{v.isUnmounted||(w.value=!0,v.parent&&Di(v.parent.vnode)&&v.parent.update())}).catch(C=>{if(v.isUnmounted){c=null;return}g(C),N.value=C}),()=>{if(w.value&&u)return Zi(u,v);if(N.value&&n)return lt(n,{error:N.value});if(s&&!y.value)return Zi(s,v)}}})}function Zi(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=lt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Di=e=>e.type.__isKeepAlive,bv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Kt(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(y,b,_,C,I)=>{const L=y.component;c(y,b,_,0,r),o(L.vnode,y,b,_,L,r,C,y.slotScopeIds,I),vt(()=>{L.isDeactivated=!1,L.a&&ma(L.a);const S=y.props&&y.props.onVnodeMounted;S&&Yt(S,L.parent,y)},r)},n.deactivate=y=>{const b=y.component;yl(b.m),yl(b.a),c(y,f,null,1,r),vt(()=>{b.da&&ma(b.da);const _=y.props&&y.props.onVnodeUnmounted;_&&Yt(_,b.parent,y),b.isDeactivated=!0},r)};function p(y){Ar(y),u(y,s,r,!0)}function v(y){a.forEach((b,_)=>{const C=co(en(b)?b.type.__asyncResolved||{}:b.type);C&&!y(C)&&g(_)})}function g(y){const b=a.get(y);b&&(!l||!xs(b,l))?p(b):l&&Ar(l),a.delete(y),i.delete(y)}ls(()=>[e.include,e.exclude],([y,b])=>{y&&v(_=>Ya(y,_)),b&&v(_=>!Ya(b,_))},{flush:"post",deep:!0});let w=null;const N=()=>{w!=null&&(xl(s.subTree.type)?vt(()=>{a.set(w,Ji(s.subTree))},s.subTree.suspense):a.set(w,Ji(s.subTree)))};return He(N),nr(N),ar(()=>{a.forEach(y=>{const{subTree:b,suspense:_}=s,C=Ji(b);if(y.type===C.type&&y.key===C.key){Ar(C);const I=C.component.da;I&&vt(I,_);return}p(y)})}),()=>{if(w=null,!t.default)return l=null;const y=t.default(),b=y[0];if(y.length>1)return l=null,y;if(!rn(b)||!(b.shapeFlag&4)&&!(b.shapeFlag&128))return l=null,b;let _=Ji(b);if(_.type===ht)return l=null,_;const C=_.type,I=co(en(_)?_.type.__asyncResolved||{}:C),{include:L,exclude:S,max:A}=e;if(L&&(!I||!Ya(L,I))||S&&I&&Ya(S,I))return _.shapeFlag&=-257,l=_,b;const O=_.key==null?C:_.key,U=a.get(O);return _.el&&(_=Ps(_),b.shapeFlag&128&&(b.ssContent=_)),w=O,U?(_.el=U.el,_.component=U.component,_.transition&&ln(_,_.transition),_.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),A&&i.size>parseInt(A,10)&&g(i.values().next().value)),_.shapeFlag|=256,l=_,xl(b.type)?b:_}}},yv=bv;function Ya(e,t){return he(e)?e.some(s=>Ya(s,t)):Ae(e)?e.split(",").includes(t):Rg(e)?(e.lastIndex=0,e.test(t)):!1}function er(e,t){Uf(e,"a",t)}function tr(e,t){Uf(e,"da",t)}function Uf(e,t,s=Nt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(sr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Di(a.parent.vnode)&&xv(n,t,s,a),a=a.parent}}function xv(e,t,s,n){const a=sr(t,e,n,!0);gt(()=>{Lo(n[t],a)},s)}function Ar(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Ji(e){return e.shapeFlag&128?e.ssContent:e}function sr(e,t,s=Nt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{nn();const r=Pa(s),o=rs(t,s,e,l);return r(),an(),o});return n?a.unshift(i):a.push(i),i}}const on=e=>(t,s=Nt)=>{(!zn||e==="sp")&&sr(e,(...n)=>t(...n),s)},Bf=on("bm"),He=on("m"),Ko=on("bu"),nr=on("u"),ar=on("bum"),gt=on("um"),Hf=on("sp"),Vf=on("rtg"),jf=on("rtc");function zf(e,t=Nt){sr("ec",e,t)}const Go="components",_v="directives";function kv(e,t){return Wo(Go,e,!0,t)||e}const qf=Symbol.for("v-ndc");function wv(e){return Ae(e)?Wo(Go,e,!1)||e:e||qf}function Sv(e){return Wo(_v,e)}function Wo(e,t,s=!0,n=!1){const a=Lt||Nt;if(a){const i=a.type;if(e===Go){const r=co(i,!1);if(r&&(r===t||r===Qe(t)||r===Zn(Qe(t))))return i}const l=cu(a[e]||i[e],t)||cu(a.appContext[e],t);return!l&&n?i:l}}function cu(e,t){return e&&(e[t]||e[Qe(t)]||e[Zn(Qe(t))])}function Tv(e,t,s,n){let a;const i=s&&s[n],l=he(e);if(l||Ae(e)){const r=l&&Xs(e);let o=!1,c=!1;r&&(o=!ss(e),c=Ms(e),e=Zl(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?ka(ws(e[u])):ws(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(je(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Cv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(he(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Ev(e,t,s={},n,a){if(Lt.ce||Lt.parent&&en(Lt.parent)&&Lt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),yi(),_l(At,null,[lt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),yi();const l=i&&Zo(i(s)),r=s.key||l&&l.key,o=_l(At,{key:(r&&!Bt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Zo(e){return e.some(t=>rn(t)?!(t.type===ht||t.type===At&&!Zo(t.children)):!0)?e:null}function Av(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:ga(n)]=e[n];return s}const to=e=>e?_p(e)?Mi(e):to(e.parent):null,ai=Pe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>to(e.parent),$root:e=>to(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Jo(e),$forceUpdate:e=>e.f||(e.f=()=>{Ho(e.update)}),$nextTick:e=>e.n||(e.n=St.bind(e.proxy)),$watch:e=>Ym.bind(e)}),Rr=(e,t)=>e!==Fe&&!e.__isScriptSetup&&ze(e,t),so={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Rr(n,t))return l[t]=1,n[t];if(a!==Fe&&ze(a,t))return l[t]=2,a[t];if(ze(i,t))return l[t]=3,i[t];if(s!==Fe&&ze(s,t))return l[t]=4,s[t];no&&(l[t]=0)}}const c=ai[t];let u,d;if(c)return t==="$attrs"&&Ft(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Fe&&ze(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,ze(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Rr(a,t)?(a[t]=s,!0):n!==Fe&&ze(n,t)?(n[t]=s,!0):ze(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Fe&&r[0]!=="$"&&ze(e,r)||Rr(t,r)||ze(i,r)||ze(n,r)||ze(ai,r)||ze(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:ze(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Rv=Pe({},so,{get(e,t){if(t!==Symbol.unscopables)return so.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Pg(t)}});function Iv(){return null}function Nv(){return null}function Lv(e){}function Ov(e){}function Dv(){return null}function Mv(){}function Pv(e,t){return null}function Fv(){return Kf().slots}function $v(){return Kf().attrs}function Kf(e){const t=Kt();return t.setupContext||(t.setupContext=Tp(t))}function vi(e){return he(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Uv(e,t){const s=vi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?he(a)||we(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Bv(e,t){return!e||!t?e||t:he(e)&&he(t)?e.concat(t):Pe({},vi(e),vi(t))}function Hv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Vv(e){const t=Kt(),s=zn;let n=e();_i(),s&&xa(!1);const a=()=>{Pa(t),s&&xa(!0)},i=()=>{Kt()!==t&&t.scope.off(),_i(),s&&xa(!1)};return Oo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let no=!0;function jv(e){const t=Jo(e),s=e.proxy,n=e.ctx;no=!1,t.beforeCreate&&uu(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:v,activated:g,deactivated:w,beforeDestroy:N,beforeUnmount:y,destroyed:b,unmounted:_,render:C,renderTracked:I,renderTriggered:L,errorCaptured:S,serverPrefetch:A,expose:O,inheritAttrs:U,components:P,directives:T,filters:$}=t;if(c&&zv(c,n,null),l)for(const D in l){const x=l[D];we(x)&&(n[D]=x.bind(s))}if(a){const D=a.call(s,s);je(D)&&(e.data=Sn(D))}if(no=!0,i)for(const D in i){const x=i[D],B=we(x)?x.bind(s,s):we(x.get)?x.get.bind(s,s):Ot,ue=!we(x)&&we(x.set)?x.set.bind(s):Ot,ce=J({get:B,set:ue});Object.defineProperty(n,D,{enumerable:!0,configurable:!0,get:()=>ce.value,set:se=>ce.value=se})}if(r)for(const D in r)Gf(r[D],n,s,D);if(o){const D=we(o)?o.call(s):o;Reflect.ownKeys(D).forEach(x=>{ni(x,D[x])})}u&&uu(u,e,"c");function K(D,x){he(x)?x.forEach(B=>D(B.bind(s))):x&&D(x.bind(s))}if(K(Bf,d),K(He,f),K(Ko,p),K(nr,v),K(er,g),K(tr,w),K(zf,S),K(jf,I),K(Vf,L),K(ar,y),K(gt,_),K(Hf,A),he(O))if(O.length){const D=e.exposed||(e.exposed={});O.forEach(x=>{Object.defineProperty(D,x,{get:()=>s[x],set:B=>s[x]=B,enumerable:!0})})}else e.exposed||(e.exposed={});C&&e.render===Ot&&(e.render=C),U!=null&&(e.inheritAttrs=U),P&&(e.components=P),T&&(e.directives=T),A&&qo(e)}function zv(e,t,s=Ot){he(e)&&(e=ao(e));for(const n in e){const a=e[n];let i;je(a)?"default"in a?i=gs(a.from||n,a.default,!0):i=gs(a.from||n):i=gs(a),yt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function uu(e,t,s){rs(he(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Gf(e,t,s,n){let a=n.includes(".")?Lf(s,n):()=>s[n];if(Ae(e)){const i=t[e];we(i)&&ls(a,i)}else if(we(e))ls(a,e.bind(s));else if(je(e))if(he(e))e.forEach(i=>Gf(i,t,s,n));else{const i=we(e.handler)?e.handler.bind(s):t[e.handler];we(i)&&ls(a,i,e)}}function Jo(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>bl(o,c,l,!0)),bl(o,t,l)),je(t)&&i.set(t,o),o}function bl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&bl(e,i,s,!0),a&&a.forEach(l=>bl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=qv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const qv={data:du,props:fu,emits:fu,methods:Qa,computed:Qa,beforeCreate:Ht,created:Ht,beforeMount:Ht,mounted:Ht,beforeUpdate:Ht,updated:Ht,beforeDestroy:Ht,beforeUnmount:Ht,destroyed:Ht,unmounted:Ht,activated:Ht,deactivated:Ht,errorCaptured:Ht,serverPrefetch:Ht,components:Qa,directives:Qa,watch:Gv,provide:du,inject:Kv};function du(e,t){return t?e?function(){return Pe(we(e)?e.call(this,this):e,we(t)?t.call(this,this):t)}:t:e}function Kv(e,t){return Qa(ao(e),ao(t))}function ao(e){if(he(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Ht(e,t){return e?[...new Set([].concat(e,t))]:t}function Qa(e,t){return e?Pe(Object.create(null),e,t):t}function fu(e,t){return e?he(e)&&he(t)?[...new Set([...e,...t])]:Pe(Object.create(null),vi(e),vi(t??{})):t}function Gv(e,t){if(!e)return t;if(!t)return e;const s=Pe(Object.create(null),e);for(const n in t)s[n]=Ht(e[n],t[n]);return s}function Wf(){return{app:null,config:{isNativeTag:da,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Wv=0;function Zv(e,t){return function(n,a=null){we(n)||(n=Pe({},n)),a!=null&&!je(a)&&(a=null);const i=Wf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Wv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Ep,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&we(u.install)?(l.add(u),u.install(c,...d)):we(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||lt(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,Mi(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(rs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=$n;$n=c;try{return u()}finally{$n=d}}};return c}}let $n=null;function Jv(e,t,s=Fe){const n=Kt(),a=Qe(t),i=es(t),l=Zf(e,a),r=_f((o,c)=>{let u,d=Fe,f;return Nf(()=>{const p=e[a];Et(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const v=s.set?s.set(p):p;if(!Et(v,u)&&!(d!==Fe&&Et(p,d)))return;const g=n.vnode.props,w=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));w||(u=p,c()),n.emit(`update:${t}`,v),Et(p,d)&&(Et(p,v)&&!Et(v,f)||w&&d!==Fe&&!Et(v,u))&&c(),d=p,f=v}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Fe:r,done:!1}:{done:!0}}}},r}const Zf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Qe(t)}Modifiers`]||e[`${es(t)}Modifiers`];function Yv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Fe;let a=s;const i=t.startsWith("update:"),l=i&&Zf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Ae(u)?u.trim():u)),l.number&&(a=s.map(ql)));let r,o=n[r=ga(t)]||n[r=ga(Qe(t))];!o&&i&&(o=n[r=ga(es(t))]),o&&rs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,rs(c,e,6,a)}}const Qv=new WeakMap;function Jf(e,t,s=!1){const n=s?Qv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!we(e)){const o=c=>{const u=Jf(c,t,!0);u&&(r=!0,Pe(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(je(e)&&n.set(e,null),null):(he(i)?i.forEach(o=>l[o]=null):Pe(l,i),je(e)&&n.set(e,l),l)}function ir(e,t){return!e||!Gn(t)?!1:(t=t.slice(2).replace(/Once$/,""),ze(e,t[0].toLowerCase()+t.slice(1))||ze(e,es(t))||ze(e,t))}function al(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:v,inheritAttrs:g}=e,w=mi(e);let N,y;try{if(s.shapeFlag&4){const _=a||n,C=_;N=Xt(c.call(C,_,u,d,p,f,v)),y=r}else{const _=t;N=Xt(_.length>1?_(d,{attrs:r,slots:l,emit:o}):_(d,null)),y=t.props?r:eb(r)}}catch(_){ii.length=0,Jn(_,e,1),N=lt(ht)}let b=N;if(y&&g!==!1){const _=Object.keys(y),{shapeFlag:C}=b;_.length&&C&7&&(i&&_.some(Hl)&&(y=tb(y,i)),b=Ps(b,y,!1,!0))}return s.dirs&&(b=Ps(b,null,!1,!0),b.dirs=b.dirs?b.dirs.concat(s.dirs):s.dirs),s.transition&&ln(b,s.transition),N=b,mi(w),N}function Xv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(rn(a)){if(a.type!==ht||a.children==="v-if"){if(s)return;s=a}}else return}return s}const eb=e=>{let t;for(const s in e)(s==="class"||s==="style"||Gn(s))&&((t||(t={}))[s]=e[s]);return t},tb=(e,t)=>{const s={};for(const n in e)(!Hl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function sb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?pu(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(Yf(l,n,f)&&!ir(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?pu(n,l,c):!0:!!l;return!1}function pu(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Yf(t,e,i)&&!ir(s,i))return!0}return!1}function Yf(e,t,s){const n=e[s],a=t[s];return s==="style"&&je(n)&&je(a)?!sn(n,a):n!==a}function lr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Qf={},Xf=()=>Object.create(Qf),ep=e=>Object.getPrototypeOf(e)===Qf;function nb(e,t,s,n=!1){const a={},i=Xf();e.propsDefaults=Object.create(null),tp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:$o(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function ab(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Be(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(ir(e.emitsOptions,f))continue;const p=t[f];if(o)if(ze(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const v=Qe(f);a[v]=io(o,r,v,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{tp(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!ze(t,d)&&((u=es(d))===d||!ze(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=io(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!ze(t,d))&&(delete i[d],c=!0)}c&&Gs(e.attrs,"set","")}function tp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(Qs(o))continue;const c=t[o];let u;a&&ze(a,u=Qe(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:ir(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Be(s),c=r||Fe;for(let u=0;u<i.length;u++){const d=i[u];s[d]=io(a,o,d,c[d],e,!ze(c,d))}}return l}function io(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=ze(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&we(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Pa(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===es(s))&&(n=!0))}return n}const ib=new WeakMap;function sp(e,t,s=!1){const n=s?ib:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!we(e)){const u=d=>{o=!0;const[f,p]=sp(d,t,!0);Pe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return je(e)&&n.set(e,pa),pa;if(he(i))for(let u=0;u<i.length;u++){const d=Qe(i[u]);hu(d)&&(l[d]=Fe)}else if(i)for(const u in i){const d=Qe(u);if(hu(d)){const f=i[u],p=l[d]=he(f)||we(f)?{type:f}:Pe({},f),v=p.type;let g=!1,w=!0;if(he(v))for(let N=0;N<v.length;++N){const y=v[N],b=we(y)&&y.name;if(b==="Boolean"){g=!0;break}else b==="String"&&(w=!1)}else g=we(v)&&v.name==="Boolean";p[0]=g,p[1]=w,(g||ze(p,"default"))&&r.push(d)}}const c=[l,r];return je(e)&&n.set(e,c),c}function hu(e){return e[0]!=="$"&&!Qs(e)}const Yo=e=>e==="_"||e==="_ctx"||e==="$stable",Qo=e=>he(e)?e.map(Xt):[Xt(e)],lb=(e,t,s)=>{if(t._n)return t;const n=Vo((...a)=>Qo(t(...a)),s);return n._c=!1,n},np=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Yo(a))continue;const i=e[a];if(we(i))t[a]=lb(a,i,n);else if(i!=null){const l=Qo(i);t[a]=()=>l}}},ap=(e,t)=>{const s=Qo(t);e.slots.default=()=>s},ip=(e,t,s)=>{for(const n in t)(s||!Yo(n))&&(e[n]=t[n])},rb=(e,t,s)=>{const n=e.slots=Xf();if(e.vnode.shapeFlag&32){const a=t._;a?(ip(n,t,s),s&&Jd(n,"_",a,!0)):np(t,n)}else t&&ap(e,t)},ob=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Fe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:ip(a,t,s):(i=!t.$stable,np(t,a)),l=t}else t&&(ap(e,t),l={default:1});if(i)for(const r in a)!Yo(r)&&l[r]==null&&delete a[r]},vt=pp;function lp(e){return op(e)}function rp(e){return op(e,rv)}function op(e,t){const s=Kl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=Ot,insertStaticContent:v}=e,g=(m,E,M,Z=null,R=null,F=null,Y=void 0,ee=null,te=!!E.dynamicChildren)=>{if(m===E)return;m&&!xs(m,E)&&(Z=j(m),se(m,R,F,!0),m=null),E.patchFlag===-2&&(te=!1,E.dynamicChildren=null);const{type:X,ref:be,shapeFlag:le}=E;switch(X){case _n:w(m,E,M,Z);break;case ht:N(m,E,M,Z);break;case Un:m==null&&y(E,M,Z,Y);break;case At:P(m,E,M,Z,R,F,Y,ee,te);break;default:le&1?C(m,E,M,Z,R,F,Y,ee,te):le&6?T(m,E,M,Z,R,F,Y,ee,te):(le&64||le&128)&&X.process(m,E,M,Z,R,F,Y,ee,te,me)}be!=null&&R?ba(be,m&&m.ref,F,E||m,!E):be==null&&m&&m.ref!=null&&ba(m.ref,null,F,m,!0)},w=(m,E,M,Z)=>{if(m==null)n(E.el=r(E.children),M,Z);else{const R=E.el=m.el;E.children!==m.children&&c(R,E.children)}},N=(m,E,M,Z)=>{m==null?n(E.el=o(E.children||""),M,Z):E.el=m.el},y=(m,E,M,Z)=>{[m.el,m.anchor]=v(m.children,E,M,Z,m.el,m.anchor)},b=({el:m,anchor:E},M,Z)=>{let R;for(;m&&m!==E;)R=f(m),n(m,M,Z),m=R;n(E,M,Z)},_=({el:m,anchor:E})=>{let M;for(;m&&m!==E;)M=f(m),a(m),m=M;a(E)},C=(m,E,M,Z,R,F,Y,ee,te)=>{if(E.type==="svg"?Y="svg":E.type==="math"&&(Y="mathml"),m==null)I(E,M,Z,R,F,Y,ee,te);else{const X=m.el&&m.el._isVueCE?m.el:null;try{X&&X._beginPatch(),A(m,E,R,F,Y,ee,te)}finally{X&&X._endPatch()}}},I=(m,E,M,Z,R,F,Y,ee)=>{let te,X;const{props:be,shapeFlag:le,transition:ge,dirs:xe}=m;if(te=m.el=l(m.type,F,be&&be.is,be),le&8?u(te,m.children):le&16&&S(m.children,te,null,Z,R,Ir(m,F),Y,ee),xe&&Ls(m,null,Z,"created"),L(te,m,m.scopeId,Y,Z),be){for(const Ee in be)Ee!=="value"&&!Qs(Ee)&&i(te,Ee,null,be[Ee],F,Z);"value"in be&&i(te,"value",null,be.value,F),(X=be.onVnodeBeforeMount)&&Yt(X,Z,m)}xe&&Ls(m,null,Z,"beforeMount");const ke=cp(R,ge);ke&&ge.beforeEnter(te),n(te,E,M),((X=be&&be.onVnodeMounted)||ke||xe)&&vt(()=>{try{X&&Yt(X,Z,m),ke&&ge.enter(te),xe&&Ls(m,null,Z,"mounted")}finally{}},R)},L=(m,E,M,Z,R)=>{if(M&&p(m,M),Z)for(let F=0;F<Z.length;F++)p(m,Z[F]);if(R){let F=R.subTree;if(E===F||xl(F.type)&&(F.ssContent===E||F.ssFallback===E)){const Y=R.vnode;L(m,Y,Y.scopeId,Y.slotScopeIds,R.parent)}}},S=(m,E,M,Z,R,F,Y,ee,te=0)=>{for(let X=te;X<m.length;X++){const be=m[X]=ee?qs(m[X]):Xt(m[X]);g(null,be,E,M,Z,R,F,Y,ee)}},A=(m,E,M,Z,R,F,Y)=>{const ee=E.el=m.el;let{patchFlag:te,dynamicChildren:X,dirs:be}=E;te|=m.patchFlag&16;const le=m.props||Fe,ge=E.props||Fe;let xe;if(M&&Rn(M,!1),(xe=ge.onVnodeBeforeUpdate)&&Yt(xe,M,E,m),be&&Ls(E,m,M,"beforeUpdate"),M&&Rn(M,!0),(le.innerHTML&&ge.innerHTML==null||le.textContent&&ge.textContent==null)&&u(ee,""),X?O(m.dynamicChildren,X,ee,M,Z,Ir(E,R),F):Y||x(m,E,ee,null,M,Z,Ir(E,R),F,!1),te>0){if(te&16)U(ee,le,ge,M,R);else if(te&2&&le.class!==ge.class&&i(ee,"class",null,ge.class,R),te&4&&i(ee,"style",le.style,ge.style,R),te&8){const ke=E.dynamicProps;for(let Ee=0;Ee<ke.length;Ee++){const H=ke[Ee],re=le[H],ye=ge[H];(ye!==re||H==="value")&&i(ee,H,re,ye,R,M)}}te&1&&m.children!==E.children&&u(ee,E.children)}else!Y&&X==null&&U(ee,le,ge,M,R);((xe=ge.onVnodeUpdated)||be)&&vt(()=>{xe&&Yt(xe,M,E,m),be&&Ls(E,m,M,"updated")},Z)},O=(m,E,M,Z,R,F,Y)=>{for(let ee=0;ee<E.length;ee++){const te=m[ee],X=E[ee],be=te.el&&(te.type===At||!xs(te,X)||te.shapeFlag&198)?d(te.el):M;g(te,X,be,null,Z,R,F,Y,!0)}},U=(m,E,M,Z,R)=>{if(E!==M){if(E!==Fe)for(const F in E)!Qs(F)&&!(F in M)&&i(m,F,E[F],null,R,Z);for(const F in M){if(Qs(F))continue;const Y=M[F],ee=E[F];Y!==ee&&F!=="value"&&i(m,F,ee,Y,R,Z)}"value"in M&&i(m,"value",E.value,M.value,R)}},P=(m,E,M,Z,R,F,Y,ee,te)=>{const X=E.el=m?m.el:r(""),be=E.anchor=m?m.anchor:r("");let{patchFlag:le,dynamicChildren:ge,slotScopeIds:xe}=E;xe&&(ee=ee?ee.concat(xe):xe),m==null?(n(X,M,Z),n(be,M,Z),S(E.children||[],M,be,R,F,Y,ee,te)):le>0&&le&64&&ge&&m.dynamicChildren&&m.dynamicChildren.length===ge.length?(O(m.dynamicChildren,ge,M,R,F,Y,ee),(E.key!=null||R&&E===R.subTree)&&Xo(m,E,!0)):x(m,E,M,be,R,F,Y,ee,te)},T=(m,E,M,Z,R,F,Y,ee,te)=>{E.slotScopeIds=ee,m==null?E.shapeFlag&512?R.ctx.activate(E,M,Z,Y,te):$(E,M,Z,R,F,Y,te):W(m,E,te)},$=(m,E,M,Z,R,F,Y)=>{const ee=m.component=xp(m,Z,R);if(Di(m)&&(ee.ctx.renderer=me),kp(ee,!1,Y),ee.asyncDep){if(R&&R.registerDep(ee,K,Y),!m.el){const te=ee.subTree=lt(ht);N(null,te,E,M),m.placeholder=te.el}}else K(ee,m,E,M,R,F,Y)},W=(m,E,M)=>{const Z=E.component=m.component;if(sb(m,E,M))if(Z.asyncDep&&!Z.asyncResolved){D(Z,E,M);return}else Z.next=E,Z.update();else E.el=m.el,Z.vnode=E},K=(m,E,M,Z,R,F,Y)=>{const ee=()=>{if(m.isMounted){let{next:le,bu:ge,u:xe,parent:ke,vnode:Ee}=m;{const Ue=up(m);if(Ue){le&&(le.el=Ee.el,D(m,le,Y)),Ue.asyncDep.then(()=>{vt(()=>{m.isUnmounted||X()},R)});return}}let H=le,re;Rn(m,!1),le?(le.el=Ee.el,D(m,le,Y)):le=Ee,ge&&ma(ge),(re=le.props&&le.props.onVnodeBeforeUpdate)&&Yt(re,ke,le,Ee),Rn(m,!0);const ye=al(m),Me=m.subTree;m.subTree=ye,g(Me,ye,d(Me.el),j(Me),m,R,F),le.el=ye.el,H===null&&lr(m,ye.el),xe&&vt(xe,R),(re=le.props&&le.props.onVnodeUpdated)&&vt(()=>Yt(re,ke,le,Ee),R)}else{let le;const{el:ge,props:xe}=E,{bm:ke,m:Ee,parent:H,root:re,type:ye}=m,Me=en(E);if(Rn(m,!1),ke&&ma(ke),!Me&&(le=xe&&xe.onVnodeBeforeMount)&&Yt(le,H,E),Rn(m,!0),ge&&Le){const Ue=()=>{m.subTree=al(m),Le(ge,m.subTree,m,R,null)};Me&&ye.__asyncHydrate?ye.__asyncHydrate(ge,m,Ue):Ue()}else{re.ce&&re.ce._hasShadowRoot()&&re.ce._injectChildStyle(ye,m.parent?m.parent.type:void 0);const Ue=m.subTree=al(m);g(null,Ue,M,Z,m,R,F),E.el=Ue.el}if(Ee&&vt(Ee,R),!Me&&(le=xe&&xe.onVnodeMounted)){const Ue=E;vt(()=>Yt(le,H,Ue),R)}(E.shapeFlag&256||H&&en(H.vnode)&&H.vnode.shapeFlag&256)&&m.a&&vt(m.a,R),m.isMounted=!0,E=M=Z=null}};m.scope.on();const te=m.effect=new di(ee);m.scope.off();const X=m.update=te.run.bind(te),be=m.job=te.runIfDirty.bind(te);be.i=m,be.id=m.uid,te.scheduler=()=>Ho(be),Rn(m,!0),X()},D=(m,E,M)=>{E.component=m;const Z=m.vnode.props;m.vnode=E,m.next=null,ab(m,E.props,Z,M),ob(m,E.children,M),nn(),tu(m),an()},x=(m,E,M,Z,R,F,Y,ee,te=!1)=>{const X=m&&m.children,be=m?m.shapeFlag:0,le=E.children,{patchFlag:ge,shapeFlag:xe}=E;if(ge>0){if(ge&128){ue(X,le,M,Z,R,F,Y,ee,te);return}else if(ge&256){B(X,le,M,Z,R,F,Y,ee,te);return}}xe&8?(be&16&&Ie(X,R,F),le!==X&&u(M,le)):be&16?xe&16?ue(X,le,M,Z,R,F,Y,ee,te):Ie(X,R,F,!0):(be&8&&u(M,""),xe&16&&S(le,M,Z,R,F,Y,ee,te))},B=(m,E,M,Z,R,F,Y,ee,te)=>{m=m||pa,E=E||pa;const X=m.length,be=E.length,le=Math.min(X,be);let ge;for(ge=0;ge<le;ge++){const xe=E[ge]=te?qs(E[ge]):Xt(E[ge]);g(m[ge],xe,M,null,R,F,Y,ee,te)}X>be?Ie(m,R,F,!0,!1,le):S(E,M,Z,R,F,Y,ee,te,le)},ue=(m,E,M,Z,R,F,Y,ee,te)=>{let X=0;const be=E.length;let le=m.length-1,ge=be-1;for(;X<=le&&X<=ge;){const xe=m[X],ke=E[X]=te?qs(E[X]):Xt(E[X]);if(xs(xe,ke))g(xe,ke,M,null,R,F,Y,ee,te);else break;X++}for(;X<=le&&X<=ge;){const xe=m[le],ke=E[ge]=te?qs(E[ge]):Xt(E[ge]);if(xs(xe,ke))g(xe,ke,M,null,R,F,Y,ee,te);else break;le--,ge--}if(X>le){if(X<=ge){const xe=ge+1,ke=xe<be?E[xe].el:Z;for(;X<=ge;)g(null,E[X]=te?qs(E[X]):Xt(E[X]),M,ke,R,F,Y,ee,te),X++}}else if(X>ge)for(;X<=le;)se(m[X],R,F,!0),X++;else{const xe=X,ke=X,Ee=new Map;for(X=ke;X<=ge;X++){const Ye=E[X]=te?qs(E[X]):Xt(E[X]);Ye.key!=null&&Ee.set(Ye.key,X)}let H,re=0;const ye=ge-ke+1;let Me=!1,Ue=0;const Je=new Array(ye);for(X=0;X<ye;X++)Je[X]=0;for(X=xe;X<=le;X++){const Ye=m[X];if(re>=ye){se(Ye,R,F,!0);continue}let Ke;if(Ye.key!=null)Ke=Ee.get(Ye.key);else for(H=ke;H<=ge;H++)if(Je[H-ke]===0&&xs(Ye,E[H])){Ke=H;break}Ke===void 0?se(Ye,R,F,!0):(Je[Ke-ke]=X+1,Ke>=Ue?Ue=Ke:Me=!0,g(Ye,E[Ke],M,null,R,F,Y,ee,te),re++)}const dt=Me?cb(Je):pa;for(H=dt.length-1,X=ye-1;X>=0;X--){const Ye=ke+X,Ke=E[Ye],Wt=E[Ye+1],bs=Ye+1<be?Wt.el||dp(Wt):Z;Je[X]===0?g(null,Ke,M,bs,R,F,Y,ee,te):Me&&(H<0||X!==dt[H]?ce(Ke,M,bs,2):H--)}}},ce=(m,E,M,Z,R=null)=>{const{el:F,type:Y,transition:ee,children:te,shapeFlag:X}=m;if(X&6){ce(m.component.subTree,E,M,Z);return}if(X&128){m.suspense.move(E,M,Z);return}if(X&64){Y.move(m,E,M,me);return}if(Y===At){n(F,E,M);for(let le=0;le<te.length;le++)ce(te[le],E,M,Z);n(m.anchor,E,M);return}if(Y===Un){b(m,E,M);return}if(Z!==2&&X&1&&ee)if(Z===0)ee.persisted&&!F[fs]?n(F,E,M):(ee.beforeEnter(F),n(F,E,M),vt(()=>ee.enter(F),R));else{const{leave:le,delayLeave:ge,afterLeave:xe}=ee,ke=()=>{m.ctx.isUnmounted?a(F):n(F,E,M)},Ee=()=>{const H=F._isLeaving||!!F[fs];F._isLeaving&&F[fs](!0),ee.persisted&&!H?ke():le(F,()=>{ke(),xe&&xe()})};ge?ge(F,ke,Ee):Ee()}else n(F,E,M)},se=(m,E,M,Z=!1,R=!1)=>{const{type:F,props:Y,ref:ee,children:te,dynamicChildren:X,shapeFlag:be,patchFlag:le,dirs:ge,cacheIndex:xe,memo:ke}=m;if(le===-2&&(R=!1),ee!=null&&(nn(),ba(ee,null,M,m,!0),an()),xe!=null&&(E.renderCache[xe]=void 0),be&256){E.ctx.deactivate(m);return}const Ee=be&1&&ge,H=!en(m);let re;if(H&&(re=Y&&Y.onVnodeBeforeUnmount)&&Yt(re,E,m),be&6)de(m.component,M,Z);else{if(be&128){m.suspense.unmount(M,Z);return}Ee&&Ls(m,null,E,"beforeUnmount"),be&64?m.type.remove(m,E,M,me,Z):X&&!X.hasOnce&&(F!==At||le>0&&le&64)?Ie(X,E,M,!1,!0):(F===At&&le&384||!R&&be&16)&&Ie(te,E,M),Z&&fe(m)}const ye=ke!=null&&xe==null;(H&&(re=Y&&Y.onVnodeUnmounted)||Ee||ye)&&vt(()=>{re&&Yt(re,E,m),Ee&&Ls(m,null,E,"unmounted"),ye&&(m.el=null)},M)},fe=m=>{const{type:E,el:M,anchor:Z,transition:R}=m;if(E===At){Q(M,Z);return}if(E===Un){_(m);return}const F=()=>{a(M),R&&!R.persisted&&R.afterLeave&&R.afterLeave()};if(m.shapeFlag&1&&R&&!R.persisted){const{leave:Y,delayLeave:ee}=R,te=()=>Y(M,F);ee?ee(m.el,F,te):te()}else F()},Q=(m,E)=>{let M;for(;m!==E;)M=f(m),a(m),m=M;a(E)},de=(m,E,M)=>{const{bum:Z,scope:R,job:F,subTree:Y,um:ee,m:te,a:X}=m;yl(te),yl(X),Z&&ma(Z),R.stop(),F&&(F.flags|=8,se(Y,m,E,M)),ee&&vt(ee,E),vt(()=>{m.isUnmounted=!0},E)},Ie=(m,E,M,Z=!1,R=!1,F=0)=>{for(let Y=F;Y<m.length;Y++)se(m[Y],E,M,Z,R)},j=m=>{if(m.shapeFlag&6)return j(m.component.subTree);if(m.shapeFlag&128)return m.suspense.next();const E=f(m.anchor||m.el),M=E&&E[Of];return M?f(M):E};let oe=!1;const ie=(m,E,M)=>{let Z;m==null?E._vnode&&(se(E._vnode,null,null,!0),Z=E._vnode.component):g(E._vnode||null,m,E,null,null,null,M),E._vnode=m,oe||(oe=!0,tu(Z),ml(),oe=!1)},me={p:g,um:se,m:ce,r:fe,mt:$,mc:S,pc:x,pbc:O,n:j,o:e};let pe,Le;return t&&([pe,Le]=t(me)),{render:ie,hydrate:pe,createApp:Zv(ie,pe)}}function Ir({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function cp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Xo(e,t,s=!1){const n=e.children,a=t.children;if(he(n)&&he(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=qs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Xo(l,r)),r.type===_n&&(r.patchFlag===-1&&(r=a[i]=qs(r)),r.el=l.el),r.type===ht&&!r.el&&(r.el=l.el)}}function cb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function up(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:up(t)}function yl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function dp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?dp(t.subTree):null}const xl=e=>e.__isSuspense;let lo=0;const ub={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)fb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}pb(e,t,s,n,a,l,r,o,c)}},hydrate:hb,normalize:gb},db=ub;function bi(e,t){const s=e.props&&e.props[t];we(s)&&s()}function fb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=fp(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(bi(e,"onPending"),bi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ya(f,e.ssFallback)):f.resolve(!1,!0)}function pb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:v,pendingBranch:g,isInFallback:w,isHydrating:N}=d;if(g)d.pendingBranch=f,xs(g,f)?(o(g,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():w&&(N||(o(v,p,s,n,a,null,i,l,r),ya(d,p)))):(d.pendingId=lo++,N?(d.isHydrating=!1,d.activeBranch=g):c(g,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),w?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(v,p,s,n,a,null,i,l,r),ya(d,p))):v&&xs(v,f)?(o(v,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(v&&xs(v,f))o(v,f,s,n,a,d,i,l,r),ya(d,f);else if(bi(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=lo++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:y,pendingId:b}=d;y>0?setTimeout(()=>{d.pendingId===b&&d.fallback(p)},y):y===0&&d.fallback(p)}}function fp(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:v,o:{parentNode:g,remove:w}}=c;let N;const y=mb(e);y&&t&&t.pendingBranch&&(N=t.pendingId,t.deps++);const b=e.props?dl(e.props.timeout):void 0,_=i,C={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:lo++,timeout:typeof b=="number"?b:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(I=!1,L=!1){const{vnode:S,activeBranch:A,pendingBranch:O,pendingId:U,effects:P,parentComponent:T,container:$,isInFallback:W}=C;let K=!1;if(C.isHydrating)C.isHydrating=!1;else if(!I){K=A&&O.transition&&O.transition.mode==="out-in";let B=!1;K&&(A.transition.afterLeave=()=>{U===C.pendingId&&(f(O,$,i===_&&!B?v(A):i,0),hi(P),W&&S.ssFallback&&(S.ssFallback.el=null))}),A&&!C.isFallbackMountPending&&(g(A.el)===$&&(i=v(A),B=!0),p(A,T,C,!0),!K&&W&&S.ssFallback&&vt(()=>S.ssFallback.el=null,C)),K||f(O,$,i,0)}C.isFallbackMountPending=!1,ya(C,O),C.pendingBranch=null,C.isInFallback=!1;let D=C.parent,x=!1;for(;D;){if(D.pendingBranch){D.effects.push(...P),x=!0;break}D=D.parent}!x&&!K&&hi(P),C.effects=[],y&&t&&t.pendingBranch&&N===t.pendingId&&(t.deps--,t.deps===0&&!L&&t.resolve()),bi(S,"onResolve")},fallback(I){if(!C.pendingBranch)return;const{vnode:L,activeBranch:S,parentComponent:A,container:O,namespace:U}=C;bi(L,"onFallback");const P=v(S),T=()=>{C.isFallbackMountPending=!1,C.isInFallback&&(d(null,I,O,P,A,null,U,r,o),ya(C,I))},$=I.transition&&I.transition.mode==="out-in";$&&(C.isFallbackMountPending=!0,S.transition.afterLeave=T),C.isInFallback=!0,p(S,A,null,!0),$||T()},move(I,L,S){C.activeBranch&&f(C.activeBranch,I,L,S),C.container=I},next(){return C.activeBranch&&v(C.activeBranch)},registerDep(I,L,S){const A=!!C.pendingBranch;A&&C.deps++;const O=I.vnode.el;I.asyncDep.catch(U=>{Jn(U,I,0)}).then(U=>{if(I.isUnmounted||C.isUnmounted||C.pendingId!==I.suspenseId)return;_i(),I.asyncResolved=!0;const{vnode:P}=I;ro(I,U,!1),O&&(P.el=O);const T=!O&&I.subTree.el;L(I,P,g(O||I.subTree.el),O?null:v(I.subTree),C,l,S),T&&(P.placeholder=null,w(T)),lr(I,P.el),A&&--C.deps===0&&C.resolve()})},unmount(I,L){C.isUnmounted=!0,C.activeBranch&&p(C.activeBranch,s,I,L),C.pendingBranch&&p(C.pendingBranch,s,I,L)}};return C}function hb(e,t,s,n,a,i,l,r,o){const c=t.suspense=fp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function gb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=gu(n?s.default:s),e.ssFallback=n?gu(s.fallback):lt(ht)}function gu(e){let t;if(we(e)){const s=jn&&e._c;s&&(e._d=!1,yi()),e=e(),s&&(e._d=!0,t=$t,hp())}return he(e)&&(e=Xv(e)),e=Xt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function pp(e,t){t&&t.pendingBranch?he(e)?t.effects.push(...e):t.effects.push(e):hi(e)}function ya(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,lr(n,a))}function mb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const At=Symbol.for("v-fgt"),_n=Symbol.for("v-txt"),ht=Symbol.for("v-cmt"),Un=Symbol.for("v-stc"),ii=[];let $t=null;function yi(e=!1){ii.push($t=e?null:[])}function hp(){ii.pop(),$t=ii[ii.length-1]||null}let jn=1;function xi(e,t=!1){jn+=e,e<0&&$t&&t&&($t.hasOnce=!0)}function gp(e){return e.dynamicChildren=jn>0?$t||pa:null,hp(),jn>0&&$t&&$t.push(e),e}function vb(e,t,s,n,a,i){return gp(ec(e,t,s,n,a,i,!0))}function _l(e,t,s,n,a){return gp(lt(e,t,s,n,a,!0))}function rn(e){return e?e.__v_isVNode===!0:!1}function xs(e,t){return e.type===t.type&&e.key===t.key}function bb(e){}const mp=({key:e})=>e??null,il=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ae(e)||yt(e)||we(e)?{i:Lt,r:e,k:t,f:!!s}:e:null);function ec(e,t=null,s=null,n=0,a=null,i=e===At?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&mp(t),ref:t&&il(t),scopeId:Ql,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Lt};return r?(sc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Ae(s)?8:16),jn>0&&!l&&$t&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&$t.push(o),o}const lt=yb;function yb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===qf)&&(e=ht),rn(e)){const r=Ps(e,t,!0);return s&&sc(r,s),jn>0&&!i&&$t&&(r.shapeFlag&6?$t[$t.indexOf(e)]=r:$t.push(r)),r.patchFlag=-2,r}if(Cb(e)&&(e=e.__vccOpts),t){t=vp(t);let{class:r,style:o}=t;r&&!Ae(r)&&(t.class=Ii(r)),je(o)&&(Ni(o)&&!he(o)&&(o=Pe({},o)),t.style=Ri(o))}const l=Ae(e)?1:xl(e)?128:Df(e)?64:je(e)?4:we(e)?2:0;return ec(e,t,s,n,a,l,i,!0)}function vp(e){return e?Ni(e)||ep(e)?Pe({},e):e:null}function Ps(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?yp(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&mp(c),ref:t&&t.ref?s&&i?he(i)?i.concat(il(t)):[i,il(t)]:il(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==At?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ps(e.ssContent),ssFallback:e.ssFallback&&Ps(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&ln(u,o.clone(u)),u}function tc(e=" ",t=0){return lt(_n,null,e,t)}function xb(e,t){const s=lt(Un,null,e);return s.staticCount=t,s}function bp(e="",t=!1){return t?(yi(),_l(ht,null,e)):lt(ht,null,e)}function Xt(e){return e==null||typeof e=="boolean"?lt(ht):he(e)?lt(At,null,e.slice()):rn(e)?qs(e):lt(_n,null,String(e))}function qs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ps(e)}function sc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(he(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),sc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!ep(t)?t._ctx=Lt:a===3&&Lt&&(Lt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else we(t)?(t={default:t,_ctx:Lt},s=32):(t=String(t),n&64?(s=16,t=[tc(t)]):s=8);e.children=t,e.shapeFlag|=s}function yp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Ii([t.class,n.class]));else if(a==="style")t.style=Ri([t.style,n.style]);else if(Gn(a)){const i=t[a],l=n[a];l&&i!==l&&!(he(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Hl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Yt(e,t,s,n=null){rs(e,t,7,[s,n])}const _b=Wf();let kb=0;function xp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||_b,i={uid:kb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Do(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:sp(n,a),emitsOptions:Jf(n,a),emit:null,emitted:null,propsDefaults:Fe,inheritAttrs:n.inheritAttrs,ctx:Fe,data:Fe,props:Fe,attrs:Fe,slots:Fe,refs:Fe,setupState:Fe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Yv.bind(null,i),e.ce&&e.ce(i),i}let Nt=null;const Kt=()=>Nt||Lt;let kl,xa;{const e=Kl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};kl=t("__VUE_INSTANCE_SETTERS__",s=>Nt=s),xa=t("__VUE_SSR_SETTERS__",s=>zn=s)}const Pa=e=>{const t=Nt;return kl(e),e.scope.on(),()=>{e.scope.off(),kl(t)}},_i=()=>{Nt&&Nt.scope.off(),kl(null)};function _p(e){return e.vnode.shapeFlag&4}let zn=!1;function kp(e,t=!1,s=!1){t&&xa(t);const{props:n,children:a}=e.vnode,i=_p(e);nb(e,n,i,t),rb(e,a,s||t);const l=i?wb(e,t):void 0;return t&&xa(!1),l}function wb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,so);const{setup:n}=s;if(n){nn();const a=e.setupContext=n.length>1?Tp(e):null,i=Pa(e),l=Ma(n,e,0,[e.props,a]),r=Oo(l);if(an(),i(),(r||e.sp)&&!en(e)&&qo(e),r){if(l.then(_i,_i),t)return l.then(o=>{ro(e,o,t)}).catch(o=>{Jn(o,e,0)});e.asyncDep=l}else ro(e,l,t)}else Sp(e,t)}function ro(e,t,s){we(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:je(t)&&(e.setupState=Bo(t)),Sp(e,s)}let wl,oo;function wp(e){wl=e,oo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Rv))}}const Sb=()=>!wl;function Sp(e,t,s){const n=e.type;if(!e.render){if(!t&&wl&&!n.render){const a=n.template||Jo(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Pe(Pe({isCustomElement:i,delimiters:r},l),o);n.render=wl(a,c)}}e.render=n.render||Ot,oo&&oo(e)}{const a=Pa(e);nn();try{jv(e)}finally{an(),a()}}}const Tb={get(e,t){return Ft(e,"get",""),e[t]}};function Tp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Tb),slots:e.slots,emit:e.emit,expose:t}}function Mi(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Bo(yf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ai)return ai[s](e)},has(t,s){return s in t||s in ai}})):e.proxy}function co(e,t=!0){return we(e)?e.displayName||e.name:e.name||t&&e.__name}function Cb(e){return we(e)&&"__vccOpts"in e}const J=(e,t)=>Lm(e,t,zn);function Sa(e,t,s){try{xi(-1);const n=arguments.length;return n===2?je(t)&&!he(t)?rn(t)?lt(e,null,[t]):lt(e,t):lt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&rn(s)&&(s=[s]),lt(e,t,s))}finally{xi(1)}}function Eb(){}function Ab(e,t,s,n){const a=s[n];if(a&&Cp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Cp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Et(s[n],t[n]))return!1;return jn>0&&$t&&$t.push(e),!0}const Ep="3.5.38",Rb=Ot,Ib=Hm,Nb=oa,Lb=Af,Ob={createComponentInstance:xp,setupComponent:kp,renderComponentRoot:al,setCurrentRenderingInstance:mi,isVNode:rn,normalizeVNode:Xt,getComponentPublicInstance:Mi,ensureValidVNode:Zo,pushWarningContext:Fm,popWarningContext:$m},Db=Ob,Mb=null,Pb=null,Fb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let uo;const mu=typeof window<"u"&&window.trustedTypes;if(mu)try{uo=mu.createPolicy("vue",{createHTML:e=>e})}catch{}const Ap=uo?e=>uo.createHTML(e):e=>e,$b="http://www.w3.org/2000/svg",Ub="http://www.w3.org/1998/Math/MathML",zs=typeof document<"u"?document:null,vu=zs&&zs.createElement("template"),Rp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?zs.createElementNS($b,e):t==="mathml"?zs.createElementNS(Ub,e):s?zs.createElement(e,{is:s}):zs.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>zs.createTextNode(e),createComment:e=>zs.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>zs.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{vu.innerHTML=Ap(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=vu.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},fn="transition",ja="animation",Ta=Symbol("_vtc"),Ip={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Np=Pe({},zo,Ip),Bb=e=>(e.displayName="Transition",e.props=Np,e),Hb=Bb((e,{slots:t})=>Sa(Ff,Lp(e),t)),In=(e,t=[])=>{he(e)?e.forEach(s=>s(...t)):e&&e(...t)},bu=e=>e?he(e)?e.some(t=>t.length>1):e.length>1:!1;function Lp(e){const t={};for(const P in e)P in Ip||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,v=Vb(a),g=v&&v[0],w=v&&v[1],{onBeforeEnter:N,onEnter:y,onEnterCancelled:b,onLeave:_,onLeaveCancelled:C,onBeforeAppear:I=N,onAppear:L=y,onAppearCancelled:S=b}=t,A=(P,T,$,W)=>{P._enterCancelled=W,mn(P,T?u:r),mn(P,T?c:l),$&&$()},O=(P,T)=>{P._isLeaving=!1,mn(P,d),mn(P,p),mn(P,f),T&&T()},U=P=>(T,$)=>{const W=P?L:y,K=()=>A(T,P,$);In(W,[T,K]),yu(()=>{mn(T,P?o:i),As(T,P?u:r),bu(W)||xu(T,n,g,K)})};return Pe(t,{onBeforeEnter(P){In(N,[P]),As(P,i),As(P,l)},onBeforeAppear(P){In(I,[P]),As(P,o),As(P,c)},onEnter:U(!1),onAppear:U(!0),onLeave(P,T){P._isLeaving=!0;const $=()=>O(P,T);As(P,d),P._enterCancelled?(As(P,f),fo(P)):(fo(P),As(P,f)),yu(()=>{P._isLeaving&&(mn(P,d),As(P,p),bu(_)||xu(P,n,w,$))}),In(_,[P,$])},onEnterCancelled(P){A(P,!1,void 0,!0),In(b,[P])},onAppearCancelled(P){A(P,!0,void 0,!0),In(S,[P])},onLeaveCancelled(P){O(P),In(C,[P])}})}function Vb(e){if(e==null)return null;if(je(e))return[Nr(e.enter),Nr(e.leave)];{const t=Nr(e);return[t,t]}}function Nr(e){return dl(e)}function As(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ta]||(e[Ta]=new Set)).add(t)}function mn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ta];s&&(s.delete(t),s.size||(e[Ta]=void 0))}function yu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let jb=0;function xu(e,t,s,n){const a=e._endId=++jb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Op(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Op(e,t){const s=window.getComputedStyle(e),n=v=>(s[v]||"").split(", "),a=n(`${fn}Delay`),i=n(`${fn}Duration`),l=_u(a,i),r=n(`${ja}Delay`),o=n(`${ja}Duration`),c=_u(r,o);let u=null,d=0,f=0;t===fn?l>0&&(u=fn,d=l,f=i.length):t===ja?c>0&&(u=ja,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?fn:ja:null,f=u?u===fn?i.length:o.length:0);const p=u===fn&&/\b(?:transform|all)(?:,|$)/.test(n(`${fn}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function _u(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>ku(s)+ku(e[n])))}function ku(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function fo(e){return(e?e.ownerDocument:document).body.offsetHeight}function zb(e,t,s){const n=e[Ta];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Sl=Symbol("_vod"),nc=Symbol("_vsh"),Dp={name:"show",beforeMount(e,{value:t},{transition:s}){e[Sl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):za(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),za(e,!0),n.enter(e)):n.leave(e,()=>{za(e,!1)}):za(e,t))},beforeUnmount(e,{value:t}){za(e,t)}};function za(e,t){e.style.display=t?e[Sl]:"none",e[nc]=!t}function qb(){Dp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Mp=Symbol("");function Kb(e){const t=Kt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Tl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Tl(t.ce,a):po(t.subTree,a),s(a)};Ko(()=>{hi(n)}),He(()=>{ls(n,Ot,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),gt(()=>a.disconnect())})}function po(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{po(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Tl(e.el,t);else if(e.type===At)e.children.forEach(s=>po(s,t));else if(e.type===Un){let{el:s,anchor:n}=e;for(;s&&(Tl(s,t),s!==n);)s=s.nextSibling}}function Tl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Qg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Mp]=n}}const Gb=/(?:^|;)\s*display\s*:/;function Wb(e,t,s){const n=e.style,a=Ae(s);let i=!1;if(s&&!a){if(t)if(Ae(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Xa(n,r,"")}else for(const l in t)s[l]==null&&Xa(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Jb(e,l,!Ae(t)&&t?t[l]:void 0,r)||Xa(n,l,r):Xa(n,l,"")}}else if(a){if(t!==s){const l=n[Mp];l&&(s+=";"+l),n.cssText=s,i=Gb.test(s)}}else t&&e.removeAttribute("style");Sl in e&&(e[Sl]=i?n.display:"",e[nc]&&(n.display="none"))}const wu=/\s*!important$/;function Xa(e,t,s){if(he(s))s.forEach(n=>Xa(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Zb(e,t);wu.test(s)?e.setProperty(es(n),s.replace(wu,""),"important"):e[n]=s}}const Su=["Webkit","Moz","ms"],Lr={};function Zb(e,t){const s=Lr[t];if(s)return s;let n=Qe(t);if(n!=="filter"&&n in e)return Lr[t]=n;n=Zn(n);for(let a=0;a<Su.length;a++){const i=Su[a]+n;if(i in e)return Lr[t]=i}return t}function Jb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ae(n)&&s===n}const Tu="http://www.w3.org/1999/xlink";function Cu(e,t,s,n,a,i=Jg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Tu,t.slice(6,t.length)):e.setAttributeNS(Tu,t,s):s==null||i&&!Qd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Bt(s)?String(s):s)}function Eu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ap(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Qd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Zs(e,t,s,n){e.addEventListener(t,s,n)}function Yb(e,t,s,n){e.removeEventListener(t,s,n)}const Au=Symbol("_vei");function Qb(e,t,s,n,a=null){const i=e[Au]||(e[Au]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Xb(t);if(n){const c=i[t]=sy(n,a);Zs(e,r,c,o)}else l&&(Yb(e,r,l,o),i[t]=void 0)}}const Ru=/(?:Once|Passive|Capture)$/;function Xb(e){let t;if(Ru.test(e)){t={};let n;for(;n=e.match(Ru);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):es(e.slice(2)),t]}let Or=0;const ey=Promise.resolve(),ty=()=>Or||(ey.then(()=>Or=0),Or=Date.now());function sy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(he(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&rs(c,t,5,r)}}else rs(a,t,5,[n])};return s.value=e,s.attached=ty(),s}const Iu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Pp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?zb(e,n,l):t==="style"?Wb(e,s,n):Gn(t)?Hl(t)||Qb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):ny(e,t,n,l))?(Eu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Cu(e,t,n,l,i,t!=="value")):e._isVueCE&&(ay(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ae(n)))?Eu(e,Qe(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Cu(e,t,n,l))};function ny(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Iu(t)&&we(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Iu(t)&&Ae(s)?!1:t in e}function ay(e,t){const s=e._def.props;if(!s)return!1;const n=Qe(t);return Array.isArray(s)?s.some(a=>Qe(a)===n):Object.keys(s).some(a=>Qe(a)===n)}const Nu={};function Fp(e,t,s){let n=Oi(e,t);Vl(n)&&(n=Pe({},n,t));class a extends rr{constructor(l){super(n,l,s)}}return a.def=n,a}const iy=((e,t)=>Fp(e,t,Jp)),ly=typeof HTMLElement<"u"?HTMLElement:class{};class rr extends ly{constructor(t,s={},n=Al){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Al?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Pe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof rr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,St(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!he(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=dl(this._props[o])),(r||(r=Object.create(null)))[Qe(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)ze(this,n)||Object.defineProperty(this,n,{get:()=>Ds(s[n])})}_resolveProps(t){const{props:s}=t,n=he(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Qe))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Nu;const a=Qe(t);s&&this._numberProps&&this._numberProps[a]&&(n=dl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Nu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(es(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(es(t),s+""):s||this.removeAttribute(es(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Zp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=lt(this._def,Pe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Vl(l[0])?Pe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),es(i)!==i&&a(es(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function $p(e){const t=Kt(),s=t&&t.ce;return s||null}function ry(){const e=$p();return e&&e.shadowRoot}function oy(e="$style"){{const t=Kt();if(!t)return Fe;const s=t.type.__cssModules;if(!s)return Fe;const n=s[e];return n||Fe}}const Up=new WeakMap,Bp=new WeakMap,Cl=Symbol("_moveCb"),Lu=Symbol("_enterCb"),cy=e=>(delete e.props.mode,e),uy=cy({name:"TransitionGroup",props:Pe({},Np,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Kt(),n=jo();let a,i;return nr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!gy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(fy),a.forEach(py);const r=a.filter(hy);fo(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;As(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[Cl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[Cl]=null,mn(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Be(e),r=Lp(l);let o=l.tag||At;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[nc]&&(a.push(u),ln(u,wa(u,r,n,s)),Up.set(u,Hp(u.el)))}i=t.default?Xl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&ln(u,wa(u,r,n,s))}return lt(o,null,i)}}}),dy=uy;function fy(e){const t=e.el;t[Cl]&&t[Cl](),t[Lu]&&t[Lu]()}function py(e){Bp.set(e,Hp(e.el))}function hy(e){const t=Up.get(e),s=Bp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Hp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function gy(e,t,s){const n=e.cloneNode(),a=e[Ta];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Op(n);return i.removeChild(n),l}const wn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return he(t)?s=>ma(t,s):t};function my(e){e.target.composing=!0}function Ou(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const ms=Symbol("_assign");function Du(e,t,s){return t&&(e=e.trim()),s&&(e=ql(e)),e}const El={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[ms]=wn(a);const i=n||a.props&&a.props.type==="number";Zs(e,t?"change":"input",l=>{l.target.composing||e[ms](Du(e.value,s,i))}),(s||i)&&Zs(e,"change",()=>{e.value=Du(e.value,s,i)}),t||(Zs(e,"compositionstart",my),Zs(e,"compositionend",Ou),Zs(e,"change",Ou))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[ms]=wn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?ql(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},ac={deep:!0,created(e,t,s){e[ms]=wn(s),Zs(e,"change",()=>{const n=e._modelValue,a=Ca(e),i=e.checked,l=e[ms];if(he(n)){const r=Gl(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Wn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(jp(e,i))})},mounted:Mu,beforeUpdate(e,t,s){e[ms]=wn(s),Mu(e,t,s)}};function Mu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(he(t))a=Gl(t,n.props.value)>-1;else if(Wn(t))a=t.has(n.props.value);else{if(t===s)return;a=sn(t,jp(e,!0))}e.checked!==a&&(e.checked=a)}const ic={created(e,{value:t},s){e.checked=sn(t,s.props.value),e[ms]=wn(s),Zs(e,"change",()=>{e[ms](Ca(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[ms]=wn(n),t!==s&&(e.checked=sn(t,n.props.value))}},Vp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Wn(t);Zs(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?ql(Ca(l)):Ca(l));e[ms](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,St(()=>{e._assigning=!1})}),e[ms]=wn(n)},mounted(e,{value:t}){Pu(e,t)},beforeUpdate(e,t,s){e[ms]=wn(s)},updated(e,{value:t}){e._assigning||Pu(e,t)}};function Pu(e,t){const s=e.multiple,n=he(t);if(!(s&&!n&&!Wn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ca(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=Gl(t,r)>-1}else l.selected=t.has(r);else if(sn(Ca(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ca(e){return"_value"in e?e._value:e.value}function jp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const zp={created(e,t,s){Yi(e,t,s,null,"created")},mounted(e,t,s){Yi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Yi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Yi(e,t,s,n,"updated")}};function qp(e,t){switch(e){case"SELECT":return Vp;case"TEXTAREA":return El;default:switch(t){case"checkbox":return ac;case"radio":return ic;default:return El}}}function Yi(e,t,s,n,a){const l=qp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function vy(){El.getSSRProps=({value:e})=>({value:e}),ic.getSSRProps=({value:e},t)=>{if(t.props&&sn(t.props.value,e))return{checked:!0}},ac.getSSRProps=({value:e},t)=>{if(he(e)){if(t.props&&Gl(e,t.props.value)>-1)return{checked:!0}}else if(Wn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},zp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=qp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const by=["ctrl","shift","alt","meta"],yy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>by.some(s=>e[`${s}Key`]&&!t.includes(s))},xy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=yy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},_y={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},ky=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=es(a.key);if(t.some(l=>l===i||_y[l]===i))return e(a)}))},Kp=Pe({patchProp:Pp},Rp);let li,Fu=!1;function Gp(){return li||(li=lp(Kp))}function Wp(){return li=Fu?li:rp(Kp),Fu=!0,li}const Zp=((...e)=>{Gp().render(...e)}),wy=((...e)=>{Wp().hydrate(...e)}),Al=((...e)=>{const t=Gp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Qp(n);if(!a)return;const i=t._component;!we(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Yp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Jp=((...e)=>{const t=Wp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Qp(n);if(a)return s(a,!0,Yp(a))},t});function Yp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Qp(e){return Ae(e)?document.querySelector(e):e}let $u=!1;const Sy=()=>{$u||($u=!0,vy(),qb())},Ty=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Ff,BaseTransitionPropsValidators:zo,Comment:ht,DeprecationTypes:Fb,EffectScope:Do,ErrorCodes:Bm,ErrorTypeStrings:Ib,Fragment:At,KeepAlive:yv,ReactiveEffect:di,Static:Un,Suspense:db,Teleport:tv,Text:_n,TrackOpTypes:Om,Transition:Hb,TransitionGroup:dy,TriggerOpTypes:Dm,VueElement:rr,assertNumber:Um,callWithAsyncErrorHandling:rs,callWithErrorHandling:Ma,camelize:Qe,capitalize:Zn,cloneVNode:Ps,compatUtils:Pb,computed:J,createApp:Al,createBlock:_l,createCommentVNode:bp,createElementBlock:vb,createElementVNode:ec,createHydrationRenderer:rp,createPropsRestProxy:Hv,createRenderer:lp,createSSRApp:Jp,createSlots:Cv,createStaticVNode:xb,createTextVNode:tc,createVNode:lt,customRef:_f,defineAsyncComponent:vv,defineComponent:Oi,defineCustomElement:Fp,defineEmits:Nv,defineExpose:Lv,defineModel:Mv,defineOptions:Ov,defineProps:Iv,defineSSRCustomElement:iy,defineSlots:Dv,devtools:Nb,effect:sm,effectScope:Xg,getCurrentInstance:Kt,getCurrentScope:sf,getCurrentWatcher:Mm,getTransitionRawChildren:Xl,guardReactiveProps:vp,h:Sa,handleError:Jn,hasInjectionContext:Wm,hydrate:wy,hydrateOnIdle:dv,hydrateOnInteraction:gv,hydrateOnMediaQuery:hv,hydrateOnVisible:pv,initCustomFormatter:Eb,initDirectivesForSSR:Sy,inject:gs,isMemoSame:Cp,isProxy:Ni,isReactive:Xs,isReadonly:Ms,isRef:yt,isRuntimeOnly:Sb,isShallow:ss,isVNode:rn,markRaw:yf,mergeDefaults:Uv,mergeModels:Bv,mergeProps:yp,nextTick:St,nodeOps:Rp,normalizeClass:Ii,normalizeProps:Bg,normalizeStyle:Ri,onActivated:er,onBeforeMount:Bf,onBeforeUnmount:ar,onBeforeUpdate:Ko,onDeactivated:tr,onErrorCaptured:zf,onMounted:He,onRenderTracked:jf,onRenderTriggered:Vf,onScopeDispose:em,onServerPrefetch:Hf,onUnmounted:gt,onUpdated:nr,onWatcherCleanup:wf,openBlock:yi,patchProp:Pp,popScopeId:qm,provide:ni,proxyRefs:Bo,pushScopeId:zm,queuePostFlushCb:hi,reactive:Sn,readonly:pl,ref:h,registerRuntimeCompiler:wp,render:Zp,renderList:Tv,renderSlot:Ev,resolveComponent:kv,resolveDirective:Sv,resolveDynamicComponent:wv,resolveFilter:Mb,resolveTransitionHooks:wa,setBlockTracking:xi,setDevtoolsHook:Lb,setTransitionHooks:ln,shallowReactive:$o,shallowReadonly:_m,shallowRef:Uo,ssrContextKey:Rf,ssrUtils:Db,stop:nm,toDisplayString:ef,toHandlerKey:ga,toHandlers:Av,toRaw:Be,toRef:Im,toRefs:Em,toValue:Sm,transformVNodeArgs:bb,triggerRef:wm,unref:Ds,useAttrs:$v,useCssModule:oy,useCssVars:Kb,useHost:$p,useId:nv,useModel:Jv,useSSRContext:If,useShadowRoot:ry,useSlots:Fv,useTemplateRef:av,useTransitionState:jo,vModelCheckbox:ac,vModelDynamic:zp,vModelRadio:ic,vModelSelect:Vp,vModelText:El,vShow:Dp,version:Ep,warn:Rb,watch:ls,watchEffect:Zm,watchPostEffect:Jm,watchSyncEffect:Nf,withAsyncContext:Vv,withCtx:Vo,withDefaults:Pv,withDirectives:Gm,withKeys:ky,withMemo:Ab,withModifiers:xy,withScopeId:Km},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ki=Symbol(""),ri=Symbol(""),lc=Symbol(""),Rl=Symbol(""),Xp=Symbol(""),qn=Symbol(""),eh=Symbol(""),th=Symbol(""),rc=Symbol(""),oc=Symbol(""),Pi=Symbol(""),cc=Symbol(""),sh=Symbol(""),uc=Symbol(""),dc=Symbol(""),fc=Symbol(""),pc=Symbol(""),hc=Symbol(""),gc=Symbol(""),nh=Symbol(""),ah=Symbol(""),or=Symbol(""),Il=Symbol(""),mc=Symbol(""),vc=Symbol(""),wi=Symbol(""),Fi=Symbol(""),bc=Symbol(""),ho=Symbol(""),Cy=Symbol(""),go=Symbol(""),Nl=Symbol(""),Ey=Symbol(""),Ay=Symbol(""),yc=Symbol(""),Ry=Symbol(""),Iy=Symbol(""),xc=Symbol(""),ih=Symbol(""),Ea={[ki]:"Fragment",[ri]:"Teleport",[lc]:"Suspense",[Rl]:"KeepAlive",[Xp]:"BaseTransition",[qn]:"openBlock",[eh]:"createBlock",[th]:"createElementBlock",[rc]:"createVNode",[oc]:"createElementVNode",[Pi]:"createCommentVNode",[cc]:"createTextVNode",[sh]:"createStaticVNode",[uc]:"resolveComponent",[dc]:"resolveDynamicComponent",[fc]:"resolveDirective",[pc]:"resolveFilter",[hc]:"withDirectives",[gc]:"renderList",[nh]:"renderSlot",[ah]:"createSlots",[or]:"toDisplayString",[Il]:"mergeProps",[mc]:"normalizeClass",[vc]:"normalizeStyle",[wi]:"normalizeProps",[Fi]:"guardReactiveProps",[bc]:"toHandlers",[ho]:"camelize",[Cy]:"capitalize",[go]:"toHandlerKey",[Nl]:"setBlockTracking",[Ey]:"pushScopeId",[Ay]:"popScopeId",[yc]:"withCtx",[Ry]:"unref",[Iy]:"isRef",[xc]:"withMemo",[ih]:"isMemoSame"};function Ny(e){Object.getOwnPropertySymbols(e).forEach(t=>{Ea[t]=e[t]})}const us={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ly(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:us}}function Si(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=us){return e&&(r?(e.helper(qn),e.helper(Ia(e.inSSR,c))):e.helper(Ra(e.inSSR,c)),l&&e.helper(hc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function Bn(e,t=us){return{type:17,loc:t,elements:e}}function hs(e,t=us){return{type:15,loc:t,properties:e}}function bt(e,t){return{type:16,loc:us,key:Ae(e)?Ne(e,!0):e,value:t}}function Ne(e,t=!1,s=us,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function ks(e,t=us){return{type:8,loc:t,children:e}}function Tt(e,t=[],s=us){return{type:14,loc:s,callee:e,arguments:t}}function Aa(e,t=void 0,s=!1,n=!1,a=us){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function mo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:us}}function Oy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:us}}function Dy(e){return{type:21,body:e,loc:us}}function Ra(e,t){return e||t?rc:oc}function Ia(e,t){return e||t?eh:th}function _c(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Ra(n,e.isComponent)),t(qn),t(Ia(n,e.isComponent)))}const Uu=new Uint8Array([123,123]),Bu=new Uint8Array([125,125]);function Hu(e){return e>=97&&e<=122||e>=65&&e<=90}function as(e){return e===32||e===10||e===9||e===12||e===13}function pn(e){return e===47||e===62||as(e)}function Ll(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Dt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class My{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Uu,this.delimiterClose=Bu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Uu,this.delimiterClose=Bu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?pn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||as(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Dt.TitleEnd||this.currentSequence===Dt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Dt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Dt.Cdata.length&&(this.state=28,this.currentSequence=Dt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Hu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){pn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(pn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Ll("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){as(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Hu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||as(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):as(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):as(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||pn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||pn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||pn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||pn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||pn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):as(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):as(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){as(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Dt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Dt.ScriptEnd[3]?this.startSpecial(Dt.ScriptEnd,4):t===Dt.StyleEnd[3]?this.startSpecial(Dt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Dt.TitleEnd[3]?this.startSpecial(Dt.TitleEnd,4):t===Dt.TextareaEnd[3]?this.startSpecial(Dt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Vu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Hn(e,t){const s=Vu("MODE",t),n=Vu(e,t);return s===3?n===!0:n!==!1}function Ti(e,t,s,...n){return Hn(e,t)}function kc(e){throw e}function lh(e){}function at(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ts=e=>e.type===4&&e.isStatic;function rh(e){switch(e){case"Teleport":case"teleport":return ri;case"Suspense":case"suspense":return lc;case"KeepAlive":case"keep-alive":return Rl;case"BaseTransition":case"base-transition":return Xp}}const Py=/^$|^\d|[^\$\w\xA0-\uFFFF]/,wc=e=>!Py.test(e),oh=/[A-Za-z_$\xA0-\uFFFF]/,Fy=/[\.\?\w$\xA0-\uFFFF]/,$y=/\s+[.[]\s*|\s*[.[]\s+/g,ch=e=>e.type===4?e.content:e.loc.source,Uy=e=>{const t=ch(e).trim().replace($y,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?oh:Fy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},uh=Uy,By=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Hy=e=>By.test(ch(e)),Vy=Hy;function ps(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ae(t)?a.name===t:t.test(a.name)))return a}}function cr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Dn(i.arg,t))return i}}function Dn(e,t){return!!(e&&ts(e)&&e.content===t)}function jy(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Dr(e){return e.type===5||e.type===2}function ju(e){return e.type===7&&e.name==="pre"}function zy(e){return e.type===7&&e.name==="slot"}function Ol(e){return e.type===1&&e.tagType===3}function Dl(e){return e.type===1&&e.tagType===2}const qy=new Set([wi,Fi]);function dh(e,t=[]){if(e&&!Ae(e)&&e.type===14){const s=e.callee;if(!Ae(s)&&qy.has(s))return dh(e.arguments[0],t.concat(e))}return[e,t]}function Ml(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ae(a)&&a.type===14){const r=dh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Ae(a))n=hs([t]);else if(a.type===14){const r=a.arguments[0];!Ae(r)&&r.type===15?zu(t,r)||r.properties.unshift(t):a.callee===bc?n=Tt(s.helper(Il),[hs([t]),a]):a.arguments.unshift(hs([t])),!n&&(n=a)}else a.type===15?(zu(t,a)||a.properties.unshift(t),n=a):(n=Tt(s.helper(Il),[hs([t]),a]),l&&l.callee===Fi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function zu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Ci(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Ky(e){return e.type===14&&e.callee===xc?e.arguments[1].returns:e}const Gy=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function fh(e){for(let t=0;t<e.length;t++)if(!as(e.charCodeAt(t)))return!1;return!0}function Sc(e){return e.type===2&&fh(e.content)||e.type===12&&Sc(e.content)}function ph(e){return e.type===3||Sc(e)}const hh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:da,isPreTag:da,isIgnoreNewlineTag:da,isCustomElement:da,onError:kc,onWarn:lh,comments:!1,prefixIdentifiers:!1};let Ve=hh,Ei=null,tn="",Pt=null,$e=null,Jt="",js=-1,Ln=-1,Tc=0,yn=!1,vo=null;const nt=[],ut=new My(nt,{onerr:Bs,ontext(e,t){Qi(It(e,t),e,t)},ontextentity(e,t,s){Qi(e,t,s)},oninterpolation(e,t){if(yn)return Qi(It(e,t),e,t);let s=e+ut.delimiterOpen.length,n=t-ut.delimiterClose.length;for(;as(tn.charCodeAt(s));)s++;for(;as(tn.charCodeAt(n-1));)n--;let a=It(s,n);a.includes("&")&&(a=Ve.decodeEntities(a,!1)),bo({type:5,content:rl(a,!1,pt(s,n)),loc:pt(e,t)})},onopentagname(e,t){const s=It(e,t);Pt={type:1,tag:s,ns:Ve.getNamespace(s,nt[0],Ve.ns),tagType:0,props:[],children:[],loc:pt(e-1,t),codegenNode:void 0}},onopentagend(e){Ku(e)},onclosetag(e,t){const s=It(e,t);if(!Ve.isVoidTag(s)){let n=!1;for(let a=0;a<nt.length;a++)if(nt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Bs(24,nt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=nt.shift();ll(r,t,l<a)}break}n||Bs(23,gh(e,60))}},onselfclosingtag(e){const t=Pt.tag;Pt.isSelfClosing=!0,Ku(e),nt[0]&&nt[0].tag===t&&ll(nt.shift(),e)},onattribname(e,t){$e={type:6,name:It(e,t),nameLoc:pt(e,t),value:void 0,loc:pt(e)}},ondirname(e,t){const s=It(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!yn&&n===""&&Bs(26,e),yn||n==="")$e={type:6,name:s,nameLoc:pt(e,t),value:void 0,loc:pt(e)};else if($e={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ne("prop")]:[],loc:pt(e)},n==="pre"){yn=ut.inVPre=!0,vo=Pt;const a=Pt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=n0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=It(e,t);if(yn&&!ju($e))$e.name+=s,Mn($e.nameLoc,t);else{const n=s[0]!=="[";$e.arg=rl(n?s:s.slice(1,-1),n,pt(e,t),n?3:0)}},ondirmodifier(e,t){const s=It(e,t);if(yn&&!ju($e))$e.name+="."+s,Mn($e.nameLoc,t);else if($e.name==="slot"){const n=$e.arg;n&&(n.content+="."+s,Mn(n.loc,t))}else{const n=Ne(s,!0,pt(e,t));$e.modifiers.push(n)}},onattribdata(e,t){Jt+=It(e,t),js<0&&(js=e),Ln=t},onattribentity(e,t,s){Jt+=e,js<0&&(js=t),Ln=s},onattribnameend(e){const t=$e.loc.start.offset,s=It(t,e);$e.type===7&&($e.rawName=s),Pt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Bs(2,t)},onattribend(e,t){if(Pt&&$e){if(Mn($e.loc,t),e!==0)if(Jt.includes("&")&&(Jt=Ve.decodeEntities(Jt,!0)),$e.type===6)$e.name==="class"&&(Jt=vh(Jt).trim()),e===1&&!Jt&&Bs(13,t),$e.value={type:2,content:Jt,loc:e===1?pt(js,Ln):pt(js-1,Ln+1)},ut.inSFCRoot&&Pt.tag==="template"&&$e.name==="lang"&&Jt&&Jt!=="html"&&ut.enterRCDATA(Ll("</template"),0);else{let s=0;$e.exp=rl(Jt,!1,pt(js,Ln),0,s),$e.name==="for"&&($e.forParseResult=Zy($e.exp));let n=-1;$e.name==="bind"&&(n=$e.modifiers.findIndex(a=>a.content==="sync"))>-1&&Ti("COMPILER_V_BIND_SYNC",Ve,$e.loc,$e.arg.loc.source)&&($e.name="model",$e.modifiers.splice(n,1))}($e.type!==7||$e.name!=="pre")&&Pt.props.push($e)}Jt="",js=Ln=-1},oncomment(e,t){Ve.comments&&bo({type:3,content:It(e,t),loc:pt(e-4,t+3)})},onend(){const e=tn.length;for(let t=0;t<nt.length;t++)ll(nt[t],e-1),Bs(24,nt[t].loc.start.offset)},oncdata(e,t){(nt[0]?nt[0].ns:Ve.ns)!==0?Qi(It(e,t),e,t):Bs(1,e-9)},onprocessinginstruction(e){(nt[0]?nt[0].ns:Ve.ns)===0&&Bs(21,e-1)}}),qu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Wy=/^\(|\)$/g;function Zy(e){const t=e.loc,s=e.content,n=s.match(Gy);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const v=t.start.offset+f,g=v+d.length;return rl(d,!1,pt(v,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Wy,"").trim();const c=a.indexOf(o),u=o.match(qu);if(u){o=o.replace(qu,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function It(e,t){return tn.slice(e,t)}function Ku(e){ut.inSFCRoot&&(Pt.innerLoc=pt(e+1,e+1)),bo(Pt);const{tag:t,ns:s}=Pt;s===0&&Ve.isPreTag(t)&&Tc++,Ve.isVoidTag(t)?ll(Pt,e):(nt.unshift(Pt),(s===1||s===2)&&(ut.inXML=!0)),Pt=null}function Qi(e,t,s){{const i=nt[0]&&nt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ve.decodeEntities(e,!1))}const n=nt[0]||Ei,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Mn(a.loc,s)):n.children.push({type:2,content:e,loc:pt(t,s)})}function ll(e,t,s=!1){s?Mn(e.loc,gh(t,60)):Mn(e.loc,Jy(t,62)+1),ut.inSFCRoot&&(e.children.length?e.innerLoc.end=Pe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Pe({},e.innerLoc.start),e.innerLoc.source=It(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(yn||(n==="slot"?e.tagType=2:Gu(e)?e.tagType=3:Qy(e)&&(e.tagType=1)),ut.inRCDATA||(e.children=mh(i)),a===0&&Ve.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ve.isPreTag(n)&&Tc--,vo===e&&(yn=ut.inVPre=!1,vo=null),ut.inXML&&(nt[0]?nt[0].ns:Ve.ns)===0&&(ut.inXML=!1);{const l=e.props;if(!ut.inSFCRoot&&Hn("COMPILER_NATIVE_TEMPLATE",Ve)&&e.tag==="template"&&!Gu(e)){const o=nt[0]||Ei,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Ti("COMPILER_INLINE_TEMPLATE",Ve,r.loc)&&e.children.length&&(r.value={type:2,content:It(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Jy(e,t){let s=e;for(;tn.charCodeAt(s)!==t&&s<tn.length-1;)s++;return s}function gh(e,t){let s=e;for(;tn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Yy=new Set(["if","else","else-if","for","slot"]);function Gu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Yy.has(t[s].name))return!0}return!1}function Qy({tag:e,props:t}){if(Ve.isCustomElement(e))return!1;if(e==="component"||Xy(e.charCodeAt(0))||rh(e)||Ve.isBuiltInComponent&&Ve.isBuiltInComponent(e)||Ve.isNativeTag&&!Ve.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Ti("COMPILER_IS_ON_ELEMENT",Ve,n.loc))return!0}}else if(n.name==="bind"&&Dn(n.arg,"is")&&Ti("COMPILER_IS_ON_ELEMENT",Ve,n.loc))return!0}return!1}function Xy(e){return e>64&&e<91}const e0=/\r\n/g;function mh(e){const t=Ve.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Tc)a.content=a.content.replace(e0,`
`);else if(fh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&t0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=vh(a.content))}return s?e.filter(Boolean):e}function t0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function vh(e){let t="",s=!1;for(let n=0;n<e.length;n++)as(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function bo(e){(nt[0]||Ei).children.push(e)}function pt(e,t){return{start:ut.getPos(e),end:t==null?t:ut.getPos(t),source:t==null?t:It(e,t)}}function s0(e){return pt(e.start.offset,e.end.offset)}function Mn(e,t){e.end=ut.getPos(t),e.source=It(e.start.offset,t)}function n0(e){const t={type:6,name:e.rawName,nameLoc:pt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function rl(e,t=!1,s,n=0,a=0){return Ne(e,t,s,n)}function Bs(e,t,s){Ve.onError(at(e,pt(t,t)))}function a0(){ut.reset(),Pt=null,$e=null,Jt="",js=-1,Ln=-1,nt.length=0}function i0(e,t){if(a0(),tn=e,Ve=Pe({},hh),t){let a;for(a in t)t[a]!=null&&(Ve[a]=t[a])}ut.mode=Ve.parseMode==="html"?1:Ve.parseMode==="sfc"?2:0,ut.inXML=Ve.ns===1||Ve.ns===2;const s=t&&t.delimiters;s&&(ut.delimiterOpen=Ll(s[0]),ut.delimiterClose=Ll(s[1]));const n=Ei=Ly([],e);return ut.parse(tn),n.loc=pt(0,e.length),n.children=mh(n.children),Ei=null,n}function l0(e,t){ol(e,void 0,t,!!bh(e))}function bh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Dl(t[0])?t[0]:null}function ol(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:is(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const v=p.patchFlag;if((v===void 0||v===512||v===1)&&xh(d,s)>=2){const g=_h(d);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:is(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,ol(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)ol(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)ol(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&he(e.codegenNode.children))e.codegenNode.children=o(Bn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!he(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(Bn(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!he(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=ps(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(Bn(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!he(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function is(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=xh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=is(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=is(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(qn),t.removeHelper(Ia(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Ra(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return is(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Ae(r)||Bt(r))continue;const o=is(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const r0=new Set([mc,vc,wi,Fi]);function yh(e,t){if(e.type===14&&!Ae(e.callee)&&r0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return is(s,t);if(s.type===14)return yh(s,t)}return 0}function xh(e,t){let s=3;const n=_h(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=is(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=is(r,t):r.type===14?c=yh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function _h(e){const t=e.codegenNode;if(t.type===13)return t.props}function o0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ot,isCustomElement:u=Ot,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:v=!1,inSSR:g=!1,ssrCssVars:w="",bindingMetadata:N=Fe,inline:y=!1,isTS:b=!1,onError:_=kc,onWarn:C=lh,compatConfig:I}){const L=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),S={filename:t,selfName:L&&Zn(Qe(L[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:v,inSSR:g,ssrCssVars:w,bindingMetadata:N,inline:y,isTS:b,onError:_,onWarn:C,compatConfig:I,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(A){const O=S.helpers.get(A)||0;return S.helpers.set(A,O+1),A},removeHelper(A){const O=S.helpers.get(A);if(O){const U=O-1;U?S.helpers.set(A,U):S.helpers.delete(A)}},helperString(A){return`_${Ea[S.helper(A)]}`},replaceNode(A){S.parent.children[S.childIndex]=S.currentNode=A},removeNode(A){const O=S.parent.children,U=A?O.indexOf(A):S.currentNode?S.childIndex:-1;!A||A===S.currentNode?(S.currentNode=null,S.onNodeRemoved()):S.childIndex>U&&(S.childIndex--,S.onNodeRemoved()),S.parent.children.splice(U,1)},onNodeRemoved:Ot,addIdentifiers(A){},removeIdentifiers(A){},hoist(A){Ae(A)&&(A=Ne(A)),S.hoists.push(A);const O=Ne(`_hoisted_${S.hoists.length}`,!1,A.loc,2);return O.hoisted=A,O},cache(A,O=!1,U=!1){const P=Oy(S.cached.length,A,O,U);return S.cached.push(P),P}};return S.filters=new Set,S}function c0(e,t){const s=o0(e,t);ur(e,s),t.hoistStatic&&l0(e,s),t.ssr||u0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function u0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=bh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&_c(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Si(t,s(ki),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function d0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ae(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,ur(a,t))}}function ur(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(he(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Pi);break;case 5:t.ssr||t.helper(or);break;case 9:for(let i=0;i<e.branches.length;i++)ur(e.branches[i],t);break;case 10:case 11:case 1:case 0:d0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function kh(e,t){const s=Ae(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(zy))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const dr="/*@__PURE__*/",wh=e=>`${Ea[e]}: _${Ea[e]}`;function f0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Ea[g]}`},push(g,w=-2,N){p.code+=g},indent(){v(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:v(--p.indentLevel)},newline(){v(p.indentLevel)}};function v(g){p.push(`
`+"  ".repeat(g),0)}return p}function p0(e,t={}){const s=f0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";h0(e,s);const g=u?"ssrRender":"render",N=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${N}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(wh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Mr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Mr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Mr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?Ut(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function h0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[rc,oc,Pi,cc,sh].filter(f=>u.includes(f)).map(wh).join(", ");a(`const { ${d} } = _Vue
`,-1)}g0(e.hoists,t),i(),a("return ")}function Mr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?pc:t==="component"?uc:fc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Ci(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function g0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Ut(i,t),n())}t.pure=!1}function Cc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),$i(e,t,s),s&&t.deindent(),t.push("]")}function $i(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Ae(r)?a(r,-3):he(r)?Cc(r,t):Ut(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Ut(e,t){if(Ae(e)){t.push(e,-3);return}if(Bt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Ut(e.codegenNode,t);break;case 2:m0(e,t);break;case 4:Sh(e,t);break;case 5:v0(e,t);break;case 12:Ut(e.codegenNode,t);break;case 8:Th(e,t);break;case 3:y0(e,t);break;case 13:x0(e,t);break;case 14:k0(e,t);break;case 15:w0(e,t);break;case 17:S0(e,t);break;case 18:T0(e,t);break;case 19:C0(e,t);break;case 20:E0(e,t);break;case 21:$i(e.body,t,!0,!1);break}}function m0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Sh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function v0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(dr),s(`${n(or)}(`),Ut(e.content,t),s(")")}function Th(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ae(n)?t.push(n,-3):Ut(n,t)}}function b0(e,t){const{push:s}=t;if(e.type===8)s("["),Th(e,t),s("]");else if(e.isStatic){const n=wc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function y0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(dr),s(`${n(Pi)}(${JSON.stringify(e.content)})`,-3,e)}function x0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let v;o&&(v=String(o)),u&&s(n(hc)+"("),d&&s(`(${n(qn)}(${f?"true":""}), `),a&&s(dr);const g=d?Ia(t.inSSR,p):Ra(t.inSSR,p);s(n(g)+"(",-2,e),$i(_0([i,l,r,v,c]),t),s(")"),d&&s(")"),u&&(s(", "),Ut(u,t),s(")"))}function _0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function k0(e,t){const{push:s,helper:n,pure:a}=t,i=Ae(e.callee)?e.callee:n(e.callee);a&&s(dr),s(i+"(",-2,e),$i(e.arguments,t),s(")")}function w0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];b0(c,t),s(": "),Ut(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function S0(e,t){Cc(e.elements,t)}function T0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Ea[yc]}(`),s("(",-2,e),he(i)?$i(i,t):i&&Ut(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),he(l)?Cc(l,t):Ut(l,t)):r&&Ut(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function C0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!wc(s.content);d&&l("("),Sh(s,t),d&&l(")")}else l("("),Ut(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Ut(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,Ut(a,t),u||t.indentLevel--,i&&o(!0)}function E0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Nl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Ut(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Nl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const A0=kh(/^(?:if|else|else-if)$/,(e,t,s)=>R0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Zu(a,o,s);else{const c=I0(n.codegenNode);c.alternate=Zu(a,o+n.branches.length-1,s)}}}));function R0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(at(28,t.loc)),t.exp=Ne("true",!1,a)}if(t.name==="if"){const a=Wu(e,t),i={type:9,loc:s0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&ph(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(at(30,e.loc)),s.removeNode();const r=Wu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);ur(r,s),o&&o(),s.currentNode=null}else s.onError(at(30,e.loc));break}}}function Wu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ps(e,"for")?e.children:[e],userKey:cr(e,"key"),isTemplateIf:s}}function Zu(e,t,s){return e.condition?mo(e.condition,Ju(e,t,s),Tt(s.helper(Pi),['""',"true"])):Ju(e,t,s)}function Ju(e,t,s){const{helper:n}=s,a=bt("key",Ne(`${t}`,!1,us,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Ml(o,a,s),o}else return Si(s,n(ki),hs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Ky(o);return c.type===13&&_c(c,s),Ml(c,a,s),o}}function I0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const N0=kh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return L0(e,t,s,i=>{const l=Tt(n(gc),[i.source]),r=Ol(e),o=ps(e,"memo"),c=cr(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Ne(c.value.content,!0):void 0:c.exp);const d=u?bt("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=Si(s,n(ki),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let v;const{children:g}=i,w=g.length!==1||g[0].type!==1,N=Dl(e)?e:r&&e.children.length===1&&Dl(e.children[0])?e.children[0]:null;if(N?(v=N.codegenNode,r&&d&&Ml(v,d,s)):w?v=Si(s,n(ki),d?hs([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(v=g[0].codegenNode,r&&d&&Ml(v,d,s),v.isBlock!==!f&&(v.isBlock?(a(qn),a(Ia(s.inSSR,v.isComponent))):a(Ra(s.inSSR,v.isComponent))),v.isBlock=!f,v.isBlock?(n(qn),n(Ia(s.inSSR,v.isComponent))):n(Ra(s.inSSR,v.isComponent))),o){const y=Aa(yo(i.parseResult,[Ne("_cached")]));y.body=Dy([ks(["const _memo = (",o.exp,")"]),ks(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(ih)}(_cached, _memo)) return _cached`]),ks(["const _item = ",v]),Ne("_item.memo = _memo"),Ne("return _item")]),l.arguments.push(y,Ne("_cache"),Ne(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Aa(yo(i.parseResult),v,!0))}})});function L0(e,t,s,n){if(!t.exp){s.onError(at(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(at(32,t.loc));return}Ch(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:Ol(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Ch(e,t){e.finalized||(e.finalized=!0)}function yo({value:e,key:t,index:s},n=[]){return O0([e,t,s,...n])}function O0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ne("_".repeat(n+1),!1))}const Yu=Ne("undefined",!1),D0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ps(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},M0=(e,t,s,n)=>Aa(e,s,!1,!0,s.length?s[0].loc:n);function P0(e,t,s=M0){t.helper(yc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ps(e,"slot",!0);if(o){const{arg:w,exp:N}=o;w&&!ts(w)&&(r=!0),i.push(bt(w||Ne("default",!0),s(N,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let w=0;w<n.length;w++){const N=n[w];let y;if(!Ol(N)||!(y=ps(N,"slot",!0))){N.type!==3&&d.push(N);continue}if(o){t.onError(at(37,y.loc));break}c=!0;const{children:b,loc:_}=N,{arg:C=Ne("default",!0),exp:I,loc:L}=y;let S;ts(C)?S=C?C.content:"default":r=!0;const A=ps(N,"for"),O=s(I,A,b,_);let U,P;if(U=ps(N,"if"))r=!0,l.push(mo(U.exp,Xi(C,O,p++),Yu));else if(P=ps(N,/^else(?:-if)?$/,!0)){let T=w,$;for(;T--&&($=n[T],!!ph($)););if($&&Ol($)&&ps($,/^(?:else-)?if$/)){let W=l[l.length-1];for(;W.alternate.type===19;)W=W.alternate;W.alternate=P.exp?mo(P.exp,Xi(C,O,p++),Yu):Xi(C,O,p++)}else t.onError(at(30,P.loc))}else if(A){r=!0;const T=A.forParseResult;T?(Ch(T),l.push(Tt(t.helper(gc),[T.source,Aa(yo(T),Xi(C,O),!0)]))):t.onError(at(32,A.loc))}else{if(S){if(f.has(S)){t.onError(at(38,L));continue}f.add(S),S==="default"&&(u=!0)}i.push(bt(C,O))}}if(!o){const w=(N,y)=>{const b=s(N,void 0,y,a);return t.compatConfig&&(b.isNonScopedSlot=!0),bt("default",b)};c?d.length&&!d.every(Sc)&&(u?t.onError(at(39,d[0].loc)):i.push(w(void 0,d))):i.push(w(void 0,n))}const v=r?2:cl(e.children)?3:1;let g=hs(i.concat(bt("_",Ne(v+"",!1))),a);return l.length&&(g=Tt(t.helper(ah),[g,Bn(l)])),{slots:g,hasDynamicSlots:r}}function Xi(e,t,s){const n=[bt("name",e),bt("fn",t)];return s!=null&&n.push(bt("key",Ne(String(s),!0))),hs(n)}function cl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||cl(s.children))return!0;break;case 9:if(cl(s.branches))return!0;break;case 10:case 11:if(cl(s.children))return!0;break}}return!1}const Eh=new WeakMap,F0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?$0(e,t):`"${n}"`;const r=je(l)&&l.callee===dc;let o,c,u=0,d,f,p,v=r||l===ri||l===lc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=Ah(e,t,void 0,i,r);o=g.props,u=g.patchFlag,f=g.dynamicPropNames;const w=g.directives;p=w&&w.length?Bn(w.map(N=>B0(N,t))):void 0,g.shouldUseBlock&&(v=!0)}if(e.children.length>0)if(l===Rl&&(v=!0,u|=1024),i&&l!==ri&&l!==Rl){const{slots:w,hasDynamicSlots:N}=P0(e,t);c=w,N&&(u|=1024)}else if(e.children.length===1&&l!==ri){const w=e.children[0],N=w.type,y=N===5||N===8;y&&is(w,t)===0&&(u|=1),y||N===2?c=w:c=e.children}else c=e.children;f&&f.length&&(d=H0(f)),e.codegenNode=Si(t,l,o,c,u===0?void 0:u,d,p,!!v,!1,i,e.loc)};function $0(e,t,s=!1){let{tag:n}=e;const a=xo(n),i=cr(e,"is",!1,!0);if(i)if(a||Hn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ne(i.value.content,!0):(r=i.exp,r||(r=Ne("is",!1,i.arg.loc))),r)return Tt(t.helper(dc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=rh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(uc),t.components.add(n),Ci(n,"component"))}function Ah(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,v=0,g=!1,w=!1,N=!1,y=!1,b=!1,_=!1;const C=[],I=O=>{c.length&&(u.push(hs(Qu(c),r)),c=[]),O&&u.push(O)},L=()=>{t.scopes.vFor>0&&c.push(bt(Ne("ref_for",!0),Ne("true")))},S=({key:O,value:U})=>{if(ts(O)){const P=O.content,T=Gn(P);if(T&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!Qs(P)&&(y=!0),T&&Qs(P)&&(_=!0),T&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&is(U,t)>0)return;P==="ref"?g=!0:P==="class"?w=!0:P==="style"?N=!0:P!=="key"&&!C.includes(P)&&C.push(P),n&&(P==="class"||P==="style")&&!C.includes(P)&&C.push(P)}else b=!0};for(let O=0;O<s.length;O++){const U=s[O];if(U.type===6){const{loc:P,name:T,nameLoc:$,value:W}=U;let K=!0;if(T==="ref"&&(g=!0,L()),T==="is"&&(xo(l)||W&&W.content.startsWith("vue:")||Hn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(bt(Ne(T,!0,$),Ne(W?W.content:"",K,W?W.loc:P)))}else{const{name:P,arg:T,exp:$,loc:W,modifiers:K}=U,D=P==="bind",x=P==="on";if(P==="slot"){n||t.onError(at(40,W));continue}if(P==="once"||P==="memo"||P==="is"||D&&Dn(T,"is")&&(xo(l)||Hn("COMPILER_IS_ON_ELEMENT",t))||x&&i)continue;if((D&&Dn(T,"key")||x&&f&&Dn(T,"vue:before-update"))&&(p=!0),D&&Dn(T,"ref")&&L(),!T&&(D||x)){if(b=!0,$)if(D){if(I(),Hn("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift($);continue}L(),I(),u.push($)}else I({type:14,loc:W,callee:t.helper(bc),arguments:n?[$]:[$,"true"]});else t.onError(at(D?34:35,W));continue}D&&K.some(ue=>ue.content==="prop")&&(v|=32);const B=t.directiveTransforms[P];if(B){const{props:ue,needRuntime:ce}=B(U,e,t);!i&&ue.forEach(S),x&&T&&!ts(T)?I(hs(ue,r)):c.push(...ue),ce&&(d.push(U),Bt(ce)&&Eh.set(U,ce))}else Ng(P)||(d.push(U),f&&(p=!0))}}let A;if(u.length?(I(),u.length>1?A=Tt(t.helper(Il),u,r):A=u[0]):c.length&&(A=hs(Qu(c),r)),b?v|=16:(w&&!n&&(v|=2),N&&!n&&(v|=4),C.length&&(v|=8),y&&(v|=32)),!p&&(v===0||v===32)&&(g||_||d.length>0)&&(v|=512),!t.inSSR&&A)switch(A.type){case 15:let O=-1,U=-1,P=!1;for(let W=0;W<A.properties.length;W++){const K=A.properties[W].key;ts(K)?K.content==="class"?O=W:K.content==="style"&&(U=W):K.isHandlerKey||(P=!0)}const T=A.properties[O],$=A.properties[U];P?A=Tt(t.helper(wi),[A]):(T&&!ts(T.value)&&(T.value=Tt(t.helper(mc),[T.value])),$&&(N||$.value.type===4&&$.value.content.trim()[0]==="["||$.value.type===17)&&($.value=Tt(t.helper(vc),[$.value])));break;case 14:break;default:A=Tt(t.helper(wi),[Tt(t.helper(Fi),[A])]);break}return{props:A,directives:d,patchFlag:v,dynamicPropNames:C,shouldUseBlock:p}}function Qu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Gn(i))&&U0(l,a):(t.set(i,a),s.push(a))}return s}function U0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Bn([e.value,t.value],e.loc)}function B0(e,t){const s=[],n=Eh.get(e);n?s.push(t.helperString(n)):(t.helper(fc),t.directives.add(e.name),s.push(Ci(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ne("true",!1,a);s.push(hs(e.modifiers.map(l=>bt(l,i)),a))}return Bn(s,e.loc)}function H0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function xo(e){return e==="component"||e==="Component"}const V0=(e,t)=>{if(Dl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=j0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Aa([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Tt(t.helper(nh),l,n)}};function j0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Qe(l.name),a.push(l)));else if(l.name==="bind"&&Dn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Qe(l.arg.content);s=l.exp=Ne(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ts(l.arg)&&(l.arg.content=Qe(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Ah(e,t,a,!1,!1);n=i,l.length&&t.onError(at(36,l[0].loc))}return{slotName:s,slotProps:n}}const Rh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(at(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?ga(Qe(d)):`on:${d}`;r=Ne(f,!0,l.loc)}else r=ks([`${s.helperString(go)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(go)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=uh(o),f=!(d||Vy(o)),p=o.content.includes(";");(f||c&&d)&&(o=ks([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[bt(r,o||Ne("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},z0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Qe(i.content):i.content=`${s.helperString(ho)}(${i.content})`:(i.children.unshift(`${s.helperString(ho)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Xu(i,"."),n.some(r=>r.content==="attr")&&Xu(i,"^")),{props:[bt(i,l)]}},Xu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},q0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Dr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Dr(o))n||(n=s[i]=ks([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Dr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&is(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Tt(t.helper(cc),r)}}}}},ed=new WeakSet,K0=(e,t)=>{if(e.type===1&&ps(e,"once",!0))return ed.has(e)||t.inVOnce||t.inSSR?void 0:(ed.add(e),t.inVOnce=!0,t.helper(Nl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Ih=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(at(41,e.loc)),qa();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(at(44,n.loc)),qa();if(r==="literal-const"||r==="setup-const")return s.onError(at(45,n.loc)),qa();if(!l.trim()||!uh(n))return s.onError(at(42,n.loc)),qa();const o=a||Ne("modelValue",!0),c=a?ts(a)?`onUpdate:${Qe(a.content)}`:ks(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=ks([`${d} => ((`,n,") = $event)"]);const f=[bt(o,e.exp),bt(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(wc(g)?g:JSON.stringify(g))+": true").join(", "),v=a?ts(a)?`${a.content}Modifiers`:ks([a,' + "Modifiers"']):"modelModifiers";f.push(bt(v,Ne(`{ ${p} }`,!1,e.loc,2)))}return qa(f)};function qa(e=[]){return{props:e}}const G0=/[\w).+\-_$\]]/,W0=(e,t)=>{Hn("COMPILER_FILTERS",t)&&(e.type===5?Pl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Pl(s.exp,t)}))};function Pl(e,t){if(e.type===4)td(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?td(n,t):n.type===8?Pl(e,t):n.type===5&&Pl(n.content,t))}}function td(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,v,g=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)v===void 0?(u=p+1,v=s.slice(0,p).trim()):w();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let N=p-1,y;for(;N>=0&&(y=s.charAt(N),y===" ");N--);(!y||!G0.test(y))&&(l=!0)}}v===void 0?v=s.slice(0,p).trim():u!==0&&w();function w(){g.push(s.slice(u,p).trim()),u=p+1}if(g.length){for(p=0;p<g.length;p++)v=Z0(v,g[p],t);e.content=v,e.ast=void 0}}function Z0(e,t,s){s.helper(pc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Ci(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Ci(a,"filter")}(${e}${i!==")"?","+i:i}`}}const sd=new WeakSet,J0=(e,t)=>{if(e.type===1){const s=ps(e,"memo");return!s||sd.has(e)||t.inSSR?void 0:(sd.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&_c(n,t),e.codegenNode=Tt(t.helper(xc),[s.exp,Aa(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},Y0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(at(53,n.loc)),s.exp=Ne("",!0,n.loc);else{const a=Qe(n.content);(oh.test(a[0])||a[0]==="-")&&(s.exp=Ne(a,!1,n.loc))}}}};function Q0(e){return[[Y0,K0,A0,J0,N0,W0,V0,F0,D0,q0],{on:Rh,bind:z0,model:Ih}]}function X0(e,t={}){const s=t.onError||kc,n=t.mode==="module";t.prefixIdentifiers===!0?s(at(48)):n&&s(at(49));const a=!1;t.cacheHandlers&&s(at(50)),t.scopeId&&!n&&s(at(51));const i=Pe({},t,{prefixIdentifiers:a}),l=Ae(e)?i0(e,i):e,[r,o]=Q0();return c0(l,Pe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Pe({},o,t.directiveTransforms||{})})),p0(l,i)}const ex=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Nh=Symbol(""),Lh=Symbol(""),Oh=Symbol(""),Dh=Symbol(""),_o=Symbol(""),Mh=Symbol(""),Ph=Symbol(""),Fh=Symbol(""),$h=Symbol(""),Uh=Symbol("");Ny({[Nh]:"vModelRadio",[Lh]:"vModelCheckbox",[Oh]:"vModelText",[Dh]:"vModelSelect",[_o]:"vModelDynamic",[Mh]:"withModifiers",[Ph]:"withKeys",[Fh]:"vShow",[$h]:"Transition",[Uh]:"TransitionGroup"});let aa;function tx(e,t=!1){return aa||(aa=document.createElement("div")),t?(aa.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,aa.children[0].getAttribute("foo")):(aa.innerHTML=e,aa.textContent)}const sx={parseMode:"html",isVoidTag:Wg,isNativeTag:e=>qg(e)||Kg(e)||Gg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:tx,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return $h;if(e==="TransitionGroup"||e==="transition-group")return Uh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},nx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ne("style",!0,t.loc),exp:ax(t.value.content,t.loc),modifiers:[],loc:t.loc})})},ax=(e,t)=>{const s=Yd(e);return Ne(JSON.stringify(s),!1,t,3)};function kn(e,t){return at(e,t)}const ix=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(54,a)),t.children.length&&(s.onError(kn(55,a)),t.children.length=0),{props:[bt(Ne("innerHTML",!0,a),n||Ne("",!0))]}},lx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(56,a)),t.children.length&&(s.onError(kn(57,a)),t.children.length=0),{props:[bt(Ne("textContent",!0),n?is(n,s)>0?n:Tt(s.helperString(or),[n],a):Ne("",!0))]}},rx=(e,t,s)=>{const n=Ih(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(kn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Oh,r=!1;if(a==="input"||i){const o=cr(t,"type");if(o){if(o.type===7)l=_o;else if(o.value)switch(o.value.content){case"radio":l=Nh;break;case"checkbox":l=Lh;break;case"file":r=!0,s.onError(kn(60,e.loc));break}}else jy(t)&&(l=_o)}else a==="select"&&(l=Dh);r||(n.needRuntime=s.helper(l))}else s.onError(kn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},ox=cs("passive,once,capture"),cx=cs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),ux=cs("left,right"),Bh=cs("onkeyup,onkeydown,onkeypress"),dx=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Ti("COMPILER_V_ON_NATIVE",s)||ox(o)?l.push(o):ux(o)?ts(e)?Bh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):cx(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},nd=(e,t)=>ts(e)&&e.content.toLowerCase()==="onclick"?Ne(t,!0):e.type!==4?ks(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,fx=(e,t,s)=>Rh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=dx(i,a,s,e.loc);if(o.includes("right")&&(i=nd(i,"onContextmenu")),o.includes("middle")&&(i=nd(i,"onMouseup")),o.length&&(l=Tt(s.helper(Mh),[l,JSON.stringify(o)])),r.length&&(!ts(i)||Bh(i.content.toLowerCase()))&&(l=Tt(s.helper(Ph),[l,JSON.stringify(r)])),c.length){const u=c.map(Zn).join("");i=ts(i)?Ne(`${i.content}${u}`,!0):ks(["(",i,`) + "${u}"`])}return{props:[bt(i,l)]}}),px=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(kn(62,a)),{props:[],needRuntime:s.helper(Fh)}},hx=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},gx=[nx],mx={cloak:ex,html:ix,text:lx,model:rx,on:fx,show:px};function vx(e,t={}){return X0(e,Pe({},sx,t,{nodeTransforms:[hx,...gx,...t.nodeTransforms||[]],directiveTransforms:Pe({},mx,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ad=Object.create(null);function bx(e,t){if(!Ae(e))if(e.nodeType)e=e.innerHTML;else return Ot;const s=Dg(e,t),n=ad[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Pe({hoistStatic:!0,onError:void 0,onWarn:Ot},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=vx(e,a),l=new Function("Vue",i)(Ty);return l._rc=!0,ad[s]=l}wp(bx);const Fl=Sn({items:[]});let yx=1;function fr(e,t="info",s=3e3){const n=yx++;return Fl.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Ec(n),s),n}function Ec(e){const t=Fl.items.findIndex(s=>s.id===e);t>=0&&Fl.items.splice(t,1)}function _e(e,t="info",s=3e3){return fr(e,t,s)}_e.success=(e,t=3e3)=>fr(e,"success",t);_e.error=(e,t=5e3)=>fr(e,"error",t);_e.info=(e,t=3e3)=>fr(e,"info",t);_e.dismiss=Ec;const xx={setup(){return{state:Fl,dismiss:Ec}},template:`
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
  `},Ks=Sn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let _a=null;function os({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return _a&&_a(!1),Ks.title=e,Ks.message=t,Ks.confirmLabel=s,Ks.cancelLabel=n,Ks.danger=a,Ks.open=!0,new Promise(i=>{_a=i})}function id(e){Ks.open=!1,_a&&(_a(e),_a=null)}const _x={setup(){function e(t){Ks.open&&t.key==="Escape"&&(t.stopPropagation(),id(!1))}return He(()=>document.addEventListener("keydown",e,!0)),gt(()=>document.removeEventListener("keydown",e,!0)),{state:Ks,settle:id}},template:`
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
 */const ca=typeof document<"u";function Hh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function kx(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Hh(e.default)}const Ge=Object.assign;function Pr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ss(a)?a.map(e):e(a)}return s}const oi=()=>{},Ss=Array.isArray;function ld(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Vh=/#/g,wx=/&/g,Sx=/\//g,Tx=/=/g,Cx=/\?/g,jh=/\+/g,Ex=/%5B/g,Ax=/%5D/g,zh=/%5E/g,Rx=/%60/g,qh=/%7B/g,Ix=/%7C/g,Kh=/%7D/g,Nx=/%20/g;function Ac(e){return e==null?"":encodeURI(""+e).replace(Ix,"|").replace(Ex,"[").replace(Ax,"]")}function Lx(e){return Ac(e).replace(qh,"{").replace(Kh,"}").replace(zh,"^")}function ko(e){return Ac(e).replace(jh,"%2B").replace(Nx,"+").replace(Vh,"%23").replace(wx,"%26").replace(Rx,"`").replace(qh,"{").replace(Kh,"}").replace(zh,"^")}function Ox(e){return ko(e).replace(Tx,"%3D")}function Dx(e){return Ac(e).replace(Vh,"%23").replace(Cx,"%3F")}function Mx(e){return Dx(e).replace(Sx,"%2F")}function Ai(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Px=/\/$/,Fx=e=>e.replace(Px,"");function Fr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=Hx(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Ai(l)}}function $x(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function rd(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Ux(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Na(t.matched[n],s.matched[a])&&Gh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Na(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Gh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Bx(e[s],t[s]))return!1;return!0}function Bx(e,t){return Ss(e)?od(e,t):Ss(t)?od(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function od(e,t){return Ss(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function Hx(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const hn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let wo=(function(e){return e.pop="pop",e.push="push",e})({}),$r=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Vx(e){if(!e)if(ca){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Fx(e)}const jx=/^[^#]+#/;function zx(e,t){return e.replace(jx,"#")+t}function qx(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const pr=()=>({left:window.scrollX,top:window.scrollY});function Kx(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=qx(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function cd(e,t){return(history.state?history.state.position-t:-1)+e}const So=new Map;function Gx(e,t){So.set(e,t)}function Wx(e){const t=So.get(e);return So.delete(e),t}function Zx(e){return typeof e=="string"||e&&typeof e=="object"}function Wh(e){return typeof e=="string"||typeof e=="symbol"}let ct=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Zh=Symbol("");ct.MATCHER_NOT_FOUND+"",ct.NAVIGATION_GUARD_REDIRECT+"",ct.NAVIGATION_ABORTED+"",ct.NAVIGATION_CANCELLED+"",ct.NAVIGATION_DUPLICATED+"";function La(e,t){return Ge(new Error,{type:e,[Zh]:!0},t)}function Hs(e,t){return e instanceof Error&&Zh in e&&(t==null||!!(e.type&t))}const Jx=["params","query","hash"];function Yx(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Jx)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Qx(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(jh," "),i=a.indexOf("="),l=Ai(i<0?a:a.slice(0,i)),r=i<0?null:Ai(a.slice(i+1));if(l in t){let o=t[l];Ss(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function ud(e){let t="";for(let s in e){const n=e[s];if(s=Ox(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ss(n)?n.map(a=>a&&ko(a)):[n&&ko(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function Xx(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ss(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const e_=Symbol(""),dd=Symbol(""),hr=Symbol(""),Rc=Symbol(""),To=Symbol("");function Ka(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function xn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(La(ct.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):Zx(f)?o(La(ct.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Ur(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Hh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(xn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=kx(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&xn(f,s,n,l,r,a)()}))}}return i}function t_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Na(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Na(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let s_=()=>location.protocol+"//"+location.host;function Jh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),rd(r,"")}return rd(s,e)+n+a}function n_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=Jh(e,location),v=s.value,g=t.value;let w=0;if(f){if(s.value=p,t.value=f,l&&l===v){l=null;return}w=g?f.position-g.position:0}else n(p);a.forEach(N=>{N(s.value,v,{delta:w,type:wo.pop,direction:w?w>0?$r.forward:$r.back:$r.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const v=a.indexOf(f);v>-1&&a.splice(v,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(Ge({},f.state,{scroll:pr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function fd(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?pr():null}}function a_(e){const{history:t,location:s}=window,n={value:Jh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:s_()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,Ge({},t.state,fd(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=Ge({},a.value,t.state,{forward:o,scroll:pr()});i(u.current,u,!0),i(o,Ge({},fd(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function i_(e){e=Vx(e);const t=a_(e),s=n_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=Ge({location:"",base:e,go:n,createHref:zx.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function l_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),i_(e)}let Pn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var kt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(kt||{});const r_={type:Pn.Static,value:""},o_=/[a-zA-Z0-9_]/;function c_(e){if(!e)return[[]];if(e==="/")return[[r_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=kt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===kt.Static?i.push({type:Pn.Static,value:c}):s===kt.Param||s===kt.ParamRegExp||s===kt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Pn.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==kt.ParamRegExp){n=s,s=kt.EscapeNext;continue}switch(s){case kt.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=kt.Param):f();break;case kt.EscapeNext:f(),s=n;break;case kt.Param:o==="("?s=kt.ParamRegExp:o_.test(o)?f():(d(),s=kt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case kt.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=kt.ParamRegExpEnd:u+=o;break;case kt.ParamRegExpEnd:d(),s=kt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===kt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const pd="[^/]+?",u_={sensitive:!1,strict:!1,start:!0,end:!0};var jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(jt||{});const d_=/[.+*?^${}()[\]/\\]/g;function f_(e,t){const s=Ge({},u_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[jt.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=jt.Segment+(s.sensitive?jt.BonusCaseSensitive:0);if(f.type===Pn.Static)d||(a+="/"),a+=f.value.replace(d_,"\\$&"),p+=jt.Static;else if(f.type===Pn.Param){const{value:v,repeatable:g,optional:w,regexp:N}=f;i.push({name:v,repeatable:g,optional:w});const y=N||pd;if(y!==pd){p+=jt.BonusCustomRegExp;try{`${y}`}catch(_){throw new Error(`Invalid custom RegExp for param "${v}" (${y}): `+_.message)}}let b=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;d||(b=w&&c.length<2?`(?:/${b})`:"/"+b),w&&(b+="?"),a+=b,p+=jt.Dynamic,w&&(p+=jt.BonusOptional),g&&(p+=jt.BonusRepeatable),y===".*"&&(p+=jt.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",v=i[f-1];d[v.name]=p&&v.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Pn.Static)u+=p.value;else if(p.type===Pn.Param){const{value:v,repeatable:g,optional:w}=p,N=v in c?c[v]:"";if(Ss(N)&&!g)throw new Error(`Provided param "${v}" is an array but it is not repeatable (* or + modifiers)`);const y=Ss(N)?N.join("/"):N;if(!y)if(w)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${v}"`);u+=y}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function p_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===jt.Static+jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===jt.Static+jt.Segment?1:-1:0}function Yh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=p_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(hd(n))return 1;if(hd(a))return-1}return a.length-n.length}function hd(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const h_={strict:!1,end:!0,sensitive:!1};function g_(e,t,s){const n=f_(c_(e.path),s),a=Ge(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function m_(e,t){const s=[],n=new Map;t=ld(h_,t);function a(d){return n.get(d)}function i(d,f,p){const v=!p,g=md(d);g.aliasOf=p&&p.record;const w=ld(t,d),N=[g];if("alias"in d){const _=typeof d.alias=="string"?[d.alias]:d.alias;for(const C of _)N.push(md(Ge({},g,{components:p?p.record.components:g.components,path:C,aliasOf:p?p.record:g})))}let y,b;for(const _ of N){const{path:C}=_;if(f&&C[0]!=="/"){const I=f.record.path,L=I[I.length-1]==="/"?"":"/";_.path=f.record.path+(C&&L+C)}if(y=g_(_,f,w),p?p.alias.push(y):(b=b||y,b!==y&&b.alias.push(y),v&&d.name&&!vd(y)&&l(d.name)),Qh(y)&&o(y),g.children){const I=g.children;for(let L=0;L<I.length;L++)i(I[L],y,p&&p.children[L])}p=p||y}return b?()=>{l(b)}:oi}function l(d){if(Wh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=y_(d,s);s.splice(f,0,d),d.record.name&&!vd(d)&&n.set(d.record.name,d)}function c(d,f){let p,v={},g,w;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw La(ct.MATCHER_NOT_FOUND,{location:d});w=p.record.name,v=Ge(gd(f.params,p.keys.filter(b=>!b.optional).concat(p.parent?p.parent.keys.filter(b=>b.optional):[]).map(b=>b.name)),d.params&&gd(d.params,p.keys.map(b=>b.name))),g=p.stringify(v)}else if(d.path!=null)g=d.path,p=s.find(b=>b.re.test(g)),p&&(v=p.parse(g),w=p.record.name);else{if(p=f.name?n.get(f.name):s.find(b=>b.re.test(f.path)),!p)throw La(ct.MATCHER_NOT_FOUND,{location:d,currentLocation:f});w=p.record.name,v=Ge({},f.params,d.params),g=p.stringify(v)}const N=[];let y=p;for(;y;)N.unshift(y.record),y=y.parent;return{name:w,path:g,params:v,matched:N,meta:b_(N)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function gd(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function md(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:v_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function v_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function vd(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function b_(e){return e.reduce((t,s)=>Ge(t,s.meta),{})}function y_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Yh(e,t[i])<0?n=i:s=i+1}const a=x_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function x_(e){let t=e;for(;t=t.parent;)if(Qh(t)&&Yh(e,t)===0)return t}function Qh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function bd(e){const t=gs(hr),s=gs(Rc),n=J(()=>{const o=Ds(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(Na.bind(null,u));if(f>-1)return f;const p=yd(o[c-2]);return c>1&&yd(u)===p&&d[d.length-1].path!==p?d.findIndex(Na.bind(null,o[c-2])):f}),i=J(()=>a.value>-1&&T_(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&Gh(s.params,n.value.params));function r(o={}){if(S_(o)){const c=t[Ds(e.replace)?"replace":"push"](Ds(e.to)).catch(oi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function __(e){return e.length===1?e[0]:e}const k_=Oi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:bd,setup(e,{slots:t}){const s=Sn(bd(e)),{options:n}=gs(hr),a=J(()=>({[xd(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[xd(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&__(t.default(s));return e.custom?i:Sa("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),w_=k_;function S_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function T_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ss(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function yd(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const xd=(e,t,s)=>e??t??s,C_=Oi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=gs(To),a=J(()=>e.route||n.value),i=gs(dd,0),l=J(()=>{let c=Ds(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);ni(dd,J(()=>l.value+1)),ni(e_,r),ni(To,a);const o=h();return ls(()=>[o.value,r.value,e.name],([c,u,d],[f,p,v])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!Na(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return _d(s.default,{Component:f,route:c});const p=d.props[u],v=p?p===!0?c.params:typeof p=="function"?p(c):p:null,w=Sa(f,Ge({},v,t,{onVnodeUnmounted:N=>{N.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return _d(s.default,{Component:w,route:c})||w}}});function _d(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const E_=C_;function A_(e){const t=m_(e.routes,e),s=e.parseQuery||Qx,n=e.stringifyQuery||ud,a=e.history,i=Ka(),l=Ka(),r=Ka(),o=Uo(hn);let c=hn;ca&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Pr.bind(null,j=>""+j),d=Pr.bind(null,Mx),f=Pr.bind(null,Ai);function p(j,oe){let ie,me;return Wh(j)?(ie=t.getRecordMatcher(j),me=oe):me=j,t.addRoute(me,ie)}function v(j){const oe=t.getRecordMatcher(j);oe&&t.removeRoute(oe)}function g(){return t.getRoutes().map(j=>j.record)}function w(j){return!!t.getRecordMatcher(j)}function N(j,oe){if(oe=Ge({},oe||o.value),typeof j=="string"){const E=Fr(s,j,oe.path),M=t.resolve({path:E.path},oe),Z=a.createHref(E.fullPath);return Ge(E,M,{params:f(M.params),hash:Ai(E.hash),redirectedFrom:void 0,href:Z})}let ie;if(j.path!=null)ie=Ge({},j,{path:Fr(s,j.path,oe.path).path});else{const E=Ge({},j.params);for(const M in E)E[M]==null&&delete E[M];ie=Ge({},j,{params:d(E)}),oe.params=d(oe.params)}const me=t.resolve(ie,oe),pe=j.hash||"";me.params=u(f(me.params));const Le=$x(n,Ge({},j,{hash:Lx(pe),path:me.path})),m=a.createHref(Le);return Ge({fullPath:Le,hash:pe,query:n===ud?Xx(j.query):j.query||{}},me,{redirectedFrom:void 0,href:m})}function y(j){return typeof j=="string"?Fr(s,j,o.value.path):Ge({},j)}function b(j,oe){if(c!==j)return La(ct.NAVIGATION_CANCELLED,{from:oe,to:j})}function _(j){return L(j)}function C(j){return _(Ge(y(j),{replace:!0}))}function I(j,oe){const ie=j.matched[j.matched.length-1];if(ie&&ie.redirect){const{redirect:me}=ie;let pe=typeof me=="function"?me(j,oe):me;return typeof pe=="string"&&(pe=pe.includes("?")||pe.includes("#")?pe=y(pe):{path:pe},pe.params={}),Ge({query:j.query,hash:j.hash,params:pe.path!=null?{}:j.params},pe)}}function L(j,oe){const ie=c=N(j),me=o.value,pe=j.state,Le=j.force,m=j.replace===!0,E=I(ie,me);if(E)return L(Ge(y(E),{state:typeof E=="object"?Ge({},pe,E.state):pe,force:Le,replace:m}),oe||ie);const M=ie;M.redirectedFrom=oe;let Z;return!Le&&Ux(n,me,ie)&&(Z=La(ct.NAVIGATION_DUPLICATED,{to:M,from:me}),ce(me,me,!0,!1)),(Z?Promise.resolve(Z):O(M,me)).catch(R=>Hs(R)?Hs(R,ct.NAVIGATION_GUARD_REDIRECT)?R:ue(R):x(R,M,me)).then(R=>{if(R){if(Hs(R,ct.NAVIGATION_GUARD_REDIRECT))return L(Ge({replace:m},y(R.to),{state:typeof R.to=="object"?Ge({},pe,R.to.state):pe,force:Le}),oe||M)}else R=P(M,me,!0,m,pe);return U(M,me,R),R})}function S(j,oe){const ie=b(j,oe);return ie?Promise.reject(ie):Promise.resolve()}function A(j){const oe=Q.values().next().value;return oe&&typeof oe.runWithContext=="function"?oe.runWithContext(j):j()}function O(j,oe){let ie;const[me,pe,Le]=t_(j,oe);ie=Ur(me.reverse(),"beforeRouteLeave",j,oe);for(const E of me)E.leaveGuards.forEach(M=>{ie.push(xn(M,j,oe))});const m=S.bind(null,j,oe);return ie.push(m),Ie(ie).then(()=>{ie=[];for(const E of i.list())ie.push(xn(E,j,oe));return ie.push(m),Ie(ie)}).then(()=>{ie=Ur(pe,"beforeRouteUpdate",j,oe);for(const E of pe)E.updateGuards.forEach(M=>{ie.push(xn(M,j,oe))});return ie.push(m),Ie(ie)}).then(()=>{ie=[];for(const E of Le)if(E.beforeEnter)if(Ss(E.beforeEnter))for(const M of E.beforeEnter)ie.push(xn(M,j,oe));else ie.push(xn(E.beforeEnter,j,oe));return ie.push(m),Ie(ie)}).then(()=>(j.matched.forEach(E=>E.enterCallbacks={}),ie=Ur(Le,"beforeRouteEnter",j,oe,A),ie.push(m),Ie(ie))).then(()=>{ie=[];for(const E of l.list())ie.push(xn(E,j,oe));return ie.push(m),Ie(ie)}).catch(E=>Hs(E,ct.NAVIGATION_CANCELLED)?E:Promise.reject(E))}function U(j,oe,ie){r.list().forEach(me=>A(()=>me(j,oe,ie)))}function P(j,oe,ie,me,pe){const Le=b(j,oe);if(Le)return Le;const m=oe===hn,E=ca?history.state:{};ie&&(me||m?a.replace(j.fullPath,Ge({scroll:m&&E&&E.scroll},pe)):a.push(j.fullPath,pe)),o.value=j,ce(j,oe,ie,m),ue()}let T;function $(){T||(T=a.listen((j,oe,ie)=>{if(!de.listening)return;const me=N(j),pe=I(me,de.currentRoute.value);if(pe){L(Ge(pe,{replace:!0,force:!0}),me).catch(oi);return}c=me;const Le=o.value;ca&&Gx(cd(Le.fullPath,ie.delta),pr()),O(me,Le).catch(m=>Hs(m,ct.NAVIGATION_ABORTED|ct.NAVIGATION_CANCELLED)?m:Hs(m,ct.NAVIGATION_GUARD_REDIRECT)?(L(Ge(y(m.to),{force:!0}),me).then(E=>{Hs(E,ct.NAVIGATION_ABORTED|ct.NAVIGATION_DUPLICATED)&&!ie.delta&&ie.type===wo.pop&&a.go(-1,!1)}).catch(oi),Promise.reject()):(ie.delta&&a.go(-ie.delta,!1),x(m,me,Le))).then(m=>{m=m||P(me,Le,!1),m&&(ie.delta&&!Hs(m,ct.NAVIGATION_CANCELLED)?a.go(-ie.delta,!1):ie.type===wo.pop&&Hs(m,ct.NAVIGATION_ABORTED|ct.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),U(me,Le,m)}).catch(oi)}))}let W=Ka(),K=Ka(),D;function x(j,oe,ie){ue(j);const me=K.list();return me.length?me.forEach(pe=>pe(j,oe,ie)):console.error(j),Promise.reject(j)}function B(){return D&&o.value!==hn?Promise.resolve():new Promise((j,oe)=>{W.add([j,oe])})}function ue(j){return D||(D=!j,$(),W.list().forEach(([oe,ie])=>j?ie(j):oe()),W.reset()),j}function ce(j,oe,ie,me){const{scrollBehavior:pe}=e;if(!ca||!pe)return Promise.resolve();const Le=!ie&&Wx(cd(j.fullPath,0))||(me||!ie)&&history.state&&history.state.scroll||null;return St().then(()=>pe(j,oe,Le)).then(m=>m&&Kx(m)).catch(m=>x(m,j,oe))}const se=j=>a.go(j);let fe;const Q=new Set,de={currentRoute:o,listening:!0,addRoute:p,removeRoute:v,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:g,resolve:N,options:e,push:_,replace:C,go:se,back:()=>se(-1),forward:()=>se(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:K.add,isReady:B,install(j){j.component("RouterLink",w_),j.component("RouterView",E_),j.config.globalProperties.$router=de,Object.defineProperty(j.config.globalProperties,"$route",{enumerable:!0,get:()=>Ds(o)}),ca&&!fe&&o.value===hn&&(fe=!0,_(a.location).catch(me=>{}));const oe={};for(const me in hn)Object.defineProperty(oe,me,{get:()=>o.value[me],enumerable:!0});j.provide(hr,de),j.provide(Rc,$o(oe)),j.provide(To,o);const ie=j.unmount;Q.add(j),j.unmount=function(){Q.delete(j),Q.size<1&&(c=hn,T&&T(),T=null,o.value=hn,fe=!1,D=!1),ie()}}};function Ie(j){return j.reduce((oe,ie)=>oe.then(()=>A(ie)),Promise.resolve())}return de}function Xh(){return gs(hr)}function R_(e){return gs(Rc)}const I_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],Qt=Sn({open:!1,query:"",selected:0});function kd(){Qt.query="",Qt.selected=0,Qt.open=!0}function Br(){Qt.open=!1}function N_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const L_={setup(){const e=Xh(),t=h(null),s=J(()=>{const i=Qt.query.trim().toLowerCase();return I_.map(l=>({...l,_score:N_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ls(()=>Qt.open,async i=>{var l;i&&(await St(),(l=t.value)==null||l.focus())}),ls(()=>Qt.query,()=>{Qt.selected=0});function n(i){Br(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Br();return}if(i.key==="ArrowDown")i.preventDefault(),Qt.selected=Math.min(Qt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Qt.selected=Math.max(Qt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Qt.selected];l&&n(l)}}return{state:Qt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Br}},template:`
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
  `},Co={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Co));const O_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Sa("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Sa("path",{d:Co[e.name]||Co.info})])}},D_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function wd(e){return[...e.querySelectorAll(D_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const M_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=wd(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||wd(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Ic(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Fa(e){const t=Ic(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Nc(e){const t=Ic(e);return t?t.toLocaleTimeString():"—"}function eg(e){const t=Ic(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Oa(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Lc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function tg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Sd(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function sg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function P_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const F_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=J(()=>{const T=e.value.uptime_seconds||0,$=Math.floor(T/86400),W=Math.floor(T%86400/3600),K=Math.floor(T%3600/60),D=[];return $>0&&D.push(`${$}d`),W>0&&D.push(`${W}h`),(D.length===0||$===0&&W===0)&&D.push(`${K}m`),D.join(" ")}),p=J(()=>{const T=e.value.uptime_seconds||0;return 125.66*(1-Math.min(T/86400,1))}),v=J(()=>{const T=e.value;return[{label:"Guilds",value:T.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:T.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:T.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${T.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:T.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:T.loop_count>0?"text-green-400":"",highlight:T.loop_count>0},{label:"Agents",value:T.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:T.agent_count>0?`${T.agent_count} total`:"",subColor:"text-gray-500",highlight:(T.agent_running??0)>0},{label:"Processes",value:T.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:T.process_count>0?`${T.process_count} total`:"",subColor:"text-gray-500",highlight:(T.process_running??0)>0},{label:"Schedules",value:T.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(T.schedule_failing>0?`${T.schedule_failing} failing`:"")+(T.schedule_failing>0&&T.schedule_paused>0?", ":"")+(T.schedule_paused>0?`${T.schedule_paused} paused`:"")||void 0,subColor:T.schedule_failing>0?"text-red-400":"text-yellow-400",color:T.schedule_failing>0?"text-red-400":"",highlight:T.schedule_failing>0},{label:"Users",value:T.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=J(()=>{const T=e.value,$=[];return $.push({label:"Bot",status:T.status==="online"?"ok":"warn",detail:T.status==="online"?"Online":"Starting"}),(T.schedule_failing||0)>0?$.push({label:"Schedules",status:"error",detail:`${T.schedule_failing} failing`}):(T.schedule_count||0)>0&&$.push({label:"Schedules",status:"ok",detail:`${T.schedule_count} configured`}),(T.loop_count||0)>0&&$.push({label:"Loops",status:"ok",detail:`${T.loop_count} active`}),(T.agent_running||0)>0&&$.push({label:"Agents",status:"ok",detail:`${T.agent_running} running`}),(T.process_running||0)>0&&$.push({label:"Processes",status:"ok",detail:`${T.process_running} running`}),$});async function w(){try{e.value=await G.get("/api/status"),s.value=null}catch(T){s.value=T.message}finally{t.value=!1}}async function N(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function b(){try{const T=await G.get("/api/knowledge");c.value=(Array.isArray(T)?T:[]).reduce(($,W)=>$+(W.chunks||0),0)}catch{c.value=null}}async function _(){try{const T=await G.get("/api/agents");r.value=T.filter($=>$.status==="running")}catch{}}async function C(){u.value={...u.value,reload:!0};try{await G.post("/api/reload"),_e.success("Config reloaded")}catch(T){_e.error(T.message)}u.value={...u.value,reload:!1}}async function I(){if(!await os({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const $=e.value.session_count;e.value={...e.value,session_count:0};try{const W=await G.post("/api/sessions/clear-all");_e.success(`Cleared ${W.count} session${W.count!==1?"s":""}`),await w()}catch(W){e.value={...e.value,session_count:$},_e.error(W.message)}u.value={...u.value,clearSessions:!1}}async function L(){if(!await os({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const $=e.value.loop_count;e.value={...e.value,loop_count:0};try{const W=await G.post("/api/loops/stop-all");_e.success(W.result),await w()}catch(W){e.value={...e.value,loop_count:$},_e.error(W.message)}u.value={...u.value,stopLoops:!1}}function S(){t.value=!0,s.value=null,w(),N(),y(),_()}let A=null,O=null,U=null;function P(T){if(T.payload&&T.payload.tool_name){const $={...T.payload,_isNew:!0,_key:++d};n.value.unshift($),n.value.length>10&&n.value.pop(),o.value++,$.error&&(i.value.unshift($),i.value.length>5&&i.value.pop()),setTimeout(()=>{$._isNew=!1},1500),clearTimeout(U),U=setTimeout(()=>{o.value=0},1e4)}}return He(async()=>{await Promise.all([w(),N(),y(),_(),b()]),A=setInterval(w,15e3),O=setInterval(_,1e4),We.subscribe("events",P)}),gt(()=>{A&&clearInterval(A),O&&clearInterval(O),clearTimeout(U),We.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:v,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:N,fetchStatus:w,formatTime:Nc,formatDuration:Oa,retry:S,reloadConfig:C,clearSessions:I,stopAllLoops:L}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Td(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function $_(e){if(Array.isArray(e))return e}function U_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function B_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function H_(e,t){return $_(e)||U_(e,t)||V_(e,t)||B_()}function V_(e,t){if(e){if(typeof e=="string")return Td(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Td(e,t):void 0}}const ng=Object.entries,Cd=Object.setPrototypeOf,j_=Object.isFrozen,z_=Object.getPrototypeOf,q_=Object.getOwnPropertyDescriptor;let Gt=Object.freeze,vs=Object.seal,ua=Object.create,ag=typeof Reflect<"u"&&Reflect,Eo=ag.apply,Ao=ag.construct;Gt||(Gt=function(t){return t});vs||(vs=function(t){return t});Eo||(Eo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Ao||(Ao=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Vs=xt(Array.prototype.forEach),K_=xt(Array.prototype.lastIndexOf),Ed=xt(Array.prototype.pop),ia=xt(Array.prototype.push),G_=xt(Array.prototype.splice),Vt=Array.isArray,ei=xt(String.prototype.toLowerCase),Hr=xt(String.prototype.toString),Ad=xt(String.prototype.match),la=xt(String.prototype.replace),Rd=xt(String.prototype.indexOf),W_=xt(String.prototype.trim),Z_=xt(Number.prototype.toString),J_=xt(Boolean.prototype.toString),Id=typeof BigInt>"u"?null:xt(BigInt.prototype.toString),Nd=typeof Symbol>"u"?null:xt(Symbol.prototype.toString),ot=xt(Object.prototype.hasOwnProperty),Ga=xt(Object.prototype.toString),Rt=xt(RegExp.prototype.test),Nn=Y_(TypeError);function xt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Eo(e,t,n)}}function Y_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Ao(e,s)}}function Oe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:ei;if(Cd&&Cd(e,null),!Vt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(j_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Q_(e){for(let t=0;t<e.length;t++)ot(e,t)||(e[t]=null);return e}function Mt(e){const t=ua(null);for(const n of ng(e)){var s=H_(n,2);const a=s[0],i=s[1];ot(e,a)&&(Vt(i)?t[a]=Q_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Mt(i):t[a]=i)}return t}function X_(e){switch(typeof e){case"string":return e;case"number":return Z_(e);case"boolean":return J_(e);case"bigint":return Id?Id(e):"0";case"symbol":return Nd?Nd(e):"Symbol()";case"undefined":return Ga(e);case"function":case"object":{if(e===null)return Ga(e);const t=e,s=Rs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Ga(n)}return Ga(e)}default:return Ga(e)}}function Rs(e,t){for(;e!==null;){const n=q_(e,t);if(n){if(n.get)return xt(n.get);if(typeof n.value=="function")return xt(n.value)}e=z_(e)}function s(){return null}return s}function ek(e){try{return Rt(e,""),!0}catch{return!1}}const Ld=Gt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Vr=Gt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),jr=Gt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),tk=Gt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),zr=Gt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),sk=Gt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Od=Gt(["#text"]),Dd=Gt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),qr=Gt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Md=Gt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),el=Gt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),nk=vs(/{{[\w\W]*|^[\w\W]*}}/g),ak=vs(/<%[\w\W]*|^[\w\W]*%>/g),ik=vs(/\${[\w\W]*/g),lk=vs(/^data-[\-\w.\u00B7-\uFFFF]+$/),rk=vs(/^aria-[\-\w]+$/),Pd=vs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),ok=vs(/^(?:\w+script|data):/i),ck=vs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),uk=vs(/^html$/i),dk=vs(/^[a-z][.\w]*(-[.\w]+)+$/i),Es={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},fk=function(){return typeof window>"u"?null:window},pk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Fd=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function ig(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:fk();const t=ve=>ig(ve);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Es.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=Rs(f,"cloneNode"),v=Rs(f,"remove"),g=Rs(f,"nextSibling"),w=Rs(f,"childNodes"),N=Rs(f,"parentNode"),y=Rs(f,"shadowRoot"),b=Rs(f,"attributes"),_=l&&l.prototype?Rs(l.prototype,"nodeType"):null,C=l&&l.prototype?Rs(l.prototype,"nodeName"):null;if(typeof i=="function"){const ve=s.createElement("template");ve.content&&ve.content.ownerDocument&&(s=ve.content.ownerDocument)}let I,L="",S,A=!1,O=0;const U=function(){if(O>0)throw Nn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(k){U(),O++;try{return I.createHTML(k)}finally{O--}},T=function(k){U(),O++;try{return I.createScriptURL(k)}finally{O--}},$=function(){return A||(S=pk(d,a),A=!0),S},W=s,K=W.implementation,D=W.createNodeIterator,x=W.createDocumentFragment,B=W.getElementsByTagName,ue=n.importNode;let ce=Fd();t.isSupported=typeof ng=="function"&&typeof N=="function"&&K&&K.createHTMLDocument!==void 0;const se=nk,fe=ak,Q=ik,de=lk,Ie=rk,j=ok,oe=ck,ie=dk;let me=Pd,pe=null;const Le=Oe({},[...Ld,...Vr,...jr,...zr,...Od]);let m=null;const E=Oe({},[...Dd,...qr,...Md,...el]);let M=Object.seal(ua(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),Z=null,R=null;const F=Object.seal(ua(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Y=!0,ee=!0,te=!1,X=!0,be=!1,le=!0,ge=!1,xe=!1,ke=!1,Ee=!1,H=!1,re=!1,ye=!0,Me=!1;const Ue="user-content-";let Je=!0,dt=!1,Ye={},Ke=null;const Wt=Oe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let bs=null;const Ts=Oe({},["audio","video","img","source","image","track"]);let Cn=null;const Qn=Oe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),cn="http://www.w3.org/1998/Math/MathML",un="http://www.w3.org/2000/svg",z="http://www.w3.org/1999/xhtml";let Se=z,Cs=!1,En=null;const br=Oe({},[cn,un,z],Hr);let $a=Oe({},["mi","mo","mn","ms","mtext"]),Ua=Oe({},["annotation-xml"]);const yr=Oe({},["title","style","font","a","script"]);let ys=null;const Xn=["application/xhtml+xml","text/html"],ea="text/html";let it=null,Fs=null;const V=s.createElement("form"),ne=function(k){return k instanceof RegExp||k instanceof Function},Te=function(){let k=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Fs&&Fs===k)return;(!k||typeof k!="object")&&(k={}),k=Mt(k),ys=Xn.indexOf(k.PARSER_MEDIA_TYPE)===-1?ea:k.PARSER_MEDIA_TYPE,it=ys==="application/xhtml+xml"?Hr:ei,pe=ot(k,"ALLOWED_TAGS")&&Vt(k.ALLOWED_TAGS)?Oe({},k.ALLOWED_TAGS,it):Le,m=ot(k,"ALLOWED_ATTR")&&Vt(k.ALLOWED_ATTR)?Oe({},k.ALLOWED_ATTR,it):E,En=ot(k,"ALLOWED_NAMESPACES")&&Vt(k.ALLOWED_NAMESPACES)?Oe({},k.ALLOWED_NAMESPACES,Hr):br,Cn=ot(k,"ADD_URI_SAFE_ATTR")&&Vt(k.ADD_URI_SAFE_ATTR)?Oe(Mt(Qn),k.ADD_URI_SAFE_ATTR,it):Qn,bs=ot(k,"ADD_DATA_URI_TAGS")&&Vt(k.ADD_DATA_URI_TAGS)?Oe(Mt(Ts),k.ADD_DATA_URI_TAGS,it):Ts,Ke=ot(k,"FORBID_CONTENTS")&&Vt(k.FORBID_CONTENTS)?Oe({},k.FORBID_CONTENTS,it):Wt,Z=ot(k,"FORBID_TAGS")&&Vt(k.FORBID_TAGS)?Oe({},k.FORBID_TAGS,it):Mt({}),R=ot(k,"FORBID_ATTR")&&Vt(k.FORBID_ATTR)?Oe({},k.FORBID_ATTR,it):Mt({}),Ye=ot(k,"USE_PROFILES")?k.USE_PROFILES&&typeof k.USE_PROFILES=="object"?Mt(k.USE_PROFILES):k.USE_PROFILES:!1,Y=k.ALLOW_ARIA_ATTR!==!1,ee=k.ALLOW_DATA_ATTR!==!1,te=k.ALLOW_UNKNOWN_PROTOCOLS||!1,X=k.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=k.SAFE_FOR_TEMPLATES||!1,le=k.SAFE_FOR_XML!==!1,ge=k.WHOLE_DOCUMENT||!1,Ee=k.RETURN_DOM||!1,H=k.RETURN_DOM_FRAGMENT||!1,re=k.RETURN_TRUSTED_TYPE||!1,ke=k.FORCE_BODY||!1,ye=k.SANITIZE_DOM!==!1,Me=k.SANITIZE_NAMED_PROPS||!1,Je=k.KEEP_CONTENT!==!1,dt=k.IN_PLACE||!1,me=ek(k.ALLOWED_URI_REGEXP)?k.ALLOWED_URI_REGEXP:Pd,Se=typeof k.NAMESPACE=="string"?k.NAMESPACE:z,$a=ot(k,"MATHML_TEXT_INTEGRATION_POINTS")&&k.MATHML_TEXT_INTEGRATION_POINTS&&typeof k.MATHML_TEXT_INTEGRATION_POINTS=="object"?Mt(k.MATHML_TEXT_INTEGRATION_POINTS):Oe({},["mi","mo","mn","ms","mtext"]),Ua=ot(k,"HTML_INTEGRATION_POINTS")&&k.HTML_INTEGRATION_POINTS&&typeof k.HTML_INTEGRATION_POINTS=="object"?Mt(k.HTML_INTEGRATION_POINTS):Oe({},["annotation-xml"]);const q=ot(k,"CUSTOM_ELEMENT_HANDLING")&&k.CUSTOM_ELEMENT_HANDLING&&typeof k.CUSTOM_ELEMENT_HANDLING=="object"?Mt(k.CUSTOM_ELEMENT_HANDLING):ua(null);if(M=ua(null),ot(q,"tagNameCheck")&&ne(q.tagNameCheck)&&(M.tagNameCheck=q.tagNameCheck),ot(q,"attributeNameCheck")&&ne(q.attributeNameCheck)&&(M.attributeNameCheck=q.attributeNameCheck),ot(q,"allowCustomizedBuiltInElements")&&typeof q.allowCustomizedBuiltInElements=="boolean"&&(M.allowCustomizedBuiltInElements=q.allowCustomizedBuiltInElements),be&&(ee=!1),H&&(Ee=!0),Ye&&(pe=Oe({},Od),m=ua(null),Ye.html===!0&&(Oe(pe,Ld),Oe(m,Dd)),Ye.svg===!0&&(Oe(pe,Vr),Oe(m,qr),Oe(m,el)),Ye.svgFilters===!0&&(Oe(pe,jr),Oe(m,qr),Oe(m,el)),Ye.mathMl===!0&&(Oe(pe,zr),Oe(m,Md),Oe(m,el))),F.tagCheck=null,F.attributeCheck=null,ot(k,"ADD_TAGS")&&(typeof k.ADD_TAGS=="function"?F.tagCheck=k.ADD_TAGS:Vt(k.ADD_TAGS)&&(pe===Le&&(pe=Mt(pe)),Oe(pe,k.ADD_TAGS,it))),ot(k,"ADD_ATTR")&&(typeof k.ADD_ATTR=="function"?F.attributeCheck=k.ADD_ATTR:Vt(k.ADD_ATTR)&&(m===E&&(m=Mt(m)),Oe(m,k.ADD_ATTR,it))),ot(k,"ADD_URI_SAFE_ATTR")&&Vt(k.ADD_URI_SAFE_ATTR)&&Oe(Cn,k.ADD_URI_SAFE_ATTR,it),ot(k,"FORBID_CONTENTS")&&Vt(k.FORBID_CONTENTS)&&(Ke===Wt&&(Ke=Mt(Ke)),Oe(Ke,k.FORBID_CONTENTS,it)),ot(k,"ADD_FORBID_CONTENTS")&&Vt(k.ADD_FORBID_CONTENTS)&&(Ke===Wt&&(Ke=Mt(Ke)),Oe(Ke,k.ADD_FORBID_CONTENTS,it)),Je&&(pe["#text"]=!0),ge&&Oe(pe,["html","head","body"]),pe.table&&(Oe(pe,["tbody"]),delete Z.tbody),k.TRUSTED_TYPES_POLICY){if(typeof k.TRUSTED_TYPES_POLICY.createHTML!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof k.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=I;I=k.TRUSTED_TYPES_POLICY;try{L=P("")}catch(Ce){throw I=ae,Ce}}else k.TRUSTED_TYPES_POLICY===null?(I=void 0,L=""):(I===void 0&&(I=$()),I&&typeof L=="string"&&(L=P("")));(ce.uponSanitizeElement.length>0||ce.uponSanitizeAttribute.length>0)&&pe===Le&&(pe=Mt(pe)),ce.uponSanitizeAttribute.length>0&&m===E&&(m=Mt(m)),Gt&&Gt(k),Fs=k},Xe=Oe({},[...Vr,...jr,...tk]),rt=Oe({},[...zr,...sk]),Zt=function(k){let q=N(k);(!q||!q.tagName)&&(q={namespaceURI:Se,tagName:"template"});const ae=ei(k.tagName),Ce=ei(q.tagName);return En[k.namespaceURI]?k.namespaceURI===un?q.namespaceURI===z?ae==="svg":q.namespaceURI===cn?ae==="svg"&&(Ce==="annotation-xml"||$a[Ce]):!!Xe[ae]:k.namespaceURI===cn?q.namespaceURI===z?ae==="math":q.namespaceURI===un?ae==="math"&&Ua[Ce]:!!rt[ae]:k.namespaceURI===z?q.namespaceURI===un&&!Ua[Ce]||q.namespaceURI===cn&&!$a[Ce]?!1:!rt[ae]&&(yr[ae]||!Xe[ae]):!!(ys==="application/xhtml+xml"&&En[k.namespaceURI]):!1},ns=function(k){ia(t.removed,{element:k});try{N(k).removeChild(k)}catch{if(v(k),!N(k))throw Nn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Vc=function(k){const q=w?w(k):k.childNodes;if(q){const Ce=[];Vs(q,Re=>{ia(Ce,Re)}),Vs(Ce,Re=>{try{v(Re)}catch{}})}const ae=b?b(k):null;if(ae)for(let Ce=ae.length-1;Ce>=0;--Ce){const Re=ae[Ce],De=Re&&Re.name;if(typeof De=="string")try{k.removeAttribute(De)}catch{}}},An=function(k,q){try{ia(t.removed,{attribute:q.getAttributeNode(k),from:q})}catch{ia(t.removed,{attribute:null,from:q})}if(q.removeAttribute(k),k==="is")if(Ee||H)try{ns(q)}catch{}else try{q.setAttribute(k,"")}catch{}},xg=function(k){const q=b?b(k):k.attributes;if(q)for(let ae=q.length-1;ae>=0;--ae){const Ce=q[ae],Re=Ce&&Ce.name;if(!(typeof Re!="string"||m[it(Re)]))try{k.removeAttribute(Re)}catch{}}},_g=function(k){const q=[k];for(;q.length>0;){const ae=q.pop();(_?_(ae):ae.nodeType)===Es.element&&xg(ae);const Re=w?w(ae):ae.childNodes;if(Re)for(let De=Re.length-1;De>=0;--De)q.push(Re[De])}},jc=function(k){let q=null,ae=null;if(ke)k="<remove></remove>"+k;else{const De=Ad(k,/^[\r\n\t ]+/);ae=De&&De[0]}ys==="application/xhtml+xml"&&Se===z&&(k='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+k+"</body></html>");const Ce=I?P(k):k;if(Se===z)try{q=new u().parseFromString(Ce,ys)}catch{}if(!q||!q.documentElement){q=K.createDocument(Se,"template",null);try{q.documentElement.innerHTML=Cs?L:Ce}catch{}}const Re=q.body||q.documentElement;return k&&ae&&Re.insertBefore(s.createTextNode(ae),Re.childNodes[0]||null),Se===z?B.call(q,ge?"html":"body")[0]:ge?q.documentElement:Re},zc=function(k){return D.call(k.ownerDocument||k,k,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},xr=function(k){var q,ae;k.normalize();const Ce=D.call(k.ownerDocument||k,k,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Re=Ce.nextNode();for(;Re;){let _t=Re.data;Vs([se,fe,Q],tt=>{_t=la(_t,tt," ")}),Re.data=_t,Re=Ce.nextNode()}const De=(q=(ae=k.querySelectorAll)===null||ae===void 0?void 0:ae.call(k,"template"))!==null&&q!==void 0?q:[];Vs(Array.from(De),_t=>{ta(_t.content)&&xr(_t.content)})},Bi=function(k){const q=C?C(k):null;return typeof q!="string"||it(q)!=="form"?!1:typeof k.nodeName!="string"||typeof k.textContent!="string"||typeof k.removeChild!="function"||k.attributes!==b(k)||typeof k.removeAttribute!="function"||typeof k.setAttribute!="function"||typeof k.namespaceURI!="string"||typeof k.insertBefore!="function"||typeof k.hasChildNodes!="function"||k.nodeType!==_(k)||k.childNodes!==w(k)},ta=function(k){if(!_||typeof k!="object"||k===null)return!1;try{return _(k)===Es.documentFragment}catch{return!1}},Ba=function(k){if(!_||typeof k!="object"||k===null)return!1;try{return typeof _(k)=="number"}catch{return!1}};function $s(ve,k,q){Vs(ve,ae=>{ae.call(t,k,q,Fs)})}const qc=function(k){let q=null;if($s(ce.beforeSanitizeElements,k,null),Bi(k))return ns(k),!0;const ae=it(C?C(k):k.nodeName);if($s(ce.uponSanitizeElement,k,{tagName:ae,allowedTags:pe}),le&&k.hasChildNodes()&&!Ba(k.firstElementChild)&&Rt(/<[/\w!]/g,k.innerHTML)&&Rt(/<[/\w!]/g,k.textContent)||le&&k.namespaceURI===z&&ae==="style"&&Ba(k.firstElementChild)||k.nodeType===Es.progressingInstruction||le&&k.nodeType===Es.comment&&Rt(/<[/\w]/g,k.data))return ns(k),!0;if(Z[ae]||!(F.tagCheck instanceof Function&&F.tagCheck(ae))&&!pe[ae]){if(!Z[ae]&&Gc(ae)&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,ae)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ae)))return!1;if(Je&&!Ke[ae]){const Re=N(k),De=w(k);if(De&&Re){const _t=De.length;for(let tt=_t-1;tt>=0;--tt){const ft=dt?De[tt]:p(De[tt],!0);Re.insertBefore(ft,g(k))}}}return ns(k),!0}return(_?_(k):k.nodeType)===Es.element&&!Zt(k)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&Rt(/<\/no(script|embed|frames)/i,k.innerHTML)?(ns(k),!0):(be&&k.nodeType===Es.text&&(q=k.textContent,Vs([se,fe,Q],Re=>{q=la(q,Re," ")}),k.textContent!==q&&(ia(t.removed,{element:k.cloneNode()}),k.textContent=q)),$s(ce.afterSanitizeElements,k,null),!1)},Kc=function(k,q,ae){if(R[q]||ye&&(q==="id"||q==="name")&&(ae in s||ae in V))return!1;const Ce=m[q]||F.attributeCheck instanceof Function&&F.attributeCheck(q,k);if(!(ee&&!R[q]&&Rt(de,q))){if(!(Y&&Rt(Ie,q))){if(!Ce||R[q]){if(!(Gc(k)&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,k)||M.tagNameCheck instanceof Function&&M.tagNameCheck(k))&&(M.attributeNameCheck instanceof RegExp&&Rt(M.attributeNameCheck,q)||M.attributeNameCheck instanceof Function&&M.attributeNameCheck(q,k))||q==="is"&&M.allowCustomizedBuiltInElements&&(M.tagNameCheck instanceof RegExp&&Rt(M.tagNameCheck,ae)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ae))))return!1}else if(!Cn[q]){if(!Rt(me,la(ae,oe,""))){if(!((q==="src"||q==="xlink:href"||q==="href")&&k!=="script"&&Rd(ae,"data:")===0&&bs[k])){if(!(te&&!Rt(j,la(ae,oe,"")))){if(ae)return!1}}}}}}return!0},kg=Oe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Gc=function(k){return!kg[ei(k)]&&Rt(ie,k)},Wc=function(k){$s(ce.beforeSanitizeAttributes,k,null);const q=k.attributes;if(!q||Bi(k))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:m,forceKeepAttr:void 0};let Ce=q.length;for(;Ce--;){const Re=q[Ce],De=Re.name,_t=Re.namespaceURI,tt=Re.value,ft=it(De),dn=tt;let Ct=De==="value"?dn:W_(dn);if(ae.attrName=ft,ae.attrValue=Ct,ae.keepAttr=!0,ae.forceKeepAttr=void 0,$s(ce.uponSanitizeAttribute,k,ae),Ct=ae.attrValue,Me&&(ft==="id"||ft==="name")&&Rd(Ct,Ue)!==0&&(An(De,k),Ct=Ue+Ct),le&&Rt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Ct)){An(De,k);continue}if(ft==="attributename"&&Ad(Ct,"href")){An(De,k);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){An(De,k);continue}if(!X&&Rt(/\/>/i,Ct)){An(De,k);continue}be&&Vs([se,fe,Q],Jc=>{Ct=la(Ct,Jc," ")});const Zc=it(k.nodeName);if(!Kc(Zc,ft,Ct)){An(De,k);continue}if(I&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!_t)switch(d.getAttributeType(Zc,ft)){case"TrustedHTML":{Ct=P(Ct);break}case"TrustedScriptURL":{Ct=T(Ct);break}}if(Ct!==dn)try{_t?k.setAttributeNS(_t,De,Ct):k.setAttribute(De,Ct),Bi(k)?ns(k):Ed(t.removed)}catch{An(De,k)}}$s(ce.afterSanitizeAttributes,k,null)},Hi=function(k){let q=null;const ae=zc(k);for($s(ce.beforeSanitizeShadowDOM,k,null);q=ae.nextNode();)if($s(ce.uponSanitizeShadowNode,q,null),qc(q),Wc(q),ta(q.content)&&Hi(q.content),(_?_(q):q.nodeType)===Es.element){const Re=y?y(q):q.shadowRoot;ta(Re)&&(_r(Re),Hi(Re))}$s(ce.afterSanitizeShadowDOM,k,null)},_r=function(k){const q=[{node:k,shadow:null}];for(;q.length>0;){const ae=q.pop();if(ae.shadow){Hi(ae.shadow);continue}const Ce=ae.node,De=(_?_(Ce):Ce.nodeType)===Es.element,_t=w?w(Ce):Ce.childNodes;if(_t)for(let tt=_t.length-1;tt>=0;--tt)q.push({node:_t[tt],shadow:null});if(De){const tt=C?C(Ce):null;if(typeof tt=="string"&&it(tt)==="template"){const ft=Ce.content;ta(ft)&&q.push({node:ft,shadow:null})}}if(De){const tt=y?y(Ce):Ce.shadowRoot;ta(tt)&&q.push({node:null,shadow:tt},{node:tt,shadow:null})}}};return t.sanitize=function(ve){let k=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},q=null,ae=null,Ce=null,Re=null;if(Cs=!ve,Cs&&(ve="<!-->"),typeof ve!="string"&&!Ba(ve)&&(ve=X_(ve),typeof ve!="string"))throw Nn("dirty is not a string, aborting");if(!t.isSupported)return ve;xe||Te(k),t.removed=[];const De=dt&&typeof ve!="string"&&Ba(ve);if(De){const ft=C?C(ve):ve.nodeName;if(typeof ft=="string"){const dn=it(ft);if(!pe[dn]||Z[dn])throw Nn("root node is forbidden and cannot be sanitized in-place")}if(Bi(ve))throw Nn("root node is clobbered and cannot be sanitized in-place");try{_r(ve)}catch(dn){throw Vc(ve),dn}}else if(Ba(ve))q=jc("<!---->"),ae=q.ownerDocument.importNode(ve,!0),ae.nodeType===Es.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?q=ae:q.appendChild(ae),_r(ae);else{if(!Ee&&!be&&!ge&&ve.indexOf("<")===-1)return I&&re?P(ve):ve;if(q=jc(ve),!q)return Ee?null:re?L:""}q&&ke&&ns(q.firstChild);const _t=zc(De?ve:q);try{for(;Ce=_t.nextNode();)qc(Ce),Wc(Ce),ta(Ce.content)&&Hi(Ce.content)}catch(ft){throw De&&Vc(ve),ft}if(De)return Vs(t.removed,ft=>{ft.element&&_g(ft.element)}),be&&xr(ve),ve;if(Ee){if(be&&xr(q),H)for(Re=x.call(q.ownerDocument);q.firstChild;)Re.appendChild(q.firstChild);else Re=q;return(m.shadowroot||m.shadowrootmode)&&(Re=ue.call(n,Re,!0)),Re}let tt=ge?q.outerHTML:q.innerHTML;return ge&&pe["!doctype"]&&q.ownerDocument&&q.ownerDocument.doctype&&q.ownerDocument.doctype.name&&Rt(uk,q.ownerDocument.doctype.name)&&(tt="<!DOCTYPE "+q.ownerDocument.doctype.name+`>
`+tt),be&&Vs([se,fe,Q],ft=>{tt=la(tt,ft," ")}),I&&re?P(tt):tt},t.setConfig=function(){let ve=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(ve),xe=!0},t.clearConfig=function(){Fs=null,xe=!1,I=S,L=""},t.isValidAttribute=function(ve,k,q){Fs||Te({});const ae=it(ve),Ce=it(k);return Kc(ae,Ce,q)},t.addHook=function(ve,k){typeof k=="function"&&ia(ce[ve],k)},t.removeHook=function(ve,k){if(k!==void 0){const q=K_(ce[ve],k);return q===-1?void 0:G_(ce[ve],q,1)[0]}return Ed(ce[ve])},t.removeHooks=function(ve){ce[ve]=[]},t.removeAllHooks=function(){ce=Fd()},t}var $d=ig();function Oc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Yn=Oc();function lg(e){Yn=e}var ci={exec:()=>null};function Ze(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},hk=/^(?:[ \t]*(?:\n|$))+/,gk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Ui=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,vk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Dc=/(?:[*+-]|\d{1,9}[.)])/,rg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,og=Ze(rg).replace(/bull/g,Dc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),bk=Ze(rg).replace(/bull/g,Dc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Mc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,yk=/^[^\n]+/,Pc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,xk=Ze(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Pc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),_k=Ze(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Dc).getRegex(),gr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Fc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,kk=Ze("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Fc).replace("tag",gr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),cg=Ze(Mc).replace("hr",Ui).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",gr).getRegex(),wk=Ze(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",cg).getRegex(),$c={blockquote:wk,code:gk,def:xk,fences:mk,heading:vk,hr:Ui,html:kk,lheading:og,list:_k,newline:hk,paragraph:cg,table:ci,text:yk},Ud=Ze("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Ui).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",gr).getRegex(),Sk={...$c,lheading:bk,table:Ud,paragraph:Ze(Mc).replace("hr",Ui).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Ud).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",gr).getRegex()},Tk={...$c,html:Ze(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Fc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:ci,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:Ze(Mc).replace("hr",Ui).replace("heading",` *#{1,6} *[^
]`).replace("lheading",og).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Ck=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Ek=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,ug=/^( {2,}|\\)\n(?!\s*$)/,Ak=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,mr=/[\p{P}\p{S}]/u,Uc=/[\s\p{P}\p{S}]/u,dg=/[^\s\p{P}\p{S}]/u,Rk=Ze(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Uc).getRegex(),fg=/(?!~)[\p{P}\p{S}]/u,Ik=/(?!~)[\s\p{P}\p{S}]/u,Nk=/(?:[^\s\p{P}\p{S}]|~)/u,Lk=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,pg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Ok=Ze(pg,"u").replace(/punct/g,mr).getRegex(),Dk=Ze(pg,"u").replace(/punct/g,fg).getRegex(),hg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Mk=Ze(hg,"gu").replace(/notPunctSpace/g,dg).replace(/punctSpace/g,Uc).replace(/punct/g,mr).getRegex(),Pk=Ze(hg,"gu").replace(/notPunctSpace/g,Nk).replace(/punctSpace/g,Ik).replace(/punct/g,fg).getRegex(),Fk=Ze("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,dg).replace(/punctSpace/g,Uc).replace(/punct/g,mr).getRegex(),$k=Ze(/\\(punct)/,"gu").replace(/punct/g,mr).getRegex(),Uk=Ze(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Bk=Ze(Fc).replace("(?:-->|$)","-->").getRegex(),Hk=Ze("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Bk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),$l=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Vk=Ze(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",$l).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),gg=Ze(/^!?\[(label)\]\[(ref)\]/).replace("label",$l).replace("ref",Pc).getRegex(),mg=Ze(/^!?\[(ref)\](?:\[\])?/).replace("ref",Pc).getRegex(),jk=Ze("reflink|nolink(?!\\()","g").replace("reflink",gg).replace("nolink",mg).getRegex(),Bc={_backpedal:ci,anyPunctuation:$k,autolink:Uk,blockSkip:Lk,br:ug,code:Ek,del:ci,emStrongLDelim:Ok,emStrongRDelimAst:Mk,emStrongRDelimUnd:Fk,escape:Ck,link:Vk,nolink:mg,punctuation:Rk,reflink:gg,reflinkSearch:jk,tag:Hk,text:Ak,url:ci},zk={...Bc,link:Ze(/^!?\[(label)\]\((.*?)\)/).replace("label",$l).getRegex(),reflink:Ze(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",$l).getRegex()},Ro={...Bc,emStrongRDelimAst:Pk,emStrongLDelim:Dk,url:Ze(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},qk={...Ro,br:Ze(ug).replace("{2,}","*").getRegex(),text:Ze(Ro.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},tl={normal:$c,gfm:Sk,pedantic:Tk},Wa={normal:Bc,gfm:Ro,breaks:qk,pedantic:zk},Kk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Bd=e=>Kk[e];function Is(e,t){if(t){if(qt.escapeTest.test(e))return e.replace(qt.escapeReplace,Bd)}else if(qt.escapeTestNoEncode.test(e))return e.replace(qt.escapeReplaceNoEncode,Bd);return e}function Hd(e){try{e=encodeURI(e).replace(qt.percentDecode,"%")}catch{return null}return e}function Vd(e,t){var i;const s=e.replace(qt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(qt.slashPipe,"|");return n}function Za(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function Gk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function jd(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function Wk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Ul=class{constructor(e){et(this,"options");et(this,"rules");et(this,"lexer");this.options=e||Yn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Za(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=Wk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Za(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Za(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Za(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),u=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${u}`:u;const d=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(u,i,!0),this.lexer.state.top=d,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,v=p.raw+`
`+s.join(`
`),g=this.blockquote(v);i[i.length-1]=g,n=n.substring(0,n.length-p.raw.length)+g.raw,a=a.substring(0,a.length-p.text.length)+g.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,v=p.raw+`
`+s.join(`
`),g=this.list(v);i[i.length-1]=g,n=n.substring(0,n.length-f.raw.length)+g.raw,a=a.substring(0,a.length-p.raw.length)+g.raw,s=v.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",u="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let d=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,N=>" ".repeat(3*N.length)),f=e.split(`
`,1)[0],p=!d.trim(),v=0;if(this.options.pedantic?(v=2,u=d.trimStart()):p?v=t[1].length+1:(v=t[2].search(this.rules.other.nonSpaceChar),v=v>4?1:v,u=d.slice(v),v+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const N=this.rules.other.nextBulletRegex(v),y=this.rules.other.hrRegex(v),b=this.rules.other.fencesBeginRegex(v),_=this.rules.other.headingBeginRegex(v),C=this.rules.other.htmlBeginRegex(v);for(;e;){const I=e.split(`
`,1)[0];let L;if(f=I,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),L=f):L=f.replace(this.rules.other.tabCharGlobal,"    "),b.test(f)||_.test(f)||C.test(f)||N.test(f)||y.test(f))break;if(L.search(this.rules.other.nonSpaceChar)>=v||!f.trim())u+=`
`+L.slice(v);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||b.test(d)||_.test(d)||y.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=I+`
`,e=e.substring(I.length+1),d=L.slice(v)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,w;this.options.gfm&&(g=this.rules.other.listIsTask.exec(u),g&&(w=g[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:w,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Vd(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Vd(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Za(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Gk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),jd(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return jd(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const v=f.slice(1,-1);return{type:"em",raw:f,text:v,tokens:this.lexer.inlineTokens(v)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Js=class Io{constructor(t){et(this,"tokens");et(this,"options");et(this,"state");et(this,"tokenizer");et(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Yn,this.options.tokenizer=this.options.tokenizer||new Ul,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:qt,block:tl.normal,inline:Wa.normal};this.options.pedantic?(s.block=tl.pedantic,s.inline=Wa.pedantic):this.options.gfm&&(s.block=tl.gfm,this.options.breaks?s.inline=Wa.breaks:s.inline=Wa.gfm),this.tokenizer.rules=s}static get rules(){return{block:tl,inline:Wa}}static lex(t,s){return new Io(s).lex(t)}static lexInline(t,s){return new Io(s).inlineTokens(t)}lex(t){t=t.replace(qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(qt.tabCharGlobal,"    ").replace(qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const u=t.slice(1);let d;this.options.extensions.startBlock.forEach(f=>{d=f.call({lexer:this},u),typeof d=="number"&&d>=0&&(c=Math.min(c,d))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const u=Object.keys(this.tokens.links);if(u.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)u.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let u;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(u=f.call({lexer:this},t,s))?(t=t.substring(u.raw.length),s.push(u),!0):!1))continue;if(u=this.tokenizer.escape(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.tag(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.link(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(u.raw.length);const f=s.at(-1);u.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(u=this.tokenizer.emStrong(t,n,l)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.codespan(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.br(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.del(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.autolink(t)){t=t.substring(u.raw.length),s.push(u);continue}if(!this.state.inLink&&(u=this.tokenizer.url(t))){t=t.substring(u.raw.length),s.push(u);continue}let d=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let v;this.options.extensions.startInline.forEach(g=>{v=g.call({lexer:this},p),typeof v=="number"&&v>=0&&(f=Math.min(f,v))}),f<1/0&&f>=0&&(d=t.substring(0,f+1))}if(u=this.tokenizer.inlineText(d)){t=t.substring(u.raw.length),u.raw.slice(-1)!=="_"&&(l=u.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Bl=class{constructor(e){et(this,"options");et(this,"parser");this.options=e||Yn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(qt.notSpaceStart))==null?void 0:i[0],a=e.replace(qt.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Is(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Hd(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Is(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Hd(e);if(a===null)return Is(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Is(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Is(e.text)}},Hc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ys=class No{constructor(t){et(this,"options");et(this,"renderer");et(this,"textRenderer");this.options=t||Yn,this.options.renderer=this.options.renderer||new Bl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Hc}static parse(t,s){return new No(s).parse(t)}static parseInline(t,s){return new No(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Zr,ul=(Zr=class{constructor(e){et(this,"options");et(this,"block");this.options=e||Yn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Js.lex:Js.lexInline}provideParser(){return this.block?Ys.parse:Ys.parseInline}},et(Zr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Zr),Zk=class{constructor(...e){et(this,"defaults",Oc());et(this,"options",this.setOptions);et(this,"parse",this.parseMarkdown(!0));et(this,"parseInline",this.parseMarkdown(!1));et(this,"Parser",Ys);et(this,"Renderer",Bl);et(this,"TextRenderer",Hc);et(this,"Lexer",Js);et(this,"Tokenizer",Ul);et(this,"Hooks",ul);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Bl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Ul(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new ul;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];ul.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Js.lex(e,t??this.defaults)}parser(e,t){return Ys.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?Js.lex:Js.lexInline,o=i.hooks?i.hooks.provideParser():e?Ys.parse:Ys.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Is(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Kn=new Zk;function qe(e,t){return Kn.parse(e,t)}qe.options=qe.setOptions=function(e){return Kn.setOptions(e),qe.defaults=Kn.defaults,lg(qe.defaults),qe};qe.getDefaults=Oc;qe.defaults=Yn;qe.use=function(...e){return Kn.use(...e),qe.defaults=Kn.defaults,lg(qe.defaults),qe};qe.walkTokens=function(e,t){return Kn.walkTokens(e,t)};qe.parseInline=Kn.parseInline;qe.Parser=Ys;qe.parser=Ys.parse;qe.Renderer=Bl;qe.TextRenderer=Hc;qe.Lexer=Js;qe.lexer=Js.lex;qe.Tokenizer=Ul;qe.Hooks=ul;qe.parse=qe;qe.options;qe.setOptions;qe.use;qe.walkTokens;qe.parseInline;Ys.parse;Js.lex;const Jk={breaks:!0,gfm:!0};function zd(e){if(!e)return"";try{if(typeof qe<"u"&&qe.parse){const t=qe.parse(e,Jk);return typeof $d<"u"?$d.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Yk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Qk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function Xk(e){return Qk[e]||"wrench"}const ew=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function qd(e){if(!e)return[];const t=e.match(ew);return t?[...new Set(t)]:[]}const tw={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=J(()=>t.value.trim().length>0&&!s.value),d=J(()=>{const T=We.state;return T==="connected"?"Connected":T==="reconnecting"?"Reconnecting…":T==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=J(()=>{const T=Math.floor(i.value/4)%f.length,$=i.value;return $>3?`${f[T]} (${$}s)`:f[0]});function v(){St(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const T=a.value;T.style.height="auto",T.style.height=Math.min(T.scrollHeight,120)+"px"}function w(T,$,W={}){const K={id:++o,role:T,content:$,timestamp:Date.now(),html:T==="bot"?zd($):"",tools_used:W.tools_used||[],is_error:W.is_error||!1,images:T==="bot"?qd($):[],files:W.files||[],_showTools:!1};return e.value.push(K),v(),T==="bot"&&St(()=>N()),K}function N(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach($=>{$.setAttribute("data-copy","true"),$.style.position="relative";const W=document.createElement("button");W.className="chat-code-copy",W.textContent="Copy",W.addEventListener("click",()=>{const K=$.querySelector("code"),D=K?K.textContent:$.textContent;navigator.clipboard.writeText(D).then(()=>{W.textContent="Copied!",setTimeout(()=>{W.textContent="Copy"},1500)}).catch(()=>{})}),$.appendChild(W)})}function y(T){if(T===0)return!0;const $=e.value[T-1],W=e.value[T],K=new Date($.timestamp).toDateString(),D=new Date(W.timestamp).toDateString();return K!==D}function b(T){const $=new Date(T),W=new Date;if($.toDateString()===W.toDateString())return"Today";const K=new Date(W);return K.setDate(K.getDate()-1),$.toDateString()===K.toDateString()?"Yesterday":$.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function _(T){t.value=T,St(()=>U())}function C(T){window.open(T,"_blank","noopener")}function I(T){T.target.style.display="none"}function L(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function S(){r&&(clearInterval(r),r=null),i.value=0}function A(T){s.value&&(s.value=!1,S(),T.type==="chat_response"?w("bot",T.content,{tools_used:T.tools_used||[],is_error:T.is_error||!1,files:T.files||[]}):T.type==="chat_error"&&w("bot",T.error||"Unknown error",{is_error:!0}),St(()=>{var $;return($=a.value)==null?void 0:$.focus()}))}async function O(T){try{const $=await G.post("/api/chat",{content:T,channel_id:l.value});w("bot",$.response,{tools_used:$.tools_used||[],is_error:$.is_error||!1,files:$.files||[]})}catch($){w("bot",$.message||"Failed to send message",{is_error:!0})}}async function U(){const T=t.value.trim();if(!T||s.value)return;w("user",T),t.value="",s.value=!0,L(),a.value&&(a.value.style.height="auto"),We.connected&&We.sendChat(T,{channelId:l.value})||(await O(T),s.value=!1,S()),St(()=>{var W;return(W=a.value)==null?void 0:W.focus()})}async function P(){try{if(!l.value){const $=await G.get("/api/auth/session");l.value=$.channel_id||$.user_id||"web-user"}const T=await G.get("/api/sessions/"+encodeURIComponent(l.value));if(T&&T.messages&&T.messages.length>0){for(const $ of T.messages){const W=$.role==="user"?"user":"bot";let K=$.content||"";if(W==="user"){const x=K.match(/^\[.*?\]:\s*/);x&&(K=K.slice(x[0].length))}if(!K.trim())continue;const D={id:++o,role:W,content:K,timestamp:$.timestamp?$.timestamp*1e3:Date.now(),html:W==="bot"?zd(K):"",tools_used:[],is_error:!1,images:W==="bot"?qd(K):[],files:[],_showTools:!1};e.value.push(D)}St(()=>{v(),N()})}}catch{}}return He(()=>{We.subscribe("chat",A),P(),St(()=>{var T;return(T=a.value)==null?void 0:T.focus()})}),gt(()=>{We.unsubscribe("chat",A),S()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:U,autoResize:g,formatTime:Yk,formatDate:b,showDateSeparator:y,useSuggestion:_,openImage:C,onImageError:I,getToolIcon:Xk}}},vr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=R_(),s=Xh(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ls(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var u;return(u=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:u.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},sw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,v;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const g={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(d==="tool_end"){const g=e.value.findIndex(w=>w.tool===u.action&&w.status==="running");if(g>=0){const w=e.value[g];w.status=(p=u.metadata)!=null&&p.error?"error":"success",w.elapsed=((v=u.metadata)==null?void 0:v.elapsed_ms)||Date.now()-w.startTime,w.result=u.detail||"",w.fadingOut=!0,setTimeout(()=>{const N=e.value.indexOf(w);N>=0&&e.value.splice(N,1),t.value.unshift(w),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const g=u.tool_name||"unknown";if(u.finished)delete s.value[g];else{const N=((s.value[g]||"")+(u.chunk||"")).split(`
`);s.value[g]=N.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(u=>{u.status==="running"&&(u.elapsed=c-u.startTime)})}He(()=>{We.on("events",a),i=setInterval(l,500)}),gt(()=>{We.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"clock":c==="success"?"success":c==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
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
  `},vg=Symbol("agent-detail-cancelled"),nw=15e3;function aw(e,{timeoutMs:t,scheduleTimeout:s,cancelTimeout:n}){const a=typeof AbortController=="function"?new AbortController:null;let i=null,l=!1,r,o;const c=new Promise((f,p)=>{r=f,o=p});function u(f,p){l||(l=!0,i!==null&&n(i),i=null,(f?r:o)(p))}let d;try{d=e(a==null?void 0:a.signal)}catch(f){u(!1,f)}return l||Promise.resolve(d).then(f=>u(!0,f),f=>u(!1,f)),!l&&Number.isFinite(t)&&t>0&&(i=s(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`Agent detail request timed out after ${f}s`)),a==null||a.abort()},t)),{promise:c,cancel(){u(!0,vg),a==null||a.abort()}}}function iw({state:e,requestDetail:t,timeoutMs:s=nw,scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:a=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let i=null;function l(){const d=i;i=null,d==null||d.cancel()}function r(d,{initial:f,coalesce:p}){if(!d)return Promise.resolve();if(p&&i&&i.agentId===d&&e.detailId===d)return i.promise;l();const v={agentId:d,cancel:null,promise:null};i=v,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const g=aw(w=>t(d,{signal:w}),{timeoutMs:s,scheduleTimeout:n,cancelTimeout:a});return v.cancel=g.cancel,v.promise=(async()=>{let w=null,N=null;try{w=await g.promise}catch(y){N=y}w!==vg&&(i!==v||e.detailId!==d||(i=null,!N&&(w===null||typeof w!="object")&&(N=new Error("Agent detail response was empty or invalid")),N?e.detail===null&&(e.detailError=(N==null?void 0:N.message)||"Failed to load agent detail"):(e.detail=w,e.detailError=null),e.detailLoading=!1))})(),v.promise}function o(d){return e.detailId=d,r(d,{initial:!0,coalesce:!1})}function c(){const d=e.detailId;return d?r(d,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){l(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:o,refresh:c,close:u,hasInFlight:()=>i!==null}}function lw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function u(){c(),e()&&(r=i(o,a))}function d(){e()?u():c()}return{start:u,stop:c,sync:d,isRunning:()=>r!==null}}const rw={template:`
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
          <div class="ag-card-policy">
            <span class="ag-policy-chip"
                  :title="displayModelText(agent) + ' — ' + displaySourceLabel(agent.display_source)">{{ displayModelText(agent) }}</span>
            <span class="ag-policy-chip ag-policy-effort"
                  :title="displayEffortText(agent) + ' — ' + displaySourceLabel(agent.display_source)">{{ displayEffortText(agent) }}</span>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=J(()=>e.value.filter(x=>x.status==="running").length),o=J(()=>e.value.filter(x=>x.status==="completed").length),c=J(()=>e.value.filter(x=>["failed","timeout","killed"].includes(x.status)).length),u=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(x=>["failed","timeout","killed"].includes(x.status)):e.value.filter(x=>x.status===i.value));function f(x){const B=Number(x.max_iterations)||0;return B<=0?0:Math.min(100,Math.round(x.iteration_count/B*100))}function p(x){return(Number(x.max_iterations)||0)>0}function v(x,B){return x?x==="N/A"?"N/A":B==="current_inheritance"?`inherit (currently ${x})`:x:"unknown"}function g(x){return v(x.display_model,x.display_model_source||x.display_source)}function w(x){return v(x.display_reasoning_effort,x.display_reasoning_effort_source||x.display_source)}function N(x){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[x]||""}const y=h(null),b=h(null),_=h(!1),C=h(null),I=h(""),S=iw({state:{get detail(){return y.value},set detail(x){y.value=x},get detailId(){return b.value},set detailId(x){b.value=x},get detailLoading(){return _.value},set detailLoading(x){_.value=x},get detailError(){return C.value},set detailError(x){C.value=x}},requestDetail:(x,{signal:B})=>G.get(`/api/agents/${encodeURIComponent(x)}`,{signal:B})});async function A(x){I.value="",await S.open(x.id)}function O(){S.close(),I.value=""}async function U(){await S.refresh()}async function P(x,B){try{await navigator.clipboard.writeText(B||""),I.value=x,setTimeout(()=>{I.value===x&&(I.value="")},1500)}catch{_e.error("Copy failed")}}async function T(x=!1){x=x===!0,x||(t.value=!0);try{const B=await G.get("/api/agents");e.value=Array.isArray(B)?B:[],s.value=null}catch(B){x||(s.value=B.message)}x||(t.value=!1)}async function $(x){const B=e.value.find(ce=>ce.id===x);if(await os({title:"Kill agent",message:`Kill agent "${(B==null?void 0:B.label)||x}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=x;try{await G.del(`/api/agents/${encodeURIComponent(x)}`),_e.success("Agent killed"),await T()}catch(ce){_e.error(ce.message||"Failed to kill agent")}n.value=null}}const W=lw({isEnabled:()=>a.value&&l,refreshList:()=>T(!0),hasOpenDetail:()=>!!b.value,refreshDetail:U});function K(){W.start()}function D(){W.stop()}return ls(a,()=>W.sync()),He(()=>{l=!0,T(),K()}),er(()=>{l=!0,T(!0),K()}),tr(()=>{l=!1,D()}),gt(()=>{l=!1,D(),S.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:Fa,formatDuration:Oa,progressPercent:f,hasProgress:p,displayModelText:g,displayEffortText:w,displaySourceLabel:N,detail:y,detailId:b,detailLoading:_,detailError:C,copied:I,openDetail:A,closeDetail:O,copyText:P,fetchAgents:T,killAgent:$,startAutoRefresh:K,stopAutoRefresh:D}}},ow={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=J(()=>e.value.reduce((I,L)=>I+(L.iteration_count||0),0)),d=J(()=>e.value.filter(I=>I.status==="running").length);function f(I){return I==="running"?"loop-status-running":I==="error"?"loop-status-error":"loop-status-stopped"}function p(I){return I==="running"?"badge-success":I==="error"?"badge-danger":I==="completed"?"badge-info":"badge-warning"}function v(I){return I==="act"?"badge-warning":I==="silent"?"badge-info":"badge-success"}function g(I){c.value={...c.value,[I]:!c.value[I]}}async function w(I=!1){I=I===!0,I||(t.value=!0);try{e.value=await G.get("/api/loops"),s.value=null}catch(L){I||(s.value=L.message)}I||(t.value=!1)}async function N(){l.value=null;const I=a.value;if(!I.goal.trim()){l.value="Goal is required";return}if(!I.channel_id.trim()){l.value="Channel ID is required";return}const L={goal:I.goal.trim(),channel_id:I.channel_id.trim(),interval_seconds:I.interval_seconds||60,mode:I.mode,max_iterations:I.max_iterations||50};I.stop_condition.trim()&&(L.stop_condition=I.stop_condition.trim()),i.value=!0;try{const S=await G.post("/api/loops",L);_e.success(`Loop started: ${S.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await w()}catch(S){l.value=S.message}i.value=!1}async function y(I){if(await os({title:"Stop loop",message:`Stop loop ${I}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=I;try{await G.del(`/api/loops/${encodeURIComponent(I)}`),_e.success("Loop stopped"),await w()}catch(S){_e.error(S.message||"Failed to stop loop")}r.value=null}}async function b(I){o.value=I;try{await G.post(`/api/loops/${encodeURIComponent(I)}/restart`),_e.success("Loop restarted"),await w()}catch(L){_e.error(L.message||"Failed to restart loop")}o.value=null}function _(I){I.payload&&(I.payload.loop_id||I.payload.type==="loop")&&w(!0)}let C=null;return He(()=>{w(),We.subscribe("events",_),C=setInterval(()=>{w(!0)},5e3)}),gt(()=>{We.unsubscribe("events",_),C&&clearInterval(C)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:v,formatDuration:Oa,formatAge:eg,toggleHistory:g,fetchLoops:w,doCreate:N,doStop:y,doRestart:b}}},cw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=J(()=>e.value.filter(g=>g.status==="running").length),r=J(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function u(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(w){g||(s.value=w.message)}g||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ls(n,g=>{g?d():f()});async function p(g){if(await os({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await G.del(`/api/processes/${g}`),_e.success(`Process ${g} killed`),await u()}catch(N){_e.error(N.message||"Failed to kill process")}i.value=null}}function v(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&u(!0)}return He(()=>{u(),We.subscribe("events",v),d()}),gt(()=>{We.unsubscribe("events",v),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Oa,fetchProcesses:u,doKill:p}}},uw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),v=h(null),g=h([]),w=h(!1),N=J(()=>e.value.filter(D=>D.cron&&!D.one_time).length),y=J(()=>e.value.filter(D=>D.one_time).length),b=J(()=>e.value.filter(D=>D.trigger).length),_=J(()=>e.value.filter(D=>D.paused).length),C=J(()=>e.value.filter(D=>D.consecutive_failures>0).length);function I(D){if(!D)return"-";const x=Date.now(),ue=(new Date(D).getTime()-x)/1e3;if(ue<0)return"overdue";if(ue<60)return"in < 1 min";if(ue<3600)return`in ${Math.floor(ue/60)} min`;if(ue<86400){const se=Math.floor(ue/3600),fe=Math.floor(ue%3600/60);return fe>0?`in ${se}h ${fe}m`:`in ${se}h`}const ce=Math.floor(ue/86400);return`in ${ce} day${ce!==1?"s":""}`}function L(D){return D==null?"-":D<1e3?`${D}ms`:D<6e4?`${(D/1e3).toFixed(1)}s`:Oa(D/1e3)}function S(){r.value=null}async function A(){const D=a.value.cron.trim();if(D){o.value=!0;try{r.value=await G.post("/api/schedules/validate-cron",{expression:D})}catch(x){r.value={valid:!1,error:x.message}}o.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(D){s.value=D.message}t.value=!1}async function U(D){if(v.value===D){v.value=null,g.value=[];return}v.value=D,w.value=!0,g.value=[];try{g.value=await G.get(`/api/schedules/${encodeURIComponent(D)}/history?limit=10`)}catch{g.value=[]}w.value=!1}async function P(){l.value=null;const D=a.value;if(!D.description.trim()){l.value="Description is required";return}if(!D.channel_id.trim()){l.value="Channel ID is required";return}if(!D.cron.trim()&&!D.run_at.trim()){l.value="Cron expression or run_at time is required";return}const x={description:D.description.trim(),action:D.action,channel_id:D.channel_id.trim()};if(D.cron.trim()&&(x.cron=D.cron.trim()),D.run_at.trim()&&(x.run_at=D.run_at.trim()),D.action==="reminder"&&D.message.trim()&&(x.message=D.message.trim()),D.action==="check"&&(D.tool_name.trim()&&(x.tool_name=D.tool_name.trim()),D.tool_input_str.trim()))try{x.tool_input=JSON.parse(D.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",x),_e.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await O()}catch(B){l.value=B.message}i.value=!1}async function T(D){u.value=D;try{const x=await G.post(`/api/schedules/${encodeURIComponent(D)}/run`);if(x.status==="failure")_e.error(`Execution failed: ${x.error||"unknown error"}`);else{const B=x.warning?`Executed (${x.warning})`:"Executed successfully";_e.success(B)}await O()}catch(x){_e.error(x.message||"Failed to trigger")}u.value=null}async function $(D){f.value=D.id;const x=!D.paused;try{await G.put(`/api/schedules/${encodeURIComponent(D.id)}`,{paused:x}),_e.success(x?"Schedule paused":"Schedule resumed"),await O()}catch(B){_e.error(B.message||"Failed to update schedule")}f.value=null}async function W(D){p.value=D;try{await G.post(`/api/schedules/${encodeURIComponent(D)}/reset-failures`),_e.success("Failure counters reset"),await O()}catch(x){_e.error(x.message||"Failed to reset")}p.value=null}async function K(D){const x=e.value.find(ue=>ue.id===D);if(await os({title:"Delete schedule",message:`Delete "${(x==null?void 0:x.description)||D}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=D;try{await G.del(`/api/schedules/${encodeURIComponent(D)}`),_e.success("Schedule deleted"),await O()}catch(ue){_e.error(ue.message||"Failed to delete schedule")}d.value=null}}return He(()=>{O()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:v,history:g,historyLoading:w,cronCount:N,oneTimeCount:y,webhookCount:b,pausedCount:_,failingCount:C,formatTs:Fa,formatAge:eg,formatFuture:I,formatMs:L,formatDuration:Oa,onCronInput:S,validateCron:A,toggleExpand:U,fetchSchedules:O,doCreate:P,doRunNow:T,doTogglePause:$,doResetFailures:W,doDelete:K}}},dw={components:{TabbedPage:vr},setup(){return{tabs:[{id:"live",label:"Live",component:sw},{id:"agents",label:"Agents",component:rw},{id:"loops",label:"Loops",component:ow},{id:"processes",label:"Processes",component:cw},{id:"schedules",label:"Schedules",component:uw}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},fw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await G.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return He(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Fa,formatDetail:i,truncateBlock:tg,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Kd=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],pw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),v=Kd,g=pw,w=h([]),N=h(!1),y=h(""),b=h("flat"),_=h(new Set),C=h(""),I=h(""),L=h(""),S=h(null),A=h(!1);function O(){try{const H=localStorage.getItem("odin-session-presets");H&&(w.value=JSON.parse(H))}catch{}}function U(){try{localStorage.setItem("odin-session-presets",JSON.stringify(w.value))}catch{}}const P=J(()=>d.value.trim()!==""||u.value!=="all"),T=J(()=>{let H=[...e.value];const re=Kd.find(Je=>Je.id===u.value),ye=re?re.filters:{};if(ye.source&&(H=H.filter(Je=>Je.source===ye.source)),ye.minMessages&&(H=H.filter(Je=>Je.message_count>=ye.minMessages)),ye.hasCompaction&&(H=H.filter(Je=>Je.has_summary)),ye.maxAge!=null){const Je=Date.now()/1e3;H=H.filter(dt=>dt.last_active&&Je-dt.last_active<=ye.maxAge)}if(d.value.trim()){const Je=d.value.toLowerCase().trim();H=H.filter(dt=>(dt.channel_id||"").toLowerCase().includes(Je)||(dt.last_user_id||"").toLowerCase().includes(Je)||(dt.source||"").toLowerCase().includes(Je))}const Me=f.value,Ue=p.value?1:-1;return H.sort((Je,dt)=>{const Ye=Je[Me]||0,Ke=dt[Me]||0;return(Ye-Ke)*Ue}),H}),$=J(()=>{if(!a.value||!a.value.messages)return[];const H=a.value.messages;if(H.length===0)return[];const re=[];let ye=[];for(const Me of H)Me.role==="user"&&ye.length>0&&(re.push(ye),ye=[]),ye.push(Me);return ye.length>0&&re.push(ye),re}),W=J(()=>T.value.length>0&&o.value.size===T.value.length);function K(H){const re=H.find(ye=>ye.role==="user");if(re&&re.content){const ye=re.content.slice(0,120);return ye.length<re.content.length?ye+"...":ye}return"(no user message)"}function D(H){const re=new Set(_.value);re.has(H)?re.delete(H):re.add(H),_.value=re}function x(H){u.value=H}function B(H){u.value=H.id,H.filters.searchQuery!=null&&(d.value=H.filters.searchQuery),H.filters.sortBy&&(f.value=H.filters.sortBy)}function ue(){if(!y.value.trim())return;const H={id:"custom-"+Date.now(),name:y.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};w.value=[...w.value,H],U(),N.value=!1,y.value=""}function ce(H){w.value=w.value.filter(re=>re.id!==H),U(),u.value===H&&(u.value="all")}function se(){u.value="all",d.value="",f.value="last_active",p.value=!1}function fe(H){if(!H)return"—";const re=Date.now()/1e3-H;if(re<60)return"just now";if(re<3600){const Me=Math.floor(re/60);return`${Me} minute${Me!==1?"s":""} ago`}if(re<86400){const Me=Math.floor(re/3600);return`${Me} hour${Me!==1?"s":""} ago`}const ye=Math.floor(re/86400);return`${ye} day${ye!==1?"s":""} ago`}function Q(H){if(!H)return"";try{return new Date(H*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function de(H){if(!H)return"";try{return new Date(H*1e3).toLocaleString()}catch{return""}}function Ie(H){return H==="user"?"bg-gray-900/50 border border-gray-800":H==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function j(H){return H==="user"?"sess-msg-user":H==="assistant"?"sess-msg-assistant":"sess-msg-system"}function oe(H){return H==="user"?"badge-info":H==="assistant"?"badge-success":"badge-warning"}function ie(H){return H==="user"?"sess-dot-user":H==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(H){return H==="user"?"text-cyan-400":H==="assistant"?"text-indigo-400":"text-gray-500"}function pe(H){return H?H.length>2e3?H.slice(0,2e3)+`
... (truncated)`:H:""}async function Le(){const H=C.value.trim();if(H){A.value=!0;try{let re=`/api/sessions/search?q=${encodeURIComponent(H)}&limit=50`;I.value.trim()&&(re+=`&channel_id=${encodeURIComponent(I.value.trim())}`),L.value.trim()&&(re+=`&user_id=${encodeURIComponent(L.value.trim())}`);const ye=await G.get(re);S.value=ye.results||[]}catch{S.value=[]}A.value=!1}}function m(){C.value="",I.value="",L.value="",S.value=null}function E(H){return H?H.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function M(H){return H==="user"?"fts-result-user":H==="assistant"?"fts-result-assistant":H==="summary"?"fts-result-summary":H==="fts"?"fts-result-fts":H==="channel"?"fts-result-channel":"fts-result-default"}function Z(H){return H==="user"?"badge-info":H==="assistant"?"badge-success":H==="summary"?"badge-warning":H==="fts"?"badge-success":"badge-info"}async function R(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(H){s.value=H.message}t.value=!1}function F(){s.value=null,R()}async function Y(H){if(n.value===H){n.value=null,a.value=null,_.value=new Set;return}n.value=H,a.value=null,i.value=!0,_.value=new Set;try{a.value=await G.get(`/api/sessions/${encodeURIComponent(H)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function ee(H){const re=new Set(o.value);re.has(H)?re.delete(H):re.add(H),o.value=re}function te(){W.value?o.value=new Set:o.value=new Set(T.value.map(H=>H.channel_id))}function X(H){l.value=H}async function be(){if(l.value){r.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await R()}catch(H){s.value=H.message||"Failed to clear session"}r.value=!1,l.value=null}}function le(){c.value=!0}async function ge(){if(o.value.size!==0){r.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await R()}catch(H){s.value=H.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function xe(H,re){const ye=G._token;let Me=`/api/sessions/${encodeURIComponent(H)}/export?format=${re}`;ye&&(Me+=`&token=${encodeURIComponent(ye)}`);const Ue=document.createElement("a");Ue.href=Me,Ue.download=`session-${H}.${re==="text"?"txt":"json"}`,document.body.appendChild(Ue),Ue.click(),document.body.removeChild(Ue)}let ke=null;function Ee(H){H.payload&&H.payload.channel_id&&(clearTimeout(ke),ke=setTimeout(()=>{R(),n.value&&H.payload.channel_id===n.value&&G.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(re=>{a.value=re}).catch(()=>{})},2e3))}return He(()=>{O(),R(),We.subscribe("events",Ee)}),gt(()=>{We.unsubscribe("events",Ee),clearTimeout(ke)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:W,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:v,sortOptions:g,filteredSessions:T,hasActiveFilters:P,customPresets:w,showSavePreset:N,newPresetName:y,threadView:b,threads:$,collapsedThreads:_,ftsQuery:C,ftsChannelId:I,ftsUserId:L,ftsResults:S,ftsSearching:A,formatAge:fe,formatTimestamp:Q,formatFullTimestamp:de,messageClass:Ie,threadMsgClass:j,roleBadge:oe,roleDotClass:ie,roleLabelClass:me,truncateContent:pe,threadSummary:K,fetchSessions:R,retry:F,toggleSession:Y,toggleSelect:ee,toggleSelectAll:te,confirmClear:X,clearSession:be,confirmBulkClear:le,doBulkClear:ge,exportSession:xe,applyPreset:x,applyCustomPreset:B,saveCustomPreset:ue,removeCustomPreset:ce,resetFilters:se,toggleThread:D,runFtsSearch:Le,clearFtsSearch:m,highlightSnippet:E,ftsResultClass:M,ftsTypeBadge:Z}}},gw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:P_}}},mw={components:{ContextAssemblyPanel:gw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(L){if(!L)return"—";try{const S=new Date(L);return isNaN(S.getTime())?L:S.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return L}}function f(L){return!L&&L!==0?"—":L<1e3?L+"ms":(L/1e3).toFixed(1)+"s"}function p(L){return!L&&L!==0?"—":L>=1e3?(L/1e3).toFixed(1)+"k":String(L)}function v(L){if(!L)return"";if(typeof L=="string")return L;try{return JSON.stringify(L,null,2)}catch{return String(L)}}function g(L){a.value===L?a.value=null:(a.value=L,c.value={})}function w(L,S){const A=L+"-"+S;c.value={...c.value,[A]:!c.value[A]}}function N(L,S){return!!c.value[L+"-"+S]}function y(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,C()}async function b(){try{const L=await G.get("/api/trajectories");e.value=L.files||[],o.value=L.count||0}catch{}}let _=0;async function C(){const L=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const S=await G.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(L!==_)return;let A=S.entries||[];u.value.tool_name&&(A=A.filter(O=>(O.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(A=A.filter(O=>O.is_error)),u.value.channel_id&&(A=A.filter(O=>O.channel_id===u.value.channel_id)),u.value.user_id&&(A=A.filter(O=>O.user_id===u.value.user_id)),t.value=A}else{const S=new URLSearchParams;u.value.channel_id&&S.set("channel_id",u.value.channel_id),u.value.user_id&&S.set("user_id",u.value.user_id),u.value.tool_name&&S.set("tool_name",u.value.tool_name),u.value.errors_only&&S.set("errors_only","true"),S.set("limit",String(u.value.limit));const A=S.toString(),O=await G.get(`/api/trajectories/search/query?${A}`);if(L!==_)return;t.value=O.results||[]}}catch(S){if(L!==_)return;n.value=S.message}L===_&&(s.value=!1)}async function I(){if(!l.value.trim())return;const L=++_;s.value=!0,n.value=null,c.value={};try{const S=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(L!==_)return;i.value=S.entry||null,i.value||(n.value="No trace found for this message ID")}catch(S){if(L!==_)return;S.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=S.message}L===_&&(s.value=!1)}return He(async()=>{await b(),await C()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:v,truncateBlock:tg,toggleExpand:g,toggleIteration:w,isIterationExpanded:N,clearFilters:y,fetchFiles:b,fetchTraces:C,lookupMessage:I}}},vw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=J(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await G.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return He(()=>{o(),i=setInterval(o,15e3)}),gt(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:sg,formatTime:Nc,retry:c}}},bw={components:{TabbedPage:vr},setup(){return{tabs:[{id:"audit",label:"Audit",component:fw},{id:"sessions",label:"Sessions",component:hw},{id:"traces",label:"Traces",component:mw},{id:"usage",label:"Usage",component:vw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Kr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=J(()=>e.value.filter(y=>y.is_core).length),c=J(()=>e.value.filter(y=>!y.is_core).length),u=J(()=>Object.values(a.value).reduce((y,b)=>y+b,0));function d(y){for(const b of Kr)if(b.id!=="other"&&b.match(y))return b.id;return"other"}const f=J(()=>{let y=e.value;if(n.value){const b=n.value.toLowerCase();y=y.filter(_=>_.name.toLowerCase().includes(b)||(_.description||"").toLowerCase().includes(b))}return r.value&&(y=y.filter(b=>d(b.name)===r.value)),y}),p=J(()=>{const y=new Set;for(const b of e.value)y.add(d(b.name));return Kr.filter(b=>y.has(b.id))}),v=J(()=>{const y=f.value,b={};for(const C of y){const I=d(C.name);b[I]||(b[I]=[]),b[I].push(C)}const _=[];for(const C of Kr)b[C.id]&&b[C.id].length>0&&_.push({label:C.label,icon:C.icon,tools:b[C.id].sort((I,L)=>I.name.localeCompare(L.name))});return _});function g(y){i.value={...i.value,[y]:!i.value[y]}}async function w(){t.value=!0,s.value=null;try{const[y,b]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=b||{};const _=Object.values(b||{}).filter(C=>C>0).sort((C,I)=>C-I)}catch(y){s.value=y.message}t.value=!1}function N(){w()}return He(()=>{w()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:v,usedCategories:p,truncate:Lc,toggleExpand:g,refresh:N}}};function xw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function _w(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),v=h(!1),g=h(null),w=h(null),N=h(!1),y=J(()=>e.value.length),b=J(()=>e.value.reduce((Q,de)=>Q+(de.execution_count||0),0)),_=J(()=>e.value.reduce((Q,de)=>Q+O(de.code),0)),C=J(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(de=>de.name.toLowerCase().includes(Q)||(de.description||"").toLowerCase().includes(Q))}),I=J(()=>d.value?d.value.split(`
`).length:0),L=J(()=>{const Q=Math.max(I.value,1);return Array.from({length:Q},(de,Ie)=>Ie+1).join(`
`)}),S=J(()=>{const Q=d.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function A(Q){return xw(Q)}function O(Q){return Q?Q.split(`
`).length:0}function U(Q){return _w(Q)}function P(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function T(Q){try{await navigator.clipboard.writeText(Q);const de=e.value.find(Ie=>Ie.code===Q);de&&(r.value=de.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function $(Q){if(Q.key==="Tab"){Q.preventDefault();const de=Q.target,Ie=de.selectionStart,j=de.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(j),St(()=>{de.selectionStart=de.selectionEnd=Ie+4})}}function W(Q){const de=Q.target.previousElementSibling;de&&(de.scrollTop=Q.target.scrollTop)}async function K(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function D(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const de=await G.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:de}}catch(de){a.value={...a.value,[Q]:{result:de.message,is_error:!0}}}i.value=null}function x(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function B(Q){o.value=!0,c.value="edit",u.value=Q.name,d.value=Q.code||"",f.value=null,p.value=null}function ue(){o.value=!1,f.value=null,p.value=null}async function ce(){f.value=null,p.value=null;const Q=u.value.trim(),de=d.value.trim();if(!Q){f.value="Name is required";return}if(!de){f.value="Code is required";return}v.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:Q,code:de}),p.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(Q)}`,{code:de}),p.value="Skill updated successfully"),await K(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}v.value=!1}function se(Q){w.value=Q}async function fe(){if(w.value){N.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(w.value)}`),await K()}catch{}N.value=!1,w.value=null}}return He(()=>{K()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:v,editorRef:g,deleteTarget:w,deleting:N,enabledCount:y,totalExecutions:b,totalLines:_,displayedSkills:C,editLineCount:I,editorLineNums:L,editValidation:S,highlight:A,truncate:Lc,formatTs:Fa,countLines:O,getLineNumbers:U,toggleCode:P,copyCode:T,handleEditorKey:$,syncScroll:W,fetchSkills:K,testSkill:D,showCreate:x,editSkill:B,cancelEdit:ue,saveSkill:ce,confirmDelete:se,doDelete:fe}}};function ww(e,t){if(!e||!t)return Sd(e);const s=Sd(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Sw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),v=h(null),g=h(null);let w=null;const N=h(null),y=h(!1),b=h({}),_=h({}),C=h(null),I=h(null),L=J(()=>e.value.reduce((x,B)=>x+(B.chunks||0),0)),S=J(()=>new Set(e.value.map(B=>B.uploader).filter(Boolean)).size);function A(x,B){const ue=_.value[B];if(!ue||ue.length===0)return 0;const ce=Math.max(...ue.map(se=>se.char_count||0));return ce===0?0:Math.round(x.char_count/ce*100)}async function O(){t.value=!0,s.value=null;try{const x=await G.get("/api/knowledge");e.value=Array.isArray(x)?x:[]}catch(x){s.value=x.message}t.value=!1}async function U(x){if(b.value[x]){b.value[x]=!1,I.value=null;return}if(b.value[x]=!0,!(_.value[x]||C.value===x)){C.value=x;try{const B=await G.get(`/api/knowledge/${encodeURIComponent(x)}/chunks`);_.value[x]=Array.isArray(B)?B:[]}catch(B){_.value[x]=[],_e.error(`Failed to load chunks: ${B.message}`)}C.value=null}}async function P(){const x=n.value.trim();if(x){i.value=!0,r.value=null,l.value=x;try{const B=await G.get(`/api/knowledge/search?q=${encodeURIComponent(x)}`);a.value=Array.isArray(B)?B:[]}catch(B){a.value=[],r.value=B.message||"Search failed"}i.value=!1}}function T(){a.value=null,n.value="",r.value=null}async function $(){d.value=null,f.value=null;const x=c.value.trim(),B=u.value.trim();if(!x){d.value="Source name is required";return}if(!B){d.value="Content is required";return}p.value=!0;try{const ue=await G.post("/api/knowledge",{source:x,content:B});f.value=`Ingested ${ue.chunks||0} chunks from "${x}"`,c.value="",u.value="",_.value={},await O(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(ue){d.value=ue.message}p.value=!1}async function W(x){v.value=x,g.value=null,w&&(clearTimeout(w),w=null);try{const B=await G.post(`/api/knowledge/${encodeURIComponent(x)}/reingest`);g.value={source:x,error:!1,message:`Re-ingested ${B.chunks||0} chunks`},delete _.value[x],await O(),w=setTimeout(()=>{g.value=null,w=null},3e3)}catch(B){g.value={source:x,error:!0,message:B.message}}v.value=null}function K(x){N.value=x}async function D(){if(N.value){y.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(N.value)}`),delete _.value[N.value],await O()}catch{}y.value=!1,N.value=null}}return He(()=>{O()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:v,reingestResult:g,deleteTarget:N,deleting:y,expanded:b,sourceChunks:_,loadingChunks:C,selectedChunk:I,totalChunks:L,uploaderCount:S,truncate:Lc,formatTs:Fa,highlightTerms:ww,chunkBarWidth:A,fetchSources:O,toggleSource:U,doSearch:P,clearSearch:T,doIngest:$,doReingest:W,confirmDelete:K,doDelete:D}}},Tw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),v=h(!1),g=h(null),w=h(null),N=h(new Set),y=h(null),b=h(!1),_=h(!1),C=J(()=>e.value.reduce((se,fe)=>se+fe.count,0)),I=J(()=>N.value.size);function L(se){const fe=t.value[se];if(!fe)return[];if(!l.value.trim())return fe;const Q=l.value.trim().toLowerCase();return fe.filter(de=>de.key.toLowerCase().includes(Q)||de.value&&de.value.toLowerCase().includes(Q))}function S(se,fe){return N.value.has(se+"/"+fe)}function A(se,fe){const Q=se+"/"+fe,de=new Set(N.value);de.has(Q)?de.delete(Q):de.add(Q),N.value=de}function O(se){const fe=t.value[se];return!fe||fe.length===0?!1:fe.every(Q=>N.value.has(se+"/"+Q.key))}function U(se,fe){const Q=t.value[se];if(!Q)return;const de=new Set(N.value);for(const Ie of Q){const j=se+"/"+Ie.key;fe?de.add(j):de.delete(j)}N.value=de}async function P(){s.value=!0,n.value=null;try{const se=await G.get("/api/memory");e.value=Object.entries(se).map(([fe,Q])=>({name:fe,keys:Q.keys||[],count:Q.count||0}))}catch(se){n.value=se.message}s.value=!1}async function T(se){if(a.value[se]){a.value[se]=!1;return}a.value[se]=!0;const fe=e.value.find(de=>de.name===se);if(!fe||t.value[se]||i.value===se)return;i.value=se;const Q=await Promise.all(fe.keys.map(async de=>{try{const Ie=await G.get(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`);return{key:de,value:Ie.value||""}}catch{return{key:de,value:"(error loading)"}}}));t.value[se]=Q,i.value=null}function $(se,fe,Q){f.value=se+"/"+fe,p.value=Q}async function W(se,fe){v.value=!0,g.value=null;try{await G.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`,{value:p.value});const Q=t.value[se];if(Q){const de=Q.find(Ie=>Ie.key===fe);de&&(de.value=p.value)}f.value=null}catch(Q){g.value=`Failed to save: ${Q.message||"unknown error"}`}v.value=!1}async function K(se,fe){try{await navigator.clipboard.writeText(fe.value),w.value=se+"/"+fe.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function D(){u.value=null,d.value=null;const se=o.value.scope.trim(),fe=o.value.key.trim(),Q=o.value.value.trim();if(!se){u.value="Scope is required";return}if(!fe){u.value="Key is required";return}if(!Q){u.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`,{value:Q}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(de){u.value=de.message}c.value=!1}function x(se,fe){y.value={scope:se,key:fe}}async function B(){if(!y.value)return;b.value=!0,g.value=null;const{scope:se,key:fe}=y.value;try{await G.del(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`);const Q=t.value[se];Q&&(t.value[se]=Q.filter(j=>j.key!==fe));const de=e.value.find(j=>j.name===se);de&&(de.count--,de.keys=de.keys.filter(j=>j!==fe));const Ie=new Set(N.value);Ie.delete(se+"/"+fe),N.value=Ie}catch(Q){g.value=`Failed to delete: ${Q.message||"unknown error"}`}b.value=!1,y.value=null}function ue(){_.value=!0}async function ce(){b.value=!0,g.value=null;const se=[];for(const fe of N.value){const Q=fe.indexOf("/");se.push({scope:fe.slice(0,Q),key:fe.slice(Q+1)})}try{await G.post("/api/memory/bulk-delete",{entries:se}),N.value=new Set,t.value={},await P()}catch(fe){g.value=`Bulk delete failed: ${fe.message||"unknown error"}`}b.value=!1,_.value=!1}return He(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:v,actionError:g,copied:w,selected:N,selectedCount:I,totalEntries:C,deleteTarget:y,deleting:b,showBulkDelete:_,fetchMemory:P,toggleScope:T,startEdit:$,doEdit:W,copyValue:K,doAdd:D,confirmDelete:x,doDelete:B,confirmBulkDelete:ue,doBulkDelete:ce,isSelected:S,toggleSelect:A,isScopeAllSelected:O,toggleSelectAll:U,filteredEntries:L}}},Cw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=J(()=>[...new Set(e.value.map(w=>w.category))].sort()),o=J(()=>{const g={};return e.value.forEach(w=>{g[w.category]=(g[w.category]||0)+1}),g}),c=J(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function u(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function d(g){i.value=g.key,l.value=g.content}async function f(g){try{await G.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,_e.success("Entry updated"),await v()}catch(w){_e.error(w.message||"Failed to save entry")}}async function p(g){if(await os({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(g)),_e.success("Entry deleted"),await v()}catch(N){_e.error(N.message||"Failed to delete entry")}}async function v(){s.value=!0,n.value=null;try{const g=await G.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return He(v),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:Fa,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:v}}},Ew={components:{TabbedPage:vr},setup(){return{tabs:[{id:"tools",label:"Tools",component:yw},{id:"skills",label:"Skills",component:kw},{id:"knowledge",label:"Knowledge",component:Sw},{id:"memory",label:"Memory",component:Tw},{id:"learned",label:"Learned",component:Cw}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Aw={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),v=J(()=>e.value==="custom"),g=J(()=>[...i.value,...l.value]),w=J(()=>l.value.includes(e.value)),N=J(()=>{var S;return v.value?t.value||"Odin":((S=a.value[e.value])==null?void 0:S.name)||e.value}),y=J(()=>{var S;return v.value?s.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.identity)||""}),b=J(()=>{var S;return v.value?n.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.voice)||""});async function _(){u.value=!0;try{const S=await G.get("/api/personality");e.value=S.preset||"odin",t.value=S.custom_name||"",s.value=S.custom_identity||"",n.value=S.custom_voice||"",a.value=S.presets||{},i.value=S.builtin_presets||[],l.value=S.user_presets||[]}catch(S){c.value=S.message}finally{u.value=!1}}async function C(){r.value=!0,c.value=null,o.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(S){c.value=S.message}finally{r.value=!1}}async function I(){const S=d.value.trim();if(S){p.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:S,display_name:N.value,identity:y.value,voice:b.value}),f.value=!1,d.value="",await _(),e.value=S.toLowerCase().replace(/ /g,"_")}catch(A){c.value=A.message}finally{p.value=!1}}}async function L(){if(await os({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(A){c.value=A.message}}}return He(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:v,isUserPreset:w,previewName:N,previewIdentity:y,previewVoice:b,saving:r,saved:o,error:c,loading:u,save:C,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:I,deletePreset:L,builtinPresets:i,userPresets:l}},template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=J(()=>e.value.components||[]),i=J(()=>Nw[e.value.overall]||"text-gray-400"),l=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=J(()=>{const y=e.value.overall;return y==="healthy"?"All Systems Healthy":y==="degraded"?"Some Systems Degraded":y==="unhealthy"?"System Issues Detected":"Unknown"});function o(y){return Rw[y]||"text-gray-400"}function c(y){return Iw[y]||"info"}function u(y){return y==="ok"?"badge-success":y==="degraded"?"badge-warning":y==="down"?"badge-danger":"badge-info"}function d(y){return y==="closed"?"text-green-400":y==="half_open"?"text-yellow-400":y==="open"?"text-red-400":"text-gray-400"}function f(y){return y.replace(/_/g," ").replace(/\b\w/g,b=>b.toUpperCase())}function p(y){if(!y)return"—";try{return new Date(y).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return y}}function v(y){return y>=1e6?(y/1e6).toFixed(1)+"M":y>=1e3?(y/1e3).toFixed(1)+"K":String(y)}async function g(){n.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null}catch(y){s.value=y.message}finally{t.value=!1,n.value=!1}}function w(){t.value=!0,s.value=null,g()}let N=null;return He(async()=>{await g(),N=setInterval(g,3e4)}),gt(()=>{N&&clearInterval(N)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:v,fetchHealth:g,retry:w}}},Ow={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=J(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=J(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await G.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return He(()=>{c(),i=setInterval(c,3e4)}),gt(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:sg,refresh:u,retry:d}}},Dw=["INFO","WARNING","ERROR"],Mw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Gr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Pw=[50,100,200,500],Fw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(We.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,v=Dw,g=Mw,w=Gr,N=h("all"),y=h(""),b=h([]),_=h(!1),C=h(""),I=h([]);function L(){try{const V=localStorage.getItem("odin-log-presets");V&&(b.value=JSON.parse(V))}catch{}}function S(){try{localStorage.setItem("odin-log-presets",JSON.stringify(b.value))}catch{}}const A=J(()=>a.value!==""||i.value.trim()!==""||y.value!==""),O=J(()=>{const V=Gr.find(ne=>ne.value===y.value);return V?V.label:""}),U=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),P=24,T=J(()=>{if(t.value.length===0)return[];const V=[],ne=new Date,Te=3600*1e3;for(let Xe=P-1;Xe>=0;Xe--){const rt=new Date(ne.getTime()-(Xe+1)*Te),Zt=new Date(ne.getTime()-Xe*Te);V.push({start:rt,end:Zt,label:D(rt,Zt),shortLabel:Zt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Xe of t.value){if(!Xe._time)continue;const rt=Xe._time.getTime();for(const Zt of V)if(rt>=Zt.start.getTime()&&rt<Zt.end.getTime()){Zt.total++,Xe.level==="ERROR"?Zt.errors++:Xe.level==="WARNING"?Zt.warnings++:Zt.info++;break}}return V}),$=J(()=>{let V=1;for(const ne of T.value)ne.total>V&&(V=ne.total);return V}),W=J(()=>T.value.length===0?"":"Last 24 hours"),K=J(()=>Math.ceil(P/8));function D(V,ne){const Te={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],Te)+" - "+ne.toLocaleTimeString([],Te)}function x(V,ne){return!ne||!V?"0px":Math.max(2,V/ne*100)+"%"}function B(V){const ne=ue.value.findIndex(Te=>Te._time&&Te._time.getTime()>=V.start.getTime()&&Te._time.getTime()<V.end.getTime());if(ne>=0&&u.value){const Te=u.value.querySelectorAll(".log-line");Te[ne]&&(Te[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const ue=J(()=>{let V=t.value;if(a.value&&(V=V.filter(ne=>(ne.level||"INFO")===a.value)),y.value){const ne=Gr.find(Te=>Te.value===y.value);if(ne&&ne.seconds){const Te=new Date(Date.now()-ne.seconds*1e3);V=V.filter(Xe=>Xe._time&&Xe._time>=Te)}}if(i.value&&!U.value)if(l.value)try{const ne=new RegExp(i.value,"i");V=V.filter(Te=>{const Xe=Te.text||Te.raw||"",rt=Te.tool||"";return ne.test(Xe)||ne.test(rt)})}catch{}else{const ne=i.value.toLowerCase();V=V.filter(Te=>{const Xe=(Te.text||Te.raw||"").toLowerCase(),rt=(Te.tool||"").toLowerCase();return Xe.includes(ne)||rt.includes(ne)})}return V});function ce(V){if(V.type==="log"&&V.line)try{const ne=typeof V.line=="string"?JSON.parse(V.line):V.line,Te=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Te.toLocaleTimeString(),_time:Te,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const ne=V.payload,Te=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Te.toLocaleTimeString(),_time:Te,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function se(V){const ne=ce(V);if(s.value){I.value.push(ne);return}fe(ne)}function fe(V){t.value.push(V),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&St(()=>Q())}function Q(V=!1){const ne=u.value;ne&&ne.scrollTo({top:ne.scrollHeight,behavior:V?"smooth":"instant"})}function de(){n.value=!0,d.value=!1,St(()=>Q(!0))}const Ie=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function j(){const V=u.value;if(!V)return;const ne=V.scrollHeight-V.scrollTop-V.clientHeight<40;d.value=!n.value&&!ne&&t.value.length>0,pe.value&&oe()}function oe(){const V=u.value;!V||!n.value||V.scrollHeight-V.scrollTop-V.clientHeight>=40&&(n.value=!1,d.value=t.value.length>0)}function ie(){n.value&&requestAnimationFrame(oe)}function me(V){Ie.has(V.key)&&ie()}const pe=h(!1);function Le(){n.value&&(pe.value=!0,requestAnimationFrame(oe))}function m(){pe.value&&(pe.value=!1,oe())}function E(){n.value&&(d.value=!1,St(()=>Q()))}function M(){if(s.value=!s.value,!s.value&&I.value.length>0){for(const V of I.value)fe(V);I.value=[]}}function Z(){t.value=[],I.value=[],d.value=!1}function R(){let V;e.value==="search"?V=Wt.value.map(rt=>{const Zt=rt.error?"ERROR":"INFO",ns=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Zt} ${ns}${rt.result_summary||rt.message||""}`}).join(`
`):V=ue.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const ne=new Blob([V],{type:"text/plain"}),Te=URL.createObjectURL(ne),Xe=document.createElement("a");Xe.href=Te,Xe.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Xe.click(),URL.revokeObjectURL(Te)}function F(V,ne){const Te=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(Te).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function Y(V){a.value=a.value===V?"":V,N.value="all"}function ee(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function te(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function X(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function be(V){N.value=V.id;const ne=V.filters;a.value=ne.level||"",y.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function le(V){N.value=V.id,a.value=V.filters.level||"",y.value=V.filters.timeRange||"",i.value=V.filters.text||""}function ge(){if(!C.value.trim())return;const V={id:"custom-"+Date.now(),name:C.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};b.value=[...b.value,V],S(),_.value=!1,C.value=""}function xe(V){b.value=b.value.filter(ne=>ne.id!==V),S(),N.value===V&&(N.value="all")}const ke=h("all"),Ee=h(""),H=h(""),re=h(""),ye=h(""),Me=h(""),Ue=h(100),Je=Pw,dt=h(!1),Ye=h(!1),Ke=h(""),Wt=h([]),bs=h(null),Ts=h(null);function Cn(){e.value="search",bs.value||Qn()}async function Qn(){try{bs.value=await G.get("/api/logs/stats")}catch{}}function cn(){const V=Me.value;if(!V){re.value="",ye.value="";return}const Te={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(Te){const Xe=new Date(Date.now()-Te*1e3);re.value=un(Xe),ye.value=""}}function un(V){const ne=Te=>String(Te).padStart(2,"0");return`${V.getFullYear()}-${ne(V.getMonth()+1)}-${ne(V.getDate())}T${ne(V.getHours())}:${ne(V.getMinutes())}`}function z(V){if(!V)return"";const ne=new Date(V);return isNaN(ne.getTime())?"":ne.toISOString()}async function Se(){dt.value=!0,Ke.value="",Ye.value=!0,Ts.value=null;try{const V=new URLSearchParams;ke.value&&ke.value!=="all"&&V.set("level",ke.value),Ee.value&&V.set("tool",Ee.value),H.value&&V.set("q",H.value);const ne=z(re.value),Te=z(ye.value);ne&&V.set("start",ne),Te&&V.set("end",Te),V.set("limit",String(Ue.value));const Xe=await G.get(`/api/logs/search?${V.toString()}`);Wt.value=Xe.entries||[]}catch(V){Ke.value=V.message||"Search failed",Wt.value=[]}finally{dt.value=!1}}function Cs(){ke.value="all",Ee.value="",H.value="",re.value="",ye.value="",Me.value="",Ue.value=100,Wt.value=[],Ye.value=!1,Ke.value="",Ts.value=null}function En(V){Ts.value=Ts.value===V?null:V}function br(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function $a(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function Ua(V){return V.error?"log-line-error":"text-gray-300"}function yr(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let ys=null,Xn=null,ea=!1;function it(){ea||(ea=!0,We.subscribe("logs",se),r.value=We.connected,o.value=We.state||"disconnected",ys=We.onStateChange,Xn=(V,ne)=>{o.value=V,r.value=V==="connected",ys&&ys(V,ne)},We.onStateChange=Xn)}function Fs(){ea&&(ea=!1,We.unsubscribe("logs",se),We.onStateChange===Xn&&(We.onStateChange=ys),Xn=null,ys=null)}return He(()=>{L(),window.addEventListener("pointerup",m),window.addEventListener("pointercancel",m)}),er(it),tr(Fs),gt(()=>{Fs(),window.removeEventListener("pointerup",m),window.removeEventListener("pointercancel",m)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:ue,pauseBuffer:I,showJumpBottom:d,copiedIndex:f,regexError:U,levels:v,logPresets:g,timeRanges:w,timeRange:y,activeLogPreset:N,customLogPresets:b,showSaveLogPreset:_,newLogPresetName:C,hasActiveLogFilters:A,timeRangeLabel:O,timelineBuckets:T,timelineMax:$,timelineSpanLabel:W,timelineLabelSkip:K,togglePause:M,clearLogs:Z,exportLogs:R,logLineClass:ee,levelClass:te,levelChipClass:X,toggleLevel:Y,copyLine:F,jumpToBottom:de,onScroll:j,onUserScrollIntent:ie,onUserScrollKey:me,onAutoScrollToggle:E,onPointerDown:Le,applyLogPreset:be,applyCustomLogPreset:le,saveLogCustomPreset:ge,removeLogCustomPreset:xe,segmentHeight:x,jumpToTimelineBucket:B,searchLevel:ke,searchTool:Ee,searchKeyword:H,searchStart:re,searchEnd:ye,searchTimePreset:Me,searchLimit:Ue,searchLimits:Je,searching:dt,searchRan:Ye,searchError:Ke,searchResults:Wt,searchStats:bs,expandedSearch:Ts,switchToSearch:Cn,runSearch:Se,clearSearchFilters:Cs,toggleSearchExpand:En,formatSearchTs:br,searchEntryText:$a,searchLogLineClass:Ua,formatJson:yr,applySearchTimePreset:cn}}},$w=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Uw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Bw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1–128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},Wr=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"database",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"server",sections:["tools"]},{key:"ui",label:"Web UI",icon:"globe",sections:["web"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"puzzle",sections:["issue_tracker"]}],bg="••••••••",Hw=50;function Vw(e){return $w.has(e)}function jw(e){return e===bg}function sl(e){return JSON.parse(JSON.stringify(e))}function Vn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function zw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Vn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Vn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function qw(e,t,s){const n=Bw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Gd(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Vn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Vn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Kw={template:`
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=J(()=>d.value.length>0),v=J(()=>f.value.length>0),g=J(()=>r.value&&t.value?t.value:e.value),w=J(()=>!e.value||!t.value?!1:!Vn(e.value,t.value)),N=J(()=>!e.value||!t.value?0:Gd(e.value,t.value).length),y=J(()=>{if(!r.value||!t.value)return{};const R={};for(const F of Object.keys(t.value)){const Y=t.value[F];if(typeof Y=="object"&&Y!==null&&!Array.isArray(Y))for(const ee of Object.keys(Y)){const te=qw(F,ee,Y[ee]);te&&(R[F+"."+ee]=te)}}return R}),b=J(()=>Object.keys(y.value).length>0),_=J(()=>e.value?Object.keys(e.value).length:0),C=J(()=>L.value.length),I=J(()=>!e.value||!t.value?[]:Gd(e.value,t.value)),L=J(()=>e.value?Wr.map(R=>({...R,sections:R.sections.filter(F=>F in e.value)})).filter(R=>R.sections.length>0):[]),S=J(()=>{if(!e.value)return[];const R=new Set(Wr.flatMap(F=>F.sections));return Object.keys(e.value).filter(F=>!R.has(F))});function A(R){return g.value?g.value[R]:null}function O(R){return!e.value||!t.value?!1:!Vn(e.value[R],t.value[R])}function U(R){return R.sections.some(F=>O(F))}function P(R,F){if(!e.value||!t.value)return!1;const Y=e.value[R],ee=t.value[R];return!Y||!ee?!1:!Vn(Y[F],ee[F])}function T(R){return t.value?t.value[R]:e.value[R]}function $(R,F){const Y=t.value||e.value;return Y[R]?Y[R][F]:void 0}function W(R,F){const Y=r.value&&t.value?t.value:e.value;return Y[R]?Y[R][F]:!1}function K(R,F){return y.value[R+"."+F]||null}function D(R,F){return Uw[R+"."+F]||null}function x(R,F,Y){t.value&&(F===null?t.value[R]=Y:(t.value[R]||(t.value[R]={}),t.value[R][F]=Y),t.value={...t.value})}function B(R,F,Y){if(!t.value)return;const ee=sl(t.value);x(R,F,Y),d.value.push(ee),d.value.length>Hw&&d.value.shift(),f.value=[]}function ue(R,F,Y){try{const ee=JSON.parse(Y);B(R,F,ee)}catch{}}function ce(){d.value.length!==0&&(f.value.push(sl(t.value)),t.value=d.value.pop())}function se(){f.value.length!==0&&(d.value.push(sl(t.value)),t.value=f.value.pop())}function fe(R,F,Y){if(!t.value||!t.value[R])return;const ee=[...t.value[R][F]];ee.splice(Y,1),B(R,F,ee)}function Q(R,F){if(!t.value||!t.value[R])return;const Y=[...t.value[R][F]||[]],ee=prompt("Enter new value:");ee!==null&&(Y.push(ee),B(R,F,Y))}function de(R){a.value={...a.value,[R]:!a.value[R]}}function Ie(R){l.value={...l.value,[R]:!l.value[R]}}function j(R){i.value={...i.value,[R]:!i.value[R]}}function oe(R){try{return JSON.stringify(R,null,2)}catch{return String(R)}}function ie(R){return R==null?"null":typeof R=="object"?JSON.stringify(R,null,2):String(R)}function me(R,F){c.value={type:R,message:F},setTimeout(()=>{c.value=null},3e3)}function pe(){t.value=sl(e.value),r.value=!0,d.value=[],f.value=[]}function Le(){r.value=!1,t.value=null,d.value=[],f.value=[]}function m(){u.value=!0}async function E(){if(!(!w.value||b.value)){o.value=!0;try{const R=zw(e.value,t.value);if(Object.keys(R).length===0){me("success","No changes to save."),o.value=!1;return}const F=await G.put("/api/config",R);e.value=F,r.value=!1,t.value=null,d.value=[],f.value=[],me("success","Config saved successfully.")}catch(R){me("error",R.message||"Failed to save config")}o.value=!1}}async function M(){s.value=!0,n.value=null;try{e.value=await G.get("/api/config");for(const R of Object.keys(e.value))a.value[R]===void 0&&(a.value[R]=!0);for(const R of Wr)l.value[R.key]===void 0&&(l.value[R.key]=!0)}catch(R){n.value=R.message}s.value=!1}function Z(R){if(!r.value)return;const F=R.target;F instanceof HTMLElement&&(F.matches("input, textarea, select")||F.isContentEditable)||((R.ctrlKey||R.metaKey)&&!R.shiftKey&&R.key.toLowerCase()==="z"?(R.preventDefault(),ce()):(R.ctrlKey||R.metaKey)&&(R.key==="y"||R.shiftKey&&R.key==="z"||R.shiftKey&&R.key==="Z")&&(R.preventDefault(),se()))}return He(()=>{M(),document.addEventListener("keydown",Z)}),gt(()=>{document.removeEventListener("keydown",Z)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:w,hasErrors:b,changeCount:N,REDACTED:bg,showDiffModal:u,diffEntries:I,canUndo:p,canRedo:v,sectionCount:_,groupCount:C,visibleGroups:L,ungroupedSections:S,validationErrors:y,isSensitiveKey:Vw,isRedacted:jw,sectionChanged:O,groupChanged:U,fieldChanged:P,getDisplay:A,getEdited:T,getEditedField:$,getDisplayBool:W,pushEdit:B,pushEditJson:ue,getValidationError:K,getEnumOptions:D,removeArrayItem:fe,addArrayItem:Q,toggleSection:de,toggleGroup:Ie,toggleNested:j,formatJson:oe,formatDiffVal:ie,showToast:me,showDiff:m,fetchConfig:M,startEdit:pe,cancelEdit:Le,saveConfig:E,undo:ce,redo:se}}},Gw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await G.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,v,g){try{await G.put("/api/discord/guild/"+p+"/config",{[v]:g}),await c()}catch(w){s.value=w.message}}async function d(p,v,g,w){try{await G.put("/api/discord/channel/"+p+"/config",{[g]:w}),await c()}catch(N){s.value=N.message}}async function f(p,v){try{await G.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return He(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},Ww={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=J(()=>{const x={};for(const B of u.value)x[B.id]=B;return x});function p(x){return f.value[x]||null}const v=J(()=>/^\d{15,25}$/.test(r.value.trim())),g=J(()=>{if(o.value){if(w.value[c.value])return"host-user-option-"+c.value;if(v.value)return"host-user-option-raw"}}),w=J(()=>{const x=r.value.toLowerCase().trim();return x?u.value.filter(B=>!i.value[B.id]&&(B.display_name.toLowerCase().includes(x)||B.username.toLowerCase().includes(x)||B.id.includes(x))):u.value.filter(B=>!i.value[B.id])});function N(x,B){return x?x.allowed_hosts===null||x.allowed_hosts===void 0?{allowed_hosts:[...B],default_host:x.default_host||"",allow_all:!0}:{allowed_hosts:x.allowed_hosts,default_host:x.default_host||"",allow_all:!1}:{allowed_hosts:[...B],default_host:B[0]||"",allow_all:!0}}async function y(){e.value=!0,t.value="";try{const x=await G.get("/api/host-access");s.value=x,n.value=x.available_hosts||[],a.value=N(x.default_policy,n.value);const B=x.users||{},ue={};for(const[ce,se]of Object.entries(B))ue[ce]=N(se,n.value);i.value=ue}catch(x){t.value=x.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await G.get("/api/discord/members")||[]}catch{u.value=[]}}async function b(){try{const x=a.value.allow_all?null:a.value.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:x,default_host:a.value.default_host}),_e.success("Default policy updated")}catch(x){_e.error(x.message||"Failed to save")}}function _(x,B){a.value.allow_all=!1,B?a.value.allowed_hosts.includes(x)||a.value.allowed_hosts.push(x):(a.value.allowed_hosts=a.value.allowed_hosts.filter(ue=>ue!==x),a.value.default_host===x&&(a.value.default_host=a.value.allowed_hosts[0]||"")),b()}async function C(x){const B=i.value[x];if(B)try{const ue=B.allow_all?null:B.allowed_hosts;await G.put(`/api/host-access/user/${x}`,{allowed_hosts:ue,default_host:B.default_host});const ce=p(x);_e.success(`Updated access for ${ce?ce.display_name:x}`)}catch(ue){_e.error(ue.message||"Failed to save")}}function I(x,B,ue){const ce=i.value[x];ce&&(ce.allow_all=!1,ue?ce.allowed_hosts.includes(B)||ce.allowed_hosts.push(B):(ce.allowed_hosts=ce.allowed_hosts.filter(se=>se!==B),ce.default_host===B&&(ce.default_host=ce.allowed_hosts[0]||"")),C(x))}function L(x,B){const ue=i.value[x];ue&&(ue.default_host=B,C(x))}function S(){l.value=!0,r.value="",c.value=0,St(()=>{d.value&&d.value.focus()})}function A(){o.value=!0,c.value=0}function O(){c.value<w.value.length-1&&c.value++}function U(){c.value>0&&c.value--}function P(){const x=w.value[c.value];if(x){$(x);return}v.value&&T()}function T(){const x=r.value.trim();/^\d{15,25}$/.test(x)&&(i.value[x]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},C(x),r.value="",o.value=!1,l.value=!1)}function $(x){i.value[x.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},C(x.id),r.value="",o.value=!1,l.value=!1}function W(){o.value=!1}function K(){setTimeout(()=>{o.value=!1},150)}async function D(x){const B=p(x);if(await os({title:"Remove user override",message:`Remove the host access override for ${B?B.display_name:x}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await G.del(`/api/host-access/user/${x}`),delete i.value[x],_e.success(`Removed override for ${B?B.display_name:x}`)}catch(ce){_e.error(ce.message||"Failed to delete")}}return He(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:w,isRawId:v,activeOptionId:g,searchInput:d,fetchData:y,saveDefaultPolicy:b,toggleDefaultHost:_,getMember:p,toggleUserHost:I,setUserDefault:L,openAddUser:S,deleteUser:D,onSearchInput:A,highlightNext:O,highlightPrev:U,selectHighlighted:P,selectMember:$,closeDropdown:W,onBlur:K,addRawId:T}}},Zw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=J(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(S){return S==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":S==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function v(){e.value=!0,t.value="";try{const S=await G.get("/api/tokens");s.value=S.tokens||[],n.value=S.available_hosts||[]}catch(S){t.value=S.message||"Failed to load tokens"}finally{e.value=!1}}function g(S){return!S||!S.trim()?[]:S.split(",").map(A=>A.trim()).filter(Boolean)}function w(S,A){const O=c.value.allowed_hosts;if(A&&!O.includes(S)&&O.push(S),!A){const U=O.indexOf(S);U>=0&&O.splice(U,1)}}function N(S,A){const O=u.value.allowed_hosts;if(A&&!O.includes(S)&&O.push(S),!A){const U=O.indexOf(S);U>=0&&O.splice(U,1)}}async function y(){var S;i.value=!0;try{const A=g(c.value.allowed_tools_str),O=c.value.host_mode,U=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:A.length?A:[]};U!==null&&(P.allowed_hosts=U),P.default_host=c.value.default_host||"";const T=await G.post("/api/tokens",P);l.value=T.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,_e.success("Token created"),await v()}catch(A){_e.error(((S=A.data)==null?void 0:S.error)||A.message||"Failed to create token")}finally{i.value=!1}}function b(S){r.value=S;const A=S.allowed_hosts;let O="default";A==null?O="default":Array.isArray(A)&&A.length===0?O="none":Array.isArray(A)&&(O="select"),u.value={username:S.username||"",tier:S.tier||"admin",label:S.label||"",host_mode:O,allowed_hosts:Array.isArray(A)?[...A]:[],default_host:S.default_host||"",allowed_tools_str:(S.allowed_tools||[]).join(", ")}}async function _(){var S;if(r.value){o.value=!0;try{const A=g(u.value.allowed_tools_str),O=u.value.host_mode,U={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:A};O==="none"?U.allowed_hosts=[]:O==="select"?U.allowed_hosts=u.value.allowed_hosts:U.allowed_hosts=null,U.default_host=u.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(r.value.user_id),U),r.value=null,_e.success("Token updated"),await v()}catch(A){_e.error(((S=A.data)==null?void 0:S.error)||A.message||"Failed to update")}finally{o.value=!1}}}async function C(S){var O;if(await os({title:"Regenerate token",message:`Regenerate token for ${S.username||S.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await G.post("/api/tokens/"+encodeURIComponent(S.user_id)+"/regenerate");l.value=U.token,_e.success("Token regenerated")}catch(U){_e.error(((O=U.data)==null?void 0:O.error)||U.message||"Failed to regenerate")}}async function I(S){var O;if(await os({title:"Delete token",message:`Delete token for ${S.username||S.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(S.user_id)),_e.success("Token deleted"),await v()}catch(U){_e.error(((O=U.data)==null?void 0:O.error)||U.message||"Failed to delete")}}async function L(){if(l.value)try{await navigator.clipboard.writeText(l.value),_e.success("Copied to clipboard")}catch{_e.error("Copy failed — select and copy manually")}}return He(v),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:v,tierBadge:p,toggleCreateHost:w,toggleEditHost:N,createToken:y,startEdit:b,saveEdit:_,confirmRegenerate:C,confirmDelete:I,copyToken:L}}};function nl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Jw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=J(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=J(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=J(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=J(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),u=J(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),d=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&u.value),f=z=>r.includes(z)&&u.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),v=h({unavailable_reason:null}),g=J(()=>{const z=p.value.model;return z&&!a.includes(z)?[z,...a]:a});function w(z){const Se=z.target.value;p.value.enabled=Se!=="",Se!==""&&(p.value.model=Se),ye()}const N=h(!1),y=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),b=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),_=h(!1),C=h(!1),I=h(!1),L=h(!1),S=h(!1),A=h(!1),O=h(!1),U=h({configured:!1}),P=h([]),T=h(""),$=h(!1),W=h(!1),K=h({configured:!1}),D=h([]),x=h(""),B=h(!1),ue=h(!1),ce=h(!0),se=h(""),fe=h({configured:!1,accounts:[]}),Q=h(null),de=h(null),Ie=h(""),j=h(null),oe=h(!1),ie=h(null),me=h(null),pe=h("");let Le=null;function m(z,Se="success"){_e(z,Se==="error"?"error":"success")}function E(z){if(!z)return"?";const Se=z/(1024*1024*1024);return Se>=1?Se.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}async function M(){e.value=!0,await Promise.all([Z(),R(),be(),F()]),e.value=!1}async function Z(){try{const z=await G.get("/api/llm/status");t.value=z,s.value=z.active_provider||"codex",z.codex&&!re.pending()&&(n.value.enabled=z.codex.enabled,n.value.model=z.codex.model||"gpt-5.5",n.value.reasoning_effort=z.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=z.codex.agent_reasoning_effort||"",n.value.agent_model=z.codex.agent_model||"",n.value.max_tokens=z.codex.max_tokens||4096),z.ollama&&!Me.pending()&&(y.value.enabled=z.ollama.enabled,y.value.base_url=z.ollama.base_url||"",y.value.model=z.ollama.model||"",y.value.max_tokens=z.ollama.max_tokens||4096),z.kimi&&!Ue.pending()&&(b.value.enabled=z.kimi.enabled,b.value.model=z.kimi.model||"",b.value.max_tokens=z.kimi.max_tokens||4096),z.auxiliary&&(v.value=z.auxiliary,ye.pending()||(p.value.enabled=z.auxiliary.enabled,p.value.model=z.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function R(){try{if(U.value=await G.get("/api/ollama/status"),U.value.model&&(T.value=U.value.model),U.value.configured)try{const z=await G.get("/api/ollama/models");P.value=z.models||[]}catch{P.value=[]}else if(y.value.base_url)try{const z=await G.post("/api/ollama/probe-models",{base_url:y.value.base_url});P.value=z.models||[]}catch{P.value=[]}}catch{U.value={configured:!1}}}async function F(){ce.value=!0,se.value="";try{fe.value=await G.get("/api/codex/status")}catch(z){se.value=z.message||"Failed to fetch Codex status"}finally{ce.value=!1}}async function Y(){const z=t.value?t.value.active_provider:"codex";O.value=!0;try{const Se=await G.post("/api/llm/switch",{provider:s.value});Se.error?(s.value=z,m(Se.error,"error")):(m("Switched to "+s.value+" ("+Se.model+")"),await M())}catch(Se){s.value=z,m(Se.message||"Switch failed","error")}finally{O.value=!1}}async function ee(){$.value=!0;try{const z=await G.post("/api/ollama/reload");m(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await M()}catch(z){m(z.message||"Reload failed","error")}finally{$.value=!1}}async function te(){W.value=!0;try{await G.post("/api/ollama/model",{model:T.value}),m("Model set to "+T.value),await M()}catch(z){m(z.message||"Failed","error")}finally{W.value=!1}}async function X(){const z=y.value.base_url;if(!z){m("Enter a base URL first","error");return}A.value=!0;try{const Se=await G.post("/api/ollama/probe-models",{base_url:z});P.value=Se.models||[],P.value.length?(m(P.value.length+" model(s) found"),!y.value.model&&P.value.length&&(y.value.model=P.value[0].name)):m("No models found at "+z,"error")}catch(Se){m(Se.message||"Could not reach Ollama","error")}finally{A.value=!1}}async function be(){try{if(K.value=await G.get("/api/kimi/status"),K.value.model&&(x.value=K.value.model),K.value.configured)try{const z=await G.get("/api/kimi/models");D.value=z.models||[]}catch{D.value=[]}}catch{K.value={configured:!1}}}async function le(){B.value=!0;try{const z=await G.post("/api/kimi/reload");m(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await M()}catch(z){m(z.message||"Reload failed","error")}finally{B.value=!1}}async function ge(){ue.value=!0;try{await G.post("/api/kimi/model",{model:x.value}),m("Model set to "+x.value),await M()}catch(z){m(z.message||"Failed","error")}finally{ue.value=!1}}async function xe(){if(I.value){re();return}I.value=!0;try{await G.put("/api/llm/codex/config",n.value),m("Codex config saved"),await Promise.all([Z(),F()])}catch(z){m(z.message||"Failed","error"),await Promise.all([Z(),F()])}finally{I.value=!1}}async function ke(){if(L.value){Me();return}L.value=!0;try{const z={...y.value},Se=_.value?y.value.api_key:null;Se===null&&delete z.api_key,await G.put("/api/llm/ollama/config",z),m("Ollama config saved"),Se!==null&&y.value.api_key===Se&&(y.value.api_key="",_.value=!1),await Promise.all([Z(),R()])}catch(z){m(z.message||"Failed","error")}finally{L.value=!1}}async function Ee(){if(S.value){Ue();return}S.value=!0;try{const z={...b.value},Se=C.value?b.value.api_key:null;Se===null&&delete z.api_key,await G.put("/api/llm/kimi/config",z),m("Kimi config saved"),Se!==null&&b.value.api_key===Se&&(b.value.api_key="",C.value=!1),await Promise.all([Z(),be()])}catch(z){m(z.message||"Failed","error")}finally{S.value=!1}}async function H(){if(N.value){ye();return}N.value=!0;try{await G.put("/api/llm/auxiliary/config",p.value),m("Auxiliary config saved"),await Z()}catch(z){m(z.message||"Failed","error"),await Z()}finally{N.value=!1}}const re=nl(xe),ye=nl(H),Me=nl(ke),Ue=nl(Ee),Je=()=>(re.cancel(),xe()),dt=()=>(Me.cancel(),ke()),Ye=()=>(Ue.cancel(),Ee());async function Ke(z){try{await G.post("/api/codex/account/"+z+"/activate"),m("Active account switched"),await F()}catch(Se){m(Se.message||"Failed","error")}}async function Wt(z){Q.value=z;try{await G.post("/api/codex/account/"+z+"/refresh"),m("Token refreshed"),await F()}catch(Se){m(Se.message||"Refresh failed","error")}finally{Q.value=null}}function bs(z,Se){de.value=z,Ie.value=Se||""}async function Ts(z){try{await G.put("/api/codex/account/"+z+"/label",{label:Ie.value}),m("Label updated"),de.value=null,await F()}catch(Se){m(Se.message||"Failed","error")}}async function Cn(z,Se){if(await os({title:"Delete Codex account",message:`Delete ${Se||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+z),m("Deleted. Pool reloaded."),await F()}catch(En){m(En.message||"Failed","error")}}async function Qn(){oe.value=!0;try{const z=await G.post("/api/codex/device-code");ie.value=z,j.value="pending",cn(z)}catch(z){m(z.message||"Failed","error")}finally{oe.value=!1}}async function cn(z){Le={cancelled:!1};const Se=Le;try{const Cs=await G.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(Se.cancelled)return;me.value=Cs,j.value="success",await M()}catch(Cs){if(Se.cancelled)return;pe.value=Cs.message||"Device login failed",j.value="error"}}function un(){Le&&(Le.cancelled=!0),j.value=null,ie.value=null}return He(M),gt(()=>{Le&&(Le.cancelled=!0),re.cancel(),ye.cancel(),Me.cancel(),Ue.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:O,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:d,agentModelOptionDisabled:f,auxForm:p,auxData:v,auxModelOptions:g,onAuxModelChange:w,savingAux:N,saveAuxConfigDebounced:ye,ollamaForm:y,kimiForm:b,savingCodex:I,savingOllama:L,savingKimi:S,probingOllama:A,ollamaKeyDirty:_,kimiKeyDirty:C,ollamaStatus:U,ollamaModels:P,ollamaSelectedModel:T,reloading:$,settingModel:W,kimiStatus:K,kimiModels:D,kimiSelectedModel:x,reloadingKimi:B,settingKimiModel:ue,codexLoading:ce,codexError:se,codexData:fe,refreshing:Q,editingLabel:de,labelValue:Ie,deviceState:j,deviceLoading:oe,deviceInfo:ie,deviceResult:me,deviceError:pe,fetchAll:M,switchProvider:Y,reloadOllama:ee,setOllamaModel:te,reloadKimi:le,setKimiModel:ge,probeOllamaModels:X,saveCodexConfig:xe,saveOllamaConfig:ke,saveKimiConfig:Ee,saveCodexConfigDebounced:re,saveOllamaConfigDebounced:Me,saveKimiConfigDebounced:Ue,saveCodexConfigNow:Je,saveOllamaConfigNow:dt,saveKimiConfigNow:Ye,activateAccount:Ke,refreshAccount:Wt,startEditLabel:bs,saveLabel:Ts,deleteAccount:Cn,startDeviceLogin:Qn,cancelDeviceLogin:un,formatSize:E}}},Wd={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Yw(e){return Wd[e]||Wd[(e||"").toLowerCase()]||"text-gray-400"}const Qw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null);let u=null;async function d(){const f=await Promise.allSettled([G.get("/api/startup/diagnostics"),G.get("/api/subsystems/status"),G.get("/api/pools/ssh"),G.get("/api/pools/http"),G.get("/api/risk/stats"),G.get("/api/recovery/stats"),G.get("/api/compression/stats"),G.get("/api/freshness/stats"),G.get("/api/governor/stats")]),p=g=>f[g].status==="fulfilled"?f[g].value:null;t.value=p(0)||{};const v=p(1);s.value=Array.isArray(v)?v:v&&v.subsystems||[],n.value=p(2)||{},a.value=p(3)||{},i.value=p(4),l.value=p(5),r.value=p(6),o.value=p(7),c.value=p(8),e.value=!1}return He(()=>{d(),u=setInterval(d,3e4)}),gt(()=>{u&&clearInterval(u)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Yw,formatTime:Nc}}},Xw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await G.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await os({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return He(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},e1={components:{TabbedPage:vr},setup(){return{tabs:[{id:"health",label:"Health",component:Lw},{id:"resources",label:"Resources",component:Ow},{id:"logs",label:"Logs",component:Fw},{id:"config",label:"Config",component:Kw},{id:"discord",label:"Discord",component:Gw},{id:"host-access",label:"Host Access",component:Ww},{id:"api-tokens",label:"API Tokens",component:Zw},{id:"llm",label:"LLM Config",component:Jw},{id:"internals",label:"Internals",component:Qw},{id:"update",label:"Update",component:Xw}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},mt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),yg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:F_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:tw,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:dw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:bw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ew,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:Aw,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:e1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:mt("/operations","live")},{path:"/agents",redirect:mt("/operations","agents")},{path:"/loops",redirect:mt("/operations","loops")},{path:"/processes",redirect:mt("/operations","processes")},{path:"/schedules",redirect:mt("/operations","schedules")},{path:"/audit",redirect:mt("/history","audit")},{path:"/sessions",redirect:mt("/history","sessions")},{path:"/traces",redirect:mt("/history","traces")},{path:"/usage",redirect:mt("/history","usage")},{path:"/tools",redirect:mt("/capabilities","tools")},{path:"/skills",redirect:mt("/capabilities","skills")},{path:"/knowledge",redirect:mt("/capabilities","knowledge")},{path:"/memory",redirect:mt("/capabilities","memory")},{path:"/learned",redirect:mt("/capabilities","learned")},{path:"/health",redirect:mt("/system","health")},{path:"/resources",redirect:mt("/system","resources")},{path:"/logs",redirect:mt("/system","logs")},{path:"/config",redirect:mt("/system","config")},{path:"/host-access",redirect:mt("/system","host-access")},{path:"/internals",redirect:mt("/system","internals")}],ui=A_({history:l_(),routes:yg});ui.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const t1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},s1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),u=h("disconnected"),d=h(-1),f=h(null);let p=null;const v=h("starting"),g=h(""),w=yg.filter(D=>D.meta),N=J(()=>["Workspace","Operate","Observe","Manage"].map(D=>({name:D,routes:w.filter(x=>x.meta.section===D)})).filter(D=>D.routes.length)),y=J(()=>{var D;return((D=ui.currentRoute.value.meta)==null?void 0:D.label)||"Odin"}),b=J(()=>{var D;return((D=ui.currentRoute.value.meta)==null?void 0:D.section)||"Management"}),_=J(()=>{var D;return((D=ui.currentRoute.value.meta)==null?void 0:D.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,We.disconnect(),G.setToken(""),e.value="login"};function C(D){var x;if((D.ctrlKey||D.metaKey)&&D.key.toLowerCase()==="k"){e.value==="ready"&&(D.preventDefault(),kd());return}if(n.value&&D.key==="Tab"){const B=[...((x=a.value)==null?void 0:x.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(B.length){const ue=B[0],ce=B[B.length-1];if(D.shiftKey&&(document.activeElement===ue||!a.value.contains(document.activeElement))){D.preventDefault(),ce.focus();return}if(!D.shiftKey&&(document.activeElement===ce||!a.value.contains(document.activeElement))){D.preventDefault(),ue.focus();return}}}if(D.key==="Escape"&&n.value){n.value=!1,D.preventDefault();return}if(D.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(D.target.tagName)){D.preventDefault();const B=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');B&&B.focus()}}function I(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}He(async()=>{document.addEventListener("keydown",C),r=window.matchMedia("(max-width: 900px)"),I(),r.addEventListener("change",I);const D=await G.check();D.ok?(e.value="ready",W()):D.needsAuth?e.value="login":(e.value="ready",W())});function L(){t.value=!1,e.value="ready",W()}async function S(){await G.logout(),We.disconnect(),e.value="login"}function A(){s.value=!s.value}function O(){n.value=!n.value}ls(n,async D=>{var x,B;if(D)o=document.activeElement,await St(),(B=(x=a.value)==null?void 0:x.querySelector(".nav-item"))==null||B.focus();else if(o!=null&&o.isConnected){const ue=o;o=null,requestAnimationFrame(()=>ue.focus())}});const U=J(()=>{switch(u.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(D,x="info",B=3e3){f.value={text:D,level:x},clearTimeout(p),p=setTimeout(()=>{f.value=null},B)}let T=null,$=!1;function W(){We.onStatusChange=D=>{c.value=D},We.onStateChange=(D,x)=>{u.value=D,d.value=x.latency??-1,D==="connected"?($&&P("Connection restored","success"),$=!0):D==="reconnecting"&&x.attempt===1&&P("Connection lost — reconnecting…","warn")},We.connect(),K(),T&&clearInterval(T),T=setInterval(K,15e3)}async function K(){try{const D=await G.get("/api/status");v.value=D.status==="online"?"online":"starting";const x=D.uptime_seconds||0,B=Math.floor(x/3600),ue=Math.floor(x%3600/60);g.value=`${B}h ${ue}m uptime`}catch{v.value="offline",g.value=""}}return gt(()=>{T&&clearInterval(T),We.disconnect(),document.removeEventListener("keydown",C),r==null||r.removeEventListener("change",I)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:u,wsLatency:d,wsLabel:U,wsToast:f,botStatus:v,botUptime:g,navRoutes:w,navGroups:N,currentPage:y,currentSection:b,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:L,logout:S,toggleSidebar:A,toggleMobileNavigation:O,openPalette:kd}}},Tn=Al(s1);Tn.component("odin-icon",O_);Tn.component("login-screen",t1);Tn.component("toast-container",xx);Tn.component("confirm-host",_x);Tn.component("command-palette",L_);Tn.directive("modal-focus",M_);Tn.use(ui);Tn.mount("#app");
