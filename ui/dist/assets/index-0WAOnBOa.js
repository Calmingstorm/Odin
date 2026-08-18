var Gm=Object.defineProperty;var Km=(e,t,s)=>t in e?Gm(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var rt=(e,t,s)=>Km(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Wm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new ol("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new ld(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new ol("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new ld((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ol((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ol?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ol extends Error{constructor(t){super(t),this.name="AuthError"}}class ld extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Zm{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const G=new Wm,Ke=new Zm(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ks(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const je={},Na=[],Ht=()=>{},Ia=()=>!1,ca=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),cr=e=>e.startsWith("onUpdate:"),ze=Object.assign,Jo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Jm=Object.prototype.hasOwnProperty,tt=(e,t)=>Jm.call(e,t),be=Array.isArray,La=e=>ei(e)==="[object Map]",da=e=>ei(e)==="[object Set]",rd=e=>ei(e)==="[object Date]",Ym=e=>ei(e)==="[object RegExp]",Ie=e=>typeof e=="function",Me=e=>typeof e=="string",Jt=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",Yo=e=>(Xe(e)||Ie(e))&&Ie(e.then)&&Ie(e.catch),df=Object.prototype.toString,ei=e=>df.call(e),Qm=e=>ei(e).slice(8,-1),dr=e=>ei(e)==="[object Object]",ur=e=>Me(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,bn=ks(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Xm=ks("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),fr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},eg=/-\w/g,it=fr(e=>e.replace(eg,t=>t.slice(1).toUpperCase())),tg=/\B([A-Z])/g,ps=fr(e=>e.replace(tg,"-$1").toLowerCase()),ua=fr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Da=fr(e=>e?`on${ua(e)}`:""),Lt=(e,t)=>!Object.is(e,t),Ma=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},uf=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},pr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Ll=e=>{const t=Me(e)?Number(e):NaN;return isNaN(t)?e:t};let od;const hr=()=>od||(od=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function sg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const ng="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",ag=ks(ng);function Ji(e){if(be(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Me(n)?ff(n):Ji(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Me(e)||Xe(e))return e}const ig=/;(?![^(]*\))/g,lg=/:([^]+)/,rg=/\/\*[^]*?\*\//g;function ff(e){const t={};return e.replace(rg,"").split(ig).forEach(s=>{if(s){const n=s.split(lg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Yi(e){let t="";if(Me(e))t=e;else if(be(e))for(let s=0;s<e.length;s++){const n=Yi(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function og(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Me(t)&&(e.class=Yi(t)),s&&(e.style=Ji(s)),e}const cg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",dg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",ug="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",fg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",pg=ks(cg),hg=ks(dg),mg=ks(ug),gg=ks(fg),vg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",bg=ks(vg);function pf(e){return!!e||e===""}function yg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=kn(e[n],t[n]);return s}function kn(e,t){if(e===t)return!0;let s=rd(e),n=rd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Jt(e),n=Jt(t),s||n)return e===t;if(s=be(e),n=be(t),s||n)return s&&n?yg(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!kn(e[l],t[l]))return!1}}return String(e)===String(t)}function mr(e,t){return e.findIndex(s=>kn(s,t))}const hf=e=>!!(e&&e.__v_isRef===!0),mf=e=>Me(e)?e:e==null?"":be(e)||Xe(e)&&(e.toString===df||!Ie(e.toString))?hf(e)?mf(e.value):JSON.stringify(e,gf,2):String(e),gf=(e,t)=>hf(t)?gf(e,t.value):La(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Ur(n,i)+" =>"]=a,s),{})}:da(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Ur(s))}:Jt(t)?Ur(t):Xe(t)&&!be(t)&&!dr(t)?String(t):t,Ur=(e,t="")=>{var s;return Jt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function xg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let At;class Qo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&At&&(At.active?(this.parent=At,this.index=(At.scopes||(At.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=At;try{return At=this,t()}finally{At=s}}}on(){++this._on===1&&(this.prevScope=At,At=this)}off(){if(this._on>0&&--this._on===0){if(At===this)At=this.prevScope;else{let t=At;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function _g(e){return new Qo(e)}function vf(){return At}function kg(e,t=!1){At&&At.cleanups.push(e)}let ot;const Hr=new WeakSet;class Ni{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,At&&(At.active?At.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Hr.has(this)&&(Hr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||yf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,cd(this),xf(this);const t=ot,s=zs;ot=this,zs=!0;try{return this.fn()}finally{_f(this),ot=t,zs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)tc(t);this.deps=this.depsTail=void 0,cd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Hr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){mo(this)&&this.run()}get dirty(){return mo(this)}}let bf=0,_i,ki;function yf(e,t=!1){if(e.flags|=8,t){e.next=ki,ki=e;return}e.next=_i,_i=e}function Xo(){bf++}function ec(){if(--bf>0)return;if(ki){let t=ki;for(ki=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;_i;){let t=_i;for(_i=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function xf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function _f(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),tc(n),wg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function mo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(kf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function kf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Li)||(e.globalVersion=Li,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!mo(e))))return;e.flags|=2;const t=e.dep,s=ot,n=zs;ot=e,zs=!0;try{xf(e);const a=e.fn(e._value);(t.version===0||Lt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ot=s,zs=n,_f(e),e.flags&=-3}}function tc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)tc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function wg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Sg(e,t){e.effect instanceof Ni&&(e=e.effect.fn);const s=new Ni(e);t&&ze(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Tg(e){e.effect.stop()}let zs=!0;const wf=[];function wn(){wf.push(zs),zs=!1}function Sn(){const e=wf.pop();zs=e===void 0?!0:e}function cd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ot;ot=void 0;try{t()}finally{ot=s}}}let Li=0;class Cg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class gr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ot||!zs||ot===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ot)s=this.activeLink=new Cg(ot,this),ot.deps?(s.prevDep=ot.depsTail,ot.depsTail.nextDep=s,ot.depsTail=s):ot.deps=ot.depsTail=s,Sf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ot.depsTail,s.nextDep=void 0,ot.depsTail.nextDep=s,ot.depsTail=s,ot.deps===s&&(ot.deps=n)}return s}trigger(t){this.version++,Li++,this.notify(t)}notify(t){Xo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{ec()}}}function Sf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Sf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Dl=new WeakMap,ea=Symbol(""),go=Symbol(""),Di=Symbol("");function Kt(e,t,s){if(zs&&ot){let n=Dl.get(e);n||Dl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new gr),a.map=n,a.key=s),a.track()}}function pn(e,t,s,n,a,i){const l=Dl.get(e);if(!l){Li++;return}const r=o=>{o&&o.trigger()};if(Xo(),t==="clear")l.forEach(r);else{const o=be(e),c=o&&ur(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,f)=>{(f==="length"||f===Di||!Jt(f)&&f>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Di)),t){case"add":o?c&&r(l.get("length")):(r(l.get(ea)),La(e)&&r(l.get(go)));break;case"delete":o||(r(l.get(ea)),La(e)&&r(l.get(go)));break;case"set":La(e)&&r(l.get(ea));break}}ec()}function Eg(e,t){const s=Dl.get(e);return s&&s.get(t)}function xa(e){const t=Je(e);return t===e?t:(Kt(t,"iterate",Di),ms(e)?t:t.map(js))}function vr(e){return Kt(e=Je(e),"iterate",Di),e}function Xs(e,t){return tn(e)?za(yn(e)?js(t):t):js(t)}const Ag={__proto__:null,[Symbol.iterator](){return zr(this,Symbol.iterator,e=>Xs(this,e))},concat(...e){return xa(this).concat(...e.map(t=>be(t)?xa(t):t))},entries(){return zr(this,"entries",e=>(e[1]=Xs(this,e[1]),e))},every(e,t){return an(this,"every",e,t,void 0,arguments)},filter(e,t){return an(this,"filter",e,t,s=>s.map(n=>Xs(this,n)),arguments)},find(e,t){return an(this,"find",e,t,s=>Xs(this,s),arguments)},findIndex(e,t){return an(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return an(this,"findLast",e,t,s=>Xs(this,s),arguments)},findLastIndex(e,t){return an(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return an(this,"forEach",e,t,void 0,arguments)},includes(...e){return Vr(this,"includes",e)},indexOf(...e){return Vr(this,"indexOf",e)},join(e){return xa(this).join(e)},lastIndexOf(...e){return Vr(this,"lastIndexOf",e)},map(e,t){return an(this,"map",e,t,void 0,arguments)},pop(){return ri(this,"pop")},push(...e){return ri(this,"push",e)},reduce(e,...t){return dd(this,"reduce",e,t)},reduceRight(e,...t){return dd(this,"reduceRight",e,t)},shift(){return ri(this,"shift")},some(e,t){return an(this,"some",e,t,void 0,arguments)},splice(...e){return ri(this,"splice",e)},toReversed(){return xa(this).toReversed()},toSorted(e){return xa(this).toSorted(e)},toSpliced(...e){return xa(this).toSpliced(...e)},unshift(...e){return ri(this,"unshift",e)},values(){return zr(this,"values",e=>Xs(this,e))}};function zr(e,t,s){const n=vr(e),a=n[t]();return n!==e&&!ms(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Rg=Array.prototype;function an(e,t,s,n,a,i){const l=vr(e),r=l!==e&&!ms(e),o=l[t];if(o!==Rg[t]){const u=o.apply(e,i);return r?js(u):u}let c=s;l!==e&&(r?c=function(u,f){return s.call(this,Xs(e,u),f,e)}:s.length>2&&(c=function(u,f){return s.call(this,u,f,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function dd(e,t,s,n){const a=vr(e),i=a!==e&&!ms(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=Xs(e,c)),s.call(this,c,Xs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?Xs(e,o):o}function Vr(e,t,s){const n=Je(e);Kt(n,"iterate",Di);const a=n[t](...s);return(a===-1||a===!1)&&Qi(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function ri(e,t,s=[]){wn(),Xo();const n=Je(e)[t].apply(e,s);return ec(),Sn(),n}const Ig=ks("__proto__,__v_isRef,__isVue"),Tf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Jt));function Og(e){Jt(e)||(e=String(e));const t=Je(this);return Kt(t,"has",e),t.hasOwnProperty(e)}class Cf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Nf:Of:i?If:Rf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=be(t);if(!a){let o;if(l&&(o=Ag[s]))return o;if(s==="hasOwnProperty")return Og}const r=Reflect.get(t,s,St(t)?t:n);if((Jt(s)?Tf.has(s):Ig(s))||(a||Kt(t,"get",s),i))return r;if(St(r)){const o=l&&ur(s)?r:r.value;return a&&Xe(o)?Ml(o):o}return Xe(r)?a?Ml(r):Hn(r):r}}class Ef extends Cf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=be(t)&&ur(s);if(!this._isShallow){const c=tn(i);if(!ms(n)&&!tn(n)&&(i=Je(i),n=Je(n)),!l&&St(i)&&!St(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:tt(t,s),o=Reflect.set(t,s,n,St(t)?t:a);return t===Je(a)&&(r?Lt(n,i)&&pn(t,"set",s,n):pn(t,"add",s,n)),o}deleteProperty(t,s){const n=tt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&pn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Jt(s)||!Tf.has(s))&&Kt(t,"has",s),n}ownKeys(t){return Kt(t,"iterate",be(t)?"length":ea),Reflect.ownKeys(t)}}class Af extends Cf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Ng=new Ef,Lg=new Af,Dg=new Ef(!0),Mg=new Af(!0),vo=e=>e,cl=e=>Reflect.getPrototypeOf(e);function Pg(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=La(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?vo:t?za:js;return!t&&Kt(i,"iterate",o?go:ea),ze(Object.create(c),{next(){const{value:u,done:f}=c.next();return f?{value:u,done:f}:{value:r?[d(u[0]),d(u[1])]:d(u),done:f}}})}}function dl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Fg(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Lt(a,r)&&Kt(l,"get",a),Kt(l,"get",r));const{has:o}=cl(l),c=t?vo:e?za:js;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Kt(Je(a),"iterate",ea),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Lt(a,r)&&Kt(l,"has",a),Kt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?vo:e?za:js;return!e&&Kt(o,"iterate",ea),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return ze(s,e?{add:dl("add"),set:dl("set"),delete:dl("delete"),clear:dl("clear")}:{add(a){const i=Je(this),l=cl(i),r=Je(a),o=!t&&!ms(a)&&!tn(a)?r:a;return l.has.call(i,o)||Lt(a,o)&&l.has.call(i,a)||Lt(r,o)&&l.has.call(i,r)||(i.add(o),pn(i,"add",o,o)),this},set(a,i){!t&&!ms(i)&&!tn(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=cl(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Lt(i,d)&&pn(l,"set",a,i):pn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=cl(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&pn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&pn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Pg(a,e,t)}),s}function br(e,t){const s=Fg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(tt(s,a)&&a in n?s:n,a,i)}const $g={get:br(!1,!1)},Bg={get:br(!1,!0)},Ug={get:br(!0,!1)},Hg={get:br(!0,!0)},Rf=new WeakMap,If=new WeakMap,Of=new WeakMap,Nf=new WeakMap;function zg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Hn(e){return tn(e)?e:yr(e,!1,Ng,$g,Rf)}function sc(e){return yr(e,!1,Dg,Bg,If)}function Ml(e){return yr(e,!0,Lg,Ug,Of)}function Vg(e){return yr(e,!0,Mg,Hg,Nf)}function yr(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=zg(Qm(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function yn(e){return tn(e)?yn(e.__v_raw):!!(e&&e.__v_isReactive)}function tn(e){return!!(e&&e.__v_isReadonly)}function ms(e){return!!(e&&e.__v_isShallow)}function Qi(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function Lf(e){return!tt(e,"__v_skip")&&Object.isExtensible(e)&&uf(e,"__v_skip",!0),e}const js=e=>Xe(e)?Hn(e):e,za=e=>Xe(e)?Ml(e):e;function St(e){return e?e.__v_isRef===!0:!1}function h(e){return Df(e,!1)}function nc(e){return Df(e,!0)}function Df(e,t){return St(e)?e:new jg(e,t)}class jg{constructor(t,s){this.dep=new gr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:js(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ms(t)||tn(t);t=n?t:Je(t),Lt(t,s)&&(this._rawValue=t,this._value=n?t:js(t),this.dep.trigger())}}function qg(e){e.dep&&e.dep.trigger()}function en(e){return St(e)?e.value:e}function Gg(e){return Ie(e)?e():en(e)}const Kg={get:(e,t,s)=>t==="__v_raw"?e:en(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return St(a)&&!St(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function ac(e){return yn(e)?e:new Proxy(e,Kg)}class Wg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new gr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Mf(e){return new Wg(e)}function Zg(e){const t=be(e)?new Array(e.length):{};for(const s in e)t[s]=Pf(e,s);return t}class Jg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Jt(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!be(t)||Jt(this._key)||!ur(this._key))do a=!Qi(i)||ms(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=en(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&St(this._raw[this._key])){const s=this._object[this._key];if(St(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Eg(this._raw,this._key)}}class Yg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Qg(e,t,s){return St(e)?e:Ie(e)?new Yg(e):Xe(e)&&arguments.length>1?Pf(e,t,s):h(e)}function Pf(e,t,s){return new Jg(e,t,s)}class Xg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new gr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Li-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ot!==this)return yf(this,!0),!0}get value(){const t=this.dep.track();return kf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function ev(e,t,s=!1){let n,a;return Ie(e)?n=e:(n=e.get,a=e.set),new Xg(n,a,s)}const tv={GET:"get",HAS:"has",ITERATE:"iterate"},sv={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},ul={},Pl=new WeakMap;let Dn;function nv(){return Dn}function Ff(e,t=!1,s=Dn){if(s){let n=Pl.get(s);n||Pl.set(s,n=[]),n.push(e)}}function av(e,t,s=je){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:ms(_)||a===!1||a===0?hn(_,1):hn(_);let d,u,f,p,b=!1,y=!1;if(St(e)?(u=()=>e.value,b=ms(e)):yn(e)?(u=()=>c(e),b=!0):be(e)?(y=!0,b=e.some(_=>yn(_)||ms(_)),u=()=>e.map(_=>{if(St(_))return _.value;if(yn(_))return c(_);if(Ie(_))return o?o(_,2):_()})):Ie(e)?t?u=o?()=>o(e,2):e:u=()=>{if(f){wn();try{f()}finally{Sn()}}const _=Dn;Dn=d;try{return o?o(e,3,[p]):e(p)}finally{Dn=_}}:u=Ht,t&&a){const _=u,S=a===!0?1/0:a;u=()=>hn(_(),S)}const E=vf(),I=()=>{d.stop(),E&&E.active&&Jo(E.effects,d)};if(i&&t){const _=t;t=(...S)=>{const g=_(...S);return I(),g}}let x=y?new Array(e.length).fill(ul):ul;const m=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const S=d.run();if(_||a||b||(y?S.some((g,w)=>Lt(g,x[w])):Lt(S,x))){f&&f();const g=Dn;Dn=d;try{const w=[S,x===ul?void 0:y&&x[0]===ul?[]:x,p];x=S,o?o(t,3,w):t(...w)}finally{Dn=g}}}else d.run()};return r&&r(m),d=new Ni(u),d.scheduler=l?()=>l(m,!1):m,p=_=>Ff(_,!1,d),f=d.onStop=()=>{const _=Pl.get(d);if(_){if(o)o(_,4);else for(const S of _)S();Pl.delete(d)}},t?n?m(!0):x=d.run():l?l(m.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function hn(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,St(e))hn(e.value,t,s);else if(be(e))for(let n=0;n<e.length;n++)hn(e[n],t,s);else if(da(e)||La(e))e.forEach(n=>{hn(n,t,s)});else if(dr(e)){for(const n in e)hn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&hn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $f=[];function iv(e){$f.push(e)}function lv(){$f.pop()}function rv(e,t){}const ov={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},cv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function ti(e,t,s,n){try{return n?e(...n):e()}catch(a){fa(a,t,s)}}function xs(e,t,s,n){if(Ie(e)){const a=ti(e,t,s,n);return a&&Yo(a)&&a.catch(i=>{fa(i,t,s)}),a}if(be(e)){const a=[];for(let i=0;i<e.length;i++)a.push(xs(e[i],t,s,n));return a}}function fa(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||je;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){wn(),ti(i,null,10,[e,o,c]),Sn();return}}dv(e,s,a,n,l)}function dv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ts=[];let Ys=-1;const Pa=[];let Mn=null,Ca=0;const Bf=Promise.resolve();let Fl=null;function Rt(e){const t=Fl||Bf;return e?t.then(this?e.bind(this):e):t}function uv(e){let t=Ys+1,s=ts.length;for(;t<s;){const n=t+s>>>1,a=ts[n],i=Pi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function ic(e){if(!(e.flags&1)){const t=Pi(e),s=ts[ts.length-1];!s||!(e.flags&2)&&t>=Pi(s)?ts.push(e):ts.splice(uv(t),0,e),e.flags|=1,Uf()}}function Uf(){Fl||(Fl=Bf.then(Hf))}function Mi(e){be(e)?Pa.push(...e):Mn&&e.id===-1?Mn.splice(Ca+1,0,e):e.flags&1||(Pa.push(e),e.flags|=1),Uf()}function ud(e,t,s=Ys+1){for(;s<ts.length;s++){const n=ts[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ts.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function $l(e){if(Pa.length){const t=[...new Set(Pa)].sort((s,n)=>Pi(s)-Pi(n));if(Pa.length=0,Mn){Mn.push(...t);return}for(Mn=t,Ca=0;Ca<Mn.length;Ca++){const s=Mn[Ca];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Mn=null,Ca=0}}const Pi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Hf(e){try{for(Ys=0;Ys<ts.length;Ys++){const t=ts[Ys];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),ti(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ys<ts.length;Ys++){const t=ts[Ys];t&&(t.flags&=-2)}Ys=-1,ts.length=0,$l(),Fl=null,(ts.length||Pa.length)&&Hf()}}let Ea,fl=[];function zf(e,t){var s,n;Ea=e,Ea?(Ea.enabled=!0,fl.forEach(({event:a,args:i})=>Ea.emit(a,...i)),fl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{zf(i,t)}),setTimeout(()=>{Ea||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,fl=[])},3e3)):fl=[]}let Ut=null,xr=null;function Fi(e){const t=Ut;return Ut=e,xr=e&&e.type.__scopeId||null,t}function fv(e){xr=e}function pv(){xr=null}const hv=e=>lc;function lc(e,t=Ut,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Hi(-1);const i=Fi(t);let l;try{l=e(...a)}finally{Fi(i),n._d&&Hi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function mv(e,t){if(Ut===null)return e;const s=sl(Ut),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=je]=t[a];i&&(Ie(i)&&(i={mounted:i,updated:i}),i.deep&&hn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Qs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(wn(),xs(o,s,8,[e.el,r,e,t]),Sn())}}function wi(e,t){if(Bt){let s=Bt.provides;const n=Bt.parent&&Bt.parent.provides;n===s&&(s=Bt.provides=Object.create(n)),s[e]=t}}function Os(e,t,s=!1){const n=as();if(n||ta){let a=ta?ta._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Ie(t)?t.call(n&&n.proxy):t}}function gv(){return!!(as()||ta)}const Vf=Symbol.for("v-scx"),jf=()=>Os(Vf);function vv(e,t){return Xi(e,null,t)}function bv(e,t){return Xi(e,null,{flush:"post"})}function qf(e,t){return Xi(e,null,{flush:"sync"})}function ns(e,t,s){return Xi(e,t,s)}function Xi(e,t,s=je){const{immediate:n,deep:a,flush:i,once:l}=s,r=ze({},s),o=t&&n||!t&&i!=="post";let c;if(la){if(i==="sync"){const p=jf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Ht,p.resume=Ht,p.pause=Ht,p}}const d=Bt;r.call=(p,b,y)=>xs(p,d,b,y);let u=!1;i==="post"?r.scheduler=p=>{kt(p,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(p,b)=>{b?p():ic(p)}),r.augmentJob=p=>{t&&(p.flags|=4),u&&(p.flags|=2,d&&(p.id=d.uid,p.i=d))};const f=av(e,t,r);return la&&(c?c.push(f):o&&f()),f}function yv(e,t,s){const n=this.proxy,a=Me(e)?e.includes(".")?Gf(n,e):()=>n[e]:e.bind(n,n);let i;Ie(t)?i=t:(i=t.handler,s=t);const l=si(this),r=Xi(a,i.bind(n),s);return l(),r}function Gf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Nn=new WeakMap,Kf=Symbol("_vte"),Wf=e=>e.__isTeleport,Jn=e=>e&&(e.disabled||e.disabled===""),xv=e=>e&&(e.defer||e.defer===""),fd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,pd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,bo=(e,t)=>{const s=e&&e.to;return Me(s)?t?t(s):null:s},_v={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:f,o:{insert:p,querySelector:b,createText:y,createComment:E,parentNode:I}}=c,x=Jn(t.props);let{dynamicChildren:m}=t;const _=(w,T,C)=>{w.shapeFlag&16&&d(w.children,T,C,a,i,l,r,o)},S=(w=t)=>{const T=Jn(w.props),C=w.target=bo(w.props,b),M=yo(C,w,y,p);C&&(l!=="svg"&&fd(C)?l="svg":l!=="mathml"&&pd(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),T||(_(w,C,M),gi(w,!1)))},g=w=>{const T=()=>{if(Nn.get(w)===T){if(Nn.delete(w),Jn(w.props)){const C=I(w.el)||s;_(w,C,w.anchor),gi(w,!0)}S(w)}};Nn.set(w,T),kt(T,i)};if(e==null){const w=t.el=y(""),T=t.anchor=y("");if(p(w,s,n),p(T,s,n),xv(t.props)||i&&i.pendingBranch){g(t);return}x&&(_(t,s,T),gi(t,!0)),S()}else{t.el=e.el;const w=t.anchor=e.anchor,T=Nn.get(e);if(T){T.flags|=8,Nn.delete(e),g(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,M=t.targetAnchor=e.targetAnchor,H=Jn(e.props),P=H?s:C,R=H?w:M;if(l==="svg"||fd(C)?l="svg":(l==="mathml"||pd(C))&&(l="mathml"),m?(f(e.dynamicChildren,m,P,a,i,l,r),vc(e,t,!0)):o||u(e,t,P,R,a,i,l,r,!1),x)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):pl(t,s,w,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const j=t.target=bo(t.props,b);j&&pl(t,j,null,c,0)}else H&&pl(t,C,M,c,1);gi(t,x)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:f}=e,p=i||!Jn(f),b=Nn.get(e);if(b&&(b.flags|=8,Nn.delete(e)),u&&(a(c),a(d)),i&&a(o),!b&&l&16)for(let y=0;y<r.length;y++){const E=r[y];n(E,t,s,p,!!E.dynamicChildren)}},move:pl,hydrate:kv};function pl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Nn.has(e)&&(!u||Jn(d))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);u&&n(r,t,s)}function kv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function f(E,I){let x=I;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function p(E,I){I.anchor=u(l(E),I,r(E),s,n,a,i)}const b=t.target=bo(t.props,o),y=Jn(t.props);if(b){const E=b._lpa||b.firstChild;t.shapeFlag&16&&(y?(p(e,t),f(b,E),t.targetAnchor||yo(b,t,d,c,r(e)===b?e:null)):(t.anchor=l(e),f(b,E),t.targetAnchor||yo(b,t,d,c),u(E&&l(E),t,b,s,n,a,i))),gi(t,y)}else y&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const wv=_v;function gi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function yo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Kf]=l,e&&(n(i,e,a),n(l,e,a)),l}const As=Symbol("_leaveCb"),oi=Symbol("_enterCb");function rc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return We(()=>{e.isMounted=!0}),Sr(()=>{e.isUnmounting=!0}),e}const Es=[Function,Array],oc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Es,onEnter:Es,onAfterEnter:Es,onEnterCancelled:Es,onBeforeLeave:Es,onLeave:Es,onAfterLeave:Es,onLeaveCancelled:Es,onBeforeAppear:Es,onAppear:Es,onAfterAppear:Es,onAppearCancelled:Es},Zf=e=>{const t=e.subTree;return t.component?Zf(t.component):t},Sv={name:"BaseTransition",props:oc,setup(e,{slots:t}){const s=as(),n=rc();return()=>{const a=t.default&&_r(t.default(),!0),i=a&&a.length?Jf(a):s.subTree?Np():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return jr(i);const o=hd(i);if(!o)return jr(i);let c=Va(o,l,n,s,u=>c=u);o.type!==yt&&Tn(o,c);let d=s.subTree&&hd(s.subTree);if(d&&d.type!==yt&&!Hs(d,o)&&Zf(s).type!==yt){let u=Va(d,l,n,s);if(Tn(d,u),r==="out-in"&&o.type!==yt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},jr(i);r==="in-out"&&o.type!==yt?u.delayLeave=(f,p,b)=>{const y=Qf(n,d);y[String(d.key)]=d,f[As]=()=>{p(),f[As]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{b(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Jf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==yt){t=s;break}}return t}const Yf=Sv;function Qf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Va(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:f,onLeave:p,onAfterLeave:b,onLeaveCancelled:y,onBeforeAppear:E,onAppear:I,onAfterAppear:x,onAppearCancelled:m}=t,_=String(e.key),S=Qf(s,e),g=(C,M)=>{C&&xs(C,n,9,M)},w=(C,M)=>{const H=M[1];g(C,M),be(C)?C.every(P=>P.length<=1)&&H():C.length<=1&&H()},T={mode:l,persisted:r,beforeEnter(C){let M=o;if(!s.isMounted)if(i)M=E||o;else return;C[As]&&C[As](!0);const H=S[_];H&&Hs(e,H)&&H.el[As]&&H.el[As](),g(M,[C])},enter(C){if(S[_]===e)return;let M=c,H=d,P=u;if(!s.isMounted)if(i)M=I||c,H=x||d,P=m||u;else return;let R=!1;C[oi]=Q=>{R||(R=!0,Q?g(P,[C]):g(H,[C]),T.delayedLeave&&T.delayedLeave(),C[oi]=void 0)};const j=C[oi].bind(null,!1);M?w(M,[C,j]):j()},leave(C,M){const H=String(e.key);if(C[oi]&&C[oi](!0),s.isUnmounting)return M();g(f,[C]);let P=!1;C[As]=j=>{P||(P=!0,M(),j?g(y,[C]):g(b,[C]),C[As]=void 0,S[H]===e&&delete S[H])};const R=C[As].bind(null,!1);S[H]=e,p?w(p,[C,R]):R()},clone(C){const M=Va(C,t,s,n,a);return a&&a(M),M}};return T}function jr(e){if(tl(e))return e=sn(e),e.children=null,e}function hd(e){if(!tl(e))return Wf(e.type)&&e.children?Jf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ie(s.default))return s.default()}}function Tn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Tn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function _r(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Dt?(l.patchFlag&128&&a++,n=n.concat(_r(l.children,t,r))):(t||l.type!==yt)&&n.push(r!=null?sn(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function el(e,t){return Ie(e)?ze({name:e.name},t,{setup:e}):e}function Tv(){const e=as();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function cc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Cv(e){const t=as(),s=nc(null);if(t){const a=t.refs===je?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function md(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Bl=new WeakMap;function Fa(e,t,s,n,a=!1){if(be(e)){e.forEach((y,E)=>Fa(y,t&&(be(t)?t[E]:t),s,n,a));return}if(xn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Fa(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?sl(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===je?r.refs={}:r.refs,u=r.setupState,f=Je(u),p=u===je?Ia:y=>md(d,y)?!1:tt(f,y),b=(y,E)=>!(E&&md(d,E));if(c!=null&&c!==o){if(gd(t),Me(c))d[c]=null,p(c)&&(u[c]=null);else if(St(c)){const y=t;b(c,y.k)&&(c.value=null),y.k&&(d[y.k]=null)}}if(Ie(o))ti(o,r,12,[l,d]);else{const y=Me(o),E=St(o);if(y||E){const I=()=>{if(e.f){const x=y?p(o)?u[o]:d[o]:b()||!e.k?o.value:d[e.k];if(a)be(x)&&Jo(x,i);else if(be(x))x.includes(i)||x.push(i);else if(y)d[o]=[i],p(o)&&(u[o]=d[o]);else{const m=[i];b(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else y?(d[o]=l,p(o)&&(u[o]=l)):E&&(b(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{I(),Bl.delete(e)};x.id=-1,Bl.set(e,x),kt(x,s)}else gd(e),I()}}}function gd(e){const t=Bl.get(e);t&&(t.flags|=8,Bl.delete(e))}let vd=!1;const _a=()=>{vd||(console.error("Hydration completed but contains mismatches."),vd=!0)},Ev=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Av=e=>e.namespaceURI.includes("MathML"),hl=e=>{if(e.nodeType===1){if(Ev(e))return"svg";if(Av(e))return"mathml"}},Oa=e=>e.nodeType===8;function Rv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,_)=>{if(!_.hasChildNodes()){s(null,m,_),$l(),_._vnode=m;return}u(_.firstChild,m,null,null,null),$l(),_._vnode=m},u=(m,_,S,g,w,T=!1)=>{T=T||!!_.dynamicChildren;const C=Oa(m)&&m.data==="[",M=()=>y(m,_,S,g,w,C),{type:H,ref:P,shapeFlag:R,patchFlag:j}=_;let Q=m.nodeType;_.el=m,j===-2&&(T=!1,_.dynamicChildren=null);let U=null;switch(H){case $n:Q!==3?_.children===""?(o(_.el=a(""),l(m),m),U=m):U=M():(m.data!==_.children&&(_a(),m.data=_.children),U=i(m));break;case yt:x(m)?(U=i(m),I(_.el=m.content.firstChild,m,S)):Q!==8||C?U=M():U=i(m);break;case sa:if(C&&(m=i(m),Q=m.nodeType),Q===1||Q===3){U=m;const O=!_.children.length;for(let N=0;N<_.staticCount;N++)O&&(_.children+=U.nodeType===1?U.outerHTML:U.data),N===_.staticCount-1&&(_.anchor=U),U=i(U);return C?i(U):U}else M();break;case Dt:C?U=b(m,_,S,g,w,T):U=M();break;default:if(R&1)(Q!==1||_.type.toLowerCase()!==m.tagName.toLowerCase())&&!x(m)?U=M():U=f(m,_,S,g,w,T);else if(R&6){_.slotScopeIds=w;const O=l(m);if(C?U=E(m):Oa(m)&&m.data==="teleport start"?U=E(m,m.data,"teleport end"):U=i(m),t(_,O,null,S,g,hl(O),T),xn(_)&&!_.type.__asyncResolved){let N;C?(N=ft(Dt),N.anchor=U?U.previousSibling:O.lastChild):N=m.nodeType===3?yc(""):ft("div"),N.el=m,_.component.subTree=N}}else R&64?Q!==8?U=M():U=_.type.hydrate(m,_,S,g,w,T,e,p):R&128&&(U=_.type.hydrate(m,_,S,g,hl(l(m)),w,T,e,u))}return P!=null&&Fa(P,null,g,_),U},f=(m,_,S,g,w,T)=>{T=T||!!_.dynamicChildren;const{type:C,props:M,patchFlag:H,shapeFlag:P,dirs:R,transition:j}=_,Q=C==="input"||C==="option";if(Q||H!==-1){R&&Qs(_,null,S,"created");let U=!1;if(x(m)){U=wp(null,j)&&S&&S.vnode.props&&S.vnode.props.appear;const N=m.content.firstChild;if(U){const Y=N.getAttribute("class");Y&&(N.$cls=Y),j.beforeEnter(N)}I(N,m,S),_.el=m=N}if(P&16&&!(M&&(M.innerHTML||M.textContent))){let N=p(m.firstChild,_,m,S,g,w,T);for(N&&!ml(m,1)&&_a();N;){const Y=N;N=N.nextSibling,r(Y)}}else if(P&8){let N=_.children;N[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(N=N.slice(1));const{textContent:Y}=m;Y!==N&&Y!==N.replace(/\r\n|\r/g,`
`)&&(ml(m,0)||_a(),m.textContent=_.children)}if(M){if(Q||!T||H&48){const N=m.tagName.includes("-");for(const Y in M)(Q&&(Y.endsWith("value")||Y==="indeterminate")||ca(Y)&&!bn(Y)||Y[0]==="."||N&&!bn(Y))&&n(m,Y,null,M[Y],void 0,S)}else if(M.onClick)n(m,"onClick",null,M.onClick,void 0,S);else if(H&4&&yn(M.style))for(const N in M.style)M.style[N]}let O;(O=M&&M.onVnodeBeforeMount)&&ds(O,S,_),R&&Qs(_,null,S,"beforeMount"),((O=M&&M.onVnodeMounted)||R||U)&&Ep(()=>{O&&ds(O,S,_),U&&j.enter(m),R&&Qs(_,null,S,"mounted")},g)}return m.nextSibling},p=(m,_,S,g,w,T,C)=>{C=C||!!_.dynamicChildren;const M=_.children,H=M.length;let P=!1;for(let R=0;R<H;R++){const j=C?M[R]:M[R]=fs(M[R]),Q=j.type===$n;m?(Q&&!C&&R+1<H&&fs(M[R+1]).type===$n&&(o(a(m.data.slice(j.children.length)),S,i(m)),m.data=j.children),m=u(m,j,g,w,T,C)):Q&&!j.children?o(j.el=a(""),S):(P||(P=!0,ml(S,1)||_a()),s(null,j,S,null,g,w,hl(S),T))}return m},b=(m,_,S,g,w,T)=>{const{slotScopeIds:C}=_;C&&(w=w?w.concat(C):C);const M=l(m),H=p(i(m),_,M,S,g,w,T);return H&&Oa(H)&&H.data==="]"?i(_.anchor=H):(_a(),o(_.anchor=c("]"),M,H),H)},y=(m,_,S,g,w,T)=>{if(ml(m.parentElement,1)||_a(),_.el=null,T){const H=E(m);for(;;){const P=i(m);if(P&&P!==H)r(P);else break}}const C=i(m),M=l(m);return r(m),s(null,_,M,C,S,g,hl(M),w),S&&(S.vnode.el=_.el,Cr(S,_.el)),C},E=(m,_="[",S="]")=>{let g=0;for(;m;)if(m=i(m),m&&Oa(m)&&(m.data===_&&g++,m.data===S)){if(g===0)return i(m);g--}return m},I=(m,_,S)=>{const g=_.parentNode;g&&g.replaceChild(m,_);let w=S;for(;w;)w.vnode.el===_&&(w.vnode.el=w.subTree.el=m),w=w.parent},x=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const bd="data-allow-mismatch",Iv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function ml(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(bd);)e=e.parentElement;const s=e&&e.getAttribute(bd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Iv[t])}}const Ov=hr().requestIdleCallback||(e=>setTimeout(e,1)),Nv=hr().cancelIdleCallback||(e=>clearTimeout(e)),Lv=(e=1e4)=>t=>{const s=Ov(t,{timeout:e});return()=>Nv(s)};function Dv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Mv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Dv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Pv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Fv=(e=[])=>(t,s)=>{Me(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function $v(e,t){if(Oa(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Oa(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const xn=e=>!!e.type.__asyncLoader;function Bv(e){Ie(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const f=()=>(u++,c=null,p()),p=()=>{let b;return c||(b=c=t().catch(y=>{if(y=y instanceof Error?y:new Error(String(y)),o)return new Promise((E,I)=>{o(y,()=>E(f()),()=>I(y),u+1)});throw y}).then(y=>b!==c&&c?c:(y&&(y.__esModule||y[Symbol.toStringTag]==="Module")&&(y=y.default),d=y,y)))};return el({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(b,y,E){let I=!1;(y.bu||(y.bu=[])).push(()=>I=!0);const x=()=>{I||E()},m=i?()=>{const _=i(x,S=>$v(b,S));_&&(y.bum||(y.bum=[])).push(_)}:x;d?m():p().then(()=>!y.isUnmounted&&m())},get __asyncResolved(){return d},setup(){const b=Bt;if(cc(b),d)return()=>gl(d,b);const y=S=>{c=null,fa(S,b,13,!n)};if(r&&b.suspense||la)return p().then(S=>()=>gl(S,b)).catch(S=>(y(S),()=>n?ft(n,{error:S}):null));const E=h(!1),I=h(),x=h(!!a);let m,_;return xt(()=>{m!=null&&clearTimeout(m),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{b.isUnmounted||(x.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!b.isUnmounted&&!E.value&&!I.value){const S=new Error(`Async component timed out after ${l}ms.`);y(S),I.value=S}},l)),p().then(()=>{b.isUnmounted||(E.value=!0,b.parent&&tl(b.parent.vnode)&&b.parent.update())}).catch(S=>{if(b.isUnmounted){c=null;return}y(S),I.value=S}),()=>{if(E.value&&d)return gl(d,b);if(I.value&&n)return ft(n,{error:I.value});if(s&&!x.value)return gl(s,b)}}})}function gl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ft(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const tl=e=>e.type.__isKeepAlive,Uv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=as(),n=s.ctx;if(!n.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,f=u("div");n.activate=(x,m,_,S,g)=>{const w=x.component;c(x,m,_,0,r),o(w.vnode,x,m,_,w,r,S,x.slotScopeIds,g),kt(()=>{w.isDeactivated=!1,w.a&&Ma(w.a);const T=x.props&&x.props.onVnodeMounted;T&&ds(T,w.parent,x)},r)},n.deactivate=x=>{const m=x.component;Hl(m.m),Hl(m.a),c(x,f,null,1,r),kt(()=>{m.da&&Ma(m.da);const _=x.props&&x.props.onVnodeUnmounted;_&&ds(_,m.parent,x),m.isDeactivated=!0},r)};function p(x){qr(x),d(x,s,r,!0)}function b(x){a.forEach((m,_)=>{const S=Ao(xn(m)?m.type.__asyncResolved||{}:m.type);S&&!x(S)&&y(_)})}function y(x){const m=a.get(x);m&&(!l||!Hs(m,l))?p(m):l&&qr(l),a.delete(x),i.delete(x)}ns(()=>[e.include,e.exclude],([x,m])=>{x&&b(_=>vi(x,_)),m&&b(_=>!vi(m,_))},{flush:"post",deep:!0});let E=null;const I=()=>{E!=null&&(zl(s.subTree.type)?kt(()=>{a.set(E,vl(s.subTree))},s.subTree.suspense):a.set(E,vl(s.subTree)))};return We(I),wr(I),Sr(()=>{a.forEach(x=>{const{subTree:m,suspense:_}=s,S=vl(m);if(x.type===S.type&&x.key===S.key){qr(S);const g=S.component.da;g&&kt(g,_);return}p(x)})}),()=>{if(E=null,!t.default)return l=null;const x=t.default(),m=x[0];if(x.length>1)return l=null,x;if(!Cn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let _=vl(m);if(_.type===yt)return l=null,_;const S=_.type,g=Ao(xn(_)?_.type.__asyncResolved||{}:S),{include:w,exclude:T,max:C}=e;if(w&&(!g||!vi(w,g))||T&&g&&vi(T,g))return _.shapeFlag&=-257,l=_,m;const M=_.key==null?S:_.key,H=a.get(M);return _.el&&(_=sn(_),m.shapeFlag&128&&(m.ssContent=_)),E=M,H?(_.el=H.el,_.component=H.component,_.transition&&Tn(_,_.transition),_.shapeFlag|=512,i.delete(M),i.add(M)):(i.add(M),C&&i.size>parseInt(C,10)&&y(i.values().next().value)),_.shapeFlag|=256,l=_,zl(m.type)?m:_}}},Hv=Uv;function vi(e,t){return be(e)?e.some(s=>vi(s,t)):Me(e)?e.split(",").includes(t):Ym(e)?(e.lastIndex=0,e.test(t)):!1}function Ds(e,t){Xf(e,"a",t)}function Ms(e,t){Xf(e,"da",t)}function Xf(e,t,s=Bt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(kr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)tl(a.parent.vnode)&&zv(n,t,s,a),a=a.parent}}function zv(e,t,s,n){const a=kr(t,e,n,!0);xt(()=>{Jo(n[t],a)},s)}function qr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function vl(e){return e.shapeFlag&128?e.ssContent:e}function kr(e,t,s=Bt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{wn();const r=si(s),o=xs(t,s,e,l);return r(),Sn(),o});return n?a.unshift(i):a.push(i),i}}const En=e=>(t,s=Bt)=>{(!la||e==="sp")&&kr(e,(...n)=>t(...n),s)},ep=En("bm"),We=En("m"),dc=En("bu"),wr=En("u"),Sr=En("bum"),xt=En("um"),tp=En("sp"),sp=En("rtg"),np=En("rtc");function ap(e,t=Bt){kr("ec",e,t)}const uc="components",Vv="directives";function jv(e,t){return fc(uc,e,!0,t)||e}const ip=Symbol.for("v-ndc");function qv(e){return Me(e)?fc(uc,e,!1)||e:e||ip}function Gv(e){return fc(Vv,e)}function fc(e,t,s=!0,n=!1){const a=Ut||Bt;if(a){const i=a.type;if(e===uc){const r=Ao(i,!1);if(r&&(r===t||r===it(t)||r===ua(it(t))))return i}const l=yd(a[e]||i[e],t)||yd(a.appContext[e],t);return!l&&n?i:l}}function yd(e,t){return e&&(e[t]||e[it(t)]||e[ua(it(t))])}function Kv(e,t,s,n){let a;const i=s&&s[n],l=be(e);if(l||Me(e)){const r=l&&yn(e);let o=!1,c=!1;r&&(o=!ms(e),c=tn(e),e=vr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?za(js(e[d])):js(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Wv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(be(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Zv(e,t,s={},n,a){if(Ut.ce||Ut.parent&&xn(Ut.parent)&&Ut.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ui(),Vl(Dt,null,[ft("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ui();const l=i&&pc(i(s)),r=s.key||l&&l.key,o=Vl(Dt,{key:(r&&!Jt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function pc(e){return e.some(t=>Cn(t)?!(t.type===yt||t.type===Dt&&!pc(t.children)):!0)?e:null}function Jv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Da(n)]=e[n];return s}const xo=e=>e?Mp(e)?sl(e):xo(e.parent):null,Si=ze(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>xo(e.parent),$root:e=>xo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>hc(e),$forceUpdate:e=>e.f||(e.f=()=>{ic(e.update)}),$nextTick:e=>e.n||(e.n=Rt.bind(e.proxy)),$watch:e=>yv.bind(e)}),Gr=(e,t)=>e!==je&&!e.__isScriptSetup&&tt(e,t),_o={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Gr(n,t))return l[t]=1,n[t];if(a!==je&&tt(a,t))return l[t]=2,a[t];if(tt(i,t))return l[t]=3,i[t];if(s!==je&&tt(s,t))return l[t]=4,s[t];ko&&(l[t]=0)}}const c=Si[t];let d,u;if(c)return t==="$attrs"&&Kt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==je&&tt(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,tt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Gr(a,t)?(a[t]=s,!0):n!==je&&tt(n,t)?(n[t]=s,!0):tt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==je&&r[0]!=="$"&&tt(e,r)||Gr(t,r)||tt(i,r)||tt(n,r)||tt(Si,r)||tt(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:tt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Yv=ze({},_o,{get(e,t){if(t!==Symbol.unscopables)return _o.get(e,t,e)},has(e,t){return t[0]!=="_"&&!ag(t)}});function Qv(){return null}function Xv(){return null}function eb(e){}function tb(e){}function sb(){return null}function nb(){}function ab(e,t){return null}function ib(){return lp().slots}function lb(){return lp().attrs}function lp(e){const t=as();return t.setupContext||(t.setupContext=Bp(t))}function $i(e){return be(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function rb(e,t){const s=$i(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?be(a)||Ie(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function ob(e,t){return!e||!t?e||t:be(e)&&be(t)?e.concat(t):ze({},$i(e),$i(t))}function cb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function db(e){const t=as(),s=la;let n=e();zi(),s&&Ba(!1);const a=()=>{si(t),s&&Ba(!0)},i=()=>{as()!==t&&t.scope.off(),zi(),s&&Ba(!1)};return Yo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let ko=!0;function ub(e){const t=hc(e),s=e.proxy,n=e.ctx;ko=!1,t.beforeCreate&&xd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:f,beforeUpdate:p,updated:b,activated:y,deactivated:E,beforeDestroy:I,beforeUnmount:x,destroyed:m,unmounted:_,render:S,renderTracked:g,renderTriggered:w,errorCaptured:T,serverPrefetch:C,expose:M,inheritAttrs:H,components:P,directives:R,filters:j}=t;if(c&&fb(c,n,null),l)for(const O in l){const N=l[O];Ie(N)&&(n[O]=N.bind(s))}if(a){const O=a.call(s,s);Xe(O)&&(e.data=Hn(O))}if(ko=!0,i)for(const O in i){const N=i[O],Y=Ie(N)?N.bind(s,s):Ie(N.get)?N.get.bind(s,s):Ht,we=!Ie(N)&&Ie(N.set)?N.set.bind(s):Ht,ke=J({get:Y,set:we});Object.defineProperty(n,O,{enumerable:!0,configurable:!0,get:()=>ke.value,set:ie=>ke.value=ie})}if(r)for(const O in r)rp(r[O],n,s,O);if(o){const O=Ie(o)?o.call(s):o;Reflect.ownKeys(O).forEach(N=>{wi(N,O[N])})}d&&xd(d,e,"c");function U(O,N){be(N)?N.forEach(Y=>O(Y.bind(s))):N&&O(N.bind(s))}if(U(ep,u),U(We,f),U(dc,p),U(wr,b),U(Ds,y),U(Ms,E),U(ap,T),U(np,g),U(sp,w),U(Sr,x),U(xt,_),U(tp,C),be(M))if(M.length){const O=e.exposed||(e.exposed={});M.forEach(N=>{Object.defineProperty(O,N,{get:()=>s[N],set:Y=>s[N]=Y,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Ht&&(e.render=S),H!=null&&(e.inheritAttrs=H),P&&(e.components=P),R&&(e.directives=R),C&&cc(e)}function fb(e,t,s=Ht){be(e)&&(e=wo(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=Os(a.from||n,a.default,!0):i=Os(a.from||n):i=Os(a),St(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function xd(e,t,s){xs(be(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function rp(e,t,s,n){let a=n.includes(".")?Gf(s,n):()=>s[n];if(Me(e)){const i=t[e];Ie(i)&&ns(a,i)}else if(Ie(e))ns(a,e.bind(s));else if(Xe(e))if(be(e))e.forEach(i=>rp(i,t,s,n));else{const i=Ie(e.handler)?e.handler.bind(s):t[e.handler];Ie(i)&&ns(a,i,e)}}function hc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Ul(o,c,l,!0)),Ul(o,t,l)),Xe(t)&&i.set(t,o),o}function Ul(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Ul(e,i,s,!0),a&&a.forEach(l=>Ul(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=pb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const pb={data:_d,props:kd,emits:kd,methods:bi,computed:bi,beforeCreate:Qt,created:Qt,beforeMount:Qt,mounted:Qt,beforeUpdate:Qt,updated:Qt,beforeDestroy:Qt,beforeUnmount:Qt,destroyed:Qt,unmounted:Qt,activated:Qt,deactivated:Qt,errorCaptured:Qt,serverPrefetch:Qt,components:bi,directives:bi,watch:mb,provide:_d,inject:hb};function _d(e,t){return t?e?function(){return ze(Ie(e)?e.call(this,this):e,Ie(t)?t.call(this,this):t)}:t:e}function hb(e,t){return bi(wo(e),wo(t))}function wo(e){if(be(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Qt(e,t){return e?[...new Set([].concat(e,t))]:t}function bi(e,t){return e?ze(Object.create(null),e,t):t}function kd(e,t){return e?be(e)&&be(t)?[...new Set([...e,...t])]:ze(Object.create(null),$i(e),$i(t??{})):t}function mb(e,t){if(!e)return t;if(!t)return e;const s=ze(Object.create(null),e);for(const n in t)s[n]=Qt(e[n],t[n]);return s}function op(){return{app:null,config:{isNativeTag:Ia,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let gb=0;function vb(e,t){return function(n,a=null){Ie(n)||(n=ze({},n)),a!=null&&!Xe(a)&&(a=null);const i=op(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:gb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Hp,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ie(d.install)?(l.add(d),d.install(c,...u)):Ie(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,f){if(!o){const p=c._ceVNode||ft(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),u&&t?t(p,d):e(p,d,f),o=!0,c._container=d,d.__vue_app__=c,sl(p.component)}},onUnmount(d){r.push(d)},unmount(){o&&(xs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ta;ta=c;try{return d()}finally{ta=u}}};return c}}let ta=null;function bb(e,t,s=je){const n=as(),a=it(t),i=ps(t),l=cp(e,a),r=Mf((o,c)=>{let d,u=je,f;return qf(()=>{const p=e[a];Lt(d,p)&&(d=p,c())}),{get(){return o(),s.get?s.get(d):d},set(p){const b=s.set?s.set(p):p;if(!Lt(b,d)&&!(u!==je&&Lt(p,u)))return;const y=n.vnode.props,E=!!(y&&(t in y||a in y||i in y)&&(`onUpdate:${t}`in y||`onUpdate:${a}`in y||`onUpdate:${i}`in y));E||(d=p,c()),n.emit(`update:${t}`,b),Lt(p,u)&&(Lt(p,b)&&!Lt(b,f)||E&&u!==je&&!Lt(b,d))&&c(),u=p,f=b}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||je:r,done:!1}:{done:!0}}}},r}const cp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${it(t)}Modifiers`]||e[`${ps(t)}Modifiers`];function yb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||je;let a=s;const i=t.startsWith("update:"),l=i&&cp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Me(d)?d.trim():d)),l.number&&(a=s.map(pr)));let r,o=n[r=Da(t)]||n[r=Da(it(t))];!o&&i&&(o=n[r=Da(ps(t))]),o&&xs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,xs(c,e,6,a)}}const xb=new WeakMap;function dp(e,t,s=!1){const n=s?xb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Ie(e)){const o=c=>{const d=dp(c,t,!0);d&&(r=!0,ze(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Xe(e)&&n.set(e,null),null):(be(i)?i.forEach(o=>l[o]=null):ze(l,i),Xe(e)&&n.set(e,l),l)}function Tr(e,t){return!e||!ca(t)?!1:(t=t.slice(2).replace(/Once$/,""),tt(e,t[0].toLowerCase()+t.slice(1))||tt(e,ps(t))||tt(e,t))}function Cl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:f,setupState:p,ctx:b,inheritAttrs:y}=e,E=Fi(e);let I,x;try{if(s.shapeFlag&4){const _=a||n,S=_;I=fs(c.call(S,_,d,u,p,f,b)),x=r}else{const _=t;I=fs(_.length>1?_(u,{attrs:r,slots:l,emit:o}):_(u,null)),x=t.props?r:kb(r)}}catch(_){Ti.length=0,fa(_,e,1),I=ft(yt)}let m=I;if(x&&y!==!1){const _=Object.keys(x),{shapeFlag:S}=m;_.length&&S&7&&(i&&_.some(cr)&&(x=wb(x,i)),m=sn(m,x,!1,!0))}return s.dirs&&(m=sn(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition&&Tn(m,s.transition),I=m,Fi(E),I}function _b(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Cn(a)){if(a.type!==yt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const kb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ca(s))&&((t||(t={}))[s]=e[s]);return t},wb=(e,t)=>{const s={};for(const n in e)(!cr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Sb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?wd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const f=d[u];if(up(l,n,f)&&!Tr(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?wd(n,l,c):!0:!!l;return!1}function wd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(up(t,e,i)&&!Tr(s,i))return!0}return!1}function up(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!kn(n,a):n!==a}function Cr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const fp={},pp=()=>Object.create(fp),hp=e=>Object.getPrototypeOf(e)===fp;function Tb(e,t,s,n=!1){const a={},i=pp();e.propsDefaults=Object.create(null),mp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:sc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Cb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let f=d[u];if(Tr(e.emitsOptions,f))continue;const p=t[f];if(o)if(tt(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const b=it(f);a[b]=So(o,r,b,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{mp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!tt(t,u)&&((d=ps(u))===u||!tt(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=So(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!tt(t,u))&&(delete i[u],c=!0)}c&&pn(e.attrs,"set","")}function mp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(bn(o))continue;const c=t[o];let d;a&&tt(a,d=it(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Tr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||je;for(let d=0;d<i.length;d++){const u=i[d];s[u]=So(a,o,u,c[u],e,!tt(c,u))}}return l}function So(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=tt(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Ie(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=si(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===ps(s))&&(n=!0))}return n}const Eb=new WeakMap;function gp(e,t,s=!1){const n=s?Eb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Ie(e)){const d=u=>{o=!0;const[f,p]=gp(u,t,!0);ze(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Xe(e)&&n.set(e,Na),Na;if(be(i))for(let d=0;d<i.length;d++){const u=it(i[d]);Sd(u)&&(l[u]=je)}else if(i)for(const d in i){const u=it(d);if(Sd(u)){const f=i[d],p=l[u]=be(f)||Ie(f)?{type:f}:ze({},f),b=p.type;let y=!1,E=!0;if(be(b))for(let I=0;I<b.length;++I){const x=b[I],m=Ie(x)&&x.name;if(m==="Boolean"){y=!0;break}else m==="String"&&(E=!1)}else y=Ie(b)&&b.name==="Boolean";p[0]=y,p[1]=E,(y||tt(p,"default"))&&r.push(u)}}const c=[l,r];return Xe(e)&&n.set(e,c),c}function Sd(e){return e[0]!=="$"&&!bn(e)}const mc=e=>e==="_"||e==="_ctx"||e==="$stable",gc=e=>be(e)?e.map(fs):[fs(e)],Ab=(e,t,s)=>{if(t._n)return t;const n=lc((...a)=>gc(t(...a)),s);return n._c=!1,n},vp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(mc(a))continue;const i=e[a];if(Ie(i))t[a]=Ab(a,i,n);else if(i!=null){const l=gc(i);t[a]=()=>l}}},bp=(e,t)=>{const s=gc(t);e.slots.default=()=>s},yp=(e,t,s)=>{for(const n in t)(s||!mc(n))&&(e[n]=t[n])},Rb=(e,t,s)=>{const n=e.slots=pp();if(e.vnode.shapeFlag&32){const a=t._;a?(yp(n,t,s),s&&uf(n,"_",a,!0)):vp(t,n)}else t&&bp(e,t)},Ib=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=je;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:yp(a,t,s):(i=!t.$stable,vp(t,a)),l=t}else t&&(bp(e,t),l={default:1});if(i)for(const r in a)!mc(r)&&l[r]==null&&delete a[r]},kt=Ep;function xp(e){return kp(e)}function _p(e){return kp(e,Rv)}function kp(e,t){const s=hr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:f,setScopeId:p=Ht,insertStaticContent:b}=e,y=(k,L,$,ee=null,Z=null,X=null,ue=void 0,oe=null,le=!!L.dynamicChildren)=>{if(k===L)return;k&&!Hs(k,L)&&(ee=V(k),ie(k,Z,X,!0),k=null),L.patchFlag===-2&&(le=!1,L.dynamicChildren=null);const{type:te,ref:ne,shapeFlag:fe}=L;switch(te){case $n:E(k,L,$,ee);break;case yt:I(k,L,$,ee);break;case sa:k==null&&x(L,$,ee,ue);break;case Dt:P(k,L,$,ee,Z,X,ue,oe,le);break;default:fe&1?S(k,L,$,ee,Z,X,ue,oe,le):fe&6?R(k,L,$,ee,Z,X,ue,oe,le):(fe&64||fe&128)&&te.process(k,L,$,ee,Z,X,ue,oe,le,ye)}ne!=null&&Z?Fa(ne,k&&k.ref,X,L||k,!L):ne==null&&k&&k.ref!=null&&Fa(k.ref,null,X,k,!0)},E=(k,L,$,ee)=>{if(k==null)n(L.el=r(L.children),$,ee);else{const Z=L.el=k.el;L.children!==k.children&&c(Z,L.children)}},I=(k,L,$,ee)=>{k==null?n(L.el=o(L.children||""),$,ee):L.el=k.el},x=(k,L,$,ee)=>{[k.el,k.anchor]=b(k.children,L,$,ee,k.el,k.anchor)},m=({el:k,anchor:L},$,ee)=>{let Z;for(;k&&k!==L;)Z=f(k),n(k,$,ee),k=Z;n(L,$,ee)},_=({el:k,anchor:L})=>{let $;for(;k&&k!==L;)$=f(k),a(k),k=$;a(L)},S=(k,L,$,ee,Z,X,ue,oe,le)=>{if(L.type==="svg"?ue="svg":L.type==="math"&&(ue="mathml"),k==null)g(L,$,ee,Z,X,ue,oe,le);else{const te=k.el&&k.el._isVueCE?k.el:null;try{te&&te._beginPatch(),C(k,L,Z,X,ue,oe,le)}finally{te&&te._endPatch()}}},g=(k,L,$,ee,Z,X,ue,oe)=>{let le,te;const{props:ne,shapeFlag:fe,transition:ve,dirs:Te}=k;if(le=k.el=l(k.type,X,ne&&ne.is,ne),fe&8?d(le,k.children):fe&16&&T(k.children,le,null,ee,Z,Kr(k,X),ue,oe),Te&&Qs(k,null,ee,"created"),w(le,k,k.scopeId,ue,ee),ne){for(const Le in ne)Le!=="value"&&!bn(Le)&&i(le,Le,null,ne[Le],X,ee);"value"in ne&&i(le,"value",null,ne.value,X),(te=ne.onVnodeBeforeMount)&&ds(te,ee,k)}Te&&Qs(k,null,ee,"beforeMount");const Oe=wp(Z,ve);Oe&&ve.beforeEnter(le),n(le,L,$),((te=ne&&ne.onVnodeMounted)||Oe||Te)&&kt(()=>{try{te&&ds(te,ee,k),Oe&&ve.enter(le),Te&&Qs(k,null,ee,"mounted")}finally{}},Z)},w=(k,L,$,ee,Z)=>{if($&&p(k,$),ee)for(let X=0;X<ee.length;X++)p(k,ee[X]);if(Z){let X=Z.subTree;if(L===X||zl(X.type)&&(X.ssContent===L||X.ssFallback===L)){const ue=Z.vnode;w(k,ue,ue.scopeId,ue.slotScopeIds,Z.parent)}}},T=(k,L,$,ee,Z,X,ue,oe,le=0)=>{for(let te=le;te<k.length;te++){const ne=k[te]=oe?un(k[te]):fs(k[te]);y(null,ne,L,$,ee,Z,X,ue,oe)}},C=(k,L,$,ee,Z,X,ue)=>{const oe=L.el=k.el;let{patchFlag:le,dynamicChildren:te,dirs:ne}=L;le|=k.patchFlag&16;const fe=k.props||je,ve=L.props||je;let Te;if($&&qn($,!1),(Te=ve.onVnodeBeforeUpdate)&&ds(Te,$,L,k),ne&&Qs(L,k,$,"beforeUpdate"),$&&qn($,!0),(fe.innerHTML&&ve.innerHTML==null||fe.textContent&&ve.textContent==null)&&d(oe,""),te?M(k.dynamicChildren,te,oe,$,ee,Kr(L,Z),X):ue||N(k,L,oe,null,$,ee,Kr(L,Z),X,!1),le>0){if(le&16)H(oe,fe,ve,$,Z);else if(le&2&&fe.class!==ve.class&&i(oe,"class",null,ve.class,Z),le&4&&i(oe,"style",fe.style,ve.style,Z),le&8){const Oe=L.dynamicProps;for(let Le=0;Le<Oe.length;Le++){const De=Oe[Le],Be=fe[De],qe=ve[De];(qe!==Be||De==="value")&&i(oe,De,Be,qe,Z,$)}}le&1&&k.children!==L.children&&d(oe,L.children)}else!ue&&te==null&&H(oe,fe,ve,$,Z);((Te=ve.onVnodeUpdated)||ne)&&kt(()=>{Te&&ds(Te,$,L,k),ne&&Qs(L,k,$,"updated")},ee)},M=(k,L,$,ee,Z,X,ue)=>{for(let oe=0;oe<L.length;oe++){const le=k[oe],te=L[oe],ne=le.el&&(le.type===Dt||!Hs(le,te)||le.shapeFlag&198)?u(le.el):$;y(le,te,ne,null,ee,Z,X,ue,!0)}},H=(k,L,$,ee,Z)=>{if(L!==$){if(L!==je)for(const X in L)!bn(X)&&!(X in $)&&i(k,X,L[X],null,Z,ee);for(const X in $){if(bn(X))continue;const ue=$[X],oe=L[X];ue!==oe&&X!=="value"&&i(k,X,oe,ue,Z,ee)}"value"in $&&i(k,"value",L.value,$.value,Z)}},P=(k,L,$,ee,Z,X,ue,oe,le)=>{const te=L.el=k?k.el:r(""),ne=L.anchor=k?k.anchor:r("");let{patchFlag:fe,dynamicChildren:ve,slotScopeIds:Te}=L;Te&&(oe=oe?oe.concat(Te):Te),k==null?(n(te,$,ee),n(ne,$,ee),T(L.children||[],$,ne,Z,X,ue,oe,le)):fe>0&&fe&64&&ve&&k.dynamicChildren&&k.dynamicChildren.length===ve.length?(M(k.dynamicChildren,ve,$,Z,X,ue,oe),(L.key!=null||Z&&L===Z.subTree)&&vc(k,L,!0)):N(k,L,$,ne,Z,X,ue,oe,le)},R=(k,L,$,ee,Z,X,ue,oe,le)=>{L.slotScopeIds=oe,k==null?L.shapeFlag&512?Z.ctx.activate(L,$,ee,ue,le):j(L,$,ee,Z,X,ue,le):Q(k,L,le)},j=(k,L,$,ee,Z,X,ue)=>{const oe=k.component=Dp(k,ee,Z);if(tl(k)&&(oe.ctx.renderer=ye),Pp(oe,!1,ue),oe.asyncDep){if(Z&&Z.registerDep(oe,U,ue),!k.el){const le=oe.subTree=ft(yt);I(null,le,L,$),k.placeholder=le.el}}else U(oe,k,L,$,Z,X,ue)},Q=(k,L,$)=>{const ee=L.component=k.component;if(Sb(k,L,$))if(ee.asyncDep&&!ee.asyncResolved){O(ee,L,$);return}else ee.next=L,ee.update();else L.el=k.el,ee.vnode=L},U=(k,L,$,ee,Z,X,ue)=>{const oe=()=>{if(k.isMounted){let{next:fe,bu:ve,u:Te,parent:Oe,vnode:Le}=k;{const K=Sp(k);if(K){fe&&(fe.el=Le.el,O(k,fe,ue)),K.asyncDep.then(()=>{kt(()=>{k.isUnmounted||te()},Z)});return}}let De=fe,Be;qn(k,!1),fe?(fe.el=Le.el,O(k,fe,ue)):fe=Le,ve&&Ma(ve),(Be=fe.props&&fe.props.onVnodeBeforeUpdate)&&ds(Be,Oe,fe,Le),qn(k,!0);const qe=Cl(k),ct=k.subTree;k.subTree=qe,y(ct,qe,u(ct.el),V(ct),k,Z,X),fe.el=qe.el,De===null&&Cr(k,qe.el),Te&&kt(Te,Z),(Be=fe.props&&fe.props.onVnodeUpdated)&&kt(()=>ds(Be,Oe,fe,Le),Z)}else{let fe;const{el:ve,props:Te}=L,{bm:Oe,m:Le,parent:De,root:Be,type:qe}=k,ct=xn(L);if(qn(k,!1),Oe&&Ma(Oe),!ct&&(fe=Te&&Te.onVnodeBeforeMount)&&ds(fe,De,L),qn(k,!0),ve&&He){const K=()=>{k.subTree=Cl(k),He(ve,k.subTree,k,Z,null)};ct&&qe.__asyncHydrate?qe.__asyncHydrate(ve,k,K):K()}else{Be.ce&&Be.ce._hasShadowRoot()&&Be.ce._injectChildStyle(qe,k.parent?k.parent.type:void 0);const K=k.subTree=Cl(k);y(null,K,$,ee,k,Z,X),L.el=K.el}if(Le&&kt(Le,Z),!ct&&(fe=Te&&Te.onVnodeMounted)){const K=L;kt(()=>ds(fe,De,K),Z)}(L.shapeFlag&256||De&&xn(De.vnode)&&De.vnode.shapeFlag&256)&&k.a&&kt(k.a,Z),k.isMounted=!0,L=$=ee=null}};k.scope.on();const le=k.effect=new Ni(oe);k.scope.off();const te=k.update=le.run.bind(le),ne=k.job=le.runIfDirty.bind(le);ne.i=k,ne.id=k.uid,le.scheduler=()=>ic(ne),qn(k,!0),te()},O=(k,L,$)=>{L.component=k;const ee=k.vnode.props;k.vnode=L,k.next=null,Cb(k,L.props,ee,$),Ib(k,L.children,$),wn(),ud(k),Sn()},N=(k,L,$,ee,Z,X,ue,oe,le=!1)=>{const te=k&&k.children,ne=k?k.shapeFlag:0,fe=L.children,{patchFlag:ve,shapeFlag:Te}=L;if(ve>0){if(ve&128){we(te,fe,$,ee,Z,X,ue,oe,le);return}else if(ve&256){Y(te,fe,$,ee,Z,X,ue,oe,le);return}}Te&8?(ne&16&&Se(te,Z,X),fe!==te&&d($,fe)):ne&16?Te&16?we(te,fe,$,ee,Z,X,ue,oe,le):Se(te,Z,X,!0):(ne&8&&d($,""),Te&16&&T(fe,$,ee,Z,X,ue,oe,le))},Y=(k,L,$,ee,Z,X,ue,oe,le)=>{k=k||Na,L=L||Na;const te=k.length,ne=L.length,fe=Math.min(te,ne);let ve;for(ve=0;ve<fe;ve++){const Te=L[ve]=le?un(L[ve]):fs(L[ve]);y(k[ve],Te,$,null,Z,X,ue,oe,le)}te>ne?Se(k,Z,X,!0,!1,fe):T(L,$,ee,Z,X,ue,oe,le,fe)},we=(k,L,$,ee,Z,X,ue,oe,le)=>{let te=0;const ne=L.length;let fe=k.length-1,ve=ne-1;for(;te<=fe&&te<=ve;){const Te=k[te],Oe=L[te]=le?un(L[te]):fs(L[te]);if(Hs(Te,Oe))y(Te,Oe,$,null,Z,X,ue,oe,le);else break;te++}for(;te<=fe&&te<=ve;){const Te=k[fe],Oe=L[ve]=le?un(L[ve]):fs(L[ve]);if(Hs(Te,Oe))y(Te,Oe,$,null,Z,X,ue,oe,le);else break;fe--,ve--}if(te>fe){if(te<=ve){const Te=ve+1,Oe=Te<ne?L[Te].el:ee;for(;te<=ve;)y(null,L[te]=le?un(L[te]):fs(L[te]),$,Oe,Z,X,ue,oe,le),te++}}else if(te>ve)for(;te<=fe;)ie(k[te],Z,X,!0),te++;else{const Te=te,Oe=te,Le=new Map;for(te=Oe;te<=ve;te++){const Re=L[te]=le?un(L[te]):fs(L[te]);Re.key!=null&&Le.set(Re.key,te)}let De,Be=0;const qe=ve-Oe+1;let ct=!1,K=0;const xe=new Array(qe);for(te=0;te<qe;te++)xe[te]=0;for(te=Te;te<=fe;te++){const Re=k[te];if(Be>=qe){ie(Re,Z,X,!0);continue}let Ve;if(Re.key!=null)Ve=Le.get(Re.key);else for(De=Oe;De<=ve;De++)if(xe[De-Oe]===0&&Hs(Re,L[De])){Ve=De;break}Ve===void 0?ie(Re,Z,X,!0):(xe[Ve-Oe]=te+1,Ve>=K?K=Ve:ct=!0,y(Re,L[Ve],$,null,Z,X,ue,oe,le),Be++)}const Ce=ct?Ob(xe):Na;for(De=Ce.length-1,te=qe-1;te>=0;te--){const Re=Oe+te,Ve=L[Re],Pe=L[Re+1],pt=Re+1<ne?Pe.el||Tp(Pe):ee;xe[te]===0?y(null,Ve,$,pt,Z,X,ue,oe,le):ct&&(De<0||te!==Ce[De]?ke(Ve,$,pt,2):De--)}}},ke=(k,L,$,ee,Z=null)=>{const{el:X,type:ue,transition:oe,children:le,shapeFlag:te}=k;if(te&6){ke(k.component.subTree,L,$,ee);return}if(te&128){k.suspense.move(L,$,ee);return}if(te&64){ue.move(k,L,$,ye);return}if(ue===Dt){n(X,L,$);for(let fe=0;fe<le.length;fe++)ke(le[fe],L,$,ee);n(k.anchor,L,$);return}if(ue===sa){m(k,L,$);return}if(ee!==2&&te&1&&oe)if(ee===0)oe.persisted&&!X[As]?n(X,L,$):(oe.beforeEnter(X),n(X,L,$),kt(()=>oe.enter(X),Z));else{const{leave:fe,delayLeave:ve,afterLeave:Te}=oe,Oe=()=>{k.ctx.isUnmounted?a(X):n(X,L,$)},Le=()=>{const De=X._isLeaving||!!X[As];X._isLeaving&&X[As](!0),oe.persisted&&!De?Oe():fe(X,()=>{Oe(),Te&&Te()})};ve?ve(X,Oe,Le):Le()}else n(X,L,$)},ie=(k,L,$,ee=!1,Z=!1)=>{const{type:X,props:ue,ref:oe,children:le,dynamicChildren:te,shapeFlag:ne,patchFlag:fe,dirs:ve,cacheIndex:Te,memo:Oe}=k;if(fe===-2&&(Z=!1),oe!=null&&(wn(),Fa(oe,null,$,k,!0),Sn()),Te!=null&&(L.renderCache[Te]=void 0),ne&256){L.ctx.deactivate(k);return}const Le=ne&1&&ve,De=!xn(k);let Be;if(De&&(Be=ue&&ue.onVnodeBeforeUnmount)&&ds(Be,L,k),ne&6)se(k.component,$,ee);else{if(ne&128){k.suspense.unmount($,ee);return}Le&&Qs(k,null,L,"beforeUnmount"),ne&64?k.type.remove(k,L,$,ye,ee):te&&!te.hasOnce&&(X!==Dt||fe>0&&fe&64)?Se(te,L,$,!1,!0):(X===Dt&&fe&384||!Z&&ne&16)&&Se(le,L,$),ee&&he(k)}const qe=Oe!=null&&Te==null;(De&&(Be=ue&&ue.onVnodeUnmounted)||Le||qe)&&kt(()=>{Be&&ds(Be,L,k),Le&&Qs(k,null,L,"unmounted"),qe&&(k.el=null)},$)},he=k=>{const{type:L,el:$,anchor:ee,transition:Z}=k;if(L===Dt){F($,ee);return}if(L===sa){_(k);return}const X=()=>{a($),Z&&!Z.persisted&&Z.afterLeave&&Z.afterLeave()};if(k.shapeFlag&1&&Z&&!Z.persisted){const{leave:ue,delayLeave:oe}=Z,le=()=>ue($,X);oe?oe(k.el,X,le):le()}else X()},F=(k,L)=>{let $;for(;k!==L;)$=f(k),a(k),k=$;a(L)},se=(k,L,$)=>{const{bum:ee,scope:Z,job:X,subTree:ue,um:oe,m:le,a:te}=k;Hl(le),Hl(te),ee&&Ma(ee),Z.stop(),X&&(X.flags|=8,ie(ue,k,L,$)),oe&&kt(oe,L),kt(()=>{k.isUnmounted=!0},L)},Se=(k,L,$,ee=!1,Z=!1,X=0)=>{for(let ue=X;ue<k.length;ue++)ie(k[ue],L,$,ee,Z)},V=k=>{if(k.shapeFlag&6)return V(k.component.subTree);if(k.shapeFlag&128)return k.suspense.next();const L=f(k.anchor||k.el),$=L&&L[Kf];return $?f($):L};let de=!1;const ce=(k,L,$)=>{let ee;k==null?L._vnode&&(ie(L._vnode,null,null,!0),ee=L._vnode.component):y(L._vnode||null,k,L,null,null,null,$),L._vnode=k,de||(de=!0,ud(ee),$l(),de=!1)},ye={p:y,um:ie,m:ke,r:he,mt:j,mc:T,pc:N,pbc:M,n:V,o:e};let ge,He;return t&&([ge,He]=t(ye)),{render:ce,hydrate:ge,createApp:vb(ce,ge)}}function Kr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function qn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function wp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function vc(e,t,s=!1){const n=e.children,a=t.children;if(be(n)&&be(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=un(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&vc(l,r)),r.type===$n&&(r.patchFlag===-1&&(r=a[i]=un(r)),r.el=l.el),r.type===yt&&!r.el&&(r.el=l.el)}}function Ob(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Sp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Sp(t)}function Hl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Tp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Tp(t.subTree):null}const zl=e=>e.__isSuspense;let To=0;const Nb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Db(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Mb(e,t,s,n,a,l,r,o,c)}},hydrate:Pb,normalize:Fb},Lb=Nb;function Bi(e,t){const s=e.props&&e.props[t];Ie(s)&&s()}function Db(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),f=e.suspense=Cp(e,a,n,t,u,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,u,null,n,f,i,l),f.deps>0?(Bi(e,"onPending"),Bi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),$a(f,e.ssFallback)):f.resolve(!1,!0)}function Mb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:b,pendingBranch:y,isInFallback:E,isHydrating:I}=u;if(y)u.pendingBranch=f,Hs(y,f)?(o(y,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():E&&(I||(o(b,p,s,n,a,null,i,l,r),$a(u,p)))):(u.pendingId=To++,I?(u.isHydrating=!1,u.activeBranch=y):c(y,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(b,p,s,n,a,null,i,l,r),$a(u,p))):b&&Hs(b,f)?(o(b,f,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(b&&Hs(b,f))o(b,f,s,n,a,u,i,l,r),$a(u,f);else if(Bi(t,"onPending"),u.pendingBranch=f,f.shapeFlag&512?u.pendingId=f.component.suspenseId:u.pendingId=To++,o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:m}=u;x>0?setTimeout(()=>{u.pendingId===m&&u.fallback(p)},x):x===0&&u.fallback(p)}}function Cp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:f,um:p,n:b,o:{parentNode:y,remove:E}}=c;let I;const x=$b(e);x&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const m=e.props?Ll(e.props.timeout):void 0,_=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:To++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(g=!1,w=!1){const{vnode:T,activeBranch:C,pendingBranch:M,pendingId:H,effects:P,parentComponent:R,container:j,isInFallback:Q}=S;let U=!1;if(S.isHydrating)S.isHydrating=!1;else if(!g){U=C&&M.transition&&M.transition.mode==="out-in";let Y=!1;U&&(C.transition.afterLeave=()=>{H===S.pendingId&&(f(M,j,i===_&&!Y?b(C):i,0),Mi(P),Q&&T.ssFallback&&(T.ssFallback.el=null))}),C&&!S.isFallbackMountPending&&(y(C.el)===j&&(i=b(C),Y=!0),p(C,R,S,!0),!U&&Q&&T.ssFallback&&kt(()=>T.ssFallback.el=null,S)),U||f(M,j,i,0)}S.isFallbackMountPending=!1,$a(S,M),S.pendingBranch=null,S.isInFallback=!1;let O=S.parent,N=!1;for(;O;){if(O.pendingBranch){O.effects.push(...P),N=!0;break}O=O.parent}!N&&!U&&Mi(P),S.effects=[],x&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!w&&t.resolve()),Bi(T,"onResolve")},fallback(g){if(!S.pendingBranch)return;const{vnode:w,activeBranch:T,parentComponent:C,container:M,namespace:H}=S;Bi(w,"onFallback");const P=b(T),R=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,g,M,P,C,null,H,r,o),$a(S,g))},j=g.transition&&g.transition.mode==="out-in";j&&(S.isFallbackMountPending=!0,T.transition.afterLeave=R),S.isInFallback=!0,p(T,C,null,!0),j||R()},move(g,w,T){S.activeBranch&&f(S.activeBranch,g,w,T),S.container=g},next(){return S.activeBranch&&b(S.activeBranch)},registerDep(g,w,T){const C=!!S.pendingBranch;C&&S.deps++;const M=g.vnode.el;g.asyncDep.catch(H=>{fa(H,g,0)}).then(H=>{if(g.isUnmounted||S.isUnmounted||S.pendingId!==g.suspenseId)return;zi(),g.asyncResolved=!0;const{vnode:P}=g;Co(g,H,!1),M&&(P.el=M);const R=!M&&g.subTree.el;w(g,P,y(M||g.subTree.el),M?null:b(g.subTree),S,l,T),R&&(P.placeholder=null,E(R)),Cr(g,P.el),C&&--S.deps===0&&S.resolve()})},unmount(g,w){S.isUnmounted=!0,S.activeBranch&&p(S.activeBranch,s,g,w),S.pendingBranch&&p(S.pendingBranch,s,g,w)}};return S}function Pb(e,t,s,n,a,i,l,r,o){const c=t.suspense=Cp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Fb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Td(n?s.default:s),e.ssFallback=n?Td(s.fallback):ft(yt)}function Td(e){let t;if(Ie(e)){const s=ia&&e._c;s&&(e._d=!1,Ui()),e=e(),s&&(e._d=!0,t=Wt,Ap())}return be(e)&&(e=_b(e)),e=fs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Ep(e,t){t&&t.pendingBranch?be(e)?t.effects.push(...e):t.effects.push(e):Mi(e)}function $a(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Cr(n,a))}function $b(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Dt=Symbol.for("v-fgt"),$n=Symbol.for("v-txt"),yt=Symbol.for("v-cmt"),sa=Symbol.for("v-stc"),Ti=[];let Wt=null;function Ui(e=!1){Ti.push(Wt=e?null:[])}function Ap(){Ti.pop(),Wt=Ti[Ti.length-1]||null}let ia=1;function Hi(e,t=!1){ia+=e,e<0&&Wt&&t&&(Wt.hasOnce=!0)}function Rp(e){return e.dynamicChildren=ia>0?Wt||Na:null,Ap(),ia>0&&Wt&&Wt.push(e),e}function Bb(e,t,s,n,a,i){return Rp(bc(e,t,s,n,a,i,!0))}function Vl(e,t,s,n,a){return Rp(ft(e,t,s,n,a,!0))}function Cn(e){return e?e.__v_isVNode===!0:!1}function Hs(e,t){return e.type===t.type&&e.key===t.key}function Ub(e){}const Ip=({key:e})=>e??null,El=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Me(e)||St(e)||Ie(e)?{i:Ut,r:e,k:t,f:!!s}:e:null);function bc(e,t=null,s=null,n=0,a=null,i=e===Dt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Ip(t),ref:t&&El(t),scopeId:xr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ut};return r?(xc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Me(s)?8:16),ia>0&&!l&&Wt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Wt.push(o),o}const ft=Hb;function Hb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===ip)&&(e=yt),Cn(e)){const r=sn(e,t,!0);return s&&xc(r,s),ia>0&&!i&&Wt&&(r.shapeFlag&6?Wt[Wt.indexOf(e)]=r:Wt.push(r)),r.patchFlag=-2,r}if(Wb(e)&&(e=e.__vccOpts),t){t=Op(t);let{class:r,style:o}=t;r&&!Me(r)&&(t.class=Yi(r)),Xe(o)&&(Qi(o)&&!be(o)&&(o=ze({},o)),t.style=Ji(o))}const l=Me(e)?1:zl(e)?128:Wf(e)?64:Xe(e)?4:Ie(e)?2:0;return bc(e,t,s,n,a,l,i,!0)}function Op(e){return e?Qi(e)||hp(e)?ze({},e):e:null}function sn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Lp(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Ip(c),ref:t&&t.ref?s&&i?be(i)?i.concat(El(t)):[i,El(t)]:El(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Dt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&sn(e.ssContent),ssFallback:e.ssFallback&&sn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Tn(d,o.clone(d)),d}function yc(e=" ",t=0){return ft($n,null,e,t)}function zb(e,t){const s=ft(sa,null,e);return s.staticCount=t,s}function Np(e="",t=!1){return t?(Ui(),Vl(yt,null,e)):ft(yt,null,e)}function fs(e){return e==null||typeof e=="boolean"?ft(yt):be(e)?ft(Dt,null,e.slice()):Cn(e)?un(e):ft($n,null,String(e))}function un(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:sn(e)}function xc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(be(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),xc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!hp(t)?t._ctx=Ut:a===3&&Ut&&(Ut.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ie(t)?(t={default:t,_ctx:Ut},s=32):(t=String(t),n&64?(s=16,t=[yc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Lp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Yi([t.class,n.class]));else if(a==="style")t.style=Ji([t.style,n.style]);else if(ca(a)){const i=t[a],l=n[a];l&&i!==l&&!(be(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!cr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ds(e,t,s,n=null){xs(e,t,7,[s,n])}const Vb=op();let jb=0;function Dp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Vb,i={uid:jb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Qo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:gp(n,a),emitsOptions:dp(n,a),emit:null,emitted:null,propsDefaults:je,inheritAttrs:n.inheritAttrs,ctx:je,data:je,props:je,attrs:je,slots:je,refs:je,setupState:je,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=yb.bind(null,i),e.ce&&e.ce(i),i}let Bt=null;const as=()=>Bt||Ut;let jl,Ba;{const e=hr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};jl=t("__VUE_INSTANCE_SETTERS__",s=>Bt=s),Ba=t("__VUE_SSR_SETTERS__",s=>la=s)}const si=e=>{const t=Bt;return jl(e),e.scope.on(),()=>{e.scope.off(),jl(t)}},zi=()=>{Bt&&Bt.scope.off(),jl(null)};function Mp(e){return e.vnode.shapeFlag&4}let la=!1;function Pp(e,t=!1,s=!1){t&&Ba(t);const{props:n,children:a}=e.vnode,i=Mp(e);Tb(e,n,i,t),Rb(e,a,s||t);const l=i?qb(e,t):void 0;return t&&Ba(!1),l}function qb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,_o);const{setup:n}=s;if(n){wn();const a=e.setupContext=n.length>1?Bp(e):null,i=si(e),l=ti(n,e,0,[e.props,a]),r=Yo(l);if(Sn(),i(),(r||e.sp)&&!xn(e)&&cc(e),r){if(l.then(zi,zi),t)return l.then(o=>{Co(e,o,t)}).catch(o=>{fa(o,e,0)});e.asyncDep=l}else Co(e,l,t)}else $p(e,t)}function Co(e,t,s){Ie(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=ac(t)),$p(e,s)}let ql,Eo;function Fp(e){ql=e,Eo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Yv))}}const Gb=()=>!ql;function $p(e,t,s){const n=e.type;if(!e.render){if(!t&&ql&&!n.render){const a=n.template||hc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=ze(ze({isCustomElement:i,delimiters:r},l),o);n.render=ql(a,c)}}e.render=n.render||Ht,Eo&&Eo(e)}{const a=si(e);wn();try{ub(e)}finally{Sn(),a()}}}const Kb={get(e,t){return Kt(e,"get",""),e[t]}};function Bp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Kb),slots:e.slots,emit:e.emit,expose:t}}function sl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(ac(Lf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Si)return Si[s](e)},has(t,s){return s in t||s in Si}})):e.proxy}function Ao(e,t=!0){return Ie(e)?e.displayName||e.name:e.name||t&&e.__name}function Wb(e){return Ie(e)&&"__vccOpts"in e}const J=(e,t)=>ev(e,t,la);function ja(e,t,s){try{Hi(-1);const n=arguments.length;return n===2?Xe(t)&&!be(t)?Cn(t)?ft(e,null,[t]):ft(e,t):ft(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Cn(s)&&(s=[s]),ft(e,t,s))}finally{Hi(1)}}function Zb(){}function Jb(e,t,s,n){const a=s[n];if(a&&Up(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Up(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Lt(s[n],t[n]))return!1;return ia>0&&Wt&&Wt.push(e),!0}const Hp="3.5.38",Yb=Ht,Qb=cv,Xb=Ea,ey=zf,ty={createComponentInstance:Dp,setupComponent:Pp,renderComponentRoot:Cl,setCurrentRenderingInstance:Fi,isVNode:Cn,normalizeVNode:fs,getComponentPublicInstance:sl,ensureValidVNode:pc,pushWarningContext:iv,popWarningContext:lv},sy=ty,ny=null,ay=null,iy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Ro;const Cd=typeof window<"u"&&window.trustedTypes;if(Cd)try{Ro=Cd.createPolicy("vue",{createHTML:e=>e})}catch{}const zp=Ro?e=>Ro.createHTML(e):e=>e,ly="http://www.w3.org/2000/svg",ry="http://www.w3.org/1998/Math/MathML",dn=typeof document<"u"?document:null,Ed=dn&&dn.createElement("template"),Vp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?dn.createElementNS(ly,e):t==="mathml"?dn.createElementNS(ry,e):s?dn.createElement(e,{is:s}):dn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>dn.createTextNode(e),createComment:e=>dn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>dn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Ed.innerHTML=zp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Ed.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Rn="transition",ci="animation",qa=Symbol("_vtc"),jp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},qp=ze({},oc,jp),oy=e=>(e.displayName="Transition",e.props=qp,e),cy=oy((e,{slots:t})=>ja(Yf,Gp(e),t)),Gn=(e,t=[])=>{be(e)?e.forEach(s=>s(...t)):e&&e(...t)},Ad=e=>e?be(e)?e.some(t=>t.length>1):e.length>1:!1;function Gp(e){const t={};for(const P in e)P in jp||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,b=dy(a),y=b&&b[0],E=b&&b[1],{onBeforeEnter:I,onEnter:x,onEnterCancelled:m,onLeave:_,onLeaveCancelled:S,onBeforeAppear:g=I,onAppear:w=x,onAppearCancelled:T=m}=t,C=(P,R,j,Q)=>{P._enterCancelled=Q,Ln(P,R?d:r),Ln(P,R?c:l),j&&j()},M=(P,R)=>{P._isLeaving=!1,Ln(P,u),Ln(P,p),Ln(P,f),R&&R()},H=P=>(R,j)=>{const Q=P?w:x,U=()=>C(R,P,j);Gn(Q,[R,U]),Rd(()=>{Ln(R,P?o:i),Ws(R,P?d:r),Ad(Q)||Id(R,n,y,U)})};return ze(t,{onBeforeEnter(P){Gn(I,[P]),Ws(P,i),Ws(P,l)},onBeforeAppear(P){Gn(g,[P]),Ws(P,o),Ws(P,c)},onEnter:H(!1),onAppear:H(!0),onLeave(P,R){P._isLeaving=!0;const j=()=>M(P,R);Ws(P,u),P._enterCancelled?(Ws(P,f),Io(P)):(Io(P),Ws(P,f)),Rd(()=>{P._isLeaving&&(Ln(P,u),Ws(P,p),Ad(_)||Id(P,n,E,j))}),Gn(_,[P,j])},onEnterCancelled(P){C(P,!1,void 0,!0),Gn(m,[P])},onAppearCancelled(P){C(P,!0,void 0,!0),Gn(T,[P])},onLeaveCancelled(P){M(P),Gn(S,[P])}})}function dy(e){if(e==null)return null;if(Xe(e))return[Wr(e.enter),Wr(e.leave)];{const t=Wr(e);return[t,t]}}function Wr(e){return Ll(e)}function Ws(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[qa]||(e[qa]=new Set)).add(t)}function Ln(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[qa];s&&(s.delete(t),s.size||(e[qa]=void 0))}function Rd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let uy=0;function Id(e,t,s,n){const a=e._endId=++uy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Kp(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,f)}function Kp(e,t){const s=window.getComputedStyle(e),n=b=>(s[b]||"").split(", "),a=n(`${Rn}Delay`),i=n(`${Rn}Duration`),l=Od(a,i),r=n(`${ci}Delay`),o=n(`${ci}Duration`),c=Od(r,o);let d=null,u=0,f=0;t===Rn?l>0&&(d=Rn,u=l,f=i.length):t===ci?c>0&&(d=ci,u=c,f=o.length):(u=Math.max(l,c),d=u>0?l>c?Rn:ci:null,f=d?d===Rn?i.length:o.length:0);const p=d===Rn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Rn}Property`).toString());return{type:d,timeout:u,propCount:f,hasTransform:p}}function Od(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Nd(s)+Nd(e[n])))}function Nd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Io(e){return(e?e.ownerDocument:document).body.offsetHeight}function fy(e,t,s){const n=e[qa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Gl=Symbol("_vod"),_c=Symbol("_vsh"),Wp={name:"show",beforeMount(e,{value:t},{transition:s}){e[Gl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):di(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),di(e,!0),n.enter(e)):n.leave(e,()=>{di(e,!1)}):di(e,t))},beforeUnmount(e,{value:t}){di(e,t)}};function di(e,t){e.style.display=t?e[Gl]:"none",e[_c]=!t}function py(){Wp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Zp=Symbol("");function hy(e){const t=as();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Kl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Kl(t.ce,a):Oo(t.subTree,a),s(a)};dc(()=>{Mi(n)}),We(()=>{ns(n,Ht,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),xt(()=>a.disconnect())})}function Oo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Oo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Kl(e.el,t);else if(e.type===Dt)e.children.forEach(s=>Oo(s,t));else if(e.type===sa){let{el:s,anchor:n}=e;for(;s&&(Kl(s,t),s!==n);)s=s.nextSibling}}function Kl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=xg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Zp]=n}}const my=/(?:^|;)\s*display\s*:/;function gy(e,t,s){const n=e.style,a=Me(s);let i=!1;if(s&&!a){if(t)if(Me(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&yi(n,r,"")}else for(const l in t)s[l]==null&&yi(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?by(e,l,!Me(t)&&t?t[l]:void 0,r)||yi(n,l,r):yi(n,l,"")}}else if(a){if(t!==s){const l=n[Zp];l&&(s+=";"+l),n.cssText=s,i=my.test(s)}}else t&&e.removeAttribute("style");Gl in e&&(e[Gl]=i?n.display:"",e[_c]&&(n.display="none"))}const Ld=/\s*!important$/;function yi(e,t,s){if(be(s))s.forEach(n=>yi(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=vy(e,t);Ld.test(s)?e.setProperty(ps(n),s.replace(Ld,""),"important"):e[n]=s}}const Dd=["Webkit","Moz","ms"],Zr={};function vy(e,t){const s=Zr[t];if(s)return s;let n=it(t);if(n!=="filter"&&n in e)return Zr[t]=n;n=ua(n);for(let a=0;a<Dd.length;a++){const i=Dd[a]+n;if(i in e)return Zr[t]=i}return t}function by(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Me(n)&&s===n}const Md="http://www.w3.org/1999/xlink";function Pd(e,t,s,n,a,i=bg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Md,t.slice(6,t.length)):e.setAttributeNS(Md,t,s):s==null||i&&!pf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Jt(s)?String(s):s)}function Fd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?zp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=pf(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function mn(e,t,s,n){e.addEventListener(t,s,n)}function yy(e,t,s,n){e.removeEventListener(t,s,n)}const $d=Symbol("_vei");function xy(e,t,s,n,a=null){const i=e[$d]||(e[$d]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=_y(t);if(n){const c=i[t]=Sy(n,a);mn(e,r,c,o)}else l&&(yy(e,r,l,o),i[t]=void 0)}}const Bd=/(?:Once|Passive|Capture)$/;function _y(e){let t;if(Bd.test(e)){t={};let n;for(;n=e.match(Bd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ps(e.slice(2)),t]}let Jr=0;const ky=Promise.resolve(),wy=()=>Jr||(ky.then(()=>Jr=0),Jr=Date.now());function Sy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(be(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&xs(c,t,5,r)}}else xs(a,t,5,[n])};return s.value=e,s.attached=wy(),s}const Ud=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Jp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?fy(e,n,l):t==="style"?gy(e,s,n):ca(t)?cr(t)||xy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Ty(e,t,n,l))?(Fd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Pd(e,t,n,l,i,t!=="value")):e._isVueCE&&(Cy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Me(n)))?Fd(e,it(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Pd(e,t,n,l))};function Ty(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Ud(t)&&Ie(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Ud(t)&&Me(s)?!1:t in e}function Cy(e,t){const s=e._def.props;if(!s)return!1;const n=it(t);return Array.isArray(s)?s.some(a=>it(a)===n):Object.keys(s).some(a=>it(a)===n)}const Hd={};function Yp(e,t,s){let n=el(e,t);dr(n)&&(n=ze({},n,t));class a extends Er{constructor(l){super(n,l,s)}}return a.def=n,a}const Ey=((e,t)=>Yp(e,t,dh)),Ay=typeof HTMLElement<"u"?HTMLElement:class{};class Er extends Ay{constructor(t,s={},n=Jl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Jl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(ze({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Er){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Rt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!be(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Ll(this._props[o])),(r||(r=Object.create(null)))[it(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)tt(this,n)||Object.defineProperty(this,n,{get:()=>en(s[n])})}_resolveProps(t){const{props:s}=t,n=be(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(it))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Hd;const a=it(t);s&&this._numberProps&&this._numberProps[a]&&(n=Ll(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Hd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ps(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ps(t),s+""):s||this.removeAttribute(ps(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),ch(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ft(this._def,ze(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,dr(l[0])?ze({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),ps(i)!==i&&a(ps(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Qp(e){const t=as(),s=t&&t.ce;return s||null}function Ry(){const e=Qp();return e&&e.shadowRoot}function Iy(e="$style"){{const t=as();if(!t)return je;const s=t.type.__cssModules;if(!s)return je;const n=s[e];return n||je}}const Xp=new WeakMap,eh=new WeakMap,Wl=Symbol("_moveCb"),zd=Symbol("_enterCb"),Oy=e=>(delete e.props.mode,e),Ny=Oy({name:"TransitionGroup",props:ze({},qp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=as(),n=rc();let a,i;return wr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Fy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Dy),a.forEach(My);const r=a.filter(Py);Io(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Ws(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Wl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Wl]=null,Ln(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=Gp(l);let o=l.tag||Dt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[_c]&&(a.push(d),Tn(d,Va(d,r,n,s)),Xp.set(d,th(d.el)))}i=t.default?_r(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Tn(d,Va(d,r,n,s))}return ft(o,null,i)}}}),Ly=Ny;function Dy(e){const t=e.el;t[Wl]&&t[Wl](),t[zd]&&t[zd]()}function My(e){eh.set(e,th(e.el))}function Py(e){const t=Xp.get(e),s=eh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function th(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Fy(e,t,s){const n=e.cloneNode(),a=e[qa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Kp(n);return i.removeChild(n),l}const Un=e=>{const t=e.props["onUpdate:modelValue"]||!1;return be(t)?s=>Ma(t,s):t};function $y(e){e.target.composing=!0}function Vd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ns=Symbol("_assign");function jd(e,t,s){return t&&(e=e.trim()),s&&(e=pr(e)),e}const Zl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ns]=Un(a);const i=n||a.props&&a.props.type==="number";mn(e,t?"change":"input",l=>{l.target.composing||e[Ns](jd(e.value,s,i))}),(s||i)&&mn(e,"change",()=>{e.value=jd(e.value,s,i)}),t||(mn(e,"compositionstart",$y),mn(e,"compositionend",Vd),mn(e,"change",Vd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ns]=Un(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?pr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},kc={deep:!0,created(e,t,s){e[Ns]=Un(s),mn(e,"change",()=>{const n=e._modelValue,a=Ga(e),i=e.checked,l=e[Ns];if(be(n)){const r=mr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(da(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(nh(e,i))})},mounted:qd,beforeUpdate(e,t,s){e[Ns]=Un(s),qd(e,t,s)}};function qd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(be(t))a=mr(t,n.props.value)>-1;else if(da(t))a=t.has(n.props.value);else{if(t===s)return;a=kn(t,nh(e,!0))}e.checked!==a&&(e.checked=a)}const wc={created(e,{value:t},s){e.checked=kn(t,s.props.value),e[Ns]=Un(s),mn(e,"change",()=>{e[Ns](Ga(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ns]=Un(n),t!==s&&(e.checked=kn(t,n.props.value))}},sh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=da(t);mn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?pr(Ga(l)):Ga(l));e[Ns](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Rt(()=>{e._assigning=!1})}),e[Ns]=Un(n)},mounted(e,{value:t}){Gd(e,t)},beforeUpdate(e,t,s){e[Ns]=Un(s)},updated(e,{value:t}){e._assigning||Gd(e,t)}};function Gd(e,t){const s=e.multiple,n=be(t);if(!(s&&!n&&!da(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ga(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=mr(t,r)>-1}else l.selected=t.has(r);else if(kn(Ga(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ga(e){return"_value"in e?e._value:e.value}function nh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ah={created(e,t,s){bl(e,t,s,null,"created")},mounted(e,t,s){bl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){bl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){bl(e,t,s,n,"updated")}};function ih(e,t){switch(e){case"SELECT":return sh;case"TEXTAREA":return Zl;default:switch(t){case"checkbox":return kc;case"radio":return wc;default:return Zl}}}function bl(e,t,s,n,a){const l=ih(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function By(){Zl.getSSRProps=({value:e})=>({value:e}),wc.getSSRProps=({value:e},t)=>{if(t.props&&kn(t.props.value,e))return{checked:!0}},kc.getSSRProps=({value:e},t)=>{if(be(e)){if(t.props&&mr(e,t.props.value)>-1)return{checked:!0}}else if(da(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ah.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=ih(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Uy=["ctrl","shift","alt","meta"],Hy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Uy.some(s=>e[`${s}Key`]&&!t.includes(s))},zy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Hy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Vy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},jy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=ps(a.key);if(t.some(l=>l===i||Vy[l]===i))return e(a)}))},lh=ze({patchProp:Jp},Vp);let Ci,Kd=!1;function rh(){return Ci||(Ci=xp(lh))}function oh(){return Ci=Kd?Ci:_p(lh),Kd=!0,Ci}const ch=((...e)=>{rh().render(...e)}),qy=((...e)=>{oh().hydrate(...e)}),Jl=((...e)=>{const t=rh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=fh(n);if(!a)return;const i=t._component;!Ie(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,uh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),dh=((...e)=>{const t=oh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=fh(n);if(a)return s(a,!0,uh(a))},t});function uh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function fh(e){return Me(e)?document.querySelector(e):e}let Wd=!1;const Gy=()=>{Wd||(Wd=!0,By(),py())},Ky=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Yf,BaseTransitionPropsValidators:oc,Comment:yt,DeprecationTypes:iy,EffectScope:Qo,ErrorCodes:ov,ErrorTypeStrings:Qb,Fragment:Dt,KeepAlive:Hv,ReactiveEffect:Ni,Static:sa,Suspense:Lb,Teleport:wv,Text:$n,TrackOpTypes:tv,Transition:cy,TransitionGroup:Ly,TriggerOpTypes:sv,VueElement:Er,assertNumber:rv,callWithAsyncErrorHandling:xs,callWithErrorHandling:ti,camelize:it,capitalize:ua,cloneVNode:sn,compatUtils:ay,computed:J,createApp:Jl,createBlock:Vl,createCommentVNode:Np,createElementBlock:Bb,createElementVNode:bc,createHydrationRenderer:_p,createPropsRestProxy:cb,createRenderer:xp,createSSRApp:dh,createSlots:Wv,createStaticVNode:zb,createTextVNode:yc,createVNode:ft,customRef:Mf,defineAsyncComponent:Bv,defineComponent:el,defineCustomElement:Yp,defineEmits:Xv,defineExpose:eb,defineModel:nb,defineOptions:tb,defineProps:Qv,defineSSRCustomElement:Ey,defineSlots:sb,devtools:Xb,effect:Sg,effectScope:_g,getCurrentInstance:as,getCurrentScope:vf,getCurrentWatcher:nv,getTransitionRawChildren:_r,guardReactiveProps:Op,h:ja,handleError:fa,hasInjectionContext:gv,hydrate:qy,hydrateOnIdle:Lv,hydrateOnInteraction:Fv,hydrateOnMediaQuery:Pv,hydrateOnVisible:Mv,initCustomFormatter:Zb,initDirectivesForSSR:Gy,inject:Os,isMemoSame:Up,isProxy:Qi,isReactive:yn,isReadonly:tn,isRef:St,isRuntimeOnly:Gb,isShallow:ms,isVNode:Cn,markRaw:Lf,mergeDefaults:rb,mergeModels:ob,mergeProps:Lp,nextTick:Rt,nodeOps:Vp,normalizeClass:Yi,normalizeProps:og,normalizeStyle:Ji,onActivated:Ds,onBeforeMount:ep,onBeforeUnmount:Sr,onBeforeUpdate:dc,onDeactivated:Ms,onErrorCaptured:ap,onMounted:We,onRenderTracked:np,onRenderTriggered:sp,onScopeDispose:kg,onServerPrefetch:tp,onUnmounted:xt,onUpdated:wr,onWatcherCleanup:Ff,openBlock:Ui,patchProp:Jp,popScopeId:pv,provide:wi,proxyRefs:ac,pushScopeId:fv,queuePostFlushCb:Mi,reactive:Hn,readonly:Ml,ref:h,registerRuntimeCompiler:Fp,render:ch,renderList:Kv,renderSlot:Zv,resolveComponent:jv,resolveDirective:Gv,resolveDynamicComponent:qv,resolveFilter:ny,resolveTransitionHooks:Va,setBlockTracking:Hi,setDevtoolsHook:ey,setTransitionHooks:Tn,shallowReactive:sc,shallowReadonly:Vg,shallowRef:nc,ssrContextKey:Vf,ssrUtils:sy,stop:Tg,toDisplayString:mf,toHandlerKey:Da,toHandlers:Jv,toRaw:Je,toRef:Qg,toRefs:Zg,toValue:Gg,transformVNodeArgs:Ub,triggerRef:qg,unref:en,useAttrs:lb,useCssModule:Iy,useCssVars:hy,useHost:Qp,useId:Tv,useModel:bb,useSSRContext:jf,useShadowRoot:Ry,useSlots:ib,useTemplateRef:Cv,useTransitionState:rc,vModelCheckbox:kc,vModelDynamic:ah,vModelRadio:wc,vModelSelect:sh,vModelText:Zl,vShow:Wp,version:Hp,warn:Yb,watch:ns,watchEffect:vv,watchPostEffect:bv,watchSyncEffect:qf,withAsyncContext:db,withCtx:lc,withDefaults:ab,withDirectives:mv,withKeys:jy,withMemo:Jb,withModifiers:zy,withScopeId:hv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Vi=Symbol(""),Ei=Symbol(""),Sc=Symbol(""),Yl=Symbol(""),ph=Symbol(""),ra=Symbol(""),hh=Symbol(""),mh=Symbol(""),Tc=Symbol(""),Cc=Symbol(""),nl=Symbol(""),Ec=Symbol(""),gh=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),Ic=Symbol(""),Oc=Symbol(""),Nc=Symbol(""),Lc=Symbol(""),vh=Symbol(""),bh=Symbol(""),Ar=Symbol(""),Ql=Symbol(""),Dc=Symbol(""),Mc=Symbol(""),ji=Symbol(""),al=Symbol(""),Pc=Symbol(""),No=Symbol(""),Wy=Symbol(""),Lo=Symbol(""),Xl=Symbol(""),Zy=Symbol(""),Jy=Symbol(""),Fc=Symbol(""),Yy=Symbol(""),Qy=Symbol(""),$c=Symbol(""),yh=Symbol(""),Ka={[Vi]:"Fragment",[Ei]:"Teleport",[Sc]:"Suspense",[Yl]:"KeepAlive",[ph]:"BaseTransition",[ra]:"openBlock",[hh]:"createBlock",[mh]:"createElementBlock",[Tc]:"createVNode",[Cc]:"createElementVNode",[nl]:"createCommentVNode",[Ec]:"createTextVNode",[gh]:"createStaticVNode",[Ac]:"resolveComponent",[Rc]:"resolveDynamicComponent",[Ic]:"resolveDirective",[Oc]:"resolveFilter",[Nc]:"withDirectives",[Lc]:"renderList",[vh]:"renderSlot",[bh]:"createSlots",[Ar]:"toDisplayString",[Ql]:"mergeProps",[Dc]:"normalizeClass",[Mc]:"normalizeStyle",[ji]:"normalizeProps",[al]:"guardReactiveProps",[Pc]:"toHandlers",[No]:"camelize",[Wy]:"capitalize",[Lo]:"toHandlerKey",[Xl]:"setBlockTracking",[Zy]:"pushScopeId",[Jy]:"popScopeId",[Fc]:"withCtx",[Yy]:"unref",[Qy]:"isRef",[$c]:"withMemo",[yh]:"isMemoSame"};function Xy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Ka[t]=e[t]})}const ws={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ex(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:ws}}function qi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=ws){return e&&(r?(e.helper(ra),e.helper(Ja(e.inSSR,c))):e.helper(Za(e.inSSR,c)),l&&e.helper(Nc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function na(e,t=ws){return{type:17,loc:t,elements:e}}function Is(e,t=ws){return{type:15,loc:t,properties:e}}function wt(e,t){return{type:16,loc:ws,key:Me(e)?Fe(e,!0):e,value:t}}function Fe(e,t=!1,s=ws,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Vs(e,t=ws){return{type:8,loc:t,children:e}}function It(e,t=[],s=ws){return{type:14,loc:s,callee:e,arguments:t}}function Wa(e,t=void 0,s=!1,n=!1,a=ws){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Do(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:ws}}function tx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:ws}}function sx(e){return{type:21,body:e,loc:ws}}function Za(e,t){return e||t?Tc:Cc}function Ja(e,t){return e||t?hh:mh}function Bc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Za(n,e.isComponent)),t(ra),t(Ja(n,e.isComponent)))}const Zd=new Uint8Array([123,123]),Jd=new Uint8Array([125,125]);function Yd(e){return e>=97&&e<=122||e>=65&&e<=90}function bs(e){return e===32||e===10||e===9||e===12||e===13}function In(e){return e===47||e===62||bs(e)}function er(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const jt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class nx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Zd,this.delimiterClose=Jd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Zd,this.delimiterClose=Jd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?In(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||bs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===jt.TitleEnd||this.currentSequence===jt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===jt.Cdata[this.sequenceIndex]?++this.sequenceIndex===jt.Cdata.length&&(this.state=28,this.currentSequence=jt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Yd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){In(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(In(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(er("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){bs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Yd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||bs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):bs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):bs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||In(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||In(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||In(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||In(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||In(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):bs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):bs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){bs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=jt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===jt.ScriptEnd[3]?this.startSpecial(jt.ScriptEnd,4):t===jt.StyleEnd[3]?this.startSpecial(jt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===jt.TitleEnd[3]?this.startSpecial(jt.TitleEnd,4):t===jt.TextareaEnd[3]?this.startSpecial(jt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===jt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Qd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function aa(e,t){const s=Qd("MODE",t),n=Qd(e,t);return s===3?n===!0:n!==!1}function Gi(e,t,s,...n){return aa(e,t)}function Uc(e){throw e}function xh(e){}function ut(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const hs=e=>e.type===4&&e.isStatic;function _h(e){switch(e){case"Teleport":case"teleport":return Ei;case"Suspense":case"suspense":return Sc;case"KeepAlive":case"keep-alive":return Yl;case"BaseTransition":case"base-transition":return ph}}const ax=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Hc=e=>!ax.test(e),kh=/[A-Za-z_$\xA0-\uFFFF]/,ix=/[\.\?\w$\xA0-\uFFFF]/,lx=/\s+[.[]\s*|\s*[.[]\s+/g,wh=e=>e.type===4?e.content:e.loc.source,rx=e=>{const t=wh(e).trim().replace(lx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?kh:ix).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Sh=rx,ox=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,cx=e=>ox.test(wh(e)),dx=cx;function Rs(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Me(t)?a.name===t:t.test(a.name)))return a}}function Rr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Yn(i.arg,t))return i}}function Yn(e,t){return!!(e&&hs(e)&&e.content===t)}function ux(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Yr(e){return e.type===5||e.type===2}function Xd(e){return e.type===7&&e.name==="pre"}function fx(e){return e.type===7&&e.name==="slot"}function tr(e){return e.type===1&&e.tagType===3}function sr(e){return e.type===1&&e.tagType===2}const px=new Set([ji,al]);function Th(e,t=[]){if(e&&!Me(e)&&e.type===14){const s=e.callee;if(!Me(s)&&px.has(s))return Th(e.arguments[0],t.concat(e))}return[e,t]}function nr(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Me(a)&&a.type===14){const r=Th(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Me(a))n=Is([t]);else if(a.type===14){const r=a.arguments[0];!Me(r)&&r.type===15?eu(t,r)||r.properties.unshift(t):a.callee===Pc?n=It(s.helper(Ql),[Is([t]),a]):a.arguments.unshift(Is([t])),!n&&(n=a)}else a.type===15?(eu(t,a)||a.properties.unshift(t),n=a):(n=It(s.helper(Ql),[Is([t]),a]),l&&l.callee===al&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function eu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Ki(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function hx(e){return e.type===14&&e.callee===$c?e.arguments[1].returns:e}const mx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Ch(e){for(let t=0;t<e.length;t++)if(!bs(e.charCodeAt(t)))return!1;return!0}function zc(e){return e.type===2&&Ch(e.content)||e.type===12&&zc(e.content)}function Eh(e){return e.type===3||zc(e)}const Ah={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ia,isPreTag:Ia,isIgnoreNewlineTag:Ia,isCustomElement:Ia,onError:Uc,onWarn:xh,comments:!1,prefixIdentifiers:!1};let Qe=Ah,Wi=null,_n="",Gt=null,Ge=null,cs="",cn=-1,Wn=-1,Vc=0,Pn=!1,Mo=null;const dt=[],gt=new nx(dt,{onerr:ln,ontext(e,t){yl($t(e,t),e,t)},ontextentity(e,t,s){yl(e,t,s)},oninterpolation(e,t){if(Pn)return yl($t(e,t),e,t);let s=e+gt.delimiterOpen.length,n=t-gt.delimiterClose.length;for(;bs(_n.charCodeAt(s));)s++;for(;bs(_n.charCodeAt(n-1));)n--;let a=$t(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),Po({type:5,content:Rl(a,!1,bt(s,n)),loc:bt(e,t)})},onopentagname(e,t){const s=$t(e,t);Gt={type:1,tag:s,ns:Qe.getNamespace(s,dt[0],Qe.ns),tagType:0,props:[],children:[],loc:bt(e-1,t),codegenNode:void 0}},onopentagend(e){su(e)},onclosetag(e,t){const s=$t(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<dt.length;a++)if(dt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&ln(24,dt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=dt.shift();Al(r,t,l<a)}break}n||ln(23,Rh(e,60))}},onselfclosingtag(e){const t=Gt.tag;Gt.isSelfClosing=!0,su(e),dt[0]&&dt[0].tag===t&&Al(dt.shift(),e)},onattribname(e,t){Ge={type:6,name:$t(e,t),nameLoc:bt(e,t),value:void 0,loc:bt(e)}},ondirname(e,t){const s=$t(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Pn&&n===""&&ln(26,e),Pn||n==="")Ge={type:6,name:s,nameLoc:bt(e,t),value:void 0,loc:bt(e)};else if(Ge={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Fe("prop")]:[],loc:bt(e)},n==="pre"){Pn=gt.inVPre=!0,Mo=Gt;const a=Gt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Tx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=$t(e,t);if(Pn&&!Xd(Ge))Ge.name+=s,Qn(Ge.nameLoc,t);else{const n=s[0]!=="[";Ge.arg=Rl(n?s:s.slice(1,-1),n,bt(e,t),n?3:0)}},ondirmodifier(e,t){const s=$t(e,t);if(Pn&&!Xd(Ge))Ge.name+="."+s,Qn(Ge.nameLoc,t);else if(Ge.name==="slot"){const n=Ge.arg;n&&(n.content+="."+s,Qn(n.loc,t))}else{const n=Fe(s,!0,bt(e,t));Ge.modifiers.push(n)}},onattribdata(e,t){cs+=$t(e,t),cn<0&&(cn=e),Wn=t},onattribentity(e,t,s){cs+=e,cn<0&&(cn=t),Wn=s},onattribnameend(e){const t=Ge.loc.start.offset,s=$t(t,e);Ge.type===7&&(Ge.rawName=s),Gt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&ln(2,t)},onattribend(e,t){if(Gt&&Ge){if(Qn(Ge.loc,t),e!==0)if(cs.includes("&")&&(cs=Qe.decodeEntities(cs,!0)),Ge.type===6)Ge.name==="class"&&(cs=Oh(cs).trim()),e===1&&!cs&&ln(13,t),Ge.value={type:2,content:cs,loc:e===1?bt(cn,Wn):bt(cn-1,Wn+1)},gt.inSFCRoot&&Gt.tag==="template"&&Ge.name==="lang"&&cs&&cs!=="html"&&gt.enterRCDATA(er("</template"),0);else{let s=0;Ge.exp=Rl(cs,!1,bt(cn,Wn),0,s),Ge.name==="for"&&(Ge.forParseResult=vx(Ge.exp));let n=-1;Ge.name==="bind"&&(n=Ge.modifiers.findIndex(a=>a.content==="sync"))>-1&&Gi("COMPILER_V_BIND_SYNC",Qe,Ge.loc,Ge.arg.loc.source)&&(Ge.name="model",Ge.modifiers.splice(n,1))}(Ge.type!==7||Ge.name!=="pre")&&Gt.props.push(Ge)}cs="",cn=Wn=-1},oncomment(e,t){Qe.comments&&Po({type:3,content:$t(e,t),loc:bt(e-4,t+3)})},onend(){const e=_n.length;for(let t=0;t<dt.length;t++)Al(dt[t],e-1),ln(24,dt[t].loc.start.offset)},oncdata(e,t){(dt[0]?dt[0].ns:Qe.ns)!==0?yl($t(e,t),e,t):ln(1,e-9)},onprocessinginstruction(e){(dt[0]?dt[0].ns:Qe.ns)===0&&ln(21,e-1)}}),tu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,gx=/^\(|\)$/g;function vx(e){const t=e.loc,s=e.content,n=s.match(mx);if(!n)return;const[,a,i]=n,l=(u,f,p=!1)=>{const b=t.start.offset+f,y=b+u.length;return Rl(u,!1,bt(b,y),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(gx,"").trim();const c=a.indexOf(o),d=o.match(tu);if(d){o=o.replace(tu,"").trim();const u=d[1].trim();let f;if(u&&(f=s.indexOf(u,c+o.length),r.key=l(u,f,!0)),d[2]){const p=d[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function $t(e,t){return _n.slice(e,t)}function su(e){gt.inSFCRoot&&(Gt.innerLoc=bt(e+1,e+1)),Po(Gt);const{tag:t,ns:s}=Gt;s===0&&Qe.isPreTag(t)&&Vc++,Qe.isVoidTag(t)?Al(Gt,e):(dt.unshift(Gt),(s===1||s===2)&&(gt.inXML=!0)),Gt=null}function yl(e,t,s){{const i=dt[0]&&dt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=dt[0]||Wi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Qn(a.loc,s)):n.children.push({type:2,content:e,loc:bt(t,s)})}function Al(e,t,s=!1){s?Qn(e.loc,Rh(t,60)):Qn(e.loc,bx(t,62)+1),gt.inSFCRoot&&(e.children.length?e.innerLoc.end=ze({},e.children[e.children.length-1].loc.end):e.innerLoc.end=ze({},e.innerLoc.start),e.innerLoc.source=$t(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Pn||(n==="slot"?e.tagType=2:nu(e)?e.tagType=3:xx(e)&&(e.tagType=1)),gt.inRCDATA||(e.children=Ih(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Vc--,Mo===e&&(Pn=gt.inVPre=!1,Mo=null),gt.inXML&&(dt[0]?dt[0].ns:Qe.ns)===0&&(gt.inXML=!1);{const l=e.props;if(!gt.inSFCRoot&&aa("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!nu(e)){const o=dt[0]||Wi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Gi("COMPILER_INLINE_TEMPLATE",Qe,r.loc)&&e.children.length&&(r.value={type:2,content:$t(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function bx(e,t){let s=e;for(;_n.charCodeAt(s)!==t&&s<_n.length-1;)s++;return s}function Rh(e,t){let s=e;for(;_n.charCodeAt(s)!==t&&s>=0;)s--;return s}const yx=new Set(["if","else","else-if","for","slot"]);function nu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&yx.has(t[s].name))return!0}return!1}function xx({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||_x(e.charCodeAt(0))||_h(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Gi("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&Yn(n.arg,"is")&&Gi("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function _x(e){return e>64&&e<91}const kx=/\r\n/g;function Ih(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Vc)a.content=a.content.replace(kx,`
`);else if(Ch(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&wx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Oh(a.content))}return s?e.filter(Boolean):e}function wx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Oh(e){let t="",s=!1;for(let n=0;n<e.length;n++)bs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Po(e){(dt[0]||Wi).children.push(e)}function bt(e,t){return{start:gt.getPos(e),end:t==null?t:gt.getPos(t),source:t==null?t:$t(e,t)}}function Sx(e){return bt(e.start.offset,e.end.offset)}function Qn(e,t){e.end=gt.getPos(t),e.source=$t(e.start.offset,t)}function Tx(e){const t={type:6,name:e.rawName,nameLoc:bt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Rl(e,t=!1,s,n=0,a=0){return Fe(e,t,s,n)}function ln(e,t,s){Qe.onError(ut(e,bt(t,t)))}function Cx(){gt.reset(),Gt=null,Ge=null,cs="",cn=-1,Wn=-1,dt.length=0}function Ex(e,t){if(Cx(),_n=e,Qe=ze({},Ah),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}gt.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,gt.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(gt.delimiterOpen=er(s[0]),gt.delimiterClose=er(s[1]));const n=Wi=ex([],e);return gt.parse(_n),n.loc=bt(0,e.length),n.children=Ih(n.children),Wi=null,n}function Ax(e,t){Il(e,void 0,t,!!Nh(e))}function Nh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!sr(t[0])?t[0]:null}function Il(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const f=n?0:ys(u,s);if(f>0){if(f>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const p=u.codegenNode;if(p.type===13){const b=p.patchFlag;if((b===void 0||b===512||b===1)&&Dh(u,s)>=2){const y=Mh(u);y&&(p.props=s.hoist(y))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(u.type===12&&(n?0:ys(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const f=u.tagType===1;f&&s.scopes.vSlot++,Il(u,e,s,!1,a),f&&s.scopes.vSlot--}else if(u.type===11)Il(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let f=0;f<u.branches.length;f++)Il(u.branches[f],e,s,u.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&be(e.codegenNode.children))e.codegenNode.children=o(na(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!be(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(na(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!be(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Rs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(na(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!be(d.children)&&d.children.type===15){const f=d.children.properties.find(p=>p.key===u||p.key.content===u);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ys(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Dh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ys(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ys(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ra),t.removeHelper(Ja(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Za(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ys(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Me(r)||Jt(r))continue;const o=ys(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Rx=new Set([Dc,Mc,ji,al]);function Lh(e,t){if(e.type===14&&!Me(e.callee)&&Rx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ys(s,t);if(s.type===14)return Lh(s,t)}return 0}function Dh(e,t){let s=3;const n=Mh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ys(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ys(r,t):r.type===14?c=Lh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Mh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Ix(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ht,isCustomElement:d=Ht,expressionPlugins:u=[],scopeId:f=null,slotted:p=!0,ssr:b=!1,inSSR:y=!1,ssrCssVars:E="",bindingMetadata:I=je,inline:x=!1,isTS:m=!1,onError:_=Uc,onWarn:S=xh,compatConfig:g}){const w=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:w&&ua(it(w[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:f,slotted:p,ssr:b,inSSR:y,ssrCssVars:E,bindingMetadata:I,inline:x,isTS:m,onError:_,onWarn:S,compatConfig:g,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const M=T.helpers.get(C)||0;return T.helpers.set(C,M+1),C},removeHelper(C){const M=T.helpers.get(C);if(M){const H=M-1;H?T.helpers.set(C,H):T.helpers.delete(C)}},helperString(C){return`_${Ka[T.helper(C)]}`},replaceNode(C){T.parent.children[T.childIndex]=T.currentNode=C},removeNode(C){const M=T.parent.children,H=C?M.indexOf(C):T.currentNode?T.childIndex:-1;!C||C===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>H&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(H,1)},onNodeRemoved:Ht,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){Me(C)&&(C=Fe(C)),T.hoists.push(C);const M=Fe(`_hoisted_${T.hoists.length}`,!1,C.loc,2);return M.hoisted=C,M},cache(C,M=!1,H=!1){const P=tx(T.cached.length,C,M,H);return T.cached.push(P),P}};return T.filters=new Set,T}function Ox(e,t){const s=Ix(e,t);Ir(e,s),t.hoistStatic&&Ax(e,s),t.ssr||Nx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Nx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Nh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Bc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=qi(t,s(Vi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Lx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Me(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Ir(a,t))}}function Ir(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(be(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(nl);break;case 5:t.ssr||t.helper(Ar);break;case 9:for(let i=0;i<e.branches.length;i++)Ir(e.branches[i],t);break;case 10:case 11:case 1:case 0:Lx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Ph(e,t){const s=Me(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(fx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Or="/*@__PURE__*/",Fh=e=>`${Ka[e]}: _${Ka[e]}`;function Dx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(y){return`_${Ka[y]}`},push(y,E=-2,I){p.code+=y},indent(){b(++p.indentLevel)},deindent(y=!1){y?--p.indentLevel:b(--p.indentLevel)},newline(){b(p.indentLevel)}};function b(y){p.push(`
`+"  ".repeat(y),0)}return p}function Mx(e,t={}){const s=Dx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),f=u.length>0,p=!i&&n!=="module";Px(e,s);const y=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${y}(${I}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${u.map(Fh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Qr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Qr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Qr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let x=0;x<e.temps;x++)a(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Zt(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Px(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Tc,Cc,nl,Ec,gh].filter(f=>d.includes(f)).map(Fh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Fx(e.hoists,t),i(),a("return ")}function Qr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Oc:t==="component"?Ac:Ic);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Ki(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Fx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Zt(i,t),n())}t.pure=!1}function jc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),il(e,t,s),s&&t.deindent(),t.push("]")}function il(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Me(r)?a(r,-3):be(r)?jc(r,t):Zt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Zt(e,t){if(Me(e)){t.push(e,-3);return}if(Jt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Zt(e.codegenNode,t);break;case 2:$x(e,t);break;case 4:$h(e,t);break;case 5:Bx(e,t);break;case 12:Zt(e.codegenNode,t);break;case 8:Bh(e,t);break;case 3:Hx(e,t);break;case 13:zx(e,t);break;case 14:jx(e,t);break;case 15:qx(e,t);break;case 17:Gx(e,t);break;case 18:Kx(e,t);break;case 19:Wx(e,t);break;case 20:Zx(e,t);break;case 21:il(e.body,t,!0,!1);break}}function $x(e,t){t.push(JSON.stringify(e.content),-3,e)}function $h(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Bx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Or),s(`${n(Ar)}(`),Zt(e.content,t),s(")")}function Bh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Me(n)?t.push(n,-3):Zt(n,t)}}function Ux(e,t){const{push:s}=t;if(e.type===8)s("["),Bh(e,t),s("]");else if(e.isStatic){const n=Hc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Hx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Or),s(`${n(nl)}(${JSON.stringify(e.content)})`,-3,e)}function zx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:f,isComponent:p}=e;let b;o&&(b=String(o)),d&&s(n(Nc)+"("),u&&s(`(${n(ra)}(${f?"true":""}), `),a&&s(Or);const y=u?Ja(t.inSSR,p):Za(t.inSSR,p);s(n(y)+"(",-2,e),il(Vx([i,l,r,b,c]),t),s(")"),u&&s(")"),d&&(s(", "),Zt(d,t),s(")"))}function Vx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function jx(e,t){const{push:s,helper:n,pure:a}=t,i=Me(e.callee)?e.callee:n(e.callee);a&&s(Or),s(i+"(",-2,e),il(e.arguments,t),s(")")}function qx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Ux(c,t),s(": "),Zt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Gx(e,t){jc(e.elements,t)}function Kx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Ka[Fc]}(`),s("(",-2,e),be(i)?il(i,t):i&&Zt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),be(l)?jc(l,t):Zt(l,t)):r&&Zt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Wx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Hc(s.content);u&&l("("),$h(s,t),u&&l(")")}else l("("),Zt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Zt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Zt(a,t),d||t.indentLevel--,i&&o(!0)}function Zx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Xl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Zt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Xl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Jx=Ph(/^(?:if|else|else-if)$/,(e,t,s)=>Yx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=iu(a,o,s);else{const c=Qx(n.codegenNode);c.alternate=iu(a,o+n.branches.length-1,s)}}}));function Yx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ut(28,t.loc)),t.exp=Fe("true",!1,a)}if(t.name==="if"){const a=au(e,t),i={type:9,loc:Sx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Eh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ut(30,e.loc)),s.removeNode();const r=au(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Ir(r,s),o&&o(),s.currentNode=null}else s.onError(ut(30,e.loc));break}}}function au(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Rs(e,"for")?e.children:[e],userKey:Rr(e,"key"),isTemplateIf:s}}function iu(e,t,s){return e.condition?Do(e.condition,lu(e,t,s),It(s.helper(nl),['""',"true"])):lu(e,t,s)}function lu(e,t,s){const{helper:n}=s,a=wt("key",Fe(`${t}`,!1,ws,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return nr(o,a,s),o}else return qi(s,n(Vi),Is([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=hx(o);return c.type===13&&Bc(c,s),nr(c,a,s),o}}function Qx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Xx=Ph("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return e0(e,t,s,i=>{const l=It(n(Lc),[i.source]),r=tr(e),o=Rs(e,"memo"),c=Rr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Fe(c.value.content,!0):void 0:c.exp);const u=d?wt("key",d):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=qi(s,n(Vi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let b;const{children:y}=i,E=y.length!==1||y[0].type!==1,I=sr(e)?e:r&&e.children.length===1&&sr(e.children[0])?e.children[0]:null;if(I?(b=I.codegenNode,r&&u&&nr(b,u,s)):E?b=qi(s,n(Vi),u?Is([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(b=y[0].codegenNode,r&&u&&nr(b,u,s),b.isBlock!==!f&&(b.isBlock?(a(ra),a(Ja(s.inSSR,b.isComponent))):a(Za(s.inSSR,b.isComponent))),b.isBlock=!f,b.isBlock?(n(ra),n(Ja(s.inSSR,b.isComponent))):n(Za(s.inSSR,b.isComponent))),o){const x=Wa(Fo(i.parseResult,[Fe("_cached")]));x.body=sx([Vs(["const _memo = (",o.exp,")"]),Vs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(yh)}(_cached, _memo)) return _cached`]),Vs(["const _item = ",b]),Fe("_item.memo = _memo"),Fe("return _item")]),l.arguments.push(x,Fe("_cache"),Fe(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Wa(Fo(i.parseResult),b,!0))}})});function e0(e,t,s,n){if(!t.exp){s.onError(ut(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ut(32,t.loc));return}Uh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:tr(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Uh(e,t){e.finalized||(e.finalized=!0)}function Fo({value:e,key:t,index:s},n=[]){return t0([e,t,s,...n])}function t0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Fe("_".repeat(n+1),!1))}const ru=Fe("undefined",!1),s0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Rs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},n0=(e,t,s,n)=>Wa(e,s,!1,!0,s.length?s[0].loc:n);function a0(e,t,s=n0){t.helper(Fc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=Rs(e,"slot",!0);if(o){const{arg:E,exp:I}=o;E&&!hs(E)&&(r=!0),i.push(wt(E||Fe("default",!0),s(I,void 0,n,a)))}let c=!1,d=!1;const u=[],f=new Set;let p=0;for(let E=0;E<n.length;E++){const I=n[E];let x;if(!tr(I)||!(x=Rs(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(o){t.onError(ut(37,x.loc));break}c=!0;const{children:m,loc:_}=I,{arg:S=Fe("default",!0),exp:g,loc:w}=x;let T;hs(S)?T=S?S.content:"default":r=!0;const C=Rs(I,"for"),M=s(g,C,m,_);let H,P;if(H=Rs(I,"if"))r=!0,l.push(Do(H.exp,xl(S,M,p++),ru));else if(P=Rs(I,/^else(?:-if)?$/,!0)){let R=E,j;for(;R--&&(j=n[R],!!Eh(j)););if(j&&tr(j)&&Rs(j,/^(?:else-)?if$/)){let Q=l[l.length-1];for(;Q.alternate.type===19;)Q=Q.alternate;Q.alternate=P.exp?Do(P.exp,xl(S,M,p++),ru):xl(S,M,p++)}else t.onError(ut(30,P.loc))}else if(C){r=!0;const R=C.forParseResult;R?(Uh(R),l.push(It(t.helper(Lc),[R.source,Wa(Fo(R),xl(S,M),!0)]))):t.onError(ut(32,C.loc))}else{if(T){if(f.has(T)){t.onError(ut(38,w));continue}f.add(T),T==="default"&&(d=!0)}i.push(wt(S,M))}}if(!o){const E=(I,x)=>{const m=s(I,void 0,x,a);return t.compatConfig&&(m.isNonScopedSlot=!0),wt("default",m)};c?u.length&&!u.every(zc)&&(d?t.onError(ut(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,n))}const b=r?2:Ol(e.children)?3:1;let y=Is(i.concat(wt("_",Fe(b+"",!1))),a);return l.length&&(y=It(t.helper(bh),[y,na(l)])),{slots:y,hasDynamicSlots:r}}function xl(e,t,s){const n=[wt("name",e),wt("fn",t)];return s!=null&&n.push(wt("key",Fe(String(s),!0))),Is(n)}function Ol(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Ol(s.children))return!0;break;case 9:if(Ol(s.branches))return!0;break;case 10:case 11:if(Ol(s.children))return!0;break}}return!1}const Hh=new WeakMap,i0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?l0(e,t):`"${n}"`;const r=Xe(l)&&l.callee===Rc;let o,c,d=0,u,f,p,b=r||l===Ei||l===Sc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const y=zh(e,t,void 0,i,r);o=y.props,d=y.patchFlag,f=y.dynamicPropNames;const E=y.directives;p=E&&E.length?na(E.map(I=>o0(I,t))):void 0,y.shouldUseBlock&&(b=!0)}if(e.children.length>0)if(l===Yl&&(b=!0,d|=1024),i&&l!==Ei&&l!==Yl){const{slots:E,hasDynamicSlots:I}=a0(e,t);c=E,I&&(d|=1024)}else if(e.children.length===1&&l!==Ei){const E=e.children[0],I=E.type,x=I===5||I===8;x&&ys(E,t)===0&&(d|=1),x||I===2?c=E:c=e.children}else c=e.children;f&&f.length&&(u=c0(f)),e.codegenNode=qi(t,l,o,c,d===0?void 0:d,u,p,!!b,!1,i,e.loc)};function l0(e,t,s=!1){let{tag:n}=e;const a=$o(n),i=Rr(e,"is",!1,!0);if(i)if(a||aa("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Fe(i.value.content,!0):(r=i.exp,r||(r=Fe("is",!1,i.arg.loc))),r)return It(t.helper(Rc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=_h(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Ac),t.components.add(n),Ki(n,"component"))}function zh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],f=o.length>0;let p=!1,b=0,y=!1,E=!1,I=!1,x=!1,m=!1,_=!1;const S=[],g=M=>{c.length&&(d.push(Is(ou(c),r)),c=[]),M&&d.push(M)},w=()=>{t.scopes.vFor>0&&c.push(wt(Fe("ref_for",!0),Fe("true")))},T=({key:M,value:H})=>{if(hs(M)){const P=M.content,R=ca(P);if(R&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!bn(P)&&(x=!0),R&&bn(P)&&(_=!0),R&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ys(H,t)>0)return;P==="ref"?y=!0:P==="class"?E=!0:P==="style"?I=!0:P!=="key"&&!S.includes(P)&&S.push(P),n&&(P==="class"||P==="style")&&!S.includes(P)&&S.push(P)}else m=!0};for(let M=0;M<s.length;M++){const H=s[M];if(H.type===6){const{loc:P,name:R,nameLoc:j,value:Q}=H;let U=!0;if(R==="ref"&&(y=!0,w()),R==="is"&&($o(l)||Q&&Q.content.startsWith("vue:")||aa("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(wt(Fe(R,!0,j),Fe(Q?Q.content:"",U,Q?Q.loc:P)))}else{const{name:P,arg:R,exp:j,loc:Q,modifiers:U}=H,O=P==="bind",N=P==="on";if(P==="slot"){n||t.onError(ut(40,Q));continue}if(P==="once"||P==="memo"||P==="is"||O&&Yn(R,"is")&&($o(l)||aa("COMPILER_IS_ON_ELEMENT",t))||N&&i)continue;if((O&&Yn(R,"key")||N&&f&&Yn(R,"vue:before-update"))&&(p=!0),O&&Yn(R,"ref")&&w(),!R&&(O||N)){if(m=!0,j)if(O){if(g(),aa("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(j);continue}w(),g(),d.push(j)}else g({type:14,loc:Q,callee:t.helper(Pc),arguments:n?[j]:[j,"true"]});else t.onError(ut(O?34:35,Q));continue}O&&U.some(we=>we.content==="prop")&&(b|=32);const Y=t.directiveTransforms[P];if(Y){const{props:we,needRuntime:ke}=Y(H,e,t);!i&&we.forEach(T),N&&R&&!hs(R)?g(Is(we,r)):c.push(...we),ke&&(u.push(H),Jt(ke)&&Hh.set(H,ke))}else Xm(P)||(u.push(H),f&&(p=!0))}}let C;if(d.length?(g(),d.length>1?C=It(t.helper(Ql),d,r):C=d[0]):c.length&&(C=Is(ou(c),r)),m?b|=16:(E&&!n&&(b|=2),I&&!n&&(b|=4),S.length&&(b|=8),x&&(b|=32)),!p&&(b===0||b===32)&&(y||_||u.length>0)&&(b|=512),!t.inSSR&&C)switch(C.type){case 15:let M=-1,H=-1,P=!1;for(let Q=0;Q<C.properties.length;Q++){const U=C.properties[Q].key;hs(U)?U.content==="class"?M=Q:U.content==="style"&&(H=Q):U.isHandlerKey||(P=!0)}const R=C.properties[M],j=C.properties[H];P?C=It(t.helper(ji),[C]):(R&&!hs(R.value)&&(R.value=It(t.helper(Dc),[R.value])),j&&(I||j.value.type===4&&j.value.content.trim()[0]==="["||j.value.type===17)&&(j.value=It(t.helper(Mc),[j.value])));break;case 14:break;default:C=It(t.helper(ji),[It(t.helper(al),[C])]);break}return{props:C,directives:u,patchFlag:b,dynamicPropNames:S,shouldUseBlock:p}}function ou(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ca(i))&&r0(l,a):(t.set(i,a),s.push(a))}return s}function r0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=na([e.value,t.value],e.loc)}function o0(e,t){const s=[],n=Hh.get(e);n?s.push(t.helperString(n)):(t.helper(Ic),t.directives.add(e.name),s.push(Ki(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Fe("true",!1,a);s.push(Is(e.modifiers.map(l=>wt(l,i)),a))}return na(s,e.loc)}function c0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function $o(e){return e==="component"||e==="Component"}const d0=(e,t)=>{if(sr(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=u0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Wa([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=It(t.helper(vh),l,n)}};function u0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=it(l.name),a.push(l)));else if(l.name==="bind"&&Yn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=it(l.arg.content);s=l.exp=Fe(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&hs(l.arg)&&(l.arg.content=it(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=zh(e,t,a,!1,!1);n=i,l.length&&t.onError(ut(36,l[0].loc))}return{slotName:s,slotProps:n}}const Vh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ut(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const f=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Da(it(u)):`on:${u}`;r=Fe(f,!0,l.loc)}else r=Vs([`${s.helperString(Lo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Lo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Sh(o),f=!(u||dx(o)),p=o.content.includes(";");(f||c&&u)&&(o=Vs([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let d={props:[wt(r,o||Fe("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},f0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=it(i.content):i.content=`${s.helperString(No)}(${i.content})`:(i.children.unshift(`${s.helperString(No)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&cu(i,"."),n.some(r=>r.content==="attr")&&cu(i,"^")),{props:[wt(i,l)]}},cu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},p0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Yr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Yr(o))n||(n=s[i]=Vs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Yr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ys(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:It(t.helper(Ec),r)}}}}},du=new WeakSet,h0=(e,t)=>{if(e.type===1&&Rs(e,"once",!0))return du.has(e)||t.inVOnce||t.inSSR?void 0:(du.add(e),t.inVOnce=!0,t.helper(Xl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},jh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ut(41,e.loc)),ui();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ut(44,n.loc)),ui();if(r==="literal-const"||r==="setup-const")return s.onError(ut(45,n.loc)),ui();if(!l.trim()||!Sh(n))return s.onError(ut(42,n.loc)),ui();const o=a||Fe("modelValue",!0),c=a?hs(a)?`onUpdate:${it(a.content)}`:Vs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Vs([`${u} => ((`,n,") = $event)"]);const f=[wt(o,e.exp),wt(c,d)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(y=>y.content).map(y=>(Hc(y)?y:JSON.stringify(y))+": true").join(", "),b=a?hs(a)?`${a.content}Modifiers`:Vs([a,' + "Modifiers"']):"modelModifiers";f.push(wt(b,Fe(`{ ${p} }`,!1,e.loc,2)))}return ui(f)};function ui(e=[]){return{props:e}}const m0=/[\w).+\-_$\]]/,g0=(e,t)=>{aa("COMPILER_FILTERS",t)&&(e.type===5?ar(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&ar(s.exp,t)}))};function ar(e,t){if(e.type===4)uu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?uu(n,t):n.type===8?ar(e,t):n.type===5&&ar(n.content,t))}}function uu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,f,p,b,y=[];for(p=0;p<s.length;p++)if(f=u,u=s.charCodeAt(p),n)u===39&&f!==92&&(n=!1);else if(a)u===34&&f!==92&&(a=!1);else if(i)u===96&&f!==92&&(i=!1);else if(l)u===47&&f!==92&&(l=!1);else if(u===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)b===void 0?(d=p+1,b=s.slice(0,p).trim()):E();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let I=p-1,x;for(;I>=0&&(x=s.charAt(I),x===" ");I--);(!x||!m0.test(x))&&(l=!0)}}b===void 0?b=s.slice(0,p).trim():d!==0&&E();function E(){y.push(s.slice(d,p).trim()),d=p+1}if(y.length){for(p=0;p<y.length;p++)b=v0(b,y[p],t);e.content=b,e.ast=void 0}}function v0(e,t,s){s.helper(Oc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Ki(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Ki(a,"filter")}(${e}${i!==")"?","+i:i}`}}const fu=new WeakSet,b0=(e,t)=>{if(e.type===1){const s=Rs(e,"memo");return!s||fu.has(e)||t.inSSR?void 0:(fu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Bc(n,t),e.codegenNode=It(t.helper($c),[s.exp,Wa(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},y0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ut(53,n.loc)),s.exp=Fe("",!0,n.loc);else{const a=it(n.content);(kh.test(a[0])||a[0]==="-")&&(s.exp=Fe(a,!1,n.loc))}}}};function x0(e){return[[y0,h0,Jx,b0,Xx,g0,d0,i0,s0,p0],{on:Vh,bind:f0,model:jh}]}function _0(e,t={}){const s=t.onError||Uc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ut(48)):n&&s(ut(49));const a=!1;t.cacheHandlers&&s(ut(50)),t.scopeId&&!n&&s(ut(51));const i=ze({},t,{prefixIdentifiers:a}),l=Me(e)?Ex(e,i):e,[r,o]=x0();return Ox(l,ze({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:ze({},o,t.directiveTransforms||{})})),Mx(l,i)}const k0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qh=Symbol(""),Gh=Symbol(""),Kh=Symbol(""),Wh=Symbol(""),Bo=Symbol(""),Zh=Symbol(""),Jh=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),Xh=Symbol("");Xy({[qh]:"vModelRadio",[Gh]:"vModelCheckbox",[Kh]:"vModelText",[Wh]:"vModelSelect",[Bo]:"vModelDynamic",[Zh]:"withModifiers",[Jh]:"withKeys",[Yh]:"vShow",[Qh]:"Transition",[Xh]:"TransitionGroup"});let ka;function w0(e,t=!1){return ka||(ka=document.createElement("div")),t?(ka.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,ka.children[0].getAttribute("foo")):(ka.innerHTML=e,ka.textContent)}const S0={parseMode:"html",isVoidTag:gg,isNativeTag:e=>pg(e)||hg(e)||mg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:w0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Qh;if(e==="TransitionGroup"||e==="transition-group")return Xh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},T0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Fe("style",!0,t.loc),exp:C0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},C0=(e,t)=>{const s=ff(e);return Fe(JSON.stringify(s),!1,t,3)};function Bn(e,t){return ut(e,t)}const E0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Bn(54,a)),t.children.length&&(s.onError(Bn(55,a)),t.children.length=0),{props:[wt(Fe("innerHTML",!0,a),n||Fe("",!0))]}},A0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Bn(56,a)),t.children.length&&(s.onError(Bn(57,a)),t.children.length=0),{props:[wt(Fe("textContent",!0),n?ys(n,s)>0?n:It(s.helperString(Ar),[n],a):Fe("",!0))]}},R0=(e,t,s)=>{const n=jh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Bn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Kh,r=!1;if(a==="input"||i){const o=Rr(t,"type");if(o){if(o.type===7)l=Bo;else if(o.value)switch(o.value.content){case"radio":l=qh;break;case"checkbox":l=Gh;break;case"file":r=!0,s.onError(Bn(60,e.loc));break}}else ux(t)&&(l=Bo)}else a==="select"&&(l=Wh);r||(n.needRuntime=s.helper(l))}else s.onError(Bn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},I0=ks("passive,once,capture"),O0=ks("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),N0=ks("left,right"),em=ks("onkeyup,onkeydown,onkeypress"),L0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Gi("COMPILER_V_ON_NATIVE",s)||I0(o)?l.push(o):N0(o)?hs(e)?em(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):O0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},pu=(e,t)=>hs(e)&&e.content.toLowerCase()==="onclick"?Fe(t,!0):e.type!==4?Vs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,D0=(e,t,s)=>Vh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=L0(i,a,s,e.loc);if(o.includes("right")&&(i=pu(i,"onContextmenu")),o.includes("middle")&&(i=pu(i,"onMouseup")),o.length&&(l=It(s.helper(Zh),[l,JSON.stringify(o)])),r.length&&(!hs(i)||em(i.content.toLowerCase()))&&(l=It(s.helper(Jh),[l,JSON.stringify(r)])),c.length){const d=c.map(ua).join("");i=hs(i)?Fe(`${i.content}${d}`,!0):Vs(["(",i,`) + "${d}"`])}return{props:[wt(i,l)]}}),M0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Bn(62,a)),{props:[],needRuntime:s.helper(Yh)}},P0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},F0=[T0],$0={cloak:k0,html:E0,text:A0,model:R0,on:D0,show:M0};function B0(e,t={}){return _0(e,ze({},S0,t,{nodeTransforms:[P0,...F0,...t.nodeTransforms||[]],directiveTransforms:ze({},$0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const hu=Object.create(null);function U0(e,t){if(!Me(e))if(e.nodeType)e=e.innerHTML;else return Ht;const s=sg(e,t),n=hu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=ze({hoistStatic:!0,onError:void 0,onWarn:Ht},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=B0(e,a),l=new Function("Vue",i)(Ky);return l._rc=!0,hu[s]=l}Fp(U0);const ir=Hn({items:[]});let H0=1;function Nr(e,t="info",s=3e3){const n=H0++;return ir.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>qc(n),s),n}function qc(e){const t=ir.items.findIndex(s=>s.id===e);t>=0&&ir.items.splice(t,1)}function Ae(e,t="info",s=3e3){return Nr(e,t,s)}Ae.success=(e,t=3e3)=>Nr(e,"success",t);Ae.error=(e,t=5e3)=>Nr(e,"error",t);Ae.info=(e,t=3e3)=>Nr(e,"info",t);Ae.dismiss=qc;const z0={setup(){return{state:ir,dismiss:qc}},template:`
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
  `},fn=Hn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ua=null;function _s({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ua&&Ua(!1),fn.title=e,fn.message=t,fn.confirmLabel=s,fn.cancelLabel=n,fn.danger=a,fn.open=!0,new Promise(i=>{Ua=i})}function mu(e){fn.open=!1,Ua&&(Ua(e),Ua=null)}const V0={setup(){function e(t){fn.open&&t.key==="Escape"&&(t.stopPropagation(),mu(!1))}return We(()=>document.addEventListener("keydown",e,!0)),xt(()=>document.removeEventListener("keydown",e,!0)),{state:fn,settle:mu}},template:`
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
 */const Aa=typeof document<"u";function tm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function j0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&tm(e.default)}const nt=Object.assign;function Xr(e,t){const s={};for(const n in t){const a=t[n];s[n]=qs(a)?a.map(e):e(a)}return s}const Ai=()=>{},qs=Array.isArray;function gu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const sm=/#/g,q0=/&/g,G0=/\//g,K0=/=/g,W0=/\?/g,nm=/\+/g,Z0=/%5B/g,J0=/%5D/g,am=/%5E/g,Y0=/%60/g,im=/%7B/g,Q0=/%7C/g,lm=/%7D/g,X0=/%20/g;function Gc(e){return e==null?"":encodeURI(""+e).replace(Q0,"|").replace(Z0,"[").replace(J0,"]")}function e_(e){return Gc(e).replace(im,"{").replace(lm,"}").replace(am,"^")}function Uo(e){return Gc(e).replace(nm,"%2B").replace(X0,"+").replace(sm,"%23").replace(q0,"%26").replace(Y0,"`").replace(im,"{").replace(lm,"}").replace(am,"^")}function t_(e){return Uo(e).replace(K0,"%3D")}function s_(e){return Gc(e).replace(sm,"%23").replace(W0,"%3F")}function n_(e){return s_(e).replace(G0,"%2F")}function Zi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const a_=/\/$/,i_=e=>e.replace(a_,"");function eo(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=c_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Zi(l)}}function l_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function vu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function r_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ya(t.matched[n],s.matched[a])&&rm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ya(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function rm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!o_(e[s],t[s]))return!1;return!0}function o_(e,t){return qs(e)?bu(e,t):qs(t)?bu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function bu(e,t){return qs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function c_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const On={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Ho=(function(e){return e.pop="pop",e.push="push",e})({}),to=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function d_(e){if(!e)if(Aa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),i_(e)}const u_=/^[^#]+#/;function f_(e,t){return e.replace(u_,"#")+t}function p_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Lr=()=>({left:window.scrollX,top:window.scrollY});function h_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=p_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function yu(e,t){return(history.state?history.state.position-t:-1)+e}const zo=new Map;function m_(e,t){zo.set(e,t)}function g_(e){const t=zo.get(e);return zo.delete(e),t}function v_(e){return typeof e=="string"||e&&typeof e=="object"}function om(e){return typeof e=="string"||typeof e=="symbol"}let mt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const cm=Symbol("");mt.MATCHER_NOT_FOUND+"",mt.NAVIGATION_GUARD_REDIRECT+"",mt.NAVIGATION_ABORTED+"",mt.NAVIGATION_CANCELLED+"",mt.NAVIGATION_DUPLICATED+"";function Qa(e,t){return nt(new Error,{type:e,[cm]:!0},t)}function rn(e,t){return e instanceof Error&&cm in e&&(t==null||!!(e.type&t))}const b_=["params","query","hash"];function y_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of b_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function x_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(nm," "),i=a.indexOf("="),l=Zi(i<0?a:a.slice(0,i)),r=i<0?null:Zi(a.slice(i+1));if(l in t){let o=t[l];qs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function xu(e){let t="";for(let s in e){const n=e[s];if(s=t_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(qs(n)?n.map(a=>a&&Uo(a)):[n&&Uo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function __(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=qs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const k_=Symbol(""),_u=Symbol(""),Dr=Symbol(""),Kc=Symbol(""),Vo=Symbol("");function fi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Fn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Qa(mt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):v_(f)?o(Qa(mt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(f=>o(f))})}function so(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(tm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Fn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=j0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const f=(u.__vccOpts||u)[t];return f&&Fn(f,s,n,l,r,a)()}))}}return i}function w_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ya(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ya(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let S_=()=>location.protocol+"//"+location.host;function dm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),vu(r,"")}return vu(s,e)+n+a}function T_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=dm(e,location),b=s.value,y=t.value;let E=0;if(f){if(s.value=p,t.value=f,l&&l===b){l=null;return}E=y?f.position-y.position:0}else n(p);a.forEach(I=>{I(s.value,b,{delta:E,type:Ho.pop,direction:E?E>0?to.forward:to.back:to.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const b=a.indexOf(f);b>-1&&a.splice(b,1)};return i.push(p),p}function d(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(nt({},f.state,{scroll:Lr()}),"")}}function u(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function ku(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Lr():null}}function C_(e){const{history:t,location:s}=window,n={value:dm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),f=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:S_()+e+o;try{t[d?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[d?"replace":"assign"](f)}}function l(o,c){i(o,nt({},t.state,ku(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=nt({},a.value,t.state,{forward:o,scroll:Lr()});i(d.current,d,!0),i(o,nt({},ku(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function E_(e){e=d_(e);const t=C_(e),s=T_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=nt({location:"",base:e,go:n,createHref:f_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function A_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),E_(e)}let Xn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Et=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Et||{});const R_={type:Xn.Static,value:""},I_=/[a-zA-Z0-9_]/;function O_(e){if(!e)return[[]];if(e==="/")return[[R_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=Et.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Et.Static?i.push({type:Xn.Static,value:c}):s===Et.Param||s===Et.ParamRegExp||s===Et.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Xn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Et.ParamRegExp){n=s,s=Et.EscapeNext;continue}switch(s){case Et.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Et.Param):f();break;case Et.EscapeNext:f(),s=n;break;case Et.Param:o==="("?s=Et.ParamRegExp:I_.test(o)?f():(u(),s=Et.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Et.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Et.ParamRegExpEnd:d+=o;break;case Et.ParamRegExpEnd:u(),s=Et.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Et.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const wu="[^/]+?",N_={sensitive:!1,strict:!1,start:!0,end:!0};var es=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(es||{});const L_=/[.+*?^${}()[\]/\\]/g;function D_(e,t){const s=nt({},N_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[es.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const f=c[u];let p=es.Segment+(s.sensitive?es.BonusCaseSensitive:0);if(f.type===Xn.Static)u||(a+="/"),a+=f.value.replace(L_,"\\$&"),p+=es.Static;else if(f.type===Xn.Param){const{value:b,repeatable:y,optional:E,regexp:I}=f;i.push({name:b,repeatable:y,optional:E});const x=I||wu;if(x!==wu){p+=es.BonusCustomRegExp;try{`${x}`}catch(_){throw new Error(`Invalid custom RegExp for param "${b}" (${x}): `+_.message)}}let m=y?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(m=E&&c.length<2?`(?:/${m})`:"/"+m),E&&(m+="?"),a+=m,p+=es.Dynamic,E&&(p+=es.BonusOptional),y&&(p+=es.BonusRepeatable),x===".*"&&(p+=es.BonusWildcard)}d.push(p)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=es.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let f=1;f<d.length;f++){const p=d[f]||"",b=i[f-1];u[b.name]=p&&b.repeatable?p.split("/"):p}return u}function o(c){let d="",u=!1;for(const f of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const p of f)if(p.type===Xn.Static)d+=p.value;else if(p.type===Xn.Param){const{value:b,repeatable:y,optional:E}=p,I=b in c?c[b]:"";if(qs(I)&&!y)throw new Error(`Provided param "${b}" is an array but it is not repeatable (* or + modifiers)`);const x=qs(I)?I.join("/"):I;if(!x)if(E)f.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${b}"`);d+=x}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function M_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===es.Static+es.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===es.Static+es.Segment?1:-1:0}function um(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=M_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Su(n))return 1;if(Su(a))return-1}return a.length-n.length}function Su(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const P_={strict:!1,end:!0,sensitive:!1};function F_(e,t,s){const n=D_(O_(e.path),s),a=nt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function $_(e,t){const s=[],n=new Map;t=gu(P_,t);function a(u){return n.get(u)}function i(u,f,p){const b=!p,y=Cu(u);y.aliasOf=p&&p.record;const E=gu(t,u),I=[y];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of _)I.push(Cu(nt({},y,{components:p?p.record.components:y.components,path:S,aliasOf:p?p.record:y})))}let x,m;for(const _ of I){const{path:S}=_;if(f&&S[0]!=="/"){const g=f.record.path,w=g[g.length-1]==="/"?"":"/";_.path=f.record.path+(S&&w+S)}if(x=F_(_,f,E),p?p.alias.push(x):(m=m||x,m!==x&&m.alias.push(x),b&&u.name&&!Eu(x)&&l(u.name)),fm(x)&&o(x),y.children){const g=y.children;for(let w=0;w<g.length;w++)i(g[w],x,p&&p.children[w])}p=p||x}return m?()=>{l(m)}:Ai}function l(u){if(om(u)){const f=n.get(u);f&&(n.delete(u),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(u);f>-1&&(s.splice(f,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const f=H_(u,s);s.splice(f,0,u),u.record.name&&!Eu(u)&&n.set(u.record.name,u)}function c(u,f){let p,b={},y,E;if("name"in u&&u.name){if(p=n.get(u.name),!p)throw Qa(mt.MATCHER_NOT_FOUND,{location:u});E=p.record.name,b=nt(Tu(f.params,p.keys.filter(m=>!m.optional).concat(p.parent?p.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&Tu(u.params,p.keys.map(m=>m.name))),y=p.stringify(b)}else if(u.path!=null)y=u.path,p=s.find(m=>m.re.test(y)),p&&(b=p.parse(y),E=p.record.name);else{if(p=f.name?n.get(f.name):s.find(m=>m.re.test(f.path)),!p)throw Qa(mt.MATCHER_NOT_FOUND,{location:u,currentLocation:f});E=p.record.name,b=nt({},f.params,u.params),y=p.stringify(b)}const I=[];let x=p;for(;x;)I.unshift(x.record),x=x.parent;return{name:E,path:y,params:b,matched:I,meta:U_(I)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Tu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Cu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:B_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function B_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Eu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function U_(e){return e.reduce((t,s)=>nt(t,s.meta),{})}function H_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;um(e,t[i])<0?n=i:s=i+1}const a=z_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function z_(e){let t=e;for(;t=t.parent;)if(fm(t)&&um(e,t)===0)return t}function fm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Au(e){const t=Os(Dr),s=Os(Kc),n=J(()=>{const o=en(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const f=u.findIndex(Ya.bind(null,d));if(f>-1)return f;const p=Ru(o[c-2]);return c>1&&Ru(d)===p&&u[u.length-1].path!==p?u.findIndex(Ya.bind(null,o[c-2])):f}),i=J(()=>a.value>-1&&K_(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&rm(s.params,n.value.params));function r(o={}){if(G_(o)){const c=t[en(e.replace)?"replace":"push"](en(e.to)).catch(Ai);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function V_(e){return e.length===1?e[0]:e}const j_=el({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Au,setup(e,{slots:t}){const s=Hn(Au(e)),{options:n}=Os(Dr),a=J(()=>({[Iu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Iu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&V_(t.default(s));return e.custom?i:ja("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),q_=j_;function G_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function K_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!qs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Ru(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Iu=(e,t,s)=>e??t??s,W_=el({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Os(Vo),a=J(()=>e.route||n.value),i=Os(_u,0),l=J(()=>{let c=en(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);wi(_u,J(()=>l.value+1)),wi(k_,r),wi(Vo,a);const o=h();return ns(()=>[o.value,r.value,e.name],([c,d,u],[f,p,b])=>{d&&(d.instances[u]=c,p&&p!==d&&c&&c===f&&(d.leaveGuards.size||(d.leaveGuards=p.leaveGuards),d.updateGuards.size||(d.updateGuards=p.updateGuards))),c&&d&&(!p||!Ya(d,p)||!f)&&(d.enterCallbacks[u]||[]).forEach(y=>y(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,f=u&&u.components[d];if(!f)return Ou(s.default,{Component:f,route:c});const p=u.props[d],b=p?p===!0?c.params:typeof p=="function"?p(c):p:null,E=ja(f,nt({},b,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Ou(s.default,{Component:E,route:c})||E}}});function Ou(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Z_=W_;function J_(e){const t=$_(e.routes,e),s=e.parseQuery||x_,n=e.stringifyQuery||xu,a=e.history,i=fi(),l=fi(),r=fi(),o=nc(On);let c=On;Aa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Xr.bind(null,V=>""+V),u=Xr.bind(null,n_),f=Xr.bind(null,Zi);function p(V,de){let ce,ye;return om(V)?(ce=t.getRecordMatcher(V),ye=de):ye=V,t.addRoute(ye,ce)}function b(V){const de=t.getRecordMatcher(V);de&&t.removeRoute(de)}function y(){return t.getRoutes().map(V=>V.record)}function E(V){return!!t.getRecordMatcher(V)}function I(V,de){if(de=nt({},de||o.value),typeof V=="string"){const L=eo(s,V,de.path),$=t.resolve({path:L.path},de),ee=a.createHref(L.fullPath);return nt(L,$,{params:f($.params),hash:Zi(L.hash),redirectedFrom:void 0,href:ee})}let ce;if(V.path!=null)ce=nt({},V,{path:eo(s,V.path,de.path).path});else{const L=nt({},V.params);for(const $ in L)L[$]==null&&delete L[$];ce=nt({},V,{params:u(L)}),de.params=u(de.params)}const ye=t.resolve(ce,de),ge=V.hash||"";ye.params=d(f(ye.params));const He=l_(n,nt({},V,{hash:e_(ge),path:ye.path})),k=a.createHref(He);return nt({fullPath:He,hash:ge,query:n===xu?__(V.query):V.query||{}},ye,{redirectedFrom:void 0,href:k})}function x(V){return typeof V=="string"?eo(s,V,o.value.path):nt({},V)}function m(V,de){if(c!==V)return Qa(mt.NAVIGATION_CANCELLED,{from:de,to:V})}function _(V){return w(V)}function S(V){return _(nt(x(V),{replace:!0}))}function g(V,de){const ce=V.matched[V.matched.length-1];if(ce&&ce.redirect){const{redirect:ye}=ce;let ge=typeof ye=="function"?ye(V,de):ye;return typeof ge=="string"&&(ge=ge.includes("?")||ge.includes("#")?ge=x(ge):{path:ge},ge.params={}),nt({query:V.query,hash:V.hash,params:ge.path!=null?{}:V.params},ge)}}function w(V,de){const ce=c=I(V),ye=o.value,ge=V.state,He=V.force,k=V.replace===!0,L=g(ce,ye);if(L)return w(nt(x(L),{state:typeof L=="object"?nt({},ge,L.state):ge,force:He,replace:k}),de||ce);const $=ce;$.redirectedFrom=de;let ee;return!He&&r_(n,ye,ce)&&(ee=Qa(mt.NAVIGATION_DUPLICATED,{to:$,from:ye}),ke(ye,ye,!0,!1)),(ee?Promise.resolve(ee):M($,ye)).catch(Z=>rn(Z)?rn(Z,mt.NAVIGATION_GUARD_REDIRECT)?Z:we(Z):N(Z,$,ye)).then(Z=>{if(Z){if(rn(Z,mt.NAVIGATION_GUARD_REDIRECT))return w(nt({replace:k},x(Z.to),{state:typeof Z.to=="object"?nt({},ge,Z.to.state):ge,force:He}),de||$)}else Z=P($,ye,!0,k,ge);return H($,ye,Z),Z})}function T(V,de){const ce=m(V,de);return ce?Promise.reject(ce):Promise.resolve()}function C(V){const de=F.values().next().value;return de&&typeof de.runWithContext=="function"?de.runWithContext(V):V()}function M(V,de){let ce;const[ye,ge,He]=w_(V,de);ce=so(ye.reverse(),"beforeRouteLeave",V,de);for(const L of ye)L.leaveGuards.forEach($=>{ce.push(Fn($,V,de))});const k=T.bind(null,V,de);return ce.push(k),Se(ce).then(()=>{ce=[];for(const L of i.list())ce.push(Fn(L,V,de));return ce.push(k),Se(ce)}).then(()=>{ce=so(ge,"beforeRouteUpdate",V,de);for(const L of ge)L.updateGuards.forEach($=>{ce.push(Fn($,V,de))});return ce.push(k),Se(ce)}).then(()=>{ce=[];for(const L of He)if(L.beforeEnter)if(qs(L.beforeEnter))for(const $ of L.beforeEnter)ce.push(Fn($,V,de));else ce.push(Fn(L.beforeEnter,V,de));return ce.push(k),Se(ce)}).then(()=>(V.matched.forEach(L=>L.enterCallbacks={}),ce=so(He,"beforeRouteEnter",V,de,C),ce.push(k),Se(ce))).then(()=>{ce=[];for(const L of l.list())ce.push(Fn(L,V,de));return ce.push(k),Se(ce)}).catch(L=>rn(L,mt.NAVIGATION_CANCELLED)?L:Promise.reject(L))}function H(V,de,ce){r.list().forEach(ye=>C(()=>ye(V,de,ce)))}function P(V,de,ce,ye,ge){const He=m(V,de);if(He)return He;const k=de===On,L=Aa?history.state:{};ce&&(ye||k?a.replace(V.fullPath,nt({scroll:k&&L&&L.scroll},ge)):a.push(V.fullPath,ge)),o.value=V,ke(V,de,ce,k),we()}let R;function j(){R||(R=a.listen((V,de,ce)=>{if(!se.listening)return;const ye=I(V),ge=g(ye,se.currentRoute.value);if(ge){w(nt(ge,{replace:!0,force:!0}),ye).catch(Ai);return}c=ye;const He=o.value;Aa&&m_(yu(He.fullPath,ce.delta),Lr()),M(ye,He).catch(k=>rn(k,mt.NAVIGATION_ABORTED|mt.NAVIGATION_CANCELLED)?k:rn(k,mt.NAVIGATION_GUARD_REDIRECT)?(w(nt(x(k.to),{force:!0}),ye).then(L=>{rn(L,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&!ce.delta&&ce.type===Ho.pop&&a.go(-1,!1)}).catch(Ai),Promise.reject()):(ce.delta&&a.go(-ce.delta,!1),N(k,ye,He))).then(k=>{k=k||P(ye,He,!1),k&&(ce.delta&&!rn(k,mt.NAVIGATION_CANCELLED)?a.go(-ce.delta,!1):ce.type===Ho.pop&&rn(k,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(ye,He,k)}).catch(Ai)}))}let Q=fi(),U=fi(),O;function N(V,de,ce){we(V);const ye=U.list();return ye.length?ye.forEach(ge=>ge(V,de,ce)):console.error(V),Promise.reject(V)}function Y(){return O&&o.value!==On?Promise.resolve():new Promise((V,de)=>{Q.add([V,de])})}function we(V){return O||(O=!V,j(),Q.list().forEach(([de,ce])=>V?ce(V):de()),Q.reset()),V}function ke(V,de,ce,ye){const{scrollBehavior:ge}=e;if(!Aa||!ge)return Promise.resolve();const He=!ce&&g_(yu(V.fullPath,0))||(ye||!ce)&&history.state&&history.state.scroll||null;return Rt().then(()=>ge(V,de,He)).then(k=>k&&h_(k)).catch(k=>N(k,V,de))}const ie=V=>a.go(V);let he;const F=new Set,se={currentRoute:o,listening:!0,addRoute:p,removeRoute:b,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:y,resolve:I,options:e,push:_,replace:S,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:U.add,isReady:Y,install(V){V.component("RouterLink",q_),V.component("RouterView",Z_),V.config.globalProperties.$router=se,Object.defineProperty(V.config.globalProperties,"$route",{enumerable:!0,get:()=>en(o)}),Aa&&!he&&o.value===On&&(he=!0,_(a.location).catch(ye=>{}));const de={};for(const ye in On)Object.defineProperty(de,ye,{get:()=>o.value[ye],enumerable:!0});V.provide(Dr,se),V.provide(Kc,sc(de)),V.provide(Vo,o);const ce=V.unmount;F.add(V),V.unmount=function(){F.delete(V),F.size<1&&(c=On,R&&R(),R=null,o.value=On,he=!1,O=!1),ce()}}};function Se(V){return V.reduce((de,ce)=>de.then(()=>C(ce)),Promise.resolve())}return se}function pm(){return Os(Dr)}function Y_(e){return Os(Kc)}const Mr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Y_(),s=pm(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ns(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Q_={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(f){var y,E,I,x,m;const p=f.payload||f,b=p.type||f.type;if(b==="tool_start"){const _=((y=p.metadata)==null?void 0:y.call_id)||null,S={callId:_,id:_||`${p.action}-${Date.now()}`,tool:p.action,actor:p.actor||"",channel:p.channel_id||"",iteration:((E=p.metadata)==null?void 0:E.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(b==="tool_end"){const _=((I=p.metadata)==null?void 0:I.call_id)||null;let S=-1;if(_&&(S=e.value.findIndex(g=>g.callId===_&&g.status==="running")),S<0&&!_)for(let g=e.value.length-1;g>=0;g--){const w=e.value[g];if(w.tool===p.action&&w.status==="running"){S=g;break}}if(S>=0){const g=e.value[S];g.status=(x=p.metadata)!=null&&x.error?"error":"success",g.elapsed=((m=p.metadata)==null?void 0:m.elapsed_ms)||Date.now()-g.startTime,g.result=p.detail||"",g.fadingOut=!0,setTimeout(()=>{const w=e.value.indexOf(g);w>=0&&e.value.splice(w,1),t.value.unshift(g),t.value.length>n&&t.value.pop()},5e3)}return}if(b==="tool_stream"){const _=p.call_id||p.tool_name||"unknown";if(p.finished){const S={...s.value};delete S[_],s.value=S}else{const g=((s.value[_]||"")+(p.chunk||"")).split(`
`);s.value={...s.value,[_]:g.slice(-30).join(`
`)}}return}}let i=null;function l(){const f=Date.now();e.value.forEach(p=>{p.status==="running"&&(p.elapsed=f-p.startTime)})}let r=!1;function o(){r||(r=!0,Ke.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ke.off("events",a),i&&(clearInterval(i),i=null))}We(o),Ds(o),Ms(c),xt(c);function d(f){return f<1e3?`${f}ms`:`${(f/1e3).toFixed(1)}s`}function u(f){return f==="running"?"clock":f==="success"?"success":f==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Wc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function pa(e){const t=Wc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function hm(e){const t=Wc(e);return t?t.toLocaleTimeString():"—"}function mm(e){const t=Wc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function X_(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Xa(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Zc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function gm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Nu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function vm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function bm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const ym=Symbol("agent-detail-cancelled"),ek=15e3;function tk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((p,b)=>{o=p,c=b});function u(p,b){r||(r=!0,l!==null&&a(l),l=null,(p?o:c)(b))}let f;try{f=e(i==null?void 0:i.signal)}catch(p){u(!1,p)}return r||Promise.resolve(f).then(p=>u(!0,p),p=>u(!1,p)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const p=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${p}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,ym),i==null||i.abort()}}}function xm({state:e,requestDetail:t,timeoutMs:s=ek,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const f=l;l=null,f==null||f.cancel()}function o(f,{initial:p,coalesce:b}){if(!f)return Promise.resolve();if(b&&l&&l.agentId===f&&e.detailId===f)return l.promise;r();const y={agentId:f,cancel:null,promise:null};l=y,p?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=tk(I=>t(f,{signal:I}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return y.cancel=E.cancel,y.promise=(async()=>{let I=null,x=null;try{I=await E.promise}catch(m){x=m}I!==ym&&(l!==y||e.detailId!==f||(l=null,!x&&(I===null||typeof I!="object")&&(x=new Error(`${n} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),y.promise}function c(f){return e.detailId=f,o(f,{initial:!0,coalesce:!1})}function d(){const f=e.detailId;return f?o(f,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function sk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const nk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=J(()=>e.value.filter(N=>N.status==="running").length),o=J(()=>e.value.filter(N=>N.status==="completed").length),c=J(()=>e.value.filter(N=>["failed","timeout","killed"].includes(N.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(N=>["failed","timeout","killed"].includes(N.status)):e.value.filter(N=>N.status===i.value));function f(N){const Y=Number(N.max_iterations)||0;return Y<=0?0:Math.min(100,Math.round(N.iteration_count/Y*100))}function p(N){return(Number(N.max_iterations)||0)>0}function b(N,Y){return N?N==="N/A"?"N/A":Y==="current_inheritance"?`inherit (currently ${N})`:N:"unknown"}function y(N){return b(N.display_model,N.display_model_source||N.display_source)}function E(N){return b(N.display_reasoning_effort,N.display_reasoning_effort_source||N.display_source)}function I(N){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[N]||""}const x=h(null),m=h(null),_=h(!1),S=h(null),g=h(""),T=xm({state:{get detail(){return x.value},set detail(N){x.value=N},get detailId(){return m.value},set detailId(N){m.value=N},get detailLoading(){return _.value},set detailLoading(N){_.value=N},get detailError(){return S.value},set detailError(N){S.value=N}},requestDetail:(N,{signal:Y})=>G.get(`/api/agents/${encodeURIComponent(N)}`,{signal:Y})});async function C(N){g.value="",await T.open(N.id)}function M(){T.close(),g.value=""}async function H(){await T.refresh()}async function P(N,Y){try{await navigator.clipboard.writeText(Y||""),g.value=N,setTimeout(()=>{g.value===N&&(g.value="")},1500)}catch{Ae.error("Copy failed")}}async function R(N=!1){N=N===!0,N||(t.value=!0);try{const Y=await G.get("/api/agents");e.value=Array.isArray(Y)?Y:[],s.value=null}catch(Y){N||(s.value=Y.message)}N||(t.value=!1)}async function j(N){const Y=e.value.find(ke=>ke.id===N);if(await _s({title:"Kill agent",message:`Kill agent "${(Y==null?void 0:Y.label)||N}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=N;try{await G.del(`/api/agents/${encodeURIComponent(N)}`),Ae.success("Agent killed"),await R()}catch(ke){Ae.error(ke.message||"Failed to kill agent")}n.value=null}}const Q=sk({isEnabled:()=>a.value&&l,refreshList:()=>R(!0),hasOpenDetail:()=>!!m.value,refreshDetail:H});function U(){Q.start()}function O(){Q.stop()}return ns(a,()=>Q.sync()),We(()=>{l=!0,R(),U()}),Ds(()=>{l=!0,R(!0),U()}),Ms(()=>{l=!1,O()}),xt(()=>{l=!1,O(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:pa,formatDuration:Xa,progressPercent:f,hasProgress:p,displayModelText:y,displayEffortText:E,displaySourceLabel:I,detail:x,detailId:m,detailLoading:_,detailError:S,copied:g,openDetail:C,closeDetail:M,copyText:P,fetchAgents:R,killAgent:j,startAutoRefresh:U,stopAutoRefresh:O}}},ak={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),f=h(null),p=h("");let b=!1;const E=xm({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return f.value},set detailError(O){f.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:N})=>G.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:N})});async function I(O){p.value="",await E.open(O.id)}function x(){E.close(),p.value=""}async function m(O,N){try{await navigator.clipboard.writeText(N||""),p.value=O,setTimeout(()=>{p.value===O&&(p.value="")},1500)}catch{Ae.error("Copy failed")}}const _=J(()=>e.value.reduce((O,N)=>O+(N.iteration_count||0),0)),S=J(()=>e.value.filter(O=>O.status==="running").length);function g(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function w(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function T(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function C(O=!1){O=O===!0,O||(t.value=!0);try{const N=await G.get("/api/loops");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){O||(s.value=N.message)}O||(t.value=!1)}async function M(){l.value=null;const O=a.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(N.stop_condition=O.stop_condition.trim()),i.value=!0;try{const Y=await G.post("/api/loops",N);Ae.success(`Loop started: ${Y.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(Y){l.value=Y.message}i.value=!1}async function H(O){if(await _s({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=O;try{await G.del(`/api/loops/${encodeURIComponent(O)}`),Ae.success("Loop stopped"),await C()}catch(Y){Ae.error(Y.message||"Failed to stop loop")}r.value=null}}async function P(O){o.value=O;try{await G.post(`/api/loops/${encodeURIComponent(O)}/restart`),Ae.success("Loop restarted"),await C()}catch(N){Ae.error(N.message||"Failed to restart loop")}o.value=null}function R(O){b&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(C(!0),d.value&&E.refresh())}let j=null;function Q(){j!==null&&clearInterval(j),j=null}function U(){Q(),b&&(j=setInterval(()=>{C(!0),d.value&&E.refresh()},5e3))}return We(()=>{b=!0,C(),Ke.subscribe("events",R),U()}),Ds(()=>{b=!0,C(!0),U()}),Ms(()=>{b=!1,Q()}),xt(()=>{b=!1,Ke.unsubscribe("events",R),Q(),E.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:f,copied:p,totalIterations:_,runningCount:S,statusDotClass:g,statusBadge:w,modeBadge:T,formatAge:mm,formatDuration:Xa,formatTs:pa,formatTokens:bm,openDetail:I,closeDetail:x,copyText:m,fetchLoops:C,doCreate:M,doStop:H,doRestart:P}}},ik={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=J(()=>e.value.filter(x=>x.status==="running").length),r=J(()=>e.value.filter(x=>x.status!=="running").length);function o(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(m){x||(s.value=m.message)}x||(t.value=!1)}function u(){f(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ns(n,x=>{x?u():f()});async function p(x){if(await _s({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await G.del(`/api/processes/${x}`),Ae.success(`Process ${x} killed`),await d()}catch(_){Ae.error(_.message||"Failed to kill process")}i.value=null}}function b(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let y=!1;function E(){y||(y=!0,d(),Ke.subscribe("events",b),u())}function I(){y&&(y=!1,Ke.unsubscribe("events",b),f())}return We(E),Ds(E),Ms(I),xt(I),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Xa,fetchProcesses:d,doKill:p}}},lk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Lu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function rk(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function ok(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function ck(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=lk.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),f=new Date(u-864e5).getTimezoneOffset(),p=new Date(u+864e5).getTimezoneOffset(),b=[];for(const E of new Set([f,p])){const I=new Date(u+E*6e4);rk(I,c)===d&&(b.some(x=>x.getTime()===I.getTime())||b.push(I))}if(b.sort((E,I)=>E.getTime()-I.getTime()),b.length===0)return{state:"nonexistent",typed:t};if(b.length>1)return{state:"ambiguous",typed:t,options:b.map(E=>({instant:E,offset:ok(E),iso:E.toISOString()}))};const y=b[0];return{state:"ok",typed:t,instant:y,iso:y.toISOString()}}const dk={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=J(()=>ck(a.value.run_at));ns(()=>a.value.run_at,()=>{r.value=null});const c=J(()=>{var se;const F=o.value;return F.state==="ok"?F.instant:F.state==="ambiguous"&&r.value!==null&&((se=F.options[r.value])==null?void 0:se.instant)||null}),d=J(()=>{const F=c.value;return F?`${F.toLocaleString()} local — ${F.toISOString()} UTC`:""}),u=h(null),f=h(!1),p=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=h(null),y=h(null),E=h(null),I=h(null),x=h(null),m=h([]),_=h(!1),S=h("");let g=0;const w=J(()=>e.value.filter(F=>F.cron&&!F.one_time).length),T=J(()=>e.value.filter(F=>F.one_time).length),C=J(()=>e.value.filter(F=>F.trigger).length),M=J(()=>e.value.filter(F=>F.paused).length),H=J(()=>e.value.filter(F=>F.consecutive_failures>0).length);function P(F){if(!F)return"-";const se=Date.now(),V=(new Date(F).getTime()-se)/1e3;if(V<0)return"overdue";if(V<60)return"in < 1 min";if(V<3600)return`in ${Math.floor(V/60)} min`;if(V<86400){const ce=Math.floor(V/3600),ye=Math.floor(V%3600/60);return ye>0?`in ${ce}h ${ye}m`:`in ${ce}h`}const de=Math.floor(V/86400);return`in ${de} day${de!==1?"s":""}`}function R(F){return F==null?"-":F<1e3?`${F}ms`:F<6e4?`${(F/1e3).toFixed(1)}s`:Xa(F/1e3)}function j(F=a.value.cron){a.value.cron=F,Lu(a.value,"cron"),u.value=null}function Q(F=a.value.run_at){a.value.run_at=F,Lu(a.value,"run_at"),u.value=null}async function U(){const F=a.value.cron.trim();if(F){f.value=!0;try{u.value=await G.post("/api/schedules/validate-cron",{expression:F})}catch(se){u.value={valid:!1,error:se.message}}f.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(F){s.value=F.message}t.value=!1}async function N(F){if(x.value===F){x.value=null,m.value=[];return}x.value=F,_.value=!0,m.value=[];const se=++g;try{const Se=await G.get(`/api/schedules/${encodeURIComponent(F)}/history?limit=10`);if(se!==g||x.value!==F)return;m.value=Se,S.value=""}catch(Se){if(se!==g||x.value!==F)return;m.value=[],S.value=Se.message||"Failed to load execution history"}se===g&&(_.value=!1)}async function Y(){l.value=null;const F=a.value;if(!F.description.trim()){l.value="Description is required";return}if(!F.channel_id.trim()){l.value="Channel ID is required";return}if(!F.cron.trim()&&!F.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(F.cron.trim()&&F.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const se={description:F.description.trim(),action:F.action,channel_id:F.channel_id.trim()};if(F.cron.trim()&&(se.cron=F.cron.trim()),F.run_at.trim()){const Se=o.value;if(Se.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(Se.state==="invalid"){l.value="One-time run time is not a valid date";return}const V=c.value;if(Se.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!V){l.value="One-time run time could not be resolved";return}se.run_at=V.toISOString()}if(F.action==="reminder"&&F.message.trim()&&(se.message=F.message.trim()),F.action==="check"&&(F.tool_name.trim()&&(se.tool_name=F.tool_name.trim()),F.tool_input_str.trim()))try{se.tool_input=JSON.parse(F.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",se),Ae.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},u.value=null,n.value=!1,await O()}catch(Se){l.value=Se.message}i.value=!1}async function we(F){b.value=F;try{const se=await G.post(`/api/schedules/${encodeURIComponent(F)}/run`);if(se.status==="failure")Ae.error(`Execution failed: ${se.error||"unknown error"}`);else{const Se=se.warning?`Executed (${se.warning})`:"Executed successfully";Ae.success(Se)}await O()}catch(se){Ae.error(se.message||"Failed to trigger")}b.value=null}async function ke(F){E.value=F.id;const se=!F.paused;try{await G.put(`/api/schedules/${encodeURIComponent(F.id)}`,{paused:se}),Ae.success(se?"Schedule paused":"Schedule resumed"),await O()}catch(Se){Ae.error(Se.message||"Failed to update schedule")}E.value=null}async function ie(F){I.value=F;try{await G.post(`/api/schedules/${encodeURIComponent(F)}/reset-failures`),Ae.success("Failure counters reset"),await O()}catch(se){Ae.error(se.message||"Failed to reset")}I.value=null}async function he(F){const se=e.value.find(V=>V.id===F);if(await _s({title:"Delete schedule",message:`Delete "${(se==null?void 0:se.description)||F}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){y.value=F;try{await G.del(`/api/schedules/${encodeURIComponent(F)}`),Ae.success("Schedule deleted"),await O()}catch(V){Ae.error(V.message||"Failed to delete schedule")}y.value=null}}return We(()=>{O()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:f,cronPresets:p,runningId:b,deletingId:y,togglingId:E,resettingId:I,expandedId:x,history:m,historyLoading:_,historyError:S,cronCount:w,oneTimeCount:T,webhookCount:C,pausedCount:M,failingCount:H,formatTs:pa,formatAge:mm,formatFuture:P,formatMs:R,formatDuration:Xa,onCronInput:j,onRunAtInput:Q,validateCron:U,toggleExpand:N,fetchSchedules:O,doCreate:Y,doRunNow:we,doTogglePause:ke,doResetFailures:ie,doDelete:he}}},_m=[{id:"live",label:"Live",component:Q_},{id:"agents",label:"Agents",component:nk},{id:"loops",label:"Loops",component:ak},{id:"processes",label:"Processes",component:ik},{id:"schedules",label:"Schedules",component:dk}],uk={components:{TabbedPage:Mr},setup(){return{tabs:_m}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},fk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await G.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return We(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:pa,formatDetail:i,truncateBlock:gm,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Du=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],pk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],hk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),f=h(""),p=h("last_active"),b=h(!1),y=Du,E=pk,I=h([]),x=h(!1),m=h(""),_=h("flat"),S=h(new Set),g=h(""),w=h(""),T=h(""),C=h(null),M=h(!1);function H(){try{const K=localStorage.getItem("odin-session-presets");K&&(I.value=JSON.parse(K))}catch{}}function P(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const R=J(()=>f.value.trim()!==""||u.value!=="all"),j=J(()=>{let K=[...e.value];const xe=Du.find(Pe=>Pe.id===u.value),Ce=xe?xe.filters:{};if(Ce.source&&(K=K.filter(Pe=>Pe.source===Ce.source)),Ce.minMessages&&(K=K.filter(Pe=>Pe.message_count>=Ce.minMessages)),Ce.hasCompaction&&(K=K.filter(Pe=>Pe.has_summary)),Ce.maxAge!=null){const Pe=Date.now()/1e3;K=K.filter(pt=>pt.last_active&&Pe-pt.last_active<=Ce.maxAge)}if(f.value.trim()){const Pe=f.value.toLowerCase().trim();K=K.filter(pt=>(pt.channel_id||"").toLowerCase().includes(Pe)||(pt.last_user_id||"").toLowerCase().includes(Pe)||(pt.source||"").toLowerCase().includes(Pe))}const Re=p.value,Ve=b.value?1:-1;return K.sort((Pe,pt)=>{const ls=Pe[Re]||0,Ps=pt[Re]||0;return(ls-Ps)*Ve}),K}),Q=J(()=>{if(!a.value||!a.value.messages)return[];const K=a.value.messages;if(K.length===0)return[];const xe=[];let Ce=[];for(const Re of K)Re.role==="user"&&Ce.length>0&&(xe.push(Ce),Ce=[]),Ce.push(Re);return Ce.length>0&&xe.push(Ce),xe}),U=J(()=>j.value.length>0&&c.value.size===j.value.length);function O(K){const xe=K.find(Ce=>Ce.role==="user");if(xe&&xe.content){const Ce=xe.content.slice(0,120);return Ce.length<xe.content.length?Ce+"...":Ce}return"(no user message)"}function N(K){const xe=new Set(S.value);xe.has(K)?xe.delete(K):xe.add(K),S.value=xe}function Y(K){u.value=K}function we(K){u.value=K.id,K.filters.searchQuery!=null&&(f.value=K.filters.searchQuery),K.filters.sortBy&&(p.value=K.filters.sortBy)}function ke(){if(!m.value.trim())return;const K={id:"custom-"+Date.now(),name:m.value.trim(),filters:{searchQuery:f.value,sortBy:p.value}};I.value=[...I.value,K],P(),x.value=!1,m.value=""}function ie(K){I.value=I.value.filter(xe=>xe.id!==K),P(),u.value===K&&(u.value="all")}function he(){u.value="all",f.value="",p.value="last_active",b.value=!1}function F(K){if(!K)return"—";const xe=Date.now()/1e3-K;if(xe<60)return"just now";if(xe<3600){const Re=Math.floor(xe/60);return`${Re} minute${Re!==1?"s":""} ago`}if(xe<86400){const Re=Math.floor(xe/3600);return`${Re} hour${Re!==1?"s":""} ago`}const Ce=Math.floor(xe/86400);return`${Ce} day${Ce!==1?"s":""} ago`}function se(K){if(!K)return"";try{return new Date(K*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Se(K){if(!K)return"";try{return new Date(K*1e3).toLocaleString()}catch{return""}}function V(K){return K==="user"?"bg-gray-900/50 border border-gray-800":K==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function de(K){return K==="user"?"sess-msg-user":K==="assistant"?"sess-msg-assistant":"sess-msg-system"}function ce(K){return K==="user"?"badge-info":K==="assistant"?"badge-success":"badge-warning"}function ye(K){return K==="user"?"sess-dot-user":K==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ge(K){return K==="user"?"text-cyan-400":K==="assistant"?"text-indigo-400":"text-gray-500"}function He(K){return K?K.length>2e3?K.slice(0,2e3)+`
... (truncated)`:K:""}async function k(){const K=g.value.trim();if(K){M.value=!0;try{let xe=`/api/sessions/search?q=${encodeURIComponent(K)}&limit=50`;w.value.trim()&&(xe+=`&channel_id=${encodeURIComponent(w.value.trim())}`),T.value.trim()&&(xe+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ce=await G.get(xe);C.value=Ce.results||[]}catch{C.value=[]}M.value=!1}}function L(){g.value="",w.value="",T.value="",C.value=null}function $(K){return K?K.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ee(K){return K==="user"?"fts-result-user":K==="assistant"?"fts-result-assistant":K==="summary"?"fts-result-summary":K==="fts"?"fts-result-fts":K==="channel"?"fts-result-channel":"fts-result-default"}function Z(K){return K==="user"?"badge-info":K==="assistant"?"badge-success":K==="summary"?"badge-warning":K==="fts"?"badge-success":"badge-info"}async function X(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(K){s.value=K.message}t.value=!1}function ue(){s.value=null,X()}async function oe(K){if(n.value===K){n.value=null,a.value=null,S.value=new Set;return}n.value=K,a.value=null,i.value=!0,S.value=new Set;const xe=++l;try{const Ce=await G.get(`/api/sessions/${encodeURIComponent(K)}`);xe===l&&n.value===K&&(a.value=Ce)}catch(Ce){xe===l&&n.value===K&&(a.value={messages:[],summary:"",error:Ce.message||"Failed to load session"})}finally{xe===l&&(i.value=!1)}}function le(K){const xe=new Set(c.value);xe.has(K)?xe.delete(K):xe.add(K),c.value=xe}function te(){U.value?c.value=new Set:c.value=new Set(j.value.map(K=>K.channel_id))}function ne(K){r.value=K}async function fe(){if(r.value){o.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await X()}catch(K){s.value=K.message||"Failed to clear session"}o.value=!1,r.value=null}}function ve(){d.value=!0}async function Te(){if(c.value.size!==0){o.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await X()}catch(K){s.value=K.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function Oe(K,xe){const Ce=`/api/sessions/${encodeURIComponent(K)}/export?format=${xe}`;try{const Re=await G.getBlob(Ce),Ve=URL.createObjectURL(Re),Pe=document.createElement("a");Pe.href=Ve,Pe.download=`session-${K}.${xe==="text"?"txt":"json"}`,Pe.click(),URL.revokeObjectURL(Ve)}catch(Re){s.value=Re.message||"Failed to export session"}}let Le=null;function De(K){K.payload&&K.payload.channel_id&&(clearTimeout(Le),Le=setTimeout(()=>{if(X(),n.value&&K.payload.channel_id===n.value){const xe=n.value,Ce=l;G.get(`/api/sessions/${encodeURIComponent(xe)}`).then(Re=>{Ce!==l||n.value!==xe||(a.value=Re)}).catch(()=>{})}},2e3))}let Be=!1;function qe(){Be||(Be=!0,X(),Ke.subscribe("events",De))}We(()=>{H(),qe()}),Ds(()=>{qe()});function ct(){Be&&(Be=!1,Ke.unsubscribe("events",De),clearTimeout(Le))}return Ms(ct),xt(ct),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:f,sortBy:p,sortAsc:b,filterPresets:y,sortOptions:E,filteredSessions:j,hasActiveFilters:R,customPresets:I,showSavePreset:x,newPresetName:m,threadView:_,threads:Q,collapsedThreads:S,ftsQuery:g,ftsChannelId:w,ftsUserId:T,ftsResults:C,ftsSearching:M,formatAge:F,formatTimestamp:se,formatFullTimestamp:Se,messageClass:V,threadMsgClass:de,roleBadge:ce,roleDotClass:ye,roleLabelClass:ge,truncateContent:He,threadSummary:O,fetchSessions:X,retry:ue,toggleSession:oe,toggleSelect:le,toggleSelectAll:te,confirmClear:ne,clearSession:fe,confirmBulkClear:ve,doBulkClear:Te,exportSession:Oe,applyPreset:Y,applyCustomPreset:we,saveCustomPreset:ke,removeCustomPreset:ie,resetFilters:he,toggleThread:N,runFtsSearch:k,clearFtsSearch:L,highlightSnippet:$,ftsResultClass:ee,ftsTypeBadge:Z}}},mk={props:["trace"],template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(w){if(!w)return"—";try{const T=new Date(w);return isNaN(T.getTime())?w:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function f(w){return!w&&w!==0?"—":w<1e3?w+"ms":(w/1e3).toFixed(1)+"s"}function p(w){return!w&&w!==0?"—":w>=1e3?(w/1e3).toFixed(1)+"k":String(w)}function b(w){if(!w)return"";if(typeof w=="string")return w;try{return JSON.stringify(w,null,2)}catch{return String(w)}}function y(w){a.value===w?a.value=null:(a.value=w,c.value={})}function E(w,T){const C=w+"-"+T;c.value={...c.value,[C]:!c.value[C]}}function I(w,T){return!!c.value[w+"-"+T]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function m(){try{const w=await G.get("/api/trajectories");e.value=w.files||[],o.value=w.count||0}catch{}}let _=0;async function S(){const w=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await G.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(w!==_)return;let C=T.entries||[];d.value.tool_name&&(C=C.filter(M=>(M.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(M=>M.is_error)),d.value.channel_id&&(C=C.filter(M=>M.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(M=>M.user_id===d.value.user_id)),t.value=C}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const C=T.toString(),M=await G.get(`/api/trajectories/search/query?${C}`);if(w!==_)return;t.value=M.results||[]}}catch(T){if(w!==_)return;n.value=T.message}w===_&&(s.value=!1)}async function g(){if(!l.value.trim())return;const w=++_;s.value=!0,n.value=null,c.value={};try{const T=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(w!==_)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(w!==_)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}w===_&&(s.value=!1)}return We(async()=>{await m(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:f,formatTokens:p,formatJSON:b,truncateBlock:gm,toggleExpand:y,toggleIteration:E,isIterationExpanded:I,clearFilters:x,fetchFiles:m,fetchTraces:S,lookupMessage:g}}},vk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=J(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const b=await G.get("/api/usage");n.value=b,a.value=b.totals||a.value,t.value=null,s.value=!0}catch(b){t.value=b.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function f(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function p(){u&&(u=!1,l&&(clearInterval(l),l=null))}return We(f),Ds(f),Ms(p),xt(p),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:vm,formatTime:hm,retry:d}}},km=[{id:"audit",label:"Audit",component:fk},{id:"sessions",label:"Sessions",component:hk},{id:"traces",label:"Traces",component:gk},{id:"usage",label:"Usage",component:vk}],bk={components:{TabbedPage:Mr},setup(){return{tabs:km}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},no=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],yk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=J(()=>e.value.filter(x=>x.is_core).length),c=J(()=>e.value.filter(x=>!x.is_core).length),d=J(()=>Object.values(a.value).reduce((x,m)=>x+m,0));function u(x){for(const m of no)if(m.id!=="other"&&m.match(x))return m.id;return"other"}const f=J(()=>{let x=e.value;if(n.value){const m=n.value.toLowerCase();x=x.filter(_=>_.name.toLowerCase().includes(m)||(_.description||"").toLowerCase().includes(m))}return r.value&&(x=x.filter(m=>u(m.name)===r.value)),x}),p=J(()=>{const x=new Set;for(const m of e.value)x.add(u(m.name));return no.filter(m=>x.has(m.id))}),b=J(()=>{const x=f.value,m={};for(const S of x){const g=u(S.name);m[g]||(m[g]=[]),m[g].push(S)}const _=[];for(const S of no)m[S.id]&&m[S.id].length>0&&_.push({label:S.label,icon:S.icon,tools:m[S.id].sort((g,w)=>g.name.localeCompare(w.name))});return _});function y(x){i.value={...i.value,[x]:!i.value[x]}}async function E(){t.value=!0,s.value=null;try{const[x,m]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({}))]);e.value=x,a.value=m||{};const _=Object.values(m||{}).filter(S=>S>0).sort((S,g)=>S-g)}catch(x){s.value=x.message}t.value=!1}function I(){E()}return We(()=>{E()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:f,groupedTools:b,usedCategories:p,truncate:Zc,toggleExpand:y,refresh:I}}};function xk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function _k(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),f=h(null),p=h(null),b=h(!1),y=h(null),E=h(null),I=h(!1),x=J(()=>e.value.length),m=J(()=>e.value.reduce((F,se)=>F+(se.execution_count||0),0)),_=J(()=>e.value.reduce((F,se)=>F+M(se.code),0)),S=J(()=>{if(!l.value)return e.value;const F=l.value.toLowerCase();return e.value.filter(se=>se.name.toLowerCase().includes(F)||(se.description||"").toLowerCase().includes(F))}),g=J(()=>u.value?u.value.split(`
`).length:0),w=J(()=>{const F=Math.max(g.value,1);return Array.from({length:F},(se,Se)=>Se+1).join(`
`)}),T=J(()=>{const F=u.value.trim();return F?F.includes("SKILL_DEFINITION")?F.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(F){return xk(F)}function M(F){return F?F.split(`
`).length:0}function H(F){return _k(F)}function P(F){n.value={...n.value,[F]:!n.value[F]}}async function R(F){try{await navigator.clipboard.writeText(F);const se=e.value.find(Se=>Se.code===F);se&&(r.value=se.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function j(F){if(F.key==="Tab"){F.preventDefault();const se=F.target,Se=se.selectionStart,V=se.selectionEnd;u.value=u.value.substring(0,Se)+"    "+u.value.substring(V),Rt(()=>{se.selectionStart=se.selectionEnd=Se+4})}}function Q(F){const se=F.target.previousElementSibling;se&&(se.scrollTop=F.target.scrollTop)}async function U(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(F){s.value=F.message}t.value=!1}async function O(F){i.value=F,delete a.value[F],a.value={...a.value};try{const se=await G.post(`/api/skills/${encodeURIComponent(F)}/test`);a.value={...a.value,[F]:se}}catch(se){a.value={...a.value,[F]:{result:se.message,is_error:!0}}}i.value=null}function N(){o.value=!0,c.value="create",d.value="",u.value="",f.value=null,p.value=null}function Y(F){o.value=!0,c.value="edit",d.value=F.name,u.value=F.code||"",f.value=null,p.value=null}function we(){o.value=!1,f.value=null,p.value=null}async function ke(){f.value=null,p.value=null;const F=d.value.trim(),se=u.value.trim();if(!F){f.value="Name is required";return}if(!se){f.value="Code is required";return}b.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:F,code:se}),p.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(F)}`,{code:se}),p.value="Skill updated successfully"),await U(),setTimeout(()=>{o.value=!1},800)}catch(Se){f.value=Se.message}b.value=!1}function ie(F){E.value=F}async function he(){if(E.value){I.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(E.value)}`),await U()}catch(F){Ae.error(`Failed to delete skill: ${F.message||"unknown error"}`)}I.value=!1,E.value=null}}return We(()=>{U()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:f,editSuccess:p,saving:b,editorRef:y,deleteTarget:E,deleting:I,enabledCount:x,totalExecutions:m,totalLines:_,displayedSkills:S,editLineCount:g,editorLineNums:w,editValidation:T,highlight:C,truncate:Zc,formatTs:pa,countLines:M,getLineNumbers:H,toggleCode:P,copyCode:R,handleEditorKey:j,syncScroll:Q,fetchSkills:U,testSkill:O,showCreate:N,editSkill:Y,cancelEdit:we,saveSkill:ke,confirmDelete:ie,doDelete:he}}};function wk(e,t){if(!e||!t)return Nu(e);const s=Nu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Sk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),f=h(null),p=h(!1),b=h(null),y=h(null);let E=null;const I=h(null),x=h(!1),m=h({}),_=h({}),S=h(null),g=h(null),w=J(()=>e.value.reduce((N,Y)=>N+(Y.chunks||0),0)),T=J(()=>new Set(e.value.map(Y=>Y.uploader).filter(Boolean)).size);function C(N,Y){const we=_.value[Y];if(!we||we.length===0)return 0;const ke=Math.max(...we.map(ie=>ie.char_count||0));return ke===0?0:Math.round(N.char_count/ke*100)}async function M(){t.value=!0,s.value=null;try{const N=await G.get("/api/knowledge");e.value=Array.isArray(N)?N:[]}catch(N){s.value=N.message}t.value=!1}async function H(N){if(m.value[N]){m.value[N]=!1,g.value=null;return}if(m.value[N]=!0,!(_.value[N]||S.value===N)){S.value=N;try{const Y=await G.get(`/api/knowledge/${encodeURIComponent(N)}/chunks`);_.value[N]=Array.isArray(Y)?Y:[]}catch(Y){_.value[N]=[],Ae.error(`Failed to load chunks: ${Y.message}`)}S.value=null}}async function P(){const N=n.value.trim();if(N){i.value=!0,r.value=null,l.value=N;try{const Y=await G.get(`/api/knowledge/search?q=${encodeURIComponent(N)}`);a.value=Array.isArray(Y)?Y:[]}catch(Y){a.value=[],r.value=Y.message||"Search failed"}i.value=!1}}function R(){a.value=null,n.value="",r.value=null}async function j(){u.value=null,f.value=null;const N=c.value.trim(),Y=d.value.trim();if(!N){u.value="Source name is required";return}if(!Y){u.value="Content is required";return}p.value=!0;try{const we=await G.post("/api/knowledge",{source:N,content:Y});f.value=`Ingested ${we.chunks||0} chunks from "${N}"`,c.value="",d.value="",_.value={},await M(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(we){u.value=we.message}p.value=!1}async function Q(N){b.value=N,y.value=null,E&&(clearTimeout(E),E=null);try{const Y=await G.post(`/api/knowledge/${encodeURIComponent(N)}/reingest`);y.value={source:N,error:!1,message:`Re-ingested ${Y.chunks||0} chunks`},delete _.value[N],await M(),E=setTimeout(()=>{y.value=null,E=null},3e3)}catch(Y){y.value={source:N,error:!0,message:Y.message}}b.value=null}function U(N){I.value=N}async function O(){if(I.value){x.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete _.value[I.value],await M()}catch(N){Ae.error(`Failed to delete source: ${N.message||"unknown error"}`)}x.value=!1,I.value=null}}return We(()=>{M()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:f,ingesting:p,reingesting:b,reingestResult:y,deleteTarget:I,deleting:x,expanded:m,sourceChunks:_,loadingChunks:S,selectedChunk:g,totalChunks:w,uploaderCount:T,truncate:Zc,formatTs:pa,highlightTerms:wk,chunkBarWidth:C,fetchSources:M,toggleSource:H,doSearch:P,clearSearch:R,doIngest:j,doReingest:Q,confirmDelete:U,doDelete:O}}},Tk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),f=h(null),p=h(""),b=h(!1),y=h(null),E=h(null),I=h(new Set),x=h(null),m=h(!1),_=h(!1),S=J(()=>e.value.reduce((ie,he)=>ie+he.count,0)),g=J(()=>I.value.size);function w(ie){const he=t.value[ie];if(!he)return[];if(!l.value.trim())return he;const F=l.value.trim().toLowerCase();return he.filter(se=>se.key.toLowerCase().includes(F)||se.value&&se.value.toLowerCase().includes(F))}function T(ie,he){return I.value.has(ie+"/"+he)}function C(ie,he){const F=ie+"/"+he,se=new Set(I.value);se.has(F)?se.delete(F):se.add(F),I.value=se}function M(ie){const he=t.value[ie];return!he||he.length===0?!1:he.every(F=>I.value.has(ie+"/"+F.key))}function H(ie,he){const F=t.value[ie];if(!F)return;const se=new Set(I.value);for(const Se of F){const V=ie+"/"+Se.key;he?se.add(V):se.delete(V)}I.value=se}async function P(){s.value=!0,n.value=null;try{const ie=await G.get("/api/memory");e.value=Object.entries(ie).map(([he,F])=>({name:he,keys:F.keys||[],count:F.count||0}))}catch(ie){n.value=ie.message}s.value=!1}async function R(ie){if(a.value[ie]){a.value[ie]=!1;return}a.value[ie]=!0;const he=e.value.find(se=>se.name===ie);if(!he||t.value[ie]||i.value===ie)return;i.value=ie;let F;try{const Se=(await G.get(`/api/memory/${encodeURIComponent(ie)}`)).entries||{};F=he.keys.map(V=>Object.prototype.hasOwnProperty.call(Se,V)?{key:V,value:Se[V]||"",failed:!1}:{key:V,value:"",failed:!0,error:"Not found in scope"})}catch(se){F=he.keys.map(Se=>({key:Se,value:"",failed:!0,error:se.message||"Failed to load"}))}t.value[ie]=F,i.value=null}function j(ie,he,F){f.value=ie+"/"+he,p.value=F}async function Q(ie,he){b.value=!0,y.value=null;try{await G.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(he)}`,{value:p.value});const F=t.value[ie];if(F){const se=F.find(Se=>Se.key===he);se&&(se.value=p.value)}f.value=null}catch(F){y.value=`Failed to save: ${F.message||"unknown error"}`}b.value=!1}async function U(ie,he){try{await navigator.clipboard.writeText(he.value),E.value=ie+"/"+he.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const ie=o.value.scope.trim(),he=o.value.key.trim(),F=o.value.value.trim();if(!ie){d.value="Scope is required";return}if(!he){d.value="Key is required";return}if(!F){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(he)}`,{value:F}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(se){d.value=se.message}c.value=!1}function N(ie,he){x.value={scope:ie,key:he}}async function Y(){if(!x.value)return;m.value=!0,y.value=null;const{scope:ie,key:he}=x.value;try{await G.del(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(he)}`);const F=t.value[ie];F&&(t.value[ie]=F.filter(V=>V.key!==he));const se=e.value.find(V=>V.name===ie);se&&(se.count--,se.keys=se.keys.filter(V=>V!==he));const Se=new Set(I.value);Se.delete(ie+"/"+he),I.value=Se}catch(F){y.value=`Failed to delete: ${F.message||"unknown error"}`}m.value=!1,x.value=null}function we(){_.value=!0}async function ke(){m.value=!0,y.value=null;const ie=[];for(const he of I.value){const F=he.indexOf("/");ie.push({scope:he.slice(0,F),key:he.slice(F+1)})}try{await G.post("/api/memory/bulk-delete",{entries:ie}),I.value=new Set,t.value={},await P()}catch(he){y.value=`Bulk delete failed: ${he.message||"unknown error"}`}m.value=!1,_.value=!1}return We(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:f,editValue:p,saving:b,actionError:y,copied:E,selected:I,selectedCount:g,totalEntries:S,deleteTarget:x,deleting:m,showBulkDelete:_,fetchMemory:P,toggleScope:R,startEdit:j,doEdit:Q,copyValue:U,doAdd:O,confirmDelete:N,doDelete:Y,confirmBulkDelete:we,doBulkDelete:ke,isSelected:T,toggleSelect:C,isScopeAllSelected:M,toggleSelectAll:H,filteredEntries:w}}},Ck={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=J(()=>[...new Set(e.value.map(E=>E.category))].sort()),o=J(()=>{const y={};return e.value.forEach(E=>{y[E.category]=(y[E.category]||0)+1}),y}),c=J(()=>a.value?e.value.filter(y=>y.category===a.value):e.value);function d(y){return y==="correction"?"badge-warning":y==="operational"?"badge-info":y==="preference"?"badge-success":"badge-info"}function u(y){i.value=y.key,l.value=y.content}async function f(y){try{await G.put("/api/learned/"+encodeURIComponent(y),{content:l.value}),i.value=null,Ae.success("Entry updated"),await b()}catch(E){Ae.error(E.message||"Failed to save entry")}}async function p(y){if(await _s({title:"Delete learned entry",message:`Delete "${y}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(y)),Ae.success("Entry deleted"),await b()}catch(I){Ae.error(I.message||"Failed to delete entry")}}async function b(){s.value=!0,n.value=null;try{const y=await G.get("/api/learned");e.value=y.entries||[],t.value={last_reflection:y.last_reflection,count:y.count}}catch(y){n.value=y.message}s.value=!1}return We(b),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:pa,startEdit:u,saveEdit:f,deleteEntry:p,fetchEntries:b}}},wm=[{id:"tools",label:"Tools",component:yk},{id:"skills",label:"Skills",component:kk},{id:"knowledge",label:"Knowledge",component:Sk},{id:"memory",label:"Memory",component:Tk},{id:"learned",label:"Learned",component:Ck}],Ek={components:{TabbedPage:Mr},setup(){return{tabs:wm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Ak={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Rk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Ik={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ok={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=J(()=>e.value.components||[]),l=J(()=>Ik[e.value.overall]||"text-gray-400"),r=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=J(()=>{const g=e.value.overall;return g==="healthy"?"All Systems Healthy":g==="degraded"?"Some Systems Degraded":g==="unhealthy"?"System Issues Detected":"Unknown"});function c(g){return Ak[g]||"text-gray-400"}function d(g){return Rk[g]||"info"}function u(g){return g==="ok"?"badge-success":g==="degraded"?"badge-warning":g==="down"?"badge-danger":"badge-info"}function f(g){return g==="closed"?"text-green-400":g==="half_open"?"text-yellow-400":g==="open"?"text-red-400":"text-gray-400"}function p(g){return g.replace(/_/g," ").replace(/\b\w/g,w=>w.toUpperCase())}function b(g){if(!g)return"—";try{return new Date(g).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return g}}function y(g){return g>=1e6?(g/1e6).toFixed(1)+"M":g>=1e3?(g/1e3).toFixed(1)+"K":String(g)}async function E(){a.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null,n.value=!0}catch(g){s.value=g.message}finally{t.value=!1,a.value=!1}}function I(){t.value=!0,s.value=null,E()}let x=null,m=!1;function _(){m||(m=!0,E(),x||(x=setInterval(E,3e4)))}function S(){m&&(m=!1,x&&(clearInterval(x),x=null))}return We(_),Ds(_),Ms(S),xt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:f,formatName:p,formatTime:b,formatNumber:y,fetchHealth:E,retry:I}}},Nk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=J(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=J(()=>{if(!i.value)return[];const E=i.value,I=E.storage_total_bytes||1;return[{label:"Session Persistence",mb:E.sessions.persist_dir.total_mb,bytes:E.sessions.persist_dir.total_bytes,files:E.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(E.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:E.knowledge.db_file.total_mb,bytes:E.knowledge.db_file.total_bytes,files:E.knowledge.db_file.file_count,pct:Math.min(100,Math.round(E.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:E.trajectories.message_dir.total_mb,bytes:E.trajectories.message_dir.total_bytes,files:E.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:E.trajectories.agent_dir.total_mb,bytes:E.trajectories.agent_dir.total_bytes,files:E.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const E=await G.get("/api/resource-usage");i.value=E,t.value=null,s.value=!0}catch(E){t.value=E.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function f(){e.value=!0,t.value=null,d()}let p=!1;function b(){p||(p=!0,d(),l||(l=setInterval(d,3e4)))}function y(){p&&(p=!1,l&&(clearInterval(l),l=null))}return We(b),Ds(b),Ms(y),xt(y),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:vm,refresh:u,retry:f}}},Lk=["INFO","WARNING","ERROR"],Dk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],ao=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Mk=[50,100,200,500],Pk={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ke.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),f=h(null),p=2e3,b=Lk,y=Dk,E=ao,I=h("all"),x=h(""),m=h([]),_=h(!1),S=h(""),g=h([]);function w(){try{const q=localStorage.getItem("odin-log-presets");q&&(m.value=JSON.parse(q))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const C=J(()=>a.value!==""||i.value.trim()!==""||x.value!==""),M=J(()=>{const q=ao.find(re=>re.value===x.value);return q?q.label:""}),H=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(q){return q.message}}),P=24,R=J(()=>{if(we.value.length===0)return[];const q=[],re=new Date,Ee=3600*1e3;for(let Ze=P-1;Ze>=0;Ze--){const lt=new Date(re.getTime()-(Ze+1)*Ee),Ot=new Date(re.getTime()-Ze*Ee);q.push({start:lt,end:Ot,label:O(lt,Ot),shortLabel:Ot.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ze of we.value){if(!Ze._time)continue;const lt=Ze._time.getTime();for(const Ot of q)if(lt>=Ot.start.getTime()&&lt<Ot.end.getTime()){Ot.total++,Ze.level==="ERROR"?Ot.errors++:Ze.level==="WARNING"?Ot.warnings++:Ot.info++;break}}return q}),j=J(()=>{let q=1;for(const re of R.value)re.total>q&&(q=re.total);return q}),Q=J(()=>{if(R.value.length===0)return"";const q=we.value.map(Ze=>Ze._time&&Ze._time.getTime()).filter(Boolean);if(q.length===0)return"";const re=new Date(Math.min(...q));return`${we.value.length} shown, oldest ${re.toLocaleTimeString()}`}),U=J(()=>Math.ceil(P/8));function O(q,re){const Ee={hour:"2-digit",minute:"2-digit"};return q.toLocaleTimeString([],Ee)+" - "+re.toLocaleTimeString([],Ee)}function N(q,re){return!re||!q?"0px":Math.max(2,q/re*100)+"%"}function Y(q){const re=we.value.findIndex(Ee=>Ee._time&&Ee._time.getTime()>=q.start.getTime()&&Ee._time.getTime()<q.end.getTime());if(re>=0&&d.value){const Ee=d.value.querySelectorAll(".log-line");Ee[re]&&(Ee[re].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const we=J(()=>{let q=t.value;if(a.value&&(q=q.filter(re=>(re.level||"INFO")===a.value)),x.value){const re=ao.find(Ee=>Ee.value===x.value);if(re&&re.seconds){const Ee=new Date(Date.now()-re.seconds*1e3);q=q.filter(Ze=>Ze._time&&Ze._time>=Ee)}}if(i.value&&!H.value)if(l.value)try{const re=new RegExp(i.value,"i");q=q.filter(Ee=>{const Ze=Ee.text||Ee.raw||"",lt=Ee.tool||"";return re.test(Ze)||re.test(lt)})}catch{}else{const re=i.value.toLowerCase();q=q.filter(Ee=>{const Ze=(Ee.text||Ee.raw||"").toLowerCase(),lt=(Ee.tool||"").toLowerCase();return Ze.includes(re)||lt.includes(re)})}return q});function ke(q){if(q.type==="log"&&q.line)try{const re=typeof q.line=="string"?JSON.parse(q.line):q.line,Ee=re.timestamp?new Date(re.timestamp):new Date;return{ts:Ee.toLocaleTimeString(),_time:Ee,level:re.error?"ERROR":"INFO",text:re.tool_name?`[${re.tool_name}] ${re.result_summary||""}`.trim():re.message||JSON.stringify(re),tool:re.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(q.line),tool:"",raw:String(q.line)}}if(q.payload){const re=q.payload,Ee=re.timestamp?new Date(re.timestamp):new Date;return{ts:Ee.toLocaleTimeString(),_time:Ee,level:re.error?"ERROR":"INFO",text:re.tool_name?`[${re.tool_name}] ${re.result_summary||""}`.trim():re.message||JSON.stringify(re),tool:re.tool_name||"",raw:null}}return typeof q=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:q,tool:"",raw:q}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(q),tool:"",raw:null}}function ie(q){const re=ke(q);if(s.value){g.value.push(re);return}he(re)}function he(q){t.value.push(q),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Rt(()=>F())}function F(q=!1){const re=d.value;re&&re.scrollTo({top:re.scrollHeight,behavior:q?"smooth":"instant"})}function se(){n.value=!0,u.value=!1,Rt(()=>F(!0))}const Se=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function V(){const q=d.value;if(!q)return;const re=q.scrollHeight-q.scrollTop-q.clientHeight<40;u.value=!n.value&&!re&&t.value.length>0,ge.value&&de()}function de(){const q=d.value;!q||!n.value||q.scrollHeight-q.scrollTop-q.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function ce(){n.value&&requestAnimationFrame(de)}function ye(q){Se.has(q.key)&&ce()}const ge=h(!1);function He(){n.value&&(ge.value=!0,requestAnimationFrame(de))}function k(){ge.value&&(ge.value=!1,de())}function L(){n.value&&(u.value=!1,Rt(()=>F()))}function $(){if(s.value=!s.value,!s.value&&g.value.length>0){for(const q of g.value)he(q);g.value=[]}}function ee(){t.value=[],g.value=[],u.value=!1}function Z(){let q;e.value==="search"?q=Pe.value.map(lt=>{const Ot=lt.error?"ERROR":"INFO",Pt=lt.tool_name?`[${lt.tool_name}] `:"";return`${lt.timestamp||""} ${Ot} ${Pt}${lt.result_summary||lt.message||""}`}).join(`
`):q=we.value.map(lt=>`${lt.ts} ${lt.level} ${lt.text}`).join(`
`);const re=new Blob([q],{type:"text/plain"}),Ee=URL.createObjectURL(re),Ze=document.createElement("a");Ze.href=Ee,Ze.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ze.click(),URL.revokeObjectURL(Ee)}function X(q,re){const Ee=`${q.ts} ${q.level} ${q.text||q.raw||""}`;navigator.clipboard.writeText(Ee).then(()=>{f.value=re,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function ue(q){a.value=a.value===q?"":q,I.value="all"}function oe(q){return q.level==="ERROR"?"log-line-error":q.level==="WARNING"?"log-line-warning":"text-gray-300"}function le(q){return q==="ERROR"?"text-red-500 font-semibold":q==="WARNING"?"text-yellow-500":"text-blue-500"}function te(q){return q==="ERROR"?"log-chip-error":q==="WARNING"?"log-chip-warning":"log-chip-info"}function ne(q){I.value=q.id;const re=q.filters;a.value=re.level||"",x.value=re.timeRange||"",i.value=re.text||"",re.levels&&(a.value=re.levels[0]||""),re.hasToolName&&(i.value="")}function fe(q){I.value=q.id,a.value=q.filters.level||"",x.value=q.filters.timeRange||"",i.value=q.filters.text||""}function ve(){if(!S.value.trim())return;const q={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:x.value,text:i.value}};m.value=[...m.value,q],T(),_.value=!1,S.value=""}function Te(q){m.value=m.value.filter(re=>re.id!==q),T(),I.value===q&&(I.value="all")}const Oe=h("all"),Le=h(""),De=h(""),Be=h(""),qe=h(""),ct=h(""),K=h(100),xe=Mk,Ce=h(!1),Re=h(!1),Ve=h(""),Pe=h([]),pt=h(null),ls=h(null);function Ps(){e.value="search",pt.value||nn()}async function nn(){try{pt.value=await G.get("/api/logs/stats")}catch{}}function Ss(){const q=ct.value;if(!q){Be.value="",qe.value="";return}const Ee={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[q];if(Ee){const Ze=new Date(Date.now()-Ee*1e3);Be.value=Fs(Ze),qe.value=""}}function Fs(q){const re=Ee=>String(Ee).padStart(2,"0");return`${q.getFullYear()}-${re(q.getMonth()+1)}-${re(q.getDate())}T${re(q.getHours())}:${re(q.getMinutes())}`}function Mt(q){if(!q)return"";const re=new Date(q);return isNaN(re.getTime())?"":re.toISOString()}async function Yt(){Ce.value=!0,Ve.value="",Re.value=!0,ls.value=null;try{const q=new URLSearchParams;Oe.value&&Oe.value!=="all"&&q.set("level",Oe.value),Le.value&&q.set("tool",Le.value),De.value&&q.set("q",De.value);const re=Mt(Be.value),Ee=Mt(qe.value);re&&q.set("start",re),Ee&&q.set("end",Ee),q.set("limit",String(K.value));const Ze=await G.get(`/api/logs/search?${q.toString()}`);Pe.value=Ze.entries||[]}catch(q){Ve.value=q.message||"Search failed",Pe.value=[]}finally{Ce.value=!1}}function $s(){Oe.value="all",Le.value="",De.value="",Be.value="",qe.value="",ct.value="",K.value=100,Pe.value=[],Re.value=!1,Ve.value="",ls.value=null}function Bs(q){ls.value=ls.value===q?null:q}function An(q){if(!q.timestamp)return"";try{return new Date(q.timestamp).toLocaleString()}catch{return q.timestamp}}function Us(q){return q.type==="web_action"?`${q.status||""} (${q.execution_time_ms||0}ms)`:(q.result_summary||"").slice(0,200)}function zt(q){return q.error?"log-line-error":"text-gray-300"}function Vn(q){try{return JSON.stringify(q,null,2)}catch{return String(q)}}let Ct=null,rs=null,os=!1;function Ye(){os||(os=!0,Ke.subscribe("logs",ie),r.value=Ke.connected,o.value=Ke.state||"disconnected",Ct=Ke.onStateChange,rs=(q,re)=>{o.value=q,r.value=q==="connected",Ct&&Ct(q,re)},Ke.onStateChange=rs)}function gs(){os&&(os=!1,Ke.unsubscribe("logs",ie),Ke.onStateChange===rs&&(Ke.onStateChange=Ct),rs=null,Ct=null)}return We(()=>{w(),window.addEventListener("pointerup",k),window.addEventListener("pointercancel",k)}),Ds(Ye),Ms(gs),xt(()=>{gs(),window.removeEventListener("pointerup",k),window.removeEventListener("pointercancel",k)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:we,pauseBuffer:g,showJumpBottom:u,copiedIndex:f,regexError:H,levels:b,logPresets:y,timeRanges:E,timeRange:x,activeLogPreset:I,customLogPresets:m,showSaveLogPreset:_,newLogPresetName:S,hasActiveLogFilters:C,timeRangeLabel:M,timelineBuckets:R,timelineMax:j,timelineSpanLabel:Q,timelineLabelSkip:U,togglePause:$,clearLogs:ee,exportLogs:Z,logLineClass:oe,levelClass:le,levelChipClass:te,toggleLevel:ue,copyLine:X,jumpToBottom:se,onScroll:V,onUserScrollIntent:ce,onUserScrollKey:ye,onAutoScrollToggle:L,onPointerDown:He,applyLogPreset:ne,applyCustomLogPreset:fe,saveLogCustomPreset:ve,removeLogCustomPreset:Te,segmentHeight:N,jumpToTimelineBucket:Y,searchLevel:Oe,searchTool:Le,searchKeyword:De,searchStart:Be,searchEnd:qe,searchTimePreset:ct,searchLimit:K,searchLimits:xe,searching:Ce,searchRan:Re,searchError:Ve,searchResults:Pe,searchStats:pt,expandedSearch:ls,switchToSearch:Ps,runSearch:Yt,clearSearchFilters:$s,toggleSearchExpand:Bs,formatSearchTs:An,searchEntryText:Us,searchLogLineClass:zt,formatJson:Vn,applySearchTimePreset:Ss}}};function _l(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Fk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function $k(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Ha=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Bk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},io=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),Uk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Mu(e){return Uk.some(t=>e===t||e.startsWith(`${t}.`))}const Sm="odin_config_center_expanded_v1",Tm="odin_config_center_category_v1",Hk=50,zk=650,lo=()=>G.get("/api/config/meta");function Zn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ri(e,t){return JSON.stringify(e)===JSON.stringify(t)}function wa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Vk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function jk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Cm(e,t){if(Ri(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Zn(t);const n={};for(const[a,i]of Object.entries(t)){const l=Cm(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function qk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Cm(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Em(e,t,s,n){if(Ri(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Em(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Gk(){try{const e=JSON.parse(localStorage.getItem(Sm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function Kk(){try{const e=localStorage.getItem(Tm);return Ha.some(t=>t.key===e)?e:Ha[0].key}catch{return Ha[0].key}}const Wk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),r=h(null),o=h(!1),c=h(!1),d=h(null),u=h(""),f=h("all"),p=h(Kk()),b=h(Gk()),y=h({}),E=h({}),I=h(""),x=h({}),m=h({}),_=h([]),S=h([]),g=h(!1),w=h(!1),T=h(!1);let C=null,M=null,H={path:null,at:0},P=0;const R=J(()=>{var v;return(((v=t.value)==null?void 0:v.fields)||[]).filter(D=>!io.has(D.path.split(".")[0])&&!Mu(D.path))}),j=J(()=>new Map(R.value.map(v=>[v.path,v]))),Q=J(()=>we.value.reduce((v,D)=>v+D.sections.length,0)),U=J(()=>R.value.length),O=J(()=>Fk),N=J(()=>_.value.length>0),Y=J(()=>S.value.length>0),we=J(()=>{if(!e.value)return[];const v=new Set(Ha.flatMap(ae=>ae.sections)),D=Ha.map(ae=>({...ae,sections:ae.sections.filter(Ne=>Object.hasOwn(e.value,Ne)&&!io.has(Ne))})).filter(ae=>ae.sections.length),B=Object.keys(e.value).filter(ae=>!v.has(ae)&&!io.has(ae));return B.length&&D.push({key:"other",label:"Other",icon:"folder",sections:B}),D}),ke=J(()=>e.value?{...e.value,...y.value}:null),ie=J(()=>{if(!e.value)return[];const v=[];for(const[D,B]of Object.entries(y.value))Em(e.value[D],B,D,v);return v.filter(D=>!Ri(D.oldVal,D.newVal)).map(D=>{const B=L(D.path);return{...D,label:(B==null?void 0:B.label)||wa(D.path.split(".").at(-1)),apply_mode:(B==null?void 0:B.apply_mode)||ue(D.path.split(".")[0])}})}),he=J(()=>ie.value.length>0),F=J(()=>ie.value.length),se=J(()=>new Set(ie.value.map(v=>v.path.split(".")[0])).size),Se=J(()=>!!u.value||f.value!=="all"),V=J(()=>{const v={...m.value};for(const D of ie.value){const B=L(D.path),ae=Ot(B,D.newVal);ae&&(v[D.path]=ae)}return v}),de=J(()=>Object.keys(V.value).length>0),ce=J(()=>e.value?(Se.value?we.value:we.value.filter(D=>D.key===p.value)).map(D=>({...D,sections:D.sections.filter(B=>K(B))})).filter(D=>D.sections.length):[]),ye=J(()=>{const v=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],D=new Map(v.map(B=>[B,[]]));for(const B of ie.value){const ae=D.has(B.apply_mode)?B.apply_mode:"restart";D.get(ae).push(B)}return v.filter(B=>D.get(B).length).map(B=>({key:B,label:Gs(B),entries:D.get(B)}))}),ge=J(()=>ie.value.filter(v=>v.apply_mode==="restart").length),He=J(()=>R.value.filter(v=>v.pending_restart)),k=J(()=>He.value.length);function L(v){const D=j.value.get(v);return D?{...D,apply_details:_l([D])}:null}function $(v){const D=`${v}.`;return R.value.filter(B=>B.path===v||B.path.startsWith(D))}function ee(v){return $(v).length}function Z(v){return wa(v)}function X(v){const D=$(v);if(!D.length)return`${wa(v)} configuration.`;const B=D.find(Ue=>Ue.sensitivity==="public"&&Ue.description)||D.find(Ue=>Ue.description),ae=(B==null?void 0:B.description)||"";return ae.match(/setting for (.+)\.$/i)?`${wa(v)} settings and runtime behaviour.`:ae}function ue(v){const D=[...new Set($(v).map(B=>B.apply_mode))];return D.length===1?D[0]:D.includes("restart")?"restart":D.includes("activation_required")?"activation_required":D[0]||"restart"}function oe(v){const D=[...new Set($(v).map(B=>Gs(B.apply_mode)))];return D.length?D.length===1?D[0]:`Mixed apply behaviour: ${D.join(" · ")}`:""}function le(v){return _l($(v))}function te(v,D){return D.split(".").reduce((B,ae)=>B==null?void 0:B[ae],v)}function ne(v){const D=ke.value;return $(v).filter(B=>Mu(B.path)?!1:B.path.split(".").length<=2?!0:!B.path.includes(".*")).map(B=>({...B,key:B.path.split(".").at(-1),value:te(D,B.path),apply_details:_l([B]),editor:B.path==="agents.final_warning_iterations"?"warning-chips":null}))}function fe(v){const D=v.path.split(".");return D.length>2?D.slice(0,2).join("."):null}function ve(v){const D=new Map;for(const B of ne(v)){const ae=fe(B),Ne=ae||`${v}.__root`;D.has(Ne)||D.set(Ne,{key:Ne,path:ae,entries:[]}),D.get(Ne).entries.push(B)}return[...D.values()].map(B=>{const ae=B.entries.find(Ne=>Ne.group_description);return{...B,label:B.path?wa(B.path.split(".").at(-1)):null,description:(ae==null?void 0:ae.group_description)||null,apply_details:_l(B.entries),runtime_summaries:Oe(B.entries)}})}function Te(v){return{save:v.save_effect||(v.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:v.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[v.apply_mode]||"Effective runtime state is not currently observable."}}function Oe(v){const D=new Map;for(const B of v){const ae=Te(B),Ne=`${B.apply_mode}|${ae.save}|${ae.runtime}`;D.has(Ne)||D.set(Ne,{key:Ne,label:Gs(B.apply_mode),save:ae.save,runtime:ae.runtime})}return[...D.values()]}function Le(v){if(De(v))return v.runtime_effect||v.activation_policy||"";if(v.apply_mode==="activation_required"){const D=v.activation_policy||v.runtime_effect;return D?`Not active after saving. No activation control exists in this release. ${D}`:"Not active after saving; no activation control exists in this release."}return""}function De(v){return v.action_available===!0&&!!(v.action_label&&v.action_endpoint)}async function Be(v){if(De(v))try{if(Pe(v.path))throw new Error("Save this setting before applying its action.");const D=String(v.action_method||"POST").toLowerCase(),B={post:G.post.bind(G),put:G.put.bind(G),delete:G.del.bind(G)}[D];if(!B)throw new Error("Unsupported configuration action");await B(v.action_endpoint,v.action_body||void 0),await me(),Cs("success",`${v.action_label} completed.`)}catch(D){Cs("error",D.message||`${v.action_label} failed`)}}function qe(v,D){return[v.label,v.path,v.description,...v.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(D)}function ct(v){const D=u.value.trim().toLowerCase();return D?$(v).filter(B=>qe(B,D)):[]}function K(v){const D=$(v);if(f.value!=="all"&&!D.some(ae=>ae.apply_state===f.value))return!1;const B=u.value.trim().toLowerCase();return!B||`${Z(v)} ${v}`.toLowerCase().includes(B)?!0:D.some(ae=>qe(ae,B))}function xe(v,D){return $(v).filter(B=>B.apply_state===D).length}function Ce(v){return v==="all"?U.value:R.value.filter(D=>D.apply_state===v).length}function Re(v){const D=v.sections.flatMap(B=>$(B));return{fields:D.length,modified:ie.value.filter(B=>v.sections.includes(B.path.split(".")[0])).length,pending_restart:D.filter(B=>B.apply_state==="pending_restart").length,invalid:D.filter(B=>B.apply_state==="invalid").length,dormant:D.filter(B=>B.apply_state==="dormant").length}}function Ve(v){var D;return Object.hasOwn(y.value,v)&&!Ri((D=e.value)==null?void 0:D[v],y.value[v])}function Pe(v){return ie.value.some(D=>D.path===v||D.path.startsWith(`${v}.`))}function pt(v){p.value=v,u.value="",f.value="all";try{localStorage.setItem(Tm,v)}catch{}}function ls(v){f.value=v}function Ps(){u.value="",f.value="all"}function nn(v){var D;return((D=we.value.find(B=>B.sections.includes(v)))==null?void 0:D.sections)||[]}function Ss(v){const D=nn(v),B=D.find(ae=>b.value[ae]===!0);return B||D.find(ae=>b.value[ae]!==!1)||null}function Fs(v){return u.value&&!T.value&&K(v)?!0:T.value?Ss(v)===v:Object.hasOwn(b.value,v)?b.value[v]===!0:!0}function Mt(v){const D=!Fs(v);if(T.value){const B={...b.value};for(const ae of nn(v))B[ae]===!0&&(B[ae]=!1);B[v]=D,b.value=B;return}b.value={...b.value,[v]:D}}function Yt(){_.value.push(Zn(y.value)),_.value.length>Hk&&_.value.shift(),S.value=[]}function $s(){he.value&&(Yt(),y.value={},m.value={},g.value=!1)}function Bs(v,D=!1){const B=Date.now();if(D&&H.path===v&&B-H.at<zk){H.at=B;return}Yt(),H={path:v,at:B}}function An(v,D,B){if(!D.length)return B;const ae=Zn(v??{});let Ne=ae;for(let Ue=0;Ue<D.length-1;Ue+=1){const et=D[Ue];Ne[et]=Zn(Ne[et]??{}),Ne=Ne[et]}return Ne[D.at(-1)]=B,ae}function Us(v){var D;return Object.hasOwn(y.value,v)?y.value[v]:Zn((D=e.value)==null?void 0:D[v])}function zt(v,D,B={}){var vt;const[ae,...Ne]=v.path.split(".");Bs(v.path,!!B.coalesce);const Ue=Us(ae),et=Ne.length?An(Ue,Ne,D):D,Vt={...y.value};if(Ri(et,(vt=e.value)==null?void 0:vt[ae])?delete Vt[ae]:Vt[ae]=et,y.value=Vt,m.value[v.path]){const li={...m.value};delete li[v.path],m.value=li}}function Vn(v){H={path:null,at:0},E.value={...E.value,[v]:String(te(ke.value,v)??"")}}function Ct(v){if(H={path:null,at:0},!Object.hasOwn(E.value,v))return;const D={...E.value};delete D[v],E.value=D}function rs(v){const D=E.value[v.path];if(H={path:null,at:0},D===""){m.value={...m.value,[v.path]:"Enter a number."};return}const B=Number(D);if(Number.isNaN(B)||v.type==="integer"&&!Number.isInteger(B)){m.value={...m.value,[v.path]:v.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ae={...E.value};delete ae[v.path],E.value=ae,zt(v,B,{coalesce:!0})}function os(v){return Object.hasOwn(E.value,v.path)?E.value[v.path]:v.value??""}function Ye(v,D){if(E.value={...E.value,[v.path]:D},D===""){m.value={...m.value,[v.path]:"Enter a number."};return}const B=Number(D);if(!Number.isFinite(B)||v.type==="integer"&&!Number.isInteger(B)){m.value={...m.value,[v.path]:v.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(m.value[v.path]){const ae={...m.value};delete ae[v.path],m.value=ae}zt(v,B,{coalesce:!0})}function gs(v){const D=Number.parseInt(I.value,10);if(!Number.isInteger(D)||D<1){m.value={...m.value,[v.path]:"Warning thresholds must be positive whole numbers."};return}const B=[...new Set([...v.value||[],D])].sort((ae,Ne)=>Ne-ae);I.value="",zt(v,B)}function q(v,D){zt(v,(v.value||[]).filter(B=>B!==D))}function re(v){return v.apply_mode==="live_read"?"Odin reads the saved file value on next use.":v.apply_mode==="live_for_new_work"?"New work uses the saved file value.":v.apply_mode==="live_apply"?v.apply_handler?`Apply the saved value through ${v.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":v.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":v.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":v.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Ee(v){return v.type==="array"&&Array.isArray(v.value)&&!v.structured_container&&!v.structured_container_child&&v.sensitivity==="public"&&v.value.every(D=>["string","number","boolean"].includes(typeof D))}function Ze(v){const D=String(x.value[v.path]??"").trim();if(!D)return;const B=[...new Set([...v.value||[],D])];x.value={...x.value,[v.path]:""},zt(v,B)}function lt(v,D){zt(v,(v.value||[]).filter(B=>B!==D))}function Ot(v,D){var ae;if(!v)return null;if((ae=v.enum)!=null&&ae.length&&!v.enum.includes(D))return`Choose one of: ${v.enum.join(", ")}`;if(v.path==="agents.final_warning_iterations"&&(!Array.isArray(D)||!D.length))return"Add at least one warning threshold.";const B=v.constraints||{};if((v.type==="integer"||v.type==="number")&&typeof D=="number"){if(B.minimum!==void 0&&D<B.minimum)return`Must be at least ${B.minimum}${v.unit?` ${v.unit}`:""}`;if(B.maximum!==void 0&&D>B.maximum)return`Must be at most ${B.maximum}${v.unit?` ${v.unit}`:""}`}return null}function Pt(v){return V.value[v.path]||null}function ma(v){const D=`${v}.`;return Object.keys(V.value).some(B=>B===v||B.startsWith(D))}function Ts(){_.value.length&&(S.value.push(Zn(y.value)),y.value=_.value.pop(),m.value={},E.value={},H={path:null,at:0})}function ga(){S.value.length&&(_.value.push(Zn(y.value)),y.value=S.value.pop(),m.value={},E.value={},H={path:null,at:0})}function ni(){!he.value||de.value||(g.value=!0,w.value=!1)}function va(){g.value=!1}function ba(){$s()}function Gs(v){return Bk[v]||wa(v||"unknown")}function z(v){return`apply-${String(v||"unknown").replaceAll("_","-")}`}function pe(v){return`cfgc-field-${v.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function _e(v){return`${pe(v)}-input`}function Nt(v){const D=document.getElementById(pe(v))||document.getElementById(pe(v.split(".").slice(0,2).join(".")));D==null||D.scrollIntoView({behavior:"smooth",block:"center"})}function Cs(v,D){l.value={type:v,message:D},window.setTimeout(()=>{var B;((B=l.value)==null?void 0:B.message)===D&&(l.value=null)},3500)}function jn(){o.value=!1,f.value="pending_restart",u.value="";const v=$k(n.value);v&&(v.scrollTop=0)}function Br(){o.value=!1}function ai(v=1800){M&&window.clearTimeout(M),M=window.setTimeout(rl,v)}async function rl(){if(c.value){if(P+=1,P>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await lo(),k.value===0){c.value=!1,d.value=null,Cs("success","Odin restarted and the saved startup settings are active.");return}}catch{}ai(2e3)}}async function ya(){if(!c.value){d.value=null;try{await G.post("/api/restart",{}),c.value=!0,P=0,o.value=!1,ai()}catch(v){d.value=v.message||"Odin could not schedule a restart."}}}async function ii(){if(!(!he.value||de.value||a.value)){a.value=!0;try{const v=qk(e.value,y.value),D=await G.put("/api/config",v);e.value=D,y.value={},_.value=[],S.value=[],m.value={},g.value=!1;try{t.value=await lo(),r.value=null,o.value=k.value>0,Cs("success",k.value?`Configuration saved. ${k.value} setting${k.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(B){r.value=B.message||"Unknown metadata error.",Cs("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(v){Cs("error",v.message||"Configuration could not be saved")}finally{a.value=!1}}}async function me(){var v,D;if(!he.value){s.value=!0,i.value=null;try{const B=await G.get("/api/config"),ae=await lo();e.value=B,t.value=ae,r.value=null;const Ne=we.value;if(Ne.some(Ue=>Ue.key===p.value)||(p.value=((v=Ne[0])==null?void 0:v.key)||Ha[0].key),T.value){const et=(((D=Ne.find(Vt=>Vt.key===p.value))==null?void 0:D.sections)||[]).find(Vt=>b.value[Vt]===!0);b.value=et?{...b.value,[et]:!0}:{}}}catch(B){i.value=B.message||"Unknown configuration error"}finally{s.value=!1}}}function A(v){if(g.value||!(v.ctrlKey||v.metaKey))return;const D=v.target;D instanceof HTMLElement&&(D.matches("input, textarea, select")||D.isContentEditable)||(!v.shiftKey&&v.key.toLowerCase()==="z"?(v.preventDefault(),Ts()):(v.key.toLowerCase()==="y"||v.shiftKey&&v.key.toLowerCase()==="z")&&(v.preventDefault(),ga()))}function W(v){T.value=v.matches}return ns(b,v=>{try{localStorage.setItem(Sm,JSON.stringify(v))}catch{}},{deep:!0}),We(()=>{var v;me(),document.addEventListener("keydown",A),C=window.matchMedia("(max-width: 760px)"),W(C),(v=C.addEventListener)==null||v.call(C,"change",W)}),xt(()=>{var v;document.removeEventListener("keydown",A),(v=C==null?void 0:C.removeEventListener)==null||v.call(C,"change",W),M&&window.clearTimeout(M)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:f,activeCategory:p,reviewOpen:g,mobileOverflowOpen:w,warningThresholdInput:I,arrayInputs:x,healthFilters:O,visibleCategories:we,displayGroups:ce,reviewGroups:ye,sectionCount:Q,fieldCount:U,hasChanges:he,changeCount:F,changedSectionCount:se,hasDraftErrors:de,canUndo:N,canRedo:Y,globalFilterActive:Se,reviewRestartCount:ge,pendingRestartCount:k,pendingRestartFields:He,healthCount:Ce,categoryStats:Re,selectCategory:pt,selectHealthFilter:ls,clearFilters:Ps,sectionLabel:Z,sectionDescription:X,sectionFieldCount:ee,sectionHealthCount:xe,sectionApplySummary:oe,sectionApplyDetails:le,sectionEntries:ne,fieldGroups:ve,sectionSearchHits:ct,fieldRuntimeCopy:Te,fieldSpecificRuntimeNote:Le,hasHonestAction:De,runFieldAction:Be,sectionChanged:Ve,fieldChanged:Pe,isSectionExpanded:Fs,toggleSection:Mt,discardAllDrafts:$s,setFieldValue:zt,setNumberFieldValue:Ye,numberInputValue:os,beginInputEdit:Vn,endTextInputEdit:Ct,endInputEdit:rs,addWarningThreshold:gs,removeWarningThreshold:q,isScalarArray:Ee,addScalarArrayItem:Ze,removeScalarArrayItem:lt,fieldError:Pt,sectionHasErrors:ma,undo:Ts,redo:ga,openReview:ni,closeReview:va,mobileCancel:ba,applyModeLabel:Gs,applyClass:z,compactValue:Vk,formatValue:jk,structuredApplyCopy:re,fieldId:pe,fieldInputId:_e,focusField:Nt,fetchConfig:me,saveConfig:ii,restartOdin:ya,restartLater:Br,reviewPendingRestart:jn}}},Zk=/^\d{15,25}$/;function Am(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Rm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=J(()=>new Set((e.excludedIds||[]).map(String))),r=J(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(g=>l.value.has(String(g.id))?!1:S?u(g).toLowerCase().includes(S)||String(g.username||"").toLowerCase().includes(S)||String(g.id).includes(S):!0)}),o=J(()=>{const S=s.value.trim();return r.value.length===0&&Zk.test(S)&&!l.value.has(S)?S:""}),c=J(()=>r.value.length+(o.value?1:0)),d=J(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return Am(S)}function f(){n.value=!0,a.value=0}function p(){f()}function b(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function y(){a.value=Math.max(a.value-1,0)}function E(){const S=r.value[a.value];S?I(S):o.value&&a.value===r.value.length&&x(o.value)}function I(S){x(String(S.id))}function x(S){t("select",S),s.value="",n.value=!1,a.value=0}function m(){n.value=!1}function _(){setTimeout(m,150)}return We(()=>{e.autofocus&&Rt(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:f,onInput:p,highlightNext:b,highlightPrevious:y,selectHighlighted:E,selectMember:I,selectId:x,closeOptions:m,onBlur:_}}};function Pu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const Jk={components:{DiscordUserCombobox:Rm},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),r=h(null),o=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),f=J(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),p=J(()=>new Map(c.value.map(R=>[String(R.id),R])));function b(R){return R.config&&R.config.enabled!==void 0?R.config.enabled:!0}function y(R){return Pu(R,"require_mention",a.value)}function E(R){return Pu(R,"respond_to_bots",a.value)}function I(R){return R.config&&Object.keys(R.config).length>0}function x(R){n.value[R]=!n.value[R]}function m(R){const j=R.discord||{};return{allowed_users:[...j.allowed_users||[]],channels:[...j.channels||[]],respond_to_bots:!!j.respond_to_bots,require_mention:!!j.require_mention,ignore_bot_ids:[...j.ignore_bot_ids||[]]}}async function _({showLoading:R=!0}={}){const j=++d;R&&(t.value=!0),s.value=null;try{const Q=await G.get("/api/discord/guilds");j===d&&(e.value=Q)}catch(Q){j===d&&(s.value=Q.message)}finally{R&&j===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[R,j,Q]=await Promise.all([G.get("/api/discord/guilds"),G.get("/api/discord/members").catch(()=>[]),G.get("/api/config")]),U=m(Q),O=f.value;a.value=U,O||(i.value=JSON.parse(JSON.stringify(U))),c.value=j,e.value=R,r.value=null}catch(R){s.value=R.message}finally{t.value=!1}}async function g(R,j,Q){try{await G.put("/api/discord/guild/"+R+"/config",{[j]:Q}),await _({showLoading:!1})}catch(U){s.value=U.message}}async function w(R,j,Q,U){try{await G.put("/api/discord/channel/"+R+"/config",{[Q]:U}),await _({showLoading:!1})}catch(O){s.value=O.message}}async function T(R,j){try{await G.put("/api/discord/channel/"+R+"/config",{clear:!0}),await _({showLoading:!1})}catch(Q){s.value=Q.message}}function C(R,j){const Q=String(j);if(!R.userAutocomplete)return Q;const U=p.value.get(Q);return U?Am(U):Q}function M(R,j=null){const Q=String(j??o.value[R]??"").trim();!Q||i.value[R].includes(Q)||(i.value[R]=[...i.value[R],Q],o.value={...o.value,[R]:""})}function H(R,j){i.value[R]=i.value[R].filter(Q=>Q!==j)}async function P(){if(!(!f.value||l.value)){l.value=!0,r.value=null;try{const j=(await G.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...j.allowed_users||[]],channels:[...j.channels||[]],respond_to_bots:!!j.respond_to_bots,require_mention:!!j.require_mention,ignore_bot_ids:[...j.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(R){r.value=R.message||"Global defaults could not be saved."}finally{l.value=!1}}}return We(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:f,guildEnabled:b,guildMention:y,guildBots:E,hasOverride:I,toggleGuild:x,fetchAll:S,fetchGuilds:_,setGuildConfig:g,setChannelConfig:w,clearOverride:T,globalItemLabel:C,addGlobalItem:M,removeGlobalItem:H,saveGlobalDefaults:P}}},vs=e=>e==null?e:JSON.parse(JSON.stringify(e));function Yk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const f=new Map;let p=null;const b=new Map;function y(g){d+=1;const w=c.then(g,g);return c=w.catch(()=>{}),w}function E(g,w){p=vs(g),b.clear();for(const[T,C]of Object.entries(w||{}))b.set(T,vs(C))}function I(g){const w=vs(g),T=++u;return y(async()=>{try{await e(vs(w)),p=vs(w),T===u&&n(vs(w))}catch(C){T===u&&(a(vs(p)),o(C,{kind:"default"}))}})}function x(g,w){const T=vs(w),C=(f.get(g)||0)+1;return f.set(g,C),y(async()=>{try{await t(g,vs(T)),b.set(g,vs(T)),C===f.get(g)&&i(g,vs(T))}catch(M){C===f.get(g)&&(l(g,vs(b.get(g)??null)),o(M,{kind:"user",uid:g}))}})}function m(g){const w=(f.get(g)||0)+1;return f.set(g,w),y(async()=>{try{await s(g),b.delete(g),w===f.get(g)&&r(g)}catch(T){w===f.get(g)&&(l(g,vs(b.get(g)??null)),o(T,{kind:"delete",uid:g}))}})}async function _(){for(;;){const g=c;if(await g,g===c)return d}}async function S(g){for(;;){const w=await _(),T=await g();if(w===d)return T}}return{seed:E,saveDefault:I,saveUser:x,deleteUser:m,whenIdle:_,readSnapshot:S,get revision(){return d}}}const Qk={components:{DiscordUserCombobox:Rm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h([]),o=J(()=>{const g={};for(const w of r.value)g[w.id]=w;return g});function c(g){return o.value[g]||null}function d(g,w){return g?g.allowed_hosts===null||g.allowed_hosts===void 0?{allowed_hosts:[...w],default_host:g.default_host||"",allow_all:!0}:{allowed_hosts:g.allowed_hosts,default_host:g.default_host||"",allow_all:!1}:{allowed_hosts:[...w],default_host:w[0]||"",allow_all:!0}}const u=Yk({applyDefault:async g=>{const w=g.allow_all?null:g.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:w,default_host:g.default_host})},applyUser:async(g,w)=>{const T=w.allow_all?null:w.allowed_hosts;await G.put(`/api/host-access/user/${g}`,{allowed_hosts:T,default_host:w.default_host})},applyDelete:g=>G.del(`/api/host-access/user/${g}`),onDefaultConfirmed:()=>Ae.success("Default policy updated"),onDefaultRollback:g=>{g&&(a.value=g)},onUserConfirmed:g=>{const w=c(g);Ae.success(`Updated access for ${w?w.display_name:g}`)},onUserRollback:(g,w)=>{const T={...i.value};w?T[g]=w:delete T[g],i.value=T},onUserDeleted:g=>{const w={...i.value};delete w[g],i.value=w},onError:(g,w)=>{var C;const T=w.uid?` ${((C=c(w.uid))==null?void 0:C.display_name)||w.uid}`:"";Ae.error(`${g.message||"Failed to save"} — reverted${T}`)}});let f=0;async function p(){const g=++f;e.value=!0,t.value="";try{const w=await u.readSnapshot(()=>G.get("/api/host-access"));if(g!==f)return;s.value=w,n.value=w.available_hosts||[],a.value=d(w.default_policy,n.value);const T=w.users||{},C={};for(const[M,H]of Object.entries(T))C[M]=d(H,n.value);i.value=C,u.seed(a.value,C)}catch(w){g===f&&(t.value=w.message||"Failed to fetch host access data")}finally{g===f&&(e.value=!1)}try{const w=await G.get("/api/discord/members")||[];g===f&&(r.value=w)}catch{g===f&&(r.value=[])}}function b(){u.saveDefault(a.value)}function y(g,w){a.value.allow_all=!1,w?a.value.allowed_hosts.includes(g)||a.value.allowed_hosts.push(g):(a.value.allowed_hosts=a.value.allowed_hosts.filter(T=>T!==g),a.value.default_host===g&&(a.value.default_host=a.value.allowed_hosts[0]||"")),b()}function E(g){const w=i.value[g];w&&u.saveUser(g,w)}function I(g,w,T){const C=i.value[g];C&&(C.allow_all=!1,T?C.allowed_hosts.includes(w)||C.allowed_hosts.push(w):(C.allowed_hosts=C.allowed_hosts.filter(M=>M!==w),C.default_host===w&&(C.default_host=C.allowed_hosts[0]||"")),E(g))}function x(g,w){const T=i.value[g];T&&(T.default_host=w,E(g))}function m(){l.value=!0}function _(g){!/^\d{15,25}$/.test(g)||i.value[g]||(i.value[g]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},E(g),l.value=!1)}async function S(g){const w=c(g);await _s({title:"Remove user override",message:`Remove the host access override for ${w?w.display_name:g}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(g),i.value[g]||Ae.success(`Removed override for ${w?w.display_name:g}`))}return We(p),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:p,saveDefaultPolicy:b,toggleDefaultHost:y,getMember:c,toggleUserHost:I,setUserDefault:x,openAddUser:m,addUserById:_,deleteUser:S}}},Xk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function p(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function b(){e.value=!0,t.value="";try{const T=await G.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function y(T){return!T||!T.trim()?[]:T.split(",").map(C=>C.trim()).filter(Boolean)}function E(T,C){const M=c.value.allowed_hosts;if(C&&!M.includes(T)&&M.push(T),!C){const H=M.indexOf(T);H>=0&&M.splice(H,1)}}function I(T,C){const M=d.value.allowed_hosts;if(C&&!M.includes(T)&&M.push(T),!C){const H=M.indexOf(T);H>=0&&M.splice(H,1)}}async function x(){var T;i.value=!0;try{const C=y(c.value.allowed_tools_str),M=c.value.host_mode,H=M==="none"?[]:M==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};H!==null&&(P.allowed_hosts=H),P.default_host=c.value.default_host||"";const R=await G.post("/api/tokens",P);l.value=R.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Ae.success("Token created"),await b()}catch(C){Ae.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to create token")}finally{i.value=!1}}function m(T){r.value=T;const C=T.allowed_hosts;let M="default";C==null?M="default":Array.isArray(C)&&C.length===0?M="none":Array.isArray(C)&&(M="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:M,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function _(){var T;if(r.value){o.value=!0;try{const C=y(d.value.allowed_tools_str),M=d.value.host_mode,H={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};M==="none"?H.allowed_hosts=[]:M==="select"?H.allowed_hosts=d.value.allowed_hosts:H.allowed_hosts=null,H.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,Ae.success("Token updated"),await b()}catch(C){Ae.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function S(T){var M;if(await _s({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await G.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=H.token,Ae.success("Token regenerated")}catch(H){Ae.error(((M=H.data)==null?void 0:M.error)||H.message||"Failed to regenerate")}}async function g(T){var M;if(await _s({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(T.user_id)),Ae.success("Token deleted"),await b()}catch(H){Ae.error(((M=H.data)==null?void 0:M.error)||H.message||"Failed to delete")}}async function w(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ae.success("Copied to clipboard")}catch{Ae.error("Copy failed — select and copy manually")}}return We(b),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:f,fetchData:b,tierBadge:p,toggleCreateHost:E,toggleEditHost:I,createToken:x,startEdit:m,saveEdit:_,confirmRegenerate:S,confirmDelete:g,copyToken:w}}},ew=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),tw=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),sw=Object.freeze(["enabled","base_url","model","max_tokens"]),nw=Object.freeze(["enabled","model","max_tokens"]);function Pr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Fu(e){return Pr(e,ew)}function $u(e){return Pr(e,tw)}function aw(e,{includeApiKey:t=!1}={}){const s=Pr(e,sw);return t&&(s.api_key=e.api_key),s}function iw(e){return{timeout:e.timeout}}function lw(e,{includeApiKey:t=!1}={}){const s=Pr(e,nw);return t&&(s.api_key=e.api_key),s}function rw(e){return{timeout:e.timeout}}function kl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const ow={template:`
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
              <strong>{{ formatCount(activeContextBudget?.effective?.effective_budget) }} <small>tokens</small></strong>
              <span class="llm-budget-provenance" :class="provenanceClass(activeContextBudget?.provenance)">{{ activeContextBudget?.provenance || 'unavailable' }}</span>
              <small v-if="activeContextBudget?.clamp_expires_at">Expires {{ formatExpiry(activeContextBudget.clamp_expires_at) }}</small>
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
                  Saved values need a restart. This process still uses compression {{ llmStatus.codex.effective_context_compression?.enabled ? 'on' : 'off' }}, {{ formatContextCeiling(llmStatus.codex.effective_context_compression?.max_context_chars) }}, and {{ llmStatus.codex.effective_context_compression?.keep_recent_iterations }} recent iterations.
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=J(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=J(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=J(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=J(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),d=J(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),u=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),f=z=>r.includes(z)&&d.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),b=h({unavailable_reason:null}),y=J(()=>{const z=p.value.model;return z&&!a.includes(z)?[z,...a]:a});function E(z){const pe=z.target.value;p.value.enabled=pe!=="",pe!==""&&(p.value.model=pe),rs()}const I=h(!1),x=h({codex:!1,ollama:!1,kimi:!1}),m=h(null),_=h(!1),S=h(""),g=h(null),w=h(!1);let T=0;const C=J(()=>{var z;return Object.entries(((z=m.value)==null?void 0:z.models)||{}).map(([pe,_e])=>{var Nt,Cs,jn;return{model:pe,floor:_e.floor,override:_e.override,effectiveBudget:(Nt=_e.effective)==null?void 0:Nt.effective_budget,configuredPrimaryChars:(Cs=_e.configured)==null?void 0:Cs.primary_chars,primaryChars:(jn=_e.effective)==null?void 0:jn.primary_chars,provenance:_e.provenance,clampExpiresAt:_e.clamp_expires_at}})}),M=J(()=>{var z;return((z=m.value)==null?void 0:z.clamps)||[]}),H=J(()=>{var z,pe;return((pe=(z=m.value)==null?void 0:z.models)==null?void 0:pe[n.value.model])||null}),P=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),R=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),j=h(!1),Q=h(!1),U=h(!1),O=h(!1),N=h(!1),Y=h(!1),we=h(!1),ke=h({configured:!1}),ie=h([]),he=h(""),F=h(!1),se=h(!1),Se=h({configured:!1}),V=h([]),de=h(""),ce=h(!1),ye=h(!1),ge=h(!0),He=h(""),k=h({configured:!1,accounts:[]}),L=h(null),$=h(null),ee=h(""),Z=h(null),X=h(!1),ue=h(null),oe=h(null),le=h("");let te=null;function ne(z,pe="success"){Ae(z,pe==="error"?"error":"success")}function fe(z){if(!z)return"?";const pe=z/(1024*1024*1024);return pe>=1?pe.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}function ve(z){return Number.isFinite(Number(z))?Number(z).toLocaleString():"—"}function Te(z){return z==null?"automatic (model-derived)":Number(z).toLocaleString()+" characters"}function Oe(z){const pe=new Date(z);return Number.isNaN(pe.getTime())?"unknown":pe.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Le(z){return typeof z=="string"&&z.length>12?z.slice(0,8)+"…"+z.slice(-4):z}function De(z){return z==="temporary learned clamp"?"is-clamp":z==="override"?"is-override":"is-built-in"}function Be(z){const pe=n.value.context_budget_overrides[z.model];return z.floor!=null&&Number.isFinite(Number(pe))&&Number(pe)>z.floor}function qe(z,pe){const _e={...n.value.context_budget_overrides};pe.target.value===""?delete _e[z]:_e[z]=Number(pe.target.value),n.value.context_budget_overrides=_e,w.value=!0}function ct(z){n.value.context_utilization=z.target.value===""?"":Number(z.target.value),w.value=!0}function K(z){const pe={...n.value.context_budget_overrides};delete pe[z],n.value.context_budget_overrides=pe,w.value=!0}async function xe(){e.value=!0,await Promise.all([Ce(),Ve(),Ss(),Pe(),Re()]),e.value=!1}async function Ce({preserveBasic:z=!1,preserveAdvanced:pe=!1}={}){try{const _e=await G.get("/api/llm/status");t.value=_e,s.value=_e.active_provider||"codex",_e.codex&&!Ct.pending()&&(z||(n.value.enabled=_e.codex.enabled,n.value.model=_e.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=_e.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=_e.codex.agent_reasoning_effort||"",n.value.agent_model=_e.codex.agent_model||""),pe||(n.value.request_timeout_seconds=_e.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=_e.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,..._e.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,..._e.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,..._e.codex.context_compression||{}},!w.value&&!U.value&&(n.value.context_budget_overrides={..._e.codex.context_budget_overrides||{}},n.value.context_utilization=_e.codex.context_utilization??n.value.context_utilization))),_e.ollama&&!os.pending()&&(z||(P.value.enabled=_e.ollama.enabled,P.value.base_url=_e.ollama.base_url||"",P.value.model=_e.ollama.model||"",P.value.max_tokens=_e.ollama.max_tokens||4096),pe||(P.value.timeout=_e.ollama.timeout??P.value.timeout)),_e.kimi&&!Ye.pending()&&(z||(R.value.enabled=_e.kimi.enabled,R.value.model=_e.kimi.model||"",R.value.max_tokens=_e.kimi.max_tokens||4096),pe||(R.value.timeout=_e.kimi.timeout??R.value.timeout)),_e.auxiliary&&(b.value=_e.auxiliary,rs.pending()||(p.value.enabled=_e.auxiliary.enabled,p.value.model=_e.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Re(){const z=++T;_.value=!0,S.value="";try{const pe=await G.get("/api/context/windows");if(z!==T)return;m.value=pe,!U.value&&!w.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(pe.models||{}).filter(([,_e])=>_e.override!=null).map(([_e,Nt])=>[_e,Nt.override])),n.value.context_utilization=pe.utilization??n.value.context_utilization)}catch(pe){z===T&&(S.value=pe.message||"Failed to load context budgets")}finally{z===T&&(_.value=!1)}}async function Ve(){try{if(ke.value=await G.get("/api/ollama/status"),ke.value.model&&(he.value=ke.value.model),ke.value.configured)try{const z=await G.get("/api/ollama/models");ie.value=z.models||[]}catch{ie.value=[]}else if(P.value.base_url)try{const z=await G.post("/api/ollama/probe-models",{base_url:P.value.base_url});ie.value=z.models||[]}catch{ie.value=[]}}catch{ke.value={configured:!1}}}async function Pe(){ge.value=!0,He.value="";try{k.value=await G.get("/api/codex/status")}catch(z){He.value=z.message||"Failed to fetch Codex status"}finally{ge.value=!1}}async function pt(){const z=t.value?t.value.active_provider:"codex";we.value=!0;try{const pe=await G.post("/api/llm/switch",{provider:s.value});pe.error?(s.value=z,ne(pe.error,"error")):(ne("Switched to "+s.value+" ("+pe.model+")"),await xe())}catch(pe){s.value=z,ne(pe.message||"Switch failed","error")}finally{we.value=!1}}async function ls(){F.value=!0;try{const z=await G.post("/api/ollama/reload");ne(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await xe()}catch(z){ne(z.message||"Reload failed","error")}finally{F.value=!1}}async function Ps(){se.value=!0;try{await G.post("/api/ollama/model",{model:he.value}),ne("Model set to "+he.value),await xe()}catch(z){ne(z.message||"Failed","error")}finally{se.value=!1}}async function nn(){const z=P.value.base_url;if(!z){ne("Enter a base URL first","error");return}Y.value=!0;try{const pe=await G.post("/api/ollama/probe-models",{base_url:z});ie.value=pe.models||[],ie.value.length?(ne(ie.value.length+" model(s) found"),!P.value.model&&ie.value.length&&(P.value.model=ie.value[0].name)):ne("No models found at "+z,"error")}catch(pe){ne(pe.message||"Could not reach Ollama","error")}finally{Y.value=!1}}async function Ss(){try{if(Se.value=await G.get("/api/kimi/status"),Se.value.model&&(de.value=Se.value.model),Se.value.configured)try{const z=await G.get("/api/kimi/models");V.value=z.models||[]}catch{V.value=[]}}catch{Se.value={configured:!1}}}async function Fs(){ce.value=!0;try{const z=await G.post("/api/kimi/reload");ne(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await xe()}catch(z){ne(z.message||"Reload failed","error")}finally{ce.value=!1}}async function Mt(){ye.value=!0;try{await G.post("/api/kimi/model",{model:de.value}),ne("Model set to "+de.value),await xe()}catch(z){ne(z.message||"Failed","error")}finally{ye.value=!1}}async function Yt(){if(U.value){Ct();return}U.value=!0;const z=Fu(n.value);try{await G.put("/api/llm/codex/config",z),ne("Codex config saved"),await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:!0}),Pe()])}catch(pe){ne(pe.message||"Failed","error");const _e=JSON.stringify(Fu(n.value))!==JSON.stringify(z);await Promise.all([Ce({preserveBasic:_e,preserveAdvanced:!0}),Pe()])}finally{U.value=!1}}async function $s(){if(U.value)return;U.value=!0;const z=$u(n.value);try{await G.put("/api/llm/codex/config",z),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:z.context_budget_overrides,context_utilization:z.context_utilization})&&(w.value=!1),ne("Codex advanced settings saved"),await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:!0}),Pe(),Re()])}catch(pe){ne(pe.message||"Failed","error");const _e=JSON.stringify($u(n.value))!==JSON.stringify(z);await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:_e}),Pe(),Re()])}finally{U.value=!1}}async function Bs(){if(O.value){os();return}O.value=!0;try{const z=j.value?P.value.api_key:null,pe=aw(P.value,{includeApiKey:z!==null});await G.put("/api/llm/ollama/config",pe),ne("Ollama config saved"),z!==null&&P.value.api_key===z&&(P.value.api_key="",j.value=!1),await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:!0}),Ve()])}catch(z){ne(z.message||"Failed","error")}finally{O.value=!1}}async function An(){if(!O.value){O.value=!0;try{await G.put("/api/llm/ollama/config",iw(P.value)),ne("Ollama timeout saved"),await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:!0}),Ve()])}catch(z){ne(z.message||"Failed","error")}finally{O.value=!1}}}async function Us(){if(N.value){Ye();return}N.value=!0;try{const z=Q.value?R.value.api_key:null,pe=lw(R.value,{includeApiKey:z!==null});await G.put("/api/llm/kimi/config",pe),ne("Kimi config saved"),z!==null&&R.value.api_key===z&&(R.value.api_key="",Q.value=!1),await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:!0}),Ss()])}catch(z){ne(z.message||"Failed","error")}finally{N.value=!1}}async function zt(){if(!N.value){N.value=!0;try{await G.put("/api/llm/kimi/config",rw(R.value)),ne("Kimi timeout saved"),await Promise.all([Ce({preserveBasic:!0,preserveAdvanced:!0}),Ss()])}catch(z){ne(z.message||"Failed","error")}finally{N.value=!1}}}async function Vn(){if(I.value){rs();return}I.value=!0;try{await G.put("/api/llm/auxiliary/config",p.value),ne("Auxiliary config saved"),await Ce()}catch(z){ne(z.message||"Failed","error"),await Ce()}finally{I.value=!1}}const Ct=kl(Yt),rs=kl(Vn),os=kl(Bs),Ye=kl(Us),gs=()=>(Ct.cancel(),Yt()),q=()=>(os.cancel(),Bs()),re=()=>(Ye.cancel(),Us()),Ee=()=>$s(),Ze=()=>An(),lt=()=>zt();async function Ot(z){const pe=z.account_key+":"+z.model;g.value=pe;try{const _e=await G.post("/api/context/windows/clear",{account_key:z.account_key,model:z.model});ne(_e.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Re()}catch(_e){ne(_e.message||"Failed to clear clamp","error"),await Re()}finally{g.value=null}}async function Pt(z){try{await G.post("/api/codex/account/"+z+"/activate"),ne("Active account switched"),await Pe()}catch(pe){ne(pe.message||"Failed","error")}}async function ma(z){L.value=z;try{await G.post("/api/codex/account/"+z+"/refresh"),ne("Token refreshed"),await Pe()}catch(pe){ne(pe.message||"Refresh failed","error")}finally{L.value=null}}function Ts(z,pe){$.value=z,ee.value=pe||""}async function ga(z){try{await G.put("/api/codex/account/"+z+"/label",{label:ee.value}),ne("Label updated"),$.value=null,await Pe()}catch(pe){ne(pe.message||"Failed","error")}}async function ni(z,pe){if(await _s({title:"Delete Codex account",message:`Delete ${pe||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+z),ne("Deleted. Pool reloaded."),await Pe()}catch(Nt){ne(Nt.message||"Failed","error")}}async function va(){X.value=!0;try{const z=await G.post("/api/codex/device-code");ue.value=z,Z.value="pending",ba(z)}catch(z){ne(z.message||"Failed","error")}finally{X.value=!1}}async function ba(z){te={cancelled:!1};const pe=te;try{const _e=await G.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(pe.cancelled)return;oe.value=_e,Z.value="success",await xe()}catch(_e){if(pe.cancelled)return;le.value=_e.message||"Device login failed",Z.value="error"}}function Gs(){te&&(te.cancelled=!0),Z.value=null,ue.value=null}return We(xe),xt(()=>{te&&(te.cancelled=!0),Ct.cancel(),rs.cancel(),os.cancel(),Ye.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:we,advancedOpen:x,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:f,auxForm:p,auxData:b,auxModelOptions:y,onAuxModelChange:E,savingAux:I,saveAuxConfigDebounced:rs,ollamaForm:P,kimiForm:R,savingCodex:U,savingOllama:O,savingKimi:N,probingOllama:Y,ollamaKeyDirty:j,kimiKeyDirty:Q,ollamaStatus:ke,ollamaModels:ie,ollamaSelectedModel:he,reloading:F,settingModel:se,kimiStatus:Se,kimiModels:V,kimiSelectedModel:de,reloadingKimi:ce,settingKimiModel:ye,codexLoading:ge,codexError:He,codexData:k,refreshing:L,editingLabel:$,labelValue:ee,contextWindows:m,contextWindowsLoading:_,contextWindowsError:S,contextBudgetRows:C,activeClampRows:M,activeContextBudget:H,clearingClamp:g,contextPolicyDirty:w,deviceState:Z,deviceLoading:X,deviceInfo:ue,deviceResult:oe,deviceError:le,fetchAll:xe,switchProvider:pt,reloadOllama:ls,setOllamaModel:Ps,reloadKimi:Fs,setKimiModel:Mt,probeOllamaModels:nn,saveCodexConfig:Yt,saveOllamaConfig:Bs,saveKimiConfig:Us,saveCodexAdvancedConfig:$s,saveOllamaAdvancedConfig:An,saveKimiAdvancedConfig:zt,saveCodexConfigDebounced:Ct,saveOllamaConfigDebounced:os,saveKimiConfigDebounced:Ye,saveCodexConfigNow:gs,saveOllamaConfigNow:q,saveKimiConfigNow:re,saveCodexAdvancedConfigNow:Ee,saveOllamaAdvancedConfigNow:Ze,saveKimiAdvancedConfigNow:lt,activateAccount:Pt,refreshAccount:ma,startEditLabel:Ts,saveLabel:ga,deleteAccount:ni,startDeviceLogin:va,cancelDeviceLogin:Gs,formatSize:fe,fetchContextWindows:Re,clearContextClamp:Ot,setContextOverride:qe,setContextUtilization:ct,resetContextOverride:K,overrideAboveFloor:Be,formatCount:ve,formatContextCeiling:Te,formatExpiry:Oe,shortAccountKey:Le,provenanceClass:De}}},Bu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function cw(e){return Bu[e]||Bu[(e||"").toLowerCase()]||"text-gray-400"}const dw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=J(()=>{var g;return Object.values(((g=i.value)==null?void 0:g.totals)||{}).reduce((w,T)=>w+Number(T||0),0)}),u=h(""),f=h(0),p=h([]),b=J(()=>p.value.map(g=>`${g.label} (${g.path}${g.reason?`: ${g.reason}`:""})`).join("; ")),y=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let E=null;async function I(){var M;const g=await Promise.allSettled(y.map(H=>G.get(H.path))),w=H=>g[H].status==="fulfilled"?g[H].value:null;t.value=w(0)||{};const T=w(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=w(2)||{},a.value=w(3)||{},i.value=w(4),l.value=w(5),r.value=w(6),o.value=w(7),c.value=w(8);const C=g.filter(H=>H.status==="rejected");if(p.value=g.flatMap((H,P)=>{var R;return H.status==="rejected"?[{...y[P],reason:((R=H.reason)==null?void 0:R.message)||"request failed"}]:[]}),f.value=p.value.length,C.length===g.length){const H=(M=C[0])==null?void 0:M.reason;u.value=(H==null?void 0:H.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",I()}let m=!1;function _(){m||(m=!0,I(),E||(E=setInterval(I,3e4)))}function S(){m&&(m=!1,E&&(clearInterval(E),E=null))}return We(_),Ds(_),Ms(S),xt(S),{loading:e,error:u,failedCount:f,failedEndpoints:p,failedEndpointSummary:b,endpoints:y,retry:x,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:cw,formatAgeSeconds:X_}}},uw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await _s({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return We(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Im=[{id:"health",label:"Health",component:Ok},{id:"resources",label:"Resources",component:Nk},{id:"logs",label:"Logs",component:Pk},{id:"config",label:"Config",component:Wk},{id:"discord",label:"Discord",component:Jk},{id:"host-access",label:"Host Access",component:Qk},{id:"api-tokens",label:"API Tokens",component:Xk},{id:"llm",label:"LLM Config",component:ow},{id:"internals",label:"Internals",component:dw},{id:"update",label:"Update",component:uw}],fw={components:{TabbedPage:Mr},setup(){return{tabs:Im}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},wl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),pw=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...wl("Operations","operations","/operations",_m),...wl("History","history","/history",km),...wl("Capabilities","capabilities","/capabilities",wm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...wl("System","system","/system",Im)],us=Hn({open:!1,query:"",selected:0});function Uu(){us.query="",us.selected=0,us.open=!0}function ro(){us.open=!1}function hw(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const mw={setup(){const e=pm(),t=h(null),s=J(()=>{const i=us.query.trim().toLowerCase();return pw.map(l=>({...l,_score:hw(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ns(()=>us.open,async i=>{var l;i&&(await Rt(),(l=t.value)==null||l.focus())}),ns(()=>us.query,()=>{us.selected=0});function n(i){ro(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),ro();return}if(i.key==="ArrowDown")i.preventDefault(),us.selected=Math.min(us.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),us.selected=Math.max(us.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[us.selected];l&&n(l)}}return{state:us,results:s,inputEl:t,go:n,onKeydown:a,closePalette:ro}},template:`
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
  `},jo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(jo));const gw={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ja("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ja("path",{d:jo[e.name]||jo.info})])}},vw=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Hu(e){return[...e.querySelectorAll(vw)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const bw={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Hu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Hu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},yw={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const f=J(()=>{const R=e.value.uptime_seconds||0,j=Math.floor(R/86400),Q=Math.floor(R%86400/3600),U=Math.floor(R%3600/60),O=[];return j>0&&O.push(`${j}d`),Q>0&&O.push(`${Q}h`),(O.length===0||j===0&&Q===0)&&O.push(`${U}m`),O.join(" ")}),p=J(()=>{const R=e.value.uptime_seconds||0;return 125.66*(1-Math.min(R/86400,1))}),b=J(()=>{const R=e.value;return[{label:"Guilds",value:R.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:R.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:R.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${R.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:R.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:R.loop_count>0?"text-green-400":"",highlight:R.loop_count>0},{label:"Agents",value:R.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:R.agent_count>0?`${R.agent_count} total`:"",subColor:"text-gray-500",highlight:(R.agent_running??0)>0},{label:"Processes",value:R.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:R.process_count>0?`${R.process_count} total`:"",subColor:"text-gray-500",highlight:(R.process_running??0)>0},{label:"Schedules",value:R.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(R.schedule_failing>0?`${R.schedule_failing} failing`:"")+(R.schedule_failing>0&&R.schedule_paused>0?", ":"")+(R.schedule_paused>0?`${R.schedule_paused} paused`:"")||void 0,subColor:R.schedule_failing>0?"text-red-400":"text-yellow-400",color:R.schedule_failing>0?"text-red-400":"",highlight:R.schedule_failing>0},{label:"Users",value:R.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),y=J(()=>{const R=e.value,j=[];return j.push({label:"Bot",status:R.status==="online"?"ok":"warn",detail:R.status==="online"?"Online":"Starting"}),(R.schedule_failing||0)>0?j.push({label:"Schedules",status:"error",detail:`${R.schedule_failing} failing`}):(R.schedule_count||0)>0&&j.push({label:"Schedules",status:"ok",detail:`${R.schedule_count} configured`}),(R.loop_count||0)>0&&j.push({label:"Loops",status:"ok",detail:`${R.loop_count} active`}),(R.agent_running||0)>0&&j.push({label:"Agents",status:"ok",detail:`${R.agent_running} running`}),(R.process_running||0)>0&&j.push({label:"Processes",status:"ok",detail:`${R.process_running} running`}),j});async function E(){try{e.value=await G.get("/api/status"),s.value=null}catch(R){s.value=R.message}finally{t.value=!1}}async function I(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function x(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const R=await G.get("/api/knowledge");c.value=(Array.isArray(R)?R:[]).reduce((j,Q)=>j+(Q.chunks||0),0)}catch{c.value=null}}async function _(){try{const R=await G.get("/api/agents");r.value=R.filter(j=>j.status==="running")}catch{}}async function S(){d.value={...d.value,reload:!0};try{await G.post("/api/reload"),Ae.success("Config reloaded")}catch(R){Ae.error(R.message)}d.value={...d.value,reload:!1}}async function g(){if(!await _s({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const j=e.value.session_count;e.value={...e.value,session_count:0};try{const Q=await G.post("/api/sessions/clear-all");Ae.success(`Cleared ${Q.count} session${Q.count!==1?"s":""}`),await E()}catch(Q){e.value={...e.value,session_count:j},Ae.error(Q.message)}d.value={...d.value,clearSessions:!1}}async function w(){if(!await _s({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const j=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Q=await G.post("/api/loops/stop-all");Ae.success(Q.result),await E()}catch(Q){e.value={...e.value,loop_count:j},Ae.error(Q.message)}d.value={...d.value,stopLoops:!1}}function T(){t.value=!0,s.value=null,E(),I(),x(),_()}let C=null,M=null,H=null;function P(R){if(R.payload&&R.payload.tool_name){const j={...R.payload,_isNew:!0,_key:++u};n.value.unshift(j),n.value.length>10&&n.value.pop(),o.value++,j.error&&(i.value.unshift(j),i.value.length>5&&i.value.pop()),setTimeout(()=>{j._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return We(async()=>{await Promise.all([E(),I(),x(),_(),m()]),C=setInterval(E,15e3),M=setInterval(_,1e4),Ke.subscribe("events",P)}),xt(()=>{C&&clearInterval(C),M&&clearInterval(M),clearTimeout(H),Ke.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:b,healthIndicators:y,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:I,fetchStatus:E,formatTime:hm,formatDuration:Xa,retry:T,reloadConfig:S,clearSessions:g,stopAllLoops:w}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function zu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function xw(e){if(Array.isArray(e))return e}function _w(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function kw(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ww(e,t){return xw(e)||_w(e,t)||Sw(e,t)||kw()}function Sw(e,t){if(e){if(typeof e=="string")return zu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?zu(e,t):void 0}}const Om=Object.entries,Vu=Object.setPrototypeOf,Tw=Object.isFrozen,Cw=Object.getPrototypeOf,Ew=Object.getOwnPropertyDescriptor;let is=Object.freeze,Ls=Object.seal,Ra=Object.create,Nm=typeof Reflect<"u"&&Reflect,qo=Nm.apply,Go=Nm.construct;is||(is=function(t){return t});Ls||(Ls=function(t){return t});qo||(qo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Go||(Go=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const on=Tt(Array.prototype.forEach),Aw=Tt(Array.prototype.lastIndexOf),ju=Tt(Array.prototype.pop),Sa=Tt(Array.prototype.push),Rw=Tt(Array.prototype.splice),Xt=Array.isArray,xi=Tt(String.prototype.toLowerCase),oo=Tt(String.prototype.toString),qu=Tt(String.prototype.match),Ta=Tt(String.prototype.replace),Gu=Tt(String.prototype.indexOf),Iw=Tt(String.prototype.trim),Ow=Tt(Number.prototype.toString),Nw=Tt(Boolean.prototype.toString),Ku=typeof BigInt>"u"?null:Tt(BigInt.prototype.toString),Wu=typeof Symbol>"u"?null:Tt(Symbol.prototype.toString),ht=Tt(Object.prototype.hasOwnProperty),pi=Tt(Object.prototype.toString),Ft=Tt(RegExp.prototype.test),Kn=Lw(TypeError);function Tt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return qo(e,t,n)}}function Lw(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Go(e,s)}}function $e(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:xi;if(Vu&&Vu(e,null),!Xt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(Tw(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Dw(e){for(let t=0;t<e.length;t++)ht(e,t)||(e[t]=null);return e}function qt(e){const t=Ra(null);for(const n of Om(e)){var s=ww(n,2);const a=s[0],i=s[1];ht(e,a)&&(Xt(i)?t[a]=Dw(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=qt(i):t[a]=i)}return t}function Mw(e){switch(typeof e){case"string":return e;case"number":return Ow(e);case"boolean":return Nw(e);case"bigint":return Ku?Ku(e):"0";case"symbol":return Wu?Wu(e):"Symbol()";case"undefined":return pi(e);case"function":case"object":{if(e===null)return pi(e);const t=e,s=Zs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:pi(n)}return pi(e)}default:return pi(e)}}function Zs(e,t){for(;e!==null;){const n=Ew(e,t);if(n){if(n.get)return Tt(n.get);if(typeof n.value=="function")return Tt(n.value)}e=Cw(e)}function s(){return null}return s}function Pw(e){try{return Ft(e,""),!0}catch{return!1}}const Zu=is(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),co=is(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),uo=is(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),Fw=is(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),fo=is(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),$w=is(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Ju=is(["#text"]),Yu=is(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),po=is(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Qu=is(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Sl=is(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Bw=Ls(/{{[\w\W]*|^[\w\W]*}}/g),Uw=Ls(/<%[\w\W]*|^[\w\W]*%>/g),Hw=Ls(/\${[\w\W]*/g),zw=Ls(/^data-[\-\w.\u00B7-\uFFFF]+$/),Vw=Ls(/^aria-[\-\w]+$/),Xu=Ls(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),jw=Ls(/^(?:\w+script|data):/i),qw=Ls(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),Gw=Ls(/^html$/i),Kw=Ls(/^[a-z][.\w]*(-[.\w]+)+$/i),Ks={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Ww=function(){return typeof window>"u"?null:window},Zw=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},ef=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Lm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Ww();const t=me=>Lm(me);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ks.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,f=r.prototype,p=Zs(f,"cloneNode"),b=Zs(f,"remove"),y=Zs(f,"nextSibling"),E=Zs(f,"childNodes"),I=Zs(f,"parentNode"),x=Zs(f,"shadowRoot"),m=Zs(f,"attributes"),_=l&&l.prototype?Zs(l.prototype,"nodeType"):null,S=l&&l.prototype?Zs(l.prototype,"nodeName"):null;if(typeof i=="function"){const me=s.createElement("template");me.content&&me.content.ownerDocument&&(s=me.content.ownerDocument)}let g,w="",T,C=!1,M=0;const H=function(){if(M>0)throw Kn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(A){H(),M++;try{return g.createHTML(A)}finally{M--}},R=function(A){H(),M++;try{return g.createScriptURL(A)}finally{M--}},j=function(){return C||(T=Zw(u,a),C=!0),T},Q=s,U=Q.implementation,O=Q.createNodeIterator,N=Q.createDocumentFragment,Y=Q.getElementsByTagName,we=n.importNode;let ke=ef();t.isSupported=typeof Om=="function"&&typeof I=="function"&&U&&U.createHTMLDocument!==void 0;const ie=Bw,he=Uw,F=Hw,se=zw,Se=Vw,V=jw,de=qw,ce=Kw;let ye=Xu,ge=null;const He=$e({},[...Zu,...co,...uo,...fo,...Ju]);let k=null;const L=$e({},[...Yu,...po,...Qu,...Sl]);let $=Object.seal(Ra(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ee=null,Z=null;const X=Object.seal(Ra(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,oe=!0,le=!1,te=!0,ne=!1,fe=!0,ve=!1,Te=!1,Oe=!1,Le=!1,De=!1,Be=!1,qe=!0,ct=!1;const K="user-content-";let xe=!0,Ce=!1,Re={},Ve=null;const Pe=$e({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let pt=null;const ls=$e({},["audio","video","img","source","image","track"]);let Ps=null;const nn=$e({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ss="http://www.w3.org/1998/Math/MathML",Fs="http://www.w3.org/2000/svg",Mt="http://www.w3.org/1999/xhtml";let Yt=Mt,$s=!1,Bs=null;const An=$e({},[Ss,Fs,Mt],oo);let Us=$e({},["mi","mo","mn","ms","mtext"]),zt=$e({},["annotation-xml"]);const Vn=$e({},["title","style","font","a","script"]);let Ct=null;const rs=["application/xhtml+xml","text/html"],os="text/html";let Ye=null,gs=null;const q=s.createElement("form"),re=function(A){return A instanceof RegExp||A instanceof Function},Ee=function(){let A=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(gs&&gs===A)return;(!A||typeof A!="object")&&(A={}),A=qt(A),Ct=rs.indexOf(A.PARSER_MEDIA_TYPE)===-1?os:A.PARSER_MEDIA_TYPE,Ye=Ct==="application/xhtml+xml"?oo:xi,ge=ht(A,"ALLOWED_TAGS")&&Xt(A.ALLOWED_TAGS)?$e({},A.ALLOWED_TAGS,Ye):He,k=ht(A,"ALLOWED_ATTR")&&Xt(A.ALLOWED_ATTR)?$e({},A.ALLOWED_ATTR,Ye):L,Bs=ht(A,"ALLOWED_NAMESPACES")&&Xt(A.ALLOWED_NAMESPACES)?$e({},A.ALLOWED_NAMESPACES,oo):An,Ps=ht(A,"ADD_URI_SAFE_ATTR")&&Xt(A.ADD_URI_SAFE_ATTR)?$e(qt(nn),A.ADD_URI_SAFE_ATTR,Ye):nn,pt=ht(A,"ADD_DATA_URI_TAGS")&&Xt(A.ADD_DATA_URI_TAGS)?$e(qt(ls),A.ADD_DATA_URI_TAGS,Ye):ls,Ve=ht(A,"FORBID_CONTENTS")&&Xt(A.FORBID_CONTENTS)?$e({},A.FORBID_CONTENTS,Ye):Pe,ee=ht(A,"FORBID_TAGS")&&Xt(A.FORBID_TAGS)?$e({},A.FORBID_TAGS,Ye):qt({}),Z=ht(A,"FORBID_ATTR")&&Xt(A.FORBID_ATTR)?$e({},A.FORBID_ATTR,Ye):qt({}),Re=ht(A,"USE_PROFILES")?A.USE_PROFILES&&typeof A.USE_PROFILES=="object"?qt(A.USE_PROFILES):A.USE_PROFILES:!1,ue=A.ALLOW_ARIA_ATTR!==!1,oe=A.ALLOW_DATA_ATTR!==!1,le=A.ALLOW_UNKNOWN_PROTOCOLS||!1,te=A.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ne=A.SAFE_FOR_TEMPLATES||!1,fe=A.SAFE_FOR_XML!==!1,ve=A.WHOLE_DOCUMENT||!1,Le=A.RETURN_DOM||!1,De=A.RETURN_DOM_FRAGMENT||!1,Be=A.RETURN_TRUSTED_TYPE||!1,Oe=A.FORCE_BODY||!1,qe=A.SANITIZE_DOM!==!1,ct=A.SANITIZE_NAMED_PROPS||!1,xe=A.KEEP_CONTENT!==!1,Ce=A.IN_PLACE||!1,ye=Pw(A.ALLOWED_URI_REGEXP)?A.ALLOWED_URI_REGEXP:Xu,Yt=typeof A.NAMESPACE=="string"?A.NAMESPACE:Mt,Us=ht(A,"MATHML_TEXT_INTEGRATION_POINTS")&&A.MATHML_TEXT_INTEGRATION_POINTS&&typeof A.MATHML_TEXT_INTEGRATION_POINTS=="object"?qt(A.MATHML_TEXT_INTEGRATION_POINTS):$e({},["mi","mo","mn","ms","mtext"]),zt=ht(A,"HTML_INTEGRATION_POINTS")&&A.HTML_INTEGRATION_POINTS&&typeof A.HTML_INTEGRATION_POINTS=="object"?qt(A.HTML_INTEGRATION_POINTS):$e({},["annotation-xml"]);const W=ht(A,"CUSTOM_ELEMENT_HANDLING")&&A.CUSTOM_ELEMENT_HANDLING&&typeof A.CUSTOM_ELEMENT_HANDLING=="object"?qt(A.CUSTOM_ELEMENT_HANDLING):Ra(null);if($=Ra(null),ht(W,"tagNameCheck")&&re(W.tagNameCheck)&&($.tagNameCheck=W.tagNameCheck),ht(W,"attributeNameCheck")&&re(W.attributeNameCheck)&&($.attributeNameCheck=W.attributeNameCheck),ht(W,"allowCustomizedBuiltInElements")&&typeof W.allowCustomizedBuiltInElements=="boolean"&&($.allowCustomizedBuiltInElements=W.allowCustomizedBuiltInElements),ne&&(oe=!1),De&&(Le=!0),Re&&(ge=$e({},Ju),k=Ra(null),Re.html===!0&&($e(ge,Zu),$e(k,Yu)),Re.svg===!0&&($e(ge,co),$e(k,po),$e(k,Sl)),Re.svgFilters===!0&&($e(ge,uo),$e(k,po),$e(k,Sl)),Re.mathMl===!0&&($e(ge,fo),$e(k,Qu),$e(k,Sl))),X.tagCheck=null,X.attributeCheck=null,ht(A,"ADD_TAGS")&&(typeof A.ADD_TAGS=="function"?X.tagCheck=A.ADD_TAGS:Xt(A.ADD_TAGS)&&(ge===He&&(ge=qt(ge)),$e(ge,A.ADD_TAGS,Ye))),ht(A,"ADD_ATTR")&&(typeof A.ADD_ATTR=="function"?X.attributeCheck=A.ADD_ATTR:Xt(A.ADD_ATTR)&&(k===L&&(k=qt(k)),$e(k,A.ADD_ATTR,Ye))),ht(A,"ADD_URI_SAFE_ATTR")&&Xt(A.ADD_URI_SAFE_ATTR)&&$e(Ps,A.ADD_URI_SAFE_ATTR,Ye),ht(A,"FORBID_CONTENTS")&&Xt(A.FORBID_CONTENTS)&&(Ve===Pe&&(Ve=qt(Ve)),$e(Ve,A.FORBID_CONTENTS,Ye)),ht(A,"ADD_FORBID_CONTENTS")&&Xt(A.ADD_FORBID_CONTENTS)&&(Ve===Pe&&(Ve=qt(Ve)),$e(Ve,A.ADD_FORBID_CONTENTS,Ye)),xe&&(ge["#text"]=!0),ve&&$e(ge,["html","head","body"]),ge.table&&($e(ge,["tbody"]),delete ee.tbody),A.TRUSTED_TYPES_POLICY){if(typeof A.TRUSTED_TYPES_POLICY.createHTML!="function")throw Kn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof A.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Kn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const v=g;g=A.TRUSTED_TYPES_POLICY;try{w=P("")}catch(D){throw g=v,D}}else A.TRUSTED_TYPES_POLICY===null?(g=void 0,w=""):(g===void 0&&(g=j()),g&&typeof w=="string"&&(w=P("")));(ke.uponSanitizeElement.length>0||ke.uponSanitizeAttribute.length>0)&&ge===He&&(ge=qt(ge)),ke.uponSanitizeAttribute.length>0&&k===L&&(k=qt(k)),is&&is(A),gs=A},Ze=$e({},[...co,...uo,...Fw]),lt=$e({},[...fo,...$w]),Ot=function(A){let W=I(A);(!W||!W.tagName)&&(W={namespaceURI:Yt,tagName:"template"});const v=xi(A.tagName),D=xi(W.tagName);return Bs[A.namespaceURI]?A.namespaceURI===Fs?W.namespaceURI===Mt?v==="svg":W.namespaceURI===Ss?v==="svg"&&(D==="annotation-xml"||Us[D]):!!Ze[v]:A.namespaceURI===Ss?W.namespaceURI===Mt?v==="math":W.namespaceURI===Fs?v==="math"&&zt[D]:!!lt[v]:A.namespaceURI===Mt?W.namespaceURI===Fs&&!zt[D]||W.namespaceURI===Ss&&!Us[D]?!1:!lt[v]&&(Vn[v]||!Ze[v]):!!(Ct==="application/xhtml+xml"&&Bs[A.namespaceURI]):!1},Pt=function(A){Sa(t.removed,{element:A});try{I(A).removeChild(A)}catch{if(b(A),!I(A))throw Kn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},ma=function(A){const W=E?E(A):A.childNodes;if(W){const D=[];on(W,B=>{Sa(D,B)}),on(D,B=>{try{b(B)}catch{}})}const v=m?m(A):null;if(v)for(let D=v.length-1;D>=0;--D){const B=v[D],ae=B&&B.name;if(typeof ae=="string")try{A.removeAttribute(ae)}catch{}}},Ts=function(A,W){try{Sa(t.removed,{attribute:W.getAttributeNode(A),from:W})}catch{Sa(t.removed,{attribute:null,from:W})}if(W.removeAttribute(A),A==="is")if(Le||De)try{Pt(W)}catch{}else try{W.setAttribute(A,"")}catch{}},ga=function(A){const W=m?m(A):A.attributes;if(W)for(let v=W.length-1;v>=0;--v){const D=W[v],B=D&&D.name;if(!(typeof B!="string"||k[Ye(B)]))try{A.removeAttribute(B)}catch{}}},ni=function(A){const W=[A];for(;W.length>0;){const v=W.pop();(_?_(v):v.nodeType)===Ks.element&&ga(v);const B=E?E(v):v.childNodes;if(B)for(let ae=B.length-1;ae>=0;--ae)W.push(B[ae])}},va=function(A){let W=null,v=null;if(Oe)A="<remove></remove>"+A;else{const ae=qu(A,/^[\r\n\t ]+/);v=ae&&ae[0]}Ct==="application/xhtml+xml"&&Yt===Mt&&(A='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+A+"</body></html>");const D=g?P(A):A;if(Yt===Mt)try{W=new d().parseFromString(D,Ct)}catch{}if(!W||!W.documentElement){W=U.createDocument(Yt,"template",null);try{W.documentElement.innerHTML=$s?w:D}catch{}}const B=W.body||W.documentElement;return A&&v&&B.insertBefore(s.createTextNode(v),B.childNodes[0]||null),Yt===Mt?Y.call(W,ve?"html":"body")[0]:ve?W.documentElement:B},ba=function(A){return O.call(A.ownerDocument||A,A,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Gs=function(A){var W,v;A.normalize();const D=O.call(A.ownerDocument||A,A,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let B=D.nextNode();for(;B;){let Ne=B.data;on([ie,he,F],Ue=>{Ne=Ta(Ne,Ue," ")}),B.data=Ne,B=D.nextNode()}const ae=(W=(v=A.querySelectorAll)===null||v===void 0?void 0:v.call(A,"template"))!==null&&W!==void 0?W:[];on(Array.from(ae),Ne=>{pe(Ne.content)&&Gs(Ne.content)})},z=function(A){const W=S?S(A):null;return typeof W!="string"||Ye(W)!=="form"?!1:typeof A.nodeName!="string"||typeof A.textContent!="string"||typeof A.removeChild!="function"||A.attributes!==m(A)||typeof A.removeAttribute!="function"||typeof A.setAttribute!="function"||typeof A.namespaceURI!="string"||typeof A.insertBefore!="function"||typeof A.hasChildNodes!="function"||A.nodeType!==_(A)||A.childNodes!==E(A)},pe=function(A){if(!_||typeof A!="object"||A===null)return!1;try{return _(A)===Ks.documentFragment}catch{return!1}},_e=function(A){if(!_||typeof A!="object"||A===null)return!1;try{return typeof _(A)=="number"}catch{return!1}};function Nt(me,A,W){on(me,v=>{v.call(t,A,W,gs)})}const Cs=function(A){let W=null;if(Nt(ke.beforeSanitizeElements,A,null),z(A))return Pt(A),!0;const v=Ye(S?S(A):A.nodeName);if(Nt(ke.uponSanitizeElement,A,{tagName:v,allowedTags:ge}),fe&&A.hasChildNodes()&&!_e(A.firstElementChild)&&Ft(/<[/\w!]/g,A.innerHTML)&&Ft(/<[/\w!]/g,A.textContent)||fe&&A.namespaceURI===Mt&&v==="style"&&_e(A.firstElementChild)||A.nodeType===Ks.progressingInstruction||fe&&A.nodeType===Ks.comment&&Ft(/<[/\w]/g,A.data))return Pt(A),!0;if(ee[v]||!(X.tagCheck instanceof Function&&X.tagCheck(v))&&!ge[v]){if(!ee[v]&&ai(v)&&($.tagNameCheck instanceof RegExp&&Ft($.tagNameCheck,v)||$.tagNameCheck instanceof Function&&$.tagNameCheck(v)))return!1;if(xe&&!Ve[v]){const B=I(A),ae=E(A);if(ae&&B){const Ne=ae.length;for(let Ue=Ne-1;Ue>=0;--Ue){const et=Ce?ae[Ue]:p(ae[Ue],!0);B.insertBefore(et,y(A))}}}return Pt(A),!0}return(_?_(A):A.nodeType)===Ks.element&&!Ot(A)||(v==="noscript"||v==="noembed"||v==="noframes")&&Ft(/<\/no(script|embed|frames)/i,A.innerHTML)?(Pt(A),!0):(ne&&A.nodeType===Ks.text&&(W=A.textContent,on([ie,he,F],B=>{W=Ta(W,B," ")}),A.textContent!==W&&(Sa(t.removed,{element:A.cloneNode()}),A.textContent=W)),Nt(ke.afterSanitizeElements,A,null),!1)},jn=function(A,W,v){if(Z[W]||qe&&(W==="id"||W==="name")&&(v in s||v in q))return!1;const D=k[W]||X.attributeCheck instanceof Function&&X.attributeCheck(W,A);if(!(oe&&!Z[W]&&Ft(se,W))){if(!(ue&&Ft(Se,W))){if(!D||Z[W]){if(!(ai(A)&&($.tagNameCheck instanceof RegExp&&Ft($.tagNameCheck,A)||$.tagNameCheck instanceof Function&&$.tagNameCheck(A))&&($.attributeNameCheck instanceof RegExp&&Ft($.attributeNameCheck,W)||$.attributeNameCheck instanceof Function&&$.attributeNameCheck(W,A))||W==="is"&&$.allowCustomizedBuiltInElements&&($.tagNameCheck instanceof RegExp&&Ft($.tagNameCheck,v)||$.tagNameCheck instanceof Function&&$.tagNameCheck(v))))return!1}else if(!Ps[W]){if(!Ft(ye,Ta(v,de,""))){if(!((W==="src"||W==="xlink:href"||W==="href")&&A!=="script"&&Gu(v,"data:")===0&&pt[A])){if(!(le&&!Ft(V,Ta(v,de,"")))){if(v)return!1}}}}}}return!0},Br=$e({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),ai=function(A){return!Br[xi(A)]&&Ft(ce,A)},rl=function(A){Nt(ke.beforeSanitizeAttributes,A,null);const W=A.attributes;if(!W||z(A))return;const v={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:k,forceKeepAttr:void 0};let D=W.length;for(;D--;){const B=W[D],ae=B.name,Ne=B.namespaceURI,Ue=B.value,et=Ye(ae),Vt=Ue;let vt=ae==="value"?Vt:Iw(Vt);if(v.attrName=et,v.attrValue=vt,v.keepAttr=!0,v.forceKeepAttr=void 0,Nt(ke.uponSanitizeAttribute,A,v),vt=v.attrValue,ct&&(et==="id"||et==="name")&&Gu(vt,K)!==0&&(Ts(ae,A),vt=K+vt),fe&&Ft(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,vt)){Ts(ae,A);continue}if(et==="attributename"&&qu(vt,"href")){Ts(ae,A);continue}if(v.forceKeepAttr)continue;if(!v.keepAttr){Ts(ae,A);continue}if(!te&&Ft(/\/>/i,vt)){Ts(ae,A);continue}ne&&on([ie,he,F],id=>{vt=Ta(vt,id," ")});const li=Ye(A.nodeName);if(!jn(li,et,vt)){Ts(ae,A);continue}if(g&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Ne)switch(u.getAttributeType(li,et)){case"TrustedHTML":{vt=P(vt);break}case"TrustedScriptURL":{vt=R(vt);break}}if(vt!==Vt)try{Ne?A.setAttributeNS(Ne,ae,vt):A.setAttribute(ae,vt),z(A)?Pt(A):ju(t.removed)}catch{Ts(ae,A)}}Nt(ke.afterSanitizeAttributes,A,null)},ya=function(A){let W=null;const v=ba(A);for(Nt(ke.beforeSanitizeShadowDOM,A,null);W=v.nextNode();)if(Nt(ke.uponSanitizeShadowNode,W,null),Cs(W),rl(W),pe(W.content)&&ya(W.content),(_?_(W):W.nodeType)===Ks.element){const B=x?x(W):W.shadowRoot;pe(B)&&(ii(B),ya(B))}Nt(ke.afterSanitizeShadowDOM,A,null)},ii=function(A){const W=[{node:A,shadow:null}];for(;W.length>0;){const v=W.pop();if(v.shadow){ya(v.shadow);continue}const D=v.node,ae=(_?_(D):D.nodeType)===Ks.element,Ne=E?E(D):D.childNodes;if(Ne)for(let Ue=Ne.length-1;Ue>=0;--Ue)W.push({node:Ne[Ue],shadow:null});if(ae){const Ue=S?S(D):null;if(typeof Ue=="string"&&Ye(Ue)==="template"){const et=D.content;pe(et)&&W.push({node:et,shadow:null})}}if(ae){const Ue=x?x(D):D.shadowRoot;pe(Ue)&&W.push({node:null,shadow:Ue},{node:Ue,shadow:null})}}};return t.sanitize=function(me){let A=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},W=null,v=null,D=null,B=null;if($s=!me,$s&&(me="<!-->"),typeof me!="string"&&!_e(me)&&(me=Mw(me),typeof me!="string"))throw Kn("dirty is not a string, aborting");if(!t.isSupported)return me;Te||Ee(A),t.removed=[];const ae=Ce&&typeof me!="string"&&_e(me);if(ae){const et=S?S(me):me.nodeName;if(typeof et=="string"){const Vt=Ye(et);if(!ge[Vt]||ee[Vt])throw Kn("root node is forbidden and cannot be sanitized in-place")}if(z(me))throw Kn("root node is clobbered and cannot be sanitized in-place");try{ii(me)}catch(Vt){throw ma(me),Vt}}else if(_e(me))W=va("<!---->"),v=W.ownerDocument.importNode(me,!0),v.nodeType===Ks.element&&v.nodeName==="BODY"||v.nodeName==="HTML"?W=v:W.appendChild(v),ii(v);else{if(!Le&&!ne&&!ve&&me.indexOf("<")===-1)return g&&Be?P(me):me;if(W=va(me),!W)return Le?null:Be?w:""}W&&Oe&&Pt(W.firstChild);const Ne=ba(ae?me:W);try{for(;D=Ne.nextNode();)Cs(D),rl(D),pe(D.content)&&ya(D.content)}catch(et){throw ae&&ma(me),et}if(ae)return on(t.removed,et=>{et.element&&ni(et.element)}),ne&&Gs(me),me;if(Le){if(ne&&Gs(W),De)for(B=N.call(W.ownerDocument);W.firstChild;)B.appendChild(W.firstChild);else B=W;return(k.shadowroot||k.shadowrootmode)&&(B=we.call(n,B,!0)),B}let Ue=ve?W.outerHTML:W.innerHTML;return ve&&ge["!doctype"]&&W.ownerDocument&&W.ownerDocument.doctype&&W.ownerDocument.doctype.name&&Ft(Gw,W.ownerDocument.doctype.name)&&(Ue="<!DOCTYPE "+W.ownerDocument.doctype.name+`>
`+Ue),ne&&on([ie,he,F],et=>{Ue=Ta(Ue,et," ")}),g&&Be?P(Ue):Ue},t.setConfig=function(){let me=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ee(me),Te=!0},t.clearConfig=function(){gs=null,Te=!1,g=T,w=""},t.isValidAttribute=function(me,A,W){gs||Ee({});const v=Ye(me),D=Ye(A);return jn(v,D,W)},t.addHook=function(me,A){typeof A=="function"&&Sa(ke[me],A)},t.removeHook=function(me,A){if(A!==void 0){const W=Aw(ke[me],A);return W===-1?void 0:Rw(ke[me],W,1)[0]}return ju(ke[me])},t.removeHooks=function(me){ke[me]=[]},t.removeAllHooks=function(){ke=ef()},t}var tf=Lm();function Jc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ha=Jc();function Dm(e){ha=e}var Ii={exec:()=>null};function at(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ss.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ss={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Jw=/^(?:[ \t]*(?:\n|$))+/,Yw=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Qw=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,ll=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Xw=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Yc=/(?:[*+-]|\d{1,9}[.)])/,Mm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Pm=at(Mm).replace(/bull/g,Yc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),eS=at(Mm).replace(/bull/g,Yc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Qc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,tS=/^[^\n]+/,Xc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,sS=at(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Xc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),nS=at(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Yc).getRegex(),Fr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",ed=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,aS=at("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",ed).replace("tag",Fr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Fm=at(Qc).replace("hr",ll).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Fr).getRegex(),iS=at(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Fm).getRegex(),td={blockquote:iS,code:Yw,def:sS,fences:Qw,heading:Xw,hr:ll,html:aS,lheading:Pm,list:nS,newline:Jw,paragraph:Fm,table:Ii,text:tS},sf=at("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",ll).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Fr).getRegex(),lS={...td,lheading:eS,table:sf,paragraph:at(Qc).replace("hr",ll).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",sf).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Fr).getRegex()},rS={...td,html:at(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",ed).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Ii,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:at(Qc).replace("hr",ll).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Pm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},oS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,cS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,$m=/^( {2,}|\\)\n(?!\s*$)/,dS=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,$r=/[\p{P}\p{S}]/u,sd=/[\s\p{P}\p{S}]/u,Bm=/[^\s\p{P}\p{S}]/u,uS=at(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,sd).getRegex(),Um=/(?!~)[\p{P}\p{S}]/u,fS=/(?!~)[\s\p{P}\p{S}]/u,pS=/(?:[^\s\p{P}\p{S}]|~)/u,hS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Hm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,mS=at(Hm,"u").replace(/punct/g,$r).getRegex(),gS=at(Hm,"u").replace(/punct/g,Um).getRegex(),zm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",vS=at(zm,"gu").replace(/notPunctSpace/g,Bm).replace(/punctSpace/g,sd).replace(/punct/g,$r).getRegex(),bS=at(zm,"gu").replace(/notPunctSpace/g,pS).replace(/punctSpace/g,fS).replace(/punct/g,Um).getRegex(),yS=at("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Bm).replace(/punctSpace/g,sd).replace(/punct/g,$r).getRegex(),xS=at(/\\(punct)/,"gu").replace(/punct/g,$r).getRegex(),_S=at(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),kS=at(ed).replace("(?:-->|$)","-->").getRegex(),wS=at("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",kS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),lr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,SS=at(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",lr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Vm=at(/^!?\[(label)\]\[(ref)\]/).replace("label",lr).replace("ref",Xc).getRegex(),jm=at(/^!?\[(ref)\](?:\[\])?/).replace("ref",Xc).getRegex(),TS=at("reflink|nolink(?!\\()","g").replace("reflink",Vm).replace("nolink",jm).getRegex(),nd={_backpedal:Ii,anyPunctuation:xS,autolink:_S,blockSkip:hS,br:$m,code:cS,del:Ii,emStrongLDelim:mS,emStrongRDelimAst:vS,emStrongRDelimUnd:yS,escape:oS,link:SS,nolink:jm,punctuation:uS,reflink:Vm,reflinkSearch:TS,tag:wS,text:dS,url:Ii},CS={...nd,link:at(/^!?\[(label)\]\((.*?)\)/).replace("label",lr).getRegex(),reflink:at(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",lr).getRegex()},Ko={...nd,emStrongRDelimAst:bS,emStrongLDelim:gS,url:at(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},ES={...Ko,br:at($m).replace("{2,}","*").getRegex(),text:at(Ko.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Tl={normal:td,gfm:lS,pedantic:rS},hi={normal:nd,gfm:Ko,breaks:ES,pedantic:CS},AS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},nf=e=>AS[e];function Js(e,t){if(t){if(ss.escapeTest.test(e))return e.replace(ss.escapeReplace,nf)}else if(ss.escapeTestNoEncode.test(e))return e.replace(ss.escapeReplaceNoEncode,nf);return e}function af(e){try{e=encodeURI(e).replace(ss.percentDecode,"%")}catch{return null}return e}function lf(e,t){var i;const s=e.replace(ss.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ss.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ss.slashPipe,"|");return n}function mi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function RS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function rf(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function IS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var rr=class{constructor(e){rt(this,"options");rt(this,"rules");rt(this,"lexer");this.options=e||ha}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:mi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=IS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=mi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:mi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=mi(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),f=e.split(`
`,1)[0],p=!u.trim(),b=0;if(this.options.pedantic?(b=2,d=u.trimStart()):p?b=t[1].length+1:(b=t[2].search(this.rules.other.nonSpaceChar),b=b>4?1:b,d=u.slice(b),b+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const I=this.rules.other.nextBulletRegex(b),x=this.rules.other.hrRegex(b),m=this.rules.other.fencesBeginRegex(b),_=this.rules.other.headingBeginRegex(b),S=this.rules.other.htmlBeginRegex(b);for(;e;){const g=e.split(`
`,1)[0];let w;if(f=g,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),w=f):w=f.replace(this.rules.other.tabCharGlobal,"    "),m.test(f)||_.test(f)||S.test(f)||I.test(f)||x.test(f))break;if(w.search(this.rules.other.nonSpaceChar)>=b||!f.trim())d+=`
`+w.slice(b);else{if(p||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||_.test(u)||x.test(u))break;d+=`
`+f}!p&&!f.trim()&&(p=!0),c+=g+`
`,e=e.substring(g.length+1),u=w.slice(b)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let y=null,E;this.options.gfm&&(y=this.rules.other.listIsTask.exec(d),y&&(E=y[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!y,checked:E,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=lf(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(lf(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=mi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=RS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),rf(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return rf(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,f=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const b=f.slice(1,-1);return{type:"em",raw:f,text:b,tokens:this.lexer.inlineTokens(b)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},gn=class Wo{constructor(t){rt(this,"tokens");rt(this,"options");rt(this,"state");rt(this,"tokenizer");rt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ha,this.options.tokenizer=this.options.tokenizer||new rr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ss,block:Tl.normal,inline:hi.normal};this.options.pedantic?(s.block=Tl.pedantic,s.inline=hi.pedantic):this.options.gfm&&(s.block=Tl.gfm,this.options.breaks?s.inline=hi.breaks:s.inline=hi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Tl,inline:hi}}static lex(t,s){return new Wo(s).lex(t)}static lexInline(t,s){return new Wo(s).inlineTokens(t)}lex(t){t=t.replace(ss.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ss.tabCharGlobal,"    ").replace(ss.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(f=>{u=f.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(d=f.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const f=s.at(-1);d.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let b;this.options.extensions.startInline.forEach(y=>{b=y.call({lexer:this},p),typeof b=="number"&&b>=0&&(f=Math.min(f,b))}),f<1/0&&f>=0&&(u=t.substring(0,f+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},or=class{constructor(e){rt(this,"options");rt(this,"parser");this.options=e||ha}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ss.notSpaceStart))==null?void 0:i[0],a=e.replace(ss.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Js(n)+'">'+(s?a:Js(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Js(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Js(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=af(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Js(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=af(e);if(a===null)return Js(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Js(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Js(e.text)}},ad=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},vn=class Zo{constructor(t){rt(this,"options");rt(this,"renderer");rt(this,"textRenderer");this.options=t||ha,this.options.renderer=this.options.renderer||new or,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new ad}static parse(t,s){return new Zo(s).parse(t)}static parseInline(t,s){return new Zo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},ho,Nl=(ho=class{constructor(e){rt(this,"options");rt(this,"block");this.options=e||ha}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?gn.lex:gn.lexInline}provideParser(){return this.block?vn.parse:vn.parseInline}},rt(ho,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),ho),OS=class{constructor(...e){rt(this,"defaults",Jc());rt(this,"options",this.setOptions);rt(this,"parse",this.parseMarkdown(!0));rt(this,"parseInline",this.parseMarkdown(!1));rt(this,"Parser",vn);rt(this,"Renderer",or);rt(this,"TextRenderer",ad);rt(this,"Lexer",gn);rt(this,"Tokenizer",rr);rt(this,"Hooks",Nl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new or(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new rr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Nl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Nl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return gn.lex(e,t??this.defaults)}parser(e,t){return vn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?gn.lex:gn.lexInline,o=i.hooks?i.hooks.provideParser():e?vn.parse:vn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Js(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},oa=new OS;function st(e,t){return oa.parse(e,t)}st.options=st.setOptions=function(e){return oa.setOptions(e),st.defaults=oa.defaults,Dm(st.defaults),st};st.getDefaults=Jc;st.defaults=ha;st.use=function(...e){return oa.use(...e),st.defaults=oa.defaults,Dm(st.defaults),st};st.walkTokens=function(e,t){return oa.walkTokens(e,t)};st.parseInline=oa.parseInline;st.Parser=vn;st.parser=vn.parse;st.Renderer=or;st.TextRenderer=ad;st.Lexer=gn;st.lexer=gn.lex;st.Tokenizer=rr;st.Hooks=Nl;st.parse=st;st.options;st.setOptions;st.use;st.walkTokens;st.parseInline;vn.parse;gn.lex;const NS={breaks:!0,gfm:!0};function of(e){if(!e)return"";try{if(typeof st<"u"&&st.parse){const t=st.parse(e,NS);return typeof tf<"u"?tf.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function LS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const DS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function MS(e){return DS[e]||"wrench"}const PS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function cf(e){if(!e)return[];const t=e.match(PS);return t?[...new Set(t)]:[]}const FS={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=J(()=>t.value.trim().length>0&&!s.value),u=h(Ke.state||"disconnected");let f=null,p=null;const b=J(()=>{const U=u.value;return U==="connected"?"Connected":U==="reconnecting"?"Reconnecting…":U==="connecting"?"Connecting…":"REST fallback"}),y=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],E=J(()=>{const U=Math.floor(i.value/4)%y.length,O=i.value;return O>3?`${y[U]} (${O}s)`:y[0]});function I(){Rt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function x(){if(!a.value)return;const U=a.value;U.style.height="auto",U.style.height=Math.min(U.scrollHeight,120)+"px"}function m(U,O,N={}){const Y={id:++o,role:U,content:O,timestamp:Date.now(),html:U==="bot"?of(O):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:U==="bot"?cf(O):[],files:N.files||[],_showTools:!1};return e.value.push(Y),I(),U==="bot"&&Rt(()=>_()),Y}function _(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const Y=O.querySelector("code"),we=Y?Y.textContent:O.textContent;navigator.clipboard.writeText(we).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(N)})}function S(U){if(U===0)return!0;const O=e.value[U-1],N=e.value[U],Y=new Date(O.timestamp).toDateString(),we=new Date(N.timestamp).toDateString();return Y!==we}function g(U){const O=new Date(U),N=new Date;if(O.toDateString()===N.toDateString())return"Today";const Y=new Date(N);return Y.setDate(Y.getDate()-1),O.toDateString()===Y.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function w(U){t.value=U,Rt(()=>j())}function T(U){window.open(U,"_blank","noopener")}function C(U){U.target.style.display="none"}function M(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function H(){r&&(clearInterval(r),r=null),i.value=0}function P(U){s.value&&(s.value=!1,H(),U.type==="chat_response"?m("bot",U.content,{tools_used:U.tools_used||[],is_error:U.is_error||!1,files:U.files||[]}):U.type==="chat_error"&&m("bot",U.error||"Unknown error",{is_error:!0}),Rt(()=>{var O;return(O=a.value)==null?void 0:O.focus()}))}async function R(U){try{const O=await G.post("/api/chat",{content:U,channel_id:l.value});m("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){m("bot",O.message||"Failed to send message",{is_error:!0})}}async function j(){const U=t.value.trim();if(!U||s.value)return;m("user",U),t.value="",s.value=!0,M(),a.value&&(a.value.style.height="auto"),Ke.connected&&Ke.sendChat(U,{channelId:l.value})||(await R(U),s.value=!1,H()),Rt(()=>{var N;return(N=a.value)==null?void 0:N.focus()})}async function Q(){try{if(!l.value){const O=await G.get("/api/auth/session");l.value=O.channel_id||O.user_id||"web-user"}const U=await G.get("/api/sessions/"+encodeURIComponent(l.value));if(U&&U.messages&&U.messages.length>0){for(const O of U.messages){const N=O.role==="user"?"user":"bot";let Y=O.content||"";if(N==="user"){const ke=Y.match(/^\[.*?\]:\s*/);ke&&(Y=Y.slice(ke[0].length))}if(!Y.trim())continue;const we={id:++o,role:N,content:Y,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:N==="bot"?of(Y):"",tools_used:[],is_error:!1,images:N==="bot"?cf(Y):[],files:[],_showTools:!1};e.value.push(we)}Rt(()=>{I(),_()})}}catch{}}return We(()=>{Ke.subscribe("chat",P),u.value=Ke.state||"disconnected",f=Ke.onStateChange,p=(U,O)=>{u.value=U,f&&f(U,O)},Ke.onStateChange=p,Q(),Rt(()=>{var U;return(U=a.value)==null?void 0:U.focus()})}),xt(()=>{Ke.unsubscribe("chat",P),Ke.onStateChange===p&&(Ke.onStateChange=f),H()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:b,typingText:E,suggestions:c,send:j,autoResize:x,formatTime:LS,formatDate:g,showDateSeparator:S,useSuggestion:w,openImage:T,onImageError:C,getToolIcon:MS}}},$S={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),f=h(!1),p=h(!1),b=J(()=>e.value==="custom"),y=J(()=>[...i.value,...l.value]),E=J(()=>l.value.includes(e.value)),I=J(()=>{var T;return b.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),x=J(()=>{var T;return b.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),m=J(()=>{var T;return b.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function _(){d.value=!0;try{const T=await G.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function g(){const T=u.value.trim();if(T){p.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:T,display_name:I.value,identity:x.value,voice:m.value}),f.value=!1,u.value="",await _(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{p.value=!1}}}async function w(){if(await _s({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(C){c.value=C.message}}}return We(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:y,isCustom:b,isUserPreset:E,previewName:I,previewIdentity:x,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:f,newPresetName:u,savingPreset:p,saveAsPreset:g,deletePreset:w,builtinPresets:i,userPresets:l}},template:`
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
  `},_t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),qm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:yw,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:FS,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:uk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:bk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ek,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:$S,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:fw,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:_t("/operations","live")},{path:"/agents",redirect:_t("/operations","agents")},{path:"/loops",redirect:_t("/operations","loops")},{path:"/processes",redirect:_t("/operations","processes")},{path:"/schedules",redirect:_t("/operations","schedules")},{path:"/audit",redirect:_t("/history","audit")},{path:"/sessions",redirect:_t("/history","sessions")},{path:"/traces",redirect:_t("/history","traces")},{path:"/usage",redirect:_t("/history","usage")},{path:"/tools",redirect:_t("/capabilities","tools")},{path:"/skills",redirect:_t("/capabilities","skills")},{path:"/knowledge",redirect:_t("/capabilities","knowledge")},{path:"/memory",redirect:_t("/capabilities","memory")},{path:"/learned",redirect:_t("/capabilities","learned")},{path:"/health",redirect:_t("/system","health")},{path:"/resources",redirect:_t("/system","resources")},{path:"/logs",redirect:_t("/system","logs")},{path:"/config",redirect:_t("/system","config")},{path:"/host-access",redirect:_t("/system","host-access")},{path:"/internals",redirect:_t("/system","internals")}],Oi=J_({history:A_(),routes:qm});Oi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const BS={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},US={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),f=h(null);let p=null;const b=h("starting"),y=h(""),E=qm.filter(O=>O.meta),I=J(()=>["Workspace","Operate","Observe","Manage"].map(O=>({name:O,routes:E.filter(N=>N.meta.section===O)})).filter(O=>O.routes.length)),x=J(()=>{var O;return((O=Oi.currentRoute.value.meta)==null?void 0:O.label)||"Odin"}),m=J(()=>{var O;return((O=Oi.currentRoute.value.meta)==null?void 0:O.section)||"Management"}),_=J(()=>{var O;return((O=Oi.currentRoute.value.meta)==null?void 0:O.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,Ke.disconnect(),G.setToken(""),e.value="login"};function S(O){var N;if((O.ctrlKey||O.metaKey)&&O.key.toLowerCase()==="k"){e.value==="ready"&&(O.preventDefault(),Uu());return}if(n.value&&O.key==="Tab"){const Y=[...((N=a.value)==null?void 0:N.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(Y.length){const we=Y[0],ke=Y[Y.length-1];if(O.shiftKey&&(document.activeElement===we||!a.value.contains(document.activeElement))){O.preventDefault(),ke.focus();return}if(!O.shiftKey&&(document.activeElement===ke||!a.value.contains(document.activeElement))){O.preventDefault(),we.focus();return}}}if(O.key==="Escape"&&n.value){n.value=!1,O.preventDefault();return}if(O.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(O.target.tagName)){O.preventDefault();const Y=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');Y&&Y.focus()}}function g(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}We(async()=>{document.addEventListener("keydown",S),r=window.matchMedia("(max-width: 900px)"),g(),r.addEventListener("change",g);const O=await G.check();O.ok?(e.value="ready",Q()):O.needsAuth?e.value="login":(e.value="ready",Q())});function w(){t.value=!1,e.value="ready",Q()}async function T(){await G.logout(),Ke.disconnect(),e.value="login"}function C(){s.value=!s.value}function M(){n.value=!n.value}ns(n,async O=>{var N,Y;if(O)o=document.activeElement,await Rt(),(Y=(N=a.value)==null?void 0:N.querySelector(".nav-item"))==null||Y.focus();else if(o!=null&&o.isConnected){const we=o;o=null,requestAnimationFrame(()=>we.focus())}});const H=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(O,N="info",Y=3e3){f.value={text:O,level:N},clearTimeout(p),p=setTimeout(()=>{f.value=null},Y)}let R=null,j=!1;function Q(){Ke.onStatusChange=O=>{c.value=O},Ke.onLatency=O=>{u.value=O},Ke.onStateChange=(O,N)=>{d.value=O,O==="connected"?(j&&P("Connection restored","success"),j=!0):O==="reconnecting"&&N.attempt===1&&P("Connection lost — reconnecting…","warn")},Ke.connect(),U(),R&&clearInterval(R),R=setInterval(U,15e3)}async function U(){try{const O=await G.get("/api/status");b.value=O.status==="online"?"online":"starting";const N=O.uptime_seconds||0,Y=Math.floor(N/3600),we=Math.floor(N%3600/60);y.value=`${Y}h ${we}m uptime`}catch{b.value="offline",y.value=""}}return xt(()=>{R&&clearInterval(R),Ke.disconnect(),document.removeEventListener("keydown",S),r==null||r.removeEventListener("change",g)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:H,wsToast:f,botStatus:b,botUptime:y,navRoutes:E,navGroups:I,currentPage:x,currentSection:m,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:w,logout:T,toggleSidebar:C,toggleMobileNavigation:M,openPalette:Uu}}},zn=Jl(US);zn.component("odin-icon",gw);zn.component("login-screen",BS);zn.component("toast-container",z0);zn.component("confirm-host",V0);zn.component("command-palette",mw);zn.directive("modal-focus",bw);zn.use(Oi);zn.mount("#app");
