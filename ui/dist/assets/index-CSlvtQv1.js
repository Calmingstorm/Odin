var kg=Object.defineProperty;var Sg=(e,t,s)=>t in e?kg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ot=(e,t,s)=>Sg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Cg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new Tl("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new $d(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Tl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new $d((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new Tl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Tl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Tl extends Error{constructor(t){super(t),this.name="AuthError"}}class $d extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Tg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const G=new Cg,Ge=new Tg(G);/**
* @vue/shared v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Rs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},ja=[],Ht=()=>{},za=()=>!1,Ta=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Lr=e=>e.startsWith("onUpdate:"),je=Object.assign,Tc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Eg=Object.prototype.hasOwnProperty,st=(e,t)=>Eg.call(e,t),xe=Array.isArray,Jn=e=>pi(e)==="[object Map]",on=e=>pi(e)==="[object Set]",Ud=e=>pi(e)==="[object Date]",Ag=e=>pi(e)==="[object RegExp]",Fe=e=>typeof e=="function",$e=e=>typeof e=="string",Yt=e=>typeof e=="symbol",et=e=>e!==null&&typeof e=="object",Ec=e=>(et(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),Bp=Object.prototype.toString,pi=e=>Bp.call(e),Rg=e=>pi(e).slice(8,-1),Nr=e=>pi(e)==="[object Object]",Mr=e=>$e(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Rn=Rs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Ig=Rs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Pr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Og=/-\w/g,rt=Pr(e=>e.replace(Og,t=>t.slice(1).toUpperCase())),Lg=/\B([A-Z])/g,vs=Pr(e=>e.replace(Lg,"-$1").toLowerCase()),Ea=Pr(e=>e.charAt(0).toUpperCase()+e.slice(1)),qa=Pr(e=>e?`on${Ea(e)}`:""),Pt=(e,t)=>!Object.is(e,t),Ga=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Hp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Dr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Xl=e=>{const t=$e(e)?Number(e):NaN;return isNaN(t)?e:t};let Bd;const Fr=()=>Bd||(Bd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Ng(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Mg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Pg=Rs(Mg);function cl(e){if(xe(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=$e(n)?zp(n):cl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if($e(e)||et(e))return e}const Dg=/;(?![^(]*\))/g,Fg=/:([^]+)/,$g=/\/\*[^]*?\*\//g;function zp(e){const t={};return e.replace($g,"").split(Dg).forEach(s=>{if(s){const n=s.split(Fg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function dl(e){let t="";if($e(e))t=e;else if(xe(e))for(let s=0;s<e.length;s++){const n=dl(e[s]);n&&(t+=n+" ")}else if(et(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Ug(e){if(!e)return null;let{class:t,style:s}=e;return t&&!$e(t)&&(e.class=dl(t)),s&&(e.style=cl(s)),e}const Bg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Hg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",zg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Vg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",jg=Rs(Bg),qg=Rs(Hg),Gg=Rs(zg),Kg=Rs(Vg),Wg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Zg=Rs(Wg);function Vp(e){return!!e||e===""}function Jg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=js(e[n],t[n]);return s}function Hd(e,t){if(e.size!==t.size)return!1;const s=Array.from(t),n=new Uint8Array(s.length);for(const a of e){let i=-1;for(let l=0;l<s.length;l++)if(!n[l]&&js(a,s[l])){i=l;break}if(i<0)return!1;n[i]=1}return!0}function js(e,t){if(e===t)return!0;let s=Ud(e),n=Ud(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Yt(e),n=Yt(t),s||n)return e===t;if(s=xe(e),n=xe(t),s||n)return s&&n?Jg(e,t):!1;if(s=et(e),n=et(t),s||n){if(!s||!n)return!1;if(s=Jn(e),n=Jn(t),s||n||(s=on(e),n=on(t),s||n))return s&&n?Hd(e,t):!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!js(e[l],t[l]))return!1}}return String(e)===String(t)}function $r(e,t){return e.findIndex(s=>js(s,t))}const jp=e=>!!(e&&e.__v_isRef===!0),qp=e=>$e(e)?e:e==null?"":xe(e)||et(e)&&(e.toString===Bp||!Fe(e.toString))?jp(e)?qp(e.value):JSON.stringify(e,Gp,2):String(e),Gp=(e,t)=>jp(t)?Gp(e,t.value):Jn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[fo(n,i)+" =>"]=a,s),{})}:on(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>fo(s))}:Yt(t)?fo(t):et(t)&&!xe(t)&&!Nr(t)?String(t):t,fo=(e,t="")=>{var s;return Yt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Yg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Ot;class Ac{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Ot&&(Ot.active?(this.parent=Ot,this.index=(Ot.scopes||(Ot.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes){const n=this.scopes.slice();for(t=0,s=n.length;t<s;t++)n[t].pause()}for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes){const a=this.scopes.slice();for(t=0,s=a.length;t<s;t++)a[t].resume()}const n=this.effects.slice();for(t=0,s=n.length;t<s;t++)n[t].resume()}}run(t){if(this._active){const s=Ot;try{return Ot=this,t()}finally{Ot=s}}}on(){++this._on===1&&(this.prevScope=Ot,Ot=this)}off(){if(this._on>0&&--this._on===0){if(Ot===this)Ot=this.prevScope;else{let t=Ot;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){const a=this.scopes.slice();for(s=0,n=a.length;s<n;s++)a[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Qg(e){return new Ac(e)}function Kp(){return Ot}function Xg(e,t=!1){Ot&&Ot.cleanups.push(e)}let pt;const ho=new WeakSet;class qi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Ot&&(Ot.active?Ot.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,ho.has(this)&&(ho.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Zp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,zd(this),Jp(this);const t=pt,s=Ws;pt=this,Ws=!0;try{return this.fn()}finally{Yp(this),pt=t,Ws=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Oc(t);this.deps=this.depsTail=void 0,zd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?ho.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){jo(this)&&this.run()}get dirty(){return jo(this)}}let Wp=0,Pi,Di;function Zp(e,t=!1){if(e.flags|=8,t){e.next=Di,Di=e;return}e.next=Pi,Pi=e}function Rc(){Wp++}function Ic(){if(--Wp>0)return;if(Di){let t=Di;for(Di=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Pi;){let t=Pi;for(Pi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Jp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Yp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Oc(n),ev(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function jo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Qp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Qp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Gi)||(e.globalVersion=Gi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!jo(e))))return;e.flags|=2;const t=e.dep,s=pt,n=Ws;pt=e,Ws=!0;try{Jp(e);const a=e.fn(e._value);(t.version===0||Pt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{pt=s,Ws=n,Yp(e),e.flags&=-3}}function Oc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Oc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function ev(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function tv(e,t){e.effect instanceof qi&&(e=e.effect.fn);const s=new qi(e);t&&je(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function sv(e){e.effect.stop()}let Ws=!0;const Xp=[];function Mn(){Xp.push(Ws),Ws=!1}function Pn(){const e=Xp.pop();Ws=e===void 0?!0:e}function zd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=pt;pt=void 0;try{t()}finally{pt=s}}}let Gi=0;class nv{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Ur{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!pt||!Ws||pt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==pt)s=this.activeLink=new nv(pt,this),pt.deps?(s.prevDep=pt.depsTail,pt.depsTail.nextDep=s,pt.depsTail=s):pt.deps=pt.depsTail=s,ef(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=pt.depsTail,s.nextDep=void 0,pt.depsTail.nextDep=s,pt.depsTail=s,pt.deps===s&&(pt.deps=n)}return s}trigger(t){this.version++,Gi++,this.notify(t)}notify(t){Rc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Ic()}}}function ef(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)ef(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const er=new WeakMap,ba=Symbol(""),qo=Symbol(""),Ki=Symbol("");function Kt(e,t,s){if(Ws&&pt){let n=er.get(e);n||er.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Ur),a.map=n,a.key=s),a.track()}}function Sn(e,t,s,n,a,i){const l=er.get(e);if(!l){Gi++;return}const r=o=>{o&&o.trigger()};if(Rc(),t==="clear")l.forEach(r);else{const o=xe(e),c=o&&Mr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Ki||!Yt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Ki)),t){case"add":o?c&&r(l.get("length")):(r(l.get(ba)),Jn(e)&&r(l.get(qo)));break;case"delete":o||(r(l.get(ba)),Jn(e)&&r(l.get(qo)));break;case"set":Jn(e)&&r(l.get(ba));break}}Ic()}function av(e,t){const s=er.get(e);return s&&s.get(t)}function Ma(e){const t=Je(e);return t===e?t:(Kt(t,"iterate",Ki),bs(e)?t:t.map(Js))}function Br(e){return Kt(e=Je(e),"iterate",Ki),e}function ln(e,t){return cn(e)?ei(In(e)?Js(t):t):Js(t)}const iv={__proto__:null,[Symbol.iterator](){return mo(this,Symbol.iterator,e=>ln(this,e))},concat(...e){return Ma(this).concat(...e.map(t=>xe(t)?Ma(t):t))},entries(){return mo(this,"entries",e=>(e[1]=ln(this,e[1]),e))},every(e,t){return vn(this,"every",e,t,void 0,arguments)},filter(e,t){return vn(this,"filter",e,t,s=>s.map(n=>ln(this,n)),arguments)},find(e,t){return vn(this,"find",e,t,s=>ln(this,s),arguments)},findIndex(e,t){return vn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return vn(this,"findLast",e,t,s=>ln(this,s),arguments)},findLastIndex(e,t){return vn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return vn(this,"forEach",e,t,void 0,arguments)},includes(...e){return go(this,"includes",e)},indexOf(...e){return go(this,"indexOf",e)},join(e){return Ma(this).join(e)},lastIndexOf(...e){return go(this,"lastIndexOf",e)},map(e,t){return vn(this,"map",e,t,void 0,arguments)},pop(){return yi(this,"pop")},push(...e){return yi(this,"push",e)},reduce(e,...t){return Vd(this,"reduce",e,t)},reduceRight(e,...t){return Vd(this,"reduceRight",e,t)},shift(){return yi(this,"shift")},some(e,t){return vn(this,"some",e,t,void 0,arguments)},splice(...e){return yi(this,"splice",e)},toReversed(){return Ma(this).toReversed()},toSorted(e){return Ma(this).toSorted(e)},toSpliced(...e){return Ma(this).toSpliced(...e)},unshift(...e){return yi(this,"unshift",e)},values(){return mo(this,"values",e=>ln(this,e))}};function mo(e,t,s){const n=Br(e),a=n[t]();return n!==e&&!bs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const lv=Array.prototype;function vn(e,t,s,n,a,i){const l=Br(e),r=l!==e&&!bs(e),o=l[t];if(o!==lv[t]){const u=o.apply(e,i);return r?Js(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,ln(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function Vd(e,t,s,n){const a=Br(e),i=a!==e&&!bs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=ln(e,c)),s.call(this,c,ln(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?ln(e,o):o}function go(e,t,s){const n=Je(e);Kt(n,"iterate",Ki);const a=n[t](...s);return(a===-1||a===!1)&&ul(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function yi(e,t,s=[]){Mn(),Rc();const n=Je(e)[t].apply(e,s);return Ic(),Pn(),n}const rv=Rs("__proto__,__v_isRef,__isVue"),tf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Yt));function ov(e){Yt(e)||(e=String(e));const t=Je(this);return Kt(t,"has",e),t.hasOwnProperty(e)}class sf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?cf:of:i?rf:lf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=xe(t);if(!a){let o;if(l&&(o=iv[s]))return o;if(s==="hasOwnProperty")return ov}const r=Reflect.get(t,s,At(t)?t:n);if((Yt(s)?tf.has(s):rv(s))||(a||Kt(t,"get",s),i))return r;if(At(r)){const o=l&&Mr(s)?r:r.value;return a&&et(o)?tr(o):o}return et(r)?a?tr(r):sa(r):r}}class nf extends sf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=xe(t)&&Mr(s);if(!this._isShallow){const c=cn(i);if(!bs(n)&&!cn(n)&&(i=Je(i),n=Je(n)),!l&&At(i)&&!At(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:st(t,s),o=Reflect.set(t,s,n,At(t)?t:a);return t===Je(a)&&o&&(r?Pt(n,i)&&Sn(t,"set",s,n):Sn(t,"add",s,n)),o}deleteProperty(t,s){const n=st(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Sn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Yt(s)||!tf.has(s))&&Kt(t,"has",s),n}ownKeys(t){return Kt(t,"iterate",xe(t)?"length":ba),Reflect.ownKeys(t)}}class af extends sf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const cv=new nf,dv=new af,uv=new nf(!0),pv=new af(!0),Go=e=>e,El=e=>Reflect.getPrototypeOf(e);function fv(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=Jn(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?Go:t?ei:Js;return!t&&Kt(i,"iterate",o?qo:ba),je(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Al(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function hv(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Pt(a,r)&&Kt(l,"get",a),Kt(l,"get",r));const{has:o}=El(l),c=t?Go:e?ei:Js;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Kt(Je(a),"iterate",ba),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Pt(a,r)&&Kt(l,"has",a),Kt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?Go:e?ei:Js;return!e&&Kt(o,"iterate",ba),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return je(s,e?{add:Al("add"),set:Al("set"),delete:Al("delete"),clear:Al("clear")}:{add(a){const i=Je(this),l=El(i),r=Je(a),o=!t&&!bs(a)&&!cn(a)?r:a;return l.has.call(i,o)||Pt(a,o)&&l.has.call(i,a)||Pt(r,o)&&l.has.call(i,r)||(i.add(o),Sn(i,"add",o,o)),this},set(a,i){!t&&!bs(i)&&!cn(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=El(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Pt(i,d)&&Sn(l,"set",a,i):Sn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=El(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Sn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&Sn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=fv(a,e,t)}),s}function Hr(e,t){const s=hv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(st(s,a)&&a in n?s:n,a,i)}const mv={get:Hr(!1,!1)},gv={get:Hr(!1,!0)},vv={get:Hr(!0,!1)},bv={get:Hr(!0,!0)},lf=new WeakMap,rf=new WeakMap,of=new WeakMap,cf=new WeakMap;function yv(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function sa(e){return cn(e)?e:zr(e,!1,cv,mv,lf)}function Lc(e){return zr(e,!1,uv,gv,rf)}function tr(e){return zr(e,!0,dv,vv,of)}function xv(e){return zr(e,!0,pv,bv,cf)}function zr(e,t,s,n,a){if(!et(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=yv(Rg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function In(e){return cn(e)?In(e.__v_raw):!!(e&&e.__v_isReactive)}function cn(e){return!!(e&&e.__v_isReadonly)}function bs(e){return!!(e&&e.__v_isShallow)}function ul(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function df(e){return!st(e,"__v_skip")&&Object.isExtensible(e)&&Hp(e,"__v_skip",!0),e}const Js=e=>et(e)?sa(e):e,ei=e=>et(e)?tr(e):e;function At(e){return e?e.__v_isRef===!0:!1}function h(e){return uf(e,!1)}function Nc(e){return uf(e,!0)}function uf(e,t){return At(e)?e:new _v(e,t)}class _v{constructor(t,s){this.dep=new Ur,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:Js(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||bs(t)||cn(t);t=n?t:Je(t),Pt(t,s)&&(this._rawValue=t,this._value=n?t:Js(t),this.dep.trigger())}}function wv(e){e.dep&&e.dep.trigger()}function rn(e){return At(e)?e.value:e}function kv(e){return Fe(e)?e():rn(e)}const Sv={get:(e,t,s)=>t==="__v_raw"?e:rn(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return At(a)&&!At(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Mc(e){return In(e)?e:new Proxy(e,Sv)}class Cv{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Ur,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function pf(e){return new Cv(e)}function Tv(e){const t=xe(e)?new Array(e.length):{};for(const s in e)t[s]=ff(e,s);return t}class Ev{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Yt(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!xe(t)||Yt(this._key)||!Mr(this._key))do a=!ul(i)||bs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=rn(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&At(this._raw[this._key])){const s=this._object[this._key];if(At(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return av(this._raw,this._key)}}class Av{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Rv(e,t,s){return At(e)?e:Fe(e)?new Av(e):et(e)&&arguments.length>1?ff(e,t,s):h(e)}function ff(e,t,s){return new Ev(e,t,s)}class Iv{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Ur(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Gi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&pt!==this)return Zp(this,!0),!0}get value(){const t=this.dep.track();return Qp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Ov(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new Iv(n,a,s)}const Lv={GET:"get",HAS:"has",ITERATE:"iterate"},Nv={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Rl={},sr=new WeakMap;let Gn;function Mv(){return Gn}function hf(e,t=!1,s=Gn){if(s){let n=sr.get(s);n||sr.set(s,n=[]),n.push(e)}}function Pv(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:bs(x)||a===!1||a===0?Cn(x,1):Cn(x);let d,u,p,f,b=!1,g=!1;if(At(e)?(u=()=>e.value,b=bs(e)):In(e)?(u=()=>c(e),b=!0):xe(e)?(g=!0,b=e.some(x=>In(x)||bs(x)),u=()=>e.map(x=>{if(At(x))return x.value;if(In(x))return c(x);if(Fe(x))return o?o(x,2):x()})):Fe(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){Mn();try{p()}finally{Pn()}}const x=Gn;Gn=d;try{return o?o(e,3,[f]):e(f)}finally{Gn=x}}:u=Ht,t&&a){const x=u,w=a===!0?1/0:a;u=()=>Cn(x(),w)}const A=Kp(),L=()=>{d.stop(),A&&A.active&&Tc(A.effects,d)};if(i&&t){const x=t;t=(...w)=>{const v=x(...w);return L(),v}}let y=g?new Array(e.length).fill(Rl):Rl;const m=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const w=d.run();if(x||a||b||(g?w.some((v,_)=>Pt(v,y[_])):Pt(w,y))){p&&p();const v=Gn;Gn=d;try{const _=[w,y===Rl?void 0:g&&y[0]===Rl?[]:y,f];y=w,o?o(t,3,_):t(..._)}finally{Gn=v}}}else d.run()};return r&&r(m),d=new qi(u),d.scheduler=l?()=>l(m,!1):m,f=x=>hf(x,!1,d),p=d.onStop=()=>{const x=sr.get(d);if(x){if(o)o(x,4);else for(const w of x)w();sr.delete(d)}},t?n?m(!0):y=d.run():l?l(m.bind(null,!0),!0):d.run(),L.pause=d.pause.bind(d),L.resume=d.resume.bind(d),L.stop=L,L}function Cn(e,t=1/0,s){if(t<=0||!et(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,At(e))Cn(e.value,t,s);else if(xe(e))for(let n=0;n<e.length;n++)Cn(e[n],t,s);else if(on(e)||Jn(e))e.forEach(n=>{Cn(n,t,s)});else if(Nr(e)){for(const n in e)Cn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Cn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const mf=[];function Dv(e){mf.push(e)}function Fv(){mf.pop()}function $v(e,t){}const Uv={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Bv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function fi(e,t,s,n){try{return n?e(...n):e()}catch(a){Aa(a,t,s)}}function As(e,t,s,n){if(Fe(e)){const a=fi(e,t,s,n);return a&&Ec(a)&&a.catch(i=>{Aa(i,t,s)}),a}if(xe(e)){const a=[];for(let i=0;i<e.length;i++)a.push(As(e[i],t,s,n));return a}}function Aa(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){Mn(),fi(i,null,10,[e,o,c]),Pn();return}}Hv(e,s,a,n,l)}function Hv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ss=[];let nn=-1;const Ka=[];let Kn=null,$a=0;const gf=Promise.resolve();let nr=null;function Tt(e){const t=nr||gf;return e?t.then(this?e.bind(this):e):t}function zv(e){let t=nn+1,s=ss.length;for(;t<s;){const n=t+s>>>1,a=ss[n],i=Zi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Pc(e){if(!(e.flags&1)){const t=Zi(e),s=ss[ss.length-1];!s||!(e.flags&2)&&t>=Zi(s)?ss.push(e):ss.splice(zv(t),0,e),e.flags|=1,vf()}}function vf(){nr||(nr=gf.then(bf))}function Wi(e){if(!xe(e))Kn&&e.id===-1?Kn.splice($a+1,0,e):e.flags&1||(Ka.push(e),e.flags|=1);else for(let t=0;t<e.length;t++)Ka.push(e[t]);vf()}function jd(e,t,s=nn+1){for(;s<ss.length;s++){const n=ss[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ss.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function ar(e){if(Ka.length){const t=[...new Set(Ka)].sort((s,n)=>Zi(s)-Zi(n));if(Ka.length=0,Kn){for(let s=0;s<t.length;s++)Kn.push(t[s]);return}for(Kn=t,$a=0;$a<Kn.length;$a++){const s=Kn[$a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Kn=null,$a=0}}const Zi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function bf(e){try{for(nn=0;nn<ss.length;nn++){const t=ss[nn];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),fi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;nn<ss.length;nn++){const t=ss[nn];t&&(t.flags&=-2)}nn=-1,ss.length=0,ar(),nr=null,(ss.length||Ka.length)&&bf()}}let Ua,Il=[];function yf(e,t){var s,n;Ua=e,Ua?(Ua.enabled=!0,Il.forEach(({event:a,args:i})=>Ua.emit(a,...i)),Il=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{yf(i,t)}),setTimeout(()=>{Ua||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Il=[])},3e3)):Il=[]}let Bt=null,Vr=null;function Ji(e){const t=Bt;return Bt=e,Vr=e&&e.type.__scopeId||null,t}function Vv(e){Vr=e}function jv(){Vr=null}const qv=e=>Dc;function Dc(e,t=Bt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&el(-1);const i=Ji(t),l=Ln.length;let r;try{r=e(...a)}finally{for(let o=Ln.length;o>l;o--)Yr();Ji(i),n._d&&el(1)}return r};return n._n=!0,n._c=!0,n._d=!0,n}function Gv(e,t){if(Bt===null)return e;const s=ml(Bt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ke]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&Cn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function an(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Mn(),As(o,s,8,[e.el,r,e,t]),Pn())}}function Fi(e,t){if(Ut){let s=Ut.provides;const n=Ut.parent&&Ut.parent.provides;n===s&&(s=Ut.provides=Object.create(n)),s[e]=t}}function Vs(e,t,s=!1){const n=ls();if(n||ya){let a=ya?ya._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function Kv(){return!!(ls()||ya)}const xf=Symbol.for("v-scx"),_f=()=>Vs(xf);function Wv(e,t){return pl(e,null,t)}function Zv(e,t){return pl(e,null,{flush:"post"})}function wf(e,t){return pl(e,null,{flush:"sync"})}function is(e,t,s){return pl(e,t,s)}function pl(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,r=je({},s),o=t&&n||!t&&i!=="post";let c;if(ka){if(i==="sync"){const f=_f();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!o){const f=()=>{};return f.stop=Ht,f.resume=Ht,f.pause=Ht,f}}const d=Ut;r.call=(f,b,g)=>As(f,d,b,g);let u=!1;i==="post"?r.scheduler=f=>{Ct(f,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(f,b)=>{b?f():Pc(f)}),r.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=Pv(e,t,r);return ka&&(c?c.push(p):o&&p()),p}function Jv(e,t,s){const n=this.proxy,a=$e(e)?e.includes(".")?kf(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=hi(this),r=pl(a,i.bind(n),s);return l(),r}function kf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const jn=new WeakMap,Sf=Symbol("_vte"),jr=e=>e.__isTeleport,ma=e=>e&&(e.disabled||e.disabled===""),Yv=e=>e&&(e.defer||e.defer===""),qd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Gd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Ko=(e,t)=>{const s=e&&e.to;return $e(s)?t?t(s):null:s},Qv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:b,createText:g,createComment:A,parentNode:L}}=c,y=ma(t.props);let{dynamicChildren:m}=t;const x=(_,S,T)=>{_.shapeFlag&16&&d(_.children,S,T,a,i,l,r,o)},w=(_=t)=>{const S=ma(_.props),T=_.target=Ko(_.props,b),M=Wo(T,_,g,f);T&&(l!=="svg"&&qd(T)?l="svg":l!=="mathml"&&Gd(T)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(T),S||(x(_,T,M),Ii(_,!1)))},v=_=>{const S=()=>{if(jn.get(_)===S){if(jn.delete(_),ma(_.props)){const T=L(_.el)||s;x(_,T,_.anchor),Ii(_,!0)}w(_)}};jn.set(_,S),Ct(S,i)};if(e==null){const _=t.el=g(""),S=t.anchor=g("");if(f(_,s,n),f(S,s,n),Yv(t.props)||i&&i.pendingBranch){v(t);return}y&&(x(t,s,S),Ii(t,!0)),w()}else{t.el=e.el;const _=t.anchor=e.anchor,S=jn.get(e);if(S){S.flags|=8,jn.delete(e),v(t);return}t.targetStart=e.targetStart;const T=t.target=e.target,M=t.targetAnchor=e.targetAnchor,B=ma(e.props),U=B?s:T,O=B?_:M;if(l==="svg"||qd(T)?l="svg":(l==="mathml"||Gd(T))&&(l="mathml"),m?(p(e.dynamicChildren,m,U,a,i,l,r),Wc(e,t,!0)):o||u(e,t,U,O,a,i,l,r,!1),y)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Ol(t,s,_,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const H=Ko(t.props,b);H&&(t.target=H,Ol(t,H,null,c,0))}else B&&Ol(t,T,M,c,1);Ii(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=ma(p),b=i||!f,g=jn.get(e);if(g&&(g.flags|=8,jn.delete(e)),u&&(a(c),a(d)),i&&a(o),!g&&(f||u)&&l&16)for(let A=0;A<r.length;A++){const L=r[A];n(L,t,s,b,!!L.dynamicChildren)}},move:Ol,hydrate:Xv};function Ol(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!jn.has(e)&&(!u||ma(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function Xv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(A,L){let y=L;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,A._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function f(A,L){L.anchor=u(l(A),L,r(A),s,n,a,i)}const b=t.target=Ko(t.props,o),g=ma(t.props);if(b){const A=b._lpa||b.firstChild;t.shapeFlag&16&&(g?(f(e,t),p(b,A),t.targetAnchor||Wo(b,t,d,c,r(e)===b?e:null)):(t.anchor=l(e),p(b,A),t.targetAnchor||Wo(b,t,d,c),u(A&&l(A),t,b,s,n,a,i))),Ii(t,g)}else g&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const eb=Qv;function Ii(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Wo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Sf]=l,e&&(n(i,e,a),n(l,e,a)),l}const Us=Symbol("_leaveCb"),xi=Symbol("_enterCb");function Fc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ze(()=>{e.isMounted=!0}),Wr(()=>{e.isUnmounting=!0}),e}const $s=[Function,Array],$c={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:$s,onEnter:$s,onAfterEnter:$s,onEnterCancelled:$s,onBeforeLeave:$s,onLeave:$s,onAfterLeave:$s,onLeaveCancelled:$s,onBeforeAppear:$s,onAppear:$s,onAfterAppear:$s,onAppearCancelled:$s},Cf=e=>{const t=e.subTree;return t.component?Cf(t.component):t},tb={name:"BaseTransition",props:$c,setup(e,{slots:t}){const s=ls(),n=Fc();return()=>{const a=t.default&&qr(t.default(),!0),i=a&&a.length?Tf(a):s.subTree?rh():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return vo(i);const o=ir(i);if(!o)return vo(i);let c=ti(o,l,n,s,u=>c=u);o.type!==St&&Dn(o,c);let d=s.subTree&&ir(s.subTree);if(d&&d.type!==St&&!Ks(d,o)&&Cf(s).type!==St){let u=ti(d,l,n,s);if(Dn(d,u),r==="out-in"&&o.type!==St)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},vo(i);r==="in-out"&&o.type!==St?u.delayLeave=(p,f,b)=>{const g=Af(n,d);g[String(d.key)]=d,p[Us]=()=>{f(),p[Us]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{b(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Tf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==St){t=s;break}}return t}const Ef=tb;function Af(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ti(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:b,onLeaveCancelled:g,onBeforeAppear:A,onAppear:L,onAfterAppear:y,onAppearCancelled:m}=t,x=String(e.key),w=Af(s,e),v=(T,M)=>{T&&As(T,n,9,M)},_=(T,M)=>{const B=M[1];v(T,M),xe(T)?T.every(U=>U.length<=1)&&B():T.length<=1&&B()},S={mode:l,persisted:r,beforeEnter(T){let M=o;if(!s.isMounted)if(i)M=A||o;else return;T[Us]&&T[Us](!0);const B=w[x];B&&Ks(e,B)&&B.el[Us]&&B.el[Us](),v(M,[T])},enter(T){if(w[x]===e)return;let M=c,B=d,U=u;if(!s.isMounted)if(i)M=L||c,B=y||d,U=m||u;else return;let O=!1;T[xi]=J=>{O||(O=!0,J?v(U,[T]):v(B,[T]),S.delayedLeave&&S.delayedLeave(),T[xi]=void 0)};const H=T[xi].bind(null,!1);M?_(M,[T,H]):H()},leave(T,M){const B=String(e.key);if(T[xi]&&T[xi](!0),s.isUnmounting)return M();v(p,[T]);let U=!1;T[Us]=H=>{U||(U=!0,M(),H?v(g,[T]):v(b,[T]),T[Us]=void 0,w[B]===e&&delete w[B])};const O=T[Us].bind(null,!1);w[B]=e,f?_(f,[T,O]):O()},clone(T){const M=ti(T,t,s,n,a);return a&&a(M),M}};return S}function vo(e){if(hl(e))return e=dn(e),e.children=null,e}function ir(e){if(!hl(e))return jr(e.type)&&e.children?Tf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function Dn(e,t){if(e.shapeFlag&6&&e.component){e.transition=t;const s=e.component.subTree;Dn(jr(s.type)&&ir(s)||s,t)}else e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function qr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===$t?(l.patchFlag&128&&a++,n=n.concat(qr(l.children,t,r))):(t||l.type!==St)&&n.push(r!=null?dn(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function fl(e,t){return Fe(e)?je({name:e.name},t,{setup:e}):e}function sb(){const e=ls();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Uc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function nb(e){const t=ls(),s=Nc(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Kd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const lr=new WeakMap;function Wa(e,t,s,n,a=!1){if(xe(e)){e.forEach((g,A)=>Wa(g,t&&(xe(t)?t[A]:t),s,n,a));return}if(On(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Wa(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ml(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ke?r.refs={}:r.refs,u=r.setupState,p=Je(u),f=u===Ke?za:g=>Kd(d,g)?!1:st(p,g),b=(g,A)=>!(A&&Kd(d,A));if(c!=null&&c!==o){if(Wd(t),$e(c))d[c]=null,f(c)&&(u[c]=null);else if(At(c)){const g=t;b(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if(Fe(o))fi(o,r,12,[l,d]);else{const g=$e(o),A=At(o);if(g||A){const L=()=>{if(e.f){const y=g?f(o)?u[o]:d[o]:b()||!e.k?o.value:d[e.k];if(a)xe(y)&&Tc(y,i);else if(xe(y))y.includes(i)||y.push(i);else if(g)d[o]=[i],f(o)&&(u[o]=d[o]);else{const m=[i];b(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else g?(d[o]=l,f(o)&&(u[o]=l)):A&&(b(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{L(),lr.delete(e)};y.id=-1,lr.set(e,y),Ct(y,s)}else Wd(e),L()}}}function Wd(e){const t=lr.get(e);t&&(t.flags|=8,lr.delete(e))}let Zd=!1;const Pa=()=>{Zd||(console.error("Hydration completed but contains mismatches."),Zd=!0)},ab=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",ib=e=>e.namespaceURI.includes("MathML"),Ll=e=>{if(e.nodeType===1){if(ab(e))return"svg";if(ib(e))return"mathml"}},Va=e=>e.nodeType===8;function lb(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,x)=>{if(!x.hasChildNodes()){s(null,m,x),ar(),x._vnode=m;return}u(x.firstChild,m,null,null,null),ar(),x._vnode=m},u=(m,x,w,v,_,S=!1)=>{S=S||!!x.dynamicChildren;const T=Va(m)&&m.data==="[",M=()=>g(m,x,w,v,_,T),{type:B,ref:U,shapeFlag:O,patchFlag:H}=x;let J=m.nodeType;x.el=m,H===-2&&(S=!1,x.dynamicChildren=null);let D=null;switch(B){case Yn:J!==3?x.children===""?(o(x.el=a(""),l(m),m),D=m):D=M():(m.data!==x.children&&(Pa(),m.data=x.children),D=i(m));break;case St:y(m)?(D=i(m),L(x.el=m.content.firstChild,m,w)):J!==8||T?D=M():D=i(m);break;case Qn:if(T&&(m=i(m),J=m.nodeType),J===1||J===3){D=m;const I=!x.children.length;for(let N=0;N<x.staticCount;N++)I&&(x.children+=D.nodeType===1?D.outerHTML:D.data),N===x.staticCount-1&&(x.anchor=D),D=i(D);return T?i(D):D}else M();break;case $t:T?D=b(m,x,w,v,_,S):D=M();break;default:if(O&1)(J!==1||x.type.toLowerCase()!==m.tagName.toLowerCase())&&!y(m)?D=M():D=p(m,x,w,v,_,S);else if(O&6){x.slotScopeIds=_;const I=l(m);if(T?D=A(m):Va(m)&&m.data==="teleport start"?D=A(m,m.data,"teleport end"):D=i(m),t(x,I,null,w,v,Ll(I),S),On(x)&&!x.component.subTree){let N;T?(N=mt(Qn),N.anchor=D?D.previousSibling:I.lastChild):N=m.nodeType===3?Jc(""):mt("div"),N.el=m,x.component.subTree=N}}else O&64?J!==8?D=M():D=x.type.hydrate(m,x,w,v,_,S,e,f):O&128&&(D=x.type.hydrate(m,x,w,v,Ll(l(m)),_,S,e,u))}return U!=null&&Wa(U,null,v,x),D},p=(m,x,w,v,_,S)=>{S=S||!!x.dynamicChildren;const{type:T,dynamicProps:M,props:B,patchFlag:U,shapeFlag:O,dirs:H,transition:J}=x,D=T==="input"||T==="option",I=!!M;if(D||I||U!==-1){H&&an(x,null,w,"created");let N=!1;if(y(m)){N=Xf(null,J)&&w&&w.vnode.props&&w.vnode.props.appear;const he=m.content.firstChild;if(N){const Oe=he.getAttribute("class");Oe&&(he.$cls=Oe),J.beforeEnter(he)}L(he,m,w),x.el=m=he}if(O&16&&!(B&&(B.innerHTML||B.textContent))){let he=f(m.firstChild,x,m,w,v,_,S);for(he&&!ql(m,1)&&Pa();he;){const Oe=he;he=he.nextSibling,r(Oe)}}else if(O&8){let he=x.children;he[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(he=he.slice(1));const{textContent:Oe}=m;Oe!==he&&Oe!==he.replace(/\r\n|\r/g,`
`)&&(ql(m,0)||Pa(),m.textContent=x.children)}if(B){if(D||I||!S||U&48){const he=m.tagName.includes("-"),Oe=m.namespaceURI.includes("svg")?"svg":m.namespaceURI.includes("MathML")?"mathml":void 0;for(const ae in B)if(D&&(ae.endsWith("value")||ae==="indeterminate")||Ta(ae)&&!Rn(ae)||ae[0]==="."||he&&!Rn(ae)||M&&M.includes(ae)){if(ob(m,ae,B[ae]))continue;n(m,ae,null,B[ae],Oe,w)}}else if(B.onClick)n(m,"onClick",null,B.onClick,void 0,w);else if(U&4&&In(B.style))for(const he in B.style)B.style[he]}let Y;(Y=B&&B.onVnodeBeforeMount)&&fs(Y,w,x),H&&an(x,null,w,"beforeMount"),((Y=B&&B.onVnodeMounted)||H||N)&&nh(()=>{Y&&fs(Y,w,x),N&&J.enter(m),H&&an(x,null,w,"mounted")},v)}return m.nextSibling},f=(m,x,w,v,_,S,T)=>{T=T||!!x.dynamicChildren;const M=x.children,B=M.length;let U=!1;for(let O=0;O<B;O++){const H=T?M[O]:M[O]=gs(M[O]),J=H.type===Yn;m?(J&&!T&&O+1<B&&gs(M[O+1]).type===Yn&&(o(a(m.data.slice(H.children.length)),w,i(m)),m.data=H.children),m=u(m,H,v,_,S,T)):J&&!H.children?o(H.el=a(""),w):(U||(U=!0,ql(w,1)||Pa()),s(null,H,w,null,v,_,Ll(w),S))}return m},b=(m,x,w,v,_,S)=>{const{slotScopeIds:T}=x;T&&(_=_?_.concat(T):T);const M=l(m),B=f(i(m),x,M,w,v,_,S);return B&&Va(B)&&B.data==="]"?i(x.anchor=B):(Pa(),o(x.anchor=c("]"),M,B),B)},g=(m,x,w,v,_,S)=>{if(db(m,x)||Pa(),x.el=null,S){const B=A(m);for(;;){const U=i(m);if(U&&U!==B)r(U);else break}}const T=i(m),M=l(m);return r(m),s(null,x,M,T,w,v,Ll(M),_),w&&(w.vnode.el=x.el,Jr(w,x.el)),T},A=(m,x="[",w="]")=>{let v=0;for(;m;)if(m=i(m),m&&Va(m)&&(m.data===x&&v++,m.data===w)){if(v===0)return i(m);v--}return m},L=(m,x,w)=>{const v=x.parentNode;v&&v.replaceChild(m,x);let _=w;for(;_;)_.vnode.el===x&&(_.vnode.el=_.subTree.el=m),_=_.parent},y=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const rb=new Set(["src","srcset","href","poster"]);function ob(e,t,s){return rb.has(t)?e.getAttribute(t)===(s==null?null:`${s}`):!1}const rr="data-allow-mismatch",cb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function ql(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(rr);)e=e.parentElement;return Bc(e&&e.getAttribute(rr),t)}function Bc(e,t){if(e==null)return!1;if(e==="")return!0;{const s=e.split(",");return t===0&&s.includes("children")?!0:s.includes(cb[t])}}function db(e,t){return ql(e.parentElement,1)||ub(e)||pb(t)}function ub(e){return e.nodeType===1&&Bc(e.getAttribute(rr),1)}function pb({props:e}){const t=e&&e[rr];return typeof t=="string"&&Bc(t,1)}const fb=Fr().requestIdleCallback||(e=>setTimeout(e,1)),hb=Fr().cancelIdleCallback||(e=>clearTimeout(e)),mb=(e=1e4)=>t=>{const s=fb(t,{timeout:e});return()=>hb(s)};function gb(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const vb=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(gb(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},bb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},yb=(e=[])=>(t,s)=>{$e(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function xb(e,t){if(Va(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Va(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const On=e=>!!e.type.__asyncLoader;function _b(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let b;return c||(b=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((A,L)=>{o(g,()=>A(p()),()=>L(g),u+1)});throw g}).then(g=>b!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return fl({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(b,g,A){const L=b.isConnected;let y=!1;(g.bu||(g.bu=[])).push(()=>y=!0);const m=()=>{y||!b.parentNode||L&&!b.isConnected||A()},x=i?()=>{const w=i(m,v=>xb(b,v));w&&(g.bum||(g.bum=[])).push(w)}:m;d?x():f().then(()=>!g.isUnmounted&&x())},get __asyncResolved(){return d},setup(){const b=Ut;if(Uc(b),d)return()=>Nl(d,b);const g=w=>{c=null,Aa(w,b,13,!n)};if(r&&b.suspense||ka)return f().then(w=>()=>Nl(w,b)).catch(w=>(g(w),()=>n?mt(n,{error:w}):null));const A=h(!1),L=h(),y=h(!!a);let m,x;return _t(()=>{m!=null&&clearTimeout(m),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{b.isUnmounted||(y.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!b.isUnmounted&&!A.value&&!L.value){const w=new Error(`Async component timed out after ${l}ms.`);g(w),L.value=w}},l)),f().then(()=>{b.isUnmounted||(A.value=!0,b.parent&&hl(b.parent.vnode)&&b.parent.update())}).catch(w=>{if(b.isUnmounted){c=null;return}g(w),L.value=w}),()=>{if(A.value&&d)return Nl(d,b);if(L.value&&n)return mt(n,{error:L.value});if(s&&!y.value)return Nl(s,b)}}})}function Nl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=mt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const hl=e=>e.type.__isKeepAlive,wb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=ls(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,m,x,w,v)=>{const _=y.component;c(y,m,x,0,r),o(_.vnode,y,m,x,_,r,w,y.slotScopeIds,v),Ct(()=>{_.isDeactivated=!1,_.a&&Ga(_.a);const S=y.props&&y.props.onVnodeMounted;S&&fs(S,_.parent,y)},r)},n.deactivate=y=>{const m=y.component;cr(m.m),cr(m.a),c(y,p,null,1,r),Ct(()=>{m.da&&Ga(m.da);const x=y.props&&y.props.onVnodeUnmounted;x&&fs(x,m.parent,y),m.isDeactivated=!0},r)};function f(y){bo(y),d(y,s,r,!0)}function b(y){a.forEach((m,x)=>{const w=nc(On(m)?m.type.__asyncResolved||{}:m.type);w&&!y(w)&&g(x)})}function g(y){const m=a.get(y);m&&(!l||!Ks(m,l))?f(m):l&&bo(l),a.delete(y),i.delete(y)}is(()=>[e.include,e.exclude],([y,m])=>{y&&b(x=>Oi(y,x)),m&&b(x=>!Oi(m,x))},{flush:"post",deep:!0});let A=null;const L=()=>{A!=null&&(dr(s.subTree.type)?Ct(()=>{const y=Ml(s.subTree);y.component&&a.set(A,y)},s.subTree.suspense):a.set(A,Ml(s.subTree)))};return Ze(L),Kr(L),Wr(()=>{a.forEach(y=>{const{subTree:m,suspense:x}=s,w=Ml(m);if(y.type===w.type&&y.key===w.key){bo(w);const v=w.component.da;v&&Ct(v,x);return}f(y)})}),()=>{if(A=null,!t.default)return l=null;const y=t.default(),m=y[0];if(y.length>1)return l=null,y;if(!Fn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let x=Ml(m);if(x.type===St)return l=null,x;const w=x.type,v=nc(On(x)?x.type.__asyncResolved||{}:w),{include:_,exclude:S,max:T}=e;if(_&&(!v||!Oi(_,v))||S&&v&&Oi(S,v))return x.shapeFlag&=-257,l=x,m;const M=x.key==null?w:x.key,B=a.get(M);return x.el&&(x=dn(x),m.shapeFlag&128&&(m.ssContent=x)),A=M,B?(x.el=B.el,x.component=B.component,x.transition&&Dn(x,x.transition),x.shapeFlag|=512,i.delete(M),i.add(M)):(i.add(M),T&&i.size>parseInt(T,10)&&g(i.values().next().value)),x.shapeFlag|=256,l=x,dr(m.type)?m:x}}},kb=wb;function Oi(e,t){return xe(e)?e.some(s=>Oi(s,t)):$e(e)?e.split(",").includes(t):Ag(e)?(e.lastIndex=0,e.test(t)):!1}function Is(e,t){Rf(e,"a",t)}function Os(e,t){Rf(e,"da",t)}function Rf(e,t,s=Ut){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Gr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)hl(a.parent.vnode)&&Sb(n,t,s,a),a=a.parent}}function Sb(e,t,s,n){const a=Gr(t,e,n,!0);_t(()=>{Tc(n[t],a)},s)}function bo(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Ml(e){return e.shapeFlag&128?e.ssContent:e}function Gr(e,t,s=Ut,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Mn();const r=hi(s),o=As(t,s,e,l);return r(),Pn(),o});return n?a.unshift(i):a.push(i),i}}const $n=e=>(t,s=Ut)=>{(!ka||e==="sp")&&Gr(e,(...n)=>t(...n),s)},If=$n("bm"),Ze=$n("m"),Hc=$n("bu"),Kr=$n("u"),Wr=$n("bum"),_t=$n("um"),Of=$n("sp"),Lf=$n("rtg"),Nf=$n("rtc");function Mf(e,t=Ut){Gr("ec",e,t)}const zc="components",Cb="directives";function Tb(e,t){return Vc(zc,e,!0,t)||e}const Pf=Symbol.for("v-ndc");function Eb(e){return $e(e)?Vc(zc,e,!1)||e:e||Pf}function Ab(e){return Vc(Cb,e)}function Vc(e,t,s=!0,n=!1){const a=Bt||Ut;if(a){const i=a.type;if(e===zc){const r=nc(i,!1);if(r&&(r===t||r===rt(t)||r===Ea(rt(t))))return i}const l=Jd(a[e]||i[e],t)||Jd(a.appContext[e],t);return!l&&n?i:l}}function Jd(e,t){return e&&(e[t]||e[rt(t)]||e[Ea(rt(t))])}function Rb(e,t,s,n){let a;const i=s&&s[n],l=xe(e);if(l||$e(e)){const r=l&&In(e);let o=!1,c=!1;r&&(o=!bs(e),c=cn(e),e=Br(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?ei(Js(e[d])):Js(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(et(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Ib(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(xe(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Ob(e,t,s,n,a,i){if(s==null&&(s={}),Bt.ce||Bt.parent&&On(Bt.parent)&&Bt.parent.ce){const c=i!=null&&s.key==null?je({},s,{key:i}):s,d=Object.keys(c).length>0;return t!=="default"&&(c.name=t),Xi(),ur($t,null,[mt("slot",c,n&&n())],d?-2:64)}let l=e[t];l&&l._c&&(l._d=!1);const r=Ln.length;Xi();let o;try{const c=l&&jc(l(s)),d=s.key||i||c&&c.key;o=ur($t,{key:(d&&!Yt(d)?d:`_${t}`)+(!c&&n?"_fb":"")},c||(n?n():[]),c&&e._===1?64:-2)}catch(c){for(let d=Ln.length;d>r;d--)Yr();throw c}finally{l&&l._c&&(l._d=!0)}return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),o}function jc(e){return e.some(t=>Fn(t)?!(t.type===St||t.type===$t&&!jc(t.children)):!0)?e:null}function Lb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:qa(n)]=e[n];return s}const Zo=e=>e?dh(e)?ml(e):Zo(e.parent):null,$i=je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Zo(e.parent),$root:e=>Zo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>qc(e),$forceUpdate:e=>e.f||(e.f=()=>{Pc(e.update)}),$nextTick:e=>e.n||(e.n=Tt.bind(e.proxy)),$watch:e=>Jv.bind(e)}),yo=(e,t)=>e!==Ke&&!e.__isScriptSetup&&st(e,t),Jo={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(yo(n,t))return l[t]=1,n[t];if(a!==Ke&&st(a,t))return l[t]=2,a[t];if(st(i,t))return l[t]=3,i[t];if(s!==Ke&&st(s,t))return l[t]=4,s[t];Yo&&(l[t]=0)}}const c=$i[t];let d,u;if(c)return t==="$attrs"&&Kt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&st(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,st(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return yo(a,t)?(a[t]=s,!0):n!==Ke&&st(n,t)?(n[t]=s,!0):st(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ke&&r[0]!=="$"&&st(e,r)||yo(t,r)||st(i,r)||st(n,r)||st($i,r)||st(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:st(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Nb=je({},Jo,{get(e,t){if(t!==Symbol.unscopables)return Jo.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Pg(t)}});function Mb(){return null}function Pb(){return null}function Db(e){}function Fb(e){}function $b(){return null}function Ub(){}function Bb(e,t){return null}function Hb(){return Df().slots}function zb(){return Df().attrs}function Df(e){const t=ls();return t.setupContext||(t.setupContext=hh(t))}function Yi(e){return xe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Vb(e,t){const s=Yi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?xe(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function jb(e,t){return!e||!t?e||t:xe(e)&&xe(t)?e.concat(t):je({},Yi(e),Yi(t))}function qb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Gb(e){const t=ls(),s=ka;let n=e();tl(),s&&Xn(!1);const a=()=>{hi(t),s&&Xn(!0)},i=()=>{ls()!==t&&t.scope.off(),tl(),s&&Xn(!1)};return Ec(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Yo=!0;function Kb(e){const t=qc(e),s=e.proxy,n=e.ctx;Yo=!1,t.beforeCreate&&Yd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:b,activated:g,deactivated:A,beforeDestroy:L,beforeUnmount:y,destroyed:m,unmounted:x,render:w,renderTracked:v,renderTriggered:_,errorCaptured:S,serverPrefetch:T,expose:M,inheritAttrs:B,components:U,directives:O,filters:H}=t;if(c&&Wb(c,n,null),l)for(const I in l){const N=l[I];Fe(N)&&(n[I]=N.bind(s))}if(a){const I=a.call(s,s);et(I)&&(e.data=sa(I))}if(Yo=!0,i)for(const I in i){const N=i[I],Y=Fe(N)?N.bind(s,s):Fe(N.get)?N.get.bind(s,s):Ht,he=!Fe(N)&&Fe(N.set)?N.set.bind(s):Ht,Oe=W({get:Y,set:he});Object.defineProperty(n,I,{enumerable:!0,configurable:!0,get:()=>Oe.value,set:ae=>Oe.value=ae})}if(r)for(const I in r)Ff(r[I],n,s,I);if(o){const I=Fe(o)?o.call(s):o;Reflect.ownKeys(I).forEach(N=>{Fi(N,I[N])})}d&&Yd(d,e,"c");function D(I,N){xe(N)?N.forEach(Y=>I(Y.bind(s))):N&&I(N.bind(s))}if(D(If,u),D(Ze,p),D(Hc,f),D(Kr,b),D(Is,g),D(Os,A),D(Mf,S),D(Nf,v),D(Lf,_),D(Wr,y),D(_t,x),D(Of,T),xe(M))if(M.length){const I=e.exposed||(e.exposed={});M.forEach(N=>{Object.defineProperty(I,N,{get:()=>s[N],set:Y=>s[N]=Y,enumerable:!0})})}else e.exposed||(e.exposed={});w&&e.render===Ht&&(e.render=w),B!=null&&(e.inheritAttrs=B),U&&(e.components=U),O&&(e.directives=O),T&&Uc(e)}function Wb(e,t,s=Ht){xe(e)&&(e=Qo(e));for(const n in e){const a=e[n];let i;et(a)?"default"in a?i=Vs(a.from||n,a.default,!0):i=Vs(a.from||n):i=Vs(a),At(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Yd(e,t,s){As(xe(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Ff(e,t,s,n){let a=n.includes(".")?kf(s,n):()=>s[n];if($e(e)){const i=t[e];Fe(i)&&is(a,i)}else if(Fe(e))is(a,e.bind(s));else if(et(e))if(xe(e))e.forEach(i=>Ff(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&is(a,i,e)}}function qc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>or(o,c,l,!0)),or(o,t,l)),et(t)&&i.set(t,o),o}function or(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&or(e,i,s,!0),a&&a.forEach(l=>or(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=Zb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const Zb={data:Qd,props:Xd,emits:Xd,methods:Li,computed:Li,beforeCreate:es,created:es,beforeMount:es,mounted:es,beforeUpdate:es,updated:es,beforeDestroy:es,beforeUnmount:es,destroyed:es,unmounted:es,activated:es,deactivated:es,errorCaptured:es,serverPrefetch:es,components:Li,directives:Li,watch:Yb,provide:Qd,inject:Jb};function Qd(e,t){return t?e?function(){return je(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function Jb(e,t){return Li(Qo(e),Qo(t))}function Qo(e){if(xe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function es(e,t){return e?[...new Set([].concat(e,t))]:t}function Li(e,t){return e?je(Object.create(null),e,t):t}function Xd(e,t){return e?xe(e)&&xe(t)?[...new Set([...e,...t])]:je(Object.create(null),Yi(e),Yi(t??{})):t}function Yb(e,t){if(!e)return t;if(!t)return e;const s=je(Object.create(null),e);for(const n in t)s[n]=es(e[n],t[n]);return s}function $f(){return{app:null,config:{isNativeTag:za,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Qb=0;function Xb(e,t){return function(n,a=null){Fe(n)||(n=je({},n)),a!=null&&!et(a)&&(a=null);const i=$f(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Qb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:gh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const f=c._ceVNode||mt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),o=!0,c._container=d,d.__vue_app__=c,ml(f.component)}},onUnmount(d){r.push(d)},unmount(){o&&(As(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ya;ya=c;try{return d()}finally{ya=u}}};return c}}let ya=null;function ey(e,t,s=Ke){const n=ls(),a=rt(t),i=vs(t),l=Uf(e,a),r=pf((o,c)=>{let d,u=Ke,p;return wf(()=>{const f=e[a];Pt(d,f)&&(d=f,c())}),{get(){return o(),s.get?s.get(d):d},set(f){const b=s.set?s.set(f):f;if(!Pt(b,d)&&!(u!==Ke&&Pt(f,u)))return;const g=n.vnode.props,A=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));A||(d=f,c()),n.emit(`update:${t}`,b),Pt(f,u)&&(Pt(f,b)&&!Pt(b,p)||A&&u!==Ke&&!Pt(b,d))&&c(),u=f,p=b}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ke:r,done:!1}:{done:!0}}}},r}const Uf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${rt(t)}Modifiers`]||e[`${vs(t)}Modifiers`];function ty(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&Uf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>$e(d)?d.trim():d)),l.number&&(a=a.map(Dr)));let r,o=n[r=qa(t)]||n[r=qa(rt(t))];!o&&i&&(o=n[r=qa(vs(t))]),o&&As(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,As(c,e,6,a)}}const sy=new WeakMap;function Bf(e,t,s=!1){const n=s?sy:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Fe(e)){const o=c=>{const d=Bf(c,t,!0);d&&(r=!0,je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(et(e)&&n.set(e,null),null):(xe(i)?i.forEach(o=>l[o]=null):je(l,i),et(e)&&n.set(e,l),l)}function Zr(e,t){return!e||!Ta(t)?!1:(t=t.slice(2),t=t==="Once"?t:t.replace(/Once$/,""),st(e,t[0].toLowerCase()+t.slice(1))||st(e,vs(t))||st(e,t))}function Gl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:b,inheritAttrs:g}=e,A=Ji(e);let L,y;try{if(s.shapeFlag&4){const x=a||n,w=x;L=gs(c.call(w,x,d,u,f,p,b)),y=r}else{const x=t;L=gs(x.length>1?x(u,{attrs:r,slots:l,emit:o}):x(u,null)),y=t.props?r:ay(r)}}catch(x){Ln.length=0,Aa(x,e,1),L=mt(St)}let m=L;if(y&&g!==!1){const x=Object.keys(y),{shapeFlag:w}=m;x.length&&w&7&&(i&&x.some(Lr)&&(y=iy(y,i)),m=dn(m,y,!1,!0))}if(s.dirs&&(m=dn(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition){const x=jr(m.type)&&ir(m)||m;Dn(x,s.transition)}return L=m,Ji(A),L}function ny(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Fn(a)){if(a.type!==St||a.children==="v-if"){if(s)return;s=a}}else return}return s}const ay=e=>{let t;for(const s in e)(s==="class"||s==="style"||Ta(s))&&((t||(t={}))[s]=e[s]);return t},iy=(e,t)=>{const s={};for(const n in e)(!Lr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function ly(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?eu(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Hf(l,n,p)&&!Zr(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?eu(n,l,c):!0:!!l;return!1}function eu(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Hf(t,e,i)&&!Zr(s,i))return!0}return!1}function Hf(e,t,s){const n=e[s],a=t[s];return s==="style"&&et(n)&&et(a)?!js(n,a):n!==a}function Jr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const zf={},Vf=()=>Object.create(zf),jf=e=>Object.getPrototypeOf(e)===zf;function ry(e,t,s,n=!1){const a={},i=Vf();e.propsDefaults=Object.create(null),qf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Lc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function oy(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Zr(e.emitsOptions,p))continue;const f=t[p];if(o)if(st(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const b=rt(p);a[b]=Xo(o,r,b,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{qf(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!st(t,u)&&((d=vs(u))===u||!st(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Xo(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!st(t,u))&&(delete i[u],c=!0)}c&&Sn(e.attrs,"set","")}function qf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(Rn(o))continue;const c=t[o];let d;a&&st(a,d=rt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Zr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Xo(a,o,u,c[u],e,!st(c,u))}}return l}function Xo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=st(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=hi(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===vs(s))&&(n=!0))}return n}const cy=new WeakMap;function Gf(e,t,s=!1){const n=s?cy:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Fe(e)){const d=u=>{o=!0;const[p,f]=Gf(u,t,!0);je(l,p),f&&r.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return et(e)&&n.set(e,ja),ja;if(xe(i))for(let d=0;d<i.length;d++){const u=rt(i[d]);tu(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=rt(d);if(tu(u)){const p=i[d],f=l[u]=xe(p)||Fe(p)?{type:p}:je({},p),b=f.type;let g=!1,A=!0;if(xe(b))for(let L=0;L<b.length;++L){const y=b[L],m=Fe(y)&&y.name;if(m==="Boolean"){g=!0;break}else m==="String"&&(A=!1)}else g=Fe(b)&&b.name==="Boolean";f[0]=g,f[1]=A,(g||st(f,"default"))&&r.push(u)}}const c=[l,r];return et(e)&&n.set(e,c),c}function tu(e){return e[0]!=="$"&&!Rn(e)}const Gc=e=>e==="_"||e==="_ctx"||e==="$stable",Kc=e=>xe(e)?e.map(gs):[gs(e)],dy=(e,t,s)=>{if(t._n)return t;const n=Dc((...a)=>Kc(t(...a)),s);return n._c=!1,n},Kf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Gc(a))continue;const i=e[a];if(Fe(i))t[a]=dy(a,i,n);else if(i!=null){const l=Kc(i);t[a]=()=>l}}},Wf=(e,t)=>{const s=Kc(t);e.slots.default=()=>s},Zf=(e,t,s)=>{for(const n in t)(s||!Gc(n))&&(e[n]=t[n])},uy=(e,t,s)=>{const n=e.slots=Vf();if(e.vnode.shapeFlag&32){const a=t._;a?(Zf(n,t,s),s&&Hp(n,"_",a,!0)):Kf(t,n)}else t&&Wf(e,t)},py=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Zf(a,t,s):(i=!t.$stable,Kf(t,a)),l=t}else t&&(Wf(e,t),l={default:1});if(i)for(const r in a)!Gc(r)&&l[r]==null&&delete a[r]},Ct=nh;function Jf(e){return Qf(e)}function Yf(e){return Qf(e,lb)}function Qf(e,t){const s=Fr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=Ht,insertStaticContent:b}=e,g=(k,R,z,Q=null,te=null,se=null,pe=void 0,ue=null,ce=!!R.dynamicChildren)=>{if(k===R)return;k&&!Ks(k,R)&&(Q=$(k),ae(k,te,se,!0),k=null),R.patchFlag===-2&&(ce=!1,R.dynamicChildren=null);const{type:ne,ref:ie,shapeFlag:ge}=R;switch(ne){case Yn:A(k,R,z,Q);break;case St:L(k,R,z,Q);break;case Qn:k==null&&y(R,z,Q,pe);break;case $t:U(k,R,z,Q,te,se,pe,ue,ce);break;default:ge&1?w(k,R,z,Q,te,se,pe,ue,ce):ge&6?O(k,R,z,Q,te,se,pe,ue,ce):(ge&64||ge&128)&&ne.process(k,R,z,Q,te,se,pe,ue,ce,_e)}ie!=null&&te?Wa(ie,k&&k.ref,se,R||k,!R):ie==null&&k&&k.ref!=null&&Wa(k.ref,null,se,k,!0)},A=(k,R,z,Q)=>{if(k==null)n(R.el=r(R.children),z,Q);else{const te=R.el=k.el;R.children!==k.children&&c(te,R.children)}},L=(k,R,z,Q)=>{k==null?n(R.el=o(R.children||""),z,Q):R.el=k.el},y=(k,R,z,Q)=>{[k.el,k.anchor]=b(k.children,R,z,Q,k.el,k.anchor)},m=({el:k,anchor:R},z,Q)=>{let te;for(;k&&k!==R;)te=p(k),n(k,z,Q),k=te;n(R,z,Q)},x=({el:k,anchor:R})=>{let z;for(;k&&k!==R;)z=p(k),a(k),k=z;a(R)},w=(k,R,z,Q,te,se,pe,ue,ce)=>{if(R.type==="svg"?pe="svg":R.type==="math"&&(pe="mathml"),k==null)v(R,z,Q,te,se,pe,ue,ce);else{const ne=k.el&&k.el._isVueCE?k.el:null;try{ne&&ne._beginPatch(),T(k,R,te,se,pe,ue,ce)}finally{ne&&ne._endPatch()}}},v=(k,R,z,Q,te,se,pe,ue)=>{let ce,ne;const{props:ie,shapeFlag:ge,transition:we,dirs:Ae}=k;if(ce=k.el=l(k.type,se,ie&&ie.is,ie),ge&8?d(ce,k.children):ge&16&&S(k.children,ce,null,Q,te,xo(k,se),pe,ue),Ae&&an(k,null,Q,"created"),_(ce,k,k.scopeId,pe,Q),ie){for(const de in ie)de!=="value"&&!Rn(de)&&i(ce,de,null,ie[de],se,Q);"value"in ie&&i(ce,"value",null,ie.value,se),(ne=ie.onVnodeBeforeMount)&&fs(ne,Q,k)}Ae&&an(k,null,Q,"beforeMount");const F=Xf(te,we);F&&we.beforeEnter(ce),n(ce,R,z),((ne=ie&&ie.onVnodeMounted)||F||Ae)&&Ct(()=>{try{ne&&fs(ne,Q,k),F&&we.enter(ce),Ae&&an(k,null,Q,"mounted")}finally{}},te)},_=(k,R,z,Q,te)=>{if(z&&f(k,z),Q)for(let se=0;se<Q.length;se++)f(k,Q[se]);if(te){let se=te.subTree;if(R===se||dr(se.type)&&(se.ssContent===R||se.ssFallback===R)){const pe=te.vnode;_(k,pe,pe.scopeId,pe.slotScopeIds,te.parent)}}},S=(k,R,z,Q,te,se,pe,ue,ce=0)=>{for(let ne=ce;ne<k.length;ne++){const ie=k[ne]=ue?wn(k[ne]):gs(k[ne]);g(null,ie,R,z,Q,te,se,pe,ue)}},T=(k,R,z,Q,te,se,pe)=>{const ue=R.el=k.el;let{patchFlag:ce,dynamicChildren:ne,dirs:ie}=R;ce|=k.patchFlag&16;const ge=k.props||Ke,we=R.props||Ke;let Ae;if(z&&ca(z,!1),(Ae=we.onVnodeBeforeUpdate)&&fs(Ae,z,R,k),ie&&an(R,k,z,"beforeUpdate"),z&&ca(z,!0),ne&&(!k.dynamicChildren||k.dynamicChildren.length!==ne.length)&&(ce=0,pe=!1,ne=null),(ge.innerHTML&&we.innerHTML==null||ge.textContent&&we.textContent==null)&&d(ue,""),ne?M(k.dynamicChildren,ne,ue,z,Q,xo(R,te),se):pe||N(k,R,ue,null,z,Q,xo(R,te),se,!1),ce>0){if(ce&16)B(ue,ge,we,z,te);else if(ce&2&&ge.class!==we.class&&i(ue,"class",null,we.class,te),ce&4&&i(ue,"style",ge.style,we.style,te),ce&8){const F=R.dynamicProps;for(let de=0;de<F.length;de++){const ke=F[de],Re=ge[ke],De=we[ke];(De!==Re||ke==="value")&&i(ue,ke,Re,De,te,z)}}ce&1&&k.children!==R.children&&d(ue,R.children)}else!pe&&ne==null&&B(ue,ge,we,z,te);((Ae=we.onVnodeUpdated)||ie)&&Ct(()=>{Ae&&fs(Ae,z,R,k),ie&&an(R,k,z,"updated")},Q)},M=(k,R,z,Q,te,se,pe)=>{for(let ue=0;ue<R.length;ue++){const ce=k[ue],ne=R[ue],ie=ce.el&&(ce.type===$t||!Ks(ce,ne)||ce.shapeFlag&198)?u(ce.el):z;g(ce,ne,ie,null,Q,te,se,pe,!0)}},B=(k,R,z,Q,te)=>{if(R!==z){if(R!==Ke)for(const se in R)!Rn(se)&&!(se in z)&&i(k,se,R[se],null,te,Q);for(const se in z){if(Rn(se))continue;const pe=z[se],ue=R[se];pe!==ue&&se!=="value"&&i(k,se,ue,pe,te,Q)}"value"in z&&i(k,"value",R.value,z.value,te)}},U=(k,R,z,Q,te,se,pe,ue,ce)=>{const ne=R.el=k?k.el:r(""),ie=R.anchor=k?k.anchor:r("");let{patchFlag:ge,dynamicChildren:we,slotScopeIds:Ae}=R;Ae&&(ue=ue?ue.concat(Ae):Ae),k==null?(n(ne,z,Q),n(ie,z,Q),S(R.children||[],z,ie,te,se,pe,ue,ce)):ge>0&&ge&64&&we&&k.dynamicChildren&&k.dynamicChildren.length===we.length?(M(k.dynamicChildren,we,z,te,se,pe,ue),(R.key!=null||te&&R===te.subTree)&&Wc(k,R,!0)):N(k,R,z,ie,te,se,pe,ue,ce)},O=(k,R,z,Q,te,se,pe,ue,ce)=>{R.slotScopeIds=ue,k==null?R.shapeFlag&512?te.ctx.activate(R,z,Q,pe,ce):H(R,z,Q,te,se,pe,ce):J(k,R,ce)},H=(k,R,z,Q,te,se,pe)=>{const ue=k.component=ch(k,Q,te);if(hl(k)&&(ue.ctx.renderer=_e),uh(ue,!1,pe),ue.asyncDep){if(te&&te.registerDep(ue,D,pe),!k.el){const ce=ue.subTree=mt(St);L(null,ce,R,z),k.placeholder=ce.el}}else D(ue,k,R,z,te,se,pe)},J=(k,R,z)=>{const Q=R.component=k.component;if(ly(k,R,z))if(Q.asyncDep&&!Q.asyncResolved){I(Q,R,z);return}else Q.next=R,Q.update();else R.el=k.el,Q.vnode=R},D=(k,R,z,Q,te,se,pe)=>{const ue=()=>{if(k.isMounted){let{next:ge,bu:we,u:Ae,parent:F,vnode:de}=k;{const Z=eh(k);if(Z){ge&&(ge.el=de.el,I(k,ge,pe)),Z.asyncDep.then(()=>{Ct(()=>{k.isUnmounted||ne()},te)});return}}let ke=ge,Re;ca(k,!1),ge?(ge.el=de.el,I(k,ge,pe)):ge=de,we&&Ga(we),(Re=ge.props&&ge.props.onVnodeBeforeUpdate)&&fs(Re,F,ge,de),ca(k,!0);const De=Gl(k),ct=k.subTree;k.subTree=De,g(ct,De,u(ct.el),$(ct),k,te,se),ge.el=De.el,ke===null&&Jr(k,De.el),Ae&&Ct(Ae,te),(Re=ge.props&&ge.props.onVnodeUpdated)&&Ct(()=>fs(Re,F,ge,de),te)}else{let ge;const{el:we,props:Ae}=R,{bm:F,m:de,parent:ke,root:Re,type:De}=k,ct=On(R);if(ca(k,!1),F&&Ga(F),!ct&&(ge=Ae&&Ae.onVnodeBeforeMount)&&fs(ge,ke,R),ca(k,!0),we&&He){const Z=()=>{k.subTree=Gl(k),He(we,k.subTree,k,te,null)};ct&&De.__asyncHydrate?De.__asyncHydrate(we,k,Z):Z()}else{Re.ce&&Re.ce._hasShadowRoot()&&Re.ce._injectChildStyle(De,k.parent?k.parent.type:void 0);const Z=k.subTree=Gl(k);g(null,Z,z,Q,k,te,se),R.el=Z.el}if(de&&Ct(de,te),!ct&&(ge=Ae&&Ae.onVnodeMounted)){const Z=R;Ct(()=>fs(ge,ke,Z),te)}(R.shapeFlag&256||ke&&On(ke.vnode)&&ke.vnode.shapeFlag&256)&&k.a&&Ct(k.a,te),k.isMounted=!0,R=z=Q=null}};k.scope.on();const ce=k.effect=new qi(ue);k.scope.off();const ne=k.update=ce.run.bind(ce),ie=k.job=ce.runIfDirty.bind(ce);ie.i=k,ie.id=k.uid,ce.scheduler=()=>Pc(ie),ca(k,!0),ne()},I=(k,R,z)=>{R.component=k;const Q=k.vnode.props;k.vnode=R,k.next=null,oy(k,R.props,Q,z),py(k,R.children,z),Mn(),jd(k),Pn()},N=(k,R,z,Q,te,se,pe,ue,ce=!1)=>{const ne=k&&k.children,ie=k?k.shapeFlag:0,ge=R.children,{patchFlag:we,shapeFlag:Ae}=R;if(we>0){if(we&128){he(ne,ge,z,Q,te,se,pe,ue,ce);return}else if(we&256){Y(ne,ge,z,Q,te,se,pe,ue,ce);return}}Ae&8?(ie&16&&X(ne,te,se),ge!==ne&&d(z,ge)):ie&16?Ae&16?he(ne,ge,z,Q,te,se,pe,ue,ce):X(ne,te,se,!0):(ie&8&&d(z,""),Ae&16&&S(ge,z,Q,te,se,pe,ue,ce))},Y=(k,R,z,Q,te,se,pe,ue,ce)=>{k=k||ja,R=R||ja;const ne=k.length,ie=R.length,ge=Math.min(ne,ie);let we;for(we=0;we<ge;we++){const Ae=R[we]=ce?wn(R[we]):gs(R[we]);g(k[we],Ae,z,null,te,se,pe,ue,ce)}ne>ie?X(k,te,se,!0,!1,ge):S(R,z,Q,te,se,pe,ue,ce,ge)},he=(k,R,z,Q,te,se,pe,ue,ce)=>{let ne=0;const ie=R.length;let ge=k.length-1,we=ie-1;for(;ne<=ge&&ne<=we;){const Ae=k[ne],F=R[ne]=ce?wn(R[ne]):gs(R[ne]);if(Ks(Ae,F))g(Ae,F,z,null,te,se,pe,ue,ce);else break;ne++}for(;ne<=ge&&ne<=we;){const Ae=k[ge],F=R[we]=ce?wn(R[we]):gs(R[we]);if(Ks(Ae,F))g(Ae,F,z,null,te,se,pe,ue,ce);else break;ge--,we--}if(ne>ge){if(ne<=we){const Ae=we+1,F=Ae<ie?R[Ae].el:Q;for(;ne<=we;)g(null,R[ne]=ce?wn(R[ne]):gs(R[ne]),z,F,te,se,pe,ue,ce),ne++}}else if(ne>we)for(;ne<=ge;)ae(k[ne],te,se,!0),ne++;else{const Ae=ne,F=ne,de=new Map;for(ne=F;ne<=we;ne++){const Ue=R[ne]=ce?wn(R[ne]):gs(R[ne]);Ue.key!=null&&de.set(Ue.key,ne)}let ke,Re=0;const De=we-F+1;let ct=!1,Z=0;const Se=new Array(De);for(ne=0;ne<De;ne++)Se[ne]=0;for(ne=Ae;ne<=ge;ne++){const Ue=k[ne];if(Re>=De){ae(Ue,te,se,!0);continue}let lt;if(Ue.key!=null)lt=de.get(Ue.key);else for(ke=F;ke<=we;ke++)if(Se[ke-F]===0&&Ks(Ue,R[ke])){lt=ke;break}lt===void 0?ae(Ue,te,se,!0):(Se[lt-F]=ne+1,lt>=Z?Z=lt:ct=!0,g(Ue,R[lt],z,null,te,se,pe,ue,ce),Re++)}const Le=ct?fy(Se):ja;for(ke=Le.length-1,ne=De-1;ne>=0;ne--){const Ue=F+ne,lt=R[Ue],ze=R[Ue+1],gt=Ue+1<ie?ze.el||th(ze):Q;Se[ne]===0?g(null,lt,z,gt,te,se,pe,ue,ce):ct&&(ke<0||ne!==Le[ke]?Oe(lt,z,gt,2):ke--)}}},Oe=(k,R,z,Q,te=null)=>{const{el:se,type:pe,transition:ue,children:ce,shapeFlag:ne}=k;if(ne&6){Oe(k.component.subTree,R,z,Q);return}if(ne&128){k.suspense.move(R,z,Q);return}if(ne&64){pe.move(k,R,z,_e);return}if(pe===$t){n(se,R,z);for(let ge=0;ge<ce.length;ge++)Oe(ce[ge],R,z,Q);n(k.anchor,R,z);return}if(pe===Qn){m(k,R,z);return}if(Q!==2&&ne&1&&ue)if(Q===0)ue.persisted&&!se[Us]?n(se,R,z):(ue.beforeEnter(se),n(se,R,z),Ct(()=>ue.enter(se),te));else{const{leave:ge,delayLeave:we,afterLeave:Ae}=ue,F=()=>{k.ctx.isUnmounted?a(se):n(se,R,z)},de=()=>{const ke=se._isLeaving||!!se[Us];se._isLeaving&&se[Us](!0),ue.persisted&&!ke?F():ge(se,()=>{F(),Ae&&Ae()})};we?we(se,F,de):de()}else n(se,R,z)},ae=(k,R,z,Q=!1,te=!1)=>{const{type:se,props:pe,ref:ue,children:ce,dynamicChildren:ne,shapeFlag:ie,patchFlag:ge,dirs:we,cacheIndex:Ae,memo:F}=k;if(ge===-2&&(te=!1),ue!=null&&(Mn(),Wa(ue,null,z,k,!0),Pn()),Ae!=null&&(R.renderCache[Ae]=void 0),ie&256){R.ctx.deactivate(k);return}const de=ie&1&&we,ke=!On(k);let Re;if(ke&&(Re=pe&&pe.onVnodeBeforeUnmount)&&fs(Re,R,k),ie&6)ve(k.component,z,Q);else{if(ie&128){k.suspense.unmount(z,Q);return}de&&an(k,null,R,"beforeUnmount"),ie&64?k.type.remove(k,R,z,_e,Q):ne&&!ne.hasOnce&&(se!==$t||ge>0&&ge&64)?X(ne,R,z,!1,!0):(se===$t&&ge&384||!te&&ie&16)&&X(ce,R,z),Q&&be(k)}const De=F!=null&&Ae==null;(ke&&(Re=pe&&pe.onVnodeUnmounted)||de||De)&&Ct(()=>{Re&&fs(Re,R,k),de&&an(k,null,R,"unmounted"),De&&(k.el=null)},z)},be=k=>{const{type:R,el:z,anchor:Q,transition:te}=k;if(R===$t){ee(z,Q);return}if(R===Qn){x(k);return}const se=()=>{a(z),te&&!te.persisted&&te.afterLeave&&te.afterLeave()};if(k.shapeFlag&1&&te&&!te.persisted){const{leave:pe,delayLeave:ue}=te,ce=()=>pe(z,se);ue?ue(k.el,se,ce):ce()}else se()},ee=(k,R)=>{let z;for(;k!==R;)z=p(k),a(k),k=z;a(R)},ve=(k,R,z)=>{const{bum:Q,scope:te,job:se,subTree:pe,um:ue,m:ce,a:ne}=k;cr(ce),cr(ne),Q&&Ga(Q),te.stop(),se&&(se.flags|=8,ae(pe,k,R,z)),ue&&Ct(ue,R),Ct(()=>{k.isUnmounted=!0},R)},X=(k,R,z,Q=!1,te=!1,se=0)=>{for(let pe=se;pe<k.length;pe++)ae(k[pe],R,z,Q,te)},$=k=>{if(k.shapeFlag&6)return $(k.component.subTree);if(k.shapeFlag&128)return k.suspense.next();const R=p(k.anchor||k.el),z=R&&R[Sf];return z?p(z):R};let re=!1;const oe=(k,R,z)=>{let Q;k==null?R._vnode&&(ae(R._vnode,null,null,!0),Q=R._vnode.component):g(R._vnode||null,k,R,null,null,null,z),R._vnode=k,re||(re=!0,jd(Q),ar(),re=!1)},_e={p:g,um:ae,m:Oe,r:be,mt:H,mc:S,pc:N,pbc:M,n:$,o:e};let Ne,He;return t&&([Ne,He]=t(_e)),{render:oe,hydrate:Ne,createApp:Xb(oe,Ne)}}function xo({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ca({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Xf(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Wc(e,t,s=!1){const n=e.children,a=t.children;if(xe(n)&&xe(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=wn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Wc(l,r)),r.type===Yn&&(r.patchFlag===-1&&(r=a[i]=wn(r)),r.el=l.el),r.type===St&&!r.el&&(r.el=l.el)}}function fy(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function eh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:eh(t)}function cr(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function th(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?th(t.subTree):null}const dr=e=>e.__isSuspense;let ec=0;const hy={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)gy(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}vy(e,t,s,n,a,l,r,o,c)}},hydrate:by,normalize:yy},my=hy;function Qi(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function gy(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=sh(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Qi(e,"onPending"),Qi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Za(p,e.ssFallback)):p.resolve(!1,!0)}function vy(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:b,pendingBranch:g,isInFallback:A,isHydrating:L}=u;if(g)u.pendingBranch=p,Ks(g,p)?(o(g,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():A&&!L&&!u.isFallbackMountPending&&(o(b,f,s,n,a,null,i,l,r),Za(u,f))):(u.pendingId=ec++,L?(u.isHydrating=!1,u.activeBranch=g):c(g,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),A?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():u.isFallbackMountPending||(o(b,f,s,n,a,null,i,l,r),Za(u,f))):b&&Ks(b,p)?(o(b,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(b&&Ks(b,p))o(b,p,s,n,a,u,i,l,r),Za(u,p);else if(Qi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=ec++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:m}=u;y>0?setTimeout(()=>{u.pendingId===m&&u.fallback(f)},y):y===0&&u.fallback(f)}}function sh(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:f,n:b,o:{parentNode:g,remove:A}}=c;let L;const y=xy(e);y&&t&&t.pendingBranch&&(L=t.pendingId,t.deps++);const m=e.props?Xl(e.props.timeout):void 0,x=i,w={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:ec++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(v=!1,_=!1){const{vnode:S,activeBranch:T,pendingBranch:M,pendingId:B,effects:U,parentComponent:O,container:H,isInFallback:J}=w;let D=!1;if(w.isHydrating)w.isHydrating=!1;else if(!v){D=T&&M.transition&&M.transition.mode==="out-in";let Y=!1;D&&(T.transition.afterLeave=()=>{B===w.pendingId&&(p(M,H,i===x&&!Y?b(T):i,0),Wi(U),J&&S.ssFallback&&(S.ssFallback.el=null))}),T&&!w.isFallbackMountPending&&(g(T.el)===H&&(i=b(T),Y=!0),f(T,O,w,!0),!D&&J&&S.ssFallback&&Ct(()=>S.ssFallback.el=null,w)),D||p(M,H,i,0)}w.isFallbackMountPending=!1,Za(w,M),w.pendingBranch=null,w.isInFallback=!1;let I=w.parent,N=!1;for(;I;){if(I.pendingBranch){for(let Y=0;Y<U.length;Y++)I.effects.push(U[Y]);N=!0;break}I=I.parent}!N&&!D&&Wi(U),w.effects=[],y&&t&&t.pendingBranch&&L===t.pendingId&&(t.deps--,t.deps===0&&!_&&t.resolve()),Qi(S,"onResolve")},fallback(v){if(!w.pendingBranch)return;const{vnode:_,activeBranch:S,parentComponent:T,container:M,namespace:B}=w;Qi(_,"onFallback");const U=b(S),O=()=>{if(w.isFallbackMountPending=!1,!w.isInFallback)return;const J=w.vnode.ssFallback;u(null,J,M,U,T,null,B,r,o),Za(w,J)},H=v.transition&&v.transition.mode==="out-in";H&&(w.isFallbackMountPending=!0,S.transition.afterLeave=O),w.isInFallback=!0,f(S,T,null,!0),H||O()},move(v,_,S){w.activeBranch&&p(w.activeBranch,v,_,S),w.container=v},next(){return w.activeBranch&&b(w.activeBranch)},registerDep(v,_,S){const T=!!w.pendingBranch;T&&w.deps++;const M=v.vnode.el;v.asyncDep.catch(B=>{Aa(B,v,0)}).then(B=>{if(v.isUnmounted||w.isUnmounted||w.pendingId!==v.suspenseId)return;tl(),v.asyncResolved=!0;const{vnode:U}=v;tc(v,B,!1),M&&(U.el=M);const O=!M&&v.subTree.el;_(v,U,g(M||v.subTree.el),M?null:b(v.subTree),w,l,S),O&&(U.placeholder=null,A(O)),Jr(v,U.el),T&&--w.deps===0&&w.resolve()})},unmount(v,_){w.isUnmounted=!0,w.activeBranch&&f(w.activeBranch,s,v,_),w.pendingBranch&&f(w.pendingBranch,s,v,_)}};return w}function by(e,t,s,n,a,i,l,r,o){const c=t.suspense=sh(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function yy(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=su(n?s.default:s),e.ssFallback=n?su(s.fallback):mt(St)}function su(e){let t;if(Fe(e)){const s=wa&&e._c;s&&(e._d=!1,Xi()),e=e(),s&&(e._d=!0,t=Wt,Yr())}return xe(e)&&(e=ny(e)),e=gs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function nh(e,t){t&&t.pendingBranch?xe(e)?t.effects.push(...e):t.effects.push(e):Wi(e)}function Za(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Jr(n,a))}function xy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const $t=Symbol.for("v-fgt"),Yn=Symbol.for("v-txt"),St=Symbol.for("v-cmt"),Qn=Symbol.for("v-stc"),Ln=[];let Wt=null;function Xi(e=!1){Ln.push(Wt=e?null:[])}function Yr(){Ln.pop(),Wt=Ln[Ln.length-1]||null}let wa=1;function el(e,t=!1){wa+=e,e<0&&Wt&&t&&(Wt.hasOnce=!0)}function ah(e){return e.dynamicChildren=wa>0?Wt||ja:null,Yr(),wa>0&&Wt&&Wt.push(e),e}function _y(e,t,s,n,a,i){return ah(Zc(e,t,s,n,a,i,!0))}function ur(e,t,s,n,a){return ah(mt(e,t,s,n,a,!0))}function Fn(e){return e?e.__v_isVNode===!0:!1}function Ks(e,t){return e.type===t.type&&e.key===t.key}function wy(e){}const ih=({key:e})=>e??null,Kl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?$e(e)||At(e)||Fe(e)?{i:Bt,r:e,k:t,f:!!s}:e:null);function Zc(e,t=null,s=null,n=0,a=null,i=e===$t?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&ih(t),ref:t&&Kl(t),scopeId:Vr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Bt};return r?(pr(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=$e(s)?8:16),wa>0&&!l&&Wt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Wt.push(o),o}const mt=ky;function ky(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Pf)&&(e=St),Fn(e)){const r=dn(e,t,!0);return s&&pr(r,s),wa>0&&!i&&Wt&&(r.shapeFlag&6?Wt[Wt.indexOf(e)]=r:Wt.push(r)),r.patchFlag=-2,r}if(Iy(e)&&(e=e.__vccOpts),t){t=lh(t);let{class:r,style:o}=t;r&&!$e(r)&&(t.class=dl(r)),et(o)&&(ul(o)&&!xe(o)&&(o=je({},o)),t.style=cl(o))}const l=$e(e)?1:dr(e)?128:jr(e)?64:et(e)?4:Fe(e)?2:0;return Zc(e,t,s,n,a,l,i,!0)}function lh(e){return e?ul(e)||jf(e)?je({},e):e:null}function dn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?oh(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&ih(c),ref:t&&t.ref?s&&i?xe(i)?i.concat(Kl(t)):[i,Kl(t)]:Kl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==$t?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&dn(e.ssContent),ssFallback:e.ssFallback&&dn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Dn(d,o.clone(d)),d}function Jc(e=" ",t=0){return mt(Yn,null,e,t)}function Sy(e,t){const s=mt(Qn,null,e);return s.staticCount=t,s}function rh(e="",t=!1){return t?(Xi(),ur(St,null,e)):mt(St,null,e)}function gs(e){return e==null||typeof e=="boolean"?mt(St):xe(e)?mt($t,null,e.slice()):Fn(e)?wn(e):mt(Yn,null,String(e))}function wn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:dn(e)}function pr(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(xe(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),pr(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!jf(t)?t._ctx=Bt:a===3&&Bt&&(Bt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else if(Fe(t)){if(n&65){pr(e,{default:t});return}t={default:t,_ctx:Bt},s=32}else t=String(t),n&64?(s=16,t=[Jc(t)]):s=8;e.children=t,e.shapeFlag|=s}function oh(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=dl([t.class,n.class]));else if(a==="style")t.style=cl([t.style,n.style]);else if(Ta(a)){const i=t[a],l=n[a];l&&i!==l&&!(xe(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Lr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function fs(e,t,s,n=null){As(e,t,7,[s,n])}const Cy=$f();let Ty=0;function ch(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Cy,i={uid:Ty++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Ac(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Gf(n,a),emitsOptions:Bf(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ty.bind(null,i),e.ce&&e.ce(i),i}let Ut=null;const ls=()=>Ut||Bt;let fr,Xn;{const e=Fr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};fr=t("__VUE_INSTANCE_SETTERS__",s=>Ut=s),Xn=t("__VUE_SSR_SETTERS__",s=>ka=s)}const hi=e=>{const t=Ut;return fr(e),e.scope.on(),()=>{e.scope.off(),fr(t)}},tl=()=>{Ut&&Ut.scope.off(),fr(null)};function dh(e){return e.vnode.shapeFlag&4}let ka=!1;function uh(e,t=!1,s=!1){t&&Xn(t);const{props:n,children:a}=e.vnode,i=dh(e);ry(e,n,i,t),uy(e,a,s||t);const l=i?Ey(e,t):void 0;return t&&Xn(!1),l}function Ey(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Jo);const{setup:n}=s;if(n){Mn();const a=e.setupContext=n.length>1?hh(e):null,i=hi(e),l=fi(n,e,0,[e.props,a]),r=Ec(l);if(Pn(),i(),(r||e.sp)&&!On(e)&&Uc(e),r){if(l.then(tl,tl),t)return l.then(o=>{Xn(!0);try{tc(e,o,t)}finally{Xn(!1)}}).catch(o=>{Aa(o,e,0)});e.asyncDep=l}else tc(e,l,t)}else fh(e,t)}function tc(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:et(t)&&(e.setupState=Mc(t)),fh(e,s)}let hr,sc;function ph(e){hr=e,sc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Nb))}}const Ay=()=>!hr;function fh(e,t,s){const n=e.type;if(!e.render){if(!t&&hr&&!n.render){const a=n.template||qc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=je(je({isCustomElement:i,delimiters:r},l),o);n.render=hr(a,c)}}e.render=n.render||Ht,sc&&sc(e)}{const a=hi(e);Mn();try{Kb(e)}finally{Pn(),a()}}}const Ry={get(e,t){return Kt(e,"get",""),e[t]}};function hh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Ry),slots:e.slots,emit:e.emit,expose:t}}function ml(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Mc(df(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in $i)return $i[s](e)},has(t,s){return s in t||s in $i}})):e.proxy}function nc(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function Iy(e){return Fe(e)&&"__vccOpts"in e}const W=(e,t)=>Ov(e,t,ka);function si(e,t,s){try{el(-1);const n=arguments.length;return n===2?et(t)&&!xe(t)?Fn(t)?mt(e,null,[t]):mt(e,t):mt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Fn(s)&&(s=[s]),mt(e,t,s))}finally{el(1)}}function Oy(){}function Ly(e,t,s,n){const a=s[n];if(a&&mh(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function mh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Pt(s[n],t[n]))return!1;return wa>0&&Wt&&Wt.push(e),!0}const gh="3.5.42",Ny=Ht,My=Bv,Py=Ua,Dy=yf,Fy={createComponentInstance:ch,setupComponent:uh,renderComponentRoot:Gl,setCurrentRenderingInstance:Ji,isVNode:Fn,normalizeVNode:gs,getComponentPublicInstance:ml,ensureValidVNode:jc,pushWarningContext:Dv,popWarningContext:Fv},$y=Fy,Uy=null,By=null,Hy=null;/**
* @vue/runtime-dom v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ac;const nu=typeof window<"u"&&window.trustedTypes;if(nu)try{ac=nu.createPolicy("vue",{createHTML:e=>e})}catch{}const vh=ac?e=>ac.createHTML(e):e=>e,zy="http://www.w3.org/2000/svg",Vy="http://www.w3.org/1998/Math/MathML",_n=typeof document<"u"?document:null,au=_n&&_n.createElement("template"),bh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?_n.createElementNS(zy,e):t==="mathml"?_n.createElementNS(Vy,e):s?_n.createElement(e,{is:s}):_n.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>_n.createTextNode(e),createComment:e=>_n.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>_n.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{au.innerHTML=vh(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=au.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Bn="transition",_i="animation",ni=Symbol("_vtc"),yh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},xh=je({},$c,yh),jy=e=>(e.displayName="Transition",e.props=xh,e),qy=jy((e,{slots:t})=>si(Ef,_h(e),t)),da=(e,t=[])=>{xe(e)?e.forEach(s=>s(...t)):e&&e(...t)},iu=e=>e?xe(e)?e.some(t=>t.length>1):e.length>1:!1;function _h(e){const t={};for(const U in e)U in yh||(t[U]=e[U]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,b=Gy(a),g=b&&b[0],A=b&&b[1],{onBeforeEnter:L,onEnter:y,onEnterCancelled:m,onLeave:x,onLeaveCancelled:w,onBeforeAppear:v=L,onAppear:_=y,onAppearCancelled:S=m}=t,T=(U,O,H,J)=>{U._enterCancelled=J,qn(U,O?d:r),qn(U,O?c:l),H&&H()},M=(U,O)=>{U._isLeaving=!1,qn(U,u),qn(U,f),qn(U,p),O&&O()},B=U=>(O,H)=>{const J=U?_:y,D=()=>T(O,U,H);da(J,[O,D]),lu(()=>{qn(O,U?o:i),tn(O,U?d:r),iu(J)||ru(O,n,g,D)})};return je(t,{onBeforeEnter(U){da(L,[U]),tn(U,i),tn(U,l)},onBeforeAppear(U){da(v,[U]),tn(U,o),tn(U,c)},onEnter:B(!1),onAppear:B(!0),onLeave(U,O){U._isLeaving=!0;const H=()=>M(U,O);tn(U,u),U._enterCancelled?(tn(U,p),ic(U)):(ic(U),tn(U,p)),lu(()=>{U._isLeaving&&(qn(U,u),tn(U,f),iu(x)||ru(U,n,A,H))}),da(x,[U,H])},onEnterCancelled(U){T(U,!1,void 0,!0),da(m,[U])},onAppearCancelled(U){T(U,!0,void 0,!0),da(S,[U])},onLeaveCancelled(U){M(U),da(w,[U])}})}function Gy(e){if(e==null)return null;if(et(e))return[_o(e.enter),_o(e.leave)];{const t=_o(e);return[t,t]}}function _o(e){return Xl(e)}function tn(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ni]||(e[ni]=new Set)).add(t)}function qn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ni];s&&(s.delete(t),s.size||(e[ni]=void 0))}function lu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Ky=0;function ru(e,t,s,n){const a=e._endId=++Ky,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=wh(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function wh(e,t){const s=window.getComputedStyle(e),n=b=>(s[b]||"").split(", "),a=n(`${Bn}Delay`),i=n(`${Bn}Duration`),l=ou(a,i),r=n(`${_i}Delay`),o=n(`${_i}Duration`),c=ou(r,o);let d=null,u=0,p=0;t===Bn?l>0&&(d=Bn,u=l,p=i.length):t===_i?c>0&&(d=_i,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?Bn:_i:null,p=d?d===Bn?i.length:o.length:0);const f=d===Bn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Bn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function ou(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>cu(s)+cu(e[n])))}function cu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function ic(e){return(e?e.ownerDocument:document).body.offsetHeight}function Wy(e,t,s){const n=e[ni];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const mr=Symbol("_vod"),Yc=Symbol("_vsh"),kh={name:"show",beforeMount(e,{value:t},{transition:s}){e[mr]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):wi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),wi(e,!0),n.enter(e)):n.leave(e,()=>{wi(e,!1)}):wi(e,t))},beforeUnmount(e,{value:t}){wi(e,t)}};function wi(e,t){e.style.display=t?e[mr]:"none",e[Yc]=!t}function Zy(){kh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Sh=Symbol("");function Jy(e){const t=ls();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>gr(i,a))},n=()=>{const a=e(t.proxy);t.ce?gr(t.ce,a):lc(t.subTree,a),s(a)};Hc(()=>{Wi(n)}),Ze(()=>{is(n,Ht,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),_t(()=>a.disconnect())})}function lc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{lc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)gr(e.el,t);else if(e.type===$t)e.children.forEach(s=>lc(s,t));else if(e.type===Qn){let{el:s,anchor:n}=e;for(;s&&(gr(s,t),s!==n);)s=s.nextSibling}}function gr(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Yg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Sh]=n}}const Yy=/(?:^|;)\s*display\s*:/;function Qy(e,t,s){const n=e.style,a=$e(s);let i=!1;if(s&&!a){if(t)if($e(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Ni(n,r,"")}else for(const l in t)s[l]==null&&Ni(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?ex(e,l,!$e(t)&&t?t[l]:void 0,r)||Ni(n,l,r):Ni(n,l,"")}}else if(a){if(t!==s){const l=n[Sh];l&&(s+=";"+l),n.cssText=s,i=Yy.test(s)}}else t&&e.removeAttribute("style");mr in e&&(e[mr]=i?n.display:"",e[Yc]&&(n.display="none"))}const Pl=/\s*!important$/;function Ni(e,t,s){if(xe(s))s.forEach(n=>Ni(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))Pl.test(s)?e.setProperty(t,s.replace(Pl,""),"important"):e.setProperty(t,s);else{const n=Xy(e,t);Pl.test(s)?e.setProperty(vs(n),s.replace(Pl,""),"important"):e[n]=s}}const du=["Webkit","Moz","ms"],wo={};function Xy(e,t){const s=wo[t];if(s)return s;let n=rt(t);if(n!=="filter"&&n in e)return wo[t]=n;n=Ea(n);for(let a=0;a<du.length;a++){const i=du[a]+n;if(i in e)return wo[t]=i}return t}function ex(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&$e(n)&&s===n}const uu="http://www.w3.org/1999/xlink";function pu(e,t,s,n,a,i=Zg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(uu,t.slice(6,t.length)):e.setAttributeNS(uu,t,s):s==null||i&&!Vp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Yt(s)?String(s):s)}function fu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?vh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Vp(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Tn(e,t,s,n){e.addEventListener(t,s,n)}function tx(e,t,s,n){e.removeEventListener(t,s,n)}const hu=Symbol("_vei");function sx(e,t,s,n,a=null){const i=e[hu]||(e[hu]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=ix(t);if(n){const c=i[t]=ox(n,a);Tn(e,r,c,o)}else l&&(tx(e,r,l,o),i[t]=void 0)}}const nx=/(Once|Passive|Capture)$/,ax=/^on:?(?:Once|Passive|Capture)$/;function ix(e){let t,s;for(;(s=e.match(nx))&&!ax.test(e);)t||(t={}),e=e.slice(0,e.length-s[1].length),t[s[1].toLowerCase()]=!0;return[e[2]===":"?e.slice(3):vs(e.slice(2)),t]}let ko=0;const lx=Promise.resolve(),rx=()=>ko||(lx.then(()=>ko=0),ko=Date.now());function ox(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(xe(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&As(c,t,5,r)}}else As(a,t,5,[n])};return s.value=e,s.attached=rx(),s}const mu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Ch=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Wy(e,n,l):t==="style"?Qy(e,s,n):Ta(t)?Lr(t)||sx(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):cx(e,t,n,l))?(fu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&pu(e,t,n,l,i,t!=="value")):e._isVueCE&&(dx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!$e(n)))?fu(e,rt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),pu(e,t,n,l))};function cx(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&mu(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return mu(t)&&$e(s)?!1:t in e}function dx(e,t){const s=e._def.props;if(!s)return!1;const n=rt(t);return Array.isArray(s)?s.some(a=>rt(a)===n):Object.keys(s).some(a=>rt(a)===n)}const gu={};function Th(e,t,s){let n=fl(e,t);Nr(n)&&(n=je({},n,t));class a extends Qr{constructor(l){super(n,l,s)}}return a.def=n,a}const ux=((e,t)=>Th(e,t,Uh)),px=typeof HTMLElement<"u"?HTMLElement:class{};class Qr extends px{constructor(t,s={},n=yr){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==yr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Qr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{if(this._pendingResolve=void 0,this.isConnected)return this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Tt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return this._pendingResolve;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!xe(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Xl(this._props[o])),(r||(r=Object.create(null)))[rt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;if(s)return this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}),this._pendingResolve;t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)st(this,n)||Object.defineProperty(this,n,{get:()=>rn(s[n])})}_resolveProps(t){const{props:s}=t,n=xe(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(rt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):gu;const a=rt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Xl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===gu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(vs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(vs(t),s+""):s||this.removeAttribute(vs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),$h(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=mt(this._def,je(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Nr(l[0])?je({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),vs(i)!==i&&a(vs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Eh(e){const t=ls(),s=t&&t.ce;return s||null}function fx(){const e=Eh();return e&&e.shadowRoot}function hx(e="$style"){{const t=ls();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const Ah=new WeakMap,Rh=new WeakMap,vr=Symbol("_moveCb"),vu=Symbol("_enterCb"),mx=e=>(delete e.props.mode,e),gx=mx({name:"TransitionGroup",props:je({},xh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=ls(),n=Fc();let a,i;return Kr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!_x(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(bx),a.forEach(yx);const r=a.filter(xx);ic(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;tn(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[vr]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[vr]=null,qn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=_h(l);let o=l.tag||$t;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Yc]&&(a.push(d),Dn(d,ti(d,r,n,s)),Ah.set(d,Ih(d.el)))}i=t.default?qr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Dn(d,ti(d,r,n,s))}return mt(o,null,i)}}}),vx=gx;function bx(e){const t=e.el;t[vr]&&t[vr](),t[vu]&&t[vu]()}function yx(e){Rh.set(e,Ih(e.el))}function xx(e){const t=Ah.get(e),s=Rh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Ih(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function _x(e,t,s){const n=e.cloneNode(),a=e[ni];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=wh(n);return i.removeChild(n),l}const ta=e=>{const t=e.props["onUpdate:modelValue"]||!1;return xe(t)?s=>Ga(t,s):t};function wx(e){e.target.composing=!0}function bu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ts=Symbol("_assign"),Dl=Symbol("_initialValue");function So(e,t,s){return t&&(e=e.trim()),s&&(e=Dr(e)),e}const br={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e.parentNode&&(e.type==="text"?e[Dl]=e.defaultValue.replace(/[\r\n]/g,""):e.type==="textarea"&&(e[Dl]=e.defaultValue.replace(/\r\n?/g,`
`))),e[Ts]=ta(a);const i=n||a.props&&a.props.type==="number";Tn(e,t?"change":"input",l=>{l.target.composing||e[Ts](So(e.value,s,i))}),(s||i)&&Tn(e,"change",()=>{e.value=So(e.value,s,i)}),t||(Tn(e,"compositionstart",wx),Tn(e,"compositionend",bu),Tn(e,"change",bu))},mounted(e,{value:t,modifiers:{trim:s,number:n}}){const a=t??"",i=e[Dl];delete e[Dl],i!==void 0&&(e.type==="text"||e.type==="textarea")&&e.value!==i?e[Ts](So(e.value,s,n)):e.value=a},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ts]=ta(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Dr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Qc={deep:!0,created(e,t,s){e[Ts]=ta(s),Tn(e,"change",()=>{const n=e._modelValue,a=ai(e),i=e.checked,l=e[Ts];if(xe(n)){const r=$r(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(on(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Lh(e,i))})},mounted:yu,beforeUpdate(e,t,s){e[Ts]=ta(s),yu(e,t,s)}};function yu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(xe(t))a=$r(t,n.props.value)>-1;else if(on(t))a=t.has(n.props.value);else{if(t===s)return;a=js(t,Lh(e,!0))}e.checked!==a&&(e.checked=a)}const Xc={created(e,{value:t},s){e.checked=js(t,s.props.value),e[Ts]=ta(s),Tn(e,"change",()=>{e[Ts](ai(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ts]=ta(n),t!==s&&(e.checked=js(t,n.props.value))}},Oh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){e._modelValue=t,Tn(e,"change",()=>{const a=Array.prototype.filter.call(e.options,o=>o.selected).map(o=>s?Dr(ai(o)):ai(o)),i=e.multiple,l=i?on(e._modelValue)?new Set(a):a:a[0],r=e._pendingValue=[i,i?xe(l)?a.slice():a:l];try{e[Ts](l)}finally{Tt(()=>{e._pendingValue===r&&(e._pendingValue=void 0)})}}),e[Ts]=ta(n)},mounted(e,{value:t}){xu(e,t)},beforeUpdate(e,{value:t},s){e._modelValue=t,e[Ts]=ta(s)},updated(e,{value:t}){const s=e._pendingValue;e._pendingValue=void 0,(!s||s[0]!==e.multiple||!kx(t,s[1],s[0]))&&xu(e,t)}};function kx(e,t,s){if(!s||xe(e))return js(e,t);if(on(e)){if(e.size!==t.length)return!1;for(const n of t)if(!e.has(n))return!1;return!0}return!1}function xu(e,t){const s=e.multiple,n=xe(t);if(!(s&&!n&&!on(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ai(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=$r(t,r)>-1}else l.selected=t.has(r);else if(js(ai(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ai(e){return"_value"in e?e._value:e.value}function Lh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Nh={created(e,t,s){Fl(e,t,s,null,"created")},mounted(e,t,s){Fl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Fl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Fl(e,t,s,n,"updated")}};function Mh(e,t){switch(e){case"SELECT":return Oh;case"TEXTAREA":return br;default:switch(t){case"checkbox":return Qc;case"radio":return Xc;default:return br}}}function Fl(e,t,s,n,a){const l=Mh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Sx(){br.getSSRProps=({value:e})=>({value:e}),Xc.getSSRProps=({value:e},t)=>{if(t.props&&js(t.props.value,e))return{checked:!0}},Qc.getSSRProps=({value:e},t)=>{if(xe(e)){if(t.props&&$r(e,t.props.value)>-1)return{checked:!0}}else if(on(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Nh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Mh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Cx=["ctrl","shift","alt","meta"],Tx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Cx.some(s=>e[`${s}Key`]&&!t.includes(s))},Ex=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Tx[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Ax={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Rx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=vs(a.key);if(t.some(l=>l===i||Ax[l]===i))return e(a)}))},Ph=je({patchProp:Ch},bh);let Ui,_u=!1;function Dh(){return Ui||(Ui=Jf(Ph))}function Fh(){return Ui=_u?Ui:Yf(Ph),_u=!0,Ui}const $h=((...e)=>{Dh().render(...e)}),Ix=((...e)=>{Fh().hydrate(...e)}),yr=((...e)=>{const t=Dh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Hh(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Bh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Uh=((...e)=>{const t=Fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Hh(n);if(a)return s(a,!0,Bh(a))},t});function Bh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Hh(e){return $e(e)?document.querySelector(e):e}let wu=!1;const Ox=()=>{wu||(wu=!0,Sx(),Zy())},Lx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Ef,BaseTransitionPropsValidators:$c,Comment:St,DeprecationTypes:Hy,EffectScope:Ac,ErrorCodes:Uv,ErrorTypeStrings:My,Fragment:$t,KeepAlive:kb,ReactiveEffect:qi,Static:Qn,Suspense:my,Teleport:eb,Text:Yn,TrackOpTypes:Lv,Transition:qy,TransitionGroup:vx,TriggerOpTypes:Nv,VueElement:Qr,assertNumber:$v,callWithAsyncErrorHandling:As,callWithErrorHandling:fi,camelize:rt,capitalize:Ea,cloneVNode:dn,compatUtils:By,computed:W,createApp:yr,createBlock:ur,createCommentVNode:rh,createElementBlock:_y,createElementVNode:Zc,createHydrationRenderer:Yf,createPropsRestProxy:qb,createRenderer:Jf,createSSRApp:Uh,createSlots:Ib,createStaticVNode:Sy,createTextVNode:Jc,createVNode:mt,customRef:pf,defineAsyncComponent:_b,defineComponent:fl,defineCustomElement:Th,defineEmits:Pb,defineExpose:Db,defineModel:Ub,defineOptions:Fb,defineProps:Mb,defineSSRCustomElement:ux,defineSlots:$b,devtools:Py,effect:tv,effectScope:Qg,getCurrentInstance:ls,getCurrentScope:Kp,getCurrentWatcher:Mv,getTransitionRawChildren:qr,guardReactiveProps:lh,h:si,handleError:Aa,hasInjectionContext:Kv,hydrate:Ix,hydrateOnIdle:mb,hydrateOnInteraction:yb,hydrateOnMediaQuery:bb,hydrateOnVisible:vb,initCustomFormatter:Oy,initDirectivesForSSR:Ox,inject:Vs,isMemoSame:mh,isProxy:ul,isReactive:In,isReadonly:cn,isRef:At,isRuntimeOnly:Ay,isShallow:bs,isVNode:Fn,markRaw:df,mergeDefaults:Vb,mergeModels:jb,mergeProps:oh,nextTick:Tt,nodeOps:bh,normalizeClass:dl,normalizeProps:Ug,normalizeStyle:cl,onActivated:Is,onBeforeMount:If,onBeforeUnmount:Wr,onBeforeUpdate:Hc,onDeactivated:Os,onErrorCaptured:Mf,onMounted:Ze,onRenderTracked:Nf,onRenderTriggered:Lf,onScopeDispose:Xg,onServerPrefetch:Of,onUnmounted:_t,onUpdated:Kr,onWatcherCleanup:hf,openBlock:Xi,patchProp:Ch,popScopeId:jv,provide:Fi,proxyRefs:Mc,pushScopeId:Vv,queuePostFlushCb:Wi,reactive:sa,readonly:tr,ref:h,registerRuntimeCompiler:ph,render:$h,renderList:Rb,renderSlot:Ob,resolveComponent:Tb,resolveDirective:Ab,resolveDynamicComponent:Eb,resolveFilter:Uy,resolveTransitionHooks:ti,setBlockTracking:el,setDevtoolsHook:Dy,setTransitionHooks:Dn,shallowReactive:Lc,shallowReadonly:xv,shallowRef:Nc,ssrContextKey:xf,ssrUtils:$y,stop:sv,toDisplayString:qp,toHandlerKey:qa,toHandlers:Lb,toRaw:Je,toRef:Rv,toRefs:Tv,toValue:kv,transformVNodeArgs:wy,triggerRef:wv,unref:rn,useAttrs:zb,useCssModule:hx,useCssVars:Jy,useHost:Eh,useId:sb,useModel:ey,useSSRContext:_f,useShadowRoot:fx,useSlots:Hb,useTemplateRef:nb,useTransitionState:Fc,vModelCheckbox:Qc,vModelDynamic:Nh,vModelRadio:Xc,vModelSelect:Oh,vModelText:br,vShow:kh,version:gh,warn:Ny,watch:is,watchEffect:Wv,watchPostEffect:Zv,watchSyncEffect:wf,withAsyncContext:Gb,withCtx:Dc,withDefaults:Bb,withDirectives:Gv,withKeys:Rx,withMemo:Ly,withModifiers:Ex,withScopeId:qv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const sl=Symbol(""),Bi=Symbol(""),ed=Symbol(""),xr=Symbol(""),zh=Symbol(""),Sa=Symbol(""),Vh=Symbol(""),jh=Symbol(""),td=Symbol(""),sd=Symbol(""),gl=Symbol(""),nd=Symbol(""),qh=Symbol(""),ad=Symbol(""),id=Symbol(""),ld=Symbol(""),rd=Symbol(""),od=Symbol(""),cd=Symbol(""),Gh=Symbol(""),Kh=Symbol(""),Xr=Symbol(""),_r=Symbol(""),dd=Symbol(""),ud=Symbol(""),nl=Symbol(""),vl=Symbol(""),pd=Symbol(""),rc=Symbol(""),Nx=Symbol(""),oc=Symbol(""),wr=Symbol(""),Mx=Symbol(""),Px=Symbol(""),fd=Symbol(""),Dx=Symbol(""),Fx=Symbol(""),hd=Symbol(""),Wh=Symbol(""),ii={[sl]:"Fragment",[Bi]:"Teleport",[ed]:"Suspense",[xr]:"KeepAlive",[zh]:"BaseTransition",[Sa]:"openBlock",[Vh]:"createBlock",[jh]:"createElementBlock",[td]:"createVNode",[sd]:"createElementVNode",[gl]:"createCommentVNode",[nd]:"createTextVNode",[qh]:"createStaticVNode",[ad]:"resolveComponent",[id]:"resolveDynamicComponent",[ld]:"resolveDirective",[rd]:"resolveFilter",[od]:"withDirectives",[cd]:"renderList",[Gh]:"renderSlot",[Kh]:"createSlots",[Xr]:"toDisplayString",[_r]:"mergeProps",[dd]:"normalizeClass",[ud]:"normalizeStyle",[nl]:"normalizeProps",[vl]:"guardReactiveProps",[pd]:"toHandlers",[rc]:"camelize",[Nx]:"capitalize",[oc]:"toHandlerKey",[wr]:"setBlockTracking",[Mx]:"pushScopeId",[Px]:"popScopeId",[fd]:"withCtx",[Dx]:"unref",[Fx]:"isRef",[hd]:"withMemo",[Wh]:"isMemoSame"};function $x(e){Object.getOwnPropertySymbols(e).forEach(t=>{ii[t]=e[t]})}const Ls={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ux(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ls}}function al(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=Ls){return e&&(r?(e.helper(Sa),e.helper(oi(e.inSSR,c))):e.helper(ri(e.inSSR,c)),l&&e.helper(od)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function xa(e,t=Ls){return{type:17,loc:t,elements:e}}function zs(e,t=Ls){return{type:15,loc:t,properties:e}}function Et(e,t){return{type:16,loc:Ls,key:$e(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Ls,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Zs(e,t=Ls){return{type:8,loc:t,children:e}}function Lt(e,t=[],s=Ls){return{type:14,loc:s,callee:e,arguments:t}}function li(e,t=void 0,s=!1,n=!1,a=Ls){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function cc(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Ls}}function Bx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Ls}}function Hx(e){return{type:21,body:e,loc:Ls}}function ri(e,t){return e||t?td:sd}function oi(e,t){return e||t?Vh:jh}function md(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ri(n,e.isComponent)),t(Sa),t(oi(n,e.isComponent)))}const ku=new Uint8Array([123,123]),Su=new Uint8Array([125,125]);function Cu(e){return e>=97&&e<=122||e>=65&&e<=90}function Cs(e){return e===32||e===10||e===9||e===12||e===13}function Hn(e){return e===47||e===62||Cs(e)}function kr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const jt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class zx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=ku,this.delimiterClose=Su,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=ku,this.delimiterClose=Su}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Hn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Cs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===jt.TitleEnd||this.currentSequence===jt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===jt.Cdata[this.sequenceIndex]?++this.sequenceIndex===jt.Cdata.length&&(this.state=28,this.currentSequence=jt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Cu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Hn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Hn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(kr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Cs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Cu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Cs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Cs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Cs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Hn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Hn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Hn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Hn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Hn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Cs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Cs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Cs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=jt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===jt.ScriptEnd[3]?this.startSpecial(jt.ScriptEnd,4):t===jt.StyleEnd[3]?this.startSpecial(jt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===jt.TitleEnd[3]?this.startSpecial(jt.TitleEnd,4):t===jt.TextareaEnd[3]?this.startSpecial(jt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Tu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function _a(e,t){const s=Tu("MODE",t),n=Tu(e,t);return s===3?n===!0:n!==!1}function il(e,t,s,...n){return _a(e,t)}function gd(e){throw e}function Zh(e){}function ht(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ns=e=>e.type===4&&e.isStatic;function Jh(e){switch(e){case"Teleport":case"teleport":return Bi;case"Suspense":case"suspense":return ed;case"KeepAlive":case"keep-alive":return xr;case"BaseTransition":case"base-transition":return zh}}const Vx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,vd=e=>!Vx.test(e),Yh=/[A-Za-z_$\xA0-\uFFFF]/,jx=/[\.\?\w$\xA0-\uFFFF]/,qx=/\s+[.[]\s*|\s*[.[]\s+/g,Qh=e=>e.type===4?e.content:e.loc.source,Gx=e=>{const t=Qh(e).trim().replace(qx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Yh:jx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Xh=Gx,Kx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Wx=e=>Kx.test(Qh(e)),Zx=Wx;function Hs(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&($e(t)?a.name===t:t.test(a.name)))return a}}function eo(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Ja(i.arg,t))return i}}function Ja(e,t){return!!(e&&ns(e)&&e.content===t)}function Jx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Co(e){return e.type===5||e.type===2}function Eu(e){return e.type===7&&e.name==="pre"}function Yx(e){return e.type===7&&e.name==="slot"}function Sr(e){return e.type===1&&e.tagType===3}function Cr(e){return e.type===1&&e.tagType===2}const Qx=new Set([nl,vl]);function bd(e,t=[]){if(e&&!$e(e)&&e.type===14){const s=e.callee;if(!$e(s)&&Qx.has(s))return bd(e.arguments[0],t.concat(e))}return[e,t]}function Tr(e,t,s){if(e.type!==13&&Xx(e,t))return;let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!$e(a)&&a.type===14){const r=bd(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||$e(a))n=zs([t]);else if(a.type===14){const r=a.arguments[0];!$e(r)&&r.type===15?dc(t,r)||r.properties.unshift(t):a.callee===pd?n=Lt(s.helper(_r),[zs([t]),a]):a.arguments.unshift(zs([t])),!n&&(n=a)}else a.type===15?(dc(t,a)||a.properties.unshift(t),n=a):(n=Lt(s.helper(_r),[zs([t]),a]),l&&l.callee===vl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Xx(e,t){var s,n,a;if(t.key.type!==4||t.key.content!=="key")return!1;const i=e.arguments[2];if(i&&!$e(i)){const[l]=bd(i);if(l&&!$e(l)&&l.type===15&&dc(t,l))return!0}return(s=e.arguments)[2]||(s[2]="{}"),(n=e.arguments)[3]||(n[3]="undefined"),(a=e.arguments)[4]||(a[4]="undefined"),e.arguments[5]=t.value,!0}function dc(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function ll(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function e0(e){return e.type===14&&e.callee===hd?e.arguments[1].returns:e}const t0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function em(e){for(let t=0;t<e.length;t++)if(!Cs(e.charCodeAt(t)))return!1;return!0}function yd(e){return e.type===2&&em(e.content)||e.type===12&&yd(e.content)}function tm(e){return e.type===3||yd(e)}const sm={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:za,isPreTag:za,isIgnoreNewlineTag:za,isCustomElement:za,onError:gd,onWarn:Zh,comments:!1,prefixIdentifiers:!1};let Xe=sm,rl=null,Nn="",Gt=null,We=null,ps="",xn=-1,pa=-1,xd=0,Wn=!1,uc=null;const ft=[],xt=new zx(ft,{onerr:bn,ontext(e,t){$l(Ft(e,t),e,t)},ontextentity(e,t,s){$l(e,t,s)},oninterpolation(e,t){if(Wn)return $l(Ft(e,t),e,t);let s=e+xt.delimiterOpen.length,n=t-xt.delimiterClose.length;for(;Cs(Nn.charCodeAt(s));)s++;for(;Cs(Nn.charCodeAt(n-1));)n--;let a=Ft(s,n);a.includes("&")&&(a=Xe.decodeEntities(a,!1)),pc({type:5,content:Zl(a,!1,kt(s,n)),loc:kt(e,t)})},onopentagname(e,t){const s=Ft(e,t);Gt={type:1,tag:s,ns:Xe.getNamespace(s,ft[0],Xe.ns),tagType:0,props:[],children:[],loc:kt(e-1,t),codegenNode:void 0}},onopentagend(e){Ru(e)},onclosetag(e,t){const s=Ft(e,t);if(!Xe.isVoidTag(s)){let n=!1;for(let a=0;a<ft.length;a++)if(ft[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&bn(24,ft[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ft.shift();Wl(r,t,l<a)}break}n||bn(23,nm(e,60))}},onselfclosingtag(e){const t=Gt.tag;Gt.isSelfClosing=!0,Ru(e),ft[0]&&ft[0].tag===t&&Wl(ft.shift(),e)},onattribname(e,t){We={type:6,name:Ft(e,t),nameLoc:kt(e,t),value:void 0,loc:kt(e)}},ondirname(e,t){const s=Ft(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Wn&&n===""&&bn(26,e),Wn||n==="")We={type:6,name:s,nameLoc:kt(e,t),value:void 0,loc:kt(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:kt(e)},n==="pre"){Wn=xt.inVPre=!0,uc=Gt;const a=Gt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=u0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ft(e,t);if(Wn&&!Eu(We))We.name+=s,ga(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=Zl(n?s:s.slice(1,-1),n,kt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ft(e,t);if(Wn&&!Eu(We))We.name+="."+s,ga(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,ga(n.loc,t))}else{const n=Ve(s,!0,kt(e,t));We.modifiers.push(n)}},onattribdata(e,t){ps+=Ft(e,t),xn<0&&(xn=e),pa=t},onattribentity(e,t,s){ps+=e,xn<0&&(xn=t),pa=s},onattribnameend(e){const t=We.loc.start.offset,s=Ft(t,e);We.type===7&&(We.rawName=s),Gt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&bn(2,t)},onattribend(e,t){if(Gt&&We){if(ga(We.loc,t),e!==0)if(ps.includes("&")&&(ps=Xe.decodeEntities(ps,!0)),We.type===6)We.name==="class"&&(ps=im(ps).trim()),e===1&&!ps&&bn(13,t),We.value={type:2,content:ps,loc:e===1?kt(xn,pa):kt(xn-1,pa+1)},xt.inSFCRoot&&Gt.tag==="template"&&We.name==="lang"&&ps&&ps!=="html"&&xt.enterRCDATA(kr("</template"),0);else{let s=0;We.exp=Zl(ps,!1,kt(xn,pa),0,s),We.name==="for"&&(We.forParseResult=n0(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&il("COMPILER_V_BIND_SYNC",Xe,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&Gt.props.push(We)}ps="",xn=pa=-1},oncomment(e,t){Xe.comments&&pc({type:3,content:Ft(e,t),loc:kt(e-4,t+3)})},onend(){const e=Nn.length;for(let t=0;t<ft.length;t++)Wl(ft[t],e-1),bn(24,ft[t].loc.start.offset)},oncdata(e,t){(ft[0]?ft[0].ns:Xe.ns)!==0?$l(Ft(e,t),e,t):bn(1,e-9)},onprocessinginstruction(e){(ft[0]?ft[0].ns:Xe.ns)===0&&bn(21,e-1)}}),Au=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,s0=/^\(|\)$/g;function n0(e){const t=e.loc,s=e.content,n=s.match(t0);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const b=t.start.offset+p,g=b+u.length;return Zl(u,!1,kt(b,g),0,f?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(s0,"").trim();const c=a.indexOf(o),d=o.match(Au);if(d){o=o.replace(Au,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(r.index=l(f,s.indexOf(f,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ft(e,t){return Nn.slice(e,t)}function Ru(e){xt.inSFCRoot&&(Gt.innerLoc=kt(e+1,e+1)),pc(Gt);const{tag:t,ns:s}=Gt;s===0&&Xe.isPreTag(t)&&xd++,Xe.isVoidTag(t)?Wl(Gt,e):(ft.unshift(Gt),(s===1||s===2)&&(xt.inXML=!0)),Gt=null}function $l(e,t,s){{const i=ft[0]&&ft[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Xe.decodeEntities(e,!1))}const n=ft[0]||rl,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,ga(a.loc,s)):n.children.push({type:2,content:e,loc:kt(t,s)})}function Wl(e,t,s=!1){s?ga(e.loc,nm(t,60)):ga(e.loc,a0(t,62)+1),xt.inSFCRoot&&(e.children.length?e.innerLoc.end=je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=je({},e.innerLoc.start),e.innerLoc.source=Ft(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Wn||(n==="slot"?e.tagType=2:Iu(e)?e.tagType=3:l0(e)&&(e.tagType=1)),xt.inRCDATA||(e.children=am(i)),a===0&&Xe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Xe.isPreTag(n)&&xd--,uc===e&&(Wn=xt.inVPre=!1,uc=null),xt.inXML&&(ft[0]?ft[0].ns:Xe.ns)===0&&(xt.inXML=!1);{const l=e.props;if(!xt.inSFCRoot&&_a("COMPILER_NATIVE_TEMPLATE",Xe)&&e.tag==="template"&&!Iu(e)){const o=ft[0]||rl,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&il("COMPILER_INLINE_TEMPLATE",Xe,r.loc)&&e.children.length&&(r.value={type:2,content:Ft(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function a0(e,t){let s=e;for(;Nn.charCodeAt(s)!==t&&s<Nn.length-1;)s++;return s}function nm(e,t){let s=e;for(;Nn.charCodeAt(s)!==t&&s>=0;)s--;return s}const i0=new Set(["if","else","else-if","for","slot"]);function Iu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&i0.has(t[s].name))return!0}return!1}function l0({tag:e,props:t}){if(Xe.isCustomElement(e))return!1;if(e==="component"||r0(e.charCodeAt(0))||Jh(e)||Xe.isBuiltInComponent&&Xe.isBuiltInComponent(e)||Xe.isNativeTag&&!Xe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(il("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}}else if(n.name==="bind"&&Ja(n.arg,"is")&&il("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}return!1}function r0(e){return e>64&&e<91}const o0=/\r\n/g;function am(e){const t=Xe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(xd)a.content=a.content.replace(o0,`
`);else if(em(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&c0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=im(a.content))}return s?e.filter(Boolean):e}function c0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function im(e){let t="",s=!1;for(let n=0;n<e.length;n++)Cs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function pc(e){(ft[0]||rl).children.push(e)}function kt(e,t){return{start:xt.getPos(e),end:t==null?t:xt.getPos(t),source:t==null?t:Ft(e,t)}}function d0(e){return kt(e.start.offset,e.end.offset)}function ga(e,t){e.end=xt.getPos(t),e.source=Ft(e.start.offset,t)}function u0(e){const t={type:6,name:e.rawName,nameLoc:kt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Zl(e,t=!1,s,n=0,a=0){return Ve(e,t,s,n)}function bn(e,t,s){Xe.onError(ht(e,kt(t,t)))}function p0(){xt.reset(),Gt=null,We=null,ps="",xn=-1,pa=-1,ft.length=0}function f0(e,t){if(p0(),Nn=e,Xe=je({},sm),t){let a;for(a in t)t[a]!=null&&(Xe[a]=t[a])}xt.mode=Xe.parseMode==="html"?1:Xe.parseMode==="sfc"?2:0,xt.inXML=Xe.ns===1||Xe.ns===2;const s=t&&t.delimiters;s&&(xt.delimiterOpen=kr(s[0]),xt.delimiterClose=kr(s[1]));const n=rl=Ux([],e);return xt.parse(Nn),n.loc=kt(0,e.length),n.children=am(n.children),rl=null,n}function h0(e,t){Jl(e,void 0,t,!!lm(e))}function lm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Cr(t[0])?t[0]:null}function Jl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:Es(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const b=f.patchFlag;if((b===void 0||b===512||b===1)&&om(u,s)>=2){const g=cm(u);g&&(f.props=s.hoist(g))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:Es(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Jl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Jl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Jl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&xe(e.codegenNode.children))e.codegenNode.children=o(xa(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!xe(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(xa(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!xe(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Hs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(xa(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!xe(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Es(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=om(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=Es(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=Es(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(Sa),t.removeHelper(oi(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ri(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Es(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if($e(r)||Yt(r))continue;const o=Es(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const m0=new Set([dd,ud,nl,vl]);function rm(e,t){if(e.type===14&&!$e(e.callee)&&m0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Es(s,t);if(s.type===14)return rm(s,t)}return 0}function om(e,t){let s=3;const n=cm(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=Es(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=Es(r,t):r.type===14?c=rm(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function cm(e){const t=e.codegenNode;if(t.type===13)return t.props}function g0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ht,isCustomElement:d=Ht,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:b=!1,inSSR:g=!1,ssrCssVars:A="",bindingMetadata:L=Ke,inline:y=!1,isTS:m=!1,onError:x=gd,onWarn:w=Zh,compatConfig:v}){const _=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),S={filename:t,selfName:_&&Ea(rt(_[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:b,inSSR:g,ssrCssVars:A,bindingMetadata:L,inline:y,isTS:m,onError:x,onWarn:w,compatConfig:v,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(T){const M=S.helpers.get(T)||0;return S.helpers.set(T,M+1),T},removeHelper(T){const M=S.helpers.get(T);if(M){const B=M-1;B?S.helpers.set(T,B):S.helpers.delete(T)}},helperString(T){return`_${ii[S.helper(T)]}`},replaceNode(T){S.parent.children[S.childIndex]=S.currentNode=T},removeNode(T){const M=S.parent.children,B=T?M.indexOf(T):S.currentNode?S.childIndex:-1;!T||T===S.currentNode?(S.currentNode=null,S.onNodeRemoved()):S.childIndex>B&&(S.childIndex--,S.onNodeRemoved()),S.parent.children.splice(B,1)},onNodeRemoved:Ht,addIdentifiers(T){},removeIdentifiers(T){},hoist(T){$e(T)&&(T=Ve(T)),S.hoists.push(T);const M=Ve(`_hoisted_${S.hoists.length}`,!1,T.loc,2);return M.hoisted=T,M},cache(T,M=!1,B=!1){const U=Bx(S.cached.length,T,M,B);return S.cached.push(U),U}};return S.filters=new Set,S}function v0(e,t){const s=g0(e,t);to(e,s),t.hoistStatic&&h0(e,s),t.ssr||b0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function b0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=lm(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&md(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=al(t,s(sl),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function y0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];$e(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,to(a,t))}}function to(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(xe(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(gl);break;case 5:t.ssr||t.helper(Xr);break;case 9:for(let i=0;i<e.branches.length;i++)to(e.branches[i],t);break;case 10:case 11:case 1:case 0:y0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function dm(e,t){const s=$e(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Yx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const so="/*@__PURE__*/",um=e=>`${ii[e]}: _${ii[e]}`;function x0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${ii[g]}`},push(g,A=-2,L){f.code+=g},indent(){b(++f.indentLevel)},deindent(g=!1){g?--f.indentLevel:b(--f.indentLevel)},newline(){b(f.indentLevel)}};function b(g){f.push(`
`+"  ".repeat(g),0)}return f}function _0(e,t={}){const s=x0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";w0(e,s);const g=d?"ssrRender":"render",L=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${L}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(um).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(To(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(To(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),To(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Zt(e.codegenNode,s):a("null"),f&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function w0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[td,sd,gl,nd,qh].filter(p=>d.includes(p)).map(um).join(", ");a(`const { ${u} } = _Vue
`,-1)}k0(e.hoists,t),i(),a("return ")}function To(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?rd:t==="component"?ad:ld);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${ll(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function k0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Zt(i,t),n())}t.pure=!1}function _d(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),bl(e,t,s),s&&t.deindent(),t.push("]")}function bl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];$e(r)?a(r,-3):xe(r)?_d(r,t):Zt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Zt(e,t){if($e(e)){t.push(e,-3);return}if(Yt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Zt(e.codegenNode,t);break;case 2:S0(e,t);break;case 4:pm(e,t);break;case 5:C0(e,t);break;case 12:Zt(e.codegenNode,t);break;case 8:fm(e,t);break;case 3:E0(e,t);break;case 13:A0(e,t);break;case 14:I0(e,t);break;case 15:O0(e,t);break;case 17:L0(e,t);break;case 18:N0(e,t);break;case 19:M0(e,t);break;case 20:P0(e,t);break;case 21:bl(e.body,t,!0,!1);break}}function S0(e,t){t.push(JSON.stringify(e.content),-3,e)}function pm(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function C0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(so),s(`${n(Xr)}(`),Zt(e.content,t),s(")")}function fm(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];$e(n)?t.push(n,-3):Zt(n,t)}}function T0(e,t){const{push:s}=t;if(e.type===8)s("["),fm(e,t),s("]");else if(e.isStatic){const n=vd(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function E0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(so),s(`${n(gl)}(${JSON.stringify(e.content)})`,-3,e)}function A0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let b;o&&(b=String(o)),d&&s(n(od)+"("),u&&s(`(${n(Sa)}(${p?"true":""}), `),a&&s(so);const g=u?oi(t.inSSR,f):ri(t.inSSR,f);s(n(g)+"(",-2,e),bl(R0([i,l,r,b,c]),t),s(")"),u&&s(")"),d&&(s(", "),Zt(d,t),s(")"))}function R0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function I0(e,t){const{push:s,helper:n,pure:a}=t,i=$e(e.callee)?e.callee:n(e.callee);a&&s(so),s(i+"(",-2,e),bl(e.arguments,t),s(")")}function O0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];T0(c,t),s(": "),Zt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function L0(e,t){_d(e.elements,t)}function N0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${ii[fd]}(`),s("(",-2,e),xe(i)?bl(i,t):i&&Zt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),xe(l)?_d(l,t):Zt(l,t)):r&&Zt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function M0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!vd(s.content);u&&l("("),pm(s,t),u&&l(")")}else l("("),Zt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Zt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Zt(a,t),d||t.indentLevel--,i&&o(!0)}function P0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(wr)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Zt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(wr)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const D0=dm(/^(?:if|else|else-if)$/,(e,t,s)=>F0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Lu(a,o,s);else{const c=$0(n.codegenNode);c.alternate=Lu(a,o+n.branches.length-1,s)}}}));function F0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ht(28,t.loc)),t.exp=Ve("true",!1,a)}if(t.name==="if"){const a=Ou(e,t),i={type:9,loc:d0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&tm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ht(30,e.loc)),s.removeNode();const r=Ou(e,t);l.branches.push(r);const o=n&&n(l,r,!1);to(r,s),o&&o(),s.currentNode=null}else s.onError(ht(30,e.loc));break}}}function Ou(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Hs(e,"for")?e.children:[e],userKey:eo(e,"key"),isTemplateIf:s}}function Lu(e,t,s){return e.condition?cc(e.condition,Nu(e,t,s),Lt(s.helper(gl),['""',"true"])):Nu(e,t,s)}function Nu(e,t,s){const{helper:n}=s,a=Et("key",Ve(`${t}`,!1,Ls,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Tr(o,a,s),o}else return al(s,n(sl),zs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=e0(o);return c.type===13&&md(c,s),Tr(c,a,s),o}}function $0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const U0=dm("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return B0(e,t,s,i=>{const l=Lt(n(cd),[i.source]),r=Sr(e),o=Hs(e,"memo"),c=eo(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Et("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=al(s,n(sl),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{var b;let g;const{children:A}=i,L=A.length!==1||A[0].type!==1,y=Cr(e)?e:r&&e.children.length===1&&Cr(e.children[0])?e.children[0]:null;if(y)g=y.codegenNode,r&&u&&Tr(g,u,s);else if(L)g=al(s,n(sl),u?zs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1);else{g=A[0].codegenNode,r&&u&&Tr(g,u,s);const m=!p||g.isBlockRequired===!0;g.isBlock!==m&&(g.isBlock?(a(Sa),a(oi(s.inSSR,g.isComponent))):a(ri(s.inSSR,g.isComponent))),g.isBlock=m,g.isBlock?(n(Sa),n(oi(s.inSSR,g.isComponent))):(n(ri(s.inSSR,g.isComponent)),g.needsPatch&&(g.patchFlag=((b=g.patchFlag)!=null?b:0)|512))}if(o){const m=li(fc(i.parseResult,[Ve("_cached")]));m.body=Hx([Zs(["const _memo = (",o.exp,")"]),Zs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Wh)}(_cached, _memo)) return _cached`]),Zs(["const _item = ",g]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(m,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(li(fc(i.parseResult),g,!0))}})});function B0(e,t,s,n){if(!t.exp){s.onError(ht(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ht(32,t.loc));return}hm(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Sr(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const f=n&&n(p);return()=>{r.vFor--,f&&f()}}function hm(e,t){e.finalized||(e.finalized=!0)}function fc({value:e,key:t,index:s},n=[]){return H0([e,t,s,...n])}function H0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ve("_".repeat(n+1),!1))}const Mu=Ve("undefined",!1),z0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Hs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},V0=(e,t,s,n)=>li(e,s,!1,!0,s.length?s[0].loc:n);function j0(e,t,s=V0){t.helper(fd);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=Hs(e,"slot",!0);if(o){const{arg:A,exp:L}=o;A&&!ns(A)&&(r=!0),i.push(Et(A||Ve("default",!0),s(L,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let A=0;A<n.length;A++){const L=n[A];let y;if(!Sr(L)||!(y=Hs(L,"slot",!0))){L.type!==3&&u.push(L);continue}if(o){t.onError(ht(37,y.loc));break}c=!0;const{children:m,loc:x}=L,{arg:w=Ve("default",!0),exp:v,loc:_}=y;let S;ns(w)?S=w?w.content:"default":r=!0;const T=Hs(L,"for"),M=s(v,T,m,x);let B,U;if(B=Hs(L,"if"))r=!0,l.push(cc(B.exp,Ul(w,M,f++),Mu));else if(U=Hs(L,/^else(?:-if)?$/,!0)){let O=A,H;for(;O--&&(H=n[O],!!tm(H)););if(H&&Sr(H)&&Hs(H,/^(?:else-)?if$/)){let J=l[l.length-1];for(;J.alternate.type===19;)J=J.alternate;J.alternate=U.exp?cc(U.exp,Ul(w,M,f++),Mu):Ul(w,M,f++)}else t.onError(ht(30,U.loc))}else if(T){r=!0;const O=T.forParseResult;O?(hm(O),l.push(Lt(t.helper(cd),[O.source,li(fc(O),Ul(w,M),!0)]))):t.onError(ht(32,T.loc))}else{if(S){if(p.has(S)){t.onError(ht(38,_));continue}p.add(S),S==="default"&&(d=!0)}i.push(Et(w,M))}}if(!o){const A=(L,y)=>{const m=s(L,void 0,y,a);return t.compatConfig&&(m.isNonScopedSlot=!0),Et("default",m)};c?u.length&&!u.every(yd)&&(d?t.onError(ht(39,u[0].loc)):i.push(A(void 0,u))):i.push(A(void 0,n))}const b=r?2:Yl(e.children)?3:1;let g=zs(i.concat(Et("_",Ve(b+"",!1))),a);return l.length&&(g=Lt(t.helper(Kh),[g,xa(l)])),{slots:g,hasDynamicSlots:r}}function Ul(e,t,s){const n=[Et("name",e),Et("fn",t)];return s!=null&&n.push(Et("key",Ve(String(s),!0))),zs(n)}function Yl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Yl(s.children))return!0;break;case 9:if(Yl(s.branches))return!0;break;case 10:case 11:if(Yl(s.children))return!0;break}}return!1}const mm=new WeakMap,q0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?G0(e,t):`"${n}"`;const r=et(l)&&l.callee===id;let o,c,d=0,u,p,f,b=!1,g=!1,A=r||l===Bi||l===ed||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const y=gm(e,t,void 0,i,r);o=y.props,d=y.patchFlag,p=y.dynamicPropNames,b=y.needsPatch,g=y.isBlockRequired;const m=y.directives;f=m&&m.length?xa(m.map(x=>W0(x,t))):void 0,y.shouldUseBlock&&(A=!0)}if(e.children.length>0)if(l===xr&&(A=!0,d|=1024),i&&l!==Bi&&l!==xr){const{slots:m,hasDynamicSlots:x}=j0(e,t);c=m,x&&(d|=1024)}else if(e.children.length===1&&l!==Bi){const m=e.children[0],x=m.type,w=x===5||x===8;w&&Es(m,t)===0&&(d|=1),w||x===2?c=m:c=e.children}else c=e.children;p&&p.length&&(u=Z0(p));const L=e.codegenNode=al(t,l,o,c,d===0?void 0:d,u,f,!!A,!1,i,e.loc);b=b&&(d===0||d===32),b&&(L.needsPatch=!0),g&&(L.isBlockRequired=!0)};function G0(e,t,s=!1){let{tag:n}=e;const a=hc(n),i=eo(e,"is",!1,!0);if(i)if(a||_a("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ve(i.value.content,!0):(r=i.exp,r||(r=Ve("is",!1,i.arg.loc))),r)return Lt(t.helper(id),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Jh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(ad),t.components.add(n),ll(n,"component"))}function gm(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let f=!1,b=!1,g=0,A=!1,L=!1,y=!1,m=!1,x=!1,w=!1;const v=[],_=U=>{c.length&&(d.push(zs(Pu(c),r)),c=[]),U&&d.push(U)},S=()=>{t.scopes.vFor>0&&c.push(Et(Ve("ref_for",!0),Ve("true")))},T=({key:U,value:O})=>{if(ns(U)){const H=U.content,J=Ta(H);if(J&&(!n||a)&&H.toLowerCase()!=="onclick"&&H!=="onUpdate:modelValue"&&!Rn(H)&&(m=!0),J&&Rn(H)&&(w=!0),H==="ref"&&(A=!0),J&&O.type===14&&(O=O.arguments[0]),O.type===20||(O.type===4||O.type===8)&&Es(O,t)>0)return;H==="class"?L=!0:H==="style"?y=!0:H!=="ref"&&H!=="key"&&!v.includes(H)&&v.push(H),n&&(H==="class"||H==="style")&&!v.includes(H)&&v.push(H)}else x=!0};for(let U=0;U<s.length;U++){const O=s[U];if(O.type===6){const{loc:H,name:J,nameLoc:D,value:I}=O;let N=!0;if(J==="ref"&&(A=!0,S()),J==="is"&&(hc(l)||I&&I.content.startsWith("vue:")||_a("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Et(Ve(J,!0,D),Ve(I?I.content:"",N,I?I.loc:H)))}else{const{name:H,arg:J,exp:D,loc:I,modifiers:N}=O,Y=H==="bind",he=H==="on";if(H==="slot"){n||t.onError(ht(40,I));continue}if(H==="once"||H==="memo"||H==="is"||Y&&Ja(J,"is")&&(hc(l)||_a("COMPILER_IS_ON_ELEMENT",t))||he&&i)continue;if(Y&&Ja(J,"key")&&(f=!0),he&&p&&J&&ns(J)&&rt(J.content)==="vue:beforeUpdate"&&(f=!0,b=!0),Y&&Ja(J,"ref")&&S(),!J&&(Y||he)){if(x=!0,D)if(Y){if(_(),_a("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(D);continue}S(),_(),d.push(D)}else _({type:14,loc:I,callee:t.helper(pd),arguments:n?[D]:[D,"true"]});else t.onError(ht(Y?34:35,I));continue}Y&&N.some(ae=>ae.content==="prop")&&(g|=32);const Oe=t.directiveTransforms[H];if(Oe){const{props:ae,needRuntime:be}=Oe(O,e,t);!i&&ae.forEach(T),he&&J&&!ns(J)?_(zs(ae,r)):c.push(...ae),be&&(u.push(O),Yt(be)&&mm.set(O,be))}else Ig(H)||(u.push(O),p&&(f=!0,b=!0))}}let M;d.length?(_(),d.length>1?M=Lt(t.helper(_r),d,r):M=d[0]):c.length&&(M=zs(Pu(c),r)),x?g|=16:(L&&!n&&(g|=2),y&&!n&&(g|=4),v.length&&(g|=8),m&&(g|=32));const B=(g===0||g===32)&&(A||w||u.length>0);if(!f&&B&&(g|=512),!t.inSSR&&M)switch(M.type){case 15:let U=-1,O=-1,H=!1;for(let I=0;I<M.properties.length;I++){const N=M.properties[I].key;ns(N)?N.content==="class"?U=I:N.content==="style"&&(O=I):N.isHandlerKey||(H=!0)}const J=M.properties[U],D=M.properties[O];H?M=Lt(t.helper(nl),[M]):(J&&!ns(J.value)&&(J.value=Lt(t.helper(dd),[J.value])),D&&(y||D.value.type===4&&D.value.content.trim()[0]==="["||D.value.type===17)&&(D.value=Lt(t.helper(ud),[D.value])));break;case 14:break;default:M=Lt(t.helper(nl),[Lt(t.helper(vl),[M])]);break}return{props:M,directives:u,patchFlag:g,dynamicPropNames:v,shouldUseBlock:f,needsPatch:B,isBlockRequired:b}}function Pu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Ta(i))&&K0(l,a):(t.set(i,a),s.push(a))}return s}function K0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=xa([e.value,t.value],e.loc)}function W0(e,t){const s=[],n=mm.get(e);n?s.push(t.helperString(n)):(t.helper(ld),t.directives.add(e.name),s.push(ll(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,a);s.push(zs(e.modifiers.map(l=>Et(l,i)),a))}return xa(s,e.loc)}function Z0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function hc(e){return e==="component"||e==="Component"}const J0=(e,t)=>{if(Cr(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=Y0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=li([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Lt(t.helper(Gh),l,n)}};function Y0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=rt(l.name),a.push(l)));else if(l.name==="bind"&&Ja(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=rt(l.arg.content);s=l.exp=Ve(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ns(l.arg)&&(l.arg.content=rt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=gm(e,t,a,!1,!1);n=i,l.length&&t.onError(ht(36,l[0].loc))}return{slotName:s,slotProps:n}}const vm=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ht(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?qa(rt(u)):`on:${u}`;r=Ve(p,!0,l.loc)}else r=Zs([`${s.helperString(oc)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(oc)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Xh(o),p=!(u||Zx(o)),f=o.content.includes(";");(p||c&&u)&&(o=Zs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,o,f?"}":")"]))}let d={props:[Et(r,o||Ve("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Q0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=rt(i.content):i.content=`${s.helperString(rc)}(${i.content})`:(i.children.unshift(`${s.helperString(rc)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Du(i,"."),n.some(r=>r.content==="attr")&&Du(i,"^")),{props:[Et(i,l)]}},Du=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},X0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Co(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Co(o))n||(n=s[i]=Zs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Co(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&Es(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Lt(t.helper(nd),r)}}}}},Fu=new WeakSet,e_=(e,t)=>{if(e.type===1&&Hs(e,"once",!0))return Fu.has(e)||t.inVOnce||t.inSSR?void 0:(Fu.add(e),t.inVOnce=!0,t.helper(wr),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},bm=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ht(41,e.loc)),ki();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ht(44,n.loc)),ki();if(r==="literal-const"||r==="setup-const")return s.onError(ht(45,n.loc)),ki();if(!l.trim()||!Xh(n))return s.onError(ht(42,n.loc)),ki();const o=a||Ve("modelValue",!0),c=a?ns(a)?`onUpdate:${rt(a.content)}`:Zs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Zs([`${u} => ((`,n,") = $event)"]);const p=[Et(o,e.exp),Et(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(g=>g.content).map(g=>(vd(g)?g:JSON.stringify(g))+": true").join(", "),b=a?ns(a)?`${a.content}Modifiers`:Zs([a,' + "Modifiers"']):"modelModifiers";p.push(Et(b,Ve(`{ ${f} }`,!1,e.loc,2)))}return ki(p)};function ki(e=[]){return{props:e}}const t_=/[\w).+\-_$\]]/,s_=(e,t)=>{_a("COMPILER_FILTERS",t)&&(e.type===5?Er(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Er(s.exp,t)}))};function Er(e,t){if(e.type===4)$u(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?$u(n,t):n.type===8?Er(n,t):n.type===5&&Er(n.content,t))}}function $u(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,f,b,g=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!r&&!o&&!c)b===void 0?(d=f+1,b=s.slice(0,f).trim()):A();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let L=f-1,y;for(;L>=0&&(y=s.charAt(L),y===" ");L--);(!y||!t_.test(y))&&(l=!0)}}b===void 0?b=s.slice(0,f).trim():d!==0&&A();function A(){g.push(s.slice(d,f).trim()),d=f+1}if(g.length){for(f=0;f<g.length;f++)b=n_(b,g[f],t);e.content=b,e.ast=void 0}}function n_(e,t,s){s.helper(rd);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${ll(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${ll(a,"filter")}(${e}${i!==")"?","+i:i}`}}const Uu=new WeakSet,a_=(e,t)=>{if(e.type===1){const s=Hs(e,"memo");return!s||Uu.has(e)||t.inSSR?void 0:(Uu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&md(n,t),e.codegenNode=Lt(t.helper(hd),[s.exp,li(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},i_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ht(53,n.loc)),s.exp=Ve("",!0,n.loc);else{const a=rt(n.content);(Yh.test(a[0])||a[0]==="-")&&(s.exp=Ve(a,!1,n.loc))}}}};function l_(e){return[[i_,e_,D0,a_,U0,s_,J0,q0,z0,X0],{on:vm,bind:Q0,model:bm}]}function r_(e,t={}){const s=t.onError||gd,n=t.mode==="module";t.prefixIdentifiers===!0?s(ht(48)):n&&s(ht(49));const a=!1;t.cacheHandlers&&s(ht(50)),t.scopeId&&!n&&s(ht(51));const i=je({},t,{prefixIdentifiers:a}),l=$e(e)?f0(e,i):e,[r,o]=l_();return v0(l,je({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:je({},o,t.directiveTransforms||{})})),_0(l,i)}const o_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ym=Symbol(""),xm=Symbol(""),_m=Symbol(""),wm=Symbol(""),mc=Symbol(""),km=Symbol(""),Sm=Symbol(""),Cm=Symbol(""),Tm=Symbol(""),Em=Symbol("");$x({[ym]:"vModelRadio",[xm]:"vModelCheckbox",[_m]:"vModelText",[wm]:"vModelSelect",[mc]:"vModelDynamic",[km]:"withModifiers",[Sm]:"withKeys",[Cm]:"vShow",[Tm]:"Transition",[Em]:"TransitionGroup"});let Da;function c_(e,t=!1){return Da||(Da=document.createElement("div")),t?(Da.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Da.children[0].getAttribute("foo")):(Da.innerHTML=e,Da.textContent)}const d_={parseMode:"html",isVoidTag:Kg,isNativeTag:e=>jg(e)||qg(e)||Gg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:c_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Tm;if(e==="TransitionGroup"||e==="transition-group")return Em},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},u_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:p_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},p_=(e,t)=>{const s=zp(e);return Ve(JSON.stringify(s),!1,t,3)};function ea(e,t){return ht(e,t)}const f_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(ea(54,a)),t.children.length&&(s.onError(ea(55,a)),t.children.length=0),{props:[Et(Ve("innerHTML",!0,a),n||Ve("",!0))]}},h_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(ea(56,a)),t.children.length&&(s.onError(ea(57,a)),t.children.length=0),{props:[Et(Ve("textContent",!0),n?Es(n,s)>0?n:Lt(s.helperString(Xr),[n],a):Ve("",!0))]}},m_=(e,t,s)=>{const n=bm(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(ea(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=_m,r=!1;if(a==="input"||i){const o=eo(t,"type");if(o){if(o.type===7)l=mc;else if(o.value)switch(o.value.content){case"radio":l=ym;break;case"checkbox":l=xm;break;case"file":r=!0,s.onError(ea(60,e.loc));break}}else Jx(t)&&(l=mc)}else a==="select"&&(l=wm);r||(n.needRuntime=s.helper(l))}else s.onError(ea(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},g_=Rs("passive,once,capture"),v_=Rs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),b_=Rs("left,right"),Am=Rs("onkeyup,onkeydown,onkeypress"),y_=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&il("COMPILER_V_ON_NATIVE",s)||g_(o)?l.push(o):b_(o)?ns(e)?Am(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):v_(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Bu=(e,t)=>ns(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Zs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,x_=(e,t,s)=>vm(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=y_(i,a,s,e.loc);if(o.includes("right")&&(i=Bu(i,"onContextmenu")),o.includes("middle")&&(i=Bu(i,"onMouseup")),o.length&&(l=Lt(s.helper(km),[l,JSON.stringify(o)])),r.length&&(!ns(i)||Am(i.content.toLowerCase()))&&(l=Lt(s.helper(Sm),[l,JSON.stringify(r)])),c.length){const d=c.map(Ea).join("");i=ns(i)?Ve(`${i.content}${d}`,!0):Zs(["(",i,`) + "${d}"`])}return{props:[Et(i,l)]}}),__=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(ea(62,a)),{props:[],needRuntime:s.helper(Cm)}},w_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},k_=[u_],S_={cloak:o_,html:f_,text:h_,model:m_,on:x_,show:__};function C_(e,t={}){return r_(e,je({},d_,t,{nodeTransforms:[w_,...k_,...t.nodeTransforms||[]],directiveTransforms:je({},S_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Hu=Object.create(null);function T_(e,t){if(!$e(e))if(e.nodeType)e=e.innerHTML;else return Ht;const s=Ng(e,t),n=Hu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=je({hoistStatic:!0,onError:void 0,onWarn:Ht},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=C_(e,a),l=new Function("Vue",i)(Lx);return l._rc=!0,Hu[s]=l}ph(T_);const Ar=sa({items:[]});let E_=1;function no(e,t="info",s=3e3){const n=E_++;return Ar.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>wd(n),s),n}function wd(e){const t=Ar.items.findIndex(s=>s.id===e);t>=0&&Ar.items.splice(t,1)}function Ie(e,t="info",s=3e3){return no(e,t,s)}Ie.success=(e,t=3e3)=>no(e,"success",t);Ie.error=(e,t=5e3)=>no(e,"error",t);Ie.info=(e,t=3e3)=>no(e,"info",t);Ie.dismiss=wd;const A_={setup(){return{state:Ar,dismiss:wd}},template:`
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
  `},kn=sa({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ya=null;function Jt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ya&&Ya(!1),kn.title=e,kn.message=t,kn.confirmLabel=s,kn.cancelLabel=n,kn.danger=a,kn.open=!0,new Promise(i=>{Ya=i})}function zu(e){kn.open=!1,Ya&&(Ya(e),Ya=null)}const R_={setup(){function e(t){kn.open&&t.key==="Escape"&&(t.stopPropagation(),zu(!1))}return Ze(()=>document.addEventListener("keydown",e,!0)),_t(()=>document.removeEventListener("keydown",e,!0)),{state:kn,settle:zu}},template:`
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
 */const Ba=typeof document<"u";function Rm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function I_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Rm(e.default)}const at=Object.assign;function Eo(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ys(a)?a.map(e):e(a)}return s}const Hi=()=>{},Ys=Array.isArray;function Vu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Im=/#/g,O_=/&/g,L_=/\//g,N_=/=/g,M_=/\?/g,Om=/\+/g,P_=/%5B/g,D_=/%5D/g,Lm=/%5E/g,F_=/%60/g,Nm=/%7B/g,$_=/%7C/g,Mm=/%7D/g,U_=/%20/g;function kd(e){return e==null?"":encodeURI(""+e).replace($_,"|").replace(P_,"[").replace(D_,"]")}function B_(e){return kd(e).replace(Nm,"{").replace(Mm,"}").replace(Lm,"^")}function gc(e){return kd(e).replace(Om,"%2B").replace(U_,"+").replace(Im,"%23").replace(O_,"%26").replace(F_,"`").replace(Nm,"{").replace(Mm,"}").replace(Lm,"^")}function H_(e){return gc(e).replace(N_,"%3D")}function z_(e){return kd(e).replace(Im,"%23").replace(M_,"%3F")}function V_(e){return z_(e).replace(L_,"%2F")}function ol(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const j_=/\/$/,q_=e=>e.replace(j_,"");function Ao(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=Z_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ol(l)}}function G_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ju(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function K_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ci(t.matched[n],s.matched[a])&&Pm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ci(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Pm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!W_(e[s],t[s]))return!1;return!0}function W_(e,t){return Ys(e)?qu(e,t):Ys(t)?qu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function qu(e,t){return Ys(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function Z_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const zn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let vc=(function(e){return e.pop="pop",e.push="push",e})({}),Ro=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function J_(e){if(!e)if(Ba){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),q_(e)}const Y_=/^[^#]+#/;function Q_(e,t){return e.replace(Y_,"#")+t}function X_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const ao=()=>({left:window.scrollX,top:window.scrollY});function ew(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=X_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Gu(e,t){return(history.state?history.state.position-t:-1)+e}const bc=new Map;function tw(e,t){bc.set(e,t)}function sw(e){const t=bc.get(e);return bc.delete(e),t}function nw(e){return typeof e=="string"||e&&typeof e=="object"}function Dm(e){return typeof e=="string"||typeof e=="symbol"}let yt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Fm=Symbol("");yt.MATCHER_NOT_FOUND+"",yt.NAVIGATION_GUARD_REDIRECT+"",yt.NAVIGATION_ABORTED+"",yt.NAVIGATION_CANCELLED+"",yt.NAVIGATION_DUPLICATED+"";function di(e,t){return at(new Error,{type:e,[Fm]:!0},t)}function yn(e,t){return e instanceof Error&&Fm in e&&(t==null||!!(e.type&t))}const aw=["params","query","hash"];function iw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of aw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function lw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Om," "),i=a.indexOf("="),l=ol(i<0?a:a.slice(0,i)),r=i<0?null:ol(a.slice(i+1));if(l in t){let o=t[l];Ys(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function Ku(e){let t="";for(let s in e){const n=e[s];if(s=H_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ys(n)?n.map(a=>a&&gc(a)):[n&&gc(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function rw(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ys(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const ow=Symbol(""),Wu=Symbol(""),io=Symbol(""),Sd=Symbol(""),yc=Symbol("");function Si(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Zn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(di(yt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):nw(p)?o(di(yt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function Io(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Rm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Zn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=I_(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Zn(p,s,n,l,r,a)()}))}}return i}function cw(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>ci(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>ci(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let dw=()=>location.protocol+"//"+location.host;function $m(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),ju(r,"")}return ju(s,e)+n+a}function uw(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const f=$m(e,location),b=s.value,g=t.value;let A=0;if(p){if(s.value=f,t.value=p,l&&l===b){l=null;return}A=g?p.position-g.position:0}else n(f);a.forEach(L=>{L(s.value,b,{delta:A,type:vc.pop,direction:A?A>0?Ro.forward:Ro.back:Ro.unknown})})};function o(){l=s.value}function c(p){a.push(p);const f=()=>{const b=a.indexOf(p);b>-1&&a.splice(b,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(at({},p.state,{scroll:ao()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function Zu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?ao():null}}function pw(e){const{history:t,location:s}=window,n={value:$m(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:dw()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(o,c){i(o,at({},t.state,Zu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=at({},a.value,t.state,{forward:o,scroll:ao()});i(d.current,d,!0),i(o,at({},Zu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function fw(e){e=J_(e);const t=pw(e),s=uw(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=at({location:"",base:e,go:n,createHref:Q_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function hw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),fw(e)}let va=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var It=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(It||{});const mw={type:va.Static,value:""},gw=/[a-zA-Z0-9_]/;function vw(e){if(!e)return[[]];if(e==="/")return[[mw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=It.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===It.Static?i.push({type:va.Static,value:c}):s===It.Param||s===It.ParamRegExp||s===It.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:va.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==It.ParamRegExp){n=s,s=It.EscapeNext;continue}switch(s){case It.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=It.Param):p();break;case It.EscapeNext:p(),s=n;break;case It.Param:o==="("?s=It.ParamRegExp:gw.test(o)?p():(u(),s=It.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case It.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=It.ParamRegExpEnd:d+=o;break;case It.ParamRegExpEnd:u(),s=It.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===It.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Ju="[^/]+?",bw={sensitive:!1,strict:!1,start:!0,end:!0};var ts=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ts||{});const yw=/[.+*?^${}()[\]/\\]/g;function xw(e,t){const s=at({},bw,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ts.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ts.Segment+(s.sensitive?ts.BonusCaseSensitive:0);if(p.type===va.Static)u||(a+="/"),a+=p.value.replace(yw,"\\$&"),f+=ts.Static;else if(p.type===va.Param){const{value:b,repeatable:g,optional:A,regexp:L}=p;i.push({name:b,repeatable:g,optional:A});const y=L||Ju;if(y!==Ju){f+=ts.BonusCustomRegExp;try{`${y}`}catch(x){throw new Error(`Invalid custom RegExp for param "${b}" (${y}): `+x.message)}}let m=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(m=A&&c.length<2?`(?:/${m})`:"/"+m),A&&(m+="?"),a+=m,f+=ts.Dynamic,A&&(f+=ts.BonusOptional),g&&(f+=ts.BonusRepeatable),y===".*"&&(f+=ts.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ts.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",b=i[p-1];u[b.name]=f&&b.repeatable?f.split("/"):f}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===va.Static)d+=f.value;else if(f.type===va.Param){const{value:b,repeatable:g,optional:A}=f,L=b in c?c[b]:"";if(Ys(L)&&!g)throw new Error(`Provided param "${b}" is an array but it is not repeatable (* or + modifiers)`);const y=Ys(L)?L.join("/"):L;if(!y)if(A)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${b}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function _w(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ts.Static+ts.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ts.Static+ts.Segment?1:-1:0}function Um(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=_w(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Yu(n))return 1;if(Yu(a))return-1}return a.length-n.length}function Yu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const ww={strict:!1,end:!0,sensitive:!1};function kw(e,t,s){const n=xw(vw(e.path),s),a=at(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function Sw(e,t){const s=[],n=new Map;t=Vu(ww,t);function a(u){return n.get(u)}function i(u,p,f){const b=!f,g=Xu(u);g.aliasOf=f&&f.record;const A=Vu(t,u),L=[g];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const w of x)L.push(Xu(at({},g,{components:f?f.record.components:g.components,path:w,aliasOf:f?f.record:g})))}let y,m;for(const x of L){const{path:w}=x;if(p&&w[0]!=="/"){const v=p.record.path,_=v[v.length-1]==="/"?"":"/";x.path=p.record.path+(w&&_+w)}if(y=kw(x,p,A),f?f.alias.push(y):(m=m||y,m!==y&&m.alias.push(y),b&&u.name&&!ep(y)&&l(u.name)),Bm(y)&&o(y),g.children){const v=g.children;for(let _=0;_<v.length;_++)i(v[_],y,f&&f.children[_])}f=f||y}return m?()=>{l(m)}:Hi}function l(u){if(Dm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=Ew(u,s);s.splice(p,0,u),u.record.name&&!ep(u)&&n.set(u.record.name,u)}function c(u,p){let f,b={},g,A;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw di(yt.MATCHER_NOT_FOUND,{location:u});A=f.record.name,b=at(Qu(p.params,f.keys.filter(m=>!m.optional).concat(f.parent?f.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&Qu(u.params,f.keys.map(m=>m.name))),g=f.stringify(b)}else if(u.path!=null)g=u.path,f=s.find(m=>m.re.test(g)),f&&(b=f.parse(g),A=f.record.name);else{if(f=p.name?n.get(p.name):s.find(m=>m.re.test(p.path)),!f)throw di(yt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});A=f.record.name,b=at({},p.params,u.params),g=f.stringify(b)}const L=[];let y=f;for(;y;)L.unshift(y.record),y=y.parent;return{name:A,path:g,params:b,matched:L,meta:Tw(L)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Qu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Xu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Cw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Cw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function ep(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Tw(e){return e.reduce((t,s)=>at(t,s.meta),{})}function Ew(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Um(e,t[i])<0?n=i:s=i+1}const a=Aw(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function Aw(e){let t=e;for(;t=t.parent;)if(Bm(t)&&Um(e,t)===0)return t}function Bm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function tp(e){const t=Vs(io),s=Vs(Sd),n=W(()=>{const o=rn(e.to);return t.resolve(o)}),a=W(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ci.bind(null,d));if(p>-1)return p;const f=sp(o[c-2]);return c>1&&sp(d)===f&&u[u.length-1].path!==f?u.findIndex(ci.bind(null,o[c-2])):p}),i=W(()=>a.value>-1&&Nw(s.params,n.value.params)),l=W(()=>a.value>-1&&a.value===s.matched.length-1&&Pm(s.params,n.value.params));function r(o={}){if(Lw(o)){const c=t[rn(e.replace)?"replace":"push"](rn(e.to)).catch(Hi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:W(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function Rw(e){return e.length===1?e[0]:e}const Iw=fl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:tp,setup(e,{slots:t}){const s=sa(tp(e)),{options:n}=Vs(io),a=W(()=>({[np(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[np(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Rw(t.default(s));return e.custom?i:si("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),Ow=Iw;function Lw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Nw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ys(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function sp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const np=(e,t,s)=>e??t??s,Mw=fl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Vs(yc),a=W(()=>e.route||n.value),i=Vs(Wu,0),l=W(()=>{let c=rn(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=W(()=>a.value.matched[l.value]);Fi(Wu,W(()=>l.value+1)),Fi(ow,r),Fi(yc,a);const o=h();return is(()=>[o.value,r.value,e.name],([c,d,u],[p,f,b])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!ci(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return ap(s.default,{Component:p,route:c});const f=u.props[d],b=f?f===!0?c.params:typeof f=="function"?f(c):f:null,A=si(p,at({},b,t,{onVnodeUnmounted:L=>{L.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return ap(s.default,{Component:A,route:c})||A}}});function ap(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Pw=Mw;function Dw(e){const t=Sw(e.routes,e),s=e.parseQuery||lw,n=e.stringifyQuery||Ku,a=e.history,i=Si(),l=Si(),r=Si(),o=Nc(zn);let c=zn;Ba&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Eo.bind(null,$=>""+$),u=Eo.bind(null,V_),p=Eo.bind(null,ol);function f($,re){let oe,_e;return Dm($)?(oe=t.getRecordMatcher($),_e=re):_e=$,t.addRoute(_e,oe)}function b($){const re=t.getRecordMatcher($);re&&t.removeRoute(re)}function g(){return t.getRoutes().map($=>$.record)}function A($){return!!t.getRecordMatcher($)}function L($,re){if(re=at({},re||o.value),typeof $=="string"){const R=Ao(s,$,re.path),z=t.resolve({path:R.path},re),Q=a.createHref(R.fullPath);return at(R,z,{params:p(z.params),hash:ol(R.hash),redirectedFrom:void 0,href:Q})}let oe;if($.path!=null)oe=at({},$,{path:Ao(s,$.path,re.path).path});else{const R=at({},$.params);for(const z in R)R[z]==null&&delete R[z];oe=at({},$,{params:u(R)}),re.params=u(re.params)}const _e=t.resolve(oe,re),Ne=$.hash||"";_e.params=d(p(_e.params));const He=G_(n,at({},$,{hash:B_(Ne),path:_e.path})),k=a.createHref(He);return at({fullPath:He,hash:Ne,query:n===Ku?rw($.query):$.query||{}},_e,{redirectedFrom:void 0,href:k})}function y($){return typeof $=="string"?Ao(s,$,o.value.path):at({},$)}function m($,re){if(c!==$)return di(yt.NAVIGATION_CANCELLED,{from:re,to:$})}function x($){return _($)}function w($){return x(at(y($),{replace:!0}))}function v($,re){const oe=$.matched[$.matched.length-1];if(oe&&oe.redirect){const{redirect:_e}=oe;let Ne=typeof _e=="function"?_e($,re):_e;return typeof Ne=="string"&&(Ne=Ne.includes("?")||Ne.includes("#")?Ne=y(Ne):{path:Ne},Ne.params={}),at({query:$.query,hash:$.hash,params:Ne.path!=null?{}:$.params},Ne)}}function _($,re){const oe=c=L($),_e=o.value,Ne=$.state,He=$.force,k=$.replace===!0,R=v(oe,_e);if(R)return _(at(y(R),{state:typeof R=="object"?at({},Ne,R.state):Ne,force:He,replace:k}),re||oe);const z=oe;z.redirectedFrom=re;let Q;return!He&&K_(n,_e,oe)&&(Q=di(yt.NAVIGATION_DUPLICATED,{to:z,from:_e}),Oe(_e,_e,!0,!1)),(Q?Promise.resolve(Q):M(z,_e)).catch(te=>yn(te)?yn(te,yt.NAVIGATION_GUARD_REDIRECT)?te:he(te):N(te,z,_e)).then(te=>{if(te){if(yn(te,yt.NAVIGATION_GUARD_REDIRECT))return _(at({replace:k},y(te.to),{state:typeof te.to=="object"?at({},Ne,te.to.state):Ne,force:He}),re||z)}else te=U(z,_e,!0,k,Ne);return B(z,_e,te),te})}function S($,re){const oe=m($,re);return oe?Promise.reject(oe):Promise.resolve()}function T($){const re=ee.values().next().value;return re&&typeof re.runWithContext=="function"?re.runWithContext($):$()}function M($,re){let oe;const[_e,Ne,He]=cw($,re);oe=Io(_e.reverse(),"beforeRouteLeave",$,re);for(const R of _e)R.leaveGuards.forEach(z=>{oe.push(Zn(z,$,re))});const k=S.bind(null,$,re);return oe.push(k),X(oe).then(()=>{oe=[];for(const R of i.list())oe.push(Zn(R,$,re));return oe.push(k),X(oe)}).then(()=>{oe=Io(Ne,"beforeRouteUpdate",$,re);for(const R of Ne)R.updateGuards.forEach(z=>{oe.push(Zn(z,$,re))});return oe.push(k),X(oe)}).then(()=>{oe=[];for(const R of He)if(R.beforeEnter)if(Ys(R.beforeEnter))for(const z of R.beforeEnter)oe.push(Zn(z,$,re));else oe.push(Zn(R.beforeEnter,$,re));return oe.push(k),X(oe)}).then(()=>($.matched.forEach(R=>R.enterCallbacks={}),oe=Io(He,"beforeRouteEnter",$,re,T),oe.push(k),X(oe))).then(()=>{oe=[];for(const R of l.list())oe.push(Zn(R,$,re));return oe.push(k),X(oe)}).catch(R=>yn(R,yt.NAVIGATION_CANCELLED)?R:Promise.reject(R))}function B($,re,oe){r.list().forEach(_e=>T(()=>_e($,re,oe)))}function U($,re,oe,_e,Ne){const He=m($,re);if(He)return He;const k=re===zn,R=Ba?history.state:{};oe&&(_e||k?a.replace($.fullPath,at({scroll:k&&R&&R.scroll},Ne)):a.push($.fullPath,Ne)),o.value=$,Oe($,re,oe,k),he()}let O;function H(){O||(O=a.listen(($,re,oe)=>{if(!ve.listening)return;const _e=L($),Ne=v(_e,ve.currentRoute.value);if(Ne){_(at(Ne,{replace:!0,force:!0}),_e).catch(Hi);return}c=_e;const He=o.value;Ba&&tw(Gu(He.fullPath,oe.delta),ao()),M(_e,He).catch(k=>yn(k,yt.NAVIGATION_ABORTED|yt.NAVIGATION_CANCELLED)?k:yn(k,yt.NAVIGATION_GUARD_REDIRECT)?(_(at(y(k.to),{force:!0}),_e).then(R=>{yn(R,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&!oe.delta&&oe.type===vc.pop&&a.go(-1,!1)}).catch(Hi),Promise.reject()):(oe.delta&&a.go(-oe.delta,!1),N(k,_e,He))).then(k=>{k=k||U(_e,He,!1),k&&(oe.delta&&!yn(k,yt.NAVIGATION_CANCELLED)?a.go(-oe.delta,!1):oe.type===vc.pop&&yn(k,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(_e,He,k)}).catch(Hi)}))}let J=Si(),D=Si(),I;function N($,re,oe){he($);const _e=D.list();return _e.length?_e.forEach(Ne=>Ne($,re,oe)):console.error($),Promise.reject($)}function Y(){return I&&o.value!==zn?Promise.resolve():new Promise(($,re)=>{J.add([$,re])})}function he($){return I||(I=!$,H(),J.list().forEach(([re,oe])=>$?oe($):re()),J.reset()),$}function Oe($,re,oe,_e){const{scrollBehavior:Ne}=e;if(!Ba||!Ne)return Promise.resolve();const He=!oe&&sw(Gu($.fullPath,0))||(_e||!oe)&&history.state&&history.state.scroll||null;return Tt().then(()=>Ne($,re,He)).then(k=>k&&ew(k)).catch(k=>N(k,$,re))}const ae=$=>a.go($);let be;const ee=new Set,ve={currentRoute:o,listening:!0,addRoute:f,removeRoute:b,clearRoutes:t.clearRoutes,hasRoute:A,getRoutes:g,resolve:L,options:e,push:x,replace:w,go:ae,back:()=>ae(-1),forward:()=>ae(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:D.add,isReady:Y,install($){$.component("RouterLink",Ow),$.component("RouterView",Pw),$.config.globalProperties.$router=ve,Object.defineProperty($.config.globalProperties,"$route",{enumerable:!0,get:()=>rn(o)}),Ba&&!be&&o.value===zn&&(be=!0,x(a.location).catch(_e=>{}));const re={};for(const _e in zn)Object.defineProperty(re,_e,{get:()=>o.value[_e],enumerable:!0});$.provide(io,ve),$.provide(Sd,Lc(re)),$.provide(yc,o);const oe=$.unmount;ee.add($),$.unmount=function(){ee.delete($),ee.size<1&&(c=zn,O&&O(),O=null,o.value=zn,be=!1,I=!1),oe()}}};function X($){return $.reduce((re,oe)=>re.then(()=>T(oe)),Promise.resolve())}return ve}function Hm(){return Vs(io)}function Fw(e){return Vs(Sd)}const lo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Fw(),s=Hm(),n=W({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=W(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=W(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});is(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},$w={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var g,A,L,y,m;const f=p.payload||p,b=f.type||p.type;if(b==="tool_start"){const x=((g=f.metadata)==null?void 0:g.call_id)||null,w={callId:x,id:x||`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((A=f.metadata)==null?void 0:A.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(w);return}if(b==="tool_end"){const x=((L=f.metadata)==null?void 0:L.call_id)||null;let w=-1;if(x&&(w=e.value.findIndex(v=>v.callId===x&&v.status==="running")),w<0&&!x)for(let v=e.value.length-1;v>=0;v--){const _=e.value[v];if(_.tool===f.action&&_.status==="running"){w=v;break}}if(w>=0){const v=e.value[w];v.status=(y=f.metadata)!=null&&y.error?"error":"success",v.elapsed=((m=f.metadata)==null?void 0:m.elapsed_ms)||Date.now()-v.startTime,v.result=f.detail||"",v.fadingOut=!0,setTimeout(()=>{const _=e.value.indexOf(v);_>=0&&e.value.splice(_,1),t.value.unshift(v),t.value.length>n&&t.value.pop()},5e3)}return}if(b==="tool_stream"){const x=f.call_id||f.tool_name||"unknown";if(f.finished){const w={...s.value};delete w[x],s.value=w}else{const v=((s.value[x]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[x]:v.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let r=!1;function o(){r||(r=!0,Ge.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ge.off("events",a),i&&(clearInterval(i),i=null))}Ze(o),Is(o),Os(c),_t(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Cd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ra(e){const t=Cd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function zm(e){const t=Cd(e);return t?t.toLocaleTimeString():"—"}function Vm(e){const t=Cd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Uw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ui(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Td(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function jm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function ip(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function qm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Gm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Km=Symbol("agent-detail-cancelled"),Bw=15e3;function Hw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((f,b)=>{o=f,c=b});function u(f,b){r||(r=!0,l!==null&&a(l),l=null,(f?o:c)(b))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return r||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Km),i==null||i.abort()}}}function Wm({state:e,requestDetail:t,timeoutMs:s=Bw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:f,coalesce:b}){if(!p)return Promise.resolve();if(b&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const g={agentId:p,cancel:null,promise:null};l=g,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const A=Hw(L=>t(p,{signal:L}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return g.cancel=A.cancel,g.promise=(async()=>{let L=null,y=null;try{L=await A.promise}catch(m){y=m}L!==Km&&(l!==g||e.detailId!==p||(l=null,!y&&(L===null||typeof L!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=L,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function zw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const Vw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=W(()=>e.value.filter(N=>N.status==="running").length),o=W(()=>e.value.filter(N=>N.status==="completed").length),c=W(()=>e.value.filter(N=>["failed","timeout","killed"].includes(N.status)).length),d=W(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=W(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(N=>["failed","timeout","killed"].includes(N.status)):e.value.filter(N=>N.status===i.value));function p(N){const Y=Number(N.max_iterations)||0;return Y<=0?0:Math.min(100,Math.round(N.iteration_count/Y*100))}function f(N){return(Number(N.max_iterations)||0)>0}function b(N,Y){return N?N==="N/A"?"N/A":Y==="current_inheritance"?`inherit (currently ${N})`:N:"unknown"}function g(N){return b(N.display_model,N.display_model_source||N.display_source)}function A(N){return b(N.display_reasoning_effort,N.display_reasoning_effort_source||N.display_source)}function L(N){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[N]||""}const y=h(null),m=h(null),x=h(!1),w=h(null),v=h(""),S=Wm({state:{get detail(){return y.value},set detail(N){y.value=N},get detailId(){return m.value},set detailId(N){m.value=N},get detailLoading(){return x.value},set detailLoading(N){x.value=N},get detailError(){return w.value},set detailError(N){w.value=N}},requestDetail:(N,{signal:Y})=>G.get(`/api/agents/${encodeURIComponent(N)}`,{signal:Y})});async function T(N){v.value="",await S.open(N.id)}function M(){S.close(),v.value=""}async function B(){await S.refresh()}async function U(N,Y){try{await navigator.clipboard.writeText(Y||""),v.value=N,setTimeout(()=>{v.value===N&&(v.value="")},1500)}catch{Ie.error("Copy failed")}}async function O(N=!1){N=N===!0,N||(t.value=!0);try{const Y=await G.get("/api/agents");e.value=Array.isArray(Y)?Y:[],s.value=null}catch(Y){N||(s.value=Y.message)}N||(t.value=!1)}async function H(N){const Y=e.value.find(Oe=>Oe.id===N);if(await Jt({title:"Kill agent",message:`Kill agent "${(Y==null?void 0:Y.label)||N}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=N;try{await G.del(`/api/agents/${encodeURIComponent(N)}`),Ie.success("Agent killed"),await O()}catch(Oe){Ie.error(Oe.message||"Failed to kill agent")}n.value=null}}const J=zw({isEnabled:()=>a.value&&l,refreshList:()=>O(!0),hasOpenDetail:()=>!!m.value,refreshDetail:B});function D(){J.start()}function I(){J.stop()}return is(a,()=>J.sync()),Ze(()=>{l=!0,O(),D()}),Is(()=>{l=!0,O(!0),D()}),Os(()=>{l=!1,I()}),_t(()=>{l=!1,I(),S.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Ra,formatDuration:ui,progressPercent:p,hasProgress:f,displayModelText:g,displayEffortText:A,displaySourceLabel:L,detail:y,detailId:m,detailLoading:x,detailError:w,copied:v,openDetail:T,closeDetail:M,copyText:U,fetchAgents:O,killAgent:H,startAutoRefresh:D,stopAutoRefresh:I}}},jw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let b=!1;const A=Wm({state:{get detail(){return c.value},set detail(I){c.value=I},get detailId(){return d.value},set detailId(I){d.value=I},get detailLoading(){return u.value},set detailLoading(I){u.value=I},get detailError(){return p.value},set detailError(I){p.value=I}},detailLabel:"Loop detail",requestDetail:(I,{signal:N})=>G.get(`/api/loops/${encodeURIComponent(I)}?limit=100`,{signal:N})});async function L(I){f.value="",await A.open(I.id)}function y(){A.close(),f.value=""}async function m(I,N){try{await navigator.clipboard.writeText(N||""),f.value=I,setTimeout(()=>{f.value===I&&(f.value="")},1500)}catch{Ie.error("Copy failed")}}const x=W(()=>e.value.reduce((I,N)=>I+(N.iteration_count||0),0)),w=W(()=>e.value.filter(I=>I.status==="running").length);function v(I){return I==="running"?"loop-status-running":I==="error"?"loop-status-error":"loop-status-stopped"}function _(I){return I==="running"?"badge-success":I==="error"?"badge-danger":I==="completed"?"badge-info":"badge-warning"}function S(I){return I==="act"?"badge-warning":I==="silent"?"badge-info":"badge-success"}async function T(I=!1){I=I===!0,I||(t.value=!0);try{const N=await G.get("/api/loops");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){I||(s.value=N.message)}I||(t.value=!1)}async function M(){l.value=null;const I=a.value;if(!I.goal.trim()){l.value="Goal is required";return}if(!I.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:I.goal.trim(),channel_id:I.channel_id.trim(),interval_seconds:I.interval_seconds||60,mode:I.mode,max_iterations:I.max_iterations||50};I.stop_condition.trim()&&(N.stop_condition=I.stop_condition.trim()),i.value=!0;try{const Y=await G.post("/api/loops",N);Ie.success(`Loop started: ${Y.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await T()}catch(Y){l.value=Y.message}i.value=!1}async function B(I){if(await Jt({title:"Stop loop",message:`Stop loop ${I}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=I;try{await G.del(`/api/loops/${encodeURIComponent(I)}`),Ie.success("Loop stopped"),await T()}catch(Y){Ie.error(Y.message||"Failed to stop loop")}r.value=null}}async function U(I){o.value=I;try{await G.post(`/api/loops/${encodeURIComponent(I)}/restart`),Ie.success("Loop restarted"),await T()}catch(N){Ie.error(N.message||"Failed to restart loop")}o.value=null}function O(I){b&&I.payload&&(I.payload.loop_id||I.payload.type==="loop")&&(T(!0),d.value&&A.refresh())}let H=null;function J(){H!==null&&clearInterval(H),H=null}function D(){J(),b&&(H=setInterval(()=>{T(!0),d.value&&A.refresh()},5e3))}return Ze(()=>{b=!0,T(),Ge.subscribe("events",O),D()}),Is(()=>{b=!0,T(!0),D()}),Os(()=>{b=!1,J()}),_t(()=>{b=!1,Ge.unsubscribe("events",O),J(),A.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:x,runningCount:w,statusDotClass:v,statusBadge:_,modeBadge:S,formatAge:Vm,formatDuration:ui,formatTs:Ra,formatTokens:Gm,openDetail:L,closeDetail:y,copyText:m,fetchLoops:T,doCreate:M,doStop:B,doRestart:U}}},qw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=W(()=>e.value.filter(y=>y.status==="running").length),r=W(()=>e.value.filter(y=>y.status!=="running").length);function o(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(m){y||(s.value=m.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}is(n,y=>{y?u():p()});async function f(y){if(await Jt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await G.del(`/api/processes/${y}`),Ie.success(`Process ${y} killed`),await d()}catch(x){Ie.error(x.message||"Failed to kill process")}i.value=null}}function b(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let g=!1;function A(){g||(g=!0,d(),Ge.subscribe("events",b),u())}function L(){g&&(g=!1,Ge.unsubscribe("events",b),p())}return Ze(A),Is(A),Os(L),_t(L),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ui,fetchProcesses:d,doKill:f}}},Gw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function lp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function Kw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function Ww(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function Zw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=Gw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),b=[];for(const A of new Set([p,f])){const L=new Date(u+A*6e4);Kw(L,c)===d&&(b.some(y=>y.getTime()===L.getTime())||b.push(L))}if(b.sort((A,L)=>A.getTime()-L.getTime()),b.length===0)return{state:"nonexistent",typed:t};if(b.length>1)return{state:"ambiguous",typed:t,options:b.map(A=>({instant:A,offset:Ww(A),iso:A.toISOString()}))};const g=b[0];return{state:"ok",typed:t,instant:g,iso:g.toISOString()}}const Jw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),r=h(null),o=W(()=>Zw(a.value.run_at));is(()=>a.value.run_at,()=>{r.value=null});const c=W(()=>{var $;const X=o.value;return X.state==="ok"?X.instant:X.state==="ambiguous"&&r.value!==null&&(($=X.options[r.value])==null?void 0:$.instant)||null}),d=W(()=>{const X=c.value;return X?`${X.toLocaleString()} local — ${X.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=h(null),g=h(null),A=h(null),L=h(null),y=h(null),m=h(null),x=h([]),w=h(!1),v=h("");let _=0;const S=W(()=>e.value.filter(X=>X.cron&&!X.one_time).length),T=W(()=>e.value.filter(X=>X.one_time).length),M=W(()=>e.value.filter(X=>X.trigger).length),B=W(()=>e.value.filter(X=>X.paused).length),U=W(()=>e.value.filter(X=>X.consecutive_failures>0).length);function O(X){if(!X)return"-";const $=Date.now(),oe=(new Date(X).getTime()-$)/1e3;if(oe<0)return"overdue";if(oe<60)return"in < 1 min";if(oe<3600)return`in ${Math.floor(oe/60)} min`;if(oe<86400){const Ne=Math.floor(oe/3600),He=Math.floor(oe%3600/60);return He>0?`in ${Ne}h ${He}m`:`in ${Ne}h`}const _e=Math.floor(oe/86400);return`in ${_e} day${_e!==1?"s":""}`}function H(X){return X==null?"-":X<1e3?`${X}ms`:X<6e4?`${(X/1e3).toFixed(1)}s`:ui(X/1e3)}function J(X=a.value.cron){a.value.cron=X,lp(a.value,"cron"),u.value=null}function D(X=a.value.run_at){a.value.run_at=X,lp(a.value,"run_at"),u.value=null}async function I(){const X=a.value.cron.trim();if(X){p.value=!0;try{u.value=await G.post("/api/schedules/validate-cron",{expression:X})}catch($){u.value={valid:!1,error:$.message}}p.value=!1}}async function N(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(X){s.value=X.message}t.value=!1}async function Y(X){if(m.value===X){m.value=null,x.value=[];return}m.value=X,w.value=!0,x.value=[];const $=++_;try{const re=await G.get(`/api/schedules/${encodeURIComponent(X)}/history?limit=10`);if($!==_||m.value!==X)return;x.value=re,v.value=""}catch(re){if($!==_||m.value!==X)return;x.value=[],v.value=re.message||"Failed to load execution history"}$===_&&(w.value=!1)}async function he(){l.value=null;const X=a.value;if(!X.description.trim()){l.value="Description is required";return}if(!X.channel_id.trim()){l.value="Channel ID is required";return}if(!X.cron.trim()&&!X.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(X.cron.trim()&&X.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const $={description:X.description.trim(),action:X.action,channel_id:X.channel_id.trim()};if(X.cron.trim()&&($.cron=X.cron.trim()),X.run_at.trim()){const re=o.value;if(re.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(re.state==="invalid"){l.value="One-time run time is not a valid date";return}const oe=c.value;if(re.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!oe){l.value="One-time run time could not be resolved";return}$.run_at=oe.toISOString()}if(X.action==="reminder"&&X.message.trim()&&($.message=X.message.trim()),X.action==="check"&&(X.tool_name.trim()&&($.tool_name=X.tool_name.trim()),X.report_format&&($.report_format=X.report_format),X.tool_input_str.trim()))try{$.tool_input=JSON.parse(X.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",$),Ie.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await N()}catch(re){l.value=re.message}i.value=!1}async function Oe(X){b.value=X;try{const $=await G.post(`/api/schedules/${encodeURIComponent(X)}/run`);if($.status==="failure")Ie.error(`Execution failed: ${$.error||"unknown error"}`);else{const re=$.warning?`Executed (${$.warning})`:"Executed successfully";Ie.success(re)}await N()}catch($){Ie.error($.message||"Failed to trigger")}b.value=null}async function ae(X){A.value=X.id;const $=!X.paused;try{await G.put(`/api/schedules/${encodeURIComponent(X.id)}`,{paused:$}),Ie.success($?"Schedule paused":"Schedule resumed"),await N()}catch(re){Ie.error(re.message||"Failed to update schedule")}A.value=null}async function be(X,$){y.value=X.id;try{await G.put(`/api/schedules/${encodeURIComponent(X.id)}`,{report_format:$}),Ie.success($?"Structured report enabled":"Plain-text report enabled")}catch(re){Ie.error(`Update failed: ${re.message}`)}finally{await N(),y.value=null}}async function ee(X){L.value=X;try{await G.post(`/api/schedules/${encodeURIComponent(X)}/reset-failures`),Ie.success("Failure counters reset"),await N()}catch($){Ie.error($.message||"Failed to reset")}L.value=null}async function ve(X){const $=e.value.find(oe=>oe.id===X);if(await Jt({title:"Delete schedule",message:`Delete "${($==null?void 0:$.description)||X}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){g.value=X;try{await G.del(`/api/schedules/${encodeURIComponent(X)}`),Ie.success("Schedule deleted"),await N()}catch(oe){Ie.error(oe.message||"Failed to delete schedule")}g.value=null}}return Ze(()=>{N()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:f,runningId:b,deletingId:g,togglingId:A,resettingId:L,reportUpdatingId:y,expandedId:m,history:x,historyLoading:w,historyError:v,cronCount:S,oneTimeCount:T,webhookCount:M,pausedCount:B,failingCount:U,formatTs:Ra,formatAge:Vm,formatFuture:O,formatMs:H,formatDuration:ui,onCronInput:J,onRunAtInput:D,validateCron:I,toggleExpand:Y,fetchSchedules:N,doCreate:he,doRunNow:Oe,doTogglePause:ae,doUpdateReportFormat:be,doResetFailures:ee,doDelete:ve}}},Zm=[{id:"live",label:"Live",component:$w},{id:"agents",label:"Agents",component:Vw},{id:"loops",label:"Loops",component:jw},{id:"processes",label:"Processes",component:qw},{id:"schedules",label:"Schedules",component:Jw}],Yw={components:{TabbedPage:lo},setup(){return{tabs:Zm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Qw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await G.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ze(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Ra,formatDetail:i,truncateBlock:jm,toggleExpand:l,clearFilters:r,fetchAudit:o}}},rp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Xw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ek={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),b=h(!1),g=rp,A=Xw,L=h([]),y=h(!1),m=h(""),x=h("flat"),w=h(new Set),v=h(""),_=h(""),S=h(""),T=h(null),M=h(!1);function B(){try{const Z=localStorage.getItem("odin-session-presets");Z&&(L.value=JSON.parse(Z))}catch{}}function U(){try{localStorage.setItem("odin-session-presets",JSON.stringify(L.value))}catch{}}const O=W(()=>p.value.trim()!==""||u.value!=="all"),H=W(()=>{let Z=[...e.value];const Se=rp.find(ze=>ze.id===u.value),Le=Se?Se.filters:{};if(Le.source&&(Z=Z.filter(ze=>ze.source===Le.source)),Le.minMessages&&(Z=Z.filter(ze=>ze.message_count>=Le.minMessages)),Le.hasCompaction&&(Z=Z.filter(ze=>ze.has_summary)),Le.maxAge!=null){const ze=Date.now()/1e3;Z=Z.filter(gt=>gt.last_active&&ze-gt.last_active<=Le.maxAge)}if(p.value.trim()){const ze=p.value.toLowerCase().trim();Z=Z.filter(gt=>(gt.channel_id||"").toLowerCase().includes(ze)||(gt.last_user_id||"").toLowerCase().includes(ze)||(gt.source||"").toLowerCase().includes(ze))}const Ue=f.value,lt=b.value?1:-1;return Z.sort((ze,gt)=>{const zt=ze[Ue]||0,rs=gt[Ue]||0;return(zt-rs)*lt}),Z}),J=W(()=>{if(!a.value||!a.value.messages)return[];const Z=a.value.messages;if(Z.length===0)return[];const Se=[];let Le=[];for(const Ue of Z)Ue.role==="user"&&Le.length>0&&(Se.push(Le),Le=[]),Le.push(Ue);return Le.length>0&&Se.push(Le),Se}),D=W(()=>H.value.length>0&&c.value.size===H.value.length);function I(Z){const Se=Z.find(Le=>Le.role==="user");if(Se&&Se.content){const Le=Se.content.slice(0,120);return Le.length<Se.content.length?Le+"...":Le}return"(no user message)"}function N(Z){const Se=new Set(w.value);Se.has(Z)?Se.delete(Z):Se.add(Z),w.value=Se}function Y(Z){u.value=Z}function he(Z){u.value=Z.id,Z.filters.searchQuery!=null&&(p.value=Z.filters.searchQuery),Z.filters.sortBy&&(f.value=Z.filters.sortBy)}function Oe(){if(!m.value.trim())return;const Z={id:"custom-"+Date.now(),name:m.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};L.value=[...L.value,Z],U(),y.value=!1,m.value=""}function ae(Z){L.value=L.value.filter(Se=>Se.id!==Z),U(),u.value===Z&&(u.value="all")}function be(){u.value="all",p.value="",f.value="last_active",b.value=!1}function ee(Z){if(!Z)return"—";const Se=Date.now()/1e3-Z;if(Se<60)return"just now";if(Se<3600){const Ue=Math.floor(Se/60);return`${Ue} minute${Ue!==1?"s":""} ago`}if(Se<86400){const Ue=Math.floor(Se/3600);return`${Ue} hour${Ue!==1?"s":""} ago`}const Le=Math.floor(Se/86400);return`${Le} day${Le!==1?"s":""} ago`}function ve(Z){if(!Z)return"";try{return new Date(Z*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function X(Z){if(!Z)return"";try{return new Date(Z*1e3).toLocaleString()}catch{return""}}function $(Z){return Z==="user"?"bg-gray-900/50 border border-gray-800":Z==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function re(Z){return Z==="user"?"sess-msg-user":Z==="assistant"?"sess-msg-assistant":"sess-msg-system"}function oe(Z){return Z==="user"?"badge-info":Z==="assistant"?"badge-success":"badge-warning"}function _e(Z){return Z==="user"?"sess-dot-user":Z==="assistant"?"sess-dot-assistant":"sess-dot-system"}function Ne(Z){return Z==="user"?"text-cyan-400":Z==="assistant"?"text-indigo-400":"text-gray-500"}function He(Z){return Z?Z.length>2e3?Z.slice(0,2e3)+`
... (truncated)`:Z:""}async function k(){const Z=v.value.trim();if(Z){M.value=!0;try{let Se=`/api/sessions/search?q=${encodeURIComponent(Z)}&limit=50`;_.value.trim()&&(Se+=`&channel_id=${encodeURIComponent(_.value.trim())}`),S.value.trim()&&(Se+=`&user_id=${encodeURIComponent(S.value.trim())}`);const Le=await G.get(Se);T.value=Le.results||[]}catch{T.value=[]}M.value=!1}}function R(){v.value="",_.value="",S.value="",T.value=null}function z(Z){return Z?Z.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function Q(Z){return Z==="user"?"fts-result-user":Z==="assistant"?"fts-result-assistant":Z==="summary"?"fts-result-summary":Z==="fts"?"fts-result-fts":Z==="channel"?"fts-result-channel":"fts-result-default"}function te(Z){return Z==="user"?"badge-info":Z==="assistant"?"badge-success":Z==="summary"?"badge-warning":Z==="fts"?"badge-success":"badge-info"}async function se(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(Z){s.value=Z.message}t.value=!1}function pe(){s.value=null,se()}async function ue(Z){if(n.value===Z){n.value=null,a.value=null,w.value=new Set;return}n.value=Z,a.value=null,i.value=!0,w.value=new Set;const Se=++l;try{const Le=await G.get(`/api/sessions/${encodeURIComponent(Z)}`);Se===l&&n.value===Z&&(a.value=Le)}catch(Le){Se===l&&n.value===Z&&(a.value={messages:[],summary:"",error:Le.message||"Failed to load session"})}finally{Se===l&&(i.value=!1)}}function ce(Z){const Se=new Set(c.value);Se.has(Z)?Se.delete(Z):Se.add(Z),c.value=Se}function ne(){D.value?c.value=new Set:c.value=new Set(H.value.map(Z=>Z.channel_id))}function ie(Z){r.value=Z}async function ge(){if(r.value){o.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await se()}catch(Z){s.value=Z.message||"Failed to clear session"}o.value=!1,r.value=null}}function we(){d.value=!0}async function Ae(){if(c.value.size!==0){o.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await se()}catch(Z){s.value=Z.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function F(Z,Se){const Le=`/api/sessions/${encodeURIComponent(Z)}/export?format=${Se}`;try{const Ue=await G.getBlob(Le),lt=URL.createObjectURL(Ue),ze=document.createElement("a");ze.href=lt,ze.download=`session-${Z}.${Se==="text"?"txt":"json"}`,ze.click(),URL.revokeObjectURL(lt)}catch(Ue){s.value=Ue.message||"Failed to export session"}}let de=null;function ke(Z){Z.payload&&Z.payload.channel_id&&(clearTimeout(de),de=setTimeout(()=>{if(se(),n.value&&Z.payload.channel_id===n.value){const Se=n.value,Le=l;G.get(`/api/sessions/${encodeURIComponent(Se)}`).then(Ue=>{Le!==l||n.value!==Se||(a.value=Ue)}).catch(()=>{})}},2e3))}let Re=!1;function De(){Re||(Re=!0,se(),Ge.subscribe("events",ke))}Ze(()=>{B(),De()}),Is(()=>{De()});function ct(){Re&&(Re=!1,Ge.unsubscribe("events",ke),clearTimeout(de))}return Os(ct),_t(ct),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:D,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:b,filterPresets:g,sortOptions:A,filteredSessions:H,hasActiveFilters:O,customPresets:L,showSavePreset:y,newPresetName:m,threadView:x,threads:J,collapsedThreads:w,ftsQuery:v,ftsChannelId:_,ftsUserId:S,ftsResults:T,ftsSearching:M,formatAge:ee,formatTimestamp:ve,formatFullTimestamp:X,messageClass:$,threadMsgClass:re,roleBadge:oe,roleDotClass:_e,roleLabelClass:Ne,truncateContent:He,threadSummary:I,fetchSessions:se,retry:pe,toggleSession:ue,toggleSelect:ce,toggleSelectAll:ne,confirmClear:ie,clearSession:ge,confirmBulkClear:we,doBulkClear:Ae,exportSession:F,applyPreset:Y,applyCustomPreset:he,saveCustomPreset:Oe,removeCustomPreset:ae,resetFilters:be,toggleThread:N,runFtsSearch:k,clearFtsSearch:R,highlightSnippet:z,ftsResultClass:Q,ftsTypeBadge:te}}},tk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Gm}}},sk={components:{ContextAssemblyPanel:tk},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(_){if(!_)return"—";try{const S=new Date(_);return isNaN(S.getTime())?_:S.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function p(_){return!_&&_!==0?"—":_<1e3?_+"ms":(_/1e3).toFixed(1)+"s"}function f(_){return!_&&_!==0?"—":_>=1e3?(_/1e3).toFixed(1)+"k":String(_)}function b(_){if(!_)return"";if(typeof _=="string")return _;try{return JSON.stringify(_,null,2)}catch{return String(_)}}function g(_){a.value===_?a.value=null:(a.value=_,c.value={})}function A(_,S){const T=_+"-"+S;c.value={...c.value,[T]:!c.value[T]}}function L(_,S){return!!c.value[_+"-"+S]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,w()}async function m(){try{const _=await G.get("/api/trajectories");e.value=_.files||[],o.value=_.count||0}catch{}}let x=0;async function w(){const _=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const S=await G.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(_!==x)return;let T=S.entries||[];d.value.tool_name&&(T=T.filter(M=>(M.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(T=T.filter(M=>M.is_error)),d.value.channel_id&&(T=T.filter(M=>M.channel_id===d.value.channel_id)),d.value.user_id&&(T=T.filter(M=>M.user_id===d.value.user_id)),t.value=T}else{const S=new URLSearchParams;d.value.channel_id&&S.set("channel_id",d.value.channel_id),d.value.user_id&&S.set("user_id",d.value.user_id),d.value.tool_name&&S.set("tool_name",d.value.tool_name),d.value.errors_only&&S.set("errors_only","true"),S.set("limit",String(d.value.limit));const T=S.toString(),M=await G.get(`/api/trajectories/search/query?${T}`);if(_!==x)return;t.value=M.results||[]}}catch(S){if(_!==x)return;n.value=S.message}_===x&&(s.value=!1)}async function v(){if(!l.value.trim())return;const _=++x;s.value=!0,n.value=null,c.value={};try{const S=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(_!==x)return;i.value=S.entry||null,i.value||(n.value="No trace found for this message ID")}catch(S){if(_!==x)return;S.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=S.message}_===x&&(s.value=!1)}return Ze(async()=>{await m(),await w()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:b,truncateBlock:jm,toggleExpand:g,toggleIteration:A,isIterationExpanded:L,clearFilters:y,fetchFiles:m,fetchTraces:w,lookupMessage:v}}},nk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=W(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const b=await G.get("/api/usage");n.value=b,a.value=b.totals||a.value,t.value=null,s.value=!0}catch(b){t.value=b.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function f(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ze(p),Is(p),Os(f),_t(f),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:qm,formatTime:zm,retry:d}}},Jm=[{id:"audit",label:"Audit",component:Qw},{id:"sessions",label:"Sessions",component:ek},{id:"traces",label:"Traces",component:sk},{id:"usage",label:"Usage",component:nk}],ak={components:{TabbedPage:lo},setup(){return{tabs:Jm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Oo=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],ik={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=W(()=>e.value.filter(y=>y.is_core).length),c=W(()=>e.value.filter(y=>!y.is_core).length),d=W(()=>Object.values(a.value).reduce((y,m)=>y+m,0));function u(y){for(const m of Oo)if(m.id!=="other"&&m.match(y))return m.id;return"other"}const p=W(()=>{let y=e.value;if(n.value){const m=n.value.toLowerCase();y=y.filter(x=>x.name.toLowerCase().includes(m)||(x.description||"").toLowerCase().includes(m))}return r.value&&(y=y.filter(m=>u(m.name)===r.value)),y}),f=W(()=>{const y=new Set;for(const m of e.value)y.add(u(m.name));return Oo.filter(m=>y.has(m.id))}),b=W(()=>{const y=p.value,m={};for(const w of y){const v=u(w.name);m[v]||(m[v]=[]),m[v].push(w)}const x=[];for(const w of Oo)m[w.id]&&m[w.id].length>0&&x.push({label:w.label,icon:w.icon,tools:m[w.id].sort((v,_)=>v.name.localeCompare(_.name))});return x});function g(y){i.value={...i.value,[y]:!i.value[y]}}async function A(){t.value=!0,s.value=null;try{const[y,m]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=m||{};const x=Object.values(m||{}).filter(w=>w>0).sort((w,v)=>w-v)}catch(y){s.value=y.message}t.value=!1}function L(){A()}return Ze(()=>{A()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:p,groupedTools:b,usedCategories:f,truncate:Td,toggleExpand:g,refresh:L}}};function lk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function rk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const ok={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),b=h(!1),g=h(null),A=h(null),L=h(!1),y=W(()=>e.value.length),m=W(()=>e.value.reduce((ee,ve)=>ee+(ve.execution_count||0),0)),x=W(()=>e.value.reduce((ee,ve)=>ee+M(ve.code),0)),w=W(()=>{if(!l.value)return e.value;const ee=l.value.toLowerCase();return e.value.filter(ve=>ve.name.toLowerCase().includes(ee)||(ve.description||"").toLowerCase().includes(ee))}),v=W(()=>u.value?u.value.split(`
`).length:0),_=W(()=>{const ee=Math.max(v.value,1);return Array.from({length:ee},(ve,X)=>X+1).join(`
`)}),S=W(()=>{const ee=u.value.trim();return ee?ee.includes("SKILL_DEFINITION")?ee.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function T(ee){return lk(ee)}function M(ee){return ee?ee.split(`
`).length:0}function B(ee){return rk(ee)}function U(ee){n.value={...n.value,[ee]:!n.value[ee]}}async function O(ee){try{await navigator.clipboard.writeText(ee);const ve=e.value.find(X=>X.code===ee);ve&&(r.value=ve.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function H(ee){if(ee.key==="Tab"){ee.preventDefault();const ve=ee.target,X=ve.selectionStart,$=ve.selectionEnd;u.value=u.value.substring(0,X)+"    "+u.value.substring($),Tt(()=>{ve.selectionStart=ve.selectionEnd=X+4})}}function J(ee){const ve=ee.target.previousElementSibling;ve&&(ve.scrollTop=ee.target.scrollTop)}async function D(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(ee){s.value=ee.message}t.value=!1}async function I(ee){i.value=ee,delete a.value[ee],a.value={...a.value};try{const ve=await G.post(`/api/skills/${encodeURIComponent(ee)}/test`);a.value={...a.value,[ee]:ve}}catch(ve){a.value={...a.value,[ee]:{result:ve.message,is_error:!0}}}i.value=null}function N(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function Y(ee){o.value=!0,c.value="edit",d.value=ee.name,u.value=ee.code||"",p.value=null,f.value=null}function he(){o.value=!1,p.value=null,f.value=null}async function Oe(){p.value=null,f.value=null;const ee=d.value.trim(),ve=u.value.trim();if(!ee){p.value="Name is required";return}if(!ve){p.value="Code is required";return}b.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:ee,code:ve}),f.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(ee)}`,{code:ve}),f.value="Skill updated successfully"),await D(),setTimeout(()=>{o.value=!1},800)}catch(X){p.value=X.message}b.value=!1}function ae(ee){A.value=ee}async function be(){if(A.value){L.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(A.value)}`),await D()}catch(ee){Ie.error(`Failed to delete skill: ${ee.message||"unknown error"}`)}L.value=!1,A.value=null}}return Ze(()=>{D()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:b,editorRef:g,deleteTarget:A,deleting:L,enabledCount:y,totalExecutions:m,totalLines:x,displayedSkills:w,editLineCount:v,editorLineNums:_,editValidation:S,highlight:T,truncate:Td,formatTs:Ra,countLines:M,getLineNumbers:B,toggleCode:U,copyCode:O,handleEditorKey:H,syncScroll:J,fetchSkills:D,testSkill:I,showCreate:N,editSkill:Y,cancelEdit:he,saveSkill:Oe,confirmDelete:ae,doDelete:be}}};class Bs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const ck=/^[A-Za-z_][A-Za-z0-9_]*$/;function op(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function cp(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const r=String((l==null?void 0:l.key)||"").trim(),o=String((l==null?void 0:l.value)??"");if(!(!r&&!o)){if(!r)throw new Bs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(r))throw new Bs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,r))throw new Bs(`${s} key “${r}” appears more than once.`,"authentication");if(i.has(r))throw new Bs(`${s} key “${r}” cannot be replaced and removed in the same save.`,"authentication");n[r]=o}}return{set:n,remove:a}}function dk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function uk(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Bs("Server name is required.","name");if(a.length>128||!ck.test(a))throw new Bs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,r={enabled:!!e.enabled,transport:i};if(n&&(r.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Bs("An executable path is required for a new stdio connection.","command");if(d&&(r.command=d),(n||e.replaceArgs)&&(r.args=op(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Bs("Working directory must be an absolute path.","cwd");r.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Bs("An HTTP endpoint is required for this connection.","url");if(d&&!dk(d))throw new Bs("Endpoint must be a valid http:// or https:// URL.","url");d&&(r.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Bs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");r.timeout_seconds=d}(n||e.replaceAllowlist)&&(r.tool_allowlist=op(e.allowlistText));const o=cp(e.headerRows,e.headersRemove,"Header"),c=cp(e.envRows,e.envRemove,"Environment variable");return Object.keys(o.set).length&&(r.headers_set=o.set),o.remove.length&&(r.headers_remove=o.remove),Object.keys(c.set).length&&(r.env_set=c.set),c.remove.length&&(r.env_remove=c.remove),r}function pk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function fk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function hk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const mk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function gk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const vk=1e4,bk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Lo(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function yk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const xk={template:`
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

          <article v-for="server in servers" :key="server.name" :class="['mcp-server-card', 'state-' + serverState(server), { 'mcp-card-off': !server.enabled }]">
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
              <label class="mcp-card-switch">
                <span class="mcp-card-switch-copy"><strong>Server enabled</strong><small>Takes effect immediately and changes tool availability.</small></span>
                <span class="toggle-switch" :aria-busy="togglePending.has(server.name) ? 'true' : 'false'">
                  <input type="checkbox" :checked="server.enabled" :disabled="togglePending.has(server.name)" :aria-label="'Server enabled — ' + server.name" @change="toggleServerEnabled(server, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
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
                <div v-if="editorMode === 'edit' && editingServer?.url_display" class="mcp-current-endpoint">
                  <span>Currently set — masked display</span>
                  <code>{{ editingServer.url_display }}</code>
                  <small>Sensitive URL components are hidden. This display is for recognition only and is not the literal saved URL. Enter a complete URL below only to replace it.</small>
                </div>
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),r=h({}),o=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),b=h(Lo()),g=h(""),A=h(!1);let L=null,y=0,m=!1,x=!1;const w=mk,v=W(()=>{var F;return((F=e.value)==null?void 0:F.servers)||[]}),_=W(()=>{var F;return!!((F=e.value)!=null&&F.enabled)}),S=W(()=>{var F,de,ke,Re;return{serverCount:((F=e.value)==null?void 0:F.server_count)||0,enabledCount:((de=e.value)==null?void 0:de.enabled_server_count)||0,connectedCount:((ke=e.value)==null?void 0:ke.connected_count)||0,toolCount:((Re=e.value)==null?void 0:Re.published_tool_count)||0}}),T=W(()=>{var F;return((F=f.value)==null?void 0:F.header_keys)||[]}),M=W(()=>{var F;return((F=f.value)==null?void 0:F.env_keys)||[]}),B=W(()=>{var F;return u.value==="edit"&&((F=f.value)==null?void 0:F.transport)==="http"}),U=W(()=>u.value==="add"||!B.value),O=W(()=>B.value?"Replace endpoint URL":"Endpoint URL"),H=W(()=>B.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function J(){D(),L=window.setInterval(()=>I({quiet:!0}),vk)}function D(){L&&window.clearInterval(L),L=null}async function I({quiet:F=!1}={}){const de=++y;F||(t.value=!0);try{const ke=await G.get("/api/mcp/status");if(de!==y||!m)return;e.value=ke,n.value="";const Re=new Set((ke.servers||[]).map(De=>De.name));i.value=new Set([...i.value].filter(De=>Re.has(De)))}catch(ke){de===y&&m&&(n.value=ke.message||"Failed to load MCP status")}finally{de===y&&(t.value=!1)}}function N(F){return s.value||a.value.has(F)}function Y(F,de){const ke=new Set(a.value);de?ke.add(F):ke.delete(F),a.value=ke}function he(F){return fk(F.state)}function Oe(F){if(he(F)==="disabled"){if(!F.enabled)return"Disabled — server switch off";if(!_.value)return"Disabled — global MCP is off"}return bk[he(F)]}function ae(F){return F.transport==="http"?"Streamable HTTP":"stdio"}function be(F){return F.negotiated_version?`${F.era?`${String(F.era).charAt(0).toUpperCase()}${String(F.era).slice(1)}`:"Protocol"} · ${F.negotiated_version}`:"Not negotiated"}function ee(F){return F.discovered_count?`${F.published_count||0} published · ${F.excluded_count||0} excluded`:"No tools discovered"}const ve=h(new Set);async function X(F,de){if(ve.value.has(F.name))return;const ke=!!de.target.checked,Re=new Set(ve.value);Re.add(F.name),ve.value=Re;try{const De=await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/enabled`,{enabled:ke});De&&Array.isArray(De.servers)?e.value=De:await I({quiet:!0})}catch(De){de.target.checked=!!F.enabled,Ie.error(De.message||`Failed to toggle ${F.name}`)}finally{const De=new Set(ve.value);De.delete(F.name),ve.value=De}}async function $(F){if(F!==_.value&&!(!F&&!await Jt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await G.post("/api/mcp/enabled",{enabled:F}),Ie.success(F?"MCP enabled":"MCP disabled"),await I({quiet:!0})}catch(de){Ie.error(de.message||"Failed to update MCP state"),await I({quiet:!0})}finally{s.value=!1}}}async function re(F){Y(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/reconnect`,{}),Ie.success(`Reconnected ${F.name}`)}catch(de){Ie.error(de.message||`Failed to reconnect ${F.name}`)}finally{Y(F.name,!1),await I({quiet:!0})}}async function oe(F){Y(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/refresh-tools`,{}),Ie.success(`Refreshed tools from ${F.name}`),await He(F.name,!0)}catch(de){Ie.error(de.message||`Failed to refresh ${F.name}`)}finally{Y(F.name,!1),await I({quiet:!0})}}async function _e(F){if(await Jt({title:`Remove ${F.name}`,message:`Remove this saved MCP server? Its ${F.published_count||0} published tool${F.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){Y(F.name,!0);try{await G.del(`/api/mcp/servers/${encodeURIComponent(F.name)}`),Ie.success(`Removed ${F.name}`),delete r.value[F.name]}catch(ke){Ie.error(ke.message||`Failed to remove ${F.name}`)}finally{Y(F.name,!1),await I({quiet:!0})}}}async function Ne(F){const de=new Set(i.value);if(de.has(F.name)){de.delete(F.name),i.value=de;return}de.add(F.name),i.value=de,Object.hasOwn(r.value,F.name)||await He(F.name)}async function He(F,de=!1){if(!de&&Object.hasOwn(r.value,F))return;const ke=new Set(c.value);ke.add(F),c.value=ke,o.value={...o.value,[F]:""};try{const Re=await G.get(`/api/mcp/servers/${encodeURIComponent(F)}/tools`);r.value={...r.value,[F]:Re.tools||[]}}catch(Re){o.value={...o.value,[F]:Re.message||"Failed to load tools"}}finally{const Re=new Set(c.value);Re.delete(F),c.value=Re}}function k(F){return(r.value[F]||[]).filter(de=>hk(de,l.value[F]))}function R(F,de){l.value={...l.value,[F]:de}}function z(){u.value="add",p.value="",f.value=null,b.value=Lo(),g.value="",d.value=!0}function Q(F){u.value="edit",p.value=F.name,f.value=F,b.value={...Lo(),name:F.name,enabled:!!F.enabled,transport:F.transport||"stdio"},g.value="",d.value=!0}function te(){A.value||(d.value=!1)}function se(F){d.value&&gk(F)}function pe(F){const de=F==="headers"?"headerRows":"envRows";b.value[de].push({key:"",value:""})}function ue(F,de){const ke=F==="headers"?"headerRows":"envRows";b.value[ke].splice(de,1)}function ce(F,de){const ke=F==="headers"?"headersRemove":"envRemove",Re=b.value[ke];b.value[ke]=Re.includes(de)?Re.filter(De=>De!==de):[...Re,de]}async function ne(){var de,ke;g.value="";let F;try{F=uk(b.value,{mode:u.value,originalTransport:((de=f.value)==null?void 0:de.transport)||""})}catch(Re){g.value=Re instanceof Bs?Re.message:"Invalid MCP server configuration",await Tt(),(ke=document.querySelector(".mcp-editor"))==null||ke.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&pk(F,f.value)&&!await Jt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){A.value=!0;try{u.value==="add"?await G.post("/api/mcp/servers",F):await G.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,F),Ie.success(u.value==="add"?`Saved ${F.name}`:`Updated ${p.value}`),d.value=!1,await I({quiet:!0})}catch(Re){g.value=Re.message||"Failed to save MCP server"}finally{A.value=!1}}}let ie=null;function ge(F){`${(F==null?void 0:F.event)||""} ${(F==null?void 0:F.type)||""} ${(F==null?void 0:F.tool)||""} ${(F==null?void 0:F.message)||""}`.toLowerCase().includes("mcp")&&(ie&&window.clearTimeout(ie),ie=window.setTimeout(()=>I({quiet:!0}),200))}function we(){m||(m=!0,x||(Ge.subscribe("events",ge),x=!0),I(),J())}function Ae(){m=!1,D(),ie&&window.clearTimeout(ie),ie=null,x&&(Ge.unsubscribe("events",ge),x=!1)}return Ze(we),Is(we),Os(Ae),_t(Ae),{status:e,loading:t,mutating:s,pageError:n,servers:v,masterEnabled:_,aggregate:S,expandedServers:i,toolQueries:l,toolErrors:o,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,form:b,formError:g,saving:A,editorGroups:w,configuredHeaderKeys:T,configuredEnvKeys:M,savedHttpEndpoint:B,endpointRequired:U,endpointFieldLabel:O,endpointPlaceholder:H,refreshAll:I,busy:N,serverState:he,stateLabel:Oe,transportLabel:ae,protocolLabel:be,toolSummary:ee,formatAge:yk,setMasterEnabled:$,togglePending:ve,toggleServerEnabled:X,reconnect:re,refreshTools:oe,removeServer:_e,toggleTools:Ne,filteredTools:k,setToolQuery:R,openAdd:z,openEdit:Q,closeEditor:te,jumpToEditorGroup:se,addSecretRow:pe,removeSecretRow:ue,toggleSecretRemoval:ce,saveServer:ne}}};function _k(e,t){if(!e||!t)return ip(e);const s=ip(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const wk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),b=h(null),g=h(null);let A=null;const L=h(null),y=h(!1),m=h({}),x=h({}),w=h(null),v=h(null),_=W(()=>e.value.reduce((N,Y)=>N+(Y.chunks||0),0)),S=W(()=>new Set(e.value.map(Y=>Y.uploader).filter(Boolean)).size);function T(N,Y){const he=x.value[Y];if(!he||he.length===0)return 0;const Oe=Math.max(...he.map(ae=>ae.char_count||0));return Oe===0?0:Math.round(N.char_count/Oe*100)}async function M(){t.value=!0,s.value=null;try{const N=await G.get("/api/knowledge");e.value=Array.isArray(N)?N:[]}catch(N){s.value=N.message}t.value=!1}async function B(N){if(m.value[N]){m.value[N]=!1,v.value=null;return}if(m.value[N]=!0,!(x.value[N]||w.value===N)){w.value=N;try{const Y=await G.get(`/api/knowledge/${encodeURIComponent(N)}/chunks`);x.value[N]=Array.isArray(Y)?Y:[]}catch(Y){x.value[N]=[],Ie.error(`Failed to load chunks: ${Y.message}`)}w.value=null}}async function U(){const N=n.value.trim();if(N){i.value=!0,r.value=null,l.value=N;try{const Y=await G.get(`/api/knowledge/search?q=${encodeURIComponent(N)}`);a.value=Array.isArray(Y)?Y:[]}catch(Y){a.value=[],r.value=Y.message||"Search failed"}i.value=!1}}function O(){a.value=null,n.value="",r.value=null}async function H(){u.value=null,p.value=null;const N=c.value.trim(),Y=d.value.trim();if(!N){u.value="Source name is required";return}if(!Y){u.value="Content is required";return}f.value=!0;try{const he=await G.post("/api/knowledge",{source:N,content:Y});p.value=`Ingested ${he.chunks||0} chunks from "${N}"`,c.value="",d.value="",x.value={},await M(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(he){u.value=he.message}f.value=!1}async function J(N){b.value=N,g.value=null,A&&(clearTimeout(A),A=null);try{const Y=await G.post(`/api/knowledge/${encodeURIComponent(N)}/reingest`);g.value={source:N,error:!1,message:`Re-ingested ${Y.chunks||0} chunks`},delete x.value[N],await M(),A=setTimeout(()=>{g.value=null,A=null},3e3)}catch(Y){g.value={source:N,error:!0,message:Y.message}}b.value=null}function D(N){L.value=N}async function I(){if(L.value){y.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(L.value)}`),delete x.value[L.value],await M()}catch(N){Ie.error(`Failed to delete source: ${N.message||"unknown error"}`)}y.value=!1,L.value=null}}return Ze(()=>{M()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:b,reingestResult:g,deleteTarget:L,deleting:y,expanded:m,sourceChunks:x,loadingChunks:w,selectedChunk:v,totalChunks:_,uploaderCount:S,truncate:Td,formatTs:Ra,highlightTerms:_k,chunkBarWidth:T,fetchSources:M,toggleSource:B,doSearch:U,clearSearch:O,doIngest:H,doReingest:J,confirmDelete:D,doDelete:I}}},kk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),b=h(!1),g=h(null),A=h(null),L=h(new Set),y=h(null),m=h(!1),x=h(!1),w=W(()=>e.value.reduce((ae,be)=>ae+be.count,0)),v=W(()=>L.value.size);function _(ae){const be=t.value[ae];if(!be)return[];if(!l.value.trim())return be;const ee=l.value.trim().toLowerCase();return be.filter(ve=>ve.key.toLowerCase().includes(ee)||ve.value&&ve.value.toLowerCase().includes(ee))}function S(ae,be){return L.value.has(ae+"/"+be)}function T(ae,be){const ee=ae+"/"+be,ve=new Set(L.value);ve.has(ee)?ve.delete(ee):ve.add(ee),L.value=ve}function M(ae){const be=t.value[ae];return!be||be.length===0?!1:be.every(ee=>L.value.has(ae+"/"+ee.key))}function B(ae,be){const ee=t.value[ae];if(!ee)return;const ve=new Set(L.value);for(const X of ee){const $=ae+"/"+X.key;be?ve.add($):ve.delete($)}L.value=ve}async function U(){s.value=!0,n.value=null;try{const ae=await G.get("/api/memory");e.value=Object.entries(ae).map(([be,ee])=>({name:be,keys:ee.keys||[],count:ee.count||0}))}catch(ae){n.value=ae.message}s.value=!1}async function O(ae){if(a.value[ae]){a.value[ae]=!1;return}a.value[ae]=!0;const be=e.value.find(ve=>ve.name===ae);if(!be||t.value[ae]||i.value===ae)return;i.value=ae;let ee;try{const X=(await G.get(`/api/memory/${encodeURIComponent(ae)}`)).entries||{};ee=be.keys.map($=>Object.prototype.hasOwnProperty.call(X,$)?{key:$,value:X[$]||"",failed:!1}:{key:$,value:"",failed:!0,error:"Not found in scope"})}catch(ve){ee=be.keys.map(X=>({key:X,value:"",failed:!0,error:ve.message||"Failed to load"}))}t.value[ae]=ee,i.value=null}function H(ae,be,ee){p.value=ae+"/"+be,f.value=ee}async function J(ae,be){b.value=!0,g.value=null;try{await G.put(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(be)}`,{value:f.value});const ee=t.value[ae];if(ee){const ve=ee.find(X=>X.key===be);ve&&(ve.value=f.value)}p.value=null}catch(ee){g.value=`Failed to save: ${ee.message||"unknown error"}`}b.value=!1}async function D(ae,be){try{await navigator.clipboard.writeText(be.value),A.value=ae+"/"+be.key,setTimeout(()=>{A.value=null},1500)}catch{}}async function I(){d.value=null,u.value=null;const ae=o.value.scope.trim(),be=o.value.key.trim(),ee=o.value.value.trim();if(!ae){d.value="Scope is required";return}if(!be){d.value="Key is required";return}if(!ee){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(be)}`,{value:ee}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await U(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(ve){d.value=ve.message}c.value=!1}function N(ae,be){y.value={scope:ae,key:be}}async function Y(){if(!y.value)return;m.value=!0,g.value=null;const{scope:ae,key:be}=y.value;try{await G.del(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(be)}`);const ee=t.value[ae];ee&&(t.value[ae]=ee.filter($=>$.key!==be));const ve=e.value.find($=>$.name===ae);ve&&(ve.count--,ve.keys=ve.keys.filter($=>$!==be));const X=new Set(L.value);X.delete(ae+"/"+be),L.value=X}catch(ee){g.value=`Failed to delete: ${ee.message||"unknown error"}`}m.value=!1,y.value=null}function he(){x.value=!0}async function Oe(){m.value=!0,g.value=null;const ae=[];for(const be of L.value){const ee=be.indexOf("/");ae.push({scope:be.slice(0,ee),key:be.slice(ee+1)})}try{await G.post("/api/memory/bulk-delete",{entries:ae}),L.value=new Set,t.value={},await U()}catch(be){g.value=`Bulk delete failed: ${be.message||"unknown error"}`}m.value=!1,x.value=!1}return Ze(()=>{U()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:b,actionError:g,copied:A,selected:L,selectedCount:v,totalEntries:w,deleteTarget:y,deleting:m,showBulkDelete:x,fetchMemory:U,toggleScope:O,startEdit:H,doEdit:J,copyValue:D,doAdd:I,confirmDelete:N,doDelete:Y,confirmBulkDelete:he,doBulkDelete:Oe,isSelected:S,toggleSelect:T,isScopeAllSelected:M,toggleSelectAll:B,filteredEntries:_}}},Sk={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=W(()=>[...new Set(e.value.map(A=>A.category))].sort()),o=W(()=>{const g={};return e.value.forEach(A=>{g[A.category]=(g[A.category]||0)+1}),g}),c=W(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function d(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function u(g){i.value=g.key,l.value=g.content}async function p(g){try{await G.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,Ie.success("Entry updated"),await b()}catch(A){Ie.error(A.message||"Failed to save entry")}}async function f(g){if(await Jt({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(g)),Ie.success("Entry deleted"),await b()}catch(L){Ie.error(L.message||"Failed to delete entry")}}async function b(){s.value=!0,n.value=null;try{const g=await G.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return Ze(b),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:Ra,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:b}}},Ym=[{id:"tools",label:"Tools",component:ik},{id:"skills",label:"Skills",component:ok},{id:"mcp-servers",label:"MCP Servers",component:xk},{id:"knowledge",label:"Knowledge",component:wk},{id:"memory",label:"Memory",component:kk},{id:"learned",label:"Learned",component:Sk}],Ck={components:{TabbedPage:lo},setup(){return{tabs:Ym}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Tk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Ek={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Ak={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Rk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=W(()=>e.value.components||[]),l=W(()=>Ak[e.value.overall]||"text-gray-400"),r=W(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=W(()=>{const v=e.value.overall;return v==="healthy"?"All Systems Healthy":v==="degraded"?"Some Systems Degraded":v==="unhealthy"?"System Issues Detected":"Unknown"});function c(v){return Tk[v]||"text-gray-400"}function d(v){return Ek[v]||"info"}function u(v){return v==="ok"?"badge-success":v==="degraded"?"badge-warning":v==="down"?"badge-danger":"badge-info"}function p(v){return v==="closed"?"text-green-400":v==="half_open"?"text-yellow-400":v==="open"?"text-red-400":"text-gray-400"}function f(v){return v.replace(/_/g," ").replace(/\b\w/g,_=>_.toUpperCase())}function b(v){if(!v)return"—";try{return new Date(v).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return v}}function g(v){return v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":String(v)}async function A(){a.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null,n.value=!0}catch(v){s.value=v.message}finally{t.value=!1,a.value=!1}}function L(){t.value=!0,s.value=null,A()}let y=null,m=!1;function x(){m||(m=!0,A(),y||(y=setInterval(A,3e4)))}function w(){m&&(m=!1,y&&(clearInterval(y),y=null))}return Ze(x),Is(x),Os(w),_t(w),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:b,formatNumber:g,fetchHealth:A,retry:L}}},Ik={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=W(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=W(()=>{if(!i.value)return[];const A=i.value,L=A.storage_total_bytes||1;return[{label:"Session Persistence",mb:A.sessions.persist_dir.total_mb,bytes:A.sessions.persist_dir.total_bytes,files:A.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(A.sessions.persist_dir.total_bytes/L*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:A.knowledge.db_file.total_mb,bytes:A.knowledge.db_file.total_bytes,files:A.knowledge.db_file.file_count,pct:Math.min(100,Math.round(A.knowledge.db_file.total_bytes/L*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:A.trajectories.message_dir.total_mb,bytes:A.trajectories.message_dir.total_bytes,files:A.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.message_dir.total_bytes/L*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:A.trajectories.agent_dir.total_mb,bytes:A.trajectories.agent_dir.total_bytes,files:A.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.agent_dir.total_bytes/L*100)),color:"res-bar-amber"}]});async function d(){try{const A=await G.get("/api/resource-usage");i.value=A,t.value=null,s.value=!0}catch(A){t.value=A.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function b(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function g(){f&&(f=!1,l&&(clearInterval(l),l=null))}return Ze(b),Is(b),Os(g),_t(g),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:qm,refresh:u,retry:p}}},Ok=["INFO","WARNING","ERROR"],Lk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],No=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Nk=[50,100,200,500],Mk={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ge.state||"disconnected"),c=W(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,b=Ok,g=Lk,A=No,L=h("all"),y=h(""),m=h([]),x=h(!1),w=h(""),v=h([]);function _(){try{const q=localStorage.getItem("odin-log-presets");q&&(m.value=JSON.parse(q))}catch{}}function S(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const T=W(()=>a.value!==""||i.value.trim()!==""||y.value!==""),M=W(()=>{const q=No.find(fe=>fe.value===y.value);return q?q.label:""}),B=W(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(q){return q.message}}),U=24,O=W(()=>{if(he.value.length===0)return[];const q=[],fe=new Date,Pe=3600*1e3;for(let Ye=U-1;Ye>=0;Ye--){const dt=new Date(fe.getTime()-(Ye+1)*Pe),qe=new Date(fe.getTime()-Ye*Pe);q.push({start:dt,end:qe,label:I(dt,qe),shortLabel:qe.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ye of he.value){if(!Ye._time)continue;const dt=Ye._time.getTime();for(const qe of q)if(dt>=qe.start.getTime()&&dt<qe.end.getTime()){qe.total++,Ye.level==="ERROR"?qe.errors++:Ye.level==="WARNING"?qe.warnings++:qe.info++;break}}return q}),H=W(()=>{let q=1;for(const fe of O.value)fe.total>q&&(q=fe.total);return q}),J=W(()=>{if(O.value.length===0)return"";const q=he.value.map(Ye=>Ye._time&&Ye._time.getTime()).filter(Boolean);if(q.length===0)return"";const fe=new Date(Math.min(...q));return`${he.value.length} shown, oldest ${fe.toLocaleTimeString()}`}),D=W(()=>Math.ceil(U/8));function I(q,fe){const Pe={hour:"2-digit",minute:"2-digit"};return q.toLocaleTimeString([],Pe)+" - "+fe.toLocaleTimeString([],Pe)}function N(q,fe){return!fe||!q?"0px":Math.max(2,q/fe*100)+"%"}function Y(q){const fe=he.value.findIndex(Pe=>Pe._time&&Pe._time.getTime()>=q.start.getTime()&&Pe._time.getTime()<q.end.getTime());if(fe>=0&&d.value){const Pe=d.value.querySelectorAll(".log-line");Pe[fe]&&(Pe[fe].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const he=W(()=>{let q=t.value;if(a.value&&(q=q.filter(fe=>(fe.level||"INFO")===a.value)),y.value){const fe=No.find(Pe=>Pe.value===y.value);if(fe&&fe.seconds){const Pe=new Date(Date.now()-fe.seconds*1e3);q=q.filter(Ye=>Ye._time&&Ye._time>=Pe)}}if(i.value&&!B.value)if(l.value)try{const fe=new RegExp(i.value,"i");q=q.filter(Pe=>{const Ye=Pe.text||Pe.raw||"",dt=Pe.tool||"";return fe.test(Ye)||fe.test(dt)})}catch{}else{const fe=i.value.toLowerCase();q=q.filter(Pe=>{const Ye=(Pe.text||Pe.raw||"").toLowerCase(),dt=(Pe.tool||"").toLowerCase();return Ye.includes(fe)||dt.includes(fe)})}return q});function Oe(q){if(q.type==="log"&&q.line)try{const fe=typeof q.line=="string"?JSON.parse(q.line):q.line,Pe=fe.timestamp?new Date(fe.timestamp):new Date;return{ts:Pe.toLocaleTimeString(),_time:Pe,level:fe.error?"ERROR":"INFO",text:fe.tool_name?`[${fe.tool_name}] ${fe.result_summary||""}`.trim():fe.message||JSON.stringify(fe),tool:fe.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(q.line),tool:"",raw:String(q.line)}}if(q.payload){const fe=q.payload,Pe=fe.timestamp?new Date(fe.timestamp):new Date;return{ts:Pe.toLocaleTimeString(),_time:Pe,level:fe.error?"ERROR":"INFO",text:fe.tool_name?`[${fe.tool_name}] ${fe.result_summary||""}`.trim():fe.message||JSON.stringify(fe),tool:fe.tool_name||"",raw:null}}return typeof q=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:q,tool:"",raw:q}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(q),tool:"",raw:null}}function ae(q){const fe=Oe(q);if(s.value){v.value.push(fe);return}be(fe)}function be(q){t.value.push(q),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&Tt(()=>ee())}function ee(q=!1){const fe=d.value;fe&&fe.scrollTo({top:fe.scrollHeight,behavior:q?"smooth":"instant"})}function ve(){n.value=!0,u.value=!1,Tt(()=>ee(!0))}const X=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function $(){const q=d.value;if(!q)return;const fe=q.scrollHeight-q.scrollTop-q.clientHeight<40;u.value=!n.value&&!fe&&t.value.length>0,Ne.value&&re()}function re(){const q=d.value;!q||!n.value||q.scrollHeight-q.scrollTop-q.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function oe(){n.value&&requestAnimationFrame(re)}function _e(q){X.has(q.key)&&oe()}const Ne=h(!1);function He(){n.value&&(Ne.value=!0,requestAnimationFrame(re))}function k(){Ne.value&&(Ne.value=!1,re())}function R(){n.value&&(u.value=!1,Tt(()=>ee()))}function z(){if(s.value=!s.value,!s.value&&v.value.length>0){for(const q of v.value)be(q);v.value=[]}}function Q(){t.value=[],v.value=[],u.value=!1}function te(){let q;e.value==="search"?q=ze.value.map(dt=>{const qe=dt.error?"ERROR":"INFO",Ps=dt.tool_name?`[${dt.tool_name}] `:"";return`${dt.timestamp||""} ${qe} ${Ps}${dt.result_summary||dt.message||""}`}).join(`
`):q=he.value.map(dt=>`${dt.ts} ${dt.level} ${dt.text}`).join(`
`);const fe=new Blob([q],{type:"text/plain"}),Pe=URL.createObjectURL(fe),Ye=document.createElement("a");Ye.href=Pe,Ye.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ye.click(),URL.revokeObjectURL(Pe)}function se(q,fe){const Pe=`${q.ts} ${q.level} ${q.text||q.raw||""}`;navigator.clipboard.writeText(Pe).then(()=>{p.value=fe,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function pe(q){a.value=a.value===q?"":q,L.value="all"}function ue(q){return q.level==="ERROR"?"log-line-error":q.level==="WARNING"?"log-line-warning":"text-gray-300"}function ce(q){return q==="ERROR"?"text-red-500 font-semibold":q==="WARNING"?"text-yellow-500":"text-blue-500"}function ne(q){return q==="ERROR"?"log-chip-error":q==="WARNING"?"log-chip-warning":"log-chip-info"}function ie(q){L.value=q.id;const fe=q.filters;a.value=fe.level||"",y.value=fe.timeRange||"",i.value=fe.text||"",fe.levels&&(a.value=fe.levels[0]||""),fe.hasToolName&&(i.value="")}function ge(q){L.value=q.id,a.value=q.filters.level||"",y.value=q.filters.timeRange||"",i.value=q.filters.text||""}function we(){if(!w.value.trim())return;const q={id:"custom-"+Date.now(),name:w.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};m.value=[...m.value,q],S(),x.value=!1,w.value=""}function Ae(q){m.value=m.value.filter(fe=>fe.id!==q),S(),L.value===q&&(L.value="all")}const F=h("all"),de=h(""),ke=h(""),Re=h(""),De=h(""),ct=h(""),Z=h(100),Se=Nk,Le=h(!1),Ue=h(!1),lt=h(""),ze=h([]),gt=h(null),zt=h(null);function rs(){e.value="search",gt.value||Ns()}async function Ns(){try{gt.value=await G.get("/api/logs/stats")}catch{}}function Qs(){const q=ct.value;if(!q){Re.value="",De.value="";return}const Pe={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[q];if(Pe){const Ye=new Date(Date.now()-Pe*1e3);Re.value=un(Ye),De.value=""}}function un(q){const fe=Pe=>String(Pe).padStart(2,"0");return`${q.getFullYear()}-${fe(q.getMonth()+1)}-${fe(q.getDate())}T${fe(q.getHours())}:${fe(q.getMinutes())}`}function pn(q){if(!q)return"";const fe=new Date(q);return isNaN(fe.getTime())?"":fe.toISOString()}async function qs(){Le.value=!0,lt.value="",Ue.value=!0,zt.value=null;try{const q=new URLSearchParams;F.value&&F.value!=="all"&&q.set("level",F.value),de.value&&q.set("tool",de.value),ke.value&&q.set("q",ke.value);const fe=pn(Re.value),Pe=pn(De.value);fe&&q.set("start",fe),Pe&&q.set("end",Pe),q.set("limit",String(Z.value));const Ye=await G.get(`/api/logs/search?${q.toString()}`);ze.value=Ye.entries||[]}catch(q){lt.value=q.message||"Search failed",ze.value=[]}finally{Le.value=!1}}function fn(){F.value="all",de.value="",ke.value="",Re.value="",De.value="",ct.value="",Z.value=100,ze.value=[],Ue.value=!1,lt.value="",zt.value=null}function ys(q){zt.value=zt.value===q?null:q}function Ms(q){if(!q.timestamp)return"";try{return new Date(q.timestamp).toLocaleString()}catch{return q.timestamp}}function Mt(q){return q.type==="web_action"?`${q.status||""} (${q.execution_time_ms||0}ms)`:(q.result_summary||"").slice(0,200)}function xs(q){return q.error?"log-line-error":"text-gray-300"}function hn(q){try{return JSON.stringify(q,null,2)}catch{return String(q)}}let vt=null,os=null,Qt=!1;function _s(){Qt||(Qt=!0,Ge.subscribe("logs",ae),r.value=Ge.connected,o.value=Ge.state||"disconnected",vt=Ge.onStateChange,os=(q,fe)=>{o.value=q,r.value=q==="connected",vt&&vt(q,fe)},Ge.onStateChange=os)}function mn(){Qt&&(Qt=!1,Ge.unsubscribe("logs",ae),Ge.onStateChange===os&&(Ge.onStateChange=vt),os=null,vt=null)}return Ze(()=>{_(),window.addEventListener("pointerup",k),window.addEventListener("pointercancel",k)}),Is(_s),Os(mn),_t(()=>{mn(),window.removeEventListener("pointerup",k),window.removeEventListener("pointercancel",k)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:he,pauseBuffer:v,showJumpBottom:u,copiedIndex:p,regexError:B,levels:b,logPresets:g,timeRanges:A,timeRange:y,activeLogPreset:L,customLogPresets:m,showSaveLogPreset:x,newLogPresetName:w,hasActiveLogFilters:T,timeRangeLabel:M,timelineBuckets:O,timelineMax:H,timelineSpanLabel:J,timelineLabelSkip:D,togglePause:z,clearLogs:Q,exportLogs:te,logLineClass:ue,levelClass:ce,levelChipClass:ne,toggleLevel:pe,copyLine:se,jumpToBottom:ve,onScroll:$,onUserScrollIntent:oe,onUserScrollKey:_e,onAutoScrollToggle:R,onPointerDown:He,applyLogPreset:ie,applyCustomLogPreset:ge,saveLogCustomPreset:we,removeLogCustomPreset:Ae,segmentHeight:N,jumpToTimelineBucket:Y,searchLevel:F,searchTool:de,searchKeyword:ke,searchStart:Re,searchEnd:De,searchTimePreset:ct,searchLimit:Z,searchLimits:Se,searching:Le,searchRan:Ue,searchError:lt,searchResults:ze,searchStats:gt,expandedSearch:zt,switchToSearch:rs,runSearch:qs,clearSearchFilters:fn,toggleSearchExpand:ys,formatSearchTs:Ms,searchEntryText:Mt,searchLogLineClass:xs,formatJson:hn,applySearchTimePreset:Qs}}};function Bl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Pk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function Dk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Qa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Fk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Mo=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),$k=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function dp(e){return $k.some(t=>e===t||e.startsWith(`${t}.`))}const Qm="odin_config_center_expanded_v1",Xm="odin_config_center_category_v1",Uk=50,Bk=650,Po=()=>G.get("/api/config/meta");function fa(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function zi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Fa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Hk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function zk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function eg(e,t){if(zi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return fa(t);const n={};for(const[a,i]of Object.entries(t)){const l=eg(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function Vk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=eg(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function tg(e,t,s,n){if(zi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)tg(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function jk(){try{const e=JSON.parse(localStorage.getItem(Qm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function qk(){try{const e=localStorage.getItem(Xm);return Qa.some(t=>t.key===e)?e:Qa[0].key}catch{return Qa[0].key}}const Gk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),r=h(null),o=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(qk()),b=h(jk()),g=h({}),A=h({}),L=h(""),y=h({}),m=h({}),x=h([]),w=h([]),v=h(!1),_=h(!1),S=h(!1);let T=null,M=null,B={path:null,at:0},U=0;const O=W(()=>{var E;return(((E=t.value)==null?void 0:E.fields)||[]).filter(P=>!Mo.has(P.path.split(".")[0])&&!dp(P.path))}),H=W(()=>new Map(O.value.map(E=>[E.path,E]))),J=W(()=>he.value.reduce((E,P)=>E+P.sections.length,0)),D=W(()=>O.value.length),I=W(()=>Pk),N=W(()=>x.value.length>0),Y=W(()=>w.value.length>0),he=W(()=>{if(!e.value)return[];const E=new Set(Qa.flatMap(Ee=>Ee.sections)),P=Qa.map(Ee=>({...Ee,sections:Ee.sections.filter(tt=>Object.hasOwn(e.value,tt)&&!Mo.has(tt))})).filter(Ee=>Ee.sections.length),K=Object.keys(e.value).filter(Ee=>!E.has(Ee)&&!Mo.has(Ee));return K.length&&P.push({key:"other",label:"Other",icon:"folder",sections:K}),P}),Oe=W(()=>e.value?{...e.value,...g.value}:null),ae=W(()=>{if(!e.value)return[];const E=[];for(const[P,K]of Object.entries(g.value))tg(e.value[P],K,P,E);return E.filter(P=>!zi(P.oldVal,P.newVal)).map(P=>{const K=R(P.path);return{...P,label:(K==null?void 0:K.label)||Fa(P.path.split(".").at(-1)),apply_mode:(K==null?void 0:K.apply_mode)||pe(P.path.split(".")[0])}})}),be=W(()=>ae.value.length>0),ee=W(()=>ae.value.length),ve=W(()=>new Set(ae.value.map(E=>E.path.split(".")[0])).size),X=W(()=>!!u.value||p.value!=="all"),$=W(()=>{const E={...m.value};for(const P of ae.value){const K=R(P.path),Ee=mi(K,P.newVal);Ee&&(E[P.path]=Ee)}return E}),re=W(()=>Object.keys($.value).length>0),oe=W(()=>e.value?(X.value?he.value:he.value.filter(P=>P.key===f.value)).map(P=>({...P,sections:P.sections.filter(K=>Le(K))})).filter(P=>P.sections.length):[]),_e=W(()=>{const E=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],P=new Map(E.map(K=>[K,[]]));for(const K of ae.value){const Ee=P.has(K.apply_mode)?K.apply_mode:"restart";P.get(Ee).push(K)}return E.filter(K=>P.get(K).length).map(K=>({key:K,label:ye(K),entries:P.get(K)}))}),Ne=W(()=>ae.value.filter(E=>E.apply_mode==="restart").length),He=W(()=>O.value.filter(E=>E.pending_restart)),k=W(()=>He.value.length);function R(E){const P=H.value.get(E);return P?{...P,apply_details:Bl([P])}:null}function z(E){const P=`${E}.`;return O.value.filter(K=>K.path===E||K.path.startsWith(P))}function Q(E){return z(E).length}function te(E){return Fa(E)}function se(E){const P=z(E);if(!P.length)return`${Fa(E)} configuration.`;const K=P.find(Vt=>Vt.sensitivity==="public"&&Vt.description)||P.find(Vt=>Vt.description),Ee=(K==null?void 0:K.description)||"";return Ee.match(/setting for (.+)\.$/i)?`${Fa(E)} settings and runtime behaviour.`:Ee}function pe(E){const P=[...new Set(z(E).map(K=>K.apply_mode))];return P.length===1?P[0]:P.includes("restart")?"restart":P.includes("activation_required")?"activation_required":P[0]||"restart"}function ue(E){const P=[...new Set(z(E).map(K=>ye(K.apply_mode)))];return P.length?P.length===1?P[0]:`Mixed apply behaviour: ${P.join(" · ")}`:""}function ce(E){return Bl(z(E))}function ne(E){var P;return Object.hasOwn(g.value,E)?g.value[E]:(P=e.value)==null?void 0:P[E]}function ie(){const E=ne("mcp")||{},P=Object.keys(E.servers||{}).length;return`${E.enabled?"Globally enabled":"Globally disabled"} · ${P} configured server${P===1?"":"s"}.`}function ge(E,P){return P.split(".").reduce((K,Ee)=>K==null?void 0:K[Ee],E)}function we(E){const P=Oe.value;return z(E).filter(K=>dp(K.path)?!1:K.path.split(".").length<=2?!0:!K.path.includes(".*")).map(K=>({...K,key:K.path.split(".").at(-1),value:ge(P,K.path),apply_details:Bl([K]),editor:K.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Ae(E){const P=E.path.split(".");return P.length>2?P.slice(0,2).join("."):null}function F(E){const P=new Map;for(const K of we(E)){const Ee=Ae(K),tt=Ee||`${E}.__root`;P.has(tt)||P.set(tt,{key:tt,path:Ee,entries:[]}),P.get(tt).entries.push(K)}return[...P.values()].map(K=>{const Ee=K.entries.find(tt=>tt.group_description);return{...K,label:K.path?Fa(K.path.split(".").at(-1)):null,description:(Ee==null?void 0:Ee.group_description)||null,apply_details:Bl(K.entries),runtime_summaries:ke(K.entries)}})}function de(E){return{save:E.save_effect||(E.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:E.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[E.apply_mode]||"Effective runtime state is not currently observable."}}function ke(E){const P=new Map;for(const K of E){const Ee=de(K),tt=`${K.apply_mode}|${Ee.save}|${Ee.runtime}`;P.has(tt)||P.set(tt,{key:tt,label:ye(K.apply_mode),save:Ee.save,runtime:Ee.runtime})}return[...P.values()]}function Re(E){if(De(E))return E.runtime_effect||E.activation_policy||"";if(E.apply_mode==="activation_required"){const P=E.activation_policy||E.runtime_effect;return P?`Not active after saving. No activation control exists in this release. ${P}`:"Not active after saving; no activation control exists in this release."}return""}function De(E){return E.action_available===!0&&!!(E.action_label&&E.action_endpoint)}async function ct(E){if(De(E))try{if(zt(E.path))throw new Error("Save this setting before applying its action.");const P=String(E.action_method||"POST").toLowerCase(),K={post:G.post.bind(G),put:G.put.bind(G),delete:G.del.bind(G)}[P];if(!K)throw new Error("Unsupported configuration action");await K(E.action_endpoint,E.action_body||void 0),await ra(),Un("success",`${E.action_label} completed.`)}catch(P){Un("error",P.message||`${E.action_label} failed`)}}function Z(E,P){return[E.label,E.path,E.description,...E.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(P)}function Se(E){const P=u.value.trim().toLowerCase();return P?z(E).filter(K=>Z(K,P)):[]}function Le(E){const P=z(E);if(p.value!=="all"&&!P.some(Ee=>Ee.apply_state===p.value))return!1;const K=u.value.trim().toLowerCase();return!K||`${te(E)} ${E}`.toLowerCase().includes(K)?!0:P.some(Ee=>Z(Ee,K))}function Ue(E,P){return z(E).filter(K=>K.apply_state===P).length}function lt(E){return E==="all"?D.value:O.value.filter(P=>P.apply_state===E).length}function ze(E){const P=E.sections.flatMap(K=>z(K));return{fields:P.length,modified:ae.value.filter(K=>E.sections.includes(K.path.split(".")[0])).length,pending_restart:P.filter(K=>K.apply_state==="pending_restart").length,invalid:P.filter(K=>K.apply_state==="invalid").length,dormant:P.filter(K=>K.apply_state==="dormant").length}}function gt(E){var P;return Object.hasOwn(g.value,E)&&!zi((P=e.value)==null?void 0:P[E],g.value[E])}function zt(E){return ae.value.some(P=>P.path===E||P.path.startsWith(`${E}.`))}function rs(E){f.value=E,u.value="",p.value="all";try{localStorage.setItem(Xm,E)}catch{}}function Ns(E){p.value=E}function Qs(){u.value="",p.value="all"}function un(E){var P;return((P=he.value.find(K=>K.sections.includes(E)))==null?void 0:P.sections)||[]}function pn(E){const P=un(E),K=P.find(Ee=>b.value[Ee]===!0);return K||P.find(Ee=>b.value[Ee]!==!1)||null}function qs(E){return u.value&&!S.value&&Le(E)?!0:S.value?pn(E)===E:Object.hasOwn(b.value,E)?b.value[E]===!0:!0}function fn(E){const P=!qs(E);if(S.value){const K={...b.value};for(const Ee of un(E))K[Ee]===!0&&(K[Ee]=!1);K[E]=P,b.value=K;return}b.value={...b.value,[E]:P}}function ys(){x.value.push(fa(g.value)),x.value.length>Uk&&x.value.shift(),w.value=[]}function Ms(){be.value&&(ys(),g.value={},m.value={},v.value=!1)}function Mt(E,P=!1){const K=Date.now();if(P&&B.path===E&&K-B.at<Bk){B.at=K;return}ys(),B={path:E,at:K}}function xs(E,P,K){if(!P.length)return K;const Ee=fa(E??{});let tt=Ee;for(let Vt=0;Vt<P.length-1;Vt+=1){const Fs=P[Vt];tt[Fs]=fa(tt[Fs]??{}),tt=tt[Fs]}return tt[P.at(-1)]=K,Ee}function hn(E){var P;return Object.hasOwn(g.value,E)?g.value[E]:fa((P=e.value)==null?void 0:P[E])}function vt(E,P,K={}){var bi;const[Ee,...tt]=E.path.split(".");Mt(E.path,!!K.coalesce);const Vt=hn(Ee),Fs=tt.length?xs(Vt,tt,P):P,en={...g.value};if(zi(Fs,(bi=e.value)==null?void 0:bi[Ee])?delete en[Ee]:en[Ee]=Fs,g.value=en,m.value[E.path]){const Sl={...m.value};delete Sl[E.path],m.value=Sl}}function os(E){B={path:null,at:0},A.value={...A.value,[E]:String(ge(Oe.value,E)??"")}}function Qt(E){if(B={path:null,at:0},!Object.hasOwn(A.value,E))return;const P={...A.value};delete P[E],A.value=P}function _s(E){const P=A.value[E.path];if(B={path:null,at:0},P===""){m.value={...m.value,[E.path]:"Enter a number."};return}const K=Number(P);if(Number.isNaN(K)||E.type==="integer"&&!Number.isInteger(K)){m.value={...m.value,[E.path]:E.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Ee={...A.value};delete Ee[E.path],A.value=Ee,vt(E,K,{coalesce:!0})}function mn(E){return Object.hasOwn(A.value,E.path)?A.value[E.path]:E.value??""}function q(E,P){if(A.value={...A.value,[E.path]:P},P===""){m.value={...m.value,[E.path]:"Enter a number."};return}const K=Number(P);if(!Number.isFinite(K)||E.type==="integer"&&!Number.isInteger(K)){m.value={...m.value,[E.path]:E.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(m.value[E.path]){const Ee={...m.value};delete Ee[E.path],m.value=Ee}vt(E,K,{coalesce:!0})}function fe(E){const P=Number.parseInt(L.value,10);if(!Number.isInteger(P)||P<1){m.value={...m.value,[E.path]:"Warning thresholds must be positive whole numbers."};return}const K=[...new Set([...E.value||[],P])].sort((Ee,tt)=>tt-Ee);L.value="",vt(E,K)}function Pe(E,P){vt(E,(E.value||[]).filter(K=>K!==P))}function Ye(E){return E.apply_mode==="live_read"?"Odin reads the saved file value on next use.":E.apply_mode==="live_for_new_work"?"New work uses the saved file value.":E.apply_mode==="live_apply"?E.apply_handler?`Apply the saved value through ${E.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":E.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":E.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":E.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function dt(E){return E.type==="array"&&Array.isArray(E.value)&&!E.structured_container&&!E.structured_container_child&&E.sensitivity==="public"&&E.value.every(P=>["string","number","boolean"].includes(typeof P))}function qe(E){const P=String(y.value[E.path]??"").trim();if(!P)return;const K=[...new Set([...E.value||[],P])];y.value={...y.value,[E.path]:""},vt(E,K)}function Ps(E,P){vt(E,(E.value||[]).filter(K=>K!==P))}function mi(E,P){var Ee;if(!E)return null;if((Ee=E.enum)!=null&&Ee.length&&!E.enum.includes(P))return`Choose one of: ${E.enum.join(", ")}`;if(E.path==="agents.final_warning_iterations"&&(!Array.isArray(P)||!P.length))return"Add at least one warning threshold.";const K=E.constraints||{};if((E.type==="integer"||E.type==="number")&&typeof P=="number"){if(K.minimum!==void 0&&P<K.minimum)return`Must be at least ${K.minimum}${E.unit?` ${E.unit}`:""}`;if(K.maximum!==void 0&&P>K.maximum)return`Must be at most ${K.maximum}${E.unit?` ${E.unit}`:""}`}return null}function Oa(E){return $.value[E.path]||null}function aa(E){const P=`${E}.`;return Object.keys($.value).some(K=>K===E||K.startsWith(P))}function ia(){x.value.length&&(w.value.push(fa(g.value)),g.value=x.value.pop(),m.value={},A.value={},B={path:null,at:0})}function la(){w.value.length&&(x.value.push(fa(g.value)),g.value=w.value.pop(),m.value={},A.value={},B={path:null,at:0})}function gi(){!be.value||re.value||(v.value=!0,_.value=!1)}function vi(){v.value=!1}function j(){Ms()}function ye(E){return Fk[E]||Fa(E||"unknown")}function Ce(E){return`apply-${String(E||"unknown").replaceAll("_","-")}`}function cs(E){return`cfgc-field-${E.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function gn(E){return`${cs(E)}-input`}function Ds(E){const P=document.getElementById(cs(E))||document.getElementById(cs(E.split(".").slice(0,2).join(".")));P==null||P.scrollIntoView({behavior:"smooth",block:"center"})}function Un(E,P){l.value={type:E,message:P},window.setTimeout(()=>{var K;((K=l.value)==null?void 0:K.message)===P&&(l.value=null)},3500)}function La(){o.value=!1,p.value="pending_restart",u.value="";const E=Dk(n.value);E&&(E.scrollTop=0)}function xl(){o.value=!1}function _l(E=1800){M&&window.clearTimeout(M),M=window.setTimeout(wl,E)}async function wl(){if(c.value){if(U+=1,U>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Po(),k.value===0){c.value=!1,d.value=null,Un("success","Odin restarted and the saved startup settings are active.");return}}catch{}_l(2e3)}}async function kl(){if(!c.value){d.value=null;try{await G.post("/api/restart",{}),c.value=!0,U=0,o.value=!1,_l()}catch(E){d.value=E.message||"Odin could not schedule a restart."}}}async function Na(){if(!(!be.value||re.value||a.value)){a.value=!0;try{const E=Vk(e.value,g.value),P=await G.put("/api/config",E);e.value=P,g.value={},x.value=[],w.value=[],m.value={},v.value=!1;try{t.value=await Po(),r.value=null,o.value=k.value>0,Un("success",k.value?`Configuration saved. ${k.value} setting${k.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(K){r.value=K.message||"Unknown metadata error.",Un("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(E){Un("error",E.message||"Configuration could not be saved")}finally{a.value=!1}}}async function ra(){var E,P;if(!be.value){s.value=!0,i.value=null;try{const K=await G.get("/api/config"),Ee=await Po();e.value=K,t.value=Ee,r.value=null;const tt=he.value;if(tt.some(Vt=>Vt.key===f.value)||(f.value=((E=tt[0])==null?void 0:E.key)||Qa[0].key),S.value){const Fs=(((P=tt.find(en=>en.key===f.value))==null?void 0:P.sections)||[]).find(en=>b.value[en]===!0);b.value=Fs?{...b.value,[Fs]:!0}:{}}}catch(K){i.value=K.message||"Unknown configuration error"}finally{s.value=!1}}}function oa(E){if(v.value||!(E.ctrlKey||E.metaKey))return;const P=E.target;P instanceof HTMLElement&&(P.matches("input, textarea, select")||P.isContentEditable)||(!E.shiftKey&&E.key.toLowerCase()==="z"?(E.preventDefault(),ia()):(E.key.toLowerCase()==="y"||E.shiftKey&&E.key.toLowerCase()==="z")&&(E.preventDefault(),la()))}function Xs(E){S.value=E.matches}return is(b,E=>{try{localStorage.setItem(Qm,JSON.stringify(E))}catch{}},{deep:!0}),Ze(()=>{var E;ra(),document.addEventListener("keydown",oa),T=window.matchMedia("(max-width: 760px)"),Xs(T),(E=T.addEventListener)==null||E.call(T,"change",Xs)}),_t(()=>{var E;document.removeEventListener("keydown",oa),(E=T==null?void 0:T.removeEventListener)==null||E.call(T,"change",Xs),M&&window.clearTimeout(M)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:v,mobileOverflowOpen:_,warningThresholdInput:L,arrayInputs:y,healthFilters:I,visibleCategories:he,displayGroups:oe,reviewGroups:_e,sectionCount:J,fieldCount:D,hasChanges:be,changeCount:ee,changedSectionCount:ve,hasDraftErrors:re,canUndo:N,canRedo:Y,globalFilterActive:X,reviewRestartCount:Ne,pendingRestartCount:k,pendingRestartFields:He,healthCount:lt,categoryStats:ze,selectCategory:rs,selectHealthFilter:Ns,clearFilters:Qs,sectionLabel:te,sectionDescription:se,sectionFieldCount:Q,sectionHealthCount:Ue,sectionApplySummary:ue,sectionApplyDetails:ce,sectionEntries:we,fieldGroups:F,sectionSearchHits:Se,mcpConfigSummary:ie,fieldRuntimeCopy:de,fieldSpecificRuntimeNote:Re,hasHonestAction:De,runFieldAction:ct,sectionChanged:gt,fieldChanged:zt,isSectionExpanded:qs,toggleSection:fn,discardAllDrafts:Ms,setFieldValue:vt,setNumberFieldValue:q,numberInputValue:mn,beginInputEdit:os,endTextInputEdit:Qt,endInputEdit:_s,addWarningThreshold:fe,removeWarningThreshold:Pe,isScalarArray:dt,addScalarArrayItem:qe,removeScalarArrayItem:Ps,fieldError:Oa,sectionHasErrors:aa,undo:ia,redo:la,openReview:gi,closeReview:vi,mobileCancel:j,applyModeLabel:ye,applyClass:Ce,compactValue:Hk,formatValue:zk,structuredApplyCopy:Ye,fieldId:cs,fieldInputId:gn,focusField:Ds,fetchConfig:ra,saveConfig:Na,restartOdin:kl,restartLater:xl,reviewPendingRestart:La}}},Kk=/^\d{15,25}$/;function sg(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const ng={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=W(()=>new Set((e.excludedIds||[]).map(String))),r=W(()=>{const w=s.value.toLowerCase().trim();return(e.members||[]).filter(v=>l.value.has(String(v.id))?!1:w?u(v).toLowerCase().includes(w)||String(v.username||"").toLowerCase().includes(w)||String(v.id).includes(w):!0)}),o=W(()=>{const w=s.value.trim();return r.value.length===0&&Kk.test(w)&&!l.value.has(w)?w:""}),c=W(()=>r.value.length+(o.value?1:0)),d=W(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(w){return sg(w)}function p(){n.value=!0,a.value=0}function f(){p()}function b(){const w=Math.max(c.value-1,0);a.value=Math.min(a.value+1,w)}function g(){a.value=Math.max(a.value-1,0)}function A(){const w=r.value[a.value];w?L(w):o.value&&a.value===r.value.length&&y(o.value)}function L(w){y(String(w.id))}function y(w){t("select",w),s.value="",n.value=!1,a.value=0}function m(){n.value=!1}function x(){setTimeout(m,150)}return Ze(()=>{e.autofocus&&Tt(()=>{var w;return(w=i.value)==null?void 0:w.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:b,highlightPrevious:g,selectHighlighted:A,selectMember:L,selectId:y,closeOptions:m,onBlur:x}}};function up(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const Wk={components:{DiscordUserCombobox:ng},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),r=h(null),o=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=W(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=W(()=>new Map(c.value.map(O=>[String(O.id),O])));function b(O){return O.config&&O.config.enabled!==void 0?O.config.enabled:!0}function g(O){return up(O,"require_mention",a.value)}function A(O){return up(O,"respond_to_bots",a.value)}function L(O){return O.config&&Object.keys(O.config).length>0}function y(O){n.value[O]=!n.value[O]}function m(O){const H=O.discord||{};return{allowed_users:[...H.allowed_users||[]],channels:[...H.channels||[]],respond_to_bots:!!H.respond_to_bots,require_mention:!!H.require_mention,ignore_bot_ids:[...H.ignore_bot_ids||[]]}}async function x({showLoading:O=!0}={}){const H=++d;O&&(t.value=!0),s.value=null;try{const J=await G.get("/api/discord/guilds");H===d&&(e.value=J)}catch(J){H===d&&(s.value=J.message)}finally{O&&H===d&&(t.value=!1)}}async function w(){t.value=!0,s.value=null;try{const[O,H,J]=await Promise.all([G.get("/api/discord/guilds"),G.get("/api/discord/members").catch(()=>[]),G.get("/api/config")]),D=m(J),I=p.value;a.value=D,I||(i.value=JSON.parse(JSON.stringify(D))),c.value=H,e.value=O,r.value=null}catch(O){s.value=O.message}finally{t.value=!1}}async function v(O,H,J){try{await G.put("/api/discord/guild/"+O+"/config",{[H]:J}),await x({showLoading:!1})}catch(D){s.value=D.message}}async function _(O,H,J,D){try{await G.put("/api/discord/channel/"+O+"/config",{[J]:D}),await x({showLoading:!1})}catch(I){s.value=I.message}}async function S(O,H){try{await G.put("/api/discord/channel/"+O+"/config",{clear:!0}),await x({showLoading:!1})}catch(J){s.value=J.message}}function T(O,H){const J=String(H);if(!O.userAutocomplete)return J;const D=f.value.get(J);return D?sg(D):J}function M(O,H=null){const J=String(H??o.value[O]??"").trim();!J||i.value[O].includes(J)||(i.value[O]=[...i.value[O],J],o.value={...o.value,[O]:""})}function B(O,H){i.value[O]=i.value[O].filter(J=>J!==H)}async function U(){if(!(!p.value||l.value)){l.value=!0,r.value=null;try{const H=(await G.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...H.allowed_users||[]],channels:[...H.channels||[]],respond_to_bots:!!H.respond_to_bots,require_mention:!!H.require_mention,ignore_bot_ids:[...H.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(O){r.value=O.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ze(w),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:b,guildMention:g,guildBots:A,hasOverride:L,toggleGuild:y,fetchAll:w,fetchGuilds:x,setGuildConfig:v,setChannelConfig:_,clearOverride:S,globalItemLabel:T,addGlobalItem:M,removeGlobalItem:B,saveGlobalDefaults:U}}},ws=e=>e==null?e:JSON.parse(JSON.stringify(e));function Zk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const b=new Map;function g(v){d+=1;const _=c.then(v,v);return c=_.catch(()=>{}),_}function A(v,_){f=ws(v),b.clear();for(const[S,T]of Object.entries(_||{}))b.set(S,ws(T))}function L(v){const _=ws(v),S=++u;return g(async()=>{try{await e(ws(_)),f=ws(_),S===u&&n(ws(_))}catch(T){S===u&&(a(ws(f)),o(T,{kind:"default"}))}})}function y(v,_){const S=ws(_),T=(p.get(v)||0)+1;return p.set(v,T),g(async()=>{try{await t(v,ws(S)),b.set(v,ws(S)),T===p.get(v)&&i(v,ws(S))}catch(M){T===p.get(v)&&(l(v,ws(b.get(v)??null)),o(M,{kind:"user",uid:v}))}})}function m(v){const _=(p.get(v)||0)+1;return p.set(v,_),g(async()=>{try{await s(v),b.delete(v),_===p.get(v)&&r(v)}catch(S){_===p.get(v)&&(l(v,ws(b.get(v)??null)),o(S,{kind:"delete",uid:v}))}})}async function x(){for(;;){const v=c;if(await v,v===c)return d}}async function w(v){for(;;){const _=await x(),S=await v();if(_===d)return S}}return{seed:A,saveDefault:L,saveUser:y,deleteUser:m,whenIdle:x,readSnapshot:w,get revision(){return d}}}const Jk={components:{DiscordUserCombobox:ng},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h([]),o=W(()=>{const v={};for(const _ of r.value)v[_.id]=_;return v});function c(v){return o.value[v]||null}function d(v,_){return v?v.allowed_hosts===null||v.allowed_hosts===void 0?{allowed_hosts:[..._],default_host:v.default_host||"",allow_all:!0}:{allowed_hosts:v.allowed_hosts,default_host:v.default_host||"",allow_all:!1}:{allowed_hosts:[..._],default_host:_[0]||"",allow_all:!0}}const u=Zk({applyDefault:async v=>{const _=v.allow_all?null:v.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:_,default_host:v.default_host})},applyUser:async(v,_)=>{const S=_.allow_all?null:_.allowed_hosts;await G.put(`/api/host-access/user/${v}`,{allowed_hosts:S,default_host:_.default_host})},applyDelete:v=>G.del(`/api/host-access/user/${v}`),onDefaultConfirmed:()=>Ie.success("Default policy updated"),onDefaultRollback:v=>{v&&(a.value=v)},onUserConfirmed:v=>{const _=c(v);Ie.success(`Updated access for ${_?_.display_name:v}`)},onUserRollback:(v,_)=>{const S={...i.value};_?S[v]=_:delete S[v],i.value=S},onUserDeleted:v=>{const _={...i.value};delete _[v],i.value=_},onError:(v,_)=>{var T;const S=_.uid?` ${((T=c(_.uid))==null?void 0:T.display_name)||_.uid}`:"";Ie.error(`${v.message||"Failed to save"} — reverted${S}`)}});let p=0;async function f(){const v=++p;e.value=!0,t.value="";try{const _=await u.readSnapshot(()=>G.get("/api/host-access"));if(v!==p)return;s.value=_,n.value=_.available_hosts||[],a.value=d(_.default_policy,n.value);const S=_.users||{},T={};for(const[M,B]of Object.entries(S))T[M]=d(B,n.value);i.value=T,u.seed(a.value,T)}catch(_){v===p&&(t.value=_.message||"Failed to fetch host access data")}finally{v===p&&(e.value=!1)}try{const _=await G.get("/api/discord/members")||[];v===p&&(r.value=_)}catch{v===p&&(r.value=[])}}function b(){u.saveDefault(a.value)}function g(v,_){a.value.allow_all=!1,_?a.value.allowed_hosts.includes(v)||a.value.allowed_hosts.push(v):(a.value.allowed_hosts=a.value.allowed_hosts.filter(S=>S!==v),a.value.default_host===v&&(a.value.default_host=a.value.allowed_hosts[0]||"")),b()}function A(v){const _=i.value[v];_&&u.saveUser(v,_)}function L(v,_,S){const T=i.value[v];T&&(T.allow_all=!1,S?T.allowed_hosts.includes(_)||T.allowed_hosts.push(_):(T.allowed_hosts=T.allowed_hosts.filter(M=>M!==_),T.default_host===_&&(T.default_host=T.allowed_hosts[0]||"")),A(v))}function y(v,_){const S=i.value[v];S&&(S.default_host=_,A(v))}function m(){l.value=!0}function x(v){!/^\d{15,25}$/.test(v)||i.value[v]||(i.value[v]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(v),l.value=!1)}async function w(v){const _=c(v);await Jt({title:"Remove user override",message:`Remove the host access override for ${_?_.display_name:v}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(v),i.value[v]||Ie.success(`Removed override for ${_?_.display_name:v}`))}return Ze(f),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:f,saveDefaultPolicy:b,toggleDefaultHost:g,getMember:c,toggleUserHost:L,setUserDefault:y,openAddUser:m,addUserById:x,deleteUser:w}}},Yk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=W(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=W(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(S){return S==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":S==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function b(){e.value=!0,t.value="";try{const S=await G.get("/api/tokens");s.value=S.tokens||[],n.value=S.available_hosts||[]}catch(S){t.value=S.message||"Failed to load tokens"}finally{e.value=!1}}function g(S){return!S||!S.trim()?[]:S.split(",").map(T=>T.trim()).filter(Boolean)}function A(S,T){const M=c.value.allowed_hosts;if(T&&!M.includes(S)&&M.push(S),!T){const B=M.indexOf(S);B>=0&&M.splice(B,1)}}function L(S,T){const M=d.value.allowed_hosts;if(T&&!M.includes(S)&&M.push(S),!T){const B=M.indexOf(S);B>=0&&M.splice(B,1)}}async function y(){var S;i.value=!0;try{const T=g(c.value.allowed_tools_str),M=c.value.host_mode,B=M==="none"?[]:M==="select"?c.value.allowed_hosts:null,U={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:T.length?T:[]};B!==null&&(U.allowed_hosts=B),U.default_host=c.value.default_host||"";const O=await G.post("/api/tokens",U);l.value=O.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Ie.success("Token created"),await b()}catch(T){Ie.error(((S=T.data)==null?void 0:S.error)||T.message||"Failed to create token")}finally{i.value=!1}}function m(S){r.value=S;const T=S.allowed_hosts;let M="default";T==null?M="default":Array.isArray(T)&&T.length===0?M="none":Array.isArray(T)&&(M="select"),d.value={username:S.username||"",tier:S.tier||"admin",label:S.label||"",host_mode:M,allowed_hosts:Array.isArray(T)?[...T]:[],default_host:S.default_host||"",allowed_tools_str:(S.allowed_tools||[]).join(", ")}}async function x(){var S;if(r.value){o.value=!0;try{const T=g(d.value.allowed_tools_str),M=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:T};M==="none"?B.allowed_hosts=[]:M==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(r.value.user_id),B),r.value=null,Ie.success("Token updated"),await b()}catch(T){Ie.error(((S=T.data)==null?void 0:S.error)||T.message||"Failed to update")}finally{o.value=!1}}}async function w(S){var M;if(await Jt({title:"Regenerate token",message:`Regenerate token for ${S.username||S.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await G.post("/api/tokens/"+encodeURIComponent(S.user_id)+"/regenerate");l.value=B.token,Ie.success("Token regenerated")}catch(B){Ie.error(((M=B.data)==null?void 0:M.error)||B.message||"Failed to regenerate")}}async function v(S){var M;if(await Jt({title:"Delete token",message:`Delete token for ${S.username||S.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(S.user_id)),Ie.success("Token deleted"),await b()}catch(B){Ie.error(((M=B.data)==null?void 0:M.error)||B.message||"Failed to delete")}}async function _(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ie.success("Copied to clipboard")}catch{Ie.error("Copy failed — select and copy manually")}}return Ze(b),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:b,tierBadge:f,toggleCreateHost:A,toggleEditHost:L,createToken:y,startEdit:m,saveEdit:x,confirmRegenerate:w,confirmDelete:v,copyToken:_}}},Qk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),Xk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),eS=Object.freeze(["enabled","base_url","model","max_tokens"]),tS=Object.freeze(["enabled","model","max_tokens"]);function ro(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function pp(e){return ro(e,Qk)}function fp(e){return ro(e,Xk)}function sS(e,{includeApiKey:t=!1}={}){const s=ro(e,eS);return t&&(s.api_key=e.api_key),s}function nS(e){return{timeout:e.timeout}}function aS(e,{includeApiKey:t=!1}={}){const s=ro(e,tS);return t&&(s.api_key=e.api_key),s}function iS(e){return{timeout:e.timeout}}function Hl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const lS={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=W(()=>{const j=n.value.model;return j&&!a.includes(j)?[j,...a]:a}),l=W(()=>{const j=n.value.agent_model;return j&&j!=="auto"&&!a.includes(j)?[j,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=W(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=W(()=>{const j=n.value.agent_model;return j==="auto"?!0:!r.includes(j||n.value.model)}),d=W(()=>{const j=n.value.agent_reasoning_effort;return j==="auto"?!1:(j||n.value.reasoning_effort)==="max"}),u=j=>r.includes(j)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),p=j=>r.includes(j)&&d.value,f=h({enabled:!1,model:"gpt-5.6-luna"}),b=h({unavailable_reason:null}),g=W(()=>{const j=f.value.model;return j&&!a.includes(j)?[j,...a]:a});function A(j){const ye=j.target.value;f.value.enabled=ye!=="",ye!==""&&(f.value.model=ye),os()}const L=h(!1),y=h({codex:!1,ollama:!1,kimi:!1}),m=h(null),x=h(!1),w=h(""),v=h(null),_=h(!1);let S=0;const T=W(()=>{var j;return Object.entries(((j=m.value)==null?void 0:j.models)||{}).map(([ye,Ce])=>{var cs,gn,Ds;return{model:ye,floor:Ce.floor,override:Ce.override,effectiveBudget:(cs=Ce.effective)==null?void 0:cs.effective_budget,configuredPrimaryChars:(gn=Ce.configured)==null?void 0:gn.primary_chars,primaryChars:(Ds=Ce.effective)==null?void 0:Ds.primary_chars,provenance:Ce.provenance,clampExpiresAt:Ce.clamp_expires_at}})}),M=W(()=>{var j;return((j=m.value)==null?void 0:j.clamps)||[]}),B=W(()=>{var j,ye;return((ye=(j=m.value)==null?void 0:j.models)==null?void 0:ye[n.value.model])||null}),U=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),O=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),H=h(!1),J=h(!1),D=h(!1),I=h(!1),N=h(!1),Y=h(!1),he=h(!1),Oe=h({configured:!1}),ae=h([]),be=h(""),ee=h(!1),ve=h(!1),X=h({configured:!1}),$=h([]),re=h(""),oe=h(!1),_e=h(!1),Ne=h(!0),He=h(""),k=h({configured:!1,accounts:[]}),R=h(null),z=h(null),Q=h(""),te=h(null),se=h(!1),pe=h(null),ue=h(null),ce=h("");let ne=null;function ie(j,ye="success"){Ie(j,ye==="error"?"error":"success")}function ge(j){if(!j)return"?";const ye=j/(1024*1024*1024);return ye>=1?ye.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function we(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Ae(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function F(j){const ye=new Date(j);return Number.isNaN(ye.getTime())?"unknown":ye.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function de(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function ke(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function Re(j){const ye=n.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(ye))&&Number(ye)>j.floor}function De(j,ye){const Ce={...n.value.context_budget_overrides};ye.target.value===""?delete Ce[j]:Ce[j]=Number(ye.target.value),n.value.context_budget_overrides=Ce,_.value=!0}function ct(j){n.value.context_utilization=j.target.value===""?"":Number(j.target.value),_.value=!0}function Z(j){const ye={...n.value.context_budget_overrides};delete ye[j],n.value.context_budget_overrides=ye,_.value=!0}async function Se(){e.value=!0,await Promise.all([Le(),lt(),Qs(),ze(),Ue()]),e.value=!1}async function Le({preserveBasic:j=!1,preserveAdvanced:ye=!1}={}){try{const Ce=await G.get("/api/llm/status");t.value=Ce,s.value=Ce.active_provider||"codex",Ce.codex&&!vt.pending()&&(j||(n.value.enabled=Ce.codex.enabled,n.value.model=Ce.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ce.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ce.codex.agent_reasoning_effort||"",n.value.agent_model=Ce.codex.agent_model||""),ye||(n.value.request_timeout_seconds=Ce.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ce.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ce.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ce.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ce.codex.context_compression||{}},!_.value&&!D.value&&(n.value.context_budget_overrides={...Ce.codex.context_budget_overrides||{}},n.value.context_utilization=Ce.codex.context_utilization??n.value.context_utilization))),Ce.ollama&&!Qt.pending()&&(j||(U.value.enabled=Ce.ollama.enabled,U.value.base_url=Ce.ollama.base_url||"",U.value.model=Ce.ollama.model||"",U.value.max_tokens=Ce.ollama.max_tokens||4096),ye||(U.value.timeout=Ce.ollama.timeout??U.value.timeout)),Ce.kimi&&!_s.pending()&&(j||(O.value.enabled=Ce.kimi.enabled,O.value.model=Ce.kimi.model||"",O.value.max_tokens=Ce.kimi.max_tokens||4096),ye||(O.value.timeout=Ce.kimi.timeout??O.value.timeout)),Ce.auxiliary&&(b.value=Ce.auxiliary,os.pending()||(f.value.enabled=Ce.auxiliary.enabled,f.value.model=Ce.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Ue(){const j=++S;x.value=!0,w.value="";try{const ye=await G.get("/api/context/windows");if(j!==S)return;m.value=ye,!D.value&&!_.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(ye.models||{}).filter(([,Ce])=>Ce.override!=null).map(([Ce,cs])=>[Ce,cs.override])),n.value.context_utilization=ye.utilization??n.value.context_utilization)}catch(ye){j===S&&(w.value=ye.message||"Failed to load context budgets")}finally{j===S&&(x.value=!1)}}async function lt(){try{if(Oe.value=await G.get("/api/ollama/status"),Oe.value.model&&(be.value=Oe.value.model),Oe.value.configured)try{const j=await G.get("/api/ollama/models");ae.value=j.models||[]}catch{ae.value=[]}else if(U.value.base_url)try{const j=await G.post("/api/ollama/probe-models",{base_url:U.value.base_url});ae.value=j.models||[]}catch{ae.value=[]}}catch{Oe.value={configured:!1}}}async function ze(){Ne.value=!0,He.value="";try{k.value=await G.get("/api/codex/status")}catch(j){He.value=j.message||"Failed to fetch Codex status"}finally{Ne.value=!1}}async function gt(){const j=t.value?t.value.active_provider:"codex";he.value=!0;try{const ye=await G.post("/api/llm/switch",{provider:s.value});ye.error?(s.value=j,ie(ye.error,"error")):(ie("Switched to "+s.value+" ("+ye.model+")"),await Se())}catch(ye){s.value=j,ie(ye.message||"Switch failed","error")}finally{he.value=!1}}async function zt(){ee.value=!0;try{const j=await G.post("/api/ollama/reload");ie(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await Se()}catch(j){ie(j.message||"Reload failed","error")}finally{ee.value=!1}}async function rs(){ve.value=!0;try{await G.post("/api/ollama/model",{model:be.value}),ie("Model set to "+be.value),await Se()}catch(j){ie(j.message||"Failed","error")}finally{ve.value=!1}}async function Ns(){const j=U.value.base_url;if(!j){ie("Enter a base URL first","error");return}Y.value=!0;try{const ye=await G.post("/api/ollama/probe-models",{base_url:j});ae.value=ye.models||[],ae.value.length?(ie(ae.value.length+" model(s) found"),!U.value.model&&ae.value.length&&(U.value.model=ae.value[0].name)):ie("No models found at "+j,"error")}catch(ye){ie(ye.message||"Could not reach Ollama","error")}finally{Y.value=!1}}async function Qs(){try{if(X.value=await G.get("/api/kimi/status"),X.value.model&&(re.value=X.value.model),X.value.configured)try{const j=await G.get("/api/kimi/models");$.value=j.models||[]}catch{$.value=[]}}catch{X.value={configured:!1}}}async function un(){oe.value=!0;try{const j=await G.post("/api/kimi/reload");ie(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await Se()}catch(j){ie(j.message||"Reload failed","error")}finally{oe.value=!1}}async function pn(){_e.value=!0;try{await G.post("/api/kimi/model",{model:re.value}),ie("Model set to "+re.value),await Se()}catch(j){ie(j.message||"Failed","error")}finally{_e.value=!1}}async function qs(){if(D.value){vt();return}D.value=!0;const j=pp(n.value);try{await G.put("/api/llm/codex/config",j),ie("Codex config saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ze()])}catch(ye){ie(ye.message||"Failed","error");const Ce=JSON.stringify(pp(n.value))!==JSON.stringify(j);await Promise.all([Le({preserveBasic:Ce,preserveAdvanced:!0}),ze()])}finally{D.value=!1}}async function fn(){if(D.value)return;D.value=!0;const j=fp(n.value);try{await G.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(_.value=!1),ie("Codex advanced settings saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ze(),Ue()])}catch(ye){ie(ye.message||"Failed","error");const Ce=JSON.stringify(fp(n.value))!==JSON.stringify(j);await Promise.all([Le({preserveBasic:!0,preserveAdvanced:Ce}),ze(),Ue()])}finally{D.value=!1}}async function ys(){if(I.value){Qt();return}I.value=!0;try{const j=H.value?U.value.api_key:null,ye=sS(U.value,{includeApiKey:j!==null});await G.put("/api/llm/ollama/config",ye),ie("Ollama config saved"),j!==null&&U.value.api_key===j&&(U.value.api_key="",H.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),lt()])}catch(j){ie(j.message||"Failed","error")}finally{I.value=!1}}async function Ms(){if(!I.value){I.value=!0;try{await G.put("/api/llm/ollama/config",nS(U.value)),ie("Ollama timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),lt()])}catch(j){ie(j.message||"Failed","error")}finally{I.value=!1}}}async function Mt(){if(N.value){_s();return}N.value=!0;try{const j=J.value?O.value.api_key:null,ye=aS(O.value,{includeApiKey:j!==null});await G.put("/api/llm/kimi/config",ye),ie("Kimi config saved"),j!==null&&O.value.api_key===j&&(O.value.api_key="",J.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Qs()])}catch(j){ie(j.message||"Failed","error")}finally{N.value=!1}}async function xs(){if(!N.value){N.value=!0;try{await G.put("/api/llm/kimi/config",iS(O.value)),ie("Kimi timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Qs()])}catch(j){ie(j.message||"Failed","error")}finally{N.value=!1}}}async function hn(){if(L.value){os();return}L.value=!0;try{await G.put("/api/llm/auxiliary/config",f.value),ie("Auxiliary config saved"),await Le()}catch(j){ie(j.message||"Failed","error"),await Le()}finally{L.value=!1}}const vt=Hl(qs),os=Hl(hn),Qt=Hl(ys),_s=Hl(Mt),mn=()=>(vt.cancel(),qs()),q=()=>(Qt.cancel(),ys()),fe=()=>(_s.cancel(),Mt()),Pe=()=>fn(),Ye=()=>Ms(),dt=()=>xs();async function qe(j){const ye=j.account_key+":"+j.model;v.value=ye;try{const Ce=await G.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});ie(Ce.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Ue()}catch(Ce){ie(Ce.message||"Failed to clear clamp","error"),await Ue()}finally{v.value=null}}async function Ps(j){try{await G.post("/api/codex/account/"+j+"/activate"),ie("Active account switched"),await ze()}catch(ye){ie(ye.message||"Failed","error")}}async function mi(j){R.value=j;try{await G.post("/api/codex/account/"+j+"/refresh"),ie("Token refreshed"),await ze()}catch(ye){ie(ye.message||"Refresh failed","error")}finally{R.value=null}}function Oa(j,ye){z.value=j,Q.value=ye||""}async function aa(j){try{await G.put("/api/codex/account/"+j+"/label",{label:Q.value}),ie("Label updated"),z.value=null,await ze()}catch(ye){ie(ye.message||"Failed","error")}}async function ia(j,ye){if(await Jt({title:"Delete Codex account",message:`Delete ${ye||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+j),ie("Deleted. Pool reloaded."),await ze()}catch(cs){ie(cs.message||"Failed","error")}}async function la(){se.value=!0;try{const j=await G.post("/api/codex/device-code");pe.value=j,te.value="pending",gi(j)}catch(j){ie(j.message||"Failed","error")}finally{se.value=!1}}async function gi(j){ne={cancelled:!1};const ye=ne;try{const Ce=await G.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(ye.cancelled)return;ue.value=Ce,te.value="success",await Se()}catch(Ce){if(ye.cancelled)return;ce.value=Ce.message||"Device login failed",te.value="error"}}function vi(){ne&&(ne.cancelled=!0),te.value=null,pe.value=null}return Ze(Se),_t(()=>{ne&&(ne.cancelled=!0),vt.cancel(),os.cancel(),Qt.cancel(),_s.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:he,advancedOpen:y,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:p,auxForm:f,auxData:b,auxModelOptions:g,onAuxModelChange:A,savingAux:L,saveAuxConfigDebounced:os,ollamaForm:U,kimiForm:O,savingCodex:D,savingOllama:I,savingKimi:N,probingOllama:Y,ollamaKeyDirty:H,kimiKeyDirty:J,ollamaStatus:Oe,ollamaModels:ae,ollamaSelectedModel:be,reloading:ee,settingModel:ve,kimiStatus:X,kimiModels:$,kimiSelectedModel:re,reloadingKimi:oe,settingKimiModel:_e,codexLoading:Ne,codexError:He,codexData:k,refreshing:R,editingLabel:z,labelValue:Q,contextWindows:m,contextWindowsLoading:x,contextWindowsError:w,contextBudgetRows:T,activeClampRows:M,activeContextBudget:B,clearingClamp:v,contextPolicyDirty:_,deviceState:te,deviceLoading:se,deviceInfo:pe,deviceResult:ue,deviceError:ce,fetchAll:Se,switchProvider:gt,reloadOllama:zt,setOllamaModel:rs,reloadKimi:un,setKimiModel:pn,probeOllamaModels:Ns,saveCodexConfig:qs,saveOllamaConfig:ys,saveKimiConfig:Mt,saveCodexAdvancedConfig:fn,saveOllamaAdvancedConfig:Ms,saveKimiAdvancedConfig:xs,saveCodexConfigDebounced:vt,saveOllamaConfigDebounced:Qt,saveKimiConfigDebounced:_s,saveCodexConfigNow:mn,saveOllamaConfigNow:q,saveKimiConfigNow:fe,saveCodexAdvancedConfigNow:Pe,saveOllamaAdvancedConfigNow:Ye,saveKimiAdvancedConfigNow:dt,activateAccount:Ps,refreshAccount:mi,startEditLabel:Oa,saveLabel:aa,deleteAccount:ia,startDeviceLogin:la,cancelDeviceLogin:vi,formatSize:ge,fetchContextWindows:Ue,clearContextClamp:qe,setContextOverride:De,setContextUtilization:ct,resetContextOverride:Z,overrideAboveFloor:Re,formatCount:we,formatContextCeiling:Ae,formatExpiry:F,shortAccountKey:de,provenanceClass:ke}}},hp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function rS(e){return hp[e]||hp[(e||"").toLowerCase()]||"text-gray-400"}const oS={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=W(()=>{var v;return Object.values(((v=i.value)==null?void 0:v.totals)||{}).reduce((_,S)=>_+Number(S||0),0)}),u=h(""),p=h(0),f=h([]),b=W(()=>f.value.map(v=>`${v.label} (${v.path}${v.reason?`: ${v.reason}`:""})`).join("; ")),g=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let A=null;async function L(){var M;const v=await Promise.allSettled(g.map(B=>G.get(B.path))),_=B=>v[B].status==="fulfilled"?v[B].value:null;t.value=_(0)||{};const S=_(1);s.value=Array.isArray(S)?S:S&&S.subsystems||[],n.value=_(2)||{},a.value=_(3)||{},i.value=_(4),l.value=_(5),r.value=_(6),o.value=_(7),c.value=_(8);const T=v.filter(B=>B.status==="rejected");if(f.value=v.flatMap((B,U)=>{var O;return B.status==="rejected"?[{...g[U],reason:((O=B.reason)==null?void 0:O.message)||"request failed"}]:[]}),p.value=f.value.length,T.length===v.length){const B=(M=T[0])==null?void 0:M.reason;u.value=(B==null?void 0:B.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",L()}let m=!1;function x(){m||(m=!0,L(),A||(A=setInterval(L,3e4)))}function w(){m&&(m=!1,A&&(clearInterval(A),A=null))}return Ze(x),Is(x),Os(w),_t(w),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:b,endpoints:g,retry:y,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:rS,formatAgeSeconds:Uw}}},cS={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await Jt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return Ze(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},ag=[{id:"health",label:"Health",component:Rk},{id:"resources",label:"Resources",component:Ik},{id:"logs",label:"Logs",component:Mk},{id:"config",label:"Config",component:Gk},{id:"discord",label:"Discord",component:Wk},{id:"host-access",label:"Host Access",component:Jk},{id:"api-tokens",label:"API Tokens",component:Yk},{id:"llm",label:"LLM Config",component:lS},{id:"internals",label:"Internals",component:oS},{id:"update",label:"Update",component:cS}],dS={components:{TabbedPage:lo},setup(){return{tabs:ag}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},zl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),uS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...zl("Operations","operations","/operations",Zm),...zl("History","history","/history",Jm),...zl("Capabilities","capabilities","/capabilities",Ym),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...zl("System","system","/system",ag)],hs=sa({open:!1,query:"",selected:0});function mp(){hs.query="",hs.selected=0,hs.open=!0}function Do(){hs.open=!1}function pS(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const fS={setup(){const e=Hm(),t=h(null),s=W(()=>{const i=hs.query.trim().toLowerCase();return uS.map(l=>({...l,_score:pS(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});is(()=>hs.open,async i=>{var l;i&&(await Tt(),(l=t.value)==null||l.focus())}),is(()=>hs.query,()=>{hs.selected=0});function n(i){Do(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Do();return}if(i.key==="ArrowDown")i.preventDefault(),hs.selected=Math.min(hs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),hs.selected=Math.max(hs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[hs.selected];l&&n(l)}}return{state:hs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Do}},template:`
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
  `},xc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(xc));const hS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>si("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[si("path",{d:xc[e.name]||xc.info})])}},mS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function gp(e){return[...e.querySelectorAll(mS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const gS={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=gp(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||gp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},vS={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const p=W(()=>{const O=e.value.uptime_seconds||0,H=Math.floor(O/86400),J=Math.floor(O%86400/3600),D=Math.floor(O%3600/60),I=[];return H>0&&I.push(`${H}d`),J>0&&I.push(`${J}h`),(I.length===0||H===0&&J===0)&&I.push(`${D}m`),I.join(" ")}),f=W(()=>{const O=e.value.uptime_seconds||0;return 125.66*(1-Math.min(O/86400,1))}),b=W(()=>{const O=e.value;return[{label:"Guilds",value:O.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:O.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:O.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${O.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:O.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:O.loop_count>0?"text-green-400":"",highlight:O.loop_count>0},{label:"Agents",value:O.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:O.agent_count>0?`${O.agent_count} total`:"",subColor:"text-gray-500",highlight:(O.agent_running??0)>0},{label:"Processes",value:O.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:O.process_count>0?`${O.process_count} total`:"",subColor:"text-gray-500",highlight:(O.process_running??0)>0},{label:"Schedules",value:O.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(O.schedule_failing>0?`${O.schedule_failing} failing`:"")+(O.schedule_failing>0&&O.schedule_paused>0?", ":"")+(O.schedule_paused>0?`${O.schedule_paused} paused`:"")||void 0,subColor:O.schedule_failing>0?"text-red-400":"text-yellow-400",color:O.schedule_failing>0?"text-red-400":"",highlight:O.schedule_failing>0},{label:"Users",value:O.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=W(()=>{const O=e.value,H=[];return H.push({label:"Bot",status:O.status==="online"?"ok":"warn",detail:O.status==="online"?"Online":"Starting"}),(O.schedule_failing||0)>0?H.push({label:"Schedules",status:"error",detail:`${O.schedule_failing} failing`}):(O.schedule_count||0)>0&&H.push({label:"Schedules",status:"ok",detail:`${O.schedule_count} configured`}),(O.loop_count||0)>0&&H.push({label:"Loops",status:"ok",detail:`${O.loop_count} active`}),(O.agent_running||0)>0&&H.push({label:"Agents",status:"ok",detail:`${O.agent_running} running`}),(O.process_running||0)>0&&H.push({label:"Processes",status:"ok",detail:`${O.process_running} running`}),H});async function A(){try{e.value=await G.get("/api/status"),s.value=null}catch(O){s.value=O.message}finally{t.value=!1}}async function L(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const O=await G.get("/api/knowledge");c.value=(Array.isArray(O)?O:[]).reduce((H,J)=>H+(J.chunks||0),0)}catch{c.value=null}}async function x(){try{const O=await G.get("/api/agents");r.value=O.filter(H=>H.status==="running")}catch{}}async function w(){d.value={...d.value,reload:!0};try{await G.post("/api/reload"),Ie.success("Config reloaded")}catch(O){Ie.error(O.message)}d.value={...d.value,reload:!1}}async function v(){if(!await Jt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const H=e.value.session_count;e.value={...e.value,session_count:0};try{const J=await G.post("/api/sessions/clear-all");Ie.success(`Cleared ${J.count} session${J.count!==1?"s":""}`),await A()}catch(J){e.value={...e.value,session_count:H},Ie.error(J.message)}d.value={...d.value,clearSessions:!1}}async function _(){if(!await Jt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const H=e.value.loop_count;e.value={...e.value,loop_count:0};try{const J=await G.post("/api/loops/stop-all");Ie.success(J.result),await A()}catch(J){e.value={...e.value,loop_count:H},Ie.error(J.message)}d.value={...d.value,stopLoops:!1}}function S(){t.value=!0,s.value=null,A(),L(),y(),x()}let T=null,M=null,B=null;function U(O){if(O.payload&&O.payload.tool_name){const H={...O.payload,_isNew:!0,_key:++u};n.value.unshift(H),n.value.length>10&&n.value.pop(),o.value++,H.error&&(i.value.unshift(H),i.value.length>5&&i.value.pop()),setTimeout(()=>{H._isNew=!1},1500),clearTimeout(B),B=setTimeout(()=>{o.value=0},1e4)}}return Ze(async()=>{await Promise.all([A(),L(),y(),x(),m()]),T=setInterval(A,15e3),M=setInterval(x,1e4),Ge.subscribe("events",U)}),_t(()=>{T&&clearInterval(T),M&&clearInterval(M),clearTimeout(B),Ge.unsubscribe("events",U)}),{status:e,loading:t,error:s,uptime:p,uptimeRingOffset:f,stats:b,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:L,fetchStatus:A,formatTime:zm,formatDuration:ui,retry:S,reloadConfig:w,clearSessions:v,stopAllLoops:_}}};/*! @license DOMPurify 3.4.14 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.14/LICENSE */function vp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function bS(e){if(Array.isArray(e))return e}function yS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function xS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function _S(e,t){return bS(e)||yS(e,t)||wS(e,t)||xS()}function wS(e,t){if(e){if(typeof e=="string")return vp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?vp(e,t):void 0}}const ig=Object.entries,bp=Object.setPrototypeOf,kS=Object.isFrozen,SS=Object.getPrototypeOf,CS=Object.getOwnPropertyDescriptor;let Nt=Object.freeze,Dt=Object.seal,Ha=Object.create,lg=typeof Reflect<"u"&&Reflect,_c=lg.apply,wc=lg.construct;Nt||(Nt=function(t){return t});Dt||(Dt=function(t){return t});_c||(_c=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});wc||(wc=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const ha=Rt(Array.prototype.forEach),TS=Rt(Array.prototype.lastIndexOf),yp=Rt(Array.prototype.pop),Ci=Rt(Array.prototype.push),ES=Rt(Array.prototype.splice),Xa=Array.isArray,Mi=Rt(String.prototype.toLowerCase),Fo=Rt(String.prototype.toString),xp=Rt(String.prototype.match),Ti=Rt(String.prototype.replace),_p=Rt(String.prototype.indexOf),AS=Rt(String.prototype.trim),RS=Rt(Number.prototype.toString),IS=Rt(Boolean.prototype.toString),wp=typeof BigInt>"u"?null:Rt(BigInt.prototype.toString),kp=typeof Symbol>"u"?null:Rt(Symbol.prototype.toString),ms=Rt(Object.prototype.hasOwnProperty),Ei=Rt(Object.prototype.toString),qt=Rt(RegExp.prototype.test),ua=OS(TypeError);function Rt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return _c(e,t,n)}}function OS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return wc(e,s)}}function Qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Mi;if(bp&&bp(e,null),!Xa(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(kS(t)||(t[n]=i),a=i)}e[a]=!0}return e}function LS(e){for(let t=0;t<e.length;t++)ms(e,t)||(e[t]=null);return e}function Ss(e){const t=Ha(null);for(const n of ig(e)){var s=_S(n,2);const a=s[0],i=s[1];ms(e,a)&&(Xa(i)?t[a]=LS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Ss(i):t[a]=i)}return t}function NS(e){switch(typeof e){case"string":return e;case"number":return RS(e);case"boolean":return IS(e);case"bigint":return wp?wp(e):"0";case"symbol":return kp?kp(e):"Symbol()";case"undefined":return Ei(e);case"function":case"object":{if(e===null)return Ei(e);const t=e,s=Gs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Ei(n)}return Ei(e)}default:return Ei(e)}}function Gs(e,t){for(;e!==null;){const n=CS(e,t);if(n){if(n.get)return Rt(n.get);if(typeof n.value=="function")return Rt(n.value)}e=SS(e)}function s(){return null}return s}function MS(e){try{return qt(e,""),!0}catch{return!1}}const Sp=Nt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),$o=Nt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Uo=Nt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),PS=Nt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Bo=Nt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),DS=Nt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Cp=Nt(["#text"]),Tp=Nt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Ho=Nt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dominant-baseline","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","pointer-events","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-orientation","text-rendering","textlength","type","u1","u2","unicode","values","vector-effect","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Ep=Nt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Vl=Nt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),FS=Dt(/{{[\w\W]*|^[\w\W]*}}/g),$S=Dt(/<%[\w\W]*|^[\w\W]*%>/g),US=Dt(/\${[\w\W]*/g),BS=Dt(/^data-[\-\w.\u00B7-\uFFFF]+$/),HS=Dt(/^aria-[\-\w]+$/),Ap=Dt(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),zS=Dt(/^(?:\w+script|data):/i),VS=Dt(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),jS=Dt(/^html$/i),qS=Dt(/^[a-z][.\w]*(-[.\w]+)+$/i),Rp=Dt(/<[/\w!]/g),Ip=Dt(/<[/\w]/g),GS=Dt(/<\/no(script|embed|frames)/i),KS=Dt(/\/>/i),ks={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,processingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},rg=["style","script","xmp","iframe","noembed","noframes","plaintext","noscript"],WS=Nt(Qe({},rg)),ZS=(function(){const e={};return ha(rg,t=>{e[t]=Dt(new RegExp("</"+t+"(?=[\\t\\n\\f\\r />])","i"))}),Nt(e)})(),JS=function(){return typeof window>"u"?null:window},YS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Op=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}},Vn=function(t,s,n,a){return ms(t,s)&&Xa(t[s])?Qe(a.base?Ss(a.base):{},t[s],a.transform):n},zo=function(t,s,n){const a=ms(t,s)?t[s]:void 0;return a&&typeof a=="object"?Ss(a):n()};function og(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:JS();const t=me=>og(me);if(t.version="3.4.14",t.removed=[],!e||!e.document||e.document.nodeType!==ks.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,f=Gs(p,"cloneNode"),b=Gs(p,"remove"),g=Gs(p,"nextSibling"),A=Gs(p,"childNodes"),L=Gs(p,"parentNode"),y=Gs(p,"shadowRoot"),m=Gs(p,"attributes"),x=l&&l.prototype?Gs(l.prototype,"nodeType"):null,w=l&&l.prototype?Gs(l.prototype,"nodeName"):null,v=l&&l.prototype?Gs(l.prototype,"ownerDocument"):null,_=function(C){return x?x(C):C.nodeType},S=function(C){return w?w(C):C.nodeName};if(typeof i=="function"){const me=s.createElement("template");me.content&&me.content.ownerDocument&&(s=me.content.ownerDocument)}let T,M="",B,U=!1,O=0;const H=function(){if(O>0)throw ua('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},J=function(C){H(),O++;try{return T.createHTML(C)}finally{O--}},D=function(C){H(),O++;try{return T.createScriptURL(C)}finally{O--}},I=function(){return U||(B=YS(u,a),U=!0),B},N=s,Y=N.implementation,he=N.createNodeIterator,Oe=N.createDocumentFragment,ae=N.getElementsByTagName,be=n.importNode;let ee=Op();t.isSupported=typeof ig=="function"&&typeof L=="function"&&Y&&Y.createHTMLDocument!==void 0;const ve=FS,X=$S,$=US,re=BS,oe=HS,_e=zS,Ne=VS,He=qS;let k=Ap,R=null;const z=Qe({},[...Sp,...$o,...Uo,...Bo,...Cp]);let Q=null;const te=Qe({},[...Tp,...Ho,...Ep,...Vl]);let se=Object.seal(Ha(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),pe=null,ue=null;const ce=Object.seal(Ha(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ne=!0,ie=!0,ge=!1,we=!0,Ae=!1,F=!0,de=!1,ke=!1,Re=null,De=null,ct=!1,Z=!1,Se=!1,Le=!1,Ue=!0,lt=!1;const ze="user-content-";let gt=!0,zt=!1,rs={},Ns=null;const Qs=Qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let un=null;const pn=Qe({},["audio","video","img","source","image","track"]);let qs=null;const fn=Qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),ys="http://www.w3.org/1998/Math/MathML",Ms="http://www.w3.org/2000/svg",Mt="http://www.w3.org/1999/xhtml";let xs=Mt,hn=!1,vt=null;const os=Qe({},[ys,Ms,Mt],Fo),Qt=Nt(["mi","mo","mn","ms","mtext"]);let _s=Qe({},Qt);const mn=Nt(["annotation-xml"]);let q=Qe({},mn);const fe=Qe({},["title","style","font","a","script"]);let Pe=null;const Ye=["application/xhtml+xml","text/html"],dt="text/html";let qe=null,Ps=null;const mi=s.createElement("form"),Oa=function(C){return C instanceof RegExp||C instanceof Function},aa=function(){let C=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ps&&Ps===C)return;(!C||typeof C!="object")&&(C={}),C=Ss(C),Pe=Ye.indexOf(C.PARSER_MEDIA_TYPE)===-1?dt:C.PARSER_MEDIA_TYPE,qe=Pe==="application/xhtml+xml"?Fo:Mi,R=Vn(C,"ALLOWED_TAGS",z,{transform:qe}),Q=Vn(C,"ALLOWED_ATTR",te,{transform:qe}),vt=Vn(C,"ALLOWED_NAMESPACES",os,{transform:Fo}),qs=Vn(C,"ADD_URI_SAFE_ATTR",fn,{transform:qe,base:fn}),un=Vn(C,"ADD_DATA_URI_TAGS",pn,{transform:qe,base:pn}),Ns=Vn(C,"FORBID_CONTENTS",Qs,{transform:qe}),pe=Vn(C,"FORBID_TAGS",Ss({}),{transform:qe}),ue=Vn(C,"FORBID_ATTR",Ss({}),{transform:qe}),rs=ms(C,"USE_PROFILES")?C.USE_PROFILES&&typeof C.USE_PROFILES=="object"?Ss(C.USE_PROFILES):C.USE_PROFILES:!1,ne=C.ALLOW_ARIA_ATTR!==!1,ie=C.ALLOW_DATA_ATTR!==!1,ge=C.ALLOW_UNKNOWN_PROTOCOLS||!1,we=C.ALLOW_SELF_CLOSE_IN_ATTR!==!1,Ae=C.SAFE_FOR_TEMPLATES||!1,F=C.SAFE_FOR_XML!==!1,de=C.WHOLE_DOCUMENT||!1,Z=C.RETURN_DOM||!1,Se=C.RETURN_DOM_FRAGMENT||!1,Le=C.RETURN_TRUSTED_TYPE||!1,ct=C.FORCE_BODY||!1,Ue=C.SANITIZE_DOM!==!1,lt=C.SANITIZE_NAMED_PROPS||!1,gt=C.KEEP_CONTENT!==!1,zt=C.IN_PLACE||!1,k=MS(C.ALLOWED_URI_REGEXP)?C.ALLOWED_URI_REGEXP:Ap,xs=typeof C.NAMESPACE=="string"?C.NAMESPACE:Mt,_s=zo(C,"MATHML_TEXT_INTEGRATION_POINTS",()=>Qe({},Qt)),q=zo(C,"HTML_INTEGRATION_POINTS",()=>Qe({},mn));const V=zo(C,"CUSTOM_ELEMENT_HANDLING",()=>Ha(null));if(se=Ha(null),ms(V,"tagNameCheck")&&Oa(V.tagNameCheck)&&(se.tagNameCheck=V.tagNameCheck),ms(V,"attributeNameCheck")&&Oa(V.attributeNameCheck)&&(se.attributeNameCheck=V.attributeNameCheck),ms(V,"allowCustomizedBuiltInElements")&&typeof V.allowCustomizedBuiltInElements=="boolean"&&(se.allowCustomizedBuiltInElements=V.allowCustomizedBuiltInElements),Dt(se),Ae&&(ie=!1),Se&&(Z=!0),rs&&(R=Qe({},Cp),Q=Ha(null),rs.html===!0&&(Qe(R,Sp),Qe(Q,Tp)),rs.svg===!0&&(Qe(R,$o),Qe(Q,Ho),Qe(Q,Vl)),rs.svgFilters===!0&&(Qe(R,Uo),Qe(Q,Ho),Qe(Q,Vl)),rs.mathMl===!0&&(Qe(R,Bo),Qe(Q,Ep),Qe(Q,Vl))),ce.tagCheck=null,ce.attributeCheck=null,ms(C,"ADD_TAGS")&&(typeof C.ADD_TAGS=="function"?ce.tagCheck=C.ADD_TAGS:Xa(C.ADD_TAGS)&&(R===z&&(R=Ss(R)),Qe(R,C.ADD_TAGS,qe))),ms(C,"ADD_ATTR")&&(typeof C.ADD_ATTR=="function"?ce.attributeCheck=C.ADD_ATTR:Xa(C.ADD_ATTR)&&(Q===te&&(Q=Ss(Q)),Qe(Q,C.ADD_ATTR,qe))),ms(C,"ADD_FORBID_CONTENTS")&&Xa(C.ADD_FORBID_CONTENTS)&&(Ns===Qs&&(Ns=Ss(Ns)),Qe(Ns,C.ADD_FORBID_CONTENTS,qe)),gt&&(R["#text"]=!0),de&&Qe(R,["html","head","body"]),R.table&&(Qe(R,["tbody"]),delete pe.tbody),C.TRUSTED_TYPES_POLICY){if(typeof C.TRUSTED_TYPES_POLICY.createHTML!="function")throw ua('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof C.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw ua('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const le=T;T=C.TRUSTED_TYPES_POLICY;try{M=J("")}catch(Te){throw T=le,Te}}else C.TRUSTED_TYPES_POLICY===null?(T=void 0,M=""):(T===void 0&&(T=I()),T&&typeof M=="string"&&(M=J("")));Nt&&Nt(C),Ps=C},ia=Qe({},[...$o,...Uo,...PS]),la=Qe({},[...Bo,...DS]),gi=function(C,V,le){return V.namespaceURI===Mt?C==="svg":V.namespaceURI===ys?C==="svg"&&(le==="annotation-xml"||_s[le]):!!ia[C]},vi=function(C,V,le){return V.namespaceURI===Mt?C==="math":V.namespaceURI===Ms?C==="math"&&q[le]:!!la[C]},j=function(C,V,le){return V.namespaceURI===Ms&&!q[le]||V.namespaceURI===ys&&!_s[le]?!1:!la[C]&&(fe[C]||!ia[C])},ye=function(C){let V=L(C);(!V||!V.tagName)&&(V={namespaceURI:xs,tagName:"template"});const le=Mi(C.tagName),Te=Mi(V.tagName);return vt[C.namespaceURI]?C.namespaceURI===Ms?gi(le,V,Te):C.namespaceURI===ys?vi(le,V,Te):C.namespaceURI===Mt?j(le,V,Te):!!(Pe==="application/xhtml+xml"&&vt[C.namespaceURI]):!1},Ce=function(C){Ci(t.removed,{element:C});try{L(C).removeChild(C)}catch{if(b(C),!L(C))throw ua("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},cs=function(C,V,le){try{C.removeAttributeNode(V)}catch{try{C.removeAttribute(le)}catch{}}},gn=function(C){La(C);const V=A(C);if(V){const Te=[];ha(V,Me=>{Ci(Te,Me)}),ha(Te,Me=>{try{b(Me)}catch{}})}const le=m(C);if(le)for(let Te=le.length-1;Te>=0;--Te){const Me=le[Te],Be=Me&&Me.name;typeof Be=="string"&&cs(C,Me,Be)}},Ds=function(C,V,le){if(!le)try{le=V.getAttributeNode(C)}catch{le=null}Ci(t.removed,{attribute:le||null,from:V});try{le?V.removeAttributeNode(le):V.removeAttribute(C)}catch{try{V.removeAttribute(C)}catch{}}if(C==="is")if(Z||Se)try{Ce(V)}catch{}else try{V.setAttribute(C,"")}catch{}},Un=function(C){const V=m(C);if(V)for(let le=V.length-1;le>=0;--le){const Te=V[le],Me=Te&&Te.name;typeof Me!="string"||Q[qe(Me)]||cs(C,Te,Me)}},La=function(C){const V=[C];for(;V.length>0;){const le=V.pop();_(le)===ks.element&&Un(le);const Me=A(le);if(Me)for(let Be=Me.length-1;Be>=0;--Be)V.push(Me[Be])}},xl=function(C,V){return F?C==="patchsrc"?!0:C==="for"&&V!=="label"&&V!=="output":!1},_l=function(C){if(!F)return;const V=[C];for(;V.length>0;){const le=V.pop(),Te=_(le);if(Te===ks.processingInstruction||Te===ks.comment&&qt(Ip,le.data)){try{b(le)}catch{}continue}if(Te===ks.element){const Be=le,ut=qe(S(le));try{Be.hasAttribute&&Be.hasAttribute("patchsrc")&&Be.removeAttribute("patchsrc"),Be.hasAttribute&&Be.hasAttribute("for")&&xl("for",ut)&&Be.removeAttribute("for")}catch{}}const Me=A(le);if(Me)for(let Be=Me.length-1;Be>=0;--Be)V.push(Me[Be])}},wl=function(C){let V=null,le=null;if(ct)C="<remove></remove>"+C;else{const Be=xp(C,/^[\r\n\t ]+/);le=Be&&Be[0]}Pe==="application/xhtml+xml"&&xs===Mt&&(C='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+C+"</body></html>");const Te=T?J(C):C;if(xs===Mt)try{V=new d().parseFromString(Te,Pe)}catch{}if(!V||!V.documentElement){V=Y.createDocument(xs,"template",null);try{V.documentElement.innerHTML=hn?M:Te}catch{}}const Me=V.body||V.documentElement;return C&&le&&Me.insertBefore(s.createTextNode(le),Me.childNodes[0]||null),xs===Mt?ae.call(V,de?"html":"body")[0]:de?V.documentElement:Me},kl=function(C){const V=v?v(C):C.ownerDocument;return he.call(V||C,C,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Na=function(C){return C=Ti(C,ve," "),C=Ti(C,X," "),C=Ti(C,$," "),C},ra=function(C){var V;C.normalize();const le=v?v(C):C.ownerDocument,Te=he.call(le||C,C,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Me=Te.nextNode();for(;Me;)Me.data=Na(Me.data),Me=Te.nextNode();const Be=(V=C.querySelectorAll)===null||V===void 0?void 0:V.call(C,"template");Be&&ha(Be,ut=>{Xs(ut.content)&&ra(ut.content)})},oa=function(C){const V=w?w(C):null;return typeof V!="string"||qe(V)!=="form"?!1:typeof C.nodeName!="string"||typeof C.textContent!="string"||typeof C.removeChild!="function"||C.attributes!==m(C)||typeof C.removeAttribute!="function"||typeof C.setAttribute!="function"||typeof C.namespaceURI!="string"||typeof C.insertBefore!="function"||typeof C.hasChildNodes!="function"||C.nodeType!==x(C)||C.childNodes!==A(C)},Xs=function(C){if(!x||typeof C!="object"||C===null)return!1;try{return x(C)===ks.documentFragment}catch{return!1}},E=function(C){if(!x||typeof C!="object"||C===null)return!1;try{return typeof x(C)=="number"}catch{return!1}};function P(me,C,V){me.length!==0&&ha(me,le=>{le.call(t,C,V,Ps)})}const K=function(C,V){return!!(F&&C.hasChildNodes()&&!E(C.firstElementChild)&&qt(Rp,C.textContent)&&qt(Rp,C.innerHTML)||F&&C.namespaceURI===Mt&&WS[V]&&(E(C.firstElementChild)||typeof C.textContent=="string"&&qt(ZS[V],C.textContent))||C.nodeType===ks.processingInstruction||F&&C.nodeType===ks.comment&&qt(Ip,C.data))},Ee=function(C,V){if(C instanceof RegExp)return qt(C,V);if(C instanceof Function){for(var le=arguments.length,Te=new Array(le>2?le-2:0),Me=2;Me<le;Me++)Te[Me-2]=arguments[Me];return!!C(V,...Te)}return!1},tt=function(C,V,le){if(!pe[V]&&Dd(V)&&Ee(se.tagNameCheck,V))return!1;if(gt&&!Ns[V]){const Te=L(C),Me=A(C);if(Me&&Te){const Be=Me.length;for(let ut=Be-1;ut>=0;--ut){const bt=C===le?f(Me[ut],!0):Me[ut];Te.insertBefore(bt,g(C))}}}return Ce(C),!0},Vt=function(C,V,le,Te){return C.length===0?V:V===le||V===Te?Ss(V):V},Fs=function(C,V){return C===V||L(C)!==null?!1:(zt&&La(C),!0)},en=function(C,V){if(P(ee.beforeSanitizeElements,C,null),Fs(C,V))return!0;if(oa(C))return Ce(C),!0;const le=qe(S(C));if(R=Vt(ee.uponSanitizeElement,R,z,Re),P(ee.uponSanitizeElement,C,{tagName:le,allowedTags:R}),Fs(C,V))return!0;if(K(C,le))return Ce(C),!0;if(pe[le]||!(ce.tagCheck instanceof Function&&ce.tagCheck(le))&&!R[le]){const Me=tt(C,le,V);return Me===!1&&P(ee.afterSanitizeElements,C,null),Me}if(_(C)===ks.element&&!ye(C)||(le==="noscript"||le==="noembed"||le==="noframes")&&qt(GS,C.innerHTML))return Ce(C),!0;if(Ae&&C.nodeType===ks.text){const Me=Na(C.textContent);C.textContent!==Me&&(Ci(t.removed,{element:C.cloneNode()}),C.textContent=Me)}return P(ee.afterSanitizeElements,C,null),!1},bi=function(C,V,le){if(ue[V]||xl(V,C)||Ue&&(V==="id"||V==="name")&&(le in s||le in mi))return!1;const Te=Q[V]||ce.attributeCheck instanceof Function&&ce.attributeCheck(V,C);return ie&&qt(re,V)||ne&&qt(oe,V)?!0:Te?qs[V]||qt(k,Ti(le,Ne,""))||(V==="src"||V==="xlink:href"||V==="href")&&C!=="script"&&_p(le,"data:")===0&&un[C]||ge&&!qt(_e,Ti(le,Ne,""))?!0:!le:Dd(C)&&Ee(se.tagNameCheck,C)&&Ee(se.attributeNameCheck,V,C)||V==="is"&&se.allowCustomizedBuiltInElements&&Ee(se.tagNameCheck,le)},Sl=Qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Dd=function(C){return!Sl[Mi(C)]&&qt(He,C)},_g=function(C,V,le,Te){if(T&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!le)switch(u.getAttributeType(C,V)){case"TrustedHTML":return J(Te);case"TrustedScriptURL":return D(Te)}return Te},wg=function(C,V,le,Te){try{le?C.setAttributeNS(le,V,Te):C.setAttribute(V,Te),oa(C)?Ce(C):yp(t.removed)}catch{Ds(V,C)}},Fd=function(C){P(ee.beforeSanitizeAttributes,C,null);const V=C.attributes;if(!V||oa(C))return;Q=Vt(ee.uponSanitizeAttribute,Q,te,De);const le={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:Q,forceKeepAttr:void 0};let Te=V.length;const Me=qe(C.nodeName);for(;Te--;){const Be=V[Te],ut=Be.name,bt=Be.namespaceURI,ds=Be.value,us=qe(ut),po=ds;let Xt=ut==="value"?po:AS(po);if(le.attrName=us,le.attrValue=Xt,le.keepAttr=!0,le.forceKeepAttr=void 0,P(ee.uponSanitizeAttribute,C,le),Xt=le.attrValue,lt&&(us==="id"||us==="name")&&_p(Xt,ze)!==0&&(Ds(ut,C,Be),Xt=ze+Xt),F&&qt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Xt)){Ds(ut,C,Be);continue}if(us==="attributename"&&xp(Xt,"href")){Ds(ut,C,Be);continue}if(!le.forceKeepAttr){if(!le.keepAttr){Ds(ut,C,Be);continue}if(!we&&qt(KS,Xt)){Ds(ut,C,Be);continue}if(Ae&&(Xt=Na(Xt)),!bi(Me,us,Xt)){Ds(ut,C,Be);continue}Xt=_g(Me,us,bt,Xt),Xt!==po&&wg(C,ut,bt,Xt)}}P(ee.afterSanitizeAttributes,C,null)},Cl=function(C){let V=null;const le=kl(C);for(P(ee.beforeSanitizeShadowDOM,C,null);V=le.nextNode();)if(P(ee.uponSanitizeShadowNode,V,null),en(V,C),Fd(V),Xs(V.content)&&Cl(V.content),_(V)===ks.element){const Te=y(V);Xs(Te)&&(uo(Te),Cl(Te))}P(ee.afterSanitizeShadowDOM,C,null)},uo=function(C){const V=[{node:C,shadow:null}];for(;V.length>0;){const le=V.pop();if(le.shadow){Cl(le.shadow);continue}const Te=le.node,Be=_(Te)===ks.element,ut=A(Te);if(ut)for(let bt=ut.length-1;bt>=0;--bt)V.push({node:ut[bt],shadow:null});if(Be){const bt=w?w(Te):null;if(typeof bt=="string"&&qe(bt)==="template"){const ds=Te.content;Xs(ds)&&V.push({node:ds,shadow:null})}}if(Be){const bt=y(Te);Xs(bt)&&V.push({node:null,shadow:bt},{node:bt,shadow:null})}}};return t.sanitize=function(me){let C=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},V=null,le=null,Te=null,Me=null;if(hn=!me,hn&&(me="<!-->"),typeof me!="string"&&!E(me)&&(me=NS(me),typeof me!="string"))throw ua("dirty is not a string, aborting");if(!t.isSupported)return me;ke?(R=Re,Q=De):aa(C),(ee.uponSanitizeElement.length>0||ee.uponSanitizeAttribute.length>0)&&(R=Ss(R)),ee.uponSanitizeAttribute.length>0&&(Q=Ss(Q)),t.removed=[];const Be=zt&&typeof me!="string"&&E(me);if(Be){_l(me);const ds=S(me);if(typeof ds=="string"){const us=qe(ds);if(!R[us]||pe[us])throw gn(me),ua("root node is forbidden and cannot be sanitized in-place")}if(oa(me))throw gn(me),ua("root node is clobbered and cannot be sanitized in-place");try{uo(me)}catch(us){throw gn(me),us}}else if(E(me))V=wl("<!---->"),le=V.ownerDocument.importNode(me,!0),le.nodeType===ks.element&&le.nodeName==="BODY"||le.nodeName==="HTML"?V=le:V.appendChild(le),uo(le);else{if(!Z&&!Ae&&!de&&me.indexOf("<")===-1)return T&&Le?J(me):me;if(V=wl(me),!V)return Z?null:Le?M:""}V&&ct&&Ce(V.firstChild);const ut=Be?me:V;try{const ds=kl(ut);for(;Te=ds.nextNode();)en(Te,ut),Fd(Te),Xs(Te.content)&&Cl(Te.content)}catch(ds){throw Be&&(gn(me),ha(t.removed,us=>{us.element&&La(us.element)})),ds}if(Be)return ha(t.removed,ds=>{ds.element&&La(ds.element)}),Ae&&ra(me),me;if(Z){if(Ae&&ra(V),Se)for(Me=Oe.call(V.ownerDocument);V.firstChild;)Me.appendChild(V.firstChild);else Me=V;return(Q.shadowroot||Q.shadowrootmode)&&(Me=be.call(n,Me,!0)),Me}let bt=de?V.outerHTML:V.innerHTML;return de&&R["!doctype"]&&V.ownerDocument&&V.ownerDocument.doctype&&V.ownerDocument.doctype.name&&qt(jS,V.ownerDocument.doctype.name)&&(bt="<!DOCTYPE "+V.ownerDocument.doctype.name+`>
`+bt),Ae&&(bt=Na(bt)),T&&Le?J(bt):bt},t.setConfig=function(){let me=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};aa(me),ke=!0,Re=R,De=Q},t.clearConfig=function(){Ps=null,ke=!1,Re=null,De=null,T=B,M=""},t.isValidAttribute=function(me,C,V){Ps||aa({});const le=qe(me),Te=qe(C);return bi(le,Te,V)},t.addHook=function(me,C){typeof C=="function"&&ms(ee,me)&&Ci(ee[me],C)},t.removeHook=function(me,C){if(ms(ee,me)){if(C!==void 0){const V=TS(ee[me],C);return V===-1?void 0:ES(ee[me],V,1)[0]}return yp(ee[me])}},t.removeHooks=function(me){ms(ee,me)&&(ee[me]=[])},t.removeAllHooks=function(){ee=Op()},t}var Lp=og();function Ed(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Ia=Ed();function cg(e){Ia=e}var Vi={exec:()=>null};function it(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(as.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var as={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},QS=/^(?:[ \t]*(?:\n|$))+/,XS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,e1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,yl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,t1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Ad=/(?:[*+-]|\d{1,9}[.)])/,dg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,ug=it(dg).replace(/bull/g,Ad).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),s1=it(dg).replace(/bull/g,Ad).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Rd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,n1=/^[^\n]+/,Id=/(?!\s*\])(?:\\.|[^\[\]\\])+/,a1=it(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Id).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),i1=it(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Ad).getRegex(),oo="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Od=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,l1=it("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Od).replace("tag",oo).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),pg=it(Rd).replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",oo).getRegex(),r1=it(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",pg).getRegex(),Ld={blockquote:r1,code:XS,def:a1,fences:e1,heading:t1,hr:yl,html:l1,lheading:ug,list:i1,newline:QS,paragraph:pg,table:Vi,text:n1},Np=it("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",oo).getRegex(),o1={...Ld,lheading:s1,table:Np,paragraph:it(Rd).replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Np).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",oo).getRegex()},c1={...Ld,html:it(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Od).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Vi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:it(Rd).replace("hr",yl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",ug).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},d1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,u1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,fg=/^( {2,}|\\)\n(?!\s*$)/,p1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,co=/[\p{P}\p{S}]/u,Nd=/[\s\p{P}\p{S}]/u,hg=/[^\s\p{P}\p{S}]/u,f1=it(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Nd).getRegex(),mg=/(?!~)[\p{P}\p{S}]/u,h1=/(?!~)[\s\p{P}\p{S}]/u,m1=/(?:[^\s\p{P}\p{S}]|~)/u,g1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,gg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,v1=it(gg,"u").replace(/punct/g,co).getRegex(),b1=it(gg,"u").replace(/punct/g,mg).getRegex(),vg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",y1=it(vg,"gu").replace(/notPunctSpace/g,hg).replace(/punctSpace/g,Nd).replace(/punct/g,co).getRegex(),x1=it(vg,"gu").replace(/notPunctSpace/g,m1).replace(/punctSpace/g,h1).replace(/punct/g,mg).getRegex(),_1=it("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,hg).replace(/punctSpace/g,Nd).replace(/punct/g,co).getRegex(),w1=it(/\\(punct)/,"gu").replace(/punct/g,co).getRegex(),k1=it(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),S1=it(Od).replace("(?:-->|$)","-->").getRegex(),C1=it("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",S1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Rr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,T1=it(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Rr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),bg=it(/^!?\[(label)\]\[(ref)\]/).replace("label",Rr).replace("ref",Id).getRegex(),yg=it(/^!?\[(ref)\](?:\[\])?/).replace("ref",Id).getRegex(),E1=it("reflink|nolink(?!\\()","g").replace("reflink",bg).replace("nolink",yg).getRegex(),Md={_backpedal:Vi,anyPunctuation:w1,autolink:k1,blockSkip:g1,br:fg,code:u1,del:Vi,emStrongLDelim:v1,emStrongRDelimAst:y1,emStrongRDelimUnd:_1,escape:d1,link:T1,nolink:yg,punctuation:f1,reflink:bg,reflinkSearch:E1,tag:C1,text:p1,url:Vi},A1={...Md,link:it(/^!?\[(label)\]\((.*?)\)/).replace("label",Rr).getRegex(),reflink:it(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Rr).getRegex()},kc={...Md,emStrongRDelimAst:x1,emStrongLDelim:b1,url:it(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},R1={...kc,br:it(fg).replace("{2,}","*").getRegex(),text:it(kc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},jl={normal:Ld,gfm:o1,pedantic:c1},Ai={normal:Md,gfm:kc,breaks:R1,pedantic:A1},I1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Mp=e=>I1[e];function sn(e,t){if(t){if(as.escapeTest.test(e))return e.replace(as.escapeReplace,Mp)}else if(as.escapeTestNoEncode.test(e))return e.replace(as.escapeReplaceNoEncode,Mp);return e}function Pp(e){try{e=encodeURI(e).replace(as.percentDecode,"%")}catch{return null}return e}function Dp(e,t){var i;const s=e.replace(as.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(as.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(as.slashPipe,"|");return n}function Ri(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function O1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Fp(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function L1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Ir=class{constructor(e){ot(this,"options");ot(this,"rules");ot(this,"lexer");this.options=e||Ia}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Ri(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=L1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Ri(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Ri(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Ri(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,b=f.raw+`
`+s.join(`
`),g=this.blockquote(b);i[i.length-1]=g,n=n.substring(0,n.length-f.raw.length)+g.raw,a=a.substring(0,a.length-f.text.length)+g.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,b=f.raw+`
`+s.join(`
`),g=this.list(b);i[i.length-1]=g,n=n.substring(0,n.length-p.raw.length)+g.raw,a=a.substring(0,a.length-f.raw.length)+g.raw,s=b.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,L=>" ".repeat(3*L.length)),p=e.split(`
`,1)[0],f=!u.trim(),b=0;if(this.options.pedantic?(b=2,d=u.trimStart()):f?b=t[1].length+1:(b=t[2].search(this.rules.other.nonSpaceChar),b=b>4?1:b,d=u.slice(b),b+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const L=this.rules.other.nextBulletRegex(b),y=this.rules.other.hrRegex(b),m=this.rules.other.fencesBeginRegex(b),x=this.rules.other.headingBeginRegex(b),w=this.rules.other.htmlBeginRegex(b);for(;e;){const v=e.split(`
`,1)[0];let _;if(p=v,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),_=p):_=p.replace(this.rules.other.tabCharGlobal,"    "),m.test(p)||x.test(p)||w.test(p)||L.test(p)||y.test(p))break;if(_.search(this.rules.other.nonSpaceChar)>=b||!p.trim())d+=`
`+_.slice(b);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||x.test(u)||y.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=v+`
`,e=e.substring(v.length+1),u=_.slice(b)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,A;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(A=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:A,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Dp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Dp(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Ri(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=O1(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Fp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Fp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const b=p.slice(1,-1);return{type:"em",raw:p,text:b,tokens:this.lexer.inlineTokens(b)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},En=class Sc{constructor(t){ot(this,"tokens");ot(this,"options");ot(this,"state");ot(this,"tokenizer");ot(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Ia,this.options.tokenizer=this.options.tokenizer||new Ir,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:as,block:jl.normal,inline:Ai.normal};this.options.pedantic?(s.block=jl.pedantic,s.inline=Ai.pedantic):this.options.gfm&&(s.block=jl.gfm,this.options.breaks?s.inline=Ai.breaks:s.inline=Ai.gfm),this.tokenizer.rules=s}static get rules(){return{block:jl,inline:Ai}}static lex(t,s){return new Sc(s).lex(t)}static lexInline(t,s){return new Sc(s).inlineTokens(t)}lex(t){t=t.replace(as.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(as.tabCharGlobal,"    ").replace(as.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let b;this.options.extensions.startInline.forEach(g=>{b=g.call({lexer:this},f),typeof b=="number"&&b>=0&&(p=Math.min(p,b))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Or=class{constructor(e){ot(this,"options");ot(this,"parser");this.options=e||Ia}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(as.notSpaceStart))==null?void 0:i[0],a=e.replace(as.endingNewline,"")+`
`;return n?'<pre><code class="language-'+sn(n)+'">'+(s?a:sn(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:sn(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+sn(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${sn(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Pp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+sn(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Pp(e);if(a===null)return sn(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${sn(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:sn(e.text)}},Pd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},An=class Cc{constructor(t){ot(this,"options");ot(this,"renderer");ot(this,"textRenderer");this.options=t||Ia,this.options.renderer=this.options.renderer||new Or,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Pd}static parse(t,s){return new Cc(s).parse(t)}static parseInline(t,s){return new Cc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Vo,Ql=(Vo=class{constructor(e){ot(this,"options");ot(this,"block");this.options=e||Ia}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?En.lex:En.lexInline}provideParser(){return this.block?An.parse:An.parseInline}},ot(Vo,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Vo),N1=class{constructor(...e){ot(this,"defaults",Ed());ot(this,"options",this.setOptions);ot(this,"parse",this.parseMarkdown(!0));ot(this,"parseInline",this.parseMarkdown(!1));ot(this,"Parser",An);ot(this,"Renderer",Or);ot(this,"TextRenderer",Pd);ot(this,"Lexer",En);ot(this,"Tokenizer",Ir);ot(this,"Hooks",Ql);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Or(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Ir(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Ql;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Ql.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return En.lex(e,t??this.defaults)}parser(e,t){return An.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?En.lex:En.lexInline,o=i.hooks?i.hooks.provideParser():e?An.parse:An.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+sn(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Ca=new N1;function nt(e,t){return Ca.parse(e,t)}nt.options=nt.setOptions=function(e){return Ca.setOptions(e),nt.defaults=Ca.defaults,cg(nt.defaults),nt};nt.getDefaults=Ed;nt.defaults=Ia;nt.use=function(...e){return Ca.use(...e),nt.defaults=Ca.defaults,cg(nt.defaults),nt};nt.walkTokens=function(e,t){return Ca.walkTokens(e,t)};nt.parseInline=Ca.parseInline;nt.Parser=An;nt.parser=An.parse;nt.Renderer=Or;nt.TextRenderer=Pd;nt.Lexer=En;nt.lexer=En.lex;nt.Tokenizer=Ir;nt.Hooks=Ql;nt.parse=nt;nt.options;nt.setOptions;nt.use;nt.walkTokens;nt.parseInline;An.parse;En.lex;const M1={breaks:!0,gfm:!0};function $p(e){if(!e)return"";try{if(typeof nt<"u"&&nt.parse){const t=nt.parse(e,M1);return typeof Lp<"u"?Lp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function P1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const D1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function F1(e){return D1[e]||"wrench"}const $1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Up(e){if(!e)return[];const t=e.match($1);return t?[...new Set(t)]:[]}const U1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=W(()=>t.value.trim().length>0&&!s.value),u=h(Ge.state||"disconnected");let p=null,f=null;const b=W(()=>{const D=u.value;return D==="connected"?"Connected":D==="reconnecting"?"Reconnecting…":D==="connecting"?"Connecting…":"REST fallback"}),g=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],A=W(()=>{const D=Math.floor(i.value/4)%g.length,I=i.value;return I>3?`${g[D]} (${I}s)`:g[0]});function L(){Tt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!a.value)return;const D=a.value;D.style.height="auto",D.style.height=Math.min(D.scrollHeight,120)+"px"}function m(D,I,N={}){const Y={id:++o,role:D,content:I,timestamp:Date.now(),html:D==="bot"?$p(I):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:D==="bot"?Up(I):[],files:N.files||[],_showTools:!1};return e.value.push(Y),L(),D==="bot"&&Tt(()=>x()),Y}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(I=>{I.setAttribute("data-copy","true"),I.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const Y=I.querySelector("code"),he=Y?Y.textContent:I.textContent;navigator.clipboard.writeText(he).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),I.appendChild(N)})}function w(D){if(D===0)return!0;const I=e.value[D-1],N=e.value[D],Y=new Date(I.timestamp).toDateString(),he=new Date(N.timestamp).toDateString();return Y!==he}function v(D){const I=new Date(D),N=new Date;if(I.toDateString()===N.toDateString())return"Today";const Y=new Date(N);return Y.setDate(Y.getDate()-1),I.toDateString()===Y.toDateString()?"Yesterday":I.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function _(D){t.value=D,Tt(()=>H())}function S(D){window.open(D,"_blank","noopener")}function T(D){D.target.style.display="none"}function M(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function B(){r&&(clearInterval(r),r=null),i.value=0}function U(D){s.value&&(s.value=!1,B(),D.type==="chat_response"?m("bot",D.content,{tools_used:D.tools_used||[],is_error:D.is_error||!1,files:D.files||[]}):D.type==="chat_error"&&m("bot",D.error||"Unknown error",{is_error:!0}),Tt(()=>{var I;return(I=a.value)==null?void 0:I.focus()}))}async function O(D){try{const I=await G.post("/api/chat",{content:D,channel_id:l.value});m("bot",I.response,{tools_used:I.tools_used||[],is_error:I.is_error||!1,files:I.files||[]})}catch(I){m("bot",I.message||"Failed to send message",{is_error:!0})}}async function H(){const D=t.value.trim();if(!D||s.value)return;m("user",D),t.value="",s.value=!0,M(),a.value&&(a.value.style.height="auto"),Ge.connected&&Ge.sendChat(D,{channelId:l.value})||(await O(D),s.value=!1,B()),Tt(()=>{var N;return(N=a.value)==null?void 0:N.focus()})}async function J(){try{if(!l.value){const I=await G.get("/api/auth/session");l.value=I.channel_id||I.user_id||"web-user"}const D=await G.get("/api/sessions/"+encodeURIComponent(l.value));if(D&&D.messages&&D.messages.length>0){for(const I of D.messages){const N=I.role==="user"?"user":"bot";let Y=I.content||"";if(N==="user"){const Oe=Y.match(/^\[.*?\]:\s*/);Oe&&(Y=Y.slice(Oe[0].length))}if(!Y.trim())continue;const he={id:++o,role:N,content:Y,timestamp:I.timestamp?I.timestamp*1e3:Date.now(),html:N==="bot"?$p(Y):"",tools_used:[],is_error:!1,images:N==="bot"?Up(Y):[],files:[],_showTools:!1};e.value.push(he)}Tt(()=>{L(),x()})}}catch{}}return Ze(()=>{Ge.subscribe("chat",U),u.value=Ge.state||"disconnected",p=Ge.onStateChange,f=(D,I)=>{u.value=D,p&&p(D,I)},Ge.onStateChange=f,J(),Tt(()=>{var D;return(D=a.value)==null?void 0:D.focus()})}),_t(()=>{Ge.unsubscribe("chat",U),Ge.onStateChange===f&&(Ge.onStateChange=p),B()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:b,typingText:A,suggestions:c,send:H,autoResize:y,formatTime:P1,formatDate:v,showDateSeparator:w,useSuggestion:_,openImage:S,onImageError:T,getToolIcon:F1}}},B1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),b=W(()=>e.value==="custom"),g=W(()=>[...i.value,...l.value]),A=W(()=>l.value.includes(e.value)),L=W(()=>{var S;return b.value?t.value||"Odin":((S=a.value[e.value])==null?void 0:S.name)||e.value}),y=W(()=>{var S;return b.value?s.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.identity)||""}),m=W(()=>{var S;return b.value?n.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.voice)||""});async function x(){d.value=!0;try{const S=await G.get("/api/personality");e.value=S.preset||"odin",t.value=S.custom_name||"",s.value=S.custom_identity||"",n.value=S.custom_voice||"",a.value=S.presets||{},i.value=S.builtin_presets||[],l.value=S.user_presets||[]}catch(S){c.value=S.message}finally{d.value=!1}}async function w(){r.value=!0,c.value=null,o.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(S){c.value=S.message}finally{r.value=!1}}async function v(){const S=u.value.trim();if(S){f.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:S,display_name:L.value,identity:y.value,voice:m.value}),p.value=!1,u.value="",await x(),e.value=S.toLowerCase().replace(/ /g,"_")}catch(T){c.value=T.message}finally{f.value=!1}}}async function _(){if(await Jt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(T){c.value=T.message}}}return Ze(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:b,isUserPreset:A,previewName:L,previewIdentity:y,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:w,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:v,deletePreset:_,builtinPresets:i,userPresets:l}},template:`
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
  `},wt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),xg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:vS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:U1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:Yw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:ak,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ck,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:B1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:dS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:wt("/operations","live")},{path:"/agents",redirect:wt("/operations","agents")},{path:"/loops",redirect:wt("/operations","loops")},{path:"/processes",redirect:wt("/operations","processes")},{path:"/schedules",redirect:wt("/operations","schedules")},{path:"/audit",redirect:wt("/history","audit")},{path:"/sessions",redirect:wt("/history","sessions")},{path:"/traces",redirect:wt("/history","traces")},{path:"/usage",redirect:wt("/history","usage")},{path:"/tools",redirect:wt("/capabilities","tools")},{path:"/skills",redirect:wt("/capabilities","skills")},{path:"/mcp",redirect:wt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:wt("/capabilities","knowledge")},{path:"/memory",redirect:wt("/capabilities","memory")},{path:"/learned",redirect:wt("/capabilities","learned")},{path:"/health",redirect:wt("/system","health")},{path:"/resources",redirect:wt("/system","resources")},{path:"/logs",redirect:wt("/system","logs")},{path:"/config",redirect:wt("/system","config")},{path:"/host-access",redirect:wt("/system","host-access")},{path:"/internals",redirect:wt("/system","internals")}],ji=Dw({history:hw(),routes:xg});ji.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const H1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},z1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const b=h("starting"),g=h(""),A=xg.filter(I=>I.meta),L=W(()=>["Workspace","Operate","Observe","Manage"].map(I=>({name:I,routes:A.filter(N=>N.meta.section===I)})).filter(I=>I.routes.length)),y=W(()=>{var I;return((I=ji.currentRoute.value.meta)==null?void 0:I.label)||"Odin"}),m=W(()=>{var I;return((I=ji.currentRoute.value.meta)==null?void 0:I.section)||"Management"}),x=W(()=>{var I;return((I=ji.currentRoute.value.meta)==null?void 0:I.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,Ge.disconnect(),G.setToken(""),e.value="login"};function w(I){var N;if((I.ctrlKey||I.metaKey)&&I.key.toLowerCase()==="k"){e.value==="ready"&&(I.preventDefault(),mp());return}if(n.value&&I.key==="Tab"){const Y=[...((N=a.value)==null?void 0:N.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(Y.length){const he=Y[0],Oe=Y[Y.length-1];if(I.shiftKey&&(document.activeElement===he||!a.value.contains(document.activeElement))){I.preventDefault(),Oe.focus();return}if(!I.shiftKey&&(document.activeElement===Oe||!a.value.contains(document.activeElement))){I.preventDefault(),he.focus();return}}}if(I.key==="Escape"&&n.value){n.value=!1,I.preventDefault();return}if(I.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(I.target.tagName)){I.preventDefault();const Y=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');Y&&Y.focus()}}function v(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ze(async()=>{document.addEventListener("keydown",w),r=window.matchMedia("(max-width: 900px)"),v(),r.addEventListener("change",v);const I=await G.check();I.ok?(e.value="ready",J()):I.needsAuth?e.value="login":(e.value="ready",J())});function _(){t.value=!1,e.value="ready",J()}async function S(){await G.logout(),Ge.disconnect(),e.value="login"}function T(){s.value=!s.value}function M(){n.value=!n.value}is(n,async I=>{var N,Y;if(I)o=document.activeElement,await Tt(),(Y=(N=a.value)==null?void 0:N.querySelector(".nav-item"))==null||Y.focus();else if(o!=null&&o.isConnected){const he=o;o=null,requestAnimationFrame(()=>he.focus())}});const B=W(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function U(I,N="info",Y=3e3){p.value={text:I,level:N},clearTimeout(f),f=setTimeout(()=>{p.value=null},Y)}let O=null,H=!1;function J(){Ge.onStatusChange=I=>{c.value=I},Ge.onLatency=I=>{u.value=I},Ge.onStateChange=(I,N)=>{d.value=I,I==="connected"?(H&&U("Connection restored","success"),H=!0):I==="reconnecting"&&N.attempt===1&&U("Connection lost — reconnecting…","warn")},Ge.connect(),D(),O&&clearInterval(O),O=setInterval(D,15e3)}async function D(){try{const I=await G.get("/api/status");b.value=I.status==="online"?"online":"starting";const N=I.uptime_seconds||0,Y=Math.floor(N/3600),he=Math.floor(N%3600/60);g.value=`${Y}h ${he}m uptime`}catch{b.value="offline",g.value=""}}return _t(()=>{O&&clearInterval(O),Ge.disconnect(),document.removeEventListener("keydown",w),r==null||r.removeEventListener("change",v)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:B,wsToast:p,botStatus:b,botUptime:g,navRoutes:A,navGroups:L,currentPage:y,currentSection:m,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:_,logout:S,toggleSidebar:T,toggleMobileNavigation:M,openPalette:mp}}},na=yr(z1);na.component("odin-icon",hS);na.component("login-screen",H1);na.component("toast-container",A_);na.component("confirm-host",R_);na.component("command-palette",fS);na.directive("modal-focus",gS);na.use(ji);na.mount("#app");
