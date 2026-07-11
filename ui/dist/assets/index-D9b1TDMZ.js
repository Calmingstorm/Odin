var xg=Object.defineProperty;var _g=(e,t,s)=>t in e?xg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var We=(e,t,s)=>_g(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class kg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null){this._lastActivity=Date.now();const a={method:t,headers:this._headers()};n!==null&&(a.body=JSON.stringify(n));const i=await fetch(s,a);if(i.status===401)throw new dr("Unauthorized");const l=await i.json().catch(()=>null);if(!i.ok){const r=(l==null?void 0:l.error)||`HTTP ${i.status}`;throw new wg(r,i.status,l)}return l}get(t){return this._request("GET",t)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new dr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof dr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class dr extends Error{constructor(t){super(t),this.name="AuthError"}}class wg extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Sg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error")for(const l of this._handlers.chat||[])l(a)},this._ws.onclose=()=>{this._ws=null,this._stopPing(),this._latency=-1,this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const K=new kg,ze=new Sg(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function as(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Me={},na=[],It=()=>{},ta=()=>!1,Pn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Ll=e=>e.startsWith("onUpdate:"),Oe=Object.assign,wo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Tg=Object.prototype.hasOwnProperty,He=(e,t)=>Tg.call(e,t),fe=Array.isArray,aa=e=>Sa(e)==="[object Map]",Fn=e=>Sa(e)==="[object Set]",qc=e=>Sa(e)==="[object Date]",Cg=e=>Sa(e)==="[object RegExp]",ke=e=>typeof e=="function",Te=e=>typeof e=="string",$t=e=>typeof e=="symbol",Be=e=>e!==null&&typeof e=="object",So=e=>(Be(e)||ke(e))&&ke(e.then)&&ke(e.catch),Hd=Object.prototype.toString,Sa=e=>Hd.call(e),Eg=e=>Sa(e).slice(8,-1),Ol=e=>Sa(e)==="[object Object]",Dl=e=>Te(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,zs=as(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Ag=as("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ml=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Rg=/-\w/g,Ke=Ml(e=>e.replace(Rg,t=>t.slice(1).toUpperCase())),Ig=/\B([A-Z])/g,Yt=Ml(e=>e.replace(Ig,"-$1").toLowerCase()),$n=Ml(e=>e.charAt(0).toUpperCase()+e.slice(1)),ia=Ml(e=>e?`on${$n(e)}`:""),kt=(e,t)=>!Object.is(e,t),la=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Vd=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Pl=e=>{const t=parseFloat(e);return isNaN(t)?e:t},sl=e=>{const t=Te(e)?Number(e):NaN;return isNaN(t)?e:t};let Kc;const Fl=()=>Kc||(Kc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Ng(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Lg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Og=as(Lg);function yi(e){if(fe(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Te(n)?jd(n):yi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Te(e)||Be(e))return e}const Dg=/;(?![^(]*\))/g,Mg=/:([^]+)/,Pg=/\/\*[^]*?\*\//g;function jd(e){const t={};return e.replace(Pg,"").split(Dg).forEach(s=>{if(s){const n=s.split(Mg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function xi(e){let t="";if(Te(e))t=e;else if(fe(e))for(let s=0;s<e.length;s++){const n=xi(e[s]);n&&(t+=n+" ")}else if(Be(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Fg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Te(t)&&(e.class=xi(t)),s&&(e.style=yi(s)),e}const $g="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Ug="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Bg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Hg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Vg=as($g),jg=as(Ug),zg=as(Bg),qg=as(Hg),Kg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Gg=as(Kg);function zd(e){return!!e||e===""}function Wg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Ws(e[n],t[n]);return s}function Ws(e,t){if(e===t)return!0;let s=qc(e),n=qc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=$t(e),n=$t(t),s||n)return e===t;if(s=fe(e),n=fe(t),s||n)return s&&n?Wg(e,t):!1;if(s=Be(e),n=Be(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!Ws(e[l],t[l]))return!1}}return String(e)===String(t)}function $l(e,t){return e.findIndex(s=>Ws(s,t))}const qd=e=>!!(e&&e.__v_isRef===!0),Kd=e=>Te(e)?e:e==null?"":fe(e)||Be(e)&&(e.toString===Hd||!ke(e.toString))?qd(e)?Kd(e.value):JSON.stringify(e,Gd,2):String(e),Gd=(e,t)=>qd(t)?Gd(e,t.value):aa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[fr(n,i)+" =>"]=a,s),{})}:Fn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>fr(s))}:$t(t)?fr(t):Be(t)&&!fe(t)&&!Ol(t)?String(t):t,fr=(e,t="")=>{var s;return $t(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Zg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let yt;class To{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&yt&&(yt.active?(this.parent=yt,this.index=(yt.scopes||(yt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=yt;try{return yt=this,t()}finally{yt=s}}}on(){++this._on===1&&(this.prevScope=yt,yt=this)}off(){if(this._on>0&&--this._on===0){if(yt===this)yt=this.prevScope;else{let t=yt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Jg(e){return new To(e)}function Wd(){return yt}function Yg(e,t=!1){yt&&yt.cleanups.push(e)}let Xe;const pr=new WeakSet;class ti{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,yt&&(yt.active?yt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,pr.has(this)&&(pr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Jd(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Gc(this),Yd(this);const t=Xe,s=ms;Xe=this,ms=!0;try{return this.fn()}finally{Qd(this),Xe=t,ms=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Ao(t);this.deps=this.depsTail=void 0,Gc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?pr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Hr(this)&&this.run()}get dirty(){return Hr(this)}}let Zd=0,qa,Ka;function Jd(e,t=!1){if(e.flags|=8,t){e.next=Ka,Ka=e;return}e.next=qa,qa=e}function Co(){Zd++}function Eo(){if(--Zd>0)return;if(Ka){let t=Ka;for(Ka=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;qa;){let t=qa;for(qa=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Yd(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Qd(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Ao(n),Qg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Hr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Xd(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Xd(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===si)||(e.globalVersion=si,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Hr(e))))return;e.flags|=2;const t=e.dep,s=Xe,n=ms;Xe=e,ms=!0;try{Yd(e);const a=e.fn(e._value);(t.version===0||kt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{Xe=s,ms=n,Qd(e),e.flags&=-3}}function Ao(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Ao(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Qg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Xg(e,t){e.effect instanceof ti&&(e=e.effect.fn);const s=new ti(e);t&&Oe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function em(e){e.effect.stop()}let ms=!0;const ef=[];function Zs(){ef.push(ms),ms=!1}function Js(){const e=ef.pop();ms=e===void 0?!0:e}function Gc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Xe;Xe=void 0;try{t()}finally{Xe=s}}}let si=0;class tm{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Ul{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Xe||!ms||Xe===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Xe)s=this.activeLink=new tm(Xe,this),Xe.deps?(s.prevDep=Xe.depsTail,Xe.depsTail.nextDep=s,Xe.depsTail=s):Xe.deps=Xe.depsTail=s,tf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=Xe.depsTail,s.nextDep=void 0,Xe.depsTail.nextDep=s,Xe.depsTail=s,Xe.deps===s&&(Xe.deps=n)}return s}trigger(t){this.version++,si++,this.notify(t)}notify(t){Co();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Eo()}}}function tf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)tf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const nl=new WeakMap,Cn=Symbol(""),Vr=Symbol(""),ni=Symbol("");function Mt(e,t,s){if(ms&&Xe){let n=nl.get(e);n||nl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Ul),a.map=n,a.key=s),a.track()}}function Us(e,t,s,n,a,i){const l=nl.get(e);if(!l){si++;return}const r=o=>{o&&o.trigger()};if(Co(),t==="clear")l.forEach(r);else{const o=fe(e),c=o&&Dl(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===ni||!$t(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(ni)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Cn)),aa(e)&&r(l.get(Vr)));break;case"delete":o||(r(l.get(Cn)),aa(e)&&r(l.get(Vr)));break;case"set":aa(e)&&r(l.get(Cn));break}}Eo()}function sm(e,t){const s=nl.get(e);return s&&s.get(t)}function Kn(e){const t=Fe(e);return t===e?t:(Mt(t,"iterate",ni),Xt(e)?t:t.map(bs))}function Bl(e){return Mt(e=Fe(e),"iterate",ni),e}function Cs(e,t){return As(e)?fa(qs(e)?bs(t):t):bs(t)}const nm={__proto__:null,[Symbol.iterator](){return hr(this,Symbol.iterator,e=>Cs(this,e))},concat(...e){return Kn(this).concat(...e.map(t=>fe(t)?Kn(t):t))},entries(){return hr(this,"entries",e=>(e[1]=Cs(this,e[1]),e))},every(e,t){return Ns(this,"every",e,t,void 0,arguments)},filter(e,t){return Ns(this,"filter",e,t,s=>s.map(n=>Cs(this,n)),arguments)},find(e,t){return Ns(this,"find",e,t,s=>Cs(this,s),arguments)},findIndex(e,t){return Ns(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ns(this,"findLast",e,t,s=>Cs(this,s),arguments)},findLastIndex(e,t){return Ns(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ns(this,"forEach",e,t,void 0,arguments)},includes(...e){return gr(this,"includes",e)},indexOf(...e){return gr(this,"indexOf",e)},join(e){return Kn(this).join(e)},lastIndexOf(...e){return gr(this,"lastIndexOf",e)},map(e,t){return Ns(this,"map",e,t,void 0,arguments)},pop(){return Na(this,"pop")},push(...e){return Na(this,"push",e)},reduce(e,...t){return Wc(this,"reduce",e,t)},reduceRight(e,...t){return Wc(this,"reduceRight",e,t)},shift(){return Na(this,"shift")},some(e,t){return Ns(this,"some",e,t,void 0,arguments)},splice(...e){return Na(this,"splice",e)},toReversed(){return Kn(this).toReversed()},toSorted(e){return Kn(this).toSorted(e)},toSpliced(...e){return Kn(this).toSpliced(...e)},unshift(...e){return Na(this,"unshift",e)},values(){return hr(this,"values",e=>Cs(this,e))}};function hr(e,t,s){const n=Bl(e),a=n[t]();return n!==e&&!Xt(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const am=Array.prototype;function Ns(e,t,s,n,a,i){const l=Bl(e),r=l!==e&&!Xt(e),o=l[t];if(o!==am[t]){const d=o.apply(e,i);return r?bs(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,Cs(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function Wc(e,t,s,n){const a=Bl(e),i=a!==e&&!Xt(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=Cs(e,c)),s.call(this,c,Cs(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?Cs(e,o):o}function gr(e,t,s){const n=Fe(e);Mt(n,"iterate",ni);const a=n[t](...s);return(a===-1||a===!1)&&_i(s[0])?(s[0]=Fe(s[0]),n[t](...s)):a}function Na(e,t,s=[]){Zs(),Co();const n=Fe(e)[t].apply(e,s);return Eo(),Js(),n}const im=as("__proto__,__v_isRef,__isVue"),sf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter($t));function lm(e){$t(e)||(e=String(e));const t=Fe(this);return Mt(t,"has",e),t.hasOwnProperty(e)}class nf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?uf:cf:i?of:rf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=fe(t);if(!a){let o;if(l&&(o=nm[s]))return o;if(s==="hasOwnProperty")return lm}const r=Reflect.get(t,s,gt(t)?t:n);if(($t(s)?sf.has(s):im(s))||(a||Mt(t,"get",s),i))return r;if(gt(r)){const o=l&&Dl(s)?r:r.value;return a&&Be(o)?al(o):o}return Be(r)?a?al(r):gn(r):r}}class af extends nf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=fe(t)&&Dl(s);if(!this._isShallow){const c=As(i);if(!Xt(n)&&!As(n)&&(i=Fe(i),n=Fe(n)),!l&&gt(i)&&!gt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:He(t,s),o=Reflect.set(t,s,n,gt(t)?t:a);return t===Fe(a)&&(r?kt(n,i)&&Us(t,"set",s,n):Us(t,"add",s,n)),o}deleteProperty(t,s){const n=He(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Us(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!$t(s)||!sf.has(s))&&Mt(t,"has",s),n}ownKeys(t){return Mt(t,"iterate",fe(t)?"length":Cn),Reflect.ownKeys(t)}}class lf extends nf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const rm=new af,om=new lf,cm=new af(!0),um=new lf(!0),jr=e=>e,Di=e=>Reflect.getPrototypeOf(e);function dm(e,t,s){return function(...n){const a=this.__v_raw,i=Fe(a),l=aa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?jr:t?fa:bs;return!t&&Mt(i,"iterate",o?Vr:Cn),Oe(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function Mi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function fm(e,t){const s={get(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);e||(kt(a,r)&&Mt(l,"get",a),Mt(l,"get",r));const{has:o}=Di(l),c=t?jr:e?fa:bs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Mt(Fe(a),"iterate",Cn),a.size},has(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);return e||(kt(a,r)&&Mt(l,"has",a),Mt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Fe(r),c=t?jr:e?fa:bs;return!e&&Mt(o,"iterate",Cn),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return Oe(s,e?{add:Mi("add"),set:Mi("set"),delete:Mi("delete"),clear:Mi("clear")}:{add(a){const i=Fe(this),l=Di(i),r=Fe(a),o=!t&&!Xt(a)&&!As(a)?r:a;return l.has.call(i,o)||kt(a,o)&&l.has.call(i,a)||kt(r,o)&&l.has.call(i,r)||(i.add(o),Us(i,"add",o,o)),this},set(a,i){!t&&!Xt(i)&&!As(i)&&(i=Fe(i));const l=Fe(this),{has:r,get:o}=Di(l);let c=r.call(l,a);c||(a=Fe(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?kt(i,u)&&Us(l,"set",a,i):Us(l,"add",a,i),this},delete(a){const i=Fe(this),{has:l,get:r}=Di(i);let o=l.call(i,a);o||(a=Fe(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Us(i,"delete",a,void 0),c},clear(){const a=Fe(this),i=a.size!==0,l=a.clear();return i&&Us(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=dm(a,e,t)}),s}function Hl(e,t){const s=fm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(He(s,a)&&a in n?s:n,a,i)}const pm={get:Hl(!1,!1)},hm={get:Hl(!1,!0)},gm={get:Hl(!0,!1)},mm={get:Hl(!0,!0)},rf=new WeakMap,of=new WeakMap,cf=new WeakMap,uf=new WeakMap;function vm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function gn(e){return As(e)?e:Vl(e,!1,rm,pm,rf)}function Ro(e){return Vl(e,!1,cm,hm,of)}function al(e){return Vl(e,!0,om,gm,cf)}function bm(e){return Vl(e,!0,um,mm,uf)}function Vl(e,t,s,n,a){if(!Be(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=vm(Eg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function qs(e){return As(e)?qs(e.__v_raw):!!(e&&e.__v_isReactive)}function As(e){return!!(e&&e.__v_isReadonly)}function Xt(e){return!!(e&&e.__v_isShallow)}function _i(e){return e?!!e.__v_raw:!1}function Fe(e){const t=e&&e.__v_raw;return t?Fe(t):e}function df(e){return!He(e,"__v_skip")&&Object.isExtensible(e)&&Vd(e,"__v_skip",!0),e}const bs=e=>Be(e)?gn(e):e,fa=e=>Be(e)?al(e):e;function gt(e){return e?e.__v_isRef===!0:!1}function h(e){return ff(e,!1)}function Io(e){return ff(e,!0)}function ff(e,t){return gt(e)?e:new ym(e,t)}class ym{constructor(t,s){this.dep=new Ul,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Fe(t),this._value=s?t:bs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||Xt(t)||As(t);t=n?t:Fe(t),kt(t,s)&&(this._rawValue=t,this._value=n?t:bs(t),this.dep.trigger())}}function xm(e){e.dep&&e.dep.trigger()}function Es(e){return gt(e)?e.value:e}function _m(e){return ke(e)?e():Es(e)}const km={get:(e,t,s)=>t==="__v_raw"?e:Es(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return gt(a)&&!gt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function No(e){return qs(e)?e:new Proxy(e,km)}class wm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Ul,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function pf(e){return new wm(e)}function Sm(e){const t=fe(e)?new Array(e.length):{};for(const s in e)t[s]=hf(e,s);return t}class Tm{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=$t(s)?s:String(s),this._raw=Fe(t);let a=!0,i=t;if(!fe(t)||$t(this._key)||!Dl(this._key))do a=!_i(i)||Xt(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Es(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&gt(this._raw[this._key])){const s=this._object[this._key];if(gt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return sm(this._raw,this._key)}}class Cm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Em(e,t,s){return gt(e)?e:ke(e)?new Cm(e):Be(e)&&arguments.length>1?hf(e,t,s):h(e)}function hf(e,t,s){return new Tm(e,t,s)}class Am{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Ul(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=si-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&Xe!==this)return Jd(this,!0),!0}get value(){const t=this.dep.track();return Xd(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Rm(e,t,s=!1){let n,a;return ke(e)?n=e:(n=e.get,a=e.set),new Am(n,a,s)}const Im={GET:"get",HAS:"has",ITERATE:"iterate"},Nm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Pi={},il=new WeakMap;let on;function Lm(){return on}function gf(e,t=!1,s=on){if(s){let n=il.get(s);n||il.set(s,n=[]),n.push(e)}}function Om(e,t,s=Me){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:Xt(x)||a===!1||a===0?Bs(x,1):Bs(x);let u,d,f,p,m=!1,g=!1;if(gt(e)?(d=()=>e.value,m=Xt(e)):qs(e)?(d=()=>c(e),m=!0):fe(e)?(g=!0,m=e.some(x=>qs(x)||Xt(x)),d=()=>e.map(x=>{if(gt(x))return x.value;if(qs(x))return c(x);if(ke(x))return o?o(x,2):x()})):ke(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){Zs();try{f()}finally{Js()}}const x=on;on=u;try{return o?o(e,3,[p]):e(p)}finally{on=x}}:d=It,t&&a){const x=d,R=a===!0?1/0:a;d=()=>Bs(x(),R)}const k=Wd(),A=()=>{u.stop(),k&&k.active&&wo(k.effects,u)};if(i&&t){const x=t;t=(...R)=>{const L=x(...R);return A(),L}}let b=g?new Array(e.length).fill(Pi):Pi;const v=x=>{if(!(!(u.flags&1)||!u.dirty&&!x))if(t){const R=u.run();if(x||a||m||(g?R.some((L,O)=>kt(L,b[O])):kt(R,b))){f&&f();const L=on;on=u;try{const O=[R,b===Pi?void 0:g&&b[0]===Pi?[]:b,p];b=R,o?o(t,3,O):t(...O)}finally{on=L}}}else u.run()};return r&&r(v),u=new ti(d),u.scheduler=l?()=>l(v,!1):v,p=x=>gf(x,!1,u),f=u.onStop=()=>{const x=il.get(u);if(x){if(o)o(x,4);else for(const R of x)R();il.delete(u)}},t?n?v(!0):b=u.run():l?l(v.bind(null,!0),!0):u.run(),A.pause=u.pause.bind(u),A.resume=u.resume.bind(u),A.stop=A,A}function Bs(e,t=1/0,s){if(t<=0||!Be(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,gt(e))Bs(e.value,t,s);else if(fe(e))for(let n=0;n<e.length;n++)Bs(e[n],t,s);else if(Fn(e)||aa(e))e.forEach(n=>{Bs(n,t,s)});else if(Ol(e)){for(const n in e)Bs(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Bs(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const mf=[];function Dm(e){mf.push(e)}function Mm(){mf.pop()}function Pm(e,t){}const Fm={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},$m={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ta(e,t,s,n){try{return n?e(...n):e()}catch(a){Un(a,t,s)}}function ss(e,t,s,n){if(ke(e)){const a=Ta(e,t,s,n);return a&&So(a)&&a.catch(i=>{Un(i,t,s)}),a}if(fe(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ss(e[i],t,s,n));return a}}function Un(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Me;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){Zs(),Ta(i,null,10,[e,o,c]),Js();return}}Um(e,s,a,n,l)}function Um(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Vt=[];let Ss=-1;const ra=[];let cn=null,Yn=0;const vf=Promise.resolve();let ll=null;function Et(e){const t=ll||vf;return e?t.then(this?e.bind(this):e):t}function Bm(e){let t=Ss+1,s=Vt.length;for(;t<s;){const n=t+s>>>1,a=Vt[n],i=ii(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Lo(e){if(!(e.flags&1)){const t=ii(e),s=Vt[Vt.length-1];!s||!(e.flags&2)&&t>=ii(s)?Vt.push(e):Vt.splice(Bm(t),0,e),e.flags|=1,bf()}}function bf(){ll||(ll=vf.then(yf))}function ai(e){fe(e)?ra.push(...e):cn&&e.id===-1?cn.splice(Yn+1,0,e):e.flags&1||(ra.push(e),e.flags|=1),bf()}function Zc(e,t,s=Ss+1){for(;s<Vt.length;s++){const n=Vt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Vt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function rl(e){if(ra.length){const t=[...new Set(ra)].sort((s,n)=>ii(s)-ii(n));if(ra.length=0,cn){cn.push(...t);return}for(cn=t,Yn=0;Yn<cn.length;Yn++){const s=cn[Yn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}cn=null,Yn=0}}const ii=e=>e.id==null?e.flags&2?-1:1/0:e.id;function yf(e){try{for(Ss=0;Ss<Vt.length;Ss++){const t=Vt[Ss];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ta(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ss<Vt.length;Ss++){const t=Vt[Ss];t&&(t.flags&=-2)}Ss=-1,Vt.length=0,rl(),ll=null,(Vt.length||ra.length)&&yf()}}let Qn,Fi=[];function xf(e,t){var s,n;Qn=e,Qn?(Qn.enabled=!0,Fi.forEach(({event:a,args:i})=>Qn.emit(a,...i)),Fi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{xf(i,t)}),setTimeout(()=>{Qn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Fi=[])},3e3)):Fi=[]}let Rt=null,jl=null;function li(e){const t=Rt;return Rt=e,jl=e&&e.type.__scopeId||null,t}function Hm(e){jl=e}function Vm(){jl=null}const jm=e=>Oo;function Oo(e,t=Rt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&ui(-1);const i=li(t);let l;try{l=e(...a)}finally{li(i),n._d&&ui(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function zm(e,t){if(Rt===null)return e;const s=Ti(Rt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Me]=t[a];i&&(ke(i)&&(i={mounted:i,updated:i}),i.deep&&Bs(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Ts(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Zs(),ss(o,s,8,[e.el,r,e,t]),Js())}}function Ga(e,t){if(At){let s=At.provides;const n=At.parent&&At.parent.provides;n===s&&(s=At.provides=Object.create(n)),s[e]=t}}function us(e,t,s=!1){const n=zt();if(n||En){let a=En?En._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&ke(t)?t.call(n&&n.proxy):t}}function qm(){return!!(zt()||En)}const _f=Symbol.for("v-scx"),kf=()=>us(_f);function Km(e,t){return ki(e,null,t)}function Gm(e,t){return ki(e,null,{flush:"post"})}function wf(e,t){return ki(e,null,{flush:"sync"})}function ds(e,t,s){return ki(e,t,s)}function ki(e,t,s=Me){const{immediate:n,deep:a,flush:i,once:l}=s,r=Oe({},s),o=t&&n||!t&&i!=="post";let c;if(On){if(i==="sync"){const p=kf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=It,p.resume=It,p.pause=It,p}}const u=At;r.call=(p,m,g)=>ss(p,u,m,g);let d=!1;i==="post"?r.scheduler=p=>{pt(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,m)=>{m?p():Lo(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Om(e,t,r);return On&&(c?c.push(f):o&&f()),f}function Wm(e,t,s){const n=this.proxy,a=Te(e)?e.includes(".")?Sf(n,e):()=>n[e]:e.bind(n,n);let i;ke(t)?i=t:(i=t.handler,s=t);const l=Ca(this),r=ki(a,i.bind(n),s);return l(),r}function Sf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const ln=new WeakMap,Tf=Symbol("_vte"),Cf=e=>e.__isTeleport,kn=e=>e&&(e.disabled||e.disabled===""),Zm=e=>e&&(e.defer||e.defer===""),Jc=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Yc=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,zr=(e,t)=>{const s=e&&e.to;return Te(s)?t?t(s):null:s},Jm={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:m,createText:g,createComment:k,parentNode:A}}=c,b=kn(t.props);let{dynamicChildren:v}=t;const x=(O,S,I)=>{O.shapeFlag&16&&u(O.children,S,I,a,i,l,r,o)},R=(O=t)=>{const S=kn(O.props),I=O.target=zr(O.props,m),w=qr(I,O,g,p);I&&(l!=="svg"&&Jc(I)?l="svg":l!=="mathml"&&Yc(I)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(I),S||(x(O,I,w),Ba(O,!1)))},L=O=>{const S=()=>{if(ln.get(O)===S){if(ln.delete(O),kn(O.props)){const I=A(O.el)||s;x(O,I,O.anchor),Ba(O,!0)}R(O)}};ln.set(O,S),pt(S,i)};if(e==null){const O=t.el=g(""),S=t.anchor=g("");if(p(O,s,n),p(S,s,n),Zm(t.props)||i&&i.pendingBranch){L(t);return}b&&(x(t,s,S),Ba(t,!0)),R()}else{t.el=e.el;const O=t.anchor=e.anchor,S=ln.get(e);if(S){S.flags|=8,ln.delete(e),L(t);return}t.targetStart=e.targetStart;const I=t.target=e.target,w=t.targetAnchor=e.targetAnchor,$=kn(e.props),F=$?s:I,M=$?O:w;if(l==="svg"||Jc(I)?l="svg":(l==="mathml"||Yc(I))&&(l="mathml"),v?(f(e.dynamicChildren,v,F,a,i,l,r),zo(e,t,!0)):o||d(e,t,F,M,a,i,l,r,!1),b)$?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):$i(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const W=t.target=zr(t.props,m);W&&$i(t,W,null,c,0)}else $&&$i(t,I,w,c,1);Ba(t,b)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!kn(f),m=ln.get(e);if(m&&(m.flags|=8,ln.delete(e)),d&&(a(c),a(u)),i&&a(o),!m&&l&16)for(let g=0;g<r.length;g++){const k=r[g];n(k,t,s,p,!!k.dynamicChildren)}},move:$i,hydrate:Ym};function $i(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!ln.has(e)&&(!d||kn(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function Ym(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(k,A){let b=A;for(;b;){if(b&&b.nodeType===8){if(b.data==="teleport start anchor")t.targetStart=b;else if(b.data==="teleport anchor"){t.targetAnchor=b,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}b=l(b)}}function p(k,A){A.anchor=d(l(k),A,r(k),s,n,a,i)}const m=t.target=zr(t.props,o),g=kn(t.props);if(m){const k=m._lpa||m.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(m,k),t.targetAnchor||qr(m,t,u,c,r(e)===m?e:null)):(t.anchor=l(e),f(m,k),t.targetAnchor||qr(m,t,u,c),d(k&&l(k),t,m,s,n,a,i))),Ba(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Qm=Jm;function Ba(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function qr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Tf]=l,e&&(n(i,e,a),n(l,e,a)),l}const rs=Symbol("_leaveCb"),La=Symbol("_enterCb");function Do(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return $e(()=>{e.isMounted=!0}),Gl(()=>{e.isUnmounting=!0}),e}const ls=[Function,Array],Mo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ls,onEnter:ls,onAfterEnter:ls,onEnterCancelled:ls,onBeforeLeave:ls,onLeave:ls,onAfterLeave:ls,onLeaveCancelled:ls,onBeforeAppear:ls,onAppear:ls,onAfterAppear:ls,onAppearCancelled:ls},Ef=e=>{const t=e.subTree;return t.component?Ef(t.component):t},Xm={name:"BaseTransition",props:Mo,setup(e,{slots:t}){const s=zt(),n=Do();return()=>{const a=t.default&&zl(t.default(),!0),i=a&&a.length?Af(a):s.subTree?fp():void 0;if(!i)return;const l=Fe(e),{mode:r}=l;if(n.isLeaving)return mr(i);const o=Qc(i);if(!o)return mr(i);let c=pa(o,l,n,s,d=>c=d);o.type!==dt&&Ys(o,c);let u=s.subTree&&Qc(s.subTree);if(u&&u.type!==dt&&!gs(u,o)&&Ef(s).type!==dt){let d=pa(u,l,n,s);if(Ys(u,d),r==="out-in"&&o.type!==dt)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},mr(i);r==="in-out"&&o.type!==dt?d.delayLeave=(f,p,m)=>{const g=If(n,u);g[String(u.key)]=u,f[rs]=()=>{p(),f[rs]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Af(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==dt){t=s;break}}return t}const Rf=Xm;function If(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function pa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:m,onLeaveCancelled:g,onBeforeAppear:k,onAppear:A,onAfterAppear:b,onAppearCancelled:v}=t,x=String(e.key),R=If(s,e),L=(I,w)=>{I&&ss(I,n,9,w)},O=(I,w)=>{const $=w[1];L(I,w),fe(I)?I.every(F=>F.length<=1)&&$():I.length<=1&&$()},S={mode:l,persisted:r,beforeEnter(I){let w=o;if(!s.isMounted)if(i)w=k||o;else return;I[rs]&&I[rs](!0);const $=R[x];$&&gs(e,$)&&$.el[rs]&&$.el[rs](),L(w,[I])},enter(I){if(R[x]===e)return;let w=c,$=u,F=d;if(!s.isMounted)if(i)w=A||c,$=b||u,F=v||d;else return;let M=!1;I[La]=B=>{M||(M=!0,B?L(F,[I]):L($,[I]),S.delayedLeave&&S.delayedLeave(),I[La]=void 0)};const W=I[La].bind(null,!1);w?O(w,[I,W]):W()},leave(I,w){const $=String(e.key);if(I[La]&&I[La](!0),s.isUnmounting)return w();L(f,[I]);let F=!1;I[rs]=W=>{F||(F=!0,w(),W?L(g,[I]):L(m,[I]),I[rs]=void 0,R[$]===e&&delete R[$])};const M=I[rs].bind(null,!1);R[$]=e,p?O(p,[I,M]):M()},clone(I){const w=pa(I,t,s,n,a);return a&&a(w),w}};return S}function mr(e){if(Si(e))return e=Rs(e),e.children=null,e}function Qc(e){if(!Si(e))return Cf(e.type)&&e.children?Af(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&ke(s.default))return s.default()}}function Ys(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Ys(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function zl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===wt?(l.patchFlag&128&&a++,n=n.concat(zl(l.children,t,r))):(t||l.type!==dt)&&n.push(r!=null?Rs(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function wi(e,t){return ke(e)?Oe({name:e.name},t,{setup:e}):e}function ev(){const e=zt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Po(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function tv(e){const t=zt(),s=Io(null);if(t){const a=t.refs===Me?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Xc(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const ol=new WeakMap;function oa(e,t,s,n,a=!1){if(fe(e)){e.forEach((g,k)=>oa(g,t&&(fe(t)?t[k]:t),s,n,a));return}if(Ks(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&oa(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Ti(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Me?r.refs={}:r.refs,d=r.setupState,f=Fe(d),p=d===Me?ta:g=>Xc(u,g)?!1:He(f,g),m=(g,k)=>!(k&&Xc(u,k));if(c!=null&&c!==o){if(eu(t),Te(c))u[c]=null,p(c)&&(d[c]=null);else if(gt(c)){const g=t;m(c,g.k)&&(c.value=null),g.k&&(u[g.k]=null)}}if(ke(o))Ta(o,r,12,[l,u]);else{const g=Te(o),k=gt(o);if(g||k){const A=()=>{if(e.f){const b=g?p(o)?d[o]:u[o]:m()||!e.k?o.value:u[e.k];if(a)fe(b)&&wo(b,i);else if(fe(b))b.includes(i)||b.push(i);else if(g)u[o]=[i],p(o)&&(d[o]=u[o]);else{const v=[i];m(o,e.k)&&(o.value=v),e.k&&(u[e.k]=v)}}else g?(u[o]=l,p(o)&&(d[o]=l)):k&&(m(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const b=()=>{A(),ol.delete(e)};b.id=-1,ol.set(e,b),pt(b,s)}else eu(e),A()}}}function eu(e){const t=ol.get(e);t&&(t.flags|=8,ol.delete(e))}let tu=!1;const Gn=()=>{tu||(console.error("Hydration completed but contains mismatches."),tu=!0)},sv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",nv=e=>e.namespaceURI.includes("MathML"),Ui=e=>{if(e.nodeType===1){if(sv(e))return"svg";if(nv(e))return"mathml"}},sa=e=>e.nodeType===8;function av(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(v,x)=>{if(!x.hasChildNodes()){s(null,v,x),rl(),x._vnode=v;return}d(x.firstChild,v,null,null,null),rl(),x._vnode=v},d=(v,x,R,L,O,S=!1)=>{S=S||!!x.dynamicChildren;const I=sa(v)&&v.data==="[",w=()=>g(v,x,R,L,O,I),{type:$,ref:F,shapeFlag:M,patchFlag:W}=x;let B=v.nodeType;x.el=v,W===-2&&(S=!1,x.dynamicChildren=null);let V=null;switch($){case fn:B!==3?x.children===""?(o(x.el=a(""),l(v),v),V=v):V=w():(v.data!==x.children&&(Gn(),v.data=x.children),V=i(v));break;case dt:b(v)?(V=i(v),A(x.el=v.content.firstChild,v,R)):B!==8||I?V=w():V=i(v);break;case An:if(I&&(v=i(v),B=v.nodeType),B===1||B===3){V=v;const N=!x.children.length;for(let D=0;D<x.staticCount;D++)N&&(x.children+=V.nodeType===1?V.outerHTML:V.data),D===x.staticCount-1&&(x.anchor=V),V=i(V);return I?i(V):V}else w();break;case wt:I?V=m(v,x,R,L,O,S):V=w();break;default:if(M&1)(B!==1||x.type.toLowerCase()!==v.tagName.toLowerCase())&&!b(v)?V=w():V=f(v,x,R,L,O,S);else if(M&6){x.slotScopeIds=O;const N=l(v);if(I?V=k(v):sa(v)&&v.data==="teleport start"?V=k(v,v.data,"teleport end"):V=i(v),t(x,N,null,R,L,Ui(N),S),Ks(x)&&!x.type.__asyncResolved){let D;I?(D=at(wt),D.anchor=V?V.previousSibling:N.lastChild):D=v.nodeType===3?Ko(""):at("div"),D.el=v,x.component.subTree=D}}else M&64?B!==8?V=w():V=x.type.hydrate(v,x,R,L,O,S,e,p):M&128&&(V=x.type.hydrate(v,x,R,L,Ui(l(v)),O,S,e,d))}return F!=null&&oa(F,null,L,x),V},f=(v,x,R,L,O,S)=>{S=S||!!x.dynamicChildren;const{type:I,props:w,patchFlag:$,shapeFlag:F,dirs:M,transition:W}=x,B=I==="input"||I==="option";if(B||$!==-1){M&&Ts(x,null,R,"created");let V=!1;if(b(v)){V=np(null,W)&&R&&R.vnode.props&&R.vnode.props.appear;const D=v.content.firstChild;if(V){const q=D.getAttribute("class");q&&(D.$cls=q),W.beforeEnter(D)}A(D,v,R),x.el=v=D}if(F&16&&!(w&&(w.innerHTML||w.textContent))){let D=p(v.firstChild,x,v,R,L,O,S);for(D&&!Bi(v,1)&&Gn();D;){const q=D;D=D.nextSibling,r(q)}}else if(F&8){let D=x.children;D[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(D=D.slice(1));const{textContent:q}=v;q!==D&&q!==D.replace(/\r\n|\r/g,`
`)&&(Bi(v,0)||Gn(),v.textContent=x.children)}if(w){if(B||!S||$&48){const D=v.tagName.includes("-");for(const q in w)(B&&(q.endsWith("value")||q==="indeterminate")||Pn(q)&&!zs(q)||q[0]==="."||D&&!zs(q))&&n(v,q,null,w[q],void 0,R)}else if(w.onClick)n(v,"onClick",null,w.onClick,void 0,R);else if($&4&&qs(w.style))for(const D in w.style)w.style[D]}let N;(N=w&&w.onVnodeBeforeMount)&&Wt(N,R,x),M&&Ts(x,null,R,"beforeMount"),((N=w&&w.onVnodeMounted)||M||V)&&rp(()=>{N&&Wt(N,R,x),V&&W.enter(v),M&&Ts(x,null,R,"mounted")},L)}return v.nextSibling},p=(v,x,R,L,O,S,I)=>{I=I||!!x.dynamicChildren;const w=x.children,$=w.length;let F=!1;for(let M=0;M<$;M++){const W=I?w[M]:w[M]=Jt(w[M]),B=W.type===fn;v?(B&&!I&&M+1<$&&Jt(w[M+1]).type===fn&&(o(a(v.data.slice(W.children.length)),R,i(v)),v.data=W.children),v=d(v,W,L,O,S,I)):B&&!W.children?o(W.el=a(""),R):(F||(F=!0,Bi(R,1)||Gn()),s(null,W,R,null,L,O,Ui(R),S))}return v},m=(v,x,R,L,O,S)=>{const{slotScopeIds:I}=x;I&&(O=O?O.concat(I):I);const w=l(v),$=p(i(v),x,w,R,L,O,S);return $&&sa($)&&$.data==="]"?i(x.anchor=$):(Gn(),o(x.anchor=c("]"),w,$),$)},g=(v,x,R,L,O,S)=>{if(Bi(v.parentElement,1)||Gn(),x.el=null,S){const $=k(v);for(;;){const F=i(v);if(F&&F!==$)r(F);else break}}const I=i(v),w=l(v);return r(v),s(null,x,w,I,R,L,Ui(w),O),R&&(R.vnode.el=x.el,Zl(R,x.el)),I},k=(v,x="[",R="]")=>{let L=0;for(;v;)if(v=i(v),v&&sa(v)&&(v.data===x&&L++,v.data===R)){if(L===0)return i(v);L--}return v},A=(v,x,R)=>{const L=x.parentNode;L&&L.replaceChild(v,x);let O=R;for(;O;)O.vnode.el===x&&(O.vnode.el=O.subTree.el=v),O=O.parent},b=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[u,d]}const su="data-allow-mismatch",iv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Bi(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(su);)e=e.parentElement;const s=e&&e.getAttribute(su);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(iv[t])}}const lv=Fl().requestIdleCallback||(e=>setTimeout(e,1)),rv=Fl().cancelIdleCallback||(e=>clearTimeout(e)),ov=(e=1e4)=>t=>{const s=lv(t,{timeout:e});return()=>rv(s)};function cv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const uv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(cv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},dv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},fv=(e=[])=>(t,s)=>{Te(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function pv(e,t){if(sa(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(sa(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Ks=e=>!!e.type.__asyncLoader;function hv(e){ke(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let m;return c||(m=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((k,A)=>{o(g,()=>k(f()),()=>A(g),d+1)});throw g}).then(g=>m!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),u=g,g)))};return wi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(m,g,k){let A=!1;(g.bu||(g.bu=[])).push(()=>A=!0);const b=()=>{A||k()},v=i?()=>{const x=i(b,R=>pv(m,R));x&&(g.bum||(g.bum=[])).push(x)}:b;u?v():p().then(()=>!g.isUnmounted&&v())},get __asyncResolved(){return u},setup(){const m=At;if(Po(m),u)return()=>Hi(u,m);const g=R=>{c=null,Un(R,m,13,!n)};if(r&&m.suspense||On)return p().then(R=>()=>Hi(R,m)).catch(R=>(g(R),()=>n?at(n,{error:R}):null));const k=h(!1),A=h(),b=h(!!a);let v,x;return ft(()=>{v!=null&&clearTimeout(v),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{m.isUnmounted||(b.value=!1)},a)),l!=null&&(v=setTimeout(()=>{if(!m.isUnmounted&&!k.value&&!A.value){const R=new Error(`Async component timed out after ${l}ms.`);g(R),A.value=R}},l)),p().then(()=>{m.isUnmounted||(k.value=!0,m.parent&&Si(m.parent.vnode)&&m.parent.update())}).catch(R=>{if(m.isUnmounted){c=null;return}g(R),A.value=R}),()=>{if(k.value&&u)return Hi(u,m);if(A.value&&n)return at(n,{error:A.value});if(s&&!b.value)return Hi(s,m)}}})}function Hi(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=at(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Si=e=>e.type.__isKeepAlive,gv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=zt(),n=s.ctx;if(!n.renderer)return()=>{const b=t.default&&t.default();return b&&b.length===1?b[0]:b};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(b,v,x,R,L)=>{const O=b.component;c(b,v,x,0,r),o(O.vnode,b,v,x,O,r,R,b.slotScopeIds,L),pt(()=>{O.isDeactivated=!1,O.a&&la(O.a);const S=b.props&&b.props.onVnodeMounted;S&&Wt(S,O.parent,b)},r)},n.deactivate=b=>{const v=b.component;ul(v.m),ul(v.a),c(b,f,null,1,r),pt(()=>{v.da&&la(v.da);const x=b.props&&b.props.onVnodeUnmounted;x&&Wt(x,v.parent,b),v.isDeactivated=!0},r)};function p(b){vr(b),u(b,s,r,!0)}function m(b){a.forEach((v,x)=>{const R=eo(Ks(v)?v.type.__asyncResolved||{}:v.type);R&&!b(R)&&g(x)})}function g(b){const v=a.get(b);v&&(!l||!gs(v,l))?p(v):l&&vr(l),a.delete(b),i.delete(b)}ds(()=>[e.include,e.exclude],([b,v])=>{b&&m(x=>Ha(b,x)),v&&m(x=>!Ha(v,x))},{flush:"post",deep:!0});let k=null;const A=()=>{k!=null&&(dl(s.subTree.type)?pt(()=>{a.set(k,Vi(s.subTree))},s.subTree.suspense):a.set(k,Vi(s.subTree)))};return $e(A),Kl(A),Gl(()=>{a.forEach(b=>{const{subTree:v,suspense:x}=s,R=Vi(v);if(b.type===R.type&&b.key===R.key){vr(R);const L=R.component.da;L&&pt(L,x);return}p(b)})}),()=>{if(k=null,!t.default)return l=null;const b=t.default(),v=b[0];if(b.length>1)return l=null,b;if(!Qs(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let x=Vi(v);if(x.type===dt)return l=null,x;const R=x.type,L=eo(Ks(x)?x.type.__asyncResolved||{}:R),{include:O,exclude:S,max:I}=e;if(O&&(!L||!Ha(O,L))||S&&L&&Ha(S,L))return x.shapeFlag&=-257,l=x,v;const w=x.key==null?R:x.key,$=a.get(w);return x.el&&(x=Rs(x),v.shapeFlag&128&&(v.ssContent=x)),k=w,$?(x.el=$.el,x.component=$.component,x.transition&&Ys(x,x.transition),x.shapeFlag|=512,i.delete(w),i.add(w)):(i.add(w),I&&i.size>parseInt(I,10)&&g(i.values().next().value)),x.shapeFlag|=256,l=x,dl(v.type)?v:x}}},mv=gv;function Ha(e,t){return fe(e)?e.some(s=>Ha(s,t)):Te(e)?e.split(",").includes(t):Cg(e)?(e.lastIndex=0,e.test(t)):!1}function Nf(e,t){Of(e,"a",t)}function Lf(e,t){Of(e,"da",t)}function Of(e,t,s=At){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(ql(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Si(a.parent.vnode)&&vv(n,t,s,a),a=a.parent}}function vv(e,t,s,n){const a=ql(t,e,n,!0);ft(()=>{wo(n[t],a)},s)}function vr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Vi(e){return e.shapeFlag&128?e.ssContent:e}function ql(e,t,s=At,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Zs();const r=Ca(s),o=ss(t,s,e,l);return r(),Js(),o});return n?a.unshift(i):a.push(i),i}}const Xs=e=>(t,s=At)=>{(!On||e==="sp")&&ql(e,(...n)=>t(...n),s)},Df=Xs("bm"),$e=Xs("m"),Fo=Xs("bu"),Kl=Xs("u"),Gl=Xs("bum"),ft=Xs("um"),Mf=Xs("sp"),Pf=Xs("rtg"),Ff=Xs("rtc");function $f(e,t=At){ql("ec",e,t)}const $o="components",bv="directives";function yv(e,t){return Uo($o,e,!0,t)||e}const Uf=Symbol.for("v-ndc");function xv(e){return Te(e)?Uo($o,e,!1)||e:e||Uf}function _v(e){return Uo(bv,e)}function Uo(e,t,s=!0,n=!1){const a=Rt||At;if(a){const i=a.type;if(e===$o){const r=eo(i,!1);if(r&&(r===t||r===Ke(t)||r===$n(Ke(t))))return i}const l=nu(a[e]||i[e],t)||nu(a.appContext[e],t);return!l&&n?i:l}}function nu(e,t){return e&&(e[t]||e[Ke(t)]||e[$n(Ke(t))])}function kv(e,t,s,n){let a;const i=s&&s[n],l=fe(e);if(l||Te(e)){const r=l&&qs(e);let o=!1,c=!1;r&&(o=!Xt(e),c=As(e),e=Bl(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?fa(bs(e[u])):bs(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Be(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function wv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(fe(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Sv(e,t,s={},n,a){if(Rt.ce||Rt.parent&&Ks(Rt.parent)&&Rt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),ci(),fl(wt,null,[at("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),ci();const l=i&&Bo(i(s)),r=s.key||l&&l.key,o=fl(wt,{key:(r&&!$t(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Bo(e){return e.some(t=>Qs(t)?!(t.type===dt||t.type===wt&&!Bo(t.children)):!0)?e:null}function Tv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:ia(n)]=e[n];return s}const Kr=e=>e?gp(e)?Ti(e):Kr(e.parent):null,Wa=Oe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Kr(e.parent),$root:e=>Kr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Ho(e),$forceUpdate:e=>e.f||(e.f=()=>{Lo(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Wm.bind(e)}),br=(e,t)=>e!==Me&&!e.__isScriptSetup&&He(e,t),Gr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(br(n,t))return l[t]=1,n[t];if(a!==Me&&He(a,t))return l[t]=2,a[t];if(He(i,t))return l[t]=3,i[t];if(s!==Me&&He(s,t))return l[t]=4,s[t];Wr&&(l[t]=0)}}const c=Wa[t];let u,d;if(c)return t==="$attrs"&&Mt(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Me&&He(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,He(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return br(a,t)?(a[t]=s,!0):n!==Me&&He(n,t)?(n[t]=s,!0):He(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Me&&r[0]!=="$"&&He(e,r)||br(t,r)||He(i,r)||He(n,r)||He(Wa,r)||He(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:He(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Cv=Oe({},Gr,{get(e,t){if(t!==Symbol.unscopables)return Gr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Og(t)}});function Ev(){return null}function Av(){return null}function Rv(e){}function Iv(e){}function Nv(){return null}function Lv(){}function Ov(e,t){return null}function Dv(){return Bf().slots}function Mv(){return Bf().attrs}function Bf(e){const t=zt();return t.setupContext||(t.setupContext=yp(t))}function ri(e){return fe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Pv(e,t){const s=ri(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?fe(a)||ke(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Fv(e,t){return!e||!t?e||t:fe(e)&&fe(t)?e.concat(t):Oe({},ri(e),ri(t))}function $v(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Uv(e){const t=zt(),s=On;let n=e();di(),s&&ua(!1);const a=()=>{Ca(t),s&&ua(!0)},i=()=>{zt()!==t&&t.scope.off(),di(),s&&ua(!1)};return So(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Wr=!0;function Bv(e){const t=Ho(e),s=e.proxy,n=e.ctx;Wr=!1,t.beforeCreate&&au(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:m,activated:g,deactivated:k,beforeDestroy:A,beforeUnmount:b,destroyed:v,unmounted:x,render:R,renderTracked:L,renderTriggered:O,errorCaptured:S,serverPrefetch:I,expose:w,inheritAttrs:$,components:F,directives:M,filters:W}=t;if(c&&Hv(c,n,null),l)for(const N in l){const D=l[N];ke(D)&&(n[N]=D.bind(s))}if(a){const N=a.call(s,s);Be(N)&&(e.data=gn(N))}if(Wr=!0,i)for(const N in i){const D=i[N],q=ke(D)?D.bind(s,s):ke(D.get)?D.get.bind(s,s):It,ue=!ke(D)&&ke(D.set)?D.set.bind(s):It,ve=ee({get:q,set:ue});Object.defineProperty(n,N,{enumerable:!0,configurable:!0,get:()=>ve.value,set:se=>ve.value=se})}if(r)for(const N in r)Hf(r[N],n,s,N);if(o){const N=ke(o)?o.call(s):o;Reflect.ownKeys(N).forEach(D=>{Ga(D,N[D])})}u&&au(u,e,"c");function V(N,D){fe(D)?D.forEach(q=>N(q.bind(s))):D&&N(D.bind(s))}if(V(Df,d),V($e,f),V(Fo,p),V(Kl,m),V(Nf,g),V(Lf,k),V($f,S),V(Ff,L),V(Pf,O),V(Gl,b),V(ft,x),V(Mf,I),fe(w))if(w.length){const N=e.exposed||(e.exposed={});w.forEach(D=>{Object.defineProperty(N,D,{get:()=>s[D],set:q=>s[D]=q,enumerable:!0})})}else e.exposed||(e.exposed={});R&&e.render===It&&(e.render=R),$!=null&&(e.inheritAttrs=$),F&&(e.components=F),M&&(e.directives=M),I&&Po(e)}function Hv(e,t,s=It){fe(e)&&(e=Zr(e));for(const n in e){const a=e[n];let i;Be(a)?"default"in a?i=us(a.from||n,a.default,!0):i=us(a.from||n):i=us(a),gt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function au(e,t,s){ss(fe(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Hf(e,t,s,n){let a=n.includes(".")?Sf(s,n):()=>s[n];if(Te(e)){const i=t[e];ke(i)&&ds(a,i)}else if(ke(e))ds(a,e.bind(s));else if(Be(e))if(fe(e))e.forEach(i=>Hf(i,t,s,n));else{const i=ke(e.handler)?e.handler.bind(s):t[e.handler];ke(i)&&ds(a,i,e)}}function Ho(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>cl(o,c,l,!0)),cl(o,t,l)),Be(t)&&i.set(t,o),o}function cl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&cl(e,i,s,!0),a&&a.forEach(l=>cl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=Vv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const Vv={data:iu,props:lu,emits:lu,methods:Va,computed:Va,beforeCreate:Ut,created:Ut,beforeMount:Ut,mounted:Ut,beforeUpdate:Ut,updated:Ut,beforeDestroy:Ut,beforeUnmount:Ut,destroyed:Ut,unmounted:Ut,activated:Ut,deactivated:Ut,errorCaptured:Ut,serverPrefetch:Ut,components:Va,directives:Va,watch:zv,provide:iu,inject:jv};function iu(e,t){return t?e?function(){return Oe(ke(e)?e.call(this,this):e,ke(t)?t.call(this,this):t)}:t:e}function jv(e,t){return Va(Zr(e),Zr(t))}function Zr(e){if(fe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Ut(e,t){return e?[...new Set([].concat(e,t))]:t}function Va(e,t){return e?Oe(Object.create(null),e,t):t}function lu(e,t){return e?fe(e)&&fe(t)?[...new Set([...e,...t])]:Oe(Object.create(null),ri(e),ri(t??{})):t}function zv(e,t){if(!e)return t;if(!t)return e;const s=Oe(Object.create(null),e);for(const n in t)s[n]=Ut(e[n],t[n]);return s}function Vf(){return{app:null,config:{isNativeTag:ta,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let qv=0;function Kv(e,t){return function(n,a=null){ke(n)||(n=Oe({},n)),a!=null&&!Be(a)&&(a=null);const i=Vf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:qv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:_p,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&ke(u.install)?(l.add(u),u.install(c,...d)):ke(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||at(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,Ti(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(ss(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=En;En=c;try{return u()}finally{En=d}}};return c}}let En=null;function Gv(e,t,s=Me){const n=zt(),a=Ke(t),i=Yt(t),l=jf(e,a),r=pf((o,c)=>{let u,d=Me,f;return wf(()=>{const p=e[a];kt(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const m=s.set?s.set(p):p;if(!kt(m,u)&&!(d!==Me&&kt(p,d)))return;const g=n.vnode.props,k=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));k||(u=p,c()),n.emit(`update:${t}`,m),kt(p,d)&&(kt(p,m)&&!kt(m,f)||k&&d!==Me&&!kt(m,u))&&c(),d=p,f=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Me:r,done:!1}:{done:!0}}}},r}const jf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Ke(t)}Modifiers`]||e[`${Yt(t)}Modifiers`];function Wv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Me;let a=s;const i=t.startsWith("update:"),l=i&&jf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Te(u)?u.trim():u)),l.number&&(a=s.map(Pl)));let r,o=n[r=ia(t)]||n[r=ia(Ke(t))];!o&&i&&(o=n[r=ia(Yt(t))]),o&&ss(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ss(c,e,6,a)}}const Zv=new WeakMap;function zf(e,t,s=!1){const n=s?Zv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!ke(e)){const o=c=>{const u=zf(c,t,!0);u&&(r=!0,Oe(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Be(e)&&n.set(e,null),null):(fe(i)?i.forEach(o=>l[o]=null):Oe(l,i),Be(e)&&n.set(e,l),l)}function Wl(e,t){return!e||!Pn(t)?!1:(t=t.slice(2).replace(/Once$/,""),He(e,t[0].toLowerCase()+t.slice(1))||He(e,Yt(t))||He(e,t))}function Zi(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:m,inheritAttrs:g}=e,k=li(e);let A,b;try{if(s.shapeFlag&4){const x=a||n,R=x;A=Jt(c.call(R,x,u,d,p,f,m)),b=r}else{const x=t;A=Jt(x.length>1?x(d,{attrs:r,slots:l,emit:o}):x(d,null)),b=t.props?r:Yv(r)}}catch(x){Za.length=0,Un(x,e,1),A=at(dt)}let v=A;if(b&&g!==!1){const x=Object.keys(b),{shapeFlag:R}=v;x.length&&R&7&&(i&&x.some(Ll)&&(b=Qv(b,i)),v=Rs(v,b,!1,!0))}return s.dirs&&(v=Rs(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&Ys(v,s.transition),A=v,li(k),A}function Jv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Qs(a)){if(a.type!==dt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Yv=e=>{let t;for(const s in e)(s==="class"||s==="style"||Pn(s))&&((t||(t={}))[s]=e[s]);return t},Qv=(e,t)=>{const s={};for(const n in e)(!Ll(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Xv(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?ru(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(qf(l,n,f)&&!Wl(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?ru(n,l,c):!0:!!l;return!1}function ru(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(qf(t,e,i)&&!Wl(s,i))return!0}return!1}function qf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Be(n)&&Be(a)?!Ws(n,a):n!==a}function Zl({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Kf={},Gf=()=>Object.create(Kf),Wf=e=>Object.getPrototypeOf(e)===Kf;function eb(e,t,s,n=!1){const a={},i=Gf();e.propsDefaults=Object.create(null),Zf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Ro(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function tb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Fe(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(Wl(e.emitsOptions,f))continue;const p=t[f];if(o)if(He(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const m=Ke(f);a[m]=Jr(o,r,m,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{Zf(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!He(t,d)&&((u=Yt(d))===d||!He(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=Jr(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!He(t,d))&&(delete i[d],c=!0)}c&&Us(e.attrs,"set","")}function Zf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(zs(o))continue;const c=t[o];let u;a&&He(a,u=Ke(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:Wl(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Fe(s),c=r||Me;for(let u=0;u<i.length;u++){const d=i[u];s[d]=Jr(a,o,d,c[d],e,!He(c,d))}}return l}function Jr(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=He(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&ke(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Ca(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===Yt(s))&&(n=!0))}return n}const sb=new WeakMap;function Jf(e,t,s=!1){const n=s?sb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!ke(e)){const u=d=>{o=!0;const[f,p]=Jf(d,t,!0);Oe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return Be(e)&&n.set(e,na),na;if(fe(i))for(let u=0;u<i.length;u++){const d=Ke(i[u]);ou(d)&&(l[d]=Me)}else if(i)for(const u in i){const d=Ke(u);if(ou(d)){const f=i[u],p=l[d]=fe(f)||ke(f)?{type:f}:Oe({},f),m=p.type;let g=!1,k=!0;if(fe(m))for(let A=0;A<m.length;++A){const b=m[A],v=ke(b)&&b.name;if(v==="Boolean"){g=!0;break}else v==="String"&&(k=!1)}else g=ke(m)&&m.name==="Boolean";p[0]=g,p[1]=k,(g||He(p,"default"))&&r.push(d)}}const c=[l,r];return Be(e)&&n.set(e,c),c}function ou(e){return e[0]!=="$"&&!zs(e)}const Vo=e=>e==="_"||e==="_ctx"||e==="$stable",jo=e=>fe(e)?e.map(Jt):[Jt(e)],nb=(e,t,s)=>{if(t._n)return t;const n=Oo((...a)=>jo(t(...a)),s);return n._c=!1,n},Yf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Vo(a))continue;const i=e[a];if(ke(i))t[a]=nb(a,i,n);else if(i!=null){const l=jo(i);t[a]=()=>l}}},Qf=(e,t)=>{const s=jo(t);e.slots.default=()=>s},Xf=(e,t,s)=>{for(const n in t)(s||!Vo(n))&&(e[n]=t[n])},ab=(e,t,s)=>{const n=e.slots=Gf();if(e.vnode.shapeFlag&32){const a=t._;a?(Xf(n,t,s),s&&Vd(n,"_",a,!0)):Yf(t,n)}else t&&Qf(e,t)},ib=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Me;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Xf(a,t,s):(i=!t.$stable,Yf(t,a)),l=t}else t&&(Qf(e,t),l={default:1});if(i)for(const r in a)!Vo(r)&&l[r]==null&&delete a[r]},pt=rp;function ep(e){return sp(e)}function tp(e){return sp(e,av)}function sp(e,t){const s=Fl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=It,insertStaticContent:m}=e,g=(y,T,P,G=null,E=null,U=null,Z=void 0,X=null,te=!!T.dynamicChildren)=>{if(y===T)return;y&&!gs(y,T)&&(G=j(y),se(y,E,U,!0),y=null),T.patchFlag===-2&&(te=!1,T.dynamicChildren=null);const{type:Y,ref:pe,shapeFlag:ie}=T;switch(Y){case fn:k(y,T,P,G);break;case dt:A(y,T,P,G);break;case An:y==null&&b(T,P,G,Z);break;case wt:F(y,T,P,G,E,U,Z,X,te);break;default:ie&1?R(y,T,P,G,E,U,Z,X,te):ie&6?M(y,T,P,G,E,U,Z,X,te):(ie&64||ie&128)&&Y.process(y,T,P,G,E,U,Z,X,te,ge)}pe!=null&&E?oa(pe,y&&y.ref,U,T||y,!T):pe==null&&y&&y.ref!=null&&oa(y.ref,null,U,y,!0)},k=(y,T,P,G)=>{if(y==null)n(T.el=r(T.children),P,G);else{const E=T.el=y.el;T.children!==y.children&&c(E,T.children)}},A=(y,T,P,G)=>{y==null?n(T.el=o(T.children||""),P,G):T.el=y.el},b=(y,T,P,G)=>{[y.el,y.anchor]=m(y.children,T,P,G,y.el,y.anchor)},v=({el:y,anchor:T},P,G)=>{let E;for(;y&&y!==T;)E=f(y),n(y,P,G),y=E;n(T,P,G)},x=({el:y,anchor:T})=>{let P;for(;y&&y!==T;)P=f(y),a(y),y=P;a(T)},R=(y,T,P,G,E,U,Z,X,te)=>{if(T.type==="svg"?Z="svg":T.type==="math"&&(Z="mathml"),y==null)L(T,P,G,E,U,Z,X,te);else{const Y=y.el&&y.el._isVueCE?y.el:null;try{Y&&Y._beginPatch(),I(y,T,E,U,Z,X,te)}finally{Y&&Y._endPatch()}}},L=(y,T,P,G,E,U,Z,X)=>{let te,Y;const{props:pe,shapeFlag:ie,transition:ce,dirs:ye}=y;if(te=y.el=l(y.type,U,pe&&pe.is,pe),ie&8?u(te,y.children):ie&16&&S(y.children,te,null,G,E,yr(y,U),Z,X),ye&&Ts(y,null,G,"created"),O(te,y,y.scopeId,Z,G),pe){for(const Ee in pe)Ee!=="value"&&!zs(Ee)&&i(te,Ee,null,pe[Ee],U,G);"value"in pe&&i(te,"value",null,pe.value,U),(Y=pe.onVnodeBeforeMount)&&Wt(Y,G,y)}ye&&Ts(y,null,G,"beforeMount");const Se=np(E,ce);Se&&ce.beforeEnter(te),n(te,T,P),((Y=pe&&pe.onVnodeMounted)||Se||ye)&&pt(()=>{try{Y&&Wt(Y,G,y),Se&&ce.enter(te),ye&&Ts(y,null,G,"mounted")}finally{}},E)},O=(y,T,P,G,E)=>{if(P&&p(y,P),G)for(let U=0;U<G.length;U++)p(y,G[U]);if(E){let U=E.subTree;if(T===U||dl(U.type)&&(U.ssContent===T||U.ssFallback===T)){const Z=E.vnode;O(y,Z,Z.scopeId,Z.slotScopeIds,E.parent)}}},S=(y,T,P,G,E,U,Z,X,te=0)=>{for(let Y=te;Y<y.length;Y++){const pe=y[Y]=X?Fs(y[Y]):Jt(y[Y]);g(null,pe,T,P,G,E,U,Z,X)}},I=(y,T,P,G,E,U,Z)=>{const X=T.el=y.el;let{patchFlag:te,dynamicChildren:Y,dirs:pe}=T;te|=y.patchFlag&16;const ie=y.props||Me,ce=T.props||Me;let ye;if(P&&bn(P,!1),(ye=ce.onVnodeBeforeUpdate)&&Wt(ye,P,T,y),pe&&Ts(T,y,P,"beforeUpdate"),P&&bn(P,!0),(ie.innerHTML&&ce.innerHTML==null||ie.textContent&&ce.textContent==null)&&u(X,""),Y?w(y.dynamicChildren,Y,X,P,G,yr(T,E),U):Z||D(y,T,X,null,P,G,yr(T,E),U,!1),te>0){if(te&16)$(X,ie,ce,P,E);else if(te&2&&ie.class!==ce.class&&i(X,"class",null,ce.class,E),te&4&&i(X,"style",ie.style,ce.style,E),te&8){const Se=T.dynamicProps;for(let Ee=0;Ee<Se.length;Ee++){const C=Se[Ee],Q=ie[C],be=ce[C];(be!==Q||C==="value")&&i(X,C,Q,be,E,P)}}te&1&&y.children!==T.children&&u(X,T.children)}else!Z&&Y==null&&$(X,ie,ce,P,E);((ye=ce.onVnodeUpdated)||pe)&&pt(()=>{ye&&Wt(ye,P,T,y),pe&&Ts(T,y,P,"updated")},G)},w=(y,T,P,G,E,U,Z)=>{for(let X=0;X<T.length;X++){const te=y[X],Y=T[X],pe=te.el&&(te.type===wt||!gs(te,Y)||te.shapeFlag&198)?d(te.el):P;g(te,Y,pe,null,G,E,U,Z,!0)}},$=(y,T,P,G,E)=>{if(T!==P){if(T!==Me)for(const U in T)!zs(U)&&!(U in P)&&i(y,U,T[U],null,E,G);for(const U in P){if(zs(U))continue;const Z=P[U],X=T[U];Z!==X&&U!=="value"&&i(y,U,X,Z,E,G)}"value"in P&&i(y,"value",T.value,P.value,E)}},F=(y,T,P,G,E,U,Z,X,te)=>{const Y=T.el=y?y.el:r(""),pe=T.anchor=y?y.anchor:r("");let{patchFlag:ie,dynamicChildren:ce,slotScopeIds:ye}=T;ye&&(X=X?X.concat(ye):ye),y==null?(n(Y,P,G),n(pe,P,G),S(T.children||[],P,pe,E,U,Z,X,te)):ie>0&&ie&64&&ce&&y.dynamicChildren&&y.dynamicChildren.length===ce.length?(w(y.dynamicChildren,ce,P,E,U,Z,X),(T.key!=null||E&&T===E.subTree)&&zo(y,T,!0)):D(y,T,P,pe,E,U,Z,X,te)},M=(y,T,P,G,E,U,Z,X,te)=>{T.slotScopeIds=X,y==null?T.shapeFlag&512?E.ctx.activate(T,P,G,Z,te):W(T,P,G,E,U,Z,te):B(y,T,te)},W=(y,T,P,G,E,U,Z)=>{const X=y.component=hp(y,G,E);if(Si(y)&&(X.ctx.renderer=ge),mp(X,!1,Z),X.asyncDep){if(E&&E.registerDep(X,V,Z),!y.el){const te=X.subTree=at(dt);A(null,te,T,P),y.placeholder=te.el}}else V(X,y,T,P,E,U,Z)},B=(y,T,P)=>{const G=T.component=y.component;if(Xv(y,T,P))if(G.asyncDep&&!G.asyncResolved){N(G,T,P);return}else G.next=T,G.update();else T.el=y.el,G.vnode=T},V=(y,T,P,G,E,U,Z)=>{const X=()=>{if(y.isMounted){let{next:ie,bu:ce,u:ye,parent:Se,vnode:Ee}=y;{const Ze=ap(y);if(Ze){ie&&(ie.el=Ee.el,N(y,ie,Z)),Ze.asyncDep.then(()=>{pt(()=>{y.isUnmounted||Y()},E)});return}}let C=ie,Q;bn(y,!1),ie?(ie.el=Ee.el,N(y,ie,Z)):ie=Ee,ce&&la(ce),(Q=ie.props&&ie.props.onVnodeBeforeUpdate)&&Wt(Q,Se,ie,Ee),bn(y,!0);const be=Zi(y),De=y.subTree;y.subTree=be,g(De,be,d(De.el),j(De),y,E,U),ie.el=be.el,C===null&&Zl(y,be.el),ye&&pt(ye,E),(Q=ie.props&&ie.props.onVnodeUpdated)&&pt(()=>Wt(Q,Se,ie,Ee),E)}else{let ie;const{el:ce,props:ye}=T,{bm:Se,m:Ee,parent:C,root:Q,type:be}=y,De=Ks(T);if(bn(y,!1),Se&&la(Se),!De&&(ie=ye&&ye.onVnodeBeforeMount)&&Wt(ie,C,T),bn(y,!0),ce&&Le){const Ze=()=>{y.subTree=Zi(y),Le(ce,y.subTree,y,E,null)};De&&be.__asyncHydrate?be.__asyncHydrate(ce,y,Ze):Ze()}else{Q.ce&&Q.ce._hasShadowRoot()&&Q.ce._injectChildStyle(be,y.parent?y.parent.type:void 0);const Ze=y.subTree=Zi(y);g(null,Ze,P,G,y,E,U),T.el=Ze.el}if(Ee&&pt(Ee,E),!De&&(ie=ye&&ye.onVnodeMounted)){const Ze=T;pt(()=>Wt(ie,C,Ze),E)}(T.shapeFlag&256||C&&Ks(C.vnode)&&C.vnode.shapeFlag&256)&&y.a&&pt(y.a,E),y.isMounted=!0,T=P=G=null}};y.scope.on();const te=y.effect=new ti(X);y.scope.off();const Y=y.update=te.run.bind(te),pe=y.job=te.runIfDirty.bind(te);pe.i=y,pe.id=y.uid,te.scheduler=()=>Lo(pe),bn(y,!0),Y()},N=(y,T,P)=>{T.component=y;const G=y.vnode.props;y.vnode=T,y.next=null,tb(y,T.props,G,P),ib(y,T.children,P),Zs(),Zc(y),Js()},D=(y,T,P,G,E,U,Z,X,te=!1)=>{const Y=y&&y.children,pe=y?y.shapeFlag:0,ie=T.children,{patchFlag:ce,shapeFlag:ye}=T;if(ce>0){if(ce&128){ue(Y,ie,P,G,E,U,Z,X,te);return}else if(ce&256){q(Y,ie,P,G,E,U,Z,X,te);return}}ye&8?(pe&16&&Ie(Y,E,U),ie!==Y&&u(P,ie)):pe&16?ye&16?ue(Y,ie,P,G,E,U,Z,X,te):Ie(Y,E,U,!0):(pe&8&&u(P,""),ye&16&&S(ie,P,G,E,U,Z,X,te))},q=(y,T,P,G,E,U,Z,X,te)=>{y=y||na,T=T||na;const Y=y.length,pe=T.length,ie=Math.min(Y,pe);let ce;for(ce=0;ce<ie;ce++){const ye=T[ce]=te?Fs(T[ce]):Jt(T[ce]);g(y[ce],ye,P,null,E,U,Z,X,te)}Y>pe?Ie(y,E,U,!0,!1,ie):S(T,P,G,E,U,Z,X,te,ie)},ue=(y,T,P,G,E,U,Z,X,te)=>{let Y=0;const pe=T.length;let ie=y.length-1,ce=pe-1;for(;Y<=ie&&Y<=ce;){const ye=y[Y],Se=T[Y]=te?Fs(T[Y]):Jt(T[Y]);if(gs(ye,Se))g(ye,Se,P,null,E,U,Z,X,te);else break;Y++}for(;Y<=ie&&Y<=ce;){const ye=y[ie],Se=T[ce]=te?Fs(T[ce]):Jt(T[ce]);if(gs(ye,Se))g(ye,Se,P,null,E,U,Z,X,te);else break;ie--,ce--}if(Y>ie){if(Y<=ce){const ye=ce+1,Se=ye<pe?T[ye].el:G;for(;Y<=ce;)g(null,T[Y]=te?Fs(T[Y]):Jt(T[Y]),P,Se,E,U,Z,X,te),Y++}}else if(Y>ce)for(;Y<=ie;)se(y[Y],E,U,!0),Y++;else{const ye=Y,Se=Y,Ee=new Map;for(Y=Se;Y<=ce;Y++){const st=T[Y]=te?Fs(T[Y]):Jt(T[Y]);st.key!=null&&Ee.set(st.key,Y)}let C,Q=0;const be=ce-Se+1;let De=!1,Ze=0;const Ge=new Array(be);for(Y=0;Y<be;Y++)Ge[Y]=0;for(Y=ye;Y<=ie;Y++){const st=y[Y];if(Q>=be){se(st,E,U,!0);continue}let Je;if(st.key!=null)Je=Ee.get(st.key);else for(C=Se;C<=ce;C++)if(Ge[C-Se]===0&&gs(st,T[C])){Je=C;break}Je===void 0?se(st,E,U,!0):(Ge[Je-Se]=Y+1,Je>=Ze?Ze=Je:De=!0,g(st,T[Je],P,null,E,U,Z,X,te),Q++)}const St=De?lb(Ge):na;for(C=St.length-1,Y=be-1;Y>=0;Y--){const st=Se+Y,Je=T[st],en=T[st+1],mn=st+1<pe?en.el||ip(en):G;Ge[Y]===0?g(null,Je,P,mn,E,U,Z,X,te):De&&(C<0||Y!==St[C]?ve(Je,P,mn,2):C--)}}},ve=(y,T,P,G,E=null)=>{const{el:U,type:Z,transition:X,children:te,shapeFlag:Y}=y;if(Y&6){ve(y.component.subTree,T,P,G);return}if(Y&128){y.suspense.move(T,P,G);return}if(Y&64){Z.move(y,T,P,ge);return}if(Z===wt){n(U,T,P);for(let ie=0;ie<te.length;ie++)ve(te[ie],T,P,G);n(y.anchor,T,P);return}if(Z===An){v(y,T,P);return}if(G!==2&&Y&1&&X)if(G===0)X.persisted&&!U[rs]?n(U,T,P):(X.beforeEnter(U),n(U,T,P),pt(()=>X.enter(U),E));else{const{leave:ie,delayLeave:ce,afterLeave:ye}=X,Se=()=>{y.ctx.isUnmounted?a(U):n(U,T,P)},Ee=()=>{const C=U._isLeaving||!!U[rs];U._isLeaving&&U[rs](!0),X.persisted&&!C?Se():ie(U,()=>{Se(),ye&&ye()})};ce?ce(U,Se,Ee):Ee()}else n(U,T,P)},se=(y,T,P,G=!1,E=!1)=>{const{type:U,props:Z,ref:X,children:te,dynamicChildren:Y,shapeFlag:pe,patchFlag:ie,dirs:ce,cacheIndex:ye,memo:Se}=y;if(ie===-2&&(E=!1),X!=null&&(Zs(),oa(X,null,P,y,!0),Js()),ye!=null&&(T.renderCache[ye]=void 0),pe&256){T.ctx.deactivate(y);return}const Ee=pe&1&&ce,C=!Ks(y);let Q;if(C&&(Q=Z&&Z.onVnodeBeforeUnmount)&&Wt(Q,T,y),pe&6)oe(y.component,P,G);else{if(pe&128){y.suspense.unmount(P,G);return}Ee&&Ts(y,null,T,"beforeUnmount"),pe&64?y.type.remove(y,T,P,ge,G):Y&&!Y.hasOnce&&(U!==wt||ie>0&&ie&64)?Ie(Y,T,P,!1,!0):(U===wt&&ie&384||!E&&pe&16)&&Ie(te,T,P),G&&de(y)}const be=Se!=null&&ye==null;(C&&(Q=Z&&Z.onVnodeUnmounted)||Ee||be)&&pt(()=>{Q&&Wt(Q,T,y),Ee&&Ts(y,null,T,"unmounted"),be&&(y.el=null)},P)},de=y=>{const{type:T,el:P,anchor:G,transition:E}=y;if(T===wt){J(P,G);return}if(T===An){x(y);return}const U=()=>{a(P),E&&!E.persisted&&E.afterLeave&&E.afterLeave()};if(y.shapeFlag&1&&E&&!E.persisted){const{leave:Z,delayLeave:X}=E,te=()=>Z(P,U);X?X(y.el,U,te):te()}else U()},J=(y,T)=>{let P;for(;y!==T;)P=f(y),a(y),y=P;a(T)},oe=(y,T,P)=>{const{bum:G,scope:E,job:U,subTree:Z,um:X,m:te,a:Y}=y;ul(te),ul(Y),G&&la(G),E.stop(),U&&(U.flags|=8,se(Z,y,T,P)),X&&pt(X,T),pt(()=>{y.isUnmounted=!0},T)},Ie=(y,T,P,G=!1,E=!1,U=0)=>{for(let Z=U;Z<y.length;Z++)se(y[Z],T,P,G,E)},j=y=>{if(y.shapeFlag&6)return j(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const T=f(y.anchor||y.el),P=T&&T[Tf];return P?f(P):T};let re=!1;const le=(y,T,P)=>{let G;y==null?T._vnode&&(se(T._vnode,null,null,!0),G=T._vnode.component):g(T._vnode||null,y,T,null,null,null,P),T._vnode=y,re||(re=!0,Zc(G),rl(),re=!1)},ge={p:g,um:se,m:ve,r:de,mt:W,mc:S,pc:D,pbc:w,n:j,o:e};let me,Le;return t&&([me,Le]=t(ge)),{render:le,hydrate:me,createApp:Kv(le,me)}}function yr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function bn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function np(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function zo(e,t,s=!1){const n=e.children,a=t.children;if(fe(n)&&fe(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=Fs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&zo(l,r)),r.type===fn&&(r.patchFlag===-1&&(r=a[i]=Fs(r)),r.el=l.el),r.type===dt&&!r.el&&(r.el=l.el)}}function lb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function ap(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:ap(t)}function ul(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function ip(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?ip(t.subTree):null}const dl=e=>e.__isSuspense;let Yr=0;const rb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)cb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}ub(e,t,s,n,a,l,r,o,c)}},hydrate:db,normalize:fb},ob=rb;function oi(e,t){const s=e.props&&e.props[t];ke(s)&&s()}function cb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=lp(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(oi(e,"onPending"),oi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ca(f,e.ssFallback)):f.resolve(!1,!0)}function ub(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:m,pendingBranch:g,isInFallback:k,isHydrating:A}=d;if(g)d.pendingBranch=f,gs(g,f)?(o(g,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():k&&(A||(o(m,p,s,n,a,null,i,l,r),ca(d,p)))):(d.pendingId=Yr++,A?(d.isHydrating=!1,d.activeBranch=g):c(g,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),k?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(m,p,s,n,a,null,i,l,r),ca(d,p))):m&&gs(m,f)?(o(m,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(m&&gs(m,f))o(m,f,s,n,a,d,i,l,r),ca(d,f);else if(oi(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=Yr++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:b,pendingId:v}=d;b>0?setTimeout(()=>{d.pendingId===v&&d.fallback(p)},b):b===0&&d.fallback(p)}}function lp(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:m,o:{parentNode:g,remove:k}}=c;let A;const b=pb(e);b&&t&&t.pendingBranch&&(A=t.pendingId,t.deps++);const v=e.props?sl(e.props.timeout):void 0,x=i,R={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Yr++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(L=!1,O=!1){const{vnode:S,activeBranch:I,pendingBranch:w,pendingId:$,effects:F,parentComponent:M,container:W,isInFallback:B}=R;let V=!1;if(R.isHydrating)R.isHydrating=!1;else if(!L){V=I&&w.transition&&w.transition.mode==="out-in";let q=!1;V&&(I.transition.afterLeave=()=>{$===R.pendingId&&(f(w,W,i===x&&!q?m(I):i,0),ai(F),B&&S.ssFallback&&(S.ssFallback.el=null))}),I&&!R.isFallbackMountPending&&(g(I.el)===W&&(i=m(I),q=!0),p(I,M,R,!0),!V&&B&&S.ssFallback&&pt(()=>S.ssFallback.el=null,R)),V||f(w,W,i,0)}R.isFallbackMountPending=!1,ca(R,w),R.pendingBranch=null,R.isInFallback=!1;let N=R.parent,D=!1;for(;N;){if(N.pendingBranch){N.effects.push(...F),D=!0;break}N=N.parent}!D&&!V&&ai(F),R.effects=[],b&&t&&t.pendingBranch&&A===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),oi(S,"onResolve")},fallback(L){if(!R.pendingBranch)return;const{vnode:O,activeBranch:S,parentComponent:I,container:w,namespace:$}=R;oi(O,"onFallback");const F=m(S),M=()=>{R.isFallbackMountPending=!1,R.isInFallback&&(d(null,L,w,F,I,null,$,r,o),ca(R,L))},W=L.transition&&L.transition.mode==="out-in";W&&(R.isFallbackMountPending=!0,S.transition.afterLeave=M),R.isInFallback=!0,p(S,I,null,!0),W||M()},move(L,O,S){R.activeBranch&&f(R.activeBranch,L,O,S),R.container=L},next(){return R.activeBranch&&m(R.activeBranch)},registerDep(L,O,S){const I=!!R.pendingBranch;I&&R.deps++;const w=L.vnode.el;L.asyncDep.catch($=>{Un($,L,0)}).then($=>{if(L.isUnmounted||R.isUnmounted||R.pendingId!==L.suspenseId)return;di(),L.asyncResolved=!0;const{vnode:F}=L;Qr(L,$,!1),w&&(F.el=w);const M=!w&&L.subTree.el;O(L,F,g(w||L.subTree.el),w?null:m(L.subTree),R,l,S),M&&(F.placeholder=null,k(M)),Zl(L,F.el),I&&--R.deps===0&&R.resolve()})},unmount(L,O){R.isUnmounted=!0,R.activeBranch&&p(R.activeBranch,s,L,O),R.pendingBranch&&p(R.pendingBranch,s,L,O)}};return R}function db(e,t,s,n,a,i,l,r,o){const c=t.suspense=lp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function fb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=cu(n?s.default:s),e.ssFallback=n?cu(s.fallback):at(dt)}function cu(e){let t;if(ke(e)){const s=Ln&&e._c;s&&(e._d=!1,ci()),e=e(),s&&(e._d=!0,t=Pt,op())}return fe(e)&&(e=Jv(e)),e=Jt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function rp(e,t){t&&t.pendingBranch?fe(e)?t.effects.push(...e):t.effects.push(e):ai(e)}function ca(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Zl(n,a))}function pb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const wt=Symbol.for("v-fgt"),fn=Symbol.for("v-txt"),dt=Symbol.for("v-cmt"),An=Symbol.for("v-stc"),Za=[];let Pt=null;function ci(e=!1){Za.push(Pt=e?null:[])}function op(){Za.pop(),Pt=Za[Za.length-1]||null}let Ln=1;function ui(e,t=!1){Ln+=e,e<0&&Pt&&t&&(Pt.hasOnce=!0)}function cp(e){return e.dynamicChildren=Ln>0?Pt||na:null,op(),Ln>0&&Pt&&Pt.push(e),e}function hb(e,t,s,n,a,i){return cp(qo(e,t,s,n,a,i,!0))}function fl(e,t,s,n,a){return cp(at(e,t,s,n,a,!0))}function Qs(e){return e?e.__v_isVNode===!0:!1}function gs(e,t){return e.type===t.type&&e.key===t.key}function gb(e){}const up=({key:e})=>e??null,Ji=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Te(e)||gt(e)||ke(e)?{i:Rt,r:e,k:t,f:!!s}:e:null);function qo(e,t=null,s=null,n=0,a=null,i=e===wt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&up(t),ref:t&&Ji(t),scopeId:jl,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Rt};return r?(Go(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Te(s)?8:16),Ln>0&&!l&&Pt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Pt.push(o),o}const at=mb;function mb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Uf)&&(e=dt),Qs(e)){const r=Rs(e,t,!0);return s&&Go(r,s),Ln>0&&!i&&Pt&&(r.shapeFlag&6?Pt[Pt.indexOf(e)]=r:Pt.push(r)),r.patchFlag=-2,r}if(wb(e)&&(e=e.__vccOpts),t){t=dp(t);let{class:r,style:o}=t;r&&!Te(r)&&(t.class=xi(r)),Be(o)&&(_i(o)&&!fe(o)&&(o=Oe({},o)),t.style=yi(o))}const l=Te(e)?1:dl(e)?128:Cf(e)?64:Be(e)?4:ke(e)?2:0;return qo(e,t,s,n,a,l,i,!0)}function dp(e){return e?_i(e)||Wf(e)?Oe({},e):e:null}function Rs(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?pp(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&up(c),ref:t&&t.ref?s&&i?fe(i)?i.concat(Ji(t)):[i,Ji(t)]:Ji(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==wt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Rs(e.ssContent),ssFallback:e.ssFallback&&Rs(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Ys(u,o.clone(u)),u}function Ko(e=" ",t=0){return at(fn,null,e,t)}function vb(e,t){const s=at(An,null,e);return s.staticCount=t,s}function fp(e="",t=!1){return t?(ci(),fl(dt,null,e)):at(dt,null,e)}function Jt(e){return e==null||typeof e=="boolean"?at(dt):fe(e)?at(wt,null,e.slice()):Qs(e)?Fs(e):at(fn,null,String(e))}function Fs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Rs(e)}function Go(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(fe(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Go(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Wf(t)?t._ctx=Rt:a===3&&Rt&&(Rt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else ke(t)?(t={default:t,_ctx:Rt},s=32):(t=String(t),n&64?(s=16,t=[Ko(t)]):s=8);e.children=t,e.shapeFlag|=s}function pp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=xi([t.class,n.class]));else if(a==="style")t.style=yi([t.style,n.style]);else if(Pn(a)){const i=t[a],l=n[a];l&&i!==l&&!(fe(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Ll(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Wt(e,t,s,n=null){ss(e,t,7,[s,n])}const bb=Vf();let yb=0;function hp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||bb,i={uid:yb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new To(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Jf(n,a),emitsOptions:zf(n,a),emit:null,emitted:null,propsDefaults:Me,inheritAttrs:n.inheritAttrs,ctx:Me,data:Me,props:Me,attrs:Me,slots:Me,refs:Me,setupState:Me,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Wv.bind(null,i),e.ce&&e.ce(i),i}let At=null;const zt=()=>At||Rt;let pl,ua;{const e=Fl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};pl=t("__VUE_INSTANCE_SETTERS__",s=>At=s),ua=t("__VUE_SSR_SETTERS__",s=>On=s)}const Ca=e=>{const t=At;return pl(e),e.scope.on(),()=>{e.scope.off(),pl(t)}},di=()=>{At&&At.scope.off(),pl(null)};function gp(e){return e.vnode.shapeFlag&4}let On=!1;function mp(e,t=!1,s=!1){t&&ua(t);const{props:n,children:a}=e.vnode,i=gp(e);eb(e,n,i,t),ab(e,a,s||t);const l=i?xb(e,t):void 0;return t&&ua(!1),l}function xb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Gr);const{setup:n}=s;if(n){Zs();const a=e.setupContext=n.length>1?yp(e):null,i=Ca(e),l=Ta(n,e,0,[e.props,a]),r=So(l);if(Js(),i(),(r||e.sp)&&!Ks(e)&&Po(e),r){if(l.then(di,di),t)return l.then(o=>{Qr(e,o,t)}).catch(o=>{Un(o,e,0)});e.asyncDep=l}else Qr(e,l,t)}else bp(e,t)}function Qr(e,t,s){ke(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Be(t)&&(e.setupState=No(t)),bp(e,s)}let hl,Xr;function vp(e){hl=e,Xr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Cv))}}const _b=()=>!hl;function bp(e,t,s){const n=e.type;if(!e.render){if(!t&&hl&&!n.render){const a=n.template||Ho(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Oe(Oe({isCustomElement:i,delimiters:r},l),o);n.render=hl(a,c)}}e.render=n.render||It,Xr&&Xr(e)}{const a=Ca(e);Zs();try{Bv(e)}finally{Js(),a()}}}const kb={get(e,t){return Mt(e,"get",""),e[t]}};function yp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,kb),slots:e.slots,emit:e.emit,expose:t}}function Ti(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(No(df(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Wa)return Wa[s](e)},has(t,s){return s in t||s in Wa}})):e.proxy}function eo(e,t=!0){return ke(e)?e.displayName||e.name:e.name||t&&e.__name}function wb(e){return ke(e)&&"__vccOpts"in e}const ee=(e,t)=>Rm(e,t,On);function ha(e,t,s){try{ui(-1);const n=arguments.length;return n===2?Be(t)&&!fe(t)?Qs(t)?at(e,null,[t]):at(e,t):at(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Qs(s)&&(s=[s]),at(e,t,s))}finally{ui(1)}}function Sb(){}function Tb(e,t,s,n){const a=s[n];if(a&&xp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function xp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(kt(s[n],t[n]))return!1;return Ln>0&&Pt&&Pt.push(e),!0}const _p="3.5.38",Cb=It,Eb=$m,Ab=Qn,Rb=xf,Ib={createComponentInstance:hp,setupComponent:mp,renderComponentRoot:Zi,setCurrentRenderingInstance:li,isVNode:Qs,normalizeVNode:Jt,getComponentPublicInstance:Ti,ensureValidVNode:Bo,pushWarningContext:Dm,popWarningContext:Mm},Nb=Ib,Lb=null,Ob=null,Db=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let to;const uu=typeof window<"u"&&window.trustedTypes;if(uu)try{to=uu.createPolicy("vue",{createHTML:e=>e})}catch{}const kp=to?e=>to.createHTML(e):e=>e,Mb="http://www.w3.org/2000/svg",Pb="http://www.w3.org/1998/Math/MathML",Ps=typeof document<"u"?document:null,du=Ps&&Ps.createElement("template"),wp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?Ps.createElementNS(Mb,e):t==="mathml"?Ps.createElementNS(Pb,e):s?Ps.createElement(e,{is:s}):Ps.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>Ps.createTextNode(e),createComment:e=>Ps.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Ps.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{du.innerHTML=kp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=du.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},sn="transition",Oa="animation",ga=Symbol("_vtc"),Sp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Tp=Oe({},Mo,Sp),Fb=e=>(e.displayName="Transition",e.props=Tp,e),$b=Fb((e,{slots:t})=>ha(Rf,Cp(e),t)),yn=(e,t=[])=>{fe(e)?e.forEach(s=>s(...t)):e&&e(...t)},fu=e=>e?fe(e)?e.some(t=>t.length>1):e.length>1:!1;function Cp(e){const t={};for(const F in e)F in Sp||(t[F]=e[F]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,m=Ub(a),g=m&&m[0],k=m&&m[1],{onBeforeEnter:A,onEnter:b,onEnterCancelled:v,onLeave:x,onLeaveCancelled:R,onBeforeAppear:L=A,onAppear:O=b,onAppearCancelled:S=v}=t,I=(F,M,W,B)=>{F._enterCancelled=B,rn(F,M?u:r),rn(F,M?c:l),W&&W()},w=(F,M)=>{F._isLeaving=!1,rn(F,d),rn(F,p),rn(F,f),M&&M()},$=F=>(M,W)=>{const B=F?O:b,V=()=>I(M,F,W);yn(B,[M,V]),pu(()=>{rn(M,F?o:i),_s(M,F?u:r),fu(B)||hu(M,n,g,V)})};return Oe(t,{onBeforeEnter(F){yn(A,[F]),_s(F,i),_s(F,l)},onBeforeAppear(F){yn(L,[F]),_s(F,o),_s(F,c)},onEnter:$(!1),onAppear:$(!0),onLeave(F,M){F._isLeaving=!0;const W=()=>w(F,M);_s(F,d),F._enterCancelled?(_s(F,f),so(F)):(so(F),_s(F,f)),pu(()=>{F._isLeaving&&(rn(F,d),_s(F,p),fu(x)||hu(F,n,k,W))}),yn(x,[F,W])},onEnterCancelled(F){I(F,!1,void 0,!0),yn(v,[F])},onAppearCancelled(F){I(F,!0,void 0,!0),yn(S,[F])},onLeaveCancelled(F){w(F),yn(R,[F])}})}function Ub(e){if(e==null)return null;if(Be(e))return[xr(e.enter),xr(e.leave)];{const t=xr(e);return[t,t]}}function xr(e){return sl(e)}function _s(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ga]||(e[ga]=new Set)).add(t)}function rn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ga];s&&(s.delete(t),s.size||(e[ga]=void 0))}function pu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Bb=0;function hu(e,t,s,n){const a=e._endId=++Bb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Ep(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Ep(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${sn}Delay`),i=n(`${sn}Duration`),l=gu(a,i),r=n(`${Oa}Delay`),o=n(`${Oa}Duration`),c=gu(r,o);let u=null,d=0,f=0;t===sn?l>0&&(u=sn,d=l,f=i.length):t===Oa?c>0&&(u=Oa,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?sn:Oa:null,f=u?u===sn?i.length:o.length:0);const p=u===sn&&/\b(?:transform|all)(?:,|$)/.test(n(`${sn}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function gu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>mu(s)+mu(e[n])))}function mu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function so(e){return(e?e.ownerDocument:document).body.offsetHeight}function Hb(e,t,s){const n=e[ga];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const gl=Symbol("_vod"),Wo=Symbol("_vsh"),Ap={name:"show",beforeMount(e,{value:t},{transition:s}){e[gl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Da(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Da(e,!0),n.enter(e)):n.leave(e,()=>{Da(e,!1)}):Da(e,t))},beforeUnmount(e,{value:t}){Da(e,t)}};function Da(e,t){e.style.display=t?e[gl]:"none",e[Wo]=!t}function Vb(){Ap.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Rp=Symbol("");function jb(e){const t=zt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>ml(i,a))},n=()=>{const a=e(t.proxy);t.ce?ml(t.ce,a):no(t.subTree,a),s(a)};Fo(()=>{ai(n)}),$e(()=>{ds(n,It,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function no(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{no(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)ml(e.el,t);else if(e.type===wt)e.children.forEach(s=>no(s,t));else if(e.type===An){let{el:s,anchor:n}=e;for(;s&&(ml(s,t),s!==n);)s=s.nextSibling}}function ml(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Zg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Rp]=n}}const zb=/(?:^|;)\s*display\s*:/;function qb(e,t,s){const n=e.style,a=Te(s);let i=!1;if(s&&!a){if(t)if(Te(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&ja(n,r,"")}else for(const l in t)s[l]==null&&ja(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Gb(e,l,!Te(t)&&t?t[l]:void 0,r)||ja(n,l,r):ja(n,l,"")}}else if(a){if(t!==s){const l=n[Rp];l&&(s+=";"+l),n.cssText=s,i=zb.test(s)}}else t&&e.removeAttribute("style");gl in e&&(e[gl]=i?n.display:"",e[Wo]&&(n.display="none"))}const vu=/\s*!important$/;function ja(e,t,s){if(fe(s))s.forEach(n=>ja(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Kb(e,t);vu.test(s)?e.setProperty(Yt(n),s.replace(vu,""),"important"):e[n]=s}}const bu=["Webkit","Moz","ms"],_r={};function Kb(e,t){const s=_r[t];if(s)return s;let n=Ke(t);if(n!=="filter"&&n in e)return _r[t]=n;n=$n(n);for(let a=0;a<bu.length;a++){const i=bu[a]+n;if(i in e)return _r[t]=i}return t}function Gb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Te(n)&&s===n}const yu="http://www.w3.org/1999/xlink";function xu(e,t,s,n,a,i=Gg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(yu,t.slice(6,t.length)):e.setAttributeNS(yu,t,s):s==null||i&&!zd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":$t(s)?String(s):s)}function _u(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?kp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=zd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Hs(e,t,s,n){e.addEventListener(t,s,n)}function Wb(e,t,s,n){e.removeEventListener(t,s,n)}const ku=Symbol("_vei");function Zb(e,t,s,n,a=null){const i=e[ku]||(e[ku]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Jb(t);if(n){const c=i[t]=Xb(n,a);Hs(e,r,c,o)}else l&&(Wb(e,r,l,o),i[t]=void 0)}}const wu=/(?:Once|Passive|Capture)$/;function Jb(e){let t;if(wu.test(e)){t={};let n;for(;n=e.match(wu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Yt(e.slice(2)),t]}let kr=0;const Yb=Promise.resolve(),Qb=()=>kr||(Yb.then(()=>kr=0),kr=Date.now());function Xb(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(fe(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ss(c,t,5,r)}}else ss(a,t,5,[n])};return s.value=e,s.attached=Qb(),s}const Su=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Ip=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Hb(e,n,l):t==="style"?qb(e,s,n):Pn(t)?Ll(t)||Zb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):e0(e,t,n,l))?(_u(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&xu(e,t,n,l,i,t!=="value")):e._isVueCE&&(t0(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Te(n)))?_u(e,Ke(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),xu(e,t,n,l))};function e0(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Su(t)&&ke(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Su(t)&&Te(s)?!1:t in e}function t0(e,t){const s=e._def.props;if(!s)return!1;const n=Ke(t);return Array.isArray(s)?s.some(a=>Ke(a)===n):Object.keys(s).some(a=>Ke(a)===n)}const Tu={};function Np(e,t,s){let n=wi(e,t);Ol(n)&&(n=Oe({},n,t));class a extends Jl{constructor(l){super(n,l,s)}}return a.def=n,a}const s0=((e,t)=>Np(e,t,zp)),n0=typeof HTMLElement<"u"?HTMLElement:class{};class Jl extends n0{constructor(t,s={},n=yl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==yl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Oe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Jl){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!fe(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=sl(this._props[o])),(r||(r=Object.create(null)))[Ke(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)He(this,n)||Object.defineProperty(this,n,{get:()=>Es(s[n])})}_resolveProps(t){const{props:s}=t,n=fe(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Ke))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Tu;const a=Ke(t);s&&this._numberProps&&this._numberProps[a]&&(n=sl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Tu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Yt(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Yt(t),s+""):s||this.removeAttribute(Yt(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),jp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=at(this._def,Oe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Ol(l[0])?Oe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),Yt(i)!==i&&a(Yt(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Lp(e){const t=zt(),s=t&&t.ce;return s||null}function a0(){const e=Lp();return e&&e.shadowRoot}function i0(e="$style"){{const t=zt();if(!t)return Me;const s=t.type.__cssModules;if(!s)return Me;const n=s[e];return n||Me}}const Op=new WeakMap,Dp=new WeakMap,vl=Symbol("_moveCb"),Cu=Symbol("_enterCb"),l0=e=>(delete e.props.mode,e),r0=l0({name:"TransitionGroup",props:Oe({},Tp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=zt(),n=Do();let a,i;return Kl(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!f0(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(c0),a.forEach(u0);const r=a.filter(d0);so(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;_s(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[vl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[vl]=null,rn(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Fe(e),r=Cp(l);let o=l.tag||wt;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[Wo]&&(a.push(u),Ys(u,pa(u,r,n,s)),Op.set(u,Mp(u.el)))}i=t.default?zl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&Ys(u,pa(u,r,n,s))}return at(o,null,i)}}}),o0=r0;function c0(e){const t=e.el;t[vl]&&t[vl](),t[Cu]&&t[Cu]()}function u0(e){Dp.set(e,Mp(e.el))}function d0(e){const t=Op.get(e),s=Dp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Mp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function f0(e,t,s){const n=e.cloneNode(),a=e[ga];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Ep(n);return i.removeChild(n),l}const hn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return fe(t)?s=>la(t,s):t};function p0(e){e.target.composing=!0}function Eu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const fs=Symbol("_assign");function Au(e,t,s){return t&&(e=e.trim()),s&&(e=Pl(e)),e}const bl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[fs]=hn(a);const i=n||a.props&&a.props.type==="number";Hs(e,t?"change":"input",l=>{l.target.composing||e[fs](Au(e.value,s,i))}),(s||i)&&Hs(e,"change",()=>{e.value=Au(e.value,s,i)}),t||(Hs(e,"compositionstart",p0),Hs(e,"compositionend",Eu),Hs(e,"change",Eu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[fs]=hn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Pl(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Zo={deep:!0,created(e,t,s){e[fs]=hn(s),Hs(e,"change",()=>{const n=e._modelValue,a=ma(e),i=e.checked,l=e[fs];if(fe(n)){const r=$l(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Fn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Fp(e,i))})},mounted:Ru,beforeUpdate(e,t,s){e[fs]=hn(s),Ru(e,t,s)}};function Ru(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(fe(t))a=$l(t,n.props.value)>-1;else if(Fn(t))a=t.has(n.props.value);else{if(t===s)return;a=Ws(t,Fp(e,!0))}e.checked!==a&&(e.checked=a)}const Jo={created(e,{value:t},s){e.checked=Ws(t,s.props.value),e[fs]=hn(s),Hs(e,"change",()=>{e[fs](ma(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[fs]=hn(n),t!==s&&(e.checked=Ws(t,n.props.value))}},Pp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Fn(t);Hs(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Pl(ma(l)):ma(l));e[fs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[fs]=hn(n)},mounted(e,{value:t}){Iu(e,t)},beforeUpdate(e,t,s){e[fs]=hn(s)},updated(e,{value:t}){e._assigning||Iu(e,t)}};function Iu(e,t){const s=e.multiple,n=fe(t);if(!(s&&!n&&!Fn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ma(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=$l(t,r)>-1}else l.selected=t.has(r);else if(Ws(ma(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ma(e){return"_value"in e?e._value:e.value}function Fp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const $p={created(e,t,s){ji(e,t,s,null,"created")},mounted(e,t,s){ji(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){ji(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){ji(e,t,s,n,"updated")}};function Up(e,t){switch(e){case"SELECT":return Pp;case"TEXTAREA":return bl;default:switch(t){case"checkbox":return Zo;case"radio":return Jo;default:return bl}}}function ji(e,t,s,n,a){const l=Up(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function h0(){bl.getSSRProps=({value:e})=>({value:e}),Jo.getSSRProps=({value:e},t)=>{if(t.props&&Ws(t.props.value,e))return{checked:!0}},Zo.getSSRProps=({value:e},t)=>{if(fe(e)){if(t.props&&$l(e,t.props.value)>-1)return{checked:!0}}else if(Fn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},$p.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Up(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const g0=["ctrl","shift","alt","meta"],m0={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>g0.some(s=>e[`${s}Key`]&&!t.includes(s))},v0=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=m0[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},b0={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},y0=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=Yt(a.key);if(t.some(l=>l===i||b0[l]===i))return e(a)}))},Bp=Oe({patchProp:Ip},wp);let Ja,Nu=!1;function Hp(){return Ja||(Ja=ep(Bp))}function Vp(){return Ja=Nu?Ja:tp(Bp),Nu=!0,Ja}const jp=((...e)=>{Hp().render(...e)}),x0=((...e)=>{Vp().hydrate(...e)}),yl=((...e)=>{const t=Hp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Kp(n);if(!a)return;const i=t._component;!ke(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,qp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),zp=((...e)=>{const t=Vp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Kp(n);if(a)return s(a,!0,qp(a))},t});function qp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Kp(e){return Te(e)?document.querySelector(e):e}let Lu=!1;const _0=()=>{Lu||(Lu=!0,h0(),Vb())},k0=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Rf,BaseTransitionPropsValidators:Mo,Comment:dt,DeprecationTypes:Db,EffectScope:To,ErrorCodes:Fm,ErrorTypeStrings:Eb,Fragment:wt,KeepAlive:mv,ReactiveEffect:ti,Static:An,Suspense:ob,Teleport:Qm,Text:fn,TrackOpTypes:Im,Transition:$b,TransitionGroup:o0,TriggerOpTypes:Nm,VueElement:Jl,assertNumber:Pm,callWithAsyncErrorHandling:ss,callWithErrorHandling:Ta,camelize:Ke,capitalize:$n,cloneVNode:Rs,compatUtils:Ob,computed:ee,createApp:yl,createBlock:fl,createCommentVNode:fp,createElementBlock:hb,createElementVNode:qo,createHydrationRenderer:tp,createPropsRestProxy:$v,createRenderer:ep,createSSRApp:zp,createSlots:wv,createStaticVNode:vb,createTextVNode:Ko,createVNode:at,customRef:pf,defineAsyncComponent:hv,defineComponent:wi,defineCustomElement:Np,defineEmits:Av,defineExpose:Rv,defineModel:Lv,defineOptions:Iv,defineProps:Ev,defineSSRCustomElement:s0,defineSlots:Nv,devtools:Ab,effect:Xg,effectScope:Jg,getCurrentInstance:zt,getCurrentScope:Wd,getCurrentWatcher:Lm,getTransitionRawChildren:zl,guardReactiveProps:dp,h:ha,handleError:Un,hasInjectionContext:qm,hydrate:x0,hydrateOnIdle:ov,hydrateOnInteraction:fv,hydrateOnMediaQuery:dv,hydrateOnVisible:uv,initCustomFormatter:Sb,initDirectivesForSSR:_0,inject:us,isMemoSame:xp,isProxy:_i,isReactive:qs,isReadonly:As,isRef:gt,isRuntimeOnly:_b,isShallow:Xt,isVNode:Qs,markRaw:df,mergeDefaults:Pv,mergeModels:Fv,mergeProps:pp,nextTick:Et,nodeOps:wp,normalizeClass:xi,normalizeProps:Fg,normalizeStyle:yi,onActivated:Nf,onBeforeMount:Df,onBeforeUnmount:Gl,onBeforeUpdate:Fo,onDeactivated:Lf,onErrorCaptured:$f,onMounted:$e,onRenderTracked:Ff,onRenderTriggered:Pf,onScopeDispose:Yg,onServerPrefetch:Mf,onUnmounted:ft,onUpdated:Kl,onWatcherCleanup:gf,openBlock:ci,patchProp:Ip,popScopeId:Vm,provide:Ga,proxyRefs:No,pushScopeId:Hm,queuePostFlushCb:ai,reactive:gn,readonly:al,ref:h,registerRuntimeCompiler:vp,render:jp,renderList:kv,renderSlot:Sv,resolveComponent:yv,resolveDirective:_v,resolveDynamicComponent:xv,resolveFilter:Lb,resolveTransitionHooks:pa,setBlockTracking:ui,setDevtoolsHook:Rb,setTransitionHooks:Ys,shallowReactive:Ro,shallowReadonly:bm,shallowRef:Io,ssrContextKey:_f,ssrUtils:Nb,stop:em,toDisplayString:Kd,toHandlerKey:ia,toHandlers:Tv,toRaw:Fe,toRef:Em,toRefs:Sm,toValue:_m,transformVNodeArgs:gb,triggerRef:xm,unref:Es,useAttrs:Mv,useCssModule:i0,useCssVars:jb,useHost:Lp,useId:ev,useModel:Gv,useSSRContext:kf,useShadowRoot:a0,useSlots:Dv,useTemplateRef:tv,useTransitionState:Do,vModelCheckbox:Zo,vModelDynamic:$p,vModelRadio:Jo,vModelSelect:Pp,vModelText:bl,vShow:Ap,version:_p,warn:Cb,watch:ds,watchEffect:Km,watchPostEffect:Gm,watchSyncEffect:wf,withAsyncContext:Uv,withCtx:Oo,withDefaults:Ov,withDirectives:zm,withKeys:y0,withMemo:Tb,withModifiers:v0,withScopeId:jm},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const fi=Symbol(""),Ya=Symbol(""),Yo=Symbol(""),xl=Symbol(""),Gp=Symbol(""),Dn=Symbol(""),Wp=Symbol(""),Zp=Symbol(""),Qo=Symbol(""),Xo=Symbol(""),Ci=Symbol(""),ec=Symbol(""),Jp=Symbol(""),tc=Symbol(""),sc=Symbol(""),nc=Symbol(""),ac=Symbol(""),ic=Symbol(""),lc=Symbol(""),Yp=Symbol(""),Qp=Symbol(""),Yl=Symbol(""),_l=Symbol(""),rc=Symbol(""),oc=Symbol(""),pi=Symbol(""),Ei=Symbol(""),cc=Symbol(""),ao=Symbol(""),w0=Symbol(""),io=Symbol(""),kl=Symbol(""),S0=Symbol(""),T0=Symbol(""),uc=Symbol(""),C0=Symbol(""),E0=Symbol(""),dc=Symbol(""),Xp=Symbol(""),va={[fi]:"Fragment",[Ya]:"Teleport",[Yo]:"Suspense",[xl]:"KeepAlive",[Gp]:"BaseTransition",[Dn]:"openBlock",[Wp]:"createBlock",[Zp]:"createElementBlock",[Qo]:"createVNode",[Xo]:"createElementVNode",[Ci]:"createCommentVNode",[ec]:"createTextVNode",[Jp]:"createStaticVNode",[tc]:"resolveComponent",[sc]:"resolveDynamicComponent",[nc]:"resolveDirective",[ac]:"resolveFilter",[ic]:"withDirectives",[lc]:"renderList",[Yp]:"renderSlot",[Qp]:"createSlots",[Yl]:"toDisplayString",[_l]:"mergeProps",[rc]:"normalizeClass",[oc]:"normalizeStyle",[pi]:"normalizeProps",[Ei]:"guardReactiveProps",[cc]:"toHandlers",[ao]:"camelize",[w0]:"capitalize",[io]:"toHandlerKey",[kl]:"setBlockTracking",[S0]:"pushScopeId",[T0]:"popScopeId",[uc]:"withCtx",[C0]:"unref",[E0]:"isRef",[dc]:"withMemo",[Xp]:"isMemoSame"};function A0(e){Object.getOwnPropertySymbols(e).forEach(t=>{va[t]=e[t]})}const is={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function R0(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:is}}function hi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=is){return e&&(r?(e.helper(Dn),e.helper(xa(e.inSSR,c))):e.helper(ya(e.inSSR,c)),l&&e.helper(ic)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function Rn(e,t=is){return{type:17,loc:t,elements:e}}function cs(e,t=is){return{type:15,loc:t,properties:e}}function ht(e,t){return{type:16,loc:is,key:Te(e)?Ae(e,!0):e,value:t}}function Ae(e,t=!1,s=is,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function vs(e,t=is){return{type:8,loc:t,children:e}}function xt(e,t=[],s=is){return{type:14,loc:s,callee:e,arguments:t}}function ba(e,t=void 0,s=!1,n=!1,a=is){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function lo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:is}}function I0(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:is}}function N0(e){return{type:21,body:e,loc:is}}function ya(e,t){return e||t?Qo:Xo}function xa(e,t){return e||t?Wp:Zp}function fc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ya(n,e.isComponent)),t(Dn),t(xa(n,e.isComponent)))}const Ou=new Uint8Array([123,123]),Du=new Uint8Array([125,125]);function Mu(e){return e>=97&&e<=122||e>=65&&e<=90}function es(e){return e===32||e===10||e===9||e===12||e===13}function nn(e){return e===47||e===62||es(e)}function wl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Lt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class L0{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Ou,this.delimiterClose=Du,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Ou,this.delimiterClose=Du}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?nn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Lt.TitleEnd||this.currentSequence===Lt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Lt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Lt.Cdata.length&&(this.state=28,this.currentSequence=Lt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Lt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Mu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){nn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(nn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(wl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Mu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||nn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||nn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||nn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||nn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||nn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Lt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Lt.ScriptEnd[3]?this.startSpecial(Lt.ScriptEnd,4):t===Lt.StyleEnd[3]?this.startSpecial(Lt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Lt.TitleEnd[3]?this.startSpecial(Lt.TitleEnd,4):t===Lt.TextareaEnd[3]?this.startSpecial(Lt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Lt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Pu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function In(e,t){const s=Pu("MODE",t),n=Pu(e,t);return s===3?n===!0:n!==!1}function gi(e,t,s,...n){return In(e,t)}function pc(e){throw e}function eh(e){}function tt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const Qt=e=>e.type===4&&e.isStatic;function th(e){switch(e){case"Teleport":case"teleport":return Ya;case"Suspense":case"suspense":return Yo;case"KeepAlive":case"keep-alive":return xl;case"BaseTransition":case"base-transition":return Gp}}const O0=/^$|^\d|[^\$\w\xA0-\uFFFF]/,hc=e=>!O0.test(e),sh=/[A-Za-z_$\xA0-\uFFFF]/,D0=/[\.\?\w$\xA0-\uFFFF]/,M0=/\s+[.[]\s*|\s*[.[]\s+/g,nh=e=>e.type===4?e.content:e.loc.source,P0=e=>{const t=nh(e).trim().replace(M0,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?sh:D0).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},ah=P0,F0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,$0=e=>F0.test(nh(e)),U0=$0;function os(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Te(t)?a.name===t:t.test(a.name)))return a}}function Ql(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&wn(i.arg,t))return i}}function wn(e,t){return!!(e&&Qt(e)&&e.content===t)}function B0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function wr(e){return e.type===5||e.type===2}function Fu(e){return e.type===7&&e.name==="pre"}function H0(e){return e.type===7&&e.name==="slot"}function Sl(e){return e.type===1&&e.tagType===3}function Tl(e){return e.type===1&&e.tagType===2}const V0=new Set([pi,Ei]);function ih(e,t=[]){if(e&&!Te(e)&&e.type===14){const s=e.callee;if(!Te(s)&&V0.has(s))return ih(e.arguments[0],t.concat(e))}return[e,t]}function Cl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Te(a)&&a.type===14){const r=ih(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Te(a))n=cs([t]);else if(a.type===14){const r=a.arguments[0];!Te(r)&&r.type===15?$u(t,r)||r.properties.unshift(t):a.callee===cc?n=xt(s.helper(_l),[cs([t]),a]):a.arguments.unshift(cs([t])),!n&&(n=a)}else a.type===15?($u(t,a)||a.properties.unshift(t),n=a):(n=xt(s.helper(_l),[cs([t]),a]),l&&l.callee===Ei&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function $u(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function mi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function j0(e){return e.type===14&&e.callee===dc?e.arguments[1].returns:e}const z0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function lh(e){for(let t=0;t<e.length;t++)if(!es(e.charCodeAt(t)))return!1;return!0}function gc(e){return e.type===2&&lh(e.content)||e.type===12&&gc(e.content)}function rh(e){return e.type===3||gc(e)}const oh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ta,isPreTag:ta,isIgnoreNewlineTag:ta,isCustomElement:ta,onError:pc,onWarn:eh,comments:!1,prefixIdentifiers:!1};let Ue=oh,vi=null,Gs="",Dt=null,Pe=null,Gt="",Ms=-1,_n=-1,mc=0,un=!1,ro=null;const et=[],ot=new L0(et,{onerr:Ls,ontext(e,t){zi(Ct(e,t),e,t)},ontextentity(e,t,s){zi(e,t,s)},oninterpolation(e,t){if(un)return zi(Ct(e,t),e,t);let s=e+ot.delimiterOpen.length,n=t-ot.delimiterClose.length;for(;es(Gs.charCodeAt(s));)s++;for(;es(Gs.charCodeAt(n-1));)n--;let a=Ct(s,n);a.includes("&")&&(a=Ue.decodeEntities(a,!1)),oo({type:5,content:Qi(a,!1,ut(s,n)),loc:ut(e,t)})},onopentagname(e,t){const s=Ct(e,t);Dt={type:1,tag:s,ns:Ue.getNamespace(s,et[0],Ue.ns),tagType:0,props:[],children:[],loc:ut(e-1,t),codegenNode:void 0}},onopentagend(e){Bu(e)},onclosetag(e,t){const s=Ct(e,t);if(!Ue.isVoidTag(s)){let n=!1;for(let a=0;a<et.length;a++)if(et[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ls(24,et[0].loc.start.offset);for(let l=0;l<=a;l++){const r=et.shift();Yi(r,t,l<a)}break}n||Ls(23,ch(e,60))}},onselfclosingtag(e){const t=Dt.tag;Dt.isSelfClosing=!0,Bu(e),et[0]&&et[0].tag===t&&Yi(et.shift(),e)},onattribname(e,t){Pe={type:6,name:Ct(e,t),nameLoc:ut(e,t),value:void 0,loc:ut(e)}},ondirname(e,t){const s=Ct(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!un&&n===""&&Ls(26,e),un||n==="")Pe={type:6,name:s,nameLoc:ut(e,t),value:void 0,loc:ut(e)};else if(Pe={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ae("prop")]:[],loc:ut(e)},n==="pre"){un=ot.inVPre=!0,ro=Dt;const a=Dt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=ey(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ct(e,t);if(un&&!Fu(Pe))Pe.name+=s,Sn(Pe.nameLoc,t);else{const n=s[0]!=="[";Pe.arg=Qi(n?s:s.slice(1,-1),n,ut(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ct(e,t);if(un&&!Fu(Pe))Pe.name+="."+s,Sn(Pe.nameLoc,t);else if(Pe.name==="slot"){const n=Pe.arg;n&&(n.content+="."+s,Sn(n.loc,t))}else{const n=Ae(s,!0,ut(e,t));Pe.modifiers.push(n)}},onattribdata(e,t){Gt+=Ct(e,t),Ms<0&&(Ms=e),_n=t},onattribentity(e,t,s){Gt+=e,Ms<0&&(Ms=t),_n=s},onattribnameend(e){const t=Pe.loc.start.offset,s=Ct(t,e);Pe.type===7&&(Pe.rawName=s),Dt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ls(2,t)},onattribend(e,t){if(Dt&&Pe){if(Sn(Pe.loc,t),e!==0)if(Gt.includes("&")&&(Gt=Ue.decodeEntities(Gt,!0)),Pe.type===6)Pe.name==="class"&&(Gt=dh(Gt).trim()),e===1&&!Gt&&Ls(13,t),Pe.value={type:2,content:Gt,loc:e===1?ut(Ms,_n):ut(Ms-1,_n+1)},ot.inSFCRoot&&Dt.tag==="template"&&Pe.name==="lang"&&Gt&&Gt!=="html"&&ot.enterRCDATA(wl("</template"),0);else{let s=0;Pe.exp=Qi(Gt,!1,ut(Ms,_n),0,s),Pe.name==="for"&&(Pe.forParseResult=K0(Pe.exp));let n=-1;Pe.name==="bind"&&(n=Pe.modifiers.findIndex(a=>a.content==="sync"))>-1&&gi("COMPILER_V_BIND_SYNC",Ue,Pe.loc,Pe.arg.loc.source)&&(Pe.name="model",Pe.modifiers.splice(n,1))}(Pe.type!==7||Pe.name!=="pre")&&Dt.props.push(Pe)}Gt="",Ms=_n=-1},oncomment(e,t){Ue.comments&&oo({type:3,content:Ct(e,t),loc:ut(e-4,t+3)})},onend(){const e=Gs.length;for(let t=0;t<et.length;t++)Yi(et[t],e-1),Ls(24,et[t].loc.start.offset)},oncdata(e,t){(et[0]?et[0].ns:Ue.ns)!==0?zi(Ct(e,t),e,t):Ls(1,e-9)},onprocessinginstruction(e){(et[0]?et[0].ns:Ue.ns)===0&&Ls(21,e-1)}}),Uu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,q0=/^\(|\)$/g;function K0(e){const t=e.loc,s=e.content,n=s.match(z0);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const m=t.start.offset+f,g=m+d.length;return Qi(d,!1,ut(m,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(q0,"").trim();const c=a.indexOf(o),u=o.match(Uu);if(u){o=o.replace(Uu,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ct(e,t){return Gs.slice(e,t)}function Bu(e){ot.inSFCRoot&&(Dt.innerLoc=ut(e+1,e+1)),oo(Dt);const{tag:t,ns:s}=Dt;s===0&&Ue.isPreTag(t)&&mc++,Ue.isVoidTag(t)?Yi(Dt,e):(et.unshift(Dt),(s===1||s===2)&&(ot.inXML=!0)),Dt=null}function zi(e,t,s){{const i=et[0]&&et[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ue.decodeEntities(e,!1))}const n=et[0]||vi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Sn(a.loc,s)):n.children.push({type:2,content:e,loc:ut(t,s)})}function Yi(e,t,s=!1){s?Sn(e.loc,ch(t,60)):Sn(e.loc,G0(t,62)+1),ot.inSFCRoot&&(e.children.length?e.innerLoc.end=Oe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Oe({},e.innerLoc.start),e.innerLoc.source=Ct(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(un||(n==="slot"?e.tagType=2:Hu(e)?e.tagType=3:Z0(e)&&(e.tagType=1)),ot.inRCDATA||(e.children=uh(i)),a===0&&Ue.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ue.isPreTag(n)&&mc--,ro===e&&(un=ot.inVPre=!1,ro=null),ot.inXML&&(et[0]?et[0].ns:Ue.ns)===0&&(ot.inXML=!1);{const l=e.props;if(!ot.inSFCRoot&&In("COMPILER_NATIVE_TEMPLATE",Ue)&&e.tag==="template"&&!Hu(e)){const o=et[0]||vi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&gi("COMPILER_INLINE_TEMPLATE",Ue,r.loc)&&e.children.length&&(r.value={type:2,content:Ct(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function G0(e,t){let s=e;for(;Gs.charCodeAt(s)!==t&&s<Gs.length-1;)s++;return s}function ch(e,t){let s=e;for(;Gs.charCodeAt(s)!==t&&s>=0;)s--;return s}const W0=new Set(["if","else","else-if","for","slot"]);function Hu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&W0.has(t[s].name))return!0}return!1}function Z0({tag:e,props:t}){if(Ue.isCustomElement(e))return!1;if(e==="component"||J0(e.charCodeAt(0))||th(e)||Ue.isBuiltInComponent&&Ue.isBuiltInComponent(e)||Ue.isNativeTag&&!Ue.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(gi("COMPILER_IS_ON_ELEMENT",Ue,n.loc))return!0}}else if(n.name==="bind"&&wn(n.arg,"is")&&gi("COMPILER_IS_ON_ELEMENT",Ue,n.loc))return!0}return!1}function J0(e){return e>64&&e<91}const Y0=/\r\n/g;function uh(e){const t=Ue.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(mc)a.content=a.content.replace(Y0,`
`);else if(lh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Q0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=dh(a.content))}return s?e.filter(Boolean):e}function Q0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function dh(e){let t="",s=!1;for(let n=0;n<e.length;n++)es(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function oo(e){(et[0]||vi).children.push(e)}function ut(e,t){return{start:ot.getPos(e),end:t==null?t:ot.getPos(t),source:t==null?t:Ct(e,t)}}function X0(e){return ut(e.start.offset,e.end.offset)}function Sn(e,t){e.end=ot.getPos(t),e.source=Ct(e.start.offset,t)}function ey(e){const t={type:6,name:e.rawName,nameLoc:ut(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Qi(e,t=!1,s,n=0,a=0){return Ae(e,t,s,n)}function Ls(e,t,s){Ue.onError(tt(e,ut(t,t)))}function ty(){ot.reset(),Dt=null,Pe=null,Gt="",Ms=-1,_n=-1,et.length=0}function sy(e,t){if(ty(),Gs=e,Ue=Oe({},oh),t){let a;for(a in t)t[a]!=null&&(Ue[a]=t[a])}ot.mode=Ue.parseMode==="html"?1:Ue.parseMode==="sfc"?2:0,ot.inXML=Ue.ns===1||Ue.ns===2;const s=t&&t.delimiters;s&&(ot.delimiterOpen=wl(s[0]),ot.delimiterClose=wl(s[1]));const n=vi=R0([],e);return ot.parse(Gs),n.loc=ut(0,e.length),n.children=uh(n.children),vi=null,n}function ny(e,t){Xi(e,void 0,t,!!fh(e))}function fh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Tl(t[0])?t[0]:null}function Xi(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:ts(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const m=p.patchFlag;if((m===void 0||m===512||m===1)&&hh(d,s)>=2){const g=gh(d);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:ts(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,Xi(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)Xi(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)Xi(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&fe(e.codegenNode.children))e.codegenNode.children=o(Rn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!fe(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(Rn(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!fe(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=os(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(Rn(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!fe(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ts(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=hh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ts(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=ts(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(Dn),t.removeHelper(xa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ya(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ts(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Te(r)||$t(r))continue;const o=ts(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const ay=new Set([rc,oc,pi,Ei]);function ph(e,t){if(e.type===14&&!Te(e.callee)&&ay.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ts(s,t);if(s.type===14)return ph(s,t)}return 0}function hh(e,t){let s=3;const n=gh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ts(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ts(r,t):r.type===14?c=ph(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function gh(e){const t=e.codegenNode;if(t.type===13)return t.props}function iy(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=It,isCustomElement:u=It,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:m=!1,inSSR:g=!1,ssrCssVars:k="",bindingMetadata:A=Me,inline:b=!1,isTS:v=!1,onError:x=pc,onWarn:R=eh,compatConfig:L}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),S={filename:t,selfName:O&&$n(Ke(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:m,inSSR:g,ssrCssVars:k,bindingMetadata:A,inline:b,isTS:v,onError:x,onWarn:R,compatConfig:L,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(I){const w=S.helpers.get(I)||0;return S.helpers.set(I,w+1),I},removeHelper(I){const w=S.helpers.get(I);if(w){const $=w-1;$?S.helpers.set(I,$):S.helpers.delete(I)}},helperString(I){return`_${va[S.helper(I)]}`},replaceNode(I){S.parent.children[S.childIndex]=S.currentNode=I},removeNode(I){const w=S.parent.children,$=I?w.indexOf(I):S.currentNode?S.childIndex:-1;!I||I===S.currentNode?(S.currentNode=null,S.onNodeRemoved()):S.childIndex>$&&(S.childIndex--,S.onNodeRemoved()),S.parent.children.splice($,1)},onNodeRemoved:It,addIdentifiers(I){},removeIdentifiers(I){},hoist(I){Te(I)&&(I=Ae(I)),S.hoists.push(I);const w=Ae(`_hoisted_${S.hoists.length}`,!1,I.loc,2);return w.hoisted=I,w},cache(I,w=!1,$=!1){const F=I0(S.cached.length,I,w,$);return S.cached.push(F),F}};return S.filters=new Set,S}function ly(e,t){const s=iy(e,t);Xl(e,s),t.hoistStatic&&ny(e,s),t.ssr||ry(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function ry(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=fh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&fc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=hi(t,s(fi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function oy(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Te(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Xl(a,t))}}function Xl(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(fe(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Ci);break;case 5:t.ssr||t.helper(Yl);break;case 9:for(let i=0;i<e.branches.length;i++)Xl(e.branches[i],t);break;case 10:case 11:case 1:case 0:oy(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function mh(e,t){const s=Te(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(H0))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const er="/*@__PURE__*/",vh=e=>`${va[e]}: _${va[e]}`;function cy(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${va[g]}`},push(g,k=-2,A){p.code+=g},indent(){m(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:m(--p.indentLevel)},newline(){m(p.indentLevel)}};function m(g){p.push(`
`+"  ".repeat(g),0)}return p}function uy(e,t={}){const s=cy(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";dy(e,s);const g=u?"ssrRender":"render",A=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${A}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(vh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Sr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Sr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Sr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let b=0;b<e.temps;b++)a(`${b>0?", ":""}_temp${b}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?Ft(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function dy(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[Qo,Xo,Ci,ec,Jp].filter(f=>u.includes(f)).map(vh).join(", ");a(`const { ${d} } = _Vue
`,-1)}fy(e.hoists,t),i(),a("return ")}function Sr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?ac:t==="component"?tc:nc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${mi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function fy(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Ft(i,t),n())}t.pure=!1}function vc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ai(e,t,s),s&&t.deindent(),t.push("]")}function Ai(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Te(r)?a(r,-3):fe(r)?vc(r,t):Ft(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Ft(e,t){if(Te(e)){t.push(e,-3);return}if($t(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Ft(e.codegenNode,t);break;case 2:py(e,t);break;case 4:bh(e,t);break;case 5:hy(e,t);break;case 12:Ft(e.codegenNode,t);break;case 8:yh(e,t);break;case 3:my(e,t);break;case 13:vy(e,t);break;case 14:yy(e,t);break;case 15:xy(e,t);break;case 17:_y(e,t);break;case 18:ky(e,t);break;case 19:wy(e,t);break;case 20:Sy(e,t);break;case 21:Ai(e.body,t,!0,!1);break}}function py(e,t){t.push(JSON.stringify(e.content),-3,e)}function bh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function hy(e,t){const{push:s,helper:n,pure:a}=t;a&&s(er),s(`${n(Yl)}(`),Ft(e.content,t),s(")")}function yh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Te(n)?t.push(n,-3):Ft(n,t)}}function gy(e,t){const{push:s}=t;if(e.type===8)s("["),yh(e,t),s("]");else if(e.isStatic){const n=hc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function my(e,t){const{push:s,helper:n,pure:a}=t;a&&s(er),s(`${n(Ci)}(${JSON.stringify(e.content)})`,-3,e)}function vy(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let m;o&&(m=String(o)),u&&s(n(ic)+"("),d&&s(`(${n(Dn)}(${f?"true":""}), `),a&&s(er);const g=d?xa(t.inSSR,p):ya(t.inSSR,p);s(n(g)+"(",-2,e),Ai(by([i,l,r,m,c]),t),s(")"),d&&s(")"),u&&(s(", "),Ft(u,t),s(")"))}function by(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function yy(e,t){const{push:s,helper:n,pure:a}=t,i=Te(e.callee)?e.callee:n(e.callee);a&&s(er),s(i+"(",-2,e),Ai(e.arguments,t),s(")")}function xy(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];gy(c,t),s(": "),Ft(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function _y(e,t){vc(e.elements,t)}function ky(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${va[uc]}(`),s("(",-2,e),fe(i)?Ai(i,t):i&&Ft(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),fe(l)?vc(l,t):Ft(l,t)):r&&Ft(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function wy(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!hc(s.content);d&&l("("),bh(s,t),d&&l(")")}else l("("),Ft(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Ft(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,Ft(a,t),u||t.indentLevel--,i&&o(!0)}function Sy(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(kl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Ft(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(kl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Ty=mh(/^(?:if|else|else-if)$/,(e,t,s)=>Cy(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=ju(a,o,s);else{const c=Ey(n.codegenNode);c.alternate=ju(a,o+n.branches.length-1,s)}}}));function Cy(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(tt(28,t.loc)),t.exp=Ae("true",!1,a)}if(t.name==="if"){const a=Vu(e,t),i={type:9,loc:X0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&rh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(tt(30,e.loc)),s.removeNode();const r=Vu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Xl(r,s),o&&o(),s.currentNode=null}else s.onError(tt(30,e.loc));break}}}function Vu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!os(e,"for")?e.children:[e],userKey:Ql(e,"key"),isTemplateIf:s}}function ju(e,t,s){return e.condition?lo(e.condition,zu(e,t,s),xt(s.helper(Ci),['""',"true"])):zu(e,t,s)}function zu(e,t,s){const{helper:n}=s,a=ht("key",Ae(`${t}`,!1,is,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Cl(o,a,s),o}else return hi(s,n(fi),cs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=j0(o);return c.type===13&&fc(c,s),Cl(c,a,s),o}}function Ey(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Ay=mh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Ry(e,t,s,i=>{const l=xt(n(lc),[i.source]),r=Sl(e),o=os(e,"memo"),c=Ql(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Ae(c.value.content,!0):void 0:c.exp);const d=u?ht("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=hi(s,n(fi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let m;const{children:g}=i,k=g.length!==1||g[0].type!==1,A=Tl(e)?e:r&&e.children.length===1&&Tl(e.children[0])?e.children[0]:null;if(A?(m=A.codegenNode,r&&d&&Cl(m,d,s)):k?m=hi(s,n(fi),d?cs([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=g[0].codegenNode,r&&d&&Cl(m,d,s),m.isBlock!==!f&&(m.isBlock?(a(Dn),a(xa(s.inSSR,m.isComponent))):a(ya(s.inSSR,m.isComponent))),m.isBlock=!f,m.isBlock?(n(Dn),n(xa(s.inSSR,m.isComponent))):n(ya(s.inSSR,m.isComponent))),o){const b=ba(co(i.parseResult,[Ae("_cached")]));b.body=N0([vs(["const _memo = (",o.exp,")"]),vs(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(Xp)}(_cached, _memo)) return _cached`]),vs(["const _item = ",m]),Ae("_item.memo = _memo"),Ae("return _item")]),l.arguments.push(b,Ae("_cache"),Ae(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ba(co(i.parseResult),m,!0))}})});function Ry(e,t,s,n){if(!t.exp){s.onError(tt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(tt(32,t.loc));return}xh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:Sl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function xh(e,t){e.finalized||(e.finalized=!0)}function co({value:e,key:t,index:s},n=[]){return Iy([e,t,s,...n])}function Iy(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ae("_".repeat(n+1),!1))}const qu=Ae("undefined",!1),Ny=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=os(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Ly=(e,t,s,n)=>ba(e,s,!1,!0,s.length?s[0].loc:n);function Oy(e,t,s=Ly){t.helper(uc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=os(e,"slot",!0);if(o){const{arg:k,exp:A}=o;k&&!Qt(k)&&(r=!0),i.push(ht(k||Ae("default",!0),s(A,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let k=0;k<n.length;k++){const A=n[k];let b;if(!Sl(A)||!(b=os(A,"slot",!0))){A.type!==3&&d.push(A);continue}if(o){t.onError(tt(37,b.loc));break}c=!0;const{children:v,loc:x}=A,{arg:R=Ae("default",!0),exp:L,loc:O}=b;let S;Qt(R)?S=R?R.content:"default":r=!0;const I=os(A,"for"),w=s(L,I,v,x);let $,F;if($=os(A,"if"))r=!0,l.push(lo($.exp,qi(R,w,p++),qu));else if(F=os(A,/^else(?:-if)?$/,!0)){let M=k,W;for(;M--&&(W=n[M],!!rh(W)););if(W&&Sl(W)&&os(W,/^(?:else-)?if$/)){let B=l[l.length-1];for(;B.alternate.type===19;)B=B.alternate;B.alternate=F.exp?lo(F.exp,qi(R,w,p++),qu):qi(R,w,p++)}else t.onError(tt(30,F.loc))}else if(I){r=!0;const M=I.forParseResult;M?(xh(M),l.push(xt(t.helper(lc),[M.source,ba(co(M),qi(R,w),!0)]))):t.onError(tt(32,I.loc))}else{if(S){if(f.has(S)){t.onError(tt(38,O));continue}f.add(S),S==="default"&&(u=!0)}i.push(ht(R,w))}}if(!o){const k=(A,b)=>{const v=s(A,void 0,b,a);return t.compatConfig&&(v.isNonScopedSlot=!0),ht("default",v)};c?d.length&&!d.every(gc)&&(u?t.onError(tt(39,d[0].loc)):i.push(k(void 0,d))):i.push(k(void 0,n))}const m=r?2:el(e.children)?3:1;let g=cs(i.concat(ht("_",Ae(m+"",!1))),a);return l.length&&(g=xt(t.helper(Qp),[g,Rn(l)])),{slots:g,hasDynamicSlots:r}}function qi(e,t,s){const n=[ht("name",e),ht("fn",t)];return s!=null&&n.push(ht("key",Ae(String(s),!0))),cs(n)}function el(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||el(s.children))return!0;break;case 9:if(el(s.branches))return!0;break;case 10:case 11:if(el(s.children))return!0;break}}return!1}const _h=new WeakMap,Dy=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?My(e,t):`"${n}"`;const r=Be(l)&&l.callee===sc;let o,c,u=0,d,f,p,m=r||l===Ya||l===Yo||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=kh(e,t,void 0,i,r);o=g.props,u=g.patchFlag,f=g.dynamicPropNames;const k=g.directives;p=k&&k.length?Rn(k.map(A=>Fy(A,t))):void 0,g.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===xl&&(m=!0,u|=1024),i&&l!==Ya&&l!==xl){const{slots:k,hasDynamicSlots:A}=Oy(e,t);c=k,A&&(u|=1024)}else if(e.children.length===1&&l!==Ya){const k=e.children[0],A=k.type,b=A===5||A===8;b&&ts(k,t)===0&&(u|=1),b||A===2?c=k:c=e.children}else c=e.children;f&&f.length&&(d=$y(f)),e.codegenNode=hi(t,l,o,c,u===0?void 0:u,d,p,!!m,!1,i,e.loc)};function My(e,t,s=!1){let{tag:n}=e;const a=uo(n),i=Ql(e,"is",!1,!0);if(i)if(a||In("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ae(i.value.content,!0):(r=i.exp,r||(r=Ae("is",!1,i.arg.loc))),r)return xt(t.helper(sc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=th(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(tc),t.components.add(n),mi(n,"component"))}function kh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,m=0,g=!1,k=!1,A=!1,b=!1,v=!1,x=!1;const R=[],L=w=>{c.length&&(u.push(cs(Ku(c),r)),c=[]),w&&u.push(w)},O=()=>{t.scopes.vFor>0&&c.push(ht(Ae("ref_for",!0),Ae("true")))},S=({key:w,value:$})=>{if(Qt(w)){const F=w.content,M=Pn(F);if(M&&(!n||a)&&F.toLowerCase()!=="onclick"&&F!=="onUpdate:modelValue"&&!zs(F)&&(b=!0),M&&zs(F)&&(x=!0),M&&$.type===14&&($=$.arguments[0]),$.type===20||($.type===4||$.type===8)&&ts($,t)>0)return;F==="ref"?g=!0:F==="class"?k=!0:F==="style"?A=!0:F!=="key"&&!R.includes(F)&&R.push(F),n&&(F==="class"||F==="style")&&!R.includes(F)&&R.push(F)}else v=!0};for(let w=0;w<s.length;w++){const $=s[w];if($.type===6){const{loc:F,name:M,nameLoc:W,value:B}=$;let V=!0;if(M==="ref"&&(g=!0,O()),M==="is"&&(uo(l)||B&&B.content.startsWith("vue:")||In("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(ht(Ae(M,!0,W),Ae(B?B.content:"",V,B?B.loc:F)))}else{const{name:F,arg:M,exp:W,loc:B,modifiers:V}=$,N=F==="bind",D=F==="on";if(F==="slot"){n||t.onError(tt(40,B));continue}if(F==="once"||F==="memo"||F==="is"||N&&wn(M,"is")&&(uo(l)||In("COMPILER_IS_ON_ELEMENT",t))||D&&i)continue;if((N&&wn(M,"key")||D&&f&&wn(M,"vue:before-update"))&&(p=!0),N&&wn(M,"ref")&&O(),!M&&(N||D)){if(v=!0,W)if(N){if(L(),In("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift(W);continue}O(),L(),u.push(W)}else L({type:14,loc:B,callee:t.helper(cc),arguments:n?[W]:[W,"true"]});else t.onError(tt(N?34:35,B));continue}N&&V.some(ue=>ue.content==="prop")&&(m|=32);const q=t.directiveTransforms[F];if(q){const{props:ue,needRuntime:ve}=q($,e,t);!i&&ue.forEach(S),D&&M&&!Qt(M)?L(cs(ue,r)):c.push(...ue),ve&&(d.push($),$t(ve)&&_h.set($,ve))}else Ag(F)||(d.push($),f&&(p=!0))}}let I;if(u.length?(L(),u.length>1?I=xt(t.helper(_l),u,r):I=u[0]):c.length&&(I=cs(Ku(c),r)),v?m|=16:(k&&!n&&(m|=2),A&&!n&&(m|=4),R.length&&(m|=8),b&&(m|=32)),!p&&(m===0||m===32)&&(g||x||d.length>0)&&(m|=512),!t.inSSR&&I)switch(I.type){case 15:let w=-1,$=-1,F=!1;for(let B=0;B<I.properties.length;B++){const V=I.properties[B].key;Qt(V)?V.content==="class"?w=B:V.content==="style"&&($=B):V.isHandlerKey||(F=!0)}const M=I.properties[w],W=I.properties[$];F?I=xt(t.helper(pi),[I]):(M&&!Qt(M.value)&&(M.value=xt(t.helper(rc),[M.value])),W&&(A||W.value.type===4&&W.value.content.trim()[0]==="["||W.value.type===17)&&(W.value=xt(t.helper(oc),[W.value])));break;case 14:break;default:I=xt(t.helper(pi),[xt(t.helper(Ei),[I])]);break}return{props:I,directives:d,patchFlag:m,dynamicPropNames:R,shouldUseBlock:p}}function Ku(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Pn(i))&&Py(l,a):(t.set(i,a),s.push(a))}return s}function Py(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Rn([e.value,t.value],e.loc)}function Fy(e,t){const s=[],n=_h.get(e);n?s.push(t.helperString(n)):(t.helper(nc),t.directives.add(e.name),s.push(mi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ae("true",!1,a);s.push(cs(e.modifiers.map(l=>ht(l,i)),a))}return Rn(s,e.loc)}function $y(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function uo(e){return e==="component"||e==="Component"}const Uy=(e,t)=>{if(Tl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=By(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ba([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=xt(t.helper(Yp),l,n)}};function By(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Ke(l.name),a.push(l)));else if(l.name==="bind"&&wn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Ke(l.arg.content);s=l.exp=Ae(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Qt(l.arg)&&(l.arg.content=Ke(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=kh(e,t,a,!1,!1);n=i,l.length&&t.onError(tt(36,l[0].loc))}return{slotName:s,slotProps:n}}const wh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(tt(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?ia(Ke(d)):`on:${d}`;r=Ae(f,!0,l.loc)}else r=vs([`${s.helperString(io)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(io)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=ah(o),f=!(d||U0(o)),p=o.content.includes(";");(f||c&&d)&&(o=vs([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[ht(r,o||Ae("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},Hy=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Ke(i.content):i.content=`${s.helperString(ao)}(${i.content})`:(i.children.unshift(`${s.helperString(ao)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Gu(i,"."),n.some(r=>r.content==="attr")&&Gu(i,"^")),{props:[ht(i,l)]}},Gu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Vy=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(wr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(wr(o))n||(n=s[i]=vs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(wr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ts(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:xt(t.helper(ec),r)}}}}},Wu=new WeakSet,jy=(e,t)=>{if(e.type===1&&os(e,"once",!0))return Wu.has(e)||t.inVOnce||t.inSSR?void 0:(Wu.add(e),t.inVOnce=!0,t.helper(kl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Sh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(tt(41,e.loc)),Ma();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(tt(44,n.loc)),Ma();if(r==="literal-const"||r==="setup-const")return s.onError(tt(45,n.loc)),Ma();if(!l.trim()||!ah(n))return s.onError(tt(42,n.loc)),Ma();const o=a||Ae("modelValue",!0),c=a?Qt(a)?`onUpdate:${Ke(a.content)}`:vs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=vs([`${d} => ((`,n,") = $event)"]);const f=[ht(o,e.exp),ht(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(hc(g)?g:JSON.stringify(g))+": true").join(", "),m=a?Qt(a)?`${a.content}Modifiers`:vs([a,' + "Modifiers"']):"modelModifiers";f.push(ht(m,Ae(`{ ${p} }`,!1,e.loc,2)))}return Ma(f)};function Ma(e=[]){return{props:e}}const zy=/[\w).+\-_$\]]/,qy=(e,t)=>{In("COMPILER_FILTERS",t)&&(e.type===5?El(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&El(s.exp,t)}))};function El(e,t){if(e.type===4)Zu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Zu(n,t):n.type===8?El(e,t):n.type===5&&El(n.content,t))}}function Zu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,m,g=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)m===void 0?(u=p+1,m=s.slice(0,p).trim()):k();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let A=p-1,b;for(;A>=0&&(b=s.charAt(A),b===" ");A--);(!b||!zy.test(b))&&(l=!0)}}m===void 0?m=s.slice(0,p).trim():u!==0&&k();function k(){g.push(s.slice(u,p).trim()),u=p+1}if(g.length){for(p=0;p<g.length;p++)m=Ky(m,g[p],t);e.content=m,e.ast=void 0}}function Ky(e,t,s){s.helper(ac);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${mi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${mi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const Ju=new WeakSet,Gy=(e,t)=>{if(e.type===1){const s=os(e,"memo");return!s||Ju.has(e)||t.inSSR?void 0:(Ju.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&fc(n,t),e.codegenNode=xt(t.helper(dc),[s.exp,ba(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},Wy=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(tt(53,n.loc)),s.exp=Ae("",!0,n.loc);else{const a=Ke(n.content);(sh.test(a[0])||a[0]==="-")&&(s.exp=Ae(a,!1,n.loc))}}}};function Zy(e){return[[Wy,jy,Ty,Gy,Ay,qy,Uy,Dy,Ny,Vy],{on:wh,bind:Hy,model:Sh}]}function Jy(e,t={}){const s=t.onError||pc,n=t.mode==="module";t.prefixIdentifiers===!0?s(tt(48)):n&&s(tt(49));const a=!1;t.cacheHandlers&&s(tt(50)),t.scopeId&&!n&&s(tt(51));const i=Oe({},t,{prefixIdentifiers:a}),l=Te(e)?sy(e,i):e,[r,o]=Zy();return ly(l,Oe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Oe({},o,t.directiveTransforms||{})})),uy(l,i)}const Yy=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Th=Symbol(""),Ch=Symbol(""),Eh=Symbol(""),Ah=Symbol(""),fo=Symbol(""),Rh=Symbol(""),Ih=Symbol(""),Nh=Symbol(""),Lh=Symbol(""),Oh=Symbol("");A0({[Th]:"vModelRadio",[Ch]:"vModelCheckbox",[Eh]:"vModelText",[Ah]:"vModelSelect",[fo]:"vModelDynamic",[Rh]:"withModifiers",[Ih]:"withKeys",[Nh]:"vShow",[Lh]:"Transition",[Oh]:"TransitionGroup"});let Wn;function Qy(e,t=!1){return Wn||(Wn=document.createElement("div")),t?(Wn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Wn.children[0].getAttribute("foo")):(Wn.innerHTML=e,Wn.textContent)}const Xy={parseMode:"html",isVoidTag:qg,isNativeTag:e=>Vg(e)||jg(e)||zg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:Qy,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Lh;if(e==="TransitionGroup"||e==="transition-group")return Oh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},ex=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ae("style",!0,t.loc),exp:tx(t.value.content,t.loc),modifiers:[],loc:t.loc})})},tx=(e,t)=>{const s=jd(e);return Ae(JSON.stringify(s),!1,t,3)};function pn(e,t){return tt(e,t)}const sx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(54,a)),t.children.length&&(s.onError(pn(55,a)),t.children.length=0),{props:[ht(Ae("innerHTML",!0,a),n||Ae("",!0))]}},nx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(56,a)),t.children.length&&(s.onError(pn(57,a)),t.children.length=0),{props:[ht(Ae("textContent",!0),n?ts(n,s)>0?n:xt(s.helperString(Yl),[n],a):Ae("",!0))]}},ax=(e,t,s)=>{const n=Sh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(pn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Eh,r=!1;if(a==="input"||i){const o=Ql(t,"type");if(o){if(o.type===7)l=fo;else if(o.value)switch(o.value.content){case"radio":l=Th;break;case"checkbox":l=Ch;break;case"file":r=!0,s.onError(pn(60,e.loc));break}}else B0(t)&&(l=fo)}else a==="select"&&(l=Ah);r||(n.needRuntime=s.helper(l))}else s.onError(pn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},ix=as("passive,once,capture"),lx=as("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),rx=as("left,right"),Dh=as("onkeyup,onkeydown,onkeypress"),ox=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&gi("COMPILER_V_ON_NATIVE",s)||ix(o)?l.push(o):rx(o)?Qt(e)?Dh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):lx(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Yu=(e,t)=>Qt(e)&&e.content.toLowerCase()==="onclick"?Ae(t,!0):e.type!==4?vs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,cx=(e,t,s)=>wh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=ox(i,a,s,e.loc);if(o.includes("right")&&(i=Yu(i,"onContextmenu")),o.includes("middle")&&(i=Yu(i,"onMouseup")),o.length&&(l=xt(s.helper(Rh),[l,JSON.stringify(o)])),r.length&&(!Qt(i)||Dh(i.content.toLowerCase()))&&(l=xt(s.helper(Ih),[l,JSON.stringify(r)])),c.length){const u=c.map($n).join("");i=Qt(i)?Ae(`${i.content}${u}`,!0):vs(["(",i,`) + "${u}"`])}return{props:[ht(i,l)]}}),ux=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(62,a)),{props:[],needRuntime:s.helper(Nh)}},dx=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},fx=[ex],px={cloak:Yy,html:sx,text:nx,model:ax,on:cx,show:ux};function hx(e,t={}){return Jy(e,Oe({},Xy,t,{nodeTransforms:[dx,...fx,...t.nodeTransforms||[]],directiveTransforms:Oe({},px,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Qu=Object.create(null);function gx(e,t){if(!Te(e))if(e.nodeType)e=e.innerHTML;else return It;const s=Ng(e,t),n=Qu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Oe({hoistStatic:!0,onError:void 0,onWarn:It},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=hx(e,a),l=new Function("Vue",i)(k0);return l._rc=!0,Qu[s]=l}vp(gx);const Al=gn({items:[]});let mx=1;function tr(e,t="info",s=3e3){const n=mx++;return Al.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>bc(n),s),n}function bc(e){const t=Al.items.findIndex(s=>s.id===e);t>=0&&Al.items.splice(t,1)}function xe(e,t="info",s=3e3){return tr(e,t,s)}xe.success=(e,t=3e3)=>tr(e,"success",t);xe.error=(e,t=5e3)=>tr(e,"error",t);xe.info=(e,t=3e3)=>tr(e,"info",t);xe.dismiss=bc;const vx={setup(){return{state:Al,dismiss:bc}},template:`
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
  `},$s=gn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let da=null;function ns({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return da&&da(!1),$s.title=e,$s.message=t,$s.confirmLabel=s,$s.cancelLabel=n,$s.danger=a,$s.open=!0,new Promise(i=>{da=i})}function Tr(e){$s.open=!1,da&&(da(e),da=null)}const bx={setup(){function e(t){$s.open&&(t.key==="Escape"&&(t.stopPropagation(),Tr(!1)),t.key==="Enter"&&(t.stopPropagation(),Tr(!0)))}return $e(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:$s,settle:Tr}},template:`
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay" @click.self="settle(false)" role="dialog" aria-modal="true" :aria-label="state.title">
        <div class="modal-content confirm-dialog">
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
 */const Xn=typeof document<"u";function Mh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function yx(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Mh(e.default)}const je=Object.assign;function Cr(e,t){const s={};for(const n in t){const a=t[n];s[n]=ys(a)?a.map(e):e(a)}return s}const Qa=()=>{},ys=Array.isArray;function Xu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Ph=/#/g,xx=/&/g,_x=/\//g,kx=/=/g,wx=/\?/g,Fh=/\+/g,Sx=/%5B/g,Tx=/%5D/g,$h=/%5E/g,Cx=/%60/g,Uh=/%7B/g,Ex=/%7C/g,Bh=/%7D/g,Ax=/%20/g;function yc(e){return e==null?"":encodeURI(""+e).replace(Ex,"|").replace(Sx,"[").replace(Tx,"]")}function Rx(e){return yc(e).replace(Uh,"{").replace(Bh,"}").replace($h,"^")}function po(e){return yc(e).replace(Fh,"%2B").replace(Ax,"+").replace(Ph,"%23").replace(xx,"%26").replace(Cx,"`").replace(Uh,"{").replace(Bh,"}").replace($h,"^")}function Ix(e){return po(e).replace(kx,"%3D")}function Nx(e){return yc(e).replace(Ph,"%23").replace(wx,"%3F")}function Lx(e){return Nx(e).replace(_x,"%2F")}function bi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Ox=/\/$/,Dx=e=>e.replace(Ox,"");function Er(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=$x(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:bi(l)}}function Mx(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ed(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Px(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&_a(t.matched[n],s.matched[a])&&Hh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function _a(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Hh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Fx(e[s],t[s]))return!1;return!0}function Fx(e,t){return ys(e)?td(e,t):ys(t)?td(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function td(e,t){return ys(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function $x(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const an={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let ho=(function(e){return e.pop="pop",e.push="push",e})({}),Ar=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Ux(e){if(!e)if(Xn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Dx(e)}const Bx=/^[^#]+#/;function Hx(e,t){return e.replace(Bx,"#")+t}function Vx(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const sr=()=>({left:window.scrollX,top:window.scrollY});function jx(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=Vx(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function sd(e,t){return(history.state?history.state.position-t:-1)+e}const go=new Map;function zx(e,t){go.set(e,t)}function qx(e){const t=go.get(e);return go.delete(e),t}function Kx(e){return typeof e=="string"||e&&typeof e=="object"}function Vh(e){return typeof e=="string"||typeof e=="symbol"}let rt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const jh=Symbol("");rt.MATCHER_NOT_FOUND+"",rt.NAVIGATION_GUARD_REDIRECT+"",rt.NAVIGATION_ABORTED+"",rt.NAVIGATION_CANCELLED+"",rt.NAVIGATION_DUPLICATED+"";function ka(e,t){return je(new Error,{type:e,[jh]:!0},t)}function Os(e,t){return e instanceof Error&&jh in e&&(t==null||!!(e.type&t))}const Gx=["params","query","hash"];function Wx(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Gx)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Zx(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Fh," "),i=a.indexOf("="),l=bi(i<0?a:a.slice(0,i)),r=i<0?null:bi(a.slice(i+1));if(l in t){let o=t[l];ys(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function nd(e){let t="";for(let s in e){const n=e[s];if(s=Ix(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(ys(n)?n.map(a=>a&&po(a)):[n&&po(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function Jx(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=ys(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Yx=Symbol(""),ad=Symbol(""),nr=Symbol(""),xc=Symbol(""),mo=Symbol("");function Pa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function dn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(ka(rt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):Kx(f)?o(ka(rt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Rr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Mh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(dn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=yx(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&dn(f,s,n,l,r,a)()}))}}return i}function Qx(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>_a(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>_a(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let Xx=()=>location.protocol+"//"+location.host;function zh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),ed(r,"")}return ed(s,e)+n+a}function e_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=zh(e,location),m=s.value,g=t.value;let k=0;if(f){if(s.value=p,t.value=f,l&&l===m){l=null;return}k=g?f.position-g.position:0}else n(p);a.forEach(A=>{A(s.value,m,{delta:k,type:ho.pop,direction:k?k>0?Ar.forward:Ar.back:Ar.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const m=a.indexOf(f);m>-1&&a.splice(m,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(je({},f.state,{scroll:sr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function id(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?sr():null}}function t_(e){const{history:t,location:s}=window,n={value:zh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:Xx()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,je({},t.state,id(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=je({},a.value,t.state,{forward:o,scroll:sr()});i(u.current,u,!0),i(o,je({},id(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function s_(e){e=Ux(e);const t=t_(e),s=e_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=je({location:"",base:e,go:n,createHref:Hx.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function n_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),s_(e)}let Tn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var bt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(bt||{});const a_={type:Tn.Static,value:""},i_=/[a-zA-Z0-9_]/;function l_(e){if(!e)return[[]];if(e==="/")return[[a_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=bt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===bt.Static?i.push({type:Tn.Static,value:c}):s===bt.Param||s===bt.ParamRegExp||s===bt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Tn.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==bt.ParamRegExp){n=s,s=bt.EscapeNext;continue}switch(s){case bt.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=bt.Param):f();break;case bt.EscapeNext:f(),s=n;break;case bt.Param:o==="("?s=bt.ParamRegExp:i_.test(o)?f():(d(),s=bt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case bt.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=bt.ParamRegExpEnd:u+=o;break;case bt.ParamRegExpEnd:d(),s=bt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===bt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const ld="[^/]+?",r_={sensitive:!1,strict:!1,start:!0,end:!0};var Ht=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Ht||{});const o_=/[.+*?^${}()[\]/\\]/g;function c_(e,t){const s=je({},r_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[Ht.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=Ht.Segment+(s.sensitive?Ht.BonusCaseSensitive:0);if(f.type===Tn.Static)d||(a+="/"),a+=f.value.replace(o_,"\\$&"),p+=Ht.Static;else if(f.type===Tn.Param){const{value:m,repeatable:g,optional:k,regexp:A}=f;i.push({name:m,repeatable:g,optional:k});const b=A||ld;if(b!==ld){p+=Ht.BonusCustomRegExp;try{`${b}`}catch(x){throw new Error(`Invalid custom RegExp for param "${m}" (${b}): `+x.message)}}let v=g?`((?:${b})(?:/(?:${b}))*)`:`(${b})`;d||(v=k&&c.length<2?`(?:/${v})`:"/"+v),k&&(v+="?"),a+=v,p+=Ht.Dynamic,k&&(p+=Ht.BonusOptional),g&&(p+=Ht.BonusRepeatable),b===".*"&&(p+=Ht.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Ht.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",m=i[f-1];d[m.name]=p&&m.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Tn.Static)u+=p.value;else if(p.type===Tn.Param){const{value:m,repeatable:g,optional:k}=p,A=m in c?c[m]:"";if(ys(A)&&!g)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const b=ys(A)?A.join("/"):A;if(!b)if(k)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${m}"`);u+=b}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function u_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Ht.Static+Ht.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Ht.Static+Ht.Segment?1:-1:0}function qh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=u_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(rd(n))return 1;if(rd(a))return-1}return a.length-n.length}function rd(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const d_={strict:!1,end:!0,sensitive:!1};function f_(e,t,s){const n=c_(l_(e.path),s),a=je(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function p_(e,t){const s=[],n=new Map;t=Xu(d_,t);function a(d){return n.get(d)}function i(d,f,p){const m=!p,g=cd(d);g.aliasOf=p&&p.record;const k=Xu(t,d),A=[g];if("alias"in d){const x=typeof d.alias=="string"?[d.alias]:d.alias;for(const R of x)A.push(cd(je({},g,{components:p?p.record.components:g.components,path:R,aliasOf:p?p.record:g})))}let b,v;for(const x of A){const{path:R}=x;if(f&&R[0]!=="/"){const L=f.record.path,O=L[L.length-1]==="/"?"":"/";x.path=f.record.path+(R&&O+R)}if(b=f_(x,f,k),p?p.alias.push(b):(v=v||b,v!==b&&v.alias.push(b),m&&d.name&&!ud(b)&&l(d.name)),Kh(b)&&o(b),g.children){const L=g.children;for(let O=0;O<L.length;O++)i(L[O],b,p&&p.children[O])}p=p||b}return v?()=>{l(v)}:Qa}function l(d){if(Vh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=m_(d,s);s.splice(f,0,d),d.record.name&&!ud(d)&&n.set(d.record.name,d)}function c(d,f){let p,m={},g,k;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw ka(rt.MATCHER_NOT_FOUND,{location:d});k=p.record.name,m=je(od(f.params,p.keys.filter(v=>!v.optional).concat(p.parent?p.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),d.params&&od(d.params,p.keys.map(v=>v.name))),g=p.stringify(m)}else if(d.path!=null)g=d.path,p=s.find(v=>v.re.test(g)),p&&(m=p.parse(g),k=p.record.name);else{if(p=f.name?n.get(f.name):s.find(v=>v.re.test(f.path)),!p)throw ka(rt.MATCHER_NOT_FOUND,{location:d,currentLocation:f});k=p.record.name,m=je({},f.params,d.params),g=p.stringify(m)}const A=[];let b=p;for(;b;)A.unshift(b.record),b=b.parent;return{name:k,path:g,params:m,matched:A,meta:g_(A)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function od(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function cd(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:h_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function h_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function ud(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function g_(e){return e.reduce((t,s)=>je(t,s.meta),{})}function m_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;qh(e,t[i])<0?n=i:s=i+1}const a=v_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function v_(e){let t=e;for(;t=t.parent;)if(Kh(t)&&qh(e,t)===0)return t}function Kh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function dd(e){const t=us(nr),s=us(xc),n=ee(()=>{const o=Es(e.to);return t.resolve(o)}),a=ee(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(_a.bind(null,u));if(f>-1)return f;const p=fd(o[c-2]);return c>1&&fd(u)===p&&d[d.length-1].path!==p?d.findIndex(_a.bind(null,o[c-2])):f}),i=ee(()=>a.value>-1&&k_(s.params,n.value.params)),l=ee(()=>a.value>-1&&a.value===s.matched.length-1&&Hh(s.params,n.value.params));function r(o={}){if(__(o)){const c=t[Es(e.replace)?"replace":"push"](Es(e.to)).catch(Qa);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:ee(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function b_(e){return e.length===1?e[0]:e}const y_=wi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:dd,setup(e,{slots:t}){const s=gn(dd(e)),{options:n}=us(nr),a=ee(()=>({[pd(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[pd(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&b_(t.default(s));return e.custom?i:ha("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),x_=y_;function __(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function k_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!ys(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function fd(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const pd=(e,t,s)=>e??t??s,w_=wi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=us(mo),a=ee(()=>e.route||n.value),i=us(ad,0),l=ee(()=>{let c=Es(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=ee(()=>a.value.matched[l.value]);Ga(ad,ee(()=>l.value+1)),Ga(Yx,r),Ga(mo,a);const o=h();return ds(()=>[o.value,r.value,e.name],([c,u,d],[f,p,m])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!_a(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return hd(s.default,{Component:f,route:c});const p=d.props[u],m=p?p===!0?c.params:typeof p=="function"?p(c):p:null,k=ha(f,je({},m,t,{onVnodeUnmounted:A=>{A.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return hd(s.default,{Component:k,route:c})||k}}});function hd(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const S_=w_;function T_(e){const t=p_(e.routes,e),s=e.parseQuery||Zx,n=e.stringifyQuery||nd,a=e.history,i=Pa(),l=Pa(),r=Pa(),o=Io(an);let c=an;Xn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Cr.bind(null,j=>""+j),d=Cr.bind(null,Lx),f=Cr.bind(null,bi);function p(j,re){let le,ge;return Vh(j)?(le=t.getRecordMatcher(j),ge=re):ge=j,t.addRoute(ge,le)}function m(j){const re=t.getRecordMatcher(j);re&&t.removeRoute(re)}function g(){return t.getRoutes().map(j=>j.record)}function k(j){return!!t.getRecordMatcher(j)}function A(j,re){if(re=je({},re||o.value),typeof j=="string"){const T=Er(s,j,re.path),P=t.resolve({path:T.path},re),G=a.createHref(T.fullPath);return je(T,P,{params:f(P.params),hash:bi(T.hash),redirectedFrom:void 0,href:G})}let le;if(j.path!=null)le=je({},j,{path:Er(s,j.path,re.path).path});else{const T=je({},j.params);for(const P in T)T[P]==null&&delete T[P];le=je({},j,{params:d(T)}),re.params=d(re.params)}const ge=t.resolve(le,re),me=j.hash||"";ge.params=u(f(ge.params));const Le=Mx(n,je({},j,{hash:Rx(me),path:ge.path})),y=a.createHref(Le);return je({fullPath:Le,hash:me,query:n===nd?Jx(j.query):j.query||{}},ge,{redirectedFrom:void 0,href:y})}function b(j){return typeof j=="string"?Er(s,j,o.value.path):je({},j)}function v(j,re){if(c!==j)return ka(rt.NAVIGATION_CANCELLED,{from:re,to:j})}function x(j){return O(j)}function R(j){return x(je(b(j),{replace:!0}))}function L(j,re){const le=j.matched[j.matched.length-1];if(le&&le.redirect){const{redirect:ge}=le;let me=typeof ge=="function"?ge(j,re):ge;return typeof me=="string"&&(me=me.includes("?")||me.includes("#")?me=b(me):{path:me},me.params={}),je({query:j.query,hash:j.hash,params:me.path!=null?{}:j.params},me)}}function O(j,re){const le=c=A(j),ge=o.value,me=j.state,Le=j.force,y=j.replace===!0,T=L(le,ge);if(T)return O(je(b(T),{state:typeof T=="object"?je({},me,T.state):me,force:Le,replace:y}),re||le);const P=le;P.redirectedFrom=re;let G;return!Le&&Px(n,ge,le)&&(G=ka(rt.NAVIGATION_DUPLICATED,{to:P,from:ge}),ve(ge,ge,!0,!1)),(G?Promise.resolve(G):w(P,ge)).catch(E=>Os(E)?Os(E,rt.NAVIGATION_GUARD_REDIRECT)?E:ue(E):D(E,P,ge)).then(E=>{if(E){if(Os(E,rt.NAVIGATION_GUARD_REDIRECT))return O(je({replace:y},b(E.to),{state:typeof E.to=="object"?je({},me,E.to.state):me,force:Le}),re||P)}else E=F(P,ge,!0,y,me);return $(P,ge,E),E})}function S(j,re){const le=v(j,re);return le?Promise.reject(le):Promise.resolve()}function I(j){const re=J.values().next().value;return re&&typeof re.runWithContext=="function"?re.runWithContext(j):j()}function w(j,re){let le;const[ge,me,Le]=Qx(j,re);le=Rr(ge.reverse(),"beforeRouteLeave",j,re);for(const T of ge)T.leaveGuards.forEach(P=>{le.push(dn(P,j,re))});const y=S.bind(null,j,re);return le.push(y),Ie(le).then(()=>{le=[];for(const T of i.list())le.push(dn(T,j,re));return le.push(y),Ie(le)}).then(()=>{le=Rr(me,"beforeRouteUpdate",j,re);for(const T of me)T.updateGuards.forEach(P=>{le.push(dn(P,j,re))});return le.push(y),Ie(le)}).then(()=>{le=[];for(const T of Le)if(T.beforeEnter)if(ys(T.beforeEnter))for(const P of T.beforeEnter)le.push(dn(P,j,re));else le.push(dn(T.beforeEnter,j,re));return le.push(y),Ie(le)}).then(()=>(j.matched.forEach(T=>T.enterCallbacks={}),le=Rr(Le,"beforeRouteEnter",j,re,I),le.push(y),Ie(le))).then(()=>{le=[];for(const T of l.list())le.push(dn(T,j,re));return le.push(y),Ie(le)}).catch(T=>Os(T,rt.NAVIGATION_CANCELLED)?T:Promise.reject(T))}function $(j,re,le){r.list().forEach(ge=>I(()=>ge(j,re,le)))}function F(j,re,le,ge,me){const Le=v(j,re);if(Le)return Le;const y=re===an,T=Xn?history.state:{};le&&(ge||y?a.replace(j.fullPath,je({scroll:y&&T&&T.scroll},me)):a.push(j.fullPath,me)),o.value=j,ve(j,re,le,y),ue()}let M;function W(){M||(M=a.listen((j,re,le)=>{if(!oe.listening)return;const ge=A(j),me=L(ge,oe.currentRoute.value);if(me){O(je(me,{replace:!0,force:!0}),ge).catch(Qa);return}c=ge;const Le=o.value;Xn&&zx(sd(Le.fullPath,le.delta),sr()),w(ge,Le).catch(y=>Os(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_CANCELLED)?y:Os(y,rt.NAVIGATION_GUARD_REDIRECT)?(O(je(b(y.to),{force:!0}),ge).then(T=>{Os(T,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&!le.delta&&le.type===ho.pop&&a.go(-1,!1)}).catch(Qa),Promise.reject()):(le.delta&&a.go(-le.delta,!1),D(y,ge,Le))).then(y=>{y=y||F(ge,Le,!1),y&&(le.delta&&!Os(y,rt.NAVIGATION_CANCELLED)?a.go(-le.delta,!1):le.type===ho.pop&&Os(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),$(ge,Le,y)}).catch(Qa)}))}let B=Pa(),V=Pa(),N;function D(j,re,le){ue(j);const ge=V.list();return ge.length?ge.forEach(me=>me(j,re,le)):console.error(j),Promise.reject(j)}function q(){return N&&o.value!==an?Promise.resolve():new Promise((j,re)=>{B.add([j,re])})}function ue(j){return N||(N=!j,W(),B.list().forEach(([re,le])=>j?le(j):re()),B.reset()),j}function ve(j,re,le,ge){const{scrollBehavior:me}=e;if(!Xn||!me)return Promise.resolve();const Le=!le&&qx(sd(j.fullPath,0))||(ge||!le)&&history.state&&history.state.scroll||null;return Et().then(()=>me(j,re,Le)).then(y=>y&&jx(y)).catch(y=>D(y,j,re))}const se=j=>a.go(j);let de;const J=new Set,oe={currentRoute:o,listening:!0,addRoute:p,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:g,resolve:A,options:e,push:x,replace:R,go:se,back:()=>se(-1),forward:()=>se(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:V.add,isReady:q,install(j){j.component("RouterLink",x_),j.component("RouterView",S_),j.config.globalProperties.$router=oe,Object.defineProperty(j.config.globalProperties,"$route",{enumerable:!0,get:()=>Es(o)}),Xn&&!de&&o.value===an&&(de=!0,x(a.location).catch(ge=>{}));const re={};for(const ge in an)Object.defineProperty(re,ge,{get:()=>o.value[ge],enumerable:!0});j.provide(nr,oe),j.provide(xc,Ro(re)),j.provide(mo,o);const le=j.unmount;J.add(j),j.unmount=function(){J.delete(j),J.size<1&&(c=an,M&&M(),M=null,o.value=an,de=!1,N=!1),le()}}};function Ie(j){return j.reduce((re,le)=>re.then(()=>I(le)),Promise.resolve())}return oe}function Gh(){return us(nr)}function C_(e){return us(xc)}const E_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],Zt=gn({open:!1,query:"",selected:0});function gd(){Zt.query="",Zt.selected=0,Zt.open=!0}function Ir(){Zt.open=!1}function A_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const R_={setup(){const e=Gh(),t=h(null),s=ee(()=>{const i=Zt.query.trim().toLowerCase();return E_.map(l=>({...l,_score:A_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ds(()=>Zt.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),ds(()=>Zt.query,()=>{Zt.selected=0});function n(i){Ir(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Ir();return}if(i.key==="ArrowDown")i.preventDefault(),Zt.selected=Math.min(Zt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Zt.selected=Math.max(Zt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Zt.selected];l&&n(l)}}return{state:Zt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Ir}},template:`
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay palette-overlay" @click.self="closePalette()" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette">
          <div class="palette-search"><odin-icon name="search" :size="19" />
            <input ref="inputEl" v-model="state.query" type="text" class="palette-input"
              placeholder="Search pages and sections" aria-label="Search pages" role="combobox"
              aria-expanded="true" aria-controls="palette-results" @keydown="onKeydown" />
          </div>
          <div id="palette-results" class="palette-results" role="listbox">
            <div v-if="!results.length" class="palette-empty">No destinations match your search.</div>
            <button v-for="(r, i) in results" :key="r.group + '-' + r.label"
              class="palette-item" :class="{ selected: i === state.selected }" role="option"
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
  `},vo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(vo));const I_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ha("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ha("path",{d:vo[e.name]||vo.info})])}};function _c(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ea(e){const t=_c(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function kc(e){const t=_c(e);return t?t.toLocaleTimeString():"—"}function Wh(e){const t=_c(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function wa(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function wc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Zh(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function md(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Jh(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function N_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const L_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=ee(()=>{const M=e.value.uptime_seconds||0,W=Math.floor(M/86400),B=Math.floor(M%86400/3600),V=Math.floor(M%3600/60),N=[];return W>0&&N.push(`${W}d`),B>0&&N.push(`${B}h`),(N.length===0||W===0&&B===0)&&N.push(`${V}m`),N.join(" ")}),p=ee(()=>{const M=e.value.uptime_seconds||0;return 125.66*(1-Math.min(M/86400,1))}),m=ee(()=>{const M=e.value;return[{label:"Guilds",value:M.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:M.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:M.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${M.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:M.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:M.loop_count>0?"text-green-400":"",highlight:M.loop_count>0},{label:"Agents",value:M.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:M.agent_count>0?`${M.agent_count} total`:"",subColor:"text-gray-500",highlight:(M.agent_running??0)>0},{label:"Processes",value:M.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:M.process_count>0?`${M.process_count} total`:"",subColor:"text-gray-500",highlight:(M.process_running??0)>0},{label:"Schedules",value:M.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(M.schedule_failing>0?`${M.schedule_failing} failing`:"")+(M.schedule_failing>0&&M.schedule_paused>0?", ":"")+(M.schedule_paused>0?`${M.schedule_paused} paused`:"")||void 0,subColor:M.schedule_failing>0?"text-red-400":"text-yellow-400",color:M.schedule_failing>0?"text-red-400":"",highlight:M.schedule_failing>0},{label:"Users",value:M.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=ee(()=>{const M=e.value,W=[];return W.push({label:"Bot",status:M.status==="online"?"ok":"warn",detail:M.status==="online"?"Online":"Starting"}),(M.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${M.schedule_failing} failing`}):(M.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${M.schedule_count} configured`}),(M.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${M.loop_count} active`}),(M.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${M.agent_running} running`}),(M.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${M.process_running} running`}),W});async function k(){try{e.value=await K.get("/api/status"),s.value=null}catch(M){s.value=M.message}finally{t.value=!1}}async function A(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function b(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function v(){try{const M=await K.get("/api/knowledge");c.value=(Array.isArray(M)?M:[]).reduce((W,B)=>W+(B.chunks||0),0)}catch{c.value=null}}async function x(){try{const M=await K.get("/api/agents");r.value=M.filter(W=>W.status==="running")}catch{}}async function R(){u.value={...u.value,reload:!0};try{await K.post("/api/reload"),xe.success("Config reloaded")}catch(M){xe.error(M.message)}u.value={...u.value,reload:!1}}async function L(){if(!await ns({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const B=await K.post("/api/sessions/clear-all");xe.success(`Cleared ${B.count} session${B.count!==1?"s":""}`),await k()}catch(B){e.value={...e.value,session_count:W},xe.error(B.message)}u.value={...u.value,clearSessions:!1}}async function O(){if(!await ns({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const B=await K.post("/api/loops/stop-all");xe.success(B.result),await k()}catch(B){e.value={...e.value,loop_count:W},xe.error(B.message)}u.value={...u.value,stopLoops:!1}}function S(){t.value=!0,s.value=null,k(),A(),b(),x()}let I=null,w=null,$=null;function F(M){if(M.payload&&M.payload.tool_name){const W={...M.payload,_isNew:!0,_key:++d};n.value.unshift(W),n.value.length>10&&n.value.pop(),o.value++,W.error&&(i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout($),$=setTimeout(()=>{o.value=0},1e4)}}return $e(async()=>{await Promise.all([k(),A(),b(),x(),v()]),I=setInterval(k,15e3),w=setInterval(x,1e4),ze.subscribe("events",F)}),ft(()=>{I&&clearInterval(I),w&&clearInterval(w),clearTimeout($),ze.unsubscribe("events",F)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:m,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:A,fetchStatus:k,formatTime:kc,formatDuration:wa,retry:S,reloadConfig:R,clearSessions:L,stopAllLoops:O}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function vd(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function O_(e){if(Array.isArray(e))return e}function D_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function M_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function P_(e,t){return O_(e)||D_(e,t)||F_(e,t)||M_()}function F_(e,t){if(e){if(typeof e=="string")return vd(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?vd(e,t):void 0}}const Yh=Object.entries,bd=Object.setPrototypeOf,$_=Object.isFrozen,U_=Object.getPrototypeOf,B_=Object.getOwnPropertyDescriptor;let qt=Object.freeze,ps=Object.seal,ea=Object.create,Qh=typeof Reflect<"u"&&Reflect,bo=Qh.apply,yo=Qh.construct;qt||(qt=function(t){return t});ps||(ps=function(t){return t});bo||(bo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});yo||(yo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Ds=mt(Array.prototype.forEach),H_=mt(Array.prototype.lastIndexOf),yd=mt(Array.prototype.pop),Zn=mt(Array.prototype.push),V_=mt(Array.prototype.splice),Bt=Array.isArray,za=mt(String.prototype.toLowerCase),Nr=mt(String.prototype.toString),xd=mt(String.prototype.match),Jn=mt(String.prototype.replace),_d=mt(String.prototype.indexOf),j_=mt(String.prototype.trim),z_=mt(Number.prototype.toString),q_=mt(Boolean.prototype.toString),kd=typeof BigInt>"u"?null:mt(BigInt.prototype.toString),wd=typeof Symbol>"u"?null:mt(Symbol.prototype.toString),lt=mt(Object.prototype.hasOwnProperty),Fa=mt(Object.prototype.toString),Tt=mt(RegExp.prototype.test),xn=K_(TypeError);function mt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return bo(e,t,n)}}function K_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return yo(e,s)}}function Re(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:za;if(bd&&bd(e,null),!Bt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&($_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function G_(e){for(let t=0;t<e.length;t++)lt(e,t)||(e[t]=null);return e}function Ot(e){const t=ea(null);for(const n of Yh(e)){var s=P_(n,2);const a=s[0],i=s[1];lt(e,a)&&(Bt(i)?t[a]=G_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Ot(i):t[a]=i)}return t}function W_(e){switch(typeof e){case"string":return e;case"number":return z_(e);case"boolean":return q_(e);case"bigint":return kd?kd(e):"0";case"symbol":return wd?wd(e):"Symbol()";case"undefined":return Fa(e);case"function":case"object":{if(e===null)return Fa(e);const t=e,s=ks(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Fa(n)}return Fa(e)}default:return Fa(e)}}function ks(e,t){for(;e!==null;){const n=B_(e,t);if(n){if(n.get)return mt(n.get);if(typeof n.value=="function")return mt(n.value)}e=U_(e)}function s(){return null}return s}function Z_(e){try{return Tt(e,""),!0}catch{return!1}}const Sd=qt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Lr=qt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Or=qt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),J_=qt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Dr=qt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),Y_=qt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Td=qt(["#text"]),Cd=qt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Mr=qt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Ed=qt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Ki=qt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Q_=ps(/{{[\w\W]*|^[\w\W]*}}/g),X_=ps(/<%[\w\W]*|^[\w\W]*%>/g),ek=ps(/\${[\w\W]*/g),tk=ps(/^data-[\-\w.\u00B7-\uFFFF]+$/),sk=ps(/^aria-[\-\w]+$/),Ad=ps(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),nk=ps(/^(?:\w+script|data):/i),ak=ps(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),ik=ps(/^html$/i),lk=ps(/^[a-z][.\w]*(-[.\w]+)+$/i),xs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},rk=function(){return typeof window>"u"?null:window},ok=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Rd=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Xh(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:rk();const t=he=>Xh(he);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==xs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=ks(f,"cloneNode"),m=ks(f,"remove"),g=ks(f,"nextSibling"),k=ks(f,"childNodes"),A=ks(f,"parentNode"),b=ks(f,"shadowRoot"),v=ks(f,"attributes"),x=l&&l.prototype?ks(l.prototype,"nodeType"):null,R=l&&l.prototype?ks(l.prototype,"nodeName"):null;if(typeof i=="function"){const he=s.createElement("template");he.content&&he.content.ownerDocument&&(s=he.content.ownerDocument)}let L,O="",S,I=!1,w=0;const $=function(){if(w>0)throw xn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},F=function(_){$(),w++;try{return L.createHTML(_)}finally{w--}},M=function(_){$(),w++;try{return L.createScriptURL(_)}finally{w--}},W=function(){return I||(S=ok(d,a),I=!0),S},B=s,V=B.implementation,N=B.createNodeIterator,D=B.createDocumentFragment,q=B.getElementsByTagName,ue=n.importNode;let ve=Rd();t.isSupported=typeof Yh=="function"&&typeof A=="function"&&V&&V.createHTMLDocument!==void 0;const se=Q_,de=X_,J=ek,oe=tk,Ie=sk,j=nk,re=ak,le=lk;let ge=Ad,me=null;const Le=Re({},[...Sd,...Lr,...Or,...Dr,...Td]);let y=null;const T=Re({},[...Cd,...Mr,...Ed,...Ki]);let P=Object.seal(ea(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),G=null,E=null;const U=Object.seal(ea(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Z=!0,X=!0,te=!1,Y=!0,pe=!1,ie=!0,ce=!1,ye=!1,Se=!1,Ee=!1,C=!1,Q=!1,be=!0,De=!1;const Ze="user-content-";let Ge=!0,St=!1,st={},Je=null;const en=Re({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let mn=null;const Ii=Re({},["audio","video","img","source","image","track"]);let Aa=null;const Ni=Re({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Vn="http://www.w3.org/1998/Math/MathML",jn="http://www.w3.org/2000/svg",Kt="http://www.w3.org/1999/xhtml";let H=Kt,ne=!1,_e=null;const Ye=Re({},[Vn,jn,Kt],Nr);let nt=Re({},["mi","mo","mn","ms","mtext"]),Nt=Re({},["annotation-xml"]);const rr=Re({},["title","style","font","a","script"]);let Ra=null;const pg=["application/xhtml+xml","text/html"],hg="text/html";let it=null,zn=null;const gg=s.createElement("form"),Oc=function(_){return _ instanceof RegExp||_ instanceof Function},or=function(){let _=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(zn&&zn===_)return;(!_||typeof _!="object")&&(_={}),_=Ot(_),Ra=pg.indexOf(_.PARSER_MEDIA_TYPE)===-1?hg:_.PARSER_MEDIA_TYPE,it=Ra==="application/xhtml+xml"?Nr:za,me=lt(_,"ALLOWED_TAGS")&&Bt(_.ALLOWED_TAGS)?Re({},_.ALLOWED_TAGS,it):Le,y=lt(_,"ALLOWED_ATTR")&&Bt(_.ALLOWED_ATTR)?Re({},_.ALLOWED_ATTR,it):T,_e=lt(_,"ALLOWED_NAMESPACES")&&Bt(_.ALLOWED_NAMESPACES)?Re({},_.ALLOWED_NAMESPACES,Nr):Ye,Aa=lt(_,"ADD_URI_SAFE_ATTR")&&Bt(_.ADD_URI_SAFE_ATTR)?Re(Ot(Ni),_.ADD_URI_SAFE_ATTR,it):Ni,mn=lt(_,"ADD_DATA_URI_TAGS")&&Bt(_.ADD_DATA_URI_TAGS)?Re(Ot(Ii),_.ADD_DATA_URI_TAGS,it):Ii,Je=lt(_,"FORBID_CONTENTS")&&Bt(_.FORBID_CONTENTS)?Re({},_.FORBID_CONTENTS,it):en,G=lt(_,"FORBID_TAGS")&&Bt(_.FORBID_TAGS)?Re({},_.FORBID_TAGS,it):Ot({}),E=lt(_,"FORBID_ATTR")&&Bt(_.FORBID_ATTR)?Re({},_.FORBID_ATTR,it):Ot({}),st=lt(_,"USE_PROFILES")?_.USE_PROFILES&&typeof _.USE_PROFILES=="object"?Ot(_.USE_PROFILES):_.USE_PROFILES:!1,Z=_.ALLOW_ARIA_ATTR!==!1,X=_.ALLOW_DATA_ATTR!==!1,te=_.ALLOW_UNKNOWN_PROTOCOLS||!1,Y=_.ALLOW_SELF_CLOSE_IN_ATTR!==!1,pe=_.SAFE_FOR_TEMPLATES||!1,ie=_.SAFE_FOR_XML!==!1,ce=_.WHOLE_DOCUMENT||!1,Ee=_.RETURN_DOM||!1,C=_.RETURN_DOM_FRAGMENT||!1,Q=_.RETURN_TRUSTED_TYPE||!1,Se=_.FORCE_BODY||!1,be=_.SANITIZE_DOM!==!1,De=_.SANITIZE_NAMED_PROPS||!1,Ge=_.KEEP_CONTENT!==!1,St=_.IN_PLACE||!1,ge=Z_(_.ALLOWED_URI_REGEXP)?_.ALLOWED_URI_REGEXP:Ad,H=typeof _.NAMESPACE=="string"?_.NAMESPACE:Kt,nt=lt(_,"MATHML_TEXT_INTEGRATION_POINTS")&&_.MATHML_TEXT_INTEGRATION_POINTS&&typeof _.MATHML_TEXT_INTEGRATION_POINTS=="object"?Ot(_.MATHML_TEXT_INTEGRATION_POINTS):Re({},["mi","mo","mn","ms","mtext"]),Nt=lt(_,"HTML_INTEGRATION_POINTS")&&_.HTML_INTEGRATION_POINTS&&typeof _.HTML_INTEGRATION_POINTS=="object"?Ot(_.HTML_INTEGRATION_POINTS):Re({},["annotation-xml"]);const z=lt(_,"CUSTOM_ELEMENT_HANDLING")&&_.CUSTOM_ELEMENT_HANDLING&&typeof _.CUSTOM_ELEMENT_HANDLING=="object"?Ot(_.CUSTOM_ELEMENT_HANDLING):ea(null);if(P=ea(null),lt(z,"tagNameCheck")&&Oc(z.tagNameCheck)&&(P.tagNameCheck=z.tagNameCheck),lt(z,"attributeNameCheck")&&Oc(z.attributeNameCheck)&&(P.attributeNameCheck=z.attributeNameCheck),lt(z,"allowCustomizedBuiltInElements")&&typeof z.allowCustomizedBuiltInElements=="boolean"&&(P.allowCustomizedBuiltInElements=z.allowCustomizedBuiltInElements),pe&&(X=!1),C&&(Ee=!0),st&&(me=Re({},Td),y=ea(null),st.html===!0&&(Re(me,Sd),Re(y,Cd)),st.svg===!0&&(Re(me,Lr),Re(y,Mr),Re(y,Ki)),st.svgFilters===!0&&(Re(me,Or),Re(y,Mr),Re(y,Ki)),st.mathMl===!0&&(Re(me,Dr),Re(y,Ed),Re(y,Ki))),U.tagCheck=null,U.attributeCheck=null,lt(_,"ADD_TAGS")&&(typeof _.ADD_TAGS=="function"?U.tagCheck=_.ADD_TAGS:Bt(_.ADD_TAGS)&&(me===Le&&(me=Ot(me)),Re(me,_.ADD_TAGS,it))),lt(_,"ADD_ATTR")&&(typeof _.ADD_ATTR=="function"?U.attributeCheck=_.ADD_ATTR:Bt(_.ADD_ATTR)&&(y===T&&(y=Ot(y)),Re(y,_.ADD_ATTR,it))),lt(_,"ADD_URI_SAFE_ATTR")&&Bt(_.ADD_URI_SAFE_ATTR)&&Re(Aa,_.ADD_URI_SAFE_ATTR,it),lt(_,"FORBID_CONTENTS")&&Bt(_.FORBID_CONTENTS)&&(Je===en&&(Je=Ot(Je)),Re(Je,_.FORBID_CONTENTS,it)),lt(_,"ADD_FORBID_CONTENTS")&&Bt(_.ADD_FORBID_CONTENTS)&&(Je===en&&(Je=Ot(Je)),Re(Je,_.ADD_FORBID_CONTENTS,it)),Ge&&(me["#text"]=!0),ce&&Re(me,["html","head","body"]),me.table&&(Re(me,["tbody"]),delete G.tbody),_.TRUSTED_TYPES_POLICY){if(typeof _.TRUSTED_TYPES_POLICY.createHTML!="function")throw xn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof _.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw xn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=L;L=_.TRUSTED_TYPES_POLICY;try{O=F("")}catch(we){throw L=ae,we}}else _.TRUSTED_TYPES_POLICY===null?(L=void 0,O=""):(L===void 0&&(L=W()),L&&typeof O=="string"&&(O=F("")));(ve.uponSanitizeElement.length>0||ve.uponSanitizeAttribute.length>0)&&me===Le&&(me=Ot(me)),ve.uponSanitizeAttribute.length>0&&y===T&&(y=Ot(y)),qt&&qt(_),zn=_},Dc=Re({},[...Lr,...Or,...J_]),Mc=Re({},[...Dr,...Y_]),mg=function(_){let z=A(_);(!z||!z.tagName)&&(z={namespaceURI:H,tagName:"template"});const ae=za(_.tagName),we=za(z.tagName);return _e[_.namespaceURI]?_.namespaceURI===jn?z.namespaceURI===Kt?ae==="svg":z.namespaceURI===Vn?ae==="svg"&&(we==="annotation-xml"||nt[we]):!!Dc[ae]:_.namespaceURI===Vn?z.namespaceURI===Kt?ae==="math":z.namespaceURI===jn?ae==="math"&&Nt[we]:!!Mc[ae]:_.namespaceURI===Kt?z.namespaceURI===jn&&!Nt[we]||z.namespaceURI===Vn&&!nt[we]?!1:!Mc[ae]&&(rr[ae]||!Dc[ae]):!!(Ra==="application/xhtml+xml"&&_e[_.namespaceURI]):!1},hs=function(_){Zn(t.removed,{element:_});try{A(_).removeChild(_)}catch{if(m(_),!A(_))throw xn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Pc=function(_){const z=k?k(_):_.childNodes;if(z){const we=[];Ds(z,Ce=>{Zn(we,Ce)}),Ds(we,Ce=>{try{m(Ce)}catch{}})}const ae=v?v(_):null;if(ae)for(let we=ae.length-1;we>=0;--we){const Ce=ae[we],Ne=Ce&&Ce.name;if(typeof Ne=="string")try{_.removeAttribute(Ne)}catch{}}},vn=function(_,z){try{Zn(t.removed,{attribute:z.getAttributeNode(_),from:z})}catch{Zn(t.removed,{attribute:null,from:z})}if(z.removeAttribute(_),_==="is")if(Ee||C)try{hs(z)}catch{}else try{z.setAttribute(_,"")}catch{}},vg=function(_){const z=v?v(_):_.attributes;if(z)for(let ae=z.length-1;ae>=0;--ae){const we=z[ae],Ce=we&&we.name;if(!(typeof Ce!="string"||y[it(Ce)]))try{_.removeAttribute(Ce)}catch{}}},bg=function(_){const z=[_];for(;z.length>0;){const ae=z.pop();(x?x(ae):ae.nodeType)===xs.element&&vg(ae);const Ce=k?k(ae):ae.childNodes;if(Ce)for(let Ne=Ce.length-1;Ne>=0;--Ne)z.push(Ce[Ne])}},Fc=function(_){let z=null,ae=null;if(Se)_="<remove></remove>"+_;else{const Ne=xd(_,/^[\r\n\t ]+/);ae=Ne&&Ne[0]}Ra==="application/xhtml+xml"&&H===Kt&&(_='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+_+"</body></html>");const we=L?F(_):_;if(H===Kt)try{z=new u().parseFromString(we,Ra)}catch{}if(!z||!z.documentElement){z=V.createDocument(H,"template",null);try{z.documentElement.innerHTML=ne?O:we}catch{}}const Ce=z.body||z.documentElement;return _&&ae&&Ce.insertBefore(s.createTextNode(ae),Ce.childNodes[0]||null),H===Kt?q.call(z,ce?"html":"body")[0]:ce?z.documentElement:Ce},$c=function(_){return N.call(_.ownerDocument||_,_,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},cr=function(_){var z,ae;_.normalize();const we=N.call(_.ownerDocument||_,_,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Ce=we.nextNode();for(;Ce;){let vt=Ce.data;Ds([se,de,J],Qe=>{vt=Jn(vt,Qe," ")}),Ce.data=vt,Ce=we.nextNode()}const Ne=(z=(ae=_.querySelectorAll)===null||ae===void 0?void 0:ae.call(_,"template"))!==null&&z!==void 0?z:[];Ds(Array.from(Ne),vt=>{qn(vt.content)&&cr(vt.content)})},Li=function(_){const z=R?R(_):null;return typeof z!="string"||it(z)!=="form"?!1:typeof _.nodeName!="string"||typeof _.textContent!="string"||typeof _.removeChild!="function"||_.attributes!==v(_)||typeof _.removeAttribute!="function"||typeof _.setAttribute!="function"||typeof _.namespaceURI!="string"||typeof _.insertBefore!="function"||typeof _.hasChildNodes!="function"||_.nodeType!==x(_)||_.childNodes!==k(_)},qn=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return x(_)===xs.documentFragment}catch{return!1}},Ia=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return typeof x(_)=="number"}catch{return!1}};function Is(he,_,z){Ds(he,ae=>{ae.call(t,_,z,zn)})}const Uc=function(_){let z=null;if(Is(ve.beforeSanitizeElements,_,null),Li(_))return hs(_),!0;const ae=it(R?R(_):_.nodeName);if(Is(ve.uponSanitizeElement,_,{tagName:ae,allowedTags:me}),ie&&_.hasChildNodes()&&!Ia(_.firstElementChild)&&Tt(/<[/\w!]/g,_.innerHTML)&&Tt(/<[/\w!]/g,_.textContent)||ie&&_.namespaceURI===Kt&&ae==="style"&&Ia(_.firstElementChild)||_.nodeType===xs.progressingInstruction||ie&&_.nodeType===xs.comment&&Tt(/<[/\w]/g,_.data))return hs(_),!0;if(G[ae]||!(U.tagCheck instanceof Function&&U.tagCheck(ae))&&!me[ae]){if(!G[ae]&&Hc(ae)&&(P.tagNameCheck instanceof RegExp&&Tt(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae)))return!1;if(Ge&&!Je[ae]){const Ce=A(_),Ne=k(_);if(Ne&&Ce){const vt=Ne.length;for(let Qe=vt-1;Qe>=0;--Qe){const ct=St?Ne[Qe]:p(Ne[Qe],!0);Ce.insertBefore(ct,g(_))}}}return hs(_),!0}return(x?x(_):_.nodeType)===xs.element&&!mg(_)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&Tt(/<\/no(script|embed|frames)/i,_.innerHTML)?(hs(_),!0):(pe&&_.nodeType===xs.text&&(z=_.textContent,Ds([se,de,J],Ce=>{z=Jn(z,Ce," ")}),_.textContent!==z&&(Zn(t.removed,{element:_.cloneNode()}),_.textContent=z)),Is(ve.afterSanitizeElements,_,null),!1)},Bc=function(_,z,ae){if(E[z]||be&&(z==="id"||z==="name")&&(ae in s||ae in gg))return!1;const we=y[z]||U.attributeCheck instanceof Function&&U.attributeCheck(z,_);if(!(X&&!E[z]&&Tt(oe,z))){if(!(Z&&Tt(Ie,z))){if(!we||E[z]){if(!(Hc(_)&&(P.tagNameCheck instanceof RegExp&&Tt(P.tagNameCheck,_)||P.tagNameCheck instanceof Function&&P.tagNameCheck(_))&&(P.attributeNameCheck instanceof RegExp&&Tt(P.attributeNameCheck,z)||P.attributeNameCheck instanceof Function&&P.attributeNameCheck(z,_))||z==="is"&&P.allowCustomizedBuiltInElements&&(P.tagNameCheck instanceof RegExp&&Tt(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae))))return!1}else if(!Aa[z]){if(!Tt(ge,Jn(ae,re,""))){if(!((z==="src"||z==="xlink:href"||z==="href")&&_!=="script"&&_d(ae,"data:")===0&&mn[_])){if(!(te&&!Tt(j,Jn(ae,re,"")))){if(ae)return!1}}}}}}return!0},yg=Re({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Hc=function(_){return!yg[za(_)]&&Tt(le,_)},Vc=function(_){Is(ve.beforeSanitizeAttributes,_,null);const z=_.attributes;if(!z||Li(_))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let we=z.length;for(;we--;){const Ce=z[we],Ne=Ce.name,vt=Ce.namespaceURI,Qe=Ce.value,ct=it(Ne),tn=Qe;let _t=Ne==="value"?tn:j_(tn);if(ae.attrName=ct,ae.attrValue=_t,ae.keepAttr=!0,ae.forceKeepAttr=void 0,Is(ve.uponSanitizeAttribute,_,ae),_t=ae.attrValue,De&&(ct==="id"||ct==="name")&&_d(_t,Ze)!==0&&(vn(Ne,_),_t=Ze+_t),ie&&Tt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,_t)){vn(Ne,_);continue}if(ct==="attributename"&&xd(_t,"href")){vn(Ne,_);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){vn(Ne,_);continue}if(!Y&&Tt(/\/>/i,_t)){vn(Ne,_);continue}pe&&Ds([se,de,J],zc=>{_t=Jn(_t,zc," ")});const jc=it(_.nodeName);if(!Bc(jc,ct,_t)){vn(Ne,_);continue}if(L&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!vt)switch(d.getAttributeType(jc,ct)){case"TrustedHTML":{_t=F(_t);break}case"TrustedScriptURL":{_t=M(_t);break}}if(_t!==tn)try{vt?_.setAttributeNS(vt,Ne,_t):_.setAttribute(Ne,_t),Li(_)?hs(_):yd(t.removed)}catch{vn(Ne,_)}}Is(ve.afterSanitizeAttributes,_,null)},Oi=function(_){let z=null;const ae=$c(_);for(Is(ve.beforeSanitizeShadowDOM,_,null);z=ae.nextNode();)if(Is(ve.uponSanitizeShadowNode,z,null),Uc(z),Vc(z),qn(z.content)&&Oi(z.content),(x?x(z):z.nodeType)===xs.element){const Ce=b?b(z):z.shadowRoot;qn(Ce)&&(ur(Ce),Oi(Ce))}Is(ve.afterSanitizeShadowDOM,_,null)},ur=function(_){const z=[{node:_,shadow:null}];for(;z.length>0;){const ae=z.pop();if(ae.shadow){Oi(ae.shadow);continue}const we=ae.node,Ne=(x?x(we):we.nodeType)===xs.element,vt=k?k(we):we.childNodes;if(vt)for(let Qe=vt.length-1;Qe>=0;--Qe)z.push({node:vt[Qe],shadow:null});if(Ne){const Qe=R?R(we):null;if(typeof Qe=="string"&&it(Qe)==="template"){const ct=we.content;qn(ct)&&z.push({node:ct,shadow:null})}}if(Ne){const Qe=b?b(we):we.shadowRoot;qn(Qe)&&z.push({node:null,shadow:Qe},{node:Qe,shadow:null})}}};return t.sanitize=function(he){let _=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},z=null,ae=null,we=null,Ce=null;if(ne=!he,ne&&(he="<!-->"),typeof he!="string"&&!Ia(he)&&(he=W_(he),typeof he!="string"))throw xn("dirty is not a string, aborting");if(!t.isSupported)return he;ye||or(_),t.removed=[];const Ne=St&&typeof he!="string"&&Ia(he);if(Ne){const ct=R?R(he):he.nodeName;if(typeof ct=="string"){const tn=it(ct);if(!me[tn]||G[tn])throw xn("root node is forbidden and cannot be sanitized in-place")}if(Li(he))throw xn("root node is clobbered and cannot be sanitized in-place");try{ur(he)}catch(tn){throw Pc(he),tn}}else if(Ia(he))z=Fc("<!---->"),ae=z.ownerDocument.importNode(he,!0),ae.nodeType===xs.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?z=ae:z.appendChild(ae),ur(ae);else{if(!Ee&&!pe&&!ce&&he.indexOf("<")===-1)return L&&Q?F(he):he;if(z=Fc(he),!z)return Ee?null:Q?O:""}z&&Se&&hs(z.firstChild);const vt=$c(Ne?he:z);try{for(;we=vt.nextNode();)Uc(we),Vc(we),qn(we.content)&&Oi(we.content)}catch(ct){throw Ne&&Pc(he),ct}if(Ne)return Ds(t.removed,ct=>{ct.element&&bg(ct.element)}),pe&&cr(he),he;if(Ee){if(pe&&cr(z),C)for(Ce=D.call(z.ownerDocument);z.firstChild;)Ce.appendChild(z.firstChild);else Ce=z;return(y.shadowroot||y.shadowrootmode)&&(Ce=ue.call(n,Ce,!0)),Ce}let Qe=ce?z.outerHTML:z.innerHTML;return ce&&me["!doctype"]&&z.ownerDocument&&z.ownerDocument.doctype&&z.ownerDocument.doctype.name&&Tt(ik,z.ownerDocument.doctype.name)&&(Qe="<!DOCTYPE "+z.ownerDocument.doctype.name+`>
`+Qe),pe&&Ds([se,de,J],ct=>{Qe=Jn(Qe,ct," ")}),L&&Q?F(Qe):Qe},t.setConfig=function(){let he=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};or(he),ye=!0},t.clearConfig=function(){zn=null,ye=!1,L=S,O=""},t.isValidAttribute=function(he,_,z){zn||or({});const ae=it(he),we=it(_);return Bc(ae,we,z)},t.addHook=function(he,_){typeof _=="function"&&Zn(ve[he],_)},t.removeHook=function(he,_){if(_!==void 0){const z=H_(ve[he],_);return z===-1?void 0:V_(ve[he],z,1)[0]}return yd(ve[he])},t.removeHooks=function(he){ve[he]=[]},t.removeAllHooks=function(){ve=Rd()},t}var Id=Xh();function Sc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Bn=Sc();function eg(e){Bn=e}var Xa={exec:()=>null};function qe(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(jt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var jt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},ck=/^(?:[ \t]*(?:\n|$))+/,uk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,dk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Ri=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,fk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Tc=/(?:[*+-]|\d{1,9}[.)])/,tg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,sg=qe(tg).replace(/bull/g,Tc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),pk=qe(tg).replace(/bull/g,Tc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Cc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,hk=/^[^\n]+/,Ec=/(?!\s*\])(?:\\.|[^\[\]\\])+/,gk=qe(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Ec).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),mk=qe(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Tc).getRegex(),ar="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Ac=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,vk=qe("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Ac).replace("tag",ar).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),ng=qe(Cc).replace("hr",Ri).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ar).getRegex(),bk=qe(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",ng).getRegex(),Rc={blockquote:bk,code:uk,def:gk,fences:dk,heading:fk,hr:Ri,html:vk,lheading:sg,list:mk,newline:ck,paragraph:ng,table:Xa,text:hk},Nd=qe("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Ri).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ar).getRegex(),yk={...Rc,lheading:pk,table:Nd,paragraph:qe(Cc).replace("hr",Ri).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Nd).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ar).getRegex()},xk={...Rc,html:qe(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Ac).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Xa,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:qe(Cc).replace("hr",Ri).replace("heading",` *#{1,6} *[^
]`).replace("lheading",sg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},_k=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,kk=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,ag=/^( {2,}|\\)\n(?!\s*$)/,wk=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,ir=/[\p{P}\p{S}]/u,Ic=/[\s\p{P}\p{S}]/u,ig=/[^\s\p{P}\p{S}]/u,Sk=qe(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Ic).getRegex(),lg=/(?!~)[\p{P}\p{S}]/u,Tk=/(?!~)[\s\p{P}\p{S}]/u,Ck=/(?:[^\s\p{P}\p{S}]|~)/u,Ek=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,rg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Ak=qe(rg,"u").replace(/punct/g,ir).getRegex(),Rk=qe(rg,"u").replace(/punct/g,lg).getRegex(),og="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Ik=qe(og,"gu").replace(/notPunctSpace/g,ig).replace(/punctSpace/g,Ic).replace(/punct/g,ir).getRegex(),Nk=qe(og,"gu").replace(/notPunctSpace/g,Ck).replace(/punctSpace/g,Tk).replace(/punct/g,lg).getRegex(),Lk=qe("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,ig).replace(/punctSpace/g,Ic).replace(/punct/g,ir).getRegex(),Ok=qe(/\\(punct)/,"gu").replace(/punct/g,ir).getRegex(),Dk=qe(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Mk=qe(Ac).replace("(?:-->|$)","-->").getRegex(),Pk=qe("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Mk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Rl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Fk=qe(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Rl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),cg=qe(/^!?\[(label)\]\[(ref)\]/).replace("label",Rl).replace("ref",Ec).getRegex(),ug=qe(/^!?\[(ref)\](?:\[\])?/).replace("ref",Ec).getRegex(),$k=qe("reflink|nolink(?!\\()","g").replace("reflink",cg).replace("nolink",ug).getRegex(),Nc={_backpedal:Xa,anyPunctuation:Ok,autolink:Dk,blockSkip:Ek,br:ag,code:kk,del:Xa,emStrongLDelim:Ak,emStrongRDelimAst:Ik,emStrongRDelimUnd:Lk,escape:_k,link:Fk,nolink:ug,punctuation:Sk,reflink:cg,reflinkSearch:$k,tag:Pk,text:wk,url:Xa},Uk={...Nc,link:qe(/^!?\[(label)\]\((.*?)\)/).replace("label",Rl).getRegex(),reflink:qe(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Rl).getRegex()},xo={...Nc,emStrongRDelimAst:Nk,emStrongLDelim:Rk,url:qe(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Bk={...xo,br:qe(ag).replace("{2,}","*").getRegex(),text:qe(xo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Gi={normal:Rc,gfm:yk,pedantic:xk},$a={normal:Nc,gfm:xo,breaks:Bk,pedantic:Uk},Hk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Ld=e=>Hk[e];function ws(e,t){if(t){if(jt.escapeTest.test(e))return e.replace(jt.escapeReplace,Ld)}else if(jt.escapeTestNoEncode.test(e))return e.replace(jt.escapeReplaceNoEncode,Ld);return e}function Od(e){try{e=encodeURI(e).replace(jt.percentDecode,"%")}catch{return null}return e}function Dd(e,t){var i;const s=e.replace(jt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(jt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(jt.slashPipe,"|");return n}function Ua(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function Vk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Md(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function jk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Il=class{constructor(e){We(this,"options");We(this,"rules");We(this,"lexer");this.options=e||Bn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Ua(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=jk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Ua(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Ua(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Ua(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),u=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${u}`:u;const d=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(u,i,!0),this.lexer.state.top=d,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,m=p.raw+`
`+s.join(`
`),g=this.blockquote(m);i[i.length-1]=g,n=n.substring(0,n.length-p.raw.length)+g.raw,a=a.substring(0,a.length-p.text.length)+g.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,m=p.raw+`
`+s.join(`
`),g=this.list(m);i[i.length-1]=g,n=n.substring(0,n.length-f.raw.length)+g.raw,a=a.substring(0,a.length-p.raw.length)+g.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",u="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let d=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,A=>" ".repeat(3*A.length)),f=e.split(`
`,1)[0],p=!d.trim(),m=0;if(this.options.pedantic?(m=2,u=d.trimStart()):p?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,u=d.slice(m),m+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const A=this.rules.other.nextBulletRegex(m),b=this.rules.other.hrRegex(m),v=this.rules.other.fencesBeginRegex(m),x=this.rules.other.headingBeginRegex(m),R=this.rules.other.htmlBeginRegex(m);for(;e;){const L=e.split(`
`,1)[0];let O;if(f=L,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),O=f):O=f.replace(this.rules.other.tabCharGlobal,"    "),v.test(f)||x.test(f)||R.test(f)||A.test(f)||b.test(f))break;if(O.search(this.rules.other.nonSpaceChar)>=m||!f.trim())u+=`
`+O.slice(m);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(d)||x.test(d)||b.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=L+`
`,e=e.substring(L.length+1),d=O.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,k;this.options.gfm&&(g=this.rules.other.listIsTask.exec(u),g&&(k=g[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:k,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Dd(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Dd(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Ua(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Vk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Md(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Md(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const m=f.slice(1,-1);return{type:"em",raw:f,text:m,tokens:this.lexer.inlineTokens(m)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Vs=class _o{constructor(t){We(this,"tokens");We(this,"options");We(this,"state");We(this,"tokenizer");We(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Bn,this.options.tokenizer=this.options.tokenizer||new Il,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:jt,block:Gi.normal,inline:$a.normal};this.options.pedantic?(s.block=Gi.pedantic,s.inline=$a.pedantic):this.options.gfm&&(s.block=Gi.gfm,this.options.breaks?s.inline=$a.breaks:s.inline=$a.gfm),this.tokenizer.rules=s}static get rules(){return{block:Gi,inline:$a}}static lex(t,s){return new _o(s).lex(t)}static lexInline(t,s){return new _o(s).inlineTokens(t)}lex(t){t=t.replace(jt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(jt.tabCharGlobal,"    ").replace(jt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const u=t.slice(1);let d;this.options.extensions.startBlock.forEach(f=>{d=f.call({lexer:this},u),typeof d=="number"&&d>=0&&(c=Math.min(c,d))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const u=Object.keys(this.tokens.links);if(u.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)u.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let u;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(u=f.call({lexer:this},t,s))?(t=t.substring(u.raw.length),s.push(u),!0):!1))continue;if(u=this.tokenizer.escape(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.tag(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.link(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(u.raw.length);const f=s.at(-1);u.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(u=this.tokenizer.emStrong(t,n,l)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.codespan(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.br(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.del(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.autolink(t)){t=t.substring(u.raw.length),s.push(u);continue}if(!this.state.inLink&&(u=this.tokenizer.url(t))){t=t.substring(u.raw.length),s.push(u);continue}let d=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let m;this.options.extensions.startInline.forEach(g=>{m=g.call({lexer:this},p),typeof m=="number"&&m>=0&&(f=Math.min(f,m))}),f<1/0&&f>=0&&(d=t.substring(0,f+1))}if(u=this.tokenizer.inlineText(d)){t=t.substring(u.raw.length),u.raw.slice(-1)!=="_"&&(l=u.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Nl=class{constructor(e){We(this,"options");We(this,"parser");this.options=e||Bn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(jt.notSpaceStart))==null?void 0:i[0],a=e.replace(jt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+ws(n)+'">'+(s?a:ws(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:ws(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+ws(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ws(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Od(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+ws(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Od(e);if(a===null)return ws(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ws(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ws(e.text)}},Lc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},js=class ko{constructor(t){We(this,"options");We(this,"renderer");We(this,"textRenderer");this.options=t||Bn,this.options.renderer=this.options.renderer||new Nl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Lc}static parse(t,s){return new ko(s).parse(t)}static parseInline(t,s){return new ko(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Br,tl=(Br=class{constructor(e){We(this,"options");We(this,"block");this.options=e||Bn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Vs.lex:Vs.lexInline}provideParser(){return this.block?js.parse:js.parseInline}},We(Br,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Br),zk=class{constructor(...e){We(this,"defaults",Sc());We(this,"options",this.setOptions);We(this,"parse",this.parseMarkdown(!0));We(this,"parseInline",this.parseMarkdown(!1));We(this,"Parser",js);We(this,"Renderer",Nl);We(this,"TextRenderer",Lc);We(this,"Lexer",Vs);We(this,"Tokenizer",Il);We(this,"Hooks",tl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Nl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Il(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new tl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];tl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Vs.lex(e,t??this.defaults)}parser(e,t){return js.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?Vs.lex:Vs.lexInline,o=i.hooks?i.hooks.provideParser():e?js.parse:js.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+ws(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Mn=new zk;function Ve(e,t){return Mn.parse(e,t)}Ve.options=Ve.setOptions=function(e){return Mn.setOptions(e),Ve.defaults=Mn.defaults,eg(Ve.defaults),Ve};Ve.getDefaults=Sc;Ve.defaults=Bn;Ve.use=function(...e){return Mn.use(...e),Ve.defaults=Mn.defaults,eg(Ve.defaults),Ve};Ve.walkTokens=function(e,t){return Mn.walkTokens(e,t)};Ve.parseInline=Mn.parseInline;Ve.Parser=js;Ve.parser=js.parse;Ve.Renderer=Nl;Ve.TextRenderer=Lc;Ve.Lexer=Vs;Ve.lexer=Vs.lex;Ve.Tokenizer=Il;Ve.Hooks=tl;Ve.parse=Ve;Ve.options;Ve.setOptions;Ve.use;Ve.walkTokens;Ve.parseInline;js.parse;Vs.lex;const qk={breaks:!0,gfm:!0};function Pd(e){if(!e)return"";try{if(typeof Ve<"u"&&Ve.parse){const t=Ve.parse(e,qk);return typeof Id<"u"?Id.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Kk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Gk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function Wk(e){return Gk[e]||"wrench"}const Zk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Fd(e){if(!e)return[];const t=e.match(Zk);return t?[...new Set(t)]:[]}const Jk={template:`
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
                      style="max-width: 100%; border-radius: 6px; border: 1px solid var(--border); cursor: pointer;"
                      @click="openImage('data:' + file.content_type + ';base64,' + file.data)"
                      loading="lazy"
                    />
                    <a
                      v-else
                      :href="'data:' + file.content_type + ';base64,' + file.data"
                      :download="file.filename"
                      style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); color: var(--text-secondary); font-size: 13px; text-decoration: none;"
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=ee(()=>t.value.trim().length>0&&!s.value),d=ee(()=>{const B=ze.state;return B==="connected"?"Connected":B==="reconnecting"?"Reconnecting…":B==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=ee(()=>{const B=Math.floor(i.value/4)%f.length,V=i.value;return V>3?`${f[B]} (${V}s)`:f[0]});function m(){Et(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const B=a.value;B.style.height="auto",B.style.height=Math.min(B.scrollHeight,120)+"px"}function k(B,V,N={}){const D={id:++o,role:B,content:V,timestamp:Date.now(),html:B==="bot"?Pd(V):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:B==="bot"?Fd(V):[],files:N.files||[],_showTools:!1};return e.value.push(D),m(),B==="bot"&&Et(()=>A()),D}function A(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(V=>{V.setAttribute("data-copy","true"),V.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const D=V.querySelector("code"),q=D?D.textContent:V.textContent;navigator.clipboard.writeText(q).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),V.appendChild(N)})}function b(B){if(B===0)return!0;const V=e.value[B-1],N=e.value[B],D=new Date(V.timestamp).toDateString(),q=new Date(N.timestamp).toDateString();return D!==q}function v(B){const V=new Date(B),N=new Date;if(V.toDateString()===N.toDateString())return"Today";const D=new Date(N);return D.setDate(D.getDate()-1),V.toDateString()===D.toDateString()?"Yesterday":V.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function x(B){t.value=B,Et(()=>$())}function R(B){window.open(B,"_blank","noopener")}function L(B){B.target.style.display="none"}function O(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function S(){r&&(clearInterval(r),r=null),i.value=0}function I(B){s.value&&(s.value=!1,S(),B.type==="chat_response"?k("bot",B.content,{tools_used:B.tools_used||[],is_error:B.is_error||!1,files:B.files||[]}):B.type==="chat_error"&&k("bot",B.error||"Unknown error",{is_error:!0}),Et(()=>{var V;return(V=a.value)==null?void 0:V.focus()}))}async function w(B){try{const V=await K.post("/api/chat",{content:B,channel_id:l.value});k("bot",V.response,{tools_used:V.tools_used||[],is_error:V.is_error||!1,files:V.files||[]})}catch(V){k("bot",V.message||"Failed to send message",{is_error:!0})}}async function $(){const B=t.value.trim();!B||s.value||(k("user",B),t.value="",s.value=!0,O(),a.value&&(a.value.style.height="auto"),ze.connected?ze.sendChat(B,{channelId:l.value})?M():(await w(B),s.value=!1,S()):(await w(B),s.value=!1,S()),Et(()=>{var V;return(V=a.value)==null?void 0:V.focus()}))}let F=null;ds(s,B=>{B||F&&(clearTimeout(F),F=null)});function M(){F=setTimeout(()=>{s.value&&(s.value=!1,S(),k("bot","Response timed out. Try again.",{is_error:!0}))},12e4)}async function W(){try{if(!l.value){const V=await K.get("/api/auth/session");l.value=V.channel_id||V.user_id||"web-user"}const B=await K.get("/api/sessions/"+encodeURIComponent(l.value));if(B&&B.messages&&B.messages.length>0){for(const V of B.messages){const N=V.role==="user"?"user":"bot";let D=V.content||"";if(N==="user"){const ue=D.match(/^\[.*?\]:\s*/);ue&&(D=D.slice(ue[0].length))}if(!D.trim())continue;const q={id:++o,role:N,content:D,timestamp:V.timestamp?V.timestamp*1e3:Date.now(),html:N==="bot"?Pd(D):"",tools_used:[],is_error:!1,images:N==="bot"?Fd(D):[],files:[],_showTools:!1};e.value.push(q)}Et(()=>{m(),A()})}}catch{}}return $e(()=>{ze.subscribe("chat",I),W(),Et(()=>{var B;return(B=a.value)==null?void 0:B.focus()})}),ft(()=>{ze.unsubscribe("chat",I),F&&clearTimeout(F),S()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:$,autoResize:g,formatTime:Kk,formatDate:v,showDateSeparator:b,useSuggestion:x,openImage:R,onImageError:L,getToolIcon:Wk}}},lr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=C_(),s=Gh(),n=ee({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=ee(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=ee(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ds(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var u;return(u=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:u.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Yk={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,m;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const g={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(d==="tool_end"){const g=e.value.findIndex(k=>k.tool===u.action&&k.status==="running");if(g>=0){const k=e.value[g];k.status=(p=u.metadata)!=null&&p.error?"error":"success",k.elapsed=((m=u.metadata)==null?void 0:m.elapsed_ms)||Date.now()-k.startTime,k.result=u.detail||"",k.fadingOut=!0,setTimeout(()=>{const A=e.value.indexOf(k);A>=0&&e.value.splice(A,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const g=u.tool_name||"unknown";if(u.finished)delete s.value[g];else{const A=((s.value[g]||"")+(u.chunk||"")).split(`
`);s.value[g]=A.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(u=>{u.status==="running"&&(u.elapsed=c-u.startTime)})}$e(()=>{ze.on("events",a),i=setInterval(l,500)}),ft(()=>{ze.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"clock":c==="success"?"success":c==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
    <div class="space-y-6">
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
  `},Qk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=null;const r=ee(()=>e.value.filter(A=>A.status==="running").length),o=ee(()=>e.value.filter(A=>A.status==="completed").length),c=ee(()=>e.value.filter(A=>["failed","timeout","killed"].includes(A.status)).length),u=ee(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=ee(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(A=>["failed","timeout","killed"].includes(A.status)):e.value.filter(A=>A.status===i.value));function f(A){return Math.min(100,Math.round(A.iteration_count/30*100))}async function p(A=!1){A=A===!0,A||(t.value=!0);try{const b=await K.get("/api/agents");e.value=Array.isArray(b)?b:[],s.value=null}catch(b){A||(s.value=b.message)}A||(t.value=!1)}async function m(A){const b=e.value.find(x=>x.id===A);if(await ns({title:"Kill agent",message:`Kill agent "${(b==null?void 0:b.label)||A}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=A;try{await K.del(`/api/agents/${encodeURIComponent(A)}`),xe.success("Agent killed"),await p()}catch(x){xe.error(x.message||"Failed to kill agent")}n.value=null}}function g(){k(),a.value&&(l=setInterval(()=>{a.value&&p(!0)},5e3))}function k(){l&&(clearInterval(l),l=null)}return $e(()=>{p(),g()}),ft(()=>{k()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:Ea,formatDuration:wa,progressPercent:f,fetchAgents:p,killAgent:m,startAutoRefresh:g,stopAutoRefresh:k}}},Xk={template:`
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
          <label class="text-gray-400 text-xs block mb-1">Goal</label>
          <textarea v-model="form.goal" class="hm-input" rows="3"
                    placeholder="What should this loop accomplish? e.g. Monitor disk usage and warn if above 80%"></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Interval (seconds)</label>
            <input v-model.number="form.interval_seconds" type="number" class="hm-input"
                   min="10" placeholder="60" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Mode</label>
            <select v-model="form.mode" class="hm-input">
              <option value="notify">Notify (check + report)</option>
              <option value="act">Act (check + take actions + report)</option>
              <option value="silent">Silent (only report if notable)</option>
            </select>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Max Iterations</label>
            <input v-model.number="form.max_iterations" type="number" class="hm-input"
                   min="1" placeholder="50" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Stop Condition (optional)</label>
            <input v-model="form.stop_condition" type="text" class="hm-input"
                   placeholder="e.g. when disk is below 50%" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel ID</label>
            <input v-model="form.channel_id" type="text" class="hm-input"
                   placeholder="Discord channel ID" />
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

            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-400">
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
                <span class="tool-expand-icon" aria-hidden="true"><odin-icon name="chevronRight" :size="13" :class="{ 'rotate-90': expandedHistory[loop.id] }" /></span>
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=ee(()=>e.value.reduce((L,O)=>L+(O.iteration_count||0),0)),d=ee(()=>e.value.filter(L=>L.status==="running").length);function f(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function p(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function m(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}function g(L){c.value={...c.value,[L]:!c.value[L]}}async function k(L=!1){L=L===!0,L||(t.value=!0);try{e.value=await K.get("/api/loops"),s.value=null}catch(O){L||(s.value=O.message)}L||(t.value=!1)}async function A(){l.value=null;const L=a.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(O.stop_condition=L.stop_condition.trim()),i.value=!0;try{const S=await K.post("/api/loops",O);xe.success(`Loop started: ${S.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await k()}catch(S){l.value=S.message}i.value=!1}async function b(L){if(await ns({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=L;try{await K.del(`/api/loops/${encodeURIComponent(L)}`),xe.success("Loop stopped"),await k()}catch(S){xe.error(S.message||"Failed to stop loop")}r.value=null}}async function v(L){o.value=L;try{await K.post(`/api/loops/${encodeURIComponent(L)}/restart`),xe.success("Loop restarted"),await k()}catch(O){xe.error(O.message||"Failed to restart loop")}o.value=null}function x(L){L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&k(!0)}let R=null;return $e(()=>{k(),ze.subscribe("events",x),R=setInterval(()=>{k(!0)},5e3)}),ft(()=>{ze.unsubscribe("events",x),R&&clearInterval(R)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:m,formatDuration:wa,formatAge:Wh,toggleHistory:g,fetchLoops:k,doCreate:A,doStop:b,doRestart:v}}},ew={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=ee(()=>e.value.filter(g=>g.status==="running").length),r=ee(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function u(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(k){g||(s.value=k.message)}g||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ds(n,g=>{g?d():f()});async function p(g){if(await ns({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await K.del(`/api/processes/${g}`),xe.success(`Process ${g} killed`),await u()}catch(A){xe.error(A.message||"Failed to kill process")}i.value=null}}function m(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&u(!0)}return $e(()=>{u(),ze.subscribe("events",m),d()}),ft(()=>{ze.unsubscribe("events",m),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:wa,fetchProcesses:u,doKill:p}}},tw={template:`
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
          <label class="text-gray-400 text-xs block mb-1">Description</label>
          <input v-model="form.description" type="text" class="hm-input"
                 placeholder="e.g. Daily disk check" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Action Type</label>
            <select v-model="form.action" class="hm-input">
              <option value="reminder">Reminder</option>
              <option value="check">Check (tool call)</option>
              <option value="workflow">Workflow (multi-step)</option>
              <option value="digest">Digest</option>
            </select>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel ID</label>
            <input v-model="form.channel_id" type="text" class="hm-input"
                   placeholder="Discord channel ID" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Cron Expression</label>
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
            <label class="text-gray-400 text-xs block mb-1">One-Time (ISO datetime)</label>
            <input v-model="form.run_at" type="text" class="hm-input"
                   placeholder="e.g. 2026-04-01T09:00:00" />
          </div>
        </div>

        <div v-if="form.action === 'reminder'" class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Message</label>
          <input v-model="form.message" type="text" class="hm-input"
                 placeholder="Reminder message..." />
        </div>

        <div v-if="form.action === 'check'" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool Name</label>
            <input v-model="form.tool_name" type="text" class="hm-input"
                   placeholder="e.g. run_command" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool Input (JSON)</label>
            <input v-model="form.tool_input_str" type="text" class="hm-input"
                   placeholder='e.g. {"host":"server1"}' />
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),m=h(null),g=h([]),k=h(!1),A=ee(()=>e.value.filter(N=>N.cron&&!N.one_time).length),b=ee(()=>e.value.filter(N=>N.one_time).length),v=ee(()=>e.value.filter(N=>N.trigger).length),x=ee(()=>e.value.filter(N=>N.paused).length),R=ee(()=>e.value.filter(N=>N.consecutive_failures>0).length);function L(N){if(!N)return"-";const D=Date.now(),ue=(new Date(N).getTime()-D)/1e3;if(ue<0)return"overdue";if(ue<60)return"in < 1 min";if(ue<3600)return`in ${Math.floor(ue/60)} min`;if(ue<86400){const se=Math.floor(ue/3600),de=Math.floor(ue%3600/60);return de>0?`in ${se}h ${de}m`:`in ${se}h`}const ve=Math.floor(ue/86400);return`in ${ve} day${ve!==1?"s":""}`}function O(N){return N==null?"-":N<1e3?`${N}ms`:N<6e4?`${(N/1e3).toFixed(1)}s`:wa(N/1e3)}function S(){r.value=null}async function I(){const N=a.value.cron.trim();if(N){o.value=!0;try{r.value=await K.post("/api/schedules/validate-cron",{expression:N})}catch(D){r.value={valid:!1,error:D.message}}o.value=!1}}async function w(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(N){s.value=N.message}t.value=!1}async function $(N){if(m.value===N){m.value=null,g.value=[];return}m.value=N,k.value=!0,g.value=[];try{g.value=await K.get(`/api/schedules/${encodeURIComponent(N)}/history?limit=10`)}catch{g.value=[]}k.value=!1}async function F(){l.value=null;const N=a.value;if(!N.description.trim()){l.value="Description is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}if(!N.cron.trim()&&!N.run_at.trim()){l.value="Cron expression or run_at time is required";return}const D={description:N.description.trim(),action:N.action,channel_id:N.channel_id.trim()};if(N.cron.trim()&&(D.cron=N.cron.trim()),N.run_at.trim()&&(D.run_at=N.run_at.trim()),N.action==="reminder"&&N.message.trim()&&(D.message=N.message.trim()),N.action==="check"&&(N.tool_name.trim()&&(D.tool_name=N.tool_name.trim()),N.tool_input_str.trim()))try{D.tool_input=JSON.parse(N.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",D),xe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await w()}catch(q){l.value=q.message}i.value=!1}async function M(N){u.value=N;try{const D=await K.post(`/api/schedules/${encodeURIComponent(N)}/run`);if(D.status==="failure")xe.error(`Execution failed: ${D.error||"unknown error"}`);else{const q=D.warning?`Executed (${D.warning})`:"Executed successfully";xe.success(q)}await w()}catch(D){xe.error(D.message||"Failed to trigger")}u.value=null}async function W(N){f.value=N.id;const D=!N.paused;try{await K.put(`/api/schedules/${encodeURIComponent(N.id)}`,{paused:D}),xe.success(D?"Schedule paused":"Schedule resumed"),await w()}catch(q){xe.error(q.message||"Failed to update schedule")}f.value=null}async function B(N){p.value=N;try{await K.post(`/api/schedules/${encodeURIComponent(N)}/reset-failures`),xe.success("Failure counters reset"),await w()}catch(D){xe.error(D.message||"Failed to reset")}p.value=null}async function V(N){const D=e.value.find(ue=>ue.id===N);if(await ns({title:"Delete schedule",message:`Delete "${(D==null?void 0:D.description)||N}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=N;try{await K.del(`/api/schedules/${encodeURIComponent(N)}`),xe.success("Schedule deleted"),await w()}catch(ue){xe.error(ue.message||"Failed to delete schedule")}d.value=null}}return $e(()=>{w()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:m,history:g,historyLoading:k,cronCount:A,oneTimeCount:b,webhookCount:v,pausedCount:x,failingCount:R,formatTs:Ea,formatAge:Wh,formatFuture:L,formatMs:O,formatDuration:wa,onCronInput:S,validateCron:I,toggleExpand:$,fetchSchedules:w,doCreate:F,doRunNow:M,doTogglePause:W,doResetFailures:B,doDelete:V}}},sw={components:{TabbedPage:lr},setup(){return{tabs:[{id:"live",label:"Live",component:Yk},{id:"agents",label:"Agents",component:Qk},{id:"loops",label:"Loops",component:Xk},{id:"processes",label:"Processes",component:ew},{id:"schedules",label:"Schedules",component:tw}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},nw={template:`
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
            <label class="text-gray-400 text-xs block mb-1">Tool</label>
            <input v-model="filters.tool" type="text" class="hm-input"
                   placeholder="e.g. run_command" @keyup.enter="fetchAudit" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">User</label>
            <input v-model="filters.user" type="text" class="hm-input"
                   placeholder="User ID or name" @keyup.enter="fetchAudit" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Keyword</label>
            <input v-model="filters.keyword" type="text" class="hm-input"
                   placeholder="Search in output..." @keyup.enter="fetchAudit" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Date</label>
            <input v-model="filters.date" type="date" class="hm-input" @change="fetchAudit" />
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button @click="fetchAudit" class="btn btn-primary text-xs">Search</button>
          <button @click="clearFilters" class="btn btn-ghost text-xs">Clear Filters</button>
          <div class="flex-1"></div>
          <div class="flex items-center gap-2">
            <label class="text-gray-400 text-xs">Limit:</label>
            <select v-model="filters.limit" class="hm-input" style="width:auto;min-width:70px;" @change="fetchAudit">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
            </select>
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
            <tr @click="toggleExpand(i)" style="cursor:pointer;"
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await K.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return $e(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Ea,formatDetail:i,truncateBlock:Zh,toggleExpand:l,clearFilters:r,fetchAudit:o}}},$d=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],aw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],iw={template:`
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
          <button v-for="cp in customPresets" :key="cp.id"
                  @click="applyCustomPreset(cp)"
                  class="sess-preset-chip sess-preset-custom"
                  :class="{ 'sess-preset-active': activePreset === cp.id }">
            <odin-icon name="sparkles" :size="14" />
            <span>{{ cp.name }}</span>
            <span class="sess-preset-remove" @click.stop="removeCustomPreset(cp.id)"
                  title="Remove preset">&times;</span>
          </button>
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
            <div class="flex items-center gap-3 cursor-pointer" @click="toggleSession(s.channel_id)">
              <input type="checkbox" :checked="selected.has(s.channel_id)"
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
      <div v-if="clearTarget" class="modal-overlay" @click.self="clearTarget = null" @keyup.escape="clearTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sess-clear-title">
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
      <div v-if="bulkClearing" class="modal-overlay" @click.self="bulkClearing = false" @keyup.escape="bulkClearing = false" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sess-bulk-clear-title">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),m=$d,g=aw,k=h([]),A=h(!1),b=h(""),v=h("flat"),x=h(new Set),R=h(""),L=h(""),O=h(""),S=h(null),I=h(!1);function w(){try{const C=localStorage.getItem("odin-session-presets");C&&(k.value=JSON.parse(C))}catch{}}function $(){try{localStorage.setItem("odin-session-presets",JSON.stringify(k.value))}catch{}}const F=ee(()=>d.value.trim()!==""||u.value!=="all"),M=ee(()=>{let C=[...e.value];const Q=$d.find(Ge=>Ge.id===u.value),be=Q?Q.filters:{};if(be.source&&(C=C.filter(Ge=>Ge.source===be.source)),be.minMessages&&(C=C.filter(Ge=>Ge.message_count>=be.minMessages)),be.hasCompaction&&(C=C.filter(Ge=>Ge.has_summary)),be.maxAge!=null){const Ge=Date.now()/1e3;C=C.filter(St=>St.last_active&&Ge-St.last_active<=be.maxAge)}if(d.value.trim()){const Ge=d.value.toLowerCase().trim();C=C.filter(St=>(St.channel_id||"").toLowerCase().includes(Ge)||(St.last_user_id||"").toLowerCase().includes(Ge)||(St.source||"").toLowerCase().includes(Ge))}const De=f.value,Ze=p.value?1:-1;return C.sort((Ge,St)=>{const st=Ge[De]||0,Je=St[De]||0;return(st-Je)*Ze}),C}),W=ee(()=>{if(!a.value||!a.value.messages)return[];const C=a.value.messages;if(C.length===0)return[];const Q=[];let be=[];for(const De of C)De.role==="user"&&be.length>0&&(Q.push(be),be=[]),be.push(De);return be.length>0&&Q.push(be),Q}),B=ee(()=>M.value.length>0&&o.value.size===M.value.length);function V(C){const Q=C.find(be=>be.role==="user");if(Q&&Q.content){const be=Q.content.slice(0,120);return be.length<Q.content.length?be+"...":be}return"(no user message)"}function N(C){const Q=new Set(x.value);Q.has(C)?Q.delete(C):Q.add(C),x.value=Q}function D(C){u.value=C}function q(C){u.value=C.id,C.filters.searchQuery!=null&&(d.value=C.filters.searchQuery),C.filters.sortBy&&(f.value=C.filters.sortBy)}function ue(){if(!b.value.trim())return;const C={id:"custom-"+Date.now(),name:b.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};k.value=[...k.value,C],$(),A.value=!1,b.value=""}function ve(C){k.value=k.value.filter(Q=>Q.id!==C),$(),u.value===C&&(u.value="all")}function se(){u.value="all",d.value="",f.value="last_active",p.value=!1}function de(C){if(!C)return"—";const Q=Date.now()/1e3-C;if(Q<60)return"just now";if(Q<3600){const De=Math.floor(Q/60);return`${De} minute${De!==1?"s":""} ago`}if(Q<86400){const De=Math.floor(Q/3600);return`${De} hour${De!==1?"s":""} ago`}const be=Math.floor(Q/86400);return`${be} day${be!==1?"s":""} ago`}function J(C){if(!C)return"";try{return new Date(C*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function oe(C){if(!C)return"";try{return new Date(C*1e3).toLocaleString()}catch{return""}}function Ie(C){return C==="user"?"bg-gray-900/50 border border-gray-800":C==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function j(C){return C==="user"?"sess-msg-user":C==="assistant"?"sess-msg-assistant":"sess-msg-system"}function re(C){return C==="user"?"badge-info":C==="assistant"?"badge-success":"badge-warning"}function le(C){return C==="user"?"sess-dot-user":C==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ge(C){return C==="user"?"text-cyan-400":C==="assistant"?"text-indigo-400":"text-gray-500"}function me(C){return C?C.length>2e3?C.slice(0,2e3)+`
... (truncated)`:C:""}async function Le(){const C=R.value.trim();if(C){I.value=!0;try{let Q=`/api/sessions/search?q=${encodeURIComponent(C)}&limit=50`;L.value.trim()&&(Q+=`&channel_id=${encodeURIComponent(L.value.trim())}`),O.value.trim()&&(Q+=`&user_id=${encodeURIComponent(O.value.trim())}`);const be=await K.get(Q);S.value=be.results||[]}catch{S.value=[]}I.value=!1}}function y(){R.value="",L.value="",O.value="",S.value=null}function T(C){return C?C.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function P(C){return C==="user"?"bg-gray-900/50 border-gray-800":C==="assistant"?"bg-indigo-950/30 border-indigo-900/30":C==="summary"?"bg-amber-950/20 border-amber-900/30":C==="fts"?"bg-emerald-950/20 border-emerald-900/30":C==="channel"?"bg-purple-950/20 border-purple-900/30":"bg-gray-900/30 border-gray-800/50"}function G(C){return C==="user"?"badge-info":C==="assistant"?"badge-success":C==="summary"?"badge-warning":C==="fts"?"badge-success":"badge-info"}async function E(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(C){s.value=C.message}t.value=!1}function U(){s.value=null,E()}async function Z(C){if(n.value===C){n.value=null,a.value=null,x.value=new Set;return}n.value=C,a.value=null,i.value=!0,x.value=new Set;try{a.value=await K.get(`/api/sessions/${encodeURIComponent(C)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function X(C){const Q=new Set(o.value);Q.has(C)?Q.delete(C):Q.add(C),o.value=Q}function te(){B.value?o.value=new Set:o.value=new Set(M.value.map(C=>C.channel_id))}function Y(C){l.value=C}async function pe(){if(l.value){r.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await E()}catch(C){s.value=C.message||"Failed to clear session"}r.value=!1,l.value=null}}function ie(){c.value=!0}async function ce(){if(o.value.size!==0){r.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await E()}catch(C){s.value=C.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function ye(C,Q){const be=K._token;let De=`/api/sessions/${encodeURIComponent(C)}/export?format=${Q}`;be&&(De+=`&token=${encodeURIComponent(be)}`);const Ze=document.createElement("a");Ze.href=De,Ze.download=`session-${C}.${Q==="text"?"txt":"json"}`,document.body.appendChild(Ze),Ze.click(),document.body.removeChild(Ze)}let Se=null;function Ee(C){C.payload&&C.payload.channel_id&&(clearTimeout(Se),Se=setTimeout(()=>{E(),n.value&&C.payload.channel_id===n.value&&K.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(Q=>{a.value=Q}).catch(()=>{})},2e3))}return $e(()=>{w(),E(),ze.subscribe("events",Ee)}),ft(()=>{ze.unsubscribe("events",Ee),clearTimeout(Se)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:B,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:m,sortOptions:g,filteredSessions:M,hasActiveFilters:F,customPresets:k,showSavePreset:A,newPresetName:b,threadView:v,threads:W,collapsedThreads:x,ftsQuery:R,ftsChannelId:L,ftsUserId:O,ftsResults:S,ftsSearching:I,formatAge:de,formatTimestamp:J,formatFullTimestamp:oe,messageClass:Ie,threadMsgClass:j,roleBadge:re,roleDotClass:le,roleLabelClass:ge,truncateContent:me,threadSummary:V,fetchSessions:E,retry:U,toggleSession:Z,toggleSelect:X,toggleSelectAll:te,confirmClear:Y,clearSession:pe,confirmBulkClear:ie,doBulkClear:ce,exportSession:ye,applyPreset:D,applyCustomPreset:q,saveCustomPreset:ue,removeCustomPreset:ve,resetFilters:se,toggleThread:N,runFtsSearch:Le,clearFtsSearch:y,highlightSnippet:T,ftsResultClass:P,ftsTypeBadge:G}}},lw={props:["trace"],template:`
              <!-- Context trace (observability): what the prompt assembler did -->
              <div v-if="trace" class="mt-3">
                <div class="text-gray-400 text-xs mb-1">Context Assembly</div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
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
  `,setup(){return{formatTokens:N_}}},rw={components:{ContextAssemblyPanel:lw},template:`
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
            <label class="text-gray-400 text-xs block mb-1">Message ID</label>
            <input v-model="messageIdQuery" type="text" class="hm-input"
                   placeholder="Look up by message ID..." @keyup.enter="lookupMessage" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">File</label>
            <select v-model="selectedFile" class="hm-input" @change="fetchTraces">
              <option value="">All files</option>
              <option v-for="f in files" :key="f" :value="f">{{ f.replace('.jsonl', '') }}</option>
            </select>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool</label>
            <input v-model="filters.tool_name" type="text" class="hm-input"
                   placeholder="e.g. run_command" @keyup.enter="fetchTraces" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Filters</label>
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
            <label class="text-gray-400 text-xs block mb-1">Channel</label>
            <input v-model="filters.channel_id" type="text" class="hm-input"
                   placeholder="Channel ID" @keyup.enter="fetchTraces" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">User</label>
            <input v-model="filters.user_id" type="text" class="hm-input"
                   placeholder="User ID" @keyup.enter="fetchTraces" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Limit</label>
            <select v-model="filters.limit" class="hm-input" @change="fetchTraces">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
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
                <div class="flex items-center justify-between cursor-pointer"
                     @click="toggleIteration('single', idx)">
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
                <tr @click="toggleExpand(i)" style="cursor:pointer;"
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
                    <div class="flex items-center justify-between cursor-pointer"
                         @click.stop="toggleIteration('list', idx)">
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(O){if(!O)return"—";try{const S=new Date(O);return isNaN(S.getTime())?O:S.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function f(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function p(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function m(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function g(O){a.value===O?a.value=null:(a.value=O,c.value={})}function k(O,S){const I=O+"-"+S;c.value={...c.value,[I]:!c.value[I]}}function A(O,S){return!!c.value[O+"-"+S]}function b(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,R()}async function v(){try{const O=await K.get("/api/trajectories");e.value=O.files||[],o.value=O.count||0}catch{}}let x=0;async function R(){const O=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const S=await K.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(O!==x)return;let I=S.entries||[];u.value.tool_name&&(I=I.filter(w=>(w.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(I=I.filter(w=>w.is_error)),u.value.channel_id&&(I=I.filter(w=>w.channel_id===u.value.channel_id)),u.value.user_id&&(I=I.filter(w=>w.user_id===u.value.user_id)),t.value=I}else{const S=new URLSearchParams;u.value.channel_id&&S.set("channel_id",u.value.channel_id),u.value.user_id&&S.set("user_id",u.value.user_id),u.value.tool_name&&S.set("tool_name",u.value.tool_name),u.value.errors_only&&S.set("errors_only","true"),S.set("limit",String(u.value.limit));const I=S.toString(),w=await K.get(`/api/trajectories/search/query?${I}`);if(O!==x)return;t.value=w.results||[]}}catch(S){if(O!==x)return;n.value=S.message}O===x&&(s.value=!1)}async function L(){if(!l.value.trim())return;const O=++x;s.value=!0,n.value=null,c.value={};try{const S=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==x)return;i.value=S.entry||null,i.value||(n.value="No trace found for this message ID")}catch(S){if(O!==x)return;S.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=S.message}O===x&&(s.value=!1)}return $e(async()=>{await v(),await R()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:m,truncateBlock:Zh,toggleExpand:g,toggleIteration:k,isIterationExpanded:A,clearFilters:b,fetchFiles:v,fetchTraces:R,lookupMessage:L}}},ow={template:`
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

        <!-- By Channel -->
        <div v-if="activeTab === 'channel'" class="hm-card">
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

        <!-- By Tool -->
        <div v-if="activeTab === 'tool'" class="hm-card">
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

        <!-- Recent calls -->
        <div v-if="activeTab === 'recent'" class="hm-card">
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

        <div class="mt-4 text-xs text-slate-500">
          {{ data.pricing ? data.pricing.note : '' }}
        </div>
      </div>
    </div>
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=ee(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await K.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return $e(()=>{o(),i=setInterval(o,15e3)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:Jh,formatTime:kc,retry:c}}},cw={components:{TabbedPage:lr},setup(){return{tabs:[{id:"audit",label:"Audit",component:nw},{id:"sessions",label:"Sessions",component:iw},{id:"traces",label:"Traces",component:rw},{id:"usage",label:"Usage",component:ow}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Pr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],uw={template:`
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
                   @click="toggleExpand(t.name)">
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
                  <tr class="cursor-pointer" @click="toggleExpand(t.name)">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=ee(()=>e.value.filter(b=>b.is_core).length),c=ee(()=>e.value.filter(b=>!b.is_core).length),u=ee(()=>Object.values(a.value).reduce((b,v)=>b+v,0));function d(b){for(const v of Pr)if(v.id!=="other"&&v.match(b))return v.id;return"other"}const f=ee(()=>{let b=e.value;if(n.value){const v=n.value.toLowerCase();b=b.filter(x=>x.name.toLowerCase().includes(v)||(x.description||"").toLowerCase().includes(v))}return r.value&&(b=b.filter(v=>d(v.name)===r.value)),b}),p=ee(()=>{const b=new Set;for(const v of e.value)b.add(d(v.name));return Pr.filter(v=>b.has(v.id))}),m=ee(()=>{const b=f.value,v={};for(const R of b){const L=d(R.name);v[L]||(v[L]=[]),v[L].push(R)}const x=[];for(const R of Pr)v[R.id]&&v[R.id].length>0&&x.push({label:R.label,icon:R.icon,tools:v[R.id].sort((L,O)=>L.name.localeCompare(O.name))});return x});function g(b){i.value={...i.value,[b]:!i.value[b]}}async function k(){t.value=!0,s.value=null;try{const[b,v]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({}))]);e.value=b,a.value=v||{};const x=Object.values(v||{}).filter(R=>R>0).sort((R,L)=>R-L)}catch(b){s.value=b.message}t.value=!1}function A(){k()}return $e(()=>{k()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:m,usedCategories:p,truncate:wc,toggleExpand:g,refresh:A}}};function dw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function fw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const pw={template:`
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
          <label class="sk-field-label">Name</label>
          <input v-model="editName" type="text" class="hm-input" placeholder="my_skill"
                 style="max-width:300px" />
          <div class="sk-field-hint">Lowercase, alphanumeric + underscores, starts with letter</div>
        </div>

        <div class="mb-3">
          <label class="sk-field-label">Code</label>
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
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null" @keyup.escape="deleteTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="skill-delete-title">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),m=h(!1),g=h(null),k=h(null),A=h(!1),b=ee(()=>e.value.length),v=ee(()=>e.value.reduce((J,oe)=>J+(oe.execution_count||0),0)),x=ee(()=>e.value.reduce((J,oe)=>J+w(oe.code),0)),R=ee(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(oe=>oe.name.toLowerCase().includes(J)||(oe.description||"").toLowerCase().includes(J))}),L=ee(()=>d.value?d.value.split(`
`).length:0),O=ee(()=>{const J=Math.max(L.value,1);return Array.from({length:J},(oe,Ie)=>Ie+1).join(`
`)}),S=ee(()=>{const J=d.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function I(J){return dw(J)}function w(J){return J?J.split(`
`).length:0}function $(J){return fw(J)}function F(J){n.value={...n.value,[J]:!n.value[J]}}async function M(J){try{await navigator.clipboard.writeText(J);const oe=e.value.find(Ie=>Ie.code===J);oe&&(r.value=oe.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function W(J){if(J.key==="Tab"){J.preventDefault();const oe=J.target,Ie=oe.selectionStart,j=oe.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(j),Et(()=>{oe.selectionStart=oe.selectionEnd=Ie+4})}}function B(J){const oe=J.target.previousElementSibling;oe&&(oe.scrollTop=J.target.scrollTop)}async function V(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function N(J){i.value=J,delete a.value[J],a.value={...a.value};try{const oe=await K.post(`/api/skills/${encodeURIComponent(J)}/test`);a.value={...a.value,[J]:oe}}catch(oe){a.value={...a.value,[J]:{result:oe.message,is_error:!0}}}i.value=null}function D(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function q(J){o.value=!0,c.value="edit",u.value=J.name,d.value=J.code||"",f.value=null,p.value=null}function ue(){o.value=!1,f.value=null,p.value=null}async function ve(){f.value=null,p.value=null;const J=u.value.trim(),oe=d.value.trim();if(!J){f.value="Name is required";return}if(!oe){f.value="Code is required";return}m.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:J,code:oe}),p.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(J)}`,{code:oe}),p.value="Skill updated successfully"),await V(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}m.value=!1}function se(J){k.value=J}async function de(){if(k.value){A.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(k.value)}`),await V()}catch{}A.value=!1,k.value=null}}return $e(()=>{V()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:m,editorRef:g,deleteTarget:k,deleting:A,enabledCount:b,totalExecutions:v,totalLines:x,displayedSkills:R,editLineCount:L,editorLineNums:O,editValidation:S,highlight:I,truncate:wc,formatTs:Ea,countLines:w,getLineNumbers:$,toggleCode:F,copyCode:M,handleEditorKey:W,syncScroll:B,fetchSkills:V,testSkill:N,showCreate:D,editSkill:q,cancelEdit:ue,saveSkill:ve,confirmDelete:se,doDelete:de}}};function hw(e,t){if(!e||!t)return md(e);const s=md(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const gw={template:`
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
          <label class="text-gray-400 text-xs block mb-1">Source Name</label>
          <input v-model="ingestSource" type="text" class="hm-input" placeholder="e.g. project-docs, api-reference" />
        </div>
        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Content</label>
          <textarea v-model="ingestContent" class="hm-input" rows="8"
                    placeholder="Paste document content here..."></textarea>
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
                     class="kb-chunk-item" :class="{ 'kb-chunk-selected': selectedChunk === chunk.chunk_id }"
                     @click="selectedChunk = selectedChunk === chunk.chunk_id ? null : chunk.chunk_id">
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
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null" @keyup.escape="deleteTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="kb-delete-title">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),m=h(null),g=h(null);let k=null;const A=h(null),b=h(!1),v=h({}),x=h({}),R=h(null),L=h(null),O=ee(()=>e.value.reduce((D,q)=>D+(q.chunks||0),0)),S=ee(()=>new Set(e.value.map(q=>q.uploader).filter(Boolean)).size);function I(D,q){const ue=x.value[q];if(!ue||ue.length===0)return 0;const ve=Math.max(...ue.map(se=>se.char_count||0));return ve===0?0:Math.round(D.char_count/ve*100)}async function w(){t.value=!0,s.value=null;try{const D=await K.get("/api/knowledge");e.value=Array.isArray(D)?D:[]}catch(D){s.value=D.message}t.value=!1}async function $(D){if(v.value[D]){v.value[D]=!1,L.value=null;return}if(v.value[D]=!0,!(x.value[D]||R.value===D)){R.value=D;try{const q=await K.get(`/api/knowledge/${encodeURIComponent(D)}/chunks`);x.value[D]=Array.isArray(q)?q:[]}catch(q){x.value[D]=[],xe.error(`Failed to load chunks: ${q.message}`)}R.value=null}}async function F(){const D=n.value.trim();if(D){i.value=!0,r.value=null,l.value=D;try{const q=await K.get(`/api/knowledge/search?q=${encodeURIComponent(D)}`);a.value=Array.isArray(q)?q:[]}catch(q){a.value=[],r.value=q.message||"Search failed"}i.value=!1}}function M(){a.value=null,n.value="",r.value=null}async function W(){d.value=null,f.value=null;const D=c.value.trim(),q=u.value.trim();if(!D){d.value="Source name is required";return}if(!q){d.value="Content is required";return}p.value=!0;try{const ue=await K.post("/api/knowledge",{source:D,content:q});f.value=`Ingested ${ue.chunks||0} chunks from "${D}"`,c.value="",u.value="",x.value={},await w(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(ue){d.value=ue.message}p.value=!1}async function B(D){m.value=D,g.value=null,k&&(clearTimeout(k),k=null);try{const q=await K.post(`/api/knowledge/${encodeURIComponent(D)}/reingest`);g.value={source:D,error:!1,message:`Re-ingested ${q.chunks||0} chunks`},delete x.value[D],await w(),k=setTimeout(()=>{g.value=null,k=null},3e3)}catch(q){g.value={source:D,error:!0,message:q.message}}m.value=null}function V(D){A.value=D}async function N(){if(A.value){b.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(A.value)}`),delete x.value[A.value],await w()}catch{}b.value=!1,A.value=null}}return $e(()=>{w()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:m,reingestResult:g,deleteTarget:A,deleting:b,expanded:v,sourceChunks:x,loadingChunks:R,selectedChunk:L,totalChunks:O,uploaderCount:S,truncate:wc,formatTs:Ea,highlightTerms:hw,chunkBarWidth:I,fetchSources:w,toggleSource:$,doSearch:F,clearSearch:M,doIngest:W,doReingest:B,confirmDelete:V,doDelete:N}}},mw={template:`
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
            <label class="text-gray-400 text-xs block mb-1">Scope</label>
            <input v-model="addForm.scope" type="text" class="hm-input"
                   placeholder="e.g. global, user:12345" />
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Key</label>
            <input v-model="addForm.key" type="text" class="hm-input"
                   placeholder="e.g. preferred_language" />
          </div>
        </div>
        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Value</label>
          <textarea v-model="addForm.value" class="hm-input" rows="3"
                    placeholder="Enter value..."></textarea>
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
          <div class="mem-tree-header" @click="toggleScope(scope.name)">
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
                  <textarea v-model="editValue" class="hm-input text-sm" rows="2"></textarea>
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
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null" @keyup.escape="deleteTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mem-delete-title">
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
      <div v-if="showBulkDelete" class="modal-overlay" @click.self="showBulkDelete = false" @keyup.escape="showBulkDelete = false" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mem-bulk-delete-title">
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),m=h(!1),g=h(null),k=h(null),A=h(new Set),b=h(null),v=h(!1),x=h(!1),R=ee(()=>e.value.reduce((se,de)=>se+de.count,0)),L=ee(()=>A.value.size);function O(se){const de=t.value[se];if(!de)return[];if(!l.value.trim())return de;const J=l.value.trim().toLowerCase();return de.filter(oe=>oe.key.toLowerCase().includes(J)||oe.value&&oe.value.toLowerCase().includes(J))}function S(se,de){return A.value.has(se+"/"+de)}function I(se,de){const J=se+"/"+de,oe=new Set(A.value);oe.has(J)?oe.delete(J):oe.add(J),A.value=oe}function w(se){const de=t.value[se];return!de||de.length===0?!1:de.every(J=>A.value.has(se+"/"+J.key))}function $(se,de){const J=t.value[se];if(!J)return;const oe=new Set(A.value);for(const Ie of J){const j=se+"/"+Ie.key;de?oe.add(j):oe.delete(j)}A.value=oe}async function F(){s.value=!0,n.value=null;try{const se=await K.get("/api/memory");e.value=Object.entries(se).map(([de,J])=>({name:de,keys:J.keys||[],count:J.count||0}))}catch(se){n.value=se.message}s.value=!1}async function M(se){if(a.value[se]){a.value[se]=!1;return}a.value[se]=!0;const de=e.value.find(oe=>oe.name===se);if(!de||t.value[se]||i.value===se)return;i.value=se;const J=await Promise.all(de.keys.map(async oe=>{try{const Ie=await K.get(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(oe)}`);return{key:oe,value:Ie.value||""}}catch{return{key:oe,value:"(error loading)"}}}));t.value[se]=J,i.value=null}function W(se,de,J){f.value=se+"/"+de,p.value=J}async function B(se,de){m.value=!0,g.value=null;try{await K.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`,{value:p.value});const J=t.value[se];if(J){const oe=J.find(Ie=>Ie.key===de);oe&&(oe.value=p.value)}f.value=null}catch(J){g.value=`Failed to save: ${J.message||"unknown error"}`}m.value=!1}async function V(se,de){try{await navigator.clipboard.writeText(de.value),k.value=se+"/"+de.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function N(){u.value=null,d.value=null;const se=o.value.scope.trim(),de=o.value.key.trim(),J=o.value.value.trim();if(!se){u.value="Scope is required";return}if(!de){u.value="Key is required";return}if(!J){u.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`,{value:J}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await F(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(oe){u.value=oe.message}c.value=!1}function D(se,de){b.value={scope:se,key:de}}async function q(){if(!b.value)return;v.value=!0,g.value=null;const{scope:se,key:de}=b.value;try{await K.del(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`);const J=t.value[se];J&&(t.value[se]=J.filter(j=>j.key!==de));const oe=e.value.find(j=>j.name===se);oe&&(oe.count--,oe.keys=oe.keys.filter(j=>j!==de));const Ie=new Set(A.value);Ie.delete(se+"/"+de),A.value=Ie}catch(J){g.value=`Failed to delete: ${J.message||"unknown error"}`}v.value=!1,b.value=null}function ue(){x.value=!0}async function ve(){v.value=!0,g.value=null;const se=[];for(const de of A.value){const J=de.indexOf("/");se.push({scope:de.slice(0,J),key:de.slice(J+1)})}try{await K.post("/api/memory/bulk-delete",{entries:se}),A.value=new Set,t.value={},await F()}catch(de){g.value=`Bulk delete failed: ${de.message||"unknown error"}`}v.value=!1,x.value=!1}return $e(()=>{F()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:m,actionError:g,copied:k,selected:A,selectedCount:L,totalEntries:R,deleteTarget:b,deleting:v,showBulkDelete:x,fetchMemory:F,toggleScope:M,startEdit:W,doEdit:B,copyValue:V,doAdd:N,confirmDelete:D,doDelete:q,confirmBulkDelete:ue,doBulkDelete:ve,isSelected:S,toggleSelect:I,isScopeAllSelected:w,toggleSelectAll:$,filteredEntries:O}}},vw={template:`
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
                <textarea v-model="editContent" class="hm-input font-mono text-xs w-full" rows="3"></textarea>
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=ee(()=>[...new Set(e.value.map(k=>k.category))].sort()),o=ee(()=>{const g={};return e.value.forEach(k=>{g[k.category]=(g[k.category]||0)+1}),g}),c=ee(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function u(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function d(g){i.value=g.key,l.value=g.content}async function f(g){try{await K.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,xe.success("Entry updated"),await m()}catch(k){xe.error(k.message||"Failed to save entry")}}async function p(g){if(await ns({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(g)),xe.success("Entry deleted"),await m()}catch(A){xe.error(A.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const g=await K.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return $e(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:Ea,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:m}}},bw={components:{TabbedPage:lr},setup(){return{tabs:[{id:"tools",label:"Tools",component:uw},{id:"skills",label:"Skills",component:pw},{id:"knowledge",label:"Knowledge",component:gw},{id:"memory",label:"Memory",component:mw},{id:"learned",label:"Learned",component:vw}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},yw={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),m=ee(()=>e.value==="custom"),g=ee(()=>[...i.value,...l.value]),k=ee(()=>l.value.includes(e.value)),A=ee(()=>{var S;return m.value?t.value||"Odin":((S=a.value[e.value])==null?void 0:S.name)||e.value}),b=ee(()=>{var S;return m.value?s.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.identity)||""}),v=ee(()=>{var S;return m.value?n.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.voice)||""});async function x(){u.value=!0;try{const S=await K.get("/api/personality");e.value=S.preset||"odin",t.value=S.custom_name||"",s.value=S.custom_identity||"",n.value=S.custom_voice||"",a.value=S.presets||{},i.value=S.builtin_presets||[],l.value=S.user_presets||[]}catch(S){c.value=S.message}finally{u.value=!1}}async function R(){r.value=!0,c.value=null,o.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(S){c.value=S.message}finally{r.value=!1}}async function L(){const S=d.value.trim();if(S){p.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:S,display_name:A.value,identity:b.value,voice:v.value}),f.value=!1,d.value="",await x(),e.value=S.toLowerCase().replace(/ /g,"_")}catch(I){c.value=I.message}finally{p.value=!1}}}async function O(){if(await ns({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(I){c.value=I.message}}}return $e(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:m,isUserPreset:k,previewName:A,previewIdentity:b,previewVoice:v,saving:r,saved:o,error:c,loading:u,save:R,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:L,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
        <label class="block text-sm font-medium mb-2">Preset</label>
        <div class="flex items-center gap-2">
          <select v-model="preset" class="hm-input max-w-xs">
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
          <label class="block text-sm font-medium mb-1">Name</label>
          <input v-model="customName" class="hm-input w-full max-w-xs" placeholder="e.g. Muninn, Heimdall, Loki..." />
          <p class="text-gray-500 text-xs mt-1">The bot's name as used in prompts and responses.</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Identity</label>
          <textarea v-model="customIdentity" class="hm-input w-full" rows="4"
            placeholder="Describe who the bot is — background, role, perspective..."></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Voice</label>
          <textarea v-model="customVoice" class="hm-input w-full" rows="6"
            placeholder="Define communication style — tone, formatting, constraints. Use one rule per line starting with -"></textarea>
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
        <label class="block text-sm font-medium mb-2">New preset name</label>
        <div class="flex items-center gap-2">
          <input v-model="newPresetName" class="hm-input max-w-xs" placeholder="e.g. incident-commander"
            @keyup.enter="saveAsPreset" />
          <button @click="saveAsPreset" :disabled="savingPreset || !newPresetName.trim()" class="btn btn-primary text-sm">
            {{ savingPreset ? 'Saving...' : 'Save preset' }}
          </button>
        </div>
        <p class="text-gray-500 text-xs mt-1">Saves the current preview as a reusable preset.</p>
      </div>
    </template>
  </div>
  `},xw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},_w={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},kw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},ww={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=ee(()=>e.value.components||[]),i=ee(()=>kw[e.value.overall]||"text-gray-400"),l=ee(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=ee(()=>{const b=e.value.overall;return b==="healthy"?"All Systems Healthy":b==="degraded"?"Some Systems Degraded":b==="unhealthy"?"System Issues Detected":"Unknown"});function o(b){return xw[b]||"text-gray-400"}function c(b){return _w[b]||"info"}function u(b){return b==="ok"?"badge-success":b==="degraded"?"badge-warning":b==="down"?"badge-danger":"badge-info"}function d(b){return b==="closed"?"text-green-400":b==="half_open"?"text-yellow-400":b==="open"?"text-red-400":"text-gray-400"}function f(b){return b.replace(/_/g," ").replace(/\b\w/g,v=>v.toUpperCase())}function p(b){if(!b)return"—";try{return new Date(b).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return b}}function m(b){return b>=1e6?(b/1e6).toFixed(1)+"M":b>=1e3?(b/1e3).toFixed(1)+"K":String(b)}async function g(){n.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null}catch(b){s.value=b.message}finally{t.value=!1,n.value=!1}}function k(){t.value=!0,s.value=null,g()}let A=null;return $e(async()=>{await g(),A=setInterval(g,3e4)}),ft(()=>{A&&clearInterval(A)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:m,fetchHealth:g,retry:k}}},Sw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=ee(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=ee(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await K.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return $e(()=>{c(),i=setInterval(c,3e4)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:Jh,refresh:u,retry:d}}},Tw=["INFO","WARNING","ERROR"],Cw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Fr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Ew=[50,100,200,500],Aw={template:`
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
              <label class="text-xs text-gray-500">Level</label>
              <select v-model="searchLevel" class="hm-select text-xs" style="min-width:100px;">
                <option value="all">All</option>
                <option value="error">Errors only</option>
                <option value="info">Info only</option>
              </select>
            </div>

            <!-- Tool name -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Tool</label>
              <select v-model="searchTool" class="hm-select text-xs" style="min-width:140px;">
                <option value="">Any tool</option>
                <option v-for="t in (searchStats ? searchStats.tools || [] : [])" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <!-- Time range quick select -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Time range</label>
              <select v-model="searchTimePreset" @change="applySearchTimePreset" class="hm-select text-xs" style="min-width:130px;">
                <option value="">Custom / All</option>
                <option value="last_5m">Last 5 min</option>
                <option value="last_15m">Last 15 min</option>
                <option value="last_1h">Last 1 hour</option>
                <option value="last_4h">Last 4 hours</option>
                <option value="last_24h">Last 24 hours</option>
                <option value="last_7d">Last 7 days</option>
              </select>
            </div>

            <!-- Start time -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">From</label>
              <input v-model="searchStart" type="datetime-local" class="hm-input text-xs" style="min-width:170px;" />
            </div>

            <!-- End time -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">To</label>
              <input v-model="searchEnd" type="datetime-local" class="hm-input text-xs" style="min-width:170px;" />
            </div>

            <!-- Keyword -->
            <div class="flex flex-col gap-1 flex-1" style="min-width:150px;">
              <label class="text-xs text-gray-500">Keyword</label>
              <input v-model="searchKeyword" type="text" class="hm-input text-xs"
                     placeholder="Search text..."
                     @keyup.enter="runSearch" />
            </div>

            <!-- Limit -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Limit</label>
              <select v-model.number="searchLimit" class="hm-select text-xs" style="min-width:80px;">
                <option v-for="l in searchLimits" :key="l" :value="l">{{ l }}</option>
              </select>
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
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1 mb-2" style="max-width:500px;">
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(ze.state||"disconnected"),c=ee(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,m=Tw,g=Cw,k=Fr,A=h("all"),b=h(""),v=h([]),x=h(!1),R=h(""),L=h([]);function O(){try{const H=localStorage.getItem("odin-log-presets");H&&(v.value=JSON.parse(H))}catch{}}function S(){try{localStorage.setItem("odin-log-presets",JSON.stringify(v.value))}catch{}}const I=ee(()=>a.value!==""||i.value.trim()!==""||b.value!==""),w=ee(()=>{const H=Fr.find(ne=>ne.value===b.value);return H?H.label:""}),$=ee(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(H){return H.message}}),F=24,M=ee(()=>{if(t.value.length===0)return[];const H=[],ne=new Date,_e=3600*1e3;for(let Ye=F-1;Ye>=0;Ye--){const nt=new Date(ne.getTime()-(Ye+1)*_e),Nt=new Date(ne.getTime()-Ye*_e);H.push({start:nt,end:Nt,label:N(nt,Nt),shortLabel:Nt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ye of t.value){if(!Ye._time)continue;const nt=Ye._time.getTime();for(const Nt of H)if(nt>=Nt.start.getTime()&&nt<Nt.end.getTime()){Nt.total++,Ye.level==="ERROR"?Nt.errors++:Ye.level==="WARNING"?Nt.warnings++:Nt.info++;break}}return H}),W=ee(()=>{let H=1;for(const ne of M.value)ne.total>H&&(H=ne.total);return H}),B=ee(()=>M.value.length===0?"":"Last 24 hours"),V=ee(()=>Math.ceil(F/8));function N(H,ne){const _e={hour:"2-digit",minute:"2-digit"};return H.toLocaleTimeString([],_e)+" - "+ne.toLocaleTimeString([],_e)}function D(H,ne){return!ne||!H?"0px":Math.max(2,H/ne*100)+"%"}function q(H){const ne=ue.value.findIndex(_e=>_e._time&&_e._time.getTime()>=H.start.getTime()&&_e._time.getTime()<H.end.getTime());if(ne>=0&&u.value){const _e=u.value.querySelectorAll(".log-line");_e[ne]&&(_e[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const ue=ee(()=>{let H=t.value;if(a.value&&(H=H.filter(ne=>(ne.level||"INFO")===a.value)),b.value){const ne=Fr.find(_e=>_e.value===b.value);if(ne&&ne.seconds){const _e=new Date(Date.now()-ne.seconds*1e3);H=H.filter(Ye=>Ye._time&&Ye._time>=_e)}}if(i.value&&!$.value)if(l.value)try{const ne=new RegExp(i.value,"i");H=H.filter(_e=>{const Ye=_e.text||_e.raw||"",nt=_e.tool||"";return ne.test(Ye)||ne.test(nt)})}catch{}else{const ne=i.value.toLowerCase();H=H.filter(_e=>{const Ye=(_e.text||_e.raw||"").toLowerCase(),nt=(_e.tool||"").toLowerCase();return Ye.includes(ne)||nt.includes(ne)})}return H});function ve(H){if(H.type==="log"&&H.line)try{const ne=typeof H.line=="string"?JSON.parse(H.line):H.line,_e=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:_e.toLocaleTimeString(),_time:_e,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(H.line),tool:"",raw:String(H.line)}}if(H.payload){const ne=H.payload,_e=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:_e.toLocaleTimeString(),_time:_e,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof H=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:H,tool:"",raw:H}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(H),tool:"",raw:null}}function se(H){const ne=ve(H);if(s.value){L.value.push(ne);return}de(ne)}function de(H){t.value.push(H),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Et(()=>J())}function J(){const H=u.value;if(H){const ne=H.scrollHeight-H.scrollTop-H.clientHeight;H.scrollTo({top:H.scrollHeight,behavior:ne<500?"smooth":"instant"})}}function oe(){n.value=!0,d.value=!1,Et(()=>J())}function Ie(){const H=u.value;if(!H)return;const ne=H.scrollHeight-H.scrollTop-H.clientHeight<40;d.value=!ne&&t.value.length>0,!ne&&n.value&&(n.value=!1)}function j(){if(s.value=!s.value,!s.value&&L.value.length>0){for(const H of L.value)de(H);L.value=[]}}function re(){t.value=[],L.value=[],d.value=!1}function le(){let H;e.value==="search"?H=Q.value.map(nt=>{const Nt=nt.error?"ERROR":"INFO",rr=nt.tool_name?`[${nt.tool_name}] `:"";return`${nt.timestamp||""} ${Nt} ${rr}${nt.result_summary||nt.message||""}`}).join(`
`):H=ue.value.map(nt=>`${nt.ts} ${nt.level} ${nt.text}`).join(`
`);const ne=new Blob([H],{type:"text/plain"}),_e=URL.createObjectURL(ne),Ye=document.createElement("a");Ye.href=_e,Ye.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ye.click(),URL.revokeObjectURL(_e)}function ge(H,ne){const _e=`${H.ts} ${H.level} ${H.text||H.raw||""}`;navigator.clipboard.writeText(_e).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function me(H){a.value=a.value===H?"":H,A.value="all"}function Le(H){return H.level==="ERROR"?"log-line-error":H.level==="WARNING"?"log-line-warning":"text-gray-300"}function y(H){return H==="ERROR"?"text-red-500 font-semibold":H==="WARNING"?"text-yellow-500":"text-blue-500"}function T(H){return H==="ERROR"?"log-chip-error":H==="WARNING"?"log-chip-warning":"log-chip-info"}function P(H){A.value=H.id;const ne=H.filters;a.value=ne.level||"",b.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function G(H){A.value=H.id,a.value=H.filters.level||"",b.value=H.filters.timeRange||"",i.value=H.filters.text||""}function E(){if(!R.value.trim())return;const H={id:"custom-"+Date.now(),name:R.value.trim(),filters:{level:a.value,timeRange:b.value,text:i.value}};v.value=[...v.value,H],S(),x.value=!1,R.value=""}function U(H){v.value=v.value.filter(ne=>ne.id!==H),S(),A.value===H&&(A.value="all")}const Z=h("all"),X=h(""),te=h(""),Y=h(""),pe=h(""),ie=h(""),ce=h(100),ye=Ew,Se=h(!1),Ee=h(!1),C=h(""),Q=h([]),be=h(null),De=h(null);function Ze(){e.value="search",be.value||Ge()}async function Ge(){try{be.value=await K.get("/api/logs/stats")}catch{}}function St(){const H=ie.value;if(!H){Y.value="",pe.value="";return}const _e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[H];if(_e){const Ye=new Date(Date.now()-_e*1e3);Y.value=st(Ye),pe.value=""}}function st(H){const ne=_e=>String(_e).padStart(2,"0");return`${H.getFullYear()}-${ne(H.getMonth()+1)}-${ne(H.getDate())}T${ne(H.getHours())}:${ne(H.getMinutes())}`}function Je(H){if(!H)return"";const ne=new Date(H);return isNaN(ne.getTime())?"":ne.toISOString()}async function en(){Se.value=!0,C.value="",Ee.value=!0,De.value=null;try{const H=new URLSearchParams;Z.value&&Z.value!=="all"&&H.set("level",Z.value),X.value&&H.set("tool",X.value),te.value&&H.set("q",te.value);const ne=Je(Y.value),_e=Je(pe.value);ne&&H.set("start",ne),_e&&H.set("end",_e),H.set("limit",String(ce.value));const Ye=await K.get(`/api/logs/search?${H.toString()}`);Q.value=Ye.entries||[]}catch(H){C.value=H.message||"Search failed",Q.value=[]}finally{Se.value=!1}}function mn(){Z.value="all",X.value="",te.value="",Y.value="",pe.value="",ie.value="",ce.value=100,Q.value=[],Ee.value=!1,C.value="",De.value=null}function Ii(H){De.value=De.value===H?null:H}function Aa(H){if(!H.timestamp)return"";try{return new Date(H.timestamp).toLocaleString()}catch{return H.timestamp}}function Ni(H){return H.type==="web_action"?`${H.status||""} (${H.execution_time_ms||0}ms)`:(H.result_summary||"").slice(0,200)}function Vn(H){return H.error?"log-line-error":"text-gray-300"}function jn(H){try{return JSON.stringify(H,null,2)}catch{return String(H)}}let Kt=null;return $e(()=>{O(),ze.subscribe("logs",se),r.value=ze.connected,o.value=ze.state||"disconnected",Kt=ze.onStateChange;const H=ze.onStateChange;ze.onStateChange=(ne,_e)=>{o.value=ne,r.value=ne==="connected",H&&H(ne,_e)}}),ft(()=>{ze.unsubscribe("logs",se),Kt!==void 0&&(ze.onStateChange=Kt)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:ue,pauseBuffer:L,showJumpBottom:d,copiedIndex:f,regexError:$,levels:m,logPresets:g,timeRanges:k,timeRange:b,activeLogPreset:A,customLogPresets:v,showSaveLogPreset:x,newLogPresetName:R,hasActiveLogFilters:I,timeRangeLabel:w,timelineBuckets:M,timelineMax:W,timelineSpanLabel:B,timelineLabelSkip:V,togglePause:j,clearLogs:re,exportLogs:le,logLineClass:Le,levelClass:y,levelChipClass:T,toggleLevel:me,copyLine:ge,jumpToBottom:oe,onScroll:Ie,applyLogPreset:P,applyCustomLogPreset:G,saveLogCustomPreset:E,removeLogCustomPreset:U,segmentHeight:D,jumpToTimelineBucket:q,searchLevel:Z,searchTool:X,searchKeyword:te,searchStart:Y,searchEnd:pe,searchTimePreset:ie,searchLimit:ce,searchLimits:ye,searching:Se,searchRan:Ee,searchError:C,searchResults:Q,searchStats:be,expandedSearch:De,switchToSearch:Ze,runSearch:en,clearSearchFilters:mn,toggleSearchExpand:Ii,formatSearchTs:Aa,searchEntryText:Ni,searchLogLineClass:Vn,formatJson:jn,applySearchTimePreset:St}}},Rw=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Iw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Nw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1–128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},$r=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"database",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"server",sections:["tools"]},{key:"ui",label:"Web UI",icon:"globe",sections:["web"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"puzzle",sections:["issue_tracker"]}],dg="••••••••",Lw=50;function Ow(e){return Rw.has(e)}function Dw(e){return e===dg}function Wi(e){return JSON.parse(JSON.stringify(e))}function Nn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Mw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Nn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Nn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function Pw(e,t,s){const n=Nw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Ud(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Nn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Nn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Fw={template:`
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
              <div class="cfg-section-header cursor-pointer select-none" @click="toggleSection(section)">
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
          <div class="cfg-section-header cursor-pointer select-none" @click="toggleSection(section)">
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
      <div v-if="showDiffModal" class="modal-overlay" @click.self="showDiffModal = false" @keyup.escape="showDiffModal = false" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="cfg-diff-title">
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=ee(()=>d.value.length>0),m=ee(()=>f.value.length>0),g=ee(()=>r.value&&t.value?t.value:e.value),k=ee(()=>!e.value||!t.value?!1:!Nn(e.value,t.value)),A=ee(()=>!e.value||!t.value?0:Ud(e.value,t.value).length),b=ee(()=>{if(!r.value||!t.value)return{};const E={};for(const U of Object.keys(t.value)){const Z=t.value[U];if(typeof Z=="object"&&Z!==null&&!Array.isArray(Z))for(const X of Object.keys(Z)){const te=Pw(U,X,Z[X]);te&&(E[U+"."+X]=te)}}return E}),v=ee(()=>Object.keys(b.value).length>0),x=ee(()=>e.value?Object.keys(e.value).length:0),R=ee(()=>O.value.length),L=ee(()=>!e.value||!t.value?[]:Ud(e.value,t.value)),O=ee(()=>e.value?$r.map(E=>({...E,sections:E.sections.filter(U=>U in e.value)})).filter(E=>E.sections.length>0):[]),S=ee(()=>{if(!e.value)return[];const E=new Set($r.flatMap(U=>U.sections));return Object.keys(e.value).filter(U=>!E.has(U))});function I(E){return g.value?g.value[E]:null}function w(E){return!e.value||!t.value?!1:!Nn(e.value[E],t.value[E])}function $(E){return E.sections.some(U=>w(U))}function F(E,U){if(!e.value||!t.value)return!1;const Z=e.value[E],X=t.value[E];return!Z||!X?!1:!Nn(Z[U],X[U])}function M(E){return t.value?t.value[E]:e.value[E]}function W(E,U){const Z=t.value||e.value;return Z[E]?Z[E][U]:void 0}function B(E,U){const Z=r.value&&t.value?t.value:e.value;return Z[E]?Z[E][U]:!1}function V(E,U){return b.value[E+"."+U]||null}function N(E,U){return Iw[E+"."+U]||null}function D(E,U,Z){t.value&&(U===null?t.value[E]=Z:(t.value[E]||(t.value[E]={}),t.value[E][U]=Z),t.value={...t.value})}function q(E,U,Z){if(!t.value)return;const X=Wi(t.value);D(E,U,Z),d.value.push(X),d.value.length>Lw&&d.value.shift(),f.value=[]}function ue(E,U,Z){try{const X=JSON.parse(Z);q(E,U,X)}catch{}}function ve(){d.value.length!==0&&(f.value.push(Wi(t.value)),t.value=d.value.pop())}function se(){f.value.length!==0&&(d.value.push(Wi(t.value)),t.value=f.value.pop())}function de(E,U,Z){if(!t.value||!t.value[E])return;const X=[...t.value[E][U]];X.splice(Z,1),q(E,U,X)}function J(E,U){if(!t.value||!t.value[E])return;const Z=[...t.value[E][U]||[]],X=prompt("Enter new value:");X!==null&&(Z.push(X),q(E,U,Z))}function oe(E){a.value={...a.value,[E]:!a.value[E]}}function Ie(E){l.value={...l.value,[E]:!l.value[E]}}function j(E){i.value={...i.value,[E]:!i.value[E]}}function re(E){try{return JSON.stringify(E,null,2)}catch{return String(E)}}function le(E){return E==null?"null":typeof E=="object"?JSON.stringify(E,null,2):String(E)}function ge(E,U){c.value={type:E,message:U},setTimeout(()=>{c.value=null},3e3)}function me(){t.value=Wi(e.value),r.value=!0,d.value=[],f.value=[]}function Le(){r.value=!1,t.value=null,d.value=[],f.value=[]}function y(){u.value=!0}async function T(){if(!(!k.value||v.value)){o.value=!0;try{const E=Mw(e.value,t.value);if(Object.keys(E).length===0){ge("success","No changes to save."),o.value=!1;return}const U=await K.put("/api/config",E);e.value=U,r.value=!1,t.value=null,d.value=[],f.value=[],ge("success","Config saved successfully.")}catch(E){ge("error",E.message||"Failed to save config")}o.value=!1}}async function P(){s.value=!0,n.value=null;try{e.value=await K.get("/api/config");for(const E of Object.keys(e.value))a.value[E]===void 0&&(a.value[E]=!0);for(const E of $r)l.value[E.key]===void 0&&(l.value[E.key]=!0)}catch(E){n.value=E.message}s.value=!1}function G(E){r.value&&((E.ctrlKey||E.metaKey)&&!E.shiftKey&&E.key==="z"?(E.preventDefault(),ve()):(E.ctrlKey||E.metaKey)&&(E.key==="y"||E.shiftKey&&E.key==="z"||E.shiftKey&&E.key==="Z")&&(E.preventDefault(),se()))}return $e(()=>{P(),document.addEventListener("keydown",G)}),ft(()=>{document.removeEventListener("keydown",G)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:k,hasErrors:v,changeCount:A,REDACTED:dg,showDiffModal:u,diffEntries:L,canUndo:p,canRedo:m,sectionCount:x,groupCount:R,visibleGroups:O,ungroupedSections:S,validationErrors:b,isSensitiveKey:Ow,isRedacted:Dw,sectionChanged:w,groupChanged:$,fieldChanged:F,getDisplay:I,getEdited:M,getEditedField:W,getDisplayBool:B,pushEdit:q,pushEditJson:ue,getValidationError:V,getEnumOptions:N,removeArrayItem:de,addArrayItem:J,toggleSection:oe,toggleGroup:Ie,toggleNested:j,formatJson:re,formatDiffVal:le,showToast:ge,showDiff:y,fetchConfig:P,startEdit:me,cancelEdit:Le,saveConfig:T,undo:ve,redo:se}}},$w={template:`
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
                    <span v-if="hasOverride(ch)" class="badge badge-warning text-xs cursor-pointer"
                          @click="clearOverride(ch.id, guild.id)" title="Click to clear override">
                      custom
                    </span>
                    <span v-else class="text-gray-600 text-xs">inherit</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await K.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,m,g){try{await K.put("/api/discord/guild/"+p+"/config",{[m]:g}),await c()}catch(k){s.value=k.message}}async function d(p,m,g,k){try{await K.put("/api/discord/channel/"+p+"/config",{[g]:k}),await c()}catch(A){s.value=A.message}}async function f(p,m){try{await K.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return $e(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},Uw={template:`
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
            <span class="text-xs text-gray-500">Default host:</span>
            <select v-model="defaultPolicy.default_host" @change="saveDefaultPolicy"
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
                       @input="onSearchInput" @keydown.down.prevent="highlightNext"
                       @keydown.up.prevent="highlightPrev" @keydown.enter.prevent="selectHighlighted"
                       @keydown.escape="closeDropdown" @blur="onBlur"
                       class="bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-300 w-full" />
                <div v-if="showDropdown && (filteredMembers.length > 0 || isRawId)"
                     class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-gray-900 border border-gray-600 rounded shadow-lg">
                  <div v-if="isRawId && !filteredMembers.length"
                       @mousedown.prevent="addRawId"
                       class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-gray-800">
                    <div class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">?</div>
                    <span class="text-gray-200">Add by ID: {{ searchQuery.trim() }}</span>
                    <span class="text-gray-500 text-xs ml-auto">press Enter</span>
                  </div>
                  <div v-for="(m, idx) in filteredMembers" :key="m.id"
                       @mousedown.prevent="selectMember(m)"
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
          <table v-if="Object.keys(users).length > 0" class="hm-table">
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
                         @change="toggleUserHost(uid, host, $event.target.checked)"
                         class="rounded border-gray-600 bg-gray-800" />
                </td>
                <td class="text-center">
                  <select :value="entry.default_host" @change="setUserDefault(uid, $event.target.value)"
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
          <p v-else class="text-xs text-gray-500">No user overrides configured. All users follow the default policy.</p>
        </div>
      </div>

    </div>
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=ee(()=>{const N={};for(const D of u.value)N[D.id]=D;return N});function p(N){return f.value[N]||null}const m=ee(()=>/^\d{15,25}$/.test(r.value.trim())),g=ee(()=>{const N=r.value.toLowerCase().trim();return N?u.value.filter(D=>!i.value[D.id]&&(D.display_name.toLowerCase().includes(N)||D.username.toLowerCase().includes(N)||D.id.includes(N))):u.value.filter(D=>!i.value[D.id])});function k(N,D){return N?N.allowed_hosts===null||N.allowed_hosts===void 0?{allowed_hosts:[...D],default_host:N.default_host||"",allow_all:!0}:{allowed_hosts:N.allowed_hosts,default_host:N.default_host||"",allow_all:!1}:{allowed_hosts:[...D],default_host:D[0]||"",allow_all:!0}}async function A(){e.value=!0,t.value="";try{const N=await K.get("/api/host-access");s.value=N,n.value=N.available_hosts||[],a.value=k(N.default_policy,n.value);const D=N.users||{},q={};for(const[ue,ve]of Object.entries(D))q[ue]=k(ve,n.value);i.value=q}catch(N){t.value=N.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await K.get("/api/discord/members")||[]}catch{u.value=[]}}async function b(){try{const N=a.value.allow_all?null:a.value.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:N,default_host:a.value.default_host}),xe.success("Default policy updated")}catch(N){xe.error(N.message||"Failed to save")}}function v(N,D){a.value.allow_all=!1,D?a.value.allowed_hosts.includes(N)||a.value.allowed_hosts.push(N):(a.value.allowed_hosts=a.value.allowed_hosts.filter(q=>q!==N),a.value.default_host===N&&(a.value.default_host=a.value.allowed_hosts[0]||"")),b()}async function x(N){const D=i.value[N];if(D)try{const q=D.allow_all?null:D.allowed_hosts;await K.put(`/api/host-access/user/${N}`,{allowed_hosts:q,default_host:D.default_host});const ue=p(N);xe.success(`Updated access for ${ue?ue.display_name:N}`)}catch(q){xe.error(q.message||"Failed to save")}}function R(N,D,q){const ue=i.value[N];ue&&(ue.allow_all=!1,q?ue.allowed_hosts.includes(D)||ue.allowed_hosts.push(D):(ue.allowed_hosts=ue.allowed_hosts.filter(ve=>ve!==D),ue.default_host===D&&(ue.default_host=ue.allowed_hosts[0]||"")),x(N))}function L(N,D){const q=i.value[N];q&&(q.default_host=D,x(N))}function O(){l.value=!0,r.value="",c.value=0,Et(()=>{d.value&&d.value.focus()})}function S(){o.value=!0,c.value=0}function I(){c.value<g.value.length-1&&c.value++}function w(){c.value>0&&c.value--}function $(){const N=g.value[c.value];if(N){M(N);return}m.value&&F()}function F(){const N=r.value.trim();/^\d{15,25}$/.test(N)&&(i.value[N]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},x(N),r.value="",o.value=!1,l.value=!1)}function M(N){i.value[N.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},x(N.id),r.value="",o.value=!1,l.value=!1}function W(){o.value=!1}function B(){setTimeout(()=>{o.value=!1},150)}async function V(N){const D=p(N);if(await ns({title:"Remove user override",message:`Remove the host access override for ${D?D.display_name:N}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await K.del(`/api/host-access/user/${N}`),delete i.value[N],xe.success(`Removed override for ${D?D.display_name:N}`)}catch(ue){xe.error(ue.message||"Failed to delete")}}return $e(A),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:g,isRawId:m,searchInput:d,fetchData:A,saveDefaultPolicy:b,toggleDefaultHost:v,getMember:p,toggleUserHost:R,setUserDefault:L,openAddUser:O,deleteUser:V,onSearchInput:S,highlightNext:I,highlightPrev:w,selectHighlighted:$,selectMember:M,closeDropdown:W,onBlur:B,addRawId:F}}},Bw={template:`
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
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 block mb-1">User ID (unique identifier)</label>
                <input v-model="createForm.user_id" class="hm-input w-full text-sm"
                       placeholder="e.g. orchestrator-1" />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Display Name</label>
                <input v-model="createForm.username" class="hm-input w-full text-sm"
                       placeholder="e.g. Task Orchestrator" />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Permission Tier</label>
                <select v-model="createForm.tier" class="hm-input w-full text-sm">
                  <option value="admin">admin — full tool access</option>
                  <option value="user">user — read-only tools</option>
                  <option value="guest">guest — chat only, no tools</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Label (description)</label>
                <input v-model="createForm.label" class="hm-input w-full text-sm"
                       placeholder="e.g. CI/CD pipeline" />
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Host Access</label>
              <select v-model="createForm.host_mode" class="hm-input w-full text-sm mb-2">
                <option value="default">Use default host policy</option>
                <option value="select">Restrict to selected hosts</option>
                <option value="none">No host access (chat only)</option>
              </select>
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
              <label class="text-xs text-gray-500 block mb-1">Default Host</label>
              <select v-model="createForm.default_host" class="hm-input w-full text-sm"
                      :disabled="createForm.host_mode === 'none'">
                <option value="">Use host policy default</option>
                <option v-for="host in createDefaultHostOptions" :key="'cdh-'+host" :value="host">
                  {{ host }}
                </option>
              </select>
              <p class="text-xs text-gray-500 mt-1">Used when API requests don't specify a host.</p>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Allowed Tools (comma-separated, leave empty for tier default)</label>
              <input v-model="createForm.allowed_tools_str" class="hm-input w-full text-sm"
                     placeholder="e.g. run_command, web_search, fetch_url" />
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
        <div v-if="editing" class="modal-overlay" @click.self="editing = null" @keyup.escape="editing = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="token-edit-title">
          <div class="modal-content" style="max-width:640px">
            <h3 id="token-edit-title" class="text-sm font-semibold text-gray-300 mb-4">Edit Token: {{ editing.user_id }}</h3>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Display Name</label>
                  <input v-model="editForm.username" class="hm-input w-full text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Tier</label>
                  <select v-model="editForm.tier" class="hm-input w-full text-sm">
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                    <option value="guest">guest</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Label</label>
                <input v-model="editForm.label" class="hm-input w-full text-sm" />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Host Access</label>
                <select v-model="editForm.host_mode" class="hm-input w-full text-sm mb-2">
                  <option value="default">Use default host policy</option>
                  <option value="select">Restrict to selected hosts</option>
                  <option value="none">No host access (chat only)</option>
                </select>
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
                <label class="text-xs text-gray-500 block mb-1">Default Host</label>
                <select v-model="editForm.default_host" class="hm-input w-full text-sm"
                        :disabled="editForm.host_mode === 'none'">
                  <option value="">Use host policy default</option>
                  <option v-for="host in editDefaultHostOptions" :key="'edh-'+host" :value="host">
                    {{ host }}
                  </option>
                </select>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Allowed Tools (comma-separated, empty for tier default)</label>
                <input v-model="editForm.allowed_tools_str" class="hm-input w-full text-sm" />
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=ee(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=ee(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(S){return S==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":S==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const S=await K.get("/api/tokens");s.value=S.tokens||[],n.value=S.available_hosts||[]}catch(S){t.value=S.message||"Failed to load tokens"}finally{e.value=!1}}function g(S){return!S||!S.trim()?[]:S.split(",").map(I=>I.trim()).filter(Boolean)}function k(S,I){const w=c.value.allowed_hosts;if(I&&!w.includes(S)&&w.push(S),!I){const $=w.indexOf(S);$>=0&&w.splice($,1)}}function A(S,I){const w=u.value.allowed_hosts;if(I&&!w.includes(S)&&w.push(S),!I){const $=w.indexOf(S);$>=0&&w.splice($,1)}}async function b(){var S;i.value=!0;try{const I=g(c.value.allowed_tools_str),w=c.value.host_mode,$=w==="none"?[]:w==="select"?c.value.allowed_hosts:null,F={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:I.length?I:[]};$!==null&&(F.allowed_hosts=$),F.default_host=c.value.default_host||"";const M=await K.post("/api/tokens",F);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,xe.success("Token created"),await m()}catch(I){xe.error(((S=I.data)==null?void 0:S.error)||I.message||"Failed to create token")}finally{i.value=!1}}function v(S){r.value=S;const I=S.allowed_hosts;let w="default";I==null?w="default":Array.isArray(I)&&I.length===0?w="none":Array.isArray(I)&&(w="select"),u.value={username:S.username||"",tier:S.tier||"admin",label:S.label||"",host_mode:w,allowed_hosts:Array.isArray(I)?[...I]:[],default_host:S.default_host||"",allowed_tools_str:(S.allowed_tools||[]).join(", ")}}async function x(){var S;if(r.value){o.value=!0;try{const I=g(u.value.allowed_tools_str),w=u.value.host_mode,$={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:I};w==="none"?$.allowed_hosts=[]:w==="select"?$.allowed_hosts=u.value.allowed_hosts:$.allowed_hosts=null,$.default_host=u.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(r.value.user_id),$),r.value=null,xe.success("Token updated"),await m()}catch(I){xe.error(((S=I.data)==null?void 0:S.error)||I.message||"Failed to update")}finally{o.value=!1}}}async function R(S){var w;if(await ns({title:"Regenerate token",message:`Regenerate token for ${S.username||S.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const $=await K.post("/api/tokens/"+encodeURIComponent(S.user_id)+"/regenerate");l.value=$.token,xe.success("Token regenerated")}catch($){xe.error(((w=$.data)==null?void 0:w.error)||$.message||"Failed to regenerate")}}async function L(S){var w;if(await ns({title:"Delete token",message:`Delete token for ${S.username||S.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(S.user_id)),xe.success("Token deleted"),await m()}catch($){xe.error(((w=$.data)==null?void 0:w.error)||$.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),xe.success("Copied to clipboard")}catch{xe.error("Copy failed — select and copy manually")}}return $e(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:m,tierBadge:p,toggleCreateHost:k,toggleEditHost:A,createToken:b,startEdit:v,saveEdit:x,confirmRegenerate:R,confirmDelete:L,copyToken:O}}};function Ur(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Hw={template:`
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
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="codexForm.model" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="gpt-5.6-sol">gpt-5.6-sol</option>
                <option value="gpt-5.6-terra">gpt-5.6-terra</option>
                <option value="gpt-5.5">gpt-5.5</option>
                <option value="gpt-5">gpt-5</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="codexForm.max_tokens" type="number" @keydown.enter="saveCodexConfigNow"
                     class="hm-input" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Reasoning</label>
              <select v-model="codexForm.reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Agent Reasoning</label>
              <select v-model="codexForm.agent_reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat setting</option>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
              </select>
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
                      <span v-if="editingLabel !== a.index" class="text-gray-200 cursor-pointer hover:text-indigo-300"
                            @click="startEditLabel(a.index, a.label)">
                        {{ a.label || '—' }}
                        <span class="text-gray-600 ml-1"><odin-icon name="edit" :size="12" /></span>
                      </span>
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
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="kimiForm.model" @change="saveKimiConfigDebounced"
                      class="hm-input">
                <option v-if="!kimiModels.length" value="" disabled>No models available</option>
                <option v-for="m in kimiModels" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="kimiForm.max_tokens" type="number" @keydown.enter="saveKimiConfigNow"
                     class="hm-input" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key</label>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.kimi.has_api_key && !kimiForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="kimiForm.api_key" type="password" @keydown.enter="saveKimiConfigNow" @input="kimiKeyDirty = true"
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
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="ollamaForm.model" @change="saveOllamaConfigDebounced"
                      class="hm-input">
                <option v-if="!ollamaModels.length" value="" disabled>No models available</option>
                <option v-for="m in ollamaModels" :key="m.name" :value="m.name">{{ m.name }} ({{ formatSize(m.size) }})</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="ollamaForm.max_tokens" type="number" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key <span class="text-gray-600">(optional, for remote)</span></label>
              <input v-model="ollamaForm.api_key" type="password" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfigNow" @input="ollamaKeyDirty = true"
                     class="hm-input" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Base URL</label>
              <input v-model="ollamaForm.base_url" placeholder="http://127.0.0.1:11434" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
            </div>
          </div>
          <div v-if="ollamaStatus.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:""}),a=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),i=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),l=h(!1),r=h(!1),o=h(!1),c=h(!1),u=h(!1),d=h(!1),f=h(!1),p=h({configured:!1}),m=h([]),g=h(""),k=h(!1),A=h(!1),b=h({configured:!1}),v=h([]),x=h(""),R=h(!1),L=h(!1),O=h(!0),S=h(""),I=h({configured:!1,accounts:[]}),w=h(null),$=h(null),F=h(""),M=h(null),W=h(!1),B=h(null),V=h(null),N=h("");let D=null;function q(C,Q="success"){xe(C,Q==="error"?"error":"success")}function ue(C){if(!C)return"?";const Q=C/(1024*1024*1024);return Q>=1?Q.toFixed(1)+" GB":(C/(1024*1024)).toFixed(0)+" MB"}async function ve(){e.value=!0,await Promise.all([se(),de(),le(),J()]),e.value=!1}async function se(){try{const C=await K.get("/api/llm/status");t.value=C,s.value=C.active_provider||"codex",C.codex&&!P.pending()&&(n.value.enabled=C.codex.enabled,n.value.model=C.codex.model||"gpt-5.5",n.value.reasoning_effort=C.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=C.codex.agent_reasoning_effort||"",n.value.max_tokens=C.codex.max_tokens||4096),C.ollama&&!G.pending()&&(a.value.enabled=C.ollama.enabled,a.value.base_url=C.ollama.base_url||"",a.value.model=C.ollama.model||"",a.value.max_tokens=C.ollama.max_tokens||4096),C.kimi&&!E.pending()&&(i.value.enabled=C.kimi.enabled,i.value.model=C.kimi.model||"",i.value.max_tokens=C.kimi.max_tokens||4096)}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function de(){try{if(p.value=await K.get("/api/ollama/status"),p.value.model&&(g.value=p.value.model),p.value.configured)try{const C=await K.get("/api/ollama/models");m.value=C.models||[]}catch{m.value=[]}else if(a.value.base_url)try{const C=await K.post("/api/ollama/probe-models",{base_url:a.value.base_url});m.value=C.models||[]}catch{m.value=[]}}catch{p.value={configured:!1}}}async function J(){O.value=!0,S.value="";try{I.value=await K.get("/api/codex/status")}catch(C){S.value=C.message||"Failed to fetch Codex status"}finally{O.value=!1}}async function oe(){const C=t.value?t.value.active_provider:"codex";f.value=!0;try{const Q=await K.post("/api/llm/switch",{provider:s.value});Q.error?(s.value=C,q(Q.error,"error")):(q("Switched to "+s.value+" ("+Q.model+")"),await ve())}catch(Q){s.value=C,q(Q.message||"Switch failed","error")}finally{f.value=!1}}async function Ie(){k.value=!0;try{const C=await K.post("/api/ollama/reload");q(C.configured?"Ollama reloaded":C.reason||"Ollama not configured",C.configured?"success":"error"),await ve()}catch(C){q(C.message||"Reload failed","error")}finally{k.value=!1}}async function j(){A.value=!0;try{await K.post("/api/ollama/model",{model:g.value}),q("Model set to "+g.value),await ve()}catch(C){q(C.message||"Failed","error")}finally{A.value=!1}}async function re(){const C=a.value.base_url;if(!C){q("Enter a base URL first","error");return}d.value=!0;try{const Q=await K.post("/api/ollama/probe-models",{base_url:C});m.value=Q.models||[],m.value.length?(q(m.value.length+" model(s) found"),!a.value.model&&m.value.length&&(a.value.model=m.value[0].name)):q("No models found at "+C,"error")}catch(Q){q(Q.message||"Could not reach Ollama","error")}finally{d.value=!1}}async function le(){try{if(b.value=await K.get("/api/kimi/status"),b.value.model&&(x.value=b.value.model),b.value.configured)try{const C=await K.get("/api/kimi/models");v.value=C.models||[]}catch{v.value=[]}}catch{b.value={configured:!1}}}async function ge(){R.value=!0;try{const C=await K.post("/api/kimi/reload");q(C.configured?"Kimi reloaded":C.reason||"Kimi not configured",C.configured?"success":"error"),await ve()}catch(C){q(C.message||"Reload failed","error")}finally{R.value=!1}}async function me(){L.value=!0;try{await K.post("/api/kimi/model",{model:x.value}),q("Model set to "+x.value),await ve()}catch(C){q(C.message||"Failed","error")}finally{L.value=!1}}async function Le(){if(o.value){P();return}o.value=!0;try{await K.put("/api/llm/codex/config",n.value),q("Codex config saved"),await Promise.all([se(),J()])}catch(C){q(C.message||"Failed","error"),await Promise.all([se(),J()])}finally{o.value=!1}}async function y(){if(c.value){G();return}c.value=!0;try{const C={...a.value},Q=l.value?a.value.api_key:null;Q===null&&delete C.api_key,await K.put("/api/llm/ollama/config",C),q("Ollama config saved"),Q!==null&&a.value.api_key===Q&&(a.value.api_key="",l.value=!1),await Promise.all([se(),de()])}catch(C){q(C.message||"Failed","error")}finally{c.value=!1}}async function T(){if(u.value){E();return}u.value=!0;try{const C={...i.value},Q=r.value?i.value.api_key:null;Q===null&&delete C.api_key,await K.put("/api/llm/kimi/config",C),q("Kimi config saved"),Q!==null&&i.value.api_key===Q&&(i.value.api_key="",r.value=!1),await Promise.all([se(),le()])}catch(C){q(C.message||"Failed","error")}finally{u.value=!1}}const P=Ur(Le),G=Ur(y),E=Ur(T),U=()=>(P.cancel(),Le()),Z=()=>(G.cancel(),y()),X=()=>(E.cancel(),T());async function te(C){try{await K.post("/api/codex/account/"+C+"/activate"),q("Active account switched"),await J()}catch(Q){q(Q.message||"Failed","error")}}async function Y(C){w.value=C;try{await K.post("/api/codex/account/"+C+"/refresh"),q("Token refreshed"),await J()}catch(Q){q(Q.message||"Refresh failed","error")}finally{w.value=null}}function pe(C,Q){$.value=C,F.value=Q||""}async function ie(C){try{await K.put("/api/codex/account/"+C+"/label",{label:F.value}),q("Label updated"),$.value=null,await J()}catch(Q){q(Q.message||"Failed","error")}}async function ce(C,Q){if(await ns({title:"Delete Codex account",message:`Delete ${Q||"account #"+(C+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+C),q("Deleted. Pool reloaded."),await J()}catch(De){q(De.message||"Failed","error")}}async function ye(){W.value=!0;try{const C=await K.post("/api/codex/device-code");B.value=C,M.value="pending",Se(C)}catch(C){q(C.message||"Failed","error")}finally{W.value=!1}}async function Se(C){D={cancelled:!1};const Q=D;try{const be=await K.post("/api/codex/device-poll",{device_auth_id:C.device_auth_id,user_code:C.user_code,interval:C.interval});if(Q.cancelled)return;V.value=be,M.value="success",await ve()}catch(be){if(Q.cancelled)return;N.value=be.message||"Device login failed",M.value="error"}}function Ee(){D&&(D.cancelled=!0),M.value=null,B.value=null}return $e(ve),ft(()=>{D&&(D.cancelled=!0),P.cancel(),G.cancel(),E.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:f,codexForm:n,ollamaForm:a,kimiForm:i,savingCodex:o,savingOllama:c,savingKimi:u,probingOllama:d,ollamaKeyDirty:l,kimiKeyDirty:r,ollamaStatus:p,ollamaModels:m,ollamaSelectedModel:g,reloading:k,settingModel:A,kimiStatus:b,kimiModels:v,kimiSelectedModel:x,reloadingKimi:R,settingKimiModel:L,codexLoading:O,codexError:S,codexData:I,refreshing:w,editingLabel:$,labelValue:F,deviceState:M,deviceLoading:W,deviceInfo:B,deviceResult:V,deviceError:N,fetchAll:ve,switchProvider:oe,reloadOllama:Ie,setOllamaModel:j,reloadKimi:ge,setKimiModel:me,probeOllamaModels:re,saveCodexConfig:Le,saveOllamaConfig:y,saveKimiConfig:T,saveCodexConfigDebounced:P,saveOllamaConfigDebounced:G,saveKimiConfigDebounced:E,saveCodexConfigNow:U,saveOllamaConfigNow:Z,saveKimiConfigNow:X,activateAccount:te,refreshAccount:Y,startEditLabel:pe,saveLabel:ie,deleteAccount:ce,startDeviceLogin:ye,cancelDeviceLogin:Ee,formatSize:ue}}},Bd={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Vw(e){return Bd[e]||Bd[(e||"").toLowerCase()]||"text-gray-400"}const jw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),u=h(null);let d=null;async function f(){const p=await Promise.allSettled([K.get("/api/startup/diagnostics"),K.get("/api/subsystems/status"),K.get("/api/pools/ssh"),K.get("/api/pools/http"),K.get("/api/risk/stats"),K.get("/api/recovery/stats"),K.get("/api/compression/stats"),K.get("/api/routing/stats"),K.get("/api/freshness/stats"),K.get("/api/governor/stats")]),m=k=>p[k].status==="fulfilled"?p[k].value:null;t.value=m(0)||{};const g=m(1);s.value=Array.isArray(g)?g:g&&g.subsystems||[],n.value=m(2)||{},a.value=m(3)||{},i.value=m(4),l.value=m(5),r.value=m(6),o.value=m(7),c.value=m(8),u.value=m(9),e.value=!1}return $e(()=>{f(),d=setInterval(f,3e4)}),ft(()=>{d&&clearInterval(d)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,routingStats:o,freshnessStats:c,governorStats:u,statusColor:Vw,formatTime:kc}}},zw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await K.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await ns({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return $e(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},qw={components:{TabbedPage:lr},setup(){return{tabs:[{id:"health",label:"Health",component:ww},{id:"resources",label:"Resources",component:Sw},{id:"logs",label:"Logs",component:Aw},{id:"config",label:"Config",component:Fw},{id:"discord",label:"Discord",component:$w},{id:"host-access",label:"Host Access",component:Uw},{id:"api-tokens",label:"API Tokens",component:Bw},{id:"llm",label:"LLM Config",component:Hw},{id:"internals",label:"Internals",component:jw},{id:"update",label:"Update",component:zw}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},fg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:L_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:Jk,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:sw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:cw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:bw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:yw,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:qw,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:{path:"/operations",query:{tab:"live"}}},{path:"/agents",redirect:{path:"/operations",query:{tab:"agents"}}},{path:"/loops",redirect:{path:"/operations",query:{tab:"loops"}}},{path:"/processes",redirect:{path:"/operations",query:{tab:"processes"}}},{path:"/schedules",redirect:{path:"/operations",query:{tab:"schedules"}}},{path:"/audit",redirect:{path:"/history",query:{tab:"audit"}}},{path:"/sessions",redirect:{path:"/history",query:{tab:"sessions"}}},{path:"/traces",redirect:{path:"/history",query:{tab:"traces"}}},{path:"/usage",redirect:{path:"/history",query:{tab:"usage"}}},{path:"/tools",redirect:{path:"/capabilities",query:{tab:"tools"}}},{path:"/skills",redirect:{path:"/capabilities",query:{tab:"skills"}}},{path:"/knowledge",redirect:{path:"/capabilities",query:{tab:"knowledge"}}},{path:"/memory",redirect:{path:"/capabilities",query:{tab:"memory"}}},{path:"/learned",redirect:{path:"/capabilities",query:{tab:"learned"}}},{path:"/health",redirect:{path:"/system",query:{tab:"health"}}},{path:"/resources",redirect:{path:"/system",query:{tab:"resources"}}},{path:"/logs",redirect:{path:"/system",query:{tab:"logs"}}},{path:"/config",redirect:{path:"/system",query:{tab:"config"}}},{path:"/host-access",redirect:{path:"/system",query:{tab:"host-access"}}},{path:"/internals",redirect:{path:"/system",query:{tab:"internals"}}}],ei=T_({history:n_(),routes:fg});ei.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const Kw={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},Gw={template:`
    <div v-if="authState === 'checking'" class="app-loading" role="status" aria-label="Loading">
      <div class="brand-loader"><odin-icon name="brand" :size="28" /></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <login-screen v-else-if="authState === 'login'" :on-login="onLogin" :session-expired="sessionExpired" />
    <div v-else class="app-shell">
      <aside class="hm-sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }" aria-label="Primary navigation">
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

      <main id="main-content" class="hm-main" role="main">
        <header class="hm-topbar" role="banner">
          <button class="icon-btn mobile-menu-btn" @click="mobileOpen = !mobileOpen"
                  :aria-expanded="mobileOpen" aria-controls="sidebar-nav" aria-label="Open navigation menu">
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(!1),i=h("disconnected"),l=h(-1),r=h(null);let o=null;const c=h("starting"),u=h(""),d=fg.filter(w=>w.meta),f=ee(()=>["Workspace","Operate","Observe","Manage"].map(w=>({name:w,routes:d.filter($=>$.meta.section===w)})).filter(w=>w.routes.length)),p=ee(()=>{var w;return((w=ei.currentRoute.value.meta)==null?void 0:w.label)||"Odin"}),m=ee(()=>{var w;return((w=ei.currentRoute.value.meta)==null?void 0:w.section)||"Management"}),g=ee(()=>{var w;return((w=ei.currentRoute.value.meta)==null?void 0:w.description)||"Management console"});K.onSessionExpired=()=>{t.value=!0,ze.disconnect(),K.setToken(""),e.value="login"};function k(w){if((w.ctrlKey||w.metaKey)&&w.key.toLowerCase()==="k"){e.value==="ready"&&(w.preventDefault(),gd());return}if(w.key==="Escape"&&n.value){n.value=!1,w.preventDefault();return}if(w.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(w.target.tagName)){w.preventDefault();const $=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');$&&$.focus()}}$e(async()=>{document.addEventListener("keydown",k);const w=await K.check();w.ok?(e.value="ready",S()):w.needsAuth?e.value="login":(e.value="ready",S())});function A(){t.value=!1,e.value="ready",S()}async function b(){await K.logout(),ze.disconnect(),e.value="login"}function v(){s.value=!s.value}const x=ee(()=>{switch(i.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function R(w,$="info",F=3e3){r.value={text:w,level:$},clearTimeout(o),o=setTimeout(()=>{r.value=null},F)}let L=null,O=!1;function S(){ze.onStatusChange=w=>{a.value=w},ze.onStateChange=(w,$)=>{i.value=w,l.value=$.latency??-1,w==="connected"?(O&&R("Connection restored","success"),O=!0):w==="reconnecting"&&$.attempt===1&&R("Connection lost — reconnecting…","warn")},ze.connect(),I(),L&&clearInterval(L),L=setInterval(I,15e3)}async function I(){try{const w=await K.get("/api/status");c.value=w.status==="online"?"online":"starting";const $=w.uptime_seconds||0,F=Math.floor($/3600),M=Math.floor($%3600/60);u.value=`${F}h ${M}m uptime`}catch{c.value="offline",u.value=""}}return ft(()=>{L&&clearInterval(L),ze.disconnect(),document.removeEventListener("keydown",k)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:a,wsState:i,wsLatency:l,wsLabel:x,wsToast:r,botStatus:c,botUptime:u,navRoutes:d,navGroups:f,currentPage:p,currentSection:m,currentDescription:g,onLogin:A,logout:b,toggleSidebar:v,openPalette:gd}}},Hn=yl(Gw);Hn.component("odin-icon",I_);Hn.component("login-screen",Kw);Hn.component("toast-container",vx);Hn.component("confirm-host",bx);Hn.component("command-palette",R_);Hn.use(ei);Hn.mount("#app");
