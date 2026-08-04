var Ug=Object.defineProperty;var Bg=(e,t,s)=>t in e?Ug(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var lt=(e,t,s)=>Bg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Hg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new Ji("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new td(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Ji("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new td((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new Ji((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Ji?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Ji extends Error{constructor(t){super(t),this.name="AuthError"}}class td extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Vg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const J=new Hg,Ge=new Vg(J);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ms(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const qe={},ka=[],$t=()=>{},xa=()=>!1,na=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Jl=e=>e.startsWith("onUpdate:"),je=Object.assign,Po=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},jg=Object.prototype.hasOwnProperty,et=(e,t)=>jg.call(e,t),be=Array.isArray,wa=e=>za(e)==="[object Map]",aa=e=>za(e)==="[object Set]",sd=e=>za(e)==="[object Date]",zg=e=>za(e)==="[object RegExp]",Re=e=>typeof e=="function",Me=e=>typeof e=="string",qt=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",Fo=e=>(Xe(e)||Re(e))&&Re(e.then)&&Re(e.catch),sf=Object.prototype.toString,za=e=>sf.call(e),qg=e=>za(e).slice(8,-1),Yl=e=>za(e)==="[object Object]",Ql=e=>Me(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,cn=ms(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Kg=ms("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Xl=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Gg=/-\w/g,it=Xl(e=>e.replace(Gg,t=>t.slice(1).toUpperCase())),Wg=/\B([A-Z])/g,rs=Xl(e=>e.replace(Wg,"-$1").toLowerCase()),ia=Xl(e=>e.charAt(0).toUpperCase()+e.slice(1)),Sa=Xl(e=>e?`on${ia(e)}`:""),Lt=(e,t)=>!Object.is(e,t),Ta=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},nf=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},er=e=>{const t=parseFloat(e);return isNaN(t)?e:t},xl=e=>{const t=Me(e)?Number(e):NaN;return isNaN(t)?e:t};let nd;const tr=()=>nd||(nd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Zg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Jg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Yg=ms(Jg);function Fi(e){if(be(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Me(n)?af(n):Fi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Me(e)||Xe(e))return e}const Qg=/;(?![^(]*\))/g,Xg=/:([^]+)/,em=/\/\*[^]*?\*\//g;function af(e){const t={};return e.replace(em,"").split(Qg).forEach(s=>{if(s){const n=s.split(Xg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function $i(e){let t="";if(Me(e))t=e;else if(be(e))for(let s=0;s<e.length;s++){const n=$i(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function tm(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Me(t)&&(e.class=$i(t)),s&&(e.style=Fi(s)),e}const sm="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",nm="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",am="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",im="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",lm=ms(sm),rm=ms(nm),om=ms(am),cm=ms(im),dm="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",um=ms(dm);function lf(e){return!!e||e===""}function fm(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=pn(e[n],t[n]);return s}function pn(e,t){if(e===t)return!0;let s=sd(e),n=sd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=qt(e),n=qt(t),s||n)return e===t;if(s=be(e),n=be(t),s||n)return s&&n?fm(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!pn(e[l],t[l]))return!1}}return String(e)===String(t)}function sr(e,t){return e.findIndex(s=>pn(s,t))}const rf=e=>!!(e&&e.__v_isRef===!0),of=e=>Me(e)?e:e==null?"":be(e)||Xe(e)&&(e.toString===sf||!Re(e.toString))?rf(e)?of(e.value):JSON.stringify(e,cf,2):String(e),cf=(e,t)=>rf(t)?cf(e,t.value):wa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Er(n,i)+" =>"]=a,s),{})}:aa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Er(s))}:qt(t)?Er(t):Xe(t)&&!be(t)&&!Yl(t)?String(t):t,Er=(e,t="")=>{var s;return qt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function pm(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let At;class $o{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&At&&(At.active?(this.parent=At,this.index=(At.scopes||(At.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=At;try{return At=this,t()}finally{At=s}}}on(){++this._on===1&&(this.prevScope=At,At=this)}off(){if(this._on>0&&--this._on===0){if(At===this)At=this.prevScope;else{let t=At;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function hm(e){return new $o(e)}function df(){return At}function gm(e,t=!1){At&&At.cleanups.push(e)}let ot;const Ar=new WeakSet;class yi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,At&&(At.active?At.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Ar.has(this)&&(Ar.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||ff(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,ad(this),pf(this);const t=ot,s=Os;ot=this,Os=!0;try{return this.fn()}finally{hf(this),ot=t,Os=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Ho(t);this.deps=this.depsTail=void 0,ad(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Ar.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){eo(this)&&this.run()}get dirty(){return eo(this)}}let uf=0,oi,ci;function ff(e,t=!1){if(e.flags|=8,t){e.next=ci,ci=e;return}e.next=oi,oi=e}function Uo(){uf++}function Bo(){if(--uf>0)return;if(ci){let t=ci;for(ci=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;oi;){let t=oi;for(oi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function pf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function hf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Ho(n),mm(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function eo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(gf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function gf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===xi)||(e.globalVersion=xi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!eo(e))))return;e.flags|=2;const t=e.dep,s=ot,n=Os;ot=e,Os=!0;try{pf(e);const a=e.fn(e._value);(t.version===0||Lt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ot=s,Os=n,hf(e),e.flags&=-3}}function Ho(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Ho(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function mm(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function vm(e,t){e.effect instanceof yi&&(e=e.effect.fn);const s=new yi(e);t&&je(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function bm(e){e.effect.stop()}let Os=!0;const mf=[];function hn(){mf.push(Os),Os=!1}function gn(){const e=mf.pop();Os=e===void 0?!0:e}function ad(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ot;ot=void 0;try{t()}finally{ot=s}}}let xi=0;class ym{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class nr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ot||!Os||ot===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ot)s=this.activeLink=new ym(ot,this),ot.deps?(s.prevDep=ot.depsTail,ot.depsTail.nextDep=s,ot.depsTail=s):ot.deps=ot.depsTail=s,vf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ot.depsTail,s.nextDep=void 0,ot.depsTail.nextDep=s,ot.depsTail=s,ot.deps===s&&(ot.deps=n)}return s}trigger(t){this.version++,xi++,this.notify(t)}notify(t){Uo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Bo()}}}function vf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)vf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const _l=new WeakMap,Wn=Symbol(""),to=Symbol(""),_i=Symbol("");function Vt(e,t,s){if(Os&&ot){let n=_l.get(e);n||_l.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new nr),a.map=n,a.key=s),a.track()}}function nn(e,t,s,n,a,i){const l=_l.get(e);if(!l){xi++;return}const r=o=>{o&&o.trigger()};if(Uo(),t==="clear")l.forEach(r);else{const o=be(e),c=o&&Ql(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,f)=>{(f==="length"||f===_i||!qt(f)&&f>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(_i)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Wn)),wa(e)&&r(l.get(to)));break;case"delete":o||(r(l.get(Wn)),wa(e)&&r(l.get(to)));break;case"set":wa(e)&&r(l.get(Wn));break}}Bo()}function xm(e,t){const s=_l.get(e);return s&&s.get(t)}function ua(e){const t=Je(e);return t===e?t:(Vt(t,"iterate",_i),cs(e)?t:t.map(Ns))}function ar(e){return Vt(e=Je(e),"iterate",_i),e}function js(e,t){return qs(e)?La(dn(e)?Ns(t):t):Ns(t)}const _m={__proto__:null,[Symbol.iterator](){return Rr(this,Symbol.iterator,e=>js(this,e))},concat(...e){return ua(this).concat(...e.map(t=>be(t)?ua(t):t))},entries(){return Rr(this,"entries",e=>(e[1]=js(this,e[1]),e))},every(e,t){return Zs(this,"every",e,t,void 0,arguments)},filter(e,t){return Zs(this,"filter",e,t,s=>s.map(n=>js(this,n)),arguments)},find(e,t){return Zs(this,"find",e,t,s=>js(this,s),arguments)},findIndex(e,t){return Zs(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Zs(this,"findLast",e,t,s=>js(this,s),arguments)},findLastIndex(e,t){return Zs(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Zs(this,"forEach",e,t,void 0,arguments)},includes(...e){return Ir(this,"includes",e)},indexOf(...e){return Ir(this,"indexOf",e)},join(e){return ua(this).join(e)},lastIndexOf(...e){return Ir(this,"lastIndexOf",e)},map(e,t){return Zs(this,"map",e,t,void 0,arguments)},pop(){return Wa(this,"pop")},push(...e){return Wa(this,"push",e)},reduce(e,...t){return id(this,"reduce",e,t)},reduceRight(e,...t){return id(this,"reduceRight",e,t)},shift(){return Wa(this,"shift")},some(e,t){return Zs(this,"some",e,t,void 0,arguments)},splice(...e){return Wa(this,"splice",e)},toReversed(){return ua(this).toReversed()},toSorted(e){return ua(this).toSorted(e)},toSpliced(...e){return ua(this).toSpliced(...e)},unshift(...e){return Wa(this,"unshift",e)},values(){return Rr(this,"values",e=>js(this,e))}};function Rr(e,t,s){const n=ar(e),a=n[t]();return n!==e&&!cs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const km=Array.prototype;function Zs(e,t,s,n,a,i){const l=ar(e),r=l!==e&&!cs(e),o=l[t];if(o!==km[t]){const u=o.apply(e,i);return r?Ns(u):u}let c=s;l!==e&&(r?c=function(u,f){return s.call(this,js(e,u),f,e)}:s.length>2&&(c=function(u,f){return s.call(this,u,f,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function id(e,t,s,n){const a=ar(e),i=a!==e&&!cs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=js(e,c)),s.call(this,c,js(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?js(e,o):o}function Ir(e,t,s){const n=Je(e);Vt(n,"iterate",_i);const a=n[t](...s);return(a===-1||a===!1)&&Ui(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function Wa(e,t,s=[]){hn(),Uo();const n=Je(e)[t].apply(e,s);return Bo(),gn(),n}const wm=ms("__proto__,__v_isRef,__isVue"),bf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(qt));function Sm(e){qt(e)||(e=String(e));const t=Je(this);return Vt(t,"has",e),t.hasOwnProperty(e)}class yf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Tf:Sf:i?wf:kf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=be(t);if(!a){let o;if(l&&(o=_m[s]))return o;if(s==="hasOwnProperty")return Sm}const r=Reflect.get(t,s,St(t)?t:n);if((qt(s)?bf.has(s):wm(s))||(a||Vt(t,"get",s),i))return r;if(St(r)){const o=l&&Ql(s)?r:r.value;return a&&Xe(o)?kl(o):o}return Xe(r)?a?kl(r):Mn(r):r}}class xf extends yf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=be(t)&&Ql(s);if(!this._isShallow){const c=qs(i);if(!cs(n)&&!qs(n)&&(i=Je(i),n=Je(n)),!l&&St(i)&&!St(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:et(t,s),o=Reflect.set(t,s,n,St(t)?t:a);return t===Je(a)&&(r?Lt(n,i)&&nn(t,"set",s,n):nn(t,"add",s,n)),o}deleteProperty(t,s){const n=et(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&nn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!qt(s)||!bf.has(s))&&Vt(t,"has",s),n}ownKeys(t){return Vt(t,"iterate",be(t)?"length":Wn),Reflect.ownKeys(t)}}class _f extends yf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Tm=new xf,Cm=new _f,Em=new xf(!0),Am=new _f(!0),so=e=>e,Yi=e=>Reflect.getPrototypeOf(e);function Rm(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=wa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?so:t?La:Ns;return!t&&Vt(i,"iterate",o?to:Wn),je(Object.create(c),{next(){const{value:u,done:f}=c.next();return f?{value:u,done:f}:{value:r?[d(u[0]),d(u[1])]:d(u),done:f}}})}}function Qi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Im(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Lt(a,r)&&Vt(l,"get",a),Vt(l,"get",r));const{has:o}=Yi(l),c=t?so:e?La:Ns;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Vt(Je(a),"iterate",Wn),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Lt(a,r)&&Vt(l,"has",a),Vt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?so:e?La:Ns;return!e&&Vt(o,"iterate",Wn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return je(s,e?{add:Qi("add"),set:Qi("set"),delete:Qi("delete"),clear:Qi("clear")}:{add(a){const i=Je(this),l=Yi(i),r=Je(a),o=!t&&!cs(a)&&!qs(a)?r:a;return l.has.call(i,o)||Lt(a,o)&&l.has.call(i,a)||Lt(r,o)&&l.has.call(i,r)||(i.add(o),nn(i,"add",o,o)),this},set(a,i){!t&&!cs(i)&&!qs(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=Yi(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Lt(i,d)&&nn(l,"set",a,i):nn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=Yi(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&nn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&nn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Rm(a,e,t)}),s}function ir(e,t){const s=Im(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(et(s,a)&&a in n?s:n,a,i)}const Om={get:ir(!1,!1)},Lm={get:ir(!1,!0)},Nm={get:ir(!0,!1)},Dm={get:ir(!0,!0)},kf=new WeakMap,wf=new WeakMap,Sf=new WeakMap,Tf=new WeakMap;function Mm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Mn(e){return qs(e)?e:lr(e,!1,Tm,Om,kf)}function Vo(e){return lr(e,!1,Em,Lm,wf)}function kl(e){return lr(e,!0,Cm,Nm,Sf)}function Pm(e){return lr(e,!0,Am,Dm,Tf)}function lr(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Mm(qg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function dn(e){return qs(e)?dn(e.__v_raw):!!(e&&e.__v_isReactive)}function qs(e){return!!(e&&e.__v_isReadonly)}function cs(e){return!!(e&&e.__v_isShallow)}function Ui(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function Cf(e){return!et(e,"__v_skip")&&Object.isExtensible(e)&&nf(e,"__v_skip",!0),e}const Ns=e=>Xe(e)?Mn(e):e,La=e=>Xe(e)?kl(e):e;function St(e){return e?e.__v_isRef===!0:!1}function h(e){return Ef(e,!1)}function jo(e){return Ef(e,!0)}function Ef(e,t){return St(e)?e:new Fm(e,t)}class Fm{constructor(t,s){this.dep=new nr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:Ns(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||cs(t)||qs(t);t=n?t:Je(t),Lt(t,s)&&(this._rawValue=t,this._value=n?t:Ns(t),this.dep.trigger())}}function $m(e){e.dep&&e.dep.trigger()}function zs(e){return St(e)?e.value:e}function Um(e){return Re(e)?e():zs(e)}const Bm={get:(e,t,s)=>t==="__v_raw"?e:zs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return St(a)&&!St(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function zo(e){return dn(e)?e:new Proxy(e,Bm)}class Hm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new nr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Af(e){return new Hm(e)}function Vm(e){const t=be(e)?new Array(e.length):{};for(const s in e)t[s]=Rf(e,s);return t}class jm{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=qt(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!be(t)||qt(this._key)||!Ql(this._key))do a=!Ui(i)||cs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=zs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&St(this._raw[this._key])){const s=this._object[this._key];if(St(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return xm(this._raw,this._key)}}class zm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function qm(e,t,s){return St(e)?e:Re(e)?new zm(e):Xe(e)&&arguments.length>1?Rf(e,t,s):h(e)}function Rf(e,t,s){return new jm(e,t,s)}class Km{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new nr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=xi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ot!==this)return ff(this,!0),!0}get value(){const t=this.dep.track();return gf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Gm(e,t,s=!1){let n,a;return Re(e)?n=e:(n=e.get,a=e.set),new Km(n,a,s)}const Wm={GET:"get",HAS:"has",ITERATE:"iterate"},Zm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Xi={},wl=new WeakMap;let An;function Jm(){return An}function If(e,t=!1,s=An){if(s){let n=wl.get(s);n||wl.set(s,n=[]),n.push(e)}}function Ym(e,t,s=qe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:cs(x)||a===!1||a===0?an(x,1):an(x);let d,u,f,p,m=!1,b=!1;if(St(e)?(u=()=>e.value,m=cs(e)):dn(e)?(u=()=>c(e),m=!0):be(e)?(b=!0,m=e.some(x=>dn(x)||cs(x)),u=()=>e.map(x=>{if(St(x))return x.value;if(dn(x))return c(x);if(Re(x))return o?o(x,2):x()})):Re(e)?t?u=o?()=>o(e,2):e:u=()=>{if(f){hn();try{f()}finally{gn()}}const x=An;An=d;try{return o?o(e,3,[p]):e(p)}finally{An=x}}:u=$t,t&&a){const x=u,k=a===!0?1/0:a;u=()=>an(x(),k)}const w=df(),E=()=>{d.stop(),w&&w.active&&Po(w.effects,d)};if(i&&t){const x=t;t=(...k)=>{const _=x(...k);return E(),_}}let v=b?new Array(e.length).fill(Xi):Xi;const g=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const k=d.run();if(x||a||m||(b?k.some((_,A)=>Lt(_,v[A])):Lt(k,v))){f&&f();const _=An;An=d;try{const A=[k,v===Xi?void 0:b&&v[0]===Xi?[]:v,p];v=k,o?o(t,3,A):t(...A)}finally{An=_}}}else d.run()};return r&&r(g),d=new yi(u),d.scheduler=l?()=>l(g,!1):g,p=x=>If(x,!1,d),f=d.onStop=()=>{const x=wl.get(d);if(x){if(o)o(x,4);else for(const k of x)k();wl.delete(d)}},t?n?g(!0):v=d.run():l?l(g.bind(null,!0),!0):d.run(),E.pause=d.pause.bind(d),E.resume=d.resume.bind(d),E.stop=E,E}function an(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,St(e))an(e.value,t,s);else if(be(e))for(let n=0;n<e.length;n++)an(e[n],t,s);else if(aa(e)||wa(e))e.forEach(n=>{an(n,t,s)});else if(Yl(e)){for(const n in e)an(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&an(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Of=[];function Qm(e){Of.push(e)}function Xm(){Of.pop()}function ev(e,t){}const tv={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},sv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function qa(e,t,s,n){try{return n?e(...n):e()}catch(a){la(a,t,s)}}function hs(e,t,s,n){if(Re(e)){const a=qa(e,t,s,n);return a&&Fo(a)&&a.catch(i=>{la(i,t,s)}),a}if(be(e)){const a=[];for(let i=0;i<e.length;i++)a.push(hs(e[i],t,s,n));return a}}function la(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||qe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){hn(),qa(i,null,10,[e,o,c]),gn();return}}nv(e,s,a,n,l)}function nv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Yt=[];let Hs=-1;const Ca=[];let Rn=null,ma=0;const Lf=Promise.resolve();let Sl=null;function Rt(e){const t=Sl||Lf;return e?t.then(this?e.bind(this):e):t}function av(e){let t=Hs+1,s=Yt.length;for(;t<s;){const n=t+s>>>1,a=Yt[n],i=wi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function qo(e){if(!(e.flags&1)){const t=wi(e),s=Yt[Yt.length-1];!s||!(e.flags&2)&&t>=wi(s)?Yt.push(e):Yt.splice(av(t),0,e),e.flags|=1,Nf()}}function Nf(){Sl||(Sl=Lf.then(Df))}function ki(e){be(e)?Ca.push(...e):Rn&&e.id===-1?Rn.splice(ma+1,0,e):e.flags&1||(Ca.push(e),e.flags|=1),Nf()}function ld(e,t,s=Hs+1){for(;s<Yt.length;s++){const n=Yt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Yt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Tl(e){if(Ca.length){const t=[...new Set(Ca)].sort((s,n)=>wi(s)-wi(n));if(Ca.length=0,Rn){Rn.push(...t);return}for(Rn=t,ma=0;ma<Rn.length;ma++){const s=Rn[ma];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Rn=null,ma=0}}const wi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Df(e){try{for(Hs=0;Hs<Yt.length;Hs++){const t=Yt[Hs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),qa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Hs<Yt.length;Hs++){const t=Yt[Hs];t&&(t.flags&=-2)}Hs=-1,Yt.length=0,Tl(),Sl=null,(Yt.length||Ca.length)&&Df()}}let va,el=[];function Mf(e,t){var s,n;va=e,va?(va.enabled=!0,el.forEach(({event:a,args:i})=>va.emit(a,...i)),el=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Mf(i,t)}),setTimeout(()=>{va||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,el=[])},3e3)):el=[]}let Ft=null,rr=null;function Si(e){const t=Ft;return Ft=e,rr=e&&e.type.__scopeId||null,t}function iv(e){rr=e}function lv(){rr=null}const rv=e=>Ko;function Ko(e,t=Ft,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Ai(-1);const i=Si(t);let l;try{l=e(...a)}finally{Si(i),n._d&&Ai(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function ov(e,t){if(Ft===null)return e;const s=ji(Ft),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=qe]=t[a];i&&(Re(i)&&(i={mounted:i,updated:i}),i.deep&&an(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Vs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(hn(),hs(o,s,8,[e.el,r,e,t]),gn())}}function di(e,t){if(Pt){let s=Pt.provides;const n=Pt.parent&&Pt.parent.provides;n===s&&(s=Pt.provides=Object.create(n)),s[e]=t}}function Ss(e,t,s=!1){const n=es();if(n||Zn){let a=Zn?Zn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Re(t)?t.call(n&&n.proxy):t}}function cv(){return!!(es()||Zn)}const Pf=Symbol.for("v-scx"),Ff=()=>Ss(Pf);function dv(e,t){return Bi(e,null,t)}function uv(e,t){return Bi(e,null,{flush:"post"})}function $f(e,t){return Bi(e,null,{flush:"sync"})}function Xt(e,t,s){return Bi(e,t,s)}function Bi(e,t,s=qe){const{immediate:n,deep:a,flush:i,once:l}=s,r=je({},s),o=t&&n||!t&&i!=="post";let c;if(ea){if(i==="sync"){const p=Ff();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=$t,p.resume=$t,p.pause=$t,p}}const d=Pt;r.call=(p,m,b)=>hs(p,d,m,b);let u=!1;i==="post"?r.scheduler=p=>{kt(p,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(p,m)=>{m?p():qo(p)}),r.augmentJob=p=>{t&&(p.flags|=4),u&&(p.flags|=2,d&&(p.id=d.uid,p.i=d))};const f=Ym(e,t,r);return ea&&(c?c.push(f):o&&f()),f}function fv(e,t,s){const n=this.proxy,a=Me(e)?e.includes(".")?Uf(n,e):()=>n[e]:e.bind(n,n);let i;Re(t)?i=t:(i=t.handler,s=t);const l=Ka(this),r=Bi(a,i.bind(n),s);return l(),r}function Uf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Tn=new WeakMap,Bf=Symbol("_vte"),Hf=e=>e.__isTeleport,zn=e=>e&&(e.disabled||e.disabled===""),pv=e=>e&&(e.defer||e.defer===""),rd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,od=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,no=(e,t)=>{const s=e&&e.to;return Me(s)?t?t(s):null:s},hv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:f,o:{insert:p,querySelector:m,createText:b,createComment:w,parentNode:E}}=c,v=zn(t.props);let{dynamicChildren:g}=t;const x=(A,T,C)=>{A.shapeFlag&16&&d(A.children,T,C,a,i,l,r,o)},k=(A=t)=>{const T=zn(A.props),C=A.target=no(A.props,m),L=ao(C,A,b,p);C&&(l!=="svg"&&rd(C)?l="svg":l!=="mathml"&&od(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),T||(x(A,C,L),ni(A,!1)))},_=A=>{const T=()=>{if(Tn.get(A)===T){if(Tn.delete(A),zn(A.props)){const C=E(A.el)||s;x(A,C,A.anchor),ni(A,!0)}k(A)}};Tn.set(A,T),kt(T,i)};if(e==null){const A=t.el=b(""),T=t.anchor=b("");if(p(A,s,n),p(T,s,n),pv(t.props)||i&&i.pendingBranch){_(t);return}v&&(x(t,s,T),ni(t,!0)),k()}else{t.el=e.el;const A=t.anchor=e.anchor,T=Tn.get(e);if(T){T.flags|=8,Tn.delete(e),_(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,L=t.targetAnchor=e.targetAnchor,H=zn(e.props),P=H?s:C,M=H?A:L;if(l==="svg"||rd(C)?l="svg":(l==="mathml"||od(C))&&(l="mathml"),g?(f(e.dynamicChildren,g,P,a,i,l,r),nc(e,t,!0)):o||u(e,t,P,M,a,i,l,r,!1),v)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):tl(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const K=t.target=no(t.props,m);K&&tl(t,K,null,c,0)}else H&&tl(t,C,L,c,1);ni(t,v)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:f}=e,p=i||!zn(f),m=Tn.get(e);if(m&&(m.flags|=8,Tn.delete(e)),u&&(a(c),a(d)),i&&a(o),!m&&l&16)for(let b=0;b<r.length;b++){const w=r[b];n(w,t,s,p,!!w.dynamicChildren)}},move:tl,hydrate:gv};function tl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Tn.has(e)&&(!u||zn(d))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);u&&n(r,t,s)}function gv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function f(w,E){let v=E;for(;v;){if(v&&v.nodeType===8){if(v.data==="teleport start anchor")t.targetStart=v;else if(v.data==="teleport anchor"){t.targetAnchor=v,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}v=l(v)}}function p(w,E){E.anchor=u(l(w),E,r(w),s,n,a,i)}const m=t.target=no(t.props,o),b=zn(t.props);if(m){const w=m._lpa||m.firstChild;t.shapeFlag&16&&(b?(p(e,t),f(m,w),t.targetAnchor||ao(m,t,d,c,r(e)===m?e:null)):(t.anchor=l(e),f(m,w),t.targetAnchor||ao(m,t,d,c),u(w&&l(w),t,m,s,n,a,i))),ni(t,b)}else b&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const mv=hv;function ni(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function ao(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Bf]=l,e&&(n(i,e,a),n(l,e,a)),l}const _s=Symbol("_leaveCb"),Za=Symbol("_enterCb");function Go(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ye(()=>{e.isMounted=!0}),ur(()=>{e.isUnmounting=!0}),e}const xs=[Function,Array],Wo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:xs,onEnter:xs,onAfterEnter:xs,onEnterCancelled:xs,onBeforeLeave:xs,onLeave:xs,onAfterLeave:xs,onLeaveCancelled:xs,onBeforeAppear:xs,onAppear:xs,onAfterAppear:xs,onAppearCancelled:xs},Vf=e=>{const t=e.subTree;return t.component?Vf(t.component):t},vv={name:"BaseTransition",props:Wo,setup(e,{slots:t}){const s=es(),n=Go();return()=>{const a=t.default&&or(t.default(),!0),i=a&&a.length?jf(a):s.subTree?Tp():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return Or(i);const o=cd(i);if(!o)return Or(i);let c=Na(o,l,n,s,u=>c=u);o.type!==yt&&mn(o,c);let d=s.subTree&&cd(s.subTree);if(d&&d.type!==yt&&!Is(d,o)&&Vf(s).type!==yt){let u=Na(d,l,n,s);if(mn(d,u),r==="out-in"&&o.type!==yt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Or(i);r==="in-out"&&o.type!==yt?u.delayLeave=(f,p,m)=>{const b=qf(n,d);b[String(d.key)]=d,f[_s]=()=>{p(),f[_s]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function jf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==yt){t=s;break}}return t}const zf=vv;function qf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Na(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:f,onLeave:p,onAfterLeave:m,onLeaveCancelled:b,onBeforeAppear:w,onAppear:E,onAfterAppear:v,onAppearCancelled:g}=t,x=String(e.key),k=qf(s,e),_=(C,L)=>{C&&hs(C,n,9,L)},A=(C,L)=>{const H=L[1];_(C,L),be(C)?C.every(P=>P.length<=1)&&H():C.length<=1&&H()},T={mode:l,persisted:r,beforeEnter(C){let L=o;if(!s.isMounted)if(i)L=w||o;else return;C[_s]&&C[_s](!0);const H=k[x];H&&Is(e,H)&&H.el[_s]&&H.el[_s](),_(L,[C])},enter(C){if(k[x]===e)return;let L=c,H=d,P=u;if(!s.isMounted)if(i)L=E||c,H=v||d,P=g||u;else return;let M=!1;C[Za]=ne=>{M||(M=!0,ne?_(P,[C]):_(H,[C]),T.delayedLeave&&T.delayedLeave(),C[Za]=void 0)};const K=C[Za].bind(null,!1);L?A(L,[C,K]):K()},leave(C,L){const H=String(e.key);if(C[Za]&&C[Za](!0),s.isUnmounting)return L();_(f,[C]);let P=!1;C[_s]=K=>{P||(P=!0,L(),K?_(b,[C]):_(m,[C]),C[_s]=void 0,k[H]===e&&delete k[H])};const M=C[_s].bind(null,!1);k[H]=e,p?A(p,[C,M]):M()},clone(C){const L=Na(C,t,s,n,a);return a&&a(L),L}};return T}function Or(e){if(Vi(e))return e=Ks(e),e.children=null,e}function cd(e){if(!Vi(e))return Hf(e.type)&&e.children?jf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Re(s.default))return s.default()}}function mn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,mn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function or(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Nt?(l.patchFlag&128&&a++,n=n.concat(or(l.children,t,r))):(t||l.type!==yt)&&n.push(r!=null?Ks(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Hi(e,t){return Re(e)?je({name:e.name},t,{setup:e}):e}function bv(){const e=es();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Zo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function yv(e){const t=es(),s=jo(null);if(t){const a=t.refs===qe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function dd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Cl=new WeakMap;function Ea(e,t,s,n,a=!1){if(be(e)){e.forEach((b,w)=>Ea(b,t&&(be(t)?t[w]:t),s,n,a));return}if(un(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ea(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ji(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===qe?r.refs={}:r.refs,u=r.setupState,f=Je(u),p=u===qe?xa:b=>dd(d,b)?!1:et(f,b),m=(b,w)=>!(w&&dd(d,w));if(c!=null&&c!==o){if(ud(t),Me(c))d[c]=null,p(c)&&(u[c]=null);else if(St(c)){const b=t;m(c,b.k)&&(c.value=null),b.k&&(d[b.k]=null)}}if(Re(o))qa(o,r,12,[l,d]);else{const b=Me(o),w=St(o);if(b||w){const E=()=>{if(e.f){const v=b?p(o)?u[o]:d[o]:m()||!e.k?o.value:d[e.k];if(a)be(v)&&Po(v,i);else if(be(v))v.includes(i)||v.push(i);else if(b)d[o]=[i],p(o)&&(u[o]=d[o]);else{const g=[i];m(o,e.k)&&(o.value=g),e.k&&(d[e.k]=g)}}else b?(d[o]=l,p(o)&&(u[o]=l)):w&&(m(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const v=()=>{E(),Cl.delete(e)};v.id=-1,Cl.set(e,v),kt(v,s)}else ud(e),E()}}}function ud(e){const t=Cl.get(e);t&&(t.flags|=8,Cl.delete(e))}let fd=!1;const fa=()=>{fd||(console.error("Hydration completed but contains mismatches."),fd=!0)},xv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",_v=e=>e.namespaceURI.includes("MathML"),sl=e=>{if(e.nodeType===1){if(xv(e))return"svg";if(_v(e))return"mathml"}},_a=e=>e.nodeType===8;function kv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(g,x)=>{if(!x.hasChildNodes()){s(null,g,x),Tl(),x._vnode=g;return}u(x.firstChild,g,null,null,null),Tl(),x._vnode=g},u=(g,x,k,_,A,T=!1)=>{T=T||!!x.dynamicChildren;const C=_a(g)&&g.data==="[",L=()=>b(g,x,k,_,A,C),{type:H,ref:P,shapeFlag:M,patchFlag:K}=x;let ne=g.nodeType;x.el=g,K===-2&&(T=!1,x.dynamicChildren=null);let U=null;switch(H){case Ln:ne!==3?x.children===""?(o(x.el=a(""),l(g),g),U=g):U=L():(g.data!==x.children&&(fa(),g.data=x.children),U=i(g));break;case yt:v(g)?(U=i(g),E(x.el=g.content.firstChild,g,k)):ne!==8||C?U=L():U=i(g);break;case Jn:if(C&&(g=i(g),ne=g.nodeType),ne===1||ne===3){U=g;const I=!x.children.length;for(let R=0;R<x.staticCount;R++)I&&(x.children+=U.nodeType===1?U.outerHTML:U.data),R===x.staticCount-1&&(x.anchor=U),U=i(U);return C?i(U):U}else L();break;case Nt:C?U=m(g,x,k,_,A,T):U=L();break;default:if(M&1)(ne!==1||x.type.toLowerCase()!==g.tagName.toLowerCase())&&!v(g)?U=L():U=f(g,x,k,_,A,T);else if(M&6){x.slotScopeIds=A;const I=l(g);if(C?U=w(g):_a(g)&&g.data==="teleport start"?U=w(g,g.data,"teleport end"):U=i(g),t(x,I,null,k,_,sl(I),T),un(x)&&!x.type.__asyncResolved){let R;C?(R=ut(Nt),R.anchor=U?U.previousSibling:I.lastChild):R=g.nodeType===3?ic(""):ut("div"),R.el=g,x.component.subTree=R}}else M&64?ne!==8?U=L():U=x.type.hydrate(g,x,k,_,A,T,e,p):M&128&&(U=x.type.hydrate(g,x,k,_,sl(l(g)),A,T,e,u))}return P!=null&&Ea(P,null,_,x),U},f=(g,x,k,_,A,T)=>{T=T||!!x.dynamicChildren;const{type:C,props:L,patchFlag:H,shapeFlag:P,dirs:M,transition:K}=x,ne=C==="input"||C==="option";if(ne||H!==-1){M&&Vs(x,null,k,"created");let U=!1;if(v(g)){U=mp(null,K)&&k&&k.vnode.props&&k.vnode.props.appear;const R=g.content.firstChild;if(U){const j=R.getAttribute("class");j&&(R.$cls=j),K.beforeEnter(R)}E(R,g,k),x.el=g=R}if(P&16&&!(L&&(L.innerHTML||L.textContent))){let R=p(g.firstChild,x,g,k,_,A,T);for(R&&!nl(g,1)&&fa();R;){const j=R;R=R.nextSibling,r(j)}}else if(P&8){let R=x.children;R[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(R=R.slice(1));const{textContent:j}=g;j!==R&&j!==R.replace(/\r\n|\r/g,`
`)&&(nl(g,0)||fa(),g.textContent=x.children)}if(L){if(ne||!T||H&48){const R=g.tagName.includes("-");for(const j in L)(ne&&(j.endsWith("value")||j==="indeterminate")||na(j)&&!cn(j)||j[0]==="."||R&&!cn(j))&&n(g,j,null,L[j],void 0,k)}else if(L.onClick)n(g,"onClick",null,L.onClick,void 0,k);else if(H&4&&dn(L.style))for(const R in L.style)L.style[R]}let I;(I=L&&L.onVnodeBeforeMount)&&as(I,k,x),M&&Vs(x,null,k,"beforeMount"),((I=L&&L.onVnodeMounted)||M||U)&&xp(()=>{I&&as(I,k,x),U&&K.enter(g),M&&Vs(x,null,k,"mounted")},_)}return g.nextSibling},p=(g,x,k,_,A,T,C)=>{C=C||!!x.dynamicChildren;const L=x.children,H=L.length;let P=!1;for(let M=0;M<H;M++){const K=C?L[M]:L[M]=ls(L[M]),ne=K.type===Ln;g?(ne&&!C&&M+1<H&&ls(L[M+1]).type===Ln&&(o(a(g.data.slice(K.children.length)),k,i(g)),g.data=K.children),g=u(g,K,_,A,T,C)):ne&&!K.children?o(K.el=a(""),k):(P||(P=!0,nl(k,1)||fa()),s(null,K,k,null,_,A,sl(k),T))}return g},m=(g,x,k,_,A,T)=>{const{slotScopeIds:C}=x;C&&(A=A?A.concat(C):C);const L=l(g),H=p(i(g),x,L,k,_,A,T);return H&&_a(H)&&H.data==="]"?i(x.anchor=H):(fa(),o(x.anchor=c("]"),L,H),H)},b=(g,x,k,_,A,T)=>{if(nl(g.parentElement,1)||fa(),x.el=null,T){const H=w(g);for(;;){const P=i(g);if(P&&P!==H)r(P);else break}}const C=i(g),L=l(g);return r(g),s(null,x,L,C,k,_,sl(L),A),k&&(k.vnode.el=x.el,pr(k,x.el)),C},w=(g,x="[",k="]")=>{let _=0;for(;g;)if(g=i(g),g&&_a(g)&&(g.data===x&&_++,g.data===k)){if(_===0)return i(g);_--}return g},E=(g,x,k)=>{const _=x.parentNode;_&&_.replaceChild(g,x);let A=k;for(;A;)A.vnode.el===x&&(A.vnode.el=A.subTree.el=g),A=A.parent},v=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const pd="data-allow-mismatch",wv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function nl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(pd);)e=e.parentElement;const s=e&&e.getAttribute(pd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(wv[t])}}const Sv=tr().requestIdleCallback||(e=>setTimeout(e,1)),Tv=tr().cancelIdleCallback||(e=>clearTimeout(e)),Cv=(e=1e4)=>t=>{const s=Sv(t,{timeout:e});return()=>Tv(s)};function Ev(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Av=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Ev(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Rv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Iv=(e=[])=>(t,s)=>{Me(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Ov(e,t){if(_a(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(_a(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const un=e=>!!e.type.__asyncLoader;function Lv(e){Re(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const f=()=>(u++,c=null,p()),p=()=>{let m;return c||(m=c=t().catch(b=>{if(b=b instanceof Error?b:new Error(String(b)),o)return new Promise((w,E)=>{o(b,()=>w(f()),()=>E(b),u+1)});throw b}).then(b=>m!==c&&c?c:(b&&(b.__esModule||b[Symbol.toStringTag]==="Module")&&(b=b.default),d=b,b)))};return Hi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(m,b,w){let E=!1;(b.bu||(b.bu=[])).push(()=>E=!0);const v=()=>{E||w()},g=i?()=>{const x=i(v,k=>Ov(m,k));x&&(b.bum||(b.bum=[])).push(x)}:v;d?g():p().then(()=>!b.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Pt;if(Zo(m),d)return()=>al(d,m);const b=k=>{c=null,la(k,m,13,!n)};if(r&&m.suspense||ea)return p().then(k=>()=>al(k,m)).catch(k=>(b(k),()=>n?ut(n,{error:k}):null));const w=h(!1),E=h(),v=h(!!a);let g,x;return xt(()=>{g!=null&&clearTimeout(g),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{m.isUnmounted||(v.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!w.value&&!E.value){const k=new Error(`Async component timed out after ${l}ms.`);b(k),E.value=k}},l)),p().then(()=>{m.isUnmounted||(w.value=!0,m.parent&&Vi(m.parent.vnode)&&m.parent.update())}).catch(k=>{if(m.isUnmounted){c=null;return}b(k),E.value=k}),()=>{if(w.value&&d)return al(d,m);if(E.value&&n)return ut(n,{error:E.value});if(s&&!v.value)return al(s,m)}}})}function al(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ut(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Vi=e=>e.type.__isKeepAlive,Nv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=es(),n=s.ctx;if(!n.renderer)return()=>{const v=t.default&&t.default();return v&&v.length===1?v[0]:v};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,f=u("div");n.activate=(v,g,x,k,_)=>{const A=v.component;c(v,g,x,0,r),o(A.vnode,v,g,x,A,r,k,v.slotScopeIds,_),kt(()=>{A.isDeactivated=!1,A.a&&Ta(A.a);const T=v.props&&v.props.onVnodeMounted;T&&as(T,A.parent,v)},r)},n.deactivate=v=>{const g=v.component;Al(g.m),Al(g.a),c(v,f,null,1,r),kt(()=>{g.da&&Ta(g.da);const x=v.props&&v.props.onVnodeUnmounted;x&&as(x,g.parent,v),g.isDeactivated=!0},r)};function p(v){Lr(v),d(v,s,r,!0)}function m(v){a.forEach((g,x)=>{const k=ho(un(g)?g.type.__asyncResolved||{}:g.type);k&&!v(k)&&b(x)})}function b(v){const g=a.get(v);g&&(!l||!Is(g,l))?p(g):l&&Lr(l),a.delete(v),i.delete(v)}Xt(()=>[e.include,e.exclude],([v,g])=>{v&&m(x=>ai(v,x)),g&&m(x=>!ai(g,x))},{flush:"post",deep:!0});let w=null;const E=()=>{w!=null&&(Rl(s.subTree.type)?kt(()=>{a.set(w,il(s.subTree))},s.subTree.suspense):a.set(w,il(s.subTree)))};return Ye(E),dr(E),ur(()=>{a.forEach(v=>{const{subTree:g,suspense:x}=s,k=il(g);if(v.type===k.type&&v.key===k.key){Lr(k);const _=k.component.da;_&&kt(_,x);return}p(v)})}),()=>{if(w=null,!t.default)return l=null;const v=t.default(),g=v[0];if(v.length>1)return l=null,v;if(!vn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let x=il(g);if(x.type===yt)return l=null,x;const k=x.type,_=ho(un(x)?x.type.__asyncResolved||{}:k),{include:A,exclude:T,max:C}=e;if(A&&(!_||!ai(A,_))||T&&_&&ai(T,_))return x.shapeFlag&=-257,l=x,g;const L=x.key==null?k:x.key,H=a.get(L);return x.el&&(x=Ks(x),g.shapeFlag&128&&(g.ssContent=x)),w=L,H?(x.el=H.el,x.component=H.component,x.transition&&mn(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),C&&i.size>parseInt(C,10)&&b(i.values().next().value)),x.shapeFlag|=256,l=x,Rl(g.type)?g:x}}},Dv=Nv;function ai(e,t){return be(e)?e.some(s=>ai(s,t)):Me(e)?e.split(",").includes(t):zg(e)?(e.lastIndex=0,e.test(t)):!1}function Es(e,t){Kf(e,"a",t)}function As(e,t){Kf(e,"da",t)}function Kf(e,t,s=Pt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(cr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Vi(a.parent.vnode)&&Mv(n,t,s,a),a=a.parent}}function Mv(e,t,s,n){const a=cr(t,e,n,!0);xt(()=>{Po(n[t],a)},s)}function Lr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function il(e){return e.shapeFlag&128?e.ssContent:e}function cr(e,t,s=Pt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{hn();const r=Ka(s),o=hs(t,s,e,l);return r(),gn(),o});return n?a.unshift(i):a.push(i),i}}const bn=e=>(t,s=Pt)=>{(!ea||e==="sp")&&cr(e,(...n)=>t(...n),s)},Gf=bn("bm"),Ye=bn("m"),Jo=bn("bu"),dr=bn("u"),ur=bn("bum"),xt=bn("um"),Wf=bn("sp"),Zf=bn("rtg"),Jf=bn("rtc");function Yf(e,t=Pt){cr("ec",e,t)}const Yo="components",Pv="directives";function Fv(e,t){return Qo(Yo,e,!0,t)||e}const Qf=Symbol.for("v-ndc");function $v(e){return Me(e)?Qo(Yo,e,!1)||e:e||Qf}function Uv(e){return Qo(Pv,e)}function Qo(e,t,s=!0,n=!1){const a=Ft||Pt;if(a){const i=a.type;if(e===Yo){const r=ho(i,!1);if(r&&(r===t||r===it(t)||r===ia(it(t))))return i}const l=hd(a[e]||i[e],t)||hd(a.appContext[e],t);return!l&&n?i:l}}function hd(e,t){return e&&(e[t]||e[it(t)]||e[ia(it(t))])}function Bv(e,t,s,n){let a;const i=s&&s[n],l=be(e);if(l||Me(e)){const r=l&&dn(e);let o=!1,c=!1;r&&(o=!cs(e),c=qs(e),e=ar(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?La(Ns(e[d])):Ns(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Hv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(be(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Vv(e,t,s={},n,a){if(Ft.ce||Ft.parent&&un(Ft.parent)&&Ft.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ei(),Il(Nt,null,[ut("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ei();const l=i&&Xo(i(s)),r=s.key||l&&l.key,o=Il(Nt,{key:(r&&!qt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Xo(e){return e.some(t=>vn(t)?!(t.type===yt||t.type===Nt&&!Xo(t.children)):!0)?e:null}function jv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Sa(n)]=e[n];return s}const io=e=>e?Ap(e)?ji(e):io(e.parent):null,ui=je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>io(e.parent),$root:e=>io(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>ec(e),$forceUpdate:e=>e.f||(e.f=()=>{qo(e.update)}),$nextTick:e=>e.n||(e.n=Rt.bind(e.proxy)),$watch:e=>fv.bind(e)}),Nr=(e,t)=>e!==qe&&!e.__isScriptSetup&&et(e,t),lo={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Nr(n,t))return l[t]=1,n[t];if(a!==qe&&et(a,t))return l[t]=2,a[t];if(et(i,t))return l[t]=3,i[t];if(s!==qe&&et(s,t))return l[t]=4,s[t];ro&&(l[t]=0)}}const c=ui[t];let d,u;if(c)return t==="$attrs"&&Vt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==qe&&et(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,et(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Nr(a,t)?(a[t]=s,!0):n!==qe&&et(n,t)?(n[t]=s,!0):et(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==qe&&r[0]!=="$"&&et(e,r)||Nr(t,r)||et(i,r)||et(n,r)||et(ui,r)||et(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:et(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},zv=je({},lo,{get(e,t){if(t!==Symbol.unscopables)return lo.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Yg(t)}});function qv(){return null}function Kv(){return null}function Gv(e){}function Wv(e){}function Zv(){return null}function Jv(){}function Yv(e,t){return null}function Qv(){return Xf().slots}function Xv(){return Xf().attrs}function Xf(e){const t=es();return t.setupContext||(t.setupContext=Lp(t))}function Ti(e){return be(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function eb(e,t){const s=Ti(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?be(a)||Re(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function tb(e,t){return!e||!t?e||t:be(e)&&be(t)?e.concat(t):je({},Ti(e),Ti(t))}function sb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function nb(e){const t=es(),s=ea;let n=e();Ri(),s&&Ra(!1);const a=()=>{Ka(t),s&&Ra(!0)},i=()=>{es()!==t&&t.scope.off(),Ri(),s&&Ra(!1)};return Fo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let ro=!0;function ab(e){const t=ec(e),s=e.proxy,n=e.ctx;ro=!1,t.beforeCreate&&gd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:f,beforeUpdate:p,updated:m,activated:b,deactivated:w,beforeDestroy:E,beforeUnmount:v,destroyed:g,unmounted:x,render:k,renderTracked:_,renderTriggered:A,errorCaptured:T,serverPrefetch:C,expose:L,inheritAttrs:H,components:P,directives:M,filters:K}=t;if(c&&ib(c,n,null),l)for(const I in l){const R=l[I];Re(R)&&(n[I]=R.bind(s))}if(a){const I=a.call(s,s);Xe(I)&&(e.data=Mn(I))}if(ro=!0,i)for(const I in i){const R=i[I],j=Re(R)?R.bind(s,s):Re(R.get)?R.get.bind(s,s):$t,z=!Re(R)&&Re(R.set)?R.set.bind(s):$t,ee=te({get:j,set:z});Object.defineProperty(n,I,{enumerable:!0,configurable:!0,get:()=>ee.value,set:ie=>ee.value=ie})}if(r)for(const I in r)ep(r[I],n,s,I);if(o){const I=Re(o)?o.call(s):o;Reflect.ownKeys(I).forEach(R=>{di(R,I[R])})}d&&gd(d,e,"c");function U(I,R){be(R)?R.forEach(j=>I(j.bind(s))):R&&I(R.bind(s))}if(U(Gf,u),U(Ye,f),U(Jo,p),U(dr,m),U(Es,b),U(As,w),U(Yf,T),U(Jf,_),U(Zf,A),U(ur,v),U(xt,x),U(Wf,C),be(L))if(L.length){const I=e.exposed||(e.exposed={});L.forEach(R=>{Object.defineProperty(I,R,{get:()=>s[R],set:j=>s[R]=j,enumerable:!0})})}else e.exposed||(e.exposed={});k&&e.render===$t&&(e.render=k),H!=null&&(e.inheritAttrs=H),P&&(e.components=P),M&&(e.directives=M),C&&Zo(e)}function ib(e,t,s=$t){be(e)&&(e=oo(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=Ss(a.from||n,a.default,!0):i=Ss(a.from||n):i=Ss(a),St(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function gd(e,t,s){hs(be(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function ep(e,t,s,n){let a=n.includes(".")?Uf(s,n):()=>s[n];if(Me(e)){const i=t[e];Re(i)&&Xt(a,i)}else if(Re(e))Xt(a,e.bind(s));else if(Xe(e))if(be(e))e.forEach(i=>ep(i,t,s,n));else{const i=Re(e.handler)?e.handler.bind(s):t[e.handler];Re(i)&&Xt(a,i,e)}}function ec(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>El(o,c,l,!0)),El(o,t,l)),Xe(t)&&i.set(t,o),o}function El(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&El(e,i,s,!0),a&&a.forEach(l=>El(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=lb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const lb={data:md,props:vd,emits:vd,methods:ii,computed:ii,beforeCreate:Wt,created:Wt,beforeMount:Wt,mounted:Wt,beforeUpdate:Wt,updated:Wt,beforeDestroy:Wt,beforeUnmount:Wt,destroyed:Wt,unmounted:Wt,activated:Wt,deactivated:Wt,errorCaptured:Wt,serverPrefetch:Wt,components:ii,directives:ii,watch:ob,provide:md,inject:rb};function md(e,t){return t?e?function(){return je(Re(e)?e.call(this,this):e,Re(t)?t.call(this,this):t)}:t:e}function rb(e,t){return ii(oo(e),oo(t))}function oo(e){if(be(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Wt(e,t){return e?[...new Set([].concat(e,t))]:t}function ii(e,t){return e?je(Object.create(null),e,t):t}function vd(e,t){return e?be(e)&&be(t)?[...new Set([...e,...t])]:je(Object.create(null),Ti(e),Ti(t??{})):t}function ob(e,t){if(!e)return t;if(!t)return e;const s=je(Object.create(null),e);for(const n in t)s[n]=Wt(e[n],t[n]);return s}function tp(){return{app:null,config:{isNativeTag:xa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let cb=0;function db(e,t){return function(n,a=null){Re(n)||(n=je({},n)),a!=null&&!Xe(a)&&(a=null);const i=tp(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:cb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Dp,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Re(d.install)?(l.add(d),d.install(c,...u)):Re(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,f){if(!o){const p=c._ceVNode||ut(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),u&&t?t(p,d):e(p,d,f),o=!0,c._container=d,d.__vue_app__=c,ji(p.component)}},onUnmount(d){r.push(d)},unmount(){o&&(hs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Zn;Zn=c;try{return d()}finally{Zn=u}}};return c}}let Zn=null;function ub(e,t,s=qe){const n=es(),a=it(t),i=rs(t),l=sp(e,a),r=Af((o,c)=>{let d,u=qe,f;return $f(()=>{const p=e[a];Lt(d,p)&&(d=p,c())}),{get(){return o(),s.get?s.get(d):d},set(p){const m=s.set?s.set(p):p;if(!Lt(m,d)&&!(u!==qe&&Lt(p,u)))return;const b=n.vnode.props,w=!!(b&&(t in b||a in b||i in b)&&(`onUpdate:${t}`in b||`onUpdate:${a}`in b||`onUpdate:${i}`in b));w||(d=p,c()),n.emit(`update:${t}`,m),Lt(p,u)&&(Lt(p,m)&&!Lt(m,f)||w&&u!==qe&&!Lt(m,d))&&c(),u=p,f=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||qe:r,done:!1}:{done:!0}}}},r}const sp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${it(t)}Modifiers`]||e[`${rs(t)}Modifiers`];function fb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||qe;let a=s;const i=t.startsWith("update:"),l=i&&sp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Me(d)?d.trim():d)),l.number&&(a=s.map(er)));let r,o=n[r=Sa(t)]||n[r=Sa(it(t))];!o&&i&&(o=n[r=Sa(rs(t))]),o&&hs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,hs(c,e,6,a)}}const pb=new WeakMap;function np(e,t,s=!1){const n=s?pb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Re(e)){const o=c=>{const d=np(c,t,!0);d&&(r=!0,je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Xe(e)&&n.set(e,null),null):(be(i)?i.forEach(o=>l[o]=null):je(l,i),Xe(e)&&n.set(e,l),l)}function fr(e,t){return!e||!na(t)?!1:(t=t.slice(2).replace(/Once$/,""),et(e,t[0].toLowerCase()+t.slice(1))||et(e,rs(t))||et(e,t))}function pl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:f,setupState:p,ctx:m,inheritAttrs:b}=e,w=Si(e);let E,v;try{if(s.shapeFlag&4){const x=a||n,k=x;E=ls(c.call(k,x,d,u,p,f,m)),v=r}else{const x=t;E=ls(x.length>1?x(u,{attrs:r,slots:l,emit:o}):x(u,null)),v=t.props?r:gb(r)}}catch(x){fi.length=0,la(x,e,1),E=ut(yt)}let g=E;if(v&&b!==!1){const x=Object.keys(v),{shapeFlag:k}=g;x.length&&k&7&&(i&&x.some(Jl)&&(v=mb(v,i)),g=Ks(g,v,!1,!0))}return s.dirs&&(g=Ks(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&mn(g,s.transition),E=g,Si(w),E}function hb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(vn(a)){if(a.type!==yt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const gb=e=>{let t;for(const s in e)(s==="class"||s==="style"||na(s))&&((t||(t={}))[s]=e[s]);return t},mb=(e,t)=>{const s={};for(const n in e)(!Jl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function vb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?bd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const f=d[u];if(ap(l,n,f)&&!fr(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?bd(n,l,c):!0:!!l;return!1}function bd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(ap(t,e,i)&&!fr(s,i))return!0}return!1}function ap(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!pn(n,a):n!==a}function pr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const ip={},lp=()=>Object.create(ip),rp=e=>Object.getPrototypeOf(e)===ip;function bb(e,t,s,n=!1){const a={},i=lp();e.propsDefaults=Object.create(null),op(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Vo(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function yb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let f=d[u];if(fr(e.emitsOptions,f))continue;const p=t[f];if(o)if(et(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const m=it(f);a[m]=co(o,r,m,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{op(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!et(t,u)&&((d=rs(u))===u||!et(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=co(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!et(t,u))&&(delete i[u],c=!0)}c&&nn(e.attrs,"set","")}function op(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(cn(o))continue;const c=t[o];let d;a&&et(a,d=it(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:fr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||qe;for(let d=0;d<i.length;d++){const u=i[d];s[u]=co(a,o,u,c[u],e,!et(c,u))}}return l}function co(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=et(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Re(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Ka(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===rs(s))&&(n=!0))}return n}const xb=new WeakMap;function cp(e,t,s=!1){const n=s?xb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Re(e)){const d=u=>{o=!0;const[f,p]=cp(u,t,!0);je(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Xe(e)&&n.set(e,ka),ka;if(be(i))for(let d=0;d<i.length;d++){const u=it(i[d]);yd(u)&&(l[u]=qe)}else if(i)for(const d in i){const u=it(d);if(yd(u)){const f=i[d],p=l[u]=be(f)||Re(f)?{type:f}:je({},f),m=p.type;let b=!1,w=!0;if(be(m))for(let E=0;E<m.length;++E){const v=m[E],g=Re(v)&&v.name;if(g==="Boolean"){b=!0;break}else g==="String"&&(w=!1)}else b=Re(m)&&m.name==="Boolean";p[0]=b,p[1]=w,(b||et(p,"default"))&&r.push(u)}}const c=[l,r];return Xe(e)&&n.set(e,c),c}function yd(e){return e[0]!=="$"&&!cn(e)}const tc=e=>e==="_"||e==="_ctx"||e==="$stable",sc=e=>be(e)?e.map(ls):[ls(e)],_b=(e,t,s)=>{if(t._n)return t;const n=Ko((...a)=>sc(t(...a)),s);return n._c=!1,n},dp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(tc(a))continue;const i=e[a];if(Re(i))t[a]=_b(a,i,n);else if(i!=null){const l=sc(i);t[a]=()=>l}}},up=(e,t)=>{const s=sc(t);e.slots.default=()=>s},fp=(e,t,s)=>{for(const n in t)(s||!tc(n))&&(e[n]=t[n])},kb=(e,t,s)=>{const n=e.slots=lp();if(e.vnode.shapeFlag&32){const a=t._;a?(fp(n,t,s),s&&nf(n,"_",a,!0)):dp(t,n)}else t&&up(e,t)},wb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=qe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:fp(a,t,s):(i=!t.$stable,dp(t,a)),l=t}else t&&(up(e,t),l={default:1});if(i)for(const r in a)!tc(r)&&l[r]==null&&delete a[r]},kt=xp;function pp(e){return gp(e)}function hp(e){return gp(e,kv)}function gp(e,t){const s=tr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:f,setScopeId:p=$t,insertStaticContent:m}=e,b=(y,O,F,X=null,Y=null,Z=null,fe=void 0,oe=null,re=!!O.dynamicChildren)=>{if(y===O)return;y&&!Is(y,O)&&(X=B(y),ie(y,Y,Z,!0),y=null),O.patchFlag===-2&&(re=!1,O.dynamicChildren=null);const{type:ae,ref:_e,shapeFlag:he}=O;switch(ae){case Ln:w(y,O,F,X);break;case yt:E(y,O,F,X);break;case Jn:y==null&&v(O,F,X,fe);break;case Nt:P(y,O,F,X,Y,Z,fe,oe,re);break;default:he&1?k(y,O,F,X,Y,Z,fe,oe,re):he&6?M(y,O,F,X,Y,Z,fe,oe,re):(he&64||he&128)&&ae.process(y,O,F,X,Y,Z,fe,oe,re,ye)}_e!=null&&Y?Ea(_e,y&&y.ref,Z,O||y,!O):_e==null&&y&&y.ref!=null&&Ea(y.ref,null,Z,y,!0)},w=(y,O,F,X)=>{if(y==null)n(O.el=r(O.children),F,X);else{const Y=O.el=y.el;O.children!==y.children&&c(Y,O.children)}},E=(y,O,F,X)=>{y==null?n(O.el=o(O.children||""),F,X):O.el=y.el},v=(y,O,F,X)=>{[y.el,y.anchor]=m(y.children,O,F,X,y.el,y.anchor)},g=({el:y,anchor:O},F,X)=>{let Y;for(;y&&y!==O;)Y=f(y),n(y,F,X),y=Y;n(O,F,X)},x=({el:y,anchor:O})=>{let F;for(;y&&y!==O;)F=f(y),a(y),y=F;a(O)},k=(y,O,F,X,Y,Z,fe,oe,re)=>{if(O.type==="svg"?fe="svg":O.type==="math"&&(fe="mathml"),y==null)_(O,F,X,Y,Z,fe,oe,re);else{const ae=y.el&&y.el._isVueCE?y.el:null;try{ae&&ae._beginPatch(),C(y,O,Y,Z,fe,oe,re)}finally{ae&&ae._endPatch()}}},_=(y,O,F,X,Y,Z,fe,oe)=>{let re,ae;const{props:_e,shapeFlag:he,transition:me,dirs:Te}=y;if(re=y.el=l(y.type,Z,_e&&_e.is,_e),he&8?d(re,y.children):he&16&&T(y.children,re,null,X,Y,Dr(y,Z),fe,oe),Te&&Vs(y,null,X,"created"),A(re,y,y.scopeId,fe,X),_e){for(const Ie in _e)Ie!=="value"&&!cn(Ie)&&i(re,Ie,null,_e[Ie],Z,X);"value"in _e&&i(re,"value",null,_e.value,Z),(ae=_e.onVnodeBeforeMount)&&as(ae,X,y)}Te&&Vs(y,null,X,"beforeMount");const Ae=mp(Y,me);Ae&&me.beforeEnter(re),n(re,O,F),((ae=_e&&_e.onVnodeMounted)||Ae||Te)&&kt(()=>{try{ae&&as(ae,X,y),Ae&&me.enter(re),Te&&Vs(y,null,X,"mounted")}finally{}},Y)},A=(y,O,F,X,Y)=>{if(F&&p(y,F),X)for(let Z=0;Z<X.length;Z++)p(y,X[Z]);if(Y){let Z=Y.subTree;if(O===Z||Rl(Z.type)&&(Z.ssContent===O||Z.ssFallback===O)){const fe=Y.vnode;A(y,fe,fe.scopeId,fe.slotScopeIds,Y.parent)}}},T=(y,O,F,X,Y,Z,fe,oe,re=0)=>{for(let ae=re;ae<y.length;ae++){const _e=y[ae]=oe?tn(y[ae]):ls(y[ae]);b(null,_e,O,F,X,Y,Z,fe,oe)}},C=(y,O,F,X,Y,Z,fe)=>{const oe=O.el=y.el;let{patchFlag:re,dynamicChildren:ae,dirs:_e}=O;re|=y.patchFlag&16;const he=y.props||qe,me=O.props||qe;let Te;if(F&&Bn(F,!1),(Te=me.onVnodeBeforeUpdate)&&as(Te,F,O,y),_e&&Vs(O,y,F,"beforeUpdate"),F&&Bn(F,!0),(he.innerHTML&&me.innerHTML==null||he.textContent&&me.textContent==null)&&d(oe,""),ae?L(y.dynamicChildren,ae,oe,F,X,Dr(O,Y),Z):fe||R(y,O,oe,null,F,X,Dr(O,Y),Z,!1),re>0){if(re&16)H(oe,he,me,F,Y);else if(re&2&&he.class!==me.class&&i(oe,"class",null,me.class,Y),re&4&&i(oe,"style",he.style,me.style,Y),re&8){const Ae=O.dynamicProps;for(let Ie=0;Ie<Ae.length;Ie++){const Ne=Ae[Ie],Pe=he[Ne],He=me[Ne];(He!==Pe||Ne==="value")&&i(oe,Ne,Pe,He,Y,F)}}re&1&&y.children!==O.children&&d(oe,O.children)}else!fe&&ae==null&&H(oe,he,me,F,Y);((Te=me.onVnodeUpdated)||_e)&&kt(()=>{Te&&as(Te,F,O,y),_e&&Vs(O,y,F,"updated")},X)},L=(y,O,F,X,Y,Z,fe)=>{for(let oe=0;oe<O.length;oe++){const re=y[oe],ae=O[oe],_e=re.el&&(re.type===Nt||!Is(re,ae)||re.shapeFlag&198)?u(re.el):F;b(re,ae,_e,null,X,Y,Z,fe,!0)}},H=(y,O,F,X,Y)=>{if(O!==F){if(O!==qe)for(const Z in O)!cn(Z)&&!(Z in F)&&i(y,Z,O[Z],null,Y,X);for(const Z in F){if(cn(Z))continue;const fe=F[Z],oe=O[Z];fe!==oe&&Z!=="value"&&i(y,Z,oe,fe,Y,X)}"value"in F&&i(y,"value",O.value,F.value,Y)}},P=(y,O,F,X,Y,Z,fe,oe,re)=>{const ae=O.el=y?y.el:r(""),_e=O.anchor=y?y.anchor:r("");let{patchFlag:he,dynamicChildren:me,slotScopeIds:Te}=O;Te&&(oe=oe?oe.concat(Te):Te),y==null?(n(ae,F,X),n(_e,F,X),T(O.children||[],F,_e,Y,Z,fe,oe,re)):he>0&&he&64&&me&&y.dynamicChildren&&y.dynamicChildren.length===me.length?(L(y.dynamicChildren,me,F,Y,Z,fe,oe),(O.key!=null||Y&&O===Y.subTree)&&nc(y,O,!0)):R(y,O,F,_e,Y,Z,fe,oe,re)},M=(y,O,F,X,Y,Z,fe,oe,re)=>{O.slotScopeIds=oe,y==null?O.shapeFlag&512?Y.ctx.activate(O,F,X,fe,re):K(O,F,X,Y,Z,fe,re):ne(y,O,re)},K=(y,O,F,X,Y,Z,fe)=>{const oe=y.component=Ep(y,X,Y);if(Vi(y)&&(oe.ctx.renderer=ye),Rp(oe,!1,fe),oe.asyncDep){if(Y&&Y.registerDep(oe,U,fe),!y.el){const re=oe.subTree=ut(yt);E(null,re,O,F),y.placeholder=re.el}}else U(oe,y,O,F,Y,Z,fe)},ne=(y,O,F)=>{const X=O.component=y.component;if(vb(y,O,F))if(X.asyncDep&&!X.asyncResolved){I(X,O,F);return}else X.next=O,X.update();else O.el=y.el,X.vnode=O},U=(y,O,F,X,Y,Z,fe)=>{const oe=()=>{if(y.isMounted){let{next:he,bu:me,u:Te,parent:Ae,vnode:Ie}=y;{const V=vp(y);if(V){he&&(he.el=Ie.el,I(y,he,fe)),V.asyncDep.then(()=>{kt(()=>{y.isUnmounted||ae()},Y)});return}}let Ne=he,Pe;Bn(y,!1),he?(he.el=Ie.el,I(y,he,fe)):he=Ie,me&&Ta(me),(Pe=he.props&&he.props.onVnodeBeforeUpdate)&&as(Pe,Ae,he,Ie),Bn(y,!0);const He=pl(y),st=y.subTree;y.subTree=He,b(st,He,u(st.el),B(st),y,Y,Z),he.el=He.el,Ne===null&&pr(y,He.el),Te&&kt(Te,Y),(Pe=he.props&&he.props.onVnodeUpdated)&&kt(()=>as(Pe,Ae,he,Ie),Y)}else{let he;const{el:me,props:Te}=O,{bm:Ae,m:Ie,parent:Ne,root:Pe,type:He}=y,st=un(O);if(Bn(y,!1),Ae&&Ta(Ae),!st&&(he=Te&&Te.onVnodeBeforeMount)&&as(he,Ne,O),Bn(y,!0),me&&Ue){const V=()=>{y.subTree=pl(y),Ue(me,y.subTree,y,Y,null)};st&&He.__asyncHydrate?He.__asyncHydrate(me,y,V):V()}else{Pe.ce&&Pe.ce._hasShadowRoot()&&Pe.ce._injectChildStyle(He,y.parent?y.parent.type:void 0);const V=y.subTree=pl(y);b(null,V,F,X,y,Y,Z),O.el=V.el}if(Ie&&kt(Ie,Y),!st&&(he=Te&&Te.onVnodeMounted)){const V=O;kt(()=>as(he,Ne,V),Y)}(O.shapeFlag&256||Ne&&un(Ne.vnode)&&Ne.vnode.shapeFlag&256)&&y.a&&kt(y.a,Y),y.isMounted=!0,O=F=X=null}};y.scope.on();const re=y.effect=new yi(oe);y.scope.off();const ae=y.update=re.run.bind(re),_e=y.job=re.runIfDirty.bind(re);_e.i=y,_e.id=y.uid,re.scheduler=()=>qo(_e),Bn(y,!0),ae()},I=(y,O,F)=>{O.component=y;const X=y.vnode.props;y.vnode=O,y.next=null,yb(y,O.props,X,F),wb(y,O.children,F),hn(),ld(y),gn()},R=(y,O,F,X,Y,Z,fe,oe,re=!1)=>{const ae=y&&y.children,_e=y?y.shapeFlag:0,he=O.children,{patchFlag:me,shapeFlag:Te}=O;if(me>0){if(me&128){z(ae,he,F,X,Y,Z,fe,oe,re);return}else if(me&256){j(ae,he,F,X,Y,Z,fe,oe,re);return}}Te&8?(_e&16&&we(ae,Y,Z),he!==ae&&d(F,he)):_e&16?Te&16?z(ae,he,F,X,Y,Z,fe,oe,re):we(ae,Y,Z,!0):(_e&8&&d(F,""),Te&16&&T(he,F,X,Y,Z,fe,oe,re))},j=(y,O,F,X,Y,Z,fe,oe,re)=>{y=y||ka,O=O||ka;const ae=y.length,_e=O.length,he=Math.min(ae,_e);let me;for(me=0;me<he;me++){const Te=O[me]=re?tn(O[me]):ls(O[me]);b(y[me],Te,F,null,Y,Z,fe,oe,re)}ae>_e?we(y,Y,Z,!0,!1,he):T(O,F,X,Y,Z,fe,oe,re,he)},z=(y,O,F,X,Y,Z,fe,oe,re)=>{let ae=0;const _e=O.length;let he=y.length-1,me=_e-1;for(;ae<=he&&ae<=me;){const Te=y[ae],Ae=O[ae]=re?tn(O[ae]):ls(O[ae]);if(Is(Te,Ae))b(Te,Ae,F,null,Y,Z,fe,oe,re);else break;ae++}for(;ae<=he&&ae<=me;){const Te=y[he],Ae=O[me]=re?tn(O[me]):ls(O[me]);if(Is(Te,Ae))b(Te,Ae,F,null,Y,Z,fe,oe,re);else break;he--,me--}if(ae>he){if(ae<=me){const Te=me+1,Ae=Te<_e?O[Te].el:X;for(;ae<=me;)b(null,O[ae]=re?tn(O[ae]):ls(O[ae]),F,Ae,Y,Z,fe,oe,re),ae++}}else if(ae>me)for(;ae<=he;)ie(y[ae],Y,Z,!0),ae++;else{const Te=ae,Ae=ae,Ie=new Map;for(ae=Ae;ae<=me;ae++){const De=O[ae]=re?tn(O[ae]):ls(O[ae]);De.key!=null&&Ie.set(De.key,ae)}let Ne,Pe=0;const He=me-Ae+1;let st=!1,V=0;const ke=new Array(He);for(ae=0;ae<He;ae++)ke[ae]=0;for(ae=Te;ae<=he;ae++){const De=y[ae];if(Pe>=He){ie(De,Y,Z,!0);continue}let We;if(De.key!=null)We=Ie.get(De.key);else for(Ne=Ae;Ne<=me;Ne++)if(ke[Ne-Ae]===0&&Is(De,O[Ne])){We=Ne;break}We===void 0?ie(De,Y,Z,!0):(ke[We-Ae]=ae+1,We>=V?V=We:st=!0,b(De,O[We],F,null,Y,Z,fe,oe,re),Pe++)}const Oe=st?Sb(ke):ka;for(Ne=Oe.length-1,ae=He-1;ae>=0;ae--){const De=Ae+ae,We=O[De],ze=O[De+1],ft=De+1<_e?ze.el||bp(ze):X;ke[ae]===0?b(null,We,F,ft,Y,Z,fe,oe,re):st&&(Ne<0||ae!==Oe[Ne]?ee(We,F,ft,2):Ne--)}}},ee=(y,O,F,X,Y=null)=>{const{el:Z,type:fe,transition:oe,children:re,shapeFlag:ae}=y;if(ae&6){ee(y.component.subTree,O,F,X);return}if(ae&128){y.suspense.move(O,F,X);return}if(ae&64){fe.move(y,O,F,ye);return}if(fe===Nt){n(Z,O,F);for(let he=0;he<re.length;he++)ee(re[he],O,F,X);n(y.anchor,O,F);return}if(fe===Jn){g(y,O,F);return}if(X!==2&&ae&1&&oe)if(X===0)oe.persisted&&!Z[_s]?n(Z,O,F):(oe.beforeEnter(Z),n(Z,O,F),kt(()=>oe.enter(Z),Y));else{const{leave:he,delayLeave:me,afterLeave:Te}=oe,Ae=()=>{y.ctx.isUnmounted?a(Z):n(Z,O,F)},Ie=()=>{const Ne=Z._isLeaving||!!Z[_s];Z._isLeaving&&Z[_s](!0),oe.persisted&&!Ne?Ae():he(Z,()=>{Ae(),Te&&Te()})};me?me(Z,Ae,Ie):Ie()}else n(Z,O,F)},ie=(y,O,F,X=!1,Y=!1)=>{const{type:Z,props:fe,ref:oe,children:re,dynamicChildren:ae,shapeFlag:_e,patchFlag:he,dirs:me,cacheIndex:Te,memo:Ae}=y;if(he===-2&&(Y=!1),oe!=null&&(hn(),Ea(oe,null,F,y,!0),gn()),Te!=null&&(O.renderCache[Te]=void 0),_e&256){O.ctx.deactivate(y);return}const Ie=_e&1&&me,Ne=!un(y);let Pe;if(Ne&&(Pe=fe&&fe.onVnodeBeforeUnmount)&&as(Pe,O,y),_e&6)se(y.component,F,X);else{if(_e&128){y.suspense.unmount(F,X);return}Ie&&Vs(y,null,O,"beforeUnmount"),_e&64?y.type.remove(y,O,F,ye,X):ae&&!ae.hasOnce&&(Z!==Nt||he>0&&he&64)?we(ae,O,F,!1,!0):(Z===Nt&&he&384||!Y&&_e&16)&&we(re,O,F),X&&de(y)}const He=Ae!=null&&Te==null;(Ne&&(Pe=fe&&fe.onVnodeUnmounted)||Ie||He)&&kt(()=>{Pe&&as(Pe,O,y),Ie&&Vs(y,null,O,"unmounted"),He&&(y.el=null)},F)},de=y=>{const{type:O,el:F,anchor:X,transition:Y}=y;if(O===Nt){N(F,X);return}if(O===Jn){x(y);return}const Z=()=>{a(F),Y&&!Y.persisted&&Y.afterLeave&&Y.afterLeave()};if(y.shapeFlag&1&&Y&&!Y.persisted){const{leave:fe,delayLeave:oe}=Y,re=()=>fe(F,Z);oe?oe(y.el,Z,re):re()}else Z()},N=(y,O)=>{let F;for(;y!==O;)F=f(y),a(y),y=F;a(O)},se=(y,O,F)=>{const{bum:X,scope:Y,job:Z,subTree:fe,um:oe,m:re,a:ae}=y;Al(re),Al(ae),X&&Ta(X),Y.stop(),Z&&(Z.flags|=8,ie(fe,y,O,F)),oe&&kt(oe,O),kt(()=>{y.isUnmounted=!0},O)},we=(y,O,F,X=!1,Y=!1,Z=0)=>{for(let fe=Z;fe<y.length;fe++)ie(y[fe],O,F,X,Y)},B=y=>{if(y.shapeFlag&6)return B(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const O=f(y.anchor||y.el),F=O&&O[Bf];return F?f(F):O};let pe=!1;const ce=(y,O,F)=>{let X;y==null?O._vnode&&(ie(O._vnode,null,null,!0),X=O._vnode.component):b(O._vnode||null,y,O,null,null,null,F),O._vnode=y,pe||(pe=!0,ld(X),Tl(),pe=!1)},ye={p:b,um:ie,m:ee,r:de,mt:K,mc:T,pc:R,pbc:L,n:B,o:e};let ve,Ue;return t&&([ve,Ue]=t(ye)),{render:ce,hydrate:ve,createApp:db(ce,ve)}}function Dr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Bn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function mp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function nc(e,t,s=!1){const n=e.children,a=t.children;if(be(n)&&be(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=tn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&nc(l,r)),r.type===Ln&&(r.patchFlag===-1&&(r=a[i]=tn(r)),r.el=l.el),r.type===yt&&!r.el&&(r.el=l.el)}}function Sb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function vp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:vp(t)}function Al(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function bp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?bp(t.subTree):null}const Rl=e=>e.__isSuspense;let uo=0;const Tb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Eb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Ab(e,t,s,n,a,l,r,o,c)}},hydrate:Rb,normalize:Ib},Cb=Tb;function Ci(e,t){const s=e.props&&e.props[t];Re(s)&&s()}function Eb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),f=e.suspense=yp(e,a,n,t,u,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,u,null,n,f,i,l),f.deps>0?(Ci(e,"onPending"),Ci(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Aa(f,e.ssFallback)):f.resolve(!1,!0)}function Ab(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:m,pendingBranch:b,isInFallback:w,isHydrating:E}=u;if(b)u.pendingBranch=f,Is(b,f)?(o(b,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():w&&(E||(o(m,p,s,n,a,null,i,l,r),Aa(u,p)))):(u.pendingId=uo++,E?(u.isHydrating=!1,u.activeBranch=b):c(b,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),w?(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(m,p,s,n,a,null,i,l,r),Aa(u,p))):m&&Is(m,f)?(o(m,f,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(m&&Is(m,f))o(m,f,s,n,a,u,i,l,r),Aa(u,f);else if(Ci(t,"onPending"),u.pendingBranch=f,f.shapeFlag&512?u.pendingId=f.component.suspenseId:u.pendingId=uo++,o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:v,pendingId:g}=u;v>0?setTimeout(()=>{u.pendingId===g&&u.fallback(p)},v):v===0&&u.fallback(p)}}function yp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:f,um:p,n:m,o:{parentNode:b,remove:w}}=c;let E;const v=Ob(e);v&&t&&t.pendingBranch&&(E=t.pendingId,t.deps++);const g=e.props?xl(e.props.timeout):void 0,x=i,k={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:uo++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,A=!1){const{vnode:T,activeBranch:C,pendingBranch:L,pendingId:H,effects:P,parentComponent:M,container:K,isInFallback:ne}=k;let U=!1;if(k.isHydrating)k.isHydrating=!1;else if(!_){U=C&&L.transition&&L.transition.mode==="out-in";let j=!1;U&&(C.transition.afterLeave=()=>{H===k.pendingId&&(f(L,K,i===x&&!j?m(C):i,0),ki(P),ne&&T.ssFallback&&(T.ssFallback.el=null))}),C&&!k.isFallbackMountPending&&(b(C.el)===K&&(i=m(C),j=!0),p(C,M,k,!0),!U&&ne&&T.ssFallback&&kt(()=>T.ssFallback.el=null,k)),U||f(L,K,i,0)}k.isFallbackMountPending=!1,Aa(k,L),k.pendingBranch=null,k.isInFallback=!1;let I=k.parent,R=!1;for(;I;){if(I.pendingBranch){I.effects.push(...P),R=!0;break}I=I.parent}!R&&!U&&ki(P),k.effects=[],v&&t&&t.pendingBranch&&E===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),Ci(T,"onResolve")},fallback(_){if(!k.pendingBranch)return;const{vnode:A,activeBranch:T,parentComponent:C,container:L,namespace:H}=k;Ci(A,"onFallback");const P=m(T),M=()=>{k.isFallbackMountPending=!1,k.isInFallback&&(u(null,_,L,P,C,null,H,r,o),Aa(k,_))},K=_.transition&&_.transition.mode==="out-in";K&&(k.isFallbackMountPending=!0,T.transition.afterLeave=M),k.isInFallback=!0,p(T,C,null,!0),K||M()},move(_,A,T){k.activeBranch&&f(k.activeBranch,_,A,T),k.container=_},next(){return k.activeBranch&&m(k.activeBranch)},registerDep(_,A,T){const C=!!k.pendingBranch;C&&k.deps++;const L=_.vnode.el;_.asyncDep.catch(H=>{la(H,_,0)}).then(H=>{if(_.isUnmounted||k.isUnmounted||k.pendingId!==_.suspenseId)return;Ri(),_.asyncResolved=!0;const{vnode:P}=_;fo(_,H,!1),L&&(P.el=L);const M=!L&&_.subTree.el;A(_,P,b(L||_.subTree.el),L?null:m(_.subTree),k,l,T),M&&(P.placeholder=null,w(M)),pr(_,P.el),C&&--k.deps===0&&k.resolve()})},unmount(_,A){k.isUnmounted=!0,k.activeBranch&&p(k.activeBranch,s,_,A),k.pendingBranch&&p(k.pendingBranch,s,_,A)}};return k}function Rb(e,t,s,n,a,i,l,r,o){const c=t.suspense=yp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Ib(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=xd(n?s.default:s),e.ssFallback=n?xd(s.fallback):ut(yt)}function xd(e){let t;if(Re(e)){const s=Xn&&e._c;s&&(e._d=!1,Ei()),e=e(),s&&(e._d=!0,t=jt,_p())}return be(e)&&(e=hb(e)),e=ls(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function xp(e,t){t&&t.pendingBranch?be(e)?t.effects.push(...e):t.effects.push(e):ki(e)}function Aa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,pr(n,a))}function Ob(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Nt=Symbol.for("v-fgt"),Ln=Symbol.for("v-txt"),yt=Symbol.for("v-cmt"),Jn=Symbol.for("v-stc"),fi=[];let jt=null;function Ei(e=!1){fi.push(jt=e?null:[])}function _p(){fi.pop(),jt=fi[fi.length-1]||null}let Xn=1;function Ai(e,t=!1){Xn+=e,e<0&&jt&&t&&(jt.hasOnce=!0)}function kp(e){return e.dynamicChildren=Xn>0?jt||ka:null,_p(),Xn>0&&jt&&jt.push(e),e}function Lb(e,t,s,n,a,i){return kp(ac(e,t,s,n,a,i,!0))}function Il(e,t,s,n,a){return kp(ut(e,t,s,n,a,!0))}function vn(e){return e?e.__v_isVNode===!0:!1}function Is(e,t){return e.type===t.type&&e.key===t.key}function Nb(e){}const wp=({key:e})=>e??null,hl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Me(e)||St(e)||Re(e)?{i:Ft,r:e,k:t,f:!!s}:e:null);function ac(e,t=null,s=null,n=0,a=null,i=e===Nt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&wp(t),ref:t&&hl(t),scopeId:rr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ft};return r?(lc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Me(s)?8:16),Xn>0&&!l&&jt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&jt.push(o),o}const ut=Db;function Db(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Qf)&&(e=yt),vn(e)){const r=Ks(e,t,!0);return s&&lc(r,s),Xn>0&&!i&&jt&&(r.shapeFlag&6?jt[jt.indexOf(e)]=r:jt.push(r)),r.patchFlag=-2,r}if(Hb(e)&&(e=e.__vccOpts),t){t=Sp(t);let{class:r,style:o}=t;r&&!Me(r)&&(t.class=$i(r)),Xe(o)&&(Ui(o)&&!be(o)&&(o=je({},o)),t.style=Fi(o))}const l=Me(e)?1:Rl(e)?128:Hf(e)?64:Xe(e)?4:Re(e)?2:0;return ac(e,t,s,n,a,l,i,!0)}function Sp(e){return e?Ui(e)||rp(e)?je({},e):e:null}function Ks(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Cp(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&wp(c),ref:t&&t.ref?s&&i?be(i)?i.concat(hl(t)):[i,hl(t)]:hl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Nt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ks(e.ssContent),ssFallback:e.ssFallback&&Ks(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&mn(d,o.clone(d)),d}function ic(e=" ",t=0){return ut(Ln,null,e,t)}function Mb(e,t){const s=ut(Jn,null,e);return s.staticCount=t,s}function Tp(e="",t=!1){return t?(Ei(),Il(yt,null,e)):ut(yt,null,e)}function ls(e){return e==null||typeof e=="boolean"?ut(yt):be(e)?ut(Nt,null,e.slice()):vn(e)?tn(e):ut(Ln,null,String(e))}function tn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ks(e)}function lc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(be(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),lc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!rp(t)?t._ctx=Ft:a===3&&Ft&&(Ft.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Re(t)?(t={default:t,_ctx:Ft},s=32):(t=String(t),n&64?(s=16,t=[ic(t)]):s=8);e.children=t,e.shapeFlag|=s}function Cp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=$i([t.class,n.class]));else if(a==="style")t.style=Fi([t.style,n.style]);else if(na(a)){const i=t[a],l=n[a];l&&i!==l&&!(be(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Jl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function as(e,t,s,n=null){hs(e,t,7,[s,n])}const Pb=tp();let Fb=0;function Ep(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Pb,i={uid:Fb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new $o(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:cp(n,a),emitsOptions:np(n,a),emit:null,emitted:null,propsDefaults:qe,inheritAttrs:n.inheritAttrs,ctx:qe,data:qe,props:qe,attrs:qe,slots:qe,refs:qe,setupState:qe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=fb.bind(null,i),e.ce&&e.ce(i),i}let Pt=null;const es=()=>Pt||Ft;let Ol,Ra;{const e=tr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Ol=t("__VUE_INSTANCE_SETTERS__",s=>Pt=s),Ra=t("__VUE_SSR_SETTERS__",s=>ea=s)}const Ka=e=>{const t=Pt;return Ol(e),e.scope.on(),()=>{e.scope.off(),Ol(t)}},Ri=()=>{Pt&&Pt.scope.off(),Ol(null)};function Ap(e){return e.vnode.shapeFlag&4}let ea=!1;function Rp(e,t=!1,s=!1){t&&Ra(t);const{props:n,children:a}=e.vnode,i=Ap(e);bb(e,n,i,t),kb(e,a,s||t);const l=i?$b(e,t):void 0;return t&&Ra(!1),l}function $b(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,lo);const{setup:n}=s;if(n){hn();const a=e.setupContext=n.length>1?Lp(e):null,i=Ka(e),l=qa(n,e,0,[e.props,a]),r=Fo(l);if(gn(),i(),(r||e.sp)&&!un(e)&&Zo(e),r){if(l.then(Ri,Ri),t)return l.then(o=>{fo(e,o,t)}).catch(o=>{la(o,e,0)});e.asyncDep=l}else fo(e,l,t)}else Op(e,t)}function fo(e,t,s){Re(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=zo(t)),Op(e,s)}let Ll,po;function Ip(e){Ll=e,po=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,zv))}}const Ub=()=>!Ll;function Op(e,t,s){const n=e.type;if(!e.render){if(!t&&Ll&&!n.render){const a=n.template||ec(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=je(je({isCustomElement:i,delimiters:r},l),o);n.render=Ll(a,c)}}e.render=n.render||$t,po&&po(e)}{const a=Ka(e);hn();try{ab(e)}finally{gn(),a()}}}const Bb={get(e,t){return Vt(e,"get",""),e[t]}};function Lp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Bb),slots:e.slots,emit:e.emit,expose:t}}function ji(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(zo(Cf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ui)return ui[s](e)},has(t,s){return s in t||s in ui}})):e.proxy}function ho(e,t=!0){return Re(e)?e.displayName||e.name:e.name||t&&e.__name}function Hb(e){return Re(e)&&"__vccOpts"in e}const te=(e,t)=>Gm(e,t,ea);function Da(e,t,s){try{Ai(-1);const n=arguments.length;return n===2?Xe(t)&&!be(t)?vn(t)?ut(e,null,[t]):ut(e,t):ut(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&vn(s)&&(s=[s]),ut(e,t,s))}finally{Ai(1)}}function Vb(){}function jb(e,t,s,n){const a=s[n];if(a&&Np(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Np(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Lt(s[n],t[n]))return!1;return Xn>0&&jt&&jt.push(e),!0}const Dp="3.5.38",zb=$t,qb=sv,Kb=va,Gb=Mf,Wb={createComponentInstance:Ep,setupComponent:Rp,renderComponentRoot:pl,setCurrentRenderingInstance:Si,isVNode:vn,normalizeVNode:ls,getComponentPublicInstance:ji,ensureValidVNode:Xo,pushWarningContext:Qm,popWarningContext:Xm},Zb=Wb,Jb=null,Yb=null,Qb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let go;const _d=typeof window<"u"&&window.trustedTypes;if(_d)try{go=_d.createPolicy("vue",{createHTML:e=>e})}catch{}const Mp=go?e=>go.createHTML(e):e=>e,Xb="http://www.w3.org/2000/svg",ey="http://www.w3.org/1998/Math/MathML",en=typeof document<"u"?document:null,kd=en&&en.createElement("template"),Pp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?en.createElementNS(Xb,e):t==="mathml"?en.createElementNS(ey,e):s?en.createElement(e,{is:s}):en.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>en.createTextNode(e),createComment:e=>en.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>en.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{kd.innerHTML=Mp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=kd.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},kn="transition",Ja="animation",Ma=Symbol("_vtc"),Fp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},$p=je({},Wo,Fp),ty=e=>(e.displayName="Transition",e.props=$p,e),sy=ty((e,{slots:t})=>Da(zf,Up(e),t)),Hn=(e,t=[])=>{be(e)?e.forEach(s=>s(...t)):e&&e(...t)},wd=e=>e?be(e)?e.some(t=>t.length>1):e.length>1:!1;function Up(e){const t={};for(const P in e)P in Fp||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,m=ny(a),b=m&&m[0],w=m&&m[1],{onBeforeEnter:E,onEnter:v,onEnterCancelled:g,onLeave:x,onLeaveCancelled:k,onBeforeAppear:_=E,onAppear:A=v,onAppearCancelled:T=g}=t,C=(P,M,K,ne)=>{P._enterCancelled=ne,Cn(P,M?d:r),Cn(P,M?c:l),K&&K()},L=(P,M)=>{P._isLeaving=!1,Cn(P,u),Cn(P,p),Cn(P,f),M&&M()},H=P=>(M,K)=>{const ne=P?A:v,U=()=>C(M,P,K);Hn(ne,[M,U]),Sd(()=>{Cn(M,P?o:i),$s(M,P?d:r),wd(ne)||Td(M,n,b,U)})};return je(t,{onBeforeEnter(P){Hn(E,[P]),$s(P,i),$s(P,l)},onBeforeAppear(P){Hn(_,[P]),$s(P,o),$s(P,c)},onEnter:H(!1),onAppear:H(!0),onLeave(P,M){P._isLeaving=!0;const K=()=>L(P,M);$s(P,u),P._enterCancelled?($s(P,f),mo(P)):(mo(P),$s(P,f)),Sd(()=>{P._isLeaving&&(Cn(P,u),$s(P,p),wd(x)||Td(P,n,w,K))}),Hn(x,[P,K])},onEnterCancelled(P){C(P,!1,void 0,!0),Hn(g,[P])},onAppearCancelled(P){C(P,!0,void 0,!0),Hn(T,[P])},onLeaveCancelled(P){L(P),Hn(k,[P])}})}function ny(e){if(e==null)return null;if(Xe(e))return[Mr(e.enter),Mr(e.leave)];{const t=Mr(e);return[t,t]}}function Mr(e){return xl(e)}function $s(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ma]||(e[Ma]=new Set)).add(t)}function Cn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ma];s&&(s.delete(t),s.size||(e[Ma]=void 0))}function Sd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let ay=0;function Td(e,t,s,n){const a=e._endId=++ay,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Bp(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,f)}function Bp(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${kn}Delay`),i=n(`${kn}Duration`),l=Cd(a,i),r=n(`${Ja}Delay`),o=n(`${Ja}Duration`),c=Cd(r,o);let d=null,u=0,f=0;t===kn?l>0&&(d=kn,u=l,f=i.length):t===Ja?c>0&&(d=Ja,u=c,f=o.length):(u=Math.max(l,c),d=u>0?l>c?kn:Ja:null,f=d?d===kn?i.length:o.length:0);const p=d===kn&&/\b(?:transform|all)(?:,|$)/.test(n(`${kn}Property`).toString());return{type:d,timeout:u,propCount:f,hasTransform:p}}function Cd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Ed(s)+Ed(e[n])))}function Ed(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function mo(e){return(e?e.ownerDocument:document).body.offsetHeight}function iy(e,t,s){const n=e[Ma];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Nl=Symbol("_vod"),rc=Symbol("_vsh"),Hp={name:"show",beforeMount(e,{value:t},{transition:s}){e[Nl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ya(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Ya(e,!0),n.enter(e)):n.leave(e,()=>{Ya(e,!1)}):Ya(e,t))},beforeUnmount(e,{value:t}){Ya(e,t)}};function Ya(e,t){e.style.display=t?e[Nl]:"none",e[rc]=!t}function ly(){Hp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Vp=Symbol("");function ry(e){const t=es();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Dl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Dl(t.ce,a):vo(t.subTree,a),s(a)};Jo(()=>{ki(n)}),Ye(()=>{Xt(n,$t,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),xt(()=>a.disconnect())})}function vo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{vo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Dl(e.el,t);else if(e.type===Nt)e.children.forEach(s=>vo(s,t));else if(e.type===Jn){let{el:s,anchor:n}=e;for(;s&&(Dl(s,t),s!==n);)s=s.nextSibling}}function Dl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=pm(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Vp]=n}}const oy=/(?:^|;)\s*display\s*:/;function cy(e,t,s){const n=e.style,a=Me(s);let i=!1;if(s&&!a){if(t)if(Me(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&li(n,r,"")}else for(const l in t)s[l]==null&&li(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?uy(e,l,!Me(t)&&t?t[l]:void 0,r)||li(n,l,r):li(n,l,"")}}else if(a){if(t!==s){const l=n[Vp];l&&(s+=";"+l),n.cssText=s,i=oy.test(s)}}else t&&e.removeAttribute("style");Nl in e&&(e[Nl]=i?n.display:"",e[rc]&&(n.display="none"))}const Ad=/\s*!important$/;function li(e,t,s){if(be(s))s.forEach(n=>li(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=dy(e,t);Ad.test(s)?e.setProperty(rs(n),s.replace(Ad,""),"important"):e[n]=s}}const Rd=["Webkit","Moz","ms"],Pr={};function dy(e,t){const s=Pr[t];if(s)return s;let n=it(t);if(n!=="filter"&&n in e)return Pr[t]=n;n=ia(n);for(let a=0;a<Rd.length;a++){const i=Rd[a]+n;if(i in e)return Pr[t]=i}return t}function uy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Me(n)&&s===n}const Id="http://www.w3.org/1999/xlink";function Od(e,t,s,n,a,i=um(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Id,t.slice(6,t.length)):e.setAttributeNS(Id,t,s):s==null||i&&!lf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":qt(s)?String(s):s)}function Ld(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Mp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=lf(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function ln(e,t,s,n){e.addEventListener(t,s,n)}function fy(e,t,s,n){e.removeEventListener(t,s,n)}const Nd=Symbol("_vei");function py(e,t,s,n,a=null){const i=e[Nd]||(e[Nd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=hy(t);if(n){const c=i[t]=vy(n,a);ln(e,r,c,o)}else l&&(fy(e,r,l,o),i[t]=void 0)}}const Dd=/(?:Once|Passive|Capture)$/;function hy(e){let t;if(Dd.test(e)){t={};let n;for(;n=e.match(Dd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):rs(e.slice(2)),t]}let Fr=0;const gy=Promise.resolve(),my=()=>Fr||(gy.then(()=>Fr=0),Fr=Date.now());function vy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(be(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&hs(c,t,5,r)}}else hs(a,t,5,[n])};return s.value=e,s.attached=my(),s}const Md=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,jp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?iy(e,n,l):t==="style"?cy(e,s,n):na(t)?Jl(t)||py(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):by(e,t,n,l))?(Ld(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Od(e,t,n,l,i,t!=="value")):e._isVueCE&&(yy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Me(n)))?Ld(e,it(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Od(e,t,n,l))};function by(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Md(t)&&Re(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Md(t)&&Me(s)?!1:t in e}function yy(e,t){const s=e._def.props;if(!s)return!1;const n=it(t);return Array.isArray(s)?s.some(a=>it(a)===n):Object.keys(s).some(a=>it(a)===n)}const Pd={};function zp(e,t,s){let n=Hi(e,t);Yl(n)&&(n=je({},n,t));class a extends hr{constructor(l){super(n,l,s)}}return a.def=n,a}const xy=((e,t)=>zp(e,t,nh)),_y=typeof HTMLElement<"u"?HTMLElement:class{};class hr extends _y{constructor(t,s={},n=Fl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Fl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof hr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Rt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!be(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=xl(this._props[o])),(r||(r=Object.create(null)))[it(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)et(this,n)||Object.defineProperty(this,n,{get:()=>zs(s[n])})}_resolveProps(t){const{props:s}=t,n=be(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(it))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Pd;const a=it(t);s&&this._numberProps&&this._numberProps[a]&&(n=xl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Pd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(rs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(rs(t),s+""):s||this.removeAttribute(rs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),sh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ut(this._def,je(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Yl(l[0])?je({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),rs(i)!==i&&a(rs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function qp(e){const t=es(),s=t&&t.ce;return s||null}function ky(){const e=qp();return e&&e.shadowRoot}function wy(e="$style"){{const t=es();if(!t)return qe;const s=t.type.__cssModules;if(!s)return qe;const n=s[e];return n||qe}}const Kp=new WeakMap,Gp=new WeakMap,Ml=Symbol("_moveCb"),Fd=Symbol("_enterCb"),Sy=e=>(delete e.props.mode,e),Ty=Sy({name:"TransitionGroup",props:je({},$p,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=es(),n=Go();let a,i;return dr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Iy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Ey),a.forEach(Ay);const r=a.filter(Ry);mo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;$s(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Ml]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Ml]=null,Cn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=Up(l);let o=l.tag||Nt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[rc]&&(a.push(d),mn(d,Na(d,r,n,s)),Kp.set(d,Wp(d.el)))}i=t.default?or(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&mn(d,Na(d,r,n,s))}return ut(o,null,i)}}}),Cy=Ty;function Ey(e){const t=e.el;t[Ml]&&t[Ml](),t[Fd]&&t[Fd]()}function Ay(e){Gp.set(e,Wp(e.el))}function Ry(e){const t=Kp.get(e),s=Gp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Wp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Iy(e,t,s){const n=e.cloneNode(),a=e[Ma];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Bp(n);return i.removeChild(n),l}const Dn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return be(t)?s=>Ta(t,s):t};function Oy(e){e.target.composing=!0}function $d(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ts=Symbol("_assign");function Ud(e,t,s){return t&&(e=e.trim()),s&&(e=er(e)),e}const Pl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ts]=Dn(a);const i=n||a.props&&a.props.type==="number";ln(e,t?"change":"input",l=>{l.target.composing||e[Ts](Ud(e.value,s,i))}),(s||i)&&ln(e,"change",()=>{e.value=Ud(e.value,s,i)}),t||(ln(e,"compositionstart",Oy),ln(e,"compositionend",$d),ln(e,"change",$d))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ts]=Dn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?er(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},oc={deep:!0,created(e,t,s){e[Ts]=Dn(s),ln(e,"change",()=>{const n=e._modelValue,a=Pa(e),i=e.checked,l=e[Ts];if(be(n)){const r=sr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(aa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Jp(e,i))})},mounted:Bd,beforeUpdate(e,t,s){e[Ts]=Dn(s),Bd(e,t,s)}};function Bd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(be(t))a=sr(t,n.props.value)>-1;else if(aa(t))a=t.has(n.props.value);else{if(t===s)return;a=pn(t,Jp(e,!0))}e.checked!==a&&(e.checked=a)}const cc={created(e,{value:t},s){e.checked=pn(t,s.props.value),e[Ts]=Dn(s),ln(e,"change",()=>{e[Ts](Pa(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ts]=Dn(n),t!==s&&(e.checked=pn(t,n.props.value))}},Zp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=aa(t);ln(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?er(Pa(l)):Pa(l));e[Ts](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Rt(()=>{e._assigning=!1})}),e[Ts]=Dn(n)},mounted(e,{value:t}){Hd(e,t)},beforeUpdate(e,t,s){e[Ts]=Dn(s)},updated(e,{value:t}){e._assigning||Hd(e,t)}};function Hd(e,t){const s=e.multiple,n=be(t);if(!(s&&!n&&!aa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Pa(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=sr(t,r)>-1}else l.selected=t.has(r);else if(pn(Pa(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Pa(e){return"_value"in e?e._value:e.value}function Jp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Yp={created(e,t,s){ll(e,t,s,null,"created")},mounted(e,t,s){ll(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){ll(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){ll(e,t,s,n,"updated")}};function Qp(e,t){switch(e){case"SELECT":return Zp;case"TEXTAREA":return Pl;default:switch(t){case"checkbox":return oc;case"radio":return cc;default:return Pl}}}function ll(e,t,s,n,a){const l=Qp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Ly(){Pl.getSSRProps=({value:e})=>({value:e}),cc.getSSRProps=({value:e},t)=>{if(t.props&&pn(t.props.value,e))return{checked:!0}},oc.getSSRProps=({value:e},t)=>{if(be(e)){if(t.props&&sr(e,t.props.value)>-1)return{checked:!0}}else if(aa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Yp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Qp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Ny=["ctrl","shift","alt","meta"],Dy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Ny.some(s=>e[`${s}Key`]&&!t.includes(s))},My=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Dy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Py={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Fy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=rs(a.key);if(t.some(l=>l===i||Py[l]===i))return e(a)}))},Xp=je({patchProp:jp},Pp);let pi,Vd=!1;function eh(){return pi||(pi=pp(Xp))}function th(){return pi=Vd?pi:hp(Xp),Vd=!0,pi}const sh=((...e)=>{eh().render(...e)}),$y=((...e)=>{th().hydrate(...e)}),Fl=((...e)=>{const t=eh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ih(n);if(!a)return;const i=t._component;!Re(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,ah(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),nh=((...e)=>{const t=th().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ih(n);if(a)return s(a,!0,ah(a))},t});function ah(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function ih(e){return Me(e)?document.querySelector(e):e}let jd=!1;const Uy=()=>{jd||(jd=!0,Ly(),ly())},By=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:zf,BaseTransitionPropsValidators:Wo,Comment:yt,DeprecationTypes:Qb,EffectScope:$o,ErrorCodes:tv,ErrorTypeStrings:qb,Fragment:Nt,KeepAlive:Dv,ReactiveEffect:yi,Static:Jn,Suspense:Cb,Teleport:mv,Text:Ln,TrackOpTypes:Wm,Transition:sy,TransitionGroup:Cy,TriggerOpTypes:Zm,VueElement:hr,assertNumber:ev,callWithAsyncErrorHandling:hs,callWithErrorHandling:qa,camelize:it,capitalize:ia,cloneVNode:Ks,compatUtils:Yb,computed:te,createApp:Fl,createBlock:Il,createCommentVNode:Tp,createElementBlock:Lb,createElementVNode:ac,createHydrationRenderer:hp,createPropsRestProxy:sb,createRenderer:pp,createSSRApp:nh,createSlots:Hv,createStaticVNode:Mb,createTextVNode:ic,createVNode:ut,customRef:Af,defineAsyncComponent:Lv,defineComponent:Hi,defineCustomElement:zp,defineEmits:Kv,defineExpose:Gv,defineModel:Jv,defineOptions:Wv,defineProps:qv,defineSSRCustomElement:xy,defineSlots:Zv,devtools:Kb,effect:vm,effectScope:hm,getCurrentInstance:es,getCurrentScope:df,getCurrentWatcher:Jm,getTransitionRawChildren:or,guardReactiveProps:Sp,h:Da,handleError:la,hasInjectionContext:cv,hydrate:$y,hydrateOnIdle:Cv,hydrateOnInteraction:Iv,hydrateOnMediaQuery:Rv,hydrateOnVisible:Av,initCustomFormatter:Vb,initDirectivesForSSR:Uy,inject:Ss,isMemoSame:Np,isProxy:Ui,isReactive:dn,isReadonly:qs,isRef:St,isRuntimeOnly:Ub,isShallow:cs,isVNode:vn,markRaw:Cf,mergeDefaults:eb,mergeModels:tb,mergeProps:Cp,nextTick:Rt,nodeOps:Pp,normalizeClass:$i,normalizeProps:tm,normalizeStyle:Fi,onActivated:Es,onBeforeMount:Gf,onBeforeUnmount:ur,onBeforeUpdate:Jo,onDeactivated:As,onErrorCaptured:Yf,onMounted:Ye,onRenderTracked:Jf,onRenderTriggered:Zf,onScopeDispose:gm,onServerPrefetch:Wf,onUnmounted:xt,onUpdated:dr,onWatcherCleanup:If,openBlock:Ei,patchProp:jp,popScopeId:lv,provide:di,proxyRefs:zo,pushScopeId:iv,queuePostFlushCb:ki,reactive:Mn,readonly:kl,ref:h,registerRuntimeCompiler:Ip,render:sh,renderList:Bv,renderSlot:Vv,resolveComponent:Fv,resolveDirective:Uv,resolveDynamicComponent:$v,resolveFilter:Jb,resolveTransitionHooks:Na,setBlockTracking:Ai,setDevtoolsHook:Gb,setTransitionHooks:mn,shallowReactive:Vo,shallowReadonly:Pm,shallowRef:jo,ssrContextKey:Pf,ssrUtils:Zb,stop:bm,toDisplayString:of,toHandlerKey:Sa,toHandlers:jv,toRaw:Je,toRef:qm,toRefs:Vm,toValue:Um,transformVNodeArgs:Nb,triggerRef:$m,unref:zs,useAttrs:Xv,useCssModule:wy,useCssVars:ry,useHost:qp,useId:bv,useModel:ub,useSSRContext:Ff,useShadowRoot:ky,useSlots:Qv,useTemplateRef:yv,useTransitionState:Go,vModelCheckbox:oc,vModelDynamic:Yp,vModelRadio:cc,vModelSelect:Zp,vModelText:Pl,vShow:Hp,version:Dp,warn:zb,watch:Xt,watchEffect:dv,watchPostEffect:uv,watchSyncEffect:$f,withAsyncContext:nb,withCtx:Ko,withDefaults:Yv,withDirectives:ov,withKeys:Fy,withMemo:jb,withModifiers:My,withScopeId:rv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ii=Symbol(""),hi=Symbol(""),dc=Symbol(""),$l=Symbol(""),lh=Symbol(""),ta=Symbol(""),rh=Symbol(""),oh=Symbol(""),uc=Symbol(""),fc=Symbol(""),zi=Symbol(""),pc=Symbol(""),ch=Symbol(""),hc=Symbol(""),gc=Symbol(""),mc=Symbol(""),vc=Symbol(""),bc=Symbol(""),yc=Symbol(""),dh=Symbol(""),uh=Symbol(""),gr=Symbol(""),Ul=Symbol(""),xc=Symbol(""),_c=Symbol(""),Oi=Symbol(""),qi=Symbol(""),kc=Symbol(""),bo=Symbol(""),Hy=Symbol(""),yo=Symbol(""),Bl=Symbol(""),Vy=Symbol(""),jy=Symbol(""),wc=Symbol(""),zy=Symbol(""),qy=Symbol(""),Sc=Symbol(""),fh=Symbol(""),Fa={[Ii]:"Fragment",[hi]:"Teleport",[dc]:"Suspense",[$l]:"KeepAlive",[lh]:"BaseTransition",[ta]:"openBlock",[rh]:"createBlock",[oh]:"createElementBlock",[uc]:"createVNode",[fc]:"createElementVNode",[zi]:"createCommentVNode",[pc]:"createTextVNode",[ch]:"createStaticVNode",[hc]:"resolveComponent",[gc]:"resolveDynamicComponent",[mc]:"resolveDirective",[vc]:"resolveFilter",[bc]:"withDirectives",[yc]:"renderList",[dh]:"renderSlot",[uh]:"createSlots",[gr]:"toDisplayString",[Ul]:"mergeProps",[xc]:"normalizeClass",[_c]:"normalizeStyle",[Oi]:"normalizeProps",[qi]:"guardReactiveProps",[kc]:"toHandlers",[bo]:"camelize",[Hy]:"capitalize",[yo]:"toHandlerKey",[Bl]:"setBlockTracking",[Vy]:"pushScopeId",[jy]:"popScopeId",[wc]:"withCtx",[zy]:"unref",[qy]:"isRef",[Sc]:"withMemo",[fh]:"isMemoSame"};function Ky(e){Object.getOwnPropertySymbols(e).forEach(t=>{Fa[t]=e[t]})}const vs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Gy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:vs}}function Li(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=vs){return e&&(r?(e.helper(ta),e.helper(Ba(e.inSSR,c))):e.helper(Ua(e.inSSR,c)),l&&e.helper(bc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function Yn(e,t=vs){return{type:17,loc:t,elements:e}}function ws(e,t=vs){return{type:15,loc:t,properties:e}}function wt(e,t){return{type:16,loc:vs,key:Me(e)?$e(e,!0):e,value:t}}function $e(e,t=!1,s=vs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Ls(e,t=vs){return{type:8,loc:t,children:e}}function It(e,t=[],s=vs){return{type:14,loc:s,callee:e,arguments:t}}function $a(e,t=void 0,s=!1,n=!1,a=vs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function xo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:vs}}function Wy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:vs}}function Zy(e){return{type:21,body:e,loc:vs}}function Ua(e,t){return e||t?uc:fc}function Ba(e,t){return e||t?rh:oh}function Tc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Ua(n,e.isComponent)),t(ta),t(Ba(n,e.isComponent)))}const zd=new Uint8Array([123,123]),qd=new Uint8Array([125,125]);function Kd(e){return e>=97&&e<=122||e>=65&&e<=90}function fs(e){return e===32||e===10||e===9||e===12||e===13}function wn(e){return e===47||e===62||fs(e)}function Hl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Ut={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Jy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=zd,this.delimiterClose=qd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=zd,this.delimiterClose=qd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?wn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||fs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Ut.TitleEnd||this.currentSequence===Ut.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Ut.Cdata[this.sequenceIndex]?++this.sequenceIndex===Ut.Cdata.length&&(this.state=28,this.currentSequence=Ut.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Ut.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Kd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){wn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(wn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Hl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){fs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Kd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||fs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):fs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):fs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||wn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||wn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||wn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||wn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||wn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):fs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):fs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){fs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Ut.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Ut.ScriptEnd[3]?this.startSpecial(Ut.ScriptEnd,4):t===Ut.StyleEnd[3]?this.startSpecial(Ut.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Ut.TitleEnd[3]?this.startSpecial(Ut.TitleEnd,4):t===Ut.TextareaEnd[3]?this.startSpecial(Ut.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Ut.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Gd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Qn(e,t){const s=Gd("MODE",t),n=Gd(e,t);return s===3?n===!0:n!==!1}function Ni(e,t,s,...n){return Qn(e,t)}function Cc(e){throw e}function ph(e){}function dt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const os=e=>e.type===4&&e.isStatic;function hh(e){switch(e){case"Teleport":case"teleport":return hi;case"Suspense":case"suspense":return dc;case"KeepAlive":case"keep-alive":return $l;case"BaseTransition":case"base-transition":return lh}}const Yy=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Ec=e=>!Yy.test(e),gh=/[A-Za-z_$\xA0-\uFFFF]/,Qy=/[\.\?\w$\xA0-\uFFFF]/,Xy=/\s+[.[]\s*|\s*[.[]\s+/g,mh=e=>e.type===4?e.content:e.loc.source,e0=e=>{const t=mh(e).trim().replace(Xy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?gh:Qy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},vh=e0,t0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,s0=e=>t0.test(mh(e)),n0=s0;function ks(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Me(t)?a.name===t:t.test(a.name)))return a}}function mr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&qn(i.arg,t))return i}}function qn(e,t){return!!(e&&os(e)&&e.content===t)}function a0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function $r(e){return e.type===5||e.type===2}function Wd(e){return e.type===7&&e.name==="pre"}function i0(e){return e.type===7&&e.name==="slot"}function Vl(e){return e.type===1&&e.tagType===3}function jl(e){return e.type===1&&e.tagType===2}const l0=new Set([Oi,qi]);function bh(e,t=[]){if(e&&!Me(e)&&e.type===14){const s=e.callee;if(!Me(s)&&l0.has(s))return bh(e.arguments[0],t.concat(e))}return[e,t]}function zl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Me(a)&&a.type===14){const r=bh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Me(a))n=ws([t]);else if(a.type===14){const r=a.arguments[0];!Me(r)&&r.type===15?Zd(t,r)||r.properties.unshift(t):a.callee===kc?n=It(s.helper(Ul),[ws([t]),a]):a.arguments.unshift(ws([t])),!n&&(n=a)}else a.type===15?(Zd(t,a)||a.properties.unshift(t),n=a):(n=It(s.helper(Ul),[ws([t]),a]),l&&l.callee===qi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Zd(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Di(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function r0(e){return e.type===14&&e.callee===Sc?e.arguments[1].returns:e}const o0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function yh(e){for(let t=0;t<e.length;t++)if(!fs(e.charCodeAt(t)))return!1;return!0}function Ac(e){return e.type===2&&yh(e.content)||e.type===12&&Ac(e.content)}function xh(e){return e.type===3||Ac(e)}const _h={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:xa,isPreTag:xa,isIgnoreNewlineTag:xa,isCustomElement:xa,onError:Cc,onWarn:ph,comments:!1,prefixIdentifiers:!1};let Qe=_h,Mi=null,fn="",Ht=null,Ke=null,ns="",Xs=-1,jn=-1,Rc=0,In=!1,_o=null;const ct=[],mt=new Jy(ct,{onerr:Js,ontext(e,t){rl(Mt(e,t),e,t)},ontextentity(e,t,s){rl(e,t,s)},oninterpolation(e,t){if(In)return rl(Mt(e,t),e,t);let s=e+mt.delimiterOpen.length,n=t-mt.delimiterClose.length;for(;fs(fn.charCodeAt(s));)s++;for(;fs(fn.charCodeAt(n-1));)n--;let a=Mt(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),ko({type:5,content:ml(a,!1,bt(s,n)),loc:bt(e,t)})},onopentagname(e,t){const s=Mt(e,t);Ht={type:1,tag:s,ns:Qe.getNamespace(s,ct[0],Qe.ns),tagType:0,props:[],children:[],loc:bt(e-1,t),codegenNode:void 0}},onopentagend(e){Yd(e)},onclosetag(e,t){const s=Mt(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<ct.length;a++)if(ct[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Js(24,ct[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ct.shift();gl(r,t,l<a)}break}n||Js(23,kh(e,60))}},onselfclosingtag(e){const t=Ht.tag;Ht.isSelfClosing=!0,Yd(e),ct[0]&&ct[0].tag===t&&gl(ct.shift(),e)},onattribname(e,t){Ke={type:6,name:Mt(e,t),nameLoc:bt(e,t),value:void 0,loc:bt(e)}},ondirname(e,t){const s=Mt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!In&&n===""&&Js(26,e),In||n==="")Ke={type:6,name:s,nameLoc:bt(e,t),value:void 0,loc:bt(e)};else if(Ke={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[$e("prop")]:[],loc:bt(e)},n==="pre"){In=mt.inVPre=!0,_o=Ht;const a=Ht.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=b0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Mt(e,t);if(In&&!Wd(Ke))Ke.name+=s,Kn(Ke.nameLoc,t);else{const n=s[0]!=="[";Ke.arg=ml(n?s:s.slice(1,-1),n,bt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Mt(e,t);if(In&&!Wd(Ke))Ke.name+="."+s,Kn(Ke.nameLoc,t);else if(Ke.name==="slot"){const n=Ke.arg;n&&(n.content+="."+s,Kn(n.loc,t))}else{const n=$e(s,!0,bt(e,t));Ke.modifiers.push(n)}},onattribdata(e,t){ns+=Mt(e,t),Xs<0&&(Xs=e),jn=t},onattribentity(e,t,s){ns+=e,Xs<0&&(Xs=t),jn=s},onattribnameend(e){const t=Ke.loc.start.offset,s=Mt(t,e);Ke.type===7&&(Ke.rawName=s),Ht.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Js(2,t)},onattribend(e,t){if(Ht&&Ke){if(Kn(Ke.loc,t),e!==0)if(ns.includes("&")&&(ns=Qe.decodeEntities(ns,!0)),Ke.type===6)Ke.name==="class"&&(ns=Sh(ns).trim()),e===1&&!ns&&Js(13,t),Ke.value={type:2,content:ns,loc:e===1?bt(Xs,jn):bt(Xs-1,jn+1)},mt.inSFCRoot&&Ht.tag==="template"&&Ke.name==="lang"&&ns&&ns!=="html"&&mt.enterRCDATA(Hl("</template"),0);else{let s=0;Ke.exp=ml(ns,!1,bt(Xs,jn),0,s),Ke.name==="for"&&(Ke.forParseResult=d0(Ke.exp));let n=-1;Ke.name==="bind"&&(n=Ke.modifiers.findIndex(a=>a.content==="sync"))>-1&&Ni("COMPILER_V_BIND_SYNC",Qe,Ke.loc,Ke.arg.loc.source)&&(Ke.name="model",Ke.modifiers.splice(n,1))}(Ke.type!==7||Ke.name!=="pre")&&Ht.props.push(Ke)}ns="",Xs=jn=-1},oncomment(e,t){Qe.comments&&ko({type:3,content:Mt(e,t),loc:bt(e-4,t+3)})},onend(){const e=fn.length;for(let t=0;t<ct.length;t++)gl(ct[t],e-1),Js(24,ct[t].loc.start.offset)},oncdata(e,t){(ct[0]?ct[0].ns:Qe.ns)!==0?rl(Mt(e,t),e,t):Js(1,e-9)},onprocessinginstruction(e){(ct[0]?ct[0].ns:Qe.ns)===0&&Js(21,e-1)}}),Jd=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,c0=/^\(|\)$/g;function d0(e){const t=e.loc,s=e.content,n=s.match(o0);if(!n)return;const[,a,i]=n,l=(u,f,p=!1)=>{const m=t.start.offset+f,b=m+u.length;return ml(u,!1,bt(m,b),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(c0,"").trim();const c=a.indexOf(o),d=o.match(Jd);if(d){o=o.replace(Jd,"").trim();const u=d[1].trim();let f;if(u&&(f=s.indexOf(u,c+o.length),r.key=l(u,f,!0)),d[2]){const p=d[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Mt(e,t){return fn.slice(e,t)}function Yd(e){mt.inSFCRoot&&(Ht.innerLoc=bt(e+1,e+1)),ko(Ht);const{tag:t,ns:s}=Ht;s===0&&Qe.isPreTag(t)&&Rc++,Qe.isVoidTag(t)?gl(Ht,e):(ct.unshift(Ht),(s===1||s===2)&&(mt.inXML=!0)),Ht=null}function rl(e,t,s){{const i=ct[0]&&ct[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=ct[0]||Mi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Kn(a.loc,s)):n.children.push({type:2,content:e,loc:bt(t,s)})}function gl(e,t,s=!1){s?Kn(e.loc,kh(t,60)):Kn(e.loc,u0(t,62)+1),mt.inSFCRoot&&(e.children.length?e.innerLoc.end=je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=je({},e.innerLoc.start),e.innerLoc.source=Mt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(In||(n==="slot"?e.tagType=2:Qd(e)?e.tagType=3:p0(e)&&(e.tagType=1)),mt.inRCDATA||(e.children=wh(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Rc--,_o===e&&(In=mt.inVPre=!1,_o=null),mt.inXML&&(ct[0]?ct[0].ns:Qe.ns)===0&&(mt.inXML=!1);{const l=e.props;if(!mt.inSFCRoot&&Qn("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!Qd(e)){const o=ct[0]||Mi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Ni("COMPILER_INLINE_TEMPLATE",Qe,r.loc)&&e.children.length&&(r.value={type:2,content:Mt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function u0(e,t){let s=e;for(;fn.charCodeAt(s)!==t&&s<fn.length-1;)s++;return s}function kh(e,t){let s=e;for(;fn.charCodeAt(s)!==t&&s>=0;)s--;return s}const f0=new Set(["if","else","else-if","for","slot"]);function Qd({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&f0.has(t[s].name))return!0}return!1}function p0({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||h0(e.charCodeAt(0))||hh(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Ni("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&qn(n.arg,"is")&&Ni("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function h0(e){return e>64&&e<91}const g0=/\r\n/g;function wh(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Rc)a.content=a.content.replace(g0,`
`);else if(yh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&m0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Sh(a.content))}return s?e.filter(Boolean):e}function m0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Sh(e){let t="",s=!1;for(let n=0;n<e.length;n++)fs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function ko(e){(ct[0]||Mi).children.push(e)}function bt(e,t){return{start:mt.getPos(e),end:t==null?t:mt.getPos(t),source:t==null?t:Mt(e,t)}}function v0(e){return bt(e.start.offset,e.end.offset)}function Kn(e,t){e.end=mt.getPos(t),e.source=Mt(e.start.offset,t)}function b0(e){const t={type:6,name:e.rawName,nameLoc:bt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function ml(e,t=!1,s,n=0,a=0){return $e(e,t,s,n)}function Js(e,t,s){Qe.onError(dt(e,bt(t,t)))}function y0(){mt.reset(),Ht=null,Ke=null,ns="",Xs=-1,jn=-1,ct.length=0}function x0(e,t){if(y0(),fn=e,Qe=je({},_h),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}mt.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,mt.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(mt.delimiterOpen=Hl(s[0]),mt.delimiterClose=Hl(s[1]));const n=Mi=Gy([],e);return mt.parse(fn),n.loc=bt(0,e.length),n.children=wh(n.children),Mi=null,n}function _0(e,t){vl(e,void 0,t,!!Th(e))}function Th(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!jl(t[0])?t[0]:null}function vl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const f=n?0:ps(u,s);if(f>0){if(f>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const p=u.codegenNode;if(p.type===13){const m=p.patchFlag;if((m===void 0||m===512||m===1)&&Eh(u,s)>=2){const b=Ah(u);b&&(p.props=s.hoist(b))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(u.type===12&&(n?0:ps(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const f=u.tagType===1;f&&s.scopes.vSlot++,vl(u,e,s,!1,a),f&&s.scopes.vSlot--}else if(u.type===11)vl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let f=0;f<u.branches.length;f++)vl(u.branches[f],e,s,u.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&be(e.codegenNode.children))e.codegenNode.children=o(Yn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!be(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(Yn(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!be(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ks(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(Yn(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!be(d.children)&&d.children.type===15){const f=d.children.properties.find(p=>p.key===u||p.key.content===u);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ps(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Eh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ps(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ps(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ta),t.removeHelper(Ba(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Ua(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ps(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Me(r)||qt(r))continue;const o=ps(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const k0=new Set([xc,_c,Oi,qi]);function Ch(e,t){if(e.type===14&&!Me(e.callee)&&k0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ps(s,t);if(s.type===14)return Ch(s,t)}return 0}function Eh(e,t){let s=3;const n=Ah(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ps(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ps(r,t):r.type===14?c=Ch(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Ah(e){const t=e.codegenNode;if(t.type===13)return t.props}function w0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=$t,isCustomElement:d=$t,expressionPlugins:u=[],scopeId:f=null,slotted:p=!0,ssr:m=!1,inSSR:b=!1,ssrCssVars:w="",bindingMetadata:E=qe,inline:v=!1,isTS:g=!1,onError:x=Cc,onWarn:k=ph,compatConfig:_}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:A&&ia(it(A[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:f,slotted:p,ssr:m,inSSR:b,ssrCssVars:w,bindingMetadata:E,inline:v,isTS:g,onError:x,onWarn:k,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const L=T.helpers.get(C)||0;return T.helpers.set(C,L+1),C},removeHelper(C){const L=T.helpers.get(C);if(L){const H=L-1;H?T.helpers.set(C,H):T.helpers.delete(C)}},helperString(C){return`_${Fa[T.helper(C)]}`},replaceNode(C){T.parent.children[T.childIndex]=T.currentNode=C},removeNode(C){const L=T.parent.children,H=C?L.indexOf(C):T.currentNode?T.childIndex:-1;!C||C===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>H&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(H,1)},onNodeRemoved:$t,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){Me(C)&&(C=$e(C)),T.hoists.push(C);const L=$e(`_hoisted_${T.hoists.length}`,!1,C.loc,2);return L.hoisted=C,L},cache(C,L=!1,H=!1){const P=Wy(T.cached.length,C,L,H);return T.cached.push(P),P}};return T.filters=new Set,T}function S0(e,t){const s=w0(e,t);vr(e,s),t.hoistStatic&&_0(e,s),t.ssr||T0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function T0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Th(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Tc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Li(t,s(Ii),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function C0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Me(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,vr(a,t))}}function vr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(be(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(zi);break;case 5:t.ssr||t.helper(gr);break;case 9:for(let i=0;i<e.branches.length;i++)vr(e.branches[i],t);break;case 10:case 11:case 1:case 0:C0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Rh(e,t){const s=Me(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(i0))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const br="/*@__PURE__*/",Ih=e=>`${Fa[e]}: _${Fa[e]}`;function E0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(b){return`_${Fa[b]}`},push(b,w=-2,E){p.code+=b},indent(){m(++p.indentLevel)},deindent(b=!1){b?--p.indentLevel:m(--p.indentLevel)},newline(){m(p.indentLevel)}};function m(b){p.push(`
`+"  ".repeat(b),0)}return p}function A0(e,t={}){const s=E0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),f=u.length>0,p=!i&&n!=="module";R0(e,s);const b=d?"ssrRender":"render",E=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${b}(${E}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${u.map(Ih).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Ur(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Ur(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Ur(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let v=0;v<e.temps;v++)a(`${v>0?", ":""}_temp${v}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?zt(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function R0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[uc,fc,zi,pc,ch].filter(f=>d.includes(f)).map(Ih).join(", ");a(`const { ${u} } = _Vue
`,-1)}I0(e.hoists,t),i(),a("return ")}function Ur(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?vc:t==="component"?hc:mc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Di(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function I0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),zt(i,t),n())}t.pure=!1}function Ic(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ki(e,t,s),s&&t.deindent(),t.push("]")}function Ki(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Me(r)?a(r,-3):be(r)?Ic(r,t):zt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function zt(e,t){if(Me(e)){t.push(e,-3);return}if(qt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:zt(e.codegenNode,t);break;case 2:O0(e,t);break;case 4:Oh(e,t);break;case 5:L0(e,t);break;case 12:zt(e.codegenNode,t);break;case 8:Lh(e,t);break;case 3:D0(e,t);break;case 13:M0(e,t);break;case 14:F0(e,t);break;case 15:$0(e,t);break;case 17:U0(e,t);break;case 18:B0(e,t);break;case 19:H0(e,t);break;case 20:V0(e,t);break;case 21:Ki(e.body,t,!0,!1);break}}function O0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Oh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function L0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(br),s(`${n(gr)}(`),zt(e.content,t),s(")")}function Lh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Me(n)?t.push(n,-3):zt(n,t)}}function N0(e,t){const{push:s}=t;if(e.type===8)s("["),Lh(e,t),s("]");else if(e.isStatic){const n=Ec(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function D0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(br),s(`${n(zi)}(${JSON.stringify(e.content)})`,-3,e)}function M0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:f,isComponent:p}=e;let m;o&&(m=String(o)),d&&s(n(bc)+"("),u&&s(`(${n(ta)}(${f?"true":""}), `),a&&s(br);const b=u?Ba(t.inSSR,p):Ua(t.inSSR,p);s(n(b)+"(",-2,e),Ki(P0([i,l,r,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),zt(d,t),s(")"))}function P0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function F0(e,t){const{push:s,helper:n,pure:a}=t,i=Me(e.callee)?e.callee:n(e.callee);a&&s(br),s(i+"(",-2,e),Ki(e.arguments,t),s(")")}function $0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];N0(c,t),s(": "),zt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function U0(e,t){Ic(e.elements,t)}function B0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Fa[wc]}(`),s("(",-2,e),be(i)?Ki(i,t):i&&zt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),be(l)?Ic(l,t):zt(l,t)):r&&zt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function H0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Ec(s.content);u&&l("("),Oh(s,t),u&&l(")")}else l("("),zt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),zt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,zt(a,t),d||t.indentLevel--,i&&o(!0)}function V0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Bl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),zt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Bl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const j0=Rh(/^(?:if|else|else-if)$/,(e,t,s)=>z0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=eu(a,o,s);else{const c=q0(n.codegenNode);c.alternate=eu(a,o+n.branches.length-1,s)}}}));function z0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(dt(28,t.loc)),t.exp=$e("true",!1,a)}if(t.name==="if"){const a=Xd(e,t),i={type:9,loc:v0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&xh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(dt(30,e.loc)),s.removeNode();const r=Xd(e,t);l.branches.push(r);const o=n&&n(l,r,!1);vr(r,s),o&&o(),s.currentNode=null}else s.onError(dt(30,e.loc));break}}}function Xd(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ks(e,"for")?e.children:[e],userKey:mr(e,"key"),isTemplateIf:s}}function eu(e,t,s){return e.condition?xo(e.condition,tu(e,t,s),It(s.helper(zi),['""',"true"])):tu(e,t,s)}function tu(e,t,s){const{helper:n}=s,a=wt("key",$e(`${t}`,!1,vs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return zl(o,a,s),o}else return Li(s,n(Ii),ws([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=r0(o);return c.type===13&&Tc(c,s),zl(c,a,s),o}}function q0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const K0=Rh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return G0(e,t,s,i=>{const l=It(n(yc),[i.source]),r=Vl(e),o=ks(e,"memo"),c=mr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?$e(c.value.content,!0):void 0:c.exp);const u=d?wt("key",d):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=Li(s,n(Ii),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let m;const{children:b}=i,w=b.length!==1||b[0].type!==1,E=jl(e)?e:r&&e.children.length===1&&jl(e.children[0])?e.children[0]:null;if(E?(m=E.codegenNode,r&&u&&zl(m,u,s)):w?m=Li(s,n(Ii),u?ws([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=b[0].codegenNode,r&&u&&zl(m,u,s),m.isBlock!==!f&&(m.isBlock?(a(ta),a(Ba(s.inSSR,m.isComponent))):a(Ua(s.inSSR,m.isComponent))),m.isBlock=!f,m.isBlock?(n(ta),n(Ba(s.inSSR,m.isComponent))):n(Ua(s.inSSR,m.isComponent))),o){const v=$a(wo(i.parseResult,[$e("_cached")]));v.body=Zy([Ls(["const _memo = (",o.exp,")"]),Ls(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(fh)}(_cached, _memo)) return _cached`]),Ls(["const _item = ",m]),$e("_item.memo = _memo"),$e("return _item")]),l.arguments.push(v,$e("_cache"),$e(String(s.cached.length))),s.cached.push(null)}else l.arguments.push($a(wo(i.parseResult),m,!0))}})});function G0(e,t,s,n){if(!t.exp){s.onError(dt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(dt(32,t.loc));return}Nh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Vl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Nh(e,t){e.finalized||(e.finalized=!0)}function wo({value:e,key:t,index:s},n=[]){return W0([e,t,s,...n])}function W0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||$e("_".repeat(n+1),!1))}const su=$e("undefined",!1),Z0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ks(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},J0=(e,t,s,n)=>$a(e,s,!1,!0,s.length?s[0].loc:n);function Y0(e,t,s=J0){t.helper(wc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ks(e,"slot",!0);if(o){const{arg:w,exp:E}=o;w&&!os(w)&&(r=!0),i.push(wt(w||$e("default",!0),s(E,void 0,n,a)))}let c=!1,d=!1;const u=[],f=new Set;let p=0;for(let w=0;w<n.length;w++){const E=n[w];let v;if(!Vl(E)||!(v=ks(E,"slot",!0))){E.type!==3&&u.push(E);continue}if(o){t.onError(dt(37,v.loc));break}c=!0;const{children:g,loc:x}=E,{arg:k=$e("default",!0),exp:_,loc:A}=v;let T;os(k)?T=k?k.content:"default":r=!0;const C=ks(E,"for"),L=s(_,C,g,x);let H,P;if(H=ks(E,"if"))r=!0,l.push(xo(H.exp,ol(k,L,p++),su));else if(P=ks(E,/^else(?:-if)?$/,!0)){let M=w,K;for(;M--&&(K=n[M],!!xh(K)););if(K&&Vl(K)&&ks(K,/^(?:else-)?if$/)){let ne=l[l.length-1];for(;ne.alternate.type===19;)ne=ne.alternate;ne.alternate=P.exp?xo(P.exp,ol(k,L,p++),su):ol(k,L,p++)}else t.onError(dt(30,P.loc))}else if(C){r=!0;const M=C.forParseResult;M?(Nh(M),l.push(It(t.helper(yc),[M.source,$a(wo(M),ol(k,L),!0)]))):t.onError(dt(32,C.loc))}else{if(T){if(f.has(T)){t.onError(dt(38,A));continue}f.add(T),T==="default"&&(d=!0)}i.push(wt(k,L))}}if(!o){const w=(E,v)=>{const g=s(E,void 0,v,a);return t.compatConfig&&(g.isNonScopedSlot=!0),wt("default",g)};c?u.length&&!u.every(Ac)&&(d?t.onError(dt(39,u[0].loc)):i.push(w(void 0,u))):i.push(w(void 0,n))}const m=r?2:bl(e.children)?3:1;let b=ws(i.concat(wt("_",$e(m+"",!1))),a);return l.length&&(b=It(t.helper(uh),[b,Yn(l)])),{slots:b,hasDynamicSlots:r}}function ol(e,t,s){const n=[wt("name",e),wt("fn",t)];return s!=null&&n.push(wt("key",$e(String(s),!0))),ws(n)}function bl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||bl(s.children))return!0;break;case 9:if(bl(s.branches))return!0;break;case 10:case 11:if(bl(s.children))return!0;break}}return!1}const Dh=new WeakMap,Q0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?X0(e,t):`"${n}"`;const r=Xe(l)&&l.callee===gc;let o,c,d=0,u,f,p,m=r||l===hi||l===dc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const b=Mh(e,t,void 0,i,r);o=b.props,d=b.patchFlag,f=b.dynamicPropNames;const w=b.directives;p=w&&w.length?Yn(w.map(E=>tx(E,t))):void 0,b.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===$l&&(m=!0,d|=1024),i&&l!==hi&&l!==$l){const{slots:w,hasDynamicSlots:E}=Y0(e,t);c=w,E&&(d|=1024)}else if(e.children.length===1&&l!==hi){const w=e.children[0],E=w.type,v=E===5||E===8;v&&ps(w,t)===0&&(d|=1),v||E===2?c=w:c=e.children}else c=e.children;f&&f.length&&(u=sx(f)),e.codegenNode=Li(t,l,o,c,d===0?void 0:d,u,p,!!m,!1,i,e.loc)};function X0(e,t,s=!1){let{tag:n}=e;const a=So(n),i=mr(e,"is",!1,!0);if(i)if(a||Qn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&$e(i.value.content,!0):(r=i.exp,r||(r=$e("is",!1,i.arg.loc))),r)return It(t.helper(gc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=hh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(hc),t.components.add(n),Di(n,"component"))}function Mh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],f=o.length>0;let p=!1,m=0,b=!1,w=!1,E=!1,v=!1,g=!1,x=!1;const k=[],_=L=>{c.length&&(d.push(ws(nu(c),r)),c=[]),L&&d.push(L)},A=()=>{t.scopes.vFor>0&&c.push(wt($e("ref_for",!0),$e("true")))},T=({key:L,value:H})=>{if(os(L)){const P=L.content,M=na(P);if(M&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!cn(P)&&(v=!0),M&&cn(P)&&(x=!0),M&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ps(H,t)>0)return;P==="ref"?b=!0:P==="class"?w=!0:P==="style"?E=!0:P!=="key"&&!k.includes(P)&&k.push(P),n&&(P==="class"||P==="style")&&!k.includes(P)&&k.push(P)}else g=!0};for(let L=0;L<s.length;L++){const H=s[L];if(H.type===6){const{loc:P,name:M,nameLoc:K,value:ne}=H;let U=!0;if(M==="ref"&&(b=!0,A()),M==="is"&&(So(l)||ne&&ne.content.startsWith("vue:")||Qn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(wt($e(M,!0,K),$e(ne?ne.content:"",U,ne?ne.loc:P)))}else{const{name:P,arg:M,exp:K,loc:ne,modifiers:U}=H,I=P==="bind",R=P==="on";if(P==="slot"){n||t.onError(dt(40,ne));continue}if(P==="once"||P==="memo"||P==="is"||I&&qn(M,"is")&&(So(l)||Qn("COMPILER_IS_ON_ELEMENT",t))||R&&i)continue;if((I&&qn(M,"key")||R&&f&&qn(M,"vue:before-update"))&&(p=!0),I&&qn(M,"ref")&&A(),!M&&(I||R)){if(g=!0,K)if(I){if(_(),Qn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(K);continue}A(),_(),d.push(K)}else _({type:14,loc:ne,callee:t.helper(kc),arguments:n?[K]:[K,"true"]});else t.onError(dt(I?34:35,ne));continue}I&&U.some(z=>z.content==="prop")&&(m|=32);const j=t.directiveTransforms[P];if(j){const{props:z,needRuntime:ee}=j(H,e,t);!i&&z.forEach(T),R&&M&&!os(M)?_(ws(z,r)):c.push(...z),ee&&(u.push(H),qt(ee)&&Dh.set(H,ee))}else Kg(P)||(u.push(H),f&&(p=!0))}}let C;if(d.length?(_(),d.length>1?C=It(t.helper(Ul),d,r):C=d[0]):c.length&&(C=ws(nu(c),r)),g?m|=16:(w&&!n&&(m|=2),E&&!n&&(m|=4),k.length&&(m|=8),v&&(m|=32)),!p&&(m===0||m===32)&&(b||x||u.length>0)&&(m|=512),!t.inSSR&&C)switch(C.type){case 15:let L=-1,H=-1,P=!1;for(let ne=0;ne<C.properties.length;ne++){const U=C.properties[ne].key;os(U)?U.content==="class"?L=ne:U.content==="style"&&(H=ne):U.isHandlerKey||(P=!0)}const M=C.properties[L],K=C.properties[H];P?C=It(t.helper(Oi),[C]):(M&&!os(M.value)&&(M.value=It(t.helper(xc),[M.value])),K&&(E||K.value.type===4&&K.value.content.trim()[0]==="["||K.value.type===17)&&(K.value=It(t.helper(_c),[K.value])));break;case 14:break;default:C=It(t.helper(Oi),[It(t.helper(qi),[C])]);break}return{props:C,directives:u,patchFlag:m,dynamicPropNames:k,shouldUseBlock:p}}function nu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||na(i))&&ex(l,a):(t.set(i,a),s.push(a))}return s}function ex(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Yn([e.value,t.value],e.loc)}function tx(e,t){const s=[],n=Dh.get(e);n?s.push(t.helperString(n)):(t.helper(mc),t.directives.add(e.name),s.push(Di(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=$e("true",!1,a);s.push(ws(e.modifiers.map(l=>wt(l,i)),a))}return Yn(s,e.loc)}function sx(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function So(e){return e==="component"||e==="Component"}const nx=(e,t)=>{if(jl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=ax(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=$a([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=It(t.helper(dh),l,n)}};function ax(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=it(l.name),a.push(l)));else if(l.name==="bind"&&qn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=it(l.arg.content);s=l.exp=$e(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&os(l.arg)&&(l.arg.content=it(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Mh(e,t,a,!1,!1);n=i,l.length&&t.onError(dt(36,l[0].loc))}return{slotName:s,slotProps:n}}const Ph=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(dt(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const f=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Sa(it(u)):`on:${u}`;r=$e(f,!0,l.loc)}else r=Ls([`${s.helperString(yo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(yo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=vh(o),f=!(u||n0(o)),p=o.content.includes(";");(f||c&&u)&&(o=Ls([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let d={props:[wt(r,o||$e("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},ix=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=it(i.content):i.content=`${s.helperString(bo)}(${i.content})`:(i.children.unshift(`${s.helperString(bo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&au(i,"."),n.some(r=>r.content==="attr")&&au(i,"^")),{props:[wt(i,l)]}},au=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},lx=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if($r(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if($r(o))n||(n=s[i]=Ls([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if($r(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ps(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:It(t.helper(pc),r)}}}}},iu=new WeakSet,rx=(e,t)=>{if(e.type===1&&ks(e,"once",!0))return iu.has(e)||t.inVOnce||t.inSSR?void 0:(iu.add(e),t.inVOnce=!0,t.helper(Bl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Fh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(dt(41,e.loc)),Qa();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(dt(44,n.loc)),Qa();if(r==="literal-const"||r==="setup-const")return s.onError(dt(45,n.loc)),Qa();if(!l.trim()||!vh(n))return s.onError(dt(42,n.loc)),Qa();const o=a||$e("modelValue",!0),c=a?os(a)?`onUpdate:${it(a.content)}`:Ls(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ls([`${u} => ((`,n,") = $event)"]);const f=[wt(o,e.exp),wt(c,d)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(b=>b.content).map(b=>(Ec(b)?b:JSON.stringify(b))+": true").join(", "),m=a?os(a)?`${a.content}Modifiers`:Ls([a,' + "Modifiers"']):"modelModifiers";f.push(wt(m,$e(`{ ${p} }`,!1,e.loc,2)))}return Qa(f)};function Qa(e=[]){return{props:e}}const ox=/[\w).+\-_$\]]/,cx=(e,t)=>{Qn("COMPILER_FILTERS",t)&&(e.type===5?ql(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&ql(s.exp,t)}))};function ql(e,t){if(e.type===4)lu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?lu(n,t):n.type===8?ql(e,t):n.type===5&&ql(n.content,t))}}function lu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,f,p,m,b=[];for(p=0;p<s.length;p++)if(f=u,u=s.charCodeAt(p),n)u===39&&f!==92&&(n=!1);else if(a)u===34&&f!==92&&(a=!1);else if(i)u===96&&f!==92&&(i=!1);else if(l)u===47&&f!==92&&(l=!1);else if(u===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)m===void 0?(d=p+1,m=s.slice(0,p).trim()):w();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let E=p-1,v;for(;E>=0&&(v=s.charAt(E),v===" ");E--);(!v||!ox.test(v))&&(l=!0)}}m===void 0?m=s.slice(0,p).trim():d!==0&&w();function w(){b.push(s.slice(d,p).trim()),d=p+1}if(b.length){for(p=0;p<b.length;p++)m=dx(m,b[p],t);e.content=m,e.ast=void 0}}function dx(e,t,s){s.helper(vc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Di(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Di(a,"filter")}(${e}${i!==")"?","+i:i}`}}const ru=new WeakSet,ux=(e,t)=>{if(e.type===1){const s=ks(e,"memo");return!s||ru.has(e)||t.inSSR?void 0:(ru.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Tc(n,t),e.codegenNode=It(t.helper(Sc),[s.exp,$a(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},fx=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(dt(53,n.loc)),s.exp=$e("",!0,n.loc);else{const a=it(n.content);(gh.test(a[0])||a[0]==="-")&&(s.exp=$e(a,!1,n.loc))}}}};function px(e){return[[fx,rx,j0,ux,K0,cx,nx,Q0,Z0,lx],{on:Ph,bind:ix,model:Fh}]}function hx(e,t={}){const s=t.onError||Cc,n=t.mode==="module";t.prefixIdentifiers===!0?s(dt(48)):n&&s(dt(49));const a=!1;t.cacheHandlers&&s(dt(50)),t.scopeId&&!n&&s(dt(51));const i=je({},t,{prefixIdentifiers:a}),l=Me(e)?x0(e,i):e,[r,o]=px();return S0(l,je({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:je({},o,t.directiveTransforms||{})})),A0(l,i)}const gx=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $h=Symbol(""),Uh=Symbol(""),Bh=Symbol(""),Hh=Symbol(""),To=Symbol(""),Vh=Symbol(""),jh=Symbol(""),zh=Symbol(""),qh=Symbol(""),Kh=Symbol("");Ky({[$h]:"vModelRadio",[Uh]:"vModelCheckbox",[Bh]:"vModelText",[Hh]:"vModelSelect",[To]:"vModelDynamic",[Vh]:"withModifiers",[jh]:"withKeys",[zh]:"vShow",[qh]:"Transition",[Kh]:"TransitionGroup"});let pa;function mx(e,t=!1){return pa||(pa=document.createElement("div")),t?(pa.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,pa.children[0].getAttribute("foo")):(pa.innerHTML=e,pa.textContent)}const vx={parseMode:"html",isVoidTag:cm,isNativeTag:e=>lm(e)||rm(e)||om(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:mx,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return qh;if(e==="TransitionGroup"||e==="transition-group")return Kh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},bx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:$e("style",!0,t.loc),exp:yx(t.value.content,t.loc),modifiers:[],loc:t.loc})})},yx=(e,t)=>{const s=af(e);return $e(JSON.stringify(s),!1,t,3)};function Nn(e,t){return dt(e,t)}const xx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Nn(54,a)),t.children.length&&(s.onError(Nn(55,a)),t.children.length=0),{props:[wt($e("innerHTML",!0,a),n||$e("",!0))]}},_x=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Nn(56,a)),t.children.length&&(s.onError(Nn(57,a)),t.children.length=0),{props:[wt($e("textContent",!0),n?ps(n,s)>0?n:It(s.helperString(gr),[n],a):$e("",!0))]}},kx=(e,t,s)=>{const n=Fh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Nn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Bh,r=!1;if(a==="input"||i){const o=mr(t,"type");if(o){if(o.type===7)l=To;else if(o.value)switch(o.value.content){case"radio":l=$h;break;case"checkbox":l=Uh;break;case"file":r=!0,s.onError(Nn(60,e.loc));break}}else a0(t)&&(l=To)}else a==="select"&&(l=Hh);r||(n.needRuntime=s.helper(l))}else s.onError(Nn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},wx=ms("passive,once,capture"),Sx=ms("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),Tx=ms("left,right"),Gh=ms("onkeyup,onkeydown,onkeypress"),Cx=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Ni("COMPILER_V_ON_NATIVE",s)||wx(o)?l.push(o):Tx(o)?os(e)?Gh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):Sx(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},ou=(e,t)=>os(e)&&e.content.toLowerCase()==="onclick"?$e(t,!0):e.type!==4?Ls(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,Ex=(e,t,s)=>Ph(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=Cx(i,a,s,e.loc);if(o.includes("right")&&(i=ou(i,"onContextmenu")),o.includes("middle")&&(i=ou(i,"onMouseup")),o.length&&(l=It(s.helper(Vh),[l,JSON.stringify(o)])),r.length&&(!os(i)||Gh(i.content.toLowerCase()))&&(l=It(s.helper(jh),[l,JSON.stringify(r)])),c.length){const d=c.map(ia).join("");i=os(i)?$e(`${i.content}${d}`,!0):Ls(["(",i,`) + "${d}"`])}return{props:[wt(i,l)]}}),Ax=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Nn(62,a)),{props:[],needRuntime:s.helper(zh)}},Rx=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},Ix=[bx],Ox={cloak:gx,html:xx,text:_x,model:kx,on:Ex,show:Ax};function Lx(e,t={}){return hx(e,je({},vx,t,{nodeTransforms:[Rx,...Ix,...t.nodeTransforms||[]],directiveTransforms:je({},Ox,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const cu=Object.create(null);function Nx(e,t){if(!Me(e))if(e.nodeType)e=e.innerHTML;else return $t;const s=Zg(e,t),n=cu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=je({hoistStatic:!0,onError:void 0,onWarn:$t},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=Lx(e,a),l=new Function("Vue",i)(By);return l._rc=!0,cu[s]=l}Ip(Nx);const Kl=Mn({items:[]});let Dx=1;function yr(e,t="info",s=3e3){const n=Dx++;return Kl.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Oc(n),s),n}function Oc(e){const t=Kl.items.findIndex(s=>s.id===e);t>=0&&Kl.items.splice(t,1)}function Ee(e,t="info",s=3e3){return yr(e,t,s)}Ee.success=(e,t=3e3)=>yr(e,"success",t);Ee.error=(e,t=5e3)=>yr(e,"error",t);Ee.info=(e,t=3e3)=>yr(e,"info",t);Ee.dismiss=Oc;const Mx={setup(){return{state:Kl,dismiss:Oc}},template:`
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
  `},sn=Mn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ia=null;function gs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ia&&Ia(!1),sn.title=e,sn.message=t,sn.confirmLabel=s,sn.cancelLabel=n,sn.danger=a,sn.open=!0,new Promise(i=>{Ia=i})}function du(e){sn.open=!1,Ia&&(Ia(e),Ia=null)}const Px={setup(){function e(t){sn.open&&t.key==="Escape"&&(t.stopPropagation(),du(!1))}return Ye(()=>document.addEventListener("keydown",e,!0)),xt(()=>document.removeEventListener("keydown",e,!0)),{state:sn,settle:du}},template:`
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
 */const ba=typeof document<"u";function Wh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Fx(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Wh(e.default)}const nt=Object.assign;function Br(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ds(a)?a.map(e):e(a)}return s}const gi=()=>{},Ds=Array.isArray;function uu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Zh=/#/g,$x=/&/g,Ux=/\//g,Bx=/=/g,Hx=/\?/g,Jh=/\+/g,Vx=/%5B/g,jx=/%5D/g,Yh=/%5E/g,zx=/%60/g,Qh=/%7B/g,qx=/%7C/g,Xh=/%7D/g,Kx=/%20/g;function Lc(e){return e==null?"":encodeURI(""+e).replace(qx,"|").replace(Vx,"[").replace(jx,"]")}function Gx(e){return Lc(e).replace(Qh,"{").replace(Xh,"}").replace(Yh,"^")}function Co(e){return Lc(e).replace(Jh,"%2B").replace(Kx,"+").replace(Zh,"%23").replace($x,"%26").replace(zx,"`").replace(Qh,"{").replace(Xh,"}").replace(Yh,"^")}function Wx(e){return Co(e).replace(Bx,"%3D")}function Zx(e){return Lc(e).replace(Zh,"%23").replace(Hx,"%3F")}function Jx(e){return Zx(e).replace(Ux,"%2F")}function Pi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Yx=/\/$/,Qx=e=>e.replace(Yx,"");function Hr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=s_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Pi(l)}}function Xx(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function fu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function e_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ha(t.matched[n],s.matched[a])&&eg(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ha(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function eg(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!t_(e[s],t[s]))return!1;return!0}function t_(e,t){return Ds(e)?pu(e,t):Ds(t)?pu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function pu(e,t){return Ds(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function s_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Sn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Eo=(function(e){return e.pop="pop",e.push="push",e})({}),Vr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function n_(e){if(!e)if(ba){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Qx(e)}const a_=/^[^#]+#/;function i_(e,t){return e.replace(a_,"#")+t}function l_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const xr=()=>({left:window.scrollX,top:window.scrollY});function r_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=l_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function hu(e,t){return(history.state?history.state.position-t:-1)+e}const Ao=new Map;function o_(e,t){Ao.set(e,t)}function c_(e){const t=Ao.get(e);return Ao.delete(e),t}function d_(e){return typeof e=="string"||e&&typeof e=="object"}function tg(e){return typeof e=="string"||typeof e=="symbol"}let gt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const sg=Symbol("");gt.MATCHER_NOT_FOUND+"",gt.NAVIGATION_GUARD_REDIRECT+"",gt.NAVIGATION_ABORTED+"",gt.NAVIGATION_CANCELLED+"",gt.NAVIGATION_DUPLICATED+"";function Va(e,t){return nt(new Error,{type:e,[sg]:!0},t)}function Ys(e,t){return e instanceof Error&&sg in e&&(t==null||!!(e.type&t))}const u_=["params","query","hash"];function f_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of u_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function p_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Jh," "),i=a.indexOf("="),l=Pi(i<0?a:a.slice(0,i)),r=i<0?null:Pi(a.slice(i+1));if(l in t){let o=t[l];Ds(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function gu(e){let t="";for(let s in e){const n=e[s];if(s=Wx(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ds(n)?n.map(a=>a&&Co(a)):[n&&Co(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function h_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ds(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const g_=Symbol(""),mu=Symbol(""),_r=Symbol(""),Nc=Symbol(""),Ro=Symbol("");function Xa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function On(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Va(gt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):d_(f)?o(Va(gt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(f=>o(f))})}function jr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Wh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(On(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=Fx(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const f=(u.__vccOpts||u)[t];return f&&On(f,s,n,l,r,a)()}))}}return i}function m_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ha(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ha(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let v_=()=>location.protocol+"//"+location.host;function ng(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),fu(r,"")}return fu(s,e)+n+a}function b_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=ng(e,location),m=s.value,b=t.value;let w=0;if(f){if(s.value=p,t.value=f,l&&l===m){l=null;return}w=b?f.position-b.position:0}else n(p);a.forEach(E=>{E(s.value,m,{delta:w,type:Eo.pop,direction:w?w>0?Vr.forward:Vr.back:Vr.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const m=a.indexOf(f);m>-1&&a.splice(m,1)};return i.push(p),p}function d(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(nt({},f.state,{scroll:xr()}),"")}}function u(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function vu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?xr():null}}function y_(e){const{history:t,location:s}=window,n={value:ng(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),f=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:v_()+e+o;try{t[d?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[d?"replace":"assign"](f)}}function l(o,c){i(o,nt({},t.state,vu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=nt({},a.value,t.state,{forward:o,scroll:xr()});i(d.current,d,!0),i(o,nt({},vu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function x_(e){e=n_(e);const t=y_(e),s=b_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=nt({location:"",base:e,go:n,createHref:i_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function __(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),x_(e)}let Gn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Et=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Et||{});const k_={type:Gn.Static,value:""},w_=/[a-zA-Z0-9_]/;function S_(e){if(!e)return[[]];if(e==="/")return[[k_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=Et.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Et.Static?i.push({type:Gn.Static,value:c}):s===Et.Param||s===Et.ParamRegExp||s===Et.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Gn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Et.ParamRegExp){n=s,s=Et.EscapeNext;continue}switch(s){case Et.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Et.Param):f();break;case Et.EscapeNext:f(),s=n;break;case Et.Param:o==="("?s=Et.ParamRegExp:w_.test(o)?f():(u(),s=Et.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Et.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Et.ParamRegExpEnd:d+=o;break;case Et.ParamRegExpEnd:u(),s=Et.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Et.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const bu="[^/]+?",T_={sensitive:!1,strict:!1,start:!0,end:!0};var Jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Jt||{});const C_=/[.+*?^${}()[\]/\\]/g;function E_(e,t){const s=nt({},T_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Jt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const f=c[u];let p=Jt.Segment+(s.sensitive?Jt.BonusCaseSensitive:0);if(f.type===Gn.Static)u||(a+="/"),a+=f.value.replace(C_,"\\$&"),p+=Jt.Static;else if(f.type===Gn.Param){const{value:m,repeatable:b,optional:w,regexp:E}=f;i.push({name:m,repeatable:b,optional:w});const v=E||bu;if(v!==bu){p+=Jt.BonusCustomRegExp;try{`${v}`}catch(x){throw new Error(`Invalid custom RegExp for param "${m}" (${v}): `+x.message)}}let g=b?`((?:${v})(?:/(?:${v}))*)`:`(${v})`;u||(g=w&&c.length<2?`(?:/${g})`:"/"+g),w&&(g+="?"),a+=g,p+=Jt.Dynamic,w&&(p+=Jt.BonusOptional),b&&(p+=Jt.BonusRepeatable),v===".*"&&(p+=Jt.BonusWildcard)}d.push(p)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let f=1;f<d.length;f++){const p=d[f]||"",m=i[f-1];u[m.name]=p&&m.repeatable?p.split("/"):p}return u}function o(c){let d="",u=!1;for(const f of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const p of f)if(p.type===Gn.Static)d+=p.value;else if(p.type===Gn.Param){const{value:m,repeatable:b,optional:w}=p,E=m in c?c[m]:"";if(Ds(E)&&!b)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const v=Ds(E)?E.join("/"):E;if(!v)if(w)f.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=v}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function A_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Jt.Static+Jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Jt.Static+Jt.Segment?1:-1:0}function ag(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=A_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(yu(n))return 1;if(yu(a))return-1}return a.length-n.length}function yu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const R_={strict:!1,end:!0,sensitive:!1};function I_(e,t,s){const n=E_(S_(e.path),s),a=nt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function O_(e,t){const s=[],n=new Map;t=uu(R_,t);function a(u){return n.get(u)}function i(u,f,p){const m=!p,b=_u(u);b.aliasOf=p&&p.record;const w=uu(t,u),E=[b];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const k of x)E.push(_u(nt({},b,{components:p?p.record.components:b.components,path:k,aliasOf:p?p.record:b})))}let v,g;for(const x of E){const{path:k}=x;if(f&&k[0]!=="/"){const _=f.record.path,A=_[_.length-1]==="/"?"":"/";x.path=f.record.path+(k&&A+k)}if(v=I_(x,f,w),p?p.alias.push(v):(g=g||v,g!==v&&g.alias.push(v),m&&u.name&&!ku(v)&&l(u.name)),ig(v)&&o(v),b.children){const _=b.children;for(let A=0;A<_.length;A++)i(_[A],v,p&&p.children[A])}p=p||v}return g?()=>{l(g)}:gi}function l(u){if(tg(u)){const f=n.get(u);f&&(n.delete(u),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(u);f>-1&&(s.splice(f,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const f=D_(u,s);s.splice(f,0,u),u.record.name&&!ku(u)&&n.set(u.record.name,u)}function c(u,f){let p,m={},b,w;if("name"in u&&u.name){if(p=n.get(u.name),!p)throw Va(gt.MATCHER_NOT_FOUND,{location:u});w=p.record.name,m=nt(xu(f.params,p.keys.filter(g=>!g.optional).concat(p.parent?p.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&xu(u.params,p.keys.map(g=>g.name))),b=p.stringify(m)}else if(u.path!=null)b=u.path,p=s.find(g=>g.re.test(b)),p&&(m=p.parse(b),w=p.record.name);else{if(p=f.name?n.get(f.name):s.find(g=>g.re.test(f.path)),!p)throw Va(gt.MATCHER_NOT_FOUND,{location:u,currentLocation:f});w=p.record.name,m=nt({},f.params,u.params),b=p.stringify(m)}const E=[];let v=p;for(;v;)E.unshift(v.record),v=v.parent;return{name:w,path:b,params:m,matched:E,meta:N_(E)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function xu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function _u(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:L_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function L_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function ku(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function N_(e){return e.reduce((t,s)=>nt(t,s.meta),{})}function D_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;ag(e,t[i])<0?n=i:s=i+1}const a=M_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function M_(e){let t=e;for(;t=t.parent;)if(ig(t)&&ag(e,t)===0)return t}function ig({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function wu(e){const t=Ss(_r),s=Ss(Nc),n=te(()=>{const o=zs(e.to);return t.resolve(o)}),a=te(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const f=u.findIndex(Ha.bind(null,d));if(f>-1)return f;const p=Su(o[c-2]);return c>1&&Su(d)===p&&u[u.length-1].path!==p?u.findIndex(Ha.bind(null,o[c-2])):f}),i=te(()=>a.value>-1&&B_(s.params,n.value.params)),l=te(()=>a.value>-1&&a.value===s.matched.length-1&&eg(s.params,n.value.params));function r(o={}){if(U_(o)){const c=t[zs(e.replace)?"replace":"push"](zs(e.to)).catch(gi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:te(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function P_(e){return e.length===1?e[0]:e}const F_=Hi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:wu,setup(e,{slots:t}){const s=Mn(wu(e)),{options:n}=Ss(_r),a=te(()=>({[Tu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Tu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&P_(t.default(s));return e.custom?i:Da("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),$_=F_;function U_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function B_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ds(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Su(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Tu=(e,t,s)=>e??t??s,H_=Hi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ss(Ro),a=te(()=>e.route||n.value),i=Ss(mu,0),l=te(()=>{let c=zs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=te(()=>a.value.matched[l.value]);di(mu,te(()=>l.value+1)),di(g_,r),di(Ro,a);const o=h();return Xt(()=>[o.value,r.value,e.name],([c,d,u],[f,p,m])=>{d&&(d.instances[u]=c,p&&p!==d&&c&&c===f&&(d.leaveGuards.size||(d.leaveGuards=p.leaveGuards),d.updateGuards.size||(d.updateGuards=p.updateGuards))),c&&d&&(!p||!Ha(d,p)||!f)&&(d.enterCallbacks[u]||[]).forEach(b=>b(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,f=u&&u.components[d];if(!f)return Cu(s.default,{Component:f,route:c});const p=u.props[d],m=p?p===!0?c.params:typeof p=="function"?p(c):p:null,w=Da(f,nt({},m,t,{onVnodeUnmounted:E=>{E.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Cu(s.default,{Component:w,route:c})||w}}});function Cu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const V_=H_;function j_(e){const t=O_(e.routes,e),s=e.parseQuery||p_,n=e.stringifyQuery||gu,a=e.history,i=Xa(),l=Xa(),r=Xa(),o=jo(Sn);let c=Sn;ba&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Br.bind(null,B=>""+B),u=Br.bind(null,Jx),f=Br.bind(null,Pi);function p(B,pe){let ce,ye;return tg(B)?(ce=t.getRecordMatcher(B),ye=pe):ye=B,t.addRoute(ye,ce)}function m(B){const pe=t.getRecordMatcher(B);pe&&t.removeRoute(pe)}function b(){return t.getRoutes().map(B=>B.record)}function w(B){return!!t.getRecordMatcher(B)}function E(B,pe){if(pe=nt({},pe||o.value),typeof B=="string"){const O=Hr(s,B,pe.path),F=t.resolve({path:O.path},pe),X=a.createHref(O.fullPath);return nt(O,F,{params:f(F.params),hash:Pi(O.hash),redirectedFrom:void 0,href:X})}let ce;if(B.path!=null)ce=nt({},B,{path:Hr(s,B.path,pe.path).path});else{const O=nt({},B.params);for(const F in O)O[F]==null&&delete O[F];ce=nt({},B,{params:u(O)}),pe.params=u(pe.params)}const ye=t.resolve(ce,pe),ve=B.hash||"";ye.params=d(f(ye.params));const Ue=Xx(n,nt({},B,{hash:Gx(ve),path:ye.path})),y=a.createHref(Ue);return nt({fullPath:Ue,hash:ve,query:n===gu?h_(B.query):B.query||{}},ye,{redirectedFrom:void 0,href:y})}function v(B){return typeof B=="string"?Hr(s,B,o.value.path):nt({},B)}function g(B,pe){if(c!==B)return Va(gt.NAVIGATION_CANCELLED,{from:pe,to:B})}function x(B){return A(B)}function k(B){return x(nt(v(B),{replace:!0}))}function _(B,pe){const ce=B.matched[B.matched.length-1];if(ce&&ce.redirect){const{redirect:ye}=ce;let ve=typeof ye=="function"?ye(B,pe):ye;return typeof ve=="string"&&(ve=ve.includes("?")||ve.includes("#")?ve=v(ve):{path:ve},ve.params={}),nt({query:B.query,hash:B.hash,params:ve.path!=null?{}:B.params},ve)}}function A(B,pe){const ce=c=E(B),ye=o.value,ve=B.state,Ue=B.force,y=B.replace===!0,O=_(ce,ye);if(O)return A(nt(v(O),{state:typeof O=="object"?nt({},ve,O.state):ve,force:Ue,replace:y}),pe||ce);const F=ce;F.redirectedFrom=pe;let X;return!Ue&&e_(n,ye,ce)&&(X=Va(gt.NAVIGATION_DUPLICATED,{to:F,from:ye}),ee(ye,ye,!0,!1)),(X?Promise.resolve(X):L(F,ye)).catch(Y=>Ys(Y)?Ys(Y,gt.NAVIGATION_GUARD_REDIRECT)?Y:z(Y):R(Y,F,ye)).then(Y=>{if(Y){if(Ys(Y,gt.NAVIGATION_GUARD_REDIRECT))return A(nt({replace:y},v(Y.to),{state:typeof Y.to=="object"?nt({},ve,Y.to.state):ve,force:Ue}),pe||F)}else Y=P(F,ye,!0,y,ve);return H(F,ye,Y),Y})}function T(B,pe){const ce=g(B,pe);return ce?Promise.reject(ce):Promise.resolve()}function C(B){const pe=N.values().next().value;return pe&&typeof pe.runWithContext=="function"?pe.runWithContext(B):B()}function L(B,pe){let ce;const[ye,ve,Ue]=m_(B,pe);ce=jr(ye.reverse(),"beforeRouteLeave",B,pe);for(const O of ye)O.leaveGuards.forEach(F=>{ce.push(On(F,B,pe))});const y=T.bind(null,B,pe);return ce.push(y),we(ce).then(()=>{ce=[];for(const O of i.list())ce.push(On(O,B,pe));return ce.push(y),we(ce)}).then(()=>{ce=jr(ve,"beforeRouteUpdate",B,pe);for(const O of ve)O.updateGuards.forEach(F=>{ce.push(On(F,B,pe))});return ce.push(y),we(ce)}).then(()=>{ce=[];for(const O of Ue)if(O.beforeEnter)if(Ds(O.beforeEnter))for(const F of O.beforeEnter)ce.push(On(F,B,pe));else ce.push(On(O.beforeEnter,B,pe));return ce.push(y),we(ce)}).then(()=>(B.matched.forEach(O=>O.enterCallbacks={}),ce=jr(Ue,"beforeRouteEnter",B,pe,C),ce.push(y),we(ce))).then(()=>{ce=[];for(const O of l.list())ce.push(On(O,B,pe));return ce.push(y),we(ce)}).catch(O=>Ys(O,gt.NAVIGATION_CANCELLED)?O:Promise.reject(O))}function H(B,pe,ce){r.list().forEach(ye=>C(()=>ye(B,pe,ce)))}function P(B,pe,ce,ye,ve){const Ue=g(B,pe);if(Ue)return Ue;const y=pe===Sn,O=ba?history.state:{};ce&&(ye||y?a.replace(B.fullPath,nt({scroll:y&&O&&O.scroll},ve)):a.push(B.fullPath,ve)),o.value=B,ee(B,pe,ce,y),z()}let M;function K(){M||(M=a.listen((B,pe,ce)=>{if(!se.listening)return;const ye=E(B),ve=_(ye,se.currentRoute.value);if(ve){A(nt(ve,{replace:!0,force:!0}),ye).catch(gi);return}c=ye;const Ue=o.value;ba&&o_(hu(Ue.fullPath,ce.delta),xr()),L(ye,Ue).catch(y=>Ys(y,gt.NAVIGATION_ABORTED|gt.NAVIGATION_CANCELLED)?y:Ys(y,gt.NAVIGATION_GUARD_REDIRECT)?(A(nt(v(y.to),{force:!0}),ye).then(O=>{Ys(O,gt.NAVIGATION_ABORTED|gt.NAVIGATION_DUPLICATED)&&!ce.delta&&ce.type===Eo.pop&&a.go(-1,!1)}).catch(gi),Promise.reject()):(ce.delta&&a.go(-ce.delta,!1),R(y,ye,Ue))).then(y=>{y=y||P(ye,Ue,!1),y&&(ce.delta&&!Ys(y,gt.NAVIGATION_CANCELLED)?a.go(-ce.delta,!1):ce.type===Eo.pop&&Ys(y,gt.NAVIGATION_ABORTED|gt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(ye,Ue,y)}).catch(gi)}))}let ne=Xa(),U=Xa(),I;function R(B,pe,ce){z(B);const ye=U.list();return ye.length?ye.forEach(ve=>ve(B,pe,ce)):console.error(B),Promise.reject(B)}function j(){return I&&o.value!==Sn?Promise.resolve():new Promise((B,pe)=>{ne.add([B,pe])})}function z(B){return I||(I=!B,K(),ne.list().forEach(([pe,ce])=>B?ce(B):pe()),ne.reset()),B}function ee(B,pe,ce,ye){const{scrollBehavior:ve}=e;if(!ba||!ve)return Promise.resolve();const Ue=!ce&&c_(hu(B.fullPath,0))||(ye||!ce)&&history.state&&history.state.scroll||null;return Rt().then(()=>ve(B,pe,Ue)).then(y=>y&&r_(y)).catch(y=>R(y,B,pe))}const ie=B=>a.go(B);let de;const N=new Set,se={currentRoute:o,listening:!0,addRoute:p,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:b,resolve:E,options:e,push:x,replace:k,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:U.add,isReady:j,install(B){B.component("RouterLink",$_),B.component("RouterView",V_),B.config.globalProperties.$router=se,Object.defineProperty(B.config.globalProperties,"$route",{enumerable:!0,get:()=>zs(o)}),ba&&!de&&o.value===Sn&&(de=!0,x(a.location).catch(ye=>{}));const pe={};for(const ye in Sn)Object.defineProperty(pe,ye,{get:()=>o.value[ye],enumerable:!0});B.provide(_r,se),B.provide(Nc,Vo(pe)),B.provide(Ro,o);const ce=B.unmount;N.add(B),B.unmount=function(){N.delete(B),N.size<1&&(c=Sn,M&&M(),M=null,o.value=Sn,de=!1,I=!1),ce()}}};function we(B){return B.reduce((pe,ce)=>pe.then(()=>C(ce)),Promise.resolve())}return se}function lg(){return Ss(_r)}function z_(e){return Ss(Nc)}const kr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=z_(),s=lg(),n=te({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=te(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=te(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});Xt(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},q_={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(f){var b,w,E,v,g;const p=f.payload||f,m=p.type||f.type;if(m==="tool_start"){const x=((b=p.metadata)==null?void 0:b.call_id)||null,k={callId:x,id:x||`${p.action}-${Date.now()}`,tool:p.action,actor:p.actor||"",channel:p.channel_id||"",iteration:((w=p.metadata)==null?void 0:w.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(k);return}if(m==="tool_end"){const x=((E=p.metadata)==null?void 0:E.call_id)||null;let k=-1;if(x&&(k=e.value.findIndex(_=>_.callId===x&&_.status==="running")),k<0&&!x)for(let _=e.value.length-1;_>=0;_--){const A=e.value[_];if(A.tool===p.action&&A.status==="running"){k=_;break}}if(k>=0){const _=e.value[k];_.status=(v=p.metadata)!=null&&v.error?"error":"success",_.elapsed=((g=p.metadata)==null?void 0:g.elapsed_ms)||Date.now()-_.startTime,_.result=p.detail||"",_.fadingOut=!0,setTimeout(()=>{const A=e.value.indexOf(_);A>=0&&e.value.splice(A,1),t.value.unshift(_),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const x=p.call_id||p.tool_name||"unknown";if(p.finished){const k={...s.value};delete k[x],s.value=k}else{const _=((s.value[x]||"")+(p.chunk||"")).split(`
`);s.value={...s.value,[x]:_.slice(-30).join(`
`)}}return}}let i=null;function l(){const f=Date.now();e.value.forEach(p=>{p.status==="running"&&(p.elapsed=f-p.startTime)})}let r=!1;function o(){r||(r=!0,Ge.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ge.off("events",a),i&&(clearInterval(i),i=null))}Ye(o),Es(o),As(c),xt(c);function d(f){return f<1e3?`${f}ms`:`${(f/1e3).toFixed(1)}s`}function u(f){return f==="running"?"clock":f==="success"?"success":f==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Dc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ra(e){const t=Dc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Mc(e){const t=Dc(e);return t?t.toLocaleTimeString():"—"}function rg(e){const t=Dc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function ja(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Pc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function og(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Eu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function cg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function dg(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const ug=Symbol("agent-detail-cancelled"),K_=15e3;function G_(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((p,m)=>{o=p,c=m});function u(p,m){r||(r=!0,l!==null&&a(l),l=null,(p?o:c)(m))}let f;try{f=e(i==null?void 0:i.signal)}catch(p){u(!1,p)}return r||Promise.resolve(f).then(p=>u(!0,p),p=>u(!1,p)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const p=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${p}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,ug),i==null||i.abort()}}}function fg({state:e,requestDetail:t,timeoutMs:s=K_,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const f=l;l=null,f==null||f.cancel()}function o(f,{initial:p,coalesce:m}){if(!f)return Promise.resolve();if(m&&l&&l.agentId===f&&e.detailId===f)return l.promise;r();const b={agentId:f,cancel:null,promise:null};l=b,p?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const w=G_(E=>t(f,{signal:E}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return b.cancel=w.cancel,b.promise=(async()=>{let E=null,v=null;try{E=await w.promise}catch(g){v=g}E!==ug&&(l!==b||e.detailId!==f||(l=null,!v&&(E===null||typeof E!="object")&&(v=new Error(`${n} response was empty or invalid`)),v?e.detail===null&&(e.detailError=(v==null?void 0:v.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=E,e.detailError=null),e.detailLoading=!1))})(),b.promise}function c(f){return e.detailId=f,o(f,{initial:!0,coalesce:!1})}function d(){const f=e.detailId;return f?o(f,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function W_({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const Z_={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=te(()=>e.value.filter(R=>R.status==="running").length),o=te(()=>e.value.filter(R=>R.status==="completed").length),c=te(()=>e.value.filter(R=>["failed","timeout","killed"].includes(R.status)).length),d=te(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=te(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(R=>["failed","timeout","killed"].includes(R.status)):e.value.filter(R=>R.status===i.value));function f(R){const j=Number(R.max_iterations)||0;return j<=0?0:Math.min(100,Math.round(R.iteration_count/j*100))}function p(R){return(Number(R.max_iterations)||0)>0}function m(R,j){return R?R==="N/A"?"N/A":j==="current_inheritance"?`inherit (currently ${R})`:R:"unknown"}function b(R){return m(R.display_model,R.display_model_source||R.display_source)}function w(R){return m(R.display_reasoning_effort,R.display_reasoning_effort_source||R.display_source)}function E(R){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[R]||""}const v=h(null),g=h(null),x=h(!1),k=h(null),_=h(""),T=fg({state:{get detail(){return v.value},set detail(R){v.value=R},get detailId(){return g.value},set detailId(R){g.value=R},get detailLoading(){return x.value},set detailLoading(R){x.value=R},get detailError(){return k.value},set detailError(R){k.value=R}},requestDetail:(R,{signal:j})=>J.get(`/api/agents/${encodeURIComponent(R)}`,{signal:j})});async function C(R){_.value="",await T.open(R.id)}function L(){T.close(),_.value=""}async function H(){await T.refresh()}async function P(R,j){try{await navigator.clipboard.writeText(j||""),_.value=R,setTimeout(()=>{_.value===R&&(_.value="")},1500)}catch{Ee.error("Copy failed")}}async function M(R=!1){R=R===!0,R||(t.value=!0);try{const j=await J.get("/api/agents");e.value=Array.isArray(j)?j:[],s.value=null}catch(j){R||(s.value=j.message)}R||(t.value=!1)}async function K(R){const j=e.value.find(ee=>ee.id===R);if(await gs({title:"Kill agent",message:`Kill agent "${(j==null?void 0:j.label)||R}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=R;try{await J.del(`/api/agents/${encodeURIComponent(R)}`),Ee.success("Agent killed"),await M()}catch(ee){Ee.error(ee.message||"Failed to kill agent")}n.value=null}}const ne=W_({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:H});function U(){ne.start()}function I(){ne.stop()}return Xt(a,()=>ne.sync()),Ye(()=>{l=!0,M(),U()}),Es(()=>{l=!0,M(!0),U()}),As(()=>{l=!1,I()}),xt(()=>{l=!1,I(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ra,formatDuration:ja,progressPercent:f,hasProgress:p,displayModelText:b,displayEffortText:w,displaySourceLabel:E,detail:v,detailId:g,detailLoading:x,detailError:k,copied:_,openDetail:C,closeDetail:L,copyText:P,fetchAgents:M,killAgent:K,startAutoRefresh:U,stopAutoRefresh:I}}},J_={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),f=h(null),p=h("");let m=!1;const w=fg({state:{get detail(){return c.value},set detail(I){c.value=I},get detailId(){return d.value},set detailId(I){d.value=I},get detailLoading(){return u.value},set detailLoading(I){u.value=I},get detailError(){return f.value},set detailError(I){f.value=I}},detailLabel:"Loop detail",requestDetail:(I,{signal:R})=>J.get(`/api/loops/${encodeURIComponent(I)}?limit=100`,{signal:R})});async function E(I){p.value="",await w.open(I.id)}function v(){w.close(),p.value=""}async function g(I,R){try{await navigator.clipboard.writeText(R||""),p.value=I,setTimeout(()=>{p.value===I&&(p.value="")},1500)}catch{Ee.error("Copy failed")}}const x=te(()=>e.value.reduce((I,R)=>I+(R.iteration_count||0),0)),k=te(()=>e.value.filter(I=>I.status==="running").length);function _(I){return I==="running"?"loop-status-running":I==="error"?"loop-status-error":"loop-status-stopped"}function A(I){return I==="running"?"badge-success":I==="error"?"badge-danger":I==="completed"?"badge-info":"badge-warning"}function T(I){return I==="act"?"badge-warning":I==="silent"?"badge-info":"badge-success"}async function C(I=!1){I=I===!0,I||(t.value=!0);try{const R=await J.get("/api/loops");e.value=Array.isArray(R)?R:[],s.value=null}catch(R){I||(s.value=R.message)}I||(t.value=!1)}async function L(){l.value=null;const I=a.value;if(!I.goal.trim()){l.value="Goal is required";return}if(!I.channel_id.trim()){l.value="Channel ID is required";return}const R={goal:I.goal.trim(),channel_id:I.channel_id.trim(),interval_seconds:I.interval_seconds||60,mode:I.mode,max_iterations:I.max_iterations||50};I.stop_condition.trim()&&(R.stop_condition=I.stop_condition.trim()),i.value=!0;try{const j=await J.post("/api/loops",R);Ee.success(`Loop started: ${j.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(j){l.value=j.message}i.value=!1}async function H(I){if(await gs({title:"Stop loop",message:`Stop loop ${I}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=I;try{await J.del(`/api/loops/${encodeURIComponent(I)}`),Ee.success("Loop stopped"),await C()}catch(j){Ee.error(j.message||"Failed to stop loop")}r.value=null}}async function P(I){o.value=I;try{await J.post(`/api/loops/${encodeURIComponent(I)}/restart`),Ee.success("Loop restarted"),await C()}catch(R){Ee.error(R.message||"Failed to restart loop")}o.value=null}function M(I){m&&I.payload&&(I.payload.loop_id||I.payload.type==="loop")&&(C(!0),d.value&&w.refresh())}let K=null;function ne(){K!==null&&clearInterval(K),K=null}function U(){ne(),m&&(K=setInterval(()=>{C(!0),d.value&&w.refresh()},5e3))}return Ye(()=>{m=!0,C(),Ge.subscribe("events",M),U()}),Es(()=>{m=!0,C(!0),U()}),As(()=>{m=!1,ne()}),xt(()=>{m=!1,Ge.unsubscribe("events",M),ne(),w.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:f,copied:p,totalIterations:x,runningCount:k,statusDotClass:_,statusBadge:A,modeBadge:T,formatAge:rg,formatDuration:ja,formatTs:ra,formatTokens:dg,openDetail:E,closeDetail:v,copyText:g,fetchLoops:C,doCreate:L,doStop:H,doRestart:P}}},Y_={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=te(()=>e.value.filter(v=>v.status==="running").length),r=te(()=>e.value.filter(v=>v.status!=="running").length);function o(v){return v==="running"?"loop-status-running":v==="failed"||v==="error"?"loop-status-error":"loop-status-stopped"}function c(v){return v==="running"?"badge-success":v==="completed"||v==="exited"?"badge-info":v==="killed"||v==="error"||v==="failed"?"badge-danger":"badge-warning"}async function d(v=!1){v=v===!0,v||(t.value=!0);try{e.value=await J.get("/api/processes"),s.value=null}catch(g){v||(s.value=g.message)}v||(t.value=!1)}function u(){f(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}Xt(n,v=>{v?u():f()});async function p(v){if(await gs({title:"Kill process",message:`Kill process ${v}?`,confirmLabel:"Kill",danger:!0})){i.value=v;try{await J.del(`/api/processes/${v}`),Ee.success(`Process ${v} killed`),await d()}catch(x){Ee.error(x.message||"Failed to kill process")}i.value=null}}function m(v){v.payload&&(v.payload.pid||v.payload.type==="process")&&d(!0)}let b=!1;function w(){b||(b=!0,d(),Ge.subscribe("events",m),u())}function E(){b&&(b=!1,Ge.unsubscribe("events",m),f())}return Ye(w),Es(w),As(E),xt(E),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ja,fetchProcesses:d,doKill:p}}},Q_=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Au(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function X_(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function ek(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function tk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=Q_.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),f=new Date(u-864e5).getTimezoneOffset(),p=new Date(u+864e5).getTimezoneOffset(),m=[];for(const w of new Set([f,p])){const E=new Date(u+w*6e4);X_(E,c)===d&&(m.some(v=>v.getTime()===E.getTime())||m.push(E))}if(m.sort((w,E)=>w.getTime()-E.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(w=>({instant:w,offset:ek(w),iso:w.toISOString()}))};const b=m[0];return{state:"ok",typed:t,instant:b,iso:b.toISOString()}}const sk={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=te(()=>tk(a.value.run_at));Xt(()=>a.value.run_at,()=>{r.value=null});const c=te(()=>{var se;const N=o.value;return N.state==="ok"?N.instant:N.state==="ambiguous"&&r.value!==null&&((se=N.options[r.value])==null?void 0:se.instant)||null}),d=te(()=>{const N=c.value;return N?`${N.toLocaleString()} local — ${N.toISOString()} UTC`:""}),u=h(null),f=h(!1),p=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),b=h(null),w=h(null),E=h(null),v=h(null),g=h([]),x=h(!1),k=h("");let _=0;const A=te(()=>e.value.filter(N=>N.cron&&!N.one_time).length),T=te(()=>e.value.filter(N=>N.one_time).length),C=te(()=>e.value.filter(N=>N.trigger).length),L=te(()=>e.value.filter(N=>N.paused).length),H=te(()=>e.value.filter(N=>N.consecutive_failures>0).length);function P(N){if(!N)return"-";const se=Date.now(),B=(new Date(N).getTime()-se)/1e3;if(B<0)return"overdue";if(B<60)return"in < 1 min";if(B<3600)return`in ${Math.floor(B/60)} min`;if(B<86400){const ce=Math.floor(B/3600),ye=Math.floor(B%3600/60);return ye>0?`in ${ce}h ${ye}m`:`in ${ce}h`}const pe=Math.floor(B/86400);return`in ${pe} day${pe!==1?"s":""}`}function M(N){return N==null?"-":N<1e3?`${N}ms`:N<6e4?`${(N/1e3).toFixed(1)}s`:ja(N/1e3)}function K(N=a.value.cron){a.value.cron=N,Au(a.value,"cron"),u.value=null}function ne(N=a.value.run_at){a.value.run_at=N,Au(a.value,"run_at"),u.value=null}async function U(){const N=a.value.cron.trim();if(N){f.value=!0;try{u.value=await J.post("/api/schedules/validate-cron",{expression:N})}catch(se){u.value={valid:!1,error:se.message}}f.value=!1}}async function I(){t.value=!0,s.value=null;try{e.value=await J.get("/api/schedules")}catch(N){s.value=N.message}t.value=!1}async function R(N){if(v.value===N){v.value=null,g.value=[];return}v.value=N,x.value=!0,g.value=[];const se=++_;try{const we=await J.get(`/api/schedules/${encodeURIComponent(N)}/history?limit=10`);if(se!==_||v.value!==N)return;g.value=we,k.value=""}catch(we){if(se!==_||v.value!==N)return;g.value=[],k.value=we.message||"Failed to load execution history"}se===_&&(x.value=!1)}async function j(){l.value=null;const N=a.value;if(!N.description.trim()){l.value="Description is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}if(!N.cron.trim()&&!N.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(N.cron.trim()&&N.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const se={description:N.description.trim(),action:N.action,channel_id:N.channel_id.trim()};if(N.cron.trim()&&(se.cron=N.cron.trim()),N.run_at.trim()){const we=o.value;if(we.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(we.state==="invalid"){l.value="One-time run time is not a valid date";return}const B=c.value;if(we.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!B){l.value="One-time run time could not be resolved";return}se.run_at=B.toISOString()}if(N.action==="reminder"&&N.message.trim()&&(se.message=N.message.trim()),N.action==="check"&&(N.tool_name.trim()&&(se.tool_name=N.tool_name.trim()),N.tool_input_str.trim()))try{se.tool_input=JSON.parse(N.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await J.post("/api/schedules",se),Ee.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},u.value=null,n.value=!1,await I()}catch(we){l.value=we.message}i.value=!1}async function z(N){m.value=N;try{const se=await J.post(`/api/schedules/${encodeURIComponent(N)}/run`);if(se.status==="failure")Ee.error(`Execution failed: ${se.error||"unknown error"}`);else{const we=se.warning?`Executed (${se.warning})`:"Executed successfully";Ee.success(we)}await I()}catch(se){Ee.error(se.message||"Failed to trigger")}m.value=null}async function ee(N){w.value=N.id;const se=!N.paused;try{await J.put(`/api/schedules/${encodeURIComponent(N.id)}`,{paused:se}),Ee.success(se?"Schedule paused":"Schedule resumed"),await I()}catch(we){Ee.error(we.message||"Failed to update schedule")}w.value=null}async function ie(N){E.value=N;try{await J.post(`/api/schedules/${encodeURIComponent(N)}/reset-failures`),Ee.success("Failure counters reset"),await I()}catch(se){Ee.error(se.message||"Failed to reset")}E.value=null}async function de(N){const se=e.value.find(B=>B.id===N);if(await gs({title:"Delete schedule",message:`Delete "${(se==null?void 0:se.description)||N}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){b.value=N;try{await J.del(`/api/schedules/${encodeURIComponent(N)}`),Ee.success("Schedule deleted"),await I()}catch(B){Ee.error(B.message||"Failed to delete schedule")}b.value=null}}return Ye(()=>{I()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:f,cronPresets:p,runningId:m,deletingId:b,togglingId:w,resettingId:E,expandedId:v,history:g,historyLoading:x,historyError:k,cronCount:A,oneTimeCount:T,webhookCount:C,pausedCount:L,failingCount:H,formatTs:ra,formatAge:rg,formatFuture:P,formatMs:M,formatDuration:ja,onCronInput:K,onRunAtInput:ne,validateCron:U,toggleExpand:R,fetchSchedules:I,doCreate:j,doRunNow:z,doTogglePause:ee,doResetFailures:ie,doDelete:de}}},pg=[{id:"live",label:"Live",component:q_},{id:"agents",label:"Agents",component:Z_},{id:"loops",label:"Loops",component:J_},{id:"processes",label:"Processes",component:Y_},{id:"schedules",label:"Schedules",component:sk}],nk={components:{TabbedPage:kr},setup(){return{tabs:pg}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ak={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await J.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ye(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ra,formatDetail:i,truncateBlock:og,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Ru=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],ik=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],lk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),f=h(""),p=h("last_active"),m=h(!1),b=Ru,w=ik,E=h([]),v=h(!1),g=h(""),x=h("flat"),k=h(new Set),_=h(""),A=h(""),T=h(""),C=h(null),L=h(!1);function H(){try{const V=localStorage.getItem("odin-session-presets");V&&(E.value=JSON.parse(V))}catch{}}function P(){try{localStorage.setItem("odin-session-presets",JSON.stringify(E.value))}catch{}}const M=te(()=>f.value.trim()!==""||u.value!=="all"),K=te(()=>{let V=[...e.value];const ke=Ru.find(ze=>ze.id===u.value),Oe=ke?ke.filters:{};if(Oe.source&&(V=V.filter(ze=>ze.source===Oe.source)),Oe.minMessages&&(V=V.filter(ze=>ze.message_count>=Oe.minMessages)),Oe.hasCompaction&&(V=V.filter(ze=>ze.has_summary)),Oe.maxAge!=null){const ze=Date.now()/1e3;V=V.filter(ft=>ft.last_active&&ze-ft.last_active<=Oe.maxAge)}if(f.value.trim()){const ze=f.value.toLowerCase().trim();V=V.filter(ft=>(ft.channel_id||"").toLowerCase().includes(ze)||(ft.last_user_id||"").toLowerCase().includes(ze)||(ft.source||"").toLowerCase().includes(ze))}const De=p.value,We=m.value?1:-1;return V.sort((ze,ft)=>{const Kt=ze[De]||0,Rs=ft[De]||0;return(Kt-Rs)*We}),V}),ne=te(()=>{if(!a.value||!a.value.messages)return[];const V=a.value.messages;if(V.length===0)return[];const ke=[];let Oe=[];for(const De of V)De.role==="user"&&Oe.length>0&&(ke.push(Oe),Oe=[]),Oe.push(De);return Oe.length>0&&ke.push(Oe),ke}),U=te(()=>K.value.length>0&&c.value.size===K.value.length);function I(V){const ke=V.find(Oe=>Oe.role==="user");if(ke&&ke.content){const Oe=ke.content.slice(0,120);return Oe.length<ke.content.length?Oe+"...":Oe}return"(no user message)"}function R(V){const ke=new Set(k.value);ke.has(V)?ke.delete(V):ke.add(V),k.value=ke}function j(V){u.value=V}function z(V){u.value=V.id,V.filters.searchQuery!=null&&(f.value=V.filters.searchQuery),V.filters.sortBy&&(p.value=V.filters.sortBy)}function ee(){if(!g.value.trim())return;const V={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:f.value,sortBy:p.value}};E.value=[...E.value,V],P(),v.value=!1,g.value=""}function ie(V){E.value=E.value.filter(ke=>ke.id!==V),P(),u.value===V&&(u.value="all")}function de(){u.value="all",f.value="",p.value="last_active",m.value=!1}function N(V){if(!V)return"—";const ke=Date.now()/1e3-V;if(ke<60)return"just now";if(ke<3600){const De=Math.floor(ke/60);return`${De} minute${De!==1?"s":""} ago`}if(ke<86400){const De=Math.floor(ke/3600);return`${De} hour${De!==1?"s":""} ago`}const Oe=Math.floor(ke/86400);return`${Oe} day${Oe!==1?"s":""} ago`}function se(V){if(!V)return"";try{return new Date(V*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function we(V){if(!V)return"";try{return new Date(V*1e3).toLocaleString()}catch{return""}}function B(V){return V==="user"?"bg-gray-900/50 border border-gray-800":V==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function pe(V){return V==="user"?"sess-msg-user":V==="assistant"?"sess-msg-assistant":"sess-msg-system"}function ce(V){return V==="user"?"badge-info":V==="assistant"?"badge-success":"badge-warning"}function ye(V){return V==="user"?"sess-dot-user":V==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ve(V){return V==="user"?"text-cyan-400":V==="assistant"?"text-indigo-400":"text-gray-500"}function Ue(V){return V?V.length>2e3?V.slice(0,2e3)+`
... (truncated)`:V:""}async function y(){const V=_.value.trim();if(V){L.value=!0;try{let ke=`/api/sessions/search?q=${encodeURIComponent(V)}&limit=50`;A.value.trim()&&(ke+=`&channel_id=${encodeURIComponent(A.value.trim())}`),T.value.trim()&&(ke+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Oe=await J.get(ke);C.value=Oe.results||[]}catch{C.value=[]}L.value=!1}}function O(){_.value="",A.value="",T.value="",C.value=null}function F(V){return V?V.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function X(V){return V==="user"?"fts-result-user":V==="assistant"?"fts-result-assistant":V==="summary"?"fts-result-summary":V==="fts"?"fts-result-fts":V==="channel"?"fts-result-channel":"fts-result-default"}function Y(V){return V==="user"?"badge-info":V==="assistant"?"badge-success":V==="summary"?"badge-warning":V==="fts"?"badge-success":"badge-info"}async function Z(){t.value=!0,s.value=null;try{e.value=await J.get("/api/sessions")}catch(V){s.value=V.message}t.value=!1}function fe(){s.value=null,Z()}async function oe(V){if(n.value===V){n.value=null,a.value=null,k.value=new Set;return}n.value=V,a.value=null,i.value=!0,k.value=new Set;const ke=++l;try{const Oe=await J.get(`/api/sessions/${encodeURIComponent(V)}`);ke===l&&n.value===V&&(a.value=Oe)}catch(Oe){ke===l&&n.value===V&&(a.value={messages:[],summary:"",error:Oe.message||"Failed to load session"})}finally{ke===l&&(i.value=!1)}}function re(V){const ke=new Set(c.value);ke.has(V)?ke.delete(V):ke.add(V),c.value=ke}function ae(){U.value?c.value=new Set:c.value=new Set(K.value.map(V=>V.channel_id))}function _e(V){r.value=V}async function he(){if(r.value){o.value=!0;try{await J.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await Z()}catch(V){s.value=V.message||"Failed to clear session"}o.value=!1,r.value=null}}function me(){d.value=!0}async function Te(){if(c.value.size!==0){o.value=!0;try{await J.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await Z()}catch(V){s.value=V.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function Ae(V,ke){const Oe=`/api/sessions/${encodeURIComponent(V)}/export?format=${ke}`;try{const De=await J.getBlob(Oe),We=URL.createObjectURL(De),ze=document.createElement("a");ze.href=We,ze.download=`session-${V}.${ke==="text"?"txt":"json"}`,ze.click(),URL.revokeObjectURL(We)}catch(De){s.value=De.message||"Failed to export session"}}let Ie=null;function Ne(V){V.payload&&V.payload.channel_id&&(clearTimeout(Ie),Ie=setTimeout(()=>{if(Z(),n.value&&V.payload.channel_id===n.value){const ke=n.value,Oe=l;J.get(`/api/sessions/${encodeURIComponent(ke)}`).then(De=>{Oe!==l||n.value!==ke||(a.value=De)}).catch(()=>{})}},2e3))}let Pe=!1;function He(){Pe||(Pe=!0,Z(),Ge.subscribe("events",Ne))}Ye(()=>{H(),He()}),Es(()=>{He()});function st(){Pe&&(Pe=!1,Ge.unsubscribe("events",Ne),clearTimeout(Ie))}return As(st),xt(st),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:f,sortBy:p,sortAsc:m,filterPresets:b,sortOptions:w,filteredSessions:K,hasActiveFilters:M,customPresets:E,showSavePreset:v,newPresetName:g,threadView:x,threads:ne,collapsedThreads:k,ftsQuery:_,ftsChannelId:A,ftsUserId:T,ftsResults:C,ftsSearching:L,formatAge:N,formatTimestamp:se,formatFullTimestamp:we,messageClass:B,threadMsgClass:pe,roleBadge:ce,roleDotClass:ye,roleLabelClass:ve,truncateContent:Ue,threadSummary:I,fetchSessions:Z,retry:fe,toggleSession:oe,toggleSelect:re,toggleSelectAll:ae,confirmClear:_e,clearSession:he,confirmBulkClear:me,doBulkClear:Te,exportSession:Ae,applyPreset:j,applyCustomPreset:z,saveCustomPreset:ee,removeCustomPreset:ie,resetFilters:de,toggleThread:R,runFtsSearch:y,clearFtsSearch:O,highlightSnippet:F,ftsResultClass:X,ftsTypeBadge:Y}}},rk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:dg}}},ok={components:{ContextAssemblyPanel:rk},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const T=new Date(A);return isNaN(T.getTime())?A:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function f(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function p(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function m(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function b(A){a.value===A?a.value=null:(a.value=A,c.value={})}function w(A,T){const C=A+"-"+T;c.value={...c.value,[C]:!c.value[C]}}function E(A,T){return!!c.value[A+"-"+T]}function v(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,k()}async function g(){try{const A=await J.get("/api/trajectories");e.value=A.files||[],o.value=A.count||0}catch{}}let x=0;async function k(){const A=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await J.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(A!==x)return;let C=T.entries||[];d.value.tool_name&&(C=C.filter(L=>(L.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(L=>L.is_error)),d.value.channel_id&&(C=C.filter(L=>L.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(L=>L.user_id===d.value.user_id)),t.value=C}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const C=T.toString(),L=await J.get(`/api/trajectories/search/query?${C}`);if(A!==x)return;t.value=L.results||[]}}catch(T){if(A!==x)return;n.value=T.message}A===x&&(s.value=!1)}async function _(){if(!l.value.trim())return;const A=++x;s.value=!0,n.value=null,c.value={};try{const T=await J.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==x)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(A!==x)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}A===x&&(s.value=!1)}return Ye(async()=>{await g(),await k()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:f,formatTokens:p,formatJSON:m,truncateBlock:og,toggleExpand:b,toggleIteration:w,isIterationExpanded:E,clearFilters:v,fetchFiles:g,fetchTraces:k,lookupMessage:_}}},ck={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=te(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const m=await J.get("/api/usage");n.value=m,a.value=m.totals||a.value,t.value=null,s.value=!0}catch(m){t.value=m.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function f(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function p(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ye(f),Es(f),As(p),xt(p),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:cg,formatTime:Mc,retry:d}}},hg=[{id:"audit",label:"Audit",component:ak},{id:"sessions",label:"Sessions",component:lk},{id:"traces",label:"Traces",component:ok},{id:"usage",label:"Usage",component:ck}],dk={components:{TabbedPage:kr},setup(){return{tabs:hg}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},zr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],uk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=te(()=>e.value.filter(v=>v.is_core).length),c=te(()=>e.value.filter(v=>!v.is_core).length),d=te(()=>Object.values(a.value).reduce((v,g)=>v+g,0));function u(v){for(const g of zr)if(g.id!=="other"&&g.match(v))return g.id;return"other"}const f=te(()=>{let v=e.value;if(n.value){const g=n.value.toLowerCase();v=v.filter(x=>x.name.toLowerCase().includes(g)||(x.description||"").toLowerCase().includes(g))}return r.value&&(v=v.filter(g=>u(g.name)===r.value)),v}),p=te(()=>{const v=new Set;for(const g of e.value)v.add(u(g.name));return zr.filter(g=>v.has(g.id))}),m=te(()=>{const v=f.value,g={};for(const k of v){const _=u(k.name);g[_]||(g[_]=[]),g[_].push(k)}const x=[];for(const k of zr)g[k.id]&&g[k.id].length>0&&x.push({label:k.label,icon:k.icon,tools:g[k.id].sort((_,A)=>_.name.localeCompare(A.name))});return x});function b(v){i.value={...i.value,[v]:!i.value[v]}}async function w(){t.value=!0,s.value=null;try{const[v,g]=await Promise.all([J.get("/api/tools"),J.get("/api/tools/stats").catch(()=>({}))]);e.value=v,a.value=g||{};const x=Object.values(g||{}).filter(k=>k>0).sort((k,_)=>k-_)}catch(v){s.value=v.message}t.value=!1}function E(){w()}return Ye(()=>{w()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:f,groupedTools:m,usedCategories:p,truncate:Pc,toggleExpand:b,refresh:E}}};function fk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function pk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const hk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),f=h(null),p=h(null),m=h(!1),b=h(null),w=h(null),E=h(!1),v=te(()=>e.value.length),g=te(()=>e.value.reduce((N,se)=>N+(se.execution_count||0),0)),x=te(()=>e.value.reduce((N,se)=>N+L(se.code),0)),k=te(()=>{if(!l.value)return e.value;const N=l.value.toLowerCase();return e.value.filter(se=>se.name.toLowerCase().includes(N)||(se.description||"").toLowerCase().includes(N))}),_=te(()=>u.value?u.value.split(`
`).length:0),A=te(()=>{const N=Math.max(_.value,1);return Array.from({length:N},(se,we)=>we+1).join(`
`)}),T=te(()=>{const N=u.value.trim();return N?N.includes("SKILL_DEFINITION")?N.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(N){return fk(N)}function L(N){return N?N.split(`
`).length:0}function H(N){return pk(N)}function P(N){n.value={...n.value,[N]:!n.value[N]}}async function M(N){try{await navigator.clipboard.writeText(N);const se=e.value.find(we=>we.code===N);se&&(r.value=se.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function K(N){if(N.key==="Tab"){N.preventDefault();const se=N.target,we=se.selectionStart,B=se.selectionEnd;u.value=u.value.substring(0,we)+"    "+u.value.substring(B),Rt(()=>{se.selectionStart=se.selectionEnd=we+4})}}function ne(N){const se=N.target.previousElementSibling;se&&(se.scrollTop=N.target.scrollTop)}async function U(){t.value=!0,s.value=null;try{e.value=await J.get("/api/skills")}catch(N){s.value=N.message}t.value=!1}async function I(N){i.value=N,delete a.value[N],a.value={...a.value};try{const se=await J.post(`/api/skills/${encodeURIComponent(N)}/test`);a.value={...a.value,[N]:se}}catch(se){a.value={...a.value,[N]:{result:se.message,is_error:!0}}}i.value=null}function R(){o.value=!0,c.value="create",d.value="",u.value="",f.value=null,p.value=null}function j(N){o.value=!0,c.value="edit",d.value=N.name,u.value=N.code||"",f.value=null,p.value=null}function z(){o.value=!1,f.value=null,p.value=null}async function ee(){f.value=null,p.value=null;const N=d.value.trim(),se=u.value.trim();if(!N){f.value="Name is required";return}if(!se){f.value="Code is required";return}m.value=!0;try{c.value==="create"?(await J.post("/api/skills",{name:N,code:se}),p.value="Skill created successfully"):(await J.put(`/api/skills/${encodeURIComponent(N)}`,{code:se}),p.value="Skill updated successfully"),await U(),setTimeout(()=>{o.value=!1},800)}catch(we){f.value=we.message}m.value=!1}function ie(N){w.value=N}async function de(){if(w.value){E.value=!0;try{await J.del(`/api/skills/${encodeURIComponent(w.value)}`),await U()}catch(N){Ee.error(`Failed to delete skill: ${N.message||"unknown error"}`)}E.value=!1,w.value=null}}return Ye(()=>{U()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:f,editSuccess:p,saving:m,editorRef:b,deleteTarget:w,deleting:E,enabledCount:v,totalExecutions:g,totalLines:x,displayedSkills:k,editLineCount:_,editorLineNums:A,editValidation:T,highlight:C,truncate:Pc,formatTs:ra,countLines:L,getLineNumbers:H,toggleCode:P,copyCode:M,handleEditorKey:K,syncScroll:ne,fetchSkills:U,testSkill:I,showCreate:R,editSkill:j,cancelEdit:z,saveSkill:ee,confirmDelete:ie,doDelete:de}}};function gk(e,t){if(!e||!t)return Eu(e);const s=Eu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const mk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),f=h(null),p=h(!1),m=h(null),b=h(null);let w=null;const E=h(null),v=h(!1),g=h({}),x=h({}),k=h(null),_=h(null),A=te(()=>e.value.reduce((R,j)=>R+(j.chunks||0),0)),T=te(()=>new Set(e.value.map(j=>j.uploader).filter(Boolean)).size);function C(R,j){const z=x.value[j];if(!z||z.length===0)return 0;const ee=Math.max(...z.map(ie=>ie.char_count||0));return ee===0?0:Math.round(R.char_count/ee*100)}async function L(){t.value=!0,s.value=null;try{const R=await J.get("/api/knowledge");e.value=Array.isArray(R)?R:[]}catch(R){s.value=R.message}t.value=!1}async function H(R){if(g.value[R]){g.value[R]=!1,_.value=null;return}if(g.value[R]=!0,!(x.value[R]||k.value===R)){k.value=R;try{const j=await J.get(`/api/knowledge/${encodeURIComponent(R)}/chunks`);x.value[R]=Array.isArray(j)?j:[]}catch(j){x.value[R]=[],Ee.error(`Failed to load chunks: ${j.message}`)}k.value=null}}async function P(){const R=n.value.trim();if(R){i.value=!0,r.value=null,l.value=R;try{const j=await J.get(`/api/knowledge/search?q=${encodeURIComponent(R)}`);a.value=Array.isArray(j)?j:[]}catch(j){a.value=[],r.value=j.message||"Search failed"}i.value=!1}}function M(){a.value=null,n.value="",r.value=null}async function K(){u.value=null,f.value=null;const R=c.value.trim(),j=d.value.trim();if(!R){u.value="Source name is required";return}if(!j){u.value="Content is required";return}p.value=!0;try{const z=await J.post("/api/knowledge",{source:R,content:j});f.value=`Ingested ${z.chunks||0} chunks from "${R}"`,c.value="",d.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(z){u.value=z.message}p.value=!1}async function ne(R){m.value=R,b.value=null,w&&(clearTimeout(w),w=null);try{const j=await J.post(`/api/knowledge/${encodeURIComponent(R)}/reingest`);b.value={source:R,error:!1,message:`Re-ingested ${j.chunks||0} chunks`},delete x.value[R],await L(),w=setTimeout(()=>{b.value=null,w=null},3e3)}catch(j){b.value={source:R,error:!0,message:j.message}}m.value=null}function U(R){E.value=R}async function I(){if(E.value){v.value=!0;try{await J.del(`/api/knowledge/${encodeURIComponent(E.value)}`),delete x.value[E.value],await L()}catch(R){Ee.error(`Failed to delete source: ${R.message||"unknown error"}`)}v.value=!1,E.value=null}}return Ye(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:f,ingesting:p,reingesting:m,reingestResult:b,deleteTarget:E,deleting:v,expanded:g,sourceChunks:x,loadingChunks:k,selectedChunk:_,totalChunks:A,uploaderCount:T,truncate:Pc,formatTs:ra,highlightTerms:gk,chunkBarWidth:C,fetchSources:L,toggleSource:H,doSearch:P,clearSearch:M,doIngest:K,doReingest:ne,confirmDelete:U,doDelete:I}}},vk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),f=h(null),p=h(""),m=h(!1),b=h(null),w=h(null),E=h(new Set),v=h(null),g=h(!1),x=h(!1),k=te(()=>e.value.reduce((ie,de)=>ie+de.count,0)),_=te(()=>E.value.size);function A(ie){const de=t.value[ie];if(!de)return[];if(!l.value.trim())return de;const N=l.value.trim().toLowerCase();return de.filter(se=>se.key.toLowerCase().includes(N)||se.value&&se.value.toLowerCase().includes(N))}function T(ie,de){return E.value.has(ie+"/"+de)}function C(ie,de){const N=ie+"/"+de,se=new Set(E.value);se.has(N)?se.delete(N):se.add(N),E.value=se}function L(ie){const de=t.value[ie];return!de||de.length===0?!1:de.every(N=>E.value.has(ie+"/"+N.key))}function H(ie,de){const N=t.value[ie];if(!N)return;const se=new Set(E.value);for(const we of N){const B=ie+"/"+we.key;de?se.add(B):se.delete(B)}E.value=se}async function P(){s.value=!0,n.value=null;try{const ie=await J.get("/api/memory");e.value=Object.entries(ie).map(([de,N])=>({name:de,keys:N.keys||[],count:N.count||0}))}catch(ie){n.value=ie.message}s.value=!1}async function M(ie){if(a.value[ie]){a.value[ie]=!1;return}a.value[ie]=!0;const de=e.value.find(se=>se.name===ie);if(!de||t.value[ie]||i.value===ie)return;i.value=ie;let N;try{const we=(await J.get(`/api/memory/${encodeURIComponent(ie)}`)).entries||{};N=de.keys.map(B=>Object.prototype.hasOwnProperty.call(we,B)?{key:B,value:we[B]||"",failed:!1}:{key:B,value:"",failed:!0,error:"Not found in scope"})}catch(se){N=de.keys.map(we=>({key:we,value:"",failed:!0,error:se.message||"Failed to load"}))}t.value[ie]=N,i.value=null}function K(ie,de,N){f.value=ie+"/"+de,p.value=N}async function ne(ie,de){m.value=!0,b.value=null;try{await J.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(de)}`,{value:p.value});const N=t.value[ie];if(N){const se=N.find(we=>we.key===de);se&&(se.value=p.value)}f.value=null}catch(N){b.value=`Failed to save: ${N.message||"unknown error"}`}m.value=!1}async function U(ie,de){try{await navigator.clipboard.writeText(de.value),w.value=ie+"/"+de.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function I(){d.value=null,u.value=null;const ie=o.value.scope.trim(),de=o.value.key.trim(),N=o.value.value.trim();if(!ie){d.value="Scope is required";return}if(!de){d.value="Key is required";return}if(!N){d.value="Value is required";return}c.value=!0;try{await J.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(de)}`,{value:N}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(se){d.value=se.message}c.value=!1}function R(ie,de){v.value={scope:ie,key:de}}async function j(){if(!v.value)return;g.value=!0,b.value=null;const{scope:ie,key:de}=v.value;try{await J.del(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(de)}`);const N=t.value[ie];N&&(t.value[ie]=N.filter(B=>B.key!==de));const se=e.value.find(B=>B.name===ie);se&&(se.count--,se.keys=se.keys.filter(B=>B!==de));const we=new Set(E.value);we.delete(ie+"/"+de),E.value=we}catch(N){b.value=`Failed to delete: ${N.message||"unknown error"}`}g.value=!1,v.value=null}function z(){x.value=!0}async function ee(){g.value=!0,b.value=null;const ie=[];for(const de of E.value){const N=de.indexOf("/");ie.push({scope:de.slice(0,N),key:de.slice(N+1)})}try{await J.post("/api/memory/bulk-delete",{entries:ie}),E.value=new Set,t.value={},await P()}catch(de){b.value=`Bulk delete failed: ${de.message||"unknown error"}`}g.value=!1,x.value=!1}return Ye(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:f,editValue:p,saving:m,actionError:b,copied:w,selected:E,selectedCount:_,totalEntries:k,deleteTarget:v,deleting:g,showBulkDelete:x,fetchMemory:P,toggleScope:M,startEdit:K,doEdit:ne,copyValue:U,doAdd:I,confirmDelete:R,doDelete:j,confirmBulkDelete:z,doBulkDelete:ee,isSelected:T,toggleSelect:C,isScopeAllSelected:L,toggleSelectAll:H,filteredEntries:A}}},bk={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=te(()=>[...new Set(e.value.map(w=>w.category))].sort()),o=te(()=>{const b={};return e.value.forEach(w=>{b[w.category]=(b[w.category]||0)+1}),b}),c=te(()=>a.value?e.value.filter(b=>b.category===a.value):e.value);function d(b){return b==="correction"?"badge-warning":b==="operational"?"badge-info":b==="preference"?"badge-success":"badge-info"}function u(b){i.value=b.key,l.value=b.content}async function f(b){try{await J.put("/api/learned/"+encodeURIComponent(b),{content:l.value}),i.value=null,Ee.success("Entry updated"),await m()}catch(w){Ee.error(w.message||"Failed to save entry")}}async function p(b){if(await gs({title:"Delete learned entry",message:`Delete "${b}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await J.del("/api/learned/"+encodeURIComponent(b)),Ee.success("Entry deleted"),await m()}catch(E){Ee.error(E.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const b=await J.get("/api/learned");e.value=b.entries||[],t.value={last_reflection:b.last_reflection,count:b.count}}catch(b){n.value=b.message}s.value=!1}return Ye(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ra,startEdit:u,saveEdit:f,deleteEntry:p,fetchEntries:m}}},gg=[{id:"tools",label:"Tools",component:uk},{id:"skills",label:"Skills",component:hk},{id:"knowledge",label:"Knowledge",component:mk},{id:"memory",label:"Memory",component:vk},{id:"learned",label:"Learned",component:bk}],yk={components:{TabbedPage:kr},setup(){return{tabs:gg}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},xk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},_k={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},kk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},wk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=te(()=>e.value.components||[]),l=te(()=>kk[e.value.overall]||"text-gray-400"),r=te(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=te(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return xk[_]||"text-gray-400"}function d(_){return _k[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function f(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function p(_){return _.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function m(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function b(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function w(){a.value=!0;try{e.value=await J.get("/api/health/components"),s.value=null,n.value=!0}catch(_){s.value=_.message}finally{t.value=!1,a.value=!1}}function E(){t.value=!0,s.value=null,w()}let v=null,g=!1;function x(){g||(g=!0,w(),v||(v=setInterval(w,3e4)))}function k(){g&&(g=!1,v&&(clearInterval(v),v=null))}return Ye(x),Es(x),As(k),xt(k),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:f,formatName:p,formatTime:m,formatNumber:b,fetchHealth:w,retry:E}}},Sk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=te(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=te(()=>{if(!i.value)return[];const w=i.value,E=w.storage_total_bytes||1;return[{label:"Session Persistence",mb:w.sessions.persist_dir.total_mb,bytes:w.sessions.persist_dir.total_bytes,files:w.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(w.sessions.persist_dir.total_bytes/E*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:w.knowledge.db_file.total_mb,bytes:w.knowledge.db_file.total_bytes,files:w.knowledge.db_file.file_count,pct:Math.min(100,Math.round(w.knowledge.db_file.total_bytes/E*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:w.trajectories.message_dir.total_mb,bytes:w.trajectories.message_dir.total_bytes,files:w.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.message_dir.total_bytes/E*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:w.trajectories.agent_dir.total_mb,bytes:w.trajectories.agent_dir.total_bytes,files:w.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.agent_dir.total_bytes/E*100)),color:"res-bar-amber"}]});async function d(){try{const w=await J.get("/api/resource-usage");i.value=w,t.value=null,s.value=!0}catch(w){t.value=w.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function f(){e.value=!0,t.value=null,d()}let p=!1;function m(){p||(p=!0,d(),l||(l=setInterval(d,3e4)))}function b(){p&&(p=!1,l&&(clearInterval(l),l=null))}return Ye(m),Es(m),As(b),xt(b),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:cg,refresh:u,retry:f}}},Tk=["INFO","WARNING","ERROR"],Ck=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],qr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Ek=[50,100,200,500],Ak={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ge.state||"disconnected"),c=te(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),f=h(null),p=2e3,m=Tk,b=Ck,w=qr,E=h("all"),v=h(""),g=h([]),x=h(!1),k=h(""),_=h([]);function A(){try{const $=localStorage.getItem("odin-log-presets");$&&(g.value=JSON.parse($))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const C=te(()=>a.value!==""||i.value.trim()!==""||v.value!==""),L=te(()=>{const $=qr.find(le=>le.value===v.value);return $?$.label:""}),H=te(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch($){return $.message}}),P=24,M=te(()=>{if(z.value.length===0)return[];const $=[],le=new Date,ge=3600*1e3;for(let Ze=P-1;Ze>=0;Ze--){const pt=new Date(le.getTime()-(Ze+1)*ge),ss=new Date(le.getTime()-Ze*ge);$.push({start:pt,end:ss,label:I(pt,ss),shortLabel:ss.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ze of z.value){if(!Ze._time)continue;const pt=Ze._time.getTime();for(const ss of $)if(pt>=ss.start.getTime()&&pt<ss.end.getTime()){ss.total++,Ze.level==="ERROR"?ss.errors++:Ze.level==="WARNING"?ss.warnings++:ss.info++;break}}return $}),K=te(()=>{let $=1;for(const le of M.value)le.total>$&&($=le.total);return $}),ne=te(()=>{if(M.value.length===0)return"";const $=z.value.map(Ze=>Ze._time&&Ze._time.getTime()).filter(Boolean);if($.length===0)return"";const le=new Date(Math.min(...$));return`${z.value.length} shown, oldest ${le.toLocaleTimeString()}`}),U=te(()=>Math.ceil(P/8));function I($,le){const ge={hour:"2-digit",minute:"2-digit"};return $.toLocaleTimeString([],ge)+" - "+le.toLocaleTimeString([],ge)}function R($,le){return!le||!$?"0px":Math.max(2,$/le*100)+"%"}function j($){const le=z.value.findIndex(ge=>ge._time&&ge._time.getTime()>=$.start.getTime()&&ge._time.getTime()<$.end.getTime());if(le>=0&&d.value){const ge=d.value.querySelectorAll(".log-line");ge[le]&&(ge[le].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const z=te(()=>{let $=t.value;if(a.value&&($=$.filter(le=>(le.level||"INFO")===a.value)),v.value){const le=qr.find(ge=>ge.value===v.value);if(le&&le.seconds){const ge=new Date(Date.now()-le.seconds*1e3);$=$.filter(Ze=>Ze._time&&Ze._time>=ge)}}if(i.value&&!H.value)if(l.value)try{const le=new RegExp(i.value,"i");$=$.filter(ge=>{const Ze=ge.text||ge.raw||"",pt=ge.tool||"";return le.test(Ze)||le.test(pt)})}catch{}else{const le=i.value.toLowerCase();$=$.filter(ge=>{const Ze=(ge.text||ge.raw||"").toLowerCase(),pt=(ge.tool||"").toLowerCase();return Ze.includes(le)||pt.includes(le)})}return $});function ee($){if($.type==="log"&&$.line)try{const le=typeof $.line=="string"?JSON.parse($.line):$.line,ge=le.timestamp?new Date(le.timestamp):new Date;return{ts:ge.toLocaleTimeString(),_time:ge,level:le.error?"ERROR":"INFO",text:le.tool_name?`[${le.tool_name}] ${le.result_summary||""}`.trim():le.message||JSON.stringify(le),tool:le.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String($.line),tool:"",raw:String($.line)}}if($.payload){const le=$.payload,ge=le.timestamp?new Date(le.timestamp):new Date;return{ts:ge.toLocaleTimeString(),_time:ge,level:le.error?"ERROR":"INFO",text:le.tool_name?`[${le.tool_name}] ${le.result_summary||""}`.trim():le.message||JSON.stringify(le),tool:le.tool_name||"",raw:null}}return typeof $=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:$,tool:"",raw:$}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify($),tool:"",raw:null}}function ie($){const le=ee($);if(s.value){_.value.push(le);return}de(le)}function de($){t.value.push($),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Rt(()=>N())}function N($=!1){const le=d.value;le&&le.scrollTo({top:le.scrollHeight,behavior:$?"smooth":"instant"})}function se(){n.value=!0,u.value=!1,Rt(()=>N(!0))}const we=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function B(){const $=d.value;if(!$)return;const le=$.scrollHeight-$.scrollTop-$.clientHeight<40;u.value=!n.value&&!le&&t.value.length>0,ve.value&&pe()}function pe(){const $=d.value;!$||!n.value||$.scrollHeight-$.scrollTop-$.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function ce(){n.value&&requestAnimationFrame(pe)}function ye($){we.has($.key)&&ce()}const ve=h(!1);function Ue(){n.value&&(ve.value=!0,requestAnimationFrame(pe))}function y(){ve.value&&(ve.value=!1,pe())}function O(){n.value&&(u.value=!1,Rt(()=>N()))}function F(){if(s.value=!s.value,!s.value&&_.value.length>0){for(const $ of _.value)de($);_.value=[]}}function X(){t.value=[],_.value=[],u.value=!1}function Y(){let $;e.value==="search"?$=ze.value.map(pt=>{const ss=pt.error?"ERROR":"INFO",ds=pt.tool_name?`[${pt.tool_name}] `:"";return`${pt.timestamp||""} ${ss} ${ds}${pt.result_summary||pt.message||""}`}).join(`
`):$=z.value.map(pt=>`${pt.ts} ${pt.level} ${pt.text}`).join(`
`);const le=new Blob([$],{type:"text/plain"}),ge=URL.createObjectURL(le),Ze=document.createElement("a");Ze.href=ge,Ze.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ze.click(),URL.revokeObjectURL(ge)}function Z($,le){const ge=`${$.ts} ${$.level} ${$.text||$.raw||""}`;navigator.clipboard.writeText(ge).then(()=>{f.value=le,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function fe($){a.value=a.value===$?"":$,E.value="all"}function oe($){return $.level==="ERROR"?"log-line-error":$.level==="WARNING"?"log-line-warning":"text-gray-300"}function re($){return $==="ERROR"?"text-red-500 font-semibold":$==="WARNING"?"text-yellow-500":"text-blue-500"}function ae($){return $==="ERROR"?"log-chip-error":$==="WARNING"?"log-chip-warning":"log-chip-info"}function _e($){E.value=$.id;const le=$.filters;a.value=le.level||"",v.value=le.timeRange||"",i.value=le.text||"",le.levels&&(a.value=le.levels[0]||""),le.hasToolName&&(i.value="")}function he($){E.value=$.id,a.value=$.filters.level||"",v.value=$.filters.timeRange||"",i.value=$.filters.text||""}function me(){if(!k.value.trim())return;const $={id:"custom-"+Date.now(),name:k.value.trim(),filters:{level:a.value,timeRange:v.value,text:i.value}};g.value=[...g.value,$],T(),x.value=!1,k.value=""}function Te($){g.value=g.value.filter(le=>le.id!==$),T(),E.value===$&&(E.value="all")}const Ae=h("all"),Ie=h(""),Ne=h(""),Pe=h(""),He=h(""),st=h(""),V=h(100),ke=Ek,Oe=h(!1),De=h(!1),We=h(""),ze=h([]),ft=h(null),Kt=h(null);function Rs(){e.value="search",ft.value||yn()}async function yn(){try{ft.value=await J.get("/api/logs/stats")}catch{}}function Ms(){const $=st.value;if(!$){Pe.value="",He.value="";return}const ge={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[$];if(ge){const Ze=new Date(Date.now()-ge*1e3);Pe.value=bs(Ze),He.value=""}}function bs($){const le=ge=>String(ge).padStart(2,"0");return`${$.getFullYear()}-${le($.getMonth()+1)}-${le($.getDate())}T${le($.getHours())}:${le($.getMinutes())}`}function q($){if(!$)return"";const le=new Date($);return isNaN(le.getTime())?"":le.toISOString()}async function Ce(){Oe.value=!0,We.value="",De.value=!0,Kt.value=null;try{const $=new URLSearchParams;Ae.value&&Ae.value!=="all"&&$.set("level",Ae.value),Ie.value&&$.set("tool",Ie.value),Ne.value&&$.set("q",Ne.value);const le=q(Pe.value),ge=q(He.value);le&&$.set("start",le),ge&&$.set("end",ge),$.set("limit",String(V.value));const Ze=await J.get(`/api/logs/search?${$.toString()}`);ze.value=Ze.entries||[]}catch($){We.value=$.message||"Search failed",ze.value=[]}finally{Oe.value=!1}}function ys(){Ae.value="all",Ie.value="",Ne.value="",Pe.value="",He.value="",st.value="",V.value=100,ze.value=[],De.value=!1,We.value="",Kt.value=null}function Gs($){Kt.value=Kt.value===$?null:$}function Fn($){if(!$.timestamp)return"";try{return new Date($.timestamp).toLocaleString()}catch{return $.timestamp}}function $n($){return $.type==="web_action"?`${$.status||""} (${$.execution_time_ms||0}ms)`:($.result_summary||"").slice(0,200)}function xn($){return $.error?"log-line-error":"text-gray-300"}function ca($){try{return JSON.stringify($,null,2)}catch{return String($)}}let Gt=null,D=null,G=!1;function Q(){G||(G=!0,Ge.subscribe("logs",ie),r.value=Ge.connected,o.value=Ge.state||"disconnected",Gt=Ge.onStateChange,D=($,le)=>{o.value=$,r.value=$==="connected",Gt&&Gt($,le)},Ge.onStateChange=D)}function Se(){G&&(G=!1,Ge.unsubscribe("logs",ie),Ge.onStateChange===D&&(Ge.onStateChange=Gt),D=null,Gt=null)}return Ye(()=>{A(),window.addEventListener("pointerup",y),window.addEventListener("pointercancel",y)}),Es(Q),As(Se),xt(()=>{Se(),window.removeEventListener("pointerup",y),window.removeEventListener("pointercancel",y)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:z,pauseBuffer:_,showJumpBottom:u,copiedIndex:f,regexError:H,levels:m,logPresets:b,timeRanges:w,timeRange:v,activeLogPreset:E,customLogPresets:g,showSaveLogPreset:x,newLogPresetName:k,hasActiveLogFilters:C,timeRangeLabel:L,timelineBuckets:M,timelineMax:K,timelineSpanLabel:ne,timelineLabelSkip:U,togglePause:F,clearLogs:X,exportLogs:Y,logLineClass:oe,levelClass:re,levelChipClass:ae,toggleLevel:fe,copyLine:Z,jumpToBottom:se,onScroll:B,onUserScrollIntent:ce,onUserScrollKey:ye,onAutoScrollToggle:O,onPointerDown:Ue,applyLogPreset:_e,applyCustomLogPreset:he,saveLogCustomPreset:me,removeLogCustomPreset:Te,segmentHeight:R,jumpToTimelineBucket:j,searchLevel:Ae,searchTool:Ie,searchKeyword:Ne,searchStart:Pe,searchEnd:He,searchTimePreset:st,searchLimit:V,searchLimits:ke,searching:Oe,searchRan:De,searchError:We,searchResults:ze,searchStats:ft,expandedSearch:Kt,switchToSearch:Rs,runSearch:Ce,clearSearchFilters:ys,toggleSearchExpand:Gs,formatSearchTs:Fn,searchEntryText:$n,searchLogLineClass:xn,formatJson:ca,applySearchTimePreset:Ms}}};function Kr(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Rk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Activation required",short:"Dormant",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]),Oa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["personality","context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Ik={live_read:"Applies immediately",live_apply:"Reloads live",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Activation required",legacy_control:"Legacy control",dormant:"Not wired"},Iu={llm:{label:"LLM Config",href:"#/system?tab=llm",description:"This section has one canonical editor so provider changes use the safe switch and reload paths."},personality:{label:"Personality",href:"#/personality",description:"Personality presets and the active profile are managed on the dedicated Personality page."},discord:{label:"Discord overrides",href:"#/system?tab=discord",description:"Guild and channel overrides take precedence over these global defaults."},secrets:{label:"Secret controls",href:"#/system?tab=config",description:"Secret values are write-only and use dedicated set and clear flows."}},mg="odin_config_center_expanded_v1",vg="odin_config_center_category_v1",Ok=50,Ou=()=>J.get("/api/config/meta");function En(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function mi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Ps(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Lk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function Nk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function bg(e,t){if(mi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return En(t);const n={};for(const[a,i]of Object.entries(t)){const l=bg(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function Dk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=bg(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function yg(e,t,s,n){if(mi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)yg(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Mk(){try{const e=JSON.parse(localStorage.getItem(mg)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function Pk(){try{const e=localStorage.getItem(vg);return Oa.some(t=>t.key===e)?e:Oa[0].key}catch{return Oa[0].key}}const Fk={template:`
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

                  <div v-if="sectionOwner(section) && sectionApplyDetails(section).length" class="cfgc-section-apply-details" aria-label="Section apply behavior details">
                    <div v-for="detail in sectionApplyDetails(section)" :key="detail.key" :class="['cfgc-apply-detail', 'detail-' + detail.kind]">
                      <div class="cfgc-apply-detail-heading">
                        <strong>{{ detail.label }}</strong>
                        <span v-if="detail.apply_mode" :class="['cfgc-apply-pill', applyClass(detail.apply_mode)]">{{ applyModeLabel(detail.apply_mode) }}</span>
                      </div>
                      <code v-if="detail.code">{{ detail.code }}</code>
                      <p v-if="detail.text">{{ detail.text }}</p>
                    </div>
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
                        <div v-if="field.apply_details?.length" class="cfgc-apply-details" aria-label="Apply behavior details">
                          <div v-for="detail in field.apply_details" :key="detail.key" :class="['cfgc-apply-detail', 'detail-' + detail.kind]">
                            <div class="cfgc-apply-detail-heading">
                              <strong>{{ detail.label }}</strong>
                              <span v-if="detail.apply_mode" :class="['cfgc-apply-pill', applyClass(detail.apply_mode)]">{{ applyModeLabel(detail.apply_mode) }}</span>
                            </div>
                            <code v-if="detail.code">{{ detail.code }}</code>
                            <p v-if="detail.text">{{ detail.text }}</p>
                          </div>
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(!1),a=h(null),i=h(null),l=h(null),r=h(""),o=h("all"),c=h(Pk()),d=h(Mk()),u=h({}),f=h(null),p=h(void 0),m=h(!1),b=h({}),w=h([]),E=h([]),v=h(!1),g=h(!1),x=h(!1);let k=null;const _=te(()=>{var D;return((D=t.value)==null?void 0:D.fields)||[]}),A=te(()=>new Map(_.value.map(D=>[D.path,D]))),T=te(()=>e.value?Object.keys(e.value).length:0),C=te(()=>_.value.length),L=te(()=>Rk),H=te(()=>w.value.length>0),P=te(()=>E.value.length>0),M=te(()=>{if(!e.value)return[];const D=new Set(Oa.flatMap(Se=>Se.sections)),G=Oa.map(Se=>({...Se,sections:Se.sections.filter($=>Object.hasOwn(e.value,$))})).filter(Se=>Se.sections.length),Q=Object.keys(e.value).filter(Se=>!D.has(Se));return Q.length&&G.push({key:"other",label:"Other",icon:"folder",sections:Q}),G}),K=te(()=>{if(!e.value)return[];const D=[];for(const[G,Q]of Object.entries(u.value))yg(e.value[G],Q,G,D);return D.filter(G=>!mi(G.oldVal,G.newVal)).map(G=>{const Q=N(G.path);return{...G,label:(Q==null?void 0:Q.label)||Ps(G.path.split(".").at(-1)),apply_mode:(Q==null?void 0:Q.apply_mode)||ce(G.path.split(".")[0])}})}),ne=te(()=>K.value.length>0),U=te(()=>K.value.length),I=te(()=>new Set(K.value.map(D=>D.path.split(".")[0])).size),R=te(()=>!!r.value||o.value!=="all"),j=te(()=>{const D={...b.value};for(const G of K.value){const Q=N(G.path),Se=De(Q,G.newVal);Se&&(D[G.path]=Se)}return D}),z=te(()=>Object.keys(j.value).length>0),ee=te(()=>e.value?(R.value?M.value:M.value.filter(G=>G.key===c.value)).map(G=>({...G,sections:G.sections.filter(Q=>Z(Q))})).filter(G=>G.sections.length):[]),ie=te(()=>{const D=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],G=new Map(D.map(Q=>[Q,[]]));for(const Q of K.value){const Se=G.has(Q.apply_mode)?Q.apply_mode:"restart";G.get(Se).push(Q)}return D.filter(Q=>G.get(Q).length).map(Q=>({key:Q,label:bs(Q),entries:G.get(Q)}))}),de=te(()=>K.value.filter(D=>D.apply_mode==="restart").length);function N(D){var le;if(A.value.has(D)){const ge=A.value.get(D);return{...ge,apply_details:Kr([ge])}}const G=`${D}.`,Q=_.value.filter(ge=>ge.path.startsWith(G));if(!Q.length)return null;const Se=Q.some(ge=>ge.sensitivity!=="public")?"secret_container":"public",$=[...new Set(Q.map(ge=>ge.apply_mode))];return{path:D,label:Ps(D.split(".").at(-1)),description:Q[0].description,type:"object",sensitivity:Se,configured:Q.some(ge=>ge.configured),provenance:((le=Q.find(ge=>ge.provenance!=="unset"))==null?void 0:le.provenance)||"unset",apply_mode:$.length===1?$[0]:ce(D.split(".")[0]),apply_details:Kr(Q),constraints:{},enum:null}}function se(D){const G=`${D}.`;return _.value.filter(Q=>Q.path===D||Q.path.startsWith(G))}function we(D){return se(D).length}function B(D){return Ps(D)}function pe(D){const G=se(D);if(!G.length)return`${Ps(D)} configuration.`;const Q=G.find(le=>le.sensitivity==="public"&&le.description)||G.find(le=>le.description),Se=(Q==null?void 0:Q.description)||"";return Se.match(/setting for (.+)\.$/i)?`${Ps(D)} settings and runtime behaviour.`:Se}function ce(D){const G=[...new Set(se(D).map(Q=>Q.apply_mode))];return G.length===1?G[0]:G.includes("restart")?"restart":G.includes("activation_required")?"activation_required":G[0]||"restart"}function ye(D){const G=[...new Set(se(D).map(Q=>bs(Q.apply_mode)))];return G.length?G.length===1?G[0]:`Mixed apply behaviour: ${G.join(" · ")}`:""}function ve(D){return Kr(se(D))}function Ue(D){const G=se(D),Q=G.map(ge=>ge.owner).filter(ge=>ge&&ge!=="config"&&ge!=="secrets");if(!Q.length)return null;const Se=Q.reduce((ge,Ze)=>({...ge,[Ze]:(ge[Ze]||0)+1}),{}),[$,le]=Object.entries(Se).sort((ge,Ze)=>Ze[1]-ge[1])[0];return le>=Math.max(1,G.length-1)&&Iu[$]?$:null}function y(D){return Iu[D]||{label:Ps(D),href:"#/system?tab=config",description:"This feature uses a dedicated configuration and activation panel."}}function O(D){var G;return Object.hasOwn(u.value,D)?u.value[D]:(G=e.value)==null?void 0:G[D]}function F(D){const G=O(D);return(G&&typeof G=="object"&&!Array.isArray(G)?Object.entries(G).map(([Se,$])=>({key:Se,path:`${D}.${Se}`,value:$})):[{key:null,path:D,value:G}]).map(Se=>{const $=N(Se.path)||{};return{...$,...Se,label:$.label||(Se.key===null?B(D):Ps(Se.key)),description:$.description||`${Ps(Se.key||D)} setting for ${Ps(D)}.`,apply_mode:$.apply_mode||ce(D),sensitivity:$.sensitivity||"public",constraints:$.constraints||{},configured:$.configured??!0,provenance:$.provenance||"config_file"}})}function X(D,G){return[D.label,D.path,D.description,...D.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(G)}function Y(D){const G=r.value.trim().toLowerCase();return G?se(D).filter(Q=>X(Q,G)):[]}function Z(D){const G=se(D);if(o.value!=="all"&&!G.some(Se=>Se.apply_state===o.value))return!1;const Q=r.value.trim().toLowerCase();return!Q||`${B(D)} ${D}`.toLowerCase().includes(Q)?!0:G.some(Se=>X(Se,Q))}function fe(D,G){return se(D).filter(Q=>Q.apply_state===G).length}function oe(D){var G,Q,Se;return D==="all"?C.value:((Se=(Q=(G=t.value)==null?void 0:G.status)==null?void 0:Q.counts)==null?void 0:Se[D])??_.value.filter($=>$.apply_state===D).length}function re(D){const G=D.sections.flatMap(Q=>se(Q));return{fields:G.length,modified:K.value.filter(Q=>D.sections.includes(Q.path.split(".")[0])).length,pending_restart:G.filter(Q=>Q.apply_state==="pending_restart").length,invalid:G.filter(Q=>Q.apply_state==="invalid").length,dormant:G.filter(Q=>Q.apply_state==="dormant").length}}function ae(D){var G;return Object.hasOwn(u.value,D)&&!mi((G=e.value)==null?void 0:G[D],u.value[D])}function _e(D){return K.value.some(G=>G.path===D||G.path.startsWith(`${D}.`))}function he(D){c.value=D,r.value="",o.value="all";try{localStorage.setItem(vg,D)}catch{}}function me(D){o.value=D}function Te(){r.value="",o.value="all"}function Ae(D){return d.value[D]?!0:!!(r.value&&!x.value&&Z(D))}function Ie(D){const G=!Ae(D);x.value&&G?d.value={[D]:!0}:d.value={...d.value,[D]:G}}function Ne(){w.value.push(En(u.value)),w.value.length>Ok&&w.value.shift(),E.value=[]}function Pe(D){f.value!==D&&(f.value=D,m.value=Object.hasOwn(u.value,D),p.value=m.value?En(u.value[D]):void 0,m.value||(u.value={...u.value,[D]:En(e.value[D])}),d.value=x.value?{[D]:!0}:{...d.value,[D]:!0})}function He(D){if(!ze(D)){if(mi(u.value[D],e.value[D])){const G={...u.value};delete G[D],u.value=G}f.value=null,p.value=void 0,m.value=!1}}function st(D){const G={...u.value};m.value?G[D]=En(p.value):delete G[D],u.value=G,f.value=null,p.value=void 0,m.value=!1;const Q=`${D}.`;b.value=Object.fromEntries(Object.entries(b.value).filter(([Se])=>Se!==D&&!Se.startsWith(Q)))}function V(){!ne.value&&!f.value||(Ne(),u.value={},f.value=null,p.value=void 0,m.value=!1,b.value={},v.value=!1)}function ke(D,G){const Q=D.path.split(".")[0];if(f.value!==Q)return;Ne();const Se=En(u.value[Q]);if(D.key===null?u.value={...u.value,[Q]:G}:(Se[D.key]=G,u.value={...u.value,[Q]:Se}),b.value[D.path]){const $={...b.value};delete $[D.path],b.value=$}}function Oe(D,G){try{const Q=JSON.parse(G),Se={...b.value};delete Se[D.path],b.value=Se,ke(D,Q)}catch(Q){b.value={...b.value,[D.path]:`Invalid JSON: ${Q.message}`}}}function De(D,G){var Se;if(!D)return null;if((Se=D.enum)!=null&&Se.length&&!D.enum.includes(G))return`Choose one of: ${D.enum.join(", ")}`;const Q=D.constraints||{};if((D.type==="integer"||D.type==="number")&&typeof G=="number"){if(Q.minimum!==void 0&&G<Q.minimum)return`Must be at least ${Q.minimum}${D.unit?` ${D.unit}`:""}`;if(Q.maximum!==void 0&&G>Q.maximum)return`Must be at most ${Q.maximum}${D.unit?` ${D.unit}`:""}`}return null}function We(D){return j.value[D.path]||null}function ze(D){const G=`${D}.`;return Object.keys(j.value).some(Q=>Q===D||Q.startsWith(G))}function ft(){w.value.length&&(E.value.push(En(u.value)),u.value=w.value.pop(),b.value={})}function Kt(){E.value.length&&(w.value.push(En(u.value)),u.value=E.value.pop(),b.value={})}function Rs(){!ne.value||z.value||(f.value&&He(f.value),v.value=!0,g.value=!1)}function yn(){v.value=!1}function Ms(){f.value?st(f.value):V()}function bs(D){return Ik[D]||Ps(D||"unknown")}function q(D){return`apply-${String(D||"unknown").replaceAll("_","-")}`}function Ce(D){return`cfgc-field-${D.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ys(D){return`${Ce(D)}-input`}function Gs(D){const G=document.getElementById(Ce(D))||document.getElementById(Ce(D.split(".").slice(0,2).join(".")));G==null||G.scrollIntoView({behavior:"smooth",block:"center"})}function Fn(D,G){i.value={type:D,message:G},window.setTimeout(()=>{var Q;((Q=i.value)==null?void 0:Q.message)===G&&(i.value=null)},3500)}async function $n(){if(!(!ne.value||z.value||n.value)){n.value=!0;try{const D=Dk(e.value,u.value),G=await J.put("/api/config",D);e.value=G,u.value={},f.value=null,p.value=void 0,m.value=!1,w.value=[],E.value=[],b.value={},v.value=!1;try{t.value=await Ou(),l.value=null,Fn("success","Configuration saved. Apply status has been refreshed.")}catch(Q){l.value=Q.message||"Unknown metadata error.",Fn("error",`Configuration saved, but apply status could not be refreshed: ${l.value}`)}}catch(D){Fn("error",D.message||"Configuration could not be saved")}finally{n.value=!1}}}async function xn(){var D;if(!ne.value){s.value=!0,a.value=null;try{const G=await J.get("/api/config"),Q=await Ou();e.value=G,t.value=Q,l.value=null;const Se=M.value;Se.some($=>$.key===c.value)||(c.value=((D=Se[0])==null?void 0:D.key)||Oa[0].key)}catch(G){a.value=G.message||"Unknown configuration error"}finally{s.value=!1}}}function ca(D){if(v.value||!(D.ctrlKey||D.metaKey))return;const G=D.target;G instanceof HTMLElement&&(G.matches("input, textarea, select")||G.isContentEditable)||(!D.shiftKey&&D.key.toLowerCase()==="z"?(D.preventDefault(),ft()):(D.key.toLowerCase()==="y"||D.shiftKey&&D.key.toLowerCase()==="z")&&(D.preventDefault(),Kt()))}function Gt(D){if(x.value=D.matches,D.matches){const G=Object.keys(d.value).find(Q=>d.value[Q]);d.value=G?{[G]:!0}:{}}}return Xt(d,D=>{try{localStorage.setItem(mg,JSON.stringify(D))}catch{}},{deep:!0}),Ye(()=>{var D;xn(),document.addEventListener("keydown",ca),k=window.matchMedia("(max-width: 760px)"),Gt(k),(D=k.addEventListener)==null||D.call(k,"change",Gt)}),xt(()=>{var D;document.removeEventListener("keydown",ca),(D=k==null?void 0:k.removeEventListener)==null||D.call(k,"change",Gt)}),{config:e,meta:t,loading:s,saving:n,error:a,toast:i,metaRefreshError:l,searchQuery:r,healthFilter:o,activeCategory:c,editingSection:f,reviewOpen:v,mobileOverflowOpen:g,healthFilters:L,visibleCategories:M,displayGroups:ee,reviewGroups:ie,sectionCount:T,fieldCount:C,hasChanges:ne,changeCount:U,changedSectionCount:I,hasDraftErrors:z,canUndo:H,canRedo:P,globalFilterActive:R,reviewRestartCount:de,healthCount:oe,categoryStats:re,selectCategory:he,selectHealthFilter:me,clearFilters:Te,sectionLabel:B,sectionDescription:pe,sectionFieldCount:we,sectionHealthCount:fe,sectionApplySummary:ye,sectionApplyDetails:ve,sectionOwner:Ue,ownerInfo:y,sectionEntries:F,sectionSearchHits:Y,sectionChanged:ae,fieldChanged:_e,isSectionExpanded:Ae,toggleSection:Ie,startSectionDraft:Pe,finishSectionDraft:He,cancelSectionDraft:st,discardAllDrafts:V,setFieldValue:ke,setJsonFieldValue:Oe,fieldError:We,sectionHasErrors:ze,undo:ft,redo:Kt,openReview:Rs,closeReview:yn,mobileCancel:Ms,applyModeLabel:bs,applyClass:q,compactValue:Lk,formatValue:Nk,fieldId:Ce,fieldInputId:ys,focusField:Gs,fetchConfig:xn,saveConfig:$n}}},$k={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await J.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function d(p,m,b){try{await J.put("/api/discord/guild/"+p+"/config",{[m]:b}),await c()}catch(w){s.value=w.message}}async function u(p,m,b,w){try{await J.put("/api/discord/channel/"+p+"/config",{[b]:w}),await c()}catch(E){s.value=E.message}}async function f(p,m){try{await J.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(b){s.value=b.message}}return Ye(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:d,setChannelConfig:u,clearOverride:f}}},us=e=>e==null?e:JSON.parse(JSON.stringify(e));function Uk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const f=new Map;let p=null;const m=new Map;function b(_){d+=1;const A=c.then(_,_);return c=A.catch(()=>{}),A}function w(_,A){p=us(_),m.clear();for(const[T,C]of Object.entries(A||{}))m.set(T,us(C))}function E(_){const A=us(_),T=++u;return b(async()=>{try{await e(us(A)),p=us(A),T===u&&n(us(A))}catch(C){T===u&&(a(us(p)),o(C,{kind:"default"}))}})}function v(_,A){const T=us(A),C=(f.get(_)||0)+1;return f.set(_,C),b(async()=>{try{await t(_,us(T)),m.set(_,us(T)),C===f.get(_)&&i(_,us(T))}catch(L){C===f.get(_)&&(l(_,us(m.get(_)??null)),o(L,{kind:"user",uid:_}))}})}function g(_){const A=(f.get(_)||0)+1;return f.set(_,A),b(async()=>{try{await s(_),m.delete(_),A===f.get(_)&&r(_)}catch(T){A===f.get(_)&&(l(_,us(m.get(_)??null)),o(T,{kind:"delete",uid:_}))}})}async function x(){for(;;){const _=c;if(await _,_===c)return d}}async function k(_){for(;;){const A=await x(),T=await _();if(A===d)return T}}return{seed:w,saveDefault:E,saveUser:v,deleteUser:g,whenIdle:x,readSnapshot:k,get revision(){return d}}}const Bk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),d=h([]),u=h(null),f=te(()=>{const z={};for(const ee of d.value)z[ee.id]=ee;return z});function p(z){return f.value[z]||null}const m=te(()=>/^\d{15,25}$/.test(r.value.trim())),b=te(()=>{if(o.value){if(w.value[c.value])return"host-user-option-"+c.value;if(m.value)return"host-user-option-raw"}}),w=te(()=>{const z=r.value.toLowerCase().trim();return z?d.value.filter(ee=>!i.value[ee.id]&&(ee.display_name.toLowerCase().includes(z)||ee.username.toLowerCase().includes(z)||ee.id.includes(z))):d.value.filter(ee=>!i.value[ee.id])});function E(z,ee){return z?z.allowed_hosts===null||z.allowed_hosts===void 0?{allowed_hosts:[...ee],default_host:z.default_host||"",allow_all:!0}:{allowed_hosts:z.allowed_hosts,default_host:z.default_host||"",allow_all:!1}:{allowed_hosts:[...ee],default_host:ee[0]||"",allow_all:!0}}const v=Uk({applyDefault:async z=>{const ee=z.allow_all?null:z.allowed_hosts;await J.put("/api/host-access/default-policy",{allowed_hosts:ee,default_host:z.default_host})},applyUser:async(z,ee)=>{const ie=ee.allow_all?null:ee.allowed_hosts;await J.put(`/api/host-access/user/${z}`,{allowed_hosts:ie,default_host:ee.default_host})},applyDelete:z=>J.del(`/api/host-access/user/${z}`),onDefaultConfirmed:()=>Ee.success("Default policy updated"),onDefaultRollback:z=>{z&&(a.value=z)},onUserConfirmed:z=>{const ee=p(z);Ee.success(`Updated access for ${ee?ee.display_name:z}`)},onUserRollback:(z,ee)=>{const ie={...i.value};ee?ie[z]=ee:delete ie[z],i.value=ie},onUserDeleted:z=>{const ee={...i.value};delete ee[z],i.value=ee},onError:(z,ee)=>{var de;const ie=ee.uid?` ${((de=p(ee.uid))==null?void 0:de.display_name)||ee.uid}`:"";Ee.error(`${z.message||"Failed to save"} — reverted${ie}`)}});let g=0;async function x(){const z=++g;e.value=!0,t.value="";try{const ee=await v.readSnapshot(()=>J.get("/api/host-access"));if(z!==g)return;s.value=ee,n.value=ee.available_hosts||[],a.value=E(ee.default_policy,n.value);const ie=ee.users||{},de={};for(const[N,se]of Object.entries(ie))de[N]=E(se,n.value);i.value=de,v.seed(a.value,de)}catch(ee){z===g&&(t.value=ee.message||"Failed to fetch host access data")}finally{z===g&&(e.value=!1)}try{const ee=await J.get("/api/discord/members")||[];z===g&&(d.value=ee)}catch{z===g&&(d.value=[])}}function k(){v.saveDefault(a.value)}function _(z,ee){a.value.allow_all=!1,ee?a.value.allowed_hosts.includes(z)||a.value.allowed_hosts.push(z):(a.value.allowed_hosts=a.value.allowed_hosts.filter(ie=>ie!==z),a.value.default_host===z&&(a.value.default_host=a.value.allowed_hosts[0]||"")),k()}function A(z){const ee=i.value[z];ee&&v.saveUser(z,ee)}function T(z,ee,ie){const de=i.value[z];de&&(de.allow_all=!1,ie?de.allowed_hosts.includes(ee)||de.allowed_hosts.push(ee):(de.allowed_hosts=de.allowed_hosts.filter(N=>N!==ee),de.default_host===ee&&(de.default_host=de.allowed_hosts[0]||"")),A(z))}function C(z,ee){const ie=i.value[z];ie&&(ie.default_host=ee,A(z))}function L(){l.value=!0,r.value="",c.value=0,Rt(()=>{u.value&&u.value.focus()})}function H(){o.value=!0,c.value=0}function P(){c.value<w.value.length-1&&c.value++}function M(){c.value>0&&c.value--}function K(){const z=w.value[c.value];if(z){U(z);return}m.value&&ne()}function ne(){const z=r.value.trim();/^\d{15,25}$/.test(z)&&(i.value[z]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(z),r.value="",o.value=!1,l.value=!1)}function U(z){i.value[z.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(z.id),r.value="",o.value=!1,l.value=!1}function I(){o.value=!1}function R(){setTimeout(()=>{o.value=!1},150)}async function j(z){const ee=p(z);await gs({title:"Remove user override",message:`Remove the host access override for ${ee?ee.display_name:z}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await v.deleteUser(z),i.value[z]||Ee.success(`Removed override for ${ee?ee.display_name:z}`))}return Ye(x),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:d,filteredMembers:w,isRawId:m,activeOptionId:b,searchInput:u,fetchData:x,saveDefaultPolicy:k,toggleDefaultHost:_,getMember:p,toggleUserHost:T,setUserDefault:C,openAddUser:L,deleteUser:j,onSearchInput:H,highlightNext:P,highlightPrev:M,selectHighlighted:K,selectMember:U,closeDropdown:I,onBlur:R,addRawId:ne}}},Hk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=te(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=te(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function p(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const T=await J.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function b(T){return!T||!T.trim()?[]:T.split(",").map(C=>C.trim()).filter(Boolean)}function w(T,C){const L=c.value.allowed_hosts;if(C&&!L.includes(T)&&L.push(T),!C){const H=L.indexOf(T);H>=0&&L.splice(H,1)}}function E(T,C){const L=d.value.allowed_hosts;if(C&&!L.includes(T)&&L.push(T),!C){const H=L.indexOf(T);H>=0&&L.splice(H,1)}}async function v(){var T;i.value=!0;try{const C=b(c.value.allowed_tools_str),L=c.value.host_mode,H=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};H!==null&&(P.allowed_hosts=H),P.default_host=c.value.default_host||"";const M=await J.post("/api/tokens",P);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Ee.success("Token created"),await m()}catch(C){Ee.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to create token")}finally{i.value=!1}}function g(T){r.value=T;const C=T.allowed_hosts;let L="default";C==null?L="default":Array.isArray(C)&&C.length===0?L="none":Array.isArray(C)&&(L="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:L,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function x(){var T;if(r.value){o.value=!0;try{const C=b(d.value.allowed_tools_str),L=d.value.host_mode,H={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};L==="none"?H.allowed_hosts=[]:L==="select"?H.allowed_hosts=d.value.allowed_hosts:H.allowed_hosts=null,H.default_host=d.value.default_host||"",await J.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,Ee.success("Token updated"),await m()}catch(C){Ee.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function k(T){var L;if(await gs({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await J.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=H.token,Ee.success("Token regenerated")}catch(H){Ee.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to regenerate")}}async function _(T){var L;if(await gs({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await J.del("/api/tokens/"+encodeURIComponent(T.user_id)),Ee.success("Token deleted"),await m()}catch(H){Ee.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ee.success("Copied to clipboard")}catch{Ee.error("Copy failed — select and copy manually")}}return Ye(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:f,fetchData:m,tierBadge:p,toggleCreateHost:w,toggleEditHost:E,createToken:v,startEdit:g,saveEdit:x,confirmRegenerate:k,confirmDelete:_,copyToken:A}}};function cl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Vk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=te(()=>{const q=n.value.model;return q&&!a.includes(q)?[q,...a]:a}),l=te(()=>{const q=n.value.agent_model;return q&&q!=="auto"&&!a.includes(q)?[q,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=te(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=te(()=>{const q=n.value.agent_model;return q==="auto"?!0:!r.includes(q||n.value.model)}),d=te(()=>{const q=n.value.agent_reasoning_effort;return q==="auto"?!1:(q||n.value.reasoning_effort)==="max"}),u=q=>r.includes(q)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),f=q=>r.includes(q)&&d.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),m=h({unavailable_reason:null}),b=te(()=>{const q=p.value.model;return q&&!a.includes(q)?[q,...a]:a});function w(q){const Ce=q.target.value;p.value.enabled=Ce!=="",Ce!==""&&(p.value.model=Ce),He()}const E=h(!1),v=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),g=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),x=h(!1),k=h(!1),_=h(!1),A=h(!1),T=h(!1),C=h(!1),L=h(!1),H=h({configured:!1}),P=h([]),M=h(""),K=h(!1),ne=h(!1),U=h({configured:!1}),I=h([]),R=h(""),j=h(!1),z=h(!1),ee=h(!0),ie=h(""),de=h({configured:!1,accounts:[]}),N=h(null),se=h(null),we=h(""),B=h(null),pe=h(!1),ce=h(null),ye=h(null),ve=h("");let Ue=null;function y(q,Ce="success"){Ee(q,Ce==="error"?"error":"success")}function O(q){if(!q)return"?";const Ce=q/(1024*1024*1024);return Ce>=1?Ce.toFixed(1)+" GB":(q/(1024*1024)).toFixed(0)+" MB"}async function F(){e.value=!0,await Promise.all([X(),Y(),_e(),Z()]),e.value=!1}async function X(){try{const q=await J.get("/api/llm/status");t.value=q,s.value=q.active_provider||"codex",q.codex&&!Pe.pending()&&(n.value.enabled=q.codex.enabled,n.value.model=q.codex.model||"gpt-5.5",n.value.reasoning_effort=q.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=q.codex.agent_reasoning_effort||"",n.value.agent_model=q.codex.agent_model||"",n.value.max_tokens=q.codex.max_tokens||4096),q.ollama&&!st.pending()&&(v.value.enabled=q.ollama.enabled,v.value.base_url=q.ollama.base_url||"",v.value.model=q.ollama.model||"",v.value.max_tokens=q.ollama.max_tokens||4096),q.kimi&&!V.pending()&&(g.value.enabled=q.kimi.enabled,g.value.model=q.kimi.model||"",g.value.max_tokens=q.kimi.max_tokens||4096),q.auxiliary&&(m.value=q.auxiliary,He.pending()||(p.value.enabled=q.auxiliary.enabled,p.value.model=q.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Y(){try{if(H.value=await J.get("/api/ollama/status"),H.value.model&&(M.value=H.value.model),H.value.configured)try{const q=await J.get("/api/ollama/models");P.value=q.models||[]}catch{P.value=[]}else if(v.value.base_url)try{const q=await J.post("/api/ollama/probe-models",{base_url:v.value.base_url});P.value=q.models||[]}catch{P.value=[]}}catch{H.value={configured:!1}}}async function Z(){ee.value=!0,ie.value="";try{de.value=await J.get("/api/codex/status")}catch(q){ie.value=q.message||"Failed to fetch Codex status"}finally{ee.value=!1}}async function fe(){const q=t.value?t.value.active_provider:"codex";L.value=!0;try{const Ce=await J.post("/api/llm/switch",{provider:s.value});Ce.error?(s.value=q,y(Ce.error,"error")):(y("Switched to "+s.value+" ("+Ce.model+")"),await F())}catch(Ce){s.value=q,y(Ce.message||"Switch failed","error")}finally{L.value=!1}}async function oe(){K.value=!0;try{const q=await J.post("/api/ollama/reload");y(q.configured?"Ollama reloaded":q.reason||"Ollama not configured",q.configured?"success":"error"),await F()}catch(q){y(q.message||"Reload failed","error")}finally{K.value=!1}}async function re(){ne.value=!0;try{await J.post("/api/ollama/model",{model:M.value}),y("Model set to "+M.value),await F()}catch(q){y(q.message||"Failed","error")}finally{ne.value=!1}}async function ae(){const q=v.value.base_url;if(!q){y("Enter a base URL first","error");return}C.value=!0;try{const Ce=await J.post("/api/ollama/probe-models",{base_url:q});P.value=Ce.models||[],P.value.length?(y(P.value.length+" model(s) found"),!v.value.model&&P.value.length&&(v.value.model=P.value[0].name)):y("No models found at "+q,"error")}catch(Ce){y(Ce.message||"Could not reach Ollama","error")}finally{C.value=!1}}async function _e(){try{if(U.value=await J.get("/api/kimi/status"),U.value.model&&(R.value=U.value.model),U.value.configured)try{const q=await J.get("/api/kimi/models");I.value=q.models||[]}catch{I.value=[]}}catch{U.value={configured:!1}}}async function he(){j.value=!0;try{const q=await J.post("/api/kimi/reload");y(q.configured?"Kimi reloaded":q.reason||"Kimi not configured",q.configured?"success":"error"),await F()}catch(q){y(q.message||"Reload failed","error")}finally{j.value=!1}}async function me(){z.value=!0;try{await J.post("/api/kimi/model",{model:R.value}),y("Model set to "+R.value),await F()}catch(q){y(q.message||"Failed","error")}finally{z.value=!1}}async function Te(){if(_.value){Pe();return}_.value=!0;try{await J.put("/api/llm/codex/config",n.value),y("Codex config saved"),await Promise.all([X(),Z()])}catch(q){y(q.message||"Failed","error"),await Promise.all([X(),Z()])}finally{_.value=!1}}async function Ae(){if(A.value){st();return}A.value=!0;try{const q={...v.value},Ce=x.value?v.value.api_key:null;Ce===null&&delete q.api_key,await J.put("/api/llm/ollama/config",q),y("Ollama config saved"),Ce!==null&&v.value.api_key===Ce&&(v.value.api_key="",x.value=!1),await Promise.all([X(),Y()])}catch(q){y(q.message||"Failed","error")}finally{A.value=!1}}async function Ie(){if(T.value){V();return}T.value=!0;try{const q={...g.value},Ce=k.value?g.value.api_key:null;Ce===null&&delete q.api_key,await J.put("/api/llm/kimi/config",q),y("Kimi config saved"),Ce!==null&&g.value.api_key===Ce&&(g.value.api_key="",k.value=!1),await Promise.all([X(),_e()])}catch(q){y(q.message||"Failed","error")}finally{T.value=!1}}async function Ne(){if(E.value){He();return}E.value=!0;try{await J.put("/api/llm/auxiliary/config",p.value),y("Auxiliary config saved"),await X()}catch(q){y(q.message||"Failed","error"),await X()}finally{E.value=!1}}const Pe=cl(Te),He=cl(Ne),st=cl(Ae),V=cl(Ie),ke=()=>(Pe.cancel(),Te()),Oe=()=>(st.cancel(),Ae()),De=()=>(V.cancel(),Ie());async function We(q){try{await J.post("/api/codex/account/"+q+"/activate"),y("Active account switched"),await Z()}catch(Ce){y(Ce.message||"Failed","error")}}async function ze(q){N.value=q;try{await J.post("/api/codex/account/"+q+"/refresh"),y("Token refreshed"),await Z()}catch(Ce){y(Ce.message||"Refresh failed","error")}finally{N.value=null}}function ft(q,Ce){se.value=q,we.value=Ce||""}async function Kt(q){try{await J.put("/api/codex/account/"+q+"/label",{label:we.value}),y("Label updated"),se.value=null,await Z()}catch(Ce){y(Ce.message||"Failed","error")}}async function Rs(q,Ce){if(await gs({title:"Delete Codex account",message:`Delete ${Ce||"account #"+(q+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await J.del("/api/codex/account/"+q),y("Deleted. Pool reloaded."),await Z()}catch(Gs){y(Gs.message||"Failed","error")}}async function yn(){pe.value=!0;try{const q=await J.post("/api/codex/device-code");ce.value=q,B.value="pending",Ms(q)}catch(q){y(q.message||"Failed","error")}finally{pe.value=!1}}async function Ms(q){Ue={cancelled:!1};const Ce=Ue;try{const ys=await J.post("/api/codex/device-poll",{device_auth_id:q.device_auth_id,user_code:q.user_code,interval:q.interval});if(Ce.cancelled)return;ye.value=ys,B.value="success",await F()}catch(ys){if(Ce.cancelled)return;ve.value=ys.message||"Device login failed",B.value="error"}}function bs(){Ue&&(Ue.cancelled=!0),B.value=null,ce.value=null}return Ye(F),xt(()=>{Ue&&(Ue.cancelled=!0),Pe.cancel(),He.cancel(),st.cancel(),V.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:L,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:f,auxForm:p,auxData:m,auxModelOptions:b,onAuxModelChange:w,savingAux:E,saveAuxConfigDebounced:He,ollamaForm:v,kimiForm:g,savingCodex:_,savingOllama:A,savingKimi:T,probingOllama:C,ollamaKeyDirty:x,kimiKeyDirty:k,ollamaStatus:H,ollamaModels:P,ollamaSelectedModel:M,reloading:K,settingModel:ne,kimiStatus:U,kimiModels:I,kimiSelectedModel:R,reloadingKimi:j,settingKimiModel:z,codexLoading:ee,codexError:ie,codexData:de,refreshing:N,editingLabel:se,labelValue:we,deviceState:B,deviceLoading:pe,deviceInfo:ce,deviceResult:ye,deviceError:ve,fetchAll:F,switchProvider:fe,reloadOllama:oe,setOllamaModel:re,reloadKimi:he,setKimiModel:me,probeOllamaModels:ae,saveCodexConfig:Te,saveOllamaConfig:Ae,saveKimiConfig:Ie,saveCodexConfigDebounced:Pe,saveOllamaConfigDebounced:st,saveKimiConfigDebounced:V,saveCodexConfigNow:ke,saveOllamaConfigNow:Oe,saveKimiConfigNow:De,activateAccount:We,refreshAccount:ze,startEditLabel:ft,saveLabel:Kt,deleteAccount:Rs,startDeviceLogin:yn,cancelDeviceLogin:bs,formatSize:O}}},Lu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function jk(e){return Lu[e]||Lu[(e||"").toLowerCase()]||"text-gray-400"}const zk={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=h(""),u=h(0);let f=null;async function p(){var _;const v=await Promise.allSettled([J.get("/api/startup/diagnostics"),J.get("/api/subsystems/status"),J.get("/api/pools/ssh"),J.get("/api/pools/http"),J.get("/api/risk/stats"),J.get("/api/recovery/stats"),J.get("/api/compression/stats"),J.get("/api/freshness/stats"),J.get("/api/governor/stats")]),g=A=>v[A].status==="fulfilled"?v[A].value:null;t.value=g(0)||{};const x=g(1);s.value=Array.isArray(x)?x:x&&x.subsystems||[],n.value=g(2)||{},a.value=g(3)||{},i.value=g(4),l.value=g(5),r.value=g(6),o.value=g(7),c.value=g(8);const k=v.filter(A=>A.status==="rejected");if(u.value=k.length,k.length===v.length){const A=(_=k[0])==null?void 0:_.reason;d.value=(A==null?void 0:A.message)||"Failed to load internals"}else d.value="";e.value=!1}function m(){e.value=!0,d.value="",p()}let b=!1;function w(){b||(b=!0,p(),f||(f=setInterval(p,3e4)))}function E(){b&&(b=!1,f&&(clearInterval(f),f=null))}return Ye(w),Es(w),As(E),xt(E),{loading:e,error:d,failedCount:u,retry:m,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:jk,formatTime:Mc}}},qk={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await J.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await gs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await J.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return Ye(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},xg=[{id:"health",label:"Health",component:wk},{id:"resources",label:"Resources",component:Sk},{id:"logs",label:"Logs",component:Ak},{id:"config",label:"Config",component:Fk},{id:"discord",label:"Discord",component:$k},{id:"host-access",label:"Host Access",component:Bk},{id:"api-tokens",label:"API Tokens",component:Hk},{id:"llm",label:"LLM Config",component:Vk},{id:"internals",label:"Internals",component:zk},{id:"update",label:"Update",component:qk}],Kk={components:{TabbedPage:kr},setup(){return{tabs:xg}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},dl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Gk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...dl("Operations","operations","/operations",pg),...dl("History","history","/history",hg),...dl("Capabilities","capabilities","/capabilities",gg),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...dl("System","system","/system",xg)],is=Mn({open:!1,query:"",selected:0});function Nu(){is.query="",is.selected=0,is.open=!0}function Gr(){is.open=!1}function Wk(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Zk={setup(){const e=lg(),t=h(null),s=te(()=>{const i=is.query.trim().toLowerCase();return Gk.map(l=>({...l,_score:Wk(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});Xt(()=>is.open,async i=>{var l;i&&(await Rt(),(l=t.value)==null||l.focus())}),Xt(()=>is.query,()=>{is.selected=0});function n(i){Gr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Gr();return}if(i.key==="ArrowDown")i.preventDefault(),is.selected=Math.min(is.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),is.selected=Math.max(is.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[is.selected];l&&n(l)}}return{state:is,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Gr}},template:`
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
  `},Io={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Io));const Jk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Da("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Da("path",{d:Io[e.name]||Io.info})])}},Yk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Du(e){return[...e.querySelectorAll(Yk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Qk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Du(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Du(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Xk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const f=te(()=>{const M=e.value.uptime_seconds||0,K=Math.floor(M/86400),ne=Math.floor(M%86400/3600),U=Math.floor(M%3600/60),I=[];return K>0&&I.push(`${K}d`),ne>0&&I.push(`${ne}h`),(I.length===0||K===0&&ne===0)&&I.push(`${U}m`),I.join(" ")}),p=te(()=>{const M=e.value.uptime_seconds||0;return 125.66*(1-Math.min(M/86400,1))}),m=te(()=>{const M=e.value;return[{label:"Guilds",value:M.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:M.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:M.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${M.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:M.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:M.loop_count>0?"text-green-400":"",highlight:M.loop_count>0},{label:"Agents",value:M.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:M.agent_count>0?`${M.agent_count} total`:"",subColor:"text-gray-500",highlight:(M.agent_running??0)>0},{label:"Processes",value:M.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:M.process_count>0?`${M.process_count} total`:"",subColor:"text-gray-500",highlight:(M.process_running??0)>0},{label:"Schedules",value:M.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(M.schedule_failing>0?`${M.schedule_failing} failing`:"")+(M.schedule_failing>0&&M.schedule_paused>0?", ":"")+(M.schedule_paused>0?`${M.schedule_paused} paused`:"")||void 0,subColor:M.schedule_failing>0?"text-red-400":"text-yellow-400",color:M.schedule_failing>0?"text-red-400":"",highlight:M.schedule_failing>0},{label:"Users",value:M.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),b=te(()=>{const M=e.value,K=[];return K.push({label:"Bot",status:M.status==="online"?"ok":"warn",detail:M.status==="online"?"Online":"Starting"}),(M.schedule_failing||0)>0?K.push({label:"Schedules",status:"error",detail:`${M.schedule_failing} failing`}):(M.schedule_count||0)>0&&K.push({label:"Schedules",status:"ok",detail:`${M.schedule_count} configured`}),(M.loop_count||0)>0&&K.push({label:"Loops",status:"ok",detail:`${M.loop_count} active`}),(M.agent_running||0)>0&&K.push({label:"Agents",status:"ok",detail:`${M.agent_running} running`}),(M.process_running||0)>0&&K.push({label:"Processes",status:"ok",detail:`${M.process_running} running`}),K});async function w(){try{e.value=await J.get("/api/status"),s.value=null}catch(M){s.value=M.message}finally{t.value=!1}}async function E(){a.value=!0;try{n.value=await J.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function v(){l.value=!0;try{i.value=await J.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function g(){try{const M=await J.get("/api/knowledge");c.value=(Array.isArray(M)?M:[]).reduce((K,ne)=>K+(ne.chunks||0),0)}catch{c.value=null}}async function x(){try{const M=await J.get("/api/agents");r.value=M.filter(K=>K.status==="running")}catch{}}async function k(){d.value={...d.value,reload:!0};try{await J.post("/api/reload"),Ee.success("Config reloaded")}catch(M){Ee.error(M.message)}d.value={...d.value,reload:!1}}async function _(){if(!await gs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const K=e.value.session_count;e.value={...e.value,session_count:0};try{const ne=await J.post("/api/sessions/clear-all");Ee.success(`Cleared ${ne.count} session${ne.count!==1?"s":""}`),await w()}catch(ne){e.value={...e.value,session_count:K},Ee.error(ne.message)}d.value={...d.value,clearSessions:!1}}async function A(){if(!await gs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const K=e.value.loop_count;e.value={...e.value,loop_count:0};try{const ne=await J.post("/api/loops/stop-all");Ee.success(ne.result),await w()}catch(ne){e.value={...e.value,loop_count:K},Ee.error(ne.message)}d.value={...d.value,stopLoops:!1}}function T(){t.value=!0,s.value=null,w(),E(),v(),x()}let C=null,L=null,H=null;function P(M){if(M.payload&&M.payload.tool_name){const K={...M.payload,_isNew:!0,_key:++u};n.value.unshift(K),n.value.length>10&&n.value.pop(),o.value++,K.error&&(i.value.unshift(K),i.value.length>5&&i.value.pop()),setTimeout(()=>{K._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return Ye(async()=>{await Promise.all([w(),E(),v(),x(),g()]),C=setInterval(w,15e3),L=setInterval(x,1e4),Ge.subscribe("events",P)}),xt(()=>{C&&clearInterval(C),L&&clearInterval(L),clearTimeout(H),Ge.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:m,healthIndicators:b,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:E,fetchStatus:w,formatTime:Mc,formatDuration:ja,retry:T,reloadConfig:k,clearSessions:_,stopAllLoops:A}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Mu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function ew(e){if(Array.isArray(e))return e}function tw(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function sw(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function nw(e,t){return ew(e)||tw(e,t)||aw(e,t)||sw()}function aw(e,t){if(e){if(typeof e=="string")return Mu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Mu(e,t):void 0}}const _g=Object.entries,Pu=Object.setPrototypeOf,iw=Object.isFrozen,lw=Object.getPrototypeOf,rw=Object.getOwnPropertyDescriptor;let ts=Object.freeze,Cs=Object.seal,ya=Object.create,kg=typeof Reflect<"u"&&Reflect,Oo=kg.apply,Lo=kg.construct;ts||(ts=function(t){return t});Cs||(Cs=function(t){return t});Oo||(Oo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Lo||(Lo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Qs=Tt(Array.prototype.forEach),ow=Tt(Array.prototype.lastIndexOf),Fu=Tt(Array.prototype.pop),ha=Tt(Array.prototype.push),cw=Tt(Array.prototype.splice),Zt=Array.isArray,ri=Tt(String.prototype.toLowerCase),Wr=Tt(String.prototype.toString),$u=Tt(String.prototype.match),ga=Tt(String.prototype.replace),Uu=Tt(String.prototype.indexOf),dw=Tt(String.prototype.trim),uw=Tt(Number.prototype.toString),fw=Tt(Boolean.prototype.toString),Bu=typeof BigInt>"u"?null:Tt(BigInt.prototype.toString),Hu=typeof Symbol>"u"?null:Tt(Symbol.prototype.toString),ht=Tt(Object.prototype.hasOwnProperty),ei=Tt(Object.prototype.toString),Dt=Tt(RegExp.prototype.test),Vn=pw(TypeError);function Tt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Oo(e,t,n)}}function pw(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Lo(e,s)}}function Be(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:ri;if(Pu&&Pu(e,null),!Zt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(iw(t)||(t[n]=i),a=i)}e[a]=!0}return e}function hw(e){for(let t=0;t<e.length;t++)ht(e,t)||(e[t]=null);return e}function Bt(e){const t=ya(null);for(const n of _g(e)){var s=nw(n,2);const a=s[0],i=s[1];ht(e,a)&&(Zt(i)?t[a]=hw(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Bt(i):t[a]=i)}return t}function gw(e){switch(typeof e){case"string":return e;case"number":return uw(e);case"boolean":return fw(e);case"bigint":return Bu?Bu(e):"0";case"symbol":return Hu?Hu(e):"Symbol()";case"undefined":return ei(e);case"function":case"object":{if(e===null)return ei(e);const t=e,s=Us(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:ei(n)}return ei(e)}default:return ei(e)}}function Us(e,t){for(;e!==null;){const n=rw(e,t);if(n){if(n.get)return Tt(n.get);if(typeof n.value=="function")return Tt(n.value)}e=lw(e)}function s(){return null}return s}function mw(e){try{return Dt(e,""),!0}catch{return!1}}const Vu=ts(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Zr=ts(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Jr=ts(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),vw=ts(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Yr=ts(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),bw=ts(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),ju=ts(["#text"]),zu=ts(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Qr=ts(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),qu=ts(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),ul=ts(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),yw=Cs(/{{[\w\W]*|^[\w\W]*}}/g),xw=Cs(/<%[\w\W]*|^[\w\W]*%>/g),_w=Cs(/\${[\w\W]*/g),kw=Cs(/^data-[\-\w.\u00B7-\uFFFF]+$/),ww=Cs(/^aria-[\-\w]+$/),Ku=Cs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),Sw=Cs(/^(?:\w+script|data):/i),Tw=Cs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),Cw=Cs(/^html$/i),Ew=Cs(/^[a-z][.\w]*(-[.\w]+)+$/i),Fs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Aw=function(){return typeof window>"u"?null:window},Rw=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Gu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function wg(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Aw();const t=xe=>wg(xe);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Fs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,f=r.prototype,p=Us(f,"cloneNode"),m=Us(f,"remove"),b=Us(f,"nextSibling"),w=Us(f,"childNodes"),E=Us(f,"parentNode"),v=Us(f,"shadowRoot"),g=Us(f,"attributes"),x=l&&l.prototype?Us(l.prototype,"nodeType"):null,k=l&&l.prototype?Us(l.prototype,"nodeName"):null;if(typeof i=="function"){const xe=s.createElement("template");xe.content&&xe.content.ownerDocument&&(s=xe.content.ownerDocument)}let _,A="",T,C=!1,L=0;const H=function(){if(L>0)throw Vn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(S){H(),L++;try{return _.createHTML(S)}finally{L--}},M=function(S){H(),L++;try{return _.createScriptURL(S)}finally{L--}},K=function(){return C||(T=Rw(u,a),C=!0),T},ne=s,U=ne.implementation,I=ne.createNodeIterator,R=ne.createDocumentFragment,j=ne.getElementsByTagName,z=n.importNode;let ee=Gu();t.isSupported=typeof _g=="function"&&typeof E=="function"&&U&&U.createHTMLDocument!==void 0;const ie=yw,de=xw,N=_w,se=kw,we=ww,B=Sw,pe=Tw,ce=Ew;let ye=Ku,ve=null;const Ue=Be({},[...Vu,...Zr,...Jr,...Yr,...ju]);let y=null;const O=Be({},[...zu,...Qr,...qu,...ul]);let F=Object.seal(ya(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),X=null,Y=null;const Z=Object.seal(ya(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let fe=!0,oe=!0,re=!1,ae=!0,_e=!1,he=!0,me=!1,Te=!1,Ae=!1,Ie=!1,Ne=!1,Pe=!1,He=!0,st=!1;const V="user-content-";let ke=!0,Oe=!1,De={},We=null;const ze=Be({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ft=null;const Kt=Be({},["audio","video","img","source","image","track"]);let Rs=null;const yn=Be({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ms="http://www.w3.org/1998/Math/MathML",bs="http://www.w3.org/2000/svg",q="http://www.w3.org/1999/xhtml";let Ce=q,ys=!1,Gs=null;const Fn=Be({},[Ms,bs,q],Wr);let $n=Be({},["mi","mo","mn","ms","mtext"]),xn=Be({},["annotation-xml"]);const ca=Be({},["title","style","font","a","script"]);let Gt=null;const D=["application/xhtml+xml","text/html"],G="text/html";let Q=null,Se=null;const $=s.createElement("form"),le=function(S){return S instanceof RegExp||S instanceof Function},ge=function(){let S=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Se&&Se===S)return;(!S||typeof S!="object")&&(S={}),S=Bt(S),Gt=D.indexOf(S.PARSER_MEDIA_TYPE)===-1?G:S.PARSER_MEDIA_TYPE,Q=Gt==="application/xhtml+xml"?Wr:ri,ve=ht(S,"ALLOWED_TAGS")&&Zt(S.ALLOWED_TAGS)?Be({},S.ALLOWED_TAGS,Q):Ue,y=ht(S,"ALLOWED_ATTR")&&Zt(S.ALLOWED_ATTR)?Be({},S.ALLOWED_ATTR,Q):O,Gs=ht(S,"ALLOWED_NAMESPACES")&&Zt(S.ALLOWED_NAMESPACES)?Be({},S.ALLOWED_NAMESPACES,Wr):Fn,Rs=ht(S,"ADD_URI_SAFE_ATTR")&&Zt(S.ADD_URI_SAFE_ATTR)?Be(Bt(yn),S.ADD_URI_SAFE_ATTR,Q):yn,ft=ht(S,"ADD_DATA_URI_TAGS")&&Zt(S.ADD_DATA_URI_TAGS)?Be(Bt(Kt),S.ADD_DATA_URI_TAGS,Q):Kt,We=ht(S,"FORBID_CONTENTS")&&Zt(S.FORBID_CONTENTS)?Be({},S.FORBID_CONTENTS,Q):ze,X=ht(S,"FORBID_TAGS")&&Zt(S.FORBID_TAGS)?Be({},S.FORBID_TAGS,Q):Bt({}),Y=ht(S,"FORBID_ATTR")&&Zt(S.FORBID_ATTR)?Be({},S.FORBID_ATTR,Q):Bt({}),De=ht(S,"USE_PROFILES")?S.USE_PROFILES&&typeof S.USE_PROFILES=="object"?Bt(S.USE_PROFILES):S.USE_PROFILES:!1,fe=S.ALLOW_ARIA_ATTR!==!1,oe=S.ALLOW_DATA_ATTR!==!1,re=S.ALLOW_UNKNOWN_PROTOCOLS||!1,ae=S.ALLOW_SELF_CLOSE_IN_ATTR!==!1,_e=S.SAFE_FOR_TEMPLATES||!1,he=S.SAFE_FOR_XML!==!1,me=S.WHOLE_DOCUMENT||!1,Ie=S.RETURN_DOM||!1,Ne=S.RETURN_DOM_FRAGMENT||!1,Pe=S.RETURN_TRUSTED_TYPE||!1,Ae=S.FORCE_BODY||!1,He=S.SANITIZE_DOM!==!1,st=S.SANITIZE_NAMED_PROPS||!1,ke=S.KEEP_CONTENT!==!1,Oe=S.IN_PLACE||!1,ye=mw(S.ALLOWED_URI_REGEXP)?S.ALLOWED_URI_REGEXP:Ku,Ce=typeof S.NAMESPACE=="string"?S.NAMESPACE:q,$n=ht(S,"MATHML_TEXT_INTEGRATION_POINTS")&&S.MATHML_TEXT_INTEGRATION_POINTS&&typeof S.MATHML_TEXT_INTEGRATION_POINTS=="object"?Bt(S.MATHML_TEXT_INTEGRATION_POINTS):Be({},["mi","mo","mn","ms","mtext"]),xn=ht(S,"HTML_INTEGRATION_POINTS")&&S.HTML_INTEGRATION_POINTS&&typeof S.HTML_INTEGRATION_POINTS=="object"?Bt(S.HTML_INTEGRATION_POINTS):Be({},["annotation-xml"]);const W=ht(S,"CUSTOM_ELEMENT_HANDLING")&&S.CUSTOM_ELEMENT_HANDLING&&typeof S.CUSTOM_ELEMENT_HANDLING=="object"?Bt(S.CUSTOM_ELEMENT_HANDLING):ya(null);if(F=ya(null),ht(W,"tagNameCheck")&&le(W.tagNameCheck)&&(F.tagNameCheck=W.tagNameCheck),ht(W,"attributeNameCheck")&&le(W.attributeNameCheck)&&(F.attributeNameCheck=W.attributeNameCheck),ht(W,"allowCustomizedBuiltInElements")&&typeof W.allowCustomizedBuiltInElements=="boolean"&&(F.allowCustomizedBuiltInElements=W.allowCustomizedBuiltInElements),_e&&(oe=!1),Ne&&(Ie=!0),De&&(ve=Be({},ju),y=ya(null),De.html===!0&&(Be(ve,Vu),Be(y,zu)),De.svg===!0&&(Be(ve,Zr),Be(y,Qr),Be(y,ul)),De.svgFilters===!0&&(Be(ve,Jr),Be(y,Qr),Be(y,ul)),De.mathMl===!0&&(Be(ve,Yr),Be(y,qu),Be(y,ul))),Z.tagCheck=null,Z.attributeCheck=null,ht(S,"ADD_TAGS")&&(typeof S.ADD_TAGS=="function"?Z.tagCheck=S.ADD_TAGS:Zt(S.ADD_TAGS)&&(ve===Ue&&(ve=Bt(ve)),Be(ve,S.ADD_TAGS,Q))),ht(S,"ADD_ATTR")&&(typeof S.ADD_ATTR=="function"?Z.attributeCheck=S.ADD_ATTR:Zt(S.ADD_ATTR)&&(y===O&&(y=Bt(y)),Be(y,S.ADD_ATTR,Q))),ht(S,"ADD_URI_SAFE_ATTR")&&Zt(S.ADD_URI_SAFE_ATTR)&&Be(Rs,S.ADD_URI_SAFE_ATTR,Q),ht(S,"FORBID_CONTENTS")&&Zt(S.FORBID_CONTENTS)&&(We===ze&&(We=Bt(We)),Be(We,S.FORBID_CONTENTS,Q)),ht(S,"ADD_FORBID_CONTENTS")&&Zt(S.ADD_FORBID_CONTENTS)&&(We===ze&&(We=Bt(We)),Be(We,S.ADD_FORBID_CONTENTS,Q)),ke&&(ve["#text"]=!0),me&&Be(ve,["html","head","body"]),ve.table&&(Be(ve,["tbody"]),delete X.tbody),S.TRUSTED_TYPES_POLICY){if(typeof S.TRUSTED_TYPES_POLICY.createHTML!="function")throw Vn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof S.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Vn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ue=_;_=S.TRUSTED_TYPES_POLICY;try{A=P("")}catch(Le){throw _=ue,Le}}else S.TRUSTED_TYPES_POLICY===null?(_=void 0,A=""):(_===void 0&&(_=K()),_&&typeof A=="string"&&(A=P("")));(ee.uponSanitizeElement.length>0||ee.uponSanitizeAttribute.length>0)&&ve===Ue&&(ve=Bt(ve)),ee.uponSanitizeAttribute.length>0&&y===O&&(y=Bt(y)),ts&&ts(S),Se=S},Ze=Be({},[...Zr,...Jr,...vw]),pt=Be({},[...Yr,...bw]),ss=function(S){let W=E(S);(!W||!W.tagName)&&(W={namespaceURI:Ce,tagName:"template"});const ue=ri(S.tagName),Le=ri(W.tagName);return Gs[S.namespaceURI]?S.namespaceURI===bs?W.namespaceURI===q?ue==="svg":W.namespaceURI===Ms?ue==="svg"&&(Le==="annotation-xml"||$n[Le]):!!Ze[ue]:S.namespaceURI===Ms?W.namespaceURI===q?ue==="math":W.namespaceURI===bs?ue==="math"&&xn[Le]:!!pt[ue]:S.namespaceURI===q?W.namespaceURI===bs&&!xn[Le]||W.namespaceURI===Ms&&!$n[Le]?!1:!pt[ue]&&(ca[ue]||!Ze[ue]):!!(Gt==="application/xhtml+xml"&&Gs[S.namespaceURI]):!1},ds=function(S){ha(t.removed,{element:S});try{E(S).removeChild(S)}catch{if(m(S),!E(S))throw Vn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Kc=function(S){const W=w?w(S):S.childNodes;if(W){const Le=[];Qs(W,Fe=>{ha(Le,Fe)}),Qs(Le,Fe=>{try{m(Fe)}catch{}})}const ue=g?g(S):null;if(ue)for(let Le=ue.length-1;Le>=0;--Le){const Fe=ue[Le],Ve=Fe&&Fe.name;if(typeof Ve=="string")try{S.removeAttribute(Ve)}catch{}}},Un=function(S,W){try{ha(t.removed,{attribute:W.getAttributeNode(S),from:W})}catch{ha(t.removed,{attribute:null,from:W})}if(W.removeAttribute(S),S==="is")if(Ie||Ne)try{ds(W)}catch{}else try{W.setAttribute(S,"")}catch{}},Pg=function(S){const W=g?g(S):S.attributes;if(W)for(let ue=W.length-1;ue>=0;--ue){const Le=W[ue],Fe=Le&&Le.name;if(!(typeof Fe!="string"||y[Q(Fe)]))try{S.removeAttribute(Fe)}catch{}}},Fg=function(S){const W=[S];for(;W.length>0;){const ue=W.pop();(x?x(ue):ue.nodeType)===Fs.element&&Pg(ue);const Fe=w?w(ue):ue.childNodes;if(Fe)for(let Ve=Fe.length-1;Ve>=0;--Ve)W.push(Fe[Ve])}},Gc=function(S){let W=null,ue=null;if(Ae)S="<remove></remove>"+S;else{const Ve=$u(S,/^[\r\n\t ]+/);ue=Ve&&Ve[0]}Gt==="application/xhtml+xml"&&Ce===q&&(S='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+S+"</body></html>");const Le=_?P(S):S;if(Ce===q)try{W=new d().parseFromString(Le,Gt)}catch{}if(!W||!W.documentElement){W=U.createDocument(Ce,"template",null);try{W.documentElement.innerHTML=ys?A:Le}catch{}}const Fe=W.body||W.documentElement;return S&&ue&&Fe.insertBefore(s.createTextNode(ue),Fe.childNodes[0]||null),Ce===q?j.call(W,me?"html":"body")[0]:me?W.documentElement:Fe},Wc=function(S){return I.call(S.ownerDocument||S,S,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Tr=function(S){var W,ue;S.normalize();const Le=I.call(S.ownerDocument||S,S,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Fe=Le.nextNode();for(;Fe;){let Ct=Fe.data;Qs([ie,de,N],rt=>{Ct=ga(Ct,rt," ")}),Fe.data=Ct,Fe=Le.nextNode()}const Ve=(W=(ue=S.querySelectorAll)===null||ue===void 0?void 0:ue.call(S,"template"))!==null&&W!==void 0?W:[];Qs(Array.from(Ve),Ct=>{da(Ct.content)&&Tr(Ct.content)})},Wi=function(S){const W=k?k(S):null;return typeof W!="string"||Q(W)!=="form"?!1:typeof S.nodeName!="string"||typeof S.textContent!="string"||typeof S.removeChild!="function"||S.attributes!==g(S)||typeof S.removeAttribute!="function"||typeof S.setAttribute!="function"||typeof S.namespaceURI!="string"||typeof S.insertBefore!="function"||typeof S.hasChildNodes!="function"||S.nodeType!==x(S)||S.childNodes!==w(S)},da=function(S){if(!x||typeof S!="object"||S===null)return!1;try{return x(S)===Fs.documentFragment}catch{return!1}},Ga=function(S){if(!x||typeof S!="object"||S===null)return!1;try{return typeof x(S)=="number"}catch{return!1}};function Ws(xe,S,W){Qs(xe,ue=>{ue.call(t,S,W,Se)})}const Zc=function(S){let W=null;if(Ws(ee.beforeSanitizeElements,S,null),Wi(S))return ds(S),!0;const ue=Q(k?k(S):S.nodeName);if(Ws(ee.uponSanitizeElement,S,{tagName:ue,allowedTags:ve}),he&&S.hasChildNodes()&&!Ga(S.firstElementChild)&&Dt(/<[/\w!]/g,S.innerHTML)&&Dt(/<[/\w!]/g,S.textContent)||he&&S.namespaceURI===q&&ue==="style"&&Ga(S.firstElementChild)||S.nodeType===Fs.progressingInstruction||he&&S.nodeType===Fs.comment&&Dt(/<[/\w]/g,S.data))return ds(S),!0;if(X[ue]||!(Z.tagCheck instanceof Function&&Z.tagCheck(ue))&&!ve[ue]){if(!X[ue]&&Yc(ue)&&(F.tagNameCheck instanceof RegExp&&Dt(F.tagNameCheck,ue)||F.tagNameCheck instanceof Function&&F.tagNameCheck(ue)))return!1;if(ke&&!We[ue]){const Fe=E(S),Ve=w(S);if(Ve&&Fe){const Ct=Ve.length;for(let rt=Ct-1;rt>=0;--rt){const vt=Oe?Ve[rt]:p(Ve[rt],!0);Fe.insertBefore(vt,b(S))}}}return ds(S),!0}return(x?x(S):S.nodeType)===Fs.element&&!ss(S)||(ue==="noscript"||ue==="noembed"||ue==="noframes")&&Dt(/<\/no(script|embed|frames)/i,S.innerHTML)?(ds(S),!0):(_e&&S.nodeType===Fs.text&&(W=S.textContent,Qs([ie,de,N],Fe=>{W=ga(W,Fe," ")}),S.textContent!==W&&(ha(t.removed,{element:S.cloneNode()}),S.textContent=W)),Ws(ee.afterSanitizeElements,S,null),!1)},Jc=function(S,W,ue){if(Y[W]||He&&(W==="id"||W==="name")&&(ue in s||ue in $))return!1;const Le=y[W]||Z.attributeCheck instanceof Function&&Z.attributeCheck(W,S);if(!(oe&&!Y[W]&&Dt(se,W))){if(!(fe&&Dt(we,W))){if(!Le||Y[W]){if(!(Yc(S)&&(F.tagNameCheck instanceof RegExp&&Dt(F.tagNameCheck,S)||F.tagNameCheck instanceof Function&&F.tagNameCheck(S))&&(F.attributeNameCheck instanceof RegExp&&Dt(F.attributeNameCheck,W)||F.attributeNameCheck instanceof Function&&F.attributeNameCheck(W,S))||W==="is"&&F.allowCustomizedBuiltInElements&&(F.tagNameCheck instanceof RegExp&&Dt(F.tagNameCheck,ue)||F.tagNameCheck instanceof Function&&F.tagNameCheck(ue))))return!1}else if(!Rs[W]){if(!Dt(ye,ga(ue,pe,""))){if(!((W==="src"||W==="xlink:href"||W==="href")&&S!=="script"&&Uu(ue,"data:")===0&&ft[S])){if(!(re&&!Dt(B,ga(ue,pe,"")))){if(ue)return!1}}}}}}return!0},$g=Be({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Yc=function(S){return!$g[ri(S)]&&Dt(ce,S)},Qc=function(S){Ws(ee.beforeSanitizeAttributes,S,null);const W=S.attributes;if(!W||Wi(S))return;const ue={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let Le=W.length;for(;Le--;){const Fe=W[Le],Ve=Fe.name,Ct=Fe.namespaceURI,rt=Fe.value,vt=Q(Ve),_n=rt;let Ot=Ve==="value"?_n:dw(_n);if(ue.attrName=vt,ue.attrValue=Ot,ue.keepAttr=!0,ue.forceKeepAttr=void 0,Ws(ee.uponSanitizeAttribute,S,ue),Ot=ue.attrValue,st&&(vt==="id"||vt==="name")&&Uu(Ot,V)!==0&&(Un(Ve,S),Ot=V+Ot),he&&Dt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Ot)){Un(Ve,S);continue}if(vt==="attributename"&&$u(Ot,"href")){Un(Ve,S);continue}if(ue.forceKeepAttr)continue;if(!ue.keepAttr){Un(Ve,S);continue}if(!ae&&Dt(/\/>/i,Ot)){Un(Ve,S);continue}_e&&Qs([ie,de,N],ed=>{Ot=ga(Ot,ed," ")});const Xc=Q(S.nodeName);if(!Jc(Xc,vt,Ot)){Un(Ve,S);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Ct)switch(u.getAttributeType(Xc,vt)){case"TrustedHTML":{Ot=P(Ot);break}case"TrustedScriptURL":{Ot=M(Ot);break}}if(Ot!==_n)try{Ct?S.setAttributeNS(Ct,Ve,Ot):S.setAttribute(Ve,Ot),Wi(S)?ds(S):Fu(t.removed)}catch{Un(Ve,S)}}Ws(ee.afterSanitizeAttributes,S,null)},Zi=function(S){let W=null;const ue=Wc(S);for(Ws(ee.beforeSanitizeShadowDOM,S,null);W=ue.nextNode();)if(Ws(ee.uponSanitizeShadowNode,W,null),Zc(W),Qc(W),da(W.content)&&Zi(W.content),(x?x(W):W.nodeType)===Fs.element){const Fe=v?v(W):W.shadowRoot;da(Fe)&&(Cr(Fe),Zi(Fe))}Ws(ee.afterSanitizeShadowDOM,S,null)},Cr=function(S){const W=[{node:S,shadow:null}];for(;W.length>0;){const ue=W.pop();if(ue.shadow){Zi(ue.shadow);continue}const Le=ue.node,Ve=(x?x(Le):Le.nodeType)===Fs.element,Ct=w?w(Le):Le.childNodes;if(Ct)for(let rt=Ct.length-1;rt>=0;--rt)W.push({node:Ct[rt],shadow:null});if(Ve){const rt=k?k(Le):null;if(typeof rt=="string"&&Q(rt)==="template"){const vt=Le.content;da(vt)&&W.push({node:vt,shadow:null})}}if(Ve){const rt=v?v(Le):Le.shadowRoot;da(rt)&&W.push({node:null,shadow:rt},{node:rt,shadow:null})}}};return t.sanitize=function(xe){let S=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},W=null,ue=null,Le=null,Fe=null;if(ys=!xe,ys&&(xe="<!-->"),typeof xe!="string"&&!Ga(xe)&&(xe=gw(xe),typeof xe!="string"))throw Vn("dirty is not a string, aborting");if(!t.isSupported)return xe;Te||ge(S),t.removed=[];const Ve=Oe&&typeof xe!="string"&&Ga(xe);if(Ve){const vt=k?k(xe):xe.nodeName;if(typeof vt=="string"){const _n=Q(vt);if(!ve[_n]||X[_n])throw Vn("root node is forbidden and cannot be sanitized in-place")}if(Wi(xe))throw Vn("root node is clobbered and cannot be sanitized in-place");try{Cr(xe)}catch(_n){throw Kc(xe),_n}}else if(Ga(xe))W=Gc("<!---->"),ue=W.ownerDocument.importNode(xe,!0),ue.nodeType===Fs.element&&ue.nodeName==="BODY"||ue.nodeName==="HTML"?W=ue:W.appendChild(ue),Cr(ue);else{if(!Ie&&!_e&&!me&&xe.indexOf("<")===-1)return _&&Pe?P(xe):xe;if(W=Gc(xe),!W)return Ie?null:Pe?A:""}W&&Ae&&ds(W.firstChild);const Ct=Wc(Ve?xe:W);try{for(;Le=Ct.nextNode();)Zc(Le),Qc(Le),da(Le.content)&&Zi(Le.content)}catch(vt){throw Ve&&Kc(xe),vt}if(Ve)return Qs(t.removed,vt=>{vt.element&&Fg(vt.element)}),_e&&Tr(xe),xe;if(Ie){if(_e&&Tr(W),Ne)for(Fe=R.call(W.ownerDocument);W.firstChild;)Fe.appendChild(W.firstChild);else Fe=W;return(y.shadowroot||y.shadowrootmode)&&(Fe=z.call(n,Fe,!0)),Fe}let rt=me?W.outerHTML:W.innerHTML;return me&&ve["!doctype"]&&W.ownerDocument&&W.ownerDocument.doctype&&W.ownerDocument.doctype.name&&Dt(Cw,W.ownerDocument.doctype.name)&&(rt="<!DOCTYPE "+W.ownerDocument.doctype.name+`>
`+rt),_e&&Qs([ie,de,N],vt=>{rt=ga(rt,vt," ")}),_&&Pe?P(rt):rt},t.setConfig=function(){let xe=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};ge(xe),Te=!0},t.clearConfig=function(){Se=null,Te=!1,_=T,A=""},t.isValidAttribute=function(xe,S,W){Se||ge({});const ue=Q(xe),Le=Q(S);return Jc(ue,Le,W)},t.addHook=function(xe,S){typeof S=="function"&&ha(ee[xe],S)},t.removeHook=function(xe,S){if(S!==void 0){const W=ow(ee[xe],S);return W===-1?void 0:cw(ee[xe],W,1)[0]}return Fu(ee[xe])},t.removeHooks=function(xe){ee[xe]=[]},t.removeAllHooks=function(){ee=Gu()},t}var Wu=wg();function Fc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var oa=Fc();function Sg(e){oa=e}var vi={exec:()=>null};function at(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Iw=/^(?:[ \t]*(?:\n|$))+/,Ow=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Lw=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Gi=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Nw=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,$c=/(?:[*+-]|\d{1,9}[.)])/,Tg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Cg=at(Tg).replace(/bull/g,$c).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),Dw=at(Tg).replace(/bull/g,$c).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Uc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Mw=/^[^\n]+/,Bc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,Pw=at(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Bc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),Fw=at(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,$c).getRegex(),wr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Hc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,$w=at("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Hc).replace("tag",wr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Eg=at(Uc).replace("hr",Gi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",wr).getRegex(),Uw=at(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Eg).getRegex(),Vc={blockquote:Uw,code:Ow,def:Pw,fences:Lw,heading:Nw,hr:Gi,html:$w,lheading:Cg,list:Fw,newline:Iw,paragraph:Eg,table:vi,text:Mw},Zu=at("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Gi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",wr).getRegex(),Bw={...Vc,lheading:Dw,table:Zu,paragraph:at(Uc).replace("hr",Gi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Zu).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",wr).getRegex()},Hw={...Vc,html:at(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Hc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:vi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:at(Uc).replace("hr",Gi).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Cg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Vw=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,jw=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Ag=/^( {2,}|\\)\n(?!\s*$)/,zw=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Sr=/[\p{P}\p{S}]/u,jc=/[\s\p{P}\p{S}]/u,Rg=/[^\s\p{P}\p{S}]/u,qw=at(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,jc).getRegex(),Ig=/(?!~)[\p{P}\p{S}]/u,Kw=/(?!~)[\s\p{P}\p{S}]/u,Gw=/(?:[^\s\p{P}\p{S}]|~)/u,Ww=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Og=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Zw=at(Og,"u").replace(/punct/g,Sr).getRegex(),Jw=at(Og,"u").replace(/punct/g,Ig).getRegex(),Lg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Yw=at(Lg,"gu").replace(/notPunctSpace/g,Rg).replace(/punctSpace/g,jc).replace(/punct/g,Sr).getRegex(),Qw=at(Lg,"gu").replace(/notPunctSpace/g,Gw).replace(/punctSpace/g,Kw).replace(/punct/g,Ig).getRegex(),Xw=at("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Rg).replace(/punctSpace/g,jc).replace(/punct/g,Sr).getRegex(),e1=at(/\\(punct)/,"gu").replace(/punct/g,Sr).getRegex(),t1=at(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),s1=at(Hc).replace("(?:-->|$)","-->").getRegex(),n1=at("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",s1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Gl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,a1=at(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Gl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Ng=at(/^!?\[(label)\]\[(ref)\]/).replace("label",Gl).replace("ref",Bc).getRegex(),Dg=at(/^!?\[(ref)\](?:\[\])?/).replace("ref",Bc).getRegex(),i1=at("reflink|nolink(?!\\()","g").replace("reflink",Ng).replace("nolink",Dg).getRegex(),zc={_backpedal:vi,anyPunctuation:e1,autolink:t1,blockSkip:Ww,br:Ag,code:jw,del:vi,emStrongLDelim:Zw,emStrongRDelimAst:Yw,emStrongRDelimUnd:Xw,escape:Vw,link:a1,nolink:Dg,punctuation:qw,reflink:Ng,reflinkSearch:i1,tag:n1,text:zw,url:vi},l1={...zc,link:at(/^!?\[(label)\]\((.*?)\)/).replace("label",Gl).getRegex(),reflink:at(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Gl).getRegex()},No={...zc,emStrongRDelimAst:Qw,emStrongLDelim:Jw,url:at(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},r1={...No,br:at(Ag).replace("{2,}","*").getRegex(),text:at(No.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},fl={normal:Vc,gfm:Bw,pedantic:Hw},ti={normal:zc,gfm:No,breaks:r1,pedantic:l1},o1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Ju=e=>o1[e];function Bs(e,t){if(t){if(Qt.escapeTest.test(e))return e.replace(Qt.escapeReplace,Ju)}else if(Qt.escapeTestNoEncode.test(e))return e.replace(Qt.escapeReplaceNoEncode,Ju);return e}function Yu(e){try{e=encodeURI(e).replace(Qt.percentDecode,"%")}catch{return null}return e}function Qu(e,t){var i;const s=e.replace(Qt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Qt.slashPipe,"|");return n}function si(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function c1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Xu(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function d1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Wl=class{constructor(e){lt(this,"options");lt(this,"rules");lt(this,"lexer");this.options=e||oa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:si(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=d1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=si(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:si(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=si(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,m=p.raw+`
`+s.join(`
`),b=this.blockquote(m);i[i.length-1]=b,n=n.substring(0,n.length-p.raw.length)+b.raw,a=a.substring(0,a.length-p.text.length)+b.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,m=p.raw+`
`+s.join(`
`),b=this.list(m);i[i.length-1]=b,n=n.substring(0,n.length-f.raw.length)+b.raw,a=a.substring(0,a.length-p.raw.length)+b.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,E=>" ".repeat(3*E.length)),f=e.split(`
`,1)[0],p=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):p?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const E=this.rules.other.nextBulletRegex(m),v=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),x=this.rules.other.headingBeginRegex(m),k=this.rules.other.htmlBeginRegex(m);for(;e;){const _=e.split(`
`,1)[0];let A;if(f=_,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),A=f):A=f.replace(this.rules.other.tabCharGlobal,"    "),g.test(f)||x.test(f)||k.test(f)||E.test(f)||v.test(f))break;if(A.search(this.rules.other.nonSpaceChar)>=m||!f.trim())d+=`
`+A.slice(m);else{if(p||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||x.test(u)||v.test(u))break;d+=`
`+f}!p&&!f.trim()&&(p=!0),c+=_+`
`,e=e.substring(_.length+1),u=A.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let b=null,w;this.options.gfm&&(b=this.rules.other.listIsTask.exec(d),b&&(w=b[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!b,checked:w,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Qu(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Qu(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=si(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=c1(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Xu(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Xu(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,f=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const m=f.slice(1,-1);return{type:"em",raw:f,text:m,tokens:this.lexer.inlineTokens(m)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},rn=class Do{constructor(t){lt(this,"tokens");lt(this,"options");lt(this,"state");lt(this,"tokenizer");lt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||oa,this.options.tokenizer=this.options.tokenizer||new Wl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Qt,block:fl.normal,inline:ti.normal};this.options.pedantic?(s.block=fl.pedantic,s.inline=ti.pedantic):this.options.gfm&&(s.block=fl.gfm,this.options.breaks?s.inline=ti.breaks:s.inline=ti.gfm),this.tokenizer.rules=s}static get rules(){return{block:fl,inline:ti}}static lex(t,s){return new Do(s).lex(t)}static lexInline(t,s){return new Do(s).inlineTokens(t)}lex(t){t=t.replace(Qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Qt.tabCharGlobal,"    ").replace(Qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(f=>{u=f.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(d=f.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const f=s.at(-1);d.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let m;this.options.extensions.startInline.forEach(b=>{m=b.call({lexer:this},p),typeof m=="number"&&m>=0&&(f=Math.min(f,m))}),f<1/0&&f>=0&&(u=t.substring(0,f+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Zl=class{constructor(e){lt(this,"options");lt(this,"parser");this.options=e||oa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Qt.notSpaceStart))==null?void 0:i[0],a=e.replace(Qt.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Bs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Yu(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Bs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Yu(e);if(a===null)return Bs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Bs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Bs(e.text)}},qc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},on=class Mo{constructor(t){lt(this,"options");lt(this,"renderer");lt(this,"textRenderer");this.options=t||oa,this.options.renderer=this.options.renderer||new Zl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new qc}static parse(t,s){return new Mo(s).parse(t)}static parseInline(t,s){return new Mo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Xr,yl=(Xr=class{constructor(e){lt(this,"options");lt(this,"block");this.options=e||oa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?rn.lex:rn.lexInline}provideParser(){return this.block?on.parse:on.parseInline}},lt(Xr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Xr),u1=class{constructor(...e){lt(this,"defaults",Fc());lt(this,"options",this.setOptions);lt(this,"parse",this.parseMarkdown(!0));lt(this,"parseInline",this.parseMarkdown(!1));lt(this,"Parser",on);lt(this,"Renderer",Zl);lt(this,"TextRenderer",qc);lt(this,"Lexer",rn);lt(this,"Tokenizer",Wl);lt(this,"Hooks",yl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Zl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Wl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new yl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];yl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return rn.lex(e,t??this.defaults)}parser(e,t){return on.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?rn.lex:rn.lexInline,o=i.hooks?i.hooks.provideParser():e?on.parse:on.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Bs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},sa=new u1;function tt(e,t){return sa.parse(e,t)}tt.options=tt.setOptions=function(e){return sa.setOptions(e),tt.defaults=sa.defaults,Sg(tt.defaults),tt};tt.getDefaults=Fc;tt.defaults=oa;tt.use=function(...e){return sa.use(...e),tt.defaults=sa.defaults,Sg(tt.defaults),tt};tt.walkTokens=function(e,t){return sa.walkTokens(e,t)};tt.parseInline=sa.parseInline;tt.Parser=on;tt.parser=on.parse;tt.Renderer=Zl;tt.TextRenderer=qc;tt.Lexer=rn;tt.lexer=rn.lex;tt.Tokenizer=Wl;tt.Hooks=yl;tt.parse=tt;tt.options;tt.setOptions;tt.use;tt.walkTokens;tt.parseInline;on.parse;rn.lex;const f1={breaks:!0,gfm:!0};function ef(e){if(!e)return"";try{if(typeof tt<"u"&&tt.parse){const t=tt.parse(e,f1);return typeof Wu<"u"?Wu.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function p1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const h1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function g1(e){return h1[e]||"wrench"}const m1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function tf(e){if(!e)return[];const t=e.match(m1);return t?[...new Set(t)]:[]}const v1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=te(()=>t.value.trim().length>0&&!s.value),u=h(Ge.state||"disconnected");let f=null,p=null;const m=te(()=>{const U=u.value;return U==="connected"?"Connected":U==="reconnecting"?"Reconnecting…":U==="connecting"?"Connecting…":"REST fallback"}),b=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],w=te(()=>{const U=Math.floor(i.value/4)%b.length,I=i.value;return I>3?`${b[U]} (${I}s)`:b[0]});function E(){Rt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function v(){if(!a.value)return;const U=a.value;U.style.height="auto",U.style.height=Math.min(U.scrollHeight,120)+"px"}function g(U,I,R={}){const j={id:++o,role:U,content:I,timestamp:Date.now(),html:U==="bot"?ef(I):"",tools_used:R.tools_used||[],is_error:R.is_error||!1,images:U==="bot"?tf(I):[],files:R.files||[],_showTools:!1};return e.value.push(j),E(),U==="bot"&&Rt(()=>x()),j}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(I=>{I.setAttribute("data-copy","true"),I.style.position="relative";const R=document.createElement("button");R.className="chat-code-copy",R.textContent="Copy",R.addEventListener("click",()=>{const j=I.querySelector("code"),z=j?j.textContent:I.textContent;navigator.clipboard.writeText(z).then(()=>{R.textContent="Copied!",setTimeout(()=>{R.textContent="Copy"},1500)}).catch(()=>{})}),I.appendChild(R)})}function k(U){if(U===0)return!0;const I=e.value[U-1],R=e.value[U],j=new Date(I.timestamp).toDateString(),z=new Date(R.timestamp).toDateString();return j!==z}function _(U){const I=new Date(U),R=new Date;if(I.toDateString()===R.toDateString())return"Today";const j=new Date(R);return j.setDate(j.getDate()-1),I.toDateString()===j.toDateString()?"Yesterday":I.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A(U){t.value=U,Rt(()=>K())}function T(U){window.open(U,"_blank","noopener")}function C(U){U.target.style.display="none"}function L(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function H(){r&&(clearInterval(r),r=null),i.value=0}function P(U){s.value&&(s.value=!1,H(),U.type==="chat_response"?g("bot",U.content,{tools_used:U.tools_used||[],is_error:U.is_error||!1,files:U.files||[]}):U.type==="chat_error"&&g("bot",U.error||"Unknown error",{is_error:!0}),Rt(()=>{var I;return(I=a.value)==null?void 0:I.focus()}))}async function M(U){try{const I=await J.post("/api/chat",{content:U,channel_id:l.value});g("bot",I.response,{tools_used:I.tools_used||[],is_error:I.is_error||!1,files:I.files||[]})}catch(I){g("bot",I.message||"Failed to send message",{is_error:!0})}}async function K(){const U=t.value.trim();if(!U||s.value)return;g("user",U),t.value="",s.value=!0,L(),a.value&&(a.value.style.height="auto"),Ge.connected&&Ge.sendChat(U,{channelId:l.value})||(await M(U),s.value=!1,H()),Rt(()=>{var R;return(R=a.value)==null?void 0:R.focus()})}async function ne(){try{if(!l.value){const I=await J.get("/api/auth/session");l.value=I.channel_id||I.user_id||"web-user"}const U=await J.get("/api/sessions/"+encodeURIComponent(l.value));if(U&&U.messages&&U.messages.length>0){for(const I of U.messages){const R=I.role==="user"?"user":"bot";let j=I.content||"";if(R==="user"){const ee=j.match(/^\[.*?\]:\s*/);ee&&(j=j.slice(ee[0].length))}if(!j.trim())continue;const z={id:++o,role:R,content:j,timestamp:I.timestamp?I.timestamp*1e3:Date.now(),html:R==="bot"?ef(j):"",tools_used:[],is_error:!1,images:R==="bot"?tf(j):[],files:[],_showTools:!1};e.value.push(z)}Rt(()=>{E(),x()})}}catch{}}return Ye(()=>{Ge.subscribe("chat",P),u.value=Ge.state||"disconnected",f=Ge.onStateChange,p=(U,I)=>{u.value=U,f&&f(U,I)},Ge.onStateChange=p,ne(),Rt(()=>{var U;return(U=a.value)==null?void 0:U.focus()})}),xt(()=>{Ge.unsubscribe("chat",P),Ge.onStateChange===p&&(Ge.onStateChange=f),H()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:m,typingText:w,suggestions:c,send:K,autoResize:v,formatTime:p1,formatDate:_,showDateSeparator:k,useSuggestion:A,openImage:T,onImageError:C,getToolIcon:g1}}},b1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),f=h(!1),p=h(!1),m=te(()=>e.value==="custom"),b=te(()=>[...i.value,...l.value]),w=te(()=>l.value.includes(e.value)),E=te(()=>{var T;return m.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),v=te(()=>{var T;return m.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),g=te(()=>{var T;return m.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function x(){d.value=!0;try{const T=await J.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function k(){r.value=!0,c.value=null,o.value=!1;try{await J.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function _(){const T=u.value.trim();if(T){p.value=!0,c.value=null;try{await J.post("/api/personality/presets",{name:T,display_name:E.value,identity:v.value,voice:g.value}),f.value=!1,u.value="",await x(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{p.value=!1}}}async function A(){if(await gs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await J.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(C){c.value=C.message}}}return Ye(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:b,isCustom:m,isUserPreset:w,previewName:E,previewIdentity:v,previewVoice:g,saving:r,saved:o,error:c,loading:d,save:k,showSavePreset:f,newPresetName:u,savingPreset:p,saveAsPreset:_,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
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
  `},_t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Mg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Xk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:v1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:nk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:dk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:yk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:b1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Kk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:_t("/operations","live")},{path:"/agents",redirect:_t("/operations","agents")},{path:"/loops",redirect:_t("/operations","loops")},{path:"/processes",redirect:_t("/operations","processes")},{path:"/schedules",redirect:_t("/operations","schedules")},{path:"/audit",redirect:_t("/history","audit")},{path:"/sessions",redirect:_t("/history","sessions")},{path:"/traces",redirect:_t("/history","traces")},{path:"/usage",redirect:_t("/history","usage")},{path:"/tools",redirect:_t("/capabilities","tools")},{path:"/skills",redirect:_t("/capabilities","skills")},{path:"/knowledge",redirect:_t("/capabilities","knowledge")},{path:"/memory",redirect:_t("/capabilities","memory")},{path:"/learned",redirect:_t("/capabilities","learned")},{path:"/health",redirect:_t("/system","health")},{path:"/resources",redirect:_t("/system","resources")},{path:"/logs",redirect:_t("/system","logs")},{path:"/config",redirect:_t("/system","config")},{path:"/host-access",redirect:_t("/system","host-access")},{path:"/internals",redirect:_t("/system","internals")}],bi=j_({history:__(),routes:Mg});bi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const y1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{J.setPersist(a.value),await J.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},x1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),f=h(null);let p=null;const m=h("starting"),b=h(""),w=Mg.filter(I=>I.meta),E=te(()=>["Workspace","Operate","Observe","Manage"].map(I=>({name:I,routes:w.filter(R=>R.meta.section===I)})).filter(I=>I.routes.length)),v=te(()=>{var I;return((I=bi.currentRoute.value.meta)==null?void 0:I.label)||"Odin"}),g=te(()=>{var I;return((I=bi.currentRoute.value.meta)==null?void 0:I.section)||"Management"}),x=te(()=>{var I;return((I=bi.currentRoute.value.meta)==null?void 0:I.description)||"Management console"});J.onSessionExpired=()=>{t.value=!0,Ge.disconnect(),J.setToken(""),e.value="login"};function k(I){var R;if((I.ctrlKey||I.metaKey)&&I.key.toLowerCase()==="k"){e.value==="ready"&&(I.preventDefault(),Nu());return}if(n.value&&I.key==="Tab"){const j=[...((R=a.value)==null?void 0:R.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(j.length){const z=j[0],ee=j[j.length-1];if(I.shiftKey&&(document.activeElement===z||!a.value.contains(document.activeElement))){I.preventDefault(),ee.focus();return}if(!I.shiftKey&&(document.activeElement===ee||!a.value.contains(document.activeElement))){I.preventDefault(),z.focus();return}}}if(I.key==="Escape"&&n.value){n.value=!1,I.preventDefault();return}if(I.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(I.target.tagName)){I.preventDefault();const j=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');j&&j.focus()}}function _(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ye(async()=>{document.addEventListener("keydown",k),r=window.matchMedia("(max-width: 900px)"),_(),r.addEventListener("change",_);const I=await J.check();I.ok?(e.value="ready",ne()):I.needsAuth?e.value="login":(e.value="ready",ne())});function A(){t.value=!1,e.value="ready",ne()}async function T(){await J.logout(),Ge.disconnect(),e.value="login"}function C(){s.value=!s.value}function L(){n.value=!n.value}Xt(n,async I=>{var R,j;if(I)o=document.activeElement,await Rt(),(j=(R=a.value)==null?void 0:R.querySelector(".nav-item"))==null||j.focus();else if(o!=null&&o.isConnected){const z=o;o=null,requestAnimationFrame(()=>z.focus())}});const H=te(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(I,R="info",j=3e3){f.value={text:I,level:R},clearTimeout(p),p=setTimeout(()=>{f.value=null},j)}let M=null,K=!1;function ne(){Ge.onStatusChange=I=>{c.value=I},Ge.onLatency=I=>{u.value=I},Ge.onStateChange=(I,R)=>{d.value=I,I==="connected"?(K&&P("Connection restored","success"),K=!0):I==="reconnecting"&&R.attempt===1&&P("Connection lost — reconnecting…","warn")},Ge.connect(),U(),M&&clearInterval(M),M=setInterval(U,15e3)}async function U(){try{const I=await J.get("/api/status");m.value=I.status==="online"?"online":"starting";const R=I.uptime_seconds||0,j=Math.floor(R/3600),z=Math.floor(R%3600/60);b.value=`${j}h ${z}m uptime`}catch{m.value="offline",b.value=""}}return xt(()=>{M&&clearInterval(M),Ge.disconnect(),document.removeEventListener("keydown",k),r==null||r.removeEventListener("change",_)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:H,wsToast:f,botStatus:m,botUptime:b,navRoutes:w,navGroups:E,currentPage:v,currentSection:g,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:A,logout:T,toggleSidebar:C,toggleMobileNavigation:L,openPalette:Nu}}},Pn=Fl(x1);Pn.component("odin-icon",Jk);Pn.component("login-screen",y1);Pn.component("toast-container",Mx);Pn.component("confirm-host",Px);Pn.component("command-palette",Zk);Pn.directive("modal-focus",Qk);Pn.use(bi);Pn.mount("#app");
