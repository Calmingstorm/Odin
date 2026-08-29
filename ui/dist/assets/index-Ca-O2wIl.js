var Ym=Object.defineProperty;var Qm=(e,t,s)=>t in e?Ym(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ct=(e,t,s)=>Qm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Xm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new ul("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new cd(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new ul("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new cd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ul((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ul?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ul extends Error{constructor(t){super(t),this.name="AuthError"}}class cd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class eg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(this.connected){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){try{this._ws.close(4e3,"pong timeout")}catch{}return}try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)a.send(JSON.stringify({subscribe:o}));this._startPing(),this._setState("connected"),this._emitLifecycle("status",!0),l&&(this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch))},a.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},a.onclose=()=>{if(i()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const l={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const o of this._handlers.chat||[])o(l)}this._emitLifecycle("status",!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},a.onerror=()=>{}}}const K=new Xm,Ze=new eg(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ys(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ve={},Ma=[],zt=()=>{},Na=()=>!1,ha=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),fo=e=>e.startsWith("onUpdate:"),je=Object.assign,Xr=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},tg=Object.prototype.hasOwnProperty,et=(e,t)=>tg.call(e,t),Ce=Array.isArray,Pa=e=>ni(e)==="[object Map]",ma=e=>ni(e)==="[object Set]",dd=e=>ni(e)==="[object Date]",sg=e=>ni(e)==="[object RegExp]",$e=e=>typeof e=="function",Ue=e=>typeof e=="string",Jt=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",ec=e=>(Xe(e)||$e(e))&&$e(e.then)&&$e(e.catch),hp=Object.prototype.toString,ni=e=>hp.call(e),ng=e=>ni(e).slice(8,-1),ho=e=>ni(e)==="[object Object]",mo=e=>Ue(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,bn=ys(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),ag=ys("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),go=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},ig=/-\w/g,ot=go(e=>e.replace(ig,t=>t.slice(1).toUpperCase())),lg=/\B([A-Z])/g,ps=go(e=>e.replace(lg,"-$1").toLowerCase()),ga=go(e=>e.charAt(0).toUpperCase()+e.slice(1)),Fa=go(e=>e?`on${ga(e)}`:""),Mt=(e,t)=>!Object.is(e,t),$a=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},mp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},vo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Pl=e=>{const t=Ue(e)?Number(e):NaN;return isNaN(t)?e:t};let ud;const bo=()=>ud||(ud=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function og(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const rg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",cg=ys(rg);function Qi(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ue(n)?gp(n):Qi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ue(e)||Xe(e))return e}const dg=/;(?![^(]*\))/g,ug=/:([^]+)/,pg=/\/\*[^]*?\*\//g;function gp(e){const t={};return e.replace(pg,"").split(dg).forEach(s=>{if(s){const n=s.split(ug);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Xi(e){let t="";if(Ue(e))t=e;else if(Ce(e))for(let s=0;s<e.length;s++){const n=Xi(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function fg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ue(t)&&(e.class=Xi(t)),s&&(e.style=Qi(s)),e}const hg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",mg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",gg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",vg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",bg=ys(hg),yg=ys(mg),xg=ys(gg),_g=ys(vg),wg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",kg=ys(wg);function vp(e){return!!e||e===""}function Sg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=wn(e[n],t[n]);return s}function wn(e,t){if(e===t)return!0;let s=dd(e),n=dd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Jt(e),n=Jt(t),s||n)return e===t;if(s=Ce(e),n=Ce(t),s||n)return s&&n?Sg(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!wn(e[l],t[l]))return!1}}return String(e)===String(t)}function yo(e,t){return e.findIndex(s=>wn(s,t))}const bp=e=>!!(e&&e.__v_isRef===!0),yp=e=>Ue(e)?e:e==null?"":Ce(e)||Xe(e)&&(e.toString===hp||!$e(e.toString))?bp(e)?yp(e.value):JSON.stringify(e,xp,2):String(e),xp=(e,t)=>bp(t)?xp(e,t.value):Pa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[jo(n,i)+" =>"]=a,s),{})}:ma(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>jo(s))}:Jt(t)?jo(t):Xe(t)&&!Ce(t)&&!ho(t)?String(t):t,jo=(e,t="")=>{var s;return Jt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Tg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Nt;class tc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Nt&&(Nt.active?(this.parent=Nt,this.index=(Nt.scopes||(Nt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Nt;try{return Nt=this,t()}finally{Nt=s}}}on(){++this._on===1&&(this.prevScope=Nt,Nt=this)}off(){if(this._on>0&&--this._on===0){if(Nt===this)Nt=this.prevScope;else{let t=Nt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Cg(e){return new tc(e)}function _p(){return Nt}function Eg(e,t=!1){Nt&&Nt.cleanups.push(e)}let dt;const Vo=new WeakSet;class Di{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Nt&&(Nt.active?Nt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Vo.has(this)&&(Vo.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||kp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,pd(this),Sp(this);const t=dt,s=Us;dt=this,Us=!0;try{return this.fn()}finally{Tp(this),dt=t,Us=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)ac(t);this.deps=this.depsTail=void 0,pd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Vo.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){br(this)&&this.run()}get dirty(){return br(this)}}let wp=0,ki,Si;function kp(e,t=!1){if(e.flags|=8,t){e.next=Si,Si=e;return}e.next=ki,ki=e}function sc(){wp++}function nc(){if(--wp>0)return;if(Si){let t=Si;for(Si=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;ki;){let t=ki;for(ki=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Sp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Tp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),ac(n),Ag(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function br(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Cp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Cp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Mi)||(e.globalVersion=Mi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!br(e))))return;e.flags|=2;const t=e.dep,s=dt,n=Us;dt=e,Us=!0;try{Sp(e);const a=e.fn(e._value);(t.version===0||Mt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{dt=s,Us=n,Tp(e),e.flags&=-3}}function ac(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)ac(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Ag(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Rg(e,t){e.effect instanceof Di&&(e=e.effect.fn);const s=new Di(e);t&&je(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Ig(e){e.effect.stop()}let Us=!0;const Ep=[];function kn(){Ep.push(Us),Us=!1}function Sn(){const e=Ep.pop();Us=e===void 0?!0:e}function pd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=dt;dt=void 0;try{t()}finally{dt=s}}}let Mi=0;class Og{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class xo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!dt||!Us||dt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==dt)s=this.activeLink=new Og(dt,this),dt.deps?(s.prevDep=dt.depsTail,dt.depsTail.nextDep=s,dt.depsTail=s):dt.deps=dt.depsTail=s,Ap(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=dt.depsTail,s.nextDep=void 0,dt.depsTail.nextDep=s,dt.depsTail=s,dt.deps===s&&(dt.deps=n)}return s}trigger(t){this.version++,Mi++,this.notify(t)}notify(t){sc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{nc()}}}function Ap(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Ap(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Fl=new WeakMap,ia=Symbol(""),yr=Symbol(""),Pi=Symbol("");function Gt(e,t,s){if(Us&&dt){let n=Fl.get(e);n||Fl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new xo),a.map=n,a.key=s),a.track()}}function fn(e,t,s,n,a,i){const l=Fl.get(e);if(!l){Mi++;return}const o=r=>{r&&r.trigger()};if(sc(),t==="clear")l.forEach(o);else{const r=Ce(e),c=r&&mo(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Pi||!Jt(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Pi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(ia)),Pa(e)&&o(l.get(yr)));break;case"delete":r||(o(l.get(ia)),Pa(e)&&o(l.get(yr)));break;case"set":Pa(e)&&o(l.get(ia));break}}nc()}function Lg(e,t){const s=Fl.get(e);return s&&s.get(t)}function ka(e){const t=We(e);return t===e?t:(Gt(t,"iterate",Pi),hs(e)?t:t.map(Hs))}function _o(e){return Gt(e=We(e),"iterate",Pi),e}function Xs(e,t){return tn(e)?qa(yn(e)?Hs(t):t):Hs(t)}const Ng={__proto__:null,[Symbol.iterator](){return qo(this,Symbol.iterator,e=>Xs(this,e))},concat(...e){return ka(this).concat(...e.map(t=>Ce(t)?ka(t):t))},entries(){return qo(this,"entries",e=>(e[1]=Xs(this,e[1]),e))},every(e,t){return an(this,"every",e,t,void 0,arguments)},filter(e,t){return an(this,"filter",e,t,s=>s.map(n=>Xs(this,n)),arguments)},find(e,t){return an(this,"find",e,t,s=>Xs(this,s),arguments)},findIndex(e,t){return an(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return an(this,"findLast",e,t,s=>Xs(this,s),arguments)},findLastIndex(e,t){return an(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return an(this,"forEach",e,t,void 0,arguments)},includes(...e){return Go(this,"includes",e)},indexOf(...e){return Go(this,"indexOf",e)},join(e){return ka(this).join(e)},lastIndexOf(...e){return Go(this,"lastIndexOf",e)},map(e,t){return an(this,"map",e,t,void 0,arguments)},pop(){return ci(this,"pop")},push(...e){return ci(this,"push",e)},reduce(e,...t){return fd(this,"reduce",e,t)},reduceRight(e,...t){return fd(this,"reduceRight",e,t)},shift(){return ci(this,"shift")},some(e,t){return an(this,"some",e,t,void 0,arguments)},splice(...e){return ci(this,"splice",e)},toReversed(){return ka(this).toReversed()},toSorted(e){return ka(this).toSorted(e)},toSpliced(...e){return ka(this).toSpliced(...e)},unshift(...e){return ci(this,"unshift",e)},values(){return qo(this,"values",e=>Xs(this,e))}};function qo(e,t,s){const n=_o(e),a=n[t]();return n!==e&&!hs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Dg=Array.prototype;function an(e,t,s,n,a,i){const l=_o(e),o=l!==e&&!hs(e),r=l[t];if(r!==Dg[t]){const u=r.apply(e,i);return o?Hs(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,Xs(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function fd(e,t,s,n){const a=_o(e),i=a!==e&&!hs(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=Xs(e,c)),s.call(this,c,Xs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?Xs(e,r):r}function Go(e,t,s){const n=We(e);Gt(n,"iterate",Pi);const a=n[t](...s);return(a===-1||a===!1)&&el(s[0])?(s[0]=We(s[0]),n[t](...s)):a}function ci(e,t,s=[]){kn(),sc();const n=We(e)[t].apply(e,s);return nc(),Sn(),n}const Mg=ys("__proto__,__v_isRef,__isVue"),Rp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Jt));function Pg(e){Jt(e)||(e=String(e));const t=We(this);return Gt(t,"has",e),t.hasOwnProperty(e)}class Ip{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Pp:Mp:i?Dp:Np).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ce(t);if(!a){let r;if(l&&(r=Ng[s]))return r;if(s==="hasOwnProperty")return Pg}const o=Reflect.get(t,s,Rt(t)?t:n);if((Jt(s)?Rp.has(s):Mg(s))||(a||Gt(t,"get",s),i))return o;if(Rt(o)){const r=l&&mo(s)?o:o.value;return a&&Xe(r)?$l(r):r}return Xe(o)?a?$l(o):Hn(o):o}}class Op extends Ip{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ce(t)&&mo(s);if(!this._isShallow){const c=tn(i);if(!hs(n)&&!tn(n)&&(i=We(i),n=We(n)),!l&&Rt(i)&&!Rt(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:et(t,s),r=Reflect.set(t,s,n,Rt(t)?t:a);return t===We(a)&&(o?Mt(n,i)&&fn(t,"set",s,n):fn(t,"add",s,n)),r}deleteProperty(t,s){const n=et(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&fn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Jt(s)||!Rp.has(s))&&Gt(t,"has",s),n}ownKeys(t){return Gt(t,"iterate",Ce(t)?"length":ia),Reflect.ownKeys(t)}}class Lp extends Ip{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Fg=new Op,$g=new Lp,Ug=new Op(!0),Bg=new Lp(!0),xr=e=>e,pl=e=>Reflect.getPrototypeOf(e);function Hg(e,t,s){return function(...n){const a=this.__v_raw,i=We(a),l=Pa(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?xr:t?qa:Hs;return!t&&Gt(i,"iterate",r?yr:ia),je(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function fl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function zg(e,t){const s={get(a){const i=this.__v_raw,l=We(i),o=We(a);e||(Mt(a,o)&&Gt(l,"get",a),Gt(l,"get",o));const{has:r}=pl(l),c=t?xr:e?qa:Hs;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Gt(We(a),"iterate",ia),a.size},has(a){const i=this.__v_raw,l=We(i),o=We(a);return e||(Mt(a,o)&&Gt(l,"has",a),Gt(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=We(o),c=t?xr:e?qa:Hs;return!e&&Gt(r,"iterate",ia),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return je(s,e?{add:fl("add"),set:fl("set"),delete:fl("delete"),clear:fl("clear")}:{add(a){const i=We(this),l=pl(i),o=We(a),r=!t&&!hs(a)&&!tn(a)?o:a;return l.has.call(i,r)||Mt(a,r)&&l.has.call(i,a)||Mt(o,r)&&l.has.call(i,o)||(i.add(r),fn(i,"add",r,r)),this},set(a,i){!t&&!hs(i)&&!tn(i)&&(i=We(i));const l=We(this),{has:o,get:r}=pl(l);let c=o.call(l,a);c||(a=We(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?Mt(i,d)&&fn(l,"set",a,i):fn(l,"add",a,i),this},delete(a){const i=We(this),{has:l,get:o}=pl(i);let r=l.call(i,a);r||(a=We(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&fn(i,"delete",a,void 0),c},clear(){const a=We(this),i=a.size!==0,l=a.clear();return i&&fn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Hg(a,e,t)}),s}function wo(e,t){const s=zg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(et(s,a)&&a in n?s:n,a,i)}const jg={get:wo(!1,!1)},Vg={get:wo(!1,!0)},qg={get:wo(!0,!1)},Gg={get:wo(!0,!0)},Np=new WeakMap,Dp=new WeakMap,Mp=new WeakMap,Pp=new WeakMap;function Kg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Hn(e){return tn(e)?e:ko(e,!1,Fg,jg,Np)}function ic(e){return ko(e,!1,Ug,Vg,Dp)}function $l(e){return ko(e,!0,$g,qg,Mp)}function Wg(e){return ko(e,!0,Bg,Gg,Pp)}function ko(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Kg(ng(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function yn(e){return tn(e)?yn(e.__v_raw):!!(e&&e.__v_isReactive)}function tn(e){return!!(e&&e.__v_isReadonly)}function hs(e){return!!(e&&e.__v_isShallow)}function el(e){return e?!!e.__v_raw:!1}function We(e){const t=e&&e.__v_raw;return t?We(t):e}function Fp(e){return!et(e,"__v_skip")&&Object.isExtensible(e)&&mp(e,"__v_skip",!0),e}const Hs=e=>Xe(e)?Hn(e):e,qa=e=>Xe(e)?$l(e):e;function Rt(e){return e?e.__v_isRef===!0:!1}function h(e){return $p(e,!1)}function lc(e){return $p(e,!0)}function $p(e,t){return Rt(e)?e:new Zg(e,t)}class Zg{constructor(t,s){this.dep=new xo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:We(t),this._value=s?t:Hs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||hs(t)||tn(t);t=n?t:We(t),Mt(t,s)&&(this._rawValue=t,this._value=n?t:Hs(t),this.dep.trigger())}}function Jg(e){e.dep&&e.dep.trigger()}function en(e){return Rt(e)?e.value:e}function Yg(e){return $e(e)?e():en(e)}const Qg={get:(e,t,s)=>t==="__v_raw"?e:en(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Rt(a)&&!Rt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function oc(e){return yn(e)?e:new Proxy(e,Qg)}class Xg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new xo,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Up(e){return new Xg(e)}function ev(e){const t=Ce(e)?new Array(e.length):{};for(const s in e)t[s]=Bp(e,s);return t}class tv{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Jt(s)?s:String(s),this._raw=We(t);let a=!0,i=t;if(!Ce(t)||Jt(this._key)||!mo(this._key))do a=!el(i)||hs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=en(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Rt(this._raw[this._key])){const s=this._object[this._key];if(Rt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Lg(this._raw,this._key)}}class sv{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function nv(e,t,s){return Rt(e)?e:$e(e)?new sv(e):Xe(e)&&arguments.length>1?Bp(e,t,s):h(e)}function Bp(e,t,s){return new tv(e,t,s)}class av{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new xo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Mi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&dt!==this)return kp(this,!0),!0}get value(){const t=this.dep.track();return Cp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function iv(e,t,s=!1){let n,a;return $e(e)?n=e:(n=e.get,a=e.set),new av(n,a,s)}const lv={GET:"get",HAS:"has",ITERATE:"iterate"},ov={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},hl={},Ul=new WeakMap;let Dn;function rv(){return Dn}function Hp(e,t=!1,s=Dn){if(s){let n=Ul.get(s);n||Ul.set(s,n=[]),n.push(e)}}function cv(e,t,s=Ve){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=_=>a?_:hs(_)||a===!1||a===0?hn(_,1):hn(_);let d,u,p,f,m=!1,b=!1;if(Rt(e)?(u=()=>e.value,m=hs(e)):yn(e)?(u=()=>c(e),m=!0):Ce(e)?(b=!0,m=e.some(_=>yn(_)||hs(_)),u=()=>e.map(_=>{if(Rt(_))return _.value;if(yn(_))return c(_);if($e(_))return r?r(_,2):_()})):$e(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){kn();try{p()}finally{Sn()}}const _=Dn;Dn=d;try{return r?r(e,3,[f]):e(f)}finally{Dn=_}}:u=zt,t&&a){const _=u,E=a===!0?1/0:a;u=()=>hn(_(),E)}const A=_p(),I=()=>{d.stop(),A&&A.active&&Xr(A.effects,d)};if(i&&t){const _=t;t=(...E)=>{const g=_(...E);return I(),g}}let k=b?new Array(e.length).fill(hl):hl;const v=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const E=d.run();if(_||a||m||(b?E.some((g,T)=>Mt(g,k[T])):Mt(E,k))){p&&p();const g=Dn;Dn=d;try{const T=[E,k===hl?void 0:b&&k[0]===hl?[]:k,f];k=E,r?r(t,3,T):t(...T)}finally{Dn=g}}}else d.run()};return o&&o(v),d=new Di(u),d.scheduler=l?()=>l(v,!1):v,f=_=>Hp(_,!1,d),p=d.onStop=()=>{const _=Ul.get(d);if(_){if(r)r(_,4);else for(const E of _)E();Ul.delete(d)}},t?n?v(!0):k=d.run():l?l(v.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function hn(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Rt(e))hn(e.value,t,s);else if(Ce(e))for(let n=0;n<e.length;n++)hn(e[n],t,s);else if(ma(e)||Pa(e))e.forEach(n=>{hn(n,t,s)});else if(ho(e)){for(const n in e)hn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&hn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const zp=[];function dv(e){zp.push(e)}function uv(){zp.pop()}function pv(e,t){}const fv={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},hv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function ai(e,t,s,n){try{return n?e(...n):e()}catch(a){va(a,t,s)}}function bs(e,t,s,n){if($e(e)){const a=ai(e,t,s,n);return a&&ec(a)&&a.catch(i=>{va(i,t,s)}),a}if(Ce(e)){const a=[];for(let i=0;i<e.length;i++)a.push(bs(e[i],t,s,n));return a}}function va(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ve;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){kn(),ai(i,null,10,[e,r,c]),Sn();return}}mv(e,s,a,n,l)}function mv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ss=[];let Ys=-1;const Ua=[];let Mn=null,Ra=0;const jp=Promise.resolve();let Bl=null;function Et(e){const t=Bl||jp;return e?t.then(this?e.bind(this):e):t}function gv(e){let t=Ys+1,s=ss.length;for(;t<s;){const n=t+s>>>1,a=ss[n],i=$i(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function rc(e){if(!(e.flags&1)){const t=$i(e),s=ss[ss.length-1];!s||!(e.flags&2)&&t>=$i(s)?ss.push(e):ss.splice(gv(t),0,e),e.flags|=1,Vp()}}function Vp(){Bl||(Bl=jp.then(qp))}function Fi(e){Ce(e)?Ua.push(...e):Mn&&e.id===-1?Mn.splice(Ra+1,0,e):e.flags&1||(Ua.push(e),e.flags|=1),Vp()}function hd(e,t,s=Ys+1){for(;s<ss.length;s++){const n=ss[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ss.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Hl(e){if(Ua.length){const t=[...new Set(Ua)].sort((s,n)=>$i(s)-$i(n));if(Ua.length=0,Mn){Mn.push(...t);return}for(Mn=t,Ra=0;Ra<Mn.length;Ra++){const s=Mn[Ra];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Mn=null,Ra=0}}const $i=e=>e.id==null?e.flags&2?-1:1/0:e.id;function qp(e){try{for(Ys=0;Ys<ss.length;Ys++){const t=ss[Ys];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),ai(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ys<ss.length;Ys++){const t=ss[Ys];t&&(t.flags&=-2)}Ys=-1,ss.length=0,Hl(),Bl=null,(ss.length||Ua.length)&&qp()}}let Ia,ml=[];function Gp(e,t){var s,n;Ia=e,Ia?(Ia.enabled=!0,ml.forEach(({event:a,args:i})=>Ia.emit(a,...i)),ml=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Gp(i,t)}),setTimeout(()=>{Ia||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ml=[])},3e3)):ml=[]}let Ht=null,So=null;function Ui(e){const t=Ht;return Ht=e,So=e&&e.type.__scopeId||null,t}function vv(e){So=e}function bv(){So=null}const yv=e=>cc;function cc(e,t=Ht,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&ji(-1);const i=Ui(t);let l;try{l=e(...a)}finally{Ui(i),n._d&&ji(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function xv(e,t){if(Ht===null)return e;const s=al(Ht),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ve]=t[a];i&&($e(i)&&(i={mounted:i,updated:i}),i.deep&&hn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function Qs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(kn(),bs(r,s,8,[e.el,o,e,t]),Sn())}}function Ti(e,t){if(Bt){let s=Bt.provides;const n=Bt.parent&&Bt.parent.provides;n===s&&(s=Bt.provides=Object.create(n)),s[e]=t}}function Is(e,t,s=!1){const n=is();if(n||la){let a=la?la._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&$e(t)?t.call(n&&n.proxy):t}}function _v(){return!!(is()||la)}const Kp=Symbol.for("v-scx"),Wp=()=>Is(Kp);function wv(e,t){return tl(e,null,t)}function kv(e,t){return tl(e,null,{flush:"post"})}function Zp(e,t){return tl(e,null,{flush:"sync"})}function as(e,t,s){return tl(e,t,s)}function tl(e,t,s=Ve){const{immediate:n,deep:a,flush:i,once:l}=s,o=je({},s),r=t&&n||!t&&i!=="post";let c;if(ua){if(i==="sync"){const f=Wp();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!r){const f=()=>{};return f.stop=zt,f.resume=zt,f.pause=zt,f}}const d=Bt;o.call=(f,m,b)=>bs(f,d,m,b);let u=!1;i==="post"?o.scheduler=f=>{Ct(f,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(f,m)=>{m?f():rc(f)}),o.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=cv(e,t,o);return ua&&(c?c.push(p):r&&p()),p}function Sv(e,t,s){const n=this.proxy,a=Ue(e)?e.includes(".")?Jp(n,e):()=>n[e]:e.bind(n,n);let i;$e(t)?i=t:(i=t.handler,s=t);const l=ii(this),o=tl(a,i.bind(n),s);return l(),o}function Jp(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Ln=new WeakMap,Yp=Symbol("_vte"),Qp=e=>e.__isTeleport,ta=e=>e&&(e.disabled||e.disabled===""),Tv=e=>e&&(e.defer||e.defer===""),md=e=>typeof SVGElement<"u"&&e instanceof SVGElement,gd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,_r=(e,t)=>{const s=e&&e.to;return Ue(s)?t?t(s):null:s},Cv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:b,createComment:A,parentNode:I}}=c,k=ta(t.props);let{dynamicChildren:v}=t;const _=(T,y,w)=>{T.shapeFlag&16&&d(T.children,y,w,a,i,l,o,r)},E=(T=t)=>{const y=ta(T.props),w=T.target=_r(T.props,m),L=wr(w,T,b,f);w&&(l!=="svg"&&md(w)?l="svg":l!=="mathml"&&gd(w)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(w),y||(_(T,w,L),bi(T,!1)))},g=T=>{const y=()=>{if(Ln.get(T)===y){if(Ln.delete(T),ta(T.props)){const w=I(T.el)||s;_(T,w,T.anchor),bi(T,!0)}E(T)}};Ln.set(T,y),Ct(y,i)};if(e==null){const T=t.el=b(""),y=t.anchor=b("");if(f(T,s,n),f(y,s,n),Tv(t.props)||i&&i.pendingBranch){g(t);return}k&&(_(t,s,y),bi(t,!0)),E()}else{t.el=e.el;const T=t.anchor=e.anchor,y=Ln.get(e);if(y){y.flags|=8,Ln.delete(e),g(t);return}t.targetStart=e.targetStart;const w=t.target=e.target,L=t.targetAnchor=e.targetAnchor,F=ta(e.props),M=F?s:w,D=F?T:L;if(l==="svg"||md(w)?l="svg":(l==="mathml"||gd(w))&&(l="mathml"),v?(p(e.dynamicChildren,v,M,a,i,l,o),xc(e,t,!0)):r||u(e,t,M,D,a,i,l,o,!1),k)F?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):gl(t,s,T,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const $=t.target=_r(t.props,m);$&&gl(t,$,null,c,0)}else F&&gl(t,w,L,c,1);bi(t,k)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!ta(p),m=Ln.get(e);if(m&&(m.flags|=8,Ln.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let b=0;b<o.length;b++){const A=o[b];n(A,t,s,f,!!A.dynamicChildren)}},move:gl,hydrate:Ev};function gl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Ln.has(e)&&(!u||ta(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function Ev(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(A,I){let k=I;for(;k;){if(k&&k.nodeType===8){if(k.data==="teleport start anchor")t.targetStart=k;else if(k.data==="teleport anchor"){t.targetAnchor=k,A._lpa=t.targetAnchor&&l(t.targetAnchor);break}}k=l(k)}}function f(A,I){I.anchor=u(l(A),I,o(A),s,n,a,i)}const m=t.target=_r(t.props,r),b=ta(t.props);if(m){const A=m._lpa||m.firstChild;t.shapeFlag&16&&(b?(f(e,t),p(m,A),t.targetAnchor||wr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,A),t.targetAnchor||wr(m,t,d,c),u(A&&l(A),t,m,s,n,a,i))),bi(t,b)}else b&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Av=Cv;function bi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function wr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Yp]=l,e&&(n(i,e,a),n(l,e,a)),l}const Cs=Symbol("_leaveCb"),di=Symbol("_enterCb");function dc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Ao(()=>{e.isUnmounting=!0}),e}const Ts=[Function,Array],uc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ts,onEnter:Ts,onAfterEnter:Ts,onEnterCancelled:Ts,onBeforeLeave:Ts,onLeave:Ts,onAfterLeave:Ts,onLeaveCancelled:Ts,onBeforeAppear:Ts,onAppear:Ts,onAfterAppear:Ts,onAppearCancelled:Ts},Xp=e=>{const t=e.subTree;return t.component?Xp(t.component):t},Rv={name:"BaseTransition",props:uc,setup(e,{slots:t}){const s=is(),n=dc();return()=>{const a=t.default&&To(t.default(),!0),i=a&&a.length?ef(a):s.subTree?Ff():void 0;if(!i)return;const l=We(e),{mode:o}=l;if(n.isLeaving)return Ko(i);const r=vd(i);if(!r)return Ko(i);let c=Ga(r,l,n,s,u=>c=u);r.type!==Tt&&Tn(r,c);let d=s.subTree&&vd(s.subTree);if(d&&d.type!==Tt&&!$s(d,r)&&Xp(s).type!==Tt){let u=Ga(d,l,n,s);if(Tn(d,u),o==="out-in"&&r.type!==Tt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Ko(i);o==="in-out"&&r.type!==Tt?u.delayLeave=(p,f,m)=>{const b=sf(n,d);b[String(d.key)]=d,p[Cs]=()=>{f(),p[Cs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function ef(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Tt){t=s;break}}return t}const tf=Rv;function sf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Ga(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:b,onBeforeAppear:A,onAppear:I,onAfterAppear:k,onAppearCancelled:v}=t,_=String(e.key),E=sf(s,e),g=(w,L)=>{w&&bs(w,n,9,L)},T=(w,L)=>{const F=L[1];g(w,L),Ce(w)?w.every(M=>M.length<=1)&&F():w.length<=1&&F()},y={mode:l,persisted:o,beforeEnter(w){let L=r;if(!s.isMounted)if(i)L=A||r;else return;w[Cs]&&w[Cs](!0);const F=E[_];F&&$s(e,F)&&F.el[Cs]&&F.el[Cs](),g(L,[w])},enter(w){if(E[_]===e)return;let L=c,F=d,M=u;if(!s.isMounted)if(i)L=I||c,F=k||d,M=v||u;else return;let D=!1;w[di]=P=>{D||(D=!0,P?g(M,[w]):g(F,[w]),y.delayedLeave&&y.delayedLeave(),w[di]=void 0)};const $=w[di].bind(null,!1);L?T(L,[w,$]):$()},leave(w,L){const F=String(e.key);if(w[di]&&w[di](!0),s.isUnmounting)return L();g(p,[w]);let M=!1;w[Cs]=$=>{M||(M=!0,L(),$?g(b,[w]):g(m,[w]),w[Cs]=void 0,E[F]===e&&delete E[F])};const D=w[Cs].bind(null,!1);E[F]=e,f?T(f,[w,D]):D()},clone(w){const L=Ga(w,t,s,n,a);return a&&a(L),L}};return y}function Ko(e){if(nl(e))return e=sn(e),e.children=null,e}function vd(e){if(!nl(e))return Qp(e.type)&&e.children?ef(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&$e(s.default))return s.default()}}function Tn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Tn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function To(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Pt?(l.patchFlag&128&&a++,n=n.concat(To(l.children,t,o))):(t||l.type!==Tt)&&n.push(o!=null?sn(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function sl(e,t){return $e(e)?je({name:e.name},t,{setup:e}):e}function Iv(){const e=is();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function pc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Ov(e){const t=is(),s=lc(null);if(t){const a=t.refs===Ve?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function bd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const zl=new WeakMap;function Ba(e,t,s,n,a=!1){if(Ce(e)){e.forEach((b,A)=>Ba(b,t&&(Ce(t)?t[A]:t),s,n,a));return}if(xn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ba(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?al(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ve?o.refs={}:o.refs,u=o.setupState,p=We(u),f=u===Ve?Na:b=>bd(d,b)?!1:et(p,b),m=(b,A)=>!(A&&bd(d,A));if(c!=null&&c!==r){if(yd(t),Ue(c))d[c]=null,f(c)&&(u[c]=null);else if(Rt(c)){const b=t;m(c,b.k)&&(c.value=null),b.k&&(d[b.k]=null)}}if($e(r))ai(r,o,12,[l,d]);else{const b=Ue(r),A=Rt(r);if(b||A){const I=()=>{if(e.f){const k=b?f(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ce(k)&&Xr(k,i);else if(Ce(k))k.includes(i)||k.push(i);else if(b)d[r]=[i],f(r)&&(u[r]=d[r]);else{const v=[i];m(r,e.k)&&(r.value=v),e.k&&(d[e.k]=v)}}else b?(d[r]=l,f(r)&&(u[r]=l)):A&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const k=()=>{I(),zl.delete(e)};k.id=-1,zl.set(e,k),Ct(k,s)}else yd(e),I()}}}function yd(e){const t=zl.get(e);t&&(t.flags|=8,zl.delete(e))}let xd=!1;const Sa=()=>{xd||(console.error("Hydration completed but contains mismatches."),xd=!0)},Lv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Nv=e=>e.namespaceURI.includes("MathML"),vl=e=>{if(e.nodeType===1){if(Lv(e))return"svg";if(Nv(e))return"mathml"}},Da=e=>e.nodeType===8;function Dv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(v,_)=>{if(!_.hasChildNodes()){s(null,v,_),Hl(),_._vnode=v;return}u(_.firstChild,v,null,null,null),Hl(),_._vnode=v},u=(v,_,E,g,T,y=!1)=>{y=y||!!_.dynamicChildren;const w=Da(v)&&v.data==="[",L=()=>b(v,_,E,g,T,w),{type:F,ref:M,shapeFlag:D,patchFlag:$}=_;let P=v.nodeType;_.el=v,$===-2&&(y=!1,_.dynamicChildren=null);let z=null;switch(F){case $n:P!==3?_.children===""?(r(_.el=a(""),l(v),v),z=v):z=L():(v.data!==_.children&&(Sa(),v.data=_.children),z=i(v));break;case Tt:k(v)?(z=i(v),I(_.el=v.content.firstChild,v,E)):P!==8||w?z=L():z=i(v);break;case oa:if(w&&(v=i(v),P=v.nodeType),P===1||P===3){z=v;const B=!_.children.length;for(let C=0;C<_.staticCount;C++)B&&(_.children+=z.nodeType===1?z.outerHTML:z.data),C===_.staticCount-1&&(_.anchor=z),z=i(z);return w?i(z):z}else L();break;case Pt:w?z=m(v,_,E,g,T,y):z=L();break;default:if(D&1)(P!==1||_.type.toLowerCase()!==v.tagName.toLowerCase())&&!k(v)?z=L():z=p(v,_,E,g,T,y);else if(D&6){_.slotScopeIds=T;const B=l(v);if(w?z=A(v):Da(v)&&v.data==="teleport start"?z=A(v,v.data,"teleport end"):z=i(v),t(_,B,null,E,g,vl(B),y),xn(_)&&!_.type.__asyncResolved){let C;w?(C=mt(Pt),C.anchor=z?z.previousSibling:B.lastChild):C=v.nodeType===3?wc(""):mt("div"),C.el=v,_.component.subTree=C}}else D&64?P!==8?z=L():z=_.type.hydrate(v,_,E,g,T,y,e,f):D&128&&(z=_.type.hydrate(v,_,E,g,vl(l(v)),T,y,e,u))}return M!=null&&Ba(M,null,g,_),z},p=(v,_,E,g,T,y)=>{y=y||!!_.dynamicChildren;const{type:w,props:L,patchFlag:F,shapeFlag:M,dirs:D,transition:$}=_,P=w==="input"||w==="option";if(P||F!==-1){D&&Qs(_,null,E,"created");let z=!1;if(k(v)){z=Af(null,$)&&E&&E.vnode.props&&E.vnode.props.appear;const C=v.content.firstChild;if(z){const ee=C.getAttribute("class");ee&&(C.$cls=ee),$.beforeEnter(C)}I(C,v,E),_.el=v=C}if(M&16&&!(L&&(L.innerHTML||L.textContent))){let C=f(v.firstChild,_,v,E,g,T,y);for(C&&!bl(v,1)&&Sa();C;){const ee=C;C=C.nextSibling,o(ee)}}else if(M&8){let C=_.children;C[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(C=C.slice(1));const{textContent:ee}=v;ee!==C&&ee!==C.replace(/\r\n|\r/g,`
`)&&(bl(v,0)||Sa(),v.textContent=_.children)}if(L){if(P||!y||F&48){const C=v.tagName.includes("-");for(const ee in L)(P&&(ee.endsWith("value")||ee==="indeterminate")||ha(ee)&&!bn(ee)||ee[0]==="."||C&&!bn(ee))&&n(v,ee,null,L[ee],void 0,E)}else if(L.onClick)n(v,"onClick",null,L.onClick,void 0,E);else if(F&4&&yn(L.style))for(const C in L.style)L.style[C]}let B;(B=L&&L.onVnodeBeforeMount)&&cs(B,E,_),D&&Qs(_,null,E,"beforeMount"),((B=L&&L.onVnodeMounted)||D||z)&&Lf(()=>{B&&cs(B,E,_),z&&$.enter(v),D&&Qs(_,null,E,"mounted")},g)}return v.nextSibling},f=(v,_,E,g,T,y,w)=>{w=w||!!_.dynamicChildren;const L=_.children,F=L.length;let M=!1;for(let D=0;D<F;D++){const $=w?L[D]:L[D]=us(L[D]),P=$.type===$n;v?(P&&!w&&D+1<F&&us(L[D+1]).type===$n&&(r(a(v.data.slice($.children.length)),E,i(v)),v.data=$.children),v=u(v,$,g,T,y,w)):P&&!$.children?r($.el=a(""),E):(M||(M=!0,bl(E,1)||Sa()),s(null,$,E,null,g,T,vl(E),y))}return v},m=(v,_,E,g,T,y)=>{const{slotScopeIds:w}=_;w&&(T=T?T.concat(w):w);const L=l(v),F=f(i(v),_,L,E,g,T,y);return F&&Da(F)&&F.data==="]"?i(_.anchor=F):(Sa(),r(_.anchor=c("]"),L,F),F)},b=(v,_,E,g,T,y)=>{if(bl(v.parentElement,1)||Sa(),_.el=null,y){const F=A(v);for(;;){const M=i(v);if(M&&M!==F)o(M);else break}}const w=i(v),L=l(v);return o(v),s(null,_,L,w,E,g,vl(L),T),E&&(E.vnode.el=_.el,Io(E,_.el)),w},A=(v,_="[",E="]")=>{let g=0;for(;v;)if(v=i(v),v&&Da(v)&&(v.data===_&&g++,v.data===E)){if(g===0)return i(v);g--}return v},I=(v,_,E)=>{const g=_.parentNode;g&&g.replaceChild(v,_);let T=E;for(;T;)T.vnode.el===_&&(T.vnode.el=T.subTree.el=v),T=T.parent},k=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[d,u]}const _d="data-allow-mismatch",Mv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function bl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(_d);)e=e.parentElement;const s=e&&e.getAttribute(_d);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Mv[t])}}const Pv=bo().requestIdleCallback||(e=>setTimeout(e,1)),Fv=bo().cancelIdleCallback||(e=>clearTimeout(e)),$v=(e=1e4)=>t=>{const s=Pv(t,{timeout:e});return()=>Fv(s)};function Uv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Bv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Uv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Hv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},zv=(e=[])=>(t,s)=>{Ue(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function jv(e,t){if(Da(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Da(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const xn=e=>!!e.type.__asyncLoader;function Vv(e){$e(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(b=>{if(b=b instanceof Error?b:new Error(String(b)),r)return new Promise((A,I)=>{r(b,()=>A(p()),()=>I(b),u+1)});throw b}).then(b=>m!==c&&c?c:(b&&(b.__esModule||b[Symbol.toStringTag]==="Module")&&(b=b.default),d=b,b)))};return sl({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,b,A){let I=!1;(b.bu||(b.bu=[])).push(()=>I=!0);const k=()=>{I||A()},v=i?()=>{const _=i(k,E=>jv(m,E));_&&(b.bum||(b.bum=[])).push(_)}:k;d?v():f().then(()=>!b.isUnmounted&&v())},get __asyncResolved(){return d},setup(){const m=Bt;if(pc(m),d)return()=>yl(d,m);const b=E=>{c=null,va(E,m,13,!n)};if(o&&m.suspense||ua)return f().then(E=>()=>yl(E,m)).catch(E=>(b(E),()=>n?mt(n,{error:E}):null));const A=h(!1),I=h(),k=h(!!a);let v,_;return _t(()=>{v!=null&&clearTimeout(v),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{m.isUnmounted||(k.value=!1)},a)),l!=null&&(v=setTimeout(()=>{if(!m.isUnmounted&&!A.value&&!I.value){const E=new Error(`Async component timed out after ${l}ms.`);b(E),I.value=E}},l)),f().then(()=>{m.isUnmounted||(A.value=!0,m.parent&&nl(m.parent.vnode)&&m.parent.update())}).catch(E=>{if(m.isUnmounted){c=null;return}b(E),I.value=E}),()=>{if(A.value&&d)return yl(d,m);if(I.value&&n)return mt(n,{error:I.value});if(s&&!k.value)return yl(s,m)}}})}function yl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=mt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const nl=e=>e.type.__isKeepAlive,qv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=is(),n=s.ctx;if(!n.renderer)return()=>{const k=t.default&&t.default();return k&&k.length===1?k[0]:k};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(k,v,_,E,g)=>{const T=k.component;c(k,v,_,0,o),r(T.vnode,k,v,_,T,o,E,k.slotScopeIds,g),Ct(()=>{T.isDeactivated=!1,T.a&&$a(T.a);const y=k.props&&k.props.onVnodeMounted;y&&cs(y,T.parent,k)},o)},n.deactivate=k=>{const v=k.component;Vl(v.m),Vl(v.a),c(k,p,null,1,o),Ct(()=>{v.da&&$a(v.da);const _=k.props&&k.props.onVnodeUnmounted;_&&cs(_,v.parent,k),v.isDeactivated=!0},o)};function f(k){Wo(k),d(k,s,o,!0)}function m(k){a.forEach((v,_)=>{const E=Or(xn(v)?v.type.__asyncResolved||{}:v.type);E&&!k(E)&&b(_)})}function b(k){const v=a.get(k);v&&(!l||!$s(v,l))?f(v):l&&Wo(l),a.delete(k),i.delete(k)}as(()=>[e.include,e.exclude],([k,v])=>{k&&m(_=>yi(k,_)),v&&m(_=>!yi(v,_))},{flush:"post",deep:!0});let A=null;const I=()=>{A!=null&&(ql(s.subTree.type)?Ct(()=>{a.set(A,xl(s.subTree))},s.subTree.suspense):a.set(A,xl(s.subTree)))};return Ge(I),Eo(I),Ao(()=>{a.forEach(k=>{const{subTree:v,suspense:_}=s,E=xl(v);if(k.type===E.type&&k.key===E.key){Wo(E);const g=E.component.da;g&&Ct(g,_);return}f(k)})}),()=>{if(A=null,!t.default)return l=null;const k=t.default(),v=k[0];if(k.length>1)return l=null,k;if(!Cn(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let _=xl(v);if(_.type===Tt)return l=null,_;const E=_.type,g=Or(xn(_)?_.type.__asyncResolved||{}:E),{include:T,exclude:y,max:w}=e;if(T&&(!g||!yi(T,g))||y&&g&&yi(y,g))return _.shapeFlag&=-257,l=_,v;const L=_.key==null?E:_.key,F=a.get(L);return _.el&&(_=sn(_),v.shapeFlag&128&&(v.ssContent=_)),A=L,F?(_.el=F.el,_.component=F.component,_.transition&&Tn(_,_.transition),_.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),w&&i.size>parseInt(w,10)&&b(i.values().next().value)),_.shapeFlag|=256,l=_,ql(v.type)?v:_}}},Gv=qv;function yi(e,t){return Ce(e)?e.some(s=>yi(s,t)):Ue(e)?e.split(",").includes(t):sg(e)?(e.lastIndex=0,e.test(t)):!1}function xs(e,t){nf(e,"a",t)}function _s(e,t){nf(e,"da",t)}function nf(e,t,s=Bt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Co(t,n,s),s){let a=s.parent;for(;a&&a.parent;)nl(a.parent.vnode)&&Kv(n,t,s,a),a=a.parent}}function Kv(e,t,s,n){const a=Co(t,e,n,!0);_t(()=>{Xr(n[t],a)},s)}function Wo(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function xl(e){return e.shapeFlag&128?e.ssContent:e}function Co(e,t,s=Bt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{kn();const o=ii(s),r=bs(t,s,e,l);return o(),Sn(),r});return n?a.unshift(i):a.push(i),i}}const En=e=>(t,s=Bt)=>{(!ua||e==="sp")&&Co(e,(...n)=>t(...n),s)},af=En("bm"),Ge=En("m"),fc=En("bu"),Eo=En("u"),Ao=En("bum"),_t=En("um"),lf=En("sp"),of=En("rtg"),rf=En("rtc");function cf(e,t=Bt){Co("ec",e,t)}const hc="components",Wv="directives";function Zv(e,t){return mc(hc,e,!0,t)||e}const df=Symbol.for("v-ndc");function Jv(e){return Ue(e)?mc(hc,e,!1)||e:e||df}function Yv(e){return mc(Wv,e)}function mc(e,t,s=!0,n=!1){const a=Ht||Bt;if(a){const i=a.type;if(e===hc){const o=Or(i,!1);if(o&&(o===t||o===ot(t)||o===ga(ot(t))))return i}const l=wd(a[e]||i[e],t)||wd(a.appContext[e],t);return!l&&n?i:l}}function wd(e,t){return e&&(e[t]||e[ot(t)]||e[ga(ot(t))])}function Qv(e,t,s,n){let a;const i=s&&s[n],l=Ce(e);if(l||Ue(e)){const o=l&&yn(e);let r=!1,c=!1;o&&(r=!hs(e),c=tn(e),e=_o(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?qa(Hs(e[d])):Hs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function Xv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ce(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function eb(e,t,s={},n,a){if(Ht.ce||Ht.parent&&xn(Ht.parent)&&Ht.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),zi(),Gl(Pt,null,[mt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),zi();const l=i&&gc(i(s)),o=s.key||l&&l.key,r=Gl(Pt,{key:(o&&!Jt(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function gc(e){return e.some(t=>Cn(t)?!(t.type===Tt||t.type===Pt&&!gc(t.children)):!0)?e:null}function tb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Fa(n)]=e[n];return s}const kr=e=>e?Bf(e)?al(e):kr(e.parent):null,Ci=je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>kr(e.parent),$root:e=>kr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>vc(e),$forceUpdate:e=>e.f||(e.f=()=>{rc(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Sv.bind(e)}),Zo=(e,t)=>e!==Ve&&!e.__isScriptSetup&&et(e,t),Sr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Zo(n,t))return l[t]=1,n[t];if(a!==Ve&&et(a,t))return l[t]=2,a[t];if(et(i,t))return l[t]=3,i[t];if(s!==Ve&&et(s,t))return l[t]=4,s[t];Tr&&(l[t]=0)}}const c=Ci[t];let d,u;if(c)return t==="$attrs"&&Gt(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ve&&et(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,et(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Zo(a,t)?(a[t]=s,!0):n!==Ve&&et(n,t)?(n[t]=s,!0):et(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ve&&o[0]!=="$"&&et(e,o)||Zo(t,o)||et(i,o)||et(n,o)||et(Ci,o)||et(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:et(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},sb=je({},Sr,{get(e,t){if(t!==Symbol.unscopables)return Sr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!cg(t)}});function nb(){return null}function ab(){return null}function ib(e){}function lb(e){}function ob(){return null}function rb(){}function cb(e,t){return null}function db(){return uf().slots}function ub(){return uf().attrs}function uf(e){const t=is();return t.setupContext||(t.setupContext=Vf(t))}function Bi(e){return Ce(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function pb(e,t){const s=Bi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ce(a)||$e(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function fb(e,t){return!e||!t?e||t:Ce(e)&&Ce(t)?e.concat(t):je({},Bi(e),Bi(t))}function hb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function mb(e){const t=is(),s=ua;let n=e();Vi(),s&&za(!1);const a=()=>{ii(t),s&&za(!0)},i=()=>{is()!==t&&t.scope.off(),Vi(),s&&za(!1)};return ec(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Tr=!0;function gb(e){const t=vc(e),s=e.proxy,n=e.ctx;Tr=!1,t.beforeCreate&&kd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:b,deactivated:A,beforeDestroy:I,beforeUnmount:k,destroyed:v,unmounted:_,render:E,renderTracked:g,renderTriggered:T,errorCaptured:y,serverPrefetch:w,expose:L,inheritAttrs:F,components:M,directives:D,filters:$}=t;if(c&&vb(c,n,null),l)for(const B in l){const C=l[B];$e(C)&&(n[B]=C.bind(s))}if(a){const B=a.call(s,s);Xe(B)&&(e.data=Hn(B))}if(Tr=!0,i)for(const B in i){const C=i[B],ee=$e(C)?C.bind(s,s):$e(C.get)?C.get.bind(s,s):zt,_e=!$e(C)&&$e(C.set)?C.set.bind(s):zt,Ee=W({get:ee,set:_e});Object.defineProperty(n,B,{enumerable:!0,configurable:!0,get:()=>Ee.value,set:ie=>Ee.value=ie})}if(o)for(const B in o)pf(o[B],n,s,B);if(r){const B=$e(r)?r.call(s):r;Reflect.ownKeys(B).forEach(C=>{Ti(C,B[C])})}d&&kd(d,e,"c");function z(B,C){Ce(C)?C.forEach(ee=>B(ee.bind(s))):C&&B(C.bind(s))}if(z(af,u),z(Ge,p),z(fc,f),z(Eo,m),z(xs,b),z(_s,A),z(cf,y),z(rf,g),z(of,T),z(Ao,k),z(_t,_),z(lf,w),Ce(L))if(L.length){const B=e.exposed||(e.exposed={});L.forEach(C=>{Object.defineProperty(B,C,{get:()=>s[C],set:ee=>s[C]=ee,enumerable:!0})})}else e.exposed||(e.exposed={});E&&e.render===zt&&(e.render=E),F!=null&&(e.inheritAttrs=F),M&&(e.components=M),D&&(e.directives=D),w&&pc(e)}function vb(e,t,s=zt){Ce(e)&&(e=Cr(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=Is(a.from||n,a.default,!0):i=Is(a.from||n):i=Is(a),Rt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function kd(e,t,s){bs(Ce(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function pf(e,t,s,n){let a=n.includes(".")?Jp(s,n):()=>s[n];if(Ue(e)){const i=t[e];$e(i)&&as(a,i)}else if($e(e))as(a,e.bind(s));else if(Xe(e))if(Ce(e))e.forEach(i=>pf(i,t,s,n));else{const i=$e(e.handler)?e.handler.bind(s):t[e.handler];$e(i)&&as(a,i,e)}}function vc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>jl(r,c,l,!0)),jl(r,t,l)),Xe(t)&&i.set(t,r),r}function jl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&jl(e,i,s,!0),a&&a.forEach(l=>jl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=bb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const bb={data:Sd,props:Td,emits:Td,methods:xi,computed:xi,beforeCreate:Xt,created:Xt,beforeMount:Xt,mounted:Xt,beforeUpdate:Xt,updated:Xt,beforeDestroy:Xt,beforeUnmount:Xt,destroyed:Xt,unmounted:Xt,activated:Xt,deactivated:Xt,errorCaptured:Xt,serverPrefetch:Xt,components:xi,directives:xi,watch:xb,provide:Sd,inject:yb};function Sd(e,t){return t?e?function(){return je($e(e)?e.call(this,this):e,$e(t)?t.call(this,this):t)}:t:e}function yb(e,t){return xi(Cr(e),Cr(t))}function Cr(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Xt(e,t){return e?[...new Set([].concat(e,t))]:t}function xi(e,t){return e?je(Object.create(null),e,t):t}function Td(e,t){return e?Ce(e)&&Ce(t)?[...new Set([...e,...t])]:je(Object.create(null),Bi(e),Bi(t??{})):t}function xb(e,t){if(!e)return t;if(!t)return e;const s=je(Object.create(null),e);for(const n in t)s[n]=Xt(e[n],t[n]);return s}function ff(){return{app:null,config:{isNativeTag:Na,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let _b=0;function wb(e,t){return function(n,a=null){$e(n)||(n=je({},n)),a!=null&&!Xe(a)&&(a=null);const i=ff(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:_b++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Gf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&$e(d.install)?(l.add(d),d.install(c,...u)):$e(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const f=c._ceVNode||mt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),r=!0,c._container=d,d.__vue_app__=c,al(f.component)}},onUnmount(d){o.push(d)},unmount(){r&&(bs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=la;la=c;try{return d()}finally{la=u}}};return c}}let la=null;function kb(e,t,s=Ve){const n=is(),a=ot(t),i=ps(t),l=hf(e,a),o=Up((r,c)=>{let d,u=Ve,p;return Zp(()=>{const f=e[a];Mt(d,f)&&(d=f,c())}),{get(){return r(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!Mt(m,d)&&!(u!==Ve&&Mt(f,u)))return;const b=n.vnode.props,A=!!(b&&(t in b||a in b||i in b)&&(`onUpdate:${t}`in b||`onUpdate:${a}`in b||`onUpdate:${i}`in b));A||(d=f,c()),n.emit(`update:${t}`,m),Mt(f,u)&&(Mt(f,m)&&!Mt(m,p)||A&&u!==Ve&&!Mt(m,d))&&c(),u=f,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ve:o,done:!1}:{done:!0}}}},o}const hf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${ot(t)}Modifiers`]||e[`${ps(t)}Modifiers`];function Sb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ve;let a=s;const i=t.startsWith("update:"),l=i&&hf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Ue(d)?d.trim():d)),l.number&&(a=s.map(vo)));let o,r=n[o=Fa(t)]||n[o=Fa(ot(t))];!r&&i&&(r=n[o=Fa(ps(t))]),r&&bs(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,bs(c,e,6,a)}}const Tb=new WeakMap;function mf(e,t,s=!1){const n=s?Tb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!$e(e)){const r=c=>{const d=mf(c,t,!0);d&&(o=!0,je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(Xe(e)&&n.set(e,null),null):(Ce(i)?i.forEach(r=>l[r]=null):je(l,i),Xe(e)&&n.set(e,l),l)}function Ro(e,t){return!e||!ha(t)?!1:(t=t.slice(2).replace(/Once$/,""),et(e,t[0].toLowerCase()+t.slice(1))||et(e,ps(t))||et(e,t))}function Rl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:b}=e,A=Ui(e);let I,k;try{if(s.shapeFlag&4){const _=a||n,E=_;I=us(c.call(E,_,d,u,f,p,m)),k=o}else{const _=t;I=us(_.length>1?_(u,{attrs:o,slots:l,emit:r}):_(u,null)),k=t.props?o:Eb(o)}}catch(_){Ei.length=0,va(_,e,1),I=mt(Tt)}let v=I;if(k&&b!==!1){const _=Object.keys(k),{shapeFlag:E}=v;_.length&&E&7&&(i&&_.some(fo)&&(k=Ab(k,i)),v=sn(v,k,!1,!0))}return s.dirs&&(v=sn(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&Tn(v,s.transition),I=v,Ui(A),I}function Cb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Cn(a)){if(a.type!==Tt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Eb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ha(s))&&((t||(t={}))[s]=e[s]);return t},Ab=(e,t)=>{const s={};for(const n in e)(!fo(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Rb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?Cd(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(gf(l,n,p)&&!Ro(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?Cd(n,l,c):!0:!!l;return!1}function Cd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(gf(t,e,i)&&!Ro(s,i))return!0}return!1}function gf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!wn(n,a):n!==a}function Io({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const vf={},bf=()=>Object.create(vf),yf=e=>Object.getPrototypeOf(e)===vf;function Ib(e,t,s,n=!1){const a={},i=bf();e.propsDefaults=Object.create(null),xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:ic(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Ob(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=We(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Ro(e.emitsOptions,p))continue;const f=t[p];if(r)if(et(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=ot(p);a[m]=Er(r,o,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{xf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!et(t,u)&&((d=ps(u))===u||!et(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Er(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!et(t,u))&&(delete i[u],c=!0)}c&&fn(e.attrs,"set","")}function xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(bn(r))continue;const c=t[r];let d;a&&et(a,d=ot(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Ro(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=We(s),c=o||Ve;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Er(a,r,u,c[u],e,!et(c,u))}}return l}function Er(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=et(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&$e(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=ii(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===ps(s))&&(n=!0))}return n}const Lb=new WeakMap;function _f(e,t,s=!1){const n=s?Lb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!$e(e)){const d=u=>{r=!0;const[p,f]=_f(u,t,!0);je(l,p),f&&o.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return Xe(e)&&n.set(e,Ma),Ma;if(Ce(i))for(let d=0;d<i.length;d++){const u=ot(i[d]);Ed(u)&&(l[u]=Ve)}else if(i)for(const d in i){const u=ot(d);if(Ed(u)){const p=i[d],f=l[u]=Ce(p)||$e(p)?{type:p}:je({},p),m=f.type;let b=!1,A=!0;if(Ce(m))for(let I=0;I<m.length;++I){const k=m[I],v=$e(k)&&k.name;if(v==="Boolean"){b=!0;break}else v==="String"&&(A=!1)}else b=$e(m)&&m.name==="Boolean";f[0]=b,f[1]=A,(b||et(f,"default"))&&o.push(u)}}const c=[l,o];return Xe(e)&&n.set(e,c),c}function Ed(e){return e[0]!=="$"&&!bn(e)}const bc=e=>e==="_"||e==="_ctx"||e==="$stable",yc=e=>Ce(e)?e.map(us):[us(e)],Nb=(e,t,s)=>{if(t._n)return t;const n=cc((...a)=>yc(t(...a)),s);return n._c=!1,n},wf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(bc(a))continue;const i=e[a];if($e(i))t[a]=Nb(a,i,n);else if(i!=null){const l=yc(i);t[a]=()=>l}}},kf=(e,t)=>{const s=yc(t);e.slots.default=()=>s},Sf=(e,t,s)=>{for(const n in t)(s||!bc(n))&&(e[n]=t[n])},Db=(e,t,s)=>{const n=e.slots=bf();if(e.vnode.shapeFlag&32){const a=t._;a?(Sf(n,t,s),s&&mp(n,"_",a,!0)):wf(t,n)}else t&&kf(e,t)},Mb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ve;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Sf(a,t,s):(i=!t.$stable,wf(t,a)),l=t}else t&&(kf(e,t),l={default:1});if(i)for(const o in a)!bc(o)&&l[o]==null&&delete a[o]},Ct=Lf;function Tf(e){return Ef(e)}function Cf(e){return Ef(e,Dv)}function Ef(e,t){const s=bo();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=zt,insertStaticContent:m}=e,b=(S,O,U,te=null,J=null,X=null,he=void 0,ce=null,re=!!O.dynamicChildren)=>{if(S===O)return;S&&!$s(S,O)&&(te=H(S),ie(S,J,X,!0),S=null),O.patchFlag===-2&&(re=!1,O.dynamicChildren=null);const{type:ne,ref:ae,shapeFlag:me}=O;switch(ne){case $n:A(S,O,U,te);break;case Tt:I(S,O,U,te);break;case oa:S==null&&k(O,U,te,he);break;case Pt:M(S,O,U,te,J,X,he,ce,re);break;default:me&1?E(S,O,U,te,J,X,he,ce,re):me&6?D(S,O,U,te,J,X,he,ce,re):(me&64||me&128)&&ne.process(S,O,U,te,J,X,he,ce,re,ke)}ae!=null&&J?Ba(ae,S&&S.ref,X,O||S,!O):ae==null&&S&&S.ref!=null&&Ba(S.ref,null,X,S,!0)},A=(S,O,U,te)=>{if(S==null)n(O.el=o(O.children),U,te);else{const J=O.el=S.el;O.children!==S.children&&c(J,O.children)}},I=(S,O,U,te)=>{S==null?n(O.el=r(O.children||""),U,te):O.el=S.el},k=(S,O,U,te)=>{[S.el,S.anchor]=m(S.children,O,U,te,S.el,S.anchor)},v=({el:S,anchor:O},U,te)=>{let J;for(;S&&S!==O;)J=p(S),n(S,U,te),S=J;n(O,U,te)},_=({el:S,anchor:O})=>{let U;for(;S&&S!==O;)U=p(S),a(S),S=U;a(O)},E=(S,O,U,te,J,X,he,ce,re)=>{if(O.type==="svg"?he="svg":O.type==="math"&&(he="mathml"),S==null)g(O,U,te,J,X,he,ce,re);else{const ne=S.el&&S.el._isVueCE?S.el:null;try{ne&&ne._beginPatch(),w(S,O,J,X,he,ce,re)}finally{ne&&ne._endPatch()}}},g=(S,O,U,te,J,X,he,ce)=>{let re,ne;const{props:ae,shapeFlag:me,transition:xe,dirs:Le}=S;if(re=S.el=l(S.type,X,ae&&ae.is,ae),me&8?d(re,S.children):me&16&&y(S.children,re,null,te,J,Jo(S,X),he,ce),Le&&Qs(S,null,te,"created"),T(re,S,S.scopeId,he,te),ae){for(const de in ae)de!=="value"&&!bn(de)&&i(re,de,null,ae[de],X,te);"value"in ae&&i(re,"value",null,ae.value,X),(ne=ae.onVnodeBeforeMount)&&cs(ne,te,S)}Le&&Qs(S,null,te,"beforeMount");const j=Af(J,xe);j&&xe.beforeEnter(re),n(re,O,U),((ne=ae&&ae.onVnodeMounted)||j||Le)&&Ct(()=>{try{ne&&cs(ne,te,S),j&&xe.enter(re),Le&&Qs(S,null,te,"mounted")}finally{}},J)},T=(S,O,U,te,J)=>{if(U&&f(S,U),te)for(let X=0;X<te.length;X++)f(S,te[X]);if(J){let X=J.subTree;if(O===X||ql(X.type)&&(X.ssContent===O||X.ssFallback===O)){const he=J.vnode;T(S,he,he.scopeId,he.slotScopeIds,J.parent)}}},y=(S,O,U,te,J,X,he,ce,re=0)=>{for(let ne=re;ne<S.length;ne++){const ae=S[ne]=ce?un(S[ne]):us(S[ne]);b(null,ae,O,U,te,J,X,he,ce)}},w=(S,O,U,te,J,X,he)=>{const ce=O.el=S.el;let{patchFlag:re,dynamicChildren:ne,dirs:ae}=O;re|=S.patchFlag&16;const me=S.props||Ve,xe=O.props||Ve;let Le;if(U&&Jn(U,!1),(Le=xe.onVnodeBeforeUpdate)&&cs(Le,U,O,S),ae&&Qs(O,S,U,"beforeUpdate"),U&&Jn(U,!0),(me.innerHTML&&xe.innerHTML==null||me.textContent&&xe.textContent==null)&&d(ce,""),ne?L(S.dynamicChildren,ne,ce,U,te,Jo(O,J),X):he||C(S,O,ce,null,U,te,Jo(O,J),X,!1),re>0){if(re&16)F(ce,me,xe,U,J);else if(re&2&&me.class!==xe.class&&i(ce,"class",null,xe.class,J),re&4&&i(ce,"style",me.style,xe.style,J),re&8){const j=O.dynamicProps;for(let de=0;de<j.length;de++){const Se=j[de],Ie=me[Se],Ne=xe[Se];(Ne!==Ie||Se==="value")&&i(ce,Se,Ie,Ne,J,U)}}re&1&&S.children!==O.children&&d(ce,O.children)}else!he&&ne==null&&F(ce,me,xe,U,J);((Le=xe.onVnodeUpdated)||ae)&&Ct(()=>{Le&&cs(Le,U,O,S),ae&&Qs(O,S,U,"updated")},te)},L=(S,O,U,te,J,X,he)=>{for(let ce=0;ce<O.length;ce++){const re=S[ce],ne=O[ce],ae=re.el&&(re.type===Pt||!$s(re,ne)||re.shapeFlag&198)?u(re.el):U;b(re,ne,ae,null,te,J,X,he,!0)}},F=(S,O,U,te,J)=>{if(O!==U){if(O!==Ve)for(const X in O)!bn(X)&&!(X in U)&&i(S,X,O[X],null,J,te);for(const X in U){if(bn(X))continue;const he=U[X],ce=O[X];he!==ce&&X!=="value"&&i(S,X,ce,he,J,te)}"value"in U&&i(S,"value",O.value,U.value,J)}},M=(S,O,U,te,J,X,he,ce,re)=>{const ne=O.el=S?S.el:o(""),ae=O.anchor=S?S.anchor:o("");let{patchFlag:me,dynamicChildren:xe,slotScopeIds:Le}=O;Le&&(ce=ce?ce.concat(Le):Le),S==null?(n(ne,U,te),n(ae,U,te),y(O.children||[],U,ae,J,X,he,ce,re)):me>0&&me&64&&xe&&S.dynamicChildren&&S.dynamicChildren.length===xe.length?(L(S.dynamicChildren,xe,U,J,X,he,ce),(O.key!=null||J&&O===J.subTree)&&xc(S,O,!0)):C(S,O,U,ae,J,X,he,ce,re)},D=(S,O,U,te,J,X,he,ce,re)=>{O.slotScopeIds=ce,S==null?O.shapeFlag&512?J.ctx.activate(O,U,te,he,re):$(O,U,te,J,X,he,re):P(S,O,re)},$=(S,O,U,te,J,X,he)=>{const ce=S.component=Uf(S,te,J);if(nl(S)&&(ce.ctx.renderer=ke),Hf(ce,!1,he),ce.asyncDep){if(J&&J.registerDep(ce,z,he),!S.el){const re=ce.subTree=mt(Tt);I(null,re,O,U),S.placeholder=re.el}}else z(ce,S,O,U,J,X,he)},P=(S,O,U)=>{const te=O.component=S.component;if(Rb(S,O,U))if(te.asyncDep&&!te.asyncResolved){B(te,O,U);return}else te.next=O,te.update();else O.el=S.el,te.vnode=O},z=(S,O,U,te,J,X,he)=>{const ce=()=>{if(S.isMounted){let{next:me,bu:xe,u:Le,parent:j,vnode:de}=S;{const it=Rf(S);if(it){me&&(me.el=de.el,B(S,me,he)),it.asyncDep.then(()=>{Ct(()=>{S.isUnmounted||ne()},J)});return}}let Se=me,Ie;Jn(S,!1),me?(me.el=de.el,B(S,me,he)):me=de,xe&&$a(xe),(Ie=me.props&&me.props.onVnodeBeforeUpdate)&&cs(Ie,j,me,de),Jn(S,!0);const Ne=Rl(S),ut=S.subTree;S.subTree=Ne,b(ut,Ne,u(ut.el),H(ut),S,J,X),me.el=Ne.el,Se===null&&Io(S,Ne.el),Le&&Ct(Le,J),(Ie=me.props&&me.props.onVnodeUpdated)&&Ct(()=>cs(Ie,j,me,de),J)}else{let me;const{el:xe,props:Le}=O,{bm:j,m:de,parent:Se,root:Ie,type:Ne}=S,ut=xn(O);if(Jn(S,!1),j&&$a(j),!ut&&(me=Le&&Le.onVnodeBeforeMount)&&cs(me,Se,O),Jn(S,!0),xe&&Be){const it=()=>{S.subTree=Rl(S),Be(xe,S.subTree,S,J,null)};ut&&Ne.__asyncHydrate?Ne.__asyncHydrate(xe,S,it):it()}else{Ie.ce&&Ie.ce._hasShadowRoot()&&Ie.ce._injectChildStyle(Ne,S.parent?S.parent.type:void 0);const it=S.subTree=Rl(S);b(null,it,U,te,S,J,X),O.el=it.el}if(de&&Ct(de,J),!ut&&(me=Le&&Le.onVnodeMounted)){const it=O;Ct(()=>cs(me,Se,it),J)}(O.shapeFlag&256||Se&&xn(Se.vnode)&&Se.vnode.shapeFlag&256)&&S.a&&Ct(S.a,J),S.isMounted=!0,O=U=te=null}};S.scope.on();const re=S.effect=new Di(ce);S.scope.off();const ne=S.update=re.run.bind(re),ae=S.job=re.runIfDirty.bind(re);ae.i=S,ae.id=S.uid,re.scheduler=()=>rc(ae),Jn(S,!0),ne()},B=(S,O,U)=>{O.component=S;const te=S.vnode.props;S.vnode=O,S.next=null,Ob(S,O.props,te,U),Mb(S,O.children,U),kn(),hd(S),Sn()},C=(S,O,U,te,J,X,he,ce,re=!1)=>{const ne=S&&S.children,ae=S?S.shapeFlag:0,me=O.children,{patchFlag:xe,shapeFlag:Le}=O;if(xe>0){if(xe&128){_e(ne,me,U,te,J,X,he,ce,re);return}else if(xe&256){ee(ne,me,U,te,J,X,he,ce,re);return}}Le&8?(ae&16&&Z(ne,J,X),me!==ne&&d(U,me)):ae&16?Le&16?_e(ne,me,U,te,J,X,he,ce,re):Z(ne,J,X,!0):(ae&8&&d(U,""),Le&16&&y(me,U,te,J,X,he,ce,re))},ee=(S,O,U,te,J,X,he,ce,re)=>{S=S||Ma,O=O||Ma;const ne=S.length,ae=O.length,me=Math.min(ne,ae);let xe;for(xe=0;xe<me;xe++){const Le=O[xe]=re?un(O[xe]):us(O[xe]);b(S[xe],Le,U,null,J,X,he,ce,re)}ne>ae?Z(S,J,X,!0,!1,me):y(O,U,te,J,X,he,ce,re,me)},_e=(S,O,U,te,J,X,he,ce,re)=>{let ne=0;const ae=O.length;let me=S.length-1,xe=ae-1;for(;ne<=me&&ne<=xe;){const Le=S[ne],j=O[ne]=re?un(O[ne]):us(O[ne]);if($s(Le,j))b(Le,j,U,null,J,X,he,ce,re);else break;ne++}for(;ne<=me&&ne<=xe;){const Le=S[me],j=O[xe]=re?un(O[xe]):us(O[xe]);if($s(Le,j))b(Le,j,U,null,J,X,he,ce,re);else break;me--,xe--}if(ne>me){if(ne<=xe){const Le=xe+1,j=Le<ae?O[Le].el:te;for(;ne<=xe;)b(null,O[ne]=re?un(O[ne]):us(O[ne]),U,j,J,X,he,ce,re),ne++}}else if(ne>xe)for(;ne<=me;)ie(S[ne],J,X,!0),ne++;else{const Le=ne,j=ne,de=new Map;for(ne=j;ne<=xe;ne++){const Re=O[ne]=re?un(O[ne]):us(O[ne]);Re.key!=null&&de.set(Re.key,ne)}let Se,Ie=0;const Ne=xe-j+1;let ut=!1,it=0;const Q=new Array(Ne);for(ne=0;ne<Ne;ne++)Q[ne]=0;for(ne=Le;ne<=me;ne++){const Re=S[ne];if(Ie>=Ne){ie(Re,J,X,!0);continue}let Fe;if(Re.key!=null)Fe=de.get(Re.key);else for(Se=j;Se<=xe;Se++)if(Q[Se-j]===0&&$s(Re,O[Se])){Fe=Se;break}Fe===void 0?ie(Re,J,X,!0):(Q[Fe-j]=ne+1,Fe>=it?it=Fe:ut=!0,b(Re,O[Fe],U,null,J,X,he,ce,re),Ie++)}const we=ut?Pb(Q):Ma;for(Se=we.length-1,ne=Ne-1;ne>=0;ne--){const Re=j+ne,Fe=O[Re],at=O[Re+1],Je=Re+1<ae?at.el||If(at):te;Q[ne]===0?b(null,Fe,U,Je,J,X,he,ce,re):ut&&(Se<0||ne!==we[Se]?Ee(Fe,U,Je,2):Se--)}}},Ee=(S,O,U,te,J=null)=>{const{el:X,type:he,transition:ce,children:re,shapeFlag:ne}=S;if(ne&6){Ee(S.component.subTree,O,U,te);return}if(ne&128){S.suspense.move(O,U,te);return}if(ne&64){he.move(S,O,U,ke);return}if(he===Pt){n(X,O,U);for(let me=0;me<re.length;me++)Ee(re[me],O,U,te);n(S.anchor,O,U);return}if(he===oa){v(S,O,U);return}if(te!==2&&ne&1&&ce)if(te===0)ce.persisted&&!X[Cs]?n(X,O,U):(ce.beforeEnter(X),n(X,O,U),Ct(()=>ce.enter(X),J));else{const{leave:me,delayLeave:xe,afterLeave:Le}=ce,j=()=>{S.ctx.isUnmounted?a(X):n(X,O,U)},de=()=>{const Se=X._isLeaving||!!X[Cs];X._isLeaving&&X[Cs](!0),ce.persisted&&!Se?j():me(X,()=>{j(),Le&&Le()})};xe?xe(X,j,de):de()}else n(X,O,U)},ie=(S,O,U,te=!1,J=!1)=>{const{type:X,props:he,ref:ce,children:re,dynamicChildren:ne,shapeFlag:ae,patchFlag:me,dirs:xe,cacheIndex:Le,memo:j}=S;if(me===-2&&(J=!1),ce!=null&&(kn(),Ba(ce,null,U,S,!0),Sn()),Le!=null&&(O.renderCache[Le]=void 0),ae&256){O.ctx.deactivate(S);return}const de=ae&1&&xe,Se=!xn(S);let Ie;if(Se&&(Ie=he&&he.onVnodeBeforeUnmount)&&cs(Ie,O,S),ae&6)ge(S.component,U,te);else{if(ae&128){S.suspense.unmount(U,te);return}de&&Qs(S,null,O,"beforeUnmount"),ae&64?S.type.remove(S,O,U,ke,te):ne&&!ne.hasOnce&&(X!==Pt||me>0&&me&64)?Z(ne,O,U,!1,!0):(X===Pt&&me&384||!J&&ae&16)&&Z(re,O,U),te&&be(S)}const Ne=j!=null&&Le==null;(Se&&(Ie=he&&he.onVnodeUnmounted)||de||Ne)&&Ct(()=>{Ie&&cs(Ie,O,S),de&&Qs(S,null,O,"unmounted"),Ne&&(S.el=null)},U)},be=S=>{const{type:O,el:U,anchor:te,transition:J}=S;if(O===Pt){se(U,te);return}if(O===oa){_(S);return}const X=()=>{a(U),J&&!J.persisted&&J.afterLeave&&J.afterLeave()};if(S.shapeFlag&1&&J&&!J.persisted){const{leave:he,delayLeave:ce}=J,re=()=>he(U,X);ce?ce(S.el,X,re):re()}else X()},se=(S,O)=>{let U;for(;S!==O;)U=p(S),a(S),S=U;a(O)},ge=(S,O,U)=>{const{bum:te,scope:J,job:X,subTree:he,um:ce,m:re,a:ne}=S;Vl(re),Vl(ne),te&&$a(te),J.stop(),X&&(X.flags|=8,ie(he,S,O,U)),ce&&Ct(ce,O),Ct(()=>{S.isUnmounted=!0},O)},Z=(S,O,U,te=!1,J=!1,X=0)=>{for(let he=X;he<S.length;he++)ie(S[he],O,U,te,J)},H=S=>{if(S.shapeFlag&6)return H(S.component.subTree);if(S.shapeFlag&128)return S.suspense.next();const O=p(S.anchor||S.el),U=O&&O[Yp];return U?p(U):O};let le=!1;const oe=(S,O,U)=>{let te;S==null?O._vnode&&(ie(O._vnode,null,null,!0),te=O._vnode.component):b(O._vnode||null,S,O,null,null,null,U),O._vnode=S,le||(le=!0,hd(te),Hl(),le=!1)},ke={p:b,um:ie,m:Ee,r:be,mt:$,mc:y,pc:C,pbc:L,n:H,o:e};let ye,Be;return t&&([ye,Be]=t(ke)),{render:oe,hydrate:ye,createApp:wb(oe,ye)}}function Jo({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Jn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Af(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function xc(e,t,s=!1){const n=e.children,a=t.children;if(Ce(n)&&Ce(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=un(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&xc(l,o)),o.type===$n&&(o.patchFlag===-1&&(o=a[i]=un(o)),o.el=l.el),o.type===Tt&&!o.el&&(o.el=l.el)}}function Pb(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Rf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Rf(t)}function Vl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function If(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?If(t.subTree):null}const ql=e=>e.__isSuspense;let Ar=0;const Fb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)Ub(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Bb(e,t,s,n,a,l,o,r,c)}},hydrate:Hb,normalize:zb},$b=Fb;function Hi(e,t){const s=e.props&&e.props[t];$e(s)&&s()}function Ub(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Of(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Hi(e,"onPending"),Hi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ha(p,e.ssFallback)):p.resolve(!1,!0)}function Bb(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:b,isInFallback:A,isHydrating:I}=u;if(b)u.pendingBranch=p,$s(b,p)?(r(b,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():A&&(I||(r(m,f,s,n,a,null,i,l,o),Ha(u,f)))):(u.pendingId=Ar++,I?(u.isHydrating=!1,u.activeBranch=b):c(b,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),A?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,f,s,n,a,null,i,l,o),Ha(u,f))):m&&$s(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&$s(m,p))r(m,p,s,n,a,u,i,l,o),Ha(u,p);else if(Hi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Ar++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:k,pendingId:v}=u;k>0?setTimeout(()=>{u.pendingId===v&&u.fallback(f)},k):k===0&&u.fallback(f)}}function Of(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:b,remove:A}}=c;let I;const k=jb(e);k&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const v=e.props?Pl(e.props.timeout):void 0,_=i,E={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Ar++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(g=!1,T=!1){const{vnode:y,activeBranch:w,pendingBranch:L,pendingId:F,effects:M,parentComponent:D,container:$,isInFallback:P}=E;let z=!1;if(E.isHydrating)E.isHydrating=!1;else if(!g){z=w&&L.transition&&L.transition.mode==="out-in";let ee=!1;z&&(w.transition.afterLeave=()=>{F===E.pendingId&&(p(L,$,i===_&&!ee?m(w):i,0),Fi(M),P&&y.ssFallback&&(y.ssFallback.el=null))}),w&&!E.isFallbackMountPending&&(b(w.el)===$&&(i=m(w),ee=!0),f(w,D,E,!0),!z&&P&&y.ssFallback&&Ct(()=>y.ssFallback.el=null,E)),z||p(L,$,i,0)}E.isFallbackMountPending=!1,Ha(E,L),E.pendingBranch=null,E.isInFallback=!1;let B=E.parent,C=!1;for(;B;){if(B.pendingBranch){B.effects.push(...M),C=!0;break}B=B.parent}!C&&!z&&Fi(M),E.effects=[],k&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!T&&t.resolve()),Hi(y,"onResolve")},fallback(g){if(!E.pendingBranch)return;const{vnode:T,activeBranch:y,parentComponent:w,container:L,namespace:F}=E;Hi(T,"onFallback");const M=m(y),D=()=>{E.isFallbackMountPending=!1,E.isInFallback&&(u(null,g,L,M,w,null,F,o,r),Ha(E,g))},$=g.transition&&g.transition.mode==="out-in";$&&(E.isFallbackMountPending=!0,y.transition.afterLeave=D),E.isInFallback=!0,f(y,w,null,!0),$||D()},move(g,T,y){E.activeBranch&&p(E.activeBranch,g,T,y),E.container=g},next(){return E.activeBranch&&m(E.activeBranch)},registerDep(g,T,y){const w=!!E.pendingBranch;w&&E.deps++;const L=g.vnode.el;g.asyncDep.catch(F=>{va(F,g,0)}).then(F=>{if(g.isUnmounted||E.isUnmounted||E.pendingId!==g.suspenseId)return;Vi(),g.asyncResolved=!0;const{vnode:M}=g;Rr(g,F,!1),L&&(M.el=L);const D=!L&&g.subTree.el;T(g,M,b(L||g.subTree.el),L?null:m(g.subTree),E,l,y),D&&(M.placeholder=null,A(D)),Io(g,M.el),w&&--E.deps===0&&E.resolve()})},unmount(g,T){E.isUnmounted=!0,E.activeBranch&&f(E.activeBranch,s,g,T),E.pendingBranch&&f(E.pendingBranch,s,g,T)}};return E}function Hb(e,t,s,n,a,i,l,o,r){const c=t.suspense=Of(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function zb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Ad(n?s.default:s),e.ssFallback=n?Ad(s.fallback):mt(Tt)}function Ad(e){let t;if($e(e)){const s=da&&e._c;s&&(e._d=!1,zi()),e=e(),s&&(e._d=!0,t=Kt,Nf())}return Ce(e)&&(e=Cb(e)),e=us(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Lf(e,t){t&&t.pendingBranch?Ce(e)?t.effects.push(...e):t.effects.push(e):Fi(e)}function Ha(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Io(n,a))}function jb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Pt=Symbol.for("v-fgt"),$n=Symbol.for("v-txt"),Tt=Symbol.for("v-cmt"),oa=Symbol.for("v-stc"),Ei=[];let Kt=null;function zi(e=!1){Ei.push(Kt=e?null:[])}function Nf(){Ei.pop(),Kt=Ei[Ei.length-1]||null}let da=1;function ji(e,t=!1){da+=e,e<0&&Kt&&t&&(Kt.hasOnce=!0)}function Df(e){return e.dynamicChildren=da>0?Kt||Ma:null,Nf(),da>0&&Kt&&Kt.push(e),e}function Vb(e,t,s,n,a,i){return Df(_c(e,t,s,n,a,i,!0))}function Gl(e,t,s,n,a){return Df(mt(e,t,s,n,a,!0))}function Cn(e){return e?e.__v_isVNode===!0:!1}function $s(e,t){return e.type===t.type&&e.key===t.key}function qb(e){}const Mf=({key:e})=>e??null,Il=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ue(e)||Rt(e)||$e(e)?{i:Ht,r:e,k:t,f:!!s}:e:null);function _c(e,t=null,s=null,n=0,a=null,i=e===Pt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Mf(t),ref:t&&Il(t),scopeId:So,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ht};return o?(kc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ue(s)?8:16),da>0&&!l&&Kt&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&Kt.push(r),r}const mt=Gb;function Gb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===df)&&(e=Tt),Cn(e)){const o=sn(e,t,!0);return s&&kc(o,s),da>0&&!i&&Kt&&(o.shapeFlag&6?Kt[Kt.indexOf(e)]=o:Kt.push(o)),o.patchFlag=-2,o}if(Xb(e)&&(e=e.__vccOpts),t){t=Pf(t);let{class:o,style:r}=t;o&&!Ue(o)&&(t.class=Xi(o)),Xe(r)&&(el(r)&&!Ce(r)&&(r=je({},r)),t.style=Qi(r))}const l=Ue(e)?1:ql(e)?128:Qp(e)?64:Xe(e)?4:$e(e)?2:0;return _c(e,t,s,n,a,l,i,!0)}function Pf(e){return e?el(e)||yf(e)?je({},e):e:null}function sn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?$f(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Mf(c),ref:t&&t.ref?s&&i?Ce(i)?i.concat(Il(t)):[i,Il(t)]:Il(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Pt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&sn(e.ssContent),ssFallback:e.ssFallback&&sn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&Tn(d,r.clone(d)),d}function wc(e=" ",t=0){return mt($n,null,e,t)}function Kb(e,t){const s=mt(oa,null,e);return s.staticCount=t,s}function Ff(e="",t=!1){return t?(zi(),Gl(Tt,null,e)):mt(Tt,null,e)}function us(e){return e==null||typeof e=="boolean"?mt(Tt):Ce(e)?mt(Pt,null,e.slice()):Cn(e)?un(e):mt($n,null,String(e))}function un(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:sn(e)}function kc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ce(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),kc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!yf(t)?t._ctx=Ht:a===3&&Ht&&(Ht.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else $e(t)?(t={default:t,_ctx:Ht},s=32):(t=String(t),n&64?(s=16,t=[wc(t)]):s=8);e.children=t,e.shapeFlag|=s}function $f(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Xi([t.class,n.class]));else if(a==="style")t.style=Qi([t.style,n.style]);else if(ha(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ce(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!fo(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function cs(e,t,s,n=null){bs(e,t,7,[s,n])}const Wb=ff();let Zb=0;function Uf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Wb,i={uid:Zb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new tc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:_f(n,a),emitsOptions:mf(n,a),emit:null,emitted:null,propsDefaults:Ve,inheritAttrs:n.inheritAttrs,ctx:Ve,data:Ve,props:Ve,attrs:Ve,slots:Ve,refs:Ve,setupState:Ve,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Sb.bind(null,i),e.ce&&e.ce(i),i}let Bt=null;const is=()=>Bt||Ht;let Kl,za;{const e=bo(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Kl=t("__VUE_INSTANCE_SETTERS__",s=>Bt=s),za=t("__VUE_SSR_SETTERS__",s=>ua=s)}const ii=e=>{const t=Bt;return Kl(e),e.scope.on(),()=>{e.scope.off(),Kl(t)}},Vi=()=>{Bt&&Bt.scope.off(),Kl(null)};function Bf(e){return e.vnode.shapeFlag&4}let ua=!1;function Hf(e,t=!1,s=!1){t&&za(t);const{props:n,children:a}=e.vnode,i=Bf(e);Ib(e,n,i,t),Db(e,a,s||t);const l=i?Jb(e,t):void 0;return t&&za(!1),l}function Jb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Sr);const{setup:n}=s;if(n){kn();const a=e.setupContext=n.length>1?Vf(e):null,i=ii(e),l=ai(n,e,0,[e.props,a]),o=ec(l);if(Sn(),i(),(o||e.sp)&&!xn(e)&&pc(e),o){if(l.then(Vi,Vi),t)return l.then(r=>{Rr(e,r,t)}).catch(r=>{va(r,e,0)});e.asyncDep=l}else Rr(e,l,t)}else jf(e,t)}function Rr(e,t,s){$e(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=oc(t)),jf(e,s)}let Wl,Ir;function zf(e){Wl=e,Ir=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,sb))}}const Yb=()=>!Wl;function jf(e,t,s){const n=e.type;if(!e.render){if(!t&&Wl&&!n.render){const a=n.template||vc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=je(je({isCustomElement:i,delimiters:o},l),r);n.render=Wl(a,c)}}e.render=n.render||zt,Ir&&Ir(e)}{const a=ii(e);kn();try{gb(e)}finally{Sn(),a()}}}const Qb={get(e,t){return Gt(e,"get",""),e[t]}};function Vf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Qb),slots:e.slots,emit:e.emit,expose:t}}function al(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(oc(Fp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ci)return Ci[s](e)},has(t,s){return s in t||s in Ci}})):e.proxy}function Or(e,t=!0){return $e(e)?e.displayName||e.name:e.name||t&&e.__name}function Xb(e){return $e(e)&&"__vccOpts"in e}const W=(e,t)=>iv(e,t,ua);function Ka(e,t,s){try{ji(-1);const n=arguments.length;return n===2?Xe(t)&&!Ce(t)?Cn(t)?mt(e,null,[t]):mt(e,t):mt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Cn(s)&&(s=[s]),mt(e,t,s))}finally{ji(1)}}function ey(){}function ty(e,t,s,n){const a=s[n];if(a&&qf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function qf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Mt(s[n],t[n]))return!1;return da>0&&Kt&&Kt.push(e),!0}const Gf="3.5.38",sy=zt,ny=hv,ay=Ia,iy=Gp,ly={createComponentInstance:Uf,setupComponent:Hf,renderComponentRoot:Rl,setCurrentRenderingInstance:Ui,isVNode:Cn,normalizeVNode:us,getComponentPublicInstance:al,ensureValidVNode:gc,pushWarningContext:dv,popWarningContext:uv},oy=ly,ry=null,cy=null,dy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Lr;const Rd=typeof window<"u"&&window.trustedTypes;if(Rd)try{Lr=Rd.createPolicy("vue",{createHTML:e=>e})}catch{}const Kf=Lr?e=>Lr.createHTML(e):e=>e,uy="http://www.w3.org/2000/svg",py="http://www.w3.org/1998/Math/MathML",dn=typeof document<"u"?document:null,Id=dn&&dn.createElement("template"),Wf={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?dn.createElementNS(uy,e):t==="mathml"?dn.createElementNS(py,e):s?dn.createElement(e,{is:s}):dn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>dn.createTextNode(e),createComment:e=>dn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>dn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Id.innerHTML=Kf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=Id.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Rn="transition",ui="animation",Wa=Symbol("_vtc"),Zf={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Jf=je({},uc,Zf),fy=e=>(e.displayName="Transition",e.props=Jf,e),hy=fy((e,{slots:t})=>Ka(tf,Yf(e),t)),Yn=(e,t=[])=>{Ce(e)?e.forEach(s=>s(...t)):e&&e(...t)},Od=e=>e?Ce(e)?e.some(t=>t.length>1):e.length>1:!1;function Yf(e){const t={};for(const M in e)M in Zf||(t[M]=e[M]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=my(a),b=m&&m[0],A=m&&m[1],{onBeforeEnter:I,onEnter:k,onEnterCancelled:v,onLeave:_,onLeaveCancelled:E,onBeforeAppear:g=I,onAppear:T=k,onAppearCancelled:y=v}=t,w=(M,D,$,P)=>{M._enterCancelled=P,Nn(M,D?d:o),Nn(M,D?c:l),$&&$()},L=(M,D)=>{M._isLeaving=!1,Nn(M,u),Nn(M,f),Nn(M,p),D&&D()},F=M=>(D,$)=>{const P=M?T:k,z=()=>w(D,M,$);Yn(P,[D,z]),Ld(()=>{Nn(D,M?r:i),Ws(D,M?d:o),Od(P)||Nd(D,n,b,z)})};return je(t,{onBeforeEnter(M){Yn(I,[M]),Ws(M,i),Ws(M,l)},onBeforeAppear(M){Yn(g,[M]),Ws(M,r),Ws(M,c)},onEnter:F(!1),onAppear:F(!0),onLeave(M,D){M._isLeaving=!0;const $=()=>L(M,D);Ws(M,u),M._enterCancelled?(Ws(M,p),Nr(M)):(Nr(M),Ws(M,p)),Ld(()=>{M._isLeaving&&(Nn(M,u),Ws(M,f),Od(_)||Nd(M,n,A,$))}),Yn(_,[M,$])},onEnterCancelled(M){w(M,!1,void 0,!0),Yn(v,[M])},onAppearCancelled(M){w(M,!0,void 0,!0),Yn(y,[M])},onLeaveCancelled(M){L(M),Yn(E,[M])}})}function my(e){if(e==null)return null;if(Xe(e))return[Yo(e.enter),Yo(e.leave)];{const t=Yo(e);return[t,t]}}function Yo(e){return Pl(e)}function Ws(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Wa]||(e[Wa]=new Set)).add(t)}function Nn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Wa];s&&(s.delete(t),s.size||(e[Wa]=void 0))}function Ld(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let gy=0;function Nd(e,t,s,n){const a=e._endId=++gy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Qf(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Qf(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${Rn}Delay`),i=n(`${Rn}Duration`),l=Dd(a,i),o=n(`${ui}Delay`),r=n(`${ui}Duration`),c=Dd(o,r);let d=null,u=0,p=0;t===Rn?l>0&&(d=Rn,u=l,p=i.length):t===ui?c>0&&(d=ui,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Rn:ui:null,p=d?d===Rn?i.length:r.length:0);const f=d===Rn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Rn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function Dd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Md(s)+Md(e[n])))}function Md(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Nr(e){return(e?e.ownerDocument:document).body.offsetHeight}function vy(e,t,s){const n=e[Wa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Zl=Symbol("_vod"),Sc=Symbol("_vsh"),Xf={name:"show",beforeMount(e,{value:t},{transition:s}){e[Zl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):pi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),pi(e,!0),n.enter(e)):n.leave(e,()=>{pi(e,!1)}):pi(e,t))},beforeUnmount(e,{value:t}){pi(e,t)}};function pi(e,t){e.style.display=t?e[Zl]:"none",e[Sc]=!t}function by(){Xf.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const eh=Symbol("");function yy(e){const t=is();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Jl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Jl(t.ce,a):Dr(t.subTree,a),s(a)};fc(()=>{Fi(n)}),Ge(()=>{as(n,zt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),_t(()=>a.disconnect())})}function Dr(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Dr(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Jl(e.el,t);else if(e.type===Pt)e.children.forEach(s=>Dr(s,t));else if(e.type===oa){let{el:s,anchor:n}=e;for(;s&&(Jl(s,t),s!==n);)s=s.nextSibling}}function Jl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Tg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[eh]=n}}const xy=/(?:^|;)\s*display\s*:/;function _y(e,t,s){const n=e.style,a=Ue(s);let i=!1;if(s&&!a){if(t)if(Ue(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&_i(n,o,"")}else for(const l in t)s[l]==null&&_i(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?ky(e,l,!Ue(t)&&t?t[l]:void 0,o)||_i(n,l,o):_i(n,l,"")}}else if(a){if(t!==s){const l=n[eh];l&&(s+=";"+l),n.cssText=s,i=xy.test(s)}}else t&&e.removeAttribute("style");Zl in e&&(e[Zl]=i?n.display:"",e[Sc]&&(n.display="none"))}const Pd=/\s*!important$/;function _i(e,t,s){if(Ce(s))s.forEach(n=>_i(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=wy(e,t);Pd.test(s)?e.setProperty(ps(n),s.replace(Pd,""),"important"):e[n]=s}}const Fd=["Webkit","Moz","ms"],Qo={};function wy(e,t){const s=Qo[t];if(s)return s;let n=ot(t);if(n!=="filter"&&n in e)return Qo[t]=n;n=ga(n);for(let a=0;a<Fd.length;a++){const i=Fd[a]+n;if(i in e)return Qo[t]=i}return t}function ky(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ue(n)&&s===n}const $d="http://www.w3.org/1999/xlink";function Ud(e,t,s,n,a,i=kg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS($d,t.slice(6,t.length)):e.setAttributeNS($d,t,s):s==null||i&&!vp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Jt(s)?String(s):s)}function Bd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Kf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=vp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function mn(e,t,s,n){e.addEventListener(t,s,n)}function Sy(e,t,s,n){e.removeEventListener(t,s,n)}const Hd=Symbol("_vei");function Ty(e,t,s,n,a=null){const i=e[Hd]||(e[Hd]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=Cy(t);if(n){const c=i[t]=Ry(n,a);mn(e,o,c,r)}else l&&(Sy(e,o,l,r),i[t]=void 0)}}const zd=/(?:Once|Passive|Capture)$/;function Cy(e){let t;if(zd.test(e)){t={};let n;for(;n=e.match(zd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ps(e.slice(2)),t]}let Xo=0;const Ey=Promise.resolve(),Ay=()=>Xo||(Ey.then(()=>Xo=0),Xo=Date.now());function Ry(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ce(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&bs(c,t,5,o)}}else bs(a,t,5,[n])};return s.value=e,s.attached=Ay(),s}const jd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,th=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?vy(e,n,l):t==="style"?_y(e,s,n):ha(t)?fo(t)||Ty(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Iy(e,t,n,l))?(Bd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Ud(e,t,n,l,i,t!=="value")):e._isVueCE&&(Oy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ue(n)))?Bd(e,ot(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Ud(e,t,n,l))};function Iy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&jd(t)&&$e(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return jd(t)&&Ue(s)?!1:t in e}function Oy(e,t){const s=e._def.props;if(!s)return!1;const n=ot(t);return Array.isArray(s)?s.some(a=>ot(a)===n):Object.keys(s).some(a=>ot(a)===n)}const Vd={};function sh(e,t,s){let n=sl(e,t);ho(n)&&(n=je({},n,t));class a extends Oo{constructor(l){super(n,l,s)}}return a.def=n,a}const Ly=((e,t)=>sh(e,t,mh)),Ny=typeof HTMLElement<"u"?HTMLElement:class{};class Oo extends Ny{constructor(t,s={},n=Xl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Xl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Oo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ce(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Pl(this._props[r])),(o||(o=Object.create(null)))[ot(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)et(this,n)||Object.defineProperty(this,n,{get:()=>en(s[n])})}_resolveProps(t){const{props:s}=t,n=Ce(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(ot))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Vd;const a=ot(t);s&&this._numberProps&&this._numberProps[a]&&(n=Pl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Vd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ps(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ps(t),s+""):s||this.removeAttribute(ps(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),hh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=mt(this._def,je(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,ho(l[0])?je({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),ps(i)!==i&&a(ps(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function nh(e){const t=is(),s=t&&t.ce;return s||null}function Dy(){const e=nh();return e&&e.shadowRoot}function My(e="$style"){{const t=is();if(!t)return Ve;const s=t.type.__cssModules;if(!s)return Ve;const n=s[e];return n||Ve}}const ah=new WeakMap,ih=new WeakMap,Yl=Symbol("_moveCb"),qd=Symbol("_enterCb"),Py=e=>(delete e.props.mode,e),Fy=Py({name:"TransitionGroup",props:je({},Jf,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=is(),n=dc();let a,i;return Eo(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!zy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Uy),a.forEach(By);const o=a.filter(Hy);Nr(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;Ws(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Yl]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Yl]=null,Nn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=We(e),o=Yf(l);let r=l.tag||Pt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Sc]&&(a.push(d),Tn(d,Ga(d,o,n,s)),ah.set(d,lh(d.el)))}i=t.default?To(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Tn(d,Ga(d,o,n,s))}return mt(r,null,i)}}}),$y=Fy;function Uy(e){const t=e.el;t[Yl]&&t[Yl](),t[qd]&&t[qd]()}function By(e){ih.set(e,lh(e.el))}function Hy(e){const t=ah.get(e),s=ih.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function lh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function zy(e,t,s){const n=e.cloneNode(),a=e[Wa];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Qf(n);return i.removeChild(n),l}const Bn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ce(t)?s=>$a(t,s):t};function jy(e){e.target.composing=!0}function Gd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Os=Symbol("_assign");function Kd(e,t,s){return t&&(e=e.trim()),s&&(e=vo(e)),e}const Ql={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Os]=Bn(a);const i=n||a.props&&a.props.type==="number";mn(e,t?"change":"input",l=>{l.target.composing||e[Os](Kd(e.value,s,i))}),(s||i)&&mn(e,"change",()=>{e.value=Kd(e.value,s,i)}),t||(mn(e,"compositionstart",jy),mn(e,"compositionend",Gd),mn(e,"change",Gd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Os]=Bn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?vo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},Tc={deep:!0,created(e,t,s){e[Os]=Bn(s),mn(e,"change",()=>{const n=e._modelValue,a=Za(e),i=e.checked,l=e[Os];if(Ce(n)){const o=yo(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(ma(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(rh(e,i))})},mounted:Wd,beforeUpdate(e,t,s){e[Os]=Bn(s),Wd(e,t,s)}};function Wd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ce(t))a=yo(t,n.props.value)>-1;else if(ma(t))a=t.has(n.props.value);else{if(t===s)return;a=wn(t,rh(e,!0))}e.checked!==a&&(e.checked=a)}const Cc={created(e,{value:t},s){e.checked=wn(t,s.props.value),e[Os]=Bn(s),mn(e,"change",()=>{e[Os](Za(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Os]=Bn(n),t!==s&&(e.checked=wn(t,n.props.value))}},oh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=ma(t);mn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?vo(Za(l)):Za(l));e[Os](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[Os]=Bn(n)},mounted(e,{value:t}){Zd(e,t)},beforeUpdate(e,t,s){e[Os]=Bn(s)},updated(e,{value:t}){e._assigning||Zd(e,t)}};function Zd(e,t){const s=e.multiple,n=Ce(t);if(!(s&&!n&&!ma(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=Za(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=yo(t,o)>-1}else l.selected=t.has(o);else if(wn(Za(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Za(e){return"_value"in e?e._value:e.value}function rh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ch={created(e,t,s){_l(e,t,s,null,"created")},mounted(e,t,s){_l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){_l(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){_l(e,t,s,n,"updated")}};function dh(e,t){switch(e){case"SELECT":return oh;case"TEXTAREA":return Ql;default:switch(t){case"checkbox":return Tc;case"radio":return Cc;default:return Ql}}}function _l(e,t,s,n,a){const l=dh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Vy(){Ql.getSSRProps=({value:e})=>({value:e}),Cc.getSSRProps=({value:e},t)=>{if(t.props&&wn(t.props.value,e))return{checked:!0}},Tc.getSSRProps=({value:e},t)=>{if(Ce(e)){if(t.props&&yo(e,t.props.value)>-1)return{checked:!0}}else if(ma(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ch.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=dh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const qy=["ctrl","shift","alt","meta"],Gy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>qy.some(s=>e[`${s}Key`]&&!t.includes(s))},Ky=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=Gy[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},Wy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Zy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=ps(a.key);if(t.some(l=>l===i||Wy[l]===i))return e(a)}))},uh=je({patchProp:th},Wf);let Ai,Jd=!1;function ph(){return Ai||(Ai=Tf(uh))}function fh(){return Ai=Jd?Ai:Cf(uh),Jd=!0,Ai}const hh=((...e)=>{ph().render(...e)}),Jy=((...e)=>{fh().hydrate(...e)}),Xl=((...e)=>{const t=ph().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=vh(n);if(!a)return;const i=t._component;!$e(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,gh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),mh=((...e)=>{const t=fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=vh(n);if(a)return s(a,!0,gh(a))},t});function gh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function vh(e){return Ue(e)?document.querySelector(e):e}let Yd=!1;const Yy=()=>{Yd||(Yd=!0,Vy(),by())},Qy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:tf,BaseTransitionPropsValidators:uc,Comment:Tt,DeprecationTypes:dy,EffectScope:tc,ErrorCodes:fv,ErrorTypeStrings:ny,Fragment:Pt,KeepAlive:Gv,ReactiveEffect:Di,Static:oa,Suspense:$b,Teleport:Av,Text:$n,TrackOpTypes:lv,Transition:hy,TransitionGroup:$y,TriggerOpTypes:ov,VueElement:Oo,assertNumber:pv,callWithAsyncErrorHandling:bs,callWithErrorHandling:ai,camelize:ot,capitalize:ga,cloneVNode:sn,compatUtils:cy,computed:W,createApp:Xl,createBlock:Gl,createCommentVNode:Ff,createElementBlock:Vb,createElementVNode:_c,createHydrationRenderer:Cf,createPropsRestProxy:hb,createRenderer:Tf,createSSRApp:mh,createSlots:Xv,createStaticVNode:Kb,createTextVNode:wc,createVNode:mt,customRef:Up,defineAsyncComponent:Vv,defineComponent:sl,defineCustomElement:sh,defineEmits:ab,defineExpose:ib,defineModel:rb,defineOptions:lb,defineProps:nb,defineSSRCustomElement:Ly,defineSlots:ob,devtools:ay,effect:Rg,effectScope:Cg,getCurrentInstance:is,getCurrentScope:_p,getCurrentWatcher:rv,getTransitionRawChildren:To,guardReactiveProps:Pf,h:Ka,handleError:va,hasInjectionContext:_v,hydrate:Jy,hydrateOnIdle:$v,hydrateOnInteraction:zv,hydrateOnMediaQuery:Hv,hydrateOnVisible:Bv,initCustomFormatter:ey,initDirectivesForSSR:Yy,inject:Is,isMemoSame:qf,isProxy:el,isReactive:yn,isReadonly:tn,isRef:Rt,isRuntimeOnly:Yb,isShallow:hs,isVNode:Cn,markRaw:Fp,mergeDefaults:pb,mergeModels:fb,mergeProps:$f,nextTick:Et,nodeOps:Wf,normalizeClass:Xi,normalizeProps:fg,normalizeStyle:Qi,onActivated:xs,onBeforeMount:af,onBeforeUnmount:Ao,onBeforeUpdate:fc,onDeactivated:_s,onErrorCaptured:cf,onMounted:Ge,onRenderTracked:rf,onRenderTriggered:of,onScopeDispose:Eg,onServerPrefetch:lf,onUnmounted:_t,onUpdated:Eo,onWatcherCleanup:Hp,openBlock:zi,patchProp:th,popScopeId:bv,provide:Ti,proxyRefs:oc,pushScopeId:vv,queuePostFlushCb:Fi,reactive:Hn,readonly:$l,ref:h,registerRuntimeCompiler:zf,render:hh,renderList:Qv,renderSlot:eb,resolveComponent:Zv,resolveDirective:Yv,resolveDynamicComponent:Jv,resolveFilter:ry,resolveTransitionHooks:Ga,setBlockTracking:ji,setDevtoolsHook:iy,setTransitionHooks:Tn,shallowReactive:ic,shallowReadonly:Wg,shallowRef:lc,ssrContextKey:Kp,ssrUtils:oy,stop:Ig,toDisplayString:yp,toHandlerKey:Fa,toHandlers:tb,toRaw:We,toRef:nv,toRefs:ev,toValue:Yg,transformVNodeArgs:qb,triggerRef:Jg,unref:en,useAttrs:ub,useCssModule:My,useCssVars:yy,useHost:nh,useId:Iv,useModel:kb,useSSRContext:Wp,useShadowRoot:Dy,useSlots:db,useTemplateRef:Ov,useTransitionState:dc,vModelCheckbox:Tc,vModelDynamic:ch,vModelRadio:Cc,vModelSelect:oh,vModelText:Ql,vShow:Xf,version:Gf,warn:sy,watch:as,watchEffect:wv,watchPostEffect:kv,watchSyncEffect:Zp,withAsyncContext:mb,withCtx:cc,withDefaults:cb,withDirectives:xv,withKeys:Zy,withMemo:ty,withModifiers:Ky,withScopeId:yv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qi=Symbol(""),Ri=Symbol(""),Ec=Symbol(""),eo=Symbol(""),bh=Symbol(""),pa=Symbol(""),yh=Symbol(""),xh=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),il=Symbol(""),Ic=Symbol(""),_h=Symbol(""),Oc=Symbol(""),Lc=Symbol(""),Nc=Symbol(""),Dc=Symbol(""),Mc=Symbol(""),Pc=Symbol(""),wh=Symbol(""),kh=Symbol(""),Lo=Symbol(""),to=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Gi=Symbol(""),ll=Symbol(""),Uc=Symbol(""),Mr=Symbol(""),Xy=Symbol(""),Pr=Symbol(""),so=Symbol(""),ex=Symbol(""),tx=Symbol(""),Bc=Symbol(""),sx=Symbol(""),nx=Symbol(""),Hc=Symbol(""),Sh=Symbol(""),Ja={[qi]:"Fragment",[Ri]:"Teleport",[Ec]:"Suspense",[eo]:"KeepAlive",[bh]:"BaseTransition",[pa]:"openBlock",[yh]:"createBlock",[xh]:"createElementBlock",[Ac]:"createVNode",[Rc]:"createElementVNode",[il]:"createCommentVNode",[Ic]:"createTextVNode",[_h]:"createStaticVNode",[Oc]:"resolveComponent",[Lc]:"resolveDynamicComponent",[Nc]:"resolveDirective",[Dc]:"resolveFilter",[Mc]:"withDirectives",[Pc]:"renderList",[wh]:"renderSlot",[kh]:"createSlots",[Lo]:"toDisplayString",[to]:"mergeProps",[Fc]:"normalizeClass",[$c]:"normalizeStyle",[Gi]:"normalizeProps",[ll]:"guardReactiveProps",[Uc]:"toHandlers",[Mr]:"camelize",[Xy]:"capitalize",[Pr]:"toHandlerKey",[so]:"setBlockTracking",[ex]:"pushScopeId",[tx]:"popScopeId",[Bc]:"withCtx",[sx]:"unref",[nx]:"isRef",[Hc]:"withMemo",[Sh]:"isMemoSame"};function ax(e){Object.getOwnPropertySymbols(e).forEach(t=>{Ja[t]=e[t]})}const ws={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ix(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:ws}}function Ki(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=ws){return e&&(o?(e.helper(pa),e.helper(Xa(e.inSSR,c))):e.helper(Qa(e.inSSR,c)),l&&e.helper(Mc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function ra(e,t=ws){return{type:17,loc:t,elements:e}}function Rs(e,t=ws){return{type:15,loc:t,properties:e}}function At(e,t){return{type:16,loc:ws,key:Ue(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=ws,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Bs(e,t=ws){return{type:8,loc:t,children:e}}function Dt(e,t=[],s=ws){return{type:14,loc:s,callee:e,arguments:t}}function Ya(e,t=void 0,s=!1,n=!1,a=ws){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Fr(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:ws}}function lx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:ws}}function ox(e){return{type:21,body:e,loc:ws}}function Qa(e,t){return e||t?Ac:Rc}function Xa(e,t){return e||t?yh:xh}function zc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Qa(n,e.isComponent)),t(pa),t(Xa(n,e.isComponent)))}const Qd=new Uint8Array([123,123]),Xd=new Uint8Array([125,125]);function eu(e){return e>=97&&e<=122||e>=65&&e<=90}function gs(e){return e===32||e===10||e===9||e===12||e===13}function In(e){return e===47||e===62||gs(e)}function no(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const jt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class rx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Qd,this.delimiterClose=Xd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Qd,this.delimiterClose=Xd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?In(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||gs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===jt.TitleEnd||this.currentSequence===jt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===jt.Cdata[this.sequenceIndex]?++this.sequenceIndex===jt.Cdata.length&&(this.state=28,this.currentSequence=jt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):eu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){In(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(In(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(no("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){gs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=eu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||gs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):gs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):gs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||In(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||In(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||In(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||In(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||In(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):gs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):gs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){gs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=jt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===jt.ScriptEnd[3]?this.startSpecial(jt.ScriptEnd,4):t===jt.StyleEnd[3]?this.startSpecial(jt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===jt.TitleEnd[3]?this.startSpecial(jt.TitleEnd,4):t===jt.TextareaEnd[3]?this.startSpecial(jt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function tu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ca(e,t){const s=tu("MODE",t),n=tu(e,t);return s===3?n===!0:n!==!1}function Wi(e,t,s,...n){return ca(e,t)}function jc(e){throw e}function Th(e){}function ft(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const fs=e=>e.type===4&&e.isStatic;function Ch(e){switch(e){case"Teleport":case"teleport":return Ri;case"Suspense":case"suspense":return Ec;case"KeepAlive":case"keep-alive":return eo;case"BaseTransition":case"base-transition":return bh}}const cx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Vc=e=>!cx.test(e),Eh=/[A-Za-z_$\xA0-\uFFFF]/,dx=/[\.\?\w$\xA0-\uFFFF]/,ux=/\s+[.[]\s*|\s*[.[]\s+/g,Ah=e=>e.type===4?e.content:e.loc.source,px=e=>{const t=Ah(e).trim().replace(ux,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?Eh:dx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},Rh=px,fx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,hx=e=>fx.test(Ah(e)),mx=hx;function As(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ue(t)?a.name===t:t.test(a.name)))return a}}function No(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&sa(i.arg,t))return i}}function sa(e,t){return!!(e&&fs(e)&&e.content===t)}function gx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function er(e){return e.type===5||e.type===2}function su(e){return e.type===7&&e.name==="pre"}function vx(e){return e.type===7&&e.name==="slot"}function ao(e){return e.type===1&&e.tagType===3}function io(e){return e.type===1&&e.tagType===2}const bx=new Set([Gi,ll]);function Ih(e,t=[]){if(e&&!Ue(e)&&e.type===14){const s=e.callee;if(!Ue(s)&&bx.has(s))return Ih(e.arguments[0],t.concat(e))}return[e,t]}function lo(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ue(a)&&a.type===14){const o=Ih(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||Ue(a))n=Rs([t]);else if(a.type===14){const o=a.arguments[0];!Ue(o)&&o.type===15?nu(t,o)||o.properties.unshift(t):a.callee===Uc?n=Dt(s.helper(to),[Rs([t]),a]):a.arguments.unshift(Rs([t])),!n&&(n=a)}else a.type===15?(nu(t,a)||a.properties.unshift(t),n=a):(n=Dt(s.helper(to),[Rs([t]),a]),l&&l.callee===ll&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function nu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Zi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function yx(e){return e.type===14&&e.callee===Hc?e.arguments[1].returns:e}const xx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Oh(e){for(let t=0;t<e.length;t++)if(!gs(e.charCodeAt(t)))return!1;return!0}function qc(e){return e.type===2&&Oh(e.content)||e.type===12&&qc(e.content)}function Lh(e){return e.type===3||qc(e)}const Nh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Na,isPreTag:Na,isIgnoreNewlineTag:Na,isCustomElement:Na,onError:jc,onWarn:Th,comments:!1,prefixIdentifiers:!1};let Qe=Nh,Ji=null,_n="",qt=null,qe=null,rs="",cn=-1,Xn=-1,Gc=0,Pn=!1,$r=null;const pt=[],xt=new rx(pt,{onerr:ln,ontext(e,t){wl(Ut(e,t),e,t)},ontextentity(e,t,s){wl(e,t,s)},oninterpolation(e,t){if(Pn)return wl(Ut(e,t),e,t);let s=e+xt.delimiterOpen.length,n=t-xt.delimiterClose.length;for(;gs(_n.charCodeAt(s));)s++;for(;gs(_n.charCodeAt(n-1));)n--;let a=Ut(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),Ur({type:5,content:Ll(a,!1,St(s,n)),loc:St(e,t)})},onopentagname(e,t){const s=Ut(e,t);qt={type:1,tag:s,ns:Qe.getNamespace(s,pt[0],Qe.ns),tagType:0,props:[],children:[],loc:St(e-1,t),codegenNode:void 0}},onopentagend(e){iu(e)},onclosetag(e,t){const s=Ut(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<pt.length;a++)if(pt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&ln(24,pt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=pt.shift();Ol(o,t,l<a)}break}n||ln(23,Dh(e,60))}},onselfclosingtag(e){const t=qt.tag;qt.isSelfClosing=!0,iu(e),pt[0]&&pt[0].tag===t&&Ol(pt.shift(),e)},onattribname(e,t){qe={type:6,name:Ut(e,t),nameLoc:St(e,t),value:void 0,loc:St(e)}},ondirname(e,t){const s=Ut(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Pn&&n===""&&ln(26,e),Pn||n==="")qe={type:6,name:s,nameLoc:St(e,t),value:void 0,loc:St(e)};else if(qe={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:St(e)},n==="pre"){Pn=xt.inVPre=!0,$r=qt;const a=qt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Ix(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ut(e,t);if(Pn&&!su(qe))qe.name+=s,na(qe.nameLoc,t);else{const n=s[0]!=="[";qe.arg=Ll(n?s:s.slice(1,-1),n,St(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ut(e,t);if(Pn&&!su(qe))qe.name+="."+s,na(qe.nameLoc,t);else if(qe.name==="slot"){const n=qe.arg;n&&(n.content+="."+s,na(n.loc,t))}else{const n=He(s,!0,St(e,t));qe.modifiers.push(n)}},onattribdata(e,t){rs+=Ut(e,t),cn<0&&(cn=e),Xn=t},onattribentity(e,t,s){rs+=e,cn<0&&(cn=t),Xn=s},onattribnameend(e){const t=qe.loc.start.offset,s=Ut(t,e);qe.type===7&&(qe.rawName=s),qt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&ln(2,t)},onattribend(e,t){if(qt&&qe){if(na(qe.loc,t),e!==0)if(rs.includes("&")&&(rs=Qe.decodeEntities(rs,!0)),qe.type===6)qe.name==="class"&&(rs=Ph(rs).trim()),e===1&&!rs&&ln(13,t),qe.value={type:2,content:rs,loc:e===1?St(cn,Xn):St(cn-1,Xn+1)},xt.inSFCRoot&&qt.tag==="template"&&qe.name==="lang"&&rs&&rs!=="html"&&xt.enterRCDATA(no("</template"),0);else{let s=0;qe.exp=Ll(rs,!1,St(cn,Xn),0,s),qe.name==="for"&&(qe.forParseResult=wx(qe.exp));let n=-1;qe.name==="bind"&&(n=qe.modifiers.findIndex(a=>a.content==="sync"))>-1&&Wi("COMPILER_V_BIND_SYNC",Qe,qe.loc,qe.arg.loc.source)&&(qe.name="model",qe.modifiers.splice(n,1))}(qe.type!==7||qe.name!=="pre")&&qt.props.push(qe)}rs="",cn=Xn=-1},oncomment(e,t){Qe.comments&&Ur({type:3,content:Ut(e,t),loc:St(e-4,t+3)})},onend(){const e=_n.length;for(let t=0;t<pt.length;t++)Ol(pt[t],e-1),ln(24,pt[t].loc.start.offset)},oncdata(e,t){(pt[0]?pt[0].ns:Qe.ns)!==0?wl(Ut(e,t),e,t):ln(1,e-9)},onprocessinginstruction(e){(pt[0]?pt[0].ns:Qe.ns)===0&&ln(21,e-1)}}),au=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,_x=/^\(|\)$/g;function wx(e){const t=e.loc,s=e.content,n=s.match(xx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,b=m+u.length;return Ll(u,!1,St(m,b),0,f?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(_x,"").trim();const c=a.indexOf(r),d=r.match(au);if(d){r=r.replace(au,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(o.index=l(f,s.indexOf(f,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Ut(e,t){return _n.slice(e,t)}function iu(e){xt.inSFCRoot&&(qt.innerLoc=St(e+1,e+1)),Ur(qt);const{tag:t,ns:s}=qt;s===0&&Qe.isPreTag(t)&&Gc++,Qe.isVoidTag(t)?Ol(qt,e):(pt.unshift(qt),(s===1||s===2)&&(xt.inXML=!0)),qt=null}function wl(e,t,s){{const i=pt[0]&&pt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=pt[0]||Ji,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,na(a.loc,s)):n.children.push({type:2,content:e,loc:St(t,s)})}function Ol(e,t,s=!1){s?na(e.loc,Dh(t,60)):na(e.loc,kx(t,62)+1),xt.inSFCRoot&&(e.children.length?e.innerLoc.end=je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=je({},e.innerLoc.start),e.innerLoc.source=Ut(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Pn||(n==="slot"?e.tagType=2:lu(e)?e.tagType=3:Tx(e)&&(e.tagType=1)),xt.inRCDATA||(e.children=Mh(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Gc--,$r===e&&(Pn=xt.inVPre=!1,$r=null),xt.inXML&&(pt[0]?pt[0].ns:Qe.ns)===0&&(xt.inXML=!1);{const l=e.props;if(!xt.inSFCRoot&&ca("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!lu(e)){const r=pt[0]||Ji,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&Wi("COMPILER_INLINE_TEMPLATE",Qe,o.loc)&&e.children.length&&(o.value={type:2,content:Ut(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function kx(e,t){let s=e;for(;_n.charCodeAt(s)!==t&&s<_n.length-1;)s++;return s}function Dh(e,t){let s=e;for(;_n.charCodeAt(s)!==t&&s>=0;)s--;return s}const Sx=new Set(["if","else","else-if","for","slot"]);function lu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Sx.has(t[s].name))return!0}return!1}function Tx({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||Cx(e.charCodeAt(0))||Ch(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Wi("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&sa(n.arg,"is")&&Wi("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function Cx(e){return e>64&&e<91}const Ex=/\r\n/g;function Mh(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Gc)a.content=a.content.replace(Ex,`
`);else if(Oh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Ax(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Ph(a.content))}return s?e.filter(Boolean):e}function Ax(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Ph(e){let t="",s=!1;for(let n=0;n<e.length;n++)gs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Ur(e){(pt[0]||Ji).children.push(e)}function St(e,t){return{start:xt.getPos(e),end:t==null?t:xt.getPos(t),source:t==null?t:Ut(e,t)}}function Rx(e){return St(e.start.offset,e.end.offset)}function na(e,t){e.end=xt.getPos(t),e.source=Ut(e.start.offset,t)}function Ix(e){const t={type:6,name:e.rawName,nameLoc:St(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Ll(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function ln(e,t,s){Qe.onError(ft(e,St(t,t)))}function Ox(){xt.reset(),qt=null,qe=null,rs="",cn=-1,Xn=-1,pt.length=0}function Lx(e,t){if(Ox(),_n=e,Qe=je({},Nh),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}xt.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,xt.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(xt.delimiterOpen=no(s[0]),xt.delimiterClose=no(s[1]));const n=Ji=ix([],e);return xt.parse(_n),n.loc=St(0,e.length),n.children=Mh(n.children),Ji=null,n}function Nx(e,t){Nl(e,void 0,t,!!Fh(e))}function Fh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!io(t[0])?t[0]:null}function Nl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:vs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&Uh(u,s)>=2){const b=Bh(u);b&&(f.props=s.hoist(b))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:vs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Nl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Nl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Nl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ce(e.codegenNode.children))e.codegenNode.children=r(ra(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ce(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(ra(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ce(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=As(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(ra(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ce(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function vs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=Uh(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=vs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=vs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(pa),t.removeHelper(Xa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Qa(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return vs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ue(o)||Jt(o))continue;const r=vs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const Dx=new Set([Fc,$c,Gi,ll]);function $h(e,t){if(e.type===14&&!Ue(e.callee)&&Dx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return vs(s,t);if(s.type===14)return $h(s,t)}return 0}function Uh(e,t){let s=3;const n=Bh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=vs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=vs(o,t):o.type===14?c=$h(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Bh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Mx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=zt,isCustomElement:d=zt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:b=!1,ssrCssVars:A="",bindingMetadata:I=Ve,inline:k=!1,isTS:v=!1,onError:_=jc,onWarn:E=Th,compatConfig:g}){const T=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),y={filename:t,selfName:T&&ga(ot(T[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:b,ssrCssVars:A,bindingMetadata:I,inline:k,isTS:v,onError:_,onWarn:E,compatConfig:g,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(w){const L=y.helpers.get(w)||0;return y.helpers.set(w,L+1),w},removeHelper(w){const L=y.helpers.get(w);if(L){const F=L-1;F?y.helpers.set(w,F):y.helpers.delete(w)}},helperString(w){return`_${Ja[y.helper(w)]}`},replaceNode(w){y.parent.children[y.childIndex]=y.currentNode=w},removeNode(w){const L=y.parent.children,F=w?L.indexOf(w):y.currentNode?y.childIndex:-1;!w||w===y.currentNode?(y.currentNode=null,y.onNodeRemoved()):y.childIndex>F&&(y.childIndex--,y.onNodeRemoved()),y.parent.children.splice(F,1)},onNodeRemoved:zt,addIdentifiers(w){},removeIdentifiers(w){},hoist(w){Ue(w)&&(w=He(w)),y.hoists.push(w);const L=He(`_hoisted_${y.hoists.length}`,!1,w.loc,2);return L.hoisted=w,L},cache(w,L=!1,F=!1){const M=lx(y.cached.length,w,L,F);return y.cached.push(M),M}};return y.filters=new Set,y}function Px(e,t){const s=Mx(e,t);Do(e,s),t.hoistStatic&&Nx(e,s),t.ssr||Fx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Fx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Fh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&zc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ki(t,s(qi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function $x(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ue(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Do(a,t))}}function Do(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ce(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(il);break;case 5:t.ssr||t.helper(Lo);break;case 9:for(let i=0;i<e.branches.length;i++)Do(e.branches[i],t);break;case 10:case 11:case 1:case 0:$x(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Hh(e,t){const s=Ue(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(vx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const Mo="/*@__PURE__*/",zh=e=>`${Ja[e]}: _${Ja[e]}`;function Ux(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(b){return`_${Ja[b]}`},push(b,A=-2,I){f.code+=b},indent(){m(++f.indentLevel)},deindent(b=!1){b?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(b){f.push(`
`+"  ".repeat(b),0)}return f}function Bx(e,t={}){const s=Ux(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";Hx(e,s);const b=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${b}(${I}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(zh).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(tr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(tr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),tr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let k=0;k<e.temps;k++)a(`${k>0?", ":""}_temp${k}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?Wt(e.codegenNode,s):a("null"),f&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Hx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Ac,Rc,il,Ic,_h].filter(p=>d.includes(p)).map(zh).join(", ");a(`const { ${u} } = _Vue
`,-1)}zx(e.hoists,t),i(),a("return ")}function tr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Dc:t==="component"?Oc:Nc);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${Zi(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function zx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Wt(i,t),n())}t.pure=!1}function Kc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),ol(e,t,s),s&&t.deindent(),t.push("]")}function ol(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ue(o)?a(o,-3):Ce(o)?Kc(o,t):Wt(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Wt(e,t){if(Ue(e)){t.push(e,-3);return}if(Jt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Wt(e.codegenNode,t);break;case 2:jx(e,t);break;case 4:jh(e,t);break;case 5:Vx(e,t);break;case 12:Wt(e.codegenNode,t);break;case 8:Vh(e,t);break;case 3:Gx(e,t);break;case 13:Kx(e,t);break;case 14:Zx(e,t);break;case 15:Jx(e,t);break;case 17:Yx(e,t);break;case 18:Qx(e,t);break;case 19:Xx(e,t);break;case 20:e0(e,t);break;case 21:ol(e.body,t,!0,!1);break}}function jx(e,t){t.push(JSON.stringify(e.content),-3,e)}function jh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Vx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mo),s(`${n(Lo)}(`),Wt(e.content,t),s(")")}function Vh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ue(n)?t.push(n,-3):Wt(n,t)}}function qx(e,t){const{push:s}=t;if(e.type===8)s("["),Vh(e,t),s("]");else if(e.isStatic){const n=Vc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Gx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mo),s(`${n(il)}(${JSON.stringify(e.content)})`,-3,e)}function Kx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;r&&(m=String(r)),d&&s(n(Mc)+"("),u&&s(`(${n(pa)}(${p?"true":""}), `),a&&s(Mo);const b=u?Xa(t.inSSR,f):Qa(t.inSSR,f);s(n(b)+"(",-2,e),ol(Wx([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),Wt(d,t),s(")"))}function Wx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Zx(e,t){const{push:s,helper:n,pure:a}=t,i=Ue(e.callee)?e.callee:n(e.callee);a&&s(Mo),s(i+"(",-2,e),ol(e.arguments,t),s(")")}function Jx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];qx(c,t),s(": "),Wt(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function Yx(e,t){Kc(e.elements,t)}function Qx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${Ja[Bc]}(`),s("(",-2,e),Ce(i)?ol(i,t):i&&Wt(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ce(l)?Kc(l,t):Wt(l,t)):o&&Wt(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Xx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Vc(s.content);u&&l("("),jh(s,t),u&&l(")")}else l("("),Wt(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),Wt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Wt(a,t),d||t.indentLevel--,i&&r(!0)}function e0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(so)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Wt(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(so)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const t0=Hh(/^(?:if|else|else-if)$/,(e,t,s)=>s0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=ru(a,r,s);else{const c=n0(n.codegenNode);c.alternate=ru(a,r+n.branches.length-1,s)}}}));function s0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ft(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=ou(e,t),i={type:9,loc:Rx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Lh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ft(30,e.loc)),s.removeNode();const o=ou(e,t);l.branches.push(o);const r=n&&n(l,o,!1);Do(o,s),r&&r(),s.currentNode=null}else s.onError(ft(30,e.loc));break}}}function ou(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!As(e,"for")?e.children:[e],userKey:No(e,"key"),isTemplateIf:s}}function ru(e,t,s){return e.condition?Fr(e.condition,cu(e,t,s),Dt(s.helper(il),['""',"true"])):cu(e,t,s)}function cu(e,t,s){const{helper:n}=s,a=At("key",He(`${t}`,!1,ws,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return lo(r,a,s),r}else return Ki(s,n(qi),Rs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=yx(r);return c.type===13&&zc(c,s),lo(c,a,s),r}}function n0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const a0=Hh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return i0(e,t,s,i=>{const l=Dt(n(Pc),[i.source]),o=ao(e),r=As(e,"memo"),c=No(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?At("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=Ki(s,n(qi),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:b}=i,A=b.length!==1||b[0].type!==1,I=io(e)?e:o&&e.children.length===1&&io(e.children[0])?e.children[0]:null;if(I?(m=I.codegenNode,o&&u&&lo(m,u,s)):A?m=Ki(s,n(qi),u?Rs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=b[0].codegenNode,o&&u&&lo(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(pa),a(Xa(s.inSSR,m.isComponent))):a(Qa(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(pa),n(Xa(s.inSSR,m.isComponent))):n(Qa(s.inSSR,m.isComponent))),r){const k=Ya(Br(i.parseResult,[He("_cached")]));k.body=ox([Bs(["const _memo = (",r.exp,")"]),Bs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Sh)}(_cached, _memo)) return _cached`]),Bs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(k,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Ya(Br(i.parseResult),m,!0))}})});function i0(e,t,s,n){if(!t.exp){s.onError(ft(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ft(32,t.loc));return}qh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:ao(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const f=n&&n(p);return()=>{o.vFor--,f&&f()}}function qh(e,t){e.finalized||(e.finalized=!0)}function Br({value:e,key:t,index:s},n=[]){return l0([e,t,s,...n])}function l0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const du=He("undefined",!1),o0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=As(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},r0=(e,t,s,n)=>Ya(e,s,!1,!0,s.length?s[0].loc:n);function c0(e,t,s=r0){t.helper(Bc);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=As(e,"slot",!0);if(r){const{arg:A,exp:I}=r;A&&!fs(A)&&(o=!0),i.push(At(A||He("default",!0),s(I,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let A=0;A<n.length;A++){const I=n[A];let k;if(!ao(I)||!(k=As(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(r){t.onError(ft(37,k.loc));break}c=!0;const{children:v,loc:_}=I,{arg:E=He("default",!0),exp:g,loc:T}=k;let y;fs(E)?y=E?E.content:"default":o=!0;const w=As(I,"for"),L=s(g,w,v,_);let F,M;if(F=As(I,"if"))o=!0,l.push(Fr(F.exp,kl(E,L,f++),du));else if(M=As(I,/^else(?:-if)?$/,!0)){let D=A,$;for(;D--&&($=n[D],!!Lh($)););if($&&ao($)&&As($,/^(?:else-)?if$/)){let P=l[l.length-1];for(;P.alternate.type===19;)P=P.alternate;P.alternate=M.exp?Fr(M.exp,kl(E,L,f++),du):kl(E,L,f++)}else t.onError(ft(30,M.loc))}else if(w){o=!0;const D=w.forParseResult;D?(qh(D),l.push(Dt(t.helper(Pc),[D.source,Ya(Br(D),kl(E,L),!0)]))):t.onError(ft(32,w.loc))}else{if(y){if(p.has(y)){t.onError(ft(38,T));continue}p.add(y),y==="default"&&(d=!0)}i.push(At(E,L))}}if(!r){const A=(I,k)=>{const v=s(I,void 0,k,a);return t.compatConfig&&(v.isNonScopedSlot=!0),At("default",v)};c?u.length&&!u.every(qc)&&(d?t.onError(ft(39,u[0].loc)):i.push(A(void 0,u))):i.push(A(void 0,n))}const m=o?2:Dl(e.children)?3:1;let b=Rs(i.concat(At("_",He(m+"",!1))),a);return l.length&&(b=Dt(t.helper(kh),[b,ra(l)])),{slots:b,hasDynamicSlots:o}}function kl(e,t,s){const n=[At("name",e),At("fn",t)];return s!=null&&n.push(At("key",He(String(s),!0))),Rs(n)}function Dl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Dl(s.children))return!0;break;case 9:if(Dl(s.branches))return!0;break;case 10:case 11:if(Dl(s.children))return!0;break}}return!1}const Gh=new WeakMap,d0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?u0(e,t):`"${n}"`;const o=Xe(l)&&l.callee===Lc;let r,c,d=0,u,p,f,m=o||l===Ri||l===Ec||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const b=Kh(e,t,void 0,i,o);r=b.props,d=b.patchFlag,p=b.dynamicPropNames;const A=b.directives;f=A&&A.length?ra(A.map(I=>f0(I,t))):void 0,b.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===eo&&(m=!0,d|=1024),i&&l!==Ri&&l!==eo){const{slots:A,hasDynamicSlots:I}=c0(e,t);c=A,I&&(d|=1024)}else if(e.children.length===1&&l!==Ri){const A=e.children[0],I=A.type,k=I===5||I===8;k&&vs(A,t)===0&&(d|=1),k||I===2?c=A:c=e.children}else c=e.children;p&&p.length&&(u=h0(p)),e.codegenNode=Ki(t,l,r,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function u0(e,t,s=!1){let{tag:n}=e;const a=Hr(n),i=No(e,"is",!1,!0);if(i)if(a||ca("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&He(i.value.content,!0):(o=i.exp,o||(o=He("is",!1,i.arg.loc))),o)return Dt(t.helper(Lc),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Ch(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Oc),t.components.add(n),Zi(n,"component"))}function Kh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let f=!1,m=0,b=!1,A=!1,I=!1,k=!1,v=!1,_=!1;const E=[],g=L=>{c.length&&(d.push(Rs(uu(c),o)),c=[]),L&&d.push(L)},T=()=>{t.scopes.vFor>0&&c.push(At(He("ref_for",!0),He("true")))},y=({key:L,value:F})=>{if(fs(L)){const M=L.content,D=ha(M);if(D&&(!n||a)&&M.toLowerCase()!=="onclick"&&M!=="onUpdate:modelValue"&&!bn(M)&&(k=!0),D&&bn(M)&&(_=!0),D&&F.type===14&&(F=F.arguments[0]),F.type===20||(F.type===4||F.type===8)&&vs(F,t)>0)return;M==="ref"?b=!0:M==="class"?A=!0:M==="style"?I=!0:M!=="key"&&!E.includes(M)&&E.push(M),n&&(M==="class"||M==="style")&&!E.includes(M)&&E.push(M)}else v=!0};for(let L=0;L<s.length;L++){const F=s[L];if(F.type===6){const{loc:M,name:D,nameLoc:$,value:P}=F;let z=!0;if(D==="ref"&&(b=!0,T()),D==="is"&&(Hr(l)||P&&P.content.startsWith("vue:")||ca("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(At(He(D,!0,$),He(P?P.content:"",z,P?P.loc:M)))}else{const{name:M,arg:D,exp:$,loc:P,modifiers:z}=F,B=M==="bind",C=M==="on";if(M==="slot"){n||t.onError(ft(40,P));continue}if(M==="once"||M==="memo"||M==="is"||B&&sa(D,"is")&&(Hr(l)||ca("COMPILER_IS_ON_ELEMENT",t))||C&&i)continue;if((B&&sa(D,"key")||C&&p&&sa(D,"vue:before-update"))&&(f=!0),B&&sa(D,"ref")&&T(),!D&&(B||C)){if(v=!0,$)if(B){if(g(),ca("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift($);continue}T(),g(),d.push($)}else g({type:14,loc:P,callee:t.helper(Uc),arguments:n?[$]:[$,"true"]});else t.onError(ft(B?34:35,P));continue}B&&z.some(_e=>_e.content==="prop")&&(m|=32);const ee=t.directiveTransforms[M];if(ee){const{props:_e,needRuntime:Ee}=ee(F,e,t);!i&&_e.forEach(y),C&&D&&!fs(D)?g(Rs(_e,o)):c.push(..._e),Ee&&(u.push(F),Jt(Ee)&&Gh.set(F,Ee))}else ag(M)||(u.push(F),p&&(f=!0))}}let w;if(d.length?(g(),d.length>1?w=Dt(t.helper(to),d,o):w=d[0]):c.length&&(w=Rs(uu(c),o)),v?m|=16:(A&&!n&&(m|=2),I&&!n&&(m|=4),E.length&&(m|=8),k&&(m|=32)),!f&&(m===0||m===32)&&(b||_||u.length>0)&&(m|=512),!t.inSSR&&w)switch(w.type){case 15:let L=-1,F=-1,M=!1;for(let P=0;P<w.properties.length;P++){const z=w.properties[P].key;fs(z)?z.content==="class"?L=P:z.content==="style"&&(F=P):z.isHandlerKey||(M=!0)}const D=w.properties[L],$=w.properties[F];M?w=Dt(t.helper(Gi),[w]):(D&&!fs(D.value)&&(D.value=Dt(t.helper(Fc),[D.value])),$&&(I||$.value.type===4&&$.value.content.trim()[0]==="["||$.value.type===17)&&($.value=Dt(t.helper($c),[$.value])));break;case 14:break;default:w=Dt(t.helper(Gi),[Dt(t.helper(ll),[w])]);break}return{props:w,directives:u,patchFlag:m,dynamicPropNames:E,shouldUseBlock:f}}function uu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ha(i))&&p0(l,a):(t.set(i,a),s.push(a))}return s}function p0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ra([e.value,t.value],e.loc)}function f0(e,t){const s=[],n=Gh.get(e);n?s.push(t.helperString(n)):(t.helper(Nc),t.directives.add(e.name),s.push(Zi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Rs(e.modifiers.map(l=>At(l,i)),a))}return ra(s,e.loc)}function h0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Hr(e){return e==="component"||e==="Component"}const m0=(e,t)=>{if(io(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=g0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=Ya([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Dt(t.helper(wh),l,n)}};function g0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=ot(l.name),a.push(l)));else if(l.name==="bind"&&sa(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=ot(l.arg.content);s=l.exp=He(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&fs(l.arg)&&(l.arg.content=ot(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Kh(e,t,a,!1,!1);n=i,l.length&&t.onError(ft(36,l[0].loc))}return{slotName:s,slotProps:n}}const Wh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ft(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Fa(ot(u)):`on:${u}`;o=He(p,!0,l.loc)}else o=Bs([`${s.helperString(Pr)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Pr)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=Rh(r),p=!(u||mx(r)),f=r.content.includes(";");(p||c&&u)&&(r=Bs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,r,f?"}":")"]))}let d={props:[At(o,r||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},v0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=ot(i.content):i.content=`${s.helperString(Mr)}(${i.content})`:(i.children.unshift(`${s.helperString(Mr)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&pu(i,"."),n.some(o=>o.content==="attr")&&pu(i,"^")),{props:[At(i,l)]}},pu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},b0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(er(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(er(r))n||(n=s[i]=Bs([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(er(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&vs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Dt(t.helper(Ic),o)}}}}},fu=new WeakSet,y0=(e,t)=>{if(e.type===1&&As(e,"once",!0))return fu.has(e)||t.inVOnce||t.inSSR?void 0:(fu.add(e),t.inVOnce=!0,t.helper(so),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Zh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ft(41,e.loc)),fi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(ft(44,n.loc)),fi();if(o==="literal-const"||o==="setup-const")return s.onError(ft(45,n.loc)),fi();if(!l.trim()||!Rh(n))return s.onError(ft(42,n.loc)),fi();const r=a||He("modelValue",!0),c=a?fs(a)?`onUpdate:${ot(a.content)}`:Bs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Bs([`${u} => ((`,n,") = $event)"]);const p=[At(r,e.exp),At(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(b=>b.content).map(b=>(Vc(b)?b:JSON.stringify(b))+": true").join(", "),m=a?fs(a)?`${a.content}Modifiers`:Bs([a,' + "Modifiers"']):"modelModifiers";p.push(At(m,He(`{ ${f} }`,!1,e.loc,2)))}return fi(p)};function fi(e=[]){return{props:e}}const x0=/[\w).+\-_$\]]/,_0=(e,t)=>{ca("COMPILER_FILTERS",t)&&(e.type===5?oo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&oo(s.exp,t)}))};function oo(e,t){if(e.type===4)hu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?hu(n,t):n.type===8?oo(e,t):n.type===5&&oo(n.content,t))}}function hu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,f,m,b=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!o&&!r&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):A();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let I=f-1,k;for(;I>=0&&(k=s.charAt(I),k===" ");I--);(!k||!x0.test(k))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&A();function A(){b.push(s.slice(d,f).trim()),d=f+1}if(b.length){for(f=0;f<b.length;f++)m=w0(m,b[f],t);e.content=m,e.ast=void 0}}function w0(e,t,s){s.helper(Dc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Zi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Zi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const mu=new WeakSet,k0=(e,t)=>{if(e.type===1){const s=As(e,"memo");return!s||mu.has(e)||t.inSSR?void 0:(mu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&zc(n,t),e.codegenNode=Dt(t.helper(Hc),[s.exp,Ya(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},S0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ft(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=ot(n.content);(Eh.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function T0(e){return[[S0,y0,t0,k0,a0,_0,m0,d0,o0,b0],{on:Wh,bind:v0,model:Zh}]}function C0(e,t={}){const s=t.onError||jc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ft(48)):n&&s(ft(49));const a=!1;t.cacheHandlers&&s(ft(50)),t.scopeId&&!n&&s(ft(51));const i=je({},t,{prefixIdentifiers:a}),l=Ue(e)?Lx(e,i):e,[o,r]=T0();return Px(l,je({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:je({},r,t.directiveTransforms||{})})),Bx(l,i)}const E0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Jh=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),zr=Symbol(""),em=Symbol(""),tm=Symbol(""),sm=Symbol(""),nm=Symbol(""),am=Symbol("");ax({[Jh]:"vModelRadio",[Yh]:"vModelCheckbox",[Qh]:"vModelText",[Xh]:"vModelSelect",[zr]:"vModelDynamic",[em]:"withModifiers",[tm]:"withKeys",[sm]:"vShow",[nm]:"Transition",[am]:"TransitionGroup"});let Ta;function A0(e,t=!1){return Ta||(Ta=document.createElement("div")),t?(Ta.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ta.children[0].getAttribute("foo")):(Ta.innerHTML=e,Ta.textContent)}const R0={parseMode:"html",isVoidTag:_g,isNativeTag:e=>bg(e)||yg(e)||xg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:A0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return nm;if(e==="TransitionGroup"||e==="transition-group")return am},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},I0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:O0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},O0=(e,t)=>{const s=gp(e);return He(JSON.stringify(s),!1,t,3)};function Un(e,t){return ft(e,t)}const L0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Un(54,a)),t.children.length&&(s.onError(Un(55,a)),t.children.length=0),{props:[At(He("innerHTML",!0,a),n||He("",!0))]}},N0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Un(56,a)),t.children.length&&(s.onError(Un(57,a)),t.children.length=0),{props:[At(He("textContent",!0),n?vs(n,s)>0?n:Dt(s.helperString(Lo),[n],a):He("",!0))]}},D0=(e,t,s)=>{const n=Zh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Un(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Qh,o=!1;if(a==="input"||i){const r=No(t,"type");if(r){if(r.type===7)l=zr;else if(r.value)switch(r.value.content){case"radio":l=Jh;break;case"checkbox":l=Yh;break;case"file":o=!0,s.onError(Un(60,e.loc));break}}else gx(t)&&(l=zr)}else a==="select"&&(l=Xh);o||(n.needRuntime=s.helper(l))}else s.onError(Un(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},M0=ys("passive,once,capture"),P0=ys("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),F0=ys("left,right"),im=ys("onkeyup,onkeydown,onkeypress"),$0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&Wi("COMPILER_V_ON_NATIVE",s)||M0(r)?l.push(r):F0(r)?fs(e)?im(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):P0(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},gu=(e,t)=>fs(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Bs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,U0=(e,t,s)=>Wh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=$0(i,a,s,e.loc);if(r.includes("right")&&(i=gu(i,"onContextmenu")),r.includes("middle")&&(i=gu(i,"onMouseup")),r.length&&(l=Dt(s.helper(em),[l,JSON.stringify(r)])),o.length&&(!fs(i)||im(i.content.toLowerCase()))&&(l=Dt(s.helper(tm),[l,JSON.stringify(o)])),c.length){const d=c.map(ga).join("");i=fs(i)?He(`${i.content}${d}`,!0):Bs(["(",i,`) + "${d}"`])}return{props:[At(i,l)]}}),B0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Un(62,a)),{props:[],needRuntime:s.helper(sm)}},H0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},z0=[I0],j0={cloak:E0,html:L0,text:N0,model:D0,on:U0,show:B0};function V0(e,t={}){return C0(e,je({},R0,t,{nodeTransforms:[H0,...z0,...t.nodeTransforms||[]],directiveTransforms:je({},j0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const vu=Object.create(null);function q0(e,t){if(!Ue(e))if(e.nodeType)e=e.innerHTML;else return zt;const s=og(e,t),n=vu[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=je({hoistStatic:!0,onError:void 0,onWarn:zt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=V0(e,a),l=new Function("Vue",i)(Qy);return l._rc=!0,vu[s]=l}zf(q0);const ro=Hn({items:[]});let G0=1;function Po(e,t="info",s=3e3){const n=G0++;return ro.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Wc(n),s),n}function Wc(e){const t=ro.items.findIndex(s=>s.id===e);t>=0&&ro.items.splice(t,1)}function Oe(e,t="info",s=3e3){return Po(e,t,s)}Oe.success=(e,t=3e3)=>Po(e,"success",t);Oe.error=(e,t=5e3)=>Po(e,"error",t);Oe.info=(e,t=3e3)=>Po(e,"info",t);Oe.dismiss=Wc;const K0={setup(){return{state:ro,dismiss:Wc}},template:`
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
  `},pn=Hn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ja=null;function Zt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ja&&ja(!1),pn.title=e,pn.message=t,pn.confirmLabel=s,pn.cancelLabel=n,pn.danger=a,pn.open=!0,new Promise(i=>{ja=i})}function bu(e){pn.open=!1,ja&&(ja(e),ja=null)}const W0={setup(){function e(t){pn.open&&t.key==="Escape"&&(t.stopPropagation(),bu(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),_t(()=>document.removeEventListener("keydown",e,!0)),{state:pn,settle:bu}},template:`
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
 */const Oa=typeof document<"u";function lm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Z0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&lm(e.default)}const st=Object.assign;function sr(e,t){const s={};for(const n in t){const a=t[n];s[n]=zs(a)?a.map(e):e(a)}return s}const Ii=()=>{},zs=Array.isArray;function yu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const om=/#/g,J0=/&/g,Y0=/\//g,Q0=/=/g,X0=/\?/g,rm=/\+/g,e_=/%5B/g,t_=/%5D/g,cm=/%5E/g,s_=/%60/g,dm=/%7B/g,n_=/%7C/g,um=/%7D/g,a_=/%20/g;function Zc(e){return e==null?"":encodeURI(""+e).replace(n_,"|").replace(e_,"[").replace(t_,"]")}function i_(e){return Zc(e).replace(dm,"{").replace(um,"}").replace(cm,"^")}function jr(e){return Zc(e).replace(rm,"%2B").replace(a_,"+").replace(om,"%23").replace(J0,"%26").replace(s_,"`").replace(dm,"{").replace(um,"}").replace(cm,"^")}function l_(e){return jr(e).replace(Q0,"%3D")}function o_(e){return Zc(e).replace(om,"%23").replace(X0,"%3F")}function r_(e){return o_(e).replace(Y0,"%2F")}function Yi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const c_=/\/$/,d_=e=>e.replace(c_,"");function nr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=h_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Yi(l)}}function u_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function xu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function p_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ei(t.matched[n],s.matched[a])&&pm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ei(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function pm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!f_(e[s],t[s]))return!1;return!0}function f_(e,t){return zs(e)?_u(e,t):zs(t)?_u(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function _u(e,t){return zs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function h_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const On={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Vr=(function(e){return e.pop="pop",e.push="push",e})({}),ar=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function m_(e){if(!e)if(Oa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),d_(e)}const g_=/^[^#]+#/;function v_(e,t){return e.replace(g_,"#")+t}function b_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Fo=()=>({left:window.scrollX,top:window.scrollY});function y_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=b_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function wu(e,t){return(history.state?history.state.position-t:-1)+e}const qr=new Map;function x_(e,t){qr.set(e,t)}function __(e){const t=qr.get(e);return qr.delete(e),t}function w_(e){return typeof e=="string"||e&&typeof e=="object"}function fm(e){return typeof e=="string"||typeof e=="symbol"}let yt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const hm=Symbol("");yt.MATCHER_NOT_FOUND+"",yt.NAVIGATION_GUARD_REDIRECT+"",yt.NAVIGATION_ABORTED+"",yt.NAVIGATION_CANCELLED+"",yt.NAVIGATION_DUPLICATED+"";function ti(e,t){return st(new Error,{type:e,[hm]:!0},t)}function on(e,t){return e instanceof Error&&hm in e&&(t==null||!!(e.type&t))}const k_=["params","query","hash"];function S_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of k_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function T_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(rm," "),i=a.indexOf("="),l=Yi(i<0?a:a.slice(0,i)),o=i<0?null:Yi(a.slice(i+1));if(l in t){let r=t[l];zs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function ku(e){let t="";for(let s in e){const n=e[s];if(s=l_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(zs(n)?n.map(a=>a&&jr(a)):[n&&jr(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function C_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=zs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const E_=Symbol(""),Su=Symbol(""),$o=Symbol(""),Jc=Symbol(""),Gr=Symbol("");function hi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Fn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(ti(yt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):w_(p)?r(ti(yt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function ir(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(lm(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Fn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=Z0(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Fn(p,s,n,l,o,a)()}))}}return i}function A_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>ei(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>ei(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let R_=()=>location.protocol+"//"+location.host;function mm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),xu(o,"")}return xu(s,e)+n+a}function I_(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const f=mm(e,location),m=s.value,b=t.value;let A=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}A=b?p.position-b.position:0}else n(f);a.forEach(I=>{I(s.value,m,{delta:A,type:Vr.pop,direction:A?A>0?ar.forward:ar.back:ar.unknown})})};function r(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(st({},p.state,{scroll:Fo()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Tu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Fo():null}}function O_(e){const{history:t,location:s}=window,n={value:mm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:R_()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(r,c){i(r,st({},t.state,Tu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=st({},a.value,t.state,{forward:r,scroll:Fo()});i(d.current,d,!0),i(r,st({},Tu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function L_(e){e=m_(e);const t=O_(e),s=I_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=st({location:"",base:e,go:n,createHref:v_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function N_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),L_(e)}let aa=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Lt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Lt||{});const D_={type:aa.Static,value:""},M_=/[a-zA-Z0-9_]/;function P_(e){if(!e)return[[]];if(e==="/")return[[D_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=Lt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Lt.Static?i.push({type:aa.Static,value:c}):s===Lt.Param||s===Lt.ParamRegExp||s===Lt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:aa.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Lt.ParamRegExp){n=s,s=Lt.EscapeNext;continue}switch(s){case Lt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Lt.Param):p();break;case Lt.EscapeNext:p(),s=n;break;case Lt.Param:r==="("?s=Lt.ParamRegExp:M_.test(r)?p():(u(),s=Lt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Lt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Lt.ParamRegExpEnd:d+=r;break;case Lt.ParamRegExpEnd:u(),s=Lt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Lt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Cu="[^/]+?",F_={sensitive:!1,strict:!1,start:!0,end:!0};var ts=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ts||{});const $_=/[.+*?^${}()[\]/\\]/g;function U_(e,t){const s=st({},F_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ts.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ts.Segment+(s.sensitive?ts.BonusCaseSensitive:0);if(p.type===aa.Static)u||(a+="/"),a+=p.value.replace($_,"\\$&"),f+=ts.Static;else if(p.type===aa.Param){const{value:m,repeatable:b,optional:A,regexp:I}=p;i.push({name:m,repeatable:b,optional:A});const k=I||Cu;if(k!==Cu){f+=ts.BonusCustomRegExp;try{`${k}`}catch(_){throw new Error(`Invalid custom RegExp for param "${m}" (${k}): `+_.message)}}let v=b?`((?:${k})(?:/(?:${k}))*)`:`(${k})`;u||(v=A&&c.length<2?`(?:/${v})`:"/"+v),A&&(v+="?"),a+=v,f+=ts.Dynamic,A&&(f+=ts.BonusOptional),b&&(f+=ts.BonusRepeatable),k===".*"&&(f+=ts.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ts.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===aa.Static)d+=f.value;else if(f.type===aa.Param){const{value:m,repeatable:b,optional:A}=f,I=m in c?c[m]:"";if(zs(I)&&!b)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const k=zs(I)?I.join("/"):I;if(!k)if(A)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=k}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function B_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ts.Static+ts.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ts.Static+ts.Segment?1:-1:0}function gm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=B_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Eu(n))return 1;if(Eu(a))return-1}return a.length-n.length}function Eu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const H_={strict:!1,end:!0,sensitive:!1};function z_(e,t,s){const n=U_(P_(e.path),s),a=st(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function j_(e,t){const s=[],n=new Map;t=yu(H_,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,b=Ru(u);b.aliasOf=f&&f.record;const A=yu(t,u),I=[b];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const E of _)I.push(Ru(st({},b,{components:f?f.record.components:b.components,path:E,aliasOf:f?f.record:b})))}let k,v;for(const _ of I){const{path:E}=_;if(p&&E[0]!=="/"){const g=p.record.path,T=g[g.length-1]==="/"?"":"/";_.path=p.record.path+(E&&T+E)}if(k=z_(_,p,A),f?f.alias.push(k):(v=v||k,v!==k&&v.alias.push(k),m&&u.name&&!Iu(k)&&l(u.name)),vm(k)&&r(k),b.children){const g=b.children;for(let T=0;T<g.length;T++)i(g[T],k,f&&f.children[T])}f=f||k}return v?()=>{l(v)}:Ii}function l(u){if(fm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=G_(u,s);s.splice(p,0,u),u.record.name&&!Iu(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},b,A;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw ti(yt.MATCHER_NOT_FOUND,{location:u});A=f.record.name,m=st(Au(p.params,f.keys.filter(v=>!v.optional).concat(f.parent?f.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),u.params&&Au(u.params,f.keys.map(v=>v.name))),b=f.stringify(m)}else if(u.path!=null)b=u.path,f=s.find(v=>v.re.test(b)),f&&(m=f.parse(b),A=f.record.name);else{if(f=p.name?n.get(p.name):s.find(v=>v.re.test(p.path)),!f)throw ti(yt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});A=f.record.name,m=st({},p.params,u.params),b=f.stringify(m)}const I=[];let k=f;for(;k;)I.unshift(k.record),k=k.parent;return{name:A,path:b,params:m,matched:I,meta:q_(I)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function Au(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Ru(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:V_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function V_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Iu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function q_(e){return e.reduce((t,s)=>st(t,s.meta),{})}function G_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;gm(e,t[i])<0?n=i:s=i+1}const a=K_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function K_(e){let t=e;for(;t=t.parent;)if(vm(t)&&gm(e,t)===0)return t}function vm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Ou(e){const t=Is($o),s=Is(Jc),n=W(()=>{const r=en(e.to);return t.resolve(r)}),a=W(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ei.bind(null,d));if(p>-1)return p;const f=Lu(r[c-2]);return c>1&&Lu(d)===f&&u[u.length-1].path!==f?u.findIndex(ei.bind(null,r[c-2])):p}),i=W(()=>a.value>-1&&Q_(s.params,n.value.params)),l=W(()=>a.value>-1&&a.value===s.matched.length-1&&pm(s.params,n.value.params));function o(r={}){if(Y_(r)){const c=t[en(e.replace)?"replace":"push"](en(e.to)).catch(Ii);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:W(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function W_(e){return e.length===1?e[0]:e}const Z_=sl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Ou,setup(e,{slots:t}){const s=Hn(Ou(e)),{options:n}=Is($o),a=W(()=>({[Nu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Nu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&W_(t.default(s));return e.custom?i:Ka("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),J_=Z_;function Y_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Q_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!zs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Lu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Nu=(e,t,s)=>e??t??s,X_=sl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Is(Gr),a=W(()=>e.route||n.value),i=Is(Su,0),l=W(()=>{let c=en(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=W(()=>a.value.matched[l.value]);Ti(Su,W(()=>l.value+1)),Ti(E_,o),Ti(Gr,a);const r=h();return as(()=>[r.value,o.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!ei(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(b=>b(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return Du(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,A=Ka(p,st({},m,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return Du(s.default,{Component:A,route:c})||A}}});function Du(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const ew=X_;function tw(e){const t=j_(e.routes,e),s=e.parseQuery||T_,n=e.stringifyQuery||ku,a=e.history,i=hi(),l=hi(),o=hi(),r=lc(On);let c=On;Oa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=sr.bind(null,H=>""+H),u=sr.bind(null,r_),p=sr.bind(null,Yi);function f(H,le){let oe,ke;return fm(H)?(oe=t.getRecordMatcher(H),ke=le):ke=H,t.addRoute(ke,oe)}function m(H){const le=t.getRecordMatcher(H);le&&t.removeRoute(le)}function b(){return t.getRoutes().map(H=>H.record)}function A(H){return!!t.getRecordMatcher(H)}function I(H,le){if(le=st({},le||r.value),typeof H=="string"){const O=nr(s,H,le.path),U=t.resolve({path:O.path},le),te=a.createHref(O.fullPath);return st(O,U,{params:p(U.params),hash:Yi(O.hash),redirectedFrom:void 0,href:te})}let oe;if(H.path!=null)oe=st({},H,{path:nr(s,H.path,le.path).path});else{const O=st({},H.params);for(const U in O)O[U]==null&&delete O[U];oe=st({},H,{params:u(O)}),le.params=u(le.params)}const ke=t.resolve(oe,le),ye=H.hash||"";ke.params=d(p(ke.params));const Be=u_(n,st({},H,{hash:i_(ye),path:ke.path})),S=a.createHref(Be);return st({fullPath:Be,hash:ye,query:n===ku?C_(H.query):H.query||{}},ke,{redirectedFrom:void 0,href:S})}function k(H){return typeof H=="string"?nr(s,H,r.value.path):st({},H)}function v(H,le){if(c!==H)return ti(yt.NAVIGATION_CANCELLED,{from:le,to:H})}function _(H){return T(H)}function E(H){return _(st(k(H),{replace:!0}))}function g(H,le){const oe=H.matched[H.matched.length-1];if(oe&&oe.redirect){const{redirect:ke}=oe;let ye=typeof ke=="function"?ke(H,le):ke;return typeof ye=="string"&&(ye=ye.includes("?")||ye.includes("#")?ye=k(ye):{path:ye},ye.params={}),st({query:H.query,hash:H.hash,params:ye.path!=null?{}:H.params},ye)}}function T(H,le){const oe=c=I(H),ke=r.value,ye=H.state,Be=H.force,S=H.replace===!0,O=g(oe,ke);if(O)return T(st(k(O),{state:typeof O=="object"?st({},ye,O.state):ye,force:Be,replace:S}),le||oe);const U=oe;U.redirectedFrom=le;let te;return!Be&&p_(n,ke,oe)&&(te=ti(yt.NAVIGATION_DUPLICATED,{to:U,from:ke}),Ee(ke,ke,!0,!1)),(te?Promise.resolve(te):L(U,ke)).catch(J=>on(J)?on(J,yt.NAVIGATION_GUARD_REDIRECT)?J:_e(J):C(J,U,ke)).then(J=>{if(J){if(on(J,yt.NAVIGATION_GUARD_REDIRECT))return T(st({replace:S},k(J.to),{state:typeof J.to=="object"?st({},ye,J.to.state):ye,force:Be}),le||U)}else J=M(U,ke,!0,S,ye);return F(U,ke,J),J})}function y(H,le){const oe=v(H,le);return oe?Promise.reject(oe):Promise.resolve()}function w(H){const le=se.values().next().value;return le&&typeof le.runWithContext=="function"?le.runWithContext(H):H()}function L(H,le){let oe;const[ke,ye,Be]=A_(H,le);oe=ir(ke.reverse(),"beforeRouteLeave",H,le);for(const O of ke)O.leaveGuards.forEach(U=>{oe.push(Fn(U,H,le))});const S=y.bind(null,H,le);return oe.push(S),Z(oe).then(()=>{oe=[];for(const O of i.list())oe.push(Fn(O,H,le));return oe.push(S),Z(oe)}).then(()=>{oe=ir(ye,"beforeRouteUpdate",H,le);for(const O of ye)O.updateGuards.forEach(U=>{oe.push(Fn(U,H,le))});return oe.push(S),Z(oe)}).then(()=>{oe=[];for(const O of Be)if(O.beforeEnter)if(zs(O.beforeEnter))for(const U of O.beforeEnter)oe.push(Fn(U,H,le));else oe.push(Fn(O.beforeEnter,H,le));return oe.push(S),Z(oe)}).then(()=>(H.matched.forEach(O=>O.enterCallbacks={}),oe=ir(Be,"beforeRouteEnter",H,le,w),oe.push(S),Z(oe))).then(()=>{oe=[];for(const O of l.list())oe.push(Fn(O,H,le));return oe.push(S),Z(oe)}).catch(O=>on(O,yt.NAVIGATION_CANCELLED)?O:Promise.reject(O))}function F(H,le,oe){o.list().forEach(ke=>w(()=>ke(H,le,oe)))}function M(H,le,oe,ke,ye){const Be=v(H,le);if(Be)return Be;const S=le===On,O=Oa?history.state:{};oe&&(ke||S?a.replace(H.fullPath,st({scroll:S&&O&&O.scroll},ye)):a.push(H.fullPath,ye)),r.value=H,Ee(H,le,oe,S),_e()}let D;function $(){D||(D=a.listen((H,le,oe)=>{if(!ge.listening)return;const ke=I(H),ye=g(ke,ge.currentRoute.value);if(ye){T(st(ye,{replace:!0,force:!0}),ke).catch(Ii);return}c=ke;const Be=r.value;Oa&&x_(wu(Be.fullPath,oe.delta),Fo()),L(ke,Be).catch(S=>on(S,yt.NAVIGATION_ABORTED|yt.NAVIGATION_CANCELLED)?S:on(S,yt.NAVIGATION_GUARD_REDIRECT)?(T(st(k(S.to),{force:!0}),ke).then(O=>{on(O,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&!oe.delta&&oe.type===Vr.pop&&a.go(-1,!1)}).catch(Ii),Promise.reject()):(oe.delta&&a.go(-oe.delta,!1),C(S,ke,Be))).then(S=>{S=S||M(ke,Be,!1),S&&(oe.delta&&!on(S,yt.NAVIGATION_CANCELLED)?a.go(-oe.delta,!1):oe.type===Vr.pop&&on(S,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),F(ke,Be,S)}).catch(Ii)}))}let P=hi(),z=hi(),B;function C(H,le,oe){_e(H);const ke=z.list();return ke.length?ke.forEach(ye=>ye(H,le,oe)):console.error(H),Promise.reject(H)}function ee(){return B&&r.value!==On?Promise.resolve():new Promise((H,le)=>{P.add([H,le])})}function _e(H){return B||(B=!H,$(),P.list().forEach(([le,oe])=>H?oe(H):le()),P.reset()),H}function Ee(H,le,oe,ke){const{scrollBehavior:ye}=e;if(!Oa||!ye)return Promise.resolve();const Be=!oe&&__(wu(H.fullPath,0))||(ke||!oe)&&history.state&&history.state.scroll||null;return Et().then(()=>ye(H,le,Be)).then(S=>S&&y_(S)).catch(S=>C(S,H,le))}const ie=H=>a.go(H);let be;const se=new Set,ge={currentRoute:r,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:A,getRoutes:b,resolve:I,options:e,push:_,replace:E,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:z.add,isReady:ee,install(H){H.component("RouterLink",J_),H.component("RouterView",ew),H.config.globalProperties.$router=ge,Object.defineProperty(H.config.globalProperties,"$route",{enumerable:!0,get:()=>en(r)}),Oa&&!be&&r.value===On&&(be=!0,_(a.location).catch(ke=>{}));const le={};for(const ke in On)Object.defineProperty(le,ke,{get:()=>r.value[ke],enumerable:!0});H.provide($o,ge),H.provide(Jc,ic(le)),H.provide(Gr,r);const oe=H.unmount;se.add(H),H.unmount=function(){se.delete(H),se.size<1&&(c=On,D&&D(),D=null,r.value=On,be=!1,B=!1),oe()}}};function Z(H){return H.reduce((le,oe)=>le.then(()=>w(oe)),Promise.resolve())}return ge}function bm(){return Is($o)}function sw(e){return Is(Jc)}const Uo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=sw(),s=bm(),n=W({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=W(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=W(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});as(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},nw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var b,A,I,k,v;const f=p.payload||p,m=f.type||p.type;if(m==="tool_start"){const _=((b=f.metadata)==null?void 0:b.call_id)||null,E={callId:_,id:_||`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((A=f.metadata)==null?void 0:A.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(E);return}if(m==="tool_end"){const _=((I=f.metadata)==null?void 0:I.call_id)||null;let E=-1;if(_&&(E=e.value.findIndex(g=>g.callId===_&&g.status==="running")),E<0&&!_)for(let g=e.value.length-1;g>=0;g--){const T=e.value[g];if(T.tool===f.action&&T.status==="running"){E=g;break}}if(E>=0){const g=e.value[E];g.status=(k=f.metadata)!=null&&k.error?"error":"success",g.elapsed=((v=f.metadata)==null?void 0:v.elapsed_ms)||Date.now()-g.startTime,g.result=f.detail||"",g.fadingOut=!0,setTimeout(()=>{const T=e.value.indexOf(g);T>=0&&e.value.splice(T,1),t.value.unshift(g),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const _=f.call_id||f.tool_name||"unknown";if(f.finished){const E={...s.value};delete E[_],s.value=E}else{const g=((s.value[_]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[_]:g.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let o=!1;function r(){o||(o=!0,Ze.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Ze.off("events",a),i&&(clearInterval(i),i=null))}Ge(r),xs(r),_s(c),_t(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
... (truncated)`:s}function Mu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function wm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function km(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Sm=Symbol("agent-detail-cancelled"),iw=15e3;function lw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((f,m)=>{r=f,c=m});function u(f,m){o||(o=!0,l!==null&&a(l),l=null,(f?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return o||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Sm),i==null||i.abort()}}}function Tm({state:e,requestDetail:t,timeoutMs:s=iw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const b={agentId:p,cancel:null,promise:null};l=b,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const A=lw(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return b.cancel=A.cancel,b.promise=(async()=>{let I=null,k=null;try{I=await A.promise}catch(v){k=v}I!==Sm&&(l!==b||e.detailId!==p||(l=null,!k&&(I===null||typeof I!="object")&&(k=new Error(`${n} response was empty or invalid`)),k?e.detail===null&&(e.detailError=(k==null?void 0:k.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),b.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function ow({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const rw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const o=W(()=>e.value.filter(C=>C.status==="running").length),r=W(()=>e.value.filter(C=>C.status==="completed").length),c=W(()=>e.value.filter(C=>["failed","timeout","killed"].includes(C.status)).length),d=W(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=W(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(C=>["failed","timeout","killed"].includes(C.status)):e.value.filter(C=>C.status===i.value));function p(C){const ee=Number(C.max_iterations)||0;return ee<=0?0:Math.min(100,Math.round(C.iteration_count/ee*100))}function f(C){return(Number(C.max_iterations)||0)>0}function m(C,ee){return C?C==="N/A"?"N/A":ee==="current_inheritance"?`inherit (currently ${C})`:C:"unknown"}function b(C){return m(C.display_model,C.display_model_source||C.display_source)}function A(C){return m(C.display_reasoning_effort,C.display_reasoning_effort_source||C.display_source)}function I(C){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[C]||""}const k=h(null),v=h(null),_=h(!1),E=h(null),g=h(""),y=Tm({state:{get detail(){return k.value},set detail(C){k.value=C},get detailId(){return v.value},set detailId(C){v.value=C},get detailLoading(){return _.value},set detailLoading(C){_.value=C},get detailError(){return E.value},set detailError(C){E.value=C}},requestDetail:(C,{signal:ee})=>K.get(`/api/agents/${encodeURIComponent(C)}`,{signal:ee})});async function w(C){g.value="",await y.open(C.id)}function L(){y.close(),g.value=""}async function F(){await y.refresh()}async function M(C,ee){try{await navigator.clipboard.writeText(ee||""),g.value=C,setTimeout(()=>{g.value===C&&(g.value="")},1500)}catch{Oe.error("Copy failed")}}async function D(C=!1){C=C===!0,C||(t.value=!0);try{const ee=await K.get("/api/agents");e.value=Array.isArray(ee)?ee:[],s.value=null}catch(ee){C||(s.value=ee.message)}C||(t.value=!1)}async function $(C){const ee=e.value.find(Ee=>Ee.id===C);if(await Zt({title:"Kill agent",message:`Kill agent "${(ee==null?void 0:ee.label)||C}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=C;try{await K.del(`/api/agents/${encodeURIComponent(C)}`),Oe.success("Agent killed"),await D()}catch(Ee){Oe.error(Ee.message||"Failed to kill agent")}n.value=null}}const P=ow({isEnabled:()=>a.value&&l,refreshList:()=>D(!0),hasOpenDetail:()=>!!v.value,refreshDetail:F});function z(){P.start()}function B(){P.stop()}return as(a,()=>P.sync()),Ge(()=>{l=!0,D(),z()}),xs(()=>{l=!0,D(!0),z()}),_s(()=>{l=!1,B()}),_t(()=>{l=!1,B(),y.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ba,formatDuration:si,progressPercent:p,hasProgress:f,displayModelText:b,displayEffortText:A,displaySourceLabel:I,detail:k,detailId:v,detailLoading:_,detailError:E,copied:g,openDetail:w,closeDetail:L,copyText:M,fetchAgents:D,killAgent:$,startAutoRefresh:z,stopAutoRefresh:B}}},cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),o=h(null),r=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const A=Tm({state:{get detail(){return c.value},set detail(B){c.value=B},get detailId(){return d.value},set detailId(B){d.value=B},get detailLoading(){return u.value},set detailLoading(B){u.value=B},get detailError(){return p.value},set detailError(B){p.value=B}},detailLabel:"Loop detail",requestDetail:(B,{signal:C})=>K.get(`/api/loops/${encodeURIComponent(B)}?limit=100`,{signal:C})});async function I(B){f.value="",await A.open(B.id)}function k(){A.close(),f.value=""}async function v(B,C){try{await navigator.clipboard.writeText(C||""),f.value=B,setTimeout(()=>{f.value===B&&(f.value="")},1500)}catch{Oe.error("Copy failed")}}const _=W(()=>e.value.reduce((B,C)=>B+(C.iteration_count||0),0)),E=W(()=>e.value.filter(B=>B.status==="running").length);function g(B){return B==="running"?"loop-status-running":B==="error"?"loop-status-error":"loop-status-stopped"}function T(B){return B==="running"?"badge-success":B==="error"?"badge-danger":B==="completed"?"badge-info":"badge-warning"}function y(B){return B==="act"?"badge-warning":B==="silent"?"badge-info":"badge-success"}async function w(B=!1){B=B===!0,B||(t.value=!0);try{const C=await K.get("/api/loops");e.value=Array.isArray(C)?C:[],s.value=null}catch(C){B||(s.value=C.message)}B||(t.value=!1)}async function L(){l.value=null;const B=a.value;if(!B.goal.trim()){l.value="Goal is required";return}if(!B.channel_id.trim()){l.value="Channel ID is required";return}const C={goal:B.goal.trim(),channel_id:B.channel_id.trim(),interval_seconds:B.interval_seconds||60,mode:B.mode,max_iterations:B.max_iterations||50};B.stop_condition.trim()&&(C.stop_condition=B.stop_condition.trim()),i.value=!0;try{const ee=await K.post("/api/loops",C);Oe.success(`Loop started: ${ee.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await w()}catch(ee){l.value=ee.message}i.value=!1}async function F(B){if(await Zt({title:"Stop loop",message:`Stop loop ${B}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=B;try{await K.del(`/api/loops/${encodeURIComponent(B)}`),Oe.success("Loop stopped"),await w()}catch(ee){Oe.error(ee.message||"Failed to stop loop")}o.value=null}}async function M(B){r.value=B;try{await K.post(`/api/loops/${encodeURIComponent(B)}/restart`),Oe.success("Loop restarted"),await w()}catch(C){Oe.error(C.message||"Failed to restart loop")}r.value=null}function D(B){m&&B.payload&&(B.payload.loop_id||B.payload.type==="loop")&&(w(!0),d.value&&A.refresh())}let $=null;function P(){$!==null&&clearInterval($),$=null}function z(){P(),m&&($=setInterval(()=>{w(!0),d.value&&A.refresh()},5e3))}return Ge(()=>{m=!0,w(),Ze.subscribe("events",D),z()}),xs(()=>{m=!0,w(!0),z()}),_s(()=>{m=!1,P()}),_t(()=>{m=!1,Ze.unsubscribe("events",D),P(),A.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:_,runningCount:E,statusDotClass:g,statusBadge:T,modeBadge:y,formatAge:xm,formatDuration:si,formatTs:ba,formatTokens:km,openDetail:I,closeDetail:k,copyText:v,fetchLoops:w,doCreate:L,doStop:F,doRestart:M}}},dw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=W(()=>e.value.filter(k=>k.status==="running").length),o=W(()=>e.value.filter(k=>k.status!=="running").length);function r(k){return k==="running"?"loop-status-running":k==="failed"||k==="error"?"loop-status-error":"loop-status-stopped"}function c(k){return k==="running"?"badge-success":k==="completed"||k==="exited"?"badge-info":k==="killed"||k==="error"||k==="failed"?"badge-danger":"badge-warning"}async function d(k=!1){k=k===!0,k||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(v){k||(s.value=v.message)}k||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}as(n,k=>{k?u():p()});async function f(k){if(await Zt({title:"Kill process",message:`Kill process ${k}?`,confirmLabel:"Kill",danger:!0})){i.value=k;try{await K.del(`/api/processes/${k}`),Oe.success(`Process ${k} killed`),await d()}catch(_){Oe.error(_.message||"Failed to kill process")}i.value=null}}function m(k){k.payload&&(k.payload.pid||k.payload.type==="process")&&d(!0)}let b=!1;function A(){b||(b=!0,d(),Ze.subscribe("events",m),u())}function I(){b&&(b=!1,Ze.unsubscribe("events",m),p())}return Ge(A),xs(A),_s(I),_t(I),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:si,fetchProcesses:d,doKill:f}}},uw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Pu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function pw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function fw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function hw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=uw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const A of new Set([p,f])){const I=new Date(u+A*6e4);pw(I,c)===d&&(m.some(k=>k.getTime()===I.getTime())||m.push(I))}if(m.sort((A,I)=>A.getTime()-I.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(A=>({instant:A,offset:fw(A),iso:A.toISOString()}))};const b=m[0];return{state:"ok",typed:t,instant:b,iso:b.toISOString()}}const mw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),o=h(null),r=W(()=>hw(a.value.run_at));as(()=>a.value.run_at,()=>{o.value=null});const c=W(()=>{var H;const Z=r.value;return Z.state==="ok"?Z.instant:Z.state==="ambiguous"&&o.value!==null&&((H=Z.options[o.value])==null?void 0:H.instant)||null}),d=W(()=>{const Z=c.value;return Z?`${Z.toLocaleString()} local — ${Z.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),b=h(null),A=h(null),I=h(null),k=h(null),v=h(null),_=h([]),E=h(!1),g=h("");let T=0;const y=W(()=>e.value.filter(Z=>Z.cron&&!Z.one_time).length),w=W(()=>e.value.filter(Z=>Z.one_time).length),L=W(()=>e.value.filter(Z=>Z.trigger).length),F=W(()=>e.value.filter(Z=>Z.paused).length),M=W(()=>e.value.filter(Z=>Z.consecutive_failures>0).length);function D(Z){if(!Z)return"-";const H=Date.now(),oe=(new Date(Z).getTime()-H)/1e3;if(oe<0)return"overdue";if(oe<60)return"in < 1 min";if(oe<3600)return`in ${Math.floor(oe/60)} min`;if(oe<86400){const ye=Math.floor(oe/3600),Be=Math.floor(oe%3600/60);return Be>0?`in ${ye}h ${Be}m`:`in ${ye}h`}const ke=Math.floor(oe/86400);return`in ${ke} day${ke!==1?"s":""}`}function $(Z){return Z==null?"-":Z<1e3?`${Z}ms`:Z<6e4?`${(Z/1e3).toFixed(1)}s`:si(Z/1e3)}function P(Z=a.value.cron){a.value.cron=Z,Pu(a.value,"cron"),u.value=null}function z(Z=a.value.run_at){a.value.run_at=Z,Pu(a.value,"run_at"),u.value=null}async function B(){const Z=a.value.cron.trim();if(Z){p.value=!0;try{u.value=await K.post("/api/schedules/validate-cron",{expression:Z})}catch(H){u.value={valid:!1,error:H.message}}p.value=!1}}async function C(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(Z){s.value=Z.message}t.value=!1}async function ee(Z){if(v.value===Z){v.value=null,_.value=[];return}v.value=Z,E.value=!0,_.value=[];const H=++T;try{const le=await K.get(`/api/schedules/${encodeURIComponent(Z)}/history?limit=10`);if(H!==T||v.value!==Z)return;_.value=le,g.value=""}catch(le){if(H!==T||v.value!==Z)return;_.value=[],g.value=le.message||"Failed to load execution history"}H===T&&(E.value=!1)}async function _e(){l.value=null;const Z=a.value;if(!Z.description.trim()){l.value="Description is required";return}if(!Z.channel_id.trim()){l.value="Channel ID is required";return}if(!Z.cron.trim()&&!Z.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(Z.cron.trim()&&Z.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const H={description:Z.description.trim(),action:Z.action,channel_id:Z.channel_id.trim()};if(Z.cron.trim()&&(H.cron=Z.cron.trim()),Z.run_at.trim()){const le=r.value;if(le.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(le.state==="invalid"){l.value="One-time run time is not a valid date";return}const oe=c.value;if(le.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!oe){l.value="One-time run time could not be resolved";return}H.run_at=oe.toISOString()}if(Z.action==="reminder"&&Z.message.trim()&&(H.message=Z.message.trim()),Z.action==="check"&&(Z.tool_name.trim()&&(H.tool_name=Z.tool_name.trim()),Z.report_format&&(H.report_format=Z.report_format),Z.tool_input_str.trim()))try{H.tool_input=JSON.parse(Z.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",H),Oe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await C()}catch(le){l.value=le.message}i.value=!1}async function Ee(Z){m.value=Z;try{const H=await K.post(`/api/schedules/${encodeURIComponent(Z)}/run`);if(H.status==="failure")Oe.error(`Execution failed: ${H.error||"unknown error"}`);else{const le=H.warning?`Executed (${H.warning})`:"Executed successfully";Oe.success(le)}await C()}catch(H){Oe.error(H.message||"Failed to trigger")}m.value=null}async function ie(Z){A.value=Z.id;const H=!Z.paused;try{await K.put(`/api/schedules/${encodeURIComponent(Z.id)}`,{paused:H}),Oe.success(H?"Schedule paused":"Schedule resumed"),await C()}catch(le){Oe.error(le.message||"Failed to update schedule")}A.value=null}async function be(Z,H){k.value=Z.id;try{await K.put(`/api/schedules/${encodeURIComponent(Z.id)}`,{report_format:H}),Oe.success(H?"Structured report enabled":"Plain-text report enabled")}catch(le){Oe.error(`Update failed: ${le.message}`)}finally{await C(),k.value=null}}async function se(Z){I.value=Z;try{await K.post(`/api/schedules/${encodeURIComponent(Z)}/reset-failures`),Oe.success("Failure counters reset"),await C()}catch(H){Oe.error(H.message||"Failed to reset")}I.value=null}async function ge(Z){const H=e.value.find(oe=>oe.id===Z);if(await Zt({title:"Delete schedule",message:`Delete "${(H==null?void 0:H.description)||Z}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){b.value=Z;try{await K.del(`/api/schedules/${encodeURIComponent(Z)}`),Oe.success("Schedule deleted"),await C()}catch(oe){Oe.error(oe.message||"Failed to delete schedule")}b.value=null}}return Ge(()=>{C()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:b,togglingId:A,resettingId:I,reportUpdatingId:k,expandedId:v,history:_,historyLoading:E,historyError:g,cronCount:y,oneTimeCount:w,webhookCount:L,pausedCount:F,failingCount:M,formatTs:ba,formatAge:xm,formatFuture:D,formatMs:$,formatDuration:si,onCronInput:P,onRunAtInput:z,validateCron:B,toggleExpand:ee,fetchSchedules:C,doCreate:_e,doRunNow:Ee,doTogglePause:ie,doUpdateReportFormat:be,doResetFailures:se,doDelete:ge}}},Cm=[{id:"live",label:"Live",component:nw},{id:"agents",label:"Agents",component:rw},{id:"loops",label:"Loops",component:cw},{id:"processes",label:"Processes",component:dw},{id:"schedules",label:"Schedules",component:mw}],gw={components:{TabbedPage:Uo},setup(){return{tabs:Cm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},vw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},r()}async function r(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await K.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ge(()=>{r()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ba,formatDetail:i,truncateBlock:_m,toggleExpand:l,clearFilters:o,fetchAudit:r}}},Fu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],bw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const o=h(null),r=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),b=Fu,A=bw,I=h([]),k=h(!1),v=h(""),_=h("flat"),E=h(new Set),g=h(""),T=h(""),y=h(""),w=h(null),L=h(!1);function F(){try{const Q=localStorage.getItem("odin-session-presets");Q&&(I.value=JSON.parse(Q))}catch{}}function M(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const D=W(()=>p.value.trim()!==""||u.value!=="all"),$=W(()=>{let Q=[...e.value];const we=Fu.find(Je=>Je.id===u.value),Re=we?we.filters:{};if(Re.source&&(Q=Q.filter(Je=>Je.source===Re.source)),Re.minMessages&&(Q=Q.filter(Je=>Je.message_count>=Re.minMessages)),Re.hasCompaction&&(Q=Q.filter(Je=>Je.has_summary)),Re.maxAge!=null){const Je=Date.now()/1e3;Q=Q.filter(gt=>gt.last_active&&Je-gt.last_active<=Re.maxAge)}if(p.value.trim()){const Je=p.value.toLowerCase().trim();Q=Q.filter(gt=>(gt.channel_id||"").toLowerCase().includes(Je)||(gt.last_user_id||"").toLowerCase().includes(Je)||(gt.source||"").toLowerCase().includes(Je))}const Fe=f.value,at=m.value?1:-1;return Q.sort((Je,gt)=>{const Ns=Je[Fe]||0,js=gt[Fe]||0;return(Ns-js)*at}),Q}),P=W(()=>{if(!a.value||!a.value.messages)return[];const Q=a.value.messages;if(Q.length===0)return[];const we=[];let Re=[];for(const Fe of Q)Fe.role==="user"&&Re.length>0&&(we.push(Re),Re=[]),Re.push(Fe);return Re.length>0&&we.push(Re),we}),z=W(()=>$.value.length>0&&c.value.size===$.value.length);function B(Q){const we=Q.find(Re=>Re.role==="user");if(we&&we.content){const Re=we.content.slice(0,120);return Re.length<we.content.length?Re+"...":Re}return"(no user message)"}function C(Q){const we=new Set(E.value);we.has(Q)?we.delete(Q):we.add(Q),E.value=we}function ee(Q){u.value=Q}function _e(Q){u.value=Q.id,Q.filters.searchQuery!=null&&(p.value=Q.filters.searchQuery),Q.filters.sortBy&&(f.value=Q.filters.sortBy)}function Ee(){if(!v.value.trim())return;const Q={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};I.value=[...I.value,Q],M(),k.value=!1,v.value=""}function ie(Q){I.value=I.value.filter(we=>we.id!==Q),M(),u.value===Q&&(u.value="all")}function be(){u.value="all",p.value="",f.value="last_active",m.value=!1}function se(Q){if(!Q)return"—";const we=Date.now()/1e3-Q;if(we<60)return"just now";if(we<3600){const Fe=Math.floor(we/60);return`${Fe} minute${Fe!==1?"s":""} ago`}if(we<86400){const Fe=Math.floor(we/3600);return`${Fe} hour${Fe!==1?"s":""} ago`}const Re=Math.floor(we/86400);return`${Re} day${Re!==1?"s":""} ago`}function ge(Q){if(!Q)return"";try{return new Date(Q*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Z(Q){if(!Q)return"";try{return new Date(Q*1e3).toLocaleString()}catch{return""}}function H(Q){return Q==="user"?"bg-gray-900/50 border border-gray-800":Q==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function le(Q){return Q==="user"?"sess-msg-user":Q==="assistant"?"sess-msg-assistant":"sess-msg-system"}function oe(Q){return Q==="user"?"badge-info":Q==="assistant"?"badge-success":"badge-warning"}function ke(Q){return Q==="user"?"sess-dot-user":Q==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ye(Q){return Q==="user"?"text-cyan-400":Q==="assistant"?"text-indigo-400":"text-gray-500"}function Be(Q){return Q?Q.length>2e3?Q.slice(0,2e3)+`
... (truncated)`:Q:""}async function S(){const Q=g.value.trim();if(Q){L.value=!0;try{let we=`/api/sessions/search?q=${encodeURIComponent(Q)}&limit=50`;T.value.trim()&&(we+=`&channel_id=${encodeURIComponent(T.value.trim())}`),y.value.trim()&&(we+=`&user_id=${encodeURIComponent(y.value.trim())}`);const Re=await K.get(we);w.value=Re.results||[]}catch{w.value=[]}L.value=!1}}function O(){g.value="",T.value="",y.value="",w.value=null}function U(Q){return Q?Q.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function te(Q){return Q==="user"?"fts-result-user":Q==="assistant"?"fts-result-assistant":Q==="summary"?"fts-result-summary":Q==="fts"?"fts-result-fts":Q==="channel"?"fts-result-channel":"fts-result-default"}function J(Q){return Q==="user"?"badge-info":Q==="assistant"?"badge-success":Q==="summary"?"badge-warning":Q==="fts"?"badge-success":"badge-info"}async function X(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(Q){s.value=Q.message}t.value=!1}function he(){s.value=null,X()}async function ce(Q){if(n.value===Q){n.value=null,a.value=null,E.value=new Set;return}n.value=Q,a.value=null,i.value=!0,E.value=new Set;const we=++l;try{const Re=await K.get(`/api/sessions/${encodeURIComponent(Q)}`);we===l&&n.value===Q&&(a.value=Re)}catch(Re){we===l&&n.value===Q&&(a.value={messages:[],summary:"",error:Re.message||"Failed to load session"})}finally{we===l&&(i.value=!1)}}function re(Q){const we=new Set(c.value);we.has(Q)?we.delete(Q):we.add(Q),c.value=we}function ne(){z.value?c.value=new Set:c.value=new Set($.value.map(Q=>Q.channel_id))}function ae(Q){o.value=Q}async function me(){if(o.value){r.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await X()}catch(Q){s.value=Q.message||"Failed to clear session"}r.value=!1,o.value=null}}function xe(){d.value=!0}async function Le(){if(c.value.size!==0){r.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await X()}catch(Q){s.value=Q.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function j(Q,we){const Re=`/api/sessions/${encodeURIComponent(Q)}/export?format=${we}`;try{const Fe=await K.getBlob(Re),at=URL.createObjectURL(Fe),Je=document.createElement("a");Je.href=at,Je.download=`session-${Q}.${we==="text"?"txt":"json"}`,Je.click(),URL.revokeObjectURL(at)}catch(Fe){s.value=Fe.message||"Failed to export session"}}let de=null;function Se(Q){Q.payload&&Q.payload.channel_id&&(clearTimeout(de),de=setTimeout(()=>{if(X(),n.value&&Q.payload.channel_id===n.value){const we=n.value,Re=l;K.get(`/api/sessions/${encodeURIComponent(we)}`).then(Fe=>{Re!==l||n.value!==we||(a.value=Fe)}).catch(()=>{})}},2e3))}let Ie=!1,Ne=null;function ut(){Ie||(Ie=!0,X(),Ze.subscribe("events",Se),Ne=Ze.onReconnected(()=>X()))}Ge(()=>{F(),ut()}),xs(()=>{ut()});function it(){Ie&&(Ie=!1,Ze.unsubscribe("events",Se),Ne&&(Ne(),Ne=null),clearTimeout(de))}return _s(it),_t(it),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:z,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:b,sortOptions:A,filteredSessions:$,hasActiveFilters:D,customPresets:I,showSavePreset:k,newPresetName:v,threadView:_,threads:P,collapsedThreads:E,ftsQuery:g,ftsChannelId:T,ftsUserId:y,ftsResults:w,ftsSearching:L,formatAge:se,formatTimestamp:ge,formatFullTimestamp:Z,messageClass:H,threadMsgClass:le,roleBadge:oe,roleDotClass:ke,roleLabelClass:ye,truncateContent:Be,threadSummary:B,fetchSessions:X,retry:he,toggleSession:ce,toggleSelect:re,toggleSelectAll:ne,confirmClear:ae,clearSession:me,confirmBulkClear:xe,doBulkClear:Le,exportSession:j,applyPreset:ee,applyCustomPreset:_e,saveCustomPreset:Ee,removeCustomPreset:ie,resetFilters:be,toggleThread:C,runFtsSearch:S,clearFtsSearch:O,highlightSnippet:U,ftsResultClass:te,ftsTypeBadge:J}}},xw={props:["trace"],template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=h(""),r=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(T){if(!T)return"—";try{const y=new Date(T);return isNaN(y.getTime())?T:y.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return T}}function p(T){return!T&&T!==0?"—":T<1e3?T+"ms":(T/1e3).toFixed(1)+"s"}function f(T){return!T&&T!==0?"—":T>=1e3?(T/1e3).toFixed(1)+"k":String(T)}function m(T){if(!T)return"";if(typeof T=="string")return T;try{return JSON.stringify(T,null,2)}catch{return String(T)}}function b(T){a.value===T?a.value=null:(a.value=T,c.value={})}function A(T,y){const w=T+"-"+y;c.value={...c.value,[w]:!c.value[w]}}function I(T,y){return!!c.value[T+"-"+y]}function k(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,E()}async function v(){try{const T=await K.get("/api/trajectories");e.value=T.files||[],r.value=T.count||0}catch{}}let _=0;async function E(){const T=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const y=await K.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(T!==_)return;let w=y.entries||[];d.value.tool_name&&(w=w.filter(L=>(L.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(w=w.filter(L=>L.is_error)),d.value.channel_id&&(w=w.filter(L=>L.channel_id===d.value.channel_id)),d.value.user_id&&(w=w.filter(L=>L.user_id===d.value.user_id)),t.value=w}else{const y=new URLSearchParams;d.value.channel_id&&y.set("channel_id",d.value.channel_id),d.value.user_id&&y.set("user_id",d.value.user_id),d.value.tool_name&&y.set("tool_name",d.value.tool_name),d.value.errors_only&&y.set("errors_only","true"),y.set("limit",String(d.value.limit));const w=y.toString(),L=await K.get(`/api/trajectories/search/query?${w}`);if(T!==_)return;t.value=L.results||[]}}catch(y){if(T!==_)return;n.value=y.message}T===_&&(s.value=!1)}async function g(){if(!l.value.trim())return;const T=++_;s.value=!0,n.value=null,c.value={};try{const y=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(T!==_)return;i.value=y.entry||null,i.value||(n.value="No trace found for this message ID")}catch(y){if(T!==_)return;y.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=y.message}T===_&&(s.value=!1)}return Ge(async()=>{await v(),await E()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:_m,toggleExpand:b,toggleIteration:A,isIterationExpanded:I,clearFilters:k,fetchFiles:v,fetchTraces:E,lookupMessage:g}}},ww={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const o=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=W(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const m=await K.get("/api/usage");n.value=m,a.value=m.totals||a.value,t.value=null,s.value=!0}catch(m){t.value=m.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function f(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ge(p),xs(p),_s(f),_t(f),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:o,recentReversed:r,fmtNum:wm,formatTime:ym,retry:d}}},Em=[{id:"audit",label:"Audit",component:vw},{id:"sessions",label:"Sessions",component:yw},{id:"traces",label:"Traces",component:_w},{id:"usage",label:"Usage",component:ww}],kw={components:{TabbedPage:Uo},setup(){return{tabs:Em}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},lr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Sw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-xl font-semibold">Tools</h1>
          <p class="tl-panel-warning">Disabling a tool removes it from future model requests and causes stored jobs that call it to fail. Already-running calls are not cancelled.</p>
        </div>
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
                   class="tl-tool-card" :class="{ 'tl-tool-card-active': stats[t.name] > 0, 'tl-tool-off': t.source === 'builtin' && !t.enabled }"
                   role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                   @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                <div class="tl-tool-header">
                  <span class="tl-tool-name">{{ t.name }}</span>
                  <span v-if="stateBadge(t)" :class="['tl-state-badge', 'tl-state-' + t.state]">{{ stateBadge(t) }}</span>
                </div>
                <div class="tl-tool-desc">{{ truncate(t.description, 80) }}</div>
                <div class="tl-tool-footer">
                  <div class="tl-tool-usage">
                    <span v-if="stats[t.name]" class="tl-tool-usage-count">{{ stats[t.name].toLocaleString() }}</span>
                    <span v-else class="tl-tool-usage-zero">—</span>
                    <span class="tl-tool-usage-label">uses</span>
                  </div>
                  <label v-if="t.source === 'builtin'" class="tl-tool-switch" @click.stop @keydown.space.stop @keydown.enter.stop>
                    <span class="tl-tool-switch-label">Enabled for model</span>
                    <span class="toggle-switch" :aria-busy="togglePending.has(t.name) ? 'true' : 'false'">
                      <input type="checkbox" :checked="t.enabled" :disabled="togglePending.has(t.name)" :aria-label="'Enabled for model — ' + t.name" @change="toggleBuiltinTool(t, $event)" />
                      <span class="toggle-slider"></span>
                    </span>
                  </label>
                </div>
                <!-- Expanded detail -->
                <div v-if="expanded[t.name]" class="tl-tool-detail">
                  <div class="tl-tool-detail-desc">{{ t.description }}</div>
                  <div v-if="t.source === 'builtin' && t.is_core" class="tl-core-advisory">Core capability. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail.</div>
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
                  <th style="width:160px" class="text-right">Enabled for model</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="t in group.tools" :key="t.name">
                  <tr class="cursor-pointer" :class="{ 'tl-tool-off': t.source === 'builtin' && !t.enabled }" role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                      @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                    <td class="font-mono text-sm whitespace-nowrap">
                      <span class="tool-expand-icon text-gray-600 mr-1" aria-hidden="true"><odin-icon :name="expanded[t.name] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                      {{ t.name }}
                      <span v-if="stateBadge(t)" :class="['tl-state-badge', 'tl-state-' + t.state]">{{ stateBadge(t) }}</span>
                    </td>
                    <td class="text-gray-400 text-sm mobile-hide">{{ truncate(t.description, 100) }}</td>
                    <td class="text-right">
                      <div class="flex items-center justify-end gap-2">
                        <span v-if="stats[t.name]" class="text-gray-300 text-sm font-mono">{{ stats[t.name].toLocaleString() }}</span>
                        <span v-else class="text-gray-600 text-sm">—</span>
                      </div>
                    </td>
                    <td class="text-right">
                      <label v-if="t.source === 'builtin'" class="tl-tool-switch" @click.stop @keydown.space.stop @keydown.enter.stop>
                        <span class="toggle-switch" :aria-busy="togglePending.has(t.name) ? 'true' : 'false'">
                          <input type="checkbox" :checked="t.enabled" :disabled="togglePending.has(t.name)" :aria-label="'Enabled for model — ' + t.name" @change="toggleBuiltinTool(t, $event)" />
                          <span class="toggle-slider"></span>
                        </span>
                      </label>
                    </td>
                  </tr>
                  <tr v-if="expanded[t.name]" class="tool-detail-row">
                    <td colspan="4" class="tool-detail-cell">
                      <div class="text-gray-300 text-sm whitespace-pre-wrap">{{ t.description }}</div>
                      <div v-if="t.source === 'builtin' && t.is_core" class="tl-core-advisory">Core capability. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail.</div>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),o=h(null),r=h(!0),c=h(new Set),d={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function u(y){return y.source!=="builtin"?"":d[y.state]||""}function p(y,w){const L=y&&Array.isArray(y.tools)?y.tools:null;if(r.value=y?!!y.global_enabled:!0,!L){e.value=w;return}const F=new Set(L.map(D=>D.name)),M=w.filter(D=>!F.has(D.name)).map(D=>({...D,source:D.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...L.map(D=>({...D,source:"builtin"})),...M]}async function f(y,w){if(c.value.has(y.name))return;const L=!!w.target.checked,F=new Set(c.value);F.add(y.name),c.value=F;try{const M=await K.post(`/api/tools/builtins/${encodeURIComponent(y.name)}/enabled`,{enabled:L});p(M,e.value),s.value=null;try{const D=await K.get("/api/tools");p(M,D)}catch(D){console.warn("Built-in toggle committed; visible catalog refresh failed",D)}}catch(M){w.target.checked=!!y.enabled,s.value=M.message||`Failed to toggle ${y.name}`}finally{const M=new Set(c.value);M.delete(y.name),c.value=M}}const m=W(()=>e.value.filter(y=>y.is_core).length),b=W(()=>e.value.filter(y=>!y.is_core).length),A=W(()=>Object.values(a.value).reduce((y,w)=>y+w,0));function I(y){for(const w of lr)if(w.id!=="other"&&w.match(y))return w.id;return"other"}const k=W(()=>{let y=e.value;if(n.value){const w=n.value.toLowerCase();y=y.filter(L=>L.name.toLowerCase().includes(w)||(L.description||"").toLowerCase().includes(w))}return o.value&&(y=y.filter(w=>I(w.name)===o.value)),y}),v=W(()=>{const y=new Set;for(const w of e.value)y.add(I(w.name));return lr.filter(w=>y.has(w.id))}),_=W(()=>{const y=k.value,w={};for(const F of y){const M=I(F.name);w[M]||(w[M]=[]),w[M].push(F)}const L=[];for(const F of lr)w[F.id]&&w[F.id].length>0&&L.push({label:F.label,icon:F.icon,tools:w[F.id].sort((M,D)=>M.name.localeCompare(D.name))});return L});function E(y){i.value={...i.value,[y]:!i.value[y]}}async function g(){t.value=!0,s.value=null;try{const[y,w,L]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({})),K.get("/api/tools/builtins").catch(()=>null)]);p(L,y),a.value=w||{}}catch(y){s.value=y.message}t.value=!1}function T(){g()}return Ge(()=>{g()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,togglePending:c,coreCount:m,skillCount:b,totalUsage:A,filteredTools:k,groupedTools:_,usedCategories:v,stateBadge:u,toggleBuiltinTool:f,truncate:Qc,toggleExpand:E,refresh:T}}};function Tw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Cw(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),o=h(null),r=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),b=h(null),A=h(null),I=h(!1),k=W(()=>e.value.length),v=W(()=>e.value.reduce((se,ge)=>se+(ge.execution_count||0),0)),_=W(()=>e.value.reduce((se,ge)=>se+L(ge.code),0)),E=W(()=>{if(!l.value)return e.value;const se=l.value.toLowerCase();return e.value.filter(ge=>ge.name.toLowerCase().includes(se)||(ge.description||"").toLowerCase().includes(se))}),g=W(()=>u.value?u.value.split(`
`).length:0),T=W(()=>{const se=Math.max(g.value,1);return Array.from({length:se},(ge,Z)=>Z+1).join(`
`)}),y=W(()=>{const se=u.value.trim();return se?se.includes("SKILL_DEFINITION")?se.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function w(se){return Tw(se)}function L(se){return se?se.split(`
`).length:0}function F(se){return Cw(se)}function M(se){n.value={...n.value,[se]:!n.value[se]}}async function D(se){try{await navigator.clipboard.writeText(se);const ge=e.value.find(Z=>Z.code===se);ge&&(o.value=ge.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function $(se){if(se.key==="Tab"){se.preventDefault();const ge=se.target,Z=ge.selectionStart,H=ge.selectionEnd;u.value=u.value.substring(0,Z)+"    "+u.value.substring(H),Et(()=>{ge.selectionStart=ge.selectionEnd=Z+4})}}function P(se){const ge=se.target.previousElementSibling;ge&&(ge.scrollTop=se.target.scrollTop)}async function z(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(se){s.value=se.message}t.value=!1}async function B(se){i.value=se,delete a.value[se],a.value={...a.value};try{const ge=await K.post(`/api/skills/${encodeURIComponent(se)}/test`);a.value={...a.value,[se]:ge}}catch(ge){a.value={...a.value,[se]:{result:ge.message,is_error:!0}}}i.value=null}function C(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function ee(se){r.value=!0,c.value="edit",d.value=se.name,u.value=se.code||"",p.value=null,f.value=null}function _e(){r.value=!1,p.value=null,f.value=null}async function Ee(){p.value=null,f.value=null;const se=d.value.trim(),ge=u.value.trim();if(!se){p.value="Name is required";return}if(!ge){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:se,code:ge}),f.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(se)}`,{code:ge}),f.value="Skill updated successfully"),await z(),setTimeout(()=>{r.value=!1},800)}catch(Z){p.value=Z.message}m.value=!1}function ie(se){A.value=se}async function be(){if(A.value){I.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(A.value)}`),await z()}catch(se){Oe.error(`Failed to delete skill: ${se.message||"unknown error"}`)}I.value=!1,A.value=null}}return Ge(()=>{z()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:b,deleteTarget:A,deleting:I,enabledCount:k,totalExecutions:v,totalLines:_,displayedSkills:E,editLineCount:g,editorLineNums:T,editValidation:y,highlight:w,truncate:Qc,formatTs:ba,countLines:L,getLineNumbers:F,toggleCode:M,copyCode:D,handleEditorKey:$,syncScroll:P,fetchSkills:z,testSkill:B,showCreate:C,editSkill:ee,cancelEdit:_e,saveSkill:Ee,confirmDelete:ie,doDelete:be}}};class Es extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Aw=/^[A-Za-z_][A-Za-z0-9_]*$/;function $u(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Uu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Es(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Es(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Es(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Es(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function Rw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Iw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Es("Server name is required.","name");if(a.length>128||!Aw.test(a))throw new Es("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Es("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=$u(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Es("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Es("An HTTP endpoint is required for this connection.","url");if(d&&!Rw(d))throw new Es("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Es("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=$u(e.allowlistText));const r=Uu(e.headerRows,e.headersRemove,"Header"),c=Uu(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Ow(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Lw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Nw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Dw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Mw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Pw=1e4,Fw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function or(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function $w(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Uw={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),o=h({}),r=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(or()),b=h(""),A=h(!1);let I=null,k=0,v=!1,_=!1;const E=Dw,g=W(()=>{var j;return((j=e.value)==null?void 0:j.servers)||[]}),T=W(()=>{var j;return!!((j=e.value)!=null&&j.enabled)}),y=W(()=>{var j,de,Se,Ie;return{serverCount:((j=e.value)==null?void 0:j.server_count)||0,enabledCount:((de=e.value)==null?void 0:de.enabled_server_count)||0,connectedCount:((Se=e.value)==null?void 0:Se.connected_count)||0,toolCount:((Ie=e.value)==null?void 0:Ie.published_tool_count)||0}}),w=W(()=>{var j;return((j=f.value)==null?void 0:j.header_keys)||[]}),L=W(()=>{var j;return((j=f.value)==null?void 0:j.env_keys)||[]}),F=W(()=>{var j;return u.value==="edit"&&((j=f.value)==null?void 0:j.transport)==="http"}),M=W(()=>u.value==="add"||!F.value),D=W(()=>F.value?"Replace endpoint URL":"Endpoint URL"),$=W(()=>F.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function P(){z(),I=window.setInterval(()=>B({quiet:!0}),Pw)}function z(){I&&window.clearInterval(I),I=null}async function B({quiet:j=!1}={}){const de=++k;j||(t.value=!0);try{const Se=await K.get("/api/mcp/status");if(de!==k||!v)return;e.value=Se,n.value="";const Ie=new Set((Se.servers||[]).map(Ne=>Ne.name));i.value=new Set([...i.value].filter(Ne=>Ie.has(Ne)))}catch(Se){de===k&&v&&(n.value=Se.message||"Failed to load MCP status")}finally{de===k&&(t.value=!1)}}function C(j){return s.value||a.value.has(j)}function ee(j,de){const Se=new Set(a.value);de?Se.add(j):Se.delete(j),a.value=Se}function _e(j){return Lw(j.state)}function Ee(j){if(_e(j)==="disabled"){if(!j.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return Fw[_e(j)]}function ie(j){return j.transport==="http"?"Streamable HTTP":"stdio"}function be(j){return j.negotiated_version?`${j.era?`${String(j.era).charAt(0).toUpperCase()}${String(j.era).slice(1)}`:"Protocol"} · ${j.negotiated_version}`:"Not negotiated"}function se(j){return j.discovered_count?`${j.published_count||0} published · ${j.excluded_count||0} excluded`:"No tools discovered"}const ge=h(new Set);async function Z(j,de){if(ge.value.has(j.name))return;const Se=!!de.target.checked,Ie=new Set(ge.value);Ie.add(j.name),ge.value=Ie;try{const Ne=await K.post(`/api/mcp/servers/${encodeURIComponent(j.name)}/enabled`,{enabled:Se});Ne&&Array.isArray(Ne.servers)?e.value=Ne:await B({quiet:!0})}catch(Ne){de.target.checked=!!j.enabled,Oe.error(Ne.message||`Failed to toggle ${j.name}`)}finally{const Ne=new Set(ge.value);Ne.delete(j.name),ge.value=Ne}}async function H(j){if(j!==T.value&&!(!j&&!await Zt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await K.post("/api/mcp/enabled",{enabled:j}),Oe.success(j?"MCP enabled":"MCP disabled"),await B({quiet:!0})}catch(de){Oe.error(de.message||"Failed to update MCP state"),await B({quiet:!0})}finally{s.value=!1}}}async function le(j){ee(j.name,!0);try{await K.post(`/api/mcp/servers/${encodeURIComponent(j.name)}/reconnect`,{}),Oe.success(`Reconnected ${j.name}`)}catch(de){Oe.error(de.message||`Failed to reconnect ${j.name}`)}finally{ee(j.name,!1),await B({quiet:!0})}}async function oe(j){ee(j.name,!0);try{await K.post(`/api/mcp/servers/${encodeURIComponent(j.name)}/refresh-tools`,{}),Oe.success(`Refreshed tools from ${j.name}`),await Be(j.name,!0)}catch(de){Oe.error(de.message||`Failed to refresh ${j.name}`)}finally{ee(j.name,!1),await B({quiet:!0})}}async function ke(j){if(await Zt({title:`Remove ${j.name}`,message:`Remove this saved MCP server? Its ${j.published_count||0} published tool${j.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){ee(j.name,!0);try{await K.del(`/api/mcp/servers/${encodeURIComponent(j.name)}`),Oe.success(`Removed ${j.name}`),delete o.value[j.name]}catch(Se){Oe.error(Se.message||`Failed to remove ${j.name}`)}finally{ee(j.name,!1),await B({quiet:!0})}}}async function ye(j){const de=new Set(i.value);if(de.has(j.name)){de.delete(j.name),i.value=de;return}de.add(j.name),i.value=de,Object.hasOwn(o.value,j.name)||await Be(j.name)}async function Be(j,de=!1){if(!de&&Object.hasOwn(o.value,j))return;const Se=new Set(c.value);Se.add(j),c.value=Se,r.value={...r.value,[j]:""};try{const Ie=await K.get(`/api/mcp/servers/${encodeURIComponent(j)}/tools`);o.value={...o.value,[j]:Ie.tools||[]}}catch(Ie){r.value={...r.value,[j]:Ie.message||"Failed to load tools"}}finally{const Ie=new Set(c.value);Ie.delete(j),c.value=Ie}}function S(j){return(o.value[j]||[]).filter(de=>Nw(de,l.value[j]))}function O(j,de){l.value={...l.value,[j]:de}}function U(){u.value="add",p.value="",f.value=null,m.value=or(),b.value="",d.value=!0}function te(j){u.value="edit",p.value=j.name,f.value=j,m.value={...or(),name:j.name,enabled:!!j.enabled,transport:j.transport||"stdio"},b.value="",d.value=!0}function J(){A.value||(d.value=!1)}function X(j){d.value&&Mw(j)}function he(j){const de=j==="headers"?"headerRows":"envRows";m.value[de].push({key:"",value:""})}function ce(j,de){const Se=j==="headers"?"headerRows":"envRows";m.value[Se].splice(de,1)}function re(j,de){const Se=j==="headers"?"headersRemove":"envRemove",Ie=m.value[Se];m.value[Se]=Ie.includes(de)?Ie.filter(Ne=>Ne!==de):[...Ie,de]}async function ne(){var de,Se;b.value="";let j;try{j=Iw(m.value,{mode:u.value,originalTransport:((de=f.value)==null?void 0:de.transport)||""})}catch(Ie){b.value=Ie instanceof Es?Ie.message:"Invalid MCP server configuration",await Et(),(Se=document.querySelector(".mcp-editor"))==null||Se.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Ow(j,f.value)&&!await Zt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){A.value=!0;try{u.value==="add"?await K.post("/api/mcp/servers",j):await K.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,j),Oe.success(u.value==="add"?`Saved ${j.name}`:`Updated ${p.value}`),d.value=!1,await B({quiet:!0})}catch(Ie){b.value=Ie.message||"Failed to save MCP server"}finally{A.value=!1}}}let ae=null;function me(j){`${(j==null?void 0:j.event)||""} ${(j==null?void 0:j.type)||""} ${(j==null?void 0:j.tool)||""} ${(j==null?void 0:j.message)||""}`.toLowerCase().includes("mcp")&&(ae&&window.clearTimeout(ae),ae=window.setTimeout(()=>B({quiet:!0}),200))}function xe(){v||(v=!0,_||(Ze.subscribe("events",me),_=!0),B(),P())}function Le(){v=!1,z(),ae&&window.clearTimeout(ae),ae=null,_&&(Ze.unsubscribe("events",me),_=!1)}return Ge(xe),xs(xe),_s(Le),_t(Le),{status:e,loading:t,mutating:s,pageError:n,servers:g,masterEnabled:T,aggregate:y,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:b,saving:A,editorGroups:E,configuredHeaderKeys:w,configuredEnvKeys:L,savedHttpEndpoint:F,endpointRequired:M,endpointFieldLabel:D,endpointPlaceholder:$,refreshAll:B,busy:C,serverState:_e,stateLabel:Ee,transportLabel:ie,protocolLabel:be,toolSummary:se,formatAge:$w,setMasterEnabled:H,togglePending:ge,toggleServerEnabled:Z,reconnect:le,refreshTools:oe,removeServer:ke,toggleTools:ye,filteredTools:S,setToolQuery:O,openAdd:U,openEdit:te,closeEditor:J,jumpToEditorGroup:X,addSecretRow:he,removeSecretRow:ce,toggleSecretRemoval:re,saveServer:ne}}};function Bw(e,t){if(!e||!t)return Mu(e);const s=Mu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),o=h(null),r=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),b=h(null);let A=null;const I=h(null),k=h(!1),v=h({}),_=h({}),E=h(null),g=h(null),T=W(()=>e.value.reduce((C,ee)=>C+(ee.chunks||0),0)),y=W(()=>new Set(e.value.map(ee=>ee.uploader).filter(Boolean)).size);function w(C,ee){const _e=_.value[ee];if(!_e||_e.length===0)return 0;const Ee=Math.max(..._e.map(ie=>ie.char_count||0));return Ee===0?0:Math.round(C.char_count/Ee*100)}async function L(){t.value=!0,s.value=null;try{const C=await K.get("/api/knowledge");e.value=Array.isArray(C)?C:[]}catch(C){s.value=C.message}t.value=!1}async function F(C){if(v.value[C]){v.value[C]=!1,g.value=null;return}if(v.value[C]=!0,!(_.value[C]||E.value===C)){E.value=C;try{const ee=await K.get(`/api/knowledge/${encodeURIComponent(C)}/chunks`);_.value[C]=Array.isArray(ee)?ee:[]}catch(ee){_.value[C]=[],Oe.error(`Failed to load chunks: ${ee.message}`)}E.value=null}}async function M(){const C=n.value.trim();if(C){i.value=!0,o.value=null,l.value=C;try{const ee=await K.get(`/api/knowledge/search?q=${encodeURIComponent(C)}`);a.value=Array.isArray(ee)?ee:[]}catch(ee){a.value=[],o.value=ee.message||"Search failed"}i.value=!1}}function D(){a.value=null,n.value="",o.value=null}async function $(){u.value=null,p.value=null;const C=c.value.trim(),ee=d.value.trim();if(!C){u.value="Source name is required";return}if(!ee){u.value="Content is required";return}f.value=!0;try{const _e=await K.post("/api/knowledge",{source:C,content:ee});p.value=`Ingested ${_e.chunks||0} chunks from "${C}"`,c.value="",d.value="",_.value={},await L(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(_e){u.value=_e.message}f.value=!1}async function P(C){m.value=C,b.value=null,A&&(clearTimeout(A),A=null);try{const ee=await K.post(`/api/knowledge/${encodeURIComponent(C)}/reingest`);b.value={source:C,error:!1,message:`Re-ingested ${ee.chunks||0} chunks`},delete _.value[C],await L(),A=setTimeout(()=>{b.value=null,A=null},3e3)}catch(ee){b.value={source:C,error:!0,message:ee.message}}m.value=null}function z(C){I.value=C}async function B(){if(I.value){k.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete _.value[I.value],await L()}catch(C){Oe.error(`Failed to delete source: ${C.message||"unknown error"}`)}k.value=!1,I.value=null}}return Ge(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:b,deleteTarget:I,deleting:k,expanded:v,sourceChunks:_,loadingChunks:E,selectedChunk:g,totalChunks:T,uploaderCount:y,truncate:Qc,formatTs:ba,highlightTerms:Bw,chunkBarWidth:w,fetchSources:L,toggleSource:F,doSearch:M,clearSearch:D,doIngest:$,doReingest:P,confirmDelete:z,doDelete:B}}},zw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),o=h(!1),r=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),b=h(null),A=h(null),I=h(new Set),k=h(null),v=h(!1),_=h(!1),E=W(()=>e.value.reduce((ie,be)=>ie+be.count,0)),g=W(()=>I.value.size);function T(ie){const be=t.value[ie];if(!be)return[];if(!l.value.trim())return be;const se=l.value.trim().toLowerCase();return be.filter(ge=>ge.key.toLowerCase().includes(se)||ge.value&&ge.value.toLowerCase().includes(se))}function y(ie,be){return I.value.has(ie+"/"+be)}function w(ie,be){const se=ie+"/"+be,ge=new Set(I.value);ge.has(se)?ge.delete(se):ge.add(se),I.value=ge}function L(ie){const be=t.value[ie];return!be||be.length===0?!1:be.every(se=>I.value.has(ie+"/"+se.key))}function F(ie,be){const se=t.value[ie];if(!se)return;const ge=new Set(I.value);for(const Z of se){const H=ie+"/"+Z.key;be?ge.add(H):ge.delete(H)}I.value=ge}async function M(){s.value=!0,n.value=null;try{const ie=await K.get("/api/memory");e.value=Object.entries(ie).map(([be,se])=>({name:be,keys:se.keys||[],count:se.count||0}))}catch(ie){n.value=ie.message}s.value=!1}async function D(ie){if(a.value[ie]){a.value[ie]=!1;return}a.value[ie]=!0;const be=e.value.find(ge=>ge.name===ie);if(!be||t.value[ie]||i.value===ie)return;i.value=ie;let se;try{const Z=(await K.get(`/api/memory/${encodeURIComponent(ie)}`)).entries||{};se=be.keys.map(H=>Object.prototype.hasOwnProperty.call(Z,H)?{key:H,value:Z[H]||"",failed:!1}:{key:H,value:"",failed:!0,error:"Not found in scope"})}catch(ge){se=be.keys.map(Z=>({key:Z,value:"",failed:!0,error:ge.message||"Failed to load"}))}t.value[ie]=se,i.value=null}function $(ie,be,se){p.value=ie+"/"+be,f.value=se}async function P(ie,be){m.value=!0,b.value=null;try{await K.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(be)}`,{value:f.value});const se=t.value[ie];if(se){const ge=se.find(Z=>Z.key===be);ge&&(ge.value=f.value)}p.value=null}catch(se){b.value=`Failed to save: ${se.message||"unknown error"}`}m.value=!1}async function z(ie,be){try{await navigator.clipboard.writeText(be.value),A.value=ie+"/"+be.key,setTimeout(()=>{A.value=null},1500)}catch{}}async function B(){d.value=null,u.value=null;const ie=r.value.scope.trim(),be=r.value.key.trim(),se=r.value.value.trim();if(!ie){d.value="Scope is required";return}if(!be){d.value="Key is required";return}if(!se){d.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(be)}`,{value:se}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await M(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ge){d.value=ge.message}c.value=!1}function C(ie,be){k.value={scope:ie,key:be}}async function ee(){if(!k.value)return;v.value=!0,b.value=null;const{scope:ie,key:be}=k.value;try{await K.del(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(be)}`);const se=t.value[ie];se&&(t.value[ie]=se.filter(H=>H.key!==be));const ge=e.value.find(H=>H.name===ie);ge&&(ge.count--,ge.keys=ge.keys.filter(H=>H!==be));const Z=new Set(I.value);Z.delete(ie+"/"+be),I.value=Z}catch(se){b.value=`Failed to delete: ${se.message||"unknown error"}`}v.value=!1,k.value=null}function _e(){_.value=!0}async function Ee(){v.value=!0,b.value=null;const ie=[];for(const be of I.value){const se=be.indexOf("/");ie.push({scope:be.slice(0,se),key:be.slice(se+1)})}try{await K.post("/api/memory/bulk-delete",{entries:ie}),I.value=new Set,t.value={},await M()}catch(be){b.value=`Bulk delete failed: ${be.message||"unknown error"}`}v.value=!1,_.value=!1}return Ge(()=>{M()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:b,copied:A,selected:I,selectedCount:g,totalEntries:E,deleteTarget:k,deleting:v,showBulkDelete:_,fetchMemory:M,toggleScope:D,startEdit:$,doEdit:P,copyValue:z,doAdd:B,confirmDelete:C,doDelete:ee,confirmBulkDelete:_e,doBulkDelete:Ee,isSelected:y,toggleSelect:w,isScopeAllSelected:L,toggleSelectAll:F,filteredEntries:T}}},jw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=W(()=>[...new Set(e.value.map(A=>A.category))].sort()),r=W(()=>{const b={};return e.value.forEach(A=>{b[A.category]=(b[A.category]||0)+1}),b}),c=W(()=>a.value?e.value.filter(b=>b.category===a.value):e.value);function d(b){return b==="correction"?"badge-warning":b==="operational"?"badge-info":b==="preference"?"badge-success":"badge-info"}function u(b){i.value=b.key,l.value=b.content}async function p(b){try{await K.put("/api/learned/"+encodeURIComponent(b),{content:l.value}),i.value=null,Oe.success("Entry updated"),await m()}catch(A){Oe.error(A.message||"Failed to save entry")}}async function f(b){if(await Zt({title:"Delete learned entry",message:`Delete "${b}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(b)),Oe.success("Entry deleted"),await m()}catch(I){Oe.error(I.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const b=await K.get("/api/learned");e.value=b.entries||[],t.value={last_reflection:b.last_reflection,count:b.count}}catch(b){n.value=b.message}s.value=!1}return Ge(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:ba,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},Am=[{id:"tools",label:"Tools",component:Sw},{id:"skills",label:"Skills",component:Ew},{id:"mcp-servers",label:"MCP Servers",component:Uw},{id:"knowledge",label:"Knowledge",component:Hw},{id:"memory",label:"Memory",component:zw},{id:"learned",label:"Learned",component:jw}],Vw={components:{TabbedPage:Uo},setup(){return{tabs:Am}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},qw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Gw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Kw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ww={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=W(()=>e.value.components||[]),l=W(()=>Kw[e.value.overall]||"text-gray-400"),o=W(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=W(()=>{const g=e.value.overall;return g==="healthy"?"All Systems Healthy":g==="degraded"?"Some Systems Degraded":g==="unhealthy"?"System Issues Detected":"Unknown"});function c(g){return qw[g]||"text-gray-400"}function d(g){return Gw[g]||"info"}function u(g){return g==="ok"?"badge-success":g==="degraded"?"badge-warning":g==="down"?"badge-danger":"badge-info"}function p(g){return g==="closed"?"text-green-400":g==="half_open"?"text-yellow-400":g==="open"?"text-red-400":"text-gray-400"}function f(g){return g.replace(/_/g," ").replace(/\b\w/g,T=>T.toUpperCase())}function m(g){if(!g)return"—";try{return new Date(g).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return g}}function b(g){return g>=1e6?(g/1e6).toFixed(1)+"M":g>=1e3?(g/1e3).toFixed(1)+"K":String(g)}async function A(){a.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null,n.value=!0}catch(g){s.value=g.message}finally{t.value=!1,a.value=!1}}function I(){t.value=!0,s.value=null,A()}let k=null,v=!1;function _(){v||(v=!0,A(),k||(k=setInterval(A,3e4)))}function E(){v&&(v=!1,k&&(clearInterval(k),k=null))}return Ge(_),xs(_),_s(E),_t(E),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:b,fetchHealth:A,retry:I}}},Zw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=W(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=W(()=>{if(!i.value)return[];const A=i.value,I=A.storage_total_bytes||1;return[{label:"Session Persistence",mb:A.sessions.persist_dir.total_mb,bytes:A.sessions.persist_dir.total_bytes,files:A.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(A.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:A.knowledge.db_file.total_mb,bytes:A.knowledge.db_file.total_bytes,files:A.knowledge.db_file.file_count,pct:Math.min(100,Math.round(A.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:A.trajectories.message_dir.total_mb,bytes:A.trajectories.message_dir.total_bytes,files:A.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:A.trajectories.agent_dir.total_mb,bytes:A.trajectories.agent_dir.total_bytes,files:A.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const A=await K.get("/api/resource-usage");i.value=A,t.value=null,s.value=!0}catch(A){t.value=A.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function b(){f&&(f=!1,l&&(clearInterval(l),l=null))}return Ge(m),xs(m),_s(b),_t(b),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:wm,refresh:u,retry:p}}},Jw=["INFO","WARNING","ERROR"],Yw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],rr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Qw=[50,100,200,500],Xw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),o=h(!1),r=h(Ze.state||"disconnected"),c=W(()=>{switch(r.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,m=Jw,b=Yw,A=rr,I=h("all"),k=h(""),v=h([]),_=h(!1),E=h(""),g=h([]);function T(){try{const G=localStorage.getItem("odin-log-presets");G&&(v.value=JSON.parse(G))}catch{}}function y(){try{localStorage.setItem("odin-log-presets",JSON.stringify(v.value))}catch{}}const w=W(()=>a.value!==""||i.value.trim()!==""||k.value!==""),L=W(()=>{const G=rr.find(pe=>pe.value===k.value);return G?G.label:""}),F=W(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(G){return G.message}}),M=24,D=W(()=>{if(_e.value.length===0)return[];const G=[],pe=new Date,De=3600*1e3;for(let Ke=M-1;Ke>=0;Ke--){const rt=new Date(pe.getTime()-(Ke+1)*De),Ot=new Date(pe.getTime()-Ke*De);G.push({start:rt,end:Ot,label:B(rt,Ot),shortLabel:Ot.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ke of _e.value){if(!Ke._time)continue;const rt=Ke._time.getTime();for(const Ot of G)if(rt>=Ot.start.getTime()&&rt<Ot.end.getTime()){Ot.total++,Ke.level==="ERROR"?Ot.errors++:Ke.level==="WARNING"?Ot.warnings++:Ot.info++;break}}return G}),$=W(()=>{let G=1;for(const pe of D.value)pe.total>G&&(G=pe.total);return G}),P=W(()=>{if(D.value.length===0)return"";const G=_e.value.map(Ke=>Ke._time&&Ke._time.getTime()).filter(Boolean);if(G.length===0)return"";const pe=new Date(Math.min(...G));return`${_e.value.length} shown, oldest ${pe.toLocaleTimeString()}`}),z=W(()=>Math.ceil(M/8));function B(G,pe){const De={hour:"2-digit",minute:"2-digit"};return G.toLocaleTimeString([],De)+" - "+pe.toLocaleTimeString([],De)}function C(G,pe){return!pe||!G?"0px":Math.max(2,G/pe*100)+"%"}function ee(G){const pe=_e.value.findIndex(De=>De._time&&De._time.getTime()>=G.start.getTime()&&De._time.getTime()<G.end.getTime());if(pe>=0&&d.value){const De=d.value.querySelectorAll(".log-line");De[pe]&&(De[pe].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const _e=W(()=>{let G=t.value;if(a.value&&(G=G.filter(pe=>(pe.level||"INFO")===a.value)),k.value){const pe=rr.find(De=>De.value===k.value);if(pe&&pe.seconds){const De=new Date(Date.now()-pe.seconds*1e3);G=G.filter(Ke=>Ke._time&&Ke._time>=De)}}if(i.value&&!F.value)if(l.value)try{const pe=new RegExp(i.value,"i");G=G.filter(De=>{const Ke=De.text||De.raw||"",rt=De.tool||"";return pe.test(Ke)||pe.test(rt)})}catch{}else{const pe=i.value.toLowerCase();G=G.filter(De=>{const Ke=(De.text||De.raw||"").toLowerCase(),rt=(De.tool||"").toLowerCase();return Ke.includes(pe)||rt.includes(pe)})}return G});function Ee(G){if(G.type==="log"&&G.line)try{const pe=typeof G.line=="string"?JSON.parse(G.line):G.line,De=pe.timestamp?new Date(pe.timestamp):new Date;return{ts:De.toLocaleTimeString(),_time:De,level:pe.error?"ERROR":"INFO",text:pe.tool_name?`[${pe.tool_name}] ${pe.result_summary||""}`.trim():pe.message||JSON.stringify(pe),tool:pe.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(G.line),tool:"",raw:String(G.line)}}if(G.payload){const pe=G.payload,De=pe.timestamp?new Date(pe.timestamp):new Date;return{ts:De.toLocaleTimeString(),_time:De,level:pe.error?"ERROR":"INFO",text:pe.tool_name?`[${pe.tool_name}] ${pe.result_summary||""}`.trim():pe.message||JSON.stringify(pe),tool:pe.tool_name||"",raw:null}}return typeof G=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:G,tool:"",raw:G}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(G),tool:"",raw:null}}function ie(G){const pe=Ee(G);if(s.value){g.value.push(pe);return}be(pe)}function be(G){t.value.push(G),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&Et(()=>se())}function se(G=!1){const pe=d.value;pe&&pe.scrollTo({top:pe.scrollHeight,behavior:G?"smooth":"instant"})}function ge(){n.value=!0,u.value=!1,Et(()=>se(!0))}const Z=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function H(){const G=d.value;if(!G)return;const pe=G.scrollHeight-G.scrollTop-G.clientHeight<40;u.value=!n.value&&!pe&&t.value.length>0,ye.value&&le()}function le(){const G=d.value;!G||!n.value||G.scrollHeight-G.scrollTop-G.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function oe(){n.value&&requestAnimationFrame(le)}function ke(G){Z.has(G.key)&&oe()}const ye=h(!1);function Be(){n.value&&(ye.value=!0,requestAnimationFrame(le))}function S(){ye.value&&(ye.value=!1,le())}function O(){n.value&&(u.value=!1,Et(()=>se()))}function U(){if(s.value=!s.value,!s.value&&g.value.length>0){for(const G of g.value)be(G);g.value=[]}}function te(){t.value=[],g.value=[],u.value=!1}function J(){let G;e.value==="search"?G=at.value.map(rt=>{const Ot=rt.error?"ERROR":"INFO",Vn=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Ot} ${Vn}${rt.result_summary||rt.message||""}`}).join(`
`):G=_e.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const pe=new Blob([G],{type:"text/plain"}),De=URL.createObjectURL(pe),Ke=document.createElement("a");Ke.href=De,Ke.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ke.click(),URL.revokeObjectURL(De)}function X(G,pe){const De=`${G.ts} ${G.level} ${G.text||G.raw||""}`;navigator.clipboard.writeText(De).then(()=>{p.value=pe,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function he(G){a.value=a.value===G?"":G,I.value="all"}function ce(G){return G.level==="ERROR"?"log-line-error":G.level==="WARNING"?"log-line-warning":"text-gray-300"}function re(G){return G==="ERROR"?"text-red-500 font-semibold":G==="WARNING"?"text-yellow-500":"text-blue-500"}function ne(G){return G==="ERROR"?"log-chip-error":G==="WARNING"?"log-chip-warning":"log-chip-info"}function ae(G){I.value=G.id;const pe=G.filters;a.value=pe.level||"",k.value=pe.timeRange||"",i.value=pe.text||"",pe.levels&&(a.value=pe.levels[0]||""),pe.hasToolName&&(i.value="")}function me(G){I.value=G.id,a.value=G.filters.level||"",k.value=G.filters.timeRange||"",i.value=G.filters.text||""}function xe(){if(!E.value.trim())return;const G={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:a.value,timeRange:k.value,text:i.value}};v.value=[...v.value,G],y(),_.value=!1,E.value=""}function Le(G){v.value=v.value.filter(pe=>pe.id!==G),y(),I.value===G&&(I.value="all")}const j=h("all"),de=h(""),Se=h(""),Ie=h(""),Ne=h(""),ut=h(""),it=h(100),Q=Qw,we=h(!1),Re=h(!1),Fe=h(""),at=h([]),Je=h(null),gt=h(null);function Ns(){e.value="search",Je.value||js()}async function js(){try{Je.value=await K.get("/api/logs/stats")}catch{}}function ks(){const G=ut.value;if(!G){Ie.value="",Ne.value="";return}const De={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[G];if(De){const Ke=new Date(Date.now()-De*1e3);Ie.value=Ds(Ke),Ne.value=""}}function Ds(G){const pe=De=>String(De).padStart(2,"0");return`${G.getFullYear()}-${pe(G.getMonth()+1)}-${pe(G.getDate())}T${pe(G.getHours())}:${pe(G.getMinutes())}`}function Ft(G){if(!G)return"";const pe=new Date(G);return isNaN(pe.getTime())?"":pe.toISOString()}async function Yt(){we.value=!0,Fe.value="",Re.value=!0,gt.value=null;try{const G=new URLSearchParams;j.value&&j.value!=="all"&&G.set("level",j.value),de.value&&G.set("tool",de.value),Se.value&&G.set("q",Se.value);const pe=Ft(Ie.value),De=Ft(Ne.value);pe&&G.set("start",pe),De&&G.set("end",De),G.set("limit",String(it.value));const Ke=await K.get(`/api/logs/search?${G.toString()}`);at.value=Ke.entries||[]}catch(G){Fe.value=G.message||"Search failed",at.value=[]}finally{we.value=!1}}function Vs(){j.value="all",de.value="",Se.value="",Ie.value="",Ne.value="",ut.value="",it.value=100,at.value=[],Re.value=!1,Fe.value="",gt.value=null}function Ss(G){gt.value=gt.value===G?null:G}function nn(G){if(!G.timestamp)return"";try{return new Date(G.timestamp).toLocaleString()}catch{return G.timestamp}}function Ms(G){return G.type==="web_action"?`${G.status||""} (${G.execution_time_ms||0}ms)`:(G.result_summary||"").slice(0,200)}function qs(G){return G.error?"log-line-error":"text-gray-300"}function jn(G){try{return JSON.stringify(G,null,2)}catch{return String(G)}}let ht=null,os=!1;function Ps(){os||(os=!0,Ze.subscribe("logs",ie),o.value=Ze.connected,r.value=Ze.state||"disconnected",ht=Ze.onState(G=>{r.value=G,o.value=G==="connected"}))}function Ye(){os&&(os=!1,Ze.unsubscribe("logs",ie),ht&&(ht(),ht=null))}return Ge(()=>{T(),window.addEventListener("pointerup",S),window.addEventListener("pointercancel",S)}),xs(Ps),_s(Ye),_t(()=>{Ye(),window.removeEventListener("pointerup",S),window.removeEventListener("pointercancel",S)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:o,wsState:r,wsStateLabel:c,logContainer:d,filteredLogs:_e,pauseBuffer:g,showJumpBottom:u,copiedIndex:p,regexError:F,levels:m,logPresets:b,timeRanges:A,timeRange:k,activeLogPreset:I,customLogPresets:v,showSaveLogPreset:_,newLogPresetName:E,hasActiveLogFilters:w,timeRangeLabel:L,timelineBuckets:D,timelineMax:$,timelineSpanLabel:P,timelineLabelSkip:z,togglePause:U,clearLogs:te,exportLogs:J,logLineClass:ce,levelClass:re,levelChipClass:ne,toggleLevel:he,copyLine:X,jumpToBottom:ge,onScroll:H,onUserScrollIntent:oe,onUserScrollKey:ke,onAutoScrollToggle:O,onPointerDown:Be,applyLogPreset:ae,applyCustomLogPreset:me,saveLogCustomPreset:xe,removeLogCustomPreset:Le,segmentHeight:C,jumpToTimelineBucket:ee,searchLevel:j,searchTool:de,searchKeyword:Se,searchStart:Ie,searchEnd:Ne,searchTimePreset:ut,searchLimit:it,searchLimits:Q,searching:we,searchRan:Re,searchError:Fe,searchResults:at,searchStats:Je,expandedSearch:gt,switchToSearch:Ns,runSearch:Yt,clearSearchFilters:Vs,toggleSearchExpand:Ss,formatSearchTs:nn,searchEntryText:Ms,searchLogLineClass:qs,formatJson:jn,applySearchTimePreset:ks}}};function Sl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const ek=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Va=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},cr=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),nk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Bu(e){return nk.some(t=>e===t||e.startsWith(`${t}.`))}const Rm="odin_config_center_expanded_v1",Im="odin_config_center_category_v1",ak=50,ik=650,dr=()=>K.get("/api/config/meta");function ea(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Oi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Ca(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function ok(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Om(e,t){if(Oi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ea(t);const n={};for(const[a,i]of Object.entries(t)){const l=Om(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function rk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Om(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Lm(e,t,s,n){if(Oi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Lm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function ck(){try{const e=JSON.parse(localStorage.getItem(Rm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dk(){try{const e=localStorage.getItem(Im);return Va.some(t=>t.key===e)?e:Va[0].key}catch{return Va[0].key}}const uk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),o=h(null),r=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(dk()),m=h(ck()),b=h({}),A=h({}),I=h(""),k=h({}),v=h({}),_=h([]),E=h([]),g=h(!1),T=h(!1),y=h(!1);let w=null,L=null,F={path:null,at:0},M=0;const D=W(()=>{var x;return(((x=t.value)==null?void 0:x.fields)||[]).filter(N=>!cr.has(N.path.split(".")[0])&&!Bu(N.path))}),$=W(()=>new Map(D.value.map(x=>[x.path,x]))),P=W(()=>_e.value.reduce((x,N)=>x+N.sections.length,0)),z=W(()=>D.value.length),B=W(()=>ek),C=W(()=>_.value.length>0),ee=W(()=>E.value.length>0),_e=W(()=>{if(!e.value)return[];const x=new Set(Va.flatMap(ue=>ue.sections)),N=Va.map(ue=>({...ue,sections:ue.sections.filter(Pe=>Object.hasOwn(e.value,Pe)&&!cr.has(Pe))})).filter(ue=>ue.sections.length),q=Object.keys(e.value).filter(ue=>!x.has(ue)&&!cr.has(ue));return q.length&&N.push({key:"other",label:"Other",icon:"folder",sections:q}),N}),Ee=W(()=>e.value?{...e.value,...b.value}:null),ie=W(()=>{if(!e.value)return[];const x=[];for(const[N,q]of Object.entries(b.value))Lm(e.value[N],q,N,x);return x.filter(N=>!Oi(N.oldVal,N.newVal)).map(N=>{const q=O(N.path);return{...N,label:(q==null?void 0:q.label)||Ca(N.path.split(".").at(-1)),apply_mode:(q==null?void 0:q.apply_mode)||he(N.path.split(".")[0])}})}),be=W(()=>ie.value.length>0),se=W(()=>ie.value.length),ge=W(()=>new Set(ie.value.map(x=>x.path.split(".")[0])).size),Z=W(()=>!!u.value||p.value!=="all"),H=W(()=>{const x={...v.value};for(const N of ie.value){const q=O(N.path),ue=xa(q,N.newVal);ue&&(x[N.path]=ue)}return x}),le=W(()=>Object.keys(H.value).length>0),oe=W(()=>e.value?(Z.value?_e.value:_e.value.filter(N=>N.key===f.value)).map(N=>({...N,sections:N.sections.filter(q=>we(q))})).filter(N=>N.sections.length):[]),ke=W(()=>{const x=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],N=new Map(x.map(q=>[q,[]]));for(const q of ie.value){const ue=N.has(q.apply_mode)?q.apply_mode:"restart";N.get(ue).push(q)}return x.filter(q=>N.get(q).length).map(q=>({key:q,label:ve(q),entries:N.get(q)}))}),ye=W(()=>ie.value.filter(x=>x.apply_mode==="restart").length),Be=W(()=>D.value.filter(x=>x.pending_restart)),S=W(()=>Be.value.length);function O(x){const N=$.value.get(x);return N?{...N,apply_details:Sl([N])}:null}function U(x){const N=`${x}.`;return D.value.filter(q=>q.path===x||q.path.startsWith(N))}function te(x){return U(x).length}function J(x){return Ca(x)}function X(x){const N=U(x);if(!N.length)return`${Ca(x)} configuration.`;const q=N.find(vt=>vt.sensitivity==="public"&&vt.description)||N.find(vt=>vt.description),ue=(q==null?void 0:q.description)||"";return ue.match(/setting for (.+)\.$/i)?`${Ca(x)} settings and runtime behaviour.`:ue}function he(x){const N=[...new Set(U(x).map(q=>q.apply_mode))];return N.length===1?N[0]:N.includes("restart")?"restart":N.includes("activation_required")?"activation_required":N[0]||"restart"}function ce(x){const N=[...new Set(U(x).map(q=>ve(q.apply_mode)))];return N.length?N.length===1?N[0]:`Mixed apply behaviour: ${N.join(" · ")}`:""}function re(x){return Sl(U(x))}function ne(x){var N;return Object.hasOwn(b.value,x)?b.value[x]:(N=e.value)==null?void 0:N[x]}function ae(){const x=ne("mcp")||{},N=Object.keys(x.servers||{}).length;return`${x.enabled?"Globally enabled":"Globally disabled"} · ${N} configured server${N===1?"":"s"}.`}function me(x,N){return N.split(".").reduce((q,ue)=>q==null?void 0:q[ue],x)}function xe(x){const N=Ee.value;return U(x).filter(q=>Bu(q.path)?!1:q.path.split(".").length<=2?!0:!q.path.includes(".*")).map(q=>({...q,key:q.path.split(".").at(-1),value:me(N,q.path),apply_details:Sl([q]),editor:q.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Le(x){const N=x.path.split(".");return N.length>2?N.slice(0,2).join("."):null}function j(x){const N=new Map;for(const q of xe(x)){const ue=Le(q),Pe=ue||`${x}.__root`;N.has(Pe)||N.set(Pe,{key:Pe,path:ue,entries:[]}),N.get(Pe).entries.push(q)}return[...N.values()].map(q=>{const ue=q.entries.find(Pe=>Pe.group_description);return{...q,label:q.path?Ca(q.path.split(".").at(-1)):null,description:(ue==null?void 0:ue.group_description)||null,apply_details:Sl(q.entries),runtime_summaries:Se(q.entries)}})}function de(x){return{save:x.save_effect||(x.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:x.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[x.apply_mode]||"Effective runtime state is not currently observable."}}function Se(x){const N=new Map;for(const q of x){const ue=de(q),Pe=`${q.apply_mode}|${ue.save}|${ue.runtime}`;N.has(Pe)||N.set(Pe,{key:Pe,label:ve(q.apply_mode),save:ue.save,runtime:ue.runtime})}return[...N.values()]}function Ie(x){if(Ne(x))return x.runtime_effect||x.activation_policy||"";if(x.apply_mode==="activation_required"){const N=x.activation_policy||x.runtime_effect;return N?`Not active after saving. No activation control exists in this release. ${N}`:"Not active after saving; no activation control exists in this release."}return""}function Ne(x){return x.action_available===!0&&!!(x.action_label&&x.action_endpoint)}async function ut(x){if(Ne(x))try{if(gt(x.path))throw new Error("Save this setting before applying its action.");const N=String(x.action_method||"POST").toLowerCase(),q={post:K.post.bind(K),put:K.put.bind(K),delete:K.del.bind(K)}[N];if(!q)throw new Error("Unsupported configuration action");await q(x.action_endpoint,x.action_body||void 0),await Y(),An("success",`${x.action_label} completed.`)}catch(N){An("error",N.message||`${x.action_label} failed`)}}function it(x,N){return[x.label,x.path,x.description,...x.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(N)}function Q(x){const N=u.value.trim().toLowerCase();return N?U(x).filter(q=>it(q,N)):[]}function we(x){const N=U(x);if(p.value!=="all"&&!N.some(ue=>ue.apply_state===p.value))return!1;const q=u.value.trim().toLowerCase();return!q||`${J(x)} ${x}`.toLowerCase().includes(q)?!0:N.some(ue=>it(ue,q))}function Re(x,N){return U(x).filter(q=>q.apply_state===N).length}function Fe(x){return x==="all"?z.value:D.value.filter(N=>N.apply_state===x).length}function at(x){const N=x.sections.flatMap(q=>U(q));return{fields:N.length,modified:ie.value.filter(q=>x.sections.includes(q.path.split(".")[0])).length,pending_restart:N.filter(q=>q.apply_state==="pending_restart").length,invalid:N.filter(q=>q.apply_state==="invalid").length,dormant:N.filter(q=>q.apply_state==="dormant").length}}function Je(x){var N;return Object.hasOwn(b.value,x)&&!Oi((N=e.value)==null?void 0:N[x],b.value[x])}function gt(x){return ie.value.some(N=>N.path===x||N.path.startsWith(`${x}.`))}function Ns(x){f.value=x,u.value="",p.value="all";try{localStorage.setItem(Im,x)}catch{}}function js(x){p.value=x}function ks(){u.value="",p.value="all"}function Ds(x){var N;return((N=_e.value.find(q=>q.sections.includes(x)))==null?void 0:N.sections)||[]}function Ft(x){const N=Ds(x),q=N.find(ue=>m.value[ue]===!0);return q||N.find(ue=>m.value[ue]!==!1)||null}function Yt(x){return u.value&&!y.value&&we(x)?!0:y.value?Ft(x)===x:Object.hasOwn(m.value,x)?m.value[x]===!0:!0}function Vs(x){const N=!Yt(x);if(y.value){const q={...m.value};for(const ue of Ds(x))q[ue]===!0&&(q[ue]=!1);q[x]=N,m.value=q;return}m.value={...m.value,[x]:N}}function Ss(){_.value.push(ea(b.value)),_.value.length>ak&&_.value.shift(),E.value=[]}function nn(){be.value&&(Ss(),b.value={},v.value={},g.value=!1)}function Ms(x,N=!1){const q=Date.now();if(N&&F.path===x&&q-F.at<ik){F.at=q;return}Ss(),F={path:x,at:q}}function qs(x,N,q){if(!N.length)return q;const ue=ea(x??{});let Pe=ue;for(let vt=0;vt<N.length-1;vt+=1){const lt=N[vt];Pe[lt]=ea(Pe[lt]??{}),Pe=Pe[lt]}return Pe[N.at(-1)]=q,ue}function jn(x){var N;return Object.hasOwn(b.value,x)?b.value[x]:ea((N=e.value)==null?void 0:N[x])}function ht(x,N,q={}){var ri;const[ue,...Pe]=x.path.split(".");Ms(x.path,!!q.coalesce);const vt=jn(ue),lt=Pe.length?qs(vt,Pe,N):N,Gs={...b.value};if(Oi(lt,(ri=e.value)==null?void 0:ri[ue])?delete Gs[ue]:Gs[ue]=lt,b.value=Gs,v.value[x.path]){const rd={...v.value};delete rd[x.path],v.value=rd}}function os(x){F={path:null,at:0},A.value={...A.value,[x]:String(me(Ee.value,x)??"")}}function Ps(x){if(F={path:null,at:0},!Object.hasOwn(A.value,x))return;const N={...A.value};delete N[x],A.value=N}function Ye(x){const N=A.value[x.path];if(F={path:null,at:0},N===""){v.value={...v.value,[x.path]:"Enter a number."};return}const q=Number(N);if(Number.isNaN(q)||x.type==="integer"&&!Number.isInteger(q)){v.value={...v.value,[x.path]:x.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ue={...A.value};delete ue[x.path],A.value=ue,ht(x,q,{coalesce:!0})}function G(x){return Object.hasOwn(A.value,x.path)?A.value[x.path]:x.value??""}function pe(x,N){if(A.value={...A.value,[x.path]:N},N===""){v.value={...v.value,[x.path]:"Enter a number."};return}const q=Number(N);if(!Number.isFinite(q)||x.type==="integer"&&!Number.isInteger(q)){v.value={...v.value,[x.path]:x.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(v.value[x.path]){const ue={...v.value};delete ue[x.path],v.value=ue}ht(x,q,{coalesce:!0})}function De(x){const N=Number.parseInt(I.value,10);if(!Number.isInteger(N)||N<1){v.value={...v.value,[x.path]:"Warning thresholds must be positive whole numbers."};return}const q=[...new Set([...x.value||[],N])].sort((ue,Pe)=>Pe-ue);I.value="",ht(x,q)}function Ke(x,N){ht(x,(x.value||[]).filter(q=>q!==N))}function rt(x){return x.apply_mode==="live_read"?"Odin reads the saved file value on next use.":x.apply_mode==="live_for_new_work"?"New work uses the saved file value.":x.apply_mode==="live_apply"?x.apply_handler?`Apply the saved value through ${x.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":x.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":x.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":x.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Ot(x){return x.type==="array"&&Array.isArray(x.value)&&!x.structured_container&&!x.structured_container_child&&x.sensitivity==="public"&&x.value.every(N=>["string","number","boolean"].includes(typeof N))}function Vn(x){const N=String(k.value[x.path]??"").trim();if(!N)return;const q=[...new Set([...x.value||[],N])];k.value={...k.value,[x.path]:""},ht(x,q)}function Qt(x,N){ht(x,(x.value||[]).filter(q=>q!==N))}function xa(x,N){var ue;if(!x)return null;if((ue=x.enum)!=null&&ue.length&&!x.enum.includes(N))return`Choose one of: ${x.enum.join(", ")}`;if(x.path==="agents.final_warning_iterations"&&(!Array.isArray(N)||!N.length))return"Add at least one warning threshold.";const q=x.constraints||{};if((x.type==="integer"||x.type==="number")&&typeof N=="number"){if(q.minimum!==void 0&&N<q.minimum)return`Must be at least ${q.minimum}${x.unit?` ${x.unit}`:""}`;if(q.maximum!==void 0&&N>q.maximum)return`Must be at most ${q.maximum}${x.unit?` ${x.unit}`:""}`}return null}function Fs(x){return H.value[x.path]||null}function li(x){const N=`${x}.`;return Object.keys(H.value).some(q=>q===x||q.startsWith(N))}function _a(){_.value.length&&(E.value.push(ea(b.value)),b.value=_.value.pop(),v.value={},A.value={},F={path:null,at:0})}function qn(){E.value.length&&(_.value.push(ea(b.value)),b.value=E.value.pop(),v.value={},A.value={},F={path:null,at:0})}function wa(){!be.value||le.value||(g.value=!0,T.value=!1)}function Gn(){g.value=!1}function V(){nn()}function ve(x){return sk[x]||Ca(x||"unknown")}function Ae(x){return`apply-${String(x||"unknown").replaceAll("_","-")}`}function wt(x){return`cfgc-field-${x.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Kn(x){return`${wt(x)}-input`}function Wn(x){const N=document.getElementById(wt(x))||document.getElementById(wt(x.split(".").slice(0,2).join(".")));N==null||N.scrollIntoView({behavior:"smooth",block:"center"})}function An(x,N){l.value={type:x,message:N},window.setTimeout(()=>{var q;((q=l.value)==null?void 0:q.message)===N&&(l.value=null)},3500)}function cl(){r.value=!1,p.value="pending_restart",u.value="";const x=tk(n.value);x&&(x.scrollTop=0)}function dl(){r.value=!1}function Zn(x=1800){L&&window.clearTimeout(L),L=window.setTimeout(oi,x)}async function oi(){if(c.value){if(M+=1,M>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await dr(),S.value===0){c.value=!1,d.value=null,An("success","Odin restarted and the saved startup settings are active.");return}}catch{}Zn(2e3)}}async function Te(){if(!c.value){d.value=null;try{await K.post("/api/restart",{}),c.value=!0,M=0,r.value=!1,Zn()}catch(x){d.value=x.message||"Odin could not schedule a restart."}}}async function R(){if(!(!be.value||le.value||a.value)){a.value=!0;try{const x=rk(e.value,b.value),N=await K.put("/api/config",x);e.value=N,b.value={},_.value=[],E.value=[],v.value={},g.value=!1;try{t.value=await dr(),o.value=null,r.value=S.value>0,An("success",S.value?`Configuration saved. ${S.value} setting${S.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(q){o.value=q.message||"Unknown metadata error.",An("error",`Configuration saved, but apply status could not be refreshed: ${o.value}`)}}catch(x){An("error",x.message||"Configuration could not be saved")}finally{a.value=!1}}}async function Y(){var x,N;if(!be.value){s.value=!0,i.value=null;try{const q=await K.get("/api/config"),ue=await dr();e.value=q,t.value=ue,o.value=null;const Pe=_e.value;if(Pe.some(vt=>vt.key===f.value)||(f.value=((x=Pe[0])==null?void 0:x.key)||Va[0].key),y.value){const lt=(((N=Pe.find(Gs=>Gs.key===f.value))==null?void 0:N.sections)||[]).find(Gs=>m.value[Gs]===!0);m.value=lt?{...m.value,[lt]:!0}:{}}}catch(q){i.value=q.message||"Unknown configuration error"}finally{s.value=!1}}}function fe(x){if(g.value||!(x.ctrlKey||x.metaKey))return;const N=x.target;N instanceof HTMLElement&&(N.matches("input, textarea, select")||N.isContentEditable)||(!x.shiftKey&&x.key.toLowerCase()==="z"?(x.preventDefault(),_a()):(x.key.toLowerCase()==="y"||x.shiftKey&&x.key.toLowerCase()==="z")&&(x.preventDefault(),qn()))}function Me(x){y.value=x.matches}return as(m,x=>{try{localStorage.setItem(Rm,JSON.stringify(x))}catch{}},{deep:!0}),Ge(()=>{var x;Y(),document.addEventListener("keydown",fe),w=window.matchMedia("(max-width: 760px)"),Me(w),(x=w.addEventListener)==null||x.call(w,"change",Me)}),_t(()=>{var x;document.removeEventListener("keydown",fe),(x=w==null?void 0:w.removeEventListener)==null||x.call(w,"change",Me),L&&window.clearTimeout(L)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:o,restartPromptOpen:r,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:g,mobileOverflowOpen:T,warningThresholdInput:I,arrayInputs:k,healthFilters:B,visibleCategories:_e,displayGroups:oe,reviewGroups:ke,sectionCount:P,fieldCount:z,hasChanges:be,changeCount:se,changedSectionCount:ge,hasDraftErrors:le,canUndo:C,canRedo:ee,globalFilterActive:Z,reviewRestartCount:ye,pendingRestartCount:S,pendingRestartFields:Be,healthCount:Fe,categoryStats:at,selectCategory:Ns,selectHealthFilter:js,clearFilters:ks,sectionLabel:J,sectionDescription:X,sectionFieldCount:te,sectionHealthCount:Re,sectionApplySummary:ce,sectionApplyDetails:re,sectionEntries:xe,fieldGroups:j,sectionSearchHits:Q,mcpConfigSummary:ae,fieldRuntimeCopy:de,fieldSpecificRuntimeNote:Ie,hasHonestAction:Ne,runFieldAction:ut,sectionChanged:Je,fieldChanged:gt,isSectionExpanded:Yt,toggleSection:Vs,discardAllDrafts:nn,setFieldValue:ht,setNumberFieldValue:pe,numberInputValue:G,beginInputEdit:os,endTextInputEdit:Ps,endInputEdit:Ye,addWarningThreshold:De,removeWarningThreshold:Ke,isScalarArray:Ot,addScalarArrayItem:Vn,removeScalarArrayItem:Qt,fieldError:Fs,sectionHasErrors:li,undo:_a,redo:qn,openReview:wa,closeReview:Gn,mobileCancel:V,applyModeLabel:ve,applyClass:Ae,compactValue:lk,formatValue:ok,structuredApplyCopy:rt,fieldId:wt,fieldInputId:Kn,focusField:Wn,fetchConfig:Y,saveConfig:R,restartOdin:Te,restartLater:dl,reviewPendingRestart:cl}}},pk=/^\d{15,25}$/;function Nm(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Dm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=W(()=>new Set((e.excludedIds||[]).map(String))),o=W(()=>{const E=s.value.toLowerCase().trim();return(e.members||[]).filter(g=>l.value.has(String(g.id))?!1:E?u(g).toLowerCase().includes(E)||String(g.username||"").toLowerCase().includes(E)||String(g.id).includes(E):!0)}),r=W(()=>{const E=s.value.trim();return o.value.length===0&&pk.test(E)&&!l.value.has(E)?E:""}),c=W(()=>o.value.length+(r.value?1:0)),d=W(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(E){return Nm(E)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const E=Math.max(c.value-1,0);a.value=Math.min(a.value+1,E)}function b(){a.value=Math.max(a.value-1,0)}function A(){const E=o.value[a.value];E?I(E):r.value&&a.value===o.value.length&&k(r.value)}function I(E){k(String(E.id))}function k(E){t("select",E),s.value="",n.value=!1,a.value=0}function v(){n.value=!1}function _(){setTimeout(v,150)}return Ge(()=>{e.autofocus&&Et(()=>{var E;return(E=i.value)==null?void 0:E.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:b,selectHighlighted:A,selectMember:I,selectId:k,closeOptions:v,onBlur:_}}};function Hu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const fk={components:{DiscordUserCombobox:Dm},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),o=h(null),r=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=W(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=W(()=>new Map(c.value.map(D=>[String(D.id),D])));function m(D){return D.config&&D.config.enabled!==void 0?D.config.enabled:!0}function b(D){return Hu(D,"require_mention",a.value)}function A(D){return Hu(D,"respond_to_bots",a.value)}function I(D){return D.config&&Object.keys(D.config).length>0}function k(D){n.value[D]=!n.value[D]}function v(D){const $=D.discord||{};return{allowed_users:[...$.allowed_users||[]],channels:[...$.channels||[]],respond_to_bots:!!$.respond_to_bots,require_mention:!!$.require_mention,ignore_bot_ids:[...$.ignore_bot_ids||[]]}}async function _({showLoading:D=!0}={}){const $=++d;D&&(t.value=!0),s.value=null;try{const P=await K.get("/api/discord/guilds");$===d&&(e.value=P)}catch(P){$===d&&(s.value=P.message)}finally{D&&$===d&&(t.value=!1)}}async function E(){t.value=!0,s.value=null;try{const[D,$,P]=await Promise.all([K.get("/api/discord/guilds"),K.get("/api/discord/members").catch(()=>[]),K.get("/api/config")]),z=v(P),B=p.value;a.value=z,B||(i.value=JSON.parse(JSON.stringify(z))),c.value=$,e.value=D,o.value=null}catch(D){s.value=D.message}finally{t.value=!1}}async function g(D,$,P){try{await K.put("/api/discord/guild/"+D+"/config",{[$]:P}),await _({showLoading:!1})}catch(z){s.value=z.message}}async function T(D,$,P,z){try{await K.put("/api/discord/channel/"+D+"/config",{[P]:z}),await _({showLoading:!1})}catch(B){s.value=B.message}}async function y(D,$){try{await K.put("/api/discord/channel/"+D+"/config",{clear:!0}),await _({showLoading:!1})}catch(P){s.value=P.message}}function w(D,$){const P=String($);if(!D.userAutocomplete)return P;const z=f.value.get(P);return z?Nm(z):P}function L(D,$=null){const P=String($??r.value[D]??"").trim();!P||i.value[D].includes(P)||(i.value[D]=[...i.value[D],P],r.value={...r.value,[D]:""})}function F(D,$){i.value[D]=i.value[D].filter(P=>P!==$)}async function M(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const $=(await K.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...$.allowed_users||[]],channels:[...$.channels||[]],respond_to_bots:!!$.respond_to_bots,require_mention:!!$.require_mention,ignore_bot_ids:[...$.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(D){o.value=D.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ge(E),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:b,guildBots:A,hasOverride:I,toggleGuild:k,fetchAll:E,fetchGuilds:_,setGuildConfig:g,setChannelConfig:T,clearOverride:y,globalItemLabel:w,addGlobalItem:L,removeGlobalItem:F,saveGlobalDefaults:M}}},ms=e=>e==null?e:JSON.parse(JSON.stringify(e));function hk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function b(g){d+=1;const T=c.then(g,g);return c=T.catch(()=>{}),T}function A(g,T){f=ms(g),m.clear();for(const[y,w]of Object.entries(T||{}))m.set(y,ms(w))}function I(g){const T=ms(g),y=++u;return b(async()=>{try{await e(ms(T)),f=ms(T),y===u&&n(ms(T))}catch(w){y===u&&(a(ms(f)),r(w,{kind:"default"}))}})}function k(g,T){const y=ms(T),w=(p.get(g)||0)+1;return p.set(g,w),b(async()=>{try{await t(g,ms(y)),m.set(g,ms(y)),w===p.get(g)&&i(g,ms(y))}catch(L){w===p.get(g)&&(l(g,ms(m.get(g)??null)),r(L,{kind:"user",uid:g}))}})}function v(g){const T=(p.get(g)||0)+1;return p.set(g,T),b(async()=>{try{await s(g),m.delete(g),T===p.get(g)&&o(g)}catch(y){T===p.get(g)&&(l(g,ms(m.get(g)??null)),r(y,{kind:"delete",uid:g}))}})}async function _(){for(;;){const g=c;if(await g,g===c)return d}}async function E(g){for(;;){const T=await _(),y=await g();if(T===d)return y}}return{seed:A,saveDefault:I,saveUser:k,deleteUser:v,whenIdle:_,readSnapshot:E,get revision(){return d}}}const mk={components:{DiscordUserCombobox:Dm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),o=h([]),r=W(()=>{const g={};for(const T of o.value)g[T.id]=T;return g});function c(g){return r.value[g]||null}function d(g,T){return g?g.allowed_hosts===null||g.allowed_hosts===void 0?{allowed_hosts:[...T],default_host:g.default_host||"",allow_all:!0}:{allowed_hosts:g.allowed_hosts,default_host:g.default_host||"",allow_all:!1}:{allowed_hosts:[...T],default_host:T[0]||"",allow_all:!0}}const u=hk({applyDefault:async g=>{const T=g.allow_all?null:g.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:T,default_host:g.default_host})},applyUser:async(g,T)=>{const y=T.allow_all?null:T.allowed_hosts;await K.put(`/api/host-access/user/${g}`,{allowed_hosts:y,default_host:T.default_host})},applyDelete:g=>K.del(`/api/host-access/user/${g}`),onDefaultConfirmed:()=>Oe.success("Default policy updated"),onDefaultRollback:g=>{g&&(a.value=g)},onUserConfirmed:g=>{const T=c(g);Oe.success(`Updated access for ${T?T.display_name:g}`)},onUserRollback:(g,T)=>{const y={...i.value};T?y[g]=T:delete y[g],i.value=y},onUserDeleted:g=>{const T={...i.value};delete T[g],i.value=T},onError:(g,T)=>{var w;const y=T.uid?` ${((w=c(T.uid))==null?void 0:w.display_name)||T.uid}`:"";Oe.error(`${g.message||"Failed to save"} — reverted${y}`)}});let p=0;async function f(){const g=++p;e.value=!0,t.value="";try{const T=await u.readSnapshot(()=>K.get("/api/host-access"));if(g!==p)return;s.value=T,n.value=T.available_hosts||[],a.value=d(T.default_policy,n.value);const y=T.users||{},w={};for(const[L,F]of Object.entries(y))w[L]=d(F,n.value);i.value=w,u.seed(a.value,w)}catch(T){g===p&&(t.value=T.message||"Failed to fetch host access data")}finally{g===p&&(e.value=!1)}try{const T=await K.get("/api/discord/members")||[];g===p&&(o.value=T)}catch{g===p&&(o.value=[])}}function m(){u.saveDefault(a.value)}function b(g,T){a.value.allow_all=!1,T?a.value.allowed_hosts.includes(g)||a.value.allowed_hosts.push(g):(a.value.allowed_hosts=a.value.allowed_hosts.filter(y=>y!==g),a.value.default_host===g&&(a.value.default_host=a.value.allowed_hosts[0]||"")),m()}function A(g){const T=i.value[g];T&&u.saveUser(g,T)}function I(g,T,y){const w=i.value[g];w&&(w.allow_all=!1,y?w.allowed_hosts.includes(T)||w.allowed_hosts.push(T):(w.allowed_hosts=w.allowed_hosts.filter(L=>L!==T),w.default_host===T&&(w.default_host=w.allowed_hosts[0]||"")),A(g))}function k(g,T){const y=i.value[g];y&&(y.default_host=T,A(g))}function v(){l.value=!0}function _(g){!/^\d{15,25}$/.test(g)||i.value[g]||(i.value[g]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(g),l.value=!1)}async function E(g){const T=c(g);await Zt({title:"Remove user override",message:`Remove the host access override for ${T?T.display_name:g}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(g),i.value[g]||Oe.success(`Removed override for ${T?T.display_name:g}`))}return Ge(f),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:o,fetchData:f,saveDefaultPolicy:m,toggleDefaultHost:b,getMember:c,toggleUserHost:I,setUserDefault:k,openAddUser:v,addUserById:_,deleteUser:E}}},gk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),o=h(null),r=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=W(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=W(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(y){return y==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":y==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const y=await K.get("/api/tokens");s.value=y.tokens||[],n.value=y.available_hosts||[]}catch(y){t.value=y.message||"Failed to load tokens"}finally{e.value=!1}}function b(y){return!y||!y.trim()?[]:y.split(",").map(w=>w.trim()).filter(Boolean)}function A(y,w){const L=c.value.allowed_hosts;if(w&&!L.includes(y)&&L.push(y),!w){const F=L.indexOf(y);F>=0&&L.splice(F,1)}}function I(y,w){const L=d.value.allowed_hosts;if(w&&!L.includes(y)&&L.push(y),!w){const F=L.indexOf(y);F>=0&&L.splice(F,1)}}async function k(){var y;i.value=!0;try{const w=b(c.value.allowed_tools_str),L=c.value.host_mode,F=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,M={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:w.length?w:[]};F!==null&&(M.allowed_hosts=F),M.default_host=c.value.default_host||"";const D=await K.post("/api/tokens",M);l.value=D.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Oe.success("Token created"),await m()}catch(w){Oe.error(((y=w.data)==null?void 0:y.error)||w.message||"Failed to create token")}finally{i.value=!1}}function v(y){o.value=y;const w=y.allowed_hosts;let L="default";w==null?L="default":Array.isArray(w)&&w.length===0?L="none":Array.isArray(w)&&(L="select"),d.value={username:y.username||"",tier:y.tier||"admin",label:y.label||"",host_mode:L,allowed_hosts:Array.isArray(w)?[...w]:[],default_host:y.default_host||"",allowed_tools_str:(y.allowed_tools||[]).join(", ")}}async function _(){var y;if(o.value){r.value=!0;try{const w=b(d.value.allowed_tools_str),L=d.value.host_mode,F={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:w};L==="none"?F.allowed_hosts=[]:L==="select"?F.allowed_hosts=d.value.allowed_hosts:F.allowed_hosts=null,F.default_host=d.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(o.value.user_id),F),o.value=null,Oe.success("Token updated"),await m()}catch(w){Oe.error(((y=w.data)==null?void 0:y.error)||w.message||"Failed to update")}finally{r.value=!1}}}async function E(y){var L;if(await Zt({title:"Regenerate token",message:`Regenerate token for ${y.username||y.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const F=await K.post("/api/tokens/"+encodeURIComponent(y.user_id)+"/regenerate");l.value=F.token,Oe.success("Token regenerated")}catch(F){Oe.error(((L=F.data)==null?void 0:L.error)||F.message||"Failed to regenerate")}}async function g(y){var L;if(await Zt({title:"Delete token",message:`Delete token for ${y.username||y.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(y.user_id)),Oe.success("Token deleted"),await m()}catch(F){Oe.error(((L=F.data)==null?void 0:L.error)||F.message||"Failed to delete")}}async function T(){if(l.value)try{await navigator.clipboard.writeText(l.value),Oe.success("Copied to clipboard")}catch{Oe.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:A,toggleEditHost:I,createToken:k,startEdit:v,saveEdit:_,confirmRegenerate:E,confirmDelete:g,copyToken:T}}},vk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),bk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),yk=Object.freeze(["enabled","base_url","model","max_tokens"]),xk=Object.freeze(["enabled","model","max_tokens"]);function Bo(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function zu(e){return Bo(e,vk)}function ju(e){return Bo(e,bk)}function _k(e,{includeApiKey:t=!1}={}){const s=Bo(e,yk);return t&&(s.api_key=e.api_key),s}function wk(e){return{timeout:e.timeout}}function kk(e,{includeApiKey:t=!1}={}){const s=Bo(e,xk);return t&&(s.api_key=e.api_key),s}function Sk(e){return{timeout:e.timeout}}function Tl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Tk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=W(()=>{const V=n.value.model;return V&&!a.includes(V)?[V,...a]:a}),l=W(()=>{const V=n.value.agent_model;return V&&V!=="auto"&&!a.includes(V)?[V,...a]:a}),o=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],r=W(()=>!o.includes(n.value.model)&&!(o.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=W(()=>{const V=n.value.agent_model;return V==="auto"?!0:!o.includes(V||n.value.model)}),d=W(()=>{const V=n.value.agent_reasoning_effort;return V==="auto"?!1:(V||n.value.reasoning_effort)==="max"}),u=V=>o.includes(V)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),p=V=>o.includes(V)&&d.value,f=h({enabled:!1,model:"gpt-5.6-luna"}),m=h({unavailable_reason:null}),b=W(()=>{const V=f.value.model;return V&&!a.includes(V)?[V,...a]:a});function A(V){const ve=V.target.value;f.value.enabled=ve!=="",ve!==""&&(f.value.model=ve),os()}const I=h(!1),k=h({codex:!1,ollama:!1,kimi:!1}),v=h(null),_=h(!1),E=h(""),g=h(null),T=h(!1);let y=0;const w=W(()=>{var V;return Object.entries(((V=v.value)==null?void 0:V.models)||{}).map(([ve,Ae])=>{var wt,Kn,Wn;return{model:ve,floor:Ae.floor,override:Ae.override,effectiveBudget:(wt=Ae.effective)==null?void 0:wt.effective_budget,configuredPrimaryChars:(Kn=Ae.configured)==null?void 0:Kn.primary_chars,primaryChars:(Wn=Ae.effective)==null?void 0:Wn.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at}})}),L=W(()=>{var V;return((V=v.value)==null?void 0:V.clamps)||[]}),F=W(()=>{var V,ve;return((ve=(V=v.value)==null?void 0:V.models)==null?void 0:ve[n.value.model])||null}),M=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),D=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),$=h(!1),P=h(!1),z=h(!1),B=h(!1),C=h(!1),ee=h(!1),_e=h(!1),Ee=h({configured:!1}),ie=h([]),be=h(""),se=h(!1),ge=h(!1),Z=h({configured:!1}),H=h([]),le=h(""),oe=h(!1),ke=h(!1),ye=h(!0),Be=h(""),S=h({configured:!1,accounts:[]}),O=h(null),U=h(null),te=h(""),J=h(null),X=h(!1),he=h(null),ce=h(null),re=h("");let ne=null;function ae(V,ve="success"){Oe(V,ve==="error"?"error":"success")}function me(V){if(!V)return"?";const ve=V/(1024*1024*1024);return ve>=1?ve.toFixed(1)+" GB":(V/(1024*1024)).toFixed(0)+" MB"}function xe(V){return Number.isFinite(Number(V))?Number(V).toLocaleString():"—"}function Le(V){return V==null?"automatic (model-derived)":Number(V).toLocaleString()+" characters"}function j(V){const ve=new Date(V);return Number.isNaN(ve.getTime())?"unknown":ve.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function de(V){return typeof V=="string"&&V.length>12?V.slice(0,8)+"…"+V.slice(-4):V}function Se(V){return V==="temporary learned clamp"?"is-clamp":V==="override"?"is-override":"is-built-in"}function Ie(V){const ve=n.value.context_budget_overrides[V.model];return V.floor!=null&&Number.isFinite(Number(ve))&&Number(ve)>V.floor}function Ne(V,ve){const Ae={...n.value.context_budget_overrides};ve.target.value===""?delete Ae[V]:Ae[V]=Number(ve.target.value),n.value.context_budget_overrides=Ae,T.value=!0}function ut(V){n.value.context_utilization=V.target.value===""?"":Number(V.target.value),T.value=!0}function it(V){const ve={...n.value.context_budget_overrides};delete ve[V],n.value.context_budget_overrides=ve,T.value=!0}async function Q(){e.value=!0,await Promise.all([we(),Fe(),ks(),at(),Re()]),e.value=!1}async function we({preserveBasic:V=!1,preserveAdvanced:ve=!1}={}){try{const Ae=await K.get("/api/llm/status");t.value=Ae,s.value=Ae.active_provider||"codex",Ae.codex&&!ht.pending()&&(V||(n.value.enabled=Ae.codex.enabled,n.value.model=Ae.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ae.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ae.codex.agent_reasoning_effort||"",n.value.agent_model=Ae.codex.agent_model||""),ve||(n.value.request_timeout_seconds=Ae.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ae.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ae.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ae.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ae.codex.context_compression||{}},!T.value&&!z.value&&(n.value.context_budget_overrides={...Ae.codex.context_budget_overrides||{}},n.value.context_utilization=Ae.codex.context_utilization??n.value.context_utilization))),Ae.ollama&&!Ps.pending()&&(V||(M.value.enabled=Ae.ollama.enabled,M.value.base_url=Ae.ollama.base_url||"",M.value.model=Ae.ollama.model||"",M.value.max_tokens=Ae.ollama.max_tokens||4096),ve||(M.value.timeout=Ae.ollama.timeout??M.value.timeout)),Ae.kimi&&!Ye.pending()&&(V||(D.value.enabled=Ae.kimi.enabled,D.value.model=Ae.kimi.model||"",D.value.max_tokens=Ae.kimi.max_tokens||4096),ve||(D.value.timeout=Ae.kimi.timeout??D.value.timeout)),Ae.auxiliary&&(m.value=Ae.auxiliary,os.pending()||(f.value.enabled=Ae.auxiliary.enabled,f.value.model=Ae.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Re(){const V=++y;_.value=!0,E.value="";try{const ve=await K.get("/api/context/windows");if(V!==y)return;v.value=ve,!z.value&&!T.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(ve.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,wt])=>[Ae,wt.override])),n.value.context_utilization=ve.utilization??n.value.context_utilization)}catch(ve){V===y&&(E.value=ve.message||"Failed to load context budgets")}finally{V===y&&(_.value=!1)}}async function Fe(){try{if(Ee.value=await K.get("/api/ollama/status"),Ee.value.model&&(be.value=Ee.value.model),Ee.value.configured)try{const V=await K.get("/api/ollama/models");ie.value=V.models||[]}catch{ie.value=[]}else if(M.value.base_url)try{const V=await K.post("/api/ollama/probe-models",{base_url:M.value.base_url});ie.value=V.models||[]}catch{ie.value=[]}}catch{Ee.value={configured:!1}}}async function at(){ye.value=!0,Be.value="";try{S.value=await K.get("/api/codex/status")}catch(V){Be.value=V.message||"Failed to fetch Codex status"}finally{ye.value=!1}}async function Je(){const V=t.value?t.value.active_provider:"codex";_e.value=!0;try{const ve=await K.post("/api/llm/switch",{provider:s.value});ve.error?(s.value=V,ae(ve.error,"error")):(ae("Switched to "+s.value+" ("+ve.model+")"),await Q())}catch(ve){s.value=V,ae(ve.message||"Switch failed","error")}finally{_e.value=!1}}async function gt(){se.value=!0;try{const V=await K.post("/api/ollama/reload");ae(V.configured?"Ollama reloaded":V.reason||"Ollama not configured",V.configured?"success":"error"),await Q()}catch(V){ae(V.message||"Reload failed","error")}finally{se.value=!1}}async function Ns(){ge.value=!0;try{await K.post("/api/ollama/model",{model:be.value}),ae("Model set to "+be.value),await Q()}catch(V){ae(V.message||"Failed","error")}finally{ge.value=!1}}async function js(){const V=M.value.base_url;if(!V){ae("Enter a base URL first","error");return}ee.value=!0;try{const ve=await K.post("/api/ollama/probe-models",{base_url:V});ie.value=ve.models||[],ie.value.length?(ae(ie.value.length+" model(s) found"),!M.value.model&&ie.value.length&&(M.value.model=ie.value[0].name)):ae("No models found at "+V,"error")}catch(ve){ae(ve.message||"Could not reach Ollama","error")}finally{ee.value=!1}}async function ks(){try{if(Z.value=await K.get("/api/kimi/status"),Z.value.model&&(le.value=Z.value.model),Z.value.configured)try{const V=await K.get("/api/kimi/models");H.value=V.models||[]}catch{H.value=[]}}catch{Z.value={configured:!1}}}async function Ds(){oe.value=!0;try{const V=await K.post("/api/kimi/reload");ae(V.configured?"Kimi reloaded":V.reason||"Kimi not configured",V.configured?"success":"error"),await Q()}catch(V){ae(V.message||"Reload failed","error")}finally{oe.value=!1}}async function Ft(){ke.value=!0;try{await K.post("/api/kimi/model",{model:le.value}),ae("Model set to "+le.value),await Q()}catch(V){ae(V.message||"Failed","error")}finally{ke.value=!1}}async function Yt(){if(z.value){ht();return}z.value=!0;const V=zu(n.value);try{await K.put("/api/llm/codex/config",V),ae("Codex config saved"),await Promise.all([we({preserveBasic:!0,preserveAdvanced:!0}),at()])}catch(ve){ae(ve.message||"Failed","error");const Ae=JSON.stringify(zu(n.value))!==JSON.stringify(V);await Promise.all([we({preserveBasic:Ae,preserveAdvanced:!0}),at()])}finally{z.value=!1}}async function Vs(){if(z.value)return;z.value=!0;const V=ju(n.value);try{await K.put("/api/llm/codex/config",V),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:V.context_budget_overrides,context_utilization:V.context_utilization})&&(T.value=!1),ae("Codex advanced settings saved"),await Promise.all([we({preserveBasic:!0,preserveAdvanced:!0}),at(),Re()])}catch(ve){ae(ve.message||"Failed","error");const Ae=JSON.stringify(ju(n.value))!==JSON.stringify(V);await Promise.all([we({preserveBasic:!0,preserveAdvanced:Ae}),at(),Re()])}finally{z.value=!1}}async function Ss(){if(B.value){Ps();return}B.value=!0;try{const V=$.value?M.value.api_key:null,ve=_k(M.value,{includeApiKey:V!==null});await K.put("/api/llm/ollama/config",ve),ae("Ollama config saved"),V!==null&&M.value.api_key===V&&(M.value.api_key="",$.value=!1),await Promise.all([we({preserveBasic:!0,preserveAdvanced:!0}),Fe()])}catch(V){ae(V.message||"Failed","error")}finally{B.value=!1}}async function nn(){if(!B.value){B.value=!0;try{await K.put("/api/llm/ollama/config",wk(M.value)),ae("Ollama timeout saved"),await Promise.all([we({preserveBasic:!0,preserveAdvanced:!0}),Fe()])}catch(V){ae(V.message||"Failed","error")}finally{B.value=!1}}}async function Ms(){if(C.value){Ye();return}C.value=!0;try{const V=P.value?D.value.api_key:null,ve=kk(D.value,{includeApiKey:V!==null});await K.put("/api/llm/kimi/config",ve),ae("Kimi config saved"),V!==null&&D.value.api_key===V&&(D.value.api_key="",P.value=!1),await Promise.all([we({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(V){ae(V.message||"Failed","error")}finally{C.value=!1}}async function qs(){if(!C.value){C.value=!0;try{await K.put("/api/llm/kimi/config",Sk(D.value)),ae("Kimi timeout saved"),await Promise.all([we({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(V){ae(V.message||"Failed","error")}finally{C.value=!1}}}async function jn(){if(I.value){os();return}I.value=!0;try{await K.put("/api/llm/auxiliary/config",f.value),ae("Auxiliary config saved"),await we()}catch(V){ae(V.message||"Failed","error"),await we()}finally{I.value=!1}}const ht=Tl(Yt),os=Tl(jn),Ps=Tl(Ss),Ye=Tl(Ms),G=()=>(ht.cancel(),Yt()),pe=()=>(Ps.cancel(),Ss()),De=()=>(Ye.cancel(),Ms()),Ke=()=>Vs(),rt=()=>nn(),Ot=()=>qs();async function Vn(V){const ve=V.account_key+":"+V.model;g.value=ve;try{const Ae=await K.post("/api/context/windows/clear",{account_key:V.account_key,model:V.model});ae(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Re()}catch(Ae){ae(Ae.message||"Failed to clear clamp","error"),await Re()}finally{g.value=null}}async function Qt(V){try{await K.post("/api/codex/account/"+V+"/activate"),ae("Active account switched"),await at()}catch(ve){ae(ve.message||"Failed","error")}}async function xa(V){O.value=V;try{await K.post("/api/codex/account/"+V+"/refresh"),ae("Token refreshed"),await at()}catch(ve){ae(ve.message||"Refresh failed","error")}finally{O.value=null}}function Fs(V,ve){U.value=V,te.value=ve||""}async function li(V){try{await K.put("/api/codex/account/"+V+"/label",{label:te.value}),ae("Label updated"),U.value=null,await at()}catch(ve){ae(ve.message||"Failed","error")}}async function _a(V,ve){if(await Zt({title:"Delete Codex account",message:`Delete ${ve||"account #"+(V+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+V),ae("Deleted. Pool reloaded."),await at()}catch(wt){ae(wt.message||"Failed","error")}}async function qn(){X.value=!0;try{const V=await K.post("/api/codex/device-code");he.value=V,J.value="pending",wa(V)}catch(V){ae(V.message||"Failed","error")}finally{X.value=!1}}async function wa(V){ne={cancelled:!1};const ve=ne;try{const Ae=await K.post("/api/codex/device-poll",{device_auth_id:V.device_auth_id,user_code:V.user_code,interval:V.interval});if(ve.cancelled)return;ce.value=Ae,J.value="success",await Q()}catch(Ae){if(ve.cancelled)return;re.value=Ae.message||"Device login failed",J.value="error"}}function Gn(){ne&&(ne.cancelled=!0),J.value=null,he.value=null}return Ge(Q),_t(()=>{ne&&(ne.cancelled=!0),ht.cancel(),os.cancel(),Ps.cancel(),Ye.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:_e,advancedOpen:k,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:r,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:p,auxForm:f,auxData:m,auxModelOptions:b,onAuxModelChange:A,savingAux:I,saveAuxConfigDebounced:os,ollamaForm:M,kimiForm:D,savingCodex:z,savingOllama:B,savingKimi:C,probingOllama:ee,ollamaKeyDirty:$,kimiKeyDirty:P,ollamaStatus:Ee,ollamaModels:ie,ollamaSelectedModel:be,reloading:se,settingModel:ge,kimiStatus:Z,kimiModels:H,kimiSelectedModel:le,reloadingKimi:oe,settingKimiModel:ke,codexLoading:ye,codexError:Be,codexData:S,refreshing:O,editingLabel:U,labelValue:te,contextWindows:v,contextWindowsLoading:_,contextWindowsError:E,contextBudgetRows:w,activeClampRows:L,activeContextBudget:F,clearingClamp:g,contextPolicyDirty:T,deviceState:J,deviceLoading:X,deviceInfo:he,deviceResult:ce,deviceError:re,fetchAll:Q,switchProvider:Je,reloadOllama:gt,setOllamaModel:Ns,reloadKimi:Ds,setKimiModel:Ft,probeOllamaModels:js,saveCodexConfig:Yt,saveOllamaConfig:Ss,saveKimiConfig:Ms,saveCodexAdvancedConfig:Vs,saveOllamaAdvancedConfig:nn,saveKimiAdvancedConfig:qs,saveCodexConfigDebounced:ht,saveOllamaConfigDebounced:Ps,saveKimiConfigDebounced:Ye,saveCodexConfigNow:G,saveOllamaConfigNow:pe,saveKimiConfigNow:De,saveCodexAdvancedConfigNow:Ke,saveOllamaAdvancedConfigNow:rt,saveKimiAdvancedConfigNow:Ot,activateAccount:Qt,refreshAccount:xa,startEditLabel:Fs,saveLabel:li,deleteAccount:_a,startDeviceLogin:qn,cancelDeviceLogin:Gn,formatSize:me,fetchContextWindows:Re,clearContextClamp:Vn,setContextOverride:Ne,setContextUtilization:ut,resetContextOverride:it,overrideAboveFloor:Ie,formatCount:xe,formatContextCeiling:Le,formatExpiry:j,shortAccountKey:de,provenanceClass:Se}}},Vu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Ck(e){return Vu[e]||Vu[(e||"").toLowerCase()]||"text-gray-400"}const Ek={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),o=h(null),r=h(null),c=h(null),d=W(()=>{var g;return Object.values(((g=i.value)==null?void 0:g.totals)||{}).reduce((T,y)=>T+Number(y||0),0)}),u=h(""),p=h(0),f=h([]),m=W(()=>f.value.map(g=>`${g.label} (${g.path}${g.reason?`: ${g.reason}`:""})`).join("; ")),b=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let A=null;async function I(){var L;const g=await Promise.allSettled(b.map(F=>K.get(F.path))),T=F=>g[F].status==="fulfilled"?g[F].value:null;t.value=T(0)||{};const y=T(1);s.value=Array.isArray(y)?y:y&&y.subsystems||[],n.value=T(2)||{},a.value=T(3)||{},i.value=T(4),l.value=T(5),o.value=T(6),r.value=T(7),c.value=T(8);const w=g.filter(F=>F.status==="rejected");if(f.value=g.flatMap((F,M)=>{var D;return F.status==="rejected"?[{...b[M],reason:((D=F.reason)==null?void 0:D.message)||"request failed"}]:[]}),p.value=f.value.length,w.length===g.length){const F=(L=w[0])==null?void 0:L.reason;u.value=(F==null?void 0:F.message)||"Failed to load internals"}else u.value="";e.value=!1}function k(){e.value=!0,u.value="",I()}let v=!1;function _(){v||(v=!0,I(),A||(A=setInterval(I,3e4)))}function E(){v&&(v=!1,A&&(clearInterval(A),A=null))}return Ge(_),xs(_),_s(E),_t(E),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:b,retry:k,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:Ck,formatAgeSeconds:aw}}},Ak={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),o=h(null),r=h(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await K.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await Zt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Mm=[{id:"health",label:"Health",component:Ww},{id:"resources",label:"Resources",component:Zw},{id:"logs",label:"Logs",component:Xw},{id:"config",label:"Config",component:uk},{id:"discord",label:"Discord",component:fk},{id:"host-access",label:"Host Access",component:mk},{id:"api-tokens",label:"API Tokens",component:gk},{id:"llm",label:"LLM Config",component:Tk},{id:"internals",label:"Internals",component:Ek},{id:"update",label:"Update",component:Ak}],Rk={components:{TabbedPage:Uo},setup(){return{tabs:Mm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Cl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Ik=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Cl("Operations","operations","/operations",Cm),...Cl("History","history","/history",Em),...Cl("Capabilities","capabilities","/capabilities",Am),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Cl("System","system","/system",Mm)],ds=Hn({open:!1,query:"",selected:0});function qu(){ds.query="",ds.selected=0,ds.open=!0}function ur(){ds.open=!1}function Ok(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Lk={setup(){const e=bm(),t=h(null),s=W(()=>{const i=ds.query.trim().toLowerCase();return Ik.map(l=>({...l,_score:Ok(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});as(()=>ds.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),as(()=>ds.query,()=>{ds.selected=0});function n(i){ur(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),ur();return}if(i.key==="ArrowDown")i.preventDefault(),ds.selected=Math.min(ds.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ds.selected=Math.max(ds.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ds.selected];l&&n(l)}}return{state:ds,results:s,inputEl:t,go:n,onKeydown:a,closePalette:ur}},template:`
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
  `},Kr={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Kr));const Nk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ka("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ka("path",{d:Kr[e.name]||Kr.info})])}},Dk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Gu(e){return[...e.querySelectorAll(Dk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Mk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Gu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Gu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Pk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),o=h([]),r=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const p=W(()=>{const $=e.value.uptime_seconds||0,P=Math.floor($/86400),z=Math.floor($%86400/3600),B=Math.floor($%3600/60),C=[];return P>0&&C.push(`${P}d`),z>0&&C.push(`${z}h`),(C.length===0||P===0&&z===0)&&C.push(`${B}m`),C.join(" ")}),f=W(()=>{const $=e.value.uptime_seconds||0;return 125.66*(1-Math.min($/86400,1))}),m=W(()=>{const $=e.value;return[{label:"Guilds",value:$.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:$.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:$.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${$.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:$.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:$.loop_count>0?"text-green-400":"",highlight:$.loop_count>0},{label:"Agents",value:$.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:$.agent_count>0?`${$.agent_count} total`:"",subColor:"text-gray-500",highlight:($.agent_running??0)>0},{label:"Processes",value:$.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:$.process_count>0?`${$.process_count} total`:"",subColor:"text-gray-500",highlight:($.process_running??0)>0},{label:"Schedules",value:$.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:($.schedule_failing>0?`${$.schedule_failing} failing`:"")+($.schedule_failing>0&&$.schedule_paused>0?", ":"")+($.schedule_paused>0?`${$.schedule_paused} paused`:"")||void 0,subColor:$.schedule_failing>0?"text-red-400":"text-yellow-400",color:$.schedule_failing>0?"text-red-400":"",highlight:$.schedule_failing>0},{label:"Users",value:$.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),b=W(()=>{const $=e.value,P=[];return P.push({label:"Bot",status:$.status==="online"?"ok":"warn",detail:$.status==="online"?"Online":"Starting"}),($.schedule_failing||0)>0?P.push({label:"Schedules",status:"error",detail:`${$.schedule_failing} failing`}):($.schedule_count||0)>0&&P.push({label:"Schedules",status:"ok",detail:`${$.schedule_count} configured`}),($.loop_count||0)>0&&P.push({label:"Loops",status:"ok",detail:`${$.loop_count} active`}),($.agent_running||0)>0&&P.push({label:"Agents",status:"ok",detail:`${$.agent_running} running`}),($.process_running||0)>0&&P.push({label:"Processes",status:"ok",detail:`${$.process_running} running`}),P});async function A(){try{e.value=await K.get("/api/status"),s.value=null}catch($){s.value=$.message}finally{t.value=!1}}async function I(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),r.value=0}catch{}a.value=!1}async function k(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function v(){try{const $=await K.get("/api/knowledge");c.value=(Array.isArray($)?$:[]).reduce((P,z)=>P+(z.chunks||0),0)}catch{c.value=null}}async function _(){try{const $=await K.get("/api/agents");o.value=$.filter(P=>P.status==="running")}catch{}}async function E(){d.value={...d.value,reload:!0};try{await K.post("/api/reload"),Oe.success("Config reloaded")}catch($){Oe.error($.message)}d.value={...d.value,reload:!1}}async function g(){if(!await Zt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const P=e.value.session_count;e.value={...e.value,session_count:0};try{const z=await K.post("/api/sessions/clear-all");Oe.success(`Cleared ${z.count} session${z.count!==1?"s":""}`),await A()}catch(z){e.value={...e.value,session_count:P},Oe.error(z.message)}d.value={...d.value,clearSessions:!1}}async function T(){if(!await Zt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const P=e.value.loop_count;e.value={...e.value,loop_count:0};try{const z=await K.post("/api/loops/stop-all");Oe.success(z.result),await A()}catch(z){e.value={...e.value,loop_count:P},Oe.error(z.message)}d.value={...d.value,stopLoops:!1}}function y(){t.value=!0,s.value=null,A(),I(),k(),_()}let w=null,L=null,F=null;function M($){if($.payload&&$.payload.tool_name){const P={...$.payload,_isNew:!0,_key:++u};n.value.unshift(P),n.value.length>10&&n.value.pop(),r.value++,P.error&&(i.value.unshift(P),i.value.length>5&&i.value.pop()),setTimeout(()=>{P._isNew=!1},1500),clearTimeout(F),F=setTimeout(()=>{r.value=0},1e4)}}let D=null;return Ge(async()=>{await Promise.all([A(),I(),k(),_(),v()]),w=setInterval(A,15e3),L=setInterval(_,1e4),Ze.subscribe("events",M),D=Ze.onReconnected(()=>{I(),k()})}),_t(()=>{w&&clearInterval(w),L&&clearInterval(L),clearTimeout(F),Ze.unsubscribe("events",M),D&&(D(),D=null)}),{status:e,loading:t,error:s,uptime:p,uptimeRingOffset:f,stats:m,healthIndicators:b,activity:n,activityLoading:a,newEventCount:r,errors:i,errorsLoading:l,agents:o,actionLoading:d,fetchActivity:I,fetchStatus:A,formatTime:ym,formatDuration:si,retry:y,reloadConfig:E,clearSessions:g,stopAllLoops:T}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Ku(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Fk(e){if(Array.isArray(e))return e}function $k(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function Uk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Bk(e,t){return Fk(e)||$k(e,t)||Hk(e,t)||Uk()}function Hk(e,t){if(e){if(typeof e=="string")return Ku(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Ku(e,t):void 0}}const Pm=Object.entries,Wu=Object.setPrototypeOf,zk=Object.isFrozen,jk=Object.getPrototypeOf,Vk=Object.getOwnPropertyDescriptor;let ls=Object.freeze,Ls=Object.seal,La=Object.create,Fm=typeof Reflect<"u"&&Reflect,Wr=Fm.apply,Zr=Fm.construct;ls||(ls=function(t){return t});Ls||(Ls=function(t){return t});Wr||(Wr=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Zr||(Zr=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const rn=It(Array.prototype.forEach),qk=It(Array.prototype.lastIndexOf),Zu=It(Array.prototype.pop),Ea=It(Array.prototype.push),Gk=It(Array.prototype.splice),es=Array.isArray,wi=It(String.prototype.toLowerCase),pr=It(String.prototype.toString),Ju=It(String.prototype.match),Aa=It(String.prototype.replace),Yu=It(String.prototype.indexOf),Kk=It(String.prototype.trim),Wk=It(Number.prototype.toString),Zk=It(Boolean.prototype.toString),Qu=typeof BigInt>"u"?null:It(BigInt.prototype.toString),Xu=typeof Symbol>"u"?null:It(Symbol.prototype.toString),bt=It(Object.prototype.hasOwnProperty),mi=It(Object.prototype.toString),$t=It(RegExp.prototype.test),Qn=Jk(TypeError);function It(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Wr(e,t,n)}}function Jk(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Zr(e,s)}}function ze(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:wi;if(Wu&&Wu(e,null),!es(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(zk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Yk(e){for(let t=0;t<e.length;t++)bt(e,t)||(e[t]=null);return e}function Vt(e){const t=La(null);for(const n of Pm(e)){var s=Bk(n,2);const a=s[0],i=s[1];bt(e,a)&&(es(i)?t[a]=Yk(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Vt(i):t[a]=i)}return t}function Qk(e){switch(typeof e){case"string":return e;case"number":return Wk(e);case"boolean":return Zk(e);case"bigint":return Qu?Qu(e):"0";case"symbol":return Xu?Xu(e):"Symbol()";case"undefined":return mi(e);case"function":case"object":{if(e===null)return mi(e);const t=e,s=Zs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:mi(n)}return mi(e)}default:return mi(e)}}function Zs(e,t){for(;e!==null;){const n=Vk(e,t);if(n){if(n.get)return It(n.get);if(typeof n.value=="function")return It(n.value)}e=jk(e)}function s(){return null}return s}function Xk(e){try{return $t(e,""),!0}catch{return!1}}const ep=ls(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),fr=ls(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),hr=ls(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),eS=ls(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),mr=ls(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tS=ls(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),tp=ls(["#text"]),sp=ls(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),gr=ls(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),np=ls(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),El=ls(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sS=Ls(/{{[\w\W]*|^[\w\W]*}}/g),nS=Ls(/<%[\w\W]*|^[\w\W]*%>/g),aS=Ls(/\${[\w\W]*/g),iS=Ls(/^data-[\-\w.\u00B7-\uFFFF]+$/),lS=Ls(/^aria-[\-\w]+$/),ap=Ls(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),oS=Ls(/^(?:\w+script|data):/i),rS=Ls(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),cS=Ls(/^html$/i),dS=Ls(/^[a-z][.\w]*(-[.\w]+)+$/i),Ks={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},uS=function(){return typeof window>"u"?null:window},pS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},ip=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function $m(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:uS();const t=Te=>$m(Te);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ks.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,f=Zs(p,"cloneNode"),m=Zs(p,"remove"),b=Zs(p,"nextSibling"),A=Zs(p,"childNodes"),I=Zs(p,"parentNode"),k=Zs(p,"shadowRoot"),v=Zs(p,"attributes"),_=l&&l.prototype?Zs(l.prototype,"nodeType"):null,E=l&&l.prototype?Zs(l.prototype,"nodeName"):null;if(typeof i=="function"){const Te=s.createElement("template");Te.content&&Te.content.ownerDocument&&(s=Te.content.ownerDocument)}let g,T="",y,w=!1,L=0;const F=function(){if(L>0)throw Qn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},M=function(R){F(),L++;try{return g.createHTML(R)}finally{L--}},D=function(R){F(),L++;try{return g.createScriptURL(R)}finally{L--}},$=function(){return w||(y=pS(u,a),w=!0),y},P=s,z=P.implementation,B=P.createNodeIterator,C=P.createDocumentFragment,ee=P.getElementsByTagName,_e=n.importNode;let Ee=ip();t.isSupported=typeof Pm=="function"&&typeof I=="function"&&z&&z.createHTMLDocument!==void 0;const ie=sS,be=nS,se=aS,ge=iS,Z=lS,H=oS,le=rS,oe=dS;let ke=ap,ye=null;const Be=ze({},[...ep,...fr,...hr,...mr,...tp]);let S=null;const O=ze({},[...sp,...gr,...np,...El]);let U=Object.seal(La(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),te=null,J=null;const X=Object.seal(La(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let he=!0,ce=!0,re=!1,ne=!0,ae=!1,me=!0,xe=!1,Le=!1,j=!1,de=!1,Se=!1,Ie=!1,Ne=!0,ut=!1;const it="user-content-";let Q=!0,we=!1,Re={},Fe=null;const at=ze({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Je=null;const gt=ze({},["audio","video","img","source","image","track"]);let Ns=null;const js=ze({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),ks="http://www.w3.org/1998/Math/MathML",Ds="http://www.w3.org/2000/svg",Ft="http://www.w3.org/1999/xhtml";let Yt=Ft,Vs=!1,Ss=null;const nn=ze({},[ks,Ds,Ft],pr);let Ms=ze({},["mi","mo","mn","ms","mtext"]),qs=ze({},["annotation-xml"]);const jn=ze({},["title","style","font","a","script"]);let ht=null;const os=["application/xhtml+xml","text/html"],Ps="text/html";let Ye=null,G=null;const pe=s.createElement("form"),De=function(R){return R instanceof RegExp||R instanceof Function},Ke=function(){let R=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(G&&G===R)return;(!R||typeof R!="object")&&(R={}),R=Vt(R),ht=os.indexOf(R.PARSER_MEDIA_TYPE)===-1?Ps:R.PARSER_MEDIA_TYPE,Ye=ht==="application/xhtml+xml"?pr:wi,ye=bt(R,"ALLOWED_TAGS")&&es(R.ALLOWED_TAGS)?ze({},R.ALLOWED_TAGS,Ye):Be,S=bt(R,"ALLOWED_ATTR")&&es(R.ALLOWED_ATTR)?ze({},R.ALLOWED_ATTR,Ye):O,Ss=bt(R,"ALLOWED_NAMESPACES")&&es(R.ALLOWED_NAMESPACES)?ze({},R.ALLOWED_NAMESPACES,pr):nn,Ns=bt(R,"ADD_URI_SAFE_ATTR")&&es(R.ADD_URI_SAFE_ATTR)?ze(Vt(js),R.ADD_URI_SAFE_ATTR,Ye):js,Je=bt(R,"ADD_DATA_URI_TAGS")&&es(R.ADD_DATA_URI_TAGS)?ze(Vt(gt),R.ADD_DATA_URI_TAGS,Ye):gt,Fe=bt(R,"FORBID_CONTENTS")&&es(R.FORBID_CONTENTS)?ze({},R.FORBID_CONTENTS,Ye):at,te=bt(R,"FORBID_TAGS")&&es(R.FORBID_TAGS)?ze({},R.FORBID_TAGS,Ye):Vt({}),J=bt(R,"FORBID_ATTR")&&es(R.FORBID_ATTR)?ze({},R.FORBID_ATTR,Ye):Vt({}),Re=bt(R,"USE_PROFILES")?R.USE_PROFILES&&typeof R.USE_PROFILES=="object"?Vt(R.USE_PROFILES):R.USE_PROFILES:!1,he=R.ALLOW_ARIA_ATTR!==!1,ce=R.ALLOW_DATA_ATTR!==!1,re=R.ALLOW_UNKNOWN_PROTOCOLS||!1,ne=R.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ae=R.SAFE_FOR_TEMPLATES||!1,me=R.SAFE_FOR_XML!==!1,xe=R.WHOLE_DOCUMENT||!1,de=R.RETURN_DOM||!1,Se=R.RETURN_DOM_FRAGMENT||!1,Ie=R.RETURN_TRUSTED_TYPE||!1,j=R.FORCE_BODY||!1,Ne=R.SANITIZE_DOM!==!1,ut=R.SANITIZE_NAMED_PROPS||!1,Q=R.KEEP_CONTENT!==!1,we=R.IN_PLACE||!1,ke=Xk(R.ALLOWED_URI_REGEXP)?R.ALLOWED_URI_REGEXP:ap,Yt=typeof R.NAMESPACE=="string"?R.NAMESPACE:Ft,Ms=bt(R,"MATHML_TEXT_INTEGRATION_POINTS")&&R.MATHML_TEXT_INTEGRATION_POINTS&&typeof R.MATHML_TEXT_INTEGRATION_POINTS=="object"?Vt(R.MATHML_TEXT_INTEGRATION_POINTS):ze({},["mi","mo","mn","ms","mtext"]),qs=bt(R,"HTML_INTEGRATION_POINTS")&&R.HTML_INTEGRATION_POINTS&&typeof R.HTML_INTEGRATION_POINTS=="object"?Vt(R.HTML_INTEGRATION_POINTS):ze({},["annotation-xml"]);const Y=bt(R,"CUSTOM_ELEMENT_HANDLING")&&R.CUSTOM_ELEMENT_HANDLING&&typeof R.CUSTOM_ELEMENT_HANDLING=="object"?Vt(R.CUSTOM_ELEMENT_HANDLING):La(null);if(U=La(null),bt(Y,"tagNameCheck")&&De(Y.tagNameCheck)&&(U.tagNameCheck=Y.tagNameCheck),bt(Y,"attributeNameCheck")&&De(Y.attributeNameCheck)&&(U.attributeNameCheck=Y.attributeNameCheck),bt(Y,"allowCustomizedBuiltInElements")&&typeof Y.allowCustomizedBuiltInElements=="boolean"&&(U.allowCustomizedBuiltInElements=Y.allowCustomizedBuiltInElements),ae&&(ce=!1),Se&&(de=!0),Re&&(ye=ze({},tp),S=La(null),Re.html===!0&&(ze(ye,ep),ze(S,sp)),Re.svg===!0&&(ze(ye,fr),ze(S,gr),ze(S,El)),Re.svgFilters===!0&&(ze(ye,hr),ze(S,gr),ze(S,El)),Re.mathMl===!0&&(ze(ye,mr),ze(S,np),ze(S,El))),X.tagCheck=null,X.attributeCheck=null,bt(R,"ADD_TAGS")&&(typeof R.ADD_TAGS=="function"?X.tagCheck=R.ADD_TAGS:es(R.ADD_TAGS)&&(ye===Be&&(ye=Vt(ye)),ze(ye,R.ADD_TAGS,Ye))),bt(R,"ADD_ATTR")&&(typeof R.ADD_ATTR=="function"?X.attributeCheck=R.ADD_ATTR:es(R.ADD_ATTR)&&(S===O&&(S=Vt(S)),ze(S,R.ADD_ATTR,Ye))),bt(R,"ADD_URI_SAFE_ATTR")&&es(R.ADD_URI_SAFE_ATTR)&&ze(Ns,R.ADD_URI_SAFE_ATTR,Ye),bt(R,"FORBID_CONTENTS")&&es(R.FORBID_CONTENTS)&&(Fe===at&&(Fe=Vt(Fe)),ze(Fe,R.FORBID_CONTENTS,Ye)),bt(R,"ADD_FORBID_CONTENTS")&&es(R.ADD_FORBID_CONTENTS)&&(Fe===at&&(Fe=Vt(Fe)),ze(Fe,R.ADD_FORBID_CONTENTS,Ye)),Q&&(ye["#text"]=!0),xe&&ze(ye,["html","head","body"]),ye.table&&(ze(ye,["tbody"]),delete te.tbody),R.TRUSTED_TYPES_POLICY){if(typeof R.TRUSTED_TYPES_POLICY.createHTML!="function")throw Qn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof R.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Qn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const fe=g;g=R.TRUSTED_TYPES_POLICY;try{T=M("")}catch(Me){throw g=fe,Me}}else R.TRUSTED_TYPES_POLICY===null?(g=void 0,T=""):(g===void 0&&(g=$()),g&&typeof T=="string"&&(T=M("")));(Ee.uponSanitizeElement.length>0||Ee.uponSanitizeAttribute.length>0)&&ye===Be&&(ye=Vt(ye)),Ee.uponSanitizeAttribute.length>0&&S===O&&(S=Vt(S)),ls&&ls(R),G=R},rt=ze({},[...fr,...hr,...eS]),Ot=ze({},[...mr,...tS]),Vn=function(R){let Y=I(R);(!Y||!Y.tagName)&&(Y={namespaceURI:Yt,tagName:"template"});const fe=wi(R.tagName),Me=wi(Y.tagName);return Ss[R.namespaceURI]?R.namespaceURI===Ds?Y.namespaceURI===Ft?fe==="svg":Y.namespaceURI===ks?fe==="svg"&&(Me==="annotation-xml"||Ms[Me]):!!rt[fe]:R.namespaceURI===ks?Y.namespaceURI===Ft?fe==="math":Y.namespaceURI===Ds?fe==="math"&&qs[Me]:!!Ot[fe]:R.namespaceURI===Ft?Y.namespaceURI===Ds&&!qs[Me]||Y.namespaceURI===ks&&!Ms[Me]?!1:!Ot[fe]&&(jn[fe]||!rt[fe]):!!(ht==="application/xhtml+xml"&&Ss[R.namespaceURI]):!1},Qt=function(R){Ea(t.removed,{element:R});try{I(R).removeChild(R)}catch{if(m(R),!I(R))throw Qn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},xa=function(R){const Y=A?A(R):R.childNodes;if(Y){const Me=[];rn(Y,x=>{Ea(Me,x)}),rn(Me,x=>{try{m(x)}catch{}})}const fe=v?v(R):null;if(fe)for(let Me=fe.length-1;Me>=0;--Me){const x=fe[Me],N=x&&x.name;if(typeof N=="string")try{R.removeAttribute(N)}catch{}}},Fs=function(R,Y){try{Ea(t.removed,{attribute:Y.getAttributeNode(R),from:Y})}catch{Ea(t.removed,{attribute:null,from:Y})}if(Y.removeAttribute(R),R==="is")if(de||Se)try{Qt(Y)}catch{}else try{Y.setAttribute(R,"")}catch{}},li=function(R){const Y=v?v(R):R.attributes;if(Y)for(let fe=Y.length-1;fe>=0;--fe){const Me=Y[fe],x=Me&&Me.name;if(!(typeof x!="string"||S[Ye(x)]))try{R.removeAttribute(x)}catch{}}},_a=function(R){const Y=[R];for(;Y.length>0;){const fe=Y.pop();(_?_(fe):fe.nodeType)===Ks.element&&li(fe);const x=A?A(fe):fe.childNodes;if(x)for(let N=x.length-1;N>=0;--N)Y.push(x[N])}},qn=function(R){let Y=null,fe=null;if(j)R="<remove></remove>"+R;else{const N=Ju(R,/^[\r\n\t ]+/);fe=N&&N[0]}ht==="application/xhtml+xml"&&Yt===Ft&&(R='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+R+"</body></html>");const Me=g?M(R):R;if(Yt===Ft)try{Y=new d().parseFromString(Me,ht)}catch{}if(!Y||!Y.documentElement){Y=z.createDocument(Yt,"template",null);try{Y.documentElement.innerHTML=Vs?T:Me}catch{}}const x=Y.body||Y.documentElement;return R&&fe&&x.insertBefore(s.createTextNode(fe),x.childNodes[0]||null),Yt===Ft?ee.call(Y,xe?"html":"body")[0]:xe?Y.documentElement:x},wa=function(R){return B.call(R.ownerDocument||R,R,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Gn=function(R){var Y,fe;R.normalize();const Me=B.call(R.ownerDocument||R,R,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let x=Me.nextNode();for(;x;){let q=x.data;rn([ie,be,se],ue=>{q=Aa(q,ue," ")}),x.data=q,x=Me.nextNode()}const N=(Y=(fe=R.querySelectorAll)===null||fe===void 0?void 0:fe.call(R,"template"))!==null&&Y!==void 0?Y:[];rn(Array.from(N),q=>{ve(q.content)&&Gn(q.content)})},V=function(R){const Y=E?E(R):null;return typeof Y!="string"||Ye(Y)!=="form"?!1:typeof R.nodeName!="string"||typeof R.textContent!="string"||typeof R.removeChild!="function"||R.attributes!==v(R)||typeof R.removeAttribute!="function"||typeof R.setAttribute!="function"||typeof R.namespaceURI!="string"||typeof R.insertBefore!="function"||typeof R.hasChildNodes!="function"||R.nodeType!==_(R)||R.childNodes!==A(R)},ve=function(R){if(!_||typeof R!="object"||R===null)return!1;try{return _(R)===Ks.documentFragment}catch{return!1}},Ae=function(R){if(!_||typeof R!="object"||R===null)return!1;try{return typeof _(R)=="number"}catch{return!1}};function wt(Te,R,Y){rn(Te,fe=>{fe.call(t,R,Y,G)})}const Kn=function(R){let Y=null;if(wt(Ee.beforeSanitizeElements,R,null),V(R))return Qt(R),!0;const fe=Ye(E?E(R):R.nodeName);if(wt(Ee.uponSanitizeElement,R,{tagName:fe,allowedTags:ye}),me&&R.hasChildNodes()&&!Ae(R.firstElementChild)&&$t(/<[/\w!]/g,R.innerHTML)&&$t(/<[/\w!]/g,R.textContent)||me&&R.namespaceURI===Ft&&fe==="style"&&Ae(R.firstElementChild)||R.nodeType===Ks.progressingInstruction||me&&R.nodeType===Ks.comment&&$t(/<[/\w]/g,R.data))return Qt(R),!0;if(te[fe]||!(X.tagCheck instanceof Function&&X.tagCheck(fe))&&!ye[fe]){if(!te[fe]&&cl(fe)&&(U.tagNameCheck instanceof RegExp&&$t(U.tagNameCheck,fe)||U.tagNameCheck instanceof Function&&U.tagNameCheck(fe)))return!1;if(Q&&!Fe[fe]){const x=I(R),N=A(R);if(N&&x){const q=N.length;for(let ue=q-1;ue>=0;--ue){const Pe=we?N[ue]:f(N[ue],!0);x.insertBefore(Pe,b(R))}}}return Qt(R),!0}return(_?_(R):R.nodeType)===Ks.element&&!Vn(R)||(fe==="noscript"||fe==="noembed"||fe==="noframes")&&$t(/<\/no(script|embed|frames)/i,R.innerHTML)?(Qt(R),!0):(ae&&R.nodeType===Ks.text&&(Y=R.textContent,rn([ie,be,se],x=>{Y=Aa(Y,x," ")}),R.textContent!==Y&&(Ea(t.removed,{element:R.cloneNode()}),R.textContent=Y)),wt(Ee.afterSanitizeElements,R,null),!1)},Wn=function(R,Y,fe){if(J[Y]||Ne&&(Y==="id"||Y==="name")&&(fe in s||fe in pe))return!1;const Me=S[Y]||X.attributeCheck instanceof Function&&X.attributeCheck(Y,R);if(!(ce&&!J[Y]&&$t(ge,Y))){if(!(he&&$t(Z,Y))){if(!Me||J[Y]){if(!(cl(R)&&(U.tagNameCheck instanceof RegExp&&$t(U.tagNameCheck,R)||U.tagNameCheck instanceof Function&&U.tagNameCheck(R))&&(U.attributeNameCheck instanceof RegExp&&$t(U.attributeNameCheck,Y)||U.attributeNameCheck instanceof Function&&U.attributeNameCheck(Y,R))||Y==="is"&&U.allowCustomizedBuiltInElements&&(U.tagNameCheck instanceof RegExp&&$t(U.tagNameCheck,fe)||U.tagNameCheck instanceof Function&&U.tagNameCheck(fe))))return!1}else if(!Ns[Y]){if(!$t(ke,Aa(fe,le,""))){if(!((Y==="src"||Y==="xlink:href"||Y==="href")&&R!=="script"&&Yu(fe,"data:")===0&&Je[R])){if(!(re&&!$t(H,Aa(fe,le,"")))){if(fe)return!1}}}}}}return!0},An=ze({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),cl=function(R){return!An[wi(R)]&&$t(oe,R)},dl=function(R){wt(Ee.beforeSanitizeAttributes,R,null);const Y=R.attributes;if(!Y||V(R))return;const fe={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:S,forceKeepAttr:void 0};let Me=Y.length;for(;Me--;){const x=Y[Me],N=x.name,q=x.namespaceURI,ue=x.value,Pe=Ye(N),vt=ue;let lt=N==="value"?vt:Kk(vt);if(fe.attrName=Pe,fe.attrValue=lt,fe.keepAttr=!0,fe.forceKeepAttr=void 0,wt(Ee.uponSanitizeAttribute,R,fe),lt=fe.attrValue,ut&&(Pe==="id"||Pe==="name")&&Yu(lt,it)!==0&&(Fs(N,R),lt=it+lt),me&&$t(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,lt)){Fs(N,R);continue}if(Pe==="attributename"&&Ju(lt,"href")){Fs(N,R);continue}if(fe.forceKeepAttr)continue;if(!fe.keepAttr){Fs(N,R);continue}if(!ne&&$t(/\/>/i,lt)){Fs(N,R);continue}ae&&rn([ie,be,se],ri=>{lt=Aa(lt,ri," ")});const Gs=Ye(R.nodeName);if(!Wn(Gs,Pe,lt)){Fs(N,R);continue}if(g&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!q)switch(u.getAttributeType(Gs,Pe)){case"TrustedHTML":{lt=M(lt);break}case"TrustedScriptURL":{lt=D(lt);break}}if(lt!==vt)try{q?R.setAttributeNS(q,N,lt):R.setAttribute(N,lt),V(R)?Qt(R):Zu(t.removed)}catch{Fs(N,R)}}wt(Ee.afterSanitizeAttributes,R,null)},Zn=function(R){let Y=null;const fe=wa(R);for(wt(Ee.beforeSanitizeShadowDOM,R,null);Y=fe.nextNode();)if(wt(Ee.uponSanitizeShadowNode,Y,null),Kn(Y),dl(Y),ve(Y.content)&&Zn(Y.content),(_?_(Y):Y.nodeType)===Ks.element){const x=k?k(Y):Y.shadowRoot;ve(x)&&(oi(x),Zn(x))}wt(Ee.afterSanitizeShadowDOM,R,null)},oi=function(R){const Y=[{node:R,shadow:null}];for(;Y.length>0;){const fe=Y.pop();if(fe.shadow){Zn(fe.shadow);continue}const Me=fe.node,N=(_?_(Me):Me.nodeType)===Ks.element,q=A?A(Me):Me.childNodes;if(q)for(let ue=q.length-1;ue>=0;--ue)Y.push({node:q[ue],shadow:null});if(N){const ue=E?E(Me):null;if(typeof ue=="string"&&Ye(ue)==="template"){const Pe=Me.content;ve(Pe)&&Y.push({node:Pe,shadow:null})}}if(N){const ue=k?k(Me):Me.shadowRoot;ve(ue)&&Y.push({node:null,shadow:ue},{node:ue,shadow:null})}}};return t.sanitize=function(Te){let R=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},Y=null,fe=null,Me=null,x=null;if(Vs=!Te,Vs&&(Te="<!-->"),typeof Te!="string"&&!Ae(Te)&&(Te=Qk(Te),typeof Te!="string"))throw Qn("dirty is not a string, aborting");if(!t.isSupported)return Te;Le||Ke(R),t.removed=[];const N=we&&typeof Te!="string"&&Ae(Te);if(N){const Pe=E?E(Te):Te.nodeName;if(typeof Pe=="string"){const vt=Ye(Pe);if(!ye[vt]||te[vt])throw Qn("root node is forbidden and cannot be sanitized in-place")}if(V(Te))throw Qn("root node is clobbered and cannot be sanitized in-place");try{oi(Te)}catch(vt){throw xa(Te),vt}}else if(Ae(Te))Y=qn("<!---->"),fe=Y.ownerDocument.importNode(Te,!0),fe.nodeType===Ks.element&&fe.nodeName==="BODY"||fe.nodeName==="HTML"?Y=fe:Y.appendChild(fe),oi(fe);else{if(!de&&!ae&&!xe&&Te.indexOf("<")===-1)return g&&Ie?M(Te):Te;if(Y=qn(Te),!Y)return de?null:Ie?T:""}Y&&j&&Qt(Y.firstChild);const q=wa(N?Te:Y);try{for(;Me=q.nextNode();)Kn(Me),dl(Me),ve(Me.content)&&Zn(Me.content)}catch(Pe){throw N&&xa(Te),Pe}if(N)return rn(t.removed,Pe=>{Pe.element&&_a(Pe.element)}),ae&&Gn(Te),Te;if(de){if(ae&&Gn(Y),Se)for(x=C.call(Y.ownerDocument);Y.firstChild;)x.appendChild(Y.firstChild);else x=Y;return(S.shadowroot||S.shadowrootmode)&&(x=_e.call(n,x,!0)),x}let ue=xe?Y.outerHTML:Y.innerHTML;return xe&&ye["!doctype"]&&Y.ownerDocument&&Y.ownerDocument.doctype&&Y.ownerDocument.doctype.name&&$t(cS,Y.ownerDocument.doctype.name)&&(ue="<!DOCTYPE "+Y.ownerDocument.doctype.name+`>
`+ue),ae&&rn([ie,be,se],Pe=>{ue=Aa(ue,Pe," ")}),g&&Ie?M(ue):ue},t.setConfig=function(){let Te=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ke(Te),Le=!0},t.clearConfig=function(){G=null,Le=!1,g=y,T=""},t.isValidAttribute=function(Te,R,Y){G||Ke({});const fe=Ye(Te),Me=Ye(R);return Wn(fe,Me,Y)},t.addHook=function(Te,R){typeof R=="function"&&Ea(Ee[Te],R)},t.removeHook=function(Te,R){if(R!==void 0){const Y=qk(Ee[Te],R);return Y===-1?void 0:Gk(Ee[Te],Y,1)[0]}return Zu(Ee[Te])},t.removeHooks=function(Te){Ee[Te]=[]},t.removeAllHooks=function(){Ee=ip()},t}var lp=$m();function Xc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ya=Xc();function Um(e){ya=e}var Li={exec:()=>null};function nt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ns.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ns={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},fS=/^(?:[ \t]*(?:\n|$))+/,hS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,rl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,gS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,ed=/(?:[*+-]|\d{1,9}[.)])/,Bm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Hm=nt(Bm).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),vS=nt(Bm).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),td=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bS=/^[^\n]+/,sd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yS=nt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",sd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xS=nt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,ed).getRegex(),Ho="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",nd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_S=nt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",nd).replace("tag",Ho).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),zm=nt(td).replace("hr",rl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ho).getRegex(),wS=nt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",zm).getRegex(),ad={blockquote:wS,code:hS,def:yS,fences:mS,heading:gS,hr:rl,html:_S,lheading:Hm,list:xS,newline:fS,paragraph:zm,table:Li,text:bS},op=nt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",rl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ho).getRegex(),kS={...ad,lheading:vS,table:op,paragraph:nt(td).replace("hr",rl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",op).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ho).getRegex()},SS={...ad,html:nt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",nd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Li,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:nt(td).replace("hr",rl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Hm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},TS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,CS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,jm=/^( {2,}|\\)\n(?!\s*$)/,ES=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,zo=/[\p{P}\p{S}]/u,id=/[\s\p{P}\p{S}]/u,Vm=/[^\s\p{P}\p{S}]/u,AS=nt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,id).getRegex(),qm=/(?!~)[\p{P}\p{S}]/u,RS=/(?!~)[\s\p{P}\p{S}]/u,IS=/(?:[^\s\p{P}\p{S}]|~)/u,OS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Gm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,LS=nt(Gm,"u").replace(/punct/g,zo).getRegex(),NS=nt(Gm,"u").replace(/punct/g,qm).getRegex(),Km="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",DS=nt(Km,"gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,zo).getRegex(),MS=nt(Km,"gu").replace(/notPunctSpace/g,IS).replace(/punctSpace/g,RS).replace(/punct/g,qm).getRegex(),PS=nt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,zo).getRegex(),FS=nt(/\\(punct)/,"gu").replace(/punct/g,zo).getRegex(),$S=nt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),US=nt(nd).replace("(?:-->|$)","-->").getRegex(),BS=nt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",US).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),co=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,HS=nt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",co).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Wm=nt(/^!?\[(label)\]\[(ref)\]/).replace("label",co).replace("ref",sd).getRegex(),Zm=nt(/^!?\[(ref)\](?:\[\])?/).replace("ref",sd).getRegex(),zS=nt("reflink|nolink(?!\\()","g").replace("reflink",Wm).replace("nolink",Zm).getRegex(),ld={_backpedal:Li,anyPunctuation:FS,autolink:$S,blockSkip:OS,br:jm,code:CS,del:Li,emStrongLDelim:LS,emStrongRDelimAst:DS,emStrongRDelimUnd:PS,escape:TS,link:HS,nolink:Zm,punctuation:AS,reflink:Wm,reflinkSearch:zS,tag:BS,text:ES,url:Li},jS={...ld,link:nt(/^!?\[(label)\]\((.*?)\)/).replace("label",co).getRegex(),reflink:nt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",co).getRegex()},Jr={...ld,emStrongRDelimAst:MS,emStrongLDelim:NS,url:nt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},VS={...Jr,br:nt(jm).replace("{2,}","*").getRegex(),text:nt(Jr.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Al={normal:ad,gfm:kS,pedantic:SS},gi={normal:ld,gfm:Jr,breaks:VS,pedantic:jS},qS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},rp=e=>qS[e];function Js(e,t){if(t){if(ns.escapeTest.test(e))return e.replace(ns.escapeReplace,rp)}else if(ns.escapeTestNoEncode.test(e))return e.replace(ns.escapeReplaceNoEncode,rp);return e}function cp(e){try{e=encodeURI(e).replace(ns.percentDecode,"%")}catch{return null}return e}function dp(e,t){var i;const s=e.replace(ns.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ns.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ns.slashPipe,"|");return n}function vi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function GS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function up(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function KS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var uo=class{constructor(e){ct(this,"options");ct(this,"rules");ct(this,"lexer");this.options=e||ya}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:vi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=KS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=vi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:vi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=vi(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,m=f.raw+`
`+s.join(`
`),b=this.blockquote(m);i[i.length-1]=b,n=n.substring(0,n.length-f.raw.length)+b.raw,a=a.substring(0,a.length-f.text.length)+b.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,m=f.raw+`
`+s.join(`
`),b=this.list(m);i[i.length-1]=b,n=n.substring(0,n.length-p.raw.length)+b.raw,a=a.substring(0,a.length-f.raw.length)+b.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],f=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):f?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const I=this.rules.other.nextBulletRegex(m),k=this.rules.other.hrRegex(m),v=this.rules.other.fencesBeginRegex(m),_=this.rules.other.headingBeginRegex(m),E=this.rules.other.htmlBeginRegex(m);for(;e;){const g=e.split(`
`,1)[0];let T;if(p=g,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),T=p):T=p.replace(this.rules.other.tabCharGlobal,"    "),v.test(p)||_.test(p)||E.test(p)||I.test(p)||k.test(p))break;if(T.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+T.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(u)||_.test(u)||k.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=g+`
`,e=e.substring(g.length+1),u=T.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let b=null,A;this.options.gfm&&(b=this.rules.other.listIsTask.exec(d),b&&(A=b[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!b,checked:A,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=dp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push(dp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=vi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=GS(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),up(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return up(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},gn=class Yr{constructor(t){ct(this,"tokens");ct(this,"options");ct(this,"state");ct(this,"tokenizer");ct(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ya,this.options.tokenizer=this.options.tokenizer||new uo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ns,block:Al.normal,inline:gi.normal};this.options.pedantic?(s.block=Al.pedantic,s.inline=gi.pedantic):this.options.gfm&&(s.block=Al.gfm,this.options.breaks?s.inline=gi.breaks:s.inline=gi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Al,inline:gi}}static lex(t,s){return new Yr(s).lex(t)}static lexInline(t,s){return new Yr(s).inlineTokens(t)}lex(t){t=t.replace(ns.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ns.tabCharGlobal,"    ").replace(ns.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(b=>{m=b.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},po=class{constructor(e){ct(this,"options");ct(this,"parser");this.options=e||ya}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ns.notSpaceStart))==null?void 0:i[0],a=e.replace(ns.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Js(n)+'">'+(s?a:Js(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Js(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const o=e.items[l];n+=this.listitem(o)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Js(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=cp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Js(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=cp(e);if(a===null)return Js(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Js(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Js(e.text)}},od=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},vn=class Qr{constructor(t){ct(this,"options");ct(this,"renderer");ct(this,"textRenderer");this.options=t||ya,this.options.renderer=this.options.renderer||new po,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new od}static parse(t,s){return new Qr(s).parse(t)}static parseInline(t,s){return new Qr(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},vr,Ml=(vr=class{constructor(e){ct(this,"options");ct(this,"block");this.options=e||ya}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?gn.lex:gn.lexInline}provideParser(){return this.block?vn.parse:vn.parseInline}},ct(vr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),vr),WS=class{constructor(...e){ct(this,"defaults",Xc());ct(this,"options",this.setOptions);ct(this,"parse",this.parseMarkdown(!0));ct(this,"parseInline",this.parseMarkdown(!1));ct(this,"Parser",vn);ct(this,"Renderer",po);ct(this,"TextRenderer",od);ct(this,"Lexer",gn);ct(this,"Tokenizer",uo);ct(this,"Hooks",Ml);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new po(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new uo(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Ml;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];Ml.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return gn.lex(e,t??this.defaults)}parser(e,t){return vn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?gn.lex:gn.lexInline,r=i.hooks?i.hooks.provideParser():e?vn.parse:vn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Js(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},fa=new WS;function tt(e,t){return fa.parse(e,t)}tt.options=tt.setOptions=function(e){return fa.setOptions(e),tt.defaults=fa.defaults,Um(tt.defaults),tt};tt.getDefaults=Xc;tt.defaults=ya;tt.use=function(...e){return fa.use(...e),tt.defaults=fa.defaults,Um(tt.defaults),tt};tt.walkTokens=function(e,t){return fa.walkTokens(e,t)};tt.parseInline=fa.parseInline;tt.Parser=vn;tt.parser=vn.parse;tt.Renderer=po;tt.TextRenderer=od;tt.Lexer=gn;tt.lexer=gn.lex;tt.Tokenizer=uo;tt.Hooks=Ml;tt.parse=tt;tt.options;tt.setOptions;tt.use;tt.walkTokens;tt.parseInline;vn.parse;gn.lex;const ZS={breaks:!0,gfm:!0};function pp(e){if(!e)return"";try{if(typeof tt<"u"&&tt.parse){const t=tt.parse(e,ZS);return typeof lp<"u"?lp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function JS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const YS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function QS(e){return YS[e]||"wrench"}const XS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function fp(e){if(!e)return[];const t=e.match(XS);return t?[...new Set(t)]:[]}const e1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let o=null,r=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=W(()=>t.value.trim().length>0&&!s.value),u=h(Ze.state||"disconnected");let p=null;const f=W(()=>{const P=u.value;return P==="connected"?"Connected":P==="reconnecting"?"Reconnecting…":P==="connecting"?"Connecting…":"REST fallback"}),m=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],b=W(()=>{const P=Math.floor(i.value/4)%m.length,z=i.value;return z>3?`${m[P]} (${z}s)`:m[0]});function A(){Et(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function I(){if(!a.value)return;const P=a.value;P.style.height="auto",P.style.height=Math.min(P.scrollHeight,120)+"px"}function k(P,z,B={}){const C={id:++r,role:P,content:z,timestamp:Date.now(),html:P==="bot"?pp(z):"",tools_used:B.tools_used||[],is_error:B.is_error||!1,images:P==="bot"?fp(z):[],files:B.files||[],_showTools:!1};return e.value.push(C),A(),P==="bot"&&Et(()=>v()),C}function v(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(z=>{z.setAttribute("data-copy","true"),z.style.position="relative";const B=document.createElement("button");B.className="chat-code-copy",B.textContent="Copy",B.addEventListener("click",()=>{const C=z.querySelector("code"),ee=C?C.textContent:z.textContent;navigator.clipboard.writeText(ee).then(()=>{B.textContent="Copied!",setTimeout(()=>{B.textContent="Copy"},1500)}).catch(()=>{})}),z.appendChild(B)})}function _(P){if(P===0)return!0;const z=e.value[P-1],B=e.value[P],C=new Date(z.timestamp).toDateString(),ee=new Date(B.timestamp).toDateString();return C!==ee}function E(P){const z=new Date(P),B=new Date;if(z.toDateString()===B.toDateString())return"Today";const C=new Date(B);return C.setDate(C.getDate()-1),z.toDateString()===C.toDateString()?"Yesterday":z.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function g(P){t.value=P,Et(()=>D())}function T(P){window.open(P,"_blank","noopener")}function y(P){P.target.style.display="none"}function w(){i.value=0,o=setInterval(()=>{i.value++},1e3)}function L(){o&&(clearInterval(o),o=null),i.value=0}function F(P){s.value&&(s.value=!1,L(),P.type==="chat_response"?k("bot",P.content,{tools_used:P.tools_used||[],is_error:P.is_error||!1,files:P.files||[]}):P.type==="chat_error"&&k("bot",P.error||"Unknown error",{is_error:!0}),Et(()=>{var z;return(z=a.value)==null?void 0:z.focus()}))}async function M(P){try{const z=await K.post("/api/chat",{content:P,channel_id:l.value});k("bot",z.response,{tools_used:z.tools_used||[],is_error:z.is_error||!1,files:z.files||[]})}catch(z){k("bot",z.message||"Failed to send message",{is_error:!0})}}async function D(){const P=t.value.trim();if(!P||s.value)return;k("user",P),t.value="",s.value=!0,w(),a.value&&(a.value.style.height="auto"),Ze.connected&&Ze.sendChat(P,{channelId:l.value})||(await M(P),s.value=!1,L()),Et(()=>{var B;return(B=a.value)==null?void 0:B.focus()})}async function $(){try{if(!l.value){const z=await K.get("/api/auth/session");l.value=z.channel_id||z.user_id||"web-user"}const P=await K.get("/api/sessions/"+encodeURIComponent(l.value));if(P&&P.messages&&P.messages.length>0){for(const z of P.messages){const B=z.role==="user"?"user":"bot";let C=z.content||"";if(B==="user"){const _e=C.match(/^\[.*?\]:\s*/);_e&&(C=C.slice(_e[0].length))}if(!C.trim())continue;const ee={id:++r,role:B,content:C,timestamp:z.timestamp?z.timestamp*1e3:Date.now(),html:B==="bot"?pp(C):"",tools_used:[],is_error:!1,images:B==="bot"?fp(C):[],files:[],_showTools:!1};e.value.push(ee)}Et(()=>{A(),v()})}}catch{}}return Ge(()=>{Ze.subscribe("chat",F),u.value=Ze.state||"disconnected",p=Ze.onState(P=>{u.value=P}),$(),Et(()=>{var P;return(P=a.value)==null?void 0:P.focus()})}),_t(()=>{Ze.unsubscribe("chat",F),p&&(p(),p=null),L()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:f,typingText:b,suggestions:c,send:D,autoResize:I,formatTime:JS,formatDate:E,showDateSeparator:_,useSuggestion:g,openImage:T,onImageError:y,getToolIcon:QS}}},t1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),o=h(!1),r=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=W(()=>e.value==="custom"),b=W(()=>[...i.value,...l.value]),A=W(()=>l.value.includes(e.value)),I=W(()=>{var y;return m.value?t.value||"Odin":((y=a.value[e.value])==null?void 0:y.name)||e.value}),k=W(()=>{var y;return m.value?s.value||"(empty — will use Odin default)":((y=a.value[e.value])==null?void 0:y.identity)||""}),v=W(()=>{var y;return m.value?n.value||"(empty — will use Odin default)":((y=a.value[e.value])==null?void 0:y.voice)||""});async function _(){d.value=!0;try{const y=await K.get("/api/personality");e.value=y.preset||"odin",t.value=y.custom_name||"",s.value=y.custom_identity||"",n.value=y.custom_voice||"",a.value=y.presets||{},i.value=y.builtin_presets||[],l.value=y.user_presets||[]}catch(y){c.value=y.message}finally{d.value=!1}}async function E(){o.value=!0,c.value=null,r.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(y){c.value=y.message}finally{o.value=!1}}async function g(){const y=u.value.trim();if(y){f.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:y,display_name:I.value,identity:k.value,voice:v.value}),p.value=!1,u.value="",await _(),e.value=y.toLowerCase().replace(/ /g,"_")}catch(w){c.value=w.message}finally{f.value=!1}}}async function T(){if(await Zt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(w){c.value=w.message}}}return Ge(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:b,isCustom:m,isUserPreset:A,previewName:I,previewIdentity:k,previewVoice:v,saving:o,saved:r,error:c,loading:d,save:E,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:g,deletePreset:T,builtinPresets:i,userPresets:l}},template:`
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
  `},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Jm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Pk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:e1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:gw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:kw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Vw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:t1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Rk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/internals",redirect:kt("/system","internals")}],Ni=tw({history:N_(),routes:Jm});Ni.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const s1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},n1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let o=null,r=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),b=h(""),A=Jm.filter(C=>C.meta),I=W(()=>["Workspace","Operate","Observe","Manage"].map(C=>({name:C,routes:A.filter(ee=>ee.meta.section===C)})).filter(C=>C.routes.length)),k=W(()=>{var C;return((C=Ni.currentRoute.value.meta)==null?void 0:C.label)||"Odin"}),v=W(()=>{var C;return((C=Ni.currentRoute.value.meta)==null?void 0:C.section)||"Management"}),_=W(()=>{var C;return((C=Ni.currentRoute.value.meta)==null?void 0:C.description)||"Management console"});K.onSessionExpired=()=>{t.value=!0,Ze.disconnect(),K.setToken(""),e.value="login"};function E(C){var ee;if((C.ctrlKey||C.metaKey)&&C.key.toLowerCase()==="k"){e.value==="ready"&&(C.preventDefault(),qu());return}if(n.value&&C.key==="Tab"){const _e=[...((ee=a.value)==null?void 0:ee.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(_e.length){const Ee=_e[0],ie=_e[_e.length-1];if(C.shiftKey&&(document.activeElement===Ee||!a.value.contains(document.activeElement))){C.preventDefault(),ie.focus();return}if(!C.shiftKey&&(document.activeElement===ie||!a.value.contains(document.activeElement))){C.preventDefault(),Ee.focus();return}}}if(C.key==="Escape"&&n.value){n.value=!1,C.preventDefault();return}if(C.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(C.target.tagName)){C.preventDefault();const _e=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');_e&&_e.focus()}}function g(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}Ge(async()=>{document.addEventListener("keydown",E),o=window.matchMedia("(max-width: 900px)"),g(),o.addEventListener("change",g);const C=await K.check();C.ok?(e.value="ready",z()):C.needsAuth?e.value="login":(e.value="ready",z())});function T(){t.value=!1,e.value="ready",z()}async function y(){await K.logout(),Ze.disconnect(),D&&(clearInterval(D),D=null),e.value="login"}function w(){s.value=!s.value}function L(){n.value=!n.value}as(n,async C=>{var ee,_e;if(C)r=document.activeElement,await Et(),(_e=(ee=a.value)==null?void 0:ee.querySelector(".nav-item"))==null||_e.focus();else if(r!=null&&r.isConnected){const Ee=r;r=null,requestAnimationFrame(()=>Ee.focus())}});const F=W(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(C,ee="info",_e=3e3){p.value={text:C,level:ee},clearTimeout(f),f=setTimeout(()=>{p.value=null},_e)}let D=null,$=!1,P=[];function z(){for(const C of P)C();P=[Ze.onStatus(C=>{c.value=C}),Ze.onLatencyChange(C=>{u.value=C}),Ze.onState((C,ee)=>{d.value=C,C==="connected"?($&&M("Connection restored","success"),$=!0):C==="reconnecting"&&ee.attempt===1&&M("Connection lost — reconnecting…","warn")})],Ze.connect(),B(),D&&clearInterval(D),D=setInterval(B,15e3)}async function B(){try{const C=await K.get("/api/status");m.value=C.status==="online"?"online":"starting";const ee=C.uptime_seconds||0,_e=Math.floor(ee/3600),Ee=Math.floor(ee%3600/60);b.value=`${_e}h ${Ee}m uptime`}catch{m.value="offline",b.value=""}}return _t(()=>{D&&clearInterval(D);for(const C of P)C();P=[],Ze.disconnect(),document.removeEventListener("keydown",E),o==null||o.removeEventListener("change",g)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:F,wsToast:p,botStatus:m,botUptime:b,navRoutes:A,navGroups:I,currentPage:k,currentSection:v,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:y,toggleSidebar:w,toggleMobileNavigation:L,openPalette:qu}}},zn=Xl(n1);zn.component("odin-icon",Nk);zn.component("login-screen",s1);zn.component("toast-container",K0);zn.component("confirm-host",W0);zn.component("command-palette",Lk);zn.directive("modal-focus",Mk);zn.use(Ni);zn.mount("#app");
