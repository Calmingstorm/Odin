var kg=Object.defineProperty;var wg=(e,t,s)=>t in e?kg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var Ze=(e,t,s)=>wg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Sg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null){this._lastActivity=Date.now();const a={method:t,headers:this._headers()};n!==null&&(a.body=JSON.stringify(n));const i=await fetch(s,a);if(i.status===401)throw new hr("Unauthorized");const l=await i.json().catch(()=>null);if(!i.ok){const r=(l==null?void 0:l.error)||`HTTP ${i.status}`;throw new Tg(r,i.status,l)}return l}get(t){return this._request("GET",t)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new hr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof hr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class hr extends Error{constructor(t){super(t),this.name="AuthError"}}class Tg extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Cg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error")for(const l of this._handlers.chat||[])l(a)},this._ws.onclose=()=>{this._ws=null,this._stopPing(),this._latency=-1,this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const q=new Sg,Ke=new Cg(q);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ls(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Me={},la=[],Nt=()=>{},aa=()=>!1,Bn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Pl=e=>e.startsWith("onUpdate:"),Oe=Object.assign,To=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Eg=Object.prototype.hasOwnProperty,He=(e,t)=>Eg.call(e,t),pe=Array.isArray,ra=e=>Ea(e)==="[object Map]",Hn=e=>Ea(e)==="[object Set]",Zc=e=>Ea(e)==="[object Date]",Ag=e=>Ea(e)==="[object RegExp]",_e=e=>typeof e=="function",Te=e=>typeof e=="string",Ut=e=>typeof e=="symbol",Be=e=>e!==null&&typeof e=="object",Co=e=>(Be(e)||_e(e))&&_e(e.then)&&_e(e.catch),Gd=Object.prototype.toString,Ea=e=>Gd.call(e),Rg=e=>Ea(e).slice(8,-1),Fl=e=>Ea(e)==="[object Object]",$l=e=>Te(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,qs=ls(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Ig=ls("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ul=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Ng=/-\w/g,Ge=Ul(e=>e.replace(Ng,t=>t.slice(1).toUpperCase())),Lg=/\B([A-Z])/g,Qt=Ul(e=>e.replace(Lg,"-$1").toLowerCase()),Vn=Ul(e=>e.charAt(0).toUpperCase()+e.slice(1)),oa=Ul(e=>e?`on${Vn(e)}`:""),wt=(e,t)=>!Object.is(e,t),ca=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Wd=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Bl=e=>{const t=parseFloat(e);return isNaN(t)?e:t},ll=e=>{const t=Te(e)?Number(e):NaN;return isNaN(t)?e:t};let Jc;const Hl=()=>Jc||(Jc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Og(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Dg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Mg=ls(Dg);function ki(e){if(pe(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Te(n)?Zd(n):ki(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Te(e)||Be(e))return e}const Pg=/;(?![^(]*\))/g,Fg=/:([^]+)/,$g=/\/\*[^]*?\*\//g;function Zd(e){const t={};return e.replace($g,"").split(Pg).forEach(s=>{if(s){const n=s.split(Fg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function wi(e){let t="";if(Te(e))t=e;else if(pe(e))for(let s=0;s<e.length;s++){const n=wi(e[s]);n&&(t+=n+" ")}else if(Be(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Ug(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Te(t)&&(e.class=wi(t)),s&&(e.style=ki(s)),e}const Bg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Hg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Vg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",jg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",zg=ls(Bg),Kg=ls(Hg),qg=ls(Vg),Gg=ls(jg),Wg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Zg=ls(Wg);function Jd(e){return!!e||e===""}function Jg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Js(e[n],t[n]);return s}function Js(e,t){if(e===t)return!0;let s=Zc(e),n=Zc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Ut(e),n=Ut(t),s||n)return e===t;if(s=pe(e),n=pe(t),s||n)return s&&n?Jg(e,t):!1;if(s=Be(e),n=Be(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!Js(e[l],t[l]))return!1}}return String(e)===String(t)}function Vl(e,t){return e.findIndex(s=>Js(s,t))}const Yd=e=>!!(e&&e.__v_isRef===!0),Qd=e=>Te(e)?e:e==null?"":pe(e)||Be(e)&&(e.toString===Gd||!_e(e.toString))?Yd(e)?Qd(e.value):JSON.stringify(e,Xd,2):String(e),Xd=(e,t)=>Yd(t)?Xd(e,t.value):ra(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[gr(n,i)+" =>"]=a,s),{})}:Hn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>gr(s))}:Ut(t)?gr(t):Be(t)&&!pe(t)&&!Fl(t)?String(t):t,gr=(e,t="")=>{var s;return Ut(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Yg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let xt;class Eo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&xt&&(xt.active?(this.parent=xt,this.index=(xt.scopes||(xt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=xt;try{return xt=this,t()}finally{xt=s}}}on(){++this._on===1&&(this.prevScope=xt,xt=this)}off(){if(this._on>0&&--this._on===0){if(xt===this)xt=this.prevScope;else{let t=xt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Qg(e){return new Eo(e)}function ef(){return xt}function Xg(e,t=!1){xt&&xt.cleanups.push(e)}let Xe;const mr=new WeakSet;class ai{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,xt&&(xt.active?xt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,mr.has(this)&&(mr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||sf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Yc(this),nf(this);const t=Xe,s=bs;Xe=this,bs=!0;try{return this.fn()}finally{af(this),Xe=t,bs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Io(t);this.deps=this.depsTail=void 0,Yc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?mr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){jr(this)&&this.run()}get dirty(){return jr(this)}}let tf=0,Wa,Za;function sf(e,t=!1){if(e.flags|=8,t){e.next=Za,Za=e;return}e.next=Wa,Wa=e}function Ao(){tf++}function Ro(){if(--tf>0)return;if(Za){let t=Za;for(Za=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Wa;){let t=Wa;for(Wa=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function nf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function af(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Io(n),em(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function jr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(lf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function lf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===ii)||(e.globalVersion=ii,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!jr(e))))return;e.flags|=2;const t=e.dep,s=Xe,n=bs;Xe=e,bs=!0;try{nf(e);const a=e.fn(e._value);(t.version===0||wt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{Xe=s,bs=n,af(e),e.flags&=-3}}function Io(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Io(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function em(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function tm(e,t){e.effect instanceof ai&&(e=e.effect.fn);const s=new ai(e);t&&Oe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function sm(e){e.effect.stop()}let bs=!0;const rf=[];function Ys(){rf.push(bs),bs=!1}function Qs(){const e=rf.pop();bs=e===void 0?!0:e}function Yc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Xe;Xe=void 0;try{t()}finally{Xe=s}}}let ii=0;class nm{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class jl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Xe||!bs||Xe===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Xe)s=this.activeLink=new nm(Xe,this),Xe.deps?(s.prevDep=Xe.depsTail,Xe.depsTail.nextDep=s,Xe.depsTail=s):Xe.deps=Xe.depsTail=s,of(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=Xe.depsTail,s.nextDep=void 0,Xe.depsTail.nextDep=s,Xe.depsTail=s,Xe.deps===s&&(Xe.deps=n)}return s}trigger(t){this.version++,ii++,this.notify(t)}notify(t){Ao();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Ro()}}}function of(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)of(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const rl=new WeakMap,In=Symbol(""),zr=Symbol(""),li=Symbol("");function Pt(e,t,s){if(bs&&Xe){let n=rl.get(e);n||rl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new jl),a.map=n,a.key=s),a.track()}}function Hs(e,t,s,n,a,i){const l=rl.get(e);if(!l){ii++;return}const r=o=>{o&&o.trigger()};if(Ao(),t==="clear")l.forEach(r);else{const o=pe(e),c=o&&$l(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===li||!Ut(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(li)),t){case"add":o?c&&r(l.get("length")):(r(l.get(In)),ra(e)&&r(l.get(zr)));break;case"delete":o||(r(l.get(In)),ra(e)&&r(l.get(zr)));break;case"set":ra(e)&&r(l.get(In));break}}Ro()}function am(e,t){const s=rl.get(e);return s&&s.get(t)}function Zn(e){const t=Fe(e);return t===e?t:(Pt(t,"iterate",li),es(e)?t:t.map(xs))}function zl(e){return Pt(e=Fe(e),"iterate",li),e}function As(e,t){return Is(e)?ga(Gs(e)?xs(t):t):xs(t)}const im={__proto__:null,[Symbol.iterator](){return vr(this,Symbol.iterator,e=>As(this,e))},concat(...e){return Zn(this).concat(...e.map(t=>pe(t)?Zn(t):t))},entries(){return vr(this,"entries",e=>(e[1]=As(this,e[1]),e))},every(e,t){return Os(this,"every",e,t,void 0,arguments)},filter(e,t){return Os(this,"filter",e,t,s=>s.map(n=>As(this,n)),arguments)},find(e,t){return Os(this,"find",e,t,s=>As(this,s),arguments)},findIndex(e,t){return Os(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Os(this,"findLast",e,t,s=>As(this,s),arguments)},findLastIndex(e,t){return Os(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Os(this,"forEach",e,t,void 0,arguments)},includes(...e){return br(this,"includes",e)},indexOf(...e){return br(this,"indexOf",e)},join(e){return Zn(this).join(e)},lastIndexOf(...e){return br(this,"lastIndexOf",e)},map(e,t){return Os(this,"map",e,t,void 0,arguments)},pop(){return Da(this,"pop")},push(...e){return Da(this,"push",e)},reduce(e,...t){return Qc(this,"reduce",e,t)},reduceRight(e,...t){return Qc(this,"reduceRight",e,t)},shift(){return Da(this,"shift")},some(e,t){return Os(this,"some",e,t,void 0,arguments)},splice(...e){return Da(this,"splice",e)},toReversed(){return Zn(this).toReversed()},toSorted(e){return Zn(this).toSorted(e)},toSpliced(...e){return Zn(this).toSpliced(...e)},unshift(...e){return Da(this,"unshift",e)},values(){return vr(this,"values",e=>As(this,e))}};function vr(e,t,s){const n=zl(e),a=n[t]();return n!==e&&!es(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const lm=Array.prototype;function Os(e,t,s,n,a,i){const l=zl(e),r=l!==e&&!es(e),o=l[t];if(o!==lm[t]){const d=o.apply(e,i);return r?xs(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,As(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function Qc(e,t,s,n){const a=zl(e),i=a!==e&&!es(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=As(e,c)),s.call(this,c,As(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?As(e,o):o}function br(e,t,s){const n=Fe(e);Pt(n,"iterate",li);const a=n[t](...s);return(a===-1||a===!1)&&Si(s[0])?(s[0]=Fe(s[0]),n[t](...s)):a}function Da(e,t,s=[]){Ys(),Ao();const n=Fe(e)[t].apply(e,s);return Ro(),Qs(),n}const rm=ls("__proto__,__v_isRef,__isVue"),cf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Ut));function om(e){Ut(e)||(e=String(e));const t=Fe(this);return Pt(t,"has",e),t.hasOwnProperty(e)}class uf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?mf:gf:i?hf:pf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=pe(t);if(!a){let o;if(l&&(o=im[s]))return o;if(s==="hasOwnProperty")return om}const r=Reflect.get(t,s,mt(t)?t:n);if((Ut(s)?cf.has(s):rm(s))||(a||Pt(t,"get",s),i))return r;if(mt(r)){const o=l&&$l(s)?r:r.value;return a&&Be(o)?ol(o):o}return Be(r)?a?ol(r):bn(r):r}}class df extends uf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=pe(t)&&$l(s);if(!this._isShallow){const c=Is(i);if(!es(n)&&!Is(n)&&(i=Fe(i),n=Fe(n)),!l&&mt(i)&&!mt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:He(t,s),o=Reflect.set(t,s,n,mt(t)?t:a);return t===Fe(a)&&(r?wt(n,i)&&Hs(t,"set",s,n):Hs(t,"add",s,n)),o}deleteProperty(t,s){const n=He(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Hs(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Ut(s)||!cf.has(s))&&Pt(t,"has",s),n}ownKeys(t){return Pt(t,"iterate",pe(t)?"length":In),Reflect.ownKeys(t)}}class ff extends uf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const cm=new df,um=new ff,dm=new df(!0),fm=new ff(!0),Kr=e=>e,$i=e=>Reflect.getPrototypeOf(e);function pm(e,t,s){return function(...n){const a=this.__v_raw,i=Fe(a),l=ra(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?Kr:t?ga:xs;return!t&&Pt(i,"iterate",o?zr:In),Oe(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function Ui(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function hm(e,t){const s={get(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);e||(wt(a,r)&&Pt(l,"get",a),Pt(l,"get",r));const{has:o}=$i(l),c=t?Kr:e?ga:xs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Pt(Fe(a),"iterate",In),a.size},has(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);return e||(wt(a,r)&&Pt(l,"has",a),Pt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Fe(r),c=t?Kr:e?ga:xs;return!e&&Pt(o,"iterate",In),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return Oe(s,e?{add:Ui("add"),set:Ui("set"),delete:Ui("delete"),clear:Ui("clear")}:{add(a){const i=Fe(this),l=$i(i),r=Fe(a),o=!t&&!es(a)&&!Is(a)?r:a;return l.has.call(i,o)||wt(a,o)&&l.has.call(i,a)||wt(r,o)&&l.has.call(i,r)||(i.add(o),Hs(i,"add",o,o)),this},set(a,i){!t&&!es(i)&&!Is(i)&&(i=Fe(i));const l=Fe(this),{has:r,get:o}=$i(l);let c=r.call(l,a);c||(a=Fe(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?wt(i,u)&&Hs(l,"set",a,i):Hs(l,"add",a,i),this},delete(a){const i=Fe(this),{has:l,get:r}=$i(i);let o=l.call(i,a);o||(a=Fe(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Hs(i,"delete",a,void 0),c},clear(){const a=Fe(this),i=a.size!==0,l=a.clear();return i&&Hs(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=pm(a,e,t)}),s}function Kl(e,t){const s=hm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(He(s,a)&&a in n?s:n,a,i)}const gm={get:Kl(!1,!1)},mm={get:Kl(!1,!0)},vm={get:Kl(!0,!1)},bm={get:Kl(!0,!0)},pf=new WeakMap,hf=new WeakMap,gf=new WeakMap,mf=new WeakMap;function ym(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function bn(e){return Is(e)?e:ql(e,!1,cm,gm,pf)}function No(e){return ql(e,!1,dm,mm,hf)}function ol(e){return ql(e,!0,um,vm,gf)}function xm(e){return ql(e,!0,fm,bm,mf)}function ql(e,t,s,n,a){if(!Be(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=ym(Rg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Gs(e){return Is(e)?Gs(e.__v_raw):!!(e&&e.__v_isReactive)}function Is(e){return!!(e&&e.__v_isReadonly)}function es(e){return!!(e&&e.__v_isShallow)}function Si(e){return e?!!e.__v_raw:!1}function Fe(e){const t=e&&e.__v_raw;return t?Fe(t):e}function vf(e){return!He(e,"__v_skip")&&Object.isExtensible(e)&&Wd(e,"__v_skip",!0),e}const xs=e=>Be(e)?bn(e):e,ga=e=>Be(e)?ol(e):e;function mt(e){return e?e.__v_isRef===!0:!1}function h(e){return bf(e,!1)}function Lo(e){return bf(e,!0)}function bf(e,t){return mt(e)?e:new _m(e,t)}class _m{constructor(t,s){this.dep=new jl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Fe(t),this._value=s?t:xs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||es(t)||Is(t);t=n?t:Fe(t),wt(t,s)&&(this._rawValue=t,this._value=n?t:xs(t),this.dep.trigger())}}function km(e){e.dep&&e.dep.trigger()}function Rs(e){return mt(e)?e.value:e}function wm(e){return _e(e)?e():Rs(e)}const Sm={get:(e,t,s)=>t==="__v_raw"?e:Rs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return mt(a)&&!mt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Oo(e){return Gs(e)?e:new Proxy(e,Sm)}class Tm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new jl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function yf(e){return new Tm(e)}function Cm(e){const t=pe(e)?new Array(e.length):{};for(const s in e)t[s]=xf(e,s);return t}class Em{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Ut(s)?s:String(s),this._raw=Fe(t);let a=!0,i=t;if(!pe(t)||Ut(this._key)||!$l(this._key))do a=!Si(i)||es(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Rs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&mt(this._raw[this._key])){const s=this._object[this._key];if(mt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return am(this._raw,this._key)}}class Am{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Rm(e,t,s){return mt(e)?e:_e(e)?new Am(e):Be(e)&&arguments.length>1?xf(e,t,s):h(e)}function xf(e,t,s){return new Em(e,t,s)}class Im{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new jl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=ii-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&Xe!==this)return sf(this,!0),!0}get value(){const t=this.dep.track();return lf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Nm(e,t,s=!1){let n,a;return _e(e)?n=e:(n=e.get,a=e.set),new Im(n,a,s)}const Lm={GET:"get",HAS:"has",ITERATE:"iterate"},Om={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Bi={},cl=new WeakMap;let dn;function Dm(){return dn}function _f(e,t=!1,s=dn){if(s){let n=cl.get(s);n||cl.set(s,n=[]),n.push(e)}}function Mm(e,t,s=Me){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:es(x)||a===!1||a===0?Vs(x,1):Vs(x);let u,d,f,p,m=!1,g=!1;if(mt(e)?(d=()=>e.value,m=es(e)):Gs(e)?(d=()=>c(e),m=!0):pe(e)?(g=!0,m=e.some(x=>Gs(x)||es(x)),d=()=>e.map(x=>{if(mt(x))return x.value;if(Gs(x))return c(x);if(_e(x))return o?o(x,2):x()})):_e(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){Ys();try{f()}finally{Qs()}}const x=dn;dn=u;try{return o?o(e,3,[p]):e(p)}finally{dn=x}}:d=Nt,t&&a){const x=d,E=a===!0?1/0:a;d=()=>Vs(x(),E)}const w=ef(),R=()=>{u.stop(),w&&w.active&&To(w.effects,u)};if(i&&t){const x=t;t=(...E)=>{const N=x(...E);return R(),N}}let b=g?new Array(e.length).fill(Bi):Bi;const v=x=>{if(!(!(u.flags&1)||!u.dirty&&!x))if(t){const E=u.run();if(x||a||m||(g?E.some((N,O)=>wt(N,b[O])):wt(E,b))){f&&f();const N=dn;dn=u;try{const O=[E,b===Bi?void 0:g&&b[0]===Bi?[]:b,p];b=E,o?o(t,3,O):t(...O)}finally{dn=N}}}else u.run()};return r&&r(v),u=new ai(d),u.scheduler=l?()=>l(v,!1):v,p=x=>_f(x,!1,u),f=u.onStop=()=>{const x=cl.get(u);if(x){if(o)o(x,4);else for(const E of x)E();cl.delete(u)}},t?n?v(!0):b=u.run():l?l(v.bind(null,!0),!0):u.run(),R.pause=u.pause.bind(u),R.resume=u.resume.bind(u),R.stop=R,R}function Vs(e,t=1/0,s){if(t<=0||!Be(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,mt(e))Vs(e.value,t,s);else if(pe(e))for(let n=0;n<e.length;n++)Vs(e[n],t,s);else if(Hn(e)||ra(e))e.forEach(n=>{Vs(n,t,s)});else if(Fl(e)){for(const n in e)Vs(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Vs(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const kf=[];function Pm(e){kf.push(e)}function Fm(){kf.pop()}function $m(e,t){}const Um={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Bm={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Aa(e,t,s,n){try{return n?e(...n):e()}catch(a){jn(a,t,s)}}function as(e,t,s,n){if(_e(e)){const a=Aa(e,t,s,n);return a&&Co(a)&&a.catch(i=>{jn(i,t,s)}),a}if(pe(e)){const a=[];for(let i=0;i<e.length;i++)a.push(as(e[i],t,s,n));return a}}function jn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Me;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){Ys(),Aa(i,null,10,[e,o,c]),Qs();return}}Hm(e,s,a,n,l)}function Hm(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const jt=[];let Cs=-1;const ua=[];let fn=null,ea=0;const wf=Promise.resolve();let ul=null;function St(e){const t=ul||wf;return e?t.then(this?e.bind(this):e):t}function Vm(e){let t=Cs+1,s=jt.length;for(;t<s;){const n=t+s>>>1,a=jt[n],i=oi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Do(e){if(!(e.flags&1)){const t=oi(e),s=jt[jt.length-1];!s||!(e.flags&2)&&t>=oi(s)?jt.push(e):jt.splice(Vm(t),0,e),e.flags|=1,Sf()}}function Sf(){ul||(ul=wf.then(Tf))}function ri(e){pe(e)?ua.push(...e):fn&&e.id===-1?fn.splice(ea+1,0,e):e.flags&1||(ua.push(e),e.flags|=1),Sf()}function Xc(e,t,s=Cs+1){for(;s<jt.length;s++){const n=jt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;jt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function dl(e){if(ua.length){const t=[...new Set(ua)].sort((s,n)=>oi(s)-oi(n));if(ua.length=0,fn){fn.push(...t);return}for(fn=t,ea=0;ea<fn.length;ea++){const s=fn[ea];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}fn=null,ea=0}}const oi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Tf(e){try{for(Cs=0;Cs<jt.length;Cs++){const t=jt[Cs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Aa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Cs<jt.length;Cs++){const t=jt[Cs];t&&(t.flags&=-2)}Cs=-1,jt.length=0,dl(),ul=null,(jt.length||ua.length)&&Tf()}}let ta,Hi=[];function Cf(e,t){var s,n;ta=e,ta?(ta.enabled=!0,Hi.forEach(({event:a,args:i})=>ta.emit(a,...i)),Hi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Cf(i,t)}),setTimeout(()=>{ta||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Hi=[])},3e3)):Hi=[]}let It=null,Gl=null;function ci(e){const t=It;return It=e,Gl=e&&e.type.__scopeId||null,t}function jm(e){Gl=e}function zm(){Gl=null}const Km=e=>Mo;function Mo(e,t=It,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&pi(-1);const i=ci(t);let l;try{l=e(...a)}finally{ci(i),n._d&&pi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function qm(e,t){if(It===null)return e;const s=Ai(It),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Me]=t[a];i&&(_e(i)&&(i={mounted:i,updated:i}),i.deep&&Vs(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Es(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Ys(),as(o,s,8,[e.el,r,e,t]),Qs())}}function Ja(e,t){if(Rt){let s=Rt.provides;const n=Rt.parent&&Rt.parent.provides;n===s&&(s=Rt.provides=Object.create(n)),s[e]=t}}function fs(e,t,s=!1){const n=Kt();if(n||Nn){let a=Nn?Nn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&_e(t)?t.call(n&&n.proxy):t}}function Gm(){return!!(Kt()||Nn)}const Ef=Symbol.for("v-scx"),Af=()=>fs(Ef);function Wm(e,t){return Ti(e,null,t)}function Zm(e,t){return Ti(e,null,{flush:"post"})}function Rf(e,t){return Ti(e,null,{flush:"sync"})}function ns(e,t,s){return Ti(e,t,s)}function Ti(e,t,s=Me){const{immediate:n,deep:a,flush:i,once:l}=s,r=Oe({},s),o=t&&n||!t&&i!=="post";let c;if(Fn){if(i==="sync"){const p=Af();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Nt,p.resume=Nt,p.pause=Nt,p}}const u=Rt;r.call=(p,m,g)=>as(p,u,m,g);let d=!1;i==="post"?r.scheduler=p=>{ht(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,m)=>{m?p():Do(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Mm(e,t,r);return Fn&&(c?c.push(f):o&&f()),f}function Jm(e,t,s){const n=this.proxy,a=Te(e)?e.includes(".")?If(n,e):()=>n[e]:e.bind(n,n);let i;_e(t)?i=t:(i=t.handler,s=t);const l=Ra(this),r=Ti(a,i.bind(n),s);return l(),r}function If(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const cn=new WeakMap,Nf=Symbol("_vte"),Lf=e=>e.__isTeleport,Cn=e=>e&&(e.disabled||e.disabled===""),Ym=e=>e&&(e.defer||e.defer===""),eu=e=>typeof SVGElement<"u"&&e instanceof SVGElement,tu=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,qr=(e,t)=>{const s=e&&e.to;return Te(s)?t?t(s):null:s},Qm={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:m,createText:g,createComment:w,parentNode:R}}=c,b=Cn(t.props);let{dynamicChildren:v}=t;const x=(O,S,I)=>{O.shapeFlag&16&&u(O.children,S,I,a,i,l,r,o)},E=(O=t)=>{const S=Cn(O.props),I=O.target=qr(O.props,m),D=Gr(I,O,g,p);I&&(l!=="svg"&&eu(I)?l="svg":l!=="mathml"&&tu(I)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(I),S||(x(O,I,D),ja(O,!1)))},N=O=>{const S=()=>{if(cn.get(O)===S){if(cn.delete(O),Cn(O.props)){const I=R(O.el)||s;x(O,I,O.anchor),ja(O,!0)}E(O)}};cn.set(O,S),ht(S,i)};if(e==null){const O=t.el=g(""),S=t.anchor=g("");if(p(O,s,n),p(S,s,n),Ym(t.props)||i&&i.pendingBranch){N(t);return}b&&(x(t,s,S),ja(t,!0)),E()}else{t.el=e.el;const O=t.anchor=e.anchor,S=cn.get(e);if(S){S.flags|=8,cn.delete(e),N(t);return}t.targetStart=e.targetStart;const I=t.target=e.target,D=t.targetAnchor=e.targetAnchor,H=Cn(e.props),F=H?s:I,M=H?O:D;if(l==="svg"||eu(I)?l="svg":(l==="mathml"||tu(I))&&(l="mathml"),v?(f(e.dynamicChildren,v,F,a,i,l,r),Wo(e,t,!0)):o||d(e,t,F,M,a,i,l,r,!1),b)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Vi(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const W=t.target=qr(t.props,m);W&&Vi(t,W,null,c,0)}else H&&Vi(t,I,D,c,1);ja(t,b)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!Cn(f),m=cn.get(e);if(m&&(m.flags|=8,cn.delete(e)),d&&(a(c),a(u)),i&&a(o),!m&&l&16)for(let g=0;g<r.length;g++){const w=r[g];n(w,t,s,p,!!w.dynamicChildren)}},move:Vi,hydrate:Xm};function Vi(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!cn.has(e)&&(!d||Cn(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function Xm(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(w,R){let b=R;for(;b;){if(b&&b.nodeType===8){if(b.data==="teleport start anchor")t.targetStart=b;else if(b.data==="teleport anchor"){t.targetAnchor=b,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}b=l(b)}}function p(w,R){R.anchor=d(l(w),R,r(w),s,n,a,i)}const m=t.target=qr(t.props,o),g=Cn(t.props);if(m){const w=m._lpa||m.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(m,w),t.targetAnchor||Gr(m,t,u,c,r(e)===m?e:null)):(t.anchor=l(e),f(m,w),t.targetAnchor||Gr(m,t,u,c),d(w&&l(w),t,m,s,n,a,i))),ja(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const ev=Qm;function ja(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Gr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Nf]=l,e&&(n(i,e,a),n(l,e,a)),l}const cs=Symbol("_leaveCb"),Ma=Symbol("_enterCb");function Po(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return $e(()=>{e.isMounted=!0}),Yl(()=>{e.isUnmounting=!0}),e}const os=[Function,Array],Fo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:os,onEnter:os,onAfterEnter:os,onEnterCancelled:os,onBeforeLeave:os,onLeave:os,onAfterLeave:os,onLeaveCancelled:os,onBeforeAppear:os,onAppear:os,onAfterAppear:os,onAppearCancelled:os},Of=e=>{const t=e.subTree;return t.component?Of(t.component):t},tv={name:"BaseTransition",props:Fo,setup(e,{slots:t}){const s=Kt(),n=Po();return()=>{const a=t.default&&Wl(t.default(),!0),i=a&&a.length?Df(a):s.subTree?mp():void 0;if(!i)return;const l=Fe(e),{mode:r}=l;if(n.isLeaving)return yr(i);const o=su(i);if(!o)return yr(i);let c=ma(o,l,n,s,d=>c=d);o.type!==dt&&Xs(o,c);let u=s.subTree&&su(s.subTree);if(u&&u.type!==dt&&!vs(u,o)&&Of(s).type!==dt){let d=ma(u,l,n,s);if(Xs(u,d),r==="out-in"&&o.type!==dt)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},yr(i);r==="in-out"&&o.type!==dt?d.delayLeave=(f,p,m)=>{const g=Pf(n,u);g[String(u.key)]=u,f[cs]=()=>{p(),f[cs]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Df(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==dt){t=s;break}}return t}const Mf=tv;function Pf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ma(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:m,onLeaveCancelled:g,onBeforeAppear:w,onAppear:R,onAfterAppear:b,onAppearCancelled:v}=t,x=String(e.key),E=Pf(s,e),N=(I,D)=>{I&&as(I,n,9,D)},O=(I,D)=>{const H=D[1];N(I,D),pe(I)?I.every(F=>F.length<=1)&&H():I.length<=1&&H()},S={mode:l,persisted:r,beforeEnter(I){let D=o;if(!s.isMounted)if(i)D=w||o;else return;I[cs]&&I[cs](!0);const H=E[x];H&&vs(e,H)&&H.el[cs]&&H.el[cs](),N(D,[I])},enter(I){if(E[x]===e)return;let D=c,H=u,F=d;if(!s.isMounted)if(i)D=R||c,H=b||u,F=v||d;else return;let M=!1;I[Ma]=B=>{M||(M=!0,B?N(F,[I]):N(H,[I]),S.delayedLeave&&S.delayedLeave(),I[Ma]=void 0)};const W=I[Ma].bind(null,!1);D?O(D,[I,W]):W()},leave(I,D){const H=String(e.key);if(I[Ma]&&I[Ma](!0),s.isUnmounting)return D();N(f,[I]);let F=!1;I[cs]=W=>{F||(F=!0,D(),W?N(g,[I]):N(m,[I]),I[cs]=void 0,E[H]===e&&delete E[H])};const M=I[cs].bind(null,!1);E[H]=e,p?O(p,[I,M]):M()},clone(I){const D=ma(I,t,s,n,a);return a&&a(D),D}};return S}function yr(e){if(Ei(e))return e=Ns(e),e.children=null,e}function su(e){if(!Ei(e))return Lf(e.type)&&e.children?Df(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&_e(s.default))return s.default()}}function Xs(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Xs(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Wl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Tt?(l.patchFlag&128&&a++,n=n.concat(Wl(l.children,t,r))):(t||l.type!==dt)&&n.push(r!=null?Ns(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Ci(e,t){return _e(e)?Oe({name:e.name},t,{setup:e}):e}function sv(){const e=Kt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function $o(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function nv(e){const t=Kt(),s=Lo(null);if(t){const a=t.refs===Me?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function nu(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const fl=new WeakMap;function da(e,t,s,n,a=!1){if(pe(e)){e.forEach((g,w)=>da(g,t&&(pe(t)?t[w]:t),s,n,a));return}if(Ws(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&da(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Ai(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Me?r.refs={}:r.refs,d=r.setupState,f=Fe(d),p=d===Me?aa:g=>nu(u,g)?!1:He(f,g),m=(g,w)=>!(w&&nu(u,w));if(c!=null&&c!==o){if(au(t),Te(c))u[c]=null,p(c)&&(d[c]=null);else if(mt(c)){const g=t;m(c,g.k)&&(c.value=null),g.k&&(u[g.k]=null)}}if(_e(o))Aa(o,r,12,[l,u]);else{const g=Te(o),w=mt(o);if(g||w){const R=()=>{if(e.f){const b=g?p(o)?d[o]:u[o]:m()||!e.k?o.value:u[e.k];if(a)pe(b)&&To(b,i);else if(pe(b))b.includes(i)||b.push(i);else if(g)u[o]=[i],p(o)&&(d[o]=u[o]);else{const v=[i];m(o,e.k)&&(o.value=v),e.k&&(u[e.k]=v)}}else g?(u[o]=l,p(o)&&(d[o]=l)):w&&(m(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const b=()=>{R(),fl.delete(e)};b.id=-1,fl.set(e,b),ht(b,s)}else au(e),R()}}}function au(e){const t=fl.get(e);t&&(t.flags|=8,fl.delete(e))}let iu=!1;const Jn=()=>{iu||(console.error("Hydration completed but contains mismatches."),iu=!0)},av=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",iv=e=>e.namespaceURI.includes("MathML"),ji=e=>{if(e.nodeType===1){if(av(e))return"svg";if(iv(e))return"mathml"}},ia=e=>e.nodeType===8;function lv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(v,x)=>{if(!x.hasChildNodes()){s(null,v,x),dl(),x._vnode=v;return}d(x.firstChild,v,null,null,null),dl(),x._vnode=v},d=(v,x,E,N,O,S=!1)=>{S=S||!!x.dynamicChildren;const I=ia(v)&&v.data==="[",D=()=>g(v,x,E,N,O,I),{type:H,ref:F,shapeFlag:M,patchFlag:W}=x;let B=v.nodeType;x.el=v,W===-2&&(S=!1,x.dynamicChildren=null);let j=null;switch(H){case gn:B!==3?x.children===""?(o(x.el=a(""),l(v),v),j=v):j=D():(v.data!==x.children&&(Jn(),v.data=x.children),j=i(v));break;case dt:b(v)?(j=i(v),R(x.el=v.content.firstChild,v,E)):B!==8||I?j=D():j=i(v);break;case Ln:if(I&&(v=i(v),B=v.nodeType),B===1||B===3){j=v;const L=!x.children.length;for(let k=0;k<x.staticCount;k++)L&&(x.children+=j.nodeType===1?j.outerHTML:j.data),k===x.staticCount-1&&(x.anchor=j),j=i(j);return I?i(j):j}else D();break;case Tt:I?j=m(v,x,E,N,O,S):j=D();break;default:if(M&1)(B!==1||x.type.toLowerCase()!==v.tagName.toLowerCase())&&!b(v)?j=D():j=f(v,x,E,N,O,S);else if(M&6){x.slotScopeIds=O;const L=l(v);if(I?j=w(v):ia(v)&&v.data==="teleport start"?j=w(v,v.data,"teleport end"):j=i(v),t(x,L,null,E,N,ji(L),S),Ws(x)&&!x.type.__asyncResolved){let k;I?(k=at(Tt),k.anchor=j?j.previousSibling:L.lastChild):k=v.nodeType===3?Jo(""):at("div"),k.el=v,x.component.subTree=k}}else M&64?B!==8?j=D():j=x.type.hydrate(v,x,E,N,O,S,e,p):M&128&&(j=x.type.hydrate(v,x,E,N,ji(l(v)),O,S,e,d))}return F!=null&&da(F,null,N,x),j},f=(v,x,E,N,O,S)=>{S=S||!!x.dynamicChildren;const{type:I,props:D,patchFlag:H,shapeFlag:F,dirs:M,transition:W}=x,B=I==="input"||I==="option";if(B||H!==-1){M&&Es(x,null,E,"created");let j=!1;if(b(v)){j=rp(null,W)&&E&&E.vnode.props&&E.vnode.props.appear;const k=v.content.firstChild;if(j){const $=k.getAttribute("class");$&&(k.$cls=$),W.beforeEnter(k)}R(k,v,E),x.el=v=k}if(F&16&&!(D&&(D.innerHTML||D.textContent))){let k=p(v.firstChild,x,v,E,N,O,S);for(k&&!zi(v,1)&&Jn();k;){const $=k;k=k.nextSibling,r($)}}else if(F&8){let k=x.children;k[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(k=k.slice(1));const{textContent:$}=v;$!==k&&$!==k.replace(/\r\n|\r/g,`
`)&&(zi(v,0)||Jn(),v.textContent=x.children)}if(D){if(B||!S||H&48){const k=v.tagName.includes("-");for(const $ in D)(B&&($.endsWith("value")||$==="indeterminate")||Bn($)&&!qs($)||$[0]==="."||k&&!qs($))&&n(v,$,null,D[$],void 0,E)}else if(D.onClick)n(v,"onClick",null,D.onClick,void 0,E);else if(H&4&&Gs(D.style))for(const k in D.style)D.style[k]}let L;(L=D&&D.onVnodeBeforeMount)&&Zt(L,E,x),M&&Es(x,null,E,"beforeMount"),((L=D&&D.onVnodeMounted)||M||j)&&dp(()=>{L&&Zt(L,E,x),j&&W.enter(v),M&&Es(x,null,E,"mounted")},N)}return v.nextSibling},p=(v,x,E,N,O,S,I)=>{I=I||!!x.dynamicChildren;const D=x.children,H=D.length;let F=!1;for(let M=0;M<H;M++){const W=I?D[M]:D[M]=Yt(D[M]),B=W.type===gn;v?(B&&!I&&M+1<H&&Yt(D[M+1]).type===gn&&(o(a(v.data.slice(W.children.length)),E,i(v)),v.data=W.children),v=d(v,W,N,O,S,I)):B&&!W.children?o(W.el=a(""),E):(F||(F=!0,zi(E,1)||Jn()),s(null,W,E,null,N,O,ji(E),S))}return v},m=(v,x,E,N,O,S)=>{const{slotScopeIds:I}=x;I&&(O=O?O.concat(I):I);const D=l(v),H=p(i(v),x,D,E,N,O,S);return H&&ia(H)&&H.data==="]"?i(x.anchor=H):(Jn(),o(x.anchor=c("]"),D,H),H)},g=(v,x,E,N,O,S)=>{if(zi(v.parentElement,1)||Jn(),x.el=null,S){const H=w(v);for(;;){const F=i(v);if(F&&F!==H)r(F);else break}}const I=i(v),D=l(v);return r(v),s(null,x,D,I,E,N,ji(D),O),E&&(E.vnode.el=x.el,Xl(E,x.el)),I},w=(v,x="[",E="]")=>{let N=0;for(;v;)if(v=i(v),v&&ia(v)&&(v.data===x&&N++,v.data===E)){if(N===0)return i(v);N--}return v},R=(v,x,E)=>{const N=x.parentNode;N&&N.replaceChild(v,x);let O=E;for(;O;)O.vnode.el===x&&(O.vnode.el=O.subTree.el=v),O=O.parent},b=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[u,d]}const lu="data-allow-mismatch",rv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function zi(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(lu);)e=e.parentElement;const s=e&&e.getAttribute(lu);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(rv[t])}}const ov=Hl().requestIdleCallback||(e=>setTimeout(e,1)),cv=Hl().cancelIdleCallback||(e=>clearTimeout(e)),uv=(e=1e4)=>t=>{const s=ov(t,{timeout:e});return()=>cv(s)};function dv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const fv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(dv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},pv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},hv=(e=[])=>(t,s)=>{Te(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function gv(e,t){if(ia(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(ia(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Ws=e=>!!e.type.__asyncLoader;function mv(e){_e(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let m;return c||(m=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((w,R)=>{o(g,()=>w(f()),()=>R(g),d+1)});throw g}).then(g=>m!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),u=g,g)))};return Ci({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(m,g,w){let R=!1;(g.bu||(g.bu=[])).push(()=>R=!0);const b=()=>{R||w()},v=i?()=>{const x=i(b,E=>gv(m,E));x&&(g.bum||(g.bum=[])).push(x)}:b;u?v():p().then(()=>!g.isUnmounted&&v())},get __asyncResolved(){return u},setup(){const m=Rt;if($o(m),u)return()=>Ki(u,m);const g=E=>{c=null,jn(E,m,13,!n)};if(r&&m.suspense||Fn)return p().then(E=>()=>Ki(E,m)).catch(E=>(g(E),()=>n?at(n,{error:E}):null));const w=h(!1),R=h(),b=h(!!a);let v,x;return ft(()=>{v!=null&&clearTimeout(v),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{m.isUnmounted||(b.value=!1)},a)),l!=null&&(v=setTimeout(()=>{if(!m.isUnmounted&&!w.value&&!R.value){const E=new Error(`Async component timed out after ${l}ms.`);g(E),R.value=E}},l)),p().then(()=>{m.isUnmounted||(w.value=!0,m.parent&&Ei(m.parent.vnode)&&m.parent.update())}).catch(E=>{if(m.isUnmounted){c=null;return}g(E),R.value=E}),()=>{if(w.value&&u)return Ki(u,m);if(R.value&&n)return at(n,{error:R.value});if(s&&!b.value)return Ki(s,m)}}})}function Ki(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=at(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Ei=e=>e.type.__isKeepAlive,vv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Kt(),n=s.ctx;if(!n.renderer)return()=>{const b=t.default&&t.default();return b&&b.length===1?b[0]:b};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(b,v,x,E,N)=>{const O=b.component;c(b,v,x,0,r),o(O.vnode,b,v,x,O,r,E,b.slotScopeIds,N),ht(()=>{O.isDeactivated=!1,O.a&&ca(O.a);const S=b.props&&b.props.onVnodeMounted;S&&Zt(S,O.parent,b)},r)},n.deactivate=b=>{const v=b.component;hl(v.m),hl(v.a),c(b,f,null,1,r),ht(()=>{v.da&&ca(v.da);const x=b.props&&b.props.onVnodeUnmounted;x&&Zt(x,v.parent,b),v.isDeactivated=!0},r)};function p(b){xr(b),u(b,s,r,!0)}function m(b){a.forEach((v,x)=>{const E=so(Ws(v)?v.type.__asyncResolved||{}:v.type);E&&!b(E)&&g(x)})}function g(b){const v=a.get(b);v&&(!l||!vs(v,l))?p(v):l&&xr(l),a.delete(b),i.delete(b)}ns(()=>[e.include,e.exclude],([b,v])=>{b&&m(x=>za(b,x)),v&&m(x=>!za(v,x))},{flush:"post",deep:!0});let w=null;const R=()=>{w!=null&&(gl(s.subTree.type)?ht(()=>{a.set(w,qi(s.subTree))},s.subTree.suspense):a.set(w,qi(s.subTree)))};return $e(R),Jl(R),Yl(()=>{a.forEach(b=>{const{subTree:v,suspense:x}=s,E=qi(v);if(b.type===E.type&&b.key===E.key){xr(E);const N=E.component.da;N&&ht(N,x);return}p(b)})}),()=>{if(w=null,!t.default)return l=null;const b=t.default(),v=b[0];if(b.length>1)return l=null,b;if(!en(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let x=qi(v);if(x.type===dt)return l=null,x;const E=x.type,N=so(Ws(x)?x.type.__asyncResolved||{}:E),{include:O,exclude:S,max:I}=e;if(O&&(!N||!za(O,N))||S&&N&&za(S,N))return x.shapeFlag&=-257,l=x,v;const D=x.key==null?E:x.key,H=a.get(D);return x.el&&(x=Ns(x),v.shapeFlag&128&&(v.ssContent=x)),w=D,H?(x.el=H.el,x.component=H.component,x.transition&&Xs(x,x.transition),x.shapeFlag|=512,i.delete(D),i.add(D)):(i.add(D),I&&i.size>parseInt(I,10)&&g(i.values().next().value)),x.shapeFlag|=256,l=x,gl(v.type)?v:x}}},bv=vv;function za(e,t){return pe(e)?e.some(s=>za(s,t)):Te(e)?e.split(",").includes(t):Ag(e)?(e.lastIndex=0,e.test(t)):!1}function Uo(e,t){Ff(e,"a",t)}function Bo(e,t){Ff(e,"da",t)}function Ff(e,t,s=Rt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Zl(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Ei(a.parent.vnode)&&yv(n,t,s,a),a=a.parent}}function yv(e,t,s,n){const a=Zl(t,e,n,!0);ft(()=>{To(n[t],a)},s)}function xr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function qi(e){return e.shapeFlag&128?e.ssContent:e}function Zl(e,t,s=Rt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Ys();const r=Ra(s),o=as(t,s,e,l);return r(),Qs(),o});return n?a.unshift(i):a.push(i),i}}const tn=e=>(t,s=Rt)=>{(!Fn||e==="sp")&&Zl(e,(...n)=>t(...n),s)},$f=tn("bm"),$e=tn("m"),Ho=tn("bu"),Jl=tn("u"),Yl=tn("bum"),ft=tn("um"),Uf=tn("sp"),Bf=tn("rtg"),Hf=tn("rtc");function Vf(e,t=Rt){Zl("ec",e,t)}const Vo="components",xv="directives";function _v(e,t){return jo(Vo,e,!0,t)||e}const jf=Symbol.for("v-ndc");function kv(e){return Te(e)?jo(Vo,e,!1)||e:e||jf}function wv(e){return jo(xv,e)}function jo(e,t,s=!0,n=!1){const a=It||Rt;if(a){const i=a.type;if(e===Vo){const r=so(i,!1);if(r&&(r===t||r===Ge(t)||r===Vn(Ge(t))))return i}const l=ru(a[e]||i[e],t)||ru(a.appContext[e],t);return!l&&n?i:l}}function ru(e,t){return e&&(e[t]||e[Ge(t)]||e[Vn(Ge(t))])}function Sv(e,t,s,n){let a;const i=s&&s[n],l=pe(e);if(l||Te(e)){const r=l&&Gs(e);let o=!1,c=!1;r&&(o=!es(e),c=Is(e),e=zl(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?ga(xs(e[u])):xs(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Be(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Tv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(pe(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Cv(e,t,s={},n,a){if(It.ce||It.parent&&Ws(It.parent)&&It.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),fi(),ml(Tt,null,[at("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),fi();const l=i&&zo(i(s)),r=s.key||l&&l.key,o=ml(Tt,{key:(r&&!Ut(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function zo(e){return e.some(t=>en(t)?!(t.type===dt||t.type===Tt&&!zo(t.children)):!0)?e:null}function Ev(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:oa(n)]=e[n];return s}const Wr=e=>e?yp(e)?Ai(e):Wr(e.parent):null,Ya=Oe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Wr(e.parent),$root:e=>Wr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Ko(e),$forceUpdate:e=>e.f||(e.f=()=>{Do(e.update)}),$nextTick:e=>e.n||(e.n=St.bind(e.proxy)),$watch:e=>Jm.bind(e)}),_r=(e,t)=>e!==Me&&!e.__isScriptSetup&&He(e,t),Zr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(_r(n,t))return l[t]=1,n[t];if(a!==Me&&He(a,t))return l[t]=2,a[t];if(He(i,t))return l[t]=3,i[t];if(s!==Me&&He(s,t))return l[t]=4,s[t];Jr&&(l[t]=0)}}const c=Ya[t];let u,d;if(c)return t==="$attrs"&&Pt(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Me&&He(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,He(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return _r(a,t)?(a[t]=s,!0):n!==Me&&He(n,t)?(n[t]=s,!0):He(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Me&&r[0]!=="$"&&He(e,r)||_r(t,r)||He(i,r)||He(n,r)||He(Ya,r)||He(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:He(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Av=Oe({},Zr,{get(e,t){if(t!==Symbol.unscopables)return Zr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Mg(t)}});function Rv(){return null}function Iv(){return null}function Nv(e){}function Lv(e){}function Ov(){return null}function Dv(){}function Mv(e,t){return null}function Pv(){return zf().slots}function Fv(){return zf().attrs}function zf(e){const t=Kt();return t.setupContext||(t.setupContext=wp(t))}function ui(e){return pe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function $v(e,t){const s=ui(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?pe(a)||_e(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Uv(e,t){return!e||!t?e||t:pe(e)&&pe(t)?e.concat(t):Oe({},ui(e),ui(t))}function Bv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Hv(e){const t=Kt(),s=Fn;let n=e();hi(),s&&pa(!1);const a=()=>{Ra(t),s&&pa(!0)},i=()=>{Kt()!==t&&t.scope.off(),hi(),s&&pa(!1)};return Co(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Jr=!0;function Vv(e){const t=Ko(e),s=e.proxy,n=e.ctx;Jr=!1,t.beforeCreate&&ou(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:m,activated:g,deactivated:w,beforeDestroy:R,beforeUnmount:b,destroyed:v,unmounted:x,render:E,renderTracked:N,renderTriggered:O,errorCaptured:S,serverPrefetch:I,expose:D,inheritAttrs:H,components:F,directives:M,filters:W}=t;if(c&&jv(c,n,null),l)for(const L in l){const k=l[L];_e(k)&&(n[L]=k.bind(s))}if(a){const L=a.call(s,s);Be(L)&&(e.data=bn(L))}if(Jr=!0,i)for(const L in i){const k=i[L],$=_e(k)?k.bind(s,s):_e(k.get)?k.get.bind(s,s):Nt,oe=!_e(k)&&_e(k.set)?k.set.bind(s):Nt,re=ee({get:$,set:oe});Object.defineProperty(n,L,{enumerable:!0,configurable:!0,get:()=>re.value,set:se=>re.value=se})}if(r)for(const L in r)Kf(r[L],n,s,L);if(o){const L=_e(o)?o.call(s):o;Reflect.ownKeys(L).forEach(k=>{Ja(k,L[k])})}u&&ou(u,e,"c");function j(L,k){pe(k)?k.forEach($=>L($.bind(s))):k&&L(k.bind(s))}if(j($f,d),j($e,f),j(Ho,p),j(Jl,m),j(Uo,g),j(Bo,w),j(Vf,S),j(Hf,N),j(Bf,O),j(Yl,b),j(ft,x),j(Uf,I),pe(D))if(D.length){const L=e.exposed||(e.exposed={});D.forEach(k=>{Object.defineProperty(L,k,{get:()=>s[k],set:$=>s[k]=$,enumerable:!0})})}else e.exposed||(e.exposed={});E&&e.render===Nt&&(e.render=E),H!=null&&(e.inheritAttrs=H),F&&(e.components=F),M&&(e.directives=M),I&&$o(e)}function jv(e,t,s=Nt){pe(e)&&(e=Yr(e));for(const n in e){const a=e[n];let i;Be(a)?"default"in a?i=fs(a.from||n,a.default,!0):i=fs(a.from||n):i=fs(a),mt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function ou(e,t,s){as(pe(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Kf(e,t,s,n){let a=n.includes(".")?If(s,n):()=>s[n];if(Te(e)){const i=t[e];_e(i)&&ns(a,i)}else if(_e(e))ns(a,e.bind(s));else if(Be(e))if(pe(e))e.forEach(i=>Kf(i,t,s,n));else{const i=_e(e.handler)?e.handler.bind(s):t[e.handler];_e(i)&&ns(a,i,e)}}function Ko(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>pl(o,c,l,!0)),pl(o,t,l)),Be(t)&&i.set(t,o),o}function pl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&pl(e,i,s,!0),a&&a.forEach(l=>pl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=zv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const zv={data:cu,props:uu,emits:uu,methods:Ka,computed:Ka,beforeCreate:Bt,created:Bt,beforeMount:Bt,mounted:Bt,beforeUpdate:Bt,updated:Bt,beforeDestroy:Bt,beforeUnmount:Bt,destroyed:Bt,unmounted:Bt,activated:Bt,deactivated:Bt,errorCaptured:Bt,serverPrefetch:Bt,components:Ka,directives:Ka,watch:qv,provide:cu,inject:Kv};function cu(e,t){return t?e?function(){return Oe(_e(e)?e.call(this,this):e,_e(t)?t.call(this,this):t)}:t:e}function Kv(e,t){return Ka(Yr(e),Yr(t))}function Yr(e){if(pe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Bt(e,t){return e?[...new Set([].concat(e,t))]:t}function Ka(e,t){return e?Oe(Object.create(null),e,t):t}function uu(e,t){return e?pe(e)&&pe(t)?[...new Set([...e,...t])]:Oe(Object.create(null),ui(e),ui(t??{})):t}function qv(e,t){if(!e)return t;if(!t)return e;const s=Oe(Object.create(null),e);for(const n in t)s[n]=Bt(e[n],t[n]);return s}function qf(){return{app:null,config:{isNativeTag:aa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Gv=0;function Wv(e,t){return function(n,a=null){_e(n)||(n=Oe({},n)),a!=null&&!Be(a)&&(a=null);const i=qf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Gv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Tp,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&_e(u.install)?(l.add(u),u.install(c,...d)):_e(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||at(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,Ai(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(as(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=Nn;Nn=c;try{return u()}finally{Nn=d}}};return c}}let Nn=null;function Zv(e,t,s=Me){const n=Kt(),a=Ge(t),i=Qt(t),l=Gf(e,a),r=yf((o,c)=>{let u,d=Me,f;return Rf(()=>{const p=e[a];wt(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const m=s.set?s.set(p):p;if(!wt(m,u)&&!(d!==Me&&wt(p,d)))return;const g=n.vnode.props,w=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));w||(u=p,c()),n.emit(`update:${t}`,m),wt(p,d)&&(wt(p,m)&&!wt(m,f)||w&&d!==Me&&!wt(m,u))&&c(),d=p,f=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Me:r,done:!1}:{done:!0}}}},r}const Gf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Ge(t)}Modifiers`]||e[`${Qt(t)}Modifiers`];function Jv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Me;let a=s;const i=t.startsWith("update:"),l=i&&Gf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Te(u)?u.trim():u)),l.number&&(a=s.map(Bl)));let r,o=n[r=oa(t)]||n[r=oa(Ge(t))];!o&&i&&(o=n[r=oa(Qt(t))]),o&&as(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,as(c,e,6,a)}}const Yv=new WeakMap;function Wf(e,t,s=!1){const n=s?Yv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!_e(e)){const o=c=>{const u=Wf(c,t,!0);u&&(r=!0,Oe(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Be(e)&&n.set(e,null),null):(pe(i)?i.forEach(o=>l[o]=null):Oe(l,i),Be(e)&&n.set(e,l),l)}function Ql(e,t){return!e||!Bn(t)?!1:(t=t.slice(2).replace(/Once$/,""),He(e,t[0].toLowerCase()+t.slice(1))||He(e,Qt(t))||He(e,t))}function Xi(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:m,inheritAttrs:g}=e,w=ci(e);let R,b;try{if(s.shapeFlag&4){const x=a||n,E=x;R=Yt(c.call(E,x,u,d,p,f,m)),b=r}else{const x=t;R=Yt(x.length>1?x(d,{attrs:r,slots:l,emit:o}):x(d,null)),b=t.props?r:Xv(r)}}catch(x){Qa.length=0,jn(x,e,1),R=at(dt)}let v=R;if(b&&g!==!1){const x=Object.keys(b),{shapeFlag:E}=v;x.length&&E&7&&(i&&x.some(Pl)&&(b=eb(b,i)),v=Ns(v,b,!1,!0))}return s.dirs&&(v=Ns(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&Xs(v,s.transition),R=v,ci(w),R}function Qv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(en(a)){if(a.type!==dt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Xv=e=>{let t;for(const s in e)(s==="class"||s==="style"||Bn(s))&&((t||(t={}))[s]=e[s]);return t},eb=(e,t)=>{const s={};for(const n in e)(!Pl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function tb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?du(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(Zf(l,n,f)&&!Ql(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?du(n,l,c):!0:!!l;return!1}function du(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Zf(t,e,i)&&!Ql(s,i))return!0}return!1}function Zf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Be(n)&&Be(a)?!Js(n,a):n!==a}function Xl({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Jf={},Yf=()=>Object.create(Jf),Qf=e=>Object.getPrototypeOf(e)===Jf;function sb(e,t,s,n=!1){const a={},i=Yf();e.propsDefaults=Object.create(null),Xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:No(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function nb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Fe(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(Ql(e.emitsOptions,f))continue;const p=t[f];if(o)if(He(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const m=Ge(f);a[m]=Qr(o,r,m,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{Xf(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!He(t,d)&&((u=Qt(d))===d||!He(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=Qr(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!He(t,d))&&(delete i[d],c=!0)}c&&Hs(e.attrs,"set","")}function Xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(qs(o))continue;const c=t[o];let u;a&&He(a,u=Ge(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:Ql(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Fe(s),c=r||Me;for(let u=0;u<i.length;u++){const d=i[u];s[d]=Qr(a,o,d,c[d],e,!He(c,d))}}return l}function Qr(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=He(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&_e(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Ra(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===Qt(s))&&(n=!0))}return n}const ab=new WeakMap;function ep(e,t,s=!1){const n=s?ab:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!_e(e)){const u=d=>{o=!0;const[f,p]=ep(d,t,!0);Oe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return Be(e)&&n.set(e,la),la;if(pe(i))for(let u=0;u<i.length;u++){const d=Ge(i[u]);fu(d)&&(l[d]=Me)}else if(i)for(const u in i){const d=Ge(u);if(fu(d)){const f=i[u],p=l[d]=pe(f)||_e(f)?{type:f}:Oe({},f),m=p.type;let g=!1,w=!0;if(pe(m))for(let R=0;R<m.length;++R){const b=m[R],v=_e(b)&&b.name;if(v==="Boolean"){g=!0;break}else v==="String"&&(w=!1)}else g=_e(m)&&m.name==="Boolean";p[0]=g,p[1]=w,(g||He(p,"default"))&&r.push(d)}}const c=[l,r];return Be(e)&&n.set(e,c),c}function fu(e){return e[0]!=="$"&&!qs(e)}const qo=e=>e==="_"||e==="_ctx"||e==="$stable",Go=e=>pe(e)?e.map(Yt):[Yt(e)],ib=(e,t,s)=>{if(t._n)return t;const n=Mo((...a)=>Go(t(...a)),s);return n._c=!1,n},tp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(qo(a))continue;const i=e[a];if(_e(i))t[a]=ib(a,i,n);else if(i!=null){const l=Go(i);t[a]=()=>l}}},sp=(e,t)=>{const s=Go(t);e.slots.default=()=>s},np=(e,t,s)=>{for(const n in t)(s||!qo(n))&&(e[n]=t[n])},lb=(e,t,s)=>{const n=e.slots=Yf();if(e.vnode.shapeFlag&32){const a=t._;a?(np(n,t,s),s&&Wd(n,"_",a,!0)):tp(t,n)}else t&&sp(e,t)},rb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Me;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:np(a,t,s):(i=!t.$stable,tp(t,a)),l=t}else t&&(sp(e,t),l={default:1});if(i)for(const r in a)!qo(r)&&l[r]==null&&delete a[r]},ht=dp;function ap(e){return lp(e)}function ip(e){return lp(e,lv)}function lp(e,t){const s=Hl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=Nt,insertStaticContent:m}=e,g=(y,T,P,G=null,A=null,U=null,Z=void 0,X=null,te=!!T.dynamicChildren)=>{if(y===T)return;y&&!vs(y,T)&&(G=z(y),se(y,A,U,!0),y=null),T.patchFlag===-2&&(te=!1,T.dynamicChildren=null);const{type:Y,ref:he,shapeFlag:ie}=T;switch(Y){case gn:w(y,T,P,G);break;case dt:R(y,T,P,G);break;case Ln:y==null&&b(T,P,G,Z);break;case Tt:F(y,T,P,G,A,U,Z,X,te);break;default:ie&1?E(y,T,P,G,A,U,Z,X,te):ie&6?M(y,T,P,G,A,U,Z,X,te):(ie&64||ie&128)&&Y.process(y,T,P,G,A,U,Z,X,te,me)}he!=null&&A?da(he,y&&y.ref,U,T||y,!T):he==null&&y&&y.ref!=null&&da(y.ref,null,U,y,!0)},w=(y,T,P,G)=>{if(y==null)n(T.el=r(T.children),P,G);else{const A=T.el=y.el;T.children!==y.children&&c(A,T.children)}},R=(y,T,P,G)=>{y==null?n(T.el=o(T.children||""),P,G):T.el=y.el},b=(y,T,P,G)=>{[y.el,y.anchor]=m(y.children,T,P,G,y.el,y.anchor)},v=({el:y,anchor:T},P,G)=>{let A;for(;y&&y!==T;)A=f(y),n(y,P,G),y=A;n(T,P,G)},x=({el:y,anchor:T})=>{let P;for(;y&&y!==T;)P=f(y),a(y),y=P;a(T)},E=(y,T,P,G,A,U,Z,X,te)=>{if(T.type==="svg"?Z="svg":T.type==="math"&&(Z="mathml"),y==null)N(T,P,G,A,U,Z,X,te);else{const Y=y.el&&y.el._isVueCE?y.el:null;try{Y&&Y._beginPatch(),I(y,T,A,U,Z,X,te)}finally{Y&&Y._endPatch()}}},N=(y,T,P,G,A,U,Z,X)=>{let te,Y;const{props:he,shapeFlag:ie,transition:de,dirs:ye}=y;if(te=y.el=l(y.type,U,he&&he.is,he),ie&8?u(te,y.children):ie&16&&S(y.children,te,null,G,A,kr(y,U),Z,X),ye&&Es(y,null,G,"created"),O(te,y,y.scopeId,Z,G),he){for(const Ee in he)Ee!=="value"&&!qs(Ee)&&i(te,Ee,null,he[Ee],U,G);"value"in he&&i(te,"value",null,he.value,U),(Y=he.onVnodeBeforeMount)&&Zt(Y,G,y)}ye&&Es(y,null,G,"beforeMount");const we=rp(A,de);we&&de.beforeEnter(te),n(te,T,P),((Y=he&&he.onVnodeMounted)||we||ye)&&ht(()=>{try{Y&&Zt(Y,G,y),we&&de.enter(te),ye&&Es(y,null,G,"mounted")}finally{}},A)},O=(y,T,P,G,A)=>{if(P&&p(y,P),G)for(let U=0;U<G.length;U++)p(y,G[U]);if(A){let U=A.subTree;if(T===U||gl(U.type)&&(U.ssContent===T||U.ssFallback===T)){const Z=A.vnode;O(y,Z,Z.scopeId,Z.slotScopeIds,A.parent)}}},S=(y,T,P,G,A,U,Z,X,te=0)=>{for(let Y=te;Y<y.length;Y++){const he=y[Y]=X?Us(y[Y]):Yt(y[Y]);g(null,he,T,P,G,A,U,Z,X)}},I=(y,T,P,G,A,U,Z)=>{const X=T.el=y.el;let{patchFlag:te,dynamicChildren:Y,dirs:he}=T;te|=y.patchFlag&16;const ie=y.props||Me,de=T.props||Me;let ye;if(P&&kn(P,!1),(ye=de.onVnodeBeforeUpdate)&&Zt(ye,P,T,y),he&&Es(T,y,P,"beforeUpdate"),P&&kn(P,!0),(ie.innerHTML&&de.innerHTML==null||ie.textContent&&de.textContent==null)&&u(X,""),Y?D(y.dynamicChildren,Y,X,P,G,kr(T,A),U):Z||k(y,T,X,null,P,G,kr(T,A),U,!1),te>0){if(te&16)H(X,ie,de,P,A);else if(te&2&&ie.class!==de.class&&i(X,"class",null,de.class,A),te&4&&i(X,"style",ie.style,de.style,A),te&8){const we=T.dynamicProps;for(let Ee=0;Ee<we.length;Ee++){const C=we[Ee],Q=ie[C],be=de[C];(be!==Q||C==="value")&&i(X,C,Q,be,A,P)}}te&1&&y.children!==T.children&&u(X,T.children)}else!Z&&Y==null&&H(X,ie,de,P,A);((ye=de.onVnodeUpdated)||he)&&ht(()=>{ye&&Zt(ye,P,T,y),he&&Es(T,y,P,"updated")},G)},D=(y,T,P,G,A,U,Z)=>{for(let X=0;X<T.length;X++){const te=y[X],Y=T[X],he=te.el&&(te.type===Tt||!vs(te,Y)||te.shapeFlag&198)?d(te.el):P;g(te,Y,he,null,G,A,U,Z,!0)}},H=(y,T,P,G,A)=>{if(T!==P){if(T!==Me)for(const U in T)!qs(U)&&!(U in P)&&i(y,U,T[U],null,A,G);for(const U in P){if(qs(U))continue;const Z=P[U],X=T[U];Z!==X&&U!=="value"&&i(y,U,X,Z,A,G)}"value"in P&&i(y,"value",T.value,P.value,A)}},F=(y,T,P,G,A,U,Z,X,te)=>{const Y=T.el=y?y.el:r(""),he=T.anchor=y?y.anchor:r("");let{patchFlag:ie,dynamicChildren:de,slotScopeIds:ye}=T;ye&&(X=X?X.concat(ye):ye),y==null?(n(Y,P,G),n(he,P,G),S(T.children||[],P,he,A,U,Z,X,te)):ie>0&&ie&64&&de&&y.dynamicChildren&&y.dynamicChildren.length===de.length?(D(y.dynamicChildren,de,P,A,U,Z,X),(T.key!=null||A&&T===A.subTree)&&Wo(y,T,!0)):k(y,T,P,he,A,U,Z,X,te)},M=(y,T,P,G,A,U,Z,X,te)=>{T.slotScopeIds=X,y==null?T.shapeFlag&512?A.ctx.activate(T,P,G,Z,te):W(T,P,G,A,U,Z,te):B(y,T,te)},W=(y,T,P,G,A,U,Z)=>{const X=y.component=bp(y,G,A);if(Ei(y)&&(X.ctx.renderer=me),xp(X,!1,Z),X.asyncDep){if(A&&A.registerDep(X,j,Z),!y.el){const te=X.subTree=at(dt);R(null,te,T,P),y.placeholder=te.el}}else j(X,y,T,P,A,U,Z)},B=(y,T,P)=>{const G=T.component=y.component;if(tb(y,T,P))if(G.asyncDep&&!G.asyncResolved){L(G,T,P);return}else G.next=T,G.update();else T.el=y.el,G.vnode=T},j=(y,T,P,G,A,U,Z)=>{const X=()=>{if(y.isMounted){let{next:ie,bu:de,u:ye,parent:we,vnode:Ee}=y;{const Je=op(y);if(Je){ie&&(ie.el=Ee.el,L(y,ie,Z)),Je.asyncDep.then(()=>{ht(()=>{y.isUnmounted||Y()},A)});return}}let C=ie,Q;kn(y,!1),ie?(ie.el=Ee.el,L(y,ie,Z)):ie=Ee,de&&ca(de),(Q=ie.props&&ie.props.onVnodeBeforeUpdate)&&Zt(Q,we,ie,Ee),kn(y,!0);const be=Xi(y),De=y.subTree;y.subTree=be,g(De,be,d(De.el),z(De),y,A,U),ie.el=be.el,C===null&&Xl(y,be.el),ye&&ht(ye,A),(Q=ie.props&&ie.props.onVnodeUpdated)&&ht(()=>Zt(Q,we,ie,Ee),A)}else{let ie;const{el:de,props:ye}=T,{bm:we,m:Ee,parent:C,root:Q,type:be}=y,De=Ws(T);if(kn(y,!1),we&&ca(we),!De&&(ie=ye&&ye.onVnodeBeforeMount)&&Zt(ie,C,T),kn(y,!0),de&&Le){const Je=()=>{y.subTree=Xi(y),Le(de,y.subTree,y,A,null)};De&&be.__asyncHydrate?be.__asyncHydrate(de,y,Je):Je()}else{Q.ce&&Q.ce._hasShadowRoot()&&Q.ce._injectChildStyle(be,y.parent?y.parent.type:void 0);const Je=y.subTree=Xi(y);g(null,Je,P,G,y,A,U),T.el=Je.el}if(Ee&&ht(Ee,A),!De&&(ie=ye&&ye.onVnodeMounted)){const Je=T;ht(()=>Zt(ie,C,Je),A)}(T.shapeFlag&256||C&&Ws(C.vnode)&&C.vnode.shapeFlag&256)&&y.a&&ht(y.a,A),y.isMounted=!0,T=P=G=null}};y.scope.on();const te=y.effect=new ai(X);y.scope.off();const Y=y.update=te.run.bind(te),he=y.job=te.runIfDirty.bind(te);he.i=y,he.id=y.uid,te.scheduler=()=>Do(he),kn(y,!0),Y()},L=(y,T,P)=>{T.component=y;const G=y.vnode.props;y.vnode=T,y.next=null,nb(y,T.props,G,P),rb(y,T.children,P),Ys(),Xc(y),Qs()},k=(y,T,P,G,A,U,Z,X,te=!1)=>{const Y=y&&y.children,he=y?y.shapeFlag:0,ie=T.children,{patchFlag:de,shapeFlag:ye}=T;if(de>0){if(de&128){oe(Y,ie,P,G,A,U,Z,X,te);return}else if(de&256){$(Y,ie,P,G,A,U,Z,X,te);return}}ye&8?(he&16&&Ie(Y,A,U),ie!==Y&&u(P,ie)):he&16?ye&16?oe(Y,ie,P,G,A,U,Z,X,te):Ie(Y,A,U,!0):(he&8&&u(P,""),ye&16&&S(ie,P,G,A,U,Z,X,te))},$=(y,T,P,G,A,U,Z,X,te)=>{y=y||la,T=T||la;const Y=y.length,he=T.length,ie=Math.min(Y,he);let de;for(de=0;de<ie;de++){const ye=T[de]=te?Us(T[de]):Yt(T[de]);g(y[de],ye,P,null,A,U,Z,X,te)}Y>he?Ie(y,A,U,!0,!1,ie):S(T,P,G,A,U,Z,X,te,ie)},oe=(y,T,P,G,A,U,Z,X,te)=>{let Y=0;const he=T.length;let ie=y.length-1,de=he-1;for(;Y<=ie&&Y<=de;){const ye=y[Y],we=T[Y]=te?Us(T[Y]):Yt(T[Y]);if(vs(ye,we))g(ye,we,P,null,A,U,Z,X,te);else break;Y++}for(;Y<=ie&&Y<=de;){const ye=y[ie],we=T[de]=te?Us(T[de]):Yt(T[de]);if(vs(ye,we))g(ye,we,P,null,A,U,Z,X,te);else break;ie--,de--}if(Y>ie){if(Y<=de){const ye=de+1,we=ye<he?T[ye].el:G;for(;Y<=de;)g(null,T[Y]=te?Us(T[Y]):Yt(T[Y]),P,we,A,U,Z,X,te),Y++}}else if(Y>de)for(;Y<=ie;)se(y[Y],A,U,!0),Y++;else{const ye=Y,we=Y,Ee=new Map;for(Y=we;Y<=de;Y++){const st=T[Y]=te?Us(T[Y]):Yt(T[Y]);st.key!=null&&Ee.set(st.key,Y)}let C,Q=0;const be=de-we+1;let De=!1,Je=0;const We=new Array(be);for(Y=0;Y<be;Y++)We[Y]=0;for(Y=ye;Y<=ie;Y++){const st=y[Y];if(Q>=be){se(st,A,U,!0);continue}let Ye;if(st.key!=null)Ye=Ee.get(st.key);else for(C=we;C<=de;C++)if(We[C-we]===0&&vs(st,T[C])){Ye=C;break}Ye===void 0?se(st,A,U,!0):(We[Ye-we]=Y+1,Ye>=Je?Je=Ye:De=!0,g(st,T[Ye],P,null,A,U,Z,X,te),Q++)}const Ct=De?ob(We):la;for(C=Ct.length-1,Y=be-1;Y>=0;Y--){const st=we+Y,Ye=T[st],sn=T[st+1],xn=st+1<he?sn.el||cp(sn):G;We[Y]===0?g(null,Ye,P,xn,A,U,Z,X,te):De&&(C<0||Y!==Ct[C]?re(Ye,P,xn,2):C--)}}},re=(y,T,P,G,A=null)=>{const{el:U,type:Z,transition:X,children:te,shapeFlag:Y}=y;if(Y&6){re(y.component.subTree,T,P,G);return}if(Y&128){y.suspense.move(T,P,G);return}if(Y&64){Z.move(y,T,P,me);return}if(Z===Tt){n(U,T,P);for(let ie=0;ie<te.length;ie++)re(te[ie],T,P,G);n(y.anchor,T,P);return}if(Z===Ln){v(y,T,P);return}if(G!==2&&Y&1&&X)if(G===0)X.persisted&&!U[cs]?n(U,T,P):(X.beforeEnter(U),n(U,T,P),ht(()=>X.enter(U),A));else{const{leave:ie,delayLeave:de,afterLeave:ye}=X,we=()=>{y.ctx.isUnmounted?a(U):n(U,T,P)},Ee=()=>{const C=U._isLeaving||!!U[cs];U._isLeaving&&U[cs](!0),X.persisted&&!C?we():ie(U,()=>{we(),ye&&ye()})};de?de(U,we,Ee):Ee()}else n(U,T,P)},se=(y,T,P,G=!1,A=!1)=>{const{type:U,props:Z,ref:X,children:te,dynamicChildren:Y,shapeFlag:he,patchFlag:ie,dirs:de,cacheIndex:ye,memo:we}=y;if(ie===-2&&(A=!1),X!=null&&(Ys(),da(X,null,P,y,!0),Qs()),ye!=null&&(T.renderCache[ye]=void 0),he&256){T.ctx.deactivate(y);return}const Ee=he&1&&de,C=!Ws(y);let Q;if(C&&(Q=Z&&Z.onVnodeBeforeUnmount)&&Zt(Q,T,y),he&6)ue(y.component,P,G);else{if(he&128){y.suspense.unmount(P,G);return}Ee&&Es(y,null,T,"beforeUnmount"),he&64?y.type.remove(y,T,P,me,G):Y&&!Y.hasOnce&&(U!==Tt||ie>0&&ie&64)?Ie(Y,T,P,!1,!0):(U===Tt&&ie&384||!A&&he&16)&&Ie(te,T,P),G&&fe(y)}const be=we!=null&&ye==null;(C&&(Q=Z&&Z.onVnodeUnmounted)||Ee||be)&&ht(()=>{Q&&Zt(Q,T,y),Ee&&Es(y,null,T,"unmounted"),be&&(y.el=null)},P)},fe=y=>{const{type:T,el:P,anchor:G,transition:A}=y;if(T===Tt){J(P,G);return}if(T===Ln){x(y);return}const U=()=>{a(P),A&&!A.persisted&&A.afterLeave&&A.afterLeave()};if(y.shapeFlag&1&&A&&!A.persisted){const{leave:Z,delayLeave:X}=A,te=()=>Z(P,U);X?X(y.el,U,te):te()}else U()},J=(y,T)=>{let P;for(;y!==T;)P=f(y),a(y),y=P;a(T)},ue=(y,T,P)=>{const{bum:G,scope:A,job:U,subTree:Z,um:X,m:te,a:Y}=y;hl(te),hl(Y),G&&ca(G),A.stop(),U&&(U.flags|=8,se(Z,y,T,P)),X&&ht(X,T),ht(()=>{y.isUnmounted=!0},T)},Ie=(y,T,P,G=!1,A=!1,U=0)=>{for(let Z=U;Z<y.length;Z++)se(y[Z],T,P,G,A)},z=y=>{if(y.shapeFlag&6)return z(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const T=f(y.anchor||y.el),P=T&&T[Nf];return P?f(P):T};let ce=!1;const le=(y,T,P)=>{let G;y==null?T._vnode&&(se(T._vnode,null,null,!0),G=T._vnode.component):g(T._vnode||null,y,T,null,null,null,P),T._vnode=y,ce||(ce=!0,Xc(G),dl(),ce=!1)},me={p:g,um:se,m:re,r:fe,mt:W,mc:S,pc:k,pbc:D,n:z,o:e};let ve,Le;return t&&([ve,Le]=t(me)),{render:le,hydrate:ve,createApp:Wv(le,ve)}}function kr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function kn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function rp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Wo(e,t,s=!1){const n=e.children,a=t.children;if(pe(n)&&pe(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=Us(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Wo(l,r)),r.type===gn&&(r.patchFlag===-1&&(r=a[i]=Us(r)),r.el=l.el),r.type===dt&&!r.el&&(r.el=l.el)}}function ob(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function op(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:op(t)}function hl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function cp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?cp(t.subTree):null}const gl=e=>e.__isSuspense;let Xr=0;const cb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)db(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}fb(e,t,s,n,a,l,r,o,c)}},hydrate:pb,normalize:hb},ub=cb;function di(e,t){const s=e.props&&e.props[t];_e(s)&&s()}function db(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=up(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(di(e,"onPending"),di(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),fa(f,e.ssFallback)):f.resolve(!1,!0)}function fb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:m,pendingBranch:g,isInFallback:w,isHydrating:R}=d;if(g)d.pendingBranch=f,vs(g,f)?(o(g,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():w&&(R||(o(m,p,s,n,a,null,i,l,r),fa(d,p)))):(d.pendingId=Xr++,R?(d.isHydrating=!1,d.activeBranch=g):c(g,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),w?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(m,p,s,n,a,null,i,l,r),fa(d,p))):m&&vs(m,f)?(o(m,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(m&&vs(m,f))o(m,f,s,n,a,d,i,l,r),fa(d,f);else if(di(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=Xr++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:b,pendingId:v}=d;b>0?setTimeout(()=>{d.pendingId===v&&d.fallback(p)},b):b===0&&d.fallback(p)}}function up(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:m,o:{parentNode:g,remove:w}}=c;let R;const b=gb(e);b&&t&&t.pendingBranch&&(R=t.pendingId,t.deps++);const v=e.props?ll(e.props.timeout):void 0,x=i,E={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Xr++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(N=!1,O=!1){const{vnode:S,activeBranch:I,pendingBranch:D,pendingId:H,effects:F,parentComponent:M,container:W,isInFallback:B}=E;let j=!1;if(E.isHydrating)E.isHydrating=!1;else if(!N){j=I&&D.transition&&D.transition.mode==="out-in";let $=!1;j&&(I.transition.afterLeave=()=>{H===E.pendingId&&(f(D,W,i===x&&!$?m(I):i,0),ri(F),B&&S.ssFallback&&(S.ssFallback.el=null))}),I&&!E.isFallbackMountPending&&(g(I.el)===W&&(i=m(I),$=!0),p(I,M,E,!0),!j&&B&&S.ssFallback&&ht(()=>S.ssFallback.el=null,E)),j||f(D,W,i,0)}E.isFallbackMountPending=!1,fa(E,D),E.pendingBranch=null,E.isInFallback=!1;let L=E.parent,k=!1;for(;L;){if(L.pendingBranch){L.effects.push(...F),k=!0;break}L=L.parent}!k&&!j&&ri(F),E.effects=[],b&&t&&t.pendingBranch&&R===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),di(S,"onResolve")},fallback(N){if(!E.pendingBranch)return;const{vnode:O,activeBranch:S,parentComponent:I,container:D,namespace:H}=E;di(O,"onFallback");const F=m(S),M=()=>{E.isFallbackMountPending=!1,E.isInFallback&&(d(null,N,D,F,I,null,H,r,o),fa(E,N))},W=N.transition&&N.transition.mode==="out-in";W&&(E.isFallbackMountPending=!0,S.transition.afterLeave=M),E.isInFallback=!0,p(S,I,null,!0),W||M()},move(N,O,S){E.activeBranch&&f(E.activeBranch,N,O,S),E.container=N},next(){return E.activeBranch&&m(E.activeBranch)},registerDep(N,O,S){const I=!!E.pendingBranch;I&&E.deps++;const D=N.vnode.el;N.asyncDep.catch(H=>{jn(H,N,0)}).then(H=>{if(N.isUnmounted||E.isUnmounted||E.pendingId!==N.suspenseId)return;hi(),N.asyncResolved=!0;const{vnode:F}=N;eo(N,H,!1),D&&(F.el=D);const M=!D&&N.subTree.el;O(N,F,g(D||N.subTree.el),D?null:m(N.subTree),E,l,S),M&&(F.placeholder=null,w(M)),Xl(N,F.el),I&&--E.deps===0&&E.resolve()})},unmount(N,O){E.isUnmounted=!0,E.activeBranch&&p(E.activeBranch,s,N,O),E.pendingBranch&&p(E.pendingBranch,s,N,O)}};return E}function pb(e,t,s,n,a,i,l,r,o){const c=t.suspense=up(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function hb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=pu(n?s.default:s),e.ssFallback=n?pu(s.fallback):at(dt)}function pu(e){let t;if(_e(e)){const s=Pn&&e._c;s&&(e._d=!1,fi()),e=e(),s&&(e._d=!0,t=Ft,fp())}return pe(e)&&(e=Qv(e)),e=Yt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function dp(e,t){t&&t.pendingBranch?pe(e)?t.effects.push(...e):t.effects.push(e):ri(e)}function fa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Xl(n,a))}function gb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Tt=Symbol.for("v-fgt"),gn=Symbol.for("v-txt"),dt=Symbol.for("v-cmt"),Ln=Symbol.for("v-stc"),Qa=[];let Ft=null;function fi(e=!1){Qa.push(Ft=e?null:[])}function fp(){Qa.pop(),Ft=Qa[Qa.length-1]||null}let Pn=1;function pi(e,t=!1){Pn+=e,e<0&&Ft&&t&&(Ft.hasOnce=!0)}function pp(e){return e.dynamicChildren=Pn>0?Ft||la:null,fp(),Pn>0&&Ft&&Ft.push(e),e}function mb(e,t,s,n,a,i){return pp(Zo(e,t,s,n,a,i,!0))}function ml(e,t,s,n,a){return pp(at(e,t,s,n,a,!0))}function en(e){return e?e.__v_isVNode===!0:!1}function vs(e,t){return e.type===t.type&&e.key===t.key}function vb(e){}const hp=({key:e})=>e??null,el=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Te(e)||mt(e)||_e(e)?{i:It,r:e,k:t,f:!!s}:e:null);function Zo(e,t=null,s=null,n=0,a=null,i=e===Tt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&hp(t),ref:t&&el(t),scopeId:Gl,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:It};return r?(Yo(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Te(s)?8:16),Pn>0&&!l&&Ft&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Ft.push(o),o}const at=bb;function bb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===jf)&&(e=dt),en(e)){const r=Ns(e,t,!0);return s&&Yo(r,s),Pn>0&&!i&&Ft&&(r.shapeFlag&6?Ft[Ft.indexOf(e)]=r:Ft.push(r)),r.patchFlag=-2,r}if(Tb(e)&&(e=e.__vccOpts),t){t=gp(t);let{class:r,style:o}=t;r&&!Te(r)&&(t.class=wi(r)),Be(o)&&(Si(o)&&!pe(o)&&(o=Oe({},o)),t.style=ki(o))}const l=Te(e)?1:gl(e)?128:Lf(e)?64:Be(e)?4:_e(e)?2:0;return Zo(e,t,s,n,a,l,i,!0)}function gp(e){return e?Si(e)||Qf(e)?Oe({},e):e:null}function Ns(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?vp(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&hp(c),ref:t&&t.ref?s&&i?pe(i)?i.concat(el(t)):[i,el(t)]:el(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Tt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ns(e.ssContent),ssFallback:e.ssFallback&&Ns(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Xs(u,o.clone(u)),u}function Jo(e=" ",t=0){return at(gn,null,e,t)}function yb(e,t){const s=at(Ln,null,e);return s.staticCount=t,s}function mp(e="",t=!1){return t?(fi(),ml(dt,null,e)):at(dt,null,e)}function Yt(e){return e==null||typeof e=="boolean"?at(dt):pe(e)?at(Tt,null,e.slice()):en(e)?Us(e):at(gn,null,String(e))}function Us(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ns(e)}function Yo(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(pe(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Yo(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Qf(t)?t._ctx=It:a===3&&It&&(It.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else _e(t)?(t={default:t,_ctx:It},s=32):(t=String(t),n&64?(s=16,t=[Jo(t)]):s=8);e.children=t,e.shapeFlag|=s}function vp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=wi([t.class,n.class]));else if(a==="style")t.style=ki([t.style,n.style]);else if(Bn(a)){const i=t[a],l=n[a];l&&i!==l&&!(pe(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Pl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Zt(e,t,s,n=null){as(e,t,7,[s,n])}const xb=qf();let _b=0;function bp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||xb,i={uid:_b++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Eo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:ep(n,a),emitsOptions:Wf(n,a),emit:null,emitted:null,propsDefaults:Me,inheritAttrs:n.inheritAttrs,ctx:Me,data:Me,props:Me,attrs:Me,slots:Me,refs:Me,setupState:Me,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Jv.bind(null,i),e.ce&&e.ce(i),i}let Rt=null;const Kt=()=>Rt||It;let vl,pa;{const e=Hl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};vl=t("__VUE_INSTANCE_SETTERS__",s=>Rt=s),pa=t("__VUE_SSR_SETTERS__",s=>Fn=s)}const Ra=e=>{const t=Rt;return vl(e),e.scope.on(),()=>{e.scope.off(),vl(t)}},hi=()=>{Rt&&Rt.scope.off(),vl(null)};function yp(e){return e.vnode.shapeFlag&4}let Fn=!1;function xp(e,t=!1,s=!1){t&&pa(t);const{props:n,children:a}=e.vnode,i=yp(e);sb(e,n,i,t),lb(e,a,s||t);const l=i?kb(e,t):void 0;return t&&pa(!1),l}function kb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Zr);const{setup:n}=s;if(n){Ys();const a=e.setupContext=n.length>1?wp(e):null,i=Ra(e),l=Aa(n,e,0,[e.props,a]),r=Co(l);if(Qs(),i(),(r||e.sp)&&!Ws(e)&&$o(e),r){if(l.then(hi,hi),t)return l.then(o=>{eo(e,o,t)}).catch(o=>{jn(o,e,0)});e.asyncDep=l}else eo(e,l,t)}else kp(e,t)}function eo(e,t,s){_e(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Be(t)&&(e.setupState=Oo(t)),kp(e,s)}let bl,to;function _p(e){bl=e,to=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Av))}}const wb=()=>!bl;function kp(e,t,s){const n=e.type;if(!e.render){if(!t&&bl&&!n.render){const a=n.template||Ko(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Oe(Oe({isCustomElement:i,delimiters:r},l),o);n.render=bl(a,c)}}e.render=n.render||Nt,to&&to(e)}{const a=Ra(e);Ys();try{Vv(e)}finally{Qs(),a()}}}const Sb={get(e,t){return Pt(e,"get",""),e[t]}};function wp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Sb),slots:e.slots,emit:e.emit,expose:t}}function Ai(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Oo(vf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ya)return Ya[s](e)},has(t,s){return s in t||s in Ya}})):e.proxy}function so(e,t=!0){return _e(e)?e.displayName||e.name:e.name||t&&e.__name}function Tb(e){return _e(e)&&"__vccOpts"in e}const ee=(e,t)=>Nm(e,t,Fn);function va(e,t,s){try{pi(-1);const n=arguments.length;return n===2?Be(t)&&!pe(t)?en(t)?at(e,null,[t]):at(e,t):at(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&en(s)&&(s=[s]),at(e,t,s))}finally{pi(1)}}function Cb(){}function Eb(e,t,s,n){const a=s[n];if(a&&Sp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Sp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(wt(s[n],t[n]))return!1;return Pn>0&&Ft&&Ft.push(e),!0}const Tp="3.5.38",Ab=Nt,Rb=Bm,Ib=ta,Nb=Cf,Lb={createComponentInstance:bp,setupComponent:xp,renderComponentRoot:Xi,setCurrentRenderingInstance:ci,isVNode:en,normalizeVNode:Yt,getComponentPublicInstance:Ai,ensureValidVNode:zo,pushWarningContext:Pm,popWarningContext:Fm},Ob=Lb,Db=null,Mb=null,Pb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let no;const hu=typeof window<"u"&&window.trustedTypes;if(hu)try{no=hu.createPolicy("vue",{createHTML:e=>e})}catch{}const Cp=no?e=>no.createHTML(e):e=>e,Fb="http://www.w3.org/2000/svg",$b="http://www.w3.org/1998/Math/MathML",$s=typeof document<"u"?document:null,gu=$s&&$s.createElement("template"),Ep={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?$s.createElementNS(Fb,e):t==="mathml"?$s.createElementNS($b,e):s?$s.createElement(e,{is:s}):$s.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>$s.createTextNode(e),createComment:e=>$s.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>$s.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{gu.innerHTML=Cp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=gu.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},ln="transition",Pa="animation",ba=Symbol("_vtc"),Ap={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Rp=Oe({},Fo,Ap),Ub=e=>(e.displayName="Transition",e.props=Rp,e),Bb=Ub((e,{slots:t})=>va(Mf,Ip(e),t)),wn=(e,t=[])=>{pe(e)?e.forEach(s=>s(...t)):e&&e(...t)},mu=e=>e?pe(e)?e.some(t=>t.length>1):e.length>1:!1;function Ip(e){const t={};for(const F in e)F in Ap||(t[F]=e[F]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,m=Hb(a),g=m&&m[0],w=m&&m[1],{onBeforeEnter:R,onEnter:b,onEnterCancelled:v,onLeave:x,onLeaveCancelled:E,onBeforeAppear:N=R,onAppear:O=b,onAppearCancelled:S=v}=t,I=(F,M,W,B)=>{F._enterCancelled=B,un(F,M?u:r),un(F,M?c:l),W&&W()},D=(F,M)=>{F._isLeaving=!1,un(F,d),un(F,p),un(F,f),M&&M()},H=F=>(M,W)=>{const B=F?O:b,j=()=>I(M,F,W);wn(B,[M,j]),vu(()=>{un(M,F?o:i),ws(M,F?u:r),mu(B)||bu(M,n,g,j)})};return Oe(t,{onBeforeEnter(F){wn(R,[F]),ws(F,i),ws(F,l)},onBeforeAppear(F){wn(N,[F]),ws(F,o),ws(F,c)},onEnter:H(!1),onAppear:H(!0),onLeave(F,M){F._isLeaving=!0;const W=()=>D(F,M);ws(F,d),F._enterCancelled?(ws(F,f),ao(F)):(ao(F),ws(F,f)),vu(()=>{F._isLeaving&&(un(F,d),ws(F,p),mu(x)||bu(F,n,w,W))}),wn(x,[F,W])},onEnterCancelled(F){I(F,!1,void 0,!0),wn(v,[F])},onAppearCancelled(F){I(F,!0,void 0,!0),wn(S,[F])},onLeaveCancelled(F){D(F),wn(E,[F])}})}function Hb(e){if(e==null)return null;if(Be(e))return[wr(e.enter),wr(e.leave)];{const t=wr(e);return[t,t]}}function wr(e){return ll(e)}function ws(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ba]||(e[ba]=new Set)).add(t)}function un(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ba];s&&(s.delete(t),s.size||(e[ba]=void 0))}function vu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Vb=0;function bu(e,t,s,n){const a=e._endId=++Vb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Np(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Np(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${ln}Delay`),i=n(`${ln}Duration`),l=yu(a,i),r=n(`${Pa}Delay`),o=n(`${Pa}Duration`),c=yu(r,o);let u=null,d=0,f=0;t===ln?l>0&&(u=ln,d=l,f=i.length):t===Pa?c>0&&(u=Pa,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?ln:Pa:null,f=u?u===ln?i.length:o.length:0);const p=u===ln&&/\b(?:transform|all)(?:,|$)/.test(n(`${ln}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function yu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>xu(s)+xu(e[n])))}function xu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function ao(e){return(e?e.ownerDocument:document).body.offsetHeight}function jb(e,t,s){const n=e[ba];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const yl=Symbol("_vod"),Qo=Symbol("_vsh"),Lp={name:"show",beforeMount(e,{value:t},{transition:s}){e[yl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Fa(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Fa(e,!0),n.enter(e)):n.leave(e,()=>{Fa(e,!1)}):Fa(e,t))},beforeUnmount(e,{value:t}){Fa(e,t)}};function Fa(e,t){e.style.display=t?e[yl]:"none",e[Qo]=!t}function zb(){Lp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Op=Symbol("");function Kb(e){const t=Kt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>xl(i,a))},n=()=>{const a=e(t.proxy);t.ce?xl(t.ce,a):io(t.subTree,a),s(a)};Ho(()=>{ri(n)}),$e(()=>{ns(n,Nt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function io(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{io(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)xl(e.el,t);else if(e.type===Tt)e.children.forEach(s=>io(s,t));else if(e.type===Ln){let{el:s,anchor:n}=e;for(;s&&(xl(s,t),s!==n);)s=s.nextSibling}}function xl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Yg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Op]=n}}const qb=/(?:^|;)\s*display\s*:/;function Gb(e,t,s){const n=e.style,a=Te(s);let i=!1;if(s&&!a){if(t)if(Te(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&qa(n,r,"")}else for(const l in t)s[l]==null&&qa(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Zb(e,l,!Te(t)&&t?t[l]:void 0,r)||qa(n,l,r):qa(n,l,"")}}else if(a){if(t!==s){const l=n[Op];l&&(s+=";"+l),n.cssText=s,i=qb.test(s)}}else t&&e.removeAttribute("style");yl in e&&(e[yl]=i?n.display:"",e[Qo]&&(n.display="none"))}const _u=/\s*!important$/;function qa(e,t,s){if(pe(s))s.forEach(n=>qa(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Wb(e,t);_u.test(s)?e.setProperty(Qt(n),s.replace(_u,""),"important"):e[n]=s}}const ku=["Webkit","Moz","ms"],Sr={};function Wb(e,t){const s=Sr[t];if(s)return s;let n=Ge(t);if(n!=="filter"&&n in e)return Sr[t]=n;n=Vn(n);for(let a=0;a<ku.length;a++){const i=ku[a]+n;if(i in e)return Sr[t]=i}return t}function Zb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Te(n)&&s===n}const wu="http://www.w3.org/1999/xlink";function Su(e,t,s,n,a,i=Zg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(wu,t.slice(6,t.length)):e.setAttributeNS(wu,t,s):s==null||i&&!Jd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Ut(s)?String(s):s)}function Tu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Cp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Jd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function js(e,t,s,n){e.addEventListener(t,s,n)}function Jb(e,t,s,n){e.removeEventListener(t,s,n)}const Cu=Symbol("_vei");function Yb(e,t,s,n,a=null){const i=e[Cu]||(e[Cu]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Qb(t);if(n){const c=i[t]=ty(n,a);js(e,r,c,o)}else l&&(Jb(e,r,l,o),i[t]=void 0)}}const Eu=/(?:Once|Passive|Capture)$/;function Qb(e){let t;if(Eu.test(e)){t={};let n;for(;n=e.match(Eu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Qt(e.slice(2)),t]}let Tr=0;const Xb=Promise.resolve(),ey=()=>Tr||(Xb.then(()=>Tr=0),Tr=Date.now());function ty(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(pe(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&as(c,t,5,r)}}else as(a,t,5,[n])};return s.value=e,s.attached=ey(),s}const Au=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Dp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?jb(e,n,l):t==="style"?Gb(e,s,n):Bn(t)?Pl(t)||Yb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):sy(e,t,n,l))?(Tu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Su(e,t,n,l,i,t!=="value")):e._isVueCE&&(ny(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Te(n)))?Tu(e,Ge(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Su(e,t,n,l))};function sy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Au(t)&&_e(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Au(t)&&Te(s)?!1:t in e}function ny(e,t){const s=e._def.props;if(!s)return!1;const n=Ge(t);return Array.isArray(s)?s.some(a=>Ge(a)===n):Object.keys(s).some(a=>Ge(a)===n)}const Ru={};function Mp(e,t,s){let n=Ci(e,t);Fl(n)&&(n=Oe({},n,t));class a extends er{constructor(l){super(n,l,s)}}return a.def=n,a}const ay=((e,t)=>Mp(e,t,Wp)),iy=typeof HTMLElement<"u"?HTMLElement:class{};class er extends iy{constructor(t,s={},n=wl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==wl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Oe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof er){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,St(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!pe(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=ll(this._props[o])),(r||(r=Object.create(null)))[Ge(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)He(this,n)||Object.defineProperty(this,n,{get:()=>Rs(s[n])})}_resolveProps(t){const{props:s}=t,n=pe(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Ge))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Ru;const a=Ge(t);s&&this._numberProps&&this._numberProps[a]&&(n=ll(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Ru?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Qt(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Qt(t),s+""):s||this.removeAttribute(Qt(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Gp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=at(this._def,Oe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Fl(l[0])?Oe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),Qt(i)!==i&&a(Qt(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Pp(e){const t=Kt(),s=t&&t.ce;return s||null}function ly(){const e=Pp();return e&&e.shadowRoot}function ry(e="$style"){{const t=Kt();if(!t)return Me;const s=t.type.__cssModules;if(!s)return Me;const n=s[e];return n||Me}}const Fp=new WeakMap,$p=new WeakMap,_l=Symbol("_moveCb"),Iu=Symbol("_enterCb"),oy=e=>(delete e.props.mode,e),cy=oy({name:"TransitionGroup",props:Oe({},Rp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Kt(),n=Po();let a,i;return Jl(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!hy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(dy),a.forEach(fy);const r=a.filter(py);ao(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;ws(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[_l]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[_l]=null,un(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Fe(e),r=Ip(l);let o=l.tag||Tt;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[Qo]&&(a.push(u),Xs(u,ma(u,r,n,s)),Fp.set(u,Up(u.el)))}i=t.default?Wl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&Xs(u,ma(u,r,n,s))}return at(o,null,i)}}}),uy=cy;function dy(e){const t=e.el;t[_l]&&t[_l](),t[Iu]&&t[Iu]()}function fy(e){$p.set(e,Up(e.el))}function py(e){const t=Fp.get(e),s=$p.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Up(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function hy(e,t,s){const n=e.cloneNode(),a=e[ba];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Np(n);return i.removeChild(n),l}const vn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return pe(t)?s=>ca(t,s):t};function gy(e){e.target.composing=!0}function Nu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const ps=Symbol("_assign");function Lu(e,t,s){return t&&(e=e.trim()),s&&(e=Bl(e)),e}const kl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[ps]=vn(a);const i=n||a.props&&a.props.type==="number";js(e,t?"change":"input",l=>{l.target.composing||e[ps](Lu(e.value,s,i))}),(s||i)&&js(e,"change",()=>{e.value=Lu(e.value,s,i)}),t||(js(e,"compositionstart",gy),js(e,"compositionend",Nu),js(e,"change",Nu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[ps]=vn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Bl(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Xo={deep:!0,created(e,t,s){e[ps]=vn(s),js(e,"change",()=>{const n=e._modelValue,a=ya(e),i=e.checked,l=e[ps];if(pe(n)){const r=Vl(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Hn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Hp(e,i))})},mounted:Ou,beforeUpdate(e,t,s){e[ps]=vn(s),Ou(e,t,s)}};function Ou(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(pe(t))a=Vl(t,n.props.value)>-1;else if(Hn(t))a=t.has(n.props.value);else{if(t===s)return;a=Js(t,Hp(e,!0))}e.checked!==a&&(e.checked=a)}const ec={created(e,{value:t},s){e.checked=Js(t,s.props.value),e[ps]=vn(s),js(e,"change",()=>{e[ps](ya(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[ps]=vn(n),t!==s&&(e.checked=Js(t,n.props.value))}},Bp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Hn(t);js(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Bl(ya(l)):ya(l));e[ps](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,St(()=>{e._assigning=!1})}),e[ps]=vn(n)},mounted(e,{value:t}){Du(e,t)},beforeUpdate(e,t,s){e[ps]=vn(s)},updated(e,{value:t}){e._assigning||Du(e,t)}};function Du(e,t){const s=e.multiple,n=pe(t);if(!(s&&!n&&!Hn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ya(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=Vl(t,r)>-1}else l.selected=t.has(r);else if(Js(ya(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ya(e){return"_value"in e?e._value:e.value}function Hp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Vp={created(e,t,s){Gi(e,t,s,null,"created")},mounted(e,t,s){Gi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Gi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Gi(e,t,s,n,"updated")}};function jp(e,t){switch(e){case"SELECT":return Bp;case"TEXTAREA":return kl;default:switch(t){case"checkbox":return Xo;case"radio":return ec;default:return kl}}}function Gi(e,t,s,n,a){const l=jp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function my(){kl.getSSRProps=({value:e})=>({value:e}),ec.getSSRProps=({value:e},t)=>{if(t.props&&Js(t.props.value,e))return{checked:!0}},Xo.getSSRProps=({value:e},t)=>{if(pe(e)){if(t.props&&Vl(e,t.props.value)>-1)return{checked:!0}}else if(Hn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Vp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=jp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const vy=["ctrl","shift","alt","meta"],by={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>vy.some(s=>e[`${s}Key`]&&!t.includes(s))},yy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=by[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},xy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},_y=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=Qt(a.key);if(t.some(l=>l===i||xy[l]===i))return e(a)}))},zp=Oe({patchProp:Dp},Ep);let Xa,Mu=!1;function Kp(){return Xa||(Xa=ap(zp))}function qp(){return Xa=Mu?Xa:ip(zp),Mu=!0,Xa}const Gp=((...e)=>{Kp().render(...e)}),ky=((...e)=>{qp().hydrate(...e)}),wl=((...e)=>{const t=Kp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Jp(n);if(!a)return;const i=t._component;!_e(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Zp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Wp=((...e)=>{const t=qp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Jp(n);if(a)return s(a,!0,Zp(a))},t});function Zp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Jp(e){return Te(e)?document.querySelector(e):e}let Pu=!1;const wy=()=>{Pu||(Pu=!0,my(),zb())},Sy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Mf,BaseTransitionPropsValidators:Fo,Comment:dt,DeprecationTypes:Pb,EffectScope:Eo,ErrorCodes:Um,ErrorTypeStrings:Rb,Fragment:Tt,KeepAlive:bv,ReactiveEffect:ai,Static:Ln,Suspense:ub,Teleport:ev,Text:gn,TrackOpTypes:Lm,Transition:Bb,TransitionGroup:uy,TriggerOpTypes:Om,VueElement:er,assertNumber:$m,callWithAsyncErrorHandling:as,callWithErrorHandling:Aa,camelize:Ge,capitalize:Vn,cloneVNode:Ns,compatUtils:Mb,computed:ee,createApp:wl,createBlock:ml,createCommentVNode:mp,createElementBlock:mb,createElementVNode:Zo,createHydrationRenderer:ip,createPropsRestProxy:Bv,createRenderer:ap,createSSRApp:Wp,createSlots:Tv,createStaticVNode:yb,createTextVNode:Jo,createVNode:at,customRef:yf,defineAsyncComponent:mv,defineComponent:Ci,defineCustomElement:Mp,defineEmits:Iv,defineExpose:Nv,defineModel:Dv,defineOptions:Lv,defineProps:Rv,defineSSRCustomElement:ay,defineSlots:Ov,devtools:Ib,effect:tm,effectScope:Qg,getCurrentInstance:Kt,getCurrentScope:ef,getCurrentWatcher:Dm,getTransitionRawChildren:Wl,guardReactiveProps:gp,h:va,handleError:jn,hasInjectionContext:Gm,hydrate:ky,hydrateOnIdle:uv,hydrateOnInteraction:hv,hydrateOnMediaQuery:pv,hydrateOnVisible:fv,initCustomFormatter:Cb,initDirectivesForSSR:wy,inject:fs,isMemoSame:Sp,isProxy:Si,isReactive:Gs,isReadonly:Is,isRef:mt,isRuntimeOnly:wb,isShallow:es,isVNode:en,markRaw:vf,mergeDefaults:$v,mergeModels:Uv,mergeProps:vp,nextTick:St,nodeOps:Ep,normalizeClass:wi,normalizeProps:Ug,normalizeStyle:ki,onActivated:Uo,onBeforeMount:$f,onBeforeUnmount:Yl,onBeforeUpdate:Ho,onDeactivated:Bo,onErrorCaptured:Vf,onMounted:$e,onRenderTracked:Hf,onRenderTriggered:Bf,onScopeDispose:Xg,onServerPrefetch:Uf,onUnmounted:ft,onUpdated:Jl,onWatcherCleanup:_f,openBlock:fi,patchProp:Dp,popScopeId:zm,provide:Ja,proxyRefs:Oo,pushScopeId:jm,queuePostFlushCb:ri,reactive:bn,readonly:ol,ref:h,registerRuntimeCompiler:_p,render:Gp,renderList:Sv,renderSlot:Cv,resolveComponent:_v,resolveDirective:wv,resolveDynamicComponent:kv,resolveFilter:Db,resolveTransitionHooks:ma,setBlockTracking:pi,setDevtoolsHook:Nb,setTransitionHooks:Xs,shallowReactive:No,shallowReadonly:xm,shallowRef:Lo,ssrContextKey:Ef,ssrUtils:Ob,stop:sm,toDisplayString:Qd,toHandlerKey:oa,toHandlers:Ev,toRaw:Fe,toRef:Rm,toRefs:Cm,toValue:wm,transformVNodeArgs:vb,triggerRef:km,unref:Rs,useAttrs:Fv,useCssModule:ry,useCssVars:Kb,useHost:Pp,useId:sv,useModel:Zv,useSSRContext:Af,useShadowRoot:ly,useSlots:Pv,useTemplateRef:nv,useTransitionState:Po,vModelCheckbox:Xo,vModelDynamic:Vp,vModelRadio:ec,vModelSelect:Bp,vModelText:kl,vShow:Lp,version:Tp,warn:Ab,watch:ns,watchEffect:Wm,watchPostEffect:Zm,watchSyncEffect:Rf,withAsyncContext:Hv,withCtx:Mo,withDefaults:Mv,withDirectives:qm,withKeys:_y,withMemo:Eb,withModifiers:yy,withScopeId:Km},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const gi=Symbol(""),ei=Symbol(""),tc=Symbol(""),Sl=Symbol(""),Yp=Symbol(""),$n=Symbol(""),Qp=Symbol(""),Xp=Symbol(""),sc=Symbol(""),nc=Symbol(""),Ri=Symbol(""),ac=Symbol(""),eh=Symbol(""),ic=Symbol(""),lc=Symbol(""),rc=Symbol(""),oc=Symbol(""),cc=Symbol(""),uc=Symbol(""),th=Symbol(""),sh=Symbol(""),tr=Symbol(""),Tl=Symbol(""),dc=Symbol(""),fc=Symbol(""),mi=Symbol(""),Ii=Symbol(""),pc=Symbol(""),lo=Symbol(""),Ty=Symbol(""),ro=Symbol(""),Cl=Symbol(""),Cy=Symbol(""),Ey=Symbol(""),hc=Symbol(""),Ay=Symbol(""),Ry=Symbol(""),gc=Symbol(""),nh=Symbol(""),xa={[gi]:"Fragment",[ei]:"Teleport",[tc]:"Suspense",[Sl]:"KeepAlive",[Yp]:"BaseTransition",[$n]:"openBlock",[Qp]:"createBlock",[Xp]:"createElementBlock",[sc]:"createVNode",[nc]:"createElementVNode",[Ri]:"createCommentVNode",[ac]:"createTextVNode",[eh]:"createStaticVNode",[ic]:"resolveComponent",[lc]:"resolveDynamicComponent",[rc]:"resolveDirective",[oc]:"resolveFilter",[cc]:"withDirectives",[uc]:"renderList",[th]:"renderSlot",[sh]:"createSlots",[tr]:"toDisplayString",[Tl]:"mergeProps",[dc]:"normalizeClass",[fc]:"normalizeStyle",[mi]:"normalizeProps",[Ii]:"guardReactiveProps",[pc]:"toHandlers",[lo]:"camelize",[Ty]:"capitalize",[ro]:"toHandlerKey",[Cl]:"setBlockTracking",[Cy]:"pushScopeId",[Ey]:"popScopeId",[hc]:"withCtx",[Ay]:"unref",[Ry]:"isRef",[gc]:"withMemo",[nh]:"isMemoSame"};function Iy(e){Object.getOwnPropertySymbols(e).forEach(t=>{xa[t]=e[t]})}const rs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ny(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:rs}}function vi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=rs){return e&&(r?(e.helper($n),e.helper(wa(e.inSSR,c))):e.helper(ka(e.inSSR,c)),l&&e.helper(cc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function On(e,t=rs){return{type:17,loc:t,elements:e}}function ds(e,t=rs){return{type:15,loc:t,properties:e}}function gt(e,t){return{type:16,loc:rs,key:Te(e)?Ae(e,!0):e,value:t}}function Ae(e,t=!1,s=rs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function ys(e,t=rs){return{type:8,loc:t,children:e}}function _t(e,t=[],s=rs){return{type:14,loc:s,callee:e,arguments:t}}function _a(e,t=void 0,s=!1,n=!1,a=rs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function oo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:rs}}function Ly(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:rs}}function Oy(e){return{type:21,body:e,loc:rs}}function ka(e,t){return e||t?sc:nc}function wa(e,t){return e||t?Qp:Xp}function mc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ka(n,e.isComponent)),t($n),t(wa(n,e.isComponent)))}const Fu=new Uint8Array([123,123]),$u=new Uint8Array([125,125]);function Uu(e){return e>=97&&e<=122||e>=65&&e<=90}function ts(e){return e===32||e===10||e===9||e===12||e===13}function rn(e){return e===47||e===62||ts(e)}function El(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Ot={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Dy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Fu,this.delimiterClose=$u,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Fu,this.delimiterClose=$u}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?rn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||ts(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Ot.TitleEnd||this.currentSequence===Ot.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Ot.Cdata[this.sequenceIndex]?++this.sequenceIndex===Ot.Cdata.length&&(this.state=28,this.currentSequence=Ot.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Ot.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Uu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){rn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(rn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(El("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){ts(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Uu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||ts(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):ts(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):ts(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||rn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||rn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||rn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||rn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||rn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):ts(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):ts(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){ts(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Ot.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Ot.ScriptEnd[3]?this.startSpecial(Ot.ScriptEnd,4):t===Ot.StyleEnd[3]?this.startSpecial(Ot.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Ot.TitleEnd[3]?this.startSpecial(Ot.TitleEnd,4):t===Ot.TextareaEnd[3]?this.startSpecial(Ot.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Ot.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Bu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Dn(e,t){const s=Bu("MODE",t),n=Bu(e,t);return s===3?n===!0:n!==!1}function bi(e,t,s,...n){return Dn(e,t)}function vc(e){throw e}function ah(e){}function tt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const Xt=e=>e.type===4&&e.isStatic;function ih(e){switch(e){case"Teleport":case"teleport":return ei;case"Suspense":case"suspense":return tc;case"KeepAlive":case"keep-alive":return Sl;case"BaseTransition":case"base-transition":return Yp}}const My=/^$|^\d|[^\$\w\xA0-\uFFFF]/,bc=e=>!My.test(e),lh=/[A-Za-z_$\xA0-\uFFFF]/,Py=/[\.\?\w$\xA0-\uFFFF]/,Fy=/\s+[.[]\s*|\s*[.[]\s+/g,rh=e=>e.type===4?e.content:e.loc.source,$y=e=>{const t=rh(e).trim().replace(Fy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?lh:Py).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},oh=$y,Uy=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,By=e=>Uy.test(rh(e)),Hy=By;function us(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Te(t)?a.name===t:t.test(a.name)))return a}}function sr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&En(i.arg,t))return i}}function En(e,t){return!!(e&&Xt(e)&&e.content===t)}function Vy(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Cr(e){return e.type===5||e.type===2}function Hu(e){return e.type===7&&e.name==="pre"}function jy(e){return e.type===7&&e.name==="slot"}function Al(e){return e.type===1&&e.tagType===3}function Rl(e){return e.type===1&&e.tagType===2}const zy=new Set([mi,Ii]);function ch(e,t=[]){if(e&&!Te(e)&&e.type===14){const s=e.callee;if(!Te(s)&&zy.has(s))return ch(e.arguments[0],t.concat(e))}return[e,t]}function Il(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Te(a)&&a.type===14){const r=ch(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Te(a))n=ds([t]);else if(a.type===14){const r=a.arguments[0];!Te(r)&&r.type===15?Vu(t,r)||r.properties.unshift(t):a.callee===pc?n=_t(s.helper(Tl),[ds([t]),a]):a.arguments.unshift(ds([t])),!n&&(n=a)}else a.type===15?(Vu(t,a)||a.properties.unshift(t),n=a):(n=_t(s.helper(Tl),[ds([t]),a]),l&&l.callee===Ii&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Vu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function yi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Ky(e){return e.type===14&&e.callee===gc?e.arguments[1].returns:e}const qy=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function uh(e){for(let t=0;t<e.length;t++)if(!ts(e.charCodeAt(t)))return!1;return!0}function yc(e){return e.type===2&&uh(e.content)||e.type===12&&yc(e.content)}function dh(e){return e.type===3||yc(e)}const fh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:aa,isPreTag:aa,isIgnoreNewlineTag:aa,isCustomElement:aa,onError:vc,onWarn:ah,comments:!1,prefixIdentifiers:!1};let Ue=fh,xi=null,Zs="",Mt=null,Pe=null,Wt="",Fs=-1,Tn=-1,xc=0,pn=!1,co=null;const et=[],ot=new Dy(et,{onerr:Ds,ontext(e,t){Wi(At(e,t),e,t)},ontextentity(e,t,s){Wi(e,t,s)},oninterpolation(e,t){if(pn)return Wi(At(e,t),e,t);let s=e+ot.delimiterOpen.length,n=t-ot.delimiterClose.length;for(;ts(Zs.charCodeAt(s));)s++;for(;ts(Zs.charCodeAt(n-1));)n--;let a=At(s,n);a.includes("&")&&(a=Ue.decodeEntities(a,!1)),uo({type:5,content:sl(a,!1,ut(s,n)),loc:ut(e,t)})},onopentagname(e,t){const s=At(e,t);Mt={type:1,tag:s,ns:Ue.getNamespace(s,et[0],Ue.ns),tagType:0,props:[],children:[],loc:ut(e-1,t),codegenNode:void 0}},onopentagend(e){zu(e)},onclosetag(e,t){const s=At(e,t);if(!Ue.isVoidTag(s)){let n=!1;for(let a=0;a<et.length;a++)if(et[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ds(24,et[0].loc.start.offset);for(let l=0;l<=a;l++){const r=et.shift();tl(r,t,l<a)}break}n||Ds(23,ph(e,60))}},onselfclosingtag(e){const t=Mt.tag;Mt.isSelfClosing=!0,zu(e),et[0]&&et[0].tag===t&&tl(et.shift(),e)},onattribname(e,t){Pe={type:6,name:At(e,t),nameLoc:ut(e,t),value:void 0,loc:ut(e)}},ondirname(e,t){const s=At(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!pn&&n===""&&Ds(26,e),pn||n==="")Pe={type:6,name:s,nameLoc:ut(e,t),value:void 0,loc:ut(e)};else if(Pe={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ae("prop")]:[],loc:ut(e)},n==="pre"){pn=ot.inVPre=!0,co=Mt;const a=Mt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=s0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=At(e,t);if(pn&&!Hu(Pe))Pe.name+=s,An(Pe.nameLoc,t);else{const n=s[0]!=="[";Pe.arg=sl(n?s:s.slice(1,-1),n,ut(e,t),n?3:0)}},ondirmodifier(e,t){const s=At(e,t);if(pn&&!Hu(Pe))Pe.name+="."+s,An(Pe.nameLoc,t);else if(Pe.name==="slot"){const n=Pe.arg;n&&(n.content+="."+s,An(n.loc,t))}else{const n=Ae(s,!0,ut(e,t));Pe.modifiers.push(n)}},onattribdata(e,t){Wt+=At(e,t),Fs<0&&(Fs=e),Tn=t},onattribentity(e,t,s){Wt+=e,Fs<0&&(Fs=t),Tn=s},onattribnameend(e){const t=Pe.loc.start.offset,s=At(t,e);Pe.type===7&&(Pe.rawName=s),Mt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ds(2,t)},onattribend(e,t){if(Mt&&Pe){if(An(Pe.loc,t),e!==0)if(Wt.includes("&")&&(Wt=Ue.decodeEntities(Wt,!0)),Pe.type===6)Pe.name==="class"&&(Wt=gh(Wt).trim()),e===1&&!Wt&&Ds(13,t),Pe.value={type:2,content:Wt,loc:e===1?ut(Fs,Tn):ut(Fs-1,Tn+1)},ot.inSFCRoot&&Mt.tag==="template"&&Pe.name==="lang"&&Wt&&Wt!=="html"&&ot.enterRCDATA(El("</template"),0);else{let s=0;Pe.exp=sl(Wt,!1,ut(Fs,Tn),0,s),Pe.name==="for"&&(Pe.forParseResult=Wy(Pe.exp));let n=-1;Pe.name==="bind"&&(n=Pe.modifiers.findIndex(a=>a.content==="sync"))>-1&&bi("COMPILER_V_BIND_SYNC",Ue,Pe.loc,Pe.arg.loc.source)&&(Pe.name="model",Pe.modifiers.splice(n,1))}(Pe.type!==7||Pe.name!=="pre")&&Mt.props.push(Pe)}Wt="",Fs=Tn=-1},oncomment(e,t){Ue.comments&&uo({type:3,content:At(e,t),loc:ut(e-4,t+3)})},onend(){const e=Zs.length;for(let t=0;t<et.length;t++)tl(et[t],e-1),Ds(24,et[t].loc.start.offset)},oncdata(e,t){(et[0]?et[0].ns:Ue.ns)!==0?Wi(At(e,t),e,t):Ds(1,e-9)},onprocessinginstruction(e){(et[0]?et[0].ns:Ue.ns)===0&&Ds(21,e-1)}}),ju=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Gy=/^\(|\)$/g;function Wy(e){const t=e.loc,s=e.content,n=s.match(qy);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const m=t.start.offset+f,g=m+d.length;return sl(d,!1,ut(m,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Gy,"").trim();const c=a.indexOf(o),u=o.match(ju);if(u){o=o.replace(ju,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function At(e,t){return Zs.slice(e,t)}function zu(e){ot.inSFCRoot&&(Mt.innerLoc=ut(e+1,e+1)),uo(Mt);const{tag:t,ns:s}=Mt;s===0&&Ue.isPreTag(t)&&xc++,Ue.isVoidTag(t)?tl(Mt,e):(et.unshift(Mt),(s===1||s===2)&&(ot.inXML=!0)),Mt=null}function Wi(e,t,s){{const i=et[0]&&et[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ue.decodeEntities(e,!1))}const n=et[0]||xi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,An(a.loc,s)):n.children.push({type:2,content:e,loc:ut(t,s)})}function tl(e,t,s=!1){s?An(e.loc,ph(t,60)):An(e.loc,Zy(t,62)+1),ot.inSFCRoot&&(e.children.length?e.innerLoc.end=Oe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Oe({},e.innerLoc.start),e.innerLoc.source=At(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(pn||(n==="slot"?e.tagType=2:Ku(e)?e.tagType=3:Yy(e)&&(e.tagType=1)),ot.inRCDATA||(e.children=hh(i)),a===0&&Ue.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ue.isPreTag(n)&&xc--,co===e&&(pn=ot.inVPre=!1,co=null),ot.inXML&&(et[0]?et[0].ns:Ue.ns)===0&&(ot.inXML=!1);{const l=e.props;if(!ot.inSFCRoot&&Dn("COMPILER_NATIVE_TEMPLATE",Ue)&&e.tag==="template"&&!Ku(e)){const o=et[0]||xi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&bi("COMPILER_INLINE_TEMPLATE",Ue,r.loc)&&e.children.length&&(r.value={type:2,content:At(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Zy(e,t){let s=e;for(;Zs.charCodeAt(s)!==t&&s<Zs.length-1;)s++;return s}function ph(e,t){let s=e;for(;Zs.charCodeAt(s)!==t&&s>=0;)s--;return s}const Jy=new Set(["if","else","else-if","for","slot"]);function Ku({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Jy.has(t[s].name))return!0}return!1}function Yy({tag:e,props:t}){if(Ue.isCustomElement(e))return!1;if(e==="component"||Qy(e.charCodeAt(0))||ih(e)||Ue.isBuiltInComponent&&Ue.isBuiltInComponent(e)||Ue.isNativeTag&&!Ue.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(bi("COMPILER_IS_ON_ELEMENT",Ue,n.loc))return!0}}else if(n.name==="bind"&&En(n.arg,"is")&&bi("COMPILER_IS_ON_ELEMENT",Ue,n.loc))return!0}return!1}function Qy(e){return e>64&&e<91}const Xy=/\r\n/g;function hh(e){const t=Ue.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(xc)a.content=a.content.replace(Xy,`
`);else if(uh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&e0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=gh(a.content))}return s?e.filter(Boolean):e}function e0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function gh(e){let t="",s=!1;for(let n=0;n<e.length;n++)ts(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function uo(e){(et[0]||xi).children.push(e)}function ut(e,t){return{start:ot.getPos(e),end:t==null?t:ot.getPos(t),source:t==null?t:At(e,t)}}function t0(e){return ut(e.start.offset,e.end.offset)}function An(e,t){e.end=ot.getPos(t),e.source=At(e.start.offset,t)}function s0(e){const t={type:6,name:e.rawName,nameLoc:ut(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function sl(e,t=!1,s,n=0,a=0){return Ae(e,t,s,n)}function Ds(e,t,s){Ue.onError(tt(e,ut(t,t)))}function n0(){ot.reset(),Mt=null,Pe=null,Wt="",Fs=-1,Tn=-1,et.length=0}function a0(e,t){if(n0(),Zs=e,Ue=Oe({},fh),t){let a;for(a in t)t[a]!=null&&(Ue[a]=t[a])}ot.mode=Ue.parseMode==="html"?1:Ue.parseMode==="sfc"?2:0,ot.inXML=Ue.ns===1||Ue.ns===2;const s=t&&t.delimiters;s&&(ot.delimiterOpen=El(s[0]),ot.delimiterClose=El(s[1]));const n=xi=Ny([],e);return ot.parse(Zs),n.loc=ut(0,e.length),n.children=hh(n.children),xi=null,n}function i0(e,t){nl(e,void 0,t,!!mh(e))}function mh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Rl(t[0])?t[0]:null}function nl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:ss(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const m=p.patchFlag;if((m===void 0||m===512||m===1)&&bh(d,s)>=2){const g=yh(d);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:ss(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,nl(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)nl(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)nl(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&pe(e.codegenNode.children))e.codegenNode.children=o(On(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!pe(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(On(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!pe(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=us(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(On(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!pe(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ss(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=bh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ss(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=ss(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper($n),t.removeHelper(wa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ka(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ss(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Te(r)||Ut(r))continue;const o=ss(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const l0=new Set([dc,fc,mi,Ii]);function vh(e,t){if(e.type===14&&!Te(e.callee)&&l0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ss(s,t);if(s.type===14)return vh(s,t)}return 0}function bh(e,t){let s=3;const n=yh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ss(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ss(r,t):r.type===14?c=vh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function yh(e){const t=e.codegenNode;if(t.type===13)return t.props}function r0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Nt,isCustomElement:u=Nt,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:m=!1,inSSR:g=!1,ssrCssVars:w="",bindingMetadata:R=Me,inline:b=!1,isTS:v=!1,onError:x=vc,onWarn:E=ah,compatConfig:N}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),S={filename:t,selfName:O&&Vn(Ge(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:m,inSSR:g,ssrCssVars:w,bindingMetadata:R,inline:b,isTS:v,onError:x,onWarn:E,compatConfig:N,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(I){const D=S.helpers.get(I)||0;return S.helpers.set(I,D+1),I},removeHelper(I){const D=S.helpers.get(I);if(D){const H=D-1;H?S.helpers.set(I,H):S.helpers.delete(I)}},helperString(I){return`_${xa[S.helper(I)]}`},replaceNode(I){S.parent.children[S.childIndex]=S.currentNode=I},removeNode(I){const D=S.parent.children,H=I?D.indexOf(I):S.currentNode?S.childIndex:-1;!I||I===S.currentNode?(S.currentNode=null,S.onNodeRemoved()):S.childIndex>H&&(S.childIndex--,S.onNodeRemoved()),S.parent.children.splice(H,1)},onNodeRemoved:Nt,addIdentifiers(I){},removeIdentifiers(I){},hoist(I){Te(I)&&(I=Ae(I)),S.hoists.push(I);const D=Ae(`_hoisted_${S.hoists.length}`,!1,I.loc,2);return D.hoisted=I,D},cache(I,D=!1,H=!1){const F=Ly(S.cached.length,I,D,H);return S.cached.push(F),F}};return S.filters=new Set,S}function o0(e,t){const s=r0(e,t);nr(e,s),t.hoistStatic&&i0(e,s),t.ssr||c0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function c0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=mh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&mc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=vi(t,s(gi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function u0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Te(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,nr(a,t))}}function nr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(pe(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Ri);break;case 5:t.ssr||t.helper(tr);break;case 9:for(let i=0;i<e.branches.length;i++)nr(e.branches[i],t);break;case 10:case 11:case 1:case 0:u0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function xh(e,t){const s=Te(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(jy))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const ar="/*@__PURE__*/",_h=e=>`${xa[e]}: _${xa[e]}`;function d0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${xa[g]}`},push(g,w=-2,R){p.code+=g},indent(){m(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:m(--p.indentLevel)},newline(){m(p.indentLevel)}};function m(g){p.push(`
`+"  ".repeat(g),0)}return p}function f0(e,t={}){const s=d0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";p0(e,s);const g=u?"ssrRender":"render",R=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${R}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(_h).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Er(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Er(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Er(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let b=0;b<e.temps;b++)a(`${b>0?", ":""}_temp${b}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?$t(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function p0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[sc,nc,Ri,ac,eh].filter(f=>u.includes(f)).map(_h).join(", ");a(`const { ${d} } = _Vue
`,-1)}h0(e.hoists,t),i(),a("return ")}function Er(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?oc:t==="component"?ic:rc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${yi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function h0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),$t(i,t),n())}t.pure=!1}function _c(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ni(e,t,s),s&&t.deindent(),t.push("]")}function Ni(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Te(r)?a(r,-3):pe(r)?_c(r,t):$t(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function $t(e,t){if(Te(e)){t.push(e,-3);return}if(Ut(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:$t(e.codegenNode,t);break;case 2:g0(e,t);break;case 4:kh(e,t);break;case 5:m0(e,t);break;case 12:$t(e.codegenNode,t);break;case 8:wh(e,t);break;case 3:b0(e,t);break;case 13:y0(e,t);break;case 14:_0(e,t);break;case 15:k0(e,t);break;case 17:w0(e,t);break;case 18:S0(e,t);break;case 19:T0(e,t);break;case 20:C0(e,t);break;case 21:Ni(e.body,t,!0,!1);break}}function g0(e,t){t.push(JSON.stringify(e.content),-3,e)}function kh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function m0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(ar),s(`${n(tr)}(`),$t(e.content,t),s(")")}function wh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Te(n)?t.push(n,-3):$t(n,t)}}function v0(e,t){const{push:s}=t;if(e.type===8)s("["),wh(e,t),s("]");else if(e.isStatic){const n=bc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function b0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(ar),s(`${n(Ri)}(${JSON.stringify(e.content)})`,-3,e)}function y0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let m;o&&(m=String(o)),u&&s(n(cc)+"("),d&&s(`(${n($n)}(${f?"true":""}), `),a&&s(ar);const g=d?wa(t.inSSR,p):ka(t.inSSR,p);s(n(g)+"(",-2,e),Ni(x0([i,l,r,m,c]),t),s(")"),d&&s(")"),u&&(s(", "),$t(u,t),s(")"))}function x0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function _0(e,t){const{push:s,helper:n,pure:a}=t,i=Te(e.callee)?e.callee:n(e.callee);a&&s(ar),s(i+"(",-2,e),Ni(e.arguments,t),s(")")}function k0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];v0(c,t),s(": "),$t(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function w0(e,t){_c(e.elements,t)}function S0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${xa[hc]}(`),s("(",-2,e),pe(i)?Ni(i,t):i&&$t(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),pe(l)?_c(l,t):$t(l,t)):r&&$t(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function T0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!bc(s.content);d&&l("("),kh(s,t),d&&l(")")}else l("("),$t(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),$t(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,$t(a,t),u||t.indentLevel--,i&&o(!0)}function C0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Cl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),$t(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Cl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const E0=xh(/^(?:if|else|else-if)$/,(e,t,s)=>A0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Gu(a,o,s);else{const c=R0(n.codegenNode);c.alternate=Gu(a,o+n.branches.length-1,s)}}}));function A0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(tt(28,t.loc)),t.exp=Ae("true",!1,a)}if(t.name==="if"){const a=qu(e,t),i={type:9,loc:t0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&dh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(tt(30,e.loc)),s.removeNode();const r=qu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);nr(r,s),o&&o(),s.currentNode=null}else s.onError(tt(30,e.loc));break}}}function qu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!us(e,"for")?e.children:[e],userKey:sr(e,"key"),isTemplateIf:s}}function Gu(e,t,s){return e.condition?oo(e.condition,Wu(e,t,s),_t(s.helper(Ri),['""',"true"])):Wu(e,t,s)}function Wu(e,t,s){const{helper:n}=s,a=gt("key",Ae(`${t}`,!1,rs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Il(o,a,s),o}else return vi(s,n(gi),ds([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Ky(o);return c.type===13&&mc(c,s),Il(c,a,s),o}}function R0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const I0=xh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return N0(e,t,s,i=>{const l=_t(n(uc),[i.source]),r=Al(e),o=us(e,"memo"),c=sr(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Ae(c.value.content,!0):void 0:c.exp);const d=u?gt("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=vi(s,n(gi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let m;const{children:g}=i,w=g.length!==1||g[0].type!==1,R=Rl(e)?e:r&&e.children.length===1&&Rl(e.children[0])?e.children[0]:null;if(R?(m=R.codegenNode,r&&d&&Il(m,d,s)):w?m=vi(s,n(gi),d?ds([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=g[0].codegenNode,r&&d&&Il(m,d,s),m.isBlock!==!f&&(m.isBlock?(a($n),a(wa(s.inSSR,m.isComponent))):a(ka(s.inSSR,m.isComponent))),m.isBlock=!f,m.isBlock?(n($n),n(wa(s.inSSR,m.isComponent))):n(ka(s.inSSR,m.isComponent))),o){const b=_a(fo(i.parseResult,[Ae("_cached")]));b.body=Oy([ys(["const _memo = (",o.exp,")"]),ys(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(nh)}(_cached, _memo)) return _cached`]),ys(["const _item = ",m]),Ae("_item.memo = _memo"),Ae("return _item")]),l.arguments.push(b,Ae("_cache"),Ae(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(_a(fo(i.parseResult),m,!0))}})});function N0(e,t,s,n){if(!t.exp){s.onError(tt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(tt(32,t.loc));return}Sh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:Al(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Sh(e,t){e.finalized||(e.finalized=!0)}function fo({value:e,key:t,index:s},n=[]){return L0([e,t,s,...n])}function L0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ae("_".repeat(n+1),!1))}const Zu=Ae("undefined",!1),O0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=us(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},D0=(e,t,s,n)=>_a(e,s,!1,!0,s.length?s[0].loc:n);function M0(e,t,s=D0){t.helper(hc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=us(e,"slot",!0);if(o){const{arg:w,exp:R}=o;w&&!Xt(w)&&(r=!0),i.push(gt(w||Ae("default",!0),s(R,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let w=0;w<n.length;w++){const R=n[w];let b;if(!Al(R)||!(b=us(R,"slot",!0))){R.type!==3&&d.push(R);continue}if(o){t.onError(tt(37,b.loc));break}c=!0;const{children:v,loc:x}=R,{arg:E=Ae("default",!0),exp:N,loc:O}=b;let S;Xt(E)?S=E?E.content:"default":r=!0;const I=us(R,"for"),D=s(N,I,v,x);let H,F;if(H=us(R,"if"))r=!0,l.push(oo(H.exp,Zi(E,D,p++),Zu));else if(F=us(R,/^else(?:-if)?$/,!0)){let M=w,W;for(;M--&&(W=n[M],!!dh(W)););if(W&&Al(W)&&us(W,/^(?:else-)?if$/)){let B=l[l.length-1];for(;B.alternate.type===19;)B=B.alternate;B.alternate=F.exp?oo(F.exp,Zi(E,D,p++),Zu):Zi(E,D,p++)}else t.onError(tt(30,F.loc))}else if(I){r=!0;const M=I.forParseResult;M?(Sh(M),l.push(_t(t.helper(uc),[M.source,_a(fo(M),Zi(E,D),!0)]))):t.onError(tt(32,I.loc))}else{if(S){if(f.has(S)){t.onError(tt(38,O));continue}f.add(S),S==="default"&&(u=!0)}i.push(gt(E,D))}}if(!o){const w=(R,b)=>{const v=s(R,void 0,b,a);return t.compatConfig&&(v.isNonScopedSlot=!0),gt("default",v)};c?d.length&&!d.every(yc)&&(u?t.onError(tt(39,d[0].loc)):i.push(w(void 0,d))):i.push(w(void 0,n))}const m=r?2:al(e.children)?3:1;let g=ds(i.concat(gt("_",Ae(m+"",!1))),a);return l.length&&(g=_t(t.helper(sh),[g,On(l)])),{slots:g,hasDynamicSlots:r}}function Zi(e,t,s){const n=[gt("name",e),gt("fn",t)];return s!=null&&n.push(gt("key",Ae(String(s),!0))),ds(n)}function al(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||al(s.children))return!0;break;case 9:if(al(s.branches))return!0;break;case 10:case 11:if(al(s.children))return!0;break}}return!1}const Th=new WeakMap,P0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?F0(e,t):`"${n}"`;const r=Be(l)&&l.callee===lc;let o,c,u=0,d,f,p,m=r||l===ei||l===tc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=Ch(e,t,void 0,i,r);o=g.props,u=g.patchFlag,f=g.dynamicPropNames;const w=g.directives;p=w&&w.length?On(w.map(R=>U0(R,t))):void 0,g.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===Sl&&(m=!0,u|=1024),i&&l!==ei&&l!==Sl){const{slots:w,hasDynamicSlots:R}=M0(e,t);c=w,R&&(u|=1024)}else if(e.children.length===1&&l!==ei){const w=e.children[0],R=w.type,b=R===5||R===8;b&&ss(w,t)===0&&(u|=1),b||R===2?c=w:c=e.children}else c=e.children;f&&f.length&&(d=B0(f)),e.codegenNode=vi(t,l,o,c,u===0?void 0:u,d,p,!!m,!1,i,e.loc)};function F0(e,t,s=!1){let{tag:n}=e;const a=po(n),i=sr(e,"is",!1,!0);if(i)if(a||Dn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ae(i.value.content,!0):(r=i.exp,r||(r=Ae("is",!1,i.arg.loc))),r)return _t(t.helper(lc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=ih(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(ic),t.components.add(n),yi(n,"component"))}function Ch(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,m=0,g=!1,w=!1,R=!1,b=!1,v=!1,x=!1;const E=[],N=D=>{c.length&&(u.push(ds(Ju(c),r)),c=[]),D&&u.push(D)},O=()=>{t.scopes.vFor>0&&c.push(gt(Ae("ref_for",!0),Ae("true")))},S=({key:D,value:H})=>{if(Xt(D)){const F=D.content,M=Bn(F);if(M&&(!n||a)&&F.toLowerCase()!=="onclick"&&F!=="onUpdate:modelValue"&&!qs(F)&&(b=!0),M&&qs(F)&&(x=!0),M&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ss(H,t)>0)return;F==="ref"?g=!0:F==="class"?w=!0:F==="style"?R=!0:F!=="key"&&!E.includes(F)&&E.push(F),n&&(F==="class"||F==="style")&&!E.includes(F)&&E.push(F)}else v=!0};for(let D=0;D<s.length;D++){const H=s[D];if(H.type===6){const{loc:F,name:M,nameLoc:W,value:B}=H;let j=!0;if(M==="ref"&&(g=!0,O()),M==="is"&&(po(l)||B&&B.content.startsWith("vue:")||Dn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(gt(Ae(M,!0,W),Ae(B?B.content:"",j,B?B.loc:F)))}else{const{name:F,arg:M,exp:W,loc:B,modifiers:j}=H,L=F==="bind",k=F==="on";if(F==="slot"){n||t.onError(tt(40,B));continue}if(F==="once"||F==="memo"||F==="is"||L&&En(M,"is")&&(po(l)||Dn("COMPILER_IS_ON_ELEMENT",t))||k&&i)continue;if((L&&En(M,"key")||k&&f&&En(M,"vue:before-update"))&&(p=!0),L&&En(M,"ref")&&O(),!M&&(L||k)){if(v=!0,W)if(L){if(N(),Dn("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift(W);continue}O(),N(),u.push(W)}else N({type:14,loc:B,callee:t.helper(pc),arguments:n?[W]:[W,"true"]});else t.onError(tt(L?34:35,B));continue}L&&j.some(oe=>oe.content==="prop")&&(m|=32);const $=t.directiveTransforms[F];if($){const{props:oe,needRuntime:re}=$(H,e,t);!i&&oe.forEach(S),k&&M&&!Xt(M)?N(ds(oe,r)):c.push(...oe),re&&(d.push(H),Ut(re)&&Th.set(H,re))}else Ig(F)||(d.push(H),f&&(p=!0))}}let I;if(u.length?(N(),u.length>1?I=_t(t.helper(Tl),u,r):I=u[0]):c.length&&(I=ds(Ju(c),r)),v?m|=16:(w&&!n&&(m|=2),R&&!n&&(m|=4),E.length&&(m|=8),b&&(m|=32)),!p&&(m===0||m===32)&&(g||x||d.length>0)&&(m|=512),!t.inSSR&&I)switch(I.type){case 15:let D=-1,H=-1,F=!1;for(let B=0;B<I.properties.length;B++){const j=I.properties[B].key;Xt(j)?j.content==="class"?D=B:j.content==="style"&&(H=B):j.isHandlerKey||(F=!0)}const M=I.properties[D],W=I.properties[H];F?I=_t(t.helper(mi),[I]):(M&&!Xt(M.value)&&(M.value=_t(t.helper(dc),[M.value])),W&&(R||W.value.type===4&&W.value.content.trim()[0]==="["||W.value.type===17)&&(W.value=_t(t.helper(fc),[W.value])));break;case 14:break;default:I=_t(t.helper(mi),[_t(t.helper(Ii),[I])]);break}return{props:I,directives:d,patchFlag:m,dynamicPropNames:E,shouldUseBlock:p}}function Ju(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Bn(i))&&$0(l,a):(t.set(i,a),s.push(a))}return s}function $0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=On([e.value,t.value],e.loc)}function U0(e,t){const s=[],n=Th.get(e);n?s.push(t.helperString(n)):(t.helper(rc),t.directives.add(e.name),s.push(yi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ae("true",!1,a);s.push(ds(e.modifiers.map(l=>gt(l,i)),a))}return On(s,e.loc)}function B0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function po(e){return e==="component"||e==="Component"}const H0=(e,t)=>{if(Rl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=V0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=_a([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=_t(t.helper(th),l,n)}};function V0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Ge(l.name),a.push(l)));else if(l.name==="bind"&&En(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Ge(l.arg.content);s=l.exp=Ae(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Xt(l.arg)&&(l.arg.content=Ge(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Ch(e,t,a,!1,!1);n=i,l.length&&t.onError(tt(36,l[0].loc))}return{slotName:s,slotProps:n}}const Eh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(tt(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?oa(Ge(d)):`on:${d}`;r=Ae(f,!0,l.loc)}else r=ys([`${s.helperString(ro)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(ro)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=oh(o),f=!(d||Hy(o)),p=o.content.includes(";");(f||c&&d)&&(o=ys([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[gt(r,o||Ae("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},j0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Ge(i.content):i.content=`${s.helperString(lo)}(${i.content})`:(i.children.unshift(`${s.helperString(lo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&Yu(i,"."),n.some(r=>r.content==="attr")&&Yu(i,"^")),{props:[gt(i,l)]}},Yu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},z0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Cr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Cr(o))n||(n=s[i]=ys([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Cr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ss(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:_t(t.helper(ac),r)}}}}},Qu=new WeakSet,K0=(e,t)=>{if(e.type===1&&us(e,"once",!0))return Qu.has(e)||t.inVOnce||t.inSSR?void 0:(Qu.add(e),t.inVOnce=!0,t.helper(Cl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Ah=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(tt(41,e.loc)),$a();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(tt(44,n.loc)),$a();if(r==="literal-const"||r==="setup-const")return s.onError(tt(45,n.loc)),$a();if(!l.trim()||!oh(n))return s.onError(tt(42,n.loc)),$a();const o=a||Ae("modelValue",!0),c=a?Xt(a)?`onUpdate:${Ge(a.content)}`:ys(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=ys([`${d} => ((`,n,") = $event)"]);const f=[gt(o,e.exp),gt(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(bc(g)?g:JSON.stringify(g))+": true").join(", "),m=a?Xt(a)?`${a.content}Modifiers`:ys([a,' + "Modifiers"']):"modelModifiers";f.push(gt(m,Ae(`{ ${p} }`,!1,e.loc,2)))}return $a(f)};function $a(e=[]){return{props:e}}const q0=/[\w).+\-_$\]]/,G0=(e,t)=>{Dn("COMPILER_FILTERS",t)&&(e.type===5?Nl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Nl(s.exp,t)}))};function Nl(e,t){if(e.type===4)Xu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Xu(n,t):n.type===8?Nl(e,t):n.type===5&&Nl(n.content,t))}}function Xu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,m,g=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)m===void 0?(u=p+1,m=s.slice(0,p).trim()):w();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let R=p-1,b;for(;R>=0&&(b=s.charAt(R),b===" ");R--);(!b||!q0.test(b))&&(l=!0)}}m===void 0?m=s.slice(0,p).trim():u!==0&&w();function w(){g.push(s.slice(u,p).trim()),u=p+1}if(g.length){for(p=0;p<g.length;p++)m=W0(m,g[p],t);e.content=m,e.ast=void 0}}function W0(e,t,s){s.helper(oc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${yi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${yi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const ed=new WeakSet,Z0=(e,t)=>{if(e.type===1){const s=us(e,"memo");return!s||ed.has(e)||t.inSSR?void 0:(ed.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&mc(n,t),e.codegenNode=_t(t.helper(gc),[s.exp,_a(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},J0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(tt(53,n.loc)),s.exp=Ae("",!0,n.loc);else{const a=Ge(n.content);(lh.test(a[0])||a[0]==="-")&&(s.exp=Ae(a,!1,n.loc))}}}};function Y0(e){return[[J0,K0,E0,Z0,I0,G0,H0,P0,O0,z0],{on:Eh,bind:j0,model:Ah}]}function Q0(e,t={}){const s=t.onError||vc,n=t.mode==="module";t.prefixIdentifiers===!0?s(tt(48)):n&&s(tt(49));const a=!1;t.cacheHandlers&&s(tt(50)),t.scopeId&&!n&&s(tt(51));const i=Oe({},t,{prefixIdentifiers:a}),l=Te(e)?a0(e,i):e,[r,o]=Y0();return o0(l,Oe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Oe({},o,t.directiveTransforms||{})})),f0(l,i)}const X0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Rh=Symbol(""),Ih=Symbol(""),Nh=Symbol(""),Lh=Symbol(""),ho=Symbol(""),Oh=Symbol(""),Dh=Symbol(""),Mh=Symbol(""),Ph=Symbol(""),Fh=Symbol("");Iy({[Rh]:"vModelRadio",[Ih]:"vModelCheckbox",[Nh]:"vModelText",[Lh]:"vModelSelect",[ho]:"vModelDynamic",[Oh]:"withModifiers",[Dh]:"withKeys",[Mh]:"vShow",[Ph]:"Transition",[Fh]:"TransitionGroup"});let Yn;function ex(e,t=!1){return Yn||(Yn=document.createElement("div")),t?(Yn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Yn.children[0].getAttribute("foo")):(Yn.innerHTML=e,Yn.textContent)}const tx={parseMode:"html",isVoidTag:Gg,isNativeTag:e=>zg(e)||Kg(e)||qg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:ex,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Ph;if(e==="TransitionGroup"||e==="transition-group")return Fh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},sx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ae("style",!0,t.loc),exp:nx(t.value.content,t.loc),modifiers:[],loc:t.loc})})},nx=(e,t)=>{const s=Zd(e);return Ae(JSON.stringify(s),!1,t,3)};function mn(e,t){return tt(e,t)}const ax=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(mn(54,a)),t.children.length&&(s.onError(mn(55,a)),t.children.length=0),{props:[gt(Ae("innerHTML",!0,a),n||Ae("",!0))]}},ix=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(mn(56,a)),t.children.length&&(s.onError(mn(57,a)),t.children.length=0),{props:[gt(Ae("textContent",!0),n?ss(n,s)>0?n:_t(s.helperString(tr),[n],a):Ae("",!0))]}},lx=(e,t,s)=>{const n=Ah(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(mn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Nh,r=!1;if(a==="input"||i){const o=sr(t,"type");if(o){if(o.type===7)l=ho;else if(o.value)switch(o.value.content){case"radio":l=Rh;break;case"checkbox":l=Ih;break;case"file":r=!0,s.onError(mn(60,e.loc));break}}else Vy(t)&&(l=ho)}else a==="select"&&(l=Lh);r||(n.needRuntime=s.helper(l))}else s.onError(mn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},rx=ls("passive,once,capture"),ox=ls("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),cx=ls("left,right"),$h=ls("onkeyup,onkeydown,onkeypress"),ux=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&bi("COMPILER_V_ON_NATIVE",s)||rx(o)?l.push(o):cx(o)?Xt(e)?$h(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):ox(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},td=(e,t)=>Xt(e)&&e.content.toLowerCase()==="onclick"?Ae(t,!0):e.type!==4?ys(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,dx=(e,t,s)=>Eh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=ux(i,a,s,e.loc);if(o.includes("right")&&(i=td(i,"onContextmenu")),o.includes("middle")&&(i=td(i,"onMouseup")),o.length&&(l=_t(s.helper(Oh),[l,JSON.stringify(o)])),r.length&&(!Xt(i)||$h(i.content.toLowerCase()))&&(l=_t(s.helper(Dh),[l,JSON.stringify(r)])),c.length){const u=c.map(Vn).join("");i=Xt(i)?Ae(`${i.content}${u}`,!0):ys(["(",i,`) + "${u}"`])}return{props:[gt(i,l)]}}),fx=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(mn(62,a)),{props:[],needRuntime:s.helper(Mh)}},px=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},hx=[sx],gx={cloak:X0,html:ax,text:ix,model:lx,on:dx,show:fx};function mx(e,t={}){return Q0(e,Oe({},tx,t,{nodeTransforms:[px,...hx,...t.nodeTransforms||[]],directiveTransforms:Oe({},gx,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const sd=Object.create(null);function vx(e,t){if(!Te(e))if(e.nodeType)e=e.innerHTML;else return Nt;const s=Og(e,t),n=sd[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Oe({hoistStatic:!0,onError:void 0,onWarn:Nt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=mx(e,a),l=new Function("Vue",i)(Sy);return l._rc=!0,sd[s]=l}_p(vx);const Ll=bn({items:[]});let bx=1;function ir(e,t="info",s=3e3){const n=bx++;return Ll.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>kc(n),s),n}function kc(e){const t=Ll.items.findIndex(s=>s.id===e);t>=0&&Ll.items.splice(t,1)}function xe(e,t="info",s=3e3){return ir(e,t,s)}xe.success=(e,t=3e3)=>ir(e,"success",t);xe.error=(e,t=5e3)=>ir(e,"error",t);xe.info=(e,t=3e3)=>ir(e,"info",t);xe.dismiss=kc;const yx={setup(){return{state:Ll,dismiss:kc}},template:`
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
  `},Bs=bn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ha=null;function is({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ha&&ha(!1),Bs.title=e,Bs.message=t,Bs.confirmLabel=s,Bs.cancelLabel=n,Bs.danger=a,Bs.open=!0,new Promise(i=>{ha=i})}function nd(e){Bs.open=!1,ha&&(ha(e),ha=null)}const xx={setup(){function e(t){Bs.open&&t.key==="Escape"&&(t.stopPropagation(),nd(!1))}return $e(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:Bs,settle:nd}},template:`
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
 */const sa=typeof document<"u";function Uh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function _x(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Uh(e.default)}const ze=Object.assign;function Ar(e,t){const s={};for(const n in t){const a=t[n];s[n]=_s(a)?a.map(e):e(a)}return s}const ti=()=>{},_s=Array.isArray;function ad(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Bh=/#/g,kx=/&/g,wx=/\//g,Sx=/=/g,Tx=/\?/g,Hh=/\+/g,Cx=/%5B/g,Ex=/%5D/g,Vh=/%5E/g,Ax=/%60/g,jh=/%7B/g,Rx=/%7C/g,zh=/%7D/g,Ix=/%20/g;function wc(e){return e==null?"":encodeURI(""+e).replace(Rx,"|").replace(Cx,"[").replace(Ex,"]")}function Nx(e){return wc(e).replace(jh,"{").replace(zh,"}").replace(Vh,"^")}function go(e){return wc(e).replace(Hh,"%2B").replace(Ix,"+").replace(Bh,"%23").replace(kx,"%26").replace(Ax,"`").replace(jh,"{").replace(zh,"}").replace(Vh,"^")}function Lx(e){return go(e).replace(Sx,"%3D")}function Ox(e){return wc(e).replace(Bh,"%23").replace(Tx,"%3F")}function Dx(e){return Ox(e).replace(wx,"%2F")}function _i(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Mx=/\/$/,Px=e=>e.replace(Mx,"");function Rr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=Bx(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:_i(l)}}function Fx(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function id(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function $x(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Sa(t.matched[n],s.matched[a])&&Kh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Sa(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Kh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Ux(e[s],t[s]))return!1;return!0}function Ux(e,t){return _s(e)?ld(e,t):_s(t)?ld(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function ld(e,t){return _s(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function Bx(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const on={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let mo=(function(e){return e.pop="pop",e.push="push",e})({}),Ir=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Hx(e){if(!e)if(sa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Px(e)}const Vx=/^[^#]+#/;function jx(e,t){return e.replace(Vx,"#")+t}function zx(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const lr=()=>({left:window.scrollX,top:window.scrollY});function Kx(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=zx(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function rd(e,t){return(history.state?history.state.position-t:-1)+e}const vo=new Map;function qx(e,t){vo.set(e,t)}function Gx(e){const t=vo.get(e);return vo.delete(e),t}function Wx(e){return typeof e=="string"||e&&typeof e=="object"}function qh(e){return typeof e=="string"||typeof e=="symbol"}let rt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Gh=Symbol("");rt.MATCHER_NOT_FOUND+"",rt.NAVIGATION_GUARD_REDIRECT+"",rt.NAVIGATION_ABORTED+"",rt.NAVIGATION_CANCELLED+"",rt.NAVIGATION_DUPLICATED+"";function Ta(e,t){return ze(new Error,{type:e,[Gh]:!0},t)}function Ms(e,t){return e instanceof Error&&Gh in e&&(t==null||!!(e.type&t))}const Zx=["params","query","hash"];function Jx(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Zx)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Yx(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Hh," "),i=a.indexOf("="),l=_i(i<0?a:a.slice(0,i)),r=i<0?null:_i(a.slice(i+1));if(l in t){let o=t[l];_s(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function od(e){let t="";for(let s in e){const n=e[s];if(s=Lx(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(_s(n)?n.map(a=>a&&go(a)):[n&&go(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function Qx(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=_s(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Xx=Symbol(""),cd=Symbol(""),rr=Symbol(""),Sc=Symbol(""),bo=Symbol("");function Ua(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function hn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Ta(rt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):Wx(f)?o(Ta(rt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Nr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Uh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(hn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=_x(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&hn(f,s,n,l,r,a)()}))}}return i}function e_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Sa(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Sa(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let t_=()=>location.protocol+"//"+location.host;function Wh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),id(r,"")}return id(s,e)+n+a}function s_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=Wh(e,location),m=s.value,g=t.value;let w=0;if(f){if(s.value=p,t.value=f,l&&l===m){l=null;return}w=g?f.position-g.position:0}else n(p);a.forEach(R=>{R(s.value,m,{delta:w,type:mo.pop,direction:w?w>0?Ir.forward:Ir.back:Ir.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const m=a.indexOf(f);m>-1&&a.splice(m,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(ze({},f.state,{scroll:lr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function ud(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?lr():null}}function n_(e){const{history:t,location:s}=window,n={value:Wh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:t_()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,ze({},t.state,ud(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=ze({},a.value,t.state,{forward:o,scroll:lr()});i(u.current,u,!0),i(o,ze({},ud(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function a_(e){e=Hx(e);const t=n_(e),s=s_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=ze({location:"",base:e,go:n,createHref:jx.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function i_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),a_(e)}let Rn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var yt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(yt||{});const l_={type:Rn.Static,value:""},r_=/[a-zA-Z0-9_]/;function o_(e){if(!e)return[[]];if(e==="/")return[[l_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=yt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===yt.Static?i.push({type:Rn.Static,value:c}):s===yt.Param||s===yt.ParamRegExp||s===yt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Rn.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==yt.ParamRegExp){n=s,s=yt.EscapeNext;continue}switch(s){case yt.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=yt.Param):f();break;case yt.EscapeNext:f(),s=n;break;case yt.Param:o==="("?s=yt.ParamRegExp:r_.test(o)?f():(d(),s=yt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case yt.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=yt.ParamRegExpEnd:u+=o;break;case yt.ParamRegExpEnd:d(),s=yt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===yt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const dd="[^/]+?",c_={sensitive:!1,strict:!1,start:!0,end:!0};var Vt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Vt||{});const u_=/[.+*?^${}()[\]/\\]/g;function d_(e,t){const s=ze({},c_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[Vt.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=Vt.Segment+(s.sensitive?Vt.BonusCaseSensitive:0);if(f.type===Rn.Static)d||(a+="/"),a+=f.value.replace(u_,"\\$&"),p+=Vt.Static;else if(f.type===Rn.Param){const{value:m,repeatable:g,optional:w,regexp:R}=f;i.push({name:m,repeatable:g,optional:w});const b=R||dd;if(b!==dd){p+=Vt.BonusCustomRegExp;try{`${b}`}catch(x){throw new Error(`Invalid custom RegExp for param "${m}" (${b}): `+x.message)}}let v=g?`((?:${b})(?:/(?:${b}))*)`:`(${b})`;d||(v=w&&c.length<2?`(?:/${v})`:"/"+v),w&&(v+="?"),a+=v,p+=Vt.Dynamic,w&&(p+=Vt.BonusOptional),g&&(p+=Vt.BonusRepeatable),b===".*"&&(p+=Vt.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Vt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",m=i[f-1];d[m.name]=p&&m.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Rn.Static)u+=p.value;else if(p.type===Rn.Param){const{value:m,repeatable:g,optional:w}=p,R=m in c?c[m]:"";if(_s(R)&&!g)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const b=_s(R)?R.join("/"):R;if(!b)if(w)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${m}"`);u+=b}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function f_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Vt.Static+Vt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Vt.Static+Vt.Segment?1:-1:0}function Zh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=f_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(fd(n))return 1;if(fd(a))return-1}return a.length-n.length}function fd(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const p_={strict:!1,end:!0,sensitive:!1};function h_(e,t,s){const n=d_(o_(e.path),s),a=ze(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function g_(e,t){const s=[],n=new Map;t=ad(p_,t);function a(d){return n.get(d)}function i(d,f,p){const m=!p,g=hd(d);g.aliasOf=p&&p.record;const w=ad(t,d),R=[g];if("alias"in d){const x=typeof d.alias=="string"?[d.alias]:d.alias;for(const E of x)R.push(hd(ze({},g,{components:p?p.record.components:g.components,path:E,aliasOf:p?p.record:g})))}let b,v;for(const x of R){const{path:E}=x;if(f&&E[0]!=="/"){const N=f.record.path,O=N[N.length-1]==="/"?"":"/";x.path=f.record.path+(E&&O+E)}if(b=h_(x,f,w),p?p.alias.push(b):(v=v||b,v!==b&&v.alias.push(b),m&&d.name&&!gd(b)&&l(d.name)),Jh(b)&&o(b),g.children){const N=g.children;for(let O=0;O<N.length;O++)i(N[O],b,p&&p.children[O])}p=p||b}return v?()=>{l(v)}:ti}function l(d){if(qh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=b_(d,s);s.splice(f,0,d),d.record.name&&!gd(d)&&n.set(d.record.name,d)}function c(d,f){let p,m={},g,w;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw Ta(rt.MATCHER_NOT_FOUND,{location:d});w=p.record.name,m=ze(pd(f.params,p.keys.filter(v=>!v.optional).concat(p.parent?p.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),d.params&&pd(d.params,p.keys.map(v=>v.name))),g=p.stringify(m)}else if(d.path!=null)g=d.path,p=s.find(v=>v.re.test(g)),p&&(m=p.parse(g),w=p.record.name);else{if(p=f.name?n.get(f.name):s.find(v=>v.re.test(f.path)),!p)throw Ta(rt.MATCHER_NOT_FOUND,{location:d,currentLocation:f});w=p.record.name,m=ze({},f.params,d.params),g=p.stringify(m)}const R=[];let b=p;for(;b;)R.unshift(b.record),b=b.parent;return{name:w,path:g,params:m,matched:R,meta:v_(R)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function pd(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function hd(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:m_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function m_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function gd(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function v_(e){return e.reduce((t,s)=>ze(t,s.meta),{})}function b_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Zh(e,t[i])<0?n=i:s=i+1}const a=y_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function y_(e){let t=e;for(;t=t.parent;)if(Jh(t)&&Zh(e,t)===0)return t}function Jh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function md(e){const t=fs(rr),s=fs(Sc),n=ee(()=>{const o=Rs(e.to);return t.resolve(o)}),a=ee(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(Sa.bind(null,u));if(f>-1)return f;const p=vd(o[c-2]);return c>1&&vd(u)===p&&d[d.length-1].path!==p?d.findIndex(Sa.bind(null,o[c-2])):f}),i=ee(()=>a.value>-1&&S_(s.params,n.value.params)),l=ee(()=>a.value>-1&&a.value===s.matched.length-1&&Kh(s.params,n.value.params));function r(o={}){if(w_(o)){const c=t[Rs(e.replace)?"replace":"push"](Rs(e.to)).catch(ti);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:ee(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function x_(e){return e.length===1?e[0]:e}const __=Ci({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:md,setup(e,{slots:t}){const s=bn(md(e)),{options:n}=fs(rr),a=ee(()=>({[bd(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[bd(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&x_(t.default(s));return e.custom?i:va("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),k_=__;function w_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function S_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!_s(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function vd(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const bd=(e,t,s)=>e??t??s,T_=Ci({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=fs(bo),a=ee(()=>e.route||n.value),i=fs(cd,0),l=ee(()=>{let c=Rs(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=ee(()=>a.value.matched[l.value]);Ja(cd,ee(()=>l.value+1)),Ja(Xx,r),Ja(bo,a);const o=h();return ns(()=>[o.value,r.value,e.name],([c,u,d],[f,p,m])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!Sa(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return yd(s.default,{Component:f,route:c});const p=d.props[u],m=p?p===!0?c.params:typeof p=="function"?p(c):p:null,w=va(f,ze({},m,t,{onVnodeUnmounted:R=>{R.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return yd(s.default,{Component:w,route:c})||w}}});function yd(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const C_=T_;function E_(e){const t=g_(e.routes,e),s=e.parseQuery||Yx,n=e.stringifyQuery||od,a=e.history,i=Ua(),l=Ua(),r=Ua(),o=Lo(on);let c=on;sa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Ar.bind(null,z=>""+z),d=Ar.bind(null,Dx),f=Ar.bind(null,_i);function p(z,ce){let le,me;return qh(z)?(le=t.getRecordMatcher(z),me=ce):me=z,t.addRoute(me,le)}function m(z){const ce=t.getRecordMatcher(z);ce&&t.removeRoute(ce)}function g(){return t.getRoutes().map(z=>z.record)}function w(z){return!!t.getRecordMatcher(z)}function R(z,ce){if(ce=ze({},ce||o.value),typeof z=="string"){const T=Rr(s,z,ce.path),P=t.resolve({path:T.path},ce),G=a.createHref(T.fullPath);return ze(T,P,{params:f(P.params),hash:_i(T.hash),redirectedFrom:void 0,href:G})}let le;if(z.path!=null)le=ze({},z,{path:Rr(s,z.path,ce.path).path});else{const T=ze({},z.params);for(const P in T)T[P]==null&&delete T[P];le=ze({},z,{params:d(T)}),ce.params=d(ce.params)}const me=t.resolve(le,ce),ve=z.hash||"";me.params=u(f(me.params));const Le=Fx(n,ze({},z,{hash:Nx(ve),path:me.path})),y=a.createHref(Le);return ze({fullPath:Le,hash:ve,query:n===od?Qx(z.query):z.query||{}},me,{redirectedFrom:void 0,href:y})}function b(z){return typeof z=="string"?Rr(s,z,o.value.path):ze({},z)}function v(z,ce){if(c!==z)return Ta(rt.NAVIGATION_CANCELLED,{from:ce,to:z})}function x(z){return O(z)}function E(z){return x(ze(b(z),{replace:!0}))}function N(z,ce){const le=z.matched[z.matched.length-1];if(le&&le.redirect){const{redirect:me}=le;let ve=typeof me=="function"?me(z,ce):me;return typeof ve=="string"&&(ve=ve.includes("?")||ve.includes("#")?ve=b(ve):{path:ve},ve.params={}),ze({query:z.query,hash:z.hash,params:ve.path!=null?{}:z.params},ve)}}function O(z,ce){const le=c=R(z),me=o.value,ve=z.state,Le=z.force,y=z.replace===!0,T=N(le,me);if(T)return O(ze(b(T),{state:typeof T=="object"?ze({},ve,T.state):ve,force:Le,replace:y}),ce||le);const P=le;P.redirectedFrom=ce;let G;return!Le&&$x(n,me,le)&&(G=Ta(rt.NAVIGATION_DUPLICATED,{to:P,from:me}),re(me,me,!0,!1)),(G?Promise.resolve(G):D(P,me)).catch(A=>Ms(A)?Ms(A,rt.NAVIGATION_GUARD_REDIRECT)?A:oe(A):k(A,P,me)).then(A=>{if(A){if(Ms(A,rt.NAVIGATION_GUARD_REDIRECT))return O(ze({replace:y},b(A.to),{state:typeof A.to=="object"?ze({},ve,A.to.state):ve,force:Le}),ce||P)}else A=F(P,me,!0,y,ve);return H(P,me,A),A})}function S(z,ce){const le=v(z,ce);return le?Promise.reject(le):Promise.resolve()}function I(z){const ce=J.values().next().value;return ce&&typeof ce.runWithContext=="function"?ce.runWithContext(z):z()}function D(z,ce){let le;const[me,ve,Le]=e_(z,ce);le=Nr(me.reverse(),"beforeRouteLeave",z,ce);for(const T of me)T.leaveGuards.forEach(P=>{le.push(hn(P,z,ce))});const y=S.bind(null,z,ce);return le.push(y),Ie(le).then(()=>{le=[];for(const T of i.list())le.push(hn(T,z,ce));return le.push(y),Ie(le)}).then(()=>{le=Nr(ve,"beforeRouteUpdate",z,ce);for(const T of ve)T.updateGuards.forEach(P=>{le.push(hn(P,z,ce))});return le.push(y),Ie(le)}).then(()=>{le=[];for(const T of Le)if(T.beforeEnter)if(_s(T.beforeEnter))for(const P of T.beforeEnter)le.push(hn(P,z,ce));else le.push(hn(T.beforeEnter,z,ce));return le.push(y),Ie(le)}).then(()=>(z.matched.forEach(T=>T.enterCallbacks={}),le=Nr(Le,"beforeRouteEnter",z,ce,I),le.push(y),Ie(le))).then(()=>{le=[];for(const T of l.list())le.push(hn(T,z,ce));return le.push(y),Ie(le)}).catch(T=>Ms(T,rt.NAVIGATION_CANCELLED)?T:Promise.reject(T))}function H(z,ce,le){r.list().forEach(me=>I(()=>me(z,ce,le)))}function F(z,ce,le,me,ve){const Le=v(z,ce);if(Le)return Le;const y=ce===on,T=sa?history.state:{};le&&(me||y?a.replace(z.fullPath,ze({scroll:y&&T&&T.scroll},ve)):a.push(z.fullPath,ve)),o.value=z,re(z,ce,le,y),oe()}let M;function W(){M||(M=a.listen((z,ce,le)=>{if(!ue.listening)return;const me=R(z),ve=N(me,ue.currentRoute.value);if(ve){O(ze(ve,{replace:!0,force:!0}),me).catch(ti);return}c=me;const Le=o.value;sa&&qx(rd(Le.fullPath,le.delta),lr()),D(me,Le).catch(y=>Ms(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_CANCELLED)?y:Ms(y,rt.NAVIGATION_GUARD_REDIRECT)?(O(ze(b(y.to),{force:!0}),me).then(T=>{Ms(T,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&!le.delta&&le.type===mo.pop&&a.go(-1,!1)}).catch(ti),Promise.reject()):(le.delta&&a.go(-le.delta,!1),k(y,me,Le))).then(y=>{y=y||F(me,Le,!1),y&&(le.delta&&!Ms(y,rt.NAVIGATION_CANCELLED)?a.go(-le.delta,!1):le.type===mo.pop&&Ms(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(me,Le,y)}).catch(ti)}))}let B=Ua(),j=Ua(),L;function k(z,ce,le){oe(z);const me=j.list();return me.length?me.forEach(ve=>ve(z,ce,le)):console.error(z),Promise.reject(z)}function $(){return L&&o.value!==on?Promise.resolve():new Promise((z,ce)=>{B.add([z,ce])})}function oe(z){return L||(L=!z,W(),B.list().forEach(([ce,le])=>z?le(z):ce()),B.reset()),z}function re(z,ce,le,me){const{scrollBehavior:ve}=e;if(!sa||!ve)return Promise.resolve();const Le=!le&&Gx(rd(z.fullPath,0))||(me||!le)&&history.state&&history.state.scroll||null;return St().then(()=>ve(z,ce,Le)).then(y=>y&&Kx(y)).catch(y=>k(y,z,ce))}const se=z=>a.go(z);let fe;const J=new Set,ue={currentRoute:o,listening:!0,addRoute:p,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:g,resolve:R,options:e,push:x,replace:E,go:se,back:()=>se(-1),forward:()=>se(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:j.add,isReady:$,install(z){z.component("RouterLink",k_),z.component("RouterView",C_),z.config.globalProperties.$router=ue,Object.defineProperty(z.config.globalProperties,"$route",{enumerable:!0,get:()=>Rs(o)}),sa&&!fe&&o.value===on&&(fe=!0,x(a.location).catch(me=>{}));const ce={};for(const me in on)Object.defineProperty(ce,me,{get:()=>o.value[me],enumerable:!0});z.provide(rr,ue),z.provide(Sc,No(ce)),z.provide(bo,o);const le=z.unmount;J.add(z),z.unmount=function(){J.delete(z),J.size<1&&(c=on,M&&M(),M=null,o.value=on,fe=!1,L=!1),le()}}};function Ie(z){return z.reduce((ce,le)=>ce.then(()=>I(le)),Promise.resolve())}return ue}function Yh(){return fs(rr)}function A_(e){return fs(Sc)}const R_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],Jt=bn({open:!1,query:"",selected:0});function xd(){Jt.query="",Jt.selected=0,Jt.open=!0}function Lr(){Jt.open=!1}function I_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const N_={setup(){const e=Yh(),t=h(null),s=ee(()=>{const i=Jt.query.trim().toLowerCase();return R_.map(l=>({...l,_score:I_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ns(()=>Jt.open,async i=>{var l;i&&(await St(),(l=t.value)==null||l.focus())}),ns(()=>Jt.query,()=>{Jt.selected=0});function n(i){Lr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Lr();return}if(i.key==="ArrowDown")i.preventDefault(),Jt.selected=Math.min(Jt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Jt.selected=Math.max(Jt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Jt.selected];l&&n(l)}}return{state:Jt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Lr}},template:`
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
  `},yo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(yo));const L_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>va("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[va("path",{d:yo[e.name]||yo.info})])}},O_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function _d(e){return[...e.querySelectorAll(O_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const D_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=_d(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||_d(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Tc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ia(e){const t=Tc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Cc(e){const t=Tc(e);return t?t.toLocaleTimeString():"—"}function Qh(e){const t=Tc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Ca(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Ec(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Xh(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function kd(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function eg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function M_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const P_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=ee(()=>{const M=e.value.uptime_seconds||0,W=Math.floor(M/86400),B=Math.floor(M%86400/3600),j=Math.floor(M%3600/60),L=[];return W>0&&L.push(`${W}d`),B>0&&L.push(`${B}h`),(L.length===0||W===0&&B===0)&&L.push(`${j}m`),L.join(" ")}),p=ee(()=>{const M=e.value.uptime_seconds||0;return 125.66*(1-Math.min(M/86400,1))}),m=ee(()=>{const M=e.value;return[{label:"Guilds",value:M.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:M.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:M.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${M.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:M.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:M.loop_count>0?"text-green-400":"",highlight:M.loop_count>0},{label:"Agents",value:M.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:M.agent_count>0?`${M.agent_count} total`:"",subColor:"text-gray-500",highlight:(M.agent_running??0)>0},{label:"Processes",value:M.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:M.process_count>0?`${M.process_count} total`:"",subColor:"text-gray-500",highlight:(M.process_running??0)>0},{label:"Schedules",value:M.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(M.schedule_failing>0?`${M.schedule_failing} failing`:"")+(M.schedule_failing>0&&M.schedule_paused>0?", ":"")+(M.schedule_paused>0?`${M.schedule_paused} paused`:"")||void 0,subColor:M.schedule_failing>0?"text-red-400":"text-yellow-400",color:M.schedule_failing>0?"text-red-400":"",highlight:M.schedule_failing>0},{label:"Users",value:M.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=ee(()=>{const M=e.value,W=[];return W.push({label:"Bot",status:M.status==="online"?"ok":"warn",detail:M.status==="online"?"Online":"Starting"}),(M.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${M.schedule_failing} failing`}):(M.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${M.schedule_count} configured`}),(M.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${M.loop_count} active`}),(M.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${M.agent_running} running`}),(M.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${M.process_running} running`}),W});async function w(){try{e.value=await q.get("/api/status"),s.value=null}catch(M){s.value=M.message}finally{t.value=!1}}async function R(){a.value=!0;try{n.value=await q.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function b(){l.value=!0;try{i.value=await q.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function v(){try{const M=await q.get("/api/knowledge");c.value=(Array.isArray(M)?M:[]).reduce((W,B)=>W+(B.chunks||0),0)}catch{c.value=null}}async function x(){try{const M=await q.get("/api/agents");r.value=M.filter(W=>W.status==="running")}catch{}}async function E(){u.value={...u.value,reload:!0};try{await q.post("/api/reload"),xe.success("Config reloaded")}catch(M){xe.error(M.message)}u.value={...u.value,reload:!1}}async function N(){if(!await is({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const B=await q.post("/api/sessions/clear-all");xe.success(`Cleared ${B.count} session${B.count!==1?"s":""}`),await w()}catch(B){e.value={...e.value,session_count:W},xe.error(B.message)}u.value={...u.value,clearSessions:!1}}async function O(){if(!await is({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const B=await q.post("/api/loops/stop-all");xe.success(B.result),await w()}catch(B){e.value={...e.value,loop_count:W},xe.error(B.message)}u.value={...u.value,stopLoops:!1}}function S(){t.value=!0,s.value=null,w(),R(),b(),x()}let I=null,D=null,H=null;function F(M){if(M.payload&&M.payload.tool_name){const W={...M.payload,_isNew:!0,_key:++d};n.value.unshift(W),n.value.length>10&&n.value.pop(),o.value++,W.error&&(i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return $e(async()=>{await Promise.all([w(),R(),b(),x(),v()]),I=setInterval(w,15e3),D=setInterval(x,1e4),Ke.subscribe("events",F)}),ft(()=>{I&&clearInterval(I),D&&clearInterval(D),clearTimeout(H),Ke.unsubscribe("events",F)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:m,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:R,fetchStatus:w,formatTime:Cc,formatDuration:Ca,retry:S,reloadConfig:E,clearSessions:N,stopAllLoops:O}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function wd(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function F_(e){if(Array.isArray(e))return e}function $_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function U_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function B_(e,t){return F_(e)||$_(e,t)||H_(e,t)||U_()}function H_(e,t){if(e){if(typeof e=="string")return wd(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?wd(e,t):void 0}}const tg=Object.entries,Sd=Object.setPrototypeOf,V_=Object.isFrozen,j_=Object.getPrototypeOf,z_=Object.getOwnPropertyDescriptor;let qt=Object.freeze,hs=Object.seal,na=Object.create,sg=typeof Reflect<"u"&&Reflect,xo=sg.apply,_o=sg.construct;qt||(qt=function(t){return t});hs||(hs=function(t){return t});xo||(xo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});_o||(_o=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Ps=vt(Array.prototype.forEach),K_=vt(Array.prototype.lastIndexOf),Td=vt(Array.prototype.pop),Qn=vt(Array.prototype.push),q_=vt(Array.prototype.splice),Ht=Array.isArray,Ga=vt(String.prototype.toLowerCase),Or=vt(String.prototype.toString),Cd=vt(String.prototype.match),Xn=vt(String.prototype.replace),Ed=vt(String.prototype.indexOf),G_=vt(String.prototype.trim),W_=vt(Number.prototype.toString),Z_=vt(Boolean.prototype.toString),Ad=typeof BigInt>"u"?null:vt(BigInt.prototype.toString),Rd=typeof Symbol>"u"?null:vt(Symbol.prototype.toString),lt=vt(Object.prototype.hasOwnProperty),Ba=vt(Object.prototype.toString),Et=vt(RegExp.prototype.test),Sn=J_(TypeError);function vt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return xo(e,t,n)}}function J_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return _o(e,s)}}function Re(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ga;if(Sd&&Sd(e,null),!Ht(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(V_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Y_(e){for(let t=0;t<e.length;t++)lt(e,t)||(e[t]=null);return e}function Dt(e){const t=na(null);for(const n of tg(e)){var s=B_(n,2);const a=s[0],i=s[1];lt(e,a)&&(Ht(i)?t[a]=Y_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Dt(i):t[a]=i)}return t}function Q_(e){switch(typeof e){case"string":return e;case"number":return W_(e);case"boolean":return Z_(e);case"bigint":return Ad?Ad(e):"0";case"symbol":return Rd?Rd(e):"Symbol()";case"undefined":return Ba(e);case"function":case"object":{if(e===null)return Ba(e);const t=e,s=Ss(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Ba(n)}return Ba(e)}default:return Ba(e)}}function Ss(e,t){for(;e!==null;){const n=z_(e,t);if(n){if(n.get)return vt(n.get);if(typeof n.value=="function")return vt(n.value)}e=j_(e)}function s(){return null}return s}function X_(e){try{return Et(e,""),!0}catch{return!1}}const Id=qt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Dr=qt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Mr=qt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),ek=qt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Pr=qt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tk=qt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Nd=qt(["#text"]),Ld=qt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Fr=qt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Od=qt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Ji=qt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sk=hs(/{{[\w\W]*|^[\w\W]*}}/g),nk=hs(/<%[\w\W]*|^[\w\W]*%>/g),ak=hs(/\${[\w\W]*/g),ik=hs(/^data-[\-\w.\u00B7-\uFFFF]+$/),lk=hs(/^aria-[\-\w]+$/),Dd=hs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),rk=hs(/^(?:\w+script|data):/i),ok=hs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),ck=hs(/^html$/i),uk=hs(/^[a-z][.\w]*(-[.\w]+)+$/i),ks={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},dk=function(){return typeof window>"u"?null:window},fk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Md=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function ng(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:dk();const t=ge=>ng(ge);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==ks.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=Ss(f,"cloneNode"),m=Ss(f,"remove"),g=Ss(f,"nextSibling"),w=Ss(f,"childNodes"),R=Ss(f,"parentNode"),b=Ss(f,"shadowRoot"),v=Ss(f,"attributes"),x=l&&l.prototype?Ss(l.prototype,"nodeType"):null,E=l&&l.prototype?Ss(l.prototype,"nodeName"):null;if(typeof i=="function"){const ge=s.createElement("template");ge.content&&ge.content.ownerDocument&&(s=ge.content.ownerDocument)}let N,O="",S,I=!1,D=0;const H=function(){if(D>0)throw Sn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},F=function(_){H(),D++;try{return N.createHTML(_)}finally{D--}},M=function(_){H(),D++;try{return N.createScriptURL(_)}finally{D--}},W=function(){return I||(S=fk(d,a),I=!0),S},B=s,j=B.implementation,L=B.createNodeIterator,k=B.createDocumentFragment,$=B.getElementsByTagName,oe=n.importNode;let re=Md();t.isSupported=typeof tg=="function"&&typeof R=="function"&&j&&j.createHTMLDocument!==void 0;const se=sk,fe=nk,J=ak,ue=ik,Ie=lk,z=rk,ce=ok,le=uk;let me=Dd,ve=null;const Le=Re({},[...Id,...Dr,...Mr,...Pr,...Nd]);let y=null;const T=Re({},[...Ld,...Fr,...Od,...Ji]);let P=Object.seal(na(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),G=null,A=null;const U=Object.seal(na(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Z=!0,X=!0,te=!1,Y=!0,he=!1,ie=!0,de=!1,ye=!1,we=!1,Ee=!1,C=!1,Q=!1,be=!0,De=!1;const Je="user-content-";let We=!0,Ct=!1,st={},Ye=null;const sn=Re({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let xn=null;const Oi=Re({},["audio","video","img","source","image","track"]);let Na=null;const Di=Re({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Kn="http://www.w3.org/1998/Math/MathML",qn="http://www.w3.org/2000/svg",Lt="http://www.w3.org/1999/xhtml";let gs=Lt,nn=!1,La=null;const Mi=Re({},[Kn,qn,Lt],Or);let V=Re({},["mi","mo","mn","ms","mtext"]),ne=Re({},["annotation-xml"]);const Se=Re({},["title","style","font","a","script"]);let je=null;const it=["application/xhtml+xml","text/html"],Gt="text/html";let nt=null,Gn=null;const vg=s.createElement("form"),Fc=function(_){return _ instanceof RegExp||_ instanceof Function},dr=function(){let _=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Gn&&Gn===_)return;(!_||typeof _!="object")&&(_={}),_=Dt(_),je=it.indexOf(_.PARSER_MEDIA_TYPE)===-1?Gt:_.PARSER_MEDIA_TYPE,nt=je==="application/xhtml+xml"?Or:Ga,ve=lt(_,"ALLOWED_TAGS")&&Ht(_.ALLOWED_TAGS)?Re({},_.ALLOWED_TAGS,nt):Le,y=lt(_,"ALLOWED_ATTR")&&Ht(_.ALLOWED_ATTR)?Re({},_.ALLOWED_ATTR,nt):T,La=lt(_,"ALLOWED_NAMESPACES")&&Ht(_.ALLOWED_NAMESPACES)?Re({},_.ALLOWED_NAMESPACES,Or):Mi,Na=lt(_,"ADD_URI_SAFE_ATTR")&&Ht(_.ADD_URI_SAFE_ATTR)?Re(Dt(Di),_.ADD_URI_SAFE_ATTR,nt):Di,xn=lt(_,"ADD_DATA_URI_TAGS")&&Ht(_.ADD_DATA_URI_TAGS)?Re(Dt(Oi),_.ADD_DATA_URI_TAGS,nt):Oi,Ye=lt(_,"FORBID_CONTENTS")&&Ht(_.FORBID_CONTENTS)?Re({},_.FORBID_CONTENTS,nt):sn,G=lt(_,"FORBID_TAGS")&&Ht(_.FORBID_TAGS)?Re({},_.FORBID_TAGS,nt):Dt({}),A=lt(_,"FORBID_ATTR")&&Ht(_.FORBID_ATTR)?Re({},_.FORBID_ATTR,nt):Dt({}),st=lt(_,"USE_PROFILES")?_.USE_PROFILES&&typeof _.USE_PROFILES=="object"?Dt(_.USE_PROFILES):_.USE_PROFILES:!1,Z=_.ALLOW_ARIA_ATTR!==!1,X=_.ALLOW_DATA_ATTR!==!1,te=_.ALLOW_UNKNOWN_PROTOCOLS||!1,Y=_.ALLOW_SELF_CLOSE_IN_ATTR!==!1,he=_.SAFE_FOR_TEMPLATES||!1,ie=_.SAFE_FOR_XML!==!1,de=_.WHOLE_DOCUMENT||!1,Ee=_.RETURN_DOM||!1,C=_.RETURN_DOM_FRAGMENT||!1,Q=_.RETURN_TRUSTED_TYPE||!1,we=_.FORCE_BODY||!1,be=_.SANITIZE_DOM!==!1,De=_.SANITIZE_NAMED_PROPS||!1,We=_.KEEP_CONTENT!==!1,Ct=_.IN_PLACE||!1,me=X_(_.ALLOWED_URI_REGEXP)?_.ALLOWED_URI_REGEXP:Dd,gs=typeof _.NAMESPACE=="string"?_.NAMESPACE:Lt,V=lt(_,"MATHML_TEXT_INTEGRATION_POINTS")&&_.MATHML_TEXT_INTEGRATION_POINTS&&typeof _.MATHML_TEXT_INTEGRATION_POINTS=="object"?Dt(_.MATHML_TEXT_INTEGRATION_POINTS):Re({},["mi","mo","mn","ms","mtext"]),ne=lt(_,"HTML_INTEGRATION_POINTS")&&_.HTML_INTEGRATION_POINTS&&typeof _.HTML_INTEGRATION_POINTS=="object"?Dt(_.HTML_INTEGRATION_POINTS):Re({},["annotation-xml"]);const K=lt(_,"CUSTOM_ELEMENT_HANDLING")&&_.CUSTOM_ELEMENT_HANDLING&&typeof _.CUSTOM_ELEMENT_HANDLING=="object"?Dt(_.CUSTOM_ELEMENT_HANDLING):na(null);if(P=na(null),lt(K,"tagNameCheck")&&Fc(K.tagNameCheck)&&(P.tagNameCheck=K.tagNameCheck),lt(K,"attributeNameCheck")&&Fc(K.attributeNameCheck)&&(P.attributeNameCheck=K.attributeNameCheck),lt(K,"allowCustomizedBuiltInElements")&&typeof K.allowCustomizedBuiltInElements=="boolean"&&(P.allowCustomizedBuiltInElements=K.allowCustomizedBuiltInElements),he&&(X=!1),C&&(Ee=!0),st&&(ve=Re({},Nd),y=na(null),st.html===!0&&(Re(ve,Id),Re(y,Ld)),st.svg===!0&&(Re(ve,Dr),Re(y,Fr),Re(y,Ji)),st.svgFilters===!0&&(Re(ve,Mr),Re(y,Fr),Re(y,Ji)),st.mathMl===!0&&(Re(ve,Pr),Re(y,Od),Re(y,Ji))),U.tagCheck=null,U.attributeCheck=null,lt(_,"ADD_TAGS")&&(typeof _.ADD_TAGS=="function"?U.tagCheck=_.ADD_TAGS:Ht(_.ADD_TAGS)&&(ve===Le&&(ve=Dt(ve)),Re(ve,_.ADD_TAGS,nt))),lt(_,"ADD_ATTR")&&(typeof _.ADD_ATTR=="function"?U.attributeCheck=_.ADD_ATTR:Ht(_.ADD_ATTR)&&(y===T&&(y=Dt(y)),Re(y,_.ADD_ATTR,nt))),lt(_,"ADD_URI_SAFE_ATTR")&&Ht(_.ADD_URI_SAFE_ATTR)&&Re(Na,_.ADD_URI_SAFE_ATTR,nt),lt(_,"FORBID_CONTENTS")&&Ht(_.FORBID_CONTENTS)&&(Ye===sn&&(Ye=Dt(Ye)),Re(Ye,_.FORBID_CONTENTS,nt)),lt(_,"ADD_FORBID_CONTENTS")&&Ht(_.ADD_FORBID_CONTENTS)&&(Ye===sn&&(Ye=Dt(Ye)),Re(Ye,_.ADD_FORBID_CONTENTS,nt)),We&&(ve["#text"]=!0),de&&Re(ve,["html","head","body"]),ve.table&&(Re(ve,["tbody"]),delete G.tbody),_.TRUSTED_TYPES_POLICY){if(typeof _.TRUSTED_TYPES_POLICY.createHTML!="function")throw Sn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof _.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Sn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=N;N=_.TRUSTED_TYPES_POLICY;try{O=F("")}catch(ke){throw N=ae,ke}}else _.TRUSTED_TYPES_POLICY===null?(N=void 0,O=""):(N===void 0&&(N=W()),N&&typeof O=="string"&&(O=F("")));(re.uponSanitizeElement.length>0||re.uponSanitizeAttribute.length>0)&&ve===Le&&(ve=Dt(ve)),re.uponSanitizeAttribute.length>0&&y===T&&(y=Dt(y)),qt&&qt(_),Gn=_},$c=Re({},[...Dr,...Mr,...ek]),Uc=Re({},[...Pr,...tk]),bg=function(_){let K=R(_);(!K||!K.tagName)&&(K={namespaceURI:gs,tagName:"template"});const ae=Ga(_.tagName),ke=Ga(K.tagName);return La[_.namespaceURI]?_.namespaceURI===qn?K.namespaceURI===Lt?ae==="svg":K.namespaceURI===Kn?ae==="svg"&&(ke==="annotation-xml"||V[ke]):!!$c[ae]:_.namespaceURI===Kn?K.namespaceURI===Lt?ae==="math":K.namespaceURI===qn?ae==="math"&&ne[ke]:!!Uc[ae]:_.namespaceURI===Lt?K.namespaceURI===qn&&!ne[ke]||K.namespaceURI===Kn&&!V[ke]?!1:!Uc[ae]&&(Se[ae]||!$c[ae]):!!(je==="application/xhtml+xml"&&La[_.namespaceURI]):!1},ms=function(_){Qn(t.removed,{element:_});try{R(_).removeChild(_)}catch{if(m(_),!R(_))throw Sn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Bc=function(_){const K=w?w(_):_.childNodes;if(K){const ke=[];Ps(K,Ce=>{Qn(ke,Ce)}),Ps(ke,Ce=>{try{m(Ce)}catch{}})}const ae=v?v(_):null;if(ae)for(let ke=ae.length-1;ke>=0;--ke){const Ce=ae[ke],Ne=Ce&&Ce.name;if(typeof Ne=="string")try{_.removeAttribute(Ne)}catch{}}},_n=function(_,K){try{Qn(t.removed,{attribute:K.getAttributeNode(_),from:K})}catch{Qn(t.removed,{attribute:null,from:K})}if(K.removeAttribute(_),_==="is")if(Ee||C)try{ms(K)}catch{}else try{K.setAttribute(_,"")}catch{}},yg=function(_){const K=v?v(_):_.attributes;if(K)for(let ae=K.length-1;ae>=0;--ae){const ke=K[ae],Ce=ke&&ke.name;if(!(typeof Ce!="string"||y[nt(Ce)]))try{_.removeAttribute(Ce)}catch{}}},xg=function(_){const K=[_];for(;K.length>0;){const ae=K.pop();(x?x(ae):ae.nodeType)===ks.element&&yg(ae);const Ce=w?w(ae):ae.childNodes;if(Ce)for(let Ne=Ce.length-1;Ne>=0;--Ne)K.push(Ce[Ne])}},Hc=function(_){let K=null,ae=null;if(we)_="<remove></remove>"+_;else{const Ne=Cd(_,/^[\r\n\t ]+/);ae=Ne&&Ne[0]}je==="application/xhtml+xml"&&gs===Lt&&(_='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+_+"</body></html>");const ke=N?F(_):_;if(gs===Lt)try{K=new u().parseFromString(ke,je)}catch{}if(!K||!K.documentElement){K=j.createDocument(gs,"template",null);try{K.documentElement.innerHTML=nn?O:ke}catch{}}const Ce=K.body||K.documentElement;return _&&ae&&Ce.insertBefore(s.createTextNode(ae),Ce.childNodes[0]||null),gs===Lt?$.call(K,de?"html":"body")[0]:de?K.documentElement:Ce},Vc=function(_){return L.call(_.ownerDocument||_,_,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},fr=function(_){var K,ae;_.normalize();const ke=L.call(_.ownerDocument||_,_,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Ce=ke.nextNode();for(;Ce;){let bt=Ce.data;Ps([se,fe,J],Qe=>{bt=Xn(bt,Qe," ")}),Ce.data=bt,Ce=ke.nextNode()}const Ne=(K=(ae=_.querySelectorAll)===null||ae===void 0?void 0:ae.call(_,"template"))!==null&&K!==void 0?K:[];Ps(Array.from(Ne),bt=>{Wn(bt.content)&&fr(bt.content)})},Pi=function(_){const K=E?E(_):null;return typeof K!="string"||nt(K)!=="form"?!1:typeof _.nodeName!="string"||typeof _.textContent!="string"||typeof _.removeChild!="function"||_.attributes!==v(_)||typeof _.removeAttribute!="function"||typeof _.setAttribute!="function"||typeof _.namespaceURI!="string"||typeof _.insertBefore!="function"||typeof _.hasChildNodes!="function"||_.nodeType!==x(_)||_.childNodes!==w(_)},Wn=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return x(_)===ks.documentFragment}catch{return!1}},Oa=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return typeof x(_)=="number"}catch{return!1}};function Ls(ge,_,K){Ps(ge,ae=>{ae.call(t,_,K,Gn)})}const jc=function(_){let K=null;if(Ls(re.beforeSanitizeElements,_,null),Pi(_))return ms(_),!0;const ae=nt(E?E(_):_.nodeName);if(Ls(re.uponSanitizeElement,_,{tagName:ae,allowedTags:ve}),ie&&_.hasChildNodes()&&!Oa(_.firstElementChild)&&Et(/<[/\w!]/g,_.innerHTML)&&Et(/<[/\w!]/g,_.textContent)||ie&&_.namespaceURI===Lt&&ae==="style"&&Oa(_.firstElementChild)||_.nodeType===ks.progressingInstruction||ie&&_.nodeType===ks.comment&&Et(/<[/\w]/g,_.data))return ms(_),!0;if(G[ae]||!(U.tagCheck instanceof Function&&U.tagCheck(ae))&&!ve[ae]){if(!G[ae]&&Kc(ae)&&(P.tagNameCheck instanceof RegExp&&Et(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae)))return!1;if(We&&!Ye[ae]){const Ce=R(_),Ne=w(_);if(Ne&&Ce){const bt=Ne.length;for(let Qe=bt-1;Qe>=0;--Qe){const ct=Ct?Ne[Qe]:p(Ne[Qe],!0);Ce.insertBefore(ct,g(_))}}}return ms(_),!0}return(x?x(_):_.nodeType)===ks.element&&!bg(_)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&Et(/<\/no(script|embed|frames)/i,_.innerHTML)?(ms(_),!0):(he&&_.nodeType===ks.text&&(K=_.textContent,Ps([se,fe,J],Ce=>{K=Xn(K,Ce," ")}),_.textContent!==K&&(Qn(t.removed,{element:_.cloneNode()}),_.textContent=K)),Ls(re.afterSanitizeElements,_,null),!1)},zc=function(_,K,ae){if(A[K]||be&&(K==="id"||K==="name")&&(ae in s||ae in vg))return!1;const ke=y[K]||U.attributeCheck instanceof Function&&U.attributeCheck(K,_);if(!(X&&!A[K]&&Et(ue,K))){if(!(Z&&Et(Ie,K))){if(!ke||A[K]){if(!(Kc(_)&&(P.tagNameCheck instanceof RegExp&&Et(P.tagNameCheck,_)||P.tagNameCheck instanceof Function&&P.tagNameCheck(_))&&(P.attributeNameCheck instanceof RegExp&&Et(P.attributeNameCheck,K)||P.attributeNameCheck instanceof Function&&P.attributeNameCheck(K,_))||K==="is"&&P.allowCustomizedBuiltInElements&&(P.tagNameCheck instanceof RegExp&&Et(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae))))return!1}else if(!Na[K]){if(!Et(me,Xn(ae,ce,""))){if(!((K==="src"||K==="xlink:href"||K==="href")&&_!=="script"&&Ed(ae,"data:")===0&&xn[_])){if(!(te&&!Et(z,Xn(ae,ce,"")))){if(ae)return!1}}}}}}return!0},_g=Re({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Kc=function(_){return!_g[Ga(_)]&&Et(le,_)},qc=function(_){Ls(re.beforeSanitizeAttributes,_,null);const K=_.attributes;if(!K||Pi(_))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let ke=K.length;for(;ke--;){const Ce=K[ke],Ne=Ce.name,bt=Ce.namespaceURI,Qe=Ce.value,ct=nt(Ne),an=Qe;let kt=Ne==="value"?an:G_(an);if(ae.attrName=ct,ae.attrValue=kt,ae.keepAttr=!0,ae.forceKeepAttr=void 0,Ls(re.uponSanitizeAttribute,_,ae),kt=ae.attrValue,De&&(ct==="id"||ct==="name")&&Ed(kt,Je)!==0&&(_n(Ne,_),kt=Je+kt),ie&&Et(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,kt)){_n(Ne,_);continue}if(ct==="attributename"&&Cd(kt,"href")){_n(Ne,_);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){_n(Ne,_);continue}if(!Y&&Et(/\/>/i,kt)){_n(Ne,_);continue}he&&Ps([se,fe,J],Wc=>{kt=Xn(kt,Wc," ")});const Gc=nt(_.nodeName);if(!zc(Gc,ct,kt)){_n(Ne,_);continue}if(N&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!bt)switch(d.getAttributeType(Gc,ct)){case"TrustedHTML":{kt=F(kt);break}case"TrustedScriptURL":{kt=M(kt);break}}if(kt!==an)try{bt?_.setAttributeNS(bt,Ne,kt):_.setAttribute(Ne,kt),Pi(_)?ms(_):Td(t.removed)}catch{_n(Ne,_)}}Ls(re.afterSanitizeAttributes,_,null)},Fi=function(_){let K=null;const ae=Vc(_);for(Ls(re.beforeSanitizeShadowDOM,_,null);K=ae.nextNode();)if(Ls(re.uponSanitizeShadowNode,K,null),jc(K),qc(K),Wn(K.content)&&Fi(K.content),(x?x(K):K.nodeType)===ks.element){const Ce=b?b(K):K.shadowRoot;Wn(Ce)&&(pr(Ce),Fi(Ce))}Ls(re.afterSanitizeShadowDOM,_,null)},pr=function(_){const K=[{node:_,shadow:null}];for(;K.length>0;){const ae=K.pop();if(ae.shadow){Fi(ae.shadow);continue}const ke=ae.node,Ne=(x?x(ke):ke.nodeType)===ks.element,bt=w?w(ke):ke.childNodes;if(bt)for(let Qe=bt.length-1;Qe>=0;--Qe)K.push({node:bt[Qe],shadow:null});if(Ne){const Qe=E?E(ke):null;if(typeof Qe=="string"&&nt(Qe)==="template"){const ct=ke.content;Wn(ct)&&K.push({node:ct,shadow:null})}}if(Ne){const Qe=b?b(ke):ke.shadowRoot;Wn(Qe)&&K.push({node:null,shadow:Qe},{node:Qe,shadow:null})}}};return t.sanitize=function(ge){let _=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},K=null,ae=null,ke=null,Ce=null;if(nn=!ge,nn&&(ge="<!-->"),typeof ge!="string"&&!Oa(ge)&&(ge=Q_(ge),typeof ge!="string"))throw Sn("dirty is not a string, aborting");if(!t.isSupported)return ge;ye||dr(_),t.removed=[];const Ne=Ct&&typeof ge!="string"&&Oa(ge);if(Ne){const ct=E?E(ge):ge.nodeName;if(typeof ct=="string"){const an=nt(ct);if(!ve[an]||G[an])throw Sn("root node is forbidden and cannot be sanitized in-place")}if(Pi(ge))throw Sn("root node is clobbered and cannot be sanitized in-place");try{pr(ge)}catch(an){throw Bc(ge),an}}else if(Oa(ge))K=Hc("<!---->"),ae=K.ownerDocument.importNode(ge,!0),ae.nodeType===ks.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?K=ae:K.appendChild(ae),pr(ae);else{if(!Ee&&!he&&!de&&ge.indexOf("<")===-1)return N&&Q?F(ge):ge;if(K=Hc(ge),!K)return Ee?null:Q?O:""}K&&we&&ms(K.firstChild);const bt=Vc(Ne?ge:K);try{for(;ke=bt.nextNode();)jc(ke),qc(ke),Wn(ke.content)&&Fi(ke.content)}catch(ct){throw Ne&&Bc(ge),ct}if(Ne)return Ps(t.removed,ct=>{ct.element&&xg(ct.element)}),he&&fr(ge),ge;if(Ee){if(he&&fr(K),C)for(Ce=k.call(K.ownerDocument);K.firstChild;)Ce.appendChild(K.firstChild);else Ce=K;return(y.shadowroot||y.shadowrootmode)&&(Ce=oe.call(n,Ce,!0)),Ce}let Qe=de?K.outerHTML:K.innerHTML;return de&&ve["!doctype"]&&K.ownerDocument&&K.ownerDocument.doctype&&K.ownerDocument.doctype.name&&Et(ck,K.ownerDocument.doctype.name)&&(Qe="<!DOCTYPE "+K.ownerDocument.doctype.name+`>
`+Qe),he&&Ps([se,fe,J],ct=>{Qe=Xn(Qe,ct," ")}),N&&Q?F(Qe):Qe},t.setConfig=function(){let ge=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};dr(ge),ye=!0},t.clearConfig=function(){Gn=null,ye=!1,N=S,O=""},t.isValidAttribute=function(ge,_,K){Gn||dr({});const ae=nt(ge),ke=nt(_);return zc(ae,ke,K)},t.addHook=function(ge,_){typeof _=="function"&&Qn(re[ge],_)},t.removeHook=function(ge,_){if(_!==void 0){const K=K_(re[ge],_);return K===-1?void 0:q_(re[ge],K,1)[0]}return Td(re[ge])},t.removeHooks=function(ge){re[ge]=[]},t.removeAllHooks=function(){re=Md()},t}var Pd=ng();function Ac(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var zn=Ac();function ag(e){zn=e}var si={exec:()=>null};function qe(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(zt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var zt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},pk=/^(?:[ \t]*(?:\n|$))+/,hk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,gk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Li=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,mk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Rc=/(?:[*+-]|\d{1,9}[.)])/,ig=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,lg=qe(ig).replace(/bull/g,Rc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),vk=qe(ig).replace(/bull/g,Rc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Ic=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bk=/^[^\n]+/,Nc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yk=qe(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Nc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xk=qe(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Rc).getRegex(),or="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Lc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_k=qe("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Lc).replace("tag",or).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),rg=qe(Ic).replace("hr",Li).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",or).getRegex(),kk=qe(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",rg).getRegex(),Oc={blockquote:kk,code:hk,def:yk,fences:gk,heading:mk,hr:Li,html:_k,lheading:lg,list:xk,newline:pk,paragraph:rg,table:si,text:bk},Fd=qe("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Li).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",or).getRegex(),wk={...Oc,lheading:vk,table:Fd,paragraph:qe(Ic).replace("hr",Li).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Fd).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",or).getRegex()},Sk={...Oc,html:qe(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Lc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:si,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:qe(Ic).replace("hr",Li).replace("heading",` *#{1,6} *[^
]`).replace("lheading",lg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Tk=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Ck=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,og=/^( {2,}|\\)\n(?!\s*$)/,Ek=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,cr=/[\p{P}\p{S}]/u,Dc=/[\s\p{P}\p{S}]/u,cg=/[^\s\p{P}\p{S}]/u,Ak=qe(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Dc).getRegex(),ug=/(?!~)[\p{P}\p{S}]/u,Rk=/(?!~)[\s\p{P}\p{S}]/u,Ik=/(?:[^\s\p{P}\p{S}]|~)/u,Nk=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,dg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Lk=qe(dg,"u").replace(/punct/g,cr).getRegex(),Ok=qe(dg,"u").replace(/punct/g,ug).getRegex(),fg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Dk=qe(fg,"gu").replace(/notPunctSpace/g,cg).replace(/punctSpace/g,Dc).replace(/punct/g,cr).getRegex(),Mk=qe(fg,"gu").replace(/notPunctSpace/g,Ik).replace(/punctSpace/g,Rk).replace(/punct/g,ug).getRegex(),Pk=qe("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,cg).replace(/punctSpace/g,Dc).replace(/punct/g,cr).getRegex(),Fk=qe(/\\(punct)/,"gu").replace(/punct/g,cr).getRegex(),$k=qe(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Uk=qe(Lc).replace("(?:-->|$)","-->").getRegex(),Bk=qe("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Uk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Ol=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Hk=qe(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Ol).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),pg=qe(/^!?\[(label)\]\[(ref)\]/).replace("label",Ol).replace("ref",Nc).getRegex(),hg=qe(/^!?\[(ref)\](?:\[\])?/).replace("ref",Nc).getRegex(),Vk=qe("reflink|nolink(?!\\()","g").replace("reflink",pg).replace("nolink",hg).getRegex(),Mc={_backpedal:si,anyPunctuation:Fk,autolink:$k,blockSkip:Nk,br:og,code:Ck,del:si,emStrongLDelim:Lk,emStrongRDelimAst:Dk,emStrongRDelimUnd:Pk,escape:Tk,link:Hk,nolink:hg,punctuation:Ak,reflink:pg,reflinkSearch:Vk,tag:Bk,text:Ek,url:si},jk={...Mc,link:qe(/^!?\[(label)\]\((.*?)\)/).replace("label",Ol).getRegex(),reflink:qe(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Ol).getRegex()},ko={...Mc,emStrongRDelimAst:Mk,emStrongLDelim:Ok,url:qe(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},zk={...ko,br:qe(og).replace("{2,}","*").getRegex(),text:qe(ko.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Yi={normal:Oc,gfm:wk,pedantic:Sk},Ha={normal:Mc,gfm:ko,breaks:zk,pedantic:jk},Kk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},$d=e=>Kk[e];function Ts(e,t){if(t){if(zt.escapeTest.test(e))return e.replace(zt.escapeReplace,$d)}else if(zt.escapeTestNoEncode.test(e))return e.replace(zt.escapeReplaceNoEncode,$d);return e}function Ud(e){try{e=encodeURI(e).replace(zt.percentDecode,"%")}catch{return null}return e}function Bd(e,t){var i;const s=e.replace(zt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(zt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(zt.slashPipe,"|");return n}function Va(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function qk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Hd(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function Gk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Dl=class{constructor(e){Ze(this,"options");Ze(this,"rules");Ze(this,"lexer");this.options=e||zn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Va(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=Gk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Va(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Va(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Va(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,R=>" ".repeat(3*R.length)),f=e.split(`
`,1)[0],p=!d.trim(),m=0;if(this.options.pedantic?(m=2,u=d.trimStart()):p?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,u=d.slice(m),m+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const R=this.rules.other.nextBulletRegex(m),b=this.rules.other.hrRegex(m),v=this.rules.other.fencesBeginRegex(m),x=this.rules.other.headingBeginRegex(m),E=this.rules.other.htmlBeginRegex(m);for(;e;){const N=e.split(`
`,1)[0];let O;if(f=N,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),O=f):O=f.replace(this.rules.other.tabCharGlobal,"    "),v.test(f)||x.test(f)||E.test(f)||R.test(f)||b.test(f))break;if(O.search(this.rules.other.nonSpaceChar)>=m||!f.trim())u+=`
`+O.slice(m);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(d)||x.test(d)||b.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=N+`
`,e=e.substring(N.length+1),d=O.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,w;this.options.gfm&&(g=this.rules.other.listIsTask.exec(u),g&&(w=g[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:w,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Bd(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Bd(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Va(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=qk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Hd(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Hd(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const m=f.slice(1,-1);return{type:"em",raw:f,text:m,tokens:this.lexer.inlineTokens(m)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},zs=class wo{constructor(t){Ze(this,"tokens");Ze(this,"options");Ze(this,"state");Ze(this,"tokenizer");Ze(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||zn,this.options.tokenizer=this.options.tokenizer||new Dl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:zt,block:Yi.normal,inline:Ha.normal};this.options.pedantic?(s.block=Yi.pedantic,s.inline=Ha.pedantic):this.options.gfm&&(s.block=Yi.gfm,this.options.breaks?s.inline=Ha.breaks:s.inline=Ha.gfm),this.tokenizer.rules=s}static get rules(){return{block:Yi,inline:Ha}}static lex(t,s){return new wo(s).lex(t)}static lexInline(t,s){return new wo(s).inlineTokens(t)}lex(t){t=t.replace(zt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(zt.tabCharGlobal,"    ").replace(zt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const u=t.slice(1);let d;this.options.extensions.startBlock.forEach(f=>{d=f.call({lexer:this},u),typeof d=="number"&&d>=0&&(c=Math.min(c,d))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const u=Object.keys(this.tokens.links);if(u.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)u.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let u;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(u=f.call({lexer:this},t,s))?(t=t.substring(u.raw.length),s.push(u),!0):!1))continue;if(u=this.tokenizer.escape(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.tag(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.link(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(u.raw.length);const f=s.at(-1);u.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(u=this.tokenizer.emStrong(t,n,l)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.codespan(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.br(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.del(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.autolink(t)){t=t.substring(u.raw.length),s.push(u);continue}if(!this.state.inLink&&(u=this.tokenizer.url(t))){t=t.substring(u.raw.length),s.push(u);continue}let d=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let m;this.options.extensions.startInline.forEach(g=>{m=g.call({lexer:this},p),typeof m=="number"&&m>=0&&(f=Math.min(f,m))}),f<1/0&&f>=0&&(d=t.substring(0,f+1))}if(u=this.tokenizer.inlineText(d)){t=t.substring(u.raw.length),u.raw.slice(-1)!=="_"&&(l=u.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Ml=class{constructor(e){Ze(this,"options");Ze(this,"parser");this.options=e||zn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(zt.notSpaceStart))==null?void 0:i[0],a=e.replace(zt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Ts(n)+'">'+(s?a:Ts(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Ts(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Ts(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Ts(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Ud(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Ts(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Ud(e);if(a===null)return Ts(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Ts(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Ts(e.text)}},Pc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ks=class So{constructor(t){Ze(this,"options");Ze(this,"renderer");Ze(this,"textRenderer");this.options=t||zn,this.options.renderer=this.options.renderer||new Ml,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Pc}static parse(t,s){return new So(s).parse(t)}static parseInline(t,s){return new So(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Vr,il=(Vr=class{constructor(e){Ze(this,"options");Ze(this,"block");this.options=e||zn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?zs.lex:zs.lexInline}provideParser(){return this.block?Ks.parse:Ks.parseInline}},Ze(Vr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Vr),Wk=class{constructor(...e){Ze(this,"defaults",Ac());Ze(this,"options",this.setOptions);Ze(this,"parse",this.parseMarkdown(!0));Ze(this,"parseInline",this.parseMarkdown(!1));Ze(this,"Parser",Ks);Ze(this,"Renderer",Ml);Ze(this,"TextRenderer",Pc);Ze(this,"Lexer",zs);Ze(this,"Tokenizer",Dl);Ze(this,"Hooks",il);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Ml(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Dl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new il;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];il.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return zs.lex(e,t??this.defaults)}parser(e,t){return Ks.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?zs.lex:zs.lexInline,o=i.hooks?i.hooks.provideParser():e?Ks.parse:Ks.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Ts(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Un=new Wk;function Ve(e,t){return Un.parse(e,t)}Ve.options=Ve.setOptions=function(e){return Un.setOptions(e),Ve.defaults=Un.defaults,ag(Ve.defaults),Ve};Ve.getDefaults=Ac;Ve.defaults=zn;Ve.use=function(...e){return Un.use(...e),Ve.defaults=Un.defaults,ag(Ve.defaults),Ve};Ve.walkTokens=function(e,t){return Un.walkTokens(e,t)};Ve.parseInline=Un.parseInline;Ve.Parser=Ks;Ve.parser=Ks.parse;Ve.Renderer=Ml;Ve.TextRenderer=Pc;Ve.Lexer=zs;Ve.lexer=zs.lex;Ve.Tokenizer=Dl;Ve.Hooks=il;Ve.parse=Ve;Ve.options;Ve.setOptions;Ve.use;Ve.walkTokens;Ve.parseInline;Ks.parse;zs.lex;const Zk={breaks:!0,gfm:!0};function Vd(e){if(!e)return"";try{if(typeof Ve<"u"&&Ve.parse){const t=Ve.parse(e,Zk);return typeof Pd<"u"?Pd.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Jk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Yk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function Qk(e){return Yk[e]||"wrench"}const Xk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function jd(e){if(!e)return[];const t=e.match(Xk);return t?[...new Set(t)]:[]}const ew={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=ee(()=>t.value.trim().length>0&&!s.value),d=ee(()=>{const B=Ke.state;return B==="connected"?"Connected":B==="reconnecting"?"Reconnecting…":B==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=ee(()=>{const B=Math.floor(i.value/4)%f.length,j=i.value;return j>3?`${f[B]} (${j}s)`:f[0]});function m(){St(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const B=a.value;B.style.height="auto",B.style.height=Math.min(B.scrollHeight,120)+"px"}function w(B,j,L={}){const k={id:++o,role:B,content:j,timestamp:Date.now(),html:B==="bot"?Vd(j):"",tools_used:L.tools_used||[],is_error:L.is_error||!1,images:B==="bot"?jd(j):[],files:L.files||[],_showTools:!1};return e.value.push(k),m(),B==="bot"&&St(()=>R()),k}function R(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(j=>{j.setAttribute("data-copy","true"),j.style.position="relative";const L=document.createElement("button");L.className="chat-code-copy",L.textContent="Copy",L.addEventListener("click",()=>{const k=j.querySelector("code"),$=k?k.textContent:j.textContent;navigator.clipboard.writeText($).then(()=>{L.textContent="Copied!",setTimeout(()=>{L.textContent="Copy"},1500)}).catch(()=>{})}),j.appendChild(L)})}function b(B){if(B===0)return!0;const j=e.value[B-1],L=e.value[B],k=new Date(j.timestamp).toDateString(),$=new Date(L.timestamp).toDateString();return k!==$}function v(B){const j=new Date(B),L=new Date;if(j.toDateString()===L.toDateString())return"Today";const k=new Date(L);return k.setDate(k.getDate()-1),j.toDateString()===k.toDateString()?"Yesterday":j.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function x(B){t.value=B,St(()=>H())}function E(B){window.open(B,"_blank","noopener")}function N(B){B.target.style.display="none"}function O(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function S(){r&&(clearInterval(r),r=null),i.value=0}function I(B){s.value&&(s.value=!1,S(),B.type==="chat_response"?w("bot",B.content,{tools_used:B.tools_used||[],is_error:B.is_error||!1,files:B.files||[]}):B.type==="chat_error"&&w("bot",B.error||"Unknown error",{is_error:!0}),St(()=>{var j;return(j=a.value)==null?void 0:j.focus()}))}async function D(B){try{const j=await q.post("/api/chat",{content:B,channel_id:l.value});w("bot",j.response,{tools_used:j.tools_used||[],is_error:j.is_error||!1,files:j.files||[]})}catch(j){w("bot",j.message||"Failed to send message",{is_error:!0})}}async function H(){const B=t.value.trim();!B||s.value||(w("user",B),t.value="",s.value=!0,O(),a.value&&(a.value.style.height="auto"),Ke.connected?Ke.sendChat(B,{channelId:l.value})?M():(await D(B),s.value=!1,S()):(await D(B),s.value=!1,S()),St(()=>{var j;return(j=a.value)==null?void 0:j.focus()}))}let F=null;ns(s,B=>{B||F&&(clearTimeout(F),F=null)});function M(){F=setTimeout(()=>{s.value&&(s.value=!1,S(),w("bot","Response timed out. Try again.",{is_error:!0}))},12e4)}async function W(){try{if(!l.value){const j=await q.get("/api/auth/session");l.value=j.channel_id||j.user_id||"web-user"}const B=await q.get("/api/sessions/"+encodeURIComponent(l.value));if(B&&B.messages&&B.messages.length>0){for(const j of B.messages){const L=j.role==="user"?"user":"bot";let k=j.content||"";if(L==="user"){const oe=k.match(/^\[.*?\]:\s*/);oe&&(k=k.slice(oe[0].length))}if(!k.trim())continue;const $={id:++o,role:L,content:k,timestamp:j.timestamp?j.timestamp*1e3:Date.now(),html:L==="bot"?Vd(k):"",tools_used:[],is_error:!1,images:L==="bot"?jd(k):[],files:[],_showTools:!1};e.value.push($)}St(()=>{m(),R()})}}catch{}}return $e(()=>{Ke.subscribe("chat",I),W(),St(()=>{var B;return(B=a.value)==null?void 0:B.focus()})}),ft(()=>{Ke.unsubscribe("chat",I),F&&clearTimeout(F),S()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:H,autoResize:g,formatTime:Jk,formatDate:v,showDateSeparator:b,useSuggestion:x,openImage:E,onImageError:N,getToolIcon:Qk}}},ur={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=A_(),s=Yh(),n=ee({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=ee(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=ee(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ns(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var u;return(u=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:u.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},tw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,m;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const g={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(d==="tool_end"){const g=e.value.findIndex(w=>w.tool===u.action&&w.status==="running");if(g>=0){const w=e.value[g];w.status=(p=u.metadata)!=null&&p.error?"error":"success",w.elapsed=((m=u.metadata)==null?void 0:m.elapsed_ms)||Date.now()-w.startTime,w.result=u.detail||"",w.fadingOut=!0,setTimeout(()=>{const R=e.value.indexOf(w);R>=0&&e.value.splice(R,1),t.value.unshift(w),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const g=u.tool_name||"unknown";if(u.finished)delete s.value[g];else{const R=((s.value[g]||"")+(u.chunk||"")).split(`
`);s.value[g]=R.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(u=>{u.status==="running"&&(u.elapsed=c-u.startTime)})}$e(()=>{Ke.on("events",a),i=setInterval(l,500)}),ft(()=>{Ke.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"clock":c==="success"?"success":c==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=null;const r=ee(()=>e.value.filter(R=>R.status==="running").length),o=ee(()=>e.value.filter(R=>R.status==="completed").length),c=ee(()=>e.value.filter(R=>["failed","timeout","killed"].includes(R.status)).length),u=ee(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=ee(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(R=>["failed","timeout","killed"].includes(R.status)):e.value.filter(R=>R.status===i.value));function f(R){return Math.min(100,Math.round(R.iteration_count/30*100))}async function p(R=!1){R=R===!0,R||(t.value=!0);try{const b=await q.get("/api/agents");e.value=Array.isArray(b)?b:[],s.value=null}catch(b){R||(s.value=b.message)}R||(t.value=!1)}async function m(R){const b=e.value.find(x=>x.id===R);if(await is({title:"Kill agent",message:`Kill agent "${(b==null?void 0:b.label)||R}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=R;try{await q.del(`/api/agents/${encodeURIComponent(R)}`),xe.success("Agent killed"),await p()}catch(x){xe.error(x.message||"Failed to kill agent")}n.value=null}}function g(){w(),a.value&&(l=setInterval(()=>{a.value&&p(!0)},5e3))}function w(){l&&(clearInterval(l),l=null)}return $e(()=>{p(),g()}),ft(()=>{w()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:Ia,formatDuration:Ca,progressPercent:f,fetchAgents:p,killAgent:m,startAutoRefresh:g,stopAutoRefresh:w}}},nw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=ee(()=>e.value.reduce((N,O)=>N+(O.iteration_count||0),0)),d=ee(()=>e.value.filter(N=>N.status==="running").length);function f(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function p(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function m(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}function g(N){c.value={...c.value,[N]:!c.value[N]}}async function w(N=!1){N=N===!0,N||(t.value=!0);try{e.value=await q.get("/api/loops"),s.value=null}catch(O){N||(s.value=O.message)}N||(t.value=!1)}async function R(){l.value=null;const N=a.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(O.stop_condition=N.stop_condition.trim()),i.value=!0;try{const S=await q.post("/api/loops",O);xe.success(`Loop started: ${S.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await w()}catch(S){l.value=S.message}i.value=!1}async function b(N){if(await is({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=N;try{await q.del(`/api/loops/${encodeURIComponent(N)}`),xe.success("Loop stopped"),await w()}catch(S){xe.error(S.message||"Failed to stop loop")}r.value=null}}async function v(N){o.value=N;try{await q.post(`/api/loops/${encodeURIComponent(N)}/restart`),xe.success("Loop restarted"),await w()}catch(O){xe.error(O.message||"Failed to restart loop")}o.value=null}function x(N){N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&w(!0)}let E=null;return $e(()=>{w(),Ke.subscribe("events",x),E=setInterval(()=>{w(!0)},5e3)}),ft(()=>{Ke.unsubscribe("events",x),E&&clearInterval(E)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:m,formatDuration:Ca,formatAge:Qh,toggleHistory:g,fetchLoops:w,doCreate:R,doStop:b,doRestart:v}}},aw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=ee(()=>e.value.filter(g=>g.status==="running").length),r=ee(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function u(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await q.get("/api/processes"),s.value=null}catch(w){g||(s.value=w.message)}g||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ns(n,g=>{g?d():f()});async function p(g){if(await is({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await q.del(`/api/processes/${g}`),xe.success(`Process ${g} killed`),await u()}catch(R){xe.error(R.message||"Failed to kill process")}i.value=null}}function m(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&u(!0)}return $e(()=>{u(),Ke.subscribe("events",m),d()}),ft(()=>{Ke.unsubscribe("events",m),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Ca,fetchProcesses:u,doKill:p}}},iw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),m=h(null),g=h([]),w=h(!1),R=ee(()=>e.value.filter(L=>L.cron&&!L.one_time).length),b=ee(()=>e.value.filter(L=>L.one_time).length),v=ee(()=>e.value.filter(L=>L.trigger).length),x=ee(()=>e.value.filter(L=>L.paused).length),E=ee(()=>e.value.filter(L=>L.consecutive_failures>0).length);function N(L){if(!L)return"-";const k=Date.now(),oe=(new Date(L).getTime()-k)/1e3;if(oe<0)return"overdue";if(oe<60)return"in < 1 min";if(oe<3600)return`in ${Math.floor(oe/60)} min`;if(oe<86400){const se=Math.floor(oe/3600),fe=Math.floor(oe%3600/60);return fe>0?`in ${se}h ${fe}m`:`in ${se}h`}const re=Math.floor(oe/86400);return`in ${re} day${re!==1?"s":""}`}function O(L){return L==null?"-":L<1e3?`${L}ms`:L<6e4?`${(L/1e3).toFixed(1)}s`:Ca(L/1e3)}function S(){r.value=null}async function I(){const L=a.value.cron.trim();if(L){o.value=!0;try{r.value=await q.post("/api/schedules/validate-cron",{expression:L})}catch(k){r.value={valid:!1,error:k.message}}o.value=!1}}async function D(){t.value=!0,s.value=null;try{e.value=await q.get("/api/schedules")}catch(L){s.value=L.message}t.value=!1}async function H(L){if(m.value===L){m.value=null,g.value=[];return}m.value=L,w.value=!0,g.value=[];try{g.value=await q.get(`/api/schedules/${encodeURIComponent(L)}/history?limit=10`)}catch{g.value=[]}w.value=!1}async function F(){l.value=null;const L=a.value;if(!L.description.trim()){l.value="Description is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}if(!L.cron.trim()&&!L.run_at.trim()){l.value="Cron expression or run_at time is required";return}const k={description:L.description.trim(),action:L.action,channel_id:L.channel_id.trim()};if(L.cron.trim()&&(k.cron=L.cron.trim()),L.run_at.trim()&&(k.run_at=L.run_at.trim()),L.action==="reminder"&&L.message.trim()&&(k.message=L.message.trim()),L.action==="check"&&(L.tool_name.trim()&&(k.tool_name=L.tool_name.trim()),L.tool_input_str.trim()))try{k.tool_input=JSON.parse(L.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await q.post("/api/schedules",k),xe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await D()}catch($){l.value=$.message}i.value=!1}async function M(L){u.value=L;try{const k=await q.post(`/api/schedules/${encodeURIComponent(L)}/run`);if(k.status==="failure")xe.error(`Execution failed: ${k.error||"unknown error"}`);else{const $=k.warning?`Executed (${k.warning})`:"Executed successfully";xe.success($)}await D()}catch(k){xe.error(k.message||"Failed to trigger")}u.value=null}async function W(L){f.value=L.id;const k=!L.paused;try{await q.put(`/api/schedules/${encodeURIComponent(L.id)}`,{paused:k}),xe.success(k?"Schedule paused":"Schedule resumed"),await D()}catch($){xe.error($.message||"Failed to update schedule")}f.value=null}async function B(L){p.value=L;try{await q.post(`/api/schedules/${encodeURIComponent(L)}/reset-failures`),xe.success("Failure counters reset"),await D()}catch(k){xe.error(k.message||"Failed to reset")}p.value=null}async function j(L){const k=e.value.find(oe=>oe.id===L);if(await is({title:"Delete schedule",message:`Delete "${(k==null?void 0:k.description)||L}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=L;try{await q.del(`/api/schedules/${encodeURIComponent(L)}`),xe.success("Schedule deleted"),await D()}catch(oe){xe.error(oe.message||"Failed to delete schedule")}d.value=null}}return $e(()=>{D()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:m,history:g,historyLoading:w,cronCount:R,oneTimeCount:b,webhookCount:v,pausedCount:x,failingCount:E,formatTs:Ia,formatAge:Qh,formatFuture:N,formatMs:O,formatDuration:Ca,onCronInput:S,validateCron:I,toggleExpand:H,fetchSchedules:D,doCreate:F,doRunNow:M,doTogglePause:W,doResetFailures:B,doDelete:j}}},lw={components:{TabbedPage:ur},setup(){return{tabs:[{id:"live",label:"Live",component:tw},{id:"agents",label:"Agents",component:sw},{id:"loops",label:"Loops",component:nw},{id:"processes",label:"Processes",component:aw},{id:"schedules",label:"Schedules",component:iw}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},rw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await q.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return $e(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Ia,formatDetail:i,truncateBlock:Xh,toggleExpand:l,clearFilters:r,fetchAudit:o}}},zd=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],ow=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),m=zd,g=ow,w=h([]),R=h(!1),b=h(""),v=h("flat"),x=h(new Set),E=h(""),N=h(""),O=h(""),S=h(null),I=h(!1);function D(){try{const C=localStorage.getItem("odin-session-presets");C&&(w.value=JSON.parse(C))}catch{}}function H(){try{localStorage.setItem("odin-session-presets",JSON.stringify(w.value))}catch{}}const F=ee(()=>d.value.trim()!==""||u.value!=="all"),M=ee(()=>{let C=[...e.value];const Q=zd.find(We=>We.id===u.value),be=Q?Q.filters:{};if(be.source&&(C=C.filter(We=>We.source===be.source)),be.minMessages&&(C=C.filter(We=>We.message_count>=be.minMessages)),be.hasCompaction&&(C=C.filter(We=>We.has_summary)),be.maxAge!=null){const We=Date.now()/1e3;C=C.filter(Ct=>Ct.last_active&&We-Ct.last_active<=be.maxAge)}if(d.value.trim()){const We=d.value.toLowerCase().trim();C=C.filter(Ct=>(Ct.channel_id||"").toLowerCase().includes(We)||(Ct.last_user_id||"").toLowerCase().includes(We)||(Ct.source||"").toLowerCase().includes(We))}const De=f.value,Je=p.value?1:-1;return C.sort((We,Ct)=>{const st=We[De]||0,Ye=Ct[De]||0;return(st-Ye)*Je}),C}),W=ee(()=>{if(!a.value||!a.value.messages)return[];const C=a.value.messages;if(C.length===0)return[];const Q=[];let be=[];for(const De of C)De.role==="user"&&be.length>0&&(Q.push(be),be=[]),be.push(De);return be.length>0&&Q.push(be),Q}),B=ee(()=>M.value.length>0&&o.value.size===M.value.length);function j(C){const Q=C.find(be=>be.role==="user");if(Q&&Q.content){const be=Q.content.slice(0,120);return be.length<Q.content.length?be+"...":be}return"(no user message)"}function L(C){const Q=new Set(x.value);Q.has(C)?Q.delete(C):Q.add(C),x.value=Q}function k(C){u.value=C}function $(C){u.value=C.id,C.filters.searchQuery!=null&&(d.value=C.filters.searchQuery),C.filters.sortBy&&(f.value=C.filters.sortBy)}function oe(){if(!b.value.trim())return;const C={id:"custom-"+Date.now(),name:b.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};w.value=[...w.value,C],H(),R.value=!1,b.value=""}function re(C){w.value=w.value.filter(Q=>Q.id!==C),H(),u.value===C&&(u.value="all")}function se(){u.value="all",d.value="",f.value="last_active",p.value=!1}function fe(C){if(!C)return"—";const Q=Date.now()/1e3-C;if(Q<60)return"just now";if(Q<3600){const De=Math.floor(Q/60);return`${De} minute${De!==1?"s":""} ago`}if(Q<86400){const De=Math.floor(Q/3600);return`${De} hour${De!==1?"s":""} ago`}const be=Math.floor(Q/86400);return`${be} day${be!==1?"s":""} ago`}function J(C){if(!C)return"";try{return new Date(C*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ue(C){if(!C)return"";try{return new Date(C*1e3).toLocaleString()}catch{return""}}function Ie(C){return C==="user"?"bg-gray-900/50 border border-gray-800":C==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function z(C){return C==="user"?"sess-msg-user":C==="assistant"?"sess-msg-assistant":"sess-msg-system"}function ce(C){return C==="user"?"badge-info":C==="assistant"?"badge-success":"badge-warning"}function le(C){return C==="user"?"sess-dot-user":C==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(C){return C==="user"?"text-cyan-400":C==="assistant"?"text-indigo-400":"text-gray-500"}function ve(C){return C?C.length>2e3?C.slice(0,2e3)+`
... (truncated)`:C:""}async function Le(){const C=E.value.trim();if(C){I.value=!0;try{let Q=`/api/sessions/search?q=${encodeURIComponent(C)}&limit=50`;N.value.trim()&&(Q+=`&channel_id=${encodeURIComponent(N.value.trim())}`),O.value.trim()&&(Q+=`&user_id=${encodeURIComponent(O.value.trim())}`);const be=await q.get(Q);S.value=be.results||[]}catch{S.value=[]}I.value=!1}}function y(){E.value="",N.value="",O.value="",S.value=null}function T(C){return C?C.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function P(C){return C==="user"?"fts-result-user":C==="assistant"?"fts-result-assistant":C==="summary"?"fts-result-summary":C==="fts"?"fts-result-fts":C==="channel"?"fts-result-channel":"fts-result-default"}function G(C){return C==="user"?"badge-info":C==="assistant"?"badge-success":C==="summary"?"badge-warning":C==="fts"?"badge-success":"badge-info"}async function A(){t.value=!0,s.value=null;try{e.value=await q.get("/api/sessions")}catch(C){s.value=C.message}t.value=!1}function U(){s.value=null,A()}async function Z(C){if(n.value===C){n.value=null,a.value=null,x.value=new Set;return}n.value=C,a.value=null,i.value=!0,x.value=new Set;try{a.value=await q.get(`/api/sessions/${encodeURIComponent(C)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function X(C){const Q=new Set(o.value);Q.has(C)?Q.delete(C):Q.add(C),o.value=Q}function te(){B.value?o.value=new Set:o.value=new Set(M.value.map(C=>C.channel_id))}function Y(C){l.value=C}async function he(){if(l.value){r.value=!0;try{await q.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await A()}catch(C){s.value=C.message||"Failed to clear session"}r.value=!1,l.value=null}}function ie(){c.value=!0}async function de(){if(o.value.size!==0){r.value=!0;try{await q.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await A()}catch(C){s.value=C.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function ye(C,Q){const be=q._token;let De=`/api/sessions/${encodeURIComponent(C)}/export?format=${Q}`;be&&(De+=`&token=${encodeURIComponent(be)}`);const Je=document.createElement("a");Je.href=De,Je.download=`session-${C}.${Q==="text"?"txt":"json"}`,document.body.appendChild(Je),Je.click(),document.body.removeChild(Je)}let we=null;function Ee(C){C.payload&&C.payload.channel_id&&(clearTimeout(we),we=setTimeout(()=>{A(),n.value&&C.payload.channel_id===n.value&&q.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(Q=>{a.value=Q}).catch(()=>{})},2e3))}return $e(()=>{D(),A(),Ke.subscribe("events",Ee)}),ft(()=>{Ke.unsubscribe("events",Ee),clearTimeout(we)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:B,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:m,sortOptions:g,filteredSessions:M,hasActiveFilters:F,customPresets:w,showSavePreset:R,newPresetName:b,threadView:v,threads:W,collapsedThreads:x,ftsQuery:E,ftsChannelId:N,ftsUserId:O,ftsResults:S,ftsSearching:I,formatAge:fe,formatTimestamp:J,formatFullTimestamp:ue,messageClass:Ie,threadMsgClass:z,roleBadge:ce,roleDotClass:le,roleLabelClass:me,truncateContent:ve,threadSummary:j,fetchSessions:A,retry:U,toggleSession:Z,toggleSelect:X,toggleSelectAll:te,confirmClear:Y,clearSession:he,confirmBulkClear:ie,doBulkClear:de,exportSession:ye,applyPreset:k,applyCustomPreset:$,saveCustomPreset:oe,removeCustomPreset:re,resetFilters:se,toggleThread:L,runFtsSearch:Le,clearFtsSearch:y,highlightSnippet:T,ftsResultClass:P,ftsTypeBadge:G}}},uw={props:["trace"],template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(O){if(!O)return"—";try{const S=new Date(O);return isNaN(S.getTime())?O:S.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function f(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function p(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function m(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function g(O){a.value===O?a.value=null:(a.value=O,c.value={})}function w(O,S){const I=O+"-"+S;c.value={...c.value,[I]:!c.value[I]}}function R(O,S){return!!c.value[O+"-"+S]}function b(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,E()}async function v(){try{const O=await q.get("/api/trajectories");e.value=O.files||[],o.value=O.count||0}catch{}}let x=0;async function E(){const O=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const S=await q.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(O!==x)return;let I=S.entries||[];u.value.tool_name&&(I=I.filter(D=>(D.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(I=I.filter(D=>D.is_error)),u.value.channel_id&&(I=I.filter(D=>D.channel_id===u.value.channel_id)),u.value.user_id&&(I=I.filter(D=>D.user_id===u.value.user_id)),t.value=I}else{const S=new URLSearchParams;u.value.channel_id&&S.set("channel_id",u.value.channel_id),u.value.user_id&&S.set("user_id",u.value.user_id),u.value.tool_name&&S.set("tool_name",u.value.tool_name),u.value.errors_only&&S.set("errors_only","true"),S.set("limit",String(u.value.limit));const I=S.toString(),D=await q.get(`/api/trajectories/search/query?${I}`);if(O!==x)return;t.value=D.results||[]}}catch(S){if(O!==x)return;n.value=S.message}O===x&&(s.value=!1)}async function N(){if(!l.value.trim())return;const O=++x;s.value=!0,n.value=null,c.value={};try{const S=await q.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==x)return;i.value=S.entry||null,i.value||(n.value="No trace found for this message ID")}catch(S){if(O!==x)return;S.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=S.message}O===x&&(s.value=!1)}return $e(async()=>{await v(),await E()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:m,truncateBlock:Xh,toggleExpand:g,toggleIteration:w,isIterationExpanded:R,clearFilters:b,fetchFiles:v,fetchTraces:E,lookupMessage:N}}},fw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=ee(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await q.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return $e(()=>{o(),i=setInterval(o,15e3)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:eg,formatTime:Cc,retry:c}}},pw={components:{TabbedPage:ur},setup(){return{tabs:[{id:"audit",label:"Audit",component:rw},{id:"sessions",label:"Sessions",component:cw},{id:"traces",label:"Traces",component:dw},{id:"usage",label:"Usage",component:fw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},$r=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=ee(()=>e.value.filter(b=>b.is_core).length),c=ee(()=>e.value.filter(b=>!b.is_core).length),u=ee(()=>Object.values(a.value).reduce((b,v)=>b+v,0));function d(b){for(const v of $r)if(v.id!=="other"&&v.match(b))return v.id;return"other"}const f=ee(()=>{let b=e.value;if(n.value){const v=n.value.toLowerCase();b=b.filter(x=>x.name.toLowerCase().includes(v)||(x.description||"").toLowerCase().includes(v))}return r.value&&(b=b.filter(v=>d(v.name)===r.value)),b}),p=ee(()=>{const b=new Set;for(const v of e.value)b.add(d(v.name));return $r.filter(v=>b.has(v.id))}),m=ee(()=>{const b=f.value,v={};for(const E of b){const N=d(E.name);v[N]||(v[N]=[]),v[N].push(E)}const x=[];for(const E of $r)v[E.id]&&v[E.id].length>0&&x.push({label:E.label,icon:E.icon,tools:v[E.id].sort((N,O)=>N.name.localeCompare(O.name))});return x});function g(b){i.value={...i.value,[b]:!i.value[b]}}async function w(){t.value=!0,s.value=null;try{const[b,v]=await Promise.all([q.get("/api/tools"),q.get("/api/tools/stats").catch(()=>({}))]);e.value=b,a.value=v||{};const x=Object.values(v||{}).filter(E=>E>0).sort((E,N)=>E-N)}catch(b){s.value=b.message}t.value=!1}function R(){w()}return $e(()=>{w()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:m,usedCategories:p,truncate:Ec,toggleExpand:g,refresh:R}}};function gw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function mw(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),m=h(!1),g=h(null),w=h(null),R=h(!1),b=ee(()=>e.value.length),v=ee(()=>e.value.reduce((J,ue)=>J+(ue.execution_count||0),0)),x=ee(()=>e.value.reduce((J,ue)=>J+D(ue.code),0)),E=ee(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(J)||(ue.description||"").toLowerCase().includes(J))}),N=ee(()=>d.value?d.value.split(`
`).length:0),O=ee(()=>{const J=Math.max(N.value,1);return Array.from({length:J},(ue,Ie)=>Ie+1).join(`
`)}),S=ee(()=>{const J=d.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function I(J){return gw(J)}function D(J){return J?J.split(`
`).length:0}function H(J){return mw(J)}function F(J){n.value={...n.value,[J]:!n.value[J]}}async function M(J){try{await navigator.clipboard.writeText(J);const ue=e.value.find(Ie=>Ie.code===J);ue&&(r.value=ue.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function W(J){if(J.key==="Tab"){J.preventDefault();const ue=J.target,Ie=ue.selectionStart,z=ue.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(z),St(()=>{ue.selectionStart=ue.selectionEnd=Ie+4})}}function B(J){const ue=J.target.previousElementSibling;ue&&(ue.scrollTop=J.target.scrollTop)}async function j(){t.value=!0,s.value=null;try{e.value=await q.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function L(J){i.value=J,delete a.value[J],a.value={...a.value};try{const ue=await q.post(`/api/skills/${encodeURIComponent(J)}/test`);a.value={...a.value,[J]:ue}}catch(ue){a.value={...a.value,[J]:{result:ue.message,is_error:!0}}}i.value=null}function k(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function $(J){o.value=!0,c.value="edit",u.value=J.name,d.value=J.code||"",f.value=null,p.value=null}function oe(){o.value=!1,f.value=null,p.value=null}async function re(){f.value=null,p.value=null;const J=u.value.trim(),ue=d.value.trim();if(!J){f.value="Name is required";return}if(!ue){f.value="Code is required";return}m.value=!0;try{c.value==="create"?(await q.post("/api/skills",{name:J,code:ue}),p.value="Skill created successfully"):(await q.put(`/api/skills/${encodeURIComponent(J)}`,{code:ue}),p.value="Skill updated successfully"),await j(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}m.value=!1}function se(J){w.value=J}async function fe(){if(w.value){R.value=!0;try{await q.del(`/api/skills/${encodeURIComponent(w.value)}`),await j()}catch{}R.value=!1,w.value=null}}return $e(()=>{j()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:m,editorRef:g,deleteTarget:w,deleting:R,enabledCount:b,totalExecutions:v,totalLines:x,displayedSkills:E,editLineCount:N,editorLineNums:O,editValidation:S,highlight:I,truncate:Ec,formatTs:Ia,countLines:D,getLineNumbers:H,toggleCode:F,copyCode:M,handleEditorKey:W,syncScroll:B,fetchSkills:j,testSkill:L,showCreate:k,editSkill:$,cancelEdit:oe,saveSkill:re,confirmDelete:se,doDelete:fe}}};function bw(e,t){if(!e||!t)return kd(e);const s=kd(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),m=h(null),g=h(null);let w=null;const R=h(null),b=h(!1),v=h({}),x=h({}),E=h(null),N=h(null),O=ee(()=>e.value.reduce((k,$)=>k+($.chunks||0),0)),S=ee(()=>new Set(e.value.map($=>$.uploader).filter(Boolean)).size);function I(k,$){const oe=x.value[$];if(!oe||oe.length===0)return 0;const re=Math.max(...oe.map(se=>se.char_count||0));return re===0?0:Math.round(k.char_count/re*100)}async function D(){t.value=!0,s.value=null;try{const k=await q.get("/api/knowledge");e.value=Array.isArray(k)?k:[]}catch(k){s.value=k.message}t.value=!1}async function H(k){if(v.value[k]){v.value[k]=!1,N.value=null;return}if(v.value[k]=!0,!(x.value[k]||E.value===k)){E.value=k;try{const $=await q.get(`/api/knowledge/${encodeURIComponent(k)}/chunks`);x.value[k]=Array.isArray($)?$:[]}catch($){x.value[k]=[],xe.error(`Failed to load chunks: ${$.message}`)}E.value=null}}async function F(){const k=n.value.trim();if(k){i.value=!0,r.value=null,l.value=k;try{const $=await q.get(`/api/knowledge/search?q=${encodeURIComponent(k)}`);a.value=Array.isArray($)?$:[]}catch($){a.value=[],r.value=$.message||"Search failed"}i.value=!1}}function M(){a.value=null,n.value="",r.value=null}async function W(){d.value=null,f.value=null;const k=c.value.trim(),$=u.value.trim();if(!k){d.value="Source name is required";return}if(!$){d.value="Content is required";return}p.value=!0;try{const oe=await q.post("/api/knowledge",{source:k,content:$});f.value=`Ingested ${oe.chunks||0} chunks from "${k}"`,c.value="",u.value="",x.value={},await D(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(oe){d.value=oe.message}p.value=!1}async function B(k){m.value=k,g.value=null,w&&(clearTimeout(w),w=null);try{const $=await q.post(`/api/knowledge/${encodeURIComponent(k)}/reingest`);g.value={source:k,error:!1,message:`Re-ingested ${$.chunks||0} chunks`},delete x.value[k],await D(),w=setTimeout(()=>{g.value=null,w=null},3e3)}catch($){g.value={source:k,error:!0,message:$.message}}m.value=null}function j(k){R.value=k}async function L(){if(R.value){b.value=!0;try{await q.del(`/api/knowledge/${encodeURIComponent(R.value)}`),delete x.value[R.value],await D()}catch{}b.value=!1,R.value=null}}return $e(()=>{D()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:m,reingestResult:g,deleteTarget:R,deleting:b,expanded:v,sourceChunks:x,loadingChunks:E,selectedChunk:N,totalChunks:O,uploaderCount:S,truncate:Ec,formatTs:Ia,highlightTerms:bw,chunkBarWidth:I,fetchSources:D,toggleSource:H,doSearch:F,clearSearch:M,doIngest:W,doReingest:B,confirmDelete:j,doDelete:L}}},xw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),m=h(!1),g=h(null),w=h(null),R=h(new Set),b=h(null),v=h(!1),x=h(!1),E=ee(()=>e.value.reduce((se,fe)=>se+fe.count,0)),N=ee(()=>R.value.size);function O(se){const fe=t.value[se];if(!fe)return[];if(!l.value.trim())return fe;const J=l.value.trim().toLowerCase();return fe.filter(ue=>ue.key.toLowerCase().includes(J)||ue.value&&ue.value.toLowerCase().includes(J))}function S(se,fe){return R.value.has(se+"/"+fe)}function I(se,fe){const J=se+"/"+fe,ue=new Set(R.value);ue.has(J)?ue.delete(J):ue.add(J),R.value=ue}function D(se){const fe=t.value[se];return!fe||fe.length===0?!1:fe.every(J=>R.value.has(se+"/"+J.key))}function H(se,fe){const J=t.value[se];if(!J)return;const ue=new Set(R.value);for(const Ie of J){const z=se+"/"+Ie.key;fe?ue.add(z):ue.delete(z)}R.value=ue}async function F(){s.value=!0,n.value=null;try{const se=await q.get("/api/memory");e.value=Object.entries(se).map(([fe,J])=>({name:fe,keys:J.keys||[],count:J.count||0}))}catch(se){n.value=se.message}s.value=!1}async function M(se){if(a.value[se]){a.value[se]=!1;return}a.value[se]=!0;const fe=e.value.find(ue=>ue.name===se);if(!fe||t.value[se]||i.value===se)return;i.value=se;const J=await Promise.all(fe.keys.map(async ue=>{try{const Ie=await q.get(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(ue)}`);return{key:ue,value:Ie.value||""}}catch{return{key:ue,value:"(error loading)"}}}));t.value[se]=J,i.value=null}function W(se,fe,J){f.value=se+"/"+fe,p.value=J}async function B(se,fe){m.value=!0,g.value=null;try{await q.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`,{value:p.value});const J=t.value[se];if(J){const ue=J.find(Ie=>Ie.key===fe);ue&&(ue.value=p.value)}f.value=null}catch(J){g.value=`Failed to save: ${J.message||"unknown error"}`}m.value=!1}async function j(se,fe){try{await navigator.clipboard.writeText(fe.value),w.value=se+"/"+fe.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function L(){u.value=null,d.value=null;const se=o.value.scope.trim(),fe=o.value.key.trim(),J=o.value.value.trim();if(!se){u.value="Scope is required";return}if(!fe){u.value="Key is required";return}if(!J){u.value="Value is required";return}c.value=!0;try{await q.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`,{value:J}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await F(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(ue){u.value=ue.message}c.value=!1}function k(se,fe){b.value={scope:se,key:fe}}async function $(){if(!b.value)return;v.value=!0,g.value=null;const{scope:se,key:fe}=b.value;try{await q.del(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(fe)}`);const J=t.value[se];J&&(t.value[se]=J.filter(z=>z.key!==fe));const ue=e.value.find(z=>z.name===se);ue&&(ue.count--,ue.keys=ue.keys.filter(z=>z!==fe));const Ie=new Set(R.value);Ie.delete(se+"/"+fe),R.value=Ie}catch(J){g.value=`Failed to delete: ${J.message||"unknown error"}`}v.value=!1,b.value=null}function oe(){x.value=!0}async function re(){v.value=!0,g.value=null;const se=[];for(const fe of R.value){const J=fe.indexOf("/");se.push({scope:fe.slice(0,J),key:fe.slice(J+1)})}try{await q.post("/api/memory/bulk-delete",{entries:se}),R.value=new Set,t.value={},await F()}catch(fe){g.value=`Bulk delete failed: ${fe.message||"unknown error"}`}v.value=!1,x.value=!1}return $e(()=>{F()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:m,actionError:g,copied:w,selected:R,selectedCount:N,totalEntries:E,deleteTarget:b,deleting:v,showBulkDelete:x,fetchMemory:F,toggleScope:M,startEdit:W,doEdit:B,copyValue:j,doAdd:L,confirmDelete:k,doDelete:$,confirmBulkDelete:oe,doBulkDelete:re,isSelected:S,toggleSelect:I,isScopeAllSelected:D,toggleSelectAll:H,filteredEntries:O}}},_w={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=ee(()=>[...new Set(e.value.map(w=>w.category))].sort()),o=ee(()=>{const g={};return e.value.forEach(w=>{g[w.category]=(g[w.category]||0)+1}),g}),c=ee(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function u(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function d(g){i.value=g.key,l.value=g.content}async function f(g){try{await q.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,xe.success("Entry updated"),await m()}catch(w){xe.error(w.message||"Failed to save entry")}}async function p(g){if(await is({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await q.del("/api/learned/"+encodeURIComponent(g)),xe.success("Entry deleted"),await m()}catch(R){xe.error(R.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const g=await q.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return $e(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:Ia,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:m}}},kw={components:{TabbedPage:ur},setup(){return{tabs:[{id:"tools",label:"Tools",component:hw},{id:"skills",label:"Skills",component:vw},{id:"knowledge",label:"Knowledge",component:yw},{id:"memory",label:"Memory",component:xw},{id:"learned",label:"Learned",component:_w}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},ww={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),m=ee(()=>e.value==="custom"),g=ee(()=>[...i.value,...l.value]),w=ee(()=>l.value.includes(e.value)),R=ee(()=>{var S;return m.value?t.value||"Odin":((S=a.value[e.value])==null?void 0:S.name)||e.value}),b=ee(()=>{var S;return m.value?s.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.identity)||""}),v=ee(()=>{var S;return m.value?n.value||"(empty — will use Odin default)":((S=a.value[e.value])==null?void 0:S.voice)||""});async function x(){u.value=!0;try{const S=await q.get("/api/personality");e.value=S.preset||"odin",t.value=S.custom_name||"",s.value=S.custom_identity||"",n.value=S.custom_voice||"",a.value=S.presets||{},i.value=S.builtin_presets||[],l.value=S.user_presets||[]}catch(S){c.value=S.message}finally{u.value=!1}}async function E(){r.value=!0,c.value=null,o.value=!1;try{await q.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(S){c.value=S.message}finally{r.value=!1}}async function N(){const S=d.value.trim();if(S){p.value=!0,c.value=null;try{await q.post("/api/personality/presets",{name:S,display_name:R.value,identity:b.value,voice:v.value}),f.value=!1,d.value="",await x(),e.value=S.toLowerCase().replace(/ /g,"_")}catch(I){c.value=I.message}finally{p.value=!1}}}async function O(){if(await is({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await q.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(I){c.value=I.message}}}return $e(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:m,isUserPreset:w,previewName:R,previewIdentity:b,previewVoice:v,saving:r,saved:o,error:c,loading:u,save:E,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:N,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=ee(()=>e.value.components||[]),i=ee(()=>Cw[e.value.overall]||"text-gray-400"),l=ee(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=ee(()=>{const b=e.value.overall;return b==="healthy"?"All Systems Healthy":b==="degraded"?"Some Systems Degraded":b==="unhealthy"?"System Issues Detected":"Unknown"});function o(b){return Sw[b]||"text-gray-400"}function c(b){return Tw[b]||"info"}function u(b){return b==="ok"?"badge-success":b==="degraded"?"badge-warning":b==="down"?"badge-danger":"badge-info"}function d(b){return b==="closed"?"text-green-400":b==="half_open"?"text-yellow-400":b==="open"?"text-red-400":"text-gray-400"}function f(b){return b.replace(/_/g," ").replace(/\b\w/g,v=>v.toUpperCase())}function p(b){if(!b)return"—";try{return new Date(b).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return b}}function m(b){return b>=1e6?(b/1e6).toFixed(1)+"M":b>=1e3?(b/1e3).toFixed(1)+"K":String(b)}async function g(){n.value=!0;try{e.value=await q.get("/api/health/components"),s.value=null}catch(b){s.value=b.message}finally{t.value=!1,n.value=!1}}function w(){t.value=!0,s.value=null,g()}let R=null;return $e(async()=>{await g(),R=setInterval(g,3e4)}),ft(()=>{R&&clearInterval(R)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:m,fetchHealth:g,retry:w}}},Aw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=ee(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=ee(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await q.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return $e(()=>{c(),i=setInterval(c,3e4)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:eg,refresh:u,retry:d}}},Rw=["INFO","WARNING","ERROR"],Iw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Ur=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Nw=[50,100,200,500],Lw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ke.state||"disconnected"),c=ee(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,m=Rw,g=Iw,w=Ur,R=h("all"),b=h(""),v=h([]),x=h(!1),E=h(""),N=h([]);function O(){try{const V=localStorage.getItem("odin-log-presets");V&&(v.value=JSON.parse(V))}catch{}}function S(){try{localStorage.setItem("odin-log-presets",JSON.stringify(v.value))}catch{}}const I=ee(()=>a.value!==""||i.value.trim()!==""||b.value!==""),D=ee(()=>{const V=Ur.find(ne=>ne.value===b.value);return V?V.label:""}),H=ee(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),F=24,M=ee(()=>{if(t.value.length===0)return[];const V=[],ne=new Date,Se=3600*1e3;for(let je=F-1;je>=0;je--){const it=new Date(ne.getTime()-(je+1)*Se),Gt=new Date(ne.getTime()-je*Se);V.push({start:it,end:Gt,label:L(it,Gt),shortLabel:Gt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const je of t.value){if(!je._time)continue;const it=je._time.getTime();for(const Gt of V)if(it>=Gt.start.getTime()&&it<Gt.end.getTime()){Gt.total++,je.level==="ERROR"?Gt.errors++:je.level==="WARNING"?Gt.warnings++:Gt.info++;break}}return V}),W=ee(()=>{let V=1;for(const ne of M.value)ne.total>V&&(V=ne.total);return V}),B=ee(()=>M.value.length===0?"":"Last 24 hours"),j=ee(()=>Math.ceil(F/8));function L(V,ne){const Se={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],Se)+" - "+ne.toLocaleTimeString([],Se)}function k(V,ne){return!ne||!V?"0px":Math.max(2,V/ne*100)+"%"}function $(V){const ne=oe.value.findIndex(Se=>Se._time&&Se._time.getTime()>=V.start.getTime()&&Se._time.getTime()<V.end.getTime());if(ne>=0&&u.value){const Se=u.value.querySelectorAll(".log-line");Se[ne]&&(Se[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const oe=ee(()=>{let V=t.value;if(a.value&&(V=V.filter(ne=>(ne.level||"INFO")===a.value)),b.value){const ne=Ur.find(Se=>Se.value===b.value);if(ne&&ne.seconds){const Se=new Date(Date.now()-ne.seconds*1e3);V=V.filter(je=>je._time&&je._time>=Se)}}if(i.value&&!H.value)if(l.value)try{const ne=new RegExp(i.value,"i");V=V.filter(Se=>{const je=Se.text||Se.raw||"",it=Se.tool||"";return ne.test(je)||ne.test(it)})}catch{}else{const ne=i.value.toLowerCase();V=V.filter(Se=>{const je=(Se.text||Se.raw||"").toLowerCase(),it=(Se.tool||"").toLowerCase();return je.includes(ne)||it.includes(ne)})}return V});function re(V){if(V.type==="log"&&V.line)try{const ne=typeof V.line=="string"?JSON.parse(V.line):V.line,Se=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Se.toLocaleTimeString(),_time:Se,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const ne=V.payload,Se=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Se.toLocaleTimeString(),_time:Se,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function se(V){const ne=re(V);if(s.value){N.value.push(ne);return}fe(ne)}function fe(V){t.value.push(V),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&St(()=>J())}function J(){const V=u.value;if(V){const ne=V.scrollHeight-V.scrollTop-V.clientHeight;V.scrollTo({top:V.scrollHeight,behavior:ne<500?"smooth":"instant"})}}function ue(){n.value=!0,d.value=!1,St(()=>J())}function Ie(){const V=u.value;if(!V)return;const ne=V.scrollHeight-V.scrollTop-V.clientHeight<40;d.value=!ne&&t.value.length>0,!ne&&n.value&&(n.value=!1)}function z(){if(s.value=!s.value,!s.value&&N.value.length>0){for(const V of N.value)fe(V);N.value=[]}}function ce(){t.value=[],N.value=[],d.value=!1}function le(){let V;e.value==="search"?V=Q.value.map(it=>{const Gt=it.error?"ERROR":"INFO",nt=it.tool_name?`[${it.tool_name}] `:"";return`${it.timestamp||""} ${Gt} ${nt}${it.result_summary||it.message||""}`}).join(`
`):V=oe.value.map(it=>`${it.ts} ${it.level} ${it.text}`).join(`
`);const ne=new Blob([V],{type:"text/plain"}),Se=URL.createObjectURL(ne),je=document.createElement("a");je.href=Se,je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,je.click(),URL.revokeObjectURL(Se)}function me(V,ne){const Se=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(Se).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function ve(V){a.value=a.value===V?"":V,R.value="all"}function Le(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function y(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function T(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function P(V){R.value=V.id;const ne=V.filters;a.value=ne.level||"",b.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function G(V){R.value=V.id,a.value=V.filters.level||"",b.value=V.filters.timeRange||"",i.value=V.filters.text||""}function A(){if(!E.value.trim())return;const V={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:a.value,timeRange:b.value,text:i.value}};v.value=[...v.value,V],S(),x.value=!1,E.value=""}function U(V){v.value=v.value.filter(ne=>ne.id!==V),S(),R.value===V&&(R.value="all")}const Z=h("all"),X=h(""),te=h(""),Y=h(""),he=h(""),ie=h(""),de=h(100),ye=Nw,we=h(!1),Ee=h(!1),C=h(""),Q=h([]),be=h(null),De=h(null);function Je(){e.value="search",be.value||We()}async function We(){try{be.value=await q.get("/api/logs/stats")}catch{}}function Ct(){const V=ie.value;if(!V){Y.value="",he.value="";return}const Se={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(Se){const je=new Date(Date.now()-Se*1e3);Y.value=st(je),he.value=""}}function st(V){const ne=Se=>String(Se).padStart(2,"0");return`${V.getFullYear()}-${ne(V.getMonth()+1)}-${ne(V.getDate())}T${ne(V.getHours())}:${ne(V.getMinutes())}`}function Ye(V){if(!V)return"";const ne=new Date(V);return isNaN(ne.getTime())?"":ne.toISOString()}async function sn(){we.value=!0,C.value="",Ee.value=!0,De.value=null;try{const V=new URLSearchParams;Z.value&&Z.value!=="all"&&V.set("level",Z.value),X.value&&V.set("tool",X.value),te.value&&V.set("q",te.value);const ne=Ye(Y.value),Se=Ye(he.value);ne&&V.set("start",ne),Se&&V.set("end",Se),V.set("limit",String(de.value));const je=await q.get(`/api/logs/search?${V.toString()}`);Q.value=je.entries||[]}catch(V){C.value=V.message||"Search failed",Q.value=[]}finally{we.value=!1}}function xn(){Z.value="all",X.value="",te.value="",Y.value="",he.value="",ie.value="",de.value=100,Q.value=[],Ee.value=!1,C.value="",De.value=null}function Oi(V){De.value=De.value===V?null:V}function Na(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function Di(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function Kn(V){return V.error?"log-line-error":"text-gray-300"}function qn(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let Lt=null,gs=null,nn=!1;function La(){nn||(nn=!0,Ke.subscribe("logs",se),r.value=Ke.connected,o.value=Ke.state||"disconnected",Lt=Ke.onStateChange,gs=(V,ne)=>{o.value=V,r.value=V==="connected",Lt&&Lt(V,ne)},Ke.onStateChange=gs)}function Mi(){nn&&(nn=!1,Ke.unsubscribe("logs",se),Ke.onStateChange===gs&&(Ke.onStateChange=Lt),gs=null,Lt=null)}return $e(O),Uo(La),Bo(Mi),ft(Mi),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:oe,pauseBuffer:N,showJumpBottom:d,copiedIndex:f,regexError:H,levels:m,logPresets:g,timeRanges:w,timeRange:b,activeLogPreset:R,customLogPresets:v,showSaveLogPreset:x,newLogPresetName:E,hasActiveLogFilters:I,timeRangeLabel:D,timelineBuckets:M,timelineMax:W,timelineSpanLabel:B,timelineLabelSkip:j,togglePause:z,clearLogs:ce,exportLogs:le,logLineClass:Le,levelClass:y,levelChipClass:T,toggleLevel:ve,copyLine:me,jumpToBottom:ue,onScroll:Ie,applyLogPreset:P,applyCustomLogPreset:G,saveLogCustomPreset:A,removeLogCustomPreset:U,segmentHeight:k,jumpToTimelineBucket:$,searchLevel:Z,searchTool:X,searchKeyword:te,searchStart:Y,searchEnd:he,searchTimePreset:ie,searchLimit:de,searchLimits:ye,searching:we,searchRan:Ee,searchError:C,searchResults:Q,searchStats:be,expandedSearch:De,switchToSearch:Je,runSearch:sn,clearSearchFilters:xn,toggleSearchExpand:Oi,formatSearchTs:Na,searchEntryText:Di,searchLogLineClass:Kn,formatJson:qn,applySearchTimePreset:Ct}}},Ow=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Dw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Mw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1–128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},Br=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"database",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"server",sections:["tools"]},{key:"ui",label:"Web UI",icon:"globe",sections:["web"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"puzzle",sections:["issue_tracker"]}],gg="••••••••",Pw=50;function Fw(e){return Ow.has(e)}function $w(e){return e===gg}function Qi(e){return JSON.parse(JSON.stringify(e))}function Mn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Uw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Mn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Mn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function Bw(e,t,s){const n=Mw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Kd(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Mn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Mn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Hw={template:`
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=ee(()=>d.value.length>0),m=ee(()=>f.value.length>0),g=ee(()=>r.value&&t.value?t.value:e.value),w=ee(()=>!e.value||!t.value?!1:!Mn(e.value,t.value)),R=ee(()=>!e.value||!t.value?0:Kd(e.value,t.value).length),b=ee(()=>{if(!r.value||!t.value)return{};const A={};for(const U of Object.keys(t.value)){const Z=t.value[U];if(typeof Z=="object"&&Z!==null&&!Array.isArray(Z))for(const X of Object.keys(Z)){const te=Bw(U,X,Z[X]);te&&(A[U+"."+X]=te)}}return A}),v=ee(()=>Object.keys(b.value).length>0),x=ee(()=>e.value?Object.keys(e.value).length:0),E=ee(()=>O.value.length),N=ee(()=>!e.value||!t.value?[]:Kd(e.value,t.value)),O=ee(()=>e.value?Br.map(A=>({...A,sections:A.sections.filter(U=>U in e.value)})).filter(A=>A.sections.length>0):[]),S=ee(()=>{if(!e.value)return[];const A=new Set(Br.flatMap(U=>U.sections));return Object.keys(e.value).filter(U=>!A.has(U))});function I(A){return g.value?g.value[A]:null}function D(A){return!e.value||!t.value?!1:!Mn(e.value[A],t.value[A])}function H(A){return A.sections.some(U=>D(U))}function F(A,U){if(!e.value||!t.value)return!1;const Z=e.value[A],X=t.value[A];return!Z||!X?!1:!Mn(Z[U],X[U])}function M(A){return t.value?t.value[A]:e.value[A]}function W(A,U){const Z=t.value||e.value;return Z[A]?Z[A][U]:void 0}function B(A,U){const Z=r.value&&t.value?t.value:e.value;return Z[A]?Z[A][U]:!1}function j(A,U){return b.value[A+"."+U]||null}function L(A,U){return Dw[A+"."+U]||null}function k(A,U,Z){t.value&&(U===null?t.value[A]=Z:(t.value[A]||(t.value[A]={}),t.value[A][U]=Z),t.value={...t.value})}function $(A,U,Z){if(!t.value)return;const X=Qi(t.value);k(A,U,Z),d.value.push(X),d.value.length>Pw&&d.value.shift(),f.value=[]}function oe(A,U,Z){try{const X=JSON.parse(Z);$(A,U,X)}catch{}}function re(){d.value.length!==0&&(f.value.push(Qi(t.value)),t.value=d.value.pop())}function se(){f.value.length!==0&&(d.value.push(Qi(t.value)),t.value=f.value.pop())}function fe(A,U,Z){if(!t.value||!t.value[A])return;const X=[...t.value[A][U]];X.splice(Z,1),$(A,U,X)}function J(A,U){if(!t.value||!t.value[A])return;const Z=[...t.value[A][U]||[]],X=prompt("Enter new value:");X!==null&&(Z.push(X),$(A,U,Z))}function ue(A){a.value={...a.value,[A]:!a.value[A]}}function Ie(A){l.value={...l.value,[A]:!l.value[A]}}function z(A){i.value={...i.value,[A]:!i.value[A]}}function ce(A){try{return JSON.stringify(A,null,2)}catch{return String(A)}}function le(A){return A==null?"null":typeof A=="object"?JSON.stringify(A,null,2):String(A)}function me(A,U){c.value={type:A,message:U},setTimeout(()=>{c.value=null},3e3)}function ve(){t.value=Qi(e.value),r.value=!0,d.value=[],f.value=[]}function Le(){r.value=!1,t.value=null,d.value=[],f.value=[]}function y(){u.value=!0}async function T(){if(!(!w.value||v.value)){o.value=!0;try{const A=Uw(e.value,t.value);if(Object.keys(A).length===0){me("success","No changes to save."),o.value=!1;return}const U=await q.put("/api/config",A);e.value=U,r.value=!1,t.value=null,d.value=[],f.value=[],me("success","Config saved successfully.")}catch(A){me("error",A.message||"Failed to save config")}o.value=!1}}async function P(){s.value=!0,n.value=null;try{e.value=await q.get("/api/config");for(const A of Object.keys(e.value))a.value[A]===void 0&&(a.value[A]=!0);for(const A of Br)l.value[A.key]===void 0&&(l.value[A.key]=!0)}catch(A){n.value=A.message}s.value=!1}function G(A){if(!r.value)return;const U=A.target;U instanceof HTMLElement&&(U.matches("input, textarea, select")||U.isContentEditable)||((A.ctrlKey||A.metaKey)&&!A.shiftKey&&A.key.toLowerCase()==="z"?(A.preventDefault(),re()):(A.ctrlKey||A.metaKey)&&(A.key==="y"||A.shiftKey&&A.key==="z"||A.shiftKey&&A.key==="Z")&&(A.preventDefault(),se()))}return $e(()=>{P(),document.addEventListener("keydown",G)}),ft(()=>{document.removeEventListener("keydown",G)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:w,hasErrors:v,changeCount:R,REDACTED:gg,showDiffModal:u,diffEntries:N,canUndo:p,canRedo:m,sectionCount:x,groupCount:E,visibleGroups:O,ungroupedSections:S,validationErrors:b,isSensitiveKey:Fw,isRedacted:$w,sectionChanged:D,groupChanged:H,fieldChanged:F,getDisplay:I,getEdited:M,getEditedField:W,getDisplayBool:B,pushEdit:$,pushEditJson:oe,getValidationError:j,getEnumOptions:L,removeArrayItem:fe,addArrayItem:J,toggleSection:ue,toggleGroup:Ie,toggleNested:z,formatJson:ce,formatDiffVal:le,showToast:me,showDiff:y,fetchConfig:P,startEdit:ve,cancelEdit:Le,saveConfig:T,undo:re,redo:se}}},Vw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await q.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,m,g){try{await q.put("/api/discord/guild/"+p+"/config",{[m]:g}),await c()}catch(w){s.value=w.message}}async function d(p,m,g,w){try{await q.put("/api/discord/channel/"+p+"/config",{[g]:w}),await c()}catch(R){s.value=R.message}}async function f(p,m){try{await q.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return $e(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},jw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=ee(()=>{const k={};for(const $ of u.value)k[$.id]=$;return k});function p(k){return f.value[k]||null}const m=ee(()=>/^\d{15,25}$/.test(r.value.trim())),g=ee(()=>{if(o.value){if(w.value[c.value])return"host-user-option-"+c.value;if(m.value)return"host-user-option-raw"}}),w=ee(()=>{const k=r.value.toLowerCase().trim();return k?u.value.filter($=>!i.value[$.id]&&($.display_name.toLowerCase().includes(k)||$.username.toLowerCase().includes(k)||$.id.includes(k))):u.value.filter($=>!i.value[$.id])});function R(k,$){return k?k.allowed_hosts===null||k.allowed_hosts===void 0?{allowed_hosts:[...$],default_host:k.default_host||"",allow_all:!0}:{allowed_hosts:k.allowed_hosts,default_host:k.default_host||"",allow_all:!1}:{allowed_hosts:[...$],default_host:$[0]||"",allow_all:!0}}async function b(){e.value=!0,t.value="";try{const k=await q.get("/api/host-access");s.value=k,n.value=k.available_hosts||[],a.value=R(k.default_policy,n.value);const $=k.users||{},oe={};for(const[re,se]of Object.entries($))oe[re]=R(se,n.value);i.value=oe}catch(k){t.value=k.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await q.get("/api/discord/members")||[]}catch{u.value=[]}}async function v(){try{const k=a.value.allow_all?null:a.value.allowed_hosts;await q.put("/api/host-access/default-policy",{allowed_hosts:k,default_host:a.value.default_host}),xe.success("Default policy updated")}catch(k){xe.error(k.message||"Failed to save")}}function x(k,$){a.value.allow_all=!1,$?a.value.allowed_hosts.includes(k)||a.value.allowed_hosts.push(k):(a.value.allowed_hosts=a.value.allowed_hosts.filter(oe=>oe!==k),a.value.default_host===k&&(a.value.default_host=a.value.allowed_hosts[0]||"")),v()}async function E(k){const $=i.value[k];if($)try{const oe=$.allow_all?null:$.allowed_hosts;await q.put(`/api/host-access/user/${k}`,{allowed_hosts:oe,default_host:$.default_host});const re=p(k);xe.success(`Updated access for ${re?re.display_name:k}`)}catch(oe){xe.error(oe.message||"Failed to save")}}function N(k,$,oe){const re=i.value[k];re&&(re.allow_all=!1,oe?re.allowed_hosts.includes($)||re.allowed_hosts.push($):(re.allowed_hosts=re.allowed_hosts.filter(se=>se!==$),re.default_host===$&&(re.default_host=re.allowed_hosts[0]||"")),E(k))}function O(k,$){const oe=i.value[k];oe&&(oe.default_host=$,E(k))}function S(){l.value=!0,r.value="",c.value=0,St(()=>{d.value&&d.value.focus()})}function I(){o.value=!0,c.value=0}function D(){c.value<w.value.length-1&&c.value++}function H(){c.value>0&&c.value--}function F(){const k=w.value[c.value];if(k){W(k);return}m.value&&M()}function M(){const k=r.value.trim();/^\d{15,25}$/.test(k)&&(i.value[k]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},E(k),r.value="",o.value=!1,l.value=!1)}function W(k){i.value[k.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},E(k.id),r.value="",o.value=!1,l.value=!1}function B(){o.value=!1}function j(){setTimeout(()=>{o.value=!1},150)}async function L(k){const $=p(k);if(await is({title:"Remove user override",message:`Remove the host access override for ${$?$.display_name:k}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await q.del(`/api/host-access/user/${k}`),delete i.value[k],xe.success(`Removed override for ${$?$.display_name:k}`)}catch(re){xe.error(re.message||"Failed to delete")}}return $e(b),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:w,isRawId:m,activeOptionId:g,searchInput:d,fetchData:b,saveDefaultPolicy:v,toggleDefaultHost:x,getMember:p,toggleUserHost:N,setUserDefault:O,openAddUser:S,deleteUser:L,onSearchInput:I,highlightNext:D,highlightPrev:H,selectHighlighted:F,selectMember:W,closeDropdown:B,onBlur:j,addRawId:M}}},zw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=ee(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=ee(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(S){return S==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":S==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const S=await q.get("/api/tokens");s.value=S.tokens||[],n.value=S.available_hosts||[]}catch(S){t.value=S.message||"Failed to load tokens"}finally{e.value=!1}}function g(S){return!S||!S.trim()?[]:S.split(",").map(I=>I.trim()).filter(Boolean)}function w(S,I){const D=c.value.allowed_hosts;if(I&&!D.includes(S)&&D.push(S),!I){const H=D.indexOf(S);H>=0&&D.splice(H,1)}}function R(S,I){const D=u.value.allowed_hosts;if(I&&!D.includes(S)&&D.push(S),!I){const H=D.indexOf(S);H>=0&&D.splice(H,1)}}async function b(){var S;i.value=!0;try{const I=g(c.value.allowed_tools_str),D=c.value.host_mode,H=D==="none"?[]:D==="select"?c.value.allowed_hosts:null,F={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:I.length?I:[]};H!==null&&(F.allowed_hosts=H),F.default_host=c.value.default_host||"";const M=await q.post("/api/tokens",F);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,xe.success("Token created"),await m()}catch(I){xe.error(((S=I.data)==null?void 0:S.error)||I.message||"Failed to create token")}finally{i.value=!1}}function v(S){r.value=S;const I=S.allowed_hosts;let D="default";I==null?D="default":Array.isArray(I)&&I.length===0?D="none":Array.isArray(I)&&(D="select"),u.value={username:S.username||"",tier:S.tier||"admin",label:S.label||"",host_mode:D,allowed_hosts:Array.isArray(I)?[...I]:[],default_host:S.default_host||"",allowed_tools_str:(S.allowed_tools||[]).join(", ")}}async function x(){var S;if(r.value){o.value=!0;try{const I=g(u.value.allowed_tools_str),D=u.value.host_mode,H={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:I};D==="none"?H.allowed_hosts=[]:D==="select"?H.allowed_hosts=u.value.allowed_hosts:H.allowed_hosts=null,H.default_host=u.value.default_host||"",await q.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,xe.success("Token updated"),await m()}catch(I){xe.error(((S=I.data)==null?void 0:S.error)||I.message||"Failed to update")}finally{o.value=!1}}}async function E(S){var D;if(await is({title:"Regenerate token",message:`Regenerate token for ${S.username||S.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await q.post("/api/tokens/"+encodeURIComponent(S.user_id)+"/regenerate");l.value=H.token,xe.success("Token regenerated")}catch(H){xe.error(((D=H.data)==null?void 0:D.error)||H.message||"Failed to regenerate")}}async function N(S){var D;if(await is({title:"Delete token",message:`Delete token for ${S.username||S.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await q.del("/api/tokens/"+encodeURIComponent(S.user_id)),xe.success("Token deleted"),await m()}catch(H){xe.error(((D=H.data)==null?void 0:D.error)||H.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),xe.success("Copied to clipboard")}catch{xe.error("Copy failed — select and copy manually")}}return $e(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:m,tierBadge:p,toggleCreateHost:w,toggleEditHost:R,createToken:b,startEdit:v,saveEdit:x,confirmRegenerate:E,confirmDelete:N,copyToken:O}}};function Hr(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Kw={template:`
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
                <option value="gpt-5.6-sol">gpt-5.6-sol</option>
                <option value="gpt-5.6-terra">gpt-5.6-terra</option>
                <option value="gpt-5.5">gpt-5.5</option>
                <option value="gpt-5">gpt-5</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="codexForm.max_tokens" type="number" @keydown.enter="saveCodexConfigNow"
                     class="hm-input" />
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:""}),a=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),i=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),l=h(!1),r=h(!1),o=h(!1),c=h(!1),u=h(!1),d=h(!1),f=h(!1),p=h({configured:!1}),m=h([]),g=h(""),w=h(!1),R=h(!1),b=h({configured:!1}),v=h([]),x=h(""),E=h(!1),N=h(!1),O=h(!0),S=h(""),I=h({configured:!1,accounts:[]}),D=h(null),H=h(null),F=h(""),M=h(null),W=h(!1),B=h(null),j=h(null),L=h("");let k=null;function $(C,Q="success"){xe(C,Q==="error"?"error":"success")}function oe(C){if(!C)return"?";const Q=C/(1024*1024*1024);return Q>=1?Q.toFixed(1)+" GB":(C/(1024*1024)).toFixed(0)+" MB"}async function re(){e.value=!0,await Promise.all([se(),fe(),le(),J()]),e.value=!1}async function se(){try{const C=await q.get("/api/llm/status");t.value=C,s.value=C.active_provider||"codex",C.codex&&!P.pending()&&(n.value.enabled=C.codex.enabled,n.value.model=C.codex.model||"gpt-5.5",n.value.reasoning_effort=C.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=C.codex.agent_reasoning_effort||"",n.value.max_tokens=C.codex.max_tokens||4096),C.ollama&&!G.pending()&&(a.value.enabled=C.ollama.enabled,a.value.base_url=C.ollama.base_url||"",a.value.model=C.ollama.model||"",a.value.max_tokens=C.ollama.max_tokens||4096),C.kimi&&!A.pending()&&(i.value.enabled=C.kimi.enabled,i.value.model=C.kimi.model||"",i.value.max_tokens=C.kimi.max_tokens||4096)}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function fe(){try{if(p.value=await q.get("/api/ollama/status"),p.value.model&&(g.value=p.value.model),p.value.configured)try{const C=await q.get("/api/ollama/models");m.value=C.models||[]}catch{m.value=[]}else if(a.value.base_url)try{const C=await q.post("/api/ollama/probe-models",{base_url:a.value.base_url});m.value=C.models||[]}catch{m.value=[]}}catch{p.value={configured:!1}}}async function J(){O.value=!0,S.value="";try{I.value=await q.get("/api/codex/status")}catch(C){S.value=C.message||"Failed to fetch Codex status"}finally{O.value=!1}}async function ue(){const C=t.value?t.value.active_provider:"codex";f.value=!0;try{const Q=await q.post("/api/llm/switch",{provider:s.value});Q.error?(s.value=C,$(Q.error,"error")):($("Switched to "+s.value+" ("+Q.model+")"),await re())}catch(Q){s.value=C,$(Q.message||"Switch failed","error")}finally{f.value=!1}}async function Ie(){w.value=!0;try{const C=await q.post("/api/ollama/reload");$(C.configured?"Ollama reloaded":C.reason||"Ollama not configured",C.configured?"success":"error"),await re()}catch(C){$(C.message||"Reload failed","error")}finally{w.value=!1}}async function z(){R.value=!0;try{await q.post("/api/ollama/model",{model:g.value}),$("Model set to "+g.value),await re()}catch(C){$(C.message||"Failed","error")}finally{R.value=!1}}async function ce(){const C=a.value.base_url;if(!C){$("Enter a base URL first","error");return}d.value=!0;try{const Q=await q.post("/api/ollama/probe-models",{base_url:C});m.value=Q.models||[],m.value.length?($(m.value.length+" model(s) found"),!a.value.model&&m.value.length&&(a.value.model=m.value[0].name)):$("No models found at "+C,"error")}catch(Q){$(Q.message||"Could not reach Ollama","error")}finally{d.value=!1}}async function le(){try{if(b.value=await q.get("/api/kimi/status"),b.value.model&&(x.value=b.value.model),b.value.configured)try{const C=await q.get("/api/kimi/models");v.value=C.models||[]}catch{v.value=[]}}catch{b.value={configured:!1}}}async function me(){E.value=!0;try{const C=await q.post("/api/kimi/reload");$(C.configured?"Kimi reloaded":C.reason||"Kimi not configured",C.configured?"success":"error"),await re()}catch(C){$(C.message||"Reload failed","error")}finally{E.value=!1}}async function ve(){N.value=!0;try{await q.post("/api/kimi/model",{model:x.value}),$("Model set to "+x.value),await re()}catch(C){$(C.message||"Failed","error")}finally{N.value=!1}}async function Le(){if(o.value){P();return}o.value=!0;try{await q.put("/api/llm/codex/config",n.value),$("Codex config saved"),await Promise.all([se(),J()])}catch(C){$(C.message||"Failed","error"),await Promise.all([se(),J()])}finally{o.value=!1}}async function y(){if(c.value){G();return}c.value=!0;try{const C={...a.value},Q=l.value?a.value.api_key:null;Q===null&&delete C.api_key,await q.put("/api/llm/ollama/config",C),$("Ollama config saved"),Q!==null&&a.value.api_key===Q&&(a.value.api_key="",l.value=!1),await Promise.all([se(),fe()])}catch(C){$(C.message||"Failed","error")}finally{c.value=!1}}async function T(){if(u.value){A();return}u.value=!0;try{const C={...i.value},Q=r.value?i.value.api_key:null;Q===null&&delete C.api_key,await q.put("/api/llm/kimi/config",C),$("Kimi config saved"),Q!==null&&i.value.api_key===Q&&(i.value.api_key="",r.value=!1),await Promise.all([se(),le()])}catch(C){$(C.message||"Failed","error")}finally{u.value=!1}}const P=Hr(Le),G=Hr(y),A=Hr(T),U=()=>(P.cancel(),Le()),Z=()=>(G.cancel(),y()),X=()=>(A.cancel(),T());async function te(C){try{await q.post("/api/codex/account/"+C+"/activate"),$("Active account switched"),await J()}catch(Q){$(Q.message||"Failed","error")}}async function Y(C){D.value=C;try{await q.post("/api/codex/account/"+C+"/refresh"),$("Token refreshed"),await J()}catch(Q){$(Q.message||"Refresh failed","error")}finally{D.value=null}}function he(C,Q){H.value=C,F.value=Q||""}async function ie(C){try{await q.put("/api/codex/account/"+C+"/label",{label:F.value}),$("Label updated"),H.value=null,await J()}catch(Q){$(Q.message||"Failed","error")}}async function de(C,Q){if(await is({title:"Delete Codex account",message:`Delete ${Q||"account #"+(C+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await q.del("/api/codex/account/"+C),$("Deleted. Pool reloaded."),await J()}catch(De){$(De.message||"Failed","error")}}async function ye(){W.value=!0;try{const C=await q.post("/api/codex/device-code");B.value=C,M.value="pending",we(C)}catch(C){$(C.message||"Failed","error")}finally{W.value=!1}}async function we(C){k={cancelled:!1};const Q=k;try{const be=await q.post("/api/codex/device-poll",{device_auth_id:C.device_auth_id,user_code:C.user_code,interval:C.interval});if(Q.cancelled)return;j.value=be,M.value="success",await re()}catch(be){if(Q.cancelled)return;L.value=be.message||"Device login failed",M.value="error"}}function Ee(){k&&(k.cancelled=!0),M.value=null,B.value=null}return $e(re),ft(()=>{k&&(k.cancelled=!0),P.cancel(),G.cancel(),A.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:f,codexForm:n,ollamaForm:a,kimiForm:i,savingCodex:o,savingOllama:c,savingKimi:u,probingOllama:d,ollamaKeyDirty:l,kimiKeyDirty:r,ollamaStatus:p,ollamaModels:m,ollamaSelectedModel:g,reloading:w,settingModel:R,kimiStatus:b,kimiModels:v,kimiSelectedModel:x,reloadingKimi:E,settingKimiModel:N,codexLoading:O,codexError:S,codexData:I,refreshing:D,editingLabel:H,labelValue:F,deviceState:M,deviceLoading:W,deviceInfo:B,deviceResult:j,deviceError:L,fetchAll:re,switchProvider:ue,reloadOllama:Ie,setOllamaModel:z,reloadKimi:me,setKimiModel:ve,probeOllamaModels:ce,saveCodexConfig:Le,saveOllamaConfig:y,saveKimiConfig:T,saveCodexConfigDebounced:P,saveOllamaConfigDebounced:G,saveKimiConfigDebounced:A,saveCodexConfigNow:U,saveOllamaConfigNow:Z,saveKimiConfigNow:X,activateAccount:te,refreshAccount:Y,startEditLabel:he,saveLabel:ie,deleteAccount:de,startDeviceLogin:ye,cancelDeviceLogin:Ee,formatSize:oe}}},qd={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function qw(e){return qd[e]||qd[(e||"").toLowerCase()]||"text-gray-400"}const Gw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),u=h(null);let d=null;async function f(){const p=await Promise.allSettled([q.get("/api/startup/diagnostics"),q.get("/api/subsystems/status"),q.get("/api/pools/ssh"),q.get("/api/pools/http"),q.get("/api/risk/stats"),q.get("/api/recovery/stats"),q.get("/api/compression/stats"),q.get("/api/routing/stats"),q.get("/api/freshness/stats"),q.get("/api/governor/stats")]),m=w=>p[w].status==="fulfilled"?p[w].value:null;t.value=m(0)||{};const g=m(1);s.value=Array.isArray(g)?g:g&&g.subsystems||[],n.value=m(2)||{},a.value=m(3)||{},i.value=m(4),l.value=m(5),r.value=m(6),o.value=m(7),c.value=m(8),u.value=m(9),e.value=!1}return $e(()=>{f(),d=setInterval(f,3e4)}),ft(()=>{d&&clearInterval(d)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,routingStats:o,freshnessStats:c,governorStats:u,statusColor:qw,formatTime:Cc}}},Ww={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await q.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await is({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await q.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return $e(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},Zw={components:{TabbedPage:ur},setup(){return{tabs:[{id:"health",label:"Health",component:Ew},{id:"resources",label:"Resources",component:Aw},{id:"logs",label:"Logs",component:Lw},{id:"config",label:"Config",component:Hw},{id:"discord",label:"Discord",component:Vw},{id:"host-access",label:"Host Access",component:jw},{id:"api-tokens",label:"API Tokens",component:zw},{id:"llm",label:"LLM Config",component:Kw},{id:"internals",label:"Internals",component:Gw},{id:"update",label:"Update",component:Ww}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},pt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),mg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:P_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:ew,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:lw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:pw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:kw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:ww,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Zw,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:pt("/operations","live")},{path:"/agents",redirect:pt("/operations","agents")},{path:"/loops",redirect:pt("/operations","loops")},{path:"/processes",redirect:pt("/operations","processes")},{path:"/schedules",redirect:pt("/operations","schedules")},{path:"/audit",redirect:pt("/history","audit")},{path:"/sessions",redirect:pt("/history","sessions")},{path:"/traces",redirect:pt("/history","traces")},{path:"/usage",redirect:pt("/history","usage")},{path:"/tools",redirect:pt("/capabilities","tools")},{path:"/skills",redirect:pt("/capabilities","skills")},{path:"/knowledge",redirect:pt("/capabilities","knowledge")},{path:"/memory",redirect:pt("/capabilities","memory")},{path:"/learned",redirect:pt("/capabilities","learned")},{path:"/health",redirect:pt("/system","health")},{path:"/resources",redirect:pt("/system","resources")},{path:"/logs",redirect:pt("/system","logs")},{path:"/config",redirect:pt("/system","config")},{path:"/host-access",redirect:pt("/system","host-access")},{path:"/internals",redirect:pt("/system","internals")}],ni=E_({history:i_(),routes:mg});ni.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const Jw={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{q.setPersist(a.value),await q.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},Yw={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),u=h("disconnected"),d=h(-1),f=h(null);let p=null;const m=h("starting"),g=h(""),w=mg.filter(L=>L.meta),R=ee(()=>["Workspace","Operate","Observe","Manage"].map(L=>({name:L,routes:w.filter(k=>k.meta.section===L)})).filter(L=>L.routes.length)),b=ee(()=>{var L;return((L=ni.currentRoute.value.meta)==null?void 0:L.label)||"Odin"}),v=ee(()=>{var L;return((L=ni.currentRoute.value.meta)==null?void 0:L.section)||"Management"}),x=ee(()=>{var L;return((L=ni.currentRoute.value.meta)==null?void 0:L.description)||"Management console"});q.onSessionExpired=()=>{t.value=!0,Ke.disconnect(),q.setToken(""),e.value="login"};function E(L){var k;if((L.ctrlKey||L.metaKey)&&L.key.toLowerCase()==="k"){e.value==="ready"&&(L.preventDefault(),xd());return}if(n.value&&L.key==="Tab"){const $=[...((k=a.value)==null?void 0:k.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if($.length){const oe=$[0],re=$[$.length-1];if(L.shiftKey&&(document.activeElement===oe||!a.value.contains(document.activeElement))){L.preventDefault(),re.focus();return}if(!L.shiftKey&&(document.activeElement===re||!a.value.contains(document.activeElement))){L.preventDefault(),oe.focus();return}}}if(L.key==="Escape"&&n.value){n.value=!1,L.preventDefault();return}if(L.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(L.target.tagName)){L.preventDefault();const $=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');$&&$.focus()}}function N(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}$e(async()=>{document.addEventListener("keydown",E),r=window.matchMedia("(max-width: 900px)"),N(),r.addEventListener("change",N);const L=await q.check();L.ok?(e.value="ready",B()):L.needsAuth?e.value="login":(e.value="ready",B())});function O(){t.value=!1,e.value="ready",B()}async function S(){await q.logout(),Ke.disconnect(),e.value="login"}function I(){s.value=!s.value}function D(){n.value=!n.value}ns(n,async L=>{var k,$;if(L)o=document.activeElement,await St(),($=(k=a.value)==null?void 0:k.querySelector(".nav-item"))==null||$.focus();else if(o!=null&&o.isConnected){const oe=o;o=null,requestAnimationFrame(()=>oe.focus())}});const H=ee(()=>{switch(u.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function F(L,k="info",$=3e3){f.value={text:L,level:k},clearTimeout(p),p=setTimeout(()=>{f.value=null},$)}let M=null,W=!1;function B(){Ke.onStatusChange=L=>{c.value=L},Ke.onStateChange=(L,k)=>{u.value=L,d.value=k.latency??-1,L==="connected"?(W&&F("Connection restored","success"),W=!0):L==="reconnecting"&&k.attempt===1&&F("Connection lost — reconnecting…","warn")},Ke.connect(),j(),M&&clearInterval(M),M=setInterval(j,15e3)}async function j(){try{const L=await q.get("/api/status");m.value=L.status==="online"?"online":"starting";const k=L.uptime_seconds||0,$=Math.floor(k/3600),oe=Math.floor(k%3600/60);g.value=`${$}h ${oe}m uptime`}catch{m.value="offline",g.value=""}}return ft(()=>{M&&clearInterval(M),Ke.disconnect(),document.removeEventListener("keydown",E),r==null||r.removeEventListener("change",N)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:u,wsLatency:d,wsLabel:H,wsToast:f,botStatus:m,botUptime:g,navRoutes:w,navGroups:R,currentPage:b,currentSection:v,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:O,logout:S,toggleSidebar:I,toggleMobileNavigation:D,openPalette:xd}}},yn=wl(Yw);yn.component("odin-icon",L_);yn.component("login-screen",Jw);yn.component("toast-container",yx);yn.component("confirm-host",xx);yn.component("command-palette",N_);yn.directive("modal-focus",D_);yn.use(ni);yn.mount("#app");
