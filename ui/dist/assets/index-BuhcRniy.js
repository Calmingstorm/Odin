var Gm=Object.defineProperty;var Km=(e,t,s)=>t in e?Gm(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var it=(e,t,s)=>Km(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Wm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new rl("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new ld(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new rl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new ld((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new rl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof rl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class rl extends Error{constructor(t){super(t),this.name="AuthError"}}class ld extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Zm{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const K=new Wm,Ke=new Zm(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function vs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const qe={},Ea=[],Ft=()=>{},Ta=()=>!1,ra=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),or=e=>e.startsWith("onUpdate:"),je=Object.assign,Jo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Jm=Object.prototype.hasOwnProperty,et=(e,t)=>Jm.call(e,t),ge=Array.isArray,Aa=e=>Za(e)==="[object Map]",oa=e=>Za(e)==="[object Set]",rd=e=>Za(e)==="[object Date]",Ym=e=>Za(e)==="[object RegExp]",Ie=e=>typeof e=="function",Me=e=>typeof e=="string",Gt=e=>typeof e=="symbol",Qe=e=>e!==null&&typeof e=="object",Yo=e=>(Qe(e)||Ie(e))&&Ie(e.then)&&Ie(e.catch),df=Object.prototype.toString,Za=e=>df.call(e),Qm=e=>Za(e).slice(8,-1),cr=e=>Za(e)==="[object Object]",dr=e=>Me(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,gn=vs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Xm=vs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),ur=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},eg=/-\w/g,at=ur(e=>e.replace(eg,t=>t.slice(1).toUpperCase())),tg=/\B([A-Z])/g,os=ur(e=>e.replace(tg,"-$1").toLowerCase()),ca=ur(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ra=ur(e=>e?`on${ca(e)}`:""),It=(e,t)=>!Object.is(e,t),Ia=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},uf=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},fr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Nl=e=>{const t=Me(e)?Number(e):NaN;return isNaN(t)?e:t};let od;const pr=()=>od||(od=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function sg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const ng="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",ag=vs(ng);function zi(e){if(ge(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Me(n)?ff(n):zi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Me(e)||Qe(e))return e}const ig=/;(?![^(]*\))/g,lg=/:([^]+)/,rg=/\/\*[^]*?\*\//g;function ff(e){const t={};return e.replace(rg,"").split(ig).forEach(s=>{if(s){const n=s.split(lg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function qi(e){let t="";if(Me(e))t=e;else if(ge(e))for(let s=0;s<e.length;s++){const n=qi(e[s]);n&&(t+=n+" ")}else if(Qe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function og(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Me(t)&&(e.class=qi(t)),s&&(e.style=zi(s)),e}const cg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",dg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",ug="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",fg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",pg=vs(cg),hg=vs(dg),mg=vs(ug),gg=vs(fg),vg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",bg=vs(vg);function pf(e){return!!e||e===""}function yg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=xn(e[n],t[n]);return s}function xn(e,t){if(e===t)return!0;let s=rd(e),n=rd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Gt(e),n=Gt(t),s||n)return e===t;if(s=ge(e),n=ge(t),s||n)return s&&n?yg(e,t):!1;if(s=Qe(e),n=Qe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!xn(e[l],t[l]))return!1}}return String(e)===String(t)}function hr(e,t){return e.findIndex(s=>xn(s,t))}const hf=e=>!!(e&&e.__v_isRef===!0),mf=e=>Me(e)?e:e==null?"":ge(e)||Qe(e)&&(e.toString===df||!Ie(e.toString))?hf(e)?mf(e.value):JSON.stringify(e,gf,2):String(e),gf=(e,t)=>hf(t)?gf(e,t.value):Aa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Br(n,i)+" =>"]=a,s),{})}:oa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Br(s))}:Gt(t)?Br(t):Qe(t)&&!ge(t)&&!cr(t)?String(t):t,Br=(e,t="")=>{var s;return Gt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function xg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Et;class Qo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Et&&(Et.active?(this.parent=Et,this.index=(Et.scopes||(Et.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Et;try{return Et=this,t()}finally{Et=s}}}on(){++this._on===1&&(this.prevScope=Et,Et=this)}off(){if(this._on>0&&--this._on===0){if(Et===this)Et=this.prevScope;else{let t=Et;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function _g(e){return new Qo(e)}function vf(){return Et}function kg(e,t=!1){Et&&Et.cleanups.push(e)}let ot;const Hr=new WeakSet;class Ci{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Et&&(Et.active?Et.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Hr.has(this)&&(Hr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||yf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,cd(this),xf(this);const t=ot,s=Ds;ot=this,Ds=!0;try{return this.fn()}finally{_f(this),ot=t,Ds=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)tc(t);this.deps=this.depsTail=void 0,cd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Hr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){mo(this)&&this.run()}get dirty(){return mo(this)}}let bf=0,mi,gi;function yf(e,t=!1){if(e.flags|=8,t){e.next=gi,gi=e;return}e.next=mi,mi=e}function Xo(){bf++}function ec(){if(--bf>0)return;if(gi){let t=gi;for(gi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;mi;){let t=mi;for(mi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function xf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function _f(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),tc(n),wg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function mo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(kf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function kf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ei)||(e.globalVersion=Ei,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!mo(e))))return;e.flags|=2;const t=e.dep,s=ot,n=Ds;ot=e,Ds=!0;try{xf(e);const a=e.fn(e._value);(t.version===0||It(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ot=s,Ds=n,_f(e),e.flags&=-3}}function tc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)tc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function wg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Sg(e,t){e.effect instanceof Ci&&(e=e.effect.fn);const s=new Ci(e);t&&je(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Tg(e){e.effect.stop()}let Ds=!0;const wf=[];function _n(){wf.push(Ds),Ds=!1}function kn(){const e=wf.pop();Ds=e===void 0?!0:e}function cd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ot;ot=void 0;try{t()}finally{ot=s}}}let Ei=0;class Cg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class mr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ot||!Ds||ot===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ot)s=this.activeLink=new Cg(ot,this),ot.deps?(s.prevDep=ot.depsTail,ot.depsTail.nextDep=s,ot.depsTail=s):ot.deps=ot.depsTail=s,Sf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ot.depsTail,s.nextDep=void 0,ot.depsTail.nextDep=s,ot.depsTail=s,ot.deps===s&&(ot.deps=n)}return s}trigger(t){this.version++,Ei++,this.notify(t)}notify(t){Xo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{ec()}}}function Sf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Sf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Ll=new WeakMap,Qn=Symbol(""),go=Symbol(""),Ai=Symbol("");function jt(e,t,s){if(Ds&&ot){let n=Ll.get(e);n||Ll.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new mr),a.map=n,a.key=s),a.track()}}function un(e,t,s,n,a,i){const l=Ll.get(e);if(!l){Ei++;return}const r=o=>{o&&o.trigger()};if(Xo(),t==="clear")l.forEach(r);else{const o=ge(e),c=o&&dr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,f)=>{(f==="length"||f===Ai||!Gt(f)&&f>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Ai)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Qn)),Aa(e)&&r(l.get(go)));break;case"delete":o||(r(l.get(Qn)),Aa(e)&&r(l.get(go)));break;case"set":Aa(e)&&r(l.get(Qn));break}}ec()}function Eg(e,t){const s=Ll.get(e);return s&&s.get(t)}function ma(e){const t=Ze(e);return t===e?t:(jt(t,"iterate",Ai),ds(e)?t:t.map(Ps))}function gr(e){return jt(e=Ze(e),"iterate",Ai),e}function Ws(e,t){return Js(e)?Fa(vn(e)?Ps(t):t):Ps(t)}const Ag={__proto__:null,[Symbol.iterator](){return Vr(this,Symbol.iterator,e=>Ws(this,e))},concat(...e){return ma(this).concat(...e.map(t=>ge(t)?ma(t):t))},entries(){return Vr(this,"entries",e=>(e[1]=Ws(this,e[1]),e))},every(e,t){return sn(this,"every",e,t,void 0,arguments)},filter(e,t){return sn(this,"filter",e,t,s=>s.map(n=>Ws(this,n)),arguments)},find(e,t){return sn(this,"find",e,t,s=>Ws(this,s),arguments)},findIndex(e,t){return sn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return sn(this,"findLast",e,t,s=>Ws(this,s),arguments)},findLastIndex(e,t){return sn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return sn(this,"forEach",e,t,void 0,arguments)},includes(...e){return jr(this,"includes",e)},indexOf(...e){return jr(this,"indexOf",e)},join(e){return ma(this).join(e)},lastIndexOf(...e){return jr(this,"lastIndexOf",e)},map(e,t){return sn(this,"map",e,t,void 0,arguments)},pop(){return ti(this,"pop")},push(...e){return ti(this,"push",e)},reduce(e,...t){return dd(this,"reduce",e,t)},reduceRight(e,...t){return dd(this,"reduceRight",e,t)},shift(){return ti(this,"shift")},some(e,t){return sn(this,"some",e,t,void 0,arguments)},splice(...e){return ti(this,"splice",e)},toReversed(){return ma(this).toReversed()},toSorted(e){return ma(this).toSorted(e)},toSpliced(...e){return ma(this).toSpliced(...e)},unshift(...e){return ti(this,"unshift",e)},values(){return Vr(this,"values",e=>Ws(this,e))}};function Vr(e,t,s){const n=gr(e),a=n[t]();return n!==e&&!ds(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Rg=Array.prototype;function sn(e,t,s,n,a,i){const l=gr(e),r=l!==e&&!ds(e),o=l[t];if(o!==Rg[t]){const u=o.apply(e,i);return r?Ps(u):u}let c=s;l!==e&&(r?c=function(u,f){return s.call(this,Ws(e,u),f,e)}:s.length>2&&(c=function(u,f){return s.call(this,u,f,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function dd(e,t,s,n){const a=gr(e),i=a!==e&&!ds(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=Ws(e,c)),s.call(this,c,Ws(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?Ws(e,o):o}function jr(e,t,s){const n=Ze(e);jt(n,"iterate",Ai);const a=n[t](...s);return(a===-1||a===!1)&&Gi(s[0])?(s[0]=Ze(s[0]),n[t](...s)):a}function ti(e,t,s=[]){_n(),Xo();const n=Ze(e)[t].apply(e,s);return ec(),kn(),n}const Ig=vs("__proto__,__v_isRef,__isVue"),Tf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Gt));function Og(e){Gt(e)||(e=String(e));const t=Ze(this);return jt(t,"has",e),t.hasOwnProperty(e)}class Cf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Nf:Of:i?If:Rf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=ge(t);if(!a){let o;if(l&&(o=Ag[s]))return o;if(s==="hasOwnProperty")return Og}const r=Reflect.get(t,s,St(t)?t:n);if((Gt(s)?Tf.has(s):Ig(s))||(a||jt(t,"get",s),i))return r;if(St(r)){const o=l&&dr(s)?r:r.value;return a&&Qe(o)?Dl(o):o}return Qe(r)?a?Dl(r):Un(r):r}}class Ef extends Cf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=ge(t)&&dr(s);if(!this._isShallow){const c=Js(i);if(!ds(n)&&!Js(n)&&(i=Ze(i),n=Ze(n)),!l&&St(i)&&!St(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:et(t,s),o=Reflect.set(t,s,n,St(t)?t:a);return t===Ze(a)&&(r?It(n,i)&&un(t,"set",s,n):un(t,"add",s,n)),o}deleteProperty(t,s){const n=et(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&un(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Gt(s)||!Tf.has(s))&&jt(t,"has",s),n}ownKeys(t){return jt(t,"iterate",ge(t)?"length":Qn),Reflect.ownKeys(t)}}class Af extends Cf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Ng=new Ef,Lg=new Af,Dg=new Ef(!0),Mg=new Af(!0),vo=e=>e,ol=e=>Reflect.getPrototypeOf(e);function Pg(e,t,s){return function(...n){const a=this.__v_raw,i=Ze(a),l=Aa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?vo:t?Fa:Ps;return!t&&jt(i,"iterate",o?go:Qn),je(Object.create(c),{next(){const{value:u,done:f}=c.next();return f?{value:u,done:f}:{value:r?[d(u[0]),d(u[1])]:d(u),done:f}}})}}function cl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Fg(e,t){const s={get(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);e||(It(a,r)&&jt(l,"get",a),jt(l,"get",r));const{has:o}=ol(l),c=t?vo:e?Fa:Ps;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&jt(Ze(a),"iterate",Qn),a.size},has(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);return e||(It(a,r)&&jt(l,"has",a),jt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ze(r),c=t?vo:e?Fa:Ps;return!e&&jt(o,"iterate",Qn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return je(s,e?{add:cl("add"),set:cl("set"),delete:cl("delete"),clear:cl("clear")}:{add(a){const i=Ze(this),l=ol(i),r=Ze(a),o=!t&&!ds(a)&&!Js(a)?r:a;return l.has.call(i,o)||It(a,o)&&l.has.call(i,a)||It(r,o)&&l.has.call(i,r)||(i.add(o),un(i,"add",o,o)),this},set(a,i){!t&&!ds(i)&&!Js(i)&&(i=Ze(i));const l=Ze(this),{has:r,get:o}=ol(l);let c=r.call(l,a);c||(a=Ze(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?It(i,d)&&un(l,"set",a,i):un(l,"add",a,i),this},delete(a){const i=Ze(this),{has:l,get:r}=ol(i);let o=l.call(i,a);o||(a=Ze(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&un(i,"delete",a,void 0),c},clear(){const a=Ze(this),i=a.size!==0,l=a.clear();return i&&un(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Pg(a,e,t)}),s}function vr(e,t){const s=Fg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(et(s,a)&&a in n?s:n,a,i)}const $g={get:vr(!1,!1)},Ug={get:vr(!1,!0)},Bg={get:vr(!0,!1)},Hg={get:vr(!0,!0)},Rf=new WeakMap,If=new WeakMap,Of=new WeakMap,Nf=new WeakMap;function Vg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Un(e){return Js(e)?e:br(e,!1,Ng,$g,Rf)}function sc(e){return br(e,!1,Dg,Ug,If)}function Dl(e){return br(e,!0,Lg,Bg,Of)}function jg(e){return br(e,!0,Mg,Hg,Nf)}function br(e,t,s,n,a){if(!Qe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Vg(Qm(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function vn(e){return Js(e)?vn(e.__v_raw):!!(e&&e.__v_isReactive)}function Js(e){return!!(e&&e.__v_isReadonly)}function ds(e){return!!(e&&e.__v_isShallow)}function Gi(e){return e?!!e.__v_raw:!1}function Ze(e){const t=e&&e.__v_raw;return t?Ze(t):e}function Lf(e){return!et(e,"__v_skip")&&Object.isExtensible(e)&&uf(e,"__v_skip",!0),e}const Ps=e=>Qe(e)?Un(e):e,Fa=e=>Qe(e)?Dl(e):e;function St(e){return e?e.__v_isRef===!0:!1}function h(e){return Df(e,!1)}function nc(e){return Df(e,!0)}function Df(e,t){return St(e)?e:new zg(e,t)}class zg{constructor(t,s){this.dep=new mr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ze(t),this._value=s?t:Ps(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ds(t)||Js(t);t=n?t:Ze(t),It(t,s)&&(this._rawValue=t,this._value=n?t:Ps(t),this.dep.trigger())}}function qg(e){e.dep&&e.dep.trigger()}function Zs(e){return St(e)?e.value:e}function Gg(e){return Ie(e)?e():Zs(e)}const Kg={get:(e,t,s)=>t==="__v_raw"?e:Zs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return St(a)&&!St(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function ac(e){return vn(e)?e:new Proxy(e,Kg)}class Wg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new mr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Mf(e){return new Wg(e)}function Zg(e){const t=ge(e)?new Array(e.length):{};for(const s in e)t[s]=Pf(e,s);return t}class Jg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Gt(s)?s:String(s),this._raw=Ze(t);let a=!0,i=t;if(!ge(t)||Gt(this._key)||!dr(this._key))do a=!Gi(i)||ds(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Zs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&St(this._raw[this._key])){const s=this._object[this._key];if(St(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Eg(this._raw,this._key)}}class Yg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Qg(e,t,s){return St(e)?e:Ie(e)?new Yg(e):Qe(e)&&arguments.length>1?Pf(e,t,s):h(e)}function Pf(e,t,s){return new Jg(e,t,s)}class Xg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new mr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ei-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ot!==this)return yf(this,!0),!0}get value(){const t=this.dep.track();return kf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function ev(e,t,s=!1){let n,a;return Ie(e)?n=e:(n=e.get,a=e.set),new Xg(n,a,s)}const tv={GET:"get",HAS:"has",ITERATE:"iterate"},sv={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},dl={},Ml=new WeakMap;let Nn;function nv(){return Nn}function Ff(e,t=!1,s=Nn){if(s){let n=Ml.get(s);n||Ml.set(s,n=[]),n.push(e)}}function av(e,t,s=qe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:ds(_)||a===!1||a===0?fn(_,1):fn(_);let d,u,f,p,b=!1,y=!1;if(St(e)?(u=()=>e.value,b=ds(e)):vn(e)?(u=()=>c(e),b=!0):ge(e)?(y=!0,b=e.some(_=>vn(_)||ds(_)),u=()=>e.map(_=>{if(St(_))return _.value;if(vn(_))return c(_);if(Ie(_))return o?o(_,2):_()})):Ie(e)?t?u=o?()=>o(e,2):e:u=()=>{if(f){_n();try{f()}finally{kn()}}const _=Nn;Nn=d;try{return o?o(e,3,[p]):e(p)}finally{Nn=_}}:u=Ft,t&&a){const _=u,S=a===!0?1/0:a;u=()=>fn(_(),S)}const A=vf(),O=()=>{d.stop(),A&&A.active&&Jo(A.effects,d)};if(i&&t){const _=t;t=(...S)=>{const g=_(...S);return O(),g}}let x=y?new Array(e.length).fill(dl):dl;const m=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const S=d.run();if(_||a||b||(y?S.some((g,w)=>It(g,x[w])):It(S,x))){f&&f();const g=Nn;Nn=d;try{const w=[S,x===dl?void 0:y&&x[0]===dl?[]:x,p];x=S,o?o(t,3,w):t(...w)}finally{Nn=g}}}else d.run()};return r&&r(m),d=new Ci(u),d.scheduler=l?()=>l(m,!1):m,p=_=>Ff(_,!1,d),f=d.onStop=()=>{const _=Ml.get(d);if(_){if(o)o(_,4);else for(const S of _)S();Ml.delete(d)}},t?n?m(!0):x=d.run():l?l(m.bind(null,!0),!0):d.run(),O.pause=d.pause.bind(d),O.resume=d.resume.bind(d),O.stop=O,O}function fn(e,t=1/0,s){if(t<=0||!Qe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,St(e))fn(e.value,t,s);else if(ge(e))for(let n=0;n<e.length;n++)fn(e[n],t,s);else if(oa(e)||Aa(e))e.forEach(n=>{fn(n,t,s)});else if(cr(e)){for(const n in e)fn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&fn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $f=[];function iv(e){$f.push(e)}function lv(){$f.pop()}function rv(e,t){}const ov={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},cv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ja(e,t,s,n){try{return n?e(...n):e()}catch(a){da(a,t,s)}}function ms(e,t,s,n){if(Ie(e)){const a=Ja(e,t,s,n);return a&&Yo(a)&&a.catch(i=>{da(i,t,s)}),a}if(ge(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ms(e[i],t,s,n));return a}}function da(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||qe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){_n(),Ja(i,null,10,[e,o,c]),kn();return}}dv(e,s,a,n,l)}function dv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Qt=[];let Gs=-1;const Oa=[];let Ln=null,_a=0;const Uf=Promise.resolve();let Pl=null;function At(e){const t=Pl||Uf;return e?t.then(this?e.bind(this):e):t}function uv(e){let t=Gs+1,s=Qt.length;for(;t<s;){const n=t+s>>>1,a=Qt[n],i=Ii(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function ic(e){if(!(e.flags&1)){const t=Ii(e),s=Qt[Qt.length-1];!s||!(e.flags&2)&&t>=Ii(s)?Qt.push(e):Qt.splice(uv(t),0,e),e.flags|=1,Bf()}}function Bf(){Pl||(Pl=Uf.then(Hf))}function Ri(e){ge(e)?Oa.push(...e):Ln&&e.id===-1?Ln.splice(_a+1,0,e):e.flags&1||(Oa.push(e),e.flags|=1),Bf()}function ud(e,t,s=Gs+1){for(;s<Qt.length;s++){const n=Qt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Qt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Fl(e){if(Oa.length){const t=[...new Set(Oa)].sort((s,n)=>Ii(s)-Ii(n));if(Oa.length=0,Ln){Ln.push(...t);return}for(Ln=t,_a=0;_a<Ln.length;_a++){const s=Ln[_a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Ln=null,_a=0}}const Ii=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Hf(e){try{for(Gs=0;Gs<Qt.length;Gs++){const t=Qt[Gs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ja(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Gs<Qt.length;Gs++){const t=Qt[Gs];t&&(t.flags&=-2)}Gs=-1,Qt.length=0,Fl(),Pl=null,(Qt.length||Oa.length)&&Hf()}}let ka,ul=[];function Vf(e,t){var s,n;ka=e,ka?(ka.enabled=!0,ul.forEach(({event:a,args:i})=>ka.emit(a,...i)),ul=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Vf(i,t)}),setTimeout(()=>{ka||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ul=[])},3e3)):ul=[]}let Pt=null,yr=null;function Oi(e){const t=Pt;return Pt=e,yr=e&&e.type.__scopeId||null,t}function fv(e){yr=e}function pv(){yr=null}const hv=e=>lc;function lc(e,t=Pt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Mi(-1);const i=Oi(t);let l;try{l=e(...a)}finally{Oi(i),n._d&&Mi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function mv(e,t){if(Pt===null)return e;const s=Ji(Pt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=qe]=t[a];i&&(Ie(i)&&(i={mounted:i,updated:i}),i.deep&&fn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Ks(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(_n(),ms(o,s,8,[e.el,r,e,t]),kn())}}function vi(e,t){if(Mt){let s=Mt.provides;const n=Mt.parent&&Mt.parent.provides;n===s&&(s=Mt.provides=Object.create(n)),s[e]=t}}function ws(e,t,s=!1){const n=ts();if(n||Xn){let a=Xn?Xn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Ie(t)?t.call(n&&n.proxy):t}}function gv(){return!!(ts()||Xn)}const jf=Symbol.for("v-scx"),zf=()=>ws(jf);function vv(e,t){return Ki(e,null,t)}function bv(e,t){return Ki(e,null,{flush:"post"})}function qf(e,t){return Ki(e,null,{flush:"sync"})}function es(e,t,s){return Ki(e,t,s)}function Ki(e,t,s=qe){const{immediate:n,deep:a,flush:i,once:l}=s,r=je({},s),o=t&&n||!t&&i!=="post";let c;if(aa){if(i==="sync"){const p=zf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Ft,p.resume=Ft,p.pause=Ft,p}}const d=Mt;r.call=(p,b,y)=>ms(p,d,b,y);let u=!1;i==="post"?r.scheduler=p=>{kt(p,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(p,b)=>{b?p():ic(p)}),r.augmentJob=p=>{t&&(p.flags|=4),u&&(p.flags|=2,d&&(p.id=d.uid,p.i=d))};const f=av(e,t,r);return aa&&(c?c.push(f):o&&f()),f}function yv(e,t,s){const n=this.proxy,a=Me(e)?e.includes(".")?Gf(n,e):()=>n[e]:e.bind(n,n);let i;Ie(t)?i=t:(i=t.handler,s=t);const l=Ya(this),r=Ki(a,i.bind(n),s);return l(),r}function Gf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const In=new WeakMap,Kf=Symbol("_vte"),Wf=e=>e.__isTeleport,Wn=e=>e&&(e.disabled||e.disabled===""),xv=e=>e&&(e.defer||e.defer===""),fd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,pd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,bo=(e,t)=>{const s=e&&e.to;return Me(s)?t?t(s):null:s},_v={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:f,o:{insert:p,querySelector:b,createText:y,createComment:A,parentNode:O}}=c,x=Wn(t.props);let{dynamicChildren:m}=t;const _=(w,T,C)=>{w.shapeFlag&16&&d(w.children,T,C,a,i,l,r,o)},S=(w=t)=>{const T=Wn(w.props),C=w.target=bo(w.props,b),M=yo(C,w,y,p);C&&(l!=="svg"&&fd(C)?l="svg":l!=="mathml"&&pd(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),T||(_(w,C,M),di(w,!1)))},g=w=>{const T=()=>{if(In.get(w)===T){if(In.delete(w),Wn(w.props)){const C=O(w.el)||s;_(w,C,w.anchor),di(w,!0)}S(w)}};In.set(w,T),kt(T,i)};if(e==null){const w=t.el=y(""),T=t.anchor=y("");if(p(w,s,n),p(T,s,n),xv(t.props)||i&&i.pendingBranch){g(t);return}x&&(_(t,s,T),di(t,!0)),S()}else{t.el=e.el;const w=t.anchor=e.anchor,T=In.get(e);if(T){T.flags|=8,In.delete(e),g(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,M=t.targetAnchor=e.targetAnchor,B=Wn(e.props),$=B?s:C,I=B?w:M;if(l==="svg"||fd(C)?l="svg":(l==="mathml"||pd(C))&&(l="mathml"),m?(f(e.dynamicChildren,m,$,a,i,l,r),vc(e,t,!0)):o||u(e,t,$,I,a,i,l,r,!1),x)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):fl(t,s,w,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const j=t.target=bo(t.props,b);j&&fl(t,j,null,c,0)}else B&&fl(t,C,M,c,1);di(t,x)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:f}=e,p=i||!Wn(f),b=In.get(e);if(b&&(b.flags|=8,In.delete(e)),u&&(a(c),a(d)),i&&a(o),!b&&l&16)for(let y=0;y<r.length;y++){const A=r[y];n(A,t,s,p,!!A.dynamicChildren)}},move:fl,hydrate:kv};function fl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!In.has(e)&&(!u||Wn(d))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);u&&n(r,t,s)}function kv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function f(A,O){let x=O;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,A._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function p(A,O){O.anchor=u(l(A),O,r(A),s,n,a,i)}const b=t.target=bo(t.props,o),y=Wn(t.props);if(b){const A=b._lpa||b.firstChild;t.shapeFlag&16&&(y?(p(e,t),f(b,A),t.targetAnchor||yo(b,t,d,c,r(e)===b?e:null)):(t.anchor=l(e),f(b,A),t.targetAnchor||yo(b,t,d,c),u(A&&l(A),t,b,s,n,a,i))),di(t,y)}else y&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const wv=_v;function di(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function yo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Kf]=l,e&&(n(i,e,a),n(l,e,a)),l}const xs=Symbol("_leaveCb"),si=Symbol("_enterCb");function rc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return We(()=>{e.isMounted=!0}),wr(()=>{e.isUnmounting=!0}),e}const ys=[Function,Array],oc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ys,onEnter:ys,onAfterEnter:ys,onEnterCancelled:ys,onBeforeLeave:ys,onLeave:ys,onAfterLeave:ys,onLeaveCancelled:ys,onBeforeAppear:ys,onAppear:ys,onAfterAppear:ys,onAppearCancelled:ys},Zf=e=>{const t=e.subTree;return t.component?Zf(t.component):t},Sv={name:"BaseTransition",props:oc,setup(e,{slots:t}){const s=ts(),n=rc();return()=>{const a=t.default&&xr(t.default(),!0),i=a&&a.length?Jf(a):s.subTree?Np():void 0;if(!i)return;const l=Ze(e),{mode:r}=l;if(n.isLeaving)return zr(i);const o=hd(i);if(!o)return zr(i);let c=$a(o,l,n,s,u=>c=u);o.type!==yt&&wn(o,c);let d=s.subTree&&hd(s.subTree);if(d&&d.type!==yt&&!Ls(d,o)&&Zf(s).type!==yt){let u=$a(d,l,n,s);if(wn(d,u),r==="out-in"&&o.type!==yt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},zr(i);r==="in-out"&&o.type!==yt?u.delayLeave=(f,p,b)=>{const y=Qf(n,d);y[String(d.key)]=d,f[xs]=()=>{p(),f[xs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{b(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Jf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==yt){t=s;break}}return t}const Yf=Sv;function Qf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function $a(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:f,onLeave:p,onAfterLeave:b,onLeaveCancelled:y,onBeforeAppear:A,onAppear:O,onAfterAppear:x,onAppearCancelled:m}=t,_=String(e.key),S=Qf(s,e),g=(C,M)=>{C&&ms(C,n,9,M)},w=(C,M)=>{const B=M[1];g(C,M),ge(C)?C.every($=>$.length<=1)&&B():C.length<=1&&B()},T={mode:l,persisted:r,beforeEnter(C){let M=o;if(!s.isMounted)if(i)M=A||o;else return;C[xs]&&C[xs](!0);const B=S[_];B&&Ls(e,B)&&B.el[xs]&&B.el[xs](),g(M,[C])},enter(C){if(S[_]===e)return;let M=c,B=d,$=u;if(!s.isMounted)if(i)M=O||c,B=x||d,$=m||u;else return;let I=!1;C[si]=Y=>{I||(I=!0,Y?g($,[C]):g(B,[C]),T.delayedLeave&&T.delayedLeave(),C[si]=void 0)};const j=C[si].bind(null,!1);M?w(M,[C,j]):j()},leave(C,M){const B=String(e.key);if(C[si]&&C[si](!0),s.isUnmounting)return M();g(f,[C]);let $=!1;C[xs]=j=>{$||($=!0,M(),j?g(y,[C]):g(b,[C]),C[xs]=void 0,S[B]===e&&delete S[B])};const I=C[xs].bind(null,!1);S[B]=e,p?w(p,[C,I]):I()},clone(C){const M=$a(C,t,s,n,a);return a&&a(M),M}};return T}function zr(e){if(Zi(e))return e=Ys(e),e.children=null,e}function hd(e){if(!Zi(e))return Wf(e.type)&&e.children?Jf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ie(s.default))return s.default()}}function wn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,wn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function xr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Ot?(l.patchFlag&128&&a++,n=n.concat(xr(l.children,t,r))):(t||l.type!==yt)&&n.push(r!=null?Ys(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Wi(e,t){return Ie(e)?je({name:e.name},t,{setup:e}):e}function Tv(){const e=ts();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function cc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Cv(e){const t=ts(),s=nc(null);if(t){const a=t.refs===qe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function md(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const $l=new WeakMap;function Na(e,t,s,n,a=!1){if(ge(e)){e.forEach((y,A)=>Na(y,t&&(ge(t)?t[A]:t),s,n,a));return}if(bn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Na(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Ji(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===qe?r.refs={}:r.refs,u=r.setupState,f=Ze(u),p=u===qe?Ta:y=>md(d,y)?!1:et(f,y),b=(y,A)=>!(A&&md(d,A));if(c!=null&&c!==o){if(gd(t),Me(c))d[c]=null,p(c)&&(u[c]=null);else if(St(c)){const y=t;b(c,y.k)&&(c.value=null),y.k&&(d[y.k]=null)}}if(Ie(o))Ja(o,r,12,[l,d]);else{const y=Me(o),A=St(o);if(y||A){const O=()=>{if(e.f){const x=y?p(o)?u[o]:d[o]:b()||!e.k?o.value:d[e.k];if(a)ge(x)&&Jo(x,i);else if(ge(x))x.includes(i)||x.push(i);else if(y)d[o]=[i],p(o)&&(u[o]=d[o]);else{const m=[i];b(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else y?(d[o]=l,p(o)&&(u[o]=l)):A&&(b(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{O(),$l.delete(e)};x.id=-1,$l.set(e,x),kt(x,s)}else gd(e),O()}}}function gd(e){const t=$l.get(e);t&&(t.flags|=8,$l.delete(e))}let vd=!1;const ga=()=>{vd||(console.error("Hydration completed but contains mismatches."),vd=!0)},Ev=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Av=e=>e.namespaceURI.includes("MathML"),pl=e=>{if(e.nodeType===1){if(Ev(e))return"svg";if(Av(e))return"mathml"}},Ca=e=>e.nodeType===8;function Rv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,_)=>{if(!_.hasChildNodes()){s(null,m,_),Fl(),_._vnode=m;return}u(_.firstChild,m,null,null,null),Fl(),_._vnode=m},u=(m,_,S,g,w,T=!1)=>{T=T||!!_.dynamicChildren;const C=Ca(m)&&m.data==="[",M=()=>y(m,_,S,g,w,C),{type:B,ref:$,shapeFlag:I,patchFlag:j}=_;let Y=m.nodeType;_.el=m,j===-2&&(T=!1,_.dynamicChildren=null);let H=null;switch(B){case Pn:Y!==3?_.children===""?(o(_.el=a(""),l(m),m),H=m):H=M():(m.data!==_.children&&(ga(),m.data=_.children),H=i(m));break;case yt:x(m)?(H=i(m),O(_.el=m.content.firstChild,m,S)):Y!==8||C?H=M():H=i(m);break;case ea:if(C&&(m=i(m),Y=m.nodeType),Y===1||Y===3){H=m;const N=!_.children.length;for(let L=0;L<_.staticCount;L++)N&&(_.children+=H.nodeType===1?H.outerHTML:H.data),L===_.staticCount-1&&(_.anchor=H),H=i(H);return C?i(H):H}else M();break;case Ot:C?H=b(m,_,S,g,w,T):H=M();break;default:if(I&1)(Y!==1||_.type.toLowerCase()!==m.tagName.toLowerCase())&&!x(m)?H=M():H=f(m,_,S,g,w,T);else if(I&6){_.slotScopeIds=w;const N=l(m);if(C?H=A(m):Ca(m)&&m.data==="teleport start"?H=A(m,m.data,"teleport end"):H=i(m),t(_,N,null,S,g,pl(N),T),bn(_)&&!_.type.__asyncResolved){let L;C?(L=ft(Ot),L.anchor=H?H.previousSibling:N.lastChild):L=m.nodeType===3?yc(""):ft("div"),L.el=m,_.component.subTree=L}}else I&64?Y!==8?H=M():H=_.type.hydrate(m,_,S,g,w,T,e,p):I&128&&(H=_.type.hydrate(m,_,S,g,pl(l(m)),w,T,e,u))}return $!=null&&Na($,null,g,_),H},f=(m,_,S,g,w,T)=>{T=T||!!_.dynamicChildren;const{type:C,props:M,patchFlag:B,shapeFlag:$,dirs:I,transition:j}=_,Y=C==="input"||C==="option";if(Y||B!==-1){I&&Ks(_,null,S,"created");let H=!1;if(x(m)){H=wp(null,j)&&S&&S.vnode.props&&S.vnode.props.appear;const L=m.content.firstChild;if(H){const Z=L.getAttribute("class");Z&&(L.$cls=Z),j.beforeEnter(L)}O(L,m,S),_.el=m=L}if($&16&&!(M&&(M.innerHTML||M.textContent))){let L=p(m.firstChild,_,m,S,g,w,T);for(L&&!hl(m,1)&&ga();L;){const Z=L;L=L.nextSibling,r(Z)}}else if($&8){let L=_.children;L[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(L=L.slice(1));const{textContent:Z}=m;Z!==L&&Z!==L.replace(/\r\n|\r/g,`
`)&&(hl(m,0)||ga(),m.textContent=_.children)}if(M){if(Y||!T||B&48){const L=m.tagName.includes("-");for(const Z in M)(Y&&(Z.endsWith("value")||Z==="indeterminate")||ra(Z)&&!gn(Z)||Z[0]==="."||L&&!gn(Z))&&n(m,Z,null,M[Z],void 0,S)}else if(M.onClick)n(m,"onClick",null,M.onClick,void 0,S);else if(B&4&&vn(M.style))for(const L in M.style)M.style[L]}let N;(N=M&&M.onVnodeBeforeMount)&&is(N,S,_),I&&Ks(_,null,S,"beforeMount"),((N=M&&M.onVnodeMounted)||I||H)&&Ep(()=>{N&&is(N,S,_),H&&j.enter(m),I&&Ks(_,null,S,"mounted")},g)}return m.nextSibling},p=(m,_,S,g,w,T,C)=>{C=C||!!_.dynamicChildren;const M=_.children,B=M.length;let $=!1;for(let I=0;I<B;I++){const j=C?M[I]:M[I]=rs(M[I]),Y=j.type===Pn;m?(Y&&!C&&I+1<B&&rs(M[I+1]).type===Pn&&(o(a(m.data.slice(j.children.length)),S,i(m)),m.data=j.children),m=u(m,j,g,w,T,C)):Y&&!j.children?o(j.el=a(""),S):($||($=!0,hl(S,1)||ga()),s(null,j,S,null,g,w,pl(S),T))}return m},b=(m,_,S,g,w,T)=>{const{slotScopeIds:C}=_;C&&(w=w?w.concat(C):C);const M=l(m),B=p(i(m),_,M,S,g,w,T);return B&&Ca(B)&&B.data==="]"?i(_.anchor=B):(ga(),o(_.anchor=c("]"),M,B),B)},y=(m,_,S,g,w,T)=>{if(hl(m.parentElement,1)||ga(),_.el=null,T){const B=A(m);for(;;){const $=i(m);if($&&$!==B)r($);else break}}const C=i(m),M=l(m);return r(m),s(null,_,M,C,S,g,pl(M),w),S&&(S.vnode.el=_.el,Tr(S,_.el)),C},A=(m,_="[",S="]")=>{let g=0;for(;m;)if(m=i(m),m&&Ca(m)&&(m.data===_&&g++,m.data===S)){if(g===0)return i(m);g--}return m},O=(m,_,S)=>{const g=_.parentNode;g&&g.replaceChild(m,_);let w=S;for(;w;)w.vnode.el===_&&(w.vnode.el=w.subTree.el=m),w=w.parent},x=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const bd="data-allow-mismatch",Iv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function hl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(bd);)e=e.parentElement;const s=e&&e.getAttribute(bd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Iv[t])}}const Ov=pr().requestIdleCallback||(e=>setTimeout(e,1)),Nv=pr().cancelIdleCallback||(e=>clearTimeout(e)),Lv=(e=1e4)=>t=>{const s=Ov(t,{timeout:e});return()=>Nv(s)};function Dv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Mv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Dv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Pv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Fv=(e=[])=>(t,s)=>{Me(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function $v(e,t){if(Ca(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ca(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const bn=e=>!!e.type.__asyncLoader;function Uv(e){Ie(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const f=()=>(u++,c=null,p()),p=()=>{let b;return c||(b=c=t().catch(y=>{if(y=y instanceof Error?y:new Error(String(y)),o)return new Promise((A,O)=>{o(y,()=>A(f()),()=>O(y),u+1)});throw y}).then(y=>b!==c&&c?c:(y&&(y.__esModule||y[Symbol.toStringTag]==="Module")&&(y=y.default),d=y,y)))};return Wi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(b,y,A){let O=!1;(y.bu||(y.bu=[])).push(()=>O=!0);const x=()=>{O||A()},m=i?()=>{const _=i(x,S=>$v(b,S));_&&(y.bum||(y.bum=[])).push(_)}:x;d?m():p().then(()=>!y.isUnmounted&&m())},get __asyncResolved(){return d},setup(){const b=Mt;if(cc(b),d)return()=>ml(d,b);const y=S=>{c=null,da(S,b,13,!n)};if(r&&b.suspense||aa)return p().then(S=>()=>ml(S,b)).catch(S=>(y(S),()=>n?ft(n,{error:S}):null));const A=h(!1),O=h(),x=h(!!a);let m,_;return xt(()=>{m!=null&&clearTimeout(m),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{b.isUnmounted||(x.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!b.isUnmounted&&!A.value&&!O.value){const S=new Error(`Async component timed out after ${l}ms.`);y(S),O.value=S}},l)),p().then(()=>{b.isUnmounted||(A.value=!0,b.parent&&Zi(b.parent.vnode)&&b.parent.update())}).catch(S=>{if(b.isUnmounted){c=null;return}y(S),O.value=S}),()=>{if(A.value&&d)return ml(d,b);if(O.value&&n)return ft(n,{error:O.value});if(s&&!x.value)return ml(s,b)}}})}function ml(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ft(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Zi=e=>e.type.__isKeepAlive,Bv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=ts(),n=s.ctx;if(!n.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,f=u("div");n.activate=(x,m,_,S,g)=>{const w=x.component;c(x,m,_,0,r),o(w.vnode,x,m,_,w,r,S,x.slotScopeIds,g),kt(()=>{w.isDeactivated=!1,w.a&&Ia(w.a);const T=x.props&&x.props.onVnodeMounted;T&&is(T,w.parent,x)},r)},n.deactivate=x=>{const m=x.component;Bl(m.m),Bl(m.a),c(x,f,null,1,r),kt(()=>{m.da&&Ia(m.da);const _=x.props&&x.props.onVnodeUnmounted;_&&is(_,m.parent,x),m.isDeactivated=!0},r)};function p(x){qr(x),d(x,s,r,!0)}function b(x){a.forEach((m,_)=>{const S=Ao(bn(m)?m.type.__asyncResolved||{}:m.type);S&&!x(S)&&y(_)})}function y(x){const m=a.get(x);m&&(!l||!Ls(m,l))?p(m):l&&qr(l),a.delete(x),i.delete(x)}es(()=>[e.include,e.exclude],([x,m])=>{x&&b(_=>ui(x,_)),m&&b(_=>!ui(m,_))},{flush:"post",deep:!0});let A=null;const O=()=>{A!=null&&(Hl(s.subTree.type)?kt(()=>{a.set(A,gl(s.subTree))},s.subTree.suspense):a.set(A,gl(s.subTree)))};return We(O),kr(O),wr(()=>{a.forEach(x=>{const{subTree:m,suspense:_}=s,S=gl(m);if(x.type===S.type&&x.key===S.key){qr(S);const g=S.component.da;g&&kt(g,_);return}p(x)})}),()=>{if(A=null,!t.default)return l=null;const x=t.default(),m=x[0];if(x.length>1)return l=null,x;if(!Sn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let _=gl(m);if(_.type===yt)return l=null,_;const S=_.type,g=Ao(bn(_)?_.type.__asyncResolved||{}:S),{include:w,exclude:T,max:C}=e;if(w&&(!g||!ui(w,g))||T&&g&&ui(T,g))return _.shapeFlag&=-257,l=_,m;const M=_.key==null?S:_.key,B=a.get(M);return _.el&&(_=Ys(_),m.shapeFlag&128&&(m.ssContent=_)),A=M,B?(_.el=B.el,_.component=B.component,_.transition&&wn(_,_.transition),_.shapeFlag|=512,i.delete(M),i.add(M)):(i.add(M),C&&i.size>parseInt(C,10)&&y(i.values().next().value)),_.shapeFlag|=256,l=_,Hl(m.type)?m:_}}},Hv=Bv;function ui(e,t){return ge(e)?e.some(s=>ui(s,t)):Me(e)?e.split(",").includes(t):Ym(e)?(e.lastIndex=0,e.test(t)):!1}function Cs(e,t){Xf(e,"a",t)}function Es(e,t){Xf(e,"da",t)}function Xf(e,t,s=Mt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(_r(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Zi(a.parent.vnode)&&Vv(n,t,s,a),a=a.parent}}function Vv(e,t,s,n){const a=_r(t,e,n,!0);xt(()=>{Jo(n[t],a)},s)}function qr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function gl(e){return e.shapeFlag&128?e.ssContent:e}function _r(e,t,s=Mt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{_n();const r=Ya(s),o=ms(t,s,e,l);return r(),kn(),o});return n?a.unshift(i):a.push(i),i}}const Tn=e=>(t,s=Mt)=>{(!aa||e==="sp")&&_r(e,(...n)=>t(...n),s)},ep=Tn("bm"),We=Tn("m"),dc=Tn("bu"),kr=Tn("u"),wr=Tn("bum"),xt=Tn("um"),tp=Tn("sp"),sp=Tn("rtg"),np=Tn("rtc");function ap(e,t=Mt){_r("ec",e,t)}const uc="components",jv="directives";function zv(e,t){return fc(uc,e,!0,t)||e}const ip=Symbol.for("v-ndc");function qv(e){return Me(e)?fc(uc,e,!1)||e:e||ip}function Gv(e){return fc(jv,e)}function fc(e,t,s=!0,n=!1){const a=Pt||Mt;if(a){const i=a.type;if(e===uc){const r=Ao(i,!1);if(r&&(r===t||r===at(t)||r===ca(at(t))))return i}const l=yd(a[e]||i[e],t)||yd(a.appContext[e],t);return!l&&n?i:l}}function yd(e,t){return e&&(e[t]||e[at(t)]||e[ca(at(t))])}function Kv(e,t,s,n){let a;const i=s&&s[n],l=ge(e);if(l||Me(e)){const r=l&&vn(e);let o=!1,c=!1;r&&(o=!ds(e),c=Js(e),e=gr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Fa(Ps(e[d])):Ps(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Qe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Wv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(ge(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Zv(e,t,s={},n,a){if(Pt.ce||Pt.parent&&bn(Pt.parent)&&Pt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Di(),Vl(Ot,null,[ft("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Di();const l=i&&pc(i(s)),r=s.key||l&&l.key,o=Vl(Ot,{key:(r&&!Gt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function pc(e){return e.some(t=>Sn(t)?!(t.type===yt||t.type===Ot&&!pc(t.children)):!0)?e:null}function Jv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ra(n)]=e[n];return s}const xo=e=>e?Mp(e)?Ji(e):xo(e.parent):null,bi=je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>xo(e.parent),$root:e=>xo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>hc(e),$forceUpdate:e=>e.f||(e.f=()=>{ic(e.update)}),$nextTick:e=>e.n||(e.n=At.bind(e.proxy)),$watch:e=>yv.bind(e)}),Gr=(e,t)=>e!==qe&&!e.__isScriptSetup&&et(e,t),_o={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Gr(n,t))return l[t]=1,n[t];if(a!==qe&&et(a,t))return l[t]=2,a[t];if(et(i,t))return l[t]=3,i[t];if(s!==qe&&et(s,t))return l[t]=4,s[t];ko&&(l[t]=0)}}const c=bi[t];let d,u;if(c)return t==="$attrs"&&jt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==qe&&et(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,et(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Gr(a,t)?(a[t]=s,!0):n!==qe&&et(n,t)?(n[t]=s,!0):et(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==qe&&r[0]!=="$"&&et(e,r)||Gr(t,r)||et(i,r)||et(n,r)||et(bi,r)||et(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:et(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Yv=je({},_o,{get(e,t){if(t!==Symbol.unscopables)return _o.get(e,t,e)},has(e,t){return t[0]!=="_"&&!ag(t)}});function Qv(){return null}function Xv(){return null}function eb(e){}function tb(e){}function sb(){return null}function nb(){}function ab(e,t){return null}function ib(){return lp().slots}function lb(){return lp().attrs}function lp(e){const t=ts();return t.setupContext||(t.setupContext=Up(t))}function Ni(e){return ge(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function rb(e,t){const s=Ni(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?ge(a)||Ie(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function ob(e,t){return!e||!t?e||t:ge(e)&&ge(t)?e.concat(t):je({},Ni(e),Ni(t))}function cb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function db(e){const t=ts(),s=aa;let n=e();Pi(),s&&Da(!1);const a=()=>{Ya(t),s&&Da(!0)},i=()=>{ts()!==t&&t.scope.off(),Pi(),s&&Da(!1)};return Yo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let ko=!0;function ub(e){const t=hc(e),s=e.proxy,n=e.ctx;ko=!1,t.beforeCreate&&xd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:f,beforeUpdate:p,updated:b,activated:y,deactivated:A,beforeDestroy:O,beforeUnmount:x,destroyed:m,unmounted:_,render:S,renderTracked:g,renderTriggered:w,errorCaptured:T,serverPrefetch:C,expose:M,inheritAttrs:B,components:$,directives:I,filters:j}=t;if(c&&fb(c,n,null),l)for(const N in l){const L=l[N];Ie(L)&&(n[N]=L.bind(s))}if(a){const N=a.call(s,s);Qe(N)&&(e.data=Un(N))}if(ko=!0,i)for(const N in i){const L=i[N],Z=Ie(L)?L.bind(s,s):Ie(L.get)?L.get.bind(s,s):Ft,xe=!Ie(L)&&Ie(L.set)?L.set.bind(s):Ft,_e=J({get:Z,set:xe});Object.defineProperty(n,N,{enumerable:!0,configurable:!0,get:()=>_e.value,set:ae=>_e.value=ae})}if(r)for(const N in r)rp(r[N],n,s,N);if(o){const N=Ie(o)?o.call(s):o;Reflect.ownKeys(N).forEach(L=>{vi(L,N[L])})}d&&xd(d,e,"c");function H(N,L){ge(L)?L.forEach(Z=>N(Z.bind(s))):L&&N(L.bind(s))}if(H(ep,u),H(We,f),H(dc,p),H(kr,b),H(Cs,y),H(Es,A),H(ap,T),H(np,g),H(sp,w),H(wr,x),H(xt,_),H(tp,C),ge(M))if(M.length){const N=e.exposed||(e.exposed={});M.forEach(L=>{Object.defineProperty(N,L,{get:()=>s[L],set:Z=>s[L]=Z,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Ft&&(e.render=S),B!=null&&(e.inheritAttrs=B),$&&(e.components=$),I&&(e.directives=I),C&&cc(e)}function fb(e,t,s=Ft){ge(e)&&(e=wo(e));for(const n in e){const a=e[n];let i;Qe(a)?"default"in a?i=ws(a.from||n,a.default,!0):i=ws(a.from||n):i=ws(a),St(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function xd(e,t,s){ms(ge(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function rp(e,t,s,n){let a=n.includes(".")?Gf(s,n):()=>s[n];if(Me(e)){const i=t[e];Ie(i)&&es(a,i)}else if(Ie(e))es(a,e.bind(s));else if(Qe(e))if(ge(e))e.forEach(i=>rp(i,t,s,n));else{const i=Ie(e.handler)?e.handler.bind(s):t[e.handler];Ie(i)&&es(a,i,e)}}function hc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Ul(o,c,l,!0)),Ul(o,t,l)),Qe(t)&&i.set(t,o),o}function Ul(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Ul(e,i,s,!0),a&&a.forEach(l=>Ul(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=pb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const pb={data:_d,props:kd,emits:kd,methods:fi,computed:fi,beforeCreate:Zt,created:Zt,beforeMount:Zt,mounted:Zt,beforeUpdate:Zt,updated:Zt,beforeDestroy:Zt,beforeUnmount:Zt,destroyed:Zt,unmounted:Zt,activated:Zt,deactivated:Zt,errorCaptured:Zt,serverPrefetch:Zt,components:fi,directives:fi,watch:mb,provide:_d,inject:hb};function _d(e,t){return t?e?function(){return je(Ie(e)?e.call(this,this):e,Ie(t)?t.call(this,this):t)}:t:e}function hb(e,t){return fi(wo(e),wo(t))}function wo(e){if(ge(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Zt(e,t){return e?[...new Set([].concat(e,t))]:t}function fi(e,t){return e?je(Object.create(null),e,t):t}function kd(e,t){return e?ge(e)&&ge(t)?[...new Set([...e,...t])]:je(Object.create(null),Ni(e),Ni(t??{})):t}function mb(e,t){if(!e)return t;if(!t)return e;const s=je(Object.create(null),e);for(const n in t)s[n]=Zt(e[n],t[n]);return s}function op(){return{app:null,config:{isNativeTag:Ta,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let gb=0;function vb(e,t){return function(n,a=null){Ie(n)||(n=je({},n)),a!=null&&!Qe(a)&&(a=null);const i=op(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:gb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Hp,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ie(d.install)?(l.add(d),d.install(c,...u)):Ie(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,f){if(!o){const p=c._ceVNode||ft(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),u&&t?t(p,d):e(p,d,f),o=!0,c._container=d,d.__vue_app__=c,Ji(p.component)}},onUnmount(d){r.push(d)},unmount(){o&&(ms(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Xn;Xn=c;try{return d()}finally{Xn=u}}};return c}}let Xn=null;function bb(e,t,s=qe){const n=ts(),a=at(t),i=os(t),l=cp(e,a),r=Mf((o,c)=>{let d,u=qe,f;return qf(()=>{const p=e[a];It(d,p)&&(d=p,c())}),{get(){return o(),s.get?s.get(d):d},set(p){const b=s.set?s.set(p):p;if(!It(b,d)&&!(u!==qe&&It(p,u)))return;const y=n.vnode.props,A=!!(y&&(t in y||a in y||i in y)&&(`onUpdate:${t}`in y||`onUpdate:${a}`in y||`onUpdate:${i}`in y));A||(d=p,c()),n.emit(`update:${t}`,b),It(p,u)&&(It(p,b)&&!It(b,f)||A&&u!==qe&&!It(b,d))&&c(),u=p,f=b}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||qe:r,done:!1}:{done:!0}}}},r}const cp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${at(t)}Modifiers`]||e[`${os(t)}Modifiers`];function yb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||qe;let a=s;const i=t.startsWith("update:"),l=i&&cp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Me(d)?d.trim():d)),l.number&&(a=s.map(fr)));let r,o=n[r=Ra(t)]||n[r=Ra(at(t))];!o&&i&&(o=n[r=Ra(os(t))]),o&&ms(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ms(c,e,6,a)}}const xb=new WeakMap;function dp(e,t,s=!1){const n=s?xb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Ie(e)){const o=c=>{const d=dp(c,t,!0);d&&(r=!0,je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Qe(e)&&n.set(e,null),null):(ge(i)?i.forEach(o=>l[o]=null):je(l,i),Qe(e)&&n.set(e,l),l)}function Sr(e,t){return!e||!ra(t)?!1:(t=t.slice(2).replace(/Once$/,""),et(e,t[0].toLowerCase()+t.slice(1))||et(e,os(t))||et(e,t))}function Tl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:f,setupState:p,ctx:b,inheritAttrs:y}=e,A=Oi(e);let O,x;try{if(s.shapeFlag&4){const _=a||n,S=_;O=rs(c.call(S,_,d,u,p,f,b)),x=r}else{const _=t;O=rs(_.length>1?_(u,{attrs:r,slots:l,emit:o}):_(u,null)),x=t.props?r:kb(r)}}catch(_){yi.length=0,da(_,e,1),O=ft(yt)}let m=O;if(x&&y!==!1){const _=Object.keys(x),{shapeFlag:S}=m;_.length&&S&7&&(i&&_.some(or)&&(x=wb(x,i)),m=Ys(m,x,!1,!0))}return s.dirs&&(m=Ys(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition&&wn(m,s.transition),O=m,Oi(A),O}function _b(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Sn(a)){if(a.type!==yt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const kb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ra(s))&&((t||(t={}))[s]=e[s]);return t},wb=(e,t)=>{const s={};for(const n in e)(!or(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Sb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?wd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const f=d[u];if(up(l,n,f)&&!Sr(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?wd(n,l,c):!0:!!l;return!1}function wd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(up(t,e,i)&&!Sr(s,i))return!0}return!1}function up(e,t,s){const n=e[s],a=t[s];return s==="style"&&Qe(n)&&Qe(a)?!xn(n,a):n!==a}function Tr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const fp={},pp=()=>Object.create(fp),hp=e=>Object.getPrototypeOf(e)===fp;function Tb(e,t,s,n=!1){const a={},i=pp();e.propsDefaults=Object.create(null),mp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:sc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Cb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ze(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let f=d[u];if(Sr(e.emitsOptions,f))continue;const p=t[f];if(o)if(et(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const b=at(f);a[b]=So(o,r,b,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{mp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!et(t,u)&&((d=os(u))===u||!et(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=So(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!et(t,u))&&(delete i[u],c=!0)}c&&un(e.attrs,"set","")}function mp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(gn(o))continue;const c=t[o];let d;a&&et(a,d=at(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Sr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ze(s),c=r||qe;for(let d=0;d<i.length;d++){const u=i[d];s[u]=So(a,o,u,c[u],e,!et(c,u))}}return l}function So(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=et(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Ie(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Ya(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===os(s))&&(n=!0))}return n}const Eb=new WeakMap;function gp(e,t,s=!1){const n=s?Eb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Ie(e)){const d=u=>{o=!0;const[f,p]=gp(u,t,!0);je(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Qe(e)&&n.set(e,Ea),Ea;if(ge(i))for(let d=0;d<i.length;d++){const u=at(i[d]);Sd(u)&&(l[u]=qe)}else if(i)for(const d in i){const u=at(d);if(Sd(u)){const f=i[d],p=l[u]=ge(f)||Ie(f)?{type:f}:je({},f),b=p.type;let y=!1,A=!0;if(ge(b))for(let O=0;O<b.length;++O){const x=b[O],m=Ie(x)&&x.name;if(m==="Boolean"){y=!0;break}else m==="String"&&(A=!1)}else y=Ie(b)&&b.name==="Boolean";p[0]=y,p[1]=A,(y||et(p,"default"))&&r.push(u)}}const c=[l,r];return Qe(e)&&n.set(e,c),c}function Sd(e){return e[0]!=="$"&&!gn(e)}const mc=e=>e==="_"||e==="_ctx"||e==="$stable",gc=e=>ge(e)?e.map(rs):[rs(e)],Ab=(e,t,s)=>{if(t._n)return t;const n=lc((...a)=>gc(t(...a)),s);return n._c=!1,n},vp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(mc(a))continue;const i=e[a];if(Ie(i))t[a]=Ab(a,i,n);else if(i!=null){const l=gc(i);t[a]=()=>l}}},bp=(e,t)=>{const s=gc(t);e.slots.default=()=>s},yp=(e,t,s)=>{for(const n in t)(s||!mc(n))&&(e[n]=t[n])},Rb=(e,t,s)=>{const n=e.slots=pp();if(e.vnode.shapeFlag&32){const a=t._;a?(yp(n,t,s),s&&uf(n,"_",a,!0)):vp(t,n)}else t&&bp(e,t)},Ib=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=qe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:yp(a,t,s):(i=!t.$stable,vp(t,a)),l=t}else t&&(bp(e,t),l={default:1});if(i)for(const r in a)!mc(r)&&l[r]==null&&delete a[r]},kt=Ep;function xp(e){return kp(e)}function _p(e){return kp(e,Rv)}function kp(e,t){const s=pr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:f,setScopeId:p=Ft,insertStaticContent:b}=e,y=(k,E,U,X=null,q=null,Q=null,ie=void 0,re=null,le=!!E.dynamicChildren)=>{if(k===E)return;k&&!Ls(k,E)&&(X=V(k),ae(k,q,Q,!0),k=null),E.patchFlag===-2&&(le=!1,E.dynamicChildren=null);const{type:te,ref:be,shapeFlag:ue}=E;switch(te){case Pn:A(k,E,U,X);break;case yt:O(k,E,U,X);break;case ea:k==null&&x(E,U,X,ie);break;case Ot:$(k,E,U,X,q,Q,ie,re,le);break;default:ue&1?S(k,E,U,X,q,Q,ie,re,le):ue&6?I(k,E,U,X,q,Q,ie,re,le):(ue&64||ue&128)&&te.process(k,E,U,X,q,Q,ie,re,le,ve)}be!=null&&q?Na(be,k&&k.ref,Q,E||k,!E):be==null&&k&&k.ref!=null&&Na(k.ref,null,Q,k,!0)},A=(k,E,U,X)=>{if(k==null)n(E.el=r(E.children),U,X);else{const q=E.el=k.el;E.children!==k.children&&c(q,E.children)}},O=(k,E,U,X)=>{k==null?n(E.el=o(E.children||""),U,X):E.el=k.el},x=(k,E,U,X)=>{[k.el,k.anchor]=b(k.children,E,U,X,k.el,k.anchor)},m=({el:k,anchor:E},U,X)=>{let q;for(;k&&k!==E;)q=f(k),n(k,U,X),k=q;n(E,U,X)},_=({el:k,anchor:E})=>{let U;for(;k&&k!==E;)U=f(k),a(k),k=U;a(E)},S=(k,E,U,X,q,Q,ie,re,le)=>{if(E.type==="svg"?ie="svg":E.type==="math"&&(ie="mathml"),k==null)g(E,U,X,q,Q,ie,re,le);else{const te=k.el&&k.el._isVueCE?k.el:null;try{te&&te._beginPatch(),C(k,E,q,Q,ie,re,le)}finally{te&&te._endPatch()}}},g=(k,E,U,X,q,Q,ie,re)=>{let le,te;const{props:be,shapeFlag:ue,transition:he,dirs:we}=k;if(le=k.el=l(k.type,Q,be&&be.is,be),ue&8?d(le,k.children):ue&16&&T(k.children,le,null,X,q,Kr(k,Q),ie,re),we&&Ks(k,null,X,"created"),w(le,k,k.scopeId,ie,X),be){for(const Le in be)Le!=="value"&&!gn(Le)&&i(le,Le,null,be[Le],Q,X);"value"in be&&i(le,"value",null,be.value,Q),(te=be.onVnodeBeforeMount)&&is(te,X,k)}we&&Ks(k,null,X,"beforeMount");const Ee=wp(q,he);Ee&&he.beforeEnter(le),n(le,E,U),((te=be&&be.onVnodeMounted)||Ee||we)&&kt(()=>{try{te&&is(te,X,k),Ee&&he.enter(le),we&&Ks(k,null,X,"mounted")}finally{}},q)},w=(k,E,U,X,q)=>{if(U&&p(k,U),X)for(let Q=0;Q<X.length;Q++)p(k,X[Q]);if(q){let Q=q.subTree;if(E===Q||Hl(Q.type)&&(Q.ssContent===E||Q.ssFallback===E)){const ie=q.vnode;w(k,ie,ie.scopeId,ie.slotScopeIds,q.parent)}}},T=(k,E,U,X,q,Q,ie,re,le=0)=>{for(let te=le;te<k.length;te++){const be=k[te]=re?cn(k[te]):rs(k[te]);y(null,be,E,U,X,q,Q,ie,re)}},C=(k,E,U,X,q,Q,ie)=>{const re=E.el=k.el;let{patchFlag:le,dynamicChildren:te,dirs:be}=E;le|=k.patchFlag&16;const ue=k.props||qe,he=E.props||qe;let we;if(U&&jn(U,!1),(we=he.onVnodeBeforeUpdate)&&is(we,U,E,k),be&&Ks(E,k,U,"beforeUpdate"),U&&jn(U,!0),(ue.innerHTML&&he.innerHTML==null||ue.textContent&&he.textContent==null)&&d(re,""),te?M(k.dynamicChildren,te,re,U,X,Kr(E,q),Q):ie||L(k,E,re,null,U,X,Kr(E,q),Q,!1),le>0){if(le&16)B(re,ue,he,U,q);else if(le&2&&ue.class!==he.class&&i(re,"class",null,he.class,q),le&4&&i(re,"style",ue.style,he.style,q),le&8){const Ee=E.dynamicProps;for(let Le=0;Le<Ee.length;Le++){const Oe=Ee[Le],Fe=ue[Oe],Ve=he[Oe];(Ve!==Fe||Oe==="value")&&i(re,Oe,Fe,Ve,q,U)}}le&1&&k.children!==E.children&&d(re,E.children)}else!ie&&te==null&&B(re,ue,he,U,q);((we=he.onVnodeUpdated)||be)&&kt(()=>{we&&is(we,U,E,k),be&&Ks(E,k,U,"updated")},X)},M=(k,E,U,X,q,Q,ie)=>{for(let re=0;re<E.length;re++){const le=k[re],te=E[re],be=le.el&&(le.type===Ot||!Ls(le,te)||le.shapeFlag&198)?u(le.el):U;y(le,te,be,null,X,q,Q,ie,!0)}},B=(k,E,U,X,q)=>{if(E!==U){if(E!==qe)for(const Q in E)!gn(Q)&&!(Q in U)&&i(k,Q,E[Q],null,q,X);for(const Q in U){if(gn(Q))continue;const ie=U[Q],re=E[Q];ie!==re&&Q!=="value"&&i(k,Q,re,ie,q,X)}"value"in U&&i(k,"value",E.value,U.value,q)}},$=(k,E,U,X,q,Q,ie,re,le)=>{const te=E.el=k?k.el:r(""),be=E.anchor=k?k.anchor:r("");let{patchFlag:ue,dynamicChildren:he,slotScopeIds:we}=E;we&&(re=re?re.concat(we):we),k==null?(n(te,U,X),n(be,U,X),T(E.children||[],U,be,q,Q,ie,re,le)):ue>0&&ue&64&&he&&k.dynamicChildren&&k.dynamicChildren.length===he.length?(M(k.dynamicChildren,he,U,q,Q,ie,re),(E.key!=null||q&&E===q.subTree)&&vc(k,E,!0)):L(k,E,U,be,q,Q,ie,re,le)},I=(k,E,U,X,q,Q,ie,re,le)=>{E.slotScopeIds=re,k==null?E.shapeFlag&512?q.ctx.activate(E,U,X,ie,le):j(E,U,X,q,Q,ie,le):Y(k,E,le)},j=(k,E,U,X,q,Q,ie)=>{const re=k.component=Dp(k,X,q);if(Zi(k)&&(re.ctx.renderer=ve),Pp(re,!1,ie),re.asyncDep){if(q&&q.registerDep(re,H,ie),!k.el){const le=re.subTree=ft(yt);O(null,le,E,U),k.placeholder=le.el}}else H(re,k,E,U,q,Q,ie)},Y=(k,E,U)=>{const X=E.component=k.component;if(Sb(k,E,U))if(X.asyncDep&&!X.asyncResolved){N(X,E,U);return}else X.next=E,X.update();else E.el=k.el,X.vnode=E},H=(k,E,U,X,q,Q,ie)=>{const re=()=>{if(k.isMounted){let{next:ue,bu:he,u:we,parent:Ee,vnode:Le}=k;{const G=Sp(k);if(G){ue&&(ue.el=Le.el,N(k,ue,ie)),G.asyncDep.then(()=>{kt(()=>{k.isUnmounted||te()},q)});return}}let Oe=ue,Fe;jn(k,!1),ue?(ue.el=Le.el,N(k,ue,ie)):ue=Le,he&&Ia(he),(Fe=ue.props&&ue.props.onVnodeBeforeUpdate)&&is(Fe,Ee,ue,Le),jn(k,!0);const Ve=Tl(k),lt=k.subTree;k.subTree=Ve,y(lt,Ve,u(lt.el),V(lt),k,q,Q),ue.el=Ve.el,Oe===null&&Tr(k,Ve.el),we&&kt(we,q),(Fe=ue.props&&ue.props.onVnodeUpdated)&&kt(()=>is(Fe,Ee,ue,Le),q)}else{let ue;const{el:he,props:we}=E,{bm:Ee,m:Le,parent:Oe,root:Fe,type:Ve}=k,lt=bn(E);if(jn(k,!1),Ee&&Ia(Ee),!lt&&(ue=we&&we.onVnodeBeforeMount)&&is(ue,Oe,E),jn(k,!0),he&&He){const G=()=>{k.subTree=Tl(k),He(he,k.subTree,k,q,null)};lt&&Ve.__asyncHydrate?Ve.__asyncHydrate(he,k,G):G()}else{Fe.ce&&Fe.ce._hasShadowRoot()&&Fe.ce._injectChildStyle(Ve,k.parent?k.parent.type:void 0);const G=k.subTree=Tl(k);y(null,G,U,X,k,q,Q),E.el=G.el}if(Le&&kt(Le,q),!lt&&(ue=we&&we.onVnodeMounted)){const G=E;kt(()=>is(ue,Oe,G),q)}(E.shapeFlag&256||Oe&&bn(Oe.vnode)&&Oe.vnode.shapeFlag&256)&&k.a&&kt(k.a,q),k.isMounted=!0,E=U=X=null}};k.scope.on();const le=k.effect=new Ci(re);k.scope.off();const te=k.update=le.run.bind(le),be=k.job=le.runIfDirty.bind(le);be.i=k,be.id=k.uid,le.scheduler=()=>ic(be),jn(k,!0),te()},N=(k,E,U)=>{E.component=k;const X=k.vnode.props;k.vnode=E,k.next=null,Cb(k,E.props,X,U),Ib(k,E.children,U),_n(),ud(k),kn()},L=(k,E,U,X,q,Q,ie,re,le=!1)=>{const te=k&&k.children,be=k?k.shapeFlag:0,ue=E.children,{patchFlag:he,shapeFlag:we}=E;if(he>0){if(he&128){xe(te,ue,U,X,q,Q,ie,re,le);return}else if(he&256){Z(te,ue,U,X,q,Q,ie,re,le);return}}we&8?(be&16&&ke(te,q,Q),ue!==te&&d(U,ue)):be&16?we&16?xe(te,ue,U,X,q,Q,ie,re,le):ke(te,q,Q,!0):(be&8&&d(U,""),we&16&&T(ue,U,X,q,Q,ie,re,le))},Z=(k,E,U,X,q,Q,ie,re,le)=>{k=k||Ea,E=E||Ea;const te=k.length,be=E.length,ue=Math.min(te,be);let he;for(he=0;he<ue;he++){const we=E[he]=le?cn(E[he]):rs(E[he]);y(k[he],we,U,null,q,Q,ie,re,le)}te>be?ke(k,q,Q,!0,!1,ue):T(E,U,X,q,Q,ie,re,le,ue)},xe=(k,E,U,X,q,Q,ie,re,le)=>{let te=0;const be=E.length;let ue=k.length-1,he=be-1;for(;te<=ue&&te<=he;){const we=k[te],Ee=E[te]=le?cn(E[te]):rs(E[te]);if(Ls(we,Ee))y(we,Ee,U,null,q,Q,ie,re,le);else break;te++}for(;te<=ue&&te<=he;){const we=k[ue],Ee=E[he]=le?cn(E[he]):rs(E[he]);if(Ls(we,Ee))y(we,Ee,U,null,q,Q,ie,re,le);else break;ue--,he--}if(te>ue){if(te<=he){const we=he+1,Ee=we<be?E[we].el:X;for(;te<=he;)y(null,E[te]=le?cn(E[te]):rs(E[te]),U,Ee,q,Q,ie,re,le),te++}}else if(te>he)for(;te<=ue;)ae(k[te],q,Q,!0),te++;else{const we=te,Ee=te,Le=new Map;for(te=Ee;te<=he;te++){const Re=E[te]=le?cn(E[te]):rs(E[te]);Re.key!=null&&Le.set(Re.key,te)}let Oe,Fe=0;const Ve=he-Ee+1;let lt=!1,G=0;const ye=new Array(Ve);for(te=0;te<Ve;te++)ye[te]=0;for(te=we;te<=ue;te++){const Re=k[te];if(Fe>=Ve){ae(Re,q,Q,!0);continue}let Be;if(Re.key!=null)Be=Le.get(Re.key);else for(Oe=Ee;Oe<=he;Oe++)if(ye[Oe-Ee]===0&&Ls(Re,E[Oe])){Be=Oe;break}Be===void 0?ae(Re,q,Q,!0):(ye[Be-Ee]=te+1,Be>=G?G=Be:lt=!0,y(Re,E[Be],U,null,q,Q,ie,re,le),Fe++)}const Ce=lt?Ob(ye):Ea;for(Oe=Ce.length-1,te=Ve-1;te>=0;te--){const Re=Ee+te,Be=E[Re],ze=E[Re+1],pt=Re+1<be?ze.el||Tp(ze):X;ye[te]===0?y(null,Be,U,pt,q,Q,ie,re,le):lt&&(Oe<0||te!==Ce[Oe]?_e(Be,U,pt,2):Oe--)}}},_e=(k,E,U,X,q=null)=>{const{el:Q,type:ie,transition:re,children:le,shapeFlag:te}=k;if(te&6){_e(k.component.subTree,E,U,X);return}if(te&128){k.suspense.move(E,U,X);return}if(te&64){ie.move(k,E,U,ve);return}if(ie===Ot){n(Q,E,U);for(let ue=0;ue<le.length;ue++)_e(le[ue],E,U,X);n(k.anchor,E,U);return}if(ie===ea){m(k,E,U);return}if(X!==2&&te&1&&re)if(X===0)re.persisted&&!Q[xs]?n(Q,E,U):(re.beforeEnter(Q),n(Q,E,U),kt(()=>re.enter(Q),q));else{const{leave:ue,delayLeave:he,afterLeave:we}=re,Ee=()=>{k.ctx.isUnmounted?a(Q):n(Q,E,U)},Le=()=>{const Oe=Q._isLeaving||!!Q[xs];Q._isLeaving&&Q[xs](!0),re.persisted&&!Oe?Ee():ue(Q,()=>{Ee(),we&&we()})};he?he(Q,Ee,Le):Le()}else n(Q,E,U)},ae=(k,E,U,X=!1,q=!1)=>{const{type:Q,props:ie,ref:re,children:le,dynamicChildren:te,shapeFlag:be,patchFlag:ue,dirs:he,cacheIndex:we,memo:Ee}=k;if(ue===-2&&(q=!1),re!=null&&(_n(),Na(re,null,U,k,!0),kn()),we!=null&&(E.renderCache[we]=void 0),be&256){E.ctx.deactivate(k);return}const Le=be&1&&he,Oe=!bn(k);let Fe;if(Oe&&(Fe=ie&&ie.onVnodeBeforeUnmount)&&is(Fe,E,k),be&6)se(k.component,U,X);else{if(be&128){k.suspense.unmount(U,X);return}Le&&Ks(k,null,E,"beforeUnmount"),be&64?k.type.remove(k,E,U,ve,X):te&&!te.hasOnce&&(Q!==Ot||ue>0&&ue&64)?ke(te,E,U,!1,!0):(Q===Ot&&ue&384||!q&&be&16)&&ke(le,E,U),X&&fe(k)}const Ve=Ee!=null&&we==null;(Oe&&(Fe=ie&&ie.onVnodeUnmounted)||Le||Ve)&&kt(()=>{Fe&&is(Fe,E,k),Le&&Ks(k,null,E,"unmounted"),Ve&&(k.el=null)},U)},fe=k=>{const{type:E,el:U,anchor:X,transition:q}=k;if(E===Ot){P(U,X);return}if(E===ea){_(k);return}const Q=()=>{a(U),q&&!q.persisted&&q.afterLeave&&q.afterLeave()};if(k.shapeFlag&1&&q&&!q.persisted){const{leave:ie,delayLeave:re}=q,le=()=>ie(U,Q);re?re(k.el,Q,le):le()}else Q()},P=(k,E)=>{let U;for(;k!==E;)U=f(k),a(k),k=U;a(E)},se=(k,E,U)=>{const{bum:X,scope:q,job:Q,subTree:ie,um:re,m:le,a:te}=k;Bl(le),Bl(te),X&&Ia(X),q.stop(),Q&&(Q.flags|=8,ae(ie,k,E,U)),re&&kt(re,E),kt(()=>{k.isUnmounted=!0},E)},ke=(k,E,U,X=!1,q=!1,Q=0)=>{for(let ie=Q;ie<k.length;ie++)ae(k[ie],E,U,X,q)},V=k=>{if(k.shapeFlag&6)return V(k.component.subTree);if(k.shapeFlag&128)return k.suspense.next();const E=f(k.anchor||k.el),U=E&&E[Kf];return U?f(U):E};let ce=!1;const de=(k,E,U)=>{let X;k==null?E._vnode&&(ae(E._vnode,null,null,!0),X=E._vnode.component):y(E._vnode||null,k,E,null,null,null,U),E._vnode=k,ce||(ce=!0,ud(X),Fl(),ce=!1)},ve={p:y,um:ae,m:_e,r:fe,mt:j,mc:T,pc:L,pbc:M,n:V,o:e};let me,He;return t&&([me,He]=t(ve)),{render:de,hydrate:me,createApp:vb(de,me)}}function Kr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function jn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function wp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function vc(e,t,s=!1){const n=e.children,a=t.children;if(ge(n)&&ge(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=cn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&vc(l,r)),r.type===Pn&&(r.patchFlag===-1&&(r=a[i]=cn(r)),r.el=l.el),r.type===yt&&!r.el&&(r.el=l.el)}}function Ob(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Sp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Sp(t)}function Bl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Tp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Tp(t.subTree):null}const Hl=e=>e.__isSuspense;let To=0;const Nb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Db(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Mb(e,t,s,n,a,l,r,o,c)}},hydrate:Pb,normalize:Fb},Lb=Nb;function Li(e,t){const s=e.props&&e.props[t];Ie(s)&&s()}function Db(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),f=e.suspense=Cp(e,a,n,t,u,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,u,null,n,f,i,l),f.deps>0?(Li(e,"onPending"),Li(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),La(f,e.ssFallback)):f.resolve(!1,!0)}function Mb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:b,pendingBranch:y,isInFallback:A,isHydrating:O}=u;if(y)u.pendingBranch=f,Ls(y,f)?(o(y,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():A&&(O||(o(b,p,s,n,a,null,i,l,r),La(u,p)))):(u.pendingId=To++,O?(u.isHydrating=!1,u.activeBranch=y):c(y,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),A?(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(b,p,s,n,a,null,i,l,r),La(u,p))):b&&Ls(b,f)?(o(b,f,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(b&&Ls(b,f))o(b,f,s,n,a,u,i,l,r),La(u,f);else if(Li(t,"onPending"),u.pendingBranch=f,f.shapeFlag&512?u.pendingId=f.component.suspenseId:u.pendingId=To++,o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:m}=u;x>0?setTimeout(()=>{u.pendingId===m&&u.fallback(p)},x):x===0&&u.fallback(p)}}function Cp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:f,um:p,n:b,o:{parentNode:y,remove:A}}=c;let O;const x=$b(e);x&&t&&t.pendingBranch&&(O=t.pendingId,t.deps++);const m=e.props?Nl(e.props.timeout):void 0,_=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:To++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(g=!1,w=!1){const{vnode:T,activeBranch:C,pendingBranch:M,pendingId:B,effects:$,parentComponent:I,container:j,isInFallback:Y}=S;let H=!1;if(S.isHydrating)S.isHydrating=!1;else if(!g){H=C&&M.transition&&M.transition.mode==="out-in";let Z=!1;H&&(C.transition.afterLeave=()=>{B===S.pendingId&&(f(M,j,i===_&&!Z?b(C):i,0),Ri($),Y&&T.ssFallback&&(T.ssFallback.el=null))}),C&&!S.isFallbackMountPending&&(y(C.el)===j&&(i=b(C),Z=!0),p(C,I,S,!0),!H&&Y&&T.ssFallback&&kt(()=>T.ssFallback.el=null,S)),H||f(M,j,i,0)}S.isFallbackMountPending=!1,La(S,M),S.pendingBranch=null,S.isInFallback=!1;let N=S.parent,L=!1;for(;N;){if(N.pendingBranch){N.effects.push(...$),L=!0;break}N=N.parent}!L&&!H&&Ri($),S.effects=[],x&&t&&t.pendingBranch&&O===t.pendingId&&(t.deps--,t.deps===0&&!w&&t.resolve()),Li(T,"onResolve")},fallback(g){if(!S.pendingBranch)return;const{vnode:w,activeBranch:T,parentComponent:C,container:M,namespace:B}=S;Li(w,"onFallback");const $=b(T),I=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,g,M,$,C,null,B,r,o),La(S,g))},j=g.transition&&g.transition.mode==="out-in";j&&(S.isFallbackMountPending=!0,T.transition.afterLeave=I),S.isInFallback=!0,p(T,C,null,!0),j||I()},move(g,w,T){S.activeBranch&&f(S.activeBranch,g,w,T),S.container=g},next(){return S.activeBranch&&b(S.activeBranch)},registerDep(g,w,T){const C=!!S.pendingBranch;C&&S.deps++;const M=g.vnode.el;g.asyncDep.catch(B=>{da(B,g,0)}).then(B=>{if(g.isUnmounted||S.isUnmounted||S.pendingId!==g.suspenseId)return;Pi(),g.asyncResolved=!0;const{vnode:$}=g;Co(g,B,!1),M&&($.el=M);const I=!M&&g.subTree.el;w(g,$,y(M||g.subTree.el),M?null:b(g.subTree),S,l,T),I&&($.placeholder=null,A(I)),Tr(g,$.el),C&&--S.deps===0&&S.resolve()})},unmount(g,w){S.isUnmounted=!0,S.activeBranch&&p(S.activeBranch,s,g,w),S.pendingBranch&&p(S.pendingBranch,s,g,w)}};return S}function Pb(e,t,s,n,a,i,l,r,o){const c=t.suspense=Cp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Fb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Td(n?s.default:s),e.ssFallback=n?Td(s.fallback):ft(yt)}function Td(e){let t;if(Ie(e)){const s=na&&e._c;s&&(e._d=!1,Di()),e=e(),s&&(e._d=!0,t=zt,Ap())}return ge(e)&&(e=_b(e)),e=rs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Ep(e,t){t&&t.pendingBranch?ge(e)?t.effects.push(...e):t.effects.push(e):Ri(e)}function La(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Tr(n,a))}function $b(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Ot=Symbol.for("v-fgt"),Pn=Symbol.for("v-txt"),yt=Symbol.for("v-cmt"),ea=Symbol.for("v-stc"),yi=[];let zt=null;function Di(e=!1){yi.push(zt=e?null:[])}function Ap(){yi.pop(),zt=yi[yi.length-1]||null}let na=1;function Mi(e,t=!1){na+=e,e<0&&zt&&t&&(zt.hasOnce=!0)}function Rp(e){return e.dynamicChildren=na>0?zt||Ea:null,Ap(),na>0&&zt&&zt.push(e),e}function Ub(e,t,s,n,a,i){return Rp(bc(e,t,s,n,a,i,!0))}function Vl(e,t,s,n,a){return Rp(ft(e,t,s,n,a,!0))}function Sn(e){return e?e.__v_isVNode===!0:!1}function Ls(e,t){return e.type===t.type&&e.key===t.key}function Bb(e){}const Ip=({key:e})=>e??null,Cl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Me(e)||St(e)||Ie(e)?{i:Pt,r:e,k:t,f:!!s}:e:null);function bc(e,t=null,s=null,n=0,a=null,i=e===Ot?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Ip(t),ref:t&&Cl(t),scopeId:yr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Pt};return r?(xc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Me(s)?8:16),na>0&&!l&&zt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&zt.push(o),o}const ft=Hb;function Hb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===ip)&&(e=yt),Sn(e)){const r=Ys(e,t,!0);return s&&xc(r,s),na>0&&!i&&zt&&(r.shapeFlag&6?zt[zt.indexOf(e)]=r:zt.push(r)),r.patchFlag=-2,r}if(Wb(e)&&(e=e.__vccOpts),t){t=Op(t);let{class:r,style:o}=t;r&&!Me(r)&&(t.class=qi(r)),Qe(o)&&(Gi(o)&&!ge(o)&&(o=je({},o)),t.style=zi(o))}const l=Me(e)?1:Hl(e)?128:Wf(e)?64:Qe(e)?4:Ie(e)?2:0;return bc(e,t,s,n,a,l,i,!0)}function Op(e){return e?Gi(e)||hp(e)?je({},e):e:null}function Ys(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Lp(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Ip(c),ref:t&&t.ref?s&&i?ge(i)?i.concat(Cl(t)):[i,Cl(t)]:Cl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Ot?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ys(e.ssContent),ssFallback:e.ssFallback&&Ys(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&wn(d,o.clone(d)),d}function yc(e=" ",t=0){return ft(Pn,null,e,t)}function Vb(e,t){const s=ft(ea,null,e);return s.staticCount=t,s}function Np(e="",t=!1){return t?(Di(),Vl(yt,null,e)):ft(yt,null,e)}function rs(e){return e==null||typeof e=="boolean"?ft(yt):ge(e)?ft(Ot,null,e.slice()):Sn(e)?cn(e):ft(Pn,null,String(e))}function cn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ys(e)}function xc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(ge(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),xc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!hp(t)?t._ctx=Pt:a===3&&Pt&&(Pt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ie(t)?(t={default:t,_ctx:Pt},s=32):(t=String(t),n&64?(s=16,t=[yc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Lp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=qi([t.class,n.class]));else if(a==="style")t.style=zi([t.style,n.style]);else if(ra(a)){const i=t[a],l=n[a];l&&i!==l&&!(ge(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!or(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function is(e,t,s,n=null){ms(e,t,7,[s,n])}const jb=op();let zb=0;function Dp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||jb,i={uid:zb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Qo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:gp(n,a),emitsOptions:dp(n,a),emit:null,emitted:null,propsDefaults:qe,inheritAttrs:n.inheritAttrs,ctx:qe,data:qe,props:qe,attrs:qe,slots:qe,refs:qe,setupState:qe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=yb.bind(null,i),e.ce&&e.ce(i),i}let Mt=null;const ts=()=>Mt||Pt;let jl,Da;{const e=pr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};jl=t("__VUE_INSTANCE_SETTERS__",s=>Mt=s),Da=t("__VUE_SSR_SETTERS__",s=>aa=s)}const Ya=e=>{const t=Mt;return jl(e),e.scope.on(),()=>{e.scope.off(),jl(t)}},Pi=()=>{Mt&&Mt.scope.off(),jl(null)};function Mp(e){return e.vnode.shapeFlag&4}let aa=!1;function Pp(e,t=!1,s=!1){t&&Da(t);const{props:n,children:a}=e.vnode,i=Mp(e);Tb(e,n,i,t),Rb(e,a,s||t);const l=i?qb(e,t):void 0;return t&&Da(!1),l}function qb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,_o);const{setup:n}=s;if(n){_n();const a=e.setupContext=n.length>1?Up(e):null,i=Ya(e),l=Ja(n,e,0,[e.props,a]),r=Yo(l);if(kn(),i(),(r||e.sp)&&!bn(e)&&cc(e),r){if(l.then(Pi,Pi),t)return l.then(o=>{Co(e,o,t)}).catch(o=>{da(o,e,0)});e.asyncDep=l}else Co(e,l,t)}else $p(e,t)}function Co(e,t,s){Ie(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Qe(t)&&(e.setupState=ac(t)),$p(e,s)}let zl,Eo;function Fp(e){zl=e,Eo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Yv))}}const Gb=()=>!zl;function $p(e,t,s){const n=e.type;if(!e.render){if(!t&&zl&&!n.render){const a=n.template||hc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=je(je({isCustomElement:i,delimiters:r},l),o);n.render=zl(a,c)}}e.render=n.render||Ft,Eo&&Eo(e)}{const a=Ya(e);_n();try{ub(e)}finally{kn(),a()}}}const Kb={get(e,t){return jt(e,"get",""),e[t]}};function Up(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Kb),slots:e.slots,emit:e.emit,expose:t}}function Ji(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(ac(Lf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in bi)return bi[s](e)},has(t,s){return s in t||s in bi}})):e.proxy}function Ao(e,t=!0){return Ie(e)?e.displayName||e.name:e.name||t&&e.__name}function Wb(e){return Ie(e)&&"__vccOpts"in e}const J=(e,t)=>ev(e,t,aa);function Ua(e,t,s){try{Mi(-1);const n=arguments.length;return n===2?Qe(t)&&!ge(t)?Sn(t)?ft(e,null,[t]):ft(e,t):ft(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Sn(s)&&(s=[s]),ft(e,t,s))}finally{Mi(1)}}function Zb(){}function Jb(e,t,s,n){const a=s[n];if(a&&Bp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Bp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(It(s[n],t[n]))return!1;return na>0&&zt&&zt.push(e),!0}const Hp="3.5.38",Yb=Ft,Qb=cv,Xb=ka,ey=Vf,ty={createComponentInstance:Dp,setupComponent:Pp,renderComponentRoot:Tl,setCurrentRenderingInstance:Oi,isVNode:Sn,normalizeVNode:rs,getComponentPublicInstance:Ji,ensureValidVNode:pc,pushWarningContext:iv,popWarningContext:lv},sy=ty,ny=null,ay=null,iy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Ro;const Cd=typeof window<"u"&&window.trustedTypes;if(Cd)try{Ro=Cd.createPolicy("vue",{createHTML:e=>e})}catch{}const Vp=Ro?e=>Ro.createHTML(e):e=>e,ly="http://www.w3.org/2000/svg",ry="http://www.w3.org/1998/Math/MathML",on=typeof document<"u"?document:null,Ed=on&&on.createElement("template"),jp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?on.createElementNS(ly,e):t==="mathml"?on.createElementNS(ry,e):s?on.createElement(e,{is:s}):on.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>on.createTextNode(e),createComment:e=>on.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>on.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Ed.innerHTML=Vp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Ed.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},En="transition",ni="animation",Ba=Symbol("_vtc"),zp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},qp=je({},oc,zp),oy=e=>(e.displayName="Transition",e.props=qp,e),cy=oy((e,{slots:t})=>Ua(Yf,Gp(e),t)),zn=(e,t=[])=>{ge(e)?e.forEach(s=>s(...t)):e&&e(...t)},Ad=e=>e?ge(e)?e.some(t=>t.length>1):e.length>1:!1;function Gp(e){const t={};for(const $ in e)$ in zp||(t[$]=e[$]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,b=dy(a),y=b&&b[0],A=b&&b[1],{onBeforeEnter:O,onEnter:x,onEnterCancelled:m,onLeave:_,onLeaveCancelled:S,onBeforeAppear:g=O,onAppear:w=x,onAppearCancelled:T=m}=t,C=($,I,j,Y)=>{$._enterCancelled=Y,On($,I?d:r),On($,I?c:l),j&&j()},M=($,I)=>{$._isLeaving=!1,On($,u),On($,p),On($,f),I&&I()},B=$=>(I,j)=>{const Y=$?w:x,H=()=>C(I,$,j);zn(Y,[I,H]),Rd(()=>{On(I,$?o:i),js(I,$?d:r),Ad(Y)||Id(I,n,y,H)})};return je(t,{onBeforeEnter($){zn(O,[$]),js($,i),js($,l)},onBeforeAppear($){zn(g,[$]),js($,o),js($,c)},onEnter:B(!1),onAppear:B(!0),onLeave($,I){$._isLeaving=!0;const j=()=>M($,I);js($,u),$._enterCancelled?(js($,f),Io($)):(Io($),js($,f)),Rd(()=>{$._isLeaving&&(On($,u),js($,p),Ad(_)||Id($,n,A,j))}),zn(_,[$,j])},onEnterCancelled($){C($,!1,void 0,!0),zn(m,[$])},onAppearCancelled($){C($,!0,void 0,!0),zn(T,[$])},onLeaveCancelled($){M($),zn(S,[$])}})}function dy(e){if(e==null)return null;if(Qe(e))return[Wr(e.enter),Wr(e.leave)];{const t=Wr(e);return[t,t]}}function Wr(e){return Nl(e)}function js(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ba]||(e[Ba]=new Set)).add(t)}function On(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ba];s&&(s.delete(t),s.size||(e[Ba]=void 0))}function Rd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let uy=0;function Id(e,t,s,n){const a=e._endId=++uy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Kp(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,f)}function Kp(e,t){const s=window.getComputedStyle(e),n=b=>(s[b]||"").split(", "),a=n(`${En}Delay`),i=n(`${En}Duration`),l=Od(a,i),r=n(`${ni}Delay`),o=n(`${ni}Duration`),c=Od(r,o);let d=null,u=0,f=0;t===En?l>0&&(d=En,u=l,f=i.length):t===ni?c>0&&(d=ni,u=c,f=o.length):(u=Math.max(l,c),d=u>0?l>c?En:ni:null,f=d?d===En?i.length:o.length:0);const p=d===En&&/\b(?:transform|all)(?:,|$)/.test(n(`${En}Property`).toString());return{type:d,timeout:u,propCount:f,hasTransform:p}}function Od(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Nd(s)+Nd(e[n])))}function Nd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Io(e){return(e?e.ownerDocument:document).body.offsetHeight}function fy(e,t,s){const n=e[Ba];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const ql=Symbol("_vod"),_c=Symbol("_vsh"),Wp={name:"show",beforeMount(e,{value:t},{transition:s}){e[ql]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):ai(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),ai(e,!0),n.enter(e)):n.leave(e,()=>{ai(e,!1)}):ai(e,t))},beforeUnmount(e,{value:t}){ai(e,t)}};function ai(e,t){e.style.display=t?e[ql]:"none",e[_c]=!t}function py(){Wp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Zp=Symbol("");function hy(e){const t=ts();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Gl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Gl(t.ce,a):Oo(t.subTree,a),s(a)};dc(()=>{Ri(n)}),We(()=>{es(n,Ft,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),xt(()=>a.disconnect())})}function Oo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Oo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Gl(e.el,t);else if(e.type===Ot)e.children.forEach(s=>Oo(s,t));else if(e.type===ea){let{el:s,anchor:n}=e;for(;s&&(Gl(s,t),s!==n);)s=s.nextSibling}}function Gl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=xg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Zp]=n}}const my=/(?:^|;)\s*display\s*:/;function gy(e,t,s){const n=e.style,a=Me(s);let i=!1;if(s&&!a){if(t)if(Me(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&pi(n,r,"")}else for(const l in t)s[l]==null&&pi(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?by(e,l,!Me(t)&&t?t[l]:void 0,r)||pi(n,l,r):pi(n,l,"")}}else if(a){if(t!==s){const l=n[Zp];l&&(s+=";"+l),n.cssText=s,i=my.test(s)}}else t&&e.removeAttribute("style");ql in e&&(e[ql]=i?n.display:"",e[_c]&&(n.display="none"))}const Ld=/\s*!important$/;function pi(e,t,s){if(ge(s))s.forEach(n=>pi(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=vy(e,t);Ld.test(s)?e.setProperty(os(n),s.replace(Ld,""),"important"):e[n]=s}}const Dd=["Webkit","Moz","ms"],Zr={};function vy(e,t){const s=Zr[t];if(s)return s;let n=at(t);if(n!=="filter"&&n in e)return Zr[t]=n;n=ca(n);for(let a=0;a<Dd.length;a++){const i=Dd[a]+n;if(i in e)return Zr[t]=i}return t}function by(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Me(n)&&s===n}const Md="http://www.w3.org/1999/xlink";function Pd(e,t,s,n,a,i=bg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Md,t.slice(6,t.length)):e.setAttributeNS(Md,t,s):s==null||i&&!pf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Gt(s)?String(s):s)}function Fd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Vp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=pf(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function pn(e,t,s,n){e.addEventListener(t,s,n)}function yy(e,t,s,n){e.removeEventListener(t,s,n)}const $d=Symbol("_vei");function xy(e,t,s,n,a=null){const i=e[$d]||(e[$d]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=_y(t);if(n){const c=i[t]=Sy(n,a);pn(e,r,c,o)}else l&&(yy(e,r,l,o),i[t]=void 0)}}const Ud=/(?:Once|Passive|Capture)$/;function _y(e){let t;if(Ud.test(e)){t={};let n;for(;n=e.match(Ud);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):os(e.slice(2)),t]}let Jr=0;const ky=Promise.resolve(),wy=()=>Jr||(ky.then(()=>Jr=0),Jr=Date.now());function Sy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(ge(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ms(c,t,5,r)}}else ms(a,t,5,[n])};return s.value=e,s.attached=wy(),s}const Bd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Jp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?fy(e,n,l):t==="style"?gy(e,s,n):ra(t)?or(t)||xy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Ty(e,t,n,l))?(Fd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Pd(e,t,n,l,i,t!=="value")):e._isVueCE&&(Cy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Me(n)))?Fd(e,at(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Pd(e,t,n,l))};function Ty(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Bd(t)&&Ie(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Bd(t)&&Me(s)?!1:t in e}function Cy(e,t){const s=e._def.props;if(!s)return!1;const n=at(t);return Array.isArray(s)?s.some(a=>at(a)===n):Object.keys(s).some(a=>at(a)===n)}const Hd={};function Yp(e,t,s){let n=Wi(e,t);cr(n)&&(n=je({},n,t));class a extends Cr{constructor(l){super(n,l,s)}}return a.def=n,a}const Ey=((e,t)=>Yp(e,t,dh)),Ay=typeof HTMLElement<"u"?HTMLElement:class{};class Cr extends Ay{constructor(t,s={},n=Zl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Zl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Cr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,At(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!ge(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Nl(this._props[o])),(r||(r=Object.create(null)))[at(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)et(this,n)||Object.defineProperty(this,n,{get:()=>Zs(s[n])})}_resolveProps(t){const{props:s}=t,n=ge(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(at))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Hd;const a=at(t);s&&this._numberProps&&this._numberProps[a]&&(n=Nl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Hd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(os(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(os(t),s+""):s||this.removeAttribute(os(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),ch(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ft(this._def,je(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,cr(l[0])?je({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),os(i)!==i&&a(os(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Qp(e){const t=ts(),s=t&&t.ce;return s||null}function Ry(){const e=Qp();return e&&e.shadowRoot}function Iy(e="$style"){{const t=ts();if(!t)return qe;const s=t.type.__cssModules;if(!s)return qe;const n=s[e];return n||qe}}const Xp=new WeakMap,eh=new WeakMap,Kl=Symbol("_moveCb"),Vd=Symbol("_enterCb"),Oy=e=>(delete e.props.mode,e),Ny=Oy({name:"TransitionGroup",props:je({},qp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=ts(),n=rc();let a,i;return kr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Fy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Dy),a.forEach(My);const r=a.filter(Py);Io(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;js(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Kl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Kl]=null,On(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ze(e),r=Gp(l);let o=l.tag||Ot;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[_c]&&(a.push(d),wn(d,$a(d,r,n,s)),Xp.set(d,th(d.el)))}i=t.default?xr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&wn(d,$a(d,r,n,s))}return ft(o,null,i)}}}),Ly=Ny;function Dy(e){const t=e.el;t[Kl]&&t[Kl](),t[Vd]&&t[Vd]()}function My(e){eh.set(e,th(e.el))}function Py(e){const t=Xp.get(e),s=eh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function th(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Fy(e,t,s){const n=e.cloneNode(),a=e[Ba];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Kp(n);return i.removeChild(n),l}const $n=e=>{const t=e.props["onUpdate:modelValue"]||!1;return ge(t)?s=>Ia(t,s):t};function $y(e){e.target.composing=!0}function jd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ss=Symbol("_assign");function zd(e,t,s){return t&&(e=e.trim()),s&&(e=fr(e)),e}const Wl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ss]=$n(a);const i=n||a.props&&a.props.type==="number";pn(e,t?"change":"input",l=>{l.target.composing||e[Ss](zd(e.value,s,i))}),(s||i)&&pn(e,"change",()=>{e.value=zd(e.value,s,i)}),t||(pn(e,"compositionstart",$y),pn(e,"compositionend",jd),pn(e,"change",jd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ss]=$n(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?fr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},kc={deep:!0,created(e,t,s){e[Ss]=$n(s),pn(e,"change",()=>{const n=e._modelValue,a=Ha(e),i=e.checked,l=e[Ss];if(ge(n)){const r=hr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(oa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(nh(e,i))})},mounted:qd,beforeUpdate(e,t,s){e[Ss]=$n(s),qd(e,t,s)}};function qd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(ge(t))a=hr(t,n.props.value)>-1;else if(oa(t))a=t.has(n.props.value);else{if(t===s)return;a=xn(t,nh(e,!0))}e.checked!==a&&(e.checked=a)}const wc={created(e,{value:t},s){e.checked=xn(t,s.props.value),e[Ss]=$n(s),pn(e,"change",()=>{e[Ss](Ha(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ss]=$n(n),t!==s&&(e.checked=xn(t,n.props.value))}},sh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=oa(t);pn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?fr(Ha(l)):Ha(l));e[Ss](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,At(()=>{e._assigning=!1})}),e[Ss]=$n(n)},mounted(e,{value:t}){Gd(e,t)},beforeUpdate(e,t,s){e[Ss]=$n(s)},updated(e,{value:t}){e._assigning||Gd(e,t)}};function Gd(e,t){const s=e.multiple,n=ge(t);if(!(s&&!n&&!oa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ha(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=hr(t,r)>-1}else l.selected=t.has(r);else if(xn(Ha(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ha(e){return"_value"in e?e._value:e.value}function nh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ah={created(e,t,s){vl(e,t,s,null,"created")},mounted(e,t,s){vl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){vl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){vl(e,t,s,n,"updated")}};function ih(e,t){switch(e){case"SELECT":return sh;case"TEXTAREA":return Wl;default:switch(t){case"checkbox":return kc;case"radio":return wc;default:return Wl}}}function vl(e,t,s,n,a){const l=ih(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Uy(){Wl.getSSRProps=({value:e})=>({value:e}),wc.getSSRProps=({value:e},t)=>{if(t.props&&xn(t.props.value,e))return{checked:!0}},kc.getSSRProps=({value:e},t)=>{if(ge(e)){if(t.props&&hr(e,t.props.value)>-1)return{checked:!0}}else if(oa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ah.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=ih(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const By=["ctrl","shift","alt","meta"],Hy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>By.some(s=>e[`${s}Key`]&&!t.includes(s))},Vy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Hy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},jy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},zy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=os(a.key);if(t.some(l=>l===i||jy[l]===i))return e(a)}))},lh=je({patchProp:Jp},jp);let xi,Kd=!1;function rh(){return xi||(xi=xp(lh))}function oh(){return xi=Kd?xi:_p(lh),Kd=!0,xi}const ch=((...e)=>{rh().render(...e)}),qy=((...e)=>{oh().hydrate(...e)}),Zl=((...e)=>{const t=rh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=fh(n);if(!a)return;const i=t._component;!Ie(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,uh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),dh=((...e)=>{const t=oh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=fh(n);if(a)return s(a,!0,uh(a))},t});function uh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function fh(e){return Me(e)?document.querySelector(e):e}let Wd=!1;const Gy=()=>{Wd||(Wd=!0,Uy(),py())},Ky=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Yf,BaseTransitionPropsValidators:oc,Comment:yt,DeprecationTypes:iy,EffectScope:Qo,ErrorCodes:ov,ErrorTypeStrings:Qb,Fragment:Ot,KeepAlive:Hv,ReactiveEffect:Ci,Static:ea,Suspense:Lb,Teleport:wv,Text:Pn,TrackOpTypes:tv,Transition:cy,TransitionGroup:Ly,TriggerOpTypes:sv,VueElement:Cr,assertNumber:rv,callWithAsyncErrorHandling:ms,callWithErrorHandling:Ja,camelize:at,capitalize:ca,cloneVNode:Ys,compatUtils:ay,computed:J,createApp:Zl,createBlock:Vl,createCommentVNode:Np,createElementBlock:Ub,createElementVNode:bc,createHydrationRenderer:_p,createPropsRestProxy:cb,createRenderer:xp,createSSRApp:dh,createSlots:Wv,createStaticVNode:Vb,createTextVNode:yc,createVNode:ft,customRef:Mf,defineAsyncComponent:Uv,defineComponent:Wi,defineCustomElement:Yp,defineEmits:Xv,defineExpose:eb,defineModel:nb,defineOptions:tb,defineProps:Qv,defineSSRCustomElement:Ey,defineSlots:sb,devtools:Xb,effect:Sg,effectScope:_g,getCurrentInstance:ts,getCurrentScope:vf,getCurrentWatcher:nv,getTransitionRawChildren:xr,guardReactiveProps:Op,h:Ua,handleError:da,hasInjectionContext:gv,hydrate:qy,hydrateOnIdle:Lv,hydrateOnInteraction:Fv,hydrateOnMediaQuery:Pv,hydrateOnVisible:Mv,initCustomFormatter:Zb,initDirectivesForSSR:Gy,inject:ws,isMemoSame:Bp,isProxy:Gi,isReactive:vn,isReadonly:Js,isRef:St,isRuntimeOnly:Gb,isShallow:ds,isVNode:Sn,markRaw:Lf,mergeDefaults:rb,mergeModels:ob,mergeProps:Lp,nextTick:At,nodeOps:jp,normalizeClass:qi,normalizeProps:og,normalizeStyle:zi,onActivated:Cs,onBeforeMount:ep,onBeforeUnmount:wr,onBeforeUpdate:dc,onDeactivated:Es,onErrorCaptured:ap,onMounted:We,onRenderTracked:np,onRenderTriggered:sp,onScopeDispose:kg,onServerPrefetch:tp,onUnmounted:xt,onUpdated:kr,onWatcherCleanup:Ff,openBlock:Di,patchProp:Jp,popScopeId:pv,provide:vi,proxyRefs:ac,pushScopeId:fv,queuePostFlushCb:Ri,reactive:Un,readonly:Dl,ref:h,registerRuntimeCompiler:Fp,render:ch,renderList:Kv,renderSlot:Zv,resolveComponent:zv,resolveDirective:Gv,resolveDynamicComponent:qv,resolveFilter:ny,resolveTransitionHooks:$a,setBlockTracking:Mi,setDevtoolsHook:ey,setTransitionHooks:wn,shallowReactive:sc,shallowReadonly:jg,shallowRef:nc,ssrContextKey:jf,ssrUtils:sy,stop:Tg,toDisplayString:mf,toHandlerKey:Ra,toHandlers:Jv,toRaw:Ze,toRef:Qg,toRefs:Zg,toValue:Gg,transformVNodeArgs:Bb,triggerRef:qg,unref:Zs,useAttrs:lb,useCssModule:Iy,useCssVars:hy,useHost:Qp,useId:Tv,useModel:bb,useSSRContext:zf,useShadowRoot:Ry,useSlots:ib,useTemplateRef:Cv,useTransitionState:rc,vModelCheckbox:kc,vModelDynamic:ah,vModelRadio:wc,vModelSelect:sh,vModelText:Wl,vShow:Wp,version:Hp,warn:Yb,watch:es,watchEffect:vv,watchPostEffect:bv,watchSyncEffect:qf,withAsyncContext:db,withCtx:lc,withDefaults:ab,withDirectives:mv,withKeys:zy,withMemo:Jb,withModifiers:Vy,withScopeId:hv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Fi=Symbol(""),_i=Symbol(""),Sc=Symbol(""),Jl=Symbol(""),ph=Symbol(""),ia=Symbol(""),hh=Symbol(""),mh=Symbol(""),Tc=Symbol(""),Cc=Symbol(""),Yi=Symbol(""),Ec=Symbol(""),gh=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),Ic=Symbol(""),Oc=Symbol(""),Nc=Symbol(""),Lc=Symbol(""),vh=Symbol(""),bh=Symbol(""),Er=Symbol(""),Yl=Symbol(""),Dc=Symbol(""),Mc=Symbol(""),$i=Symbol(""),Qi=Symbol(""),Pc=Symbol(""),No=Symbol(""),Wy=Symbol(""),Lo=Symbol(""),Ql=Symbol(""),Zy=Symbol(""),Jy=Symbol(""),Fc=Symbol(""),Yy=Symbol(""),Qy=Symbol(""),$c=Symbol(""),yh=Symbol(""),Va={[Fi]:"Fragment",[_i]:"Teleport",[Sc]:"Suspense",[Jl]:"KeepAlive",[ph]:"BaseTransition",[ia]:"openBlock",[hh]:"createBlock",[mh]:"createElementBlock",[Tc]:"createVNode",[Cc]:"createElementVNode",[Yi]:"createCommentVNode",[Ec]:"createTextVNode",[gh]:"createStaticVNode",[Ac]:"resolveComponent",[Rc]:"resolveDynamicComponent",[Ic]:"resolveDirective",[Oc]:"resolveFilter",[Nc]:"withDirectives",[Lc]:"renderList",[vh]:"renderSlot",[bh]:"createSlots",[Er]:"toDisplayString",[Yl]:"mergeProps",[Dc]:"normalizeClass",[Mc]:"normalizeStyle",[$i]:"normalizeProps",[Qi]:"guardReactiveProps",[Pc]:"toHandlers",[No]:"camelize",[Wy]:"capitalize",[Lo]:"toHandlerKey",[Ql]:"setBlockTracking",[Zy]:"pushScopeId",[Jy]:"popScopeId",[Fc]:"withCtx",[Yy]:"unref",[Qy]:"isRef",[$c]:"withMemo",[yh]:"isMemoSame"};function Xy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Va[t]=e[t]})}const bs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ex(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:bs}}function Ui(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=bs){return e&&(r?(e.helper(ia),e.helper(qa(e.inSSR,c))):e.helper(za(e.inSSR,c)),l&&e.helper(Nc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function ta(e,t=bs){return{type:17,loc:t,elements:e}}function ks(e,t=bs){return{type:15,loc:t,properties:e}}function wt(e,t){return{type:16,loc:bs,key:Me(e)?Pe(e,!0):e,value:t}}function Pe(e,t=!1,s=bs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Ms(e,t=bs){return{type:8,loc:t,children:e}}function Rt(e,t=[],s=bs){return{type:14,loc:s,callee:e,arguments:t}}function ja(e,t=void 0,s=!1,n=!1,a=bs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Do(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:bs}}function tx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:bs}}function sx(e){return{type:21,body:e,loc:bs}}function za(e,t){return e||t?Tc:Cc}function qa(e,t){return e||t?hh:mh}function Uc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(za(n,e.isComponent)),t(ia),t(qa(n,e.isComponent)))}const Zd=new Uint8Array([123,123]),Jd=new Uint8Array([125,125]);function Yd(e){return e>=97&&e<=122||e>=65&&e<=90}function ps(e){return e===32||e===10||e===9||e===12||e===13}function An(e){return e===47||e===62||ps(e)}function Xl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Bt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class nx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Zd,this.delimiterClose=Jd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Zd,this.delimiterClose=Jd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?An(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||ps(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Bt.TitleEnd||this.currentSequence===Bt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Bt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Bt.Cdata.length&&(this.state=28,this.currentSequence=Bt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Bt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Yd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){An(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(An(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Xl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){ps(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Yd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||ps(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):ps(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):ps(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||An(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||An(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||An(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||An(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||An(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):ps(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):ps(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){ps(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Bt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Bt.ScriptEnd[3]?this.startSpecial(Bt.ScriptEnd,4):t===Bt.StyleEnd[3]?this.startSpecial(Bt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Bt.TitleEnd[3]?this.startSpecial(Bt.TitleEnd,4):t===Bt.TextareaEnd[3]?this.startSpecial(Bt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Bt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Qd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function sa(e,t){const s=Qd("MODE",t),n=Qd(e,t);return s===3?n===!0:n!==!1}function Bi(e,t,s,...n){return sa(e,t)}function Bc(e){throw e}function xh(e){}function ut(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const cs=e=>e.type===4&&e.isStatic;function _h(e){switch(e){case"Teleport":case"teleport":return _i;case"Suspense":case"suspense":return Sc;case"KeepAlive":case"keep-alive":return Jl;case"BaseTransition":case"base-transition":return ph}}const ax=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Hc=e=>!ax.test(e),kh=/[A-Za-z_$\xA0-\uFFFF]/,ix=/[\.\?\w$\xA0-\uFFFF]/,lx=/\s+[.[]\s*|\s*[.[]\s+/g,wh=e=>e.type===4?e.content:e.loc.source,rx=e=>{const t=wh(e).trim().replace(lx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?kh:ix).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Sh=rx,ox=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,cx=e=>ox.test(wh(e)),dx=cx;function _s(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Me(t)?a.name===t:t.test(a.name)))return a}}function Ar(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Zn(i.arg,t))return i}}function Zn(e,t){return!!(e&&cs(e)&&e.content===t)}function ux(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Yr(e){return e.type===5||e.type===2}function Xd(e){return e.type===7&&e.name==="pre"}function fx(e){return e.type===7&&e.name==="slot"}function er(e){return e.type===1&&e.tagType===3}function tr(e){return e.type===1&&e.tagType===2}const px=new Set([$i,Qi]);function Th(e,t=[]){if(e&&!Me(e)&&e.type===14){const s=e.callee;if(!Me(s)&&px.has(s))return Th(e.arguments[0],t.concat(e))}return[e,t]}function sr(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Me(a)&&a.type===14){const r=Th(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Me(a))n=ks([t]);else if(a.type===14){const r=a.arguments[0];!Me(r)&&r.type===15?eu(t,r)||r.properties.unshift(t):a.callee===Pc?n=Rt(s.helper(Yl),[ks([t]),a]):a.arguments.unshift(ks([t])),!n&&(n=a)}else a.type===15?(eu(t,a)||a.properties.unshift(t),n=a):(n=Rt(s.helper(Yl),[ks([t]),a]),l&&l.callee===Qi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function eu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Hi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function hx(e){return e.type===14&&e.callee===$c?e.arguments[1].returns:e}const mx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Ch(e){for(let t=0;t<e.length;t++)if(!ps(e.charCodeAt(t)))return!1;return!0}function Vc(e){return e.type===2&&Ch(e.content)||e.type===12&&Vc(e.content)}function Eh(e){return e.type===3||Vc(e)}const Ah={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ta,isPreTag:Ta,isIgnoreNewlineTag:Ta,isCustomElement:Ta,onError:Bc,onWarn:xh,comments:!1,prefixIdentifiers:!1};let Ye=Ah,Vi=null,yn="",Vt=null,Ge=null,as="",rn=-1,Gn=-1,jc=0,Dn=!1,Mo=null;const dt=[],gt=new nx(dt,{onerr:nn,ontext(e,t){bl(Dt(e,t),e,t)},ontextentity(e,t,s){bl(e,t,s)},oninterpolation(e,t){if(Dn)return bl(Dt(e,t),e,t);let s=e+gt.delimiterOpen.length,n=t-gt.delimiterClose.length;for(;ps(yn.charCodeAt(s));)s++;for(;ps(yn.charCodeAt(n-1));)n--;let a=Dt(s,n);a.includes("&")&&(a=Ye.decodeEntities(a,!1)),Po({type:5,content:Al(a,!1,bt(s,n)),loc:bt(e,t)})},onopentagname(e,t){const s=Dt(e,t);Vt={type:1,tag:s,ns:Ye.getNamespace(s,dt[0],Ye.ns),tagType:0,props:[],children:[],loc:bt(e-1,t),codegenNode:void 0}},onopentagend(e){su(e)},onclosetag(e,t){const s=Dt(e,t);if(!Ye.isVoidTag(s)){let n=!1;for(let a=0;a<dt.length;a++)if(dt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&nn(24,dt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=dt.shift();El(r,t,l<a)}break}n||nn(23,Rh(e,60))}},onselfclosingtag(e){const t=Vt.tag;Vt.isSelfClosing=!0,su(e),dt[0]&&dt[0].tag===t&&El(dt.shift(),e)},onattribname(e,t){Ge={type:6,name:Dt(e,t),nameLoc:bt(e,t),value:void 0,loc:bt(e)}},ondirname(e,t){const s=Dt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Dn&&n===""&&nn(26,e),Dn||n==="")Ge={type:6,name:s,nameLoc:bt(e,t),value:void 0,loc:bt(e)};else if(Ge={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Pe("prop")]:[],loc:bt(e)},n==="pre"){Dn=gt.inVPre=!0,Mo=Vt;const a=Vt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Tx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Dt(e,t);if(Dn&&!Xd(Ge))Ge.name+=s,Jn(Ge.nameLoc,t);else{const n=s[0]!=="[";Ge.arg=Al(n?s:s.slice(1,-1),n,bt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Dt(e,t);if(Dn&&!Xd(Ge))Ge.name+="."+s,Jn(Ge.nameLoc,t);else if(Ge.name==="slot"){const n=Ge.arg;n&&(n.content+="."+s,Jn(n.loc,t))}else{const n=Pe(s,!0,bt(e,t));Ge.modifiers.push(n)}},onattribdata(e,t){as+=Dt(e,t),rn<0&&(rn=e),Gn=t},onattribentity(e,t,s){as+=e,rn<0&&(rn=t),Gn=s},onattribnameend(e){const t=Ge.loc.start.offset,s=Dt(t,e);Ge.type===7&&(Ge.rawName=s),Vt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&nn(2,t)},onattribend(e,t){if(Vt&&Ge){if(Jn(Ge.loc,t),e!==0)if(as.includes("&")&&(as=Ye.decodeEntities(as,!0)),Ge.type===6)Ge.name==="class"&&(as=Oh(as).trim()),e===1&&!as&&nn(13,t),Ge.value={type:2,content:as,loc:e===1?bt(rn,Gn):bt(rn-1,Gn+1)},gt.inSFCRoot&&Vt.tag==="template"&&Ge.name==="lang"&&as&&as!=="html"&&gt.enterRCDATA(Xl("</template"),0);else{let s=0;Ge.exp=Al(as,!1,bt(rn,Gn),0,s),Ge.name==="for"&&(Ge.forParseResult=vx(Ge.exp));let n=-1;Ge.name==="bind"&&(n=Ge.modifiers.findIndex(a=>a.content==="sync"))>-1&&Bi("COMPILER_V_BIND_SYNC",Ye,Ge.loc,Ge.arg.loc.source)&&(Ge.name="model",Ge.modifiers.splice(n,1))}(Ge.type!==7||Ge.name!=="pre")&&Vt.props.push(Ge)}as="",rn=Gn=-1},oncomment(e,t){Ye.comments&&Po({type:3,content:Dt(e,t),loc:bt(e-4,t+3)})},onend(){const e=yn.length;for(let t=0;t<dt.length;t++)El(dt[t],e-1),nn(24,dt[t].loc.start.offset)},oncdata(e,t){(dt[0]?dt[0].ns:Ye.ns)!==0?bl(Dt(e,t),e,t):nn(1,e-9)},onprocessinginstruction(e){(dt[0]?dt[0].ns:Ye.ns)===0&&nn(21,e-1)}}),tu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,gx=/^\(|\)$/g;function vx(e){const t=e.loc,s=e.content,n=s.match(mx);if(!n)return;const[,a,i]=n,l=(u,f,p=!1)=>{const b=t.start.offset+f,y=b+u.length;return Al(u,!1,bt(b,y),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(gx,"").trim();const c=a.indexOf(o),d=o.match(tu);if(d){o=o.replace(tu,"").trim();const u=d[1].trim();let f;if(u&&(f=s.indexOf(u,c+o.length),r.key=l(u,f,!0)),d[2]){const p=d[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Dt(e,t){return yn.slice(e,t)}function su(e){gt.inSFCRoot&&(Vt.innerLoc=bt(e+1,e+1)),Po(Vt);const{tag:t,ns:s}=Vt;s===0&&Ye.isPreTag(t)&&jc++,Ye.isVoidTag(t)?El(Vt,e):(dt.unshift(Vt),(s===1||s===2)&&(gt.inXML=!0)),Vt=null}function bl(e,t,s){{const i=dt[0]&&dt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ye.decodeEntities(e,!1))}const n=dt[0]||Vi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Jn(a.loc,s)):n.children.push({type:2,content:e,loc:bt(t,s)})}function El(e,t,s=!1){s?Jn(e.loc,Rh(t,60)):Jn(e.loc,bx(t,62)+1),gt.inSFCRoot&&(e.children.length?e.innerLoc.end=je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=je({},e.innerLoc.start),e.innerLoc.source=Dt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Dn||(n==="slot"?e.tagType=2:nu(e)?e.tagType=3:xx(e)&&(e.tagType=1)),gt.inRCDATA||(e.children=Ih(i)),a===0&&Ye.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ye.isPreTag(n)&&jc--,Mo===e&&(Dn=gt.inVPre=!1,Mo=null),gt.inXML&&(dt[0]?dt[0].ns:Ye.ns)===0&&(gt.inXML=!1);{const l=e.props;if(!gt.inSFCRoot&&sa("COMPILER_NATIVE_TEMPLATE",Ye)&&e.tag==="template"&&!nu(e)){const o=dt[0]||Vi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Bi("COMPILER_INLINE_TEMPLATE",Ye,r.loc)&&e.children.length&&(r.value={type:2,content:Dt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function bx(e,t){let s=e;for(;yn.charCodeAt(s)!==t&&s<yn.length-1;)s++;return s}function Rh(e,t){let s=e;for(;yn.charCodeAt(s)!==t&&s>=0;)s--;return s}const yx=new Set(["if","else","else-if","for","slot"]);function nu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&yx.has(t[s].name))return!0}return!1}function xx({tag:e,props:t}){if(Ye.isCustomElement(e))return!1;if(e==="component"||_x(e.charCodeAt(0))||_h(e)||Ye.isBuiltInComponent&&Ye.isBuiltInComponent(e)||Ye.isNativeTag&&!Ye.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Bi("COMPILER_IS_ON_ELEMENT",Ye,n.loc))return!0}}else if(n.name==="bind"&&Zn(n.arg,"is")&&Bi("COMPILER_IS_ON_ELEMENT",Ye,n.loc))return!0}return!1}function _x(e){return e>64&&e<91}const kx=/\r\n/g;function Ih(e){const t=Ye.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(jc)a.content=a.content.replace(kx,`
`);else if(Ch(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&wx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Oh(a.content))}return s?e.filter(Boolean):e}function wx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Oh(e){let t="",s=!1;for(let n=0;n<e.length;n++)ps(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Po(e){(dt[0]||Vi).children.push(e)}function bt(e,t){return{start:gt.getPos(e),end:t==null?t:gt.getPos(t),source:t==null?t:Dt(e,t)}}function Sx(e){return bt(e.start.offset,e.end.offset)}function Jn(e,t){e.end=gt.getPos(t),e.source=Dt(e.start.offset,t)}function Tx(e){const t={type:6,name:e.rawName,nameLoc:bt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Al(e,t=!1,s,n=0,a=0){return Pe(e,t,s,n)}function nn(e,t,s){Ye.onError(ut(e,bt(t,t)))}function Cx(){gt.reset(),Vt=null,Ge=null,as="",rn=-1,Gn=-1,dt.length=0}function Ex(e,t){if(Cx(),yn=e,Ye=je({},Ah),t){let a;for(a in t)t[a]!=null&&(Ye[a]=t[a])}gt.mode=Ye.parseMode==="html"?1:Ye.parseMode==="sfc"?2:0,gt.inXML=Ye.ns===1||Ye.ns===2;const s=t&&t.delimiters;s&&(gt.delimiterOpen=Xl(s[0]),gt.delimiterClose=Xl(s[1]));const n=Vi=ex([],e);return gt.parse(yn),n.loc=bt(0,e.length),n.children=Ih(n.children),Vi=null,n}function Ax(e,t){Rl(e,void 0,t,!!Nh(e))}function Nh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!tr(t[0])?t[0]:null}function Rl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const f=n?0:hs(u,s);if(f>0){if(f>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const p=u.codegenNode;if(p.type===13){const b=p.patchFlag;if((b===void 0||b===512||b===1)&&Dh(u,s)>=2){const y=Mh(u);y&&(p.props=s.hoist(y))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(u.type===12&&(n?0:hs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const f=u.tagType===1;f&&s.scopes.vSlot++,Rl(u,e,s,!1,a),f&&s.scopes.vSlot--}else if(u.type===11)Rl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let f=0;f<u.branches.length;f++)Rl(u.branches[f],e,s,u.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&ge(e.codegenNode.children))e.codegenNode.children=o(ta(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!ge(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(ta(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!ge(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=_s(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(ta(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!ge(d.children)&&d.children.type===15){const f=d.children.properties.find(p=>p.key===u||p.key.content===u);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function hs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Dh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=hs(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=hs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ia),t.removeHelper(qa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(za(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return hs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Me(r)||Gt(r))continue;const o=hs(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Rx=new Set([Dc,Mc,$i,Qi]);function Lh(e,t){if(e.type===14&&!Me(e.callee)&&Rx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return hs(s,t);if(s.type===14)return Lh(s,t)}return 0}function Dh(e,t){let s=3;const n=Mh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=hs(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=hs(r,t):r.type===14?c=Lh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Mh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Ix(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ft,isCustomElement:d=Ft,expressionPlugins:u=[],scopeId:f=null,slotted:p=!0,ssr:b=!1,inSSR:y=!1,ssrCssVars:A="",bindingMetadata:O=qe,inline:x=!1,isTS:m=!1,onError:_=Bc,onWarn:S=xh,compatConfig:g}){const w=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:w&&ca(at(w[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:f,slotted:p,ssr:b,inSSR:y,ssrCssVars:A,bindingMetadata:O,inline:x,isTS:m,onError:_,onWarn:S,compatConfig:g,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const M=T.helpers.get(C)||0;return T.helpers.set(C,M+1),C},removeHelper(C){const M=T.helpers.get(C);if(M){const B=M-1;B?T.helpers.set(C,B):T.helpers.delete(C)}},helperString(C){return`_${Va[T.helper(C)]}`},replaceNode(C){T.parent.children[T.childIndex]=T.currentNode=C},removeNode(C){const M=T.parent.children,B=C?M.indexOf(C):T.currentNode?T.childIndex:-1;!C||C===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>B&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(B,1)},onNodeRemoved:Ft,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){Me(C)&&(C=Pe(C)),T.hoists.push(C);const M=Pe(`_hoisted_${T.hoists.length}`,!1,C.loc,2);return M.hoisted=C,M},cache(C,M=!1,B=!1){const $=tx(T.cached.length,C,M,B);return T.cached.push($),$}};return T.filters=new Set,T}function Ox(e,t){const s=Ix(e,t);Rr(e,s),t.hoistStatic&&Ax(e,s),t.ssr||Nx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Nx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Nh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Uc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ui(t,s(Fi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Lx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Me(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Rr(a,t))}}function Rr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(ge(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Yi);break;case 5:t.ssr||t.helper(Er);break;case 9:for(let i=0;i<e.branches.length;i++)Rr(e.branches[i],t);break;case 10:case 11:case 1:case 0:Lx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Ph(e,t){const s=Me(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(fx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Ir="/*@__PURE__*/",Fh=e=>`${Va[e]}: _${Va[e]}`;function Dx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(y){return`_${Va[y]}`},push(y,A=-2,O){p.code+=y},indent(){b(++p.indentLevel)},deindent(y=!1){y?--p.indentLevel:b(--p.indentLevel)},newline(){b(p.indentLevel)}};function b(y){p.push(`
`+"  ".repeat(y),0)}return p}function Mx(e,t={}){const s=Dx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),f=u.length>0,p=!i&&n!=="module";Px(e,s);const y=d?"ssrRender":"render",O=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${y}(${O}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${u.map(Fh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Qr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Qr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Qr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let x=0;x<e.temps;x++)a(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?qt(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Px(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Tc,Cc,Yi,Ec,gh].filter(f=>d.includes(f)).map(Fh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Fx(e.hoists,t),i(),a("return ")}function Qr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Oc:t==="component"?Ac:Ic);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Hi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Fx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),qt(i,t),n())}t.pure=!1}function zc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Xi(e,t,s),s&&t.deindent(),t.push("]")}function Xi(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Me(r)?a(r,-3):ge(r)?zc(r,t):qt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function qt(e,t){if(Me(e)){t.push(e,-3);return}if(Gt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:qt(e.codegenNode,t);break;case 2:$x(e,t);break;case 4:$h(e,t);break;case 5:Ux(e,t);break;case 12:qt(e.codegenNode,t);break;case 8:Uh(e,t);break;case 3:Hx(e,t);break;case 13:Vx(e,t);break;case 14:zx(e,t);break;case 15:qx(e,t);break;case 17:Gx(e,t);break;case 18:Kx(e,t);break;case 19:Wx(e,t);break;case 20:Zx(e,t);break;case 21:Xi(e.body,t,!0,!1);break}}function $x(e,t){t.push(JSON.stringify(e.content),-3,e)}function $h(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Ux(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ir),s(`${n(Er)}(`),qt(e.content,t),s(")")}function Uh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Me(n)?t.push(n,-3):qt(n,t)}}function Bx(e,t){const{push:s}=t;if(e.type===8)s("["),Uh(e,t),s("]");else if(e.isStatic){const n=Hc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Hx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ir),s(`${n(Yi)}(${JSON.stringify(e.content)})`,-3,e)}function Vx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:f,isComponent:p}=e;let b;o&&(b=String(o)),d&&s(n(Nc)+"("),u&&s(`(${n(ia)}(${f?"true":""}), `),a&&s(Ir);const y=u?qa(t.inSSR,p):za(t.inSSR,p);s(n(y)+"(",-2,e),Xi(jx([i,l,r,b,c]),t),s(")"),u&&s(")"),d&&(s(", "),qt(d,t),s(")"))}function jx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function zx(e,t){const{push:s,helper:n,pure:a}=t,i=Me(e.callee)?e.callee:n(e.callee);a&&s(Ir),s(i+"(",-2,e),Xi(e.arguments,t),s(")")}function qx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Bx(c,t),s(": "),qt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Gx(e,t){zc(e.elements,t)}function Kx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Va[Fc]}(`),s("(",-2,e),ge(i)?Xi(i,t):i&&qt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),ge(l)?zc(l,t):qt(l,t)):r&&qt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Wx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Hc(s.content);u&&l("("),$h(s,t),u&&l(")")}else l("("),qt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),qt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,qt(a,t),d||t.indentLevel--,i&&o(!0)}function Zx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Ql)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),qt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Ql)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Jx=Ph(/^(?:if|else|else-if)$/,(e,t,s)=>Yx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=iu(a,o,s);else{const c=Qx(n.codegenNode);c.alternate=iu(a,o+n.branches.length-1,s)}}}));function Yx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ut(28,t.loc)),t.exp=Pe("true",!1,a)}if(t.name==="if"){const a=au(e,t),i={type:9,loc:Sx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Eh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ut(30,e.loc)),s.removeNode();const r=au(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Rr(r,s),o&&o(),s.currentNode=null}else s.onError(ut(30,e.loc));break}}}function au(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!_s(e,"for")?e.children:[e],userKey:Ar(e,"key"),isTemplateIf:s}}function iu(e,t,s){return e.condition?Do(e.condition,lu(e,t,s),Rt(s.helper(Yi),['""',"true"])):lu(e,t,s)}function lu(e,t,s){const{helper:n}=s,a=wt("key",Pe(`${t}`,!1,bs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return sr(o,a,s),o}else return Ui(s,n(Fi),ks([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=hx(o);return c.type===13&&Uc(c,s),sr(c,a,s),o}}function Qx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Xx=Ph("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return e0(e,t,s,i=>{const l=Rt(n(Lc),[i.source]),r=er(e),o=_s(e,"memo"),c=Ar(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Pe(c.value.content,!0):void 0:c.exp);const u=d?wt("key",d):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=Ui(s,n(Fi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let b;const{children:y}=i,A=y.length!==1||y[0].type!==1,O=tr(e)?e:r&&e.children.length===1&&tr(e.children[0])?e.children[0]:null;if(O?(b=O.codegenNode,r&&u&&sr(b,u,s)):A?b=Ui(s,n(Fi),u?ks([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(b=y[0].codegenNode,r&&u&&sr(b,u,s),b.isBlock!==!f&&(b.isBlock?(a(ia),a(qa(s.inSSR,b.isComponent))):a(za(s.inSSR,b.isComponent))),b.isBlock=!f,b.isBlock?(n(ia),n(qa(s.inSSR,b.isComponent))):n(za(s.inSSR,b.isComponent))),o){const x=ja(Fo(i.parseResult,[Pe("_cached")]));x.body=sx([Ms(["const _memo = (",o.exp,")"]),Ms(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(yh)}(_cached, _memo)) return _cached`]),Ms(["const _item = ",b]),Pe("_item.memo = _memo"),Pe("return _item")]),l.arguments.push(x,Pe("_cache"),Pe(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ja(Fo(i.parseResult),b,!0))}})});function e0(e,t,s,n){if(!t.exp){s.onError(ut(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ut(32,t.loc));return}Bh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:er(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Bh(e,t){e.finalized||(e.finalized=!0)}function Fo({value:e,key:t,index:s},n=[]){return t0([e,t,s,...n])}function t0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Pe("_".repeat(n+1),!1))}const ru=Pe("undefined",!1),s0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=_s(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},n0=(e,t,s,n)=>ja(e,s,!1,!0,s.length?s[0].loc:n);function a0(e,t,s=n0){t.helper(Fc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=_s(e,"slot",!0);if(o){const{arg:A,exp:O}=o;A&&!cs(A)&&(r=!0),i.push(wt(A||Pe("default",!0),s(O,void 0,n,a)))}let c=!1,d=!1;const u=[],f=new Set;let p=0;for(let A=0;A<n.length;A++){const O=n[A];let x;if(!er(O)||!(x=_s(O,"slot",!0))){O.type!==3&&u.push(O);continue}if(o){t.onError(ut(37,x.loc));break}c=!0;const{children:m,loc:_}=O,{arg:S=Pe("default",!0),exp:g,loc:w}=x;let T;cs(S)?T=S?S.content:"default":r=!0;const C=_s(O,"for"),M=s(g,C,m,_);let B,$;if(B=_s(O,"if"))r=!0,l.push(Do(B.exp,yl(S,M,p++),ru));else if($=_s(O,/^else(?:-if)?$/,!0)){let I=A,j;for(;I--&&(j=n[I],!!Eh(j)););if(j&&er(j)&&_s(j,/^(?:else-)?if$/)){let Y=l[l.length-1];for(;Y.alternate.type===19;)Y=Y.alternate;Y.alternate=$.exp?Do($.exp,yl(S,M,p++),ru):yl(S,M,p++)}else t.onError(ut(30,$.loc))}else if(C){r=!0;const I=C.forParseResult;I?(Bh(I),l.push(Rt(t.helper(Lc),[I.source,ja(Fo(I),yl(S,M),!0)]))):t.onError(ut(32,C.loc))}else{if(T){if(f.has(T)){t.onError(ut(38,w));continue}f.add(T),T==="default"&&(d=!0)}i.push(wt(S,M))}}if(!o){const A=(O,x)=>{const m=s(O,void 0,x,a);return t.compatConfig&&(m.isNonScopedSlot=!0),wt("default",m)};c?u.length&&!u.every(Vc)&&(d?t.onError(ut(39,u[0].loc)):i.push(A(void 0,u))):i.push(A(void 0,n))}const b=r?2:Il(e.children)?3:1;let y=ks(i.concat(wt("_",Pe(b+"",!1))),a);return l.length&&(y=Rt(t.helper(bh),[y,ta(l)])),{slots:y,hasDynamicSlots:r}}function yl(e,t,s){const n=[wt("name",e),wt("fn",t)];return s!=null&&n.push(wt("key",Pe(String(s),!0))),ks(n)}function Il(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Il(s.children))return!0;break;case 9:if(Il(s.branches))return!0;break;case 10:case 11:if(Il(s.children))return!0;break}}return!1}const Hh=new WeakMap,i0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?l0(e,t):`"${n}"`;const r=Qe(l)&&l.callee===Rc;let o,c,d=0,u,f,p,b=r||l===_i||l===Sc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const y=Vh(e,t,void 0,i,r);o=y.props,d=y.patchFlag,f=y.dynamicPropNames;const A=y.directives;p=A&&A.length?ta(A.map(O=>o0(O,t))):void 0,y.shouldUseBlock&&(b=!0)}if(e.children.length>0)if(l===Jl&&(b=!0,d|=1024),i&&l!==_i&&l!==Jl){const{slots:A,hasDynamicSlots:O}=a0(e,t);c=A,O&&(d|=1024)}else if(e.children.length===1&&l!==_i){const A=e.children[0],O=A.type,x=O===5||O===8;x&&hs(A,t)===0&&(d|=1),x||O===2?c=A:c=e.children}else c=e.children;f&&f.length&&(u=c0(f)),e.codegenNode=Ui(t,l,o,c,d===0?void 0:d,u,p,!!b,!1,i,e.loc)};function l0(e,t,s=!1){let{tag:n}=e;const a=$o(n),i=Ar(e,"is",!1,!0);if(i)if(a||sa("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Pe(i.value.content,!0):(r=i.exp,r||(r=Pe("is",!1,i.arg.loc))),r)return Rt(t.helper(Rc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=_h(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Ac),t.components.add(n),Hi(n,"component"))}function Vh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],f=o.length>0;let p=!1,b=0,y=!1,A=!1,O=!1,x=!1,m=!1,_=!1;const S=[],g=M=>{c.length&&(d.push(ks(ou(c),r)),c=[]),M&&d.push(M)},w=()=>{t.scopes.vFor>0&&c.push(wt(Pe("ref_for",!0),Pe("true")))},T=({key:M,value:B})=>{if(cs(M)){const $=M.content,I=ra($);if(I&&(!n||a)&&$.toLowerCase()!=="onclick"&&$!=="onUpdate:modelValue"&&!gn($)&&(x=!0),I&&gn($)&&(_=!0),I&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&hs(B,t)>0)return;$==="ref"?y=!0:$==="class"?A=!0:$==="style"?O=!0:$!=="key"&&!S.includes($)&&S.push($),n&&($==="class"||$==="style")&&!S.includes($)&&S.push($)}else m=!0};for(let M=0;M<s.length;M++){const B=s[M];if(B.type===6){const{loc:$,name:I,nameLoc:j,value:Y}=B;let H=!0;if(I==="ref"&&(y=!0,w()),I==="is"&&($o(l)||Y&&Y.content.startsWith("vue:")||sa("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(wt(Pe(I,!0,j),Pe(Y?Y.content:"",H,Y?Y.loc:$)))}else{const{name:$,arg:I,exp:j,loc:Y,modifiers:H}=B,N=$==="bind",L=$==="on";if($==="slot"){n||t.onError(ut(40,Y));continue}if($==="once"||$==="memo"||$==="is"||N&&Zn(I,"is")&&($o(l)||sa("COMPILER_IS_ON_ELEMENT",t))||L&&i)continue;if((N&&Zn(I,"key")||L&&f&&Zn(I,"vue:before-update"))&&(p=!0),N&&Zn(I,"ref")&&w(),!I&&(N||L)){if(m=!0,j)if(N){if(g(),sa("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(j);continue}w(),g(),d.push(j)}else g({type:14,loc:Y,callee:t.helper(Pc),arguments:n?[j]:[j,"true"]});else t.onError(ut(N?34:35,Y));continue}N&&H.some(xe=>xe.content==="prop")&&(b|=32);const Z=t.directiveTransforms[$];if(Z){const{props:xe,needRuntime:_e}=Z(B,e,t);!i&&xe.forEach(T),L&&I&&!cs(I)?g(ks(xe,r)):c.push(...xe),_e&&(u.push(B),Gt(_e)&&Hh.set(B,_e))}else Xm($)||(u.push(B),f&&(p=!0))}}let C;if(d.length?(g(),d.length>1?C=Rt(t.helper(Yl),d,r):C=d[0]):c.length&&(C=ks(ou(c),r)),m?b|=16:(A&&!n&&(b|=2),O&&!n&&(b|=4),S.length&&(b|=8),x&&(b|=32)),!p&&(b===0||b===32)&&(y||_||u.length>0)&&(b|=512),!t.inSSR&&C)switch(C.type){case 15:let M=-1,B=-1,$=!1;for(let Y=0;Y<C.properties.length;Y++){const H=C.properties[Y].key;cs(H)?H.content==="class"?M=Y:H.content==="style"&&(B=Y):H.isHandlerKey||($=!0)}const I=C.properties[M],j=C.properties[B];$?C=Rt(t.helper($i),[C]):(I&&!cs(I.value)&&(I.value=Rt(t.helper(Dc),[I.value])),j&&(O||j.value.type===4&&j.value.content.trim()[0]==="["||j.value.type===17)&&(j.value=Rt(t.helper(Mc),[j.value])));break;case 14:break;default:C=Rt(t.helper($i),[Rt(t.helper(Qi),[C])]);break}return{props:C,directives:u,patchFlag:b,dynamicPropNames:S,shouldUseBlock:p}}function ou(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ra(i))&&r0(l,a):(t.set(i,a),s.push(a))}return s}function r0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ta([e.value,t.value],e.loc)}function o0(e,t){const s=[],n=Hh.get(e);n?s.push(t.helperString(n)):(t.helper(Ic),t.directives.add(e.name),s.push(Hi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Pe("true",!1,a);s.push(ks(e.modifiers.map(l=>wt(l,i)),a))}return ta(s,e.loc)}function c0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function $o(e){return e==="component"||e==="Component"}const d0=(e,t)=>{if(tr(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=u0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ja([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Rt(t.helper(vh),l,n)}};function u0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=at(l.name),a.push(l)));else if(l.name==="bind"&&Zn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=at(l.arg.content);s=l.exp=Pe(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&cs(l.arg)&&(l.arg.content=at(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Vh(e,t,a,!1,!1);n=i,l.length&&t.onError(ut(36,l[0].loc))}return{slotName:s,slotProps:n}}const jh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ut(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const f=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ra(at(u)):`on:${u}`;r=Pe(f,!0,l.loc)}else r=Ms([`${s.helperString(Lo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Lo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Sh(o),f=!(u||dx(o)),p=o.content.includes(";");(f||c&&u)&&(o=Ms([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let d={props:[wt(r,o||Pe("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},f0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=at(i.content):i.content=`${s.helperString(No)}(${i.content})`:(i.children.unshift(`${s.helperString(No)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&cu(i,"."),n.some(r=>r.content==="attr")&&cu(i,"^")),{props:[wt(i,l)]}},cu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},p0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Yr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Yr(o))n||(n=s[i]=Ms([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Yr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&hs(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Rt(t.helper(Ec),r)}}}}},du=new WeakSet,h0=(e,t)=>{if(e.type===1&&_s(e,"once",!0))return du.has(e)||t.inVOnce||t.inSSR?void 0:(du.add(e),t.inVOnce=!0,t.helper(Ql),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},zh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ut(41,e.loc)),ii();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ut(44,n.loc)),ii();if(r==="literal-const"||r==="setup-const")return s.onError(ut(45,n.loc)),ii();if(!l.trim()||!Sh(n))return s.onError(ut(42,n.loc)),ii();const o=a||Pe("modelValue",!0),c=a?cs(a)?`onUpdate:${at(a.content)}`:Ms(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ms([`${u} => ((`,n,") = $event)"]);const f=[wt(o,e.exp),wt(c,d)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(y=>y.content).map(y=>(Hc(y)?y:JSON.stringify(y))+": true").join(", "),b=a?cs(a)?`${a.content}Modifiers`:Ms([a,' + "Modifiers"']):"modelModifiers";f.push(wt(b,Pe(`{ ${p} }`,!1,e.loc,2)))}return ii(f)};function ii(e=[]){return{props:e}}const m0=/[\w).+\-_$\]]/,g0=(e,t)=>{sa("COMPILER_FILTERS",t)&&(e.type===5?nr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&nr(s.exp,t)}))};function nr(e,t){if(e.type===4)uu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?uu(n,t):n.type===8?nr(e,t):n.type===5&&nr(n.content,t))}}function uu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,f,p,b,y=[];for(p=0;p<s.length;p++)if(f=u,u=s.charCodeAt(p),n)u===39&&f!==92&&(n=!1);else if(a)u===34&&f!==92&&(a=!1);else if(i)u===96&&f!==92&&(i=!1);else if(l)u===47&&f!==92&&(l=!1);else if(u===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)b===void 0?(d=p+1,b=s.slice(0,p).trim()):A();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let O=p-1,x;for(;O>=0&&(x=s.charAt(O),x===" ");O--);(!x||!m0.test(x))&&(l=!0)}}b===void 0?b=s.slice(0,p).trim():d!==0&&A();function A(){y.push(s.slice(d,p).trim()),d=p+1}if(y.length){for(p=0;p<y.length;p++)b=v0(b,y[p],t);e.content=b,e.ast=void 0}}function v0(e,t,s){s.helper(Oc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Hi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Hi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const fu=new WeakSet,b0=(e,t)=>{if(e.type===1){const s=_s(e,"memo");return!s||fu.has(e)||t.inSSR?void 0:(fu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Uc(n,t),e.codegenNode=Rt(t.helper($c),[s.exp,ja(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},y0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ut(53,n.loc)),s.exp=Pe("",!0,n.loc);else{const a=at(n.content);(kh.test(a[0])||a[0]==="-")&&(s.exp=Pe(a,!1,n.loc))}}}};function x0(e){return[[y0,h0,Jx,b0,Xx,g0,d0,i0,s0,p0],{on:jh,bind:f0,model:zh}]}function _0(e,t={}){const s=t.onError||Bc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ut(48)):n&&s(ut(49));const a=!1;t.cacheHandlers&&s(ut(50)),t.scopeId&&!n&&s(ut(51));const i=je({},t,{prefixIdentifiers:a}),l=Me(e)?Ex(e,i):e,[r,o]=x0();return Ox(l,je({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:je({},o,t.directiveTransforms||{})})),Mx(l,i)}const k0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qh=Symbol(""),Gh=Symbol(""),Kh=Symbol(""),Wh=Symbol(""),Uo=Symbol(""),Zh=Symbol(""),Jh=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),Xh=Symbol("");Xy({[qh]:"vModelRadio",[Gh]:"vModelCheckbox",[Kh]:"vModelText",[Wh]:"vModelSelect",[Uo]:"vModelDynamic",[Zh]:"withModifiers",[Jh]:"withKeys",[Yh]:"vShow",[Qh]:"Transition",[Xh]:"TransitionGroup"});let va;function w0(e,t=!1){return va||(va=document.createElement("div")),t?(va.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,va.children[0].getAttribute("foo")):(va.innerHTML=e,va.textContent)}const S0={parseMode:"html",isVoidTag:gg,isNativeTag:e=>pg(e)||hg(e)||mg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:w0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Qh;if(e==="TransitionGroup"||e==="transition-group")return Xh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},T0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Pe("style",!0,t.loc),exp:C0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},C0=(e,t)=>{const s=ff(e);return Pe(JSON.stringify(s),!1,t,3)};function Fn(e,t){return ut(e,t)}const E0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Fn(54,a)),t.children.length&&(s.onError(Fn(55,a)),t.children.length=0),{props:[wt(Pe("innerHTML",!0,a),n||Pe("",!0))]}},A0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Fn(56,a)),t.children.length&&(s.onError(Fn(57,a)),t.children.length=0),{props:[wt(Pe("textContent",!0),n?hs(n,s)>0?n:Rt(s.helperString(Er),[n],a):Pe("",!0))]}},R0=(e,t,s)=>{const n=zh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Fn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Kh,r=!1;if(a==="input"||i){const o=Ar(t,"type");if(o){if(o.type===7)l=Uo;else if(o.value)switch(o.value.content){case"radio":l=qh;break;case"checkbox":l=Gh;break;case"file":r=!0,s.onError(Fn(60,e.loc));break}}else ux(t)&&(l=Uo)}else a==="select"&&(l=Wh);r||(n.needRuntime=s.helper(l))}else s.onError(Fn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},I0=vs("passive,once,capture"),O0=vs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),N0=vs("left,right"),em=vs("onkeyup,onkeydown,onkeypress"),L0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Bi("COMPILER_V_ON_NATIVE",s)||I0(o)?l.push(o):N0(o)?cs(e)?em(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):O0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},pu=(e,t)=>cs(e)&&e.content.toLowerCase()==="onclick"?Pe(t,!0):e.type!==4?Ms(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,D0=(e,t,s)=>jh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=L0(i,a,s,e.loc);if(o.includes("right")&&(i=pu(i,"onContextmenu")),o.includes("middle")&&(i=pu(i,"onMouseup")),o.length&&(l=Rt(s.helper(Zh),[l,JSON.stringify(o)])),r.length&&(!cs(i)||em(i.content.toLowerCase()))&&(l=Rt(s.helper(Jh),[l,JSON.stringify(r)])),c.length){const d=c.map(ca).join("");i=cs(i)?Pe(`${i.content}${d}`,!0):Ms(["(",i,`) + "${d}"`])}return{props:[wt(i,l)]}}),M0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Fn(62,a)),{props:[],needRuntime:s.helper(Yh)}},P0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},F0=[T0],$0={cloak:k0,html:E0,text:A0,model:R0,on:D0,show:M0};function U0(e,t={}){return _0(e,je({},S0,t,{nodeTransforms:[P0,...F0,...t.nodeTransforms||[]],directiveTransforms:je({},$0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const hu=Object.create(null);function B0(e,t){if(!Me(e))if(e.nodeType)e=e.innerHTML;else return Ft;const s=sg(e,t),n=hu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=je({hoistStatic:!0,onError:void 0,onWarn:Ft},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=U0(e,a),l=new Function("Vue",i)(Ky);return l._rc=!0,hu[s]=l}Fp(B0);const ar=Un({items:[]});let H0=1;function Or(e,t="info",s=3e3){const n=H0++;return ar.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>qc(n),s),n}function qc(e){const t=ar.items.findIndex(s=>s.id===e);t>=0&&ar.items.splice(t,1)}function Te(e,t="info",s=3e3){return Or(e,t,s)}Te.success=(e,t=3e3)=>Or(e,"success",t);Te.error=(e,t=5e3)=>Or(e,"error",t);Te.info=(e,t=3e3)=>Or(e,"info",t);Te.dismiss=qc;const V0={setup(){return{state:ar,dismiss:qc}},template:`
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
  `},dn=Un({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ma=null;function gs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ma&&Ma(!1),dn.title=e,dn.message=t,dn.confirmLabel=s,dn.cancelLabel=n,dn.danger=a,dn.open=!0,new Promise(i=>{Ma=i})}function mu(e){dn.open=!1,Ma&&(Ma(e),Ma=null)}const j0={setup(){function e(t){dn.open&&t.key==="Escape"&&(t.stopPropagation(),mu(!1))}return We(()=>document.addEventListener("keydown",e,!0)),xt(()=>document.removeEventListener("keydown",e,!0)),{state:dn,settle:mu}},template:`
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
 */const wa=typeof document<"u";function tm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function z0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&tm(e.default)}const st=Object.assign;function Xr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Fs(a)?a.map(e):e(a)}return s}const ki=()=>{},Fs=Array.isArray;function gu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const sm=/#/g,q0=/&/g,G0=/\//g,K0=/=/g,W0=/\?/g,nm=/\+/g,Z0=/%5B/g,J0=/%5D/g,am=/%5E/g,Y0=/%60/g,im=/%7B/g,Q0=/%7C/g,lm=/%7D/g,X0=/%20/g;function Gc(e){return e==null?"":encodeURI(""+e).replace(Q0,"|").replace(Z0,"[").replace(J0,"]")}function e_(e){return Gc(e).replace(im,"{").replace(lm,"}").replace(am,"^")}function Bo(e){return Gc(e).replace(nm,"%2B").replace(X0,"+").replace(sm,"%23").replace(q0,"%26").replace(Y0,"`").replace(im,"{").replace(lm,"}").replace(am,"^")}function t_(e){return Bo(e).replace(K0,"%3D")}function s_(e){return Gc(e).replace(sm,"%23").replace(W0,"%3F")}function n_(e){return s_(e).replace(G0,"%2F")}function ji(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const a_=/\/$/,i_=e=>e.replace(a_,"");function eo(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=c_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ji(l)}}function l_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function vu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function r_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ga(t.matched[n],s.matched[a])&&rm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ga(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function rm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!o_(e[s],t[s]))return!1;return!0}function o_(e,t){return Fs(e)?bu(e,t):Fs(t)?bu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function bu(e,t){return Fs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function c_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Rn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Ho=(function(e){return e.pop="pop",e.push="push",e})({}),to=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function d_(e){if(!e)if(wa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),i_(e)}const u_=/^[^#]+#/;function f_(e,t){return e.replace(u_,"#")+t}function p_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Nr=()=>({left:window.scrollX,top:window.scrollY});function h_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=p_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function yu(e,t){return(history.state?history.state.position-t:-1)+e}const Vo=new Map;function m_(e,t){Vo.set(e,t)}function g_(e){const t=Vo.get(e);return Vo.delete(e),t}function v_(e){return typeof e=="string"||e&&typeof e=="object"}function om(e){return typeof e=="string"||typeof e=="symbol"}let mt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const cm=Symbol("");mt.MATCHER_NOT_FOUND+"",mt.NAVIGATION_GUARD_REDIRECT+"",mt.NAVIGATION_ABORTED+"",mt.NAVIGATION_CANCELLED+"",mt.NAVIGATION_DUPLICATED+"";function Ka(e,t){return st(new Error,{type:e,[cm]:!0},t)}function an(e,t){return e instanceof Error&&cm in e&&(t==null||!!(e.type&t))}const b_=["params","query","hash"];function y_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of b_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function x_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(nm," "),i=a.indexOf("="),l=ji(i<0?a:a.slice(0,i)),r=i<0?null:ji(a.slice(i+1));if(l in t){let o=t[l];Fs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function xu(e){let t="";for(let s in e){const n=e[s];if(s=t_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Fs(n)?n.map(a=>a&&Bo(a)):[n&&Bo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function __(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Fs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const k_=Symbol(""),_u=Symbol(""),Lr=Symbol(""),Kc=Symbol(""),jo=Symbol("");function li(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Mn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Ka(mt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):v_(f)?o(Ka(mt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(f=>o(f))})}function so(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(tm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Mn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=z0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const f=(u.__vccOpts||u)[t];return f&&Mn(f,s,n,l,r,a)()}))}}return i}function w_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ga(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ga(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let S_=()=>location.protocol+"//"+location.host;function dm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),vu(r,"")}return vu(s,e)+n+a}function T_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=dm(e,location),b=s.value,y=t.value;let A=0;if(f){if(s.value=p,t.value=f,l&&l===b){l=null;return}A=y?f.position-y.position:0}else n(p);a.forEach(O=>{O(s.value,b,{delta:A,type:Ho.pop,direction:A?A>0?to.forward:to.back:to.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const b=a.indexOf(f);b>-1&&a.splice(b,1)};return i.push(p),p}function d(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(st({},f.state,{scroll:Nr()}),"")}}function u(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function ku(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Nr():null}}function C_(e){const{history:t,location:s}=window,n={value:dm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),f=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:S_()+e+o;try{t[d?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[d?"replace":"assign"](f)}}function l(o,c){i(o,st({},t.state,ku(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=st({},a.value,t.state,{forward:o,scroll:Nr()});i(d.current,d,!0),i(o,st({},ku(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function E_(e){e=d_(e);const t=C_(e),s=T_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=st({location:"",base:e,go:n,createHref:f_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function A_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),E_(e)}let Yn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ct=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ct||{});const R_={type:Yn.Static,value:""},I_=/[a-zA-Z0-9_]/;function O_(e){if(!e)return[[]];if(e==="/")return[[R_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=Ct.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Ct.Static?i.push({type:Yn.Static,value:c}):s===Ct.Param||s===Ct.ParamRegExp||s===Ct.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Yn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Ct.ParamRegExp){n=s,s=Ct.EscapeNext;continue}switch(s){case Ct.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Ct.Param):f();break;case Ct.EscapeNext:f(),s=n;break;case Ct.Param:o==="("?s=Ct.ParamRegExp:I_.test(o)?f():(u(),s=Ct.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Ct.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Ct.ParamRegExpEnd:d+=o;break;case Ct.ParamRegExpEnd:u(),s=Ct.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Ct.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const wu="[^/]+?",N_={sensitive:!1,strict:!1,start:!0,end:!0};var Yt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Yt||{});const L_=/[.+*?^${}()[\]/\\]/g;function D_(e,t){const s=st({},N_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Yt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const f=c[u];let p=Yt.Segment+(s.sensitive?Yt.BonusCaseSensitive:0);if(f.type===Yn.Static)u||(a+="/"),a+=f.value.replace(L_,"\\$&"),p+=Yt.Static;else if(f.type===Yn.Param){const{value:b,repeatable:y,optional:A,regexp:O}=f;i.push({name:b,repeatable:y,optional:A});const x=O||wu;if(x!==wu){p+=Yt.BonusCustomRegExp;try{`${x}`}catch(_){throw new Error(`Invalid custom RegExp for param "${b}" (${x}): `+_.message)}}let m=y?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(m=A&&c.length<2?`(?:/${m})`:"/"+m),A&&(m+="?"),a+=m,p+=Yt.Dynamic,A&&(p+=Yt.BonusOptional),y&&(p+=Yt.BonusRepeatable),x===".*"&&(p+=Yt.BonusWildcard)}d.push(p)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Yt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let f=1;f<d.length;f++){const p=d[f]||"",b=i[f-1];u[b.name]=p&&b.repeatable?p.split("/"):p}return u}function o(c){let d="",u=!1;for(const f of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const p of f)if(p.type===Yn.Static)d+=p.value;else if(p.type===Yn.Param){const{value:b,repeatable:y,optional:A}=p,O=b in c?c[b]:"";if(Fs(O)&&!y)throw new Error(`Provided param "${b}" is an array but it is not repeatable (* or + modifiers)`);const x=Fs(O)?O.join("/"):O;if(!x)if(A)f.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${b}"`);d+=x}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function M_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Yt.Static+Yt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Yt.Static+Yt.Segment?1:-1:0}function um(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=M_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Su(n))return 1;if(Su(a))return-1}return a.length-n.length}function Su(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const P_={strict:!1,end:!0,sensitive:!1};function F_(e,t,s){const n=D_(O_(e.path),s),a=st(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function $_(e,t){const s=[],n=new Map;t=gu(P_,t);function a(u){return n.get(u)}function i(u,f,p){const b=!p,y=Cu(u);y.aliasOf=p&&p.record;const A=gu(t,u),O=[y];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of _)O.push(Cu(st({},y,{components:p?p.record.components:y.components,path:S,aliasOf:p?p.record:y})))}let x,m;for(const _ of O){const{path:S}=_;if(f&&S[0]!=="/"){const g=f.record.path,w=g[g.length-1]==="/"?"":"/";_.path=f.record.path+(S&&w+S)}if(x=F_(_,f,A),p?p.alias.push(x):(m=m||x,m!==x&&m.alias.push(x),b&&u.name&&!Eu(x)&&l(u.name)),fm(x)&&o(x),y.children){const g=y.children;for(let w=0;w<g.length;w++)i(g[w],x,p&&p.children[w])}p=p||x}return m?()=>{l(m)}:ki}function l(u){if(om(u)){const f=n.get(u);f&&(n.delete(u),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(u);f>-1&&(s.splice(f,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const f=H_(u,s);s.splice(f,0,u),u.record.name&&!Eu(u)&&n.set(u.record.name,u)}function c(u,f){let p,b={},y,A;if("name"in u&&u.name){if(p=n.get(u.name),!p)throw Ka(mt.MATCHER_NOT_FOUND,{location:u});A=p.record.name,b=st(Tu(f.params,p.keys.filter(m=>!m.optional).concat(p.parent?p.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&Tu(u.params,p.keys.map(m=>m.name))),y=p.stringify(b)}else if(u.path!=null)y=u.path,p=s.find(m=>m.re.test(y)),p&&(b=p.parse(y),A=p.record.name);else{if(p=f.name?n.get(f.name):s.find(m=>m.re.test(f.path)),!p)throw Ka(mt.MATCHER_NOT_FOUND,{location:u,currentLocation:f});A=p.record.name,b=st({},f.params,u.params),y=p.stringify(b)}const O=[];let x=p;for(;x;)O.unshift(x.record),x=x.parent;return{name:A,path:y,params:b,matched:O,meta:B_(O)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Tu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Cu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:U_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function U_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Eu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function B_(e){return e.reduce((t,s)=>st(t,s.meta),{})}function H_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;um(e,t[i])<0?n=i:s=i+1}const a=V_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function V_(e){let t=e;for(;t=t.parent;)if(fm(t)&&um(e,t)===0)return t}function fm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Au(e){const t=ws(Lr),s=ws(Kc),n=J(()=>{const o=Zs(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const f=u.findIndex(Ga.bind(null,d));if(f>-1)return f;const p=Ru(o[c-2]);return c>1&&Ru(d)===p&&u[u.length-1].path!==p?u.findIndex(Ga.bind(null,o[c-2])):f}),i=J(()=>a.value>-1&&K_(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&rm(s.params,n.value.params));function r(o={}){if(G_(o)){const c=t[Zs(e.replace)?"replace":"push"](Zs(e.to)).catch(ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function j_(e){return e.length===1?e[0]:e}const z_=Wi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Au,setup(e,{slots:t}){const s=Un(Au(e)),{options:n}=ws(Lr),a=J(()=>({[Iu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Iu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&j_(t.default(s));return e.custom?i:Ua("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),q_=z_;function G_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function K_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Fs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Ru(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Iu=(e,t,s)=>e??t??s,W_=Wi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=ws(jo),a=J(()=>e.route||n.value),i=ws(_u,0),l=J(()=>{let c=Zs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);vi(_u,J(()=>l.value+1)),vi(k_,r),vi(jo,a);const o=h();return es(()=>[o.value,r.value,e.name],([c,d,u],[f,p,b])=>{d&&(d.instances[u]=c,p&&p!==d&&c&&c===f&&(d.leaveGuards.size||(d.leaveGuards=p.leaveGuards),d.updateGuards.size||(d.updateGuards=p.updateGuards))),c&&d&&(!p||!Ga(d,p)||!f)&&(d.enterCallbacks[u]||[]).forEach(y=>y(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,f=u&&u.components[d];if(!f)return Ou(s.default,{Component:f,route:c});const p=u.props[d],b=p?p===!0?c.params:typeof p=="function"?p(c):p:null,A=Ua(f,st({},b,t,{onVnodeUnmounted:O=>{O.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Ou(s.default,{Component:A,route:c})||A}}});function Ou(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Z_=W_;function J_(e){const t=$_(e.routes,e),s=e.parseQuery||x_,n=e.stringifyQuery||xu,a=e.history,i=li(),l=li(),r=li(),o=nc(Rn);let c=Rn;wa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Xr.bind(null,V=>""+V),u=Xr.bind(null,n_),f=Xr.bind(null,ji);function p(V,ce){let de,ve;return om(V)?(de=t.getRecordMatcher(V),ve=ce):ve=V,t.addRoute(ve,de)}function b(V){const ce=t.getRecordMatcher(V);ce&&t.removeRoute(ce)}function y(){return t.getRoutes().map(V=>V.record)}function A(V){return!!t.getRecordMatcher(V)}function O(V,ce){if(ce=st({},ce||o.value),typeof V=="string"){const E=eo(s,V,ce.path),U=t.resolve({path:E.path},ce),X=a.createHref(E.fullPath);return st(E,U,{params:f(U.params),hash:ji(E.hash),redirectedFrom:void 0,href:X})}let de;if(V.path!=null)de=st({},V,{path:eo(s,V.path,ce.path).path});else{const E=st({},V.params);for(const U in E)E[U]==null&&delete E[U];de=st({},V,{params:u(E)}),ce.params=u(ce.params)}const ve=t.resolve(de,ce),me=V.hash||"";ve.params=d(f(ve.params));const He=l_(n,st({},V,{hash:e_(me),path:ve.path})),k=a.createHref(He);return st({fullPath:He,hash:me,query:n===xu?__(V.query):V.query||{}},ve,{redirectedFrom:void 0,href:k})}function x(V){return typeof V=="string"?eo(s,V,o.value.path):st({},V)}function m(V,ce){if(c!==V)return Ka(mt.NAVIGATION_CANCELLED,{from:ce,to:V})}function _(V){return w(V)}function S(V){return _(st(x(V),{replace:!0}))}function g(V,ce){const de=V.matched[V.matched.length-1];if(de&&de.redirect){const{redirect:ve}=de;let me=typeof ve=="function"?ve(V,ce):ve;return typeof me=="string"&&(me=me.includes("?")||me.includes("#")?me=x(me):{path:me},me.params={}),st({query:V.query,hash:V.hash,params:me.path!=null?{}:V.params},me)}}function w(V,ce){const de=c=O(V),ve=o.value,me=V.state,He=V.force,k=V.replace===!0,E=g(de,ve);if(E)return w(st(x(E),{state:typeof E=="object"?st({},me,E.state):me,force:He,replace:k}),ce||de);const U=de;U.redirectedFrom=ce;let X;return!He&&r_(n,ve,de)&&(X=Ka(mt.NAVIGATION_DUPLICATED,{to:U,from:ve}),_e(ve,ve,!0,!1)),(X?Promise.resolve(X):M(U,ve)).catch(q=>an(q)?an(q,mt.NAVIGATION_GUARD_REDIRECT)?q:xe(q):L(q,U,ve)).then(q=>{if(q){if(an(q,mt.NAVIGATION_GUARD_REDIRECT))return w(st({replace:k},x(q.to),{state:typeof q.to=="object"?st({},me,q.to.state):me,force:He}),ce||U)}else q=$(U,ve,!0,k,me);return B(U,ve,q),q})}function T(V,ce){const de=m(V,ce);return de?Promise.reject(de):Promise.resolve()}function C(V){const ce=P.values().next().value;return ce&&typeof ce.runWithContext=="function"?ce.runWithContext(V):V()}function M(V,ce){let de;const[ve,me,He]=w_(V,ce);de=so(ve.reverse(),"beforeRouteLeave",V,ce);for(const E of ve)E.leaveGuards.forEach(U=>{de.push(Mn(U,V,ce))});const k=T.bind(null,V,ce);return de.push(k),ke(de).then(()=>{de=[];for(const E of i.list())de.push(Mn(E,V,ce));return de.push(k),ke(de)}).then(()=>{de=so(me,"beforeRouteUpdate",V,ce);for(const E of me)E.updateGuards.forEach(U=>{de.push(Mn(U,V,ce))});return de.push(k),ke(de)}).then(()=>{de=[];for(const E of He)if(E.beforeEnter)if(Fs(E.beforeEnter))for(const U of E.beforeEnter)de.push(Mn(U,V,ce));else de.push(Mn(E.beforeEnter,V,ce));return de.push(k),ke(de)}).then(()=>(V.matched.forEach(E=>E.enterCallbacks={}),de=so(He,"beforeRouteEnter",V,ce,C),de.push(k),ke(de))).then(()=>{de=[];for(const E of l.list())de.push(Mn(E,V,ce));return de.push(k),ke(de)}).catch(E=>an(E,mt.NAVIGATION_CANCELLED)?E:Promise.reject(E))}function B(V,ce,de){r.list().forEach(ve=>C(()=>ve(V,ce,de)))}function $(V,ce,de,ve,me){const He=m(V,ce);if(He)return He;const k=ce===Rn,E=wa?history.state:{};de&&(ve||k?a.replace(V.fullPath,st({scroll:k&&E&&E.scroll},me)):a.push(V.fullPath,me)),o.value=V,_e(V,ce,de,k),xe()}let I;function j(){I||(I=a.listen((V,ce,de)=>{if(!se.listening)return;const ve=O(V),me=g(ve,se.currentRoute.value);if(me){w(st(me,{replace:!0,force:!0}),ve).catch(ki);return}c=ve;const He=o.value;wa&&m_(yu(He.fullPath,de.delta),Nr()),M(ve,He).catch(k=>an(k,mt.NAVIGATION_ABORTED|mt.NAVIGATION_CANCELLED)?k:an(k,mt.NAVIGATION_GUARD_REDIRECT)?(w(st(x(k.to),{force:!0}),ve).then(E=>{an(E,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&!de.delta&&de.type===Ho.pop&&a.go(-1,!1)}).catch(ki),Promise.reject()):(de.delta&&a.go(-de.delta,!1),L(k,ve,He))).then(k=>{k=k||$(ve,He,!1),k&&(de.delta&&!an(k,mt.NAVIGATION_CANCELLED)?a.go(-de.delta,!1):de.type===Ho.pop&&an(k,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(ve,He,k)}).catch(ki)}))}let Y=li(),H=li(),N;function L(V,ce,de){xe(V);const ve=H.list();return ve.length?ve.forEach(me=>me(V,ce,de)):console.error(V),Promise.reject(V)}function Z(){return N&&o.value!==Rn?Promise.resolve():new Promise((V,ce)=>{Y.add([V,ce])})}function xe(V){return N||(N=!V,j(),Y.list().forEach(([ce,de])=>V?de(V):ce()),Y.reset()),V}function _e(V,ce,de,ve){const{scrollBehavior:me}=e;if(!wa||!me)return Promise.resolve();const He=!de&&g_(yu(V.fullPath,0))||(ve||!de)&&history.state&&history.state.scroll||null;return At().then(()=>me(V,ce,He)).then(k=>k&&h_(k)).catch(k=>L(k,V,ce))}const ae=V=>a.go(V);let fe;const P=new Set,se={currentRoute:o,listening:!0,addRoute:p,removeRoute:b,clearRoutes:t.clearRoutes,hasRoute:A,getRoutes:y,resolve:O,options:e,push:_,replace:S,go:ae,back:()=>ae(-1),forward:()=>ae(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:H.add,isReady:Z,install(V){V.component("RouterLink",q_),V.component("RouterView",Z_),V.config.globalProperties.$router=se,Object.defineProperty(V.config.globalProperties,"$route",{enumerable:!0,get:()=>Zs(o)}),wa&&!fe&&o.value===Rn&&(fe=!0,_(a.location).catch(ve=>{}));const ce={};for(const ve in Rn)Object.defineProperty(ce,ve,{get:()=>o.value[ve],enumerable:!0});V.provide(Lr,se),V.provide(Kc,sc(ce)),V.provide(jo,o);const de=V.unmount;P.add(V),V.unmount=function(){P.delete(V),P.size<1&&(c=Rn,I&&I(),I=null,o.value=Rn,fe=!1,N=!1),de()}}};function ke(V){return V.reduce((ce,de)=>ce.then(()=>C(de)),Promise.resolve())}return se}function pm(){return ws(Lr)}function Y_(e){return ws(Kc)}const Dr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Y_(),s=pm(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});es(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Q_={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(f){var y,A,O,x,m;const p=f.payload||f,b=p.type||f.type;if(b==="tool_start"){const _=((y=p.metadata)==null?void 0:y.call_id)||null,S={callId:_,id:_||`${p.action}-${Date.now()}`,tool:p.action,actor:p.actor||"",channel:p.channel_id||"",iteration:((A=p.metadata)==null?void 0:A.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(b==="tool_end"){const _=((O=p.metadata)==null?void 0:O.call_id)||null;let S=-1;if(_&&(S=e.value.findIndex(g=>g.callId===_&&g.status==="running")),S<0&&!_)for(let g=e.value.length-1;g>=0;g--){const w=e.value[g];if(w.tool===p.action&&w.status==="running"){S=g;break}}if(S>=0){const g=e.value[S];g.status=(x=p.metadata)!=null&&x.error?"error":"success",g.elapsed=((m=p.metadata)==null?void 0:m.elapsed_ms)||Date.now()-g.startTime,g.result=p.detail||"",g.fadingOut=!0,setTimeout(()=>{const w=e.value.indexOf(g);w>=0&&e.value.splice(w,1),t.value.unshift(g),t.value.length>n&&t.value.pop()},5e3)}return}if(b==="tool_stream"){const _=p.call_id||p.tool_name||"unknown";if(p.finished){const S={...s.value};delete S[_],s.value=S}else{const g=((s.value[_]||"")+(p.chunk||"")).split(`
`);s.value={...s.value,[_]:g.slice(-30).join(`
`)}}return}}let i=null;function l(){const f=Date.now();e.value.forEach(p=>{p.status==="running"&&(p.elapsed=f-p.startTime)})}let r=!1;function o(){r||(r=!0,Ke.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ke.off("events",a),i&&(clearInterval(i),i=null))}We(o),Cs(o),Es(c),xt(c);function d(f){return f<1e3?`${f}ms`:`${(f/1e3).toFixed(1)}s`}function u(f){return f==="running"?"clock":f==="success"?"success":f==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Wc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ua(e){const t=Wc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function hm(e){const t=Wc(e);return t?t.toLocaleTimeString():"—"}function mm(e){const t=Wc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function X_(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Wa(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Zc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function gm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Nu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function vm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function bm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const ym=Symbol("agent-detail-cancelled"),ek=15e3;function tk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((p,b)=>{o=p,c=b});function u(p,b){r||(r=!0,l!==null&&a(l),l=null,(p?o:c)(b))}let f;try{f=e(i==null?void 0:i.signal)}catch(p){u(!1,p)}return r||Promise.resolve(f).then(p=>u(!0,p),p=>u(!1,p)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const p=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${p}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,ym),i==null||i.abort()}}}function xm({state:e,requestDetail:t,timeoutMs:s=ek,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const f=l;l=null,f==null||f.cancel()}function o(f,{initial:p,coalesce:b}){if(!f)return Promise.resolve();if(b&&l&&l.agentId===f&&e.detailId===f)return l.promise;r();const y={agentId:f,cancel:null,promise:null};l=y,p?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const A=tk(O=>t(f,{signal:O}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return y.cancel=A.cancel,y.promise=(async()=>{let O=null,x=null;try{O=await A.promise}catch(m){x=m}O!==ym&&(l!==y||e.detailId!==f||(l=null,!x&&(O===null||typeof O!="object")&&(x=new Error(`${n} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=O,e.detailError=null),e.detailLoading=!1))})(),y.promise}function c(f){return e.detailId=f,o(f,{initial:!0,coalesce:!1})}function d(){const f=e.detailId;return f?o(f,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function sk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const nk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=J(()=>e.value.filter(L=>L.status==="running").length),o=J(()=>e.value.filter(L=>L.status==="completed").length),c=J(()=>e.value.filter(L=>["failed","timeout","killed"].includes(L.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(L=>["failed","timeout","killed"].includes(L.status)):e.value.filter(L=>L.status===i.value));function f(L){const Z=Number(L.max_iterations)||0;return Z<=0?0:Math.min(100,Math.round(L.iteration_count/Z*100))}function p(L){return(Number(L.max_iterations)||0)>0}function b(L,Z){return L?L==="N/A"?"N/A":Z==="current_inheritance"?`inherit (currently ${L})`:L:"unknown"}function y(L){return b(L.display_model,L.display_model_source||L.display_source)}function A(L){return b(L.display_reasoning_effort,L.display_reasoning_effort_source||L.display_source)}function O(L){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[L]||""}const x=h(null),m=h(null),_=h(!1),S=h(null),g=h(""),T=xm({state:{get detail(){return x.value},set detail(L){x.value=L},get detailId(){return m.value},set detailId(L){m.value=L},get detailLoading(){return _.value},set detailLoading(L){_.value=L},get detailError(){return S.value},set detailError(L){S.value=L}},requestDetail:(L,{signal:Z})=>K.get(`/api/agents/${encodeURIComponent(L)}`,{signal:Z})});async function C(L){g.value="",await T.open(L.id)}function M(){T.close(),g.value=""}async function B(){await T.refresh()}async function $(L,Z){try{await navigator.clipboard.writeText(Z||""),g.value=L,setTimeout(()=>{g.value===L&&(g.value="")},1500)}catch{Te.error("Copy failed")}}async function I(L=!1){L=L===!0,L||(t.value=!0);try{const Z=await K.get("/api/agents");e.value=Array.isArray(Z)?Z:[],s.value=null}catch(Z){L||(s.value=Z.message)}L||(t.value=!1)}async function j(L){const Z=e.value.find(_e=>_e.id===L);if(await gs({title:"Kill agent",message:`Kill agent "${(Z==null?void 0:Z.label)||L}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=L;try{await K.del(`/api/agents/${encodeURIComponent(L)}`),Te.success("Agent killed"),await I()}catch(_e){Te.error(_e.message||"Failed to kill agent")}n.value=null}}const Y=sk({isEnabled:()=>a.value&&l,refreshList:()=>I(!0),hasOpenDetail:()=>!!m.value,refreshDetail:B});function H(){Y.start()}function N(){Y.stop()}return es(a,()=>Y.sync()),We(()=>{l=!0,I(),H()}),Cs(()=>{l=!0,I(!0),H()}),Es(()=>{l=!1,N()}),xt(()=>{l=!1,N(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ua,formatDuration:Wa,progressPercent:f,hasProgress:p,displayModelText:y,displayEffortText:A,displaySourceLabel:O,detail:x,detailId:m,detailLoading:_,detailError:S,copied:g,openDetail:C,closeDetail:M,copyText:$,fetchAgents:I,killAgent:j,startAutoRefresh:H,stopAutoRefresh:N}}},ak={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),f=h(null),p=h("");let b=!1;const A=xm({state:{get detail(){return c.value},set detail(N){c.value=N},get detailId(){return d.value},set detailId(N){d.value=N},get detailLoading(){return u.value},set detailLoading(N){u.value=N},get detailError(){return f.value},set detailError(N){f.value=N}},detailLabel:"Loop detail",requestDetail:(N,{signal:L})=>K.get(`/api/loops/${encodeURIComponent(N)}?limit=100`,{signal:L})});async function O(N){p.value="",await A.open(N.id)}function x(){A.close(),p.value=""}async function m(N,L){try{await navigator.clipboard.writeText(L||""),p.value=N,setTimeout(()=>{p.value===N&&(p.value="")},1500)}catch{Te.error("Copy failed")}}const _=J(()=>e.value.reduce((N,L)=>N+(L.iteration_count||0),0)),S=J(()=>e.value.filter(N=>N.status==="running").length);function g(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function w(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function T(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}async function C(N=!1){N=N===!0,N||(t.value=!0);try{const L=await K.get("/api/loops");e.value=Array.isArray(L)?L:[],s.value=null}catch(L){N||(s.value=L.message)}N||(t.value=!1)}async function M(){l.value=null;const N=a.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const L={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(L.stop_condition=N.stop_condition.trim()),i.value=!0;try{const Z=await K.post("/api/loops",L);Te.success(`Loop started: ${Z.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(Z){l.value=Z.message}i.value=!1}async function B(N){if(await gs({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=N;try{await K.del(`/api/loops/${encodeURIComponent(N)}`),Te.success("Loop stopped"),await C()}catch(Z){Te.error(Z.message||"Failed to stop loop")}r.value=null}}async function $(N){o.value=N;try{await K.post(`/api/loops/${encodeURIComponent(N)}/restart`),Te.success("Loop restarted"),await C()}catch(L){Te.error(L.message||"Failed to restart loop")}o.value=null}function I(N){b&&N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&(C(!0),d.value&&A.refresh())}let j=null;function Y(){j!==null&&clearInterval(j),j=null}function H(){Y(),b&&(j=setInterval(()=>{C(!0),d.value&&A.refresh()},5e3))}return We(()=>{b=!0,C(),Ke.subscribe("events",I),H()}),Cs(()=>{b=!0,C(!0),H()}),Es(()=>{b=!1,Y()}),xt(()=>{b=!1,Ke.unsubscribe("events",I),Y(),A.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:f,copied:p,totalIterations:_,runningCount:S,statusDotClass:g,statusBadge:w,modeBadge:T,formatAge:mm,formatDuration:Wa,formatTs:ua,formatTokens:bm,openDetail:O,closeDetail:x,copyText:m,fetchLoops:C,doCreate:M,doStop:B,doRestart:$}}},ik={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=J(()=>e.value.filter(x=>x.status==="running").length),r=J(()=>e.value.filter(x=>x.status!=="running").length);function o(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(m){x||(s.value=m.message)}x||(t.value=!1)}function u(){f(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}es(n,x=>{x?u():f()});async function p(x){if(await gs({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await K.del(`/api/processes/${x}`),Te.success(`Process ${x} killed`),await d()}catch(_){Te.error(_.message||"Failed to kill process")}i.value=null}}function b(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let y=!1;function A(){y||(y=!0,d(),Ke.subscribe("events",b),u())}function O(){y&&(y=!1,Ke.unsubscribe("events",b),f())}return We(A),Cs(A),Es(O),xt(O),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Wa,fetchProcesses:d,doKill:p}}},lk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Lu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function rk(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function ok(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function ck(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=lk.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),f=new Date(u-864e5).getTimezoneOffset(),p=new Date(u+864e5).getTimezoneOffset(),b=[];for(const A of new Set([f,p])){const O=new Date(u+A*6e4);rk(O,c)===d&&(b.some(x=>x.getTime()===O.getTime())||b.push(O))}if(b.sort((A,O)=>A.getTime()-O.getTime()),b.length===0)return{state:"nonexistent",typed:t};if(b.length>1)return{state:"ambiguous",typed:t,options:b.map(A=>({instant:A,offset:ok(A),iso:A.toISOString()}))};const y=b[0];return{state:"ok",typed:t,instant:y,iso:y.toISOString()}}const dk={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=J(()=>ck(a.value.run_at));es(()=>a.value.run_at,()=>{r.value=null});const c=J(()=>{var se;const P=o.value;return P.state==="ok"?P.instant:P.state==="ambiguous"&&r.value!==null&&((se=P.options[r.value])==null?void 0:se.instant)||null}),d=J(()=>{const P=c.value;return P?`${P.toLocaleString()} local — ${P.toISOString()} UTC`:""}),u=h(null),f=h(!1),p=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=h(null),y=h(null),A=h(null),O=h(null),x=h(null),m=h([]),_=h(!1),S=h("");let g=0;const w=J(()=>e.value.filter(P=>P.cron&&!P.one_time).length),T=J(()=>e.value.filter(P=>P.one_time).length),C=J(()=>e.value.filter(P=>P.trigger).length),M=J(()=>e.value.filter(P=>P.paused).length),B=J(()=>e.value.filter(P=>P.consecutive_failures>0).length);function $(P){if(!P)return"-";const se=Date.now(),V=(new Date(P).getTime()-se)/1e3;if(V<0)return"overdue";if(V<60)return"in < 1 min";if(V<3600)return`in ${Math.floor(V/60)} min`;if(V<86400){const de=Math.floor(V/3600),ve=Math.floor(V%3600/60);return ve>0?`in ${de}h ${ve}m`:`in ${de}h`}const ce=Math.floor(V/86400);return`in ${ce} day${ce!==1?"s":""}`}function I(P){return P==null?"-":P<1e3?`${P}ms`:P<6e4?`${(P/1e3).toFixed(1)}s`:Wa(P/1e3)}function j(P=a.value.cron){a.value.cron=P,Lu(a.value,"cron"),u.value=null}function Y(P=a.value.run_at){a.value.run_at=P,Lu(a.value,"run_at"),u.value=null}async function H(){const P=a.value.cron.trim();if(P){f.value=!0;try{u.value=await K.post("/api/schedules/validate-cron",{expression:P})}catch(se){u.value={valid:!1,error:se.message}}f.value=!1}}async function N(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(P){s.value=P.message}t.value=!1}async function L(P){if(x.value===P){x.value=null,m.value=[];return}x.value=P,_.value=!0,m.value=[];const se=++g;try{const ke=await K.get(`/api/schedules/${encodeURIComponent(P)}/history?limit=10`);if(se!==g||x.value!==P)return;m.value=ke,S.value=""}catch(ke){if(se!==g||x.value!==P)return;m.value=[],S.value=ke.message||"Failed to load execution history"}se===g&&(_.value=!1)}async function Z(){l.value=null;const P=a.value;if(!P.description.trim()){l.value="Description is required";return}if(!P.channel_id.trim()){l.value="Channel ID is required";return}if(!P.cron.trim()&&!P.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(P.cron.trim()&&P.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const se={description:P.description.trim(),action:P.action,channel_id:P.channel_id.trim()};if(P.cron.trim()&&(se.cron=P.cron.trim()),P.run_at.trim()){const ke=o.value;if(ke.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ke.state==="invalid"){l.value="One-time run time is not a valid date";return}const V=c.value;if(ke.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!V){l.value="One-time run time could not be resolved";return}se.run_at=V.toISOString()}if(P.action==="reminder"&&P.message.trim()&&(se.message=P.message.trim()),P.action==="check"&&(P.tool_name.trim()&&(se.tool_name=P.tool_name.trim()),P.tool_input_str.trim()))try{se.tool_input=JSON.parse(P.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",se),Te.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},u.value=null,n.value=!1,await N()}catch(ke){l.value=ke.message}i.value=!1}async function xe(P){b.value=P;try{const se=await K.post(`/api/schedules/${encodeURIComponent(P)}/run`);if(se.status==="failure")Te.error(`Execution failed: ${se.error||"unknown error"}`);else{const ke=se.warning?`Executed (${se.warning})`:"Executed successfully";Te.success(ke)}await N()}catch(se){Te.error(se.message||"Failed to trigger")}b.value=null}async function _e(P){A.value=P.id;const se=!P.paused;try{await K.put(`/api/schedules/${encodeURIComponent(P.id)}`,{paused:se}),Te.success(se?"Schedule paused":"Schedule resumed"),await N()}catch(ke){Te.error(ke.message||"Failed to update schedule")}A.value=null}async function ae(P){O.value=P;try{await K.post(`/api/schedules/${encodeURIComponent(P)}/reset-failures`),Te.success("Failure counters reset"),await N()}catch(se){Te.error(se.message||"Failed to reset")}O.value=null}async function fe(P){const se=e.value.find(V=>V.id===P);if(await gs({title:"Delete schedule",message:`Delete "${(se==null?void 0:se.description)||P}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){y.value=P;try{await K.del(`/api/schedules/${encodeURIComponent(P)}`),Te.success("Schedule deleted"),await N()}catch(V){Te.error(V.message||"Failed to delete schedule")}y.value=null}}return We(()=>{N()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:f,cronPresets:p,runningId:b,deletingId:y,togglingId:A,resettingId:O,expandedId:x,history:m,historyLoading:_,historyError:S,cronCount:w,oneTimeCount:T,webhookCount:C,pausedCount:M,failingCount:B,formatTs:ua,formatAge:mm,formatFuture:$,formatMs:I,formatDuration:Wa,onCronInput:j,onRunAtInput:Y,validateCron:H,toggleExpand:L,fetchSchedules:N,doCreate:Z,doRunNow:xe,doTogglePause:_e,doResetFailures:ae,doDelete:fe}}},_m=[{id:"live",label:"Live",component:Q_},{id:"agents",label:"Agents",component:nk},{id:"loops",label:"Loops",component:ak},{id:"processes",label:"Processes",component:ik},{id:"schedules",label:"Schedules",component:dk}],uk={components:{TabbedPage:Dr},setup(){return{tabs:_m}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},fk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await K.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return We(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ua,formatDetail:i,truncateBlock:gm,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Du=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],pk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],hk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),f=h(""),p=h("last_active"),b=h(!1),y=Du,A=pk,O=h([]),x=h(!1),m=h(""),_=h("flat"),S=h(new Set),g=h(""),w=h(""),T=h(""),C=h(null),M=h(!1);function B(){try{const G=localStorage.getItem("odin-session-presets");G&&(O.value=JSON.parse(G))}catch{}}function $(){try{localStorage.setItem("odin-session-presets",JSON.stringify(O.value))}catch{}}const I=J(()=>f.value.trim()!==""||u.value!=="all"),j=J(()=>{let G=[...e.value];const ye=Du.find(ze=>ze.id===u.value),Ce=ye?ye.filters:{};if(Ce.source&&(G=G.filter(ze=>ze.source===Ce.source)),Ce.minMessages&&(G=G.filter(ze=>ze.message_count>=Ce.minMessages)),Ce.hasCompaction&&(G=G.filter(ze=>ze.has_summary)),Ce.maxAge!=null){const ze=Date.now()/1e3;G=G.filter(pt=>pt.last_active&&ze-pt.last_active<=Ce.maxAge)}if(f.value.trim()){const ze=f.value.toLowerCase().trim();G=G.filter(pt=>(pt.channel_id||"").toLowerCase().includes(ze)||(pt.last_user_id||"").toLowerCase().includes(ze)||(pt.source||"").toLowerCase().includes(ze))}const Re=p.value,Be=b.value?1:-1;return G.sort((ze,pt)=>{const ns=ze[Re]||0,As=pt[Re]||0;return(ns-As)*Be}),G}),Y=J(()=>{if(!a.value||!a.value.messages)return[];const G=a.value.messages;if(G.length===0)return[];const ye=[];let Ce=[];for(const Re of G)Re.role==="user"&&Ce.length>0&&(ye.push(Ce),Ce=[]),Ce.push(Re);return Ce.length>0&&ye.push(Ce),ye}),H=J(()=>j.value.length>0&&c.value.size===j.value.length);function N(G){const ye=G.find(Ce=>Ce.role==="user");if(ye&&ye.content){const Ce=ye.content.slice(0,120);return Ce.length<ye.content.length?Ce+"...":Ce}return"(no user message)"}function L(G){const ye=new Set(S.value);ye.has(G)?ye.delete(G):ye.add(G),S.value=ye}function Z(G){u.value=G}function xe(G){u.value=G.id,G.filters.searchQuery!=null&&(f.value=G.filters.searchQuery),G.filters.sortBy&&(p.value=G.filters.sortBy)}function _e(){if(!m.value.trim())return;const G={id:"custom-"+Date.now(),name:m.value.trim(),filters:{searchQuery:f.value,sortBy:p.value}};O.value=[...O.value,G],$(),x.value=!1,m.value=""}function ae(G){O.value=O.value.filter(ye=>ye.id!==G),$(),u.value===G&&(u.value="all")}function fe(){u.value="all",f.value="",p.value="last_active",b.value=!1}function P(G){if(!G)return"—";const ye=Date.now()/1e3-G;if(ye<60)return"just now";if(ye<3600){const Re=Math.floor(ye/60);return`${Re} minute${Re!==1?"s":""} ago`}if(ye<86400){const Re=Math.floor(ye/3600);return`${Re} hour${Re!==1?"s":""} ago`}const Ce=Math.floor(ye/86400);return`${Ce} day${Ce!==1?"s":""} ago`}function se(G){if(!G)return"";try{return new Date(G*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ke(G){if(!G)return"";try{return new Date(G*1e3).toLocaleString()}catch{return""}}function V(G){return G==="user"?"bg-gray-900/50 border border-gray-800":G==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ce(G){return G==="user"?"sess-msg-user":G==="assistant"?"sess-msg-assistant":"sess-msg-system"}function de(G){return G==="user"?"badge-info":G==="assistant"?"badge-success":"badge-warning"}function ve(G){return G==="user"?"sess-dot-user":G==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(G){return G==="user"?"text-cyan-400":G==="assistant"?"text-indigo-400":"text-gray-500"}function He(G){return G?G.length>2e3?G.slice(0,2e3)+`
... (truncated)`:G:""}async function k(){const G=g.value.trim();if(G){M.value=!0;try{let ye=`/api/sessions/search?q=${encodeURIComponent(G)}&limit=50`;w.value.trim()&&(ye+=`&channel_id=${encodeURIComponent(w.value.trim())}`),T.value.trim()&&(ye+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ce=await K.get(ye);C.value=Ce.results||[]}catch{C.value=[]}M.value=!1}}function E(){g.value="",w.value="",T.value="",C.value=null}function U(G){return G?G.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function X(G){return G==="user"?"fts-result-user":G==="assistant"?"fts-result-assistant":G==="summary"?"fts-result-summary":G==="fts"?"fts-result-fts":G==="channel"?"fts-result-channel":"fts-result-default"}function q(G){return G==="user"?"badge-info":G==="assistant"?"badge-success":G==="summary"?"badge-warning":G==="fts"?"badge-success":"badge-info"}async function Q(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(G){s.value=G.message}t.value=!1}function ie(){s.value=null,Q()}async function re(G){if(n.value===G){n.value=null,a.value=null,S.value=new Set;return}n.value=G,a.value=null,i.value=!0,S.value=new Set;const ye=++l;try{const Ce=await K.get(`/api/sessions/${encodeURIComponent(G)}`);ye===l&&n.value===G&&(a.value=Ce)}catch(Ce){ye===l&&n.value===G&&(a.value={messages:[],summary:"",error:Ce.message||"Failed to load session"})}finally{ye===l&&(i.value=!1)}}function le(G){const ye=new Set(c.value);ye.has(G)?ye.delete(G):ye.add(G),c.value=ye}function te(){H.value?c.value=new Set:c.value=new Set(j.value.map(G=>G.channel_id))}function be(G){r.value=G}async function ue(){if(r.value){o.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await Q()}catch(G){s.value=G.message||"Failed to clear session"}o.value=!1,r.value=null}}function he(){d.value=!0}async function we(){if(c.value.size!==0){o.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await Q()}catch(G){s.value=G.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function Ee(G,ye){const Ce=`/api/sessions/${encodeURIComponent(G)}/export?format=${ye}`;try{const Re=await K.getBlob(Ce),Be=URL.createObjectURL(Re),ze=document.createElement("a");ze.href=Be,ze.download=`session-${G}.${ye==="text"?"txt":"json"}`,ze.click(),URL.revokeObjectURL(Be)}catch(Re){s.value=Re.message||"Failed to export session"}}let Le=null;function Oe(G){G.payload&&G.payload.channel_id&&(clearTimeout(Le),Le=setTimeout(()=>{if(Q(),n.value&&G.payload.channel_id===n.value){const ye=n.value,Ce=l;K.get(`/api/sessions/${encodeURIComponent(ye)}`).then(Re=>{Ce!==l||n.value!==ye||(a.value=Re)}).catch(()=>{})}},2e3))}let Fe=!1;function Ve(){Fe||(Fe=!0,Q(),Ke.subscribe("events",Oe))}We(()=>{B(),Ve()}),Cs(()=>{Ve()});function lt(){Fe&&(Fe=!1,Ke.unsubscribe("events",Oe),clearTimeout(Le))}return Es(lt),xt(lt),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:H,bulkClearing:d,activePreset:u,searchQuery:f,sortBy:p,sortAsc:b,filterPresets:y,sortOptions:A,filteredSessions:j,hasActiveFilters:I,customPresets:O,showSavePreset:x,newPresetName:m,threadView:_,threads:Y,collapsedThreads:S,ftsQuery:g,ftsChannelId:w,ftsUserId:T,ftsResults:C,ftsSearching:M,formatAge:P,formatTimestamp:se,formatFullTimestamp:ke,messageClass:V,threadMsgClass:ce,roleBadge:de,roleDotClass:ve,roleLabelClass:me,truncateContent:He,threadSummary:N,fetchSessions:Q,retry:ie,toggleSession:re,toggleSelect:le,toggleSelectAll:te,confirmClear:be,clearSession:ue,confirmBulkClear:he,doBulkClear:we,exportSession:Ee,applyPreset:Z,applyCustomPreset:xe,saveCustomPreset:_e,removeCustomPreset:ae,resetFilters:fe,toggleThread:L,runFtsSearch:k,clearFtsSearch:E,highlightSnippet:U,ftsResultClass:X,ftsTypeBadge:q}}},mk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:bm}}},gk={components:{ContextAssemblyPanel:mk},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(w){if(!w)return"—";try{const T=new Date(w);return isNaN(T.getTime())?w:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function f(w){return!w&&w!==0?"—":w<1e3?w+"ms":(w/1e3).toFixed(1)+"s"}function p(w){return!w&&w!==0?"—":w>=1e3?(w/1e3).toFixed(1)+"k":String(w)}function b(w){if(!w)return"";if(typeof w=="string")return w;try{return JSON.stringify(w,null,2)}catch{return String(w)}}function y(w){a.value===w?a.value=null:(a.value=w,c.value={})}function A(w,T){const C=w+"-"+T;c.value={...c.value,[C]:!c.value[C]}}function O(w,T){return!!c.value[w+"-"+T]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function m(){try{const w=await K.get("/api/trajectories");e.value=w.files||[],o.value=w.count||0}catch{}}let _=0;async function S(){const w=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await K.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(w!==_)return;let C=T.entries||[];d.value.tool_name&&(C=C.filter(M=>(M.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(M=>M.is_error)),d.value.channel_id&&(C=C.filter(M=>M.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(M=>M.user_id===d.value.user_id)),t.value=C}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const C=T.toString(),M=await K.get(`/api/trajectories/search/query?${C}`);if(w!==_)return;t.value=M.results||[]}}catch(T){if(w!==_)return;n.value=T.message}w===_&&(s.value=!1)}async function g(){if(!l.value.trim())return;const w=++_;s.value=!0,n.value=null,c.value={};try{const T=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(w!==_)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(w!==_)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}w===_&&(s.value=!1)}return We(async()=>{await m(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:f,formatTokens:p,formatJSON:b,truncateBlock:gm,toggleExpand:y,toggleIteration:A,isIterationExpanded:O,clearFilters:x,fetchFiles:m,fetchTraces:S,lookupMessage:g}}},vk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=J(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const b=await K.get("/api/usage");n.value=b,a.value=b.totals||a.value,t.value=null,s.value=!0}catch(b){t.value=b.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function f(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function p(){u&&(u=!1,l&&(clearInterval(l),l=null))}return We(f),Cs(f),Es(p),xt(p),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:vm,formatTime:hm,retry:d}}},km=[{id:"audit",label:"Audit",component:fk},{id:"sessions",label:"Sessions",component:hk},{id:"traces",label:"Traces",component:gk},{id:"usage",label:"Usage",component:vk}],bk={components:{TabbedPage:Dr},setup(){return{tabs:km}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},no=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],yk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=J(()=>e.value.filter(x=>x.is_core).length),c=J(()=>e.value.filter(x=>!x.is_core).length),d=J(()=>Object.values(a.value).reduce((x,m)=>x+m,0));function u(x){for(const m of no)if(m.id!=="other"&&m.match(x))return m.id;return"other"}const f=J(()=>{let x=e.value;if(n.value){const m=n.value.toLowerCase();x=x.filter(_=>_.name.toLowerCase().includes(m)||(_.description||"").toLowerCase().includes(m))}return r.value&&(x=x.filter(m=>u(m.name)===r.value)),x}),p=J(()=>{const x=new Set;for(const m of e.value)x.add(u(m.name));return no.filter(m=>x.has(m.id))}),b=J(()=>{const x=f.value,m={};for(const S of x){const g=u(S.name);m[g]||(m[g]=[]),m[g].push(S)}const _=[];for(const S of no)m[S.id]&&m[S.id].length>0&&_.push({label:S.label,icon:S.icon,tools:m[S.id].sort((g,w)=>g.name.localeCompare(w.name))});return _});function y(x){i.value={...i.value,[x]:!i.value[x]}}async function A(){t.value=!0,s.value=null;try{const[x,m]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({}))]);e.value=x,a.value=m||{};const _=Object.values(m||{}).filter(S=>S>0).sort((S,g)=>S-g)}catch(x){s.value=x.message}t.value=!1}function O(){A()}return We(()=>{A()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:f,groupedTools:b,usedCategories:p,truncate:Zc,toggleExpand:y,refresh:O}}};function xk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function _k(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const kk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),f=h(null),p=h(null),b=h(!1),y=h(null),A=h(null),O=h(!1),x=J(()=>e.value.length),m=J(()=>e.value.reduce((P,se)=>P+(se.execution_count||0),0)),_=J(()=>e.value.reduce((P,se)=>P+M(se.code),0)),S=J(()=>{if(!l.value)return e.value;const P=l.value.toLowerCase();return e.value.filter(se=>se.name.toLowerCase().includes(P)||(se.description||"").toLowerCase().includes(P))}),g=J(()=>u.value?u.value.split(`
`).length:0),w=J(()=>{const P=Math.max(g.value,1);return Array.from({length:P},(se,ke)=>ke+1).join(`
`)}),T=J(()=>{const P=u.value.trim();return P?P.includes("SKILL_DEFINITION")?P.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(P){return xk(P)}function M(P){return P?P.split(`
`).length:0}function B(P){return _k(P)}function $(P){n.value={...n.value,[P]:!n.value[P]}}async function I(P){try{await navigator.clipboard.writeText(P);const se=e.value.find(ke=>ke.code===P);se&&(r.value=se.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function j(P){if(P.key==="Tab"){P.preventDefault();const se=P.target,ke=se.selectionStart,V=se.selectionEnd;u.value=u.value.substring(0,ke)+"    "+u.value.substring(V),At(()=>{se.selectionStart=se.selectionEnd=ke+4})}}function Y(P){const se=P.target.previousElementSibling;se&&(se.scrollTop=P.target.scrollTop)}async function H(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(P){s.value=P.message}t.value=!1}async function N(P){i.value=P,delete a.value[P],a.value={...a.value};try{const se=await K.post(`/api/skills/${encodeURIComponent(P)}/test`);a.value={...a.value,[P]:se}}catch(se){a.value={...a.value,[P]:{result:se.message,is_error:!0}}}i.value=null}function L(){o.value=!0,c.value="create",d.value="",u.value="",f.value=null,p.value=null}function Z(P){o.value=!0,c.value="edit",d.value=P.name,u.value=P.code||"",f.value=null,p.value=null}function xe(){o.value=!1,f.value=null,p.value=null}async function _e(){f.value=null,p.value=null;const P=d.value.trim(),se=u.value.trim();if(!P){f.value="Name is required";return}if(!se){f.value="Code is required";return}b.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:P,code:se}),p.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(P)}`,{code:se}),p.value="Skill updated successfully"),await H(),setTimeout(()=>{o.value=!1},800)}catch(ke){f.value=ke.message}b.value=!1}function ae(P){A.value=P}async function fe(){if(A.value){O.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(A.value)}`),await H()}catch(P){Te.error(`Failed to delete skill: ${P.message||"unknown error"}`)}O.value=!1,A.value=null}}return We(()=>{H()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:f,editSuccess:p,saving:b,editorRef:y,deleteTarget:A,deleting:O,enabledCount:x,totalExecutions:m,totalLines:_,displayedSkills:S,editLineCount:g,editorLineNums:w,editValidation:T,highlight:C,truncate:Zc,formatTs:ua,countLines:M,getLineNumbers:B,toggleCode:$,copyCode:I,handleEditorKey:j,syncScroll:Y,fetchSkills:H,testSkill:N,showCreate:L,editSkill:Z,cancelEdit:xe,saveSkill:_e,confirmDelete:ae,doDelete:fe}}};function wk(e,t){if(!e||!t)return Nu(e);const s=Nu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Sk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),f=h(null),p=h(!1),b=h(null),y=h(null);let A=null;const O=h(null),x=h(!1),m=h({}),_=h({}),S=h(null),g=h(null),w=J(()=>e.value.reduce((L,Z)=>L+(Z.chunks||0),0)),T=J(()=>new Set(e.value.map(Z=>Z.uploader).filter(Boolean)).size);function C(L,Z){const xe=_.value[Z];if(!xe||xe.length===0)return 0;const _e=Math.max(...xe.map(ae=>ae.char_count||0));return _e===0?0:Math.round(L.char_count/_e*100)}async function M(){t.value=!0,s.value=null;try{const L=await K.get("/api/knowledge");e.value=Array.isArray(L)?L:[]}catch(L){s.value=L.message}t.value=!1}async function B(L){if(m.value[L]){m.value[L]=!1,g.value=null;return}if(m.value[L]=!0,!(_.value[L]||S.value===L)){S.value=L;try{const Z=await K.get(`/api/knowledge/${encodeURIComponent(L)}/chunks`);_.value[L]=Array.isArray(Z)?Z:[]}catch(Z){_.value[L]=[],Te.error(`Failed to load chunks: ${Z.message}`)}S.value=null}}async function $(){const L=n.value.trim();if(L){i.value=!0,r.value=null,l.value=L;try{const Z=await K.get(`/api/knowledge/search?q=${encodeURIComponent(L)}`);a.value=Array.isArray(Z)?Z:[]}catch(Z){a.value=[],r.value=Z.message||"Search failed"}i.value=!1}}function I(){a.value=null,n.value="",r.value=null}async function j(){u.value=null,f.value=null;const L=c.value.trim(),Z=d.value.trim();if(!L){u.value="Source name is required";return}if(!Z){u.value="Content is required";return}p.value=!0;try{const xe=await K.post("/api/knowledge",{source:L,content:Z});f.value=`Ingested ${xe.chunks||0} chunks from "${L}"`,c.value="",d.value="",_.value={},await M(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(xe){u.value=xe.message}p.value=!1}async function Y(L){b.value=L,y.value=null,A&&(clearTimeout(A),A=null);try{const Z=await K.post(`/api/knowledge/${encodeURIComponent(L)}/reingest`);y.value={source:L,error:!1,message:`Re-ingested ${Z.chunks||0} chunks`},delete _.value[L],await M(),A=setTimeout(()=>{y.value=null,A=null},3e3)}catch(Z){y.value={source:L,error:!0,message:Z.message}}b.value=null}function H(L){O.value=L}async function N(){if(O.value){x.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(O.value)}`),delete _.value[O.value],await M()}catch(L){Te.error(`Failed to delete source: ${L.message||"unknown error"}`)}x.value=!1,O.value=null}}return We(()=>{M()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:f,ingesting:p,reingesting:b,reingestResult:y,deleteTarget:O,deleting:x,expanded:m,sourceChunks:_,loadingChunks:S,selectedChunk:g,totalChunks:w,uploaderCount:T,truncate:Zc,formatTs:ua,highlightTerms:wk,chunkBarWidth:C,fetchSources:M,toggleSource:B,doSearch:$,clearSearch:I,doIngest:j,doReingest:Y,confirmDelete:H,doDelete:N}}},Tk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),f=h(null),p=h(""),b=h(!1),y=h(null),A=h(null),O=h(new Set),x=h(null),m=h(!1),_=h(!1),S=J(()=>e.value.reduce((ae,fe)=>ae+fe.count,0)),g=J(()=>O.value.size);function w(ae){const fe=t.value[ae];if(!fe)return[];if(!l.value.trim())return fe;const P=l.value.trim().toLowerCase();return fe.filter(se=>se.key.toLowerCase().includes(P)||se.value&&se.value.toLowerCase().includes(P))}function T(ae,fe){return O.value.has(ae+"/"+fe)}function C(ae,fe){const P=ae+"/"+fe,se=new Set(O.value);se.has(P)?se.delete(P):se.add(P),O.value=se}function M(ae){const fe=t.value[ae];return!fe||fe.length===0?!1:fe.every(P=>O.value.has(ae+"/"+P.key))}function B(ae,fe){const P=t.value[ae];if(!P)return;const se=new Set(O.value);for(const ke of P){const V=ae+"/"+ke.key;fe?se.add(V):se.delete(V)}O.value=se}async function $(){s.value=!0,n.value=null;try{const ae=await K.get("/api/memory");e.value=Object.entries(ae).map(([fe,P])=>({name:fe,keys:P.keys||[],count:P.count||0}))}catch(ae){n.value=ae.message}s.value=!1}async function I(ae){if(a.value[ae]){a.value[ae]=!1;return}a.value[ae]=!0;const fe=e.value.find(se=>se.name===ae);if(!fe||t.value[ae]||i.value===ae)return;i.value=ae;let P;try{const ke=(await K.get(`/api/memory/${encodeURIComponent(ae)}`)).entries||{};P=fe.keys.map(V=>Object.prototype.hasOwnProperty.call(ke,V)?{key:V,value:ke[V]||"",failed:!1}:{key:V,value:"",failed:!0,error:"Not found in scope"})}catch(se){P=fe.keys.map(ke=>({key:ke,value:"",failed:!0,error:se.message||"Failed to load"}))}t.value[ae]=P,i.value=null}function j(ae,fe,P){f.value=ae+"/"+fe,p.value=P}async function Y(ae,fe){b.value=!0,y.value=null;try{await K.put(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(fe)}`,{value:p.value});const P=t.value[ae];if(P){const se=P.find(ke=>ke.key===fe);se&&(se.value=p.value)}f.value=null}catch(P){y.value=`Failed to save: ${P.message||"unknown error"}`}b.value=!1}async function H(ae,fe){try{await navigator.clipboard.writeText(fe.value),A.value=ae+"/"+fe.key,setTimeout(()=>{A.value=null},1500)}catch{}}async function N(){d.value=null,u.value=null;const ae=o.value.scope.trim(),fe=o.value.key.trim(),P=o.value.value.trim();if(!ae){d.value="Scope is required";return}if(!fe){d.value="Key is required";return}if(!P){d.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(fe)}`,{value:P}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await $(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(se){d.value=se.message}c.value=!1}function L(ae,fe){x.value={scope:ae,key:fe}}async function Z(){if(!x.value)return;m.value=!0,y.value=null;const{scope:ae,key:fe}=x.value;try{await K.del(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(fe)}`);const P=t.value[ae];P&&(t.value[ae]=P.filter(V=>V.key!==fe));const se=e.value.find(V=>V.name===ae);se&&(se.count--,se.keys=se.keys.filter(V=>V!==fe));const ke=new Set(O.value);ke.delete(ae+"/"+fe),O.value=ke}catch(P){y.value=`Failed to delete: ${P.message||"unknown error"}`}m.value=!1,x.value=null}function xe(){_.value=!0}async function _e(){m.value=!0,y.value=null;const ae=[];for(const fe of O.value){const P=fe.indexOf("/");ae.push({scope:fe.slice(0,P),key:fe.slice(P+1)})}try{await K.post("/api/memory/bulk-delete",{entries:ae}),O.value=new Set,t.value={},await $()}catch(fe){y.value=`Bulk delete failed: ${fe.message||"unknown error"}`}m.value=!1,_.value=!1}return We(()=>{$()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:f,editValue:p,saving:b,actionError:y,copied:A,selected:O,selectedCount:g,totalEntries:S,deleteTarget:x,deleting:m,showBulkDelete:_,fetchMemory:$,toggleScope:I,startEdit:j,doEdit:Y,copyValue:H,doAdd:N,confirmDelete:L,doDelete:Z,confirmBulkDelete:xe,doBulkDelete:_e,isSelected:T,toggleSelect:C,isScopeAllSelected:M,toggleSelectAll:B,filteredEntries:w}}},Ck={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=J(()=>[...new Set(e.value.map(A=>A.category))].sort()),o=J(()=>{const y={};return e.value.forEach(A=>{y[A.category]=(y[A.category]||0)+1}),y}),c=J(()=>a.value?e.value.filter(y=>y.category===a.value):e.value);function d(y){return y==="correction"?"badge-warning":y==="operational"?"badge-info":y==="preference"?"badge-success":"badge-info"}function u(y){i.value=y.key,l.value=y.content}async function f(y){try{await K.put("/api/learned/"+encodeURIComponent(y),{content:l.value}),i.value=null,Te.success("Entry updated"),await b()}catch(A){Te.error(A.message||"Failed to save entry")}}async function p(y){if(await gs({title:"Delete learned entry",message:`Delete "${y}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(y)),Te.success("Entry deleted"),await b()}catch(O){Te.error(O.message||"Failed to delete entry")}}async function b(){s.value=!0,n.value=null;try{const y=await K.get("/api/learned");e.value=y.entries||[],t.value={last_reflection:y.last_reflection,count:y.count}}catch(y){n.value=y.message}s.value=!1}return We(b),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ua,startEdit:u,saveEdit:f,deleteEntry:p,fetchEntries:b}}},wm=[{id:"tools",label:"Tools",component:yk},{id:"skills",label:"Skills",component:kk},{id:"knowledge",label:"Knowledge",component:Sk},{id:"memory",label:"Memory",component:Tk},{id:"learned",label:"Learned",component:Ck}],Ek={components:{TabbedPage:Dr},setup(){return{tabs:wm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Ak={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Rk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Ik={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ok={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=J(()=>e.value.components||[]),l=J(()=>Ik[e.value.overall]||"text-gray-400"),r=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=J(()=>{const g=e.value.overall;return g==="healthy"?"All Systems Healthy":g==="degraded"?"Some Systems Degraded":g==="unhealthy"?"System Issues Detected":"Unknown"});function c(g){return Ak[g]||"text-gray-400"}function d(g){return Rk[g]||"info"}function u(g){return g==="ok"?"badge-success":g==="degraded"?"badge-warning":g==="down"?"badge-danger":"badge-info"}function f(g){return g==="closed"?"text-green-400":g==="half_open"?"text-yellow-400":g==="open"?"text-red-400":"text-gray-400"}function p(g){return g.replace(/_/g," ").replace(/\b\w/g,w=>w.toUpperCase())}function b(g){if(!g)return"—";try{return new Date(g).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return g}}function y(g){return g>=1e6?(g/1e6).toFixed(1)+"M":g>=1e3?(g/1e3).toFixed(1)+"K":String(g)}async function A(){a.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null,n.value=!0}catch(g){s.value=g.message}finally{t.value=!1,a.value=!1}}function O(){t.value=!0,s.value=null,A()}let x=null,m=!1;function _(){m||(m=!0,A(),x||(x=setInterval(A,3e4)))}function S(){m&&(m=!1,x&&(clearInterval(x),x=null))}return We(_),Cs(_),Es(S),xt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:f,formatName:p,formatTime:b,formatNumber:y,fetchHealth:A,retry:O}}},Nk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=J(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=J(()=>{if(!i.value)return[];const A=i.value,O=A.storage_total_bytes||1;return[{label:"Session Persistence",mb:A.sessions.persist_dir.total_mb,bytes:A.sessions.persist_dir.total_bytes,files:A.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(A.sessions.persist_dir.total_bytes/O*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:A.knowledge.db_file.total_mb,bytes:A.knowledge.db_file.total_bytes,files:A.knowledge.db_file.file_count,pct:Math.min(100,Math.round(A.knowledge.db_file.total_bytes/O*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:A.trajectories.message_dir.total_mb,bytes:A.trajectories.message_dir.total_bytes,files:A.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.message_dir.total_bytes/O*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:A.trajectories.agent_dir.total_mb,bytes:A.trajectories.agent_dir.total_bytes,files:A.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.agent_dir.total_bytes/O*100)),color:"res-bar-amber"}]});async function d(){try{const A=await K.get("/api/resource-usage");i.value=A,t.value=null,s.value=!0}catch(A){t.value=A.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function f(){e.value=!0,t.value=null,d()}let p=!1;function b(){p||(p=!0,d(),l||(l=setInterval(d,3e4)))}function y(){p&&(p=!1,l&&(clearInterval(l),l=null))}return We(b),Cs(b),Es(y),xt(y),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:vm,refresh:u,retry:f}}},Lk=["INFO","WARNING","ERROR"],Dk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],ao=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Mk=[50,100,200,500],Pk={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ke.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),f=h(null),p=2e3,b=Lk,y=Dk,A=ao,O=h("all"),x=h(""),m=h([]),_=h(!1),S=h(""),g=h([]);function w(){try{const z=localStorage.getItem("odin-log-presets");z&&(m.value=JSON.parse(z))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const C=J(()=>a.value!==""||i.value.trim()!==""||x.value!==""),M=J(()=>{const z=ao.find(oe=>oe.value===x.value);return z?z.label:""}),B=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(z){return z.message}}),$=24,I=J(()=>{if(xe.value.length===0)return[];const z=[],oe=new Date,Ae=3600*1e3;for(let Je=$-1;Je>=0;Je--){const ct=new Date(oe.getTime()-(Je+1)*Ae),$t=new Date(oe.getTime()-Je*Ae);z.push({start:ct,end:$t,label:N(ct,$t),shortLabel:$t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Je of xe.value){if(!Je._time)continue;const ct=Je._time.getTime();for(const $t of z)if(ct>=$t.start.getTime()&&ct<$t.end.getTime()){$t.total++,Je.level==="ERROR"?$t.errors++:Je.level==="WARNING"?$t.warnings++:$t.info++;break}}return z}),j=J(()=>{let z=1;for(const oe of I.value)oe.total>z&&(z=oe.total);return z}),Y=J(()=>{if(I.value.length===0)return"";const z=xe.value.map(Je=>Je._time&&Je._time.getTime()).filter(Boolean);if(z.length===0)return"";const oe=new Date(Math.min(...z));return`${xe.value.length} shown, oldest ${oe.toLocaleTimeString()}`}),H=J(()=>Math.ceil($/8));function N(z,oe){const Ae={hour:"2-digit",minute:"2-digit"};return z.toLocaleTimeString([],Ae)+" - "+oe.toLocaleTimeString([],Ae)}function L(z,oe){return!oe||!z?"0px":Math.max(2,z/oe*100)+"%"}function Z(z){const oe=xe.value.findIndex(Ae=>Ae._time&&Ae._time.getTime()>=z.start.getTime()&&Ae._time.getTime()<z.end.getTime());if(oe>=0&&d.value){const Ae=d.value.querySelectorAll(".log-line");Ae[oe]&&(Ae[oe].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const xe=J(()=>{let z=t.value;if(a.value&&(z=z.filter(oe=>(oe.level||"INFO")===a.value)),x.value){const oe=ao.find(Ae=>Ae.value===x.value);if(oe&&oe.seconds){const Ae=new Date(Date.now()-oe.seconds*1e3);z=z.filter(Je=>Je._time&&Je._time>=Ae)}}if(i.value&&!B.value)if(l.value)try{const oe=new RegExp(i.value,"i");z=z.filter(Ae=>{const Je=Ae.text||Ae.raw||"",ct=Ae.tool||"";return oe.test(Je)||oe.test(ct)})}catch{}else{const oe=i.value.toLowerCase();z=z.filter(Ae=>{const Je=(Ae.text||Ae.raw||"").toLowerCase(),ct=(Ae.tool||"").toLowerCase();return Je.includes(oe)||ct.includes(oe)})}return z});function _e(z){if(z.type==="log"&&z.line)try{const oe=typeof z.line=="string"?JSON.parse(z.line):z.line,Ae=oe.timestamp?new Date(oe.timestamp):new Date;return{ts:Ae.toLocaleTimeString(),_time:Ae,level:oe.error?"ERROR":"INFO",text:oe.tool_name?`[${oe.tool_name}] ${oe.result_summary||""}`.trim():oe.message||JSON.stringify(oe),tool:oe.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(z.line),tool:"",raw:String(z.line)}}if(z.payload){const oe=z.payload,Ae=oe.timestamp?new Date(oe.timestamp):new Date;return{ts:Ae.toLocaleTimeString(),_time:Ae,level:oe.error?"ERROR":"INFO",text:oe.tool_name?`[${oe.tool_name}] ${oe.result_summary||""}`.trim():oe.message||JSON.stringify(oe),tool:oe.tool_name||"",raw:null}}return typeof z=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:z,tool:"",raw:z}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(z),tool:"",raw:null}}function ae(z){const oe=_e(z);if(s.value){g.value.push(oe);return}fe(oe)}function fe(z){t.value.push(z),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&At(()=>P())}function P(z=!1){const oe=d.value;oe&&oe.scrollTo({top:oe.scrollHeight,behavior:z?"smooth":"instant"})}function se(){n.value=!0,u.value=!1,At(()=>P(!0))}const ke=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function V(){const z=d.value;if(!z)return;const oe=z.scrollHeight-z.scrollTop-z.clientHeight<40;u.value=!n.value&&!oe&&t.value.length>0,me.value&&ce()}function ce(){const z=d.value;!z||!n.value||z.scrollHeight-z.scrollTop-z.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function de(){n.value&&requestAnimationFrame(ce)}function ve(z){ke.has(z.key)&&de()}const me=h(!1);function He(){n.value&&(me.value=!0,requestAnimationFrame(ce))}function k(){me.value&&(me.value=!1,ce())}function E(){n.value&&(u.value=!1,At(()=>P()))}function U(){if(s.value=!s.value,!s.value&&g.value.length>0){for(const z of g.value)fe(z);g.value=[]}}function X(){t.value=[],g.value=[],u.value=!1}function q(){let z;e.value==="search"?z=ze.value.map(ct=>{const $t=ct.error?"ERROR":"INFO",Wt=ct.tool_name?`[${ct.tool_name}] `:"";return`${ct.timestamp||""} ${$t} ${Wt}${ct.result_summary||ct.message||""}`}).join(`
`):z=xe.value.map(ct=>`${ct.ts} ${ct.level} ${ct.text}`).join(`
`);const oe=new Blob([z],{type:"text/plain"}),Ae=URL.createObjectURL(oe),Je=document.createElement("a");Je.href=Ae,Je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Je.click(),URL.revokeObjectURL(Ae)}function Q(z,oe){const Ae=`${z.ts} ${z.level} ${z.text||z.raw||""}`;navigator.clipboard.writeText(Ae).then(()=>{f.value=oe,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function ie(z){a.value=a.value===z?"":z,O.value="all"}function re(z){return z.level==="ERROR"?"log-line-error":z.level==="WARNING"?"log-line-warning":"text-gray-300"}function le(z){return z==="ERROR"?"text-red-500 font-semibold":z==="WARNING"?"text-yellow-500":"text-blue-500"}function te(z){return z==="ERROR"?"log-chip-error":z==="WARNING"?"log-chip-warning":"log-chip-info"}function be(z){O.value=z.id;const oe=z.filters;a.value=oe.level||"",x.value=oe.timeRange||"",i.value=oe.text||"",oe.levels&&(a.value=oe.levels[0]||""),oe.hasToolName&&(i.value="")}function ue(z){O.value=z.id,a.value=z.filters.level||"",x.value=z.filters.timeRange||"",i.value=z.filters.text||""}function he(){if(!S.value.trim())return;const z={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:x.value,text:i.value}};m.value=[...m.value,z],T(),_.value=!1,S.value=""}function we(z){m.value=m.value.filter(oe=>oe.id!==z),T(),O.value===z&&(O.value="all")}const Ee=h("all"),Le=h(""),Oe=h(""),Fe=h(""),Ve=h(""),lt=h(""),G=h(100),ye=Mk,Ce=h(!1),Re=h(!1),Be=h(""),ze=h([]),pt=h(null),ns=h(null);function As(){e.value="search",pt.value||Qs()}async function Qs(){try{pt.value=await K.get("/api/logs/stats")}catch{}}function $s(){const z=lt.value;if(!z){Fe.value="",Ve.value="";return}const Ae={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[z];if(Ae){const Je=new Date(Date.now()-Ae*1e3);Fe.value=Rs(Je),Ve.value=""}}function Rs(z){const oe=Ae=>String(Ae).padStart(2,"0");return`${z.getFullYear()}-${oe(z.getMonth()+1)}-${oe(z.getDate())}T${oe(z.getHours())}:${oe(z.getMinutes())}`}function Nt(z){if(!z)return"";const oe=new Date(z);return isNaN(oe.getTime())?"":oe.toISOString()}async function us(){Ce.value=!0,Be.value="",Re.value=!0,ns.value=null;try{const z=new URLSearchParams;Ee.value&&Ee.value!=="all"&&z.set("level",Ee.value),Le.value&&z.set("tool",Le.value),Oe.value&&z.set("q",Oe.value);const oe=Nt(Fe.value),Ae=Nt(Ve.value);oe&&z.set("start",oe),Ae&&z.set("end",Ae),z.set("limit",String(G.value));const Je=await K.get(`/api/logs/search?${z.toString()}`);ze.value=Je.entries||[]}catch(z){Be.value=z.message||"Search failed",ze.value=[]}finally{Ce.value=!1}}function Us(){Ee.value="all",Le.value="",Oe.value="",Fe.value="",Ve.value="",lt.value="",G.value=100,ze.value=[],Re.value=!1,Be.value="",ns.value=null}function Xs(z){ns.value=ns.value===z?null:z}function Hn(z){if(!z.timestamp)return"";try{return new Date(z.timestamp).toLocaleString()}catch{return z.timestamp}}function en(z){return z.type==="web_action"?`${z.status||""} (${z.execution_time_ms||0}ms)`:(z.result_summary||"").slice(0,200)}function Kt(z){return z.error?"log-line-error":"text-gray-300"}function ee(z){try{return JSON.stringify(z,null,2)}catch{return String(z)}}let Se=null,De=null,Bs=!1;function rt(){Bs||(Bs=!0,Ke.subscribe("logs",ae),r.value=Ke.connected,o.value=Ke.state||"disconnected",Se=Ke.onStateChange,De=(z,oe)=>{o.value=z,r.value=z==="connected",Se&&Se(z,oe)},Ke.onStateChange=De)}function Is(){Bs&&(Bs=!1,Ke.unsubscribe("logs",ae),Ke.onStateChange===De&&(Ke.onStateChange=Se),De=null,Se=null)}return We(()=>{w(),window.addEventListener("pointerup",k),window.addEventListener("pointercancel",k)}),Cs(rt),Es(Is),xt(()=>{Is(),window.removeEventListener("pointerup",k),window.removeEventListener("pointercancel",k)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:xe,pauseBuffer:g,showJumpBottom:u,copiedIndex:f,regexError:B,levels:b,logPresets:y,timeRanges:A,timeRange:x,activeLogPreset:O,customLogPresets:m,showSaveLogPreset:_,newLogPresetName:S,hasActiveLogFilters:C,timeRangeLabel:M,timelineBuckets:I,timelineMax:j,timelineSpanLabel:Y,timelineLabelSkip:H,togglePause:U,clearLogs:X,exportLogs:q,logLineClass:re,levelClass:le,levelChipClass:te,toggleLevel:ie,copyLine:Q,jumpToBottom:se,onScroll:V,onUserScrollIntent:de,onUserScrollKey:ve,onAutoScrollToggle:E,onPointerDown:He,applyLogPreset:be,applyCustomLogPreset:ue,saveLogCustomPreset:he,removeLogCustomPreset:we,segmentHeight:L,jumpToTimelineBucket:Z,searchLevel:Ee,searchTool:Le,searchKeyword:Oe,searchStart:Fe,searchEnd:Ve,searchTimePreset:lt,searchLimit:G,searchLimits:ye,searching:Ce,searchRan:Re,searchError:Be,searchResults:ze,searchStats:pt,expandedSearch:ns,switchToSearch:As,runSearch:us,clearSearchFilters:Us,toggleSearchExpand:Xs,formatSearchTs:Hn,searchEntryText:en,searchLogLineClass:Kt,formatJson:ee,applySearchTimePreset:$s}}};function xl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Fk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function $k(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Pa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Uk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},io=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),Bk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Mu(e){return Bk.some(t=>e===t||e.startsWith(`${t}.`))}const Sm="odin_config_center_expanded_v1",Tm="odin_config_center_category_v1",Hk=50,Vk=650,lo=()=>K.get("/api/config/meta");function Kn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function wi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function ba(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function jk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function zk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Cm(e,t){if(wi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Kn(t);const n={};for(const[a,i]of Object.entries(t)){const l=Cm(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function qk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Cm(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Em(e,t,s,n){if(wi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Em(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Gk(){try{const e=JSON.parse(localStorage.getItem(Sm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function Kk(){try{const e=localStorage.getItem(Tm);return Pa.some(t=>t.key===e)?e:Pa[0].key}catch{return Pa[0].key}}const Wk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),r=h(null),o=h(!1),c=h(!1),d=h(null),u=h(""),f=h("all"),p=h(Kk()),b=h(Gk()),y=h({}),A=h({}),O=h(""),x=h({}),m=h({}),_=h([]),S=h([]),g=h(!1),w=h(!1),T=h(!1);let C=null,M=null,B={path:null,at:0},$=0;const I=J(()=>{var v;return(((v=t.value)==null?void 0:v.fields)||[]).filter(D=>!io.has(D.path.split(".")[0])&&!Mu(D.path))}),j=J(()=>new Map(I.value.map(v=>[v.path,v]))),Y=J(()=>xe.value.reduce((v,D)=>v+D.sections.length,0)),H=J(()=>I.value.length),N=J(()=>Fk),L=J(()=>_.value.length>0),Z=J(()=>S.value.length>0),xe=J(()=>{if(!e.value)return[];const v=new Set(Pa.flatMap(ne=>ne.sections)),D=Pa.map(ne=>({...ne,sections:ne.sections.filter(Ne=>Object.hasOwn(e.value,Ne)&&!io.has(Ne))})).filter(ne=>ne.sections.length),F=Object.keys(e.value).filter(ne=>!v.has(ne)&&!io.has(ne));return F.length&&D.push({key:"other",label:"Other",icon:"folder",sections:F}),D}),_e=J(()=>e.value?{...e.value,...y.value}:null),ae=J(()=>{if(!e.value)return[];const v=[];for(const[D,F]of Object.entries(y.value))Em(e.value[D],F,D,v);return v.filter(D=>!wi(D.oldVal,D.newVal)).map(D=>{const F=E(D.path);return{...D,label:(F==null?void 0:F.label)||ba(D.path.split(".").at(-1)),apply_mode:(F==null?void 0:F.apply_mode)||ie(D.path.split(".")[0])}})}),fe=J(()=>ae.value.length>0),P=J(()=>ae.value.length),se=J(()=>new Set(ae.value.map(v=>v.path.split(".")[0])).size),ke=J(()=>!!u.value||f.value!=="all"),V=J(()=>{const v={...m.value};for(const D of ae.value){const F=E(D.path),ne=$t(F,D.newVal);ne&&(v[D.path]=ne)}return v}),ce=J(()=>Object.keys(V.value).length>0),de=J(()=>e.value?(ke.value?xe.value:xe.value.filter(D=>D.key===p.value)).map(D=>({...D,sections:D.sections.filter(F=>G(F))})).filter(D=>D.sections.length):[]),ve=J(()=>{const v=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],D=new Map(v.map(F=>[F,[]]));for(const F of ae.value){const ne=D.has(F.apply_mode)?F.apply_mode:"restart";D.get(ne).push(F)}return v.filter(F=>D.get(F).length).map(F=>({key:F,label:Cn(F),entries:D.get(F)}))}),me=J(()=>ae.value.filter(v=>v.apply_mode==="restart").length),He=J(()=>I.value.filter(v=>v.pending_restart)),k=J(()=>He.value.length);function E(v){const D=j.value.get(v);return D?{...D,apply_details:xl([D])}:null}function U(v){const D=`${v}.`;return I.value.filter(F=>F.path===v||F.path.startsWith(D))}function X(v){return U(v).length}function q(v){return ba(v)}function Q(v){const D=U(v);if(!D.length)return`${ba(v)} configuration.`;const F=D.find(Ue=>Ue.sensitivity==="public"&&Ue.description)||D.find(Ue=>Ue.description),ne=(F==null?void 0:F.description)||"";return ne.match(/setting for (.+)\.$/i)?`${ba(v)} settings and runtime behaviour.`:ne}function ie(v){const D=[...new Set(U(v).map(F=>F.apply_mode))];return D.length===1?D[0]:D.includes("restart")?"restart":D.includes("activation_required")?"activation_required":D[0]||"restart"}function re(v){const D=[...new Set(U(v).map(F=>Cn(F.apply_mode)))];return D.length?D.length===1?D[0]:`Mixed apply behaviour: ${D.join(" · ")}`:""}function le(v){return xl(U(v))}function te(v,D){return D.split(".").reduce((F,ne)=>F==null?void 0:F[ne],v)}function be(v){const D=_e.value;return U(v).filter(F=>Mu(F.path)?!1:F.path.split(".").length<=2?!0:!F.path.includes(".*")).map(F=>({...F,key:F.path.split(".").at(-1),value:te(D,F.path),apply_details:xl([F]),editor:F.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ue(v){const D=v.path.split(".");return D.length>2?D.slice(0,2).join("."):null}function he(v){const D=new Map;for(const F of be(v)){const ne=ue(F),Ne=ne||`${v}.__root`;D.has(Ne)||D.set(Ne,{key:Ne,path:ne,entries:[]}),D.get(Ne).entries.push(F)}return[...D.values()].map(F=>{const ne=F.entries.find(Ne=>Ne.group_description);return{...F,label:F.path?ba(F.path.split(".").at(-1)):null,description:(ne==null?void 0:ne.group_description)||null,apply_details:xl(F.entries),runtime_summaries:Ee(F.entries)}})}function we(v){return{save:v.save_effect||(v.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:v.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[v.apply_mode]||"Effective runtime state is not currently observable."}}function Ee(v){const D=new Map;for(const F of v){const ne=we(F),Ne=`${F.apply_mode}|${ne.save}|${ne.runtime}`;D.has(Ne)||D.set(Ne,{key:Ne,label:Cn(F.apply_mode),save:ne.save,runtime:ne.runtime})}return[...D.values()]}function Le(v){if(Oe(v))return v.runtime_effect||v.activation_policy||"";if(v.apply_mode==="activation_required"){const D=v.activation_policy||v.runtime_effect;return D?`Not active after saving. No activation control exists in this release. ${D}`:"Not active after saving; no activation control exists in this release."}return""}function Oe(v){return v.action_available===!0&&!!(v.action_label&&v.action_endpoint)}async function Fe(v){if(Oe(v))try{if(ze(v.path))throw new Error("Save this setting before applying its action.");const D=String(v.action_method||"POST").toLowerCase(),F={post:K.post.bind(K),put:K.put.bind(K),delete:K.del.bind(K)}[D];if(!F)throw new Error("Unsupported configuration action");await F(v.action_endpoint,v.action_body||void 0),await pe(),tn("success",`${v.action_label} completed.`)}catch(D){tn("error",D.message||`${v.action_label} failed`)}}function Ve(v,D){return[v.label,v.path,v.description,...v.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(D)}function lt(v){const D=u.value.trim().toLowerCase();return D?U(v).filter(F=>Ve(F,D)):[]}function G(v){const D=U(v);if(f.value!=="all"&&!D.some(ne=>ne.apply_state===f.value))return!1;const F=u.value.trim().toLowerCase();return!F||`${q(v)} ${v}`.toLowerCase().includes(F)?!0:D.some(ne=>Ve(ne,F))}function ye(v,D){return U(v).filter(F=>F.apply_state===D).length}function Ce(v){return v==="all"?H.value:I.value.filter(D=>D.apply_state===v).length}function Re(v){const D=v.sections.flatMap(F=>U(F));return{fields:D.length,modified:ae.value.filter(F=>v.sections.includes(F.path.split(".")[0])).length,pending_restart:D.filter(F=>F.apply_state==="pending_restart").length,invalid:D.filter(F=>F.apply_state==="invalid").length,dormant:D.filter(F=>F.apply_state==="dormant").length}}function Be(v){var D;return Object.hasOwn(y.value,v)&&!wi((D=e.value)==null?void 0:D[v],y.value[v])}function ze(v){return ae.value.some(D=>D.path===v||D.path.startsWith(`${v}.`))}function pt(v){p.value=v,u.value="",f.value="all";try{localStorage.setItem(Tm,v)}catch{}}function ns(v){f.value=v}function As(){u.value="",f.value="all"}function Qs(v){var D;return((D=xe.value.find(F=>F.sections.includes(v)))==null?void 0:D.sections)||[]}function $s(v){const D=Qs(v),F=D.find(ne=>b.value[ne]===!0);return F||D.find(ne=>b.value[ne]!==!1)||null}function Rs(v){return u.value&&!T.value&&G(v)?!0:T.value?$s(v)===v:Object.hasOwn(b.value,v)?b.value[v]===!0:!0}function Nt(v){const D=!Rs(v);if(T.value){const F={...b.value};for(const ne of Qs(v))F[ne]===!0&&(F[ne]=!1);F[v]=D,b.value=F;return}b.value={...b.value,[v]:D}}function us(){_.value.push(Kn(y.value)),_.value.length>Hk&&_.value.shift(),S.value=[]}function Us(){fe.value&&(us(),y.value={},m.value={},g.value=!1)}function Xs(v,D=!1){const F=Date.now();if(D&&B.path===v&&F-B.at<Vk){B.at=F;return}us(),B={path:v,at:F}}function Hn(v,D,F){if(!D.length)return F;const ne=Kn(v??{});let Ne=ne;for(let Ue=0;Ue<D.length-1;Ue+=1){const Xe=D[Ue];Ne[Xe]=Kn(Ne[Xe]??{}),Ne=Ne[Xe]}return Ne[D.at(-1)]=F,ne}function en(v){var D;return Object.hasOwn(y.value,v)?y.value[v]:Kn((D=e.value)==null?void 0:D[v])}function Kt(v,D,F={}){var vt;const[ne,...Ne]=v.path.split(".");Xs(v.path,!!F.coalesce);const Ue=en(ne),Xe=Ne.length?Hn(Ue,Ne,D):D,Ut={...y.value};if(wi(Xe,(vt=e.value)==null?void 0:vt[ne])?delete Ut[ne]:Ut[ne]=Xe,y.value=Ut,m.value[v.path]){const ei={...m.value};delete ei[v.path],m.value=ei}}function ee(v){B={path:null,at:0},A.value={...A.value,[v]:String(te(_e.value,v)??"")}}function Se(v){if(B={path:null,at:0},!Object.hasOwn(A.value,v))return;const D={...A.value};delete D[v],A.value=D}function De(v){const D=A.value[v.path];if(B={path:null,at:0},D===""){m.value={...m.value,[v.path]:"Enter a number."};return}const F=Number(D);if(Number.isNaN(F)||v.type==="integer"&&!Number.isInteger(F)){m.value={...m.value,[v.path]:v.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ne={...A.value};delete ne[v.path],A.value=ne,Kt(v,F,{coalesce:!0})}function Bs(v){return Object.hasOwn(A.value,v.path)?A.value[v.path]:v.value??""}function rt(v,D){if(A.value={...A.value,[v.path]:D},D===""){m.value={...m.value,[v.path]:"Enter a number."};return}const F=Number(D);if(!Number.isFinite(F)||v.type==="integer"&&!Number.isInteger(F)){m.value={...m.value,[v.path]:v.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(m.value[v.path]){const ne={...m.value};delete ne[v.path],m.value=ne}Kt(v,F,{coalesce:!0})}function Is(v){const D=Number.parseInt(O.value,10);if(!Number.isInteger(D)||D<1){m.value={...m.value,[v.path]:"Warning thresholds must be positive whole numbers."};return}const F=[...new Set([...v.value||[],D])].sort((ne,Ne)=>Ne-ne);O.value="",Kt(v,F)}function z(v,D){Kt(v,(v.value||[]).filter(F=>F!==D))}function oe(v){return v.apply_mode==="live_read"?"Odin reads the saved file value on next use.":v.apply_mode==="live_for_new_work"?"New work uses the saved file value.":v.apply_mode==="live_apply"?v.apply_handler?`Apply the saved value through ${v.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":v.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":v.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":v.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Ae(v){return v.type==="array"&&Array.isArray(v.value)&&!v.structured_container&&!v.structured_container_child&&v.sensitivity==="public"&&v.value.every(D=>["string","number","boolean"].includes(typeof D))}function Je(v){const D=String(x.value[v.path]??"").trim();if(!D)return;const F=[...new Set([...v.value||[],D])];x.value={...x.value,[v.path]:""},Kt(v,F)}function ct(v,D){Kt(v,(v.value||[]).filter(F=>F!==D))}function $t(v,D){var ne;if(!v)return null;if((ne=v.enum)!=null&&ne.length&&!v.enum.includes(D))return`Choose one of: ${v.enum.join(", ")}`;if(v.path==="agents.final_warning_iterations"&&(!Array.isArray(D)||!D.length))return"Add at least one warning threshold.";const F=v.constraints||{};if((v.type==="integer"||v.type==="number")&&typeof D=="number"){if(F.minimum!==void 0&&D<F.minimum)return`Must be at least ${F.minimum}${v.unit?` ${v.unit}`:""}`;if(F.maximum!==void 0&&D>F.maximum)return`Must be at most ${F.maximum}${v.unit?` ${v.unit}`:""}`}return null}function Wt(v){return V.value[v.path]||null}function tl(v){const D=`${v}.`;return Object.keys(V.value).some(F=>F===v||F.startsWith(D))}function Hs(){_.value.length&&(S.value.push(Kn(y.value)),y.value=_.value.pop(),m.value={},A.value={},B={path:null,at:0})}function sl(){S.value.length&&(_.value.push(Kn(y.value)),y.value=S.value.pop(),m.value={},A.value={},B={path:null,at:0})}function $r(){!fe.value||ce.value||(g.value=!0,w.value=!1)}function nl(){g.value=!1}function al(){Us()}function Cn(v){return Uk[v]||ba(v||"unknown")}function pa(v){return`apply-${String(v||"unknown").replaceAll("_","-")}`}function Os(v){return`cfgc-field-${v.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Vn(v){return`${Os(v)}-input`}function Ns(v){const D=document.getElementById(Os(v))||document.getElementById(Os(v.split(".").slice(0,2).join(".")));D==null||D.scrollIntoView({behavior:"smooth",block:"center"})}function tn(v,D){l.value={type:v,message:D},window.setTimeout(()=>{var F;((F=l.value)==null?void 0:F.message)===D&&(l.value=null)},3500)}function il(){o.value=!1,f.value="pending_restart",u.value="";const v=$k(n.value);v&&(v.scrollTop=0)}function Ur(){o.value=!1}function Qa(v=1800){M&&window.clearTimeout(M),M=window.setTimeout(ll,v)}async function ll(){if(c.value){if($+=1,$>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await lo(),k.value===0){c.value=!1,d.value=null,tn("success","Odin restarted and the saved startup settings are active.");return}}catch{}Qa(2e3)}}async function ha(){if(!c.value){d.value=null;try{await K.post("/api/restart",{}),c.value=!0,$=0,o.value=!1,Qa()}catch(v){d.value=v.message||"Odin could not schedule a restart."}}}async function Xa(){if(!(!fe.value||ce.value||a.value)){a.value=!0;try{const v=qk(e.value,y.value),D=await K.put("/api/config",v);e.value=D,y.value={},_.value=[],S.value=[],m.value={},g.value=!1;try{t.value=await lo(),r.value=null,o.value=k.value>0,tn("success",k.value?`Configuration saved. ${k.value} setting${k.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(F){r.value=F.message||"Unknown metadata error.",tn("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(v){tn("error",v.message||"Configuration could not be saved")}finally{a.value=!1}}}async function pe(){var v,D;if(!fe.value){s.value=!0,i.value=null;try{const F=await K.get("/api/config"),ne=await lo();e.value=F,t.value=ne,r.value=null;const Ne=xe.value;if(Ne.some(Ue=>Ue.key===p.value)||(p.value=((v=Ne[0])==null?void 0:v.key)||Pa[0].key),T.value){const Xe=(((D=Ne.find(Ut=>Ut.key===p.value))==null?void 0:D.sections)||[]).find(Ut=>b.value[Ut]===!0);b.value=Xe?{...b.value,[Xe]:!0}:{}}}catch(F){i.value=F.message||"Unknown configuration error"}finally{s.value=!1}}}function R(v){if(g.value||!(v.ctrlKey||v.metaKey))return;const D=v.target;D instanceof HTMLElement&&(D.matches("input, textarea, select")||D.isContentEditable)||(!v.shiftKey&&v.key.toLowerCase()==="z"?(v.preventDefault(),Hs()):(v.key.toLowerCase()==="y"||v.shiftKey&&v.key.toLowerCase()==="z")&&(v.preventDefault(),sl()))}function W(v){T.value=v.matches}return es(b,v=>{try{localStorage.setItem(Sm,JSON.stringify(v))}catch{}},{deep:!0}),We(()=>{var v;pe(),document.addEventListener("keydown",R),C=window.matchMedia("(max-width: 760px)"),W(C),(v=C.addEventListener)==null||v.call(C,"change",W)}),xt(()=>{var v;document.removeEventListener("keydown",R),(v=C==null?void 0:C.removeEventListener)==null||v.call(C,"change",W),M&&window.clearTimeout(M)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:f,activeCategory:p,reviewOpen:g,mobileOverflowOpen:w,warningThresholdInput:O,arrayInputs:x,healthFilters:N,visibleCategories:xe,displayGroups:de,reviewGroups:ve,sectionCount:Y,fieldCount:H,hasChanges:fe,changeCount:P,changedSectionCount:se,hasDraftErrors:ce,canUndo:L,canRedo:Z,globalFilterActive:ke,reviewRestartCount:me,pendingRestartCount:k,pendingRestartFields:He,healthCount:Ce,categoryStats:Re,selectCategory:pt,selectHealthFilter:ns,clearFilters:As,sectionLabel:q,sectionDescription:Q,sectionFieldCount:X,sectionHealthCount:ye,sectionApplySummary:re,sectionApplyDetails:le,sectionEntries:be,fieldGroups:he,sectionSearchHits:lt,fieldRuntimeCopy:we,fieldSpecificRuntimeNote:Le,hasHonestAction:Oe,runFieldAction:Fe,sectionChanged:Be,fieldChanged:ze,isSectionExpanded:Rs,toggleSection:Nt,discardAllDrafts:Us,setFieldValue:Kt,setNumberFieldValue:rt,numberInputValue:Bs,beginInputEdit:ee,endTextInputEdit:Se,endInputEdit:De,addWarningThreshold:Is,removeWarningThreshold:z,isScalarArray:Ae,addScalarArrayItem:Je,removeScalarArrayItem:ct,fieldError:Wt,sectionHasErrors:tl,undo:Hs,redo:sl,openReview:$r,closeReview:nl,mobileCancel:al,applyModeLabel:Cn,applyClass:pa,compactValue:jk,formatValue:zk,structuredApplyCopy:oe,fieldId:Os,fieldInputId:Vn,focusField:Ns,fetchConfig:pe,saveConfig:Xa,restartOdin:ha,restartLater:Ur,reviewPendingRestart:il}}},Zk=/^\d{15,25}$/;function Am(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Rm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=J(()=>new Set((e.excludedIds||[]).map(String))),r=J(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(g=>l.value.has(String(g.id))?!1:S?u(g).toLowerCase().includes(S)||String(g.username||"").toLowerCase().includes(S)||String(g.id).includes(S):!0)}),o=J(()=>{const S=s.value.trim();return r.value.length===0&&Zk.test(S)&&!l.value.has(S)?S:""}),c=J(()=>r.value.length+(o.value?1:0)),d=J(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return Am(S)}function f(){n.value=!0,a.value=0}function p(){f()}function b(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function y(){a.value=Math.max(a.value-1,0)}function A(){const S=r.value[a.value];S?O(S):o.value&&a.value===r.value.length&&x(o.value)}function O(S){x(String(S.id))}function x(S){t("select",S),s.value="",n.value=!1,a.value=0}function m(){n.value=!1}function _(){setTimeout(m,150)}return We(()=>{e.autofocus&&At(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:f,onInput:p,highlightNext:b,highlightPrevious:y,selectHighlighted:A,selectMember:O,selectId:x,closeOptions:m,onBlur:_}}};function Pu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const Jk={components:{DiscordUserCombobox:Rm},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),r=h(null),o=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),f=J(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),p=J(()=>new Map(c.value.map(I=>[String(I.id),I])));function b(I){return I.config&&I.config.enabled!==void 0?I.config.enabled:!0}function y(I){return Pu(I,"require_mention",a.value)}function A(I){return Pu(I,"respond_to_bots",a.value)}function O(I){return I.config&&Object.keys(I.config).length>0}function x(I){n.value[I]=!n.value[I]}function m(I){const j=I.discord||{};return{allowed_users:[...j.allowed_users||[]],channels:[...j.channels||[]],respond_to_bots:!!j.respond_to_bots,require_mention:!!j.require_mention,ignore_bot_ids:[...j.ignore_bot_ids||[]]}}async function _({showLoading:I=!0}={}){const j=++d;I&&(t.value=!0),s.value=null;try{const Y=await K.get("/api/discord/guilds");j===d&&(e.value=Y)}catch(Y){j===d&&(s.value=Y.message)}finally{I&&j===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[I,j,Y]=await Promise.all([K.get("/api/discord/guilds"),K.get("/api/discord/members").catch(()=>[]),K.get("/api/config")]),H=m(Y),N=f.value;a.value=H,N||(i.value=JSON.parse(JSON.stringify(H))),c.value=j,e.value=I,r.value=null}catch(I){s.value=I.message}finally{t.value=!1}}async function g(I,j,Y){try{await K.put("/api/discord/guild/"+I+"/config",{[j]:Y}),await _({showLoading:!1})}catch(H){s.value=H.message}}async function w(I,j,Y,H){try{await K.put("/api/discord/channel/"+I+"/config",{[Y]:H}),await _({showLoading:!1})}catch(N){s.value=N.message}}async function T(I,j){try{await K.put("/api/discord/channel/"+I+"/config",{clear:!0}),await _({showLoading:!1})}catch(Y){s.value=Y.message}}function C(I,j){const Y=String(j);if(!I.userAutocomplete)return Y;const H=p.value.get(Y);return H?Am(H):Y}function M(I,j=null){const Y=String(j??o.value[I]??"").trim();!Y||i.value[I].includes(Y)||(i.value[I]=[...i.value[I],Y],o.value={...o.value,[I]:""})}function B(I,j){i.value[I]=i.value[I].filter(Y=>Y!==j)}async function $(){if(!(!f.value||l.value)){l.value=!0,r.value=null;try{const j=(await K.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...j.allowed_users||[]],channels:[...j.channels||[]],respond_to_bots:!!j.respond_to_bots,require_mention:!!j.require_mention,ignore_bot_ids:[...j.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(I){r.value=I.message||"Global defaults could not be saved."}finally{l.value=!1}}}return We(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:f,guildEnabled:b,guildMention:y,guildBots:A,hasOverride:O,toggleGuild:x,fetchAll:S,fetchGuilds:_,setGuildConfig:g,setChannelConfig:w,clearOverride:T,globalItemLabel:C,addGlobalItem:M,removeGlobalItem:B,saveGlobalDefaults:$}}},fs=e=>e==null?e:JSON.parse(JSON.stringify(e));function Yk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const f=new Map;let p=null;const b=new Map;function y(g){d+=1;const w=c.then(g,g);return c=w.catch(()=>{}),w}function A(g,w){p=fs(g),b.clear();for(const[T,C]of Object.entries(w||{}))b.set(T,fs(C))}function O(g){const w=fs(g),T=++u;return y(async()=>{try{await e(fs(w)),p=fs(w),T===u&&n(fs(w))}catch(C){T===u&&(a(fs(p)),o(C,{kind:"default"}))}})}function x(g,w){const T=fs(w),C=(f.get(g)||0)+1;return f.set(g,C),y(async()=>{try{await t(g,fs(T)),b.set(g,fs(T)),C===f.get(g)&&i(g,fs(T))}catch(M){C===f.get(g)&&(l(g,fs(b.get(g)??null)),o(M,{kind:"user",uid:g}))}})}function m(g){const w=(f.get(g)||0)+1;return f.set(g,w),y(async()=>{try{await s(g),b.delete(g),w===f.get(g)&&r(g)}catch(T){w===f.get(g)&&(l(g,fs(b.get(g)??null)),o(T,{kind:"delete",uid:g}))}})}async function _(){for(;;){const g=c;if(await g,g===c)return d}}async function S(g){for(;;){const w=await _(),T=await g();if(w===d)return T}}return{seed:A,saveDefault:O,saveUser:x,deleteUser:m,whenIdle:_,readSnapshot:S,get revision(){return d}}}const Qk={components:{DiscordUserCombobox:Rm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h([]),o=J(()=>{const g={};for(const w of r.value)g[w.id]=w;return g});function c(g){return o.value[g]||null}function d(g,w){return g?g.allowed_hosts===null||g.allowed_hosts===void 0?{allowed_hosts:[...w],default_host:g.default_host||"",allow_all:!0}:{allowed_hosts:g.allowed_hosts,default_host:g.default_host||"",allow_all:!1}:{allowed_hosts:[...w],default_host:w[0]||"",allow_all:!0}}const u=Yk({applyDefault:async g=>{const w=g.allow_all?null:g.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:w,default_host:g.default_host})},applyUser:async(g,w)=>{const T=w.allow_all?null:w.allowed_hosts;await K.put(`/api/host-access/user/${g}`,{allowed_hosts:T,default_host:w.default_host})},applyDelete:g=>K.del(`/api/host-access/user/${g}`),onDefaultConfirmed:()=>Te.success("Default policy updated"),onDefaultRollback:g=>{g&&(a.value=g)},onUserConfirmed:g=>{const w=c(g);Te.success(`Updated access for ${w?w.display_name:g}`)},onUserRollback:(g,w)=>{const T={...i.value};w?T[g]=w:delete T[g],i.value=T},onUserDeleted:g=>{const w={...i.value};delete w[g],i.value=w},onError:(g,w)=>{var C;const T=w.uid?` ${((C=c(w.uid))==null?void 0:C.display_name)||w.uid}`:"";Te.error(`${g.message||"Failed to save"} — reverted${T}`)}});let f=0;async function p(){const g=++f;e.value=!0,t.value="";try{const w=await u.readSnapshot(()=>K.get("/api/host-access"));if(g!==f)return;s.value=w,n.value=w.available_hosts||[],a.value=d(w.default_policy,n.value);const T=w.users||{},C={};for(const[M,B]of Object.entries(T))C[M]=d(B,n.value);i.value=C,u.seed(a.value,C)}catch(w){g===f&&(t.value=w.message||"Failed to fetch host access data")}finally{g===f&&(e.value=!1)}try{const w=await K.get("/api/discord/members")||[];g===f&&(r.value=w)}catch{g===f&&(r.value=[])}}function b(){u.saveDefault(a.value)}function y(g,w){a.value.allow_all=!1,w?a.value.allowed_hosts.includes(g)||a.value.allowed_hosts.push(g):(a.value.allowed_hosts=a.value.allowed_hosts.filter(T=>T!==g),a.value.default_host===g&&(a.value.default_host=a.value.allowed_hosts[0]||"")),b()}function A(g){const w=i.value[g];w&&u.saveUser(g,w)}function O(g,w,T){const C=i.value[g];C&&(C.allow_all=!1,T?C.allowed_hosts.includes(w)||C.allowed_hosts.push(w):(C.allowed_hosts=C.allowed_hosts.filter(M=>M!==w),C.default_host===w&&(C.default_host=C.allowed_hosts[0]||"")),A(g))}function x(g,w){const T=i.value[g];T&&(T.default_host=w,A(g))}function m(){l.value=!0}function _(g){!/^\d{15,25}$/.test(g)||i.value[g]||(i.value[g]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(g),l.value=!1)}async function S(g){const w=c(g);await gs({title:"Remove user override",message:`Remove the host access override for ${w?w.display_name:g}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(g),i.value[g]||Te.success(`Removed override for ${w?w.display_name:g}`))}return We(p),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:p,saveDefaultPolicy:b,toggleDefaultHost:y,getMember:c,toggleUserHost:O,setUserDefault:x,openAddUser:m,addUserById:_,deleteUser:S}}},Xk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function p(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function b(){e.value=!0,t.value="";try{const T=await K.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function y(T){return!T||!T.trim()?[]:T.split(",").map(C=>C.trim()).filter(Boolean)}function A(T,C){const M=c.value.allowed_hosts;if(C&&!M.includes(T)&&M.push(T),!C){const B=M.indexOf(T);B>=0&&M.splice(B,1)}}function O(T,C){const M=d.value.allowed_hosts;if(C&&!M.includes(T)&&M.push(T),!C){const B=M.indexOf(T);B>=0&&M.splice(B,1)}}async function x(){var T;i.value=!0;try{const C=y(c.value.allowed_tools_str),M=c.value.host_mode,B=M==="none"?[]:M==="select"?c.value.allowed_hosts:null,$={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};B!==null&&($.allowed_hosts=B),$.default_host=c.value.default_host||"";const I=await K.post("/api/tokens",$);l.value=I.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Te.success("Token created"),await b()}catch(C){Te.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to create token")}finally{i.value=!1}}function m(T){r.value=T;const C=T.allowed_hosts;let M="default";C==null?M="default":Array.isArray(C)&&C.length===0?M="none":Array.isArray(C)&&(M="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:M,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function _(){var T;if(r.value){o.value=!0;try{const C=y(d.value.allowed_tools_str),M=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};M==="none"?B.allowed_hosts=[]:M==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(r.value.user_id),B),r.value=null,Te.success("Token updated"),await b()}catch(C){Te.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function S(T){var M;if(await gs({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await K.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=B.token,Te.success("Token regenerated")}catch(B){Te.error(((M=B.data)==null?void 0:M.error)||B.message||"Failed to regenerate")}}async function g(T){var M;if(await gs({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(T.user_id)),Te.success("Token deleted"),await b()}catch(B){Te.error(((M=B.data)==null?void 0:M.error)||B.message||"Failed to delete")}}async function w(){if(l.value)try{await navigator.clipboard.writeText(l.value),Te.success("Copied to clipboard")}catch{Te.error("Copy failed — select and copy manually")}}return We(b),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:f,fetchData:b,tierBadge:p,toggleCreateHost:A,toggleEditHost:O,createToken:x,startEdit:m,saveEdit:_,confirmRegenerate:S,confirmDelete:g,copyToken:w}}},ew=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),tw=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression"]),sw=Object.freeze(["enabled","base_url","model","max_tokens"]),nw=Object.freeze(["enabled","model","max_tokens"]);function Mr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Fu(e){return Mr(e,ew)}function $u(e){return Mr(e,tw)}function aw(e,{includeApiKey:t=!1}={}){const s=Mr(e,sw);return t&&(s.api_key=e.api_key),s}function iw(e){return{timeout:e.timeout}}function lw(e,{includeApiKey:t=!1}={}){const s=Mr(e,nw);return t&&(s.api_key=e.api_key),s}function rw(e){return{timeout:e.timeout}}function _l(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const ow={template:`
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
                <p>Transport and retry changes apply to the primary client now. An existing auxiliary client keeps the transport and retry settings captured when it was built until it is rebuilt. The primary client’s connection pool and context compression are saved for the next restart.</p>
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
                <label>Request timeout <small>seconds</small>
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
                <label>Request timeout <small>seconds</small>
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:"",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:75e4,keep_recent_iterations:30}}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=J(()=>{const ee=n.value.model;return ee&&!a.includes(ee)?[ee,...a]:a}),l=J(()=>{const ee=n.value.agent_model;return ee&&ee!=="auto"&&!a.includes(ee)?[ee,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=J(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=J(()=>{const ee=n.value.agent_model;return ee==="auto"?!0:!r.includes(ee||n.value.model)}),d=J(()=>{const ee=n.value.agent_reasoning_effort;return ee==="auto"?!1:(ee||n.value.reasoning_effort)==="max"}),u=ee=>r.includes(ee)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),f=ee=>r.includes(ee)&&d.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),b=h({unavailable_reason:null}),y=J(()=>{const ee=p.value.model;return ee&&!a.includes(ee)?[ee,...a]:a});function A(ee){const Se=ee.target.value;p.value.enabled=Se!=="",Se!==""&&(p.value.model=Se),Ce()}const O=h(!1),x=h({codex:!1,ollama:!1,kimi:!1}),m=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),_=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),S=h(!1),g=h(!1),w=h(!1),T=h(!1),C=h(!1),M=h(!1),B=h(!1),$=h({configured:!1}),I=h([]),j=h(""),Y=h(!1),H=h(!1),N=h({configured:!1}),L=h([]),Z=h(""),xe=h(!1),_e=h(!1),ae=h(!0),fe=h(""),P=h({configured:!1,accounts:[]}),se=h(null),ke=h(null),V=h(""),ce=h(null),de=h(!1),ve=h(null),me=h(null),He=h("");let k=null;function E(ee,Se="success"){Te(ee,Se==="error"?"error":"success")}function U(ee){if(!ee)return"?";const Se=ee/(1024*1024*1024);return Se>=1?Se.toFixed(1)+" GB":(ee/(1024*1024)).toFixed(0)+" MB"}async function X(){e.value=!0,await Promise.all([q(),Q(),ue(),ie()]),e.value=!1}async function q({preserveBasic:ee=!1,preserveAdvanced:Se=!1}={}){try{const De=await K.get("/api/llm/status");t.value=De,s.value=De.active_provider||"codex",De.codex&&!ye.pending()&&(ee||(n.value.enabled=De.codex.enabled,n.value.model=De.codex.model||"gpt-5.5",n.value.reasoning_effort=De.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=De.codex.agent_reasoning_effort||"",n.value.agent_model=De.codex.agent_model||""),Se||(n.value.request_timeout_seconds=De.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=De.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...De.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...De.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...De.codex.context_compression||{}})),De.ollama&&!Re.pending()&&(ee||(m.value.enabled=De.ollama.enabled,m.value.base_url=De.ollama.base_url||"",m.value.model=De.ollama.model||"",m.value.max_tokens=De.ollama.max_tokens||4096),Se||(m.value.timeout=De.ollama.timeout??m.value.timeout)),De.kimi&&!Be.pending()&&(ee||(_.value.enabled=De.kimi.enabled,_.value.model=De.kimi.model||"",_.value.max_tokens=De.kimi.max_tokens||4096),Se||(_.value.timeout=De.kimi.timeout??_.value.timeout)),De.auxiliary&&(b.value=De.auxiliary,Ce.pending()||(p.value.enabled=De.auxiliary.enabled,p.value.model=De.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Q(){try{if($.value=await K.get("/api/ollama/status"),$.value.model&&(j.value=$.value.model),$.value.configured)try{const ee=await K.get("/api/ollama/models");I.value=ee.models||[]}catch{I.value=[]}else if(m.value.base_url)try{const ee=await K.post("/api/ollama/probe-models",{base_url:m.value.base_url});I.value=ee.models||[]}catch{I.value=[]}}catch{$.value={configured:!1}}}async function ie(){ae.value=!0,fe.value="";try{P.value=await K.get("/api/codex/status")}catch(ee){fe.value=ee.message||"Failed to fetch Codex status"}finally{ae.value=!1}}async function re(){const ee=t.value?t.value.active_provider:"codex";B.value=!0;try{const Se=await K.post("/api/llm/switch",{provider:s.value});Se.error?(s.value=ee,E(Se.error,"error")):(E("Switched to "+s.value+" ("+Se.model+")"),await X())}catch(Se){s.value=ee,E(Se.message||"Switch failed","error")}finally{B.value=!1}}async function le(){Y.value=!0;try{const ee=await K.post("/api/ollama/reload");E(ee.configured?"Ollama reloaded":ee.reason||"Ollama not configured",ee.configured?"success":"error"),await X()}catch(ee){E(ee.message||"Reload failed","error")}finally{Y.value=!1}}async function te(){H.value=!0;try{await K.post("/api/ollama/model",{model:j.value}),E("Model set to "+j.value),await X()}catch(ee){E(ee.message||"Failed","error")}finally{H.value=!1}}async function be(){const ee=m.value.base_url;if(!ee){E("Enter a base URL first","error");return}M.value=!0;try{const Se=await K.post("/api/ollama/probe-models",{base_url:ee});I.value=Se.models||[],I.value.length?(E(I.value.length+" model(s) found"),!m.value.model&&I.value.length&&(m.value.model=I.value[0].name)):E("No models found at "+ee,"error")}catch(Se){E(Se.message||"Could not reach Ollama","error")}finally{M.value=!1}}async function ue(){try{if(N.value=await K.get("/api/kimi/status"),N.value.model&&(Z.value=N.value.model),N.value.configured)try{const ee=await K.get("/api/kimi/models");L.value=ee.models||[]}catch{L.value=[]}}catch{N.value={configured:!1}}}async function he(){xe.value=!0;try{const ee=await K.post("/api/kimi/reload");E(ee.configured?"Kimi reloaded":ee.reason||"Kimi not configured",ee.configured?"success":"error"),await X()}catch(ee){E(ee.message||"Reload failed","error")}finally{xe.value=!1}}async function we(){_e.value=!0;try{await K.post("/api/kimi/model",{model:Z.value}),E("Model set to "+Z.value),await X()}catch(ee){E(ee.message||"Failed","error")}finally{_e.value=!1}}async function Ee(){if(w.value){ye();return}w.value=!0;const ee=Fu(n.value);try{await K.put("/api/llm/codex/config",ee),E("Codex config saved"),await Promise.all([q({preserveBasic:!0,preserveAdvanced:!0}),ie()])}catch(Se){E(Se.message||"Failed","error");const De=JSON.stringify(Fu(n.value))!==JSON.stringify(ee);await Promise.all([q({preserveBasic:De,preserveAdvanced:!0}),ie()])}finally{w.value=!1}}async function Le(){if(w.value)return;w.value=!0;const ee=$u(n.value);try{await K.put("/api/llm/codex/config",ee),E("Codex advanced settings saved"),await Promise.all([q({preserveBasic:!0,preserveAdvanced:!0}),ie()])}catch(Se){E(Se.message||"Failed","error");const De=JSON.stringify($u(n.value))!==JSON.stringify(ee);await Promise.all([q({preserveBasic:!0,preserveAdvanced:De}),ie()])}finally{w.value=!1}}async function Oe(){if(T.value){Re();return}T.value=!0;try{const ee=S.value?m.value.api_key:null,Se=aw(m.value,{includeApiKey:ee!==null});await K.put("/api/llm/ollama/config",Se),E("Ollama config saved"),ee!==null&&m.value.api_key===ee&&(m.value.api_key="",S.value=!1),await Promise.all([q({preserveBasic:!0,preserveAdvanced:!0}),Q()])}catch(ee){E(ee.message||"Failed","error")}finally{T.value=!1}}async function Fe(){if(!T.value){T.value=!0;try{await K.put("/api/llm/ollama/config",iw(m.value)),E("Ollama timeout saved"),await Promise.all([q({preserveBasic:!0,preserveAdvanced:!0}),Q()])}catch(ee){E(ee.message||"Failed","error")}finally{T.value=!1}}}async function Ve(){if(C.value){Be();return}C.value=!0;try{const ee=g.value?_.value.api_key:null,Se=lw(_.value,{includeApiKey:ee!==null});await K.put("/api/llm/kimi/config",Se),E("Kimi config saved"),ee!==null&&_.value.api_key===ee&&(_.value.api_key="",g.value=!1),await Promise.all([q({preserveBasic:!0,preserveAdvanced:!0}),ue()])}catch(ee){E(ee.message||"Failed","error")}finally{C.value=!1}}async function lt(){if(!C.value){C.value=!0;try{await K.put("/api/llm/kimi/config",rw(_.value)),E("Kimi timeout saved"),await Promise.all([q({preserveBasic:!0,preserveAdvanced:!0}),ue()])}catch(ee){E(ee.message||"Failed","error")}finally{C.value=!1}}}async function G(){if(O.value){Ce();return}O.value=!0;try{await K.put("/api/llm/auxiliary/config",p.value),E("Auxiliary config saved"),await q()}catch(ee){E(ee.message||"Failed","error"),await q()}finally{O.value=!1}}const ye=_l(Ee),Ce=_l(G),Re=_l(Oe),Be=_l(Ve),ze=()=>(ye.cancel(),Ee()),pt=()=>(Re.cancel(),Oe()),ns=()=>(Be.cancel(),Ve()),As=()=>Le(),Qs=()=>Fe(),$s=()=>lt();async function Rs(ee){try{await K.post("/api/codex/account/"+ee+"/activate"),E("Active account switched"),await ie()}catch(Se){E(Se.message||"Failed","error")}}async function Nt(ee){se.value=ee;try{await K.post("/api/codex/account/"+ee+"/refresh"),E("Token refreshed"),await ie()}catch(Se){E(Se.message||"Refresh failed","error")}finally{se.value=null}}function us(ee,Se){ke.value=ee,V.value=Se||""}async function Us(ee){try{await K.put("/api/codex/account/"+ee+"/label",{label:V.value}),E("Label updated"),ke.value=null,await ie()}catch(Se){E(Se.message||"Failed","error")}}async function Xs(ee,Se){if(await gs({title:"Delete Codex account",message:`Delete ${Se||"account #"+(ee+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+ee),E("Deleted. Pool reloaded."),await ie()}catch(Bs){E(Bs.message||"Failed","error")}}async function Hn(){de.value=!0;try{const ee=await K.post("/api/codex/device-code");ve.value=ee,ce.value="pending",en(ee)}catch(ee){E(ee.message||"Failed","error")}finally{de.value=!1}}async function en(ee){k={cancelled:!1};const Se=k;try{const De=await K.post("/api/codex/device-poll",{device_auth_id:ee.device_auth_id,user_code:ee.user_code,interval:ee.interval});if(Se.cancelled)return;me.value=De,ce.value="success",await X()}catch(De){if(Se.cancelled)return;He.value=De.message||"Device login failed",ce.value="error"}}function Kt(){k&&(k.cancelled=!0),ce.value=null,ve.value=null}return We(X),xt(()=>{k&&(k.cancelled=!0),ye.cancel(),Ce.cancel(),Re.cancel(),Be.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:B,advancedOpen:x,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:f,auxForm:p,auxData:b,auxModelOptions:y,onAuxModelChange:A,savingAux:O,saveAuxConfigDebounced:Ce,ollamaForm:m,kimiForm:_,savingCodex:w,savingOllama:T,savingKimi:C,probingOllama:M,ollamaKeyDirty:S,kimiKeyDirty:g,ollamaStatus:$,ollamaModels:I,ollamaSelectedModel:j,reloading:Y,settingModel:H,kimiStatus:N,kimiModels:L,kimiSelectedModel:Z,reloadingKimi:xe,settingKimiModel:_e,codexLoading:ae,codexError:fe,codexData:P,refreshing:se,editingLabel:ke,labelValue:V,deviceState:ce,deviceLoading:de,deviceInfo:ve,deviceResult:me,deviceError:He,fetchAll:X,switchProvider:re,reloadOllama:le,setOllamaModel:te,reloadKimi:he,setKimiModel:we,probeOllamaModels:be,saveCodexConfig:Ee,saveOllamaConfig:Oe,saveKimiConfig:Ve,saveCodexAdvancedConfig:Le,saveOllamaAdvancedConfig:Fe,saveKimiAdvancedConfig:lt,saveCodexConfigDebounced:ye,saveOllamaConfigDebounced:Re,saveKimiConfigDebounced:Be,saveCodexConfigNow:ze,saveOllamaConfigNow:pt,saveKimiConfigNow:ns,saveCodexAdvancedConfigNow:As,saveOllamaAdvancedConfigNow:Qs,saveKimiAdvancedConfigNow:$s,activateAccount:Rs,refreshAccount:Nt,startEditLabel:us,saveLabel:Us,deleteAccount:Xs,startDeviceLogin:Hn,cancelDeviceLogin:Kt,formatSize:U}}},Uu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function cw(e){return Uu[e]||Uu[(e||"").toLowerCase()]||"text-gray-400"}const dw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=J(()=>{var g;return Object.values(((g=i.value)==null?void 0:g.totals)||{}).reduce((w,T)=>w+Number(T||0),0)}),u=h(""),f=h(0),p=h([]),b=J(()=>p.value.map(g=>`${g.label} (${g.path}${g.reason?`: ${g.reason}`:""})`).join("; ")),y=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let A=null;async function O(){var M;const g=await Promise.allSettled(y.map(B=>K.get(B.path))),w=B=>g[B].status==="fulfilled"?g[B].value:null;t.value=w(0)||{};const T=w(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=w(2)||{},a.value=w(3)||{},i.value=w(4),l.value=w(5),r.value=w(6),o.value=w(7),c.value=w(8);const C=g.filter(B=>B.status==="rejected");if(p.value=g.flatMap((B,$)=>{var I;return B.status==="rejected"?[{...y[$],reason:((I=B.reason)==null?void 0:I.message)||"request failed"}]:[]}),f.value=p.value.length,C.length===g.length){const B=(M=C[0])==null?void 0:M.reason;u.value=(B==null?void 0:B.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",O()}let m=!1;function _(){m||(m=!0,O(),A||(A=setInterval(O,3e4)))}function S(){m&&(m=!1,A&&(clearInterval(A),A=null))}return We(_),Cs(_),Es(S),xt(S),{loading:e,error:u,failedCount:f,failedEndpoints:p,failedEndpointSummary:b,endpoints:y,retry:x,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:cw,formatAgeSeconds:X_}}},uw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await K.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await gs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return We(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Im=[{id:"health",label:"Health",component:Ok},{id:"resources",label:"Resources",component:Nk},{id:"logs",label:"Logs",component:Pk},{id:"config",label:"Config",component:Wk},{id:"discord",label:"Discord",component:Jk},{id:"host-access",label:"Host Access",component:Qk},{id:"api-tokens",label:"API Tokens",component:Xk},{id:"llm",label:"LLM Config",component:ow},{id:"internals",label:"Internals",component:dw},{id:"update",label:"Update",component:uw}],fw={components:{TabbedPage:Dr},setup(){return{tabs:Im}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},kl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),pw=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...kl("Operations","operations","/operations",_m),...kl("History","history","/history",km),...kl("Capabilities","capabilities","/capabilities",wm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...kl("System","system","/system",Im)],ls=Un({open:!1,query:"",selected:0});function Bu(){ls.query="",ls.selected=0,ls.open=!0}function ro(){ls.open=!1}function hw(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const mw={setup(){const e=pm(),t=h(null),s=J(()=>{const i=ls.query.trim().toLowerCase();return pw.map(l=>({...l,_score:hw(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});es(()=>ls.open,async i=>{var l;i&&(await At(),(l=t.value)==null||l.focus())}),es(()=>ls.query,()=>{ls.selected=0});function n(i){ro(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),ro();return}if(i.key==="ArrowDown")i.preventDefault(),ls.selected=Math.min(ls.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ls.selected=Math.max(ls.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ls.selected];l&&n(l)}}return{state:ls,results:s,inputEl:t,go:n,onKeydown:a,closePalette:ro}},template:`
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
  `},zo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(zo));const gw={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ua("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ua("path",{d:zo[e.name]||zo.info})])}},vw=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Hu(e){return[...e.querySelectorAll(vw)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const bw={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Hu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Hu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},yw={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const f=J(()=>{const I=e.value.uptime_seconds||0,j=Math.floor(I/86400),Y=Math.floor(I%86400/3600),H=Math.floor(I%3600/60),N=[];return j>0&&N.push(`${j}d`),Y>0&&N.push(`${Y}h`),(N.length===0||j===0&&Y===0)&&N.push(`${H}m`),N.join(" ")}),p=J(()=>{const I=e.value.uptime_seconds||0;return 125.66*(1-Math.min(I/86400,1))}),b=J(()=>{const I=e.value;return[{label:"Guilds",value:I.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:I.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:I.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${I.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:I.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:I.loop_count>0?"text-green-400":"",highlight:I.loop_count>0},{label:"Agents",value:I.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:I.agent_count>0?`${I.agent_count} total`:"",subColor:"text-gray-500",highlight:(I.agent_running??0)>0},{label:"Processes",value:I.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:I.process_count>0?`${I.process_count} total`:"",subColor:"text-gray-500",highlight:(I.process_running??0)>0},{label:"Schedules",value:I.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(I.schedule_failing>0?`${I.schedule_failing} failing`:"")+(I.schedule_failing>0&&I.schedule_paused>0?", ":"")+(I.schedule_paused>0?`${I.schedule_paused} paused`:"")||void 0,subColor:I.schedule_failing>0?"text-red-400":"text-yellow-400",color:I.schedule_failing>0?"text-red-400":"",highlight:I.schedule_failing>0},{label:"Users",value:I.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),y=J(()=>{const I=e.value,j=[];return j.push({label:"Bot",status:I.status==="online"?"ok":"warn",detail:I.status==="online"?"Online":"Starting"}),(I.schedule_failing||0)>0?j.push({label:"Schedules",status:"error",detail:`${I.schedule_failing} failing`}):(I.schedule_count||0)>0&&j.push({label:"Schedules",status:"ok",detail:`${I.schedule_count} configured`}),(I.loop_count||0)>0&&j.push({label:"Loops",status:"ok",detail:`${I.loop_count} active`}),(I.agent_running||0)>0&&j.push({label:"Agents",status:"ok",detail:`${I.agent_running} running`}),(I.process_running||0)>0&&j.push({label:"Processes",status:"ok",detail:`${I.process_running} running`}),j});async function A(){try{e.value=await K.get("/api/status"),s.value=null}catch(I){s.value=I.message}finally{t.value=!1}}async function O(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function x(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const I=await K.get("/api/knowledge");c.value=(Array.isArray(I)?I:[]).reduce((j,Y)=>j+(Y.chunks||0),0)}catch{c.value=null}}async function _(){try{const I=await K.get("/api/agents");r.value=I.filter(j=>j.status==="running")}catch{}}async function S(){d.value={...d.value,reload:!0};try{await K.post("/api/reload"),Te.success("Config reloaded")}catch(I){Te.error(I.message)}d.value={...d.value,reload:!1}}async function g(){if(!await gs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const j=e.value.session_count;e.value={...e.value,session_count:0};try{const Y=await K.post("/api/sessions/clear-all");Te.success(`Cleared ${Y.count} session${Y.count!==1?"s":""}`),await A()}catch(Y){e.value={...e.value,session_count:j},Te.error(Y.message)}d.value={...d.value,clearSessions:!1}}async function w(){if(!await gs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const j=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Y=await K.post("/api/loops/stop-all");Te.success(Y.result),await A()}catch(Y){e.value={...e.value,loop_count:j},Te.error(Y.message)}d.value={...d.value,stopLoops:!1}}function T(){t.value=!0,s.value=null,A(),O(),x(),_()}let C=null,M=null,B=null;function $(I){if(I.payload&&I.payload.tool_name){const j={...I.payload,_isNew:!0,_key:++u};n.value.unshift(j),n.value.length>10&&n.value.pop(),o.value++,j.error&&(i.value.unshift(j),i.value.length>5&&i.value.pop()),setTimeout(()=>{j._isNew=!1},1500),clearTimeout(B),B=setTimeout(()=>{o.value=0},1e4)}}return We(async()=>{await Promise.all([A(),O(),x(),_(),m()]),C=setInterval(A,15e3),M=setInterval(_,1e4),Ke.subscribe("events",$)}),xt(()=>{C&&clearInterval(C),M&&clearInterval(M),clearTimeout(B),Ke.unsubscribe("events",$)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:b,healthIndicators:y,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:O,fetchStatus:A,formatTime:hm,formatDuration:Wa,retry:T,reloadConfig:S,clearSessions:g,stopAllLoops:w}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Vu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function xw(e){if(Array.isArray(e))return e}function _w(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function kw(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ww(e,t){return xw(e)||_w(e,t)||Sw(e,t)||kw()}function Sw(e,t){if(e){if(typeof e=="string")return Vu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Vu(e,t):void 0}}const Om=Object.entries,ju=Object.setPrototypeOf,Tw=Object.isFrozen,Cw=Object.getPrototypeOf,Ew=Object.getOwnPropertyDescriptor;let ss=Object.freeze,Ts=Object.seal,Sa=Object.create,Nm=typeof Reflect<"u"&&Reflect,qo=Nm.apply,Go=Nm.construct;ss||(ss=function(t){return t});Ts||(Ts=function(t){return t});qo||(qo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Go||(Go=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const ln=Tt(Array.prototype.forEach),Aw=Tt(Array.prototype.lastIndexOf),zu=Tt(Array.prototype.pop),ya=Tt(Array.prototype.push),Rw=Tt(Array.prototype.splice),Jt=Array.isArray,hi=Tt(String.prototype.toLowerCase),oo=Tt(String.prototype.toString),qu=Tt(String.prototype.match),xa=Tt(String.prototype.replace),Gu=Tt(String.prototype.indexOf),Iw=Tt(String.prototype.trim),Ow=Tt(Number.prototype.toString),Nw=Tt(Boolean.prototype.toString),Ku=typeof BigInt>"u"?null:Tt(BigInt.prototype.toString),Wu=typeof Symbol>"u"?null:Tt(Symbol.prototype.toString),ht=Tt(Object.prototype.hasOwnProperty),ri=Tt(Object.prototype.toString),Lt=Tt(RegExp.prototype.test),qn=Lw(TypeError);function Tt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return qo(e,t,n)}}function Lw(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Go(e,s)}}function $e(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:hi;if(ju&&ju(e,null),!Jt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(Tw(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Dw(e){for(let t=0;t<e.length;t++)ht(e,t)||(e[t]=null);return e}function Ht(e){const t=Sa(null);for(const n of Om(e)){var s=ww(n,2);const a=s[0],i=s[1];ht(e,a)&&(Jt(i)?t[a]=Dw(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Ht(i):t[a]=i)}return t}function Mw(e){switch(typeof e){case"string":return e;case"number":return Ow(e);case"boolean":return Nw(e);case"bigint":return Ku?Ku(e):"0";case"symbol":return Wu?Wu(e):"Symbol()";case"undefined":return ri(e);case"function":case"object":{if(e===null)return ri(e);const t=e,s=zs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:ri(n)}return ri(e)}default:return ri(e)}}function zs(e,t){for(;e!==null;){const n=Ew(e,t);if(n){if(n.get)return Tt(n.get);if(typeof n.value=="function")return Tt(n.value)}e=Cw(e)}function s(){return null}return s}function Pw(e){try{return Lt(e,""),!0}catch{return!1}}const Zu=ss(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),co=ss(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),uo=ss(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),Fw=ss(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),fo=ss(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),$w=ss(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Ju=ss(["#text"]),Yu=ss(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),po=ss(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Qu=ss(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),wl=ss(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Uw=Ts(/{{[\w\W]*|^[\w\W]*}}/g),Bw=Ts(/<%[\w\W]*|^[\w\W]*%>/g),Hw=Ts(/\${[\w\W]*/g),Vw=Ts(/^data-[\-\w.\u00B7-\uFFFF]+$/),jw=Ts(/^aria-[\-\w]+$/),Xu=Ts(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),zw=Ts(/^(?:\w+script|data):/i),qw=Ts(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),Gw=Ts(/^html$/i),Kw=Ts(/^[a-z][.\w]*(-[.\w]+)+$/i),Vs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Ww=function(){return typeof window>"u"?null:window},Zw=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},ef=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Lm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Ww();const t=pe=>Lm(pe);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Vs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,f=r.prototype,p=zs(f,"cloneNode"),b=zs(f,"remove"),y=zs(f,"nextSibling"),A=zs(f,"childNodes"),O=zs(f,"parentNode"),x=zs(f,"shadowRoot"),m=zs(f,"attributes"),_=l&&l.prototype?zs(l.prototype,"nodeType"):null,S=l&&l.prototype?zs(l.prototype,"nodeName"):null;if(typeof i=="function"){const pe=s.createElement("template");pe.content&&pe.content.ownerDocument&&(s=pe.content.ownerDocument)}let g,w="",T,C=!1,M=0;const B=function(){if(M>0)throw qn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},$=function(R){B(),M++;try{return g.createHTML(R)}finally{M--}},I=function(R){B(),M++;try{return g.createScriptURL(R)}finally{M--}},j=function(){return C||(T=Zw(u,a),C=!0),T},Y=s,H=Y.implementation,N=Y.createNodeIterator,L=Y.createDocumentFragment,Z=Y.getElementsByTagName,xe=n.importNode;let _e=ef();t.isSupported=typeof Om=="function"&&typeof O=="function"&&H&&H.createHTMLDocument!==void 0;const ae=Uw,fe=Bw,P=Hw,se=Vw,ke=jw,V=zw,ce=qw,de=Kw;let ve=Xu,me=null;const He=$e({},[...Zu,...co,...uo,...fo,...Ju]);let k=null;const E=$e({},[...Yu,...po,...Qu,...wl]);let U=Object.seal(Sa(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),X=null,q=null;const Q=Object.seal(Sa(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ie=!0,re=!0,le=!1,te=!0,be=!1,ue=!0,he=!1,we=!1,Ee=!1,Le=!1,Oe=!1,Fe=!1,Ve=!0,lt=!1;const G="user-content-";let ye=!0,Ce=!1,Re={},Be=null;const ze=$e({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let pt=null;const ns=$e({},["audio","video","img","source","image","track"]);let As=null;const Qs=$e({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),$s="http://www.w3.org/1998/Math/MathML",Rs="http://www.w3.org/2000/svg",Nt="http://www.w3.org/1999/xhtml";let us=Nt,Us=!1,Xs=null;const Hn=$e({},[$s,Rs,Nt],oo);let en=$e({},["mi","mo","mn","ms","mtext"]),Kt=$e({},["annotation-xml"]);const ee=$e({},["title","style","font","a","script"]);let Se=null;const De=["application/xhtml+xml","text/html"],Bs="text/html";let rt=null,Is=null;const z=s.createElement("form"),oe=function(R){return R instanceof RegExp||R instanceof Function},Ae=function(){let R=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Is&&Is===R)return;(!R||typeof R!="object")&&(R={}),R=Ht(R),Se=De.indexOf(R.PARSER_MEDIA_TYPE)===-1?Bs:R.PARSER_MEDIA_TYPE,rt=Se==="application/xhtml+xml"?oo:hi,me=ht(R,"ALLOWED_TAGS")&&Jt(R.ALLOWED_TAGS)?$e({},R.ALLOWED_TAGS,rt):He,k=ht(R,"ALLOWED_ATTR")&&Jt(R.ALLOWED_ATTR)?$e({},R.ALLOWED_ATTR,rt):E,Xs=ht(R,"ALLOWED_NAMESPACES")&&Jt(R.ALLOWED_NAMESPACES)?$e({},R.ALLOWED_NAMESPACES,oo):Hn,As=ht(R,"ADD_URI_SAFE_ATTR")&&Jt(R.ADD_URI_SAFE_ATTR)?$e(Ht(Qs),R.ADD_URI_SAFE_ATTR,rt):Qs,pt=ht(R,"ADD_DATA_URI_TAGS")&&Jt(R.ADD_DATA_URI_TAGS)?$e(Ht(ns),R.ADD_DATA_URI_TAGS,rt):ns,Be=ht(R,"FORBID_CONTENTS")&&Jt(R.FORBID_CONTENTS)?$e({},R.FORBID_CONTENTS,rt):ze,X=ht(R,"FORBID_TAGS")&&Jt(R.FORBID_TAGS)?$e({},R.FORBID_TAGS,rt):Ht({}),q=ht(R,"FORBID_ATTR")&&Jt(R.FORBID_ATTR)?$e({},R.FORBID_ATTR,rt):Ht({}),Re=ht(R,"USE_PROFILES")?R.USE_PROFILES&&typeof R.USE_PROFILES=="object"?Ht(R.USE_PROFILES):R.USE_PROFILES:!1,ie=R.ALLOW_ARIA_ATTR!==!1,re=R.ALLOW_DATA_ATTR!==!1,le=R.ALLOW_UNKNOWN_PROTOCOLS||!1,te=R.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=R.SAFE_FOR_TEMPLATES||!1,ue=R.SAFE_FOR_XML!==!1,he=R.WHOLE_DOCUMENT||!1,Le=R.RETURN_DOM||!1,Oe=R.RETURN_DOM_FRAGMENT||!1,Fe=R.RETURN_TRUSTED_TYPE||!1,Ee=R.FORCE_BODY||!1,Ve=R.SANITIZE_DOM!==!1,lt=R.SANITIZE_NAMED_PROPS||!1,ye=R.KEEP_CONTENT!==!1,Ce=R.IN_PLACE||!1,ve=Pw(R.ALLOWED_URI_REGEXP)?R.ALLOWED_URI_REGEXP:Xu,us=typeof R.NAMESPACE=="string"?R.NAMESPACE:Nt,en=ht(R,"MATHML_TEXT_INTEGRATION_POINTS")&&R.MATHML_TEXT_INTEGRATION_POINTS&&typeof R.MATHML_TEXT_INTEGRATION_POINTS=="object"?Ht(R.MATHML_TEXT_INTEGRATION_POINTS):$e({},["mi","mo","mn","ms","mtext"]),Kt=ht(R,"HTML_INTEGRATION_POINTS")&&R.HTML_INTEGRATION_POINTS&&typeof R.HTML_INTEGRATION_POINTS=="object"?Ht(R.HTML_INTEGRATION_POINTS):$e({},["annotation-xml"]);const W=ht(R,"CUSTOM_ELEMENT_HANDLING")&&R.CUSTOM_ELEMENT_HANDLING&&typeof R.CUSTOM_ELEMENT_HANDLING=="object"?Ht(R.CUSTOM_ELEMENT_HANDLING):Sa(null);if(U=Sa(null),ht(W,"tagNameCheck")&&oe(W.tagNameCheck)&&(U.tagNameCheck=W.tagNameCheck),ht(W,"attributeNameCheck")&&oe(W.attributeNameCheck)&&(U.attributeNameCheck=W.attributeNameCheck),ht(W,"allowCustomizedBuiltInElements")&&typeof W.allowCustomizedBuiltInElements=="boolean"&&(U.allowCustomizedBuiltInElements=W.allowCustomizedBuiltInElements),be&&(re=!1),Oe&&(Le=!0),Re&&(me=$e({},Ju),k=Sa(null),Re.html===!0&&($e(me,Zu),$e(k,Yu)),Re.svg===!0&&($e(me,co),$e(k,po),$e(k,wl)),Re.svgFilters===!0&&($e(me,uo),$e(k,po),$e(k,wl)),Re.mathMl===!0&&($e(me,fo),$e(k,Qu),$e(k,wl))),Q.tagCheck=null,Q.attributeCheck=null,ht(R,"ADD_TAGS")&&(typeof R.ADD_TAGS=="function"?Q.tagCheck=R.ADD_TAGS:Jt(R.ADD_TAGS)&&(me===He&&(me=Ht(me)),$e(me,R.ADD_TAGS,rt))),ht(R,"ADD_ATTR")&&(typeof R.ADD_ATTR=="function"?Q.attributeCheck=R.ADD_ATTR:Jt(R.ADD_ATTR)&&(k===E&&(k=Ht(k)),$e(k,R.ADD_ATTR,rt))),ht(R,"ADD_URI_SAFE_ATTR")&&Jt(R.ADD_URI_SAFE_ATTR)&&$e(As,R.ADD_URI_SAFE_ATTR,rt),ht(R,"FORBID_CONTENTS")&&Jt(R.FORBID_CONTENTS)&&(Be===ze&&(Be=Ht(Be)),$e(Be,R.FORBID_CONTENTS,rt)),ht(R,"ADD_FORBID_CONTENTS")&&Jt(R.ADD_FORBID_CONTENTS)&&(Be===ze&&(Be=Ht(Be)),$e(Be,R.ADD_FORBID_CONTENTS,rt)),ye&&(me["#text"]=!0),he&&$e(me,["html","head","body"]),me.table&&($e(me,["tbody"]),delete X.tbody),R.TRUSTED_TYPES_POLICY){if(typeof R.TRUSTED_TYPES_POLICY.createHTML!="function")throw qn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof R.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw qn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const v=g;g=R.TRUSTED_TYPES_POLICY;try{w=$("")}catch(D){throw g=v,D}}else R.TRUSTED_TYPES_POLICY===null?(g=void 0,w=""):(g===void 0&&(g=j()),g&&typeof w=="string"&&(w=$("")));(_e.uponSanitizeElement.length>0||_e.uponSanitizeAttribute.length>0)&&me===He&&(me=Ht(me)),_e.uponSanitizeAttribute.length>0&&k===E&&(k=Ht(k)),ss&&ss(R),Is=R},Je=$e({},[...co,...uo,...Fw]),ct=$e({},[...fo,...$w]),$t=function(R){let W=O(R);(!W||!W.tagName)&&(W={namespaceURI:us,tagName:"template"});const v=hi(R.tagName),D=hi(W.tagName);return Xs[R.namespaceURI]?R.namespaceURI===Rs?W.namespaceURI===Nt?v==="svg":W.namespaceURI===$s?v==="svg"&&(D==="annotation-xml"||en[D]):!!Je[v]:R.namespaceURI===$s?W.namespaceURI===Nt?v==="math":W.namespaceURI===Rs?v==="math"&&Kt[D]:!!ct[v]:R.namespaceURI===Nt?W.namespaceURI===Rs&&!Kt[D]||W.namespaceURI===$s&&!en[D]?!1:!ct[v]&&(ee[v]||!Je[v]):!!(Se==="application/xhtml+xml"&&Xs[R.namespaceURI]):!1},Wt=function(R){ya(t.removed,{element:R});try{O(R).removeChild(R)}catch{if(b(R),!O(R))throw qn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},tl=function(R){const W=A?A(R):R.childNodes;if(W){const D=[];ln(W,F=>{ya(D,F)}),ln(D,F=>{try{b(F)}catch{}})}const v=m?m(R):null;if(v)for(let D=v.length-1;D>=0;--D){const F=v[D],ne=F&&F.name;if(typeof ne=="string")try{R.removeAttribute(ne)}catch{}}},Hs=function(R,W){try{ya(t.removed,{attribute:W.getAttributeNode(R),from:W})}catch{ya(t.removed,{attribute:null,from:W})}if(W.removeAttribute(R),R==="is")if(Le||Oe)try{Wt(W)}catch{}else try{W.setAttribute(R,"")}catch{}},sl=function(R){const W=m?m(R):R.attributes;if(W)for(let v=W.length-1;v>=0;--v){const D=W[v],F=D&&D.name;if(!(typeof F!="string"||k[rt(F)]))try{R.removeAttribute(F)}catch{}}},$r=function(R){const W=[R];for(;W.length>0;){const v=W.pop();(_?_(v):v.nodeType)===Vs.element&&sl(v);const F=A?A(v):v.childNodes;if(F)for(let ne=F.length-1;ne>=0;--ne)W.push(F[ne])}},nl=function(R){let W=null,v=null;if(Ee)R="<remove></remove>"+R;else{const ne=qu(R,/^[\r\n\t ]+/);v=ne&&ne[0]}Se==="application/xhtml+xml"&&us===Nt&&(R='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+R+"</body></html>");const D=g?$(R):R;if(us===Nt)try{W=new d().parseFromString(D,Se)}catch{}if(!W||!W.documentElement){W=H.createDocument(us,"template",null);try{W.documentElement.innerHTML=Us?w:D}catch{}}const F=W.body||W.documentElement;return R&&v&&F.insertBefore(s.createTextNode(v),F.childNodes[0]||null),us===Nt?Z.call(W,he?"html":"body")[0]:he?W.documentElement:F},al=function(R){return N.call(R.ownerDocument||R,R,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Cn=function(R){var W,v;R.normalize();const D=N.call(R.ownerDocument||R,R,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let F=D.nextNode();for(;F;){let Ne=F.data;ln([ae,fe,P],Ue=>{Ne=xa(Ne,Ue," ")}),F.data=Ne,F=D.nextNode()}const ne=(W=(v=R.querySelectorAll)===null||v===void 0?void 0:v.call(R,"template"))!==null&&W!==void 0?W:[];ln(Array.from(ne),Ne=>{Os(Ne.content)&&Cn(Ne.content)})},pa=function(R){const W=S?S(R):null;return typeof W!="string"||rt(W)!=="form"?!1:typeof R.nodeName!="string"||typeof R.textContent!="string"||typeof R.removeChild!="function"||R.attributes!==m(R)||typeof R.removeAttribute!="function"||typeof R.setAttribute!="function"||typeof R.namespaceURI!="string"||typeof R.insertBefore!="function"||typeof R.hasChildNodes!="function"||R.nodeType!==_(R)||R.childNodes!==A(R)},Os=function(R){if(!_||typeof R!="object"||R===null)return!1;try{return _(R)===Vs.documentFragment}catch{return!1}},Vn=function(R){if(!_||typeof R!="object"||R===null)return!1;try{return typeof _(R)=="number"}catch{return!1}};function Ns(pe,R,W){ln(pe,v=>{v.call(t,R,W,Is)})}const tn=function(R){let W=null;if(Ns(_e.beforeSanitizeElements,R,null),pa(R))return Wt(R),!0;const v=rt(S?S(R):R.nodeName);if(Ns(_e.uponSanitizeElement,R,{tagName:v,allowedTags:me}),ue&&R.hasChildNodes()&&!Vn(R.firstElementChild)&&Lt(/<[/\w!]/g,R.innerHTML)&&Lt(/<[/\w!]/g,R.textContent)||ue&&R.namespaceURI===Nt&&v==="style"&&Vn(R.firstElementChild)||R.nodeType===Vs.progressingInstruction||ue&&R.nodeType===Vs.comment&&Lt(/<[/\w]/g,R.data))return Wt(R),!0;if(X[v]||!(Q.tagCheck instanceof Function&&Q.tagCheck(v))&&!me[v]){if(!X[v]&&Qa(v)&&(U.tagNameCheck instanceof RegExp&&Lt(U.tagNameCheck,v)||U.tagNameCheck instanceof Function&&U.tagNameCheck(v)))return!1;if(ye&&!Be[v]){const F=O(R),ne=A(R);if(ne&&F){const Ne=ne.length;for(let Ue=Ne-1;Ue>=0;--Ue){const Xe=Ce?ne[Ue]:p(ne[Ue],!0);F.insertBefore(Xe,y(R))}}}return Wt(R),!0}return(_?_(R):R.nodeType)===Vs.element&&!$t(R)||(v==="noscript"||v==="noembed"||v==="noframes")&&Lt(/<\/no(script|embed|frames)/i,R.innerHTML)?(Wt(R),!0):(be&&R.nodeType===Vs.text&&(W=R.textContent,ln([ae,fe,P],F=>{W=xa(W,F," ")}),R.textContent!==W&&(ya(t.removed,{element:R.cloneNode()}),R.textContent=W)),Ns(_e.afterSanitizeElements,R,null),!1)},il=function(R,W,v){if(q[W]||Ve&&(W==="id"||W==="name")&&(v in s||v in z))return!1;const D=k[W]||Q.attributeCheck instanceof Function&&Q.attributeCheck(W,R);if(!(re&&!q[W]&&Lt(se,W))){if(!(ie&&Lt(ke,W))){if(!D||q[W]){if(!(Qa(R)&&(U.tagNameCheck instanceof RegExp&&Lt(U.tagNameCheck,R)||U.tagNameCheck instanceof Function&&U.tagNameCheck(R))&&(U.attributeNameCheck instanceof RegExp&&Lt(U.attributeNameCheck,W)||U.attributeNameCheck instanceof Function&&U.attributeNameCheck(W,R))||W==="is"&&U.allowCustomizedBuiltInElements&&(U.tagNameCheck instanceof RegExp&&Lt(U.tagNameCheck,v)||U.tagNameCheck instanceof Function&&U.tagNameCheck(v))))return!1}else if(!As[W]){if(!Lt(ve,xa(v,ce,""))){if(!((W==="src"||W==="xlink:href"||W==="href")&&R!=="script"&&Gu(v,"data:")===0&&pt[R])){if(!(le&&!Lt(V,xa(v,ce,"")))){if(v)return!1}}}}}}return!0},Ur=$e({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Qa=function(R){return!Ur[hi(R)]&&Lt(de,R)},ll=function(R){Ns(_e.beforeSanitizeAttributes,R,null);const W=R.attributes;if(!W||pa(R))return;const v={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:k,forceKeepAttr:void 0};let D=W.length;for(;D--;){const F=W[D],ne=F.name,Ne=F.namespaceURI,Ue=F.value,Xe=rt(ne),Ut=Ue;let vt=ne==="value"?Ut:Iw(Ut);if(v.attrName=Xe,v.attrValue=vt,v.keepAttr=!0,v.forceKeepAttr=void 0,Ns(_e.uponSanitizeAttribute,R,v),vt=v.attrValue,lt&&(Xe==="id"||Xe==="name")&&Gu(vt,G)!==0&&(Hs(ne,R),vt=G+vt),ue&&Lt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,vt)){Hs(ne,R);continue}if(Xe==="attributename"&&qu(vt,"href")){Hs(ne,R);continue}if(v.forceKeepAttr)continue;if(!v.keepAttr){Hs(ne,R);continue}if(!te&&Lt(/\/>/i,vt)){Hs(ne,R);continue}be&&ln([ae,fe,P],id=>{vt=xa(vt,id," ")});const ei=rt(R.nodeName);if(!il(ei,Xe,vt)){Hs(ne,R);continue}if(g&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Ne)switch(u.getAttributeType(ei,Xe)){case"TrustedHTML":{vt=$(vt);break}case"TrustedScriptURL":{vt=I(vt);break}}if(vt!==Ut)try{Ne?R.setAttributeNS(Ne,ne,vt):R.setAttribute(ne,vt),pa(R)?Wt(R):zu(t.removed)}catch{Hs(ne,R)}}Ns(_e.afterSanitizeAttributes,R,null)},ha=function(R){let W=null;const v=al(R);for(Ns(_e.beforeSanitizeShadowDOM,R,null);W=v.nextNode();)if(Ns(_e.uponSanitizeShadowNode,W,null),tn(W),ll(W),Os(W.content)&&ha(W.content),(_?_(W):W.nodeType)===Vs.element){const F=x?x(W):W.shadowRoot;Os(F)&&(Xa(F),ha(F))}Ns(_e.afterSanitizeShadowDOM,R,null)},Xa=function(R){const W=[{node:R,shadow:null}];for(;W.length>0;){const v=W.pop();if(v.shadow){ha(v.shadow);continue}const D=v.node,ne=(_?_(D):D.nodeType)===Vs.element,Ne=A?A(D):D.childNodes;if(Ne)for(let Ue=Ne.length-1;Ue>=0;--Ue)W.push({node:Ne[Ue],shadow:null});if(ne){const Ue=S?S(D):null;if(typeof Ue=="string"&&rt(Ue)==="template"){const Xe=D.content;Os(Xe)&&W.push({node:Xe,shadow:null})}}if(ne){const Ue=x?x(D):D.shadowRoot;Os(Ue)&&W.push({node:null,shadow:Ue},{node:Ue,shadow:null})}}};return t.sanitize=function(pe){let R=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},W=null,v=null,D=null,F=null;if(Us=!pe,Us&&(pe="<!-->"),typeof pe!="string"&&!Vn(pe)&&(pe=Mw(pe),typeof pe!="string"))throw qn("dirty is not a string, aborting");if(!t.isSupported)return pe;we||Ae(R),t.removed=[];const ne=Ce&&typeof pe!="string"&&Vn(pe);if(ne){const Xe=S?S(pe):pe.nodeName;if(typeof Xe=="string"){const Ut=rt(Xe);if(!me[Ut]||X[Ut])throw qn("root node is forbidden and cannot be sanitized in-place")}if(pa(pe))throw qn("root node is clobbered and cannot be sanitized in-place");try{Xa(pe)}catch(Ut){throw tl(pe),Ut}}else if(Vn(pe))W=nl("<!---->"),v=W.ownerDocument.importNode(pe,!0),v.nodeType===Vs.element&&v.nodeName==="BODY"||v.nodeName==="HTML"?W=v:W.appendChild(v),Xa(v);else{if(!Le&&!be&&!he&&pe.indexOf("<")===-1)return g&&Fe?$(pe):pe;if(W=nl(pe),!W)return Le?null:Fe?w:""}W&&Ee&&Wt(W.firstChild);const Ne=al(ne?pe:W);try{for(;D=Ne.nextNode();)tn(D),ll(D),Os(D.content)&&ha(D.content)}catch(Xe){throw ne&&tl(pe),Xe}if(ne)return ln(t.removed,Xe=>{Xe.element&&$r(Xe.element)}),be&&Cn(pe),pe;if(Le){if(be&&Cn(W),Oe)for(F=L.call(W.ownerDocument);W.firstChild;)F.appendChild(W.firstChild);else F=W;return(k.shadowroot||k.shadowrootmode)&&(F=xe.call(n,F,!0)),F}let Ue=he?W.outerHTML:W.innerHTML;return he&&me["!doctype"]&&W.ownerDocument&&W.ownerDocument.doctype&&W.ownerDocument.doctype.name&&Lt(Gw,W.ownerDocument.doctype.name)&&(Ue="<!DOCTYPE "+W.ownerDocument.doctype.name+`>
`+Ue),be&&ln([ae,fe,P],Xe=>{Ue=xa(Ue,Xe," ")}),g&&Fe?$(Ue):Ue},t.setConfig=function(){let pe=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ae(pe),we=!0},t.clearConfig=function(){Is=null,we=!1,g=T,w=""},t.isValidAttribute=function(pe,R,W){Is||Ae({});const v=rt(pe),D=rt(R);return il(v,D,W)},t.addHook=function(pe,R){typeof R=="function"&&ya(_e[pe],R)},t.removeHook=function(pe,R){if(R!==void 0){const W=Aw(_e[pe],R);return W===-1?void 0:Rw(_e[pe],W,1)[0]}return zu(_e[pe])},t.removeHooks=function(pe){_e[pe]=[]},t.removeAllHooks=function(){_e=ef()},t}var tf=Lm();function Jc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var fa=Jc();function Dm(e){fa=e}var Si={exec:()=>null};function nt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Xt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Xt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Jw=/^(?:[ \t]*(?:\n|$))+/,Yw=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Qw=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,el=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Xw=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Yc=/(?:[*+-]|\d{1,9}[.)])/,Mm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Pm=nt(Mm).replace(/bull/g,Yc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),eS=nt(Mm).replace(/bull/g,Yc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Qc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,tS=/^[^\n]+/,Xc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,sS=nt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Xc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),nS=nt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Yc).getRegex(),Pr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",ed=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,aS=nt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",ed).replace("tag",Pr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Fm=nt(Qc).replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Pr).getRegex(),iS=nt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Fm).getRegex(),td={blockquote:iS,code:Yw,def:sS,fences:Qw,heading:Xw,hr:el,html:aS,lheading:Pm,list:nS,newline:Jw,paragraph:Fm,table:Si,text:tS},sf=nt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Pr).getRegex(),lS={...td,lheading:eS,table:sf,paragraph:nt(Qc).replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",sf).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Pr).getRegex()},rS={...td,html:nt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",ed).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Si,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:nt(Qc).replace("hr",el).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Pm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},oS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,cS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,$m=/^( {2,}|\\)\n(?!\s*$)/,dS=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Fr=/[\p{P}\p{S}]/u,sd=/[\s\p{P}\p{S}]/u,Um=/[^\s\p{P}\p{S}]/u,uS=nt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,sd).getRegex(),Bm=/(?!~)[\p{P}\p{S}]/u,fS=/(?!~)[\s\p{P}\p{S}]/u,pS=/(?:[^\s\p{P}\p{S}]|~)/u,hS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Hm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,mS=nt(Hm,"u").replace(/punct/g,Fr).getRegex(),gS=nt(Hm,"u").replace(/punct/g,Bm).getRegex(),Vm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",vS=nt(Vm,"gu").replace(/notPunctSpace/g,Um).replace(/punctSpace/g,sd).replace(/punct/g,Fr).getRegex(),bS=nt(Vm,"gu").replace(/notPunctSpace/g,pS).replace(/punctSpace/g,fS).replace(/punct/g,Bm).getRegex(),yS=nt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Um).replace(/punctSpace/g,sd).replace(/punct/g,Fr).getRegex(),xS=nt(/\\(punct)/,"gu").replace(/punct/g,Fr).getRegex(),_S=nt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),kS=nt(ed).replace("(?:-->|$)","-->").getRegex(),wS=nt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",kS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),ir=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,SS=nt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",ir).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),jm=nt(/^!?\[(label)\]\[(ref)\]/).replace("label",ir).replace("ref",Xc).getRegex(),zm=nt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Xc).getRegex(),TS=nt("reflink|nolink(?!\\()","g").replace("reflink",jm).replace("nolink",zm).getRegex(),nd={_backpedal:Si,anyPunctuation:xS,autolink:_S,blockSkip:hS,br:$m,code:cS,del:Si,emStrongLDelim:mS,emStrongRDelimAst:vS,emStrongRDelimUnd:yS,escape:oS,link:SS,nolink:zm,punctuation:uS,reflink:jm,reflinkSearch:TS,tag:wS,text:dS,url:Si},CS={...nd,link:nt(/^!?\[(label)\]\((.*?)\)/).replace("label",ir).getRegex(),reflink:nt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",ir).getRegex()},Ko={...nd,emStrongRDelimAst:bS,emStrongLDelim:gS,url:nt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},ES={...Ko,br:nt($m).replace("{2,}","*").getRegex(),text:nt(Ko.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Sl={normal:td,gfm:lS,pedantic:rS},oi={normal:nd,gfm:Ko,breaks:ES,pedantic:CS},AS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},nf=e=>AS[e];function qs(e,t){if(t){if(Xt.escapeTest.test(e))return e.replace(Xt.escapeReplace,nf)}else if(Xt.escapeTestNoEncode.test(e))return e.replace(Xt.escapeReplaceNoEncode,nf);return e}function af(e){try{e=encodeURI(e).replace(Xt.percentDecode,"%")}catch{return null}return e}function lf(e,t){var i;const s=e.replace(Xt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Xt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Xt.slashPipe,"|");return n}function ci(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function RS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function rf(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function IS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var lr=class{constructor(e){it(this,"options");it(this,"rules");it(this,"lexer");this.options=e||fa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:ci(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=IS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=ci(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:ci(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=ci(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,b=p.raw+`
`+s.join(`
`),y=this.blockquote(b);i[i.length-1]=y,n=n.substring(0,n.length-p.raw.length)+y.raw,a=a.substring(0,a.length-p.text.length)+y.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,b=p.raw+`
`+s.join(`
`),y=this.list(b);i[i.length-1]=y,n=n.substring(0,n.length-f.raw.length)+y.raw,a=a.substring(0,a.length-p.raw.length)+y.raw,s=b.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,O=>" ".repeat(3*O.length)),f=e.split(`
`,1)[0],p=!u.trim(),b=0;if(this.options.pedantic?(b=2,d=u.trimStart()):p?b=t[1].length+1:(b=t[2].search(this.rules.other.nonSpaceChar),b=b>4?1:b,d=u.slice(b),b+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const O=this.rules.other.nextBulletRegex(b),x=this.rules.other.hrRegex(b),m=this.rules.other.fencesBeginRegex(b),_=this.rules.other.headingBeginRegex(b),S=this.rules.other.htmlBeginRegex(b);for(;e;){const g=e.split(`
`,1)[0];let w;if(f=g,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),w=f):w=f.replace(this.rules.other.tabCharGlobal,"    "),m.test(f)||_.test(f)||S.test(f)||O.test(f)||x.test(f))break;if(w.search(this.rules.other.nonSpaceChar)>=b||!f.trim())d+=`
`+w.slice(b);else{if(p||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||_.test(u)||x.test(u))break;d+=`
`+f}!p&&!f.trim()&&(p=!0),c+=g+`
`,e=e.substring(g.length+1),u=w.slice(b)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let y=null,A;this.options.gfm&&(y=this.rules.other.listIsTask.exec(d),y&&(A=y[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!y,checked:A,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=lf(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(lf(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=ci(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=RS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),rf(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return rf(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,f=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const b=f.slice(1,-1);return{type:"em",raw:f,text:b,tokens:this.lexer.inlineTokens(b)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},hn=class Wo{constructor(t){it(this,"tokens");it(this,"options");it(this,"state");it(this,"tokenizer");it(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||fa,this.options.tokenizer=this.options.tokenizer||new lr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Xt,block:Sl.normal,inline:oi.normal};this.options.pedantic?(s.block=Sl.pedantic,s.inline=oi.pedantic):this.options.gfm&&(s.block=Sl.gfm,this.options.breaks?s.inline=oi.breaks:s.inline=oi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Sl,inline:oi}}static lex(t,s){return new Wo(s).lex(t)}static lexInline(t,s){return new Wo(s).inlineTokens(t)}lex(t){t=t.replace(Xt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Xt.tabCharGlobal,"    ").replace(Xt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(f=>{u=f.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(d=f.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const f=s.at(-1);d.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let b;this.options.extensions.startInline.forEach(y=>{b=y.call({lexer:this},p),typeof b=="number"&&b>=0&&(f=Math.min(f,b))}),f<1/0&&f>=0&&(u=t.substring(0,f+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},rr=class{constructor(e){it(this,"options");it(this,"parser");this.options=e||fa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Xt.notSpaceStart))==null?void 0:i[0],a=e.replace(Xt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+qs(n)+'">'+(s?a:qs(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:qs(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+qs(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${qs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=af(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+qs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=af(e);if(a===null)return qs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${qs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:qs(e.text)}},ad=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},mn=class Zo{constructor(t){it(this,"options");it(this,"renderer");it(this,"textRenderer");this.options=t||fa,this.options.renderer=this.options.renderer||new rr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new ad}static parse(t,s){return new Zo(s).parse(t)}static parseInline(t,s){return new Zo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},ho,Ol=(ho=class{constructor(e){it(this,"options");it(this,"block");this.options=e||fa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?hn.lex:hn.lexInline}provideParser(){return this.block?mn.parse:mn.parseInline}},it(ho,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),ho),OS=class{constructor(...e){it(this,"defaults",Jc());it(this,"options",this.setOptions);it(this,"parse",this.parseMarkdown(!0));it(this,"parseInline",this.parseMarkdown(!1));it(this,"Parser",mn);it(this,"Renderer",rr);it(this,"TextRenderer",ad);it(this,"Lexer",hn);it(this,"Tokenizer",lr);it(this,"Hooks",Ol);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new rr(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new lr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Ol;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Ol.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return hn.lex(e,t??this.defaults)}parser(e,t){return mn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?hn.lex:hn.lexInline,o=i.hooks?i.hooks.provideParser():e?mn.parse:mn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+qs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},la=new OS;function tt(e,t){return la.parse(e,t)}tt.options=tt.setOptions=function(e){return la.setOptions(e),tt.defaults=la.defaults,Dm(tt.defaults),tt};tt.getDefaults=Jc;tt.defaults=fa;tt.use=function(...e){return la.use(...e),tt.defaults=la.defaults,Dm(tt.defaults),tt};tt.walkTokens=function(e,t){return la.walkTokens(e,t)};tt.parseInline=la.parseInline;tt.Parser=mn;tt.parser=mn.parse;tt.Renderer=rr;tt.TextRenderer=ad;tt.Lexer=hn;tt.lexer=hn.lex;tt.Tokenizer=lr;tt.Hooks=Ol;tt.parse=tt;tt.options;tt.setOptions;tt.use;tt.walkTokens;tt.parseInline;mn.parse;hn.lex;const NS={breaks:!0,gfm:!0};function of(e){if(!e)return"";try{if(typeof tt<"u"&&tt.parse){const t=tt.parse(e,NS);return typeof tf<"u"?tf.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function LS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const DS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function MS(e){return DS[e]||"wrench"}const PS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function cf(e){if(!e)return[];const t=e.match(PS);return t?[...new Set(t)]:[]}const FS={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=J(()=>t.value.trim().length>0&&!s.value),u=h(Ke.state||"disconnected");let f=null,p=null;const b=J(()=>{const H=u.value;return H==="connected"?"Connected":H==="reconnecting"?"Reconnecting…":H==="connecting"?"Connecting…":"REST fallback"}),y=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],A=J(()=>{const H=Math.floor(i.value/4)%y.length,N=i.value;return N>3?`${y[H]} (${N}s)`:y[0]});function O(){At(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function x(){if(!a.value)return;const H=a.value;H.style.height="auto",H.style.height=Math.min(H.scrollHeight,120)+"px"}function m(H,N,L={}){const Z={id:++o,role:H,content:N,timestamp:Date.now(),html:H==="bot"?of(N):"",tools_used:L.tools_used||[],is_error:L.is_error||!1,images:H==="bot"?cf(N):[],files:L.files||[],_showTools:!1};return e.value.push(Z),O(),H==="bot"&&At(()=>_()),Z}function _(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(N=>{N.setAttribute("data-copy","true"),N.style.position="relative";const L=document.createElement("button");L.className="chat-code-copy",L.textContent="Copy",L.addEventListener("click",()=>{const Z=N.querySelector("code"),xe=Z?Z.textContent:N.textContent;navigator.clipboard.writeText(xe).then(()=>{L.textContent="Copied!",setTimeout(()=>{L.textContent="Copy"},1500)}).catch(()=>{})}),N.appendChild(L)})}function S(H){if(H===0)return!0;const N=e.value[H-1],L=e.value[H],Z=new Date(N.timestamp).toDateString(),xe=new Date(L.timestamp).toDateString();return Z!==xe}function g(H){const N=new Date(H),L=new Date;if(N.toDateString()===L.toDateString())return"Today";const Z=new Date(L);return Z.setDate(Z.getDate()-1),N.toDateString()===Z.toDateString()?"Yesterday":N.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function w(H){t.value=H,At(()=>j())}function T(H){window.open(H,"_blank","noopener")}function C(H){H.target.style.display="none"}function M(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function B(){r&&(clearInterval(r),r=null),i.value=0}function $(H){s.value&&(s.value=!1,B(),H.type==="chat_response"?m("bot",H.content,{tools_used:H.tools_used||[],is_error:H.is_error||!1,files:H.files||[]}):H.type==="chat_error"&&m("bot",H.error||"Unknown error",{is_error:!0}),At(()=>{var N;return(N=a.value)==null?void 0:N.focus()}))}async function I(H){try{const N=await K.post("/api/chat",{content:H,channel_id:l.value});m("bot",N.response,{tools_used:N.tools_used||[],is_error:N.is_error||!1,files:N.files||[]})}catch(N){m("bot",N.message||"Failed to send message",{is_error:!0})}}async function j(){const H=t.value.trim();if(!H||s.value)return;m("user",H),t.value="",s.value=!0,M(),a.value&&(a.value.style.height="auto"),Ke.connected&&Ke.sendChat(H,{channelId:l.value})||(await I(H),s.value=!1,B()),At(()=>{var L;return(L=a.value)==null?void 0:L.focus()})}async function Y(){try{if(!l.value){const N=await K.get("/api/auth/session");l.value=N.channel_id||N.user_id||"web-user"}const H=await K.get("/api/sessions/"+encodeURIComponent(l.value));if(H&&H.messages&&H.messages.length>0){for(const N of H.messages){const L=N.role==="user"?"user":"bot";let Z=N.content||"";if(L==="user"){const _e=Z.match(/^\[.*?\]:\s*/);_e&&(Z=Z.slice(_e[0].length))}if(!Z.trim())continue;const xe={id:++o,role:L,content:Z,timestamp:N.timestamp?N.timestamp*1e3:Date.now(),html:L==="bot"?of(Z):"",tools_used:[],is_error:!1,images:L==="bot"?cf(Z):[],files:[],_showTools:!1};e.value.push(xe)}At(()=>{O(),_()})}}catch{}}return We(()=>{Ke.subscribe("chat",$),u.value=Ke.state||"disconnected",f=Ke.onStateChange,p=(H,N)=>{u.value=H,f&&f(H,N)},Ke.onStateChange=p,Y(),At(()=>{var H;return(H=a.value)==null?void 0:H.focus()})}),xt(()=>{Ke.unsubscribe("chat",$),Ke.onStateChange===p&&(Ke.onStateChange=f),B()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:b,typingText:A,suggestions:c,send:j,autoResize:x,formatTime:LS,formatDate:g,showDateSeparator:S,useSuggestion:w,openImage:T,onImageError:C,getToolIcon:MS}}},$S={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),f=h(!1),p=h(!1),b=J(()=>e.value==="custom"),y=J(()=>[...i.value,...l.value]),A=J(()=>l.value.includes(e.value)),O=J(()=>{var T;return b.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),x=J(()=>{var T;return b.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),m=J(()=>{var T;return b.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function _(){d.value=!0;try{const T=await K.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function g(){const T=u.value.trim();if(T){p.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:T,display_name:O.value,identity:x.value,voice:m.value}),f.value=!1,u.value="",await _(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{p.value=!1}}}async function w(){if(await gs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(C){c.value=C.message}}}return We(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:y,isCustom:b,isUserPreset:A,previewName:O,previewIdentity:x,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:f,newPresetName:u,savingPreset:p,saveAsPreset:g,deletePreset:w,builtinPresets:i,userPresets:l}},template:`
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
  `},_t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),qm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:yw,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:FS,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:uk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:bk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ek,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:$S,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:fw,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:_t("/operations","live")},{path:"/agents",redirect:_t("/operations","agents")},{path:"/loops",redirect:_t("/operations","loops")},{path:"/processes",redirect:_t("/operations","processes")},{path:"/schedules",redirect:_t("/operations","schedules")},{path:"/audit",redirect:_t("/history","audit")},{path:"/sessions",redirect:_t("/history","sessions")},{path:"/traces",redirect:_t("/history","traces")},{path:"/usage",redirect:_t("/history","usage")},{path:"/tools",redirect:_t("/capabilities","tools")},{path:"/skills",redirect:_t("/capabilities","skills")},{path:"/knowledge",redirect:_t("/capabilities","knowledge")},{path:"/memory",redirect:_t("/capabilities","memory")},{path:"/learned",redirect:_t("/capabilities","learned")},{path:"/health",redirect:_t("/system","health")},{path:"/resources",redirect:_t("/system","resources")},{path:"/logs",redirect:_t("/system","logs")},{path:"/config",redirect:_t("/system","config")},{path:"/host-access",redirect:_t("/system","host-access")},{path:"/internals",redirect:_t("/system","internals")}],Ti=J_({history:A_(),routes:qm});Ti.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const US={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},BS={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),f=h(null);let p=null;const b=h("starting"),y=h(""),A=qm.filter(N=>N.meta),O=J(()=>["Workspace","Operate","Observe","Manage"].map(N=>({name:N,routes:A.filter(L=>L.meta.section===N)})).filter(N=>N.routes.length)),x=J(()=>{var N;return((N=Ti.currentRoute.value.meta)==null?void 0:N.label)||"Odin"}),m=J(()=>{var N;return((N=Ti.currentRoute.value.meta)==null?void 0:N.section)||"Management"}),_=J(()=>{var N;return((N=Ti.currentRoute.value.meta)==null?void 0:N.description)||"Management console"});K.onSessionExpired=()=>{t.value=!0,Ke.disconnect(),K.setToken(""),e.value="login"};function S(N){var L;if((N.ctrlKey||N.metaKey)&&N.key.toLowerCase()==="k"){e.value==="ready"&&(N.preventDefault(),Bu());return}if(n.value&&N.key==="Tab"){const Z=[...((L=a.value)==null?void 0:L.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(Z.length){const xe=Z[0],_e=Z[Z.length-1];if(N.shiftKey&&(document.activeElement===xe||!a.value.contains(document.activeElement))){N.preventDefault(),_e.focus();return}if(!N.shiftKey&&(document.activeElement===_e||!a.value.contains(document.activeElement))){N.preventDefault(),xe.focus();return}}}if(N.key==="Escape"&&n.value){n.value=!1,N.preventDefault();return}if(N.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(N.target.tagName)){N.preventDefault();const Z=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');Z&&Z.focus()}}function g(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}We(async()=>{document.addEventListener("keydown",S),r=window.matchMedia("(max-width: 900px)"),g(),r.addEventListener("change",g);const N=await K.check();N.ok?(e.value="ready",Y()):N.needsAuth?e.value="login":(e.value="ready",Y())});function w(){t.value=!1,e.value="ready",Y()}async function T(){await K.logout(),Ke.disconnect(),e.value="login"}function C(){s.value=!s.value}function M(){n.value=!n.value}es(n,async N=>{var L,Z;if(N)o=document.activeElement,await At(),(Z=(L=a.value)==null?void 0:L.querySelector(".nav-item"))==null||Z.focus();else if(o!=null&&o.isConnected){const xe=o;o=null,requestAnimationFrame(()=>xe.focus())}});const B=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function $(N,L="info",Z=3e3){f.value={text:N,level:L},clearTimeout(p),p=setTimeout(()=>{f.value=null},Z)}let I=null,j=!1;function Y(){Ke.onStatusChange=N=>{c.value=N},Ke.onLatency=N=>{u.value=N},Ke.onStateChange=(N,L)=>{d.value=N,N==="connected"?(j&&$("Connection restored","success"),j=!0):N==="reconnecting"&&L.attempt===1&&$("Connection lost — reconnecting…","warn")},Ke.connect(),H(),I&&clearInterval(I),I=setInterval(H,15e3)}async function H(){try{const N=await K.get("/api/status");b.value=N.status==="online"?"online":"starting";const L=N.uptime_seconds||0,Z=Math.floor(L/3600),xe=Math.floor(L%3600/60);y.value=`${Z}h ${xe}m uptime`}catch{b.value="offline",y.value=""}}return xt(()=>{I&&clearInterval(I),Ke.disconnect(),document.removeEventListener("keydown",S),r==null||r.removeEventListener("change",g)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:B,wsToast:f,botStatus:b,botUptime:y,navRoutes:A,navGroups:O,currentPage:x,currentSection:m,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:w,logout:T,toggleSidebar:C,toggleMobileNavigation:M,openPalette:Bu}}},Bn=Zl(BS);Bn.component("odin-icon",gw);Bn.component("login-screen",US);Bn.component("toast-container",V0);Bn.component("confirm-host",j0);Bn.component("command-palette",mw);Bn.directive("modal-focus",bw);Bn.use(Ti);Bn.mount("#app");
