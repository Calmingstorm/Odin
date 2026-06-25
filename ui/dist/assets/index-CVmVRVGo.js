var bg=Object.defineProperty;var yg=(e,t,s)=>t in e?bg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var We=(e,t,s)=>yg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class xg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null){this._lastActivity=Date.now();const a={method:t,headers:this._headers()};n!==null&&(a.body=JSON.stringify(n));const i=await fetch(s,a);if(i.status===401)throw new ur("Unauthorized");const l=await i.json().catch(()=>null);if(!i.ok){const r=(l==null?void 0:l.error)||`HTTP ${i.status}`;throw new _g(r,i.status,l)}return l}get(t){return this._request("GET",t)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ur((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ur?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ur extends Error{constructor(t){super(t),this.name="AuthError"}}class _g extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class kg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error")for(const l of this._handlers.chat||[])l(a)},this._ws.onclose=()=>{this._ws=null,this._stopPing(),this._latency=-1,this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const K=new xg,qe=new kg(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function as(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Oe={},sa=[],It=()=>{},ea=()=>!1,Mn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Il=e=>e.startsWith("onUpdate:"),De=Object.assign,xo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},wg=Object.prototype.hasOwnProperty,He=(e,t)=>wg.call(e,t),fe=Array.isArray,na=e=>ka(e)==="[object Map]",Fn=e=>ka(e)==="[object Set]",jc=e=>ka(e)==="[object Date]",Sg=e=>ka(e)==="[object RegExp]",ke=e=>typeof e=="function",Se=e=>typeof e=="string",$t=e=>typeof e=="symbol",Ue=e=>e!==null&&typeof e=="object",_o=e=>(Ue(e)||ke(e))&&ke(e.then)&&ke(e.catch),$d=Object.prototype.toString,ka=e=>$d.call(e),Tg=e=>ka(e).slice(8,-1),Nl=e=>ka(e)==="[object Object]",Dl=e=>Se(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,qs=as(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Cg=as("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ol=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Eg=/-\w/g,Ge=Ol(e=>e.replace(Eg,t=>t.slice(1).toUpperCase())),Ag=/\B([A-Z])/g,Qt=Ol(e=>e.replace(Ag,"-$1").toLowerCase()),$n=Ol(e=>e.charAt(0).toUpperCase()+e.slice(1)),aa=Ol(e=>e?`on${$n(e)}`:""),kt=(e,t)=>!Object.is(e,t),ia=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Bd=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Ll=e=>{const t=parseFloat(e);return isNaN(t)?e:t},el=e=>{const t=Se(e)?Number(e):NaN;return isNaN(t)?e:t};let Vc;const Pl=()=>Vc||(Vc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Rg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Ig="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Ng=as(Ig);function vi(e){if(fe(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Se(n)?Ud(n):vi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Se(e)||Ue(e))return e}const Dg=/;(?![^(]*\))/g,Og=/:([^]+)/,Lg=/\/\*[^]*?\*\//g;function Ud(e){const t={};return e.replace(Lg,"").split(Dg).forEach(s=>{if(s){const n=s.split(Og);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function bi(e){let t="";if(Se(e))t=e;else if(fe(e))for(let s=0;s<e.length;s++){const n=bi(e[s]);n&&(t+=n+" ")}else if(Ue(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Pg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Se(t)&&(e.class=bi(t)),s&&(e.style=vi(s)),e}const Mg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Fg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",$g="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Bg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Ug=as(Mg),Hg=as(Fg),jg=as($g),Vg=as(Bg),qg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",zg=as(qg);function Hd(e){return!!e||e===""}function Gg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Ws(e[n],t[n]);return s}function Ws(e,t){if(e===t)return!0;let s=jc(e),n=jc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=$t(e),n=$t(t),s||n)return e===t;if(s=fe(e),n=fe(t),s||n)return s&&n?Gg(e,t):!1;if(s=Ue(e),n=Ue(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!Ws(e[l],t[l]))return!1}}return String(e)===String(t)}function Ml(e,t){return e.findIndex(s=>Ws(s,t))}const jd=e=>!!(e&&e.__v_isRef===!0),Vd=e=>Se(e)?e:e==null?"":fe(e)||Ue(e)&&(e.toString===$d||!ke(e.toString))?jd(e)?Vd(e.value):JSON.stringify(e,qd,2):String(e),qd=(e,t)=>jd(t)?qd(e,t.value):na(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[dr(n,i)+" =>"]=a,s),{})}:Fn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>dr(s))}:$t(t)?dr(t):Ue(t)&&!fe(t)&&!Nl(t)?String(t):t,dr=(e,t="")=>{var s;return $t(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Kg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let yt;class ko{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&yt&&(yt.active?(this.parent=yt,this.index=(yt.scopes||(yt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=yt;try{return yt=this,t()}finally{yt=s}}}on(){++this._on===1&&(this.prevScope=yt,yt=this)}off(){if(this._on>0&&--this._on===0){if(yt===this)yt=this.prevScope;else{let t=yt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Wg(e){return new ko(e)}function zd(){return yt}function Jg(e,t=!1){yt&&yt.cleanups.push(e)}let Ze;const fr=new WeakSet;class Za{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,yt&&(yt.active?yt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,fr.has(this)&&(fr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Kd(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,qc(this),Wd(this);const t=Ze,s=ms;Ze=this,ms=!0;try{return this.fn()}finally{Jd(this),Ze=t,ms=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)To(t);this.deps=this.depsTail=void 0,qc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?fr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Br(this)&&this.run()}get dirty(){return Br(this)}}let Gd=0,qa,za;function Kd(e,t=!1){if(e.flags|=8,t){e.next=za,za=e;return}e.next=qa,qa=e}function wo(){Gd++}function So(){if(--Gd>0)return;if(za){let t=za;for(za=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;qa;){let t=qa;for(qa=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Wd(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Jd(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),To(n),Yg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Br(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Yd(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Yd(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===ei)||(e.globalVersion=ei,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Br(e))))return;e.flags|=2;const t=e.dep,s=Ze,n=ms;Ze=e,ms=!0;try{Wd(e);const a=e.fn(e._value);(t.version===0||kt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{Ze=s,ms=n,Jd(e),e.flags&=-3}}function To(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)To(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Yg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Qg(e,t){e.effect instanceof Za&&(e=e.effect.fn);const s=new Za(e);t&&De(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Xg(e){e.effect.stop()}let ms=!0;const Qd=[];function Js(){Qd.push(ms),ms=!1}function Ys(){const e=Qd.pop();ms=e===void 0?!0:e}function qc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Ze;Ze=void 0;try{t()}finally{Ze=s}}}let ei=0;class Zg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Fl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Ze||!ms||Ze===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Ze)s=this.activeLink=new Zg(Ze,this),Ze.deps?(s.prevDep=Ze.depsTail,Ze.depsTail.nextDep=s,Ze.depsTail=s):Ze.deps=Ze.depsTail=s,Xd(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=Ze.depsTail,s.nextDep=void 0,Ze.depsTail.nextDep=s,Ze.depsTail=s,Ze.deps===s&&(Ze.deps=n)}return s}trigger(t){this.version++,ei++,this.notify(t)}notify(t){wo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{So()}}}function Xd(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Xd(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const tl=new WeakMap,Cn=Symbol(""),Ur=Symbol(""),ti=Symbol("");function Pt(e,t,s){if(ms&&Ze){let n=tl.get(e);n||tl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Fl),a.map=n,a.key=s),a.track()}}function Bs(e,t,s,n,a,i){const l=tl.get(e);if(!l){ei++;return}const r=o=>{o&&o.trigger()};if(wo(),t==="clear")l.forEach(r);else{const o=fe(e),c=o&&Dl(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===ti||!$t(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(ti)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Cn)),na(e)&&r(l.get(Ur)));break;case"delete":o||(r(l.get(Cn)),na(e)&&r(l.get(Ur)));break;case"set":na(e)&&r(l.get(Cn));break}}So()}function em(e,t){const s=tl.get(e);return s&&s.get(t)}function zn(e){const t=Fe(e);return t===e?t:(Pt(t,"iterate",ti),Zt(e)?t:t.map(bs))}function $l(e){return Pt(e=Fe(e),"iterate",ti),e}function Cs(e,t){return As(e)?da(zs(e)?bs(t):t):bs(t)}const tm={__proto__:null,[Symbol.iterator](){return pr(this,Symbol.iterator,e=>Cs(this,e))},concat(...e){return zn(this).concat(...e.map(t=>fe(t)?zn(t):t))},entries(){return pr(this,"entries",e=>(e[1]=Cs(this,e[1]),e))},every(e,t){return Ns(this,"every",e,t,void 0,arguments)},filter(e,t){return Ns(this,"filter",e,t,s=>s.map(n=>Cs(this,n)),arguments)},find(e,t){return Ns(this,"find",e,t,s=>Cs(this,s),arguments)},findIndex(e,t){return Ns(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ns(this,"findLast",e,t,s=>Cs(this,s),arguments)},findLastIndex(e,t){return Ns(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ns(this,"forEach",e,t,void 0,arguments)},includes(...e){return hr(this,"includes",e)},indexOf(...e){return hr(this,"indexOf",e)},join(e){return zn(this).join(e)},lastIndexOf(...e){return hr(this,"lastIndexOf",e)},map(e,t){return Ns(this,"map",e,t,void 0,arguments)},pop(){return Ia(this,"pop")},push(...e){return Ia(this,"push",e)},reduce(e,...t){return zc(this,"reduce",e,t)},reduceRight(e,...t){return zc(this,"reduceRight",e,t)},shift(){return Ia(this,"shift")},some(e,t){return Ns(this,"some",e,t,void 0,arguments)},splice(...e){return Ia(this,"splice",e)},toReversed(){return zn(this).toReversed()},toSorted(e){return zn(this).toSorted(e)},toSpliced(...e){return zn(this).toSpliced(...e)},unshift(...e){return Ia(this,"unshift",e)},values(){return pr(this,"values",e=>Cs(this,e))}};function pr(e,t,s){const n=$l(e),a=n[t]();return n!==e&&!Zt(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const sm=Array.prototype;function Ns(e,t,s,n,a,i){const l=$l(e),r=l!==e&&!Zt(e),o=l[t];if(o!==sm[t]){const d=o.apply(e,i);return r?bs(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,Cs(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function zc(e,t,s,n){const a=$l(e),i=a!==e&&!Zt(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=Cs(e,c)),s.call(this,c,Cs(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?Cs(e,o):o}function hr(e,t,s){const n=Fe(e);Pt(n,"iterate",ti);const a=n[t](...s);return(a===-1||a===!1)&&yi(s[0])?(s[0]=Fe(s[0]),n[t](...s)):a}function Ia(e,t,s=[]){Js(),wo();const n=Fe(e)[t].apply(e,s);return So(),Ys(),n}const nm=as("__proto__,__v_isRef,__isVue"),Zd=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter($t));function am(e){$t(e)||(e=String(e));const t=Fe(this);return Pt(t,"has",e),t.hasOwnProperty(e)}class ef{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?rf:lf:i?af:nf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=fe(t);if(!a){let o;if(l&&(o=tm[s]))return o;if(s==="hasOwnProperty")return am}const r=Reflect.get(t,s,gt(t)?t:n);if(($t(s)?Zd.has(s):nm(s))||(a||Pt(t,"get",s),i))return r;if(gt(r)){const o=l&&Dl(s)?r:r.value;return a&&Ue(o)?sl(o):o}return Ue(r)?a?sl(r):gn(r):r}}class tf extends ef{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=fe(t)&&Dl(s);if(!this._isShallow){const c=As(i);if(!Zt(n)&&!As(n)&&(i=Fe(i),n=Fe(n)),!l&&gt(i)&&!gt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:He(t,s),o=Reflect.set(t,s,n,gt(t)?t:a);return t===Fe(a)&&(r?kt(n,i)&&Bs(t,"set",s,n):Bs(t,"add",s,n)),o}deleteProperty(t,s){const n=He(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Bs(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!$t(s)||!Zd.has(s))&&Pt(t,"has",s),n}ownKeys(t){return Pt(t,"iterate",fe(t)?"length":Cn),Reflect.ownKeys(t)}}class sf extends ef{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const im=new tf,lm=new sf,rm=new tf(!0),om=new sf(!0),Hr=e=>e,Di=e=>Reflect.getPrototypeOf(e);function cm(e,t,s){return function(...n){const a=this.__v_raw,i=Fe(a),l=na(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?Hr:t?da:bs;return!t&&Pt(i,"iterate",o?Ur:Cn),De(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function Oi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function um(e,t){const s={get(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);e||(kt(a,r)&&Pt(l,"get",a),Pt(l,"get",r));const{has:o}=Di(l),c=t?Hr:e?da:bs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Pt(Fe(a),"iterate",Cn),a.size},has(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);return e||(kt(a,r)&&Pt(l,"has",a),Pt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Fe(r),c=t?Hr:e?da:bs;return!e&&Pt(o,"iterate",Cn),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return De(s,e?{add:Oi("add"),set:Oi("set"),delete:Oi("delete"),clear:Oi("clear")}:{add(a){const i=Fe(this),l=Di(i),r=Fe(a),o=!t&&!Zt(a)&&!As(a)?r:a;return l.has.call(i,o)||kt(a,o)&&l.has.call(i,a)||kt(r,o)&&l.has.call(i,r)||(i.add(o),Bs(i,"add",o,o)),this},set(a,i){!t&&!Zt(i)&&!As(i)&&(i=Fe(i));const l=Fe(this),{has:r,get:o}=Di(l);let c=r.call(l,a);c||(a=Fe(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?kt(i,u)&&Bs(l,"set",a,i):Bs(l,"add",a,i),this},delete(a){const i=Fe(this),{has:l,get:r}=Di(i);let o=l.call(i,a);o||(a=Fe(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Bs(i,"delete",a,void 0),c},clear(){const a=Fe(this),i=a.size!==0,l=a.clear();return i&&Bs(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=cm(a,e,t)}),s}function Bl(e,t){const s=um(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(He(s,a)&&a in n?s:n,a,i)}const dm={get:Bl(!1,!1)},fm={get:Bl(!1,!0)},pm={get:Bl(!0,!1)},hm={get:Bl(!0,!0)},nf=new WeakMap,af=new WeakMap,lf=new WeakMap,rf=new WeakMap;function gm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function gn(e){return As(e)?e:Ul(e,!1,im,dm,nf)}function Co(e){return Ul(e,!1,rm,fm,af)}function sl(e){return Ul(e,!0,lm,pm,lf)}function mm(e){return Ul(e,!0,om,hm,rf)}function Ul(e,t,s,n,a){if(!Ue(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=gm(Tg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function zs(e){return As(e)?zs(e.__v_raw):!!(e&&e.__v_isReactive)}function As(e){return!!(e&&e.__v_isReadonly)}function Zt(e){return!!(e&&e.__v_isShallow)}function yi(e){return e?!!e.__v_raw:!1}function Fe(e){const t=e&&e.__v_raw;return t?Fe(t):e}function of(e){return!He(e,"__v_skip")&&Object.isExtensible(e)&&Bd(e,"__v_skip",!0),e}const bs=e=>Ue(e)?gn(e):e,da=e=>Ue(e)?sl(e):e;function gt(e){return e?e.__v_isRef===!0:!1}function h(e){return cf(e,!1)}function Eo(e){return cf(e,!0)}function cf(e,t){return gt(e)?e:new vm(e,t)}class vm{constructor(t,s){this.dep=new Fl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Fe(t),this._value=s?t:bs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||Zt(t)||As(t);t=n?t:Fe(t),kt(t,s)&&(this._rawValue=t,this._value=n?t:bs(t),this.dep.trigger())}}function bm(e){e.dep&&e.dep.trigger()}function Es(e){return gt(e)?e.value:e}function ym(e){return ke(e)?e():Es(e)}const xm={get:(e,t,s)=>t==="__v_raw"?e:Es(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return gt(a)&&!gt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Ao(e){return zs(e)?e:new Proxy(e,xm)}class _m{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Fl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function uf(e){return new _m(e)}function km(e){const t=fe(e)?new Array(e.length):{};for(const s in e)t[s]=df(e,s);return t}class wm{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=$t(s)?s:String(s),this._raw=Fe(t);let a=!0,i=t;if(!fe(t)||$t(this._key)||!Dl(this._key))do a=!yi(i)||Zt(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Es(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&gt(this._raw[this._key])){const s=this._object[this._key];if(gt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return em(this._raw,this._key)}}class Sm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Tm(e,t,s){return gt(e)?e:ke(e)?new Sm(e):Ue(e)&&arguments.length>1?df(e,t,s):h(e)}function df(e,t,s){return new wm(e,t,s)}class Cm{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Fl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=ei-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&Ze!==this)return Kd(this,!0),!0}get value(){const t=this.dep.track();return Yd(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Em(e,t,s=!1){let n,a;return ke(e)?n=e:(n=e.get,a=e.set),new Cm(n,a,s)}const Am={GET:"get",HAS:"has",ITERATE:"iterate"},Rm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Li={},nl=new WeakMap;let on;function Im(){return on}function ff(e,t=!1,s=on){if(s){let n=nl.get(s);n||nl.set(s,n=[]),n.push(e)}}function Nm(e,t,s=Oe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:Zt(x)||a===!1||a===0?Us(x,1):Us(x);let u,d,f,p,m=!1,g=!1;if(gt(e)?(d=()=>e.value,m=Zt(e)):zs(e)?(d=()=>c(e),m=!0):fe(e)?(g=!0,m=e.some(x=>zs(x)||Zt(x)),d=()=>e.map(x=>{if(gt(x))return x.value;if(zs(x))return c(x);if(ke(x))return o?o(x,2):x()})):ke(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){Js();try{f()}finally{Ys()}}const x=on;on=u;try{return o?o(e,3,[p]):e(p)}finally{on=x}}:d=It,t&&a){const x=d,E=a===!0?1/0:a;d=()=>Us(x(),E)}const k=zd(),C=()=>{u.stop(),k&&k.active&&xo(k.effects,u)};if(i&&t){const x=t;t=(...E)=>{const S=x(...E);return C(),S}}let v=g?new Array(e.length).fill(Li):Li;const b=x=>{if(!(!(u.flags&1)||!u.dirty&&!x))if(t){const E=u.run();if(x||a||m||(g?E.some((S,N)=>kt(S,v[N])):kt(E,v))){f&&f();const S=on;on=u;try{const N=[E,v===Li?void 0:g&&v[0]===Li?[]:v,p];v=E,o?o(t,3,N):t(...N)}finally{on=S}}}else u.run()};return r&&r(b),u=new Za(d),u.scheduler=l?()=>l(b,!1):b,p=x=>ff(x,!1,u),f=u.onStop=()=>{const x=nl.get(u);if(x){if(o)o(x,4);else for(const E of x)E();nl.delete(u)}},t?n?b(!0):v=u.run():l?l(b.bind(null,!0),!0):u.run(),C.pause=u.pause.bind(u),C.resume=u.resume.bind(u),C.stop=C,C}function Us(e,t=1/0,s){if(t<=0||!Ue(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,gt(e))Us(e.value,t,s);else if(fe(e))for(let n=0;n<e.length;n++)Us(e[n],t,s);else if(Fn(e)||na(e))e.forEach(n=>{Us(n,t,s)});else if(Nl(e)){for(const n in e)Us(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Us(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const pf=[];function Dm(e){pf.push(e)}function Om(){pf.pop()}function Lm(e,t){}const Pm={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Mm={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function wa(e,t,s,n){try{return n?e(...n):e()}catch(a){Bn(a,t,s)}}function ss(e,t,s,n){if(ke(e)){const a=wa(e,t,s,n);return a&&_o(a)&&a.catch(i=>{Bn(i,t,s)}),a}if(fe(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ss(e[i],t,s,n));return a}}function Bn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Oe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){Js(),wa(i,null,10,[e,o,c]),Ys();return}}Fm(e,s,a,n,l)}function Fm(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const jt=[];let Ss=-1;const la=[];let cn=null,Yn=0;const hf=Promise.resolve();let al=null;function Et(e){const t=al||hf;return e?t.then(this?e.bind(this):e):t}function $m(e){let t=Ss+1,s=jt.length;for(;t<s;){const n=t+s>>>1,a=jt[n],i=ni(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Ro(e){if(!(e.flags&1)){const t=ni(e),s=jt[jt.length-1];!s||!(e.flags&2)&&t>=ni(s)?jt.push(e):jt.splice($m(t),0,e),e.flags|=1,gf()}}function gf(){al||(al=hf.then(mf))}function si(e){fe(e)?la.push(...e):cn&&e.id===-1?cn.splice(Yn+1,0,e):e.flags&1||(la.push(e),e.flags|=1),gf()}function Gc(e,t,s=Ss+1){for(;s<jt.length;s++){const n=jt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;jt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function il(e){if(la.length){const t=[...new Set(la)].sort((s,n)=>ni(s)-ni(n));if(la.length=0,cn){cn.push(...t);return}for(cn=t,Yn=0;Yn<cn.length;Yn++){const s=cn[Yn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}cn=null,Yn=0}}const ni=e=>e.id==null?e.flags&2?-1:1/0:e.id;function mf(e){try{for(Ss=0;Ss<jt.length;Ss++){const t=jt[Ss];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),wa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ss<jt.length;Ss++){const t=jt[Ss];t&&(t.flags&=-2)}Ss=-1,jt.length=0,il(),al=null,(jt.length||la.length)&&mf()}}let Qn,Pi=[];function vf(e,t){var s,n;Qn=e,Qn?(Qn.enabled=!0,Pi.forEach(({event:a,args:i})=>Qn.emit(a,...i)),Pi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{vf(i,t)}),setTimeout(()=>{Qn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Pi=[])},3e3)):Pi=[]}let Rt=null,Hl=null;function ai(e){const t=Rt;return Rt=e,Hl=e&&e.type.__scopeId||null,t}function Bm(e){Hl=e}function Um(){Hl=null}const Hm=e=>Io;function Io(e,t=Rt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&oi(-1);const i=ai(t);let l;try{l=e(...a)}finally{ai(i),n._d&&oi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function jm(e,t){if(Rt===null)return e;const s=wi(Rt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Oe]=t[a];i&&(ke(i)&&(i={mounted:i,updated:i}),i.deep&&Us(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Ts(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Js(),ss(o,s,8,[e.el,r,e,t]),Ys())}}function Ga(e,t){if(At){let s=At.provides;const n=At.parent&&At.parent.provides;n===s&&(s=At.provides=Object.create(n)),s[e]=t}}function us(e,t,s=!1){const n=qt();if(n||En){let a=En?En._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&ke(t)?t.call(n&&n.proxy):t}}function Vm(){return!!(qt()||En)}const bf=Symbol.for("v-scx"),yf=()=>us(bf);function qm(e,t){return xi(e,null,t)}function zm(e,t){return xi(e,null,{flush:"post"})}function xf(e,t){return xi(e,null,{flush:"sync"})}function ds(e,t,s){return xi(e,t,s)}function xi(e,t,s=Oe){const{immediate:n,deep:a,flush:i,once:l}=s,r=De({},s),o=t&&n||!t&&i!=="post";let c;if(On){if(i==="sync"){const p=yf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=It,p.resume=It,p.pause=It,p}}const u=At;r.call=(p,m,g)=>ss(p,u,m,g);let d=!1;i==="post"?r.scheduler=p=>{pt(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,m)=>{m?p():Ro(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Nm(e,t,r);return On&&(c?c.push(f):o&&f()),f}function Gm(e,t,s){const n=this.proxy,a=Se(e)?e.includes(".")?_f(n,e):()=>n[e]:e.bind(n,n);let i;ke(t)?i=t:(i=t.handler,s=t);const l=Sa(this),r=xi(a,i.bind(n),s);return l(),r}function _f(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const ln=new WeakMap,kf=Symbol("_vte"),wf=e=>e.__isTeleport,kn=e=>e&&(e.disabled||e.disabled===""),Km=e=>e&&(e.defer||e.defer===""),Kc=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Wc=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,jr=(e,t)=>{const s=e&&e.to;return Se(s)?t?t(s):null:s},Wm={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:m,createText:g,createComment:k,parentNode:C}}=c,v=kn(t.props);let{dynamicChildren:b}=t;const x=(N,w,A)=>{N.shapeFlag&16&&u(N.children,w,A,a,i,l,r,o)},E=(N=t)=>{const w=kn(N.props),A=N.target=jr(N.props,m),O=Vr(A,N,g,p);A&&(l!=="svg"&&Kc(A)?l="svg":l!=="mathml"&&Wc(A)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(A),w||(x(N,A,O),Ba(N,!1)))},S=N=>{const w=()=>{if(ln.get(N)===w){if(ln.delete(N),kn(N.props)){const A=C(N.el)||s;x(N,A,N.anchor),Ba(N,!0)}E(N)}};ln.set(N,w),pt(w,i)};if(e==null){const N=t.el=g(""),w=t.anchor=g("");if(p(N,s,n),p(w,s,n),Km(t.props)||i&&i.pendingBranch){S(t);return}v&&(x(t,s,w),Ba(t,!0)),E()}else{t.el=e.el;const N=t.anchor=e.anchor,w=ln.get(e);if(w){w.flags|=8,ln.delete(e),S(t);return}t.targetStart=e.targetStart;const A=t.target=e.target,O=t.targetAnchor=e.targetAnchor,j=kn(e.props),M=j?s:A,L=j?N:O;if(l==="svg"||Kc(A)?l="svg":(l==="mathml"||Wc(A))&&(l="mathml"),b?(f(e.dynamicChildren,b,M,a,i,l,r),Ho(e,t,!0)):o||d(e,t,M,L,a,i,l,r,!1),v)j?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Mi(t,s,N,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const J=t.target=jr(t.props,m);J&&Mi(t,J,null,c,0)}else j&&Mi(t,A,O,c,1);Ba(t,v)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!kn(f),m=ln.get(e);if(m&&(m.flags|=8,ln.delete(e)),d&&(a(c),a(u)),i&&a(o),!m&&l&16)for(let g=0;g<r.length;g++){const k=r[g];n(k,t,s,p,!!k.dynamicChildren)}},move:Mi,hydrate:Jm};function Mi(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!ln.has(e)&&(!d||kn(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function Jm(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(k,C){let v=C;for(;v;){if(v&&v.nodeType===8){if(v.data==="teleport start anchor")t.targetStart=v;else if(v.data==="teleport anchor"){t.targetAnchor=v,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}v=l(v)}}function p(k,C){C.anchor=d(l(k),C,r(k),s,n,a,i)}const m=t.target=jr(t.props,o),g=kn(t.props);if(m){const k=m._lpa||m.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(m,k),t.targetAnchor||Vr(m,t,u,c,r(e)===m?e:null)):(t.anchor=l(e),f(m,k),t.targetAnchor||Vr(m,t,u,c),d(k&&l(k),t,m,s,n,a,i))),Ba(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Ym=Wm;function Ba(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Vr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[kf]=l,e&&(n(i,e,a),n(l,e,a)),l}const rs=Symbol("_leaveCb"),Na=Symbol("_enterCb");function No(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return $e(()=>{e.isMounted=!0}),zl(()=>{e.isUnmounting=!0}),e}const ls=[Function,Array],Do={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ls,onEnter:ls,onAfterEnter:ls,onEnterCancelled:ls,onBeforeLeave:ls,onLeave:ls,onAfterLeave:ls,onLeaveCancelled:ls,onBeforeAppear:ls,onAppear:ls,onAfterAppear:ls,onAppearCancelled:ls},Sf=e=>{const t=e.subTree;return t.component?Sf(t.component):t},Qm={name:"BaseTransition",props:Do,setup(e,{slots:t}){const s=qt(),n=No();return()=>{const a=t.default&&jl(t.default(),!0),i=a&&a.length?Tf(a):s.subTree?cp():void 0;if(!i)return;const l=Fe(e),{mode:r}=l;if(n.isLeaving)return gr(i);const o=Jc(i);if(!o)return gr(i);let c=fa(o,l,n,s,d=>c=d);o.type!==dt&&Qs(o,c);let u=s.subTree&&Jc(s.subTree);if(u&&u.type!==dt&&!gs(u,o)&&Sf(s).type!==dt){let d=fa(u,l,n,s);if(Qs(u,d),r==="out-in"&&o.type!==dt)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},gr(i);r==="in-out"&&o.type!==dt?d.delayLeave=(f,p,m)=>{const g=Ef(n,u);g[String(u.key)]=u,f[rs]=()=>{p(),f[rs]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Tf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==dt){t=s;break}}return t}const Cf=Qm;function Ef(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function fa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:m,onLeaveCancelled:g,onBeforeAppear:k,onAppear:C,onAfterAppear:v,onAppearCancelled:b}=t,x=String(e.key),E=Ef(s,e),S=(A,O)=>{A&&ss(A,n,9,O)},N=(A,O)=>{const j=O[1];S(A,O),fe(A)?A.every(M=>M.length<=1)&&j():A.length<=1&&j()},w={mode:l,persisted:r,beforeEnter(A){let O=o;if(!s.isMounted)if(i)O=k||o;else return;A[rs]&&A[rs](!0);const j=E[x];j&&gs(e,j)&&j.el[rs]&&j.el[rs](),S(O,[A])},enter(A){if(E[x]===e)return;let O=c,j=u,M=d;if(!s.isMounted)if(i)O=C||c,j=v||u,M=b||d;else return;let L=!1;A[Na]=$=>{L||(L=!0,$?S(M,[A]):S(j,[A]),w.delayedLeave&&w.delayedLeave(),A[Na]=void 0)};const J=A[Na].bind(null,!1);O?N(O,[A,J]):J()},leave(A,O){const j=String(e.key);if(A[Na]&&A[Na](!0),s.isUnmounting)return O();S(f,[A]);let M=!1;A[rs]=J=>{M||(M=!0,O(),J?S(g,[A]):S(m,[A]),A[rs]=void 0,E[j]===e&&delete E[j])};const L=A[rs].bind(null,!1);E[j]=e,p?N(p,[A,L]):L()},clone(A){const O=fa(A,t,s,n,a);return a&&a(O),O}};return w}function gr(e){if(ki(e))return e=Rs(e),e.children=null,e}function Jc(e){if(!ki(e))return wf(e.type)&&e.children?Tf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&ke(s.default))return s.default()}}function Qs(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Qs(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function jl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===wt?(l.patchFlag&128&&a++,n=n.concat(jl(l.children,t,r))):(t||l.type!==dt)&&n.push(r!=null?Rs(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function _i(e,t){return ke(e)?De({name:e.name},t,{setup:e}):e}function Xm(){const e=qt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Oo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Zm(e){const t=qt(),s=Eo(null);if(t){const a=t.refs===Oe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Yc(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const ll=new WeakMap;function ra(e,t,s,n,a=!1){if(fe(e)){e.forEach((g,k)=>ra(g,t&&(fe(t)?t[k]:t),s,n,a));return}if(Gs(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&ra(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?wi(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Oe?r.refs={}:r.refs,d=r.setupState,f=Fe(d),p=d===Oe?ea:g=>Yc(u,g)?!1:He(f,g),m=(g,k)=>!(k&&Yc(u,k));if(c!=null&&c!==o){if(Qc(t),Se(c))u[c]=null,p(c)&&(d[c]=null);else if(gt(c)){const g=t;m(c,g.k)&&(c.value=null),g.k&&(u[g.k]=null)}}if(ke(o))wa(o,r,12,[l,u]);else{const g=Se(o),k=gt(o);if(g||k){const C=()=>{if(e.f){const v=g?p(o)?d[o]:u[o]:m()||!e.k?o.value:u[e.k];if(a)fe(v)&&xo(v,i);else if(fe(v))v.includes(i)||v.push(i);else if(g)u[o]=[i],p(o)&&(d[o]=u[o]);else{const b=[i];m(o,e.k)&&(o.value=b),e.k&&(u[e.k]=b)}}else g?(u[o]=l,p(o)&&(d[o]=l)):k&&(m(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const v=()=>{C(),ll.delete(e)};v.id=-1,ll.set(e,v),pt(v,s)}else Qc(e),C()}}}function Qc(e){const t=ll.get(e);t&&(t.flags|=8,ll.delete(e))}let Xc=!1;const Gn=()=>{Xc||(console.error("Hydration completed but contains mismatches."),Xc=!0)},ev=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",tv=e=>e.namespaceURI.includes("MathML"),Fi=e=>{if(e.nodeType===1){if(ev(e))return"svg";if(tv(e))return"mathml"}},ta=e=>e.nodeType===8;function sv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(b,x)=>{if(!x.hasChildNodes()){s(null,b,x),il(),x._vnode=b;return}d(x.firstChild,b,null,null,null),il(),x._vnode=b},d=(b,x,E,S,N,w=!1)=>{w=w||!!x.dynamicChildren;const A=ta(b)&&b.data==="[",O=()=>g(b,x,E,S,N,A),{type:j,ref:M,shapeFlag:L,patchFlag:J}=x;let $=b.nodeType;x.el=b,J===-2&&(w=!1,x.dynamicChildren=null);let V=null;switch(j){case fn:$!==3?x.children===""?(o(x.el=a(""),l(b),b),V=b):V=O():(b.data!==x.children&&(Gn(),b.data=x.children),V=i(b));break;case dt:v(b)?(V=i(b),C(x.el=b.content.firstChild,b,E)):$!==8||A?V=O():V=i(b);break;case An:if(A&&(b=i(b),$=b.nodeType),$===1||$===3){V=b;const I=!x.children.length;for(let D=0;D<x.staticCount;D++)I&&(x.children+=V.nodeType===1?V.outerHTML:V.data),D===x.staticCount-1&&(x.anchor=V),V=i(V);return A?i(V):V}else O();break;case wt:A?V=m(b,x,E,S,N,w):V=O();break;default:if(L&1)($!==1||x.type.toLowerCase()!==b.tagName.toLowerCase())&&!v(b)?V=O():V=f(b,x,E,S,N,w);else if(L&6){x.slotScopeIds=N;const I=l(b);if(A?V=k(b):ta(b)&&b.data==="teleport start"?V=k(b,b.data,"teleport end"):V=i(b),t(x,I,null,E,S,Fi(I),w),Gs(x)&&!x.type.__asyncResolved){let D;A?(D=at(wt),D.anchor=V?V.previousSibling:I.lastChild):D=b.nodeType===3?Vo(""):at("div"),D.el=b,x.component.subTree=D}}else L&64?$!==8?V=O():V=x.type.hydrate(b,x,E,S,N,w,e,p):L&128&&(V=x.type.hydrate(b,x,E,S,Fi(l(b)),N,w,e,d))}return M!=null&&ra(M,null,S,x),V},f=(b,x,E,S,N,w)=>{w=w||!!x.dynamicChildren;const{type:A,props:O,patchFlag:j,shapeFlag:M,dirs:L,transition:J}=x,$=A==="input"||A==="option";if($||j!==-1){L&&Ts(x,null,E,"created");let V=!1;if(v(b)){V=ep(null,J)&&E&&E.vnode.props&&E.vnode.props.appear;const D=b.content.firstChild;if(V){const G=D.getAttribute("class");G&&(D.$cls=G),J.beforeEnter(D)}C(D,b,E),x.el=b=D}if(M&16&&!(O&&(O.innerHTML||O.textContent))){let D=p(b.firstChild,x,b,E,S,N,w);for(D&&!$i(b,1)&&Gn();D;){const G=D;D=D.nextSibling,r(G)}}else if(M&8){let D=x.children;D[0]===`
`&&(b.tagName==="PRE"||b.tagName==="TEXTAREA")&&(D=D.slice(1));const{textContent:G}=b;G!==D&&G!==D.replace(/\r\n|\r/g,`
`)&&($i(b,0)||Gn(),b.textContent=x.children)}if(O){if($||!w||j&48){const D=b.tagName.includes("-");for(const G in O)($&&(G.endsWith("value")||G==="indeterminate")||Mn(G)&&!qs(G)||G[0]==="."||D&&!qs(G))&&n(b,G,null,O[G],void 0,E)}else if(O.onClick)n(b,"onClick",null,O.onClick,void 0,E);else if(j&4&&zs(O.style))for(const D in O.style)O.style[D]}let I;(I=O&&O.onVnodeBeforeMount)&&Wt(I,E,x),L&&Ts(x,null,E,"beforeMount"),((I=O&&O.onVnodeMounted)||L||V)&&ap(()=>{I&&Wt(I,E,x),V&&J.enter(b),L&&Ts(x,null,E,"mounted")},S)}return b.nextSibling},p=(b,x,E,S,N,w,A)=>{A=A||!!x.dynamicChildren;const O=x.children,j=O.length;let M=!1;for(let L=0;L<j;L++){const J=A?O[L]:O[L]=Yt(O[L]),$=J.type===fn;b?($&&!A&&L+1<j&&Yt(O[L+1]).type===fn&&(o(a(b.data.slice(J.children.length)),E,i(b)),b.data=J.children),b=d(b,J,S,N,w,A)):$&&!J.children?o(J.el=a(""),E):(M||(M=!0,$i(E,1)||Gn()),s(null,J,E,null,S,N,Fi(E),w))}return b},m=(b,x,E,S,N,w)=>{const{slotScopeIds:A}=x;A&&(N=N?N.concat(A):A);const O=l(b),j=p(i(b),x,O,E,S,N,w);return j&&ta(j)&&j.data==="]"?i(x.anchor=j):(Gn(),o(x.anchor=c("]"),O,j),j)},g=(b,x,E,S,N,w)=>{if($i(b.parentElement,1)||Gn(),x.el=null,w){const j=k(b);for(;;){const M=i(b);if(M&&M!==j)r(M);else break}}const A=i(b),O=l(b);return r(b),s(null,x,O,A,E,S,Fi(O),N),E&&(E.vnode.el=x.el,Kl(E,x.el)),A},k=(b,x="[",E="]")=>{let S=0;for(;b;)if(b=i(b),b&&ta(b)&&(b.data===x&&S++,b.data===E)){if(S===0)return i(b);S--}return b},C=(b,x,E)=>{const S=x.parentNode;S&&S.replaceChild(b,x);let N=E;for(;N;)N.vnode.el===x&&(N.vnode.el=N.subTree.el=b),N=N.parent},v=b=>b.nodeType===1&&b.tagName==="TEMPLATE";return[u,d]}const Zc="data-allow-mismatch",nv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function $i(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Zc);)e=e.parentElement;const s=e&&e.getAttribute(Zc);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(nv[t])}}const av=Pl().requestIdleCallback||(e=>setTimeout(e,1)),iv=Pl().cancelIdleCallback||(e=>clearTimeout(e)),lv=(e=1e4)=>t=>{const s=av(t,{timeout:e});return()=>iv(s)};function rv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const ov=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(rv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},cv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},uv=(e=[])=>(t,s)=>{Se(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function dv(e,t){if(ta(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(ta(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Gs=e=>!!e.type.__asyncLoader;function fv(e){ke(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let m;return c||(m=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((k,C)=>{o(g,()=>k(f()),()=>C(g),d+1)});throw g}).then(g=>m!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),u=g,g)))};return _i({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(m,g,k){let C=!1;(g.bu||(g.bu=[])).push(()=>C=!0);const v=()=>{C||k()},b=i?()=>{const x=i(v,E=>dv(m,E));x&&(g.bum||(g.bum=[])).push(x)}:v;u?b():p().then(()=>!g.isUnmounted&&b())},get __asyncResolved(){return u},setup(){const m=At;if(Oo(m),u)return()=>Bi(u,m);const g=E=>{c=null,Bn(E,m,13,!n)};if(r&&m.suspense||On)return p().then(E=>()=>Bi(E,m)).catch(E=>(g(E),()=>n?at(n,{error:E}):null));const k=h(!1),C=h(),v=h(!!a);let b,x;return ft(()=>{b!=null&&clearTimeout(b),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{m.isUnmounted||(v.value=!1)},a)),l!=null&&(b=setTimeout(()=>{if(!m.isUnmounted&&!k.value&&!C.value){const E=new Error(`Async component timed out after ${l}ms.`);g(E),C.value=E}},l)),p().then(()=>{m.isUnmounted||(k.value=!0,m.parent&&ki(m.parent.vnode)&&m.parent.update())}).catch(E=>{if(m.isUnmounted){c=null;return}g(E),C.value=E}),()=>{if(k.value&&u)return Bi(u,m);if(C.value&&n)return at(n,{error:C.value});if(s&&!v.value)return Bi(s,m)}}})}function Bi(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=at(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ki=e=>e.type.__isKeepAlive,pv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=qt(),n=s.ctx;if(!n.renderer)return()=>{const v=t.default&&t.default();return v&&v.length===1?v[0]:v};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(v,b,x,E,S)=>{const N=v.component;c(v,b,x,0,r),o(N.vnode,v,b,x,N,r,E,v.slotScopeIds,S),pt(()=>{N.isDeactivated=!1,N.a&&ia(N.a);const w=v.props&&v.props.onVnodeMounted;w&&Wt(w,N.parent,v)},r)},n.deactivate=v=>{const b=v.component;ol(b.m),ol(b.a),c(v,f,null,1,r),pt(()=>{b.da&&ia(b.da);const x=v.props&&v.props.onVnodeUnmounted;x&&Wt(x,b.parent,v),b.isDeactivated=!0},r)};function p(v){mr(v),u(v,s,r,!0)}function m(v){a.forEach((b,x)=>{const E=Xr(Gs(b)?b.type.__asyncResolved||{}:b.type);E&&!v(E)&&g(x)})}function g(v){const b=a.get(v);b&&(!l||!gs(b,l))?p(b):l&&mr(l),a.delete(v),i.delete(v)}ds(()=>[e.include,e.exclude],([v,b])=>{v&&m(x=>Ua(v,x)),b&&m(x=>!Ua(b,x))},{flush:"post",deep:!0});let k=null;const C=()=>{k!=null&&(cl(s.subTree.type)?pt(()=>{a.set(k,Ui(s.subTree))},s.subTree.suspense):a.set(k,Ui(s.subTree)))};return $e(C),ql(C),zl(()=>{a.forEach(v=>{const{subTree:b,suspense:x}=s,E=Ui(b);if(v.type===E.type&&v.key===E.key){mr(E);const S=E.component.da;S&&pt(S,x);return}p(v)})}),()=>{if(k=null,!t.default)return l=null;const v=t.default(),b=v[0];if(v.length>1)return l=null,v;if(!Xs(b)||!(b.shapeFlag&4)&&!(b.shapeFlag&128))return l=null,b;let x=Ui(b);if(x.type===dt)return l=null,x;const E=x.type,S=Xr(Gs(x)?x.type.__asyncResolved||{}:E),{include:N,exclude:w,max:A}=e;if(N&&(!S||!Ua(N,S))||w&&S&&Ua(w,S))return x.shapeFlag&=-257,l=x,b;const O=x.key==null?E:x.key,j=a.get(O);return x.el&&(x=Rs(x),b.shapeFlag&128&&(b.ssContent=x)),k=O,j?(x.el=j.el,x.component=j.component,x.transition&&Qs(x,x.transition),x.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),A&&i.size>parseInt(A,10)&&g(i.values().next().value)),x.shapeFlag|=256,l=x,cl(b.type)?b:x}}},hv=pv;function Ua(e,t){return fe(e)?e.some(s=>Ua(s,t)):Se(e)?e.split(",").includes(t):Sg(e)?(e.lastIndex=0,e.test(t)):!1}function Af(e,t){If(e,"a",t)}function Rf(e,t){If(e,"da",t)}function If(e,t,s=At){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Vl(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ki(a.parent.vnode)&&gv(n,t,s,a),a=a.parent}}function gv(e,t,s,n){const a=Vl(t,e,n,!0);ft(()=>{xo(n[t],a)},s)}function mr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Ui(e){return e.shapeFlag&128?e.ssContent:e}function Vl(e,t,s=At,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Js();const r=Sa(s),o=ss(t,s,e,l);return r(),Ys(),o});return n?a.unshift(i):a.push(i),i}}const Zs=e=>(t,s=At)=>{(!On||e==="sp")&&Vl(e,(...n)=>t(...n),s)},Nf=Zs("bm"),$e=Zs("m"),Lo=Zs("bu"),ql=Zs("u"),zl=Zs("bum"),ft=Zs("um"),Df=Zs("sp"),Of=Zs("rtg"),Lf=Zs("rtc");function Pf(e,t=At){Vl("ec",e,t)}const Po="components",mv="directives";function vv(e,t){return Mo(Po,e,!0,t)||e}const Mf=Symbol.for("v-ndc");function bv(e){return Se(e)?Mo(Po,e,!1)||e:e||Mf}function yv(e){return Mo(mv,e)}function Mo(e,t,s=!0,n=!1){const a=Rt||At;if(a){const i=a.type;if(e===Po){const r=Xr(i,!1);if(r&&(r===t||r===Ge(t)||r===$n(Ge(t))))return i}const l=eu(a[e]||i[e],t)||eu(a.appContext[e],t);return!l&&n?i:l}}function eu(e,t){return e&&(e[t]||e[Ge(t)]||e[$n(Ge(t))])}function xv(e,t,s,n){let a;const i=s&&s[n],l=fe(e);if(l||Se(e)){const r=l&&zs(e);let o=!1,c=!1;r&&(o=!Zt(e),c=As(e),e=$l(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?da(bs(e[u])):bs(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Ue(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function _v(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(fe(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function kv(e,t,s={},n,a){if(Rt.ce||Rt.parent&&Gs(Rt.parent)&&Rt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),ri(),ul(wt,null,[at("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),ri();const l=i&&Fo(i(s)),r=s.key||l&&l.key,o=ul(wt,{key:(r&&!$t(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Fo(e){return e.some(t=>Xs(t)?!(t.type===dt||t.type===wt&&!Fo(t.children)):!0)?e:null}function wv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:aa(n)]=e[n];return s}const qr=e=>e?fp(e)?wi(e):qr(e.parent):null,Ka=De(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>qr(e.parent),$root:e=>qr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>$o(e),$forceUpdate:e=>e.f||(e.f=()=>{Ro(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Gm.bind(e)}),vr=(e,t)=>e!==Oe&&!e.__isScriptSetup&&He(e,t),zr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(vr(n,t))return l[t]=1,n[t];if(a!==Oe&&He(a,t))return l[t]=2,a[t];if(He(i,t))return l[t]=3,i[t];if(s!==Oe&&He(s,t))return l[t]=4,s[t];Gr&&(l[t]=0)}}const c=Ka[t];let u,d;if(c)return t==="$attrs"&&Pt(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Oe&&He(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,He(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return vr(a,t)?(a[t]=s,!0):n!==Oe&&He(n,t)?(n[t]=s,!0):He(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Oe&&r[0]!=="$"&&He(e,r)||vr(t,r)||He(i,r)||He(n,r)||He(Ka,r)||He(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:He(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Sv=De({},zr,{get(e,t){if(t!==Symbol.unscopables)return zr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Ng(t)}});function Tv(){return null}function Cv(){return null}function Ev(e){}function Av(e){}function Rv(){return null}function Iv(){}function Nv(e,t){return null}function Dv(){return Ff().slots}function Ov(){return Ff().attrs}function Ff(e){const t=qt();return t.setupContext||(t.setupContext=mp(t))}function ii(e){return fe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Lv(e,t){const s=ii(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?fe(a)||ke(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Pv(e,t){return!e||!t?e||t:fe(e)&&fe(t)?e.concat(t):De({},ii(e),ii(t))}function Mv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Fv(e){const t=qt(),s=On;let n=e();ci(),s&&ca(!1);const a=()=>{Sa(t),s&&ca(!0)},i=()=>{qt()!==t&&t.scope.off(),ci(),s&&ca(!1)};return _o(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Gr=!0;function $v(e){const t=$o(e),s=e.proxy,n=e.ctx;Gr=!1,t.beforeCreate&&tu(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:m,activated:g,deactivated:k,beforeDestroy:C,beforeUnmount:v,destroyed:b,unmounted:x,render:E,renderTracked:S,renderTriggered:N,errorCaptured:w,serverPrefetch:A,expose:O,inheritAttrs:j,components:M,directives:L,filters:J}=t;if(c&&Bv(c,n,null),l)for(const I in l){const D=l[I];ke(D)&&(n[I]=D.bind(s))}if(a){const I=a.call(s,s);Ue(I)&&(e.data=gn(I))}if(Gr=!0,i)for(const I in i){const D=i[I],G=ke(D)?D.bind(s,s):ke(D.get)?D.get.bind(s,s):It,de=!ke(D)&&ke(D.set)?D.set.bind(s):It,ve=te({get:G,set:de});Object.defineProperty(n,I,{enumerable:!0,configurable:!0,get:()=>ve.value,set:ie=>ve.value=ie})}if(r)for(const I in r)$f(r[I],n,s,I);if(o){const I=ke(o)?o.call(s):o;Reflect.ownKeys(I).forEach(D=>{Ga(D,I[D])})}u&&tu(u,e,"c");function V(I,D){fe(D)?D.forEach(G=>I(G.bind(s))):D&&I(D.bind(s))}if(V(Nf,d),V($e,f),V(Lo,p),V(ql,m),V(Af,g),V(Rf,k),V(Pf,w),V(Lf,S),V(Of,N),V(zl,v),V(ft,x),V(Df,A),fe(O))if(O.length){const I=e.exposed||(e.exposed={});O.forEach(D=>{Object.defineProperty(I,D,{get:()=>s[D],set:G=>s[D]=G,enumerable:!0})})}else e.exposed||(e.exposed={});E&&e.render===It&&(e.render=E),j!=null&&(e.inheritAttrs=j),M&&(e.components=M),L&&(e.directives=L),A&&Oo(e)}function Bv(e,t,s=It){fe(e)&&(e=Kr(e));for(const n in e){const a=e[n];let i;Ue(a)?"default"in a?i=us(a.from||n,a.default,!0):i=us(a.from||n):i=us(a),gt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function tu(e,t,s){ss(fe(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function $f(e,t,s,n){let a=n.includes(".")?_f(s,n):()=>s[n];if(Se(e)){const i=t[e];ke(i)&&ds(a,i)}else if(ke(e))ds(a,e.bind(s));else if(Ue(e))if(fe(e))e.forEach(i=>$f(i,t,s,n));else{const i=ke(e.handler)?e.handler.bind(s):t[e.handler];ke(i)&&ds(a,i,e)}}function $o(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>rl(o,c,l,!0)),rl(o,t,l)),Ue(t)&&i.set(t,o),o}function rl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&rl(e,i,s,!0),a&&a.forEach(l=>rl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=Uv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const Uv={data:su,props:nu,emits:nu,methods:Ha,computed:Ha,beforeCreate:Bt,created:Bt,beforeMount:Bt,mounted:Bt,beforeUpdate:Bt,updated:Bt,beforeDestroy:Bt,beforeUnmount:Bt,destroyed:Bt,unmounted:Bt,activated:Bt,deactivated:Bt,errorCaptured:Bt,serverPrefetch:Bt,components:Ha,directives:Ha,watch:jv,provide:su,inject:Hv};function su(e,t){return t?e?function(){return De(ke(e)?e.call(this,this):e,ke(t)?t.call(this,this):t)}:t:e}function Hv(e,t){return Ha(Kr(e),Kr(t))}function Kr(e){if(fe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Bt(e,t){return e?[...new Set([].concat(e,t))]:t}function Ha(e,t){return e?De(Object.create(null),e,t):t}function nu(e,t){return e?fe(e)&&fe(t)?[...new Set([...e,...t])]:De(Object.create(null),ii(e),ii(t??{})):t}function jv(e,t){if(!e)return t;if(!t)return e;const s=De(Object.create(null),e);for(const n in t)s[n]=Bt(e[n],t[n]);return s}function Bf(){return{app:null,config:{isNativeTag:ea,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Vv=0;function qv(e,t){return function(n,a=null){ke(n)||(n=De({},n)),a!=null&&!Ue(a)&&(a=null);const i=Bf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Vv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:bp,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&ke(u.install)?(l.add(u),u.install(c,...d)):ke(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||at(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,wi(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(ss(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=En;En=c;try{return u()}finally{En=d}}};return c}}let En=null;function zv(e,t,s=Oe){const n=qt(),a=Ge(t),i=Qt(t),l=Uf(e,a),r=uf((o,c)=>{let u,d=Oe,f;return xf(()=>{const p=e[a];kt(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const m=s.set?s.set(p):p;if(!kt(m,u)&&!(d!==Oe&&kt(p,d)))return;const g=n.vnode.props,k=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));k||(u=p,c()),n.emit(`update:${t}`,m),kt(p,d)&&(kt(p,m)&&!kt(m,f)||k&&d!==Oe&&!kt(m,u))&&c(),d=p,f=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Oe:r,done:!1}:{done:!0}}}},r}const Uf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Ge(t)}Modifiers`]||e[`${Qt(t)}Modifiers`];function Gv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Oe;let a=s;const i=t.startsWith("update:"),l=i&&Uf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Se(u)?u.trim():u)),l.number&&(a=s.map(Ll)));let r,o=n[r=aa(t)]||n[r=aa(Ge(t))];!o&&i&&(o=n[r=aa(Qt(t))]),o&&ss(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ss(c,e,6,a)}}const Kv=new WeakMap;function Hf(e,t,s=!1){const n=s?Kv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!ke(e)){const o=c=>{const u=Hf(c,t,!0);u&&(r=!0,De(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Ue(e)&&n.set(e,null),null):(fe(i)?i.forEach(o=>l[o]=null):De(l,i),Ue(e)&&n.set(e,l),l)}function Gl(e,t){return!e||!Mn(t)?!1:(t=t.slice(2).replace(/Once$/,""),He(e,t[0].toLowerCase()+t.slice(1))||He(e,Qt(t))||He(e,t))}function Ki(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:m,inheritAttrs:g}=e,k=ai(e);let C,v;try{if(s.shapeFlag&4){const x=a||n,E=x;C=Yt(c.call(E,x,u,d,p,f,m)),v=r}else{const x=t;C=Yt(x.length>1?x(d,{attrs:r,slots:l,emit:o}):x(d,null)),v=t.props?r:Jv(r)}}catch(x){Wa.length=0,Bn(x,e,1),C=at(dt)}let b=C;if(v&&g!==!1){const x=Object.keys(v),{shapeFlag:E}=b;x.length&&E&7&&(i&&x.some(Il)&&(v=Yv(v,i)),b=Rs(b,v,!1,!0))}return s.dirs&&(b=Rs(b,null,!1,!0),b.dirs=b.dirs?b.dirs.concat(s.dirs):s.dirs),s.transition&&Qs(b,s.transition),C=b,ai(k),C}function Wv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Xs(a)){if(a.type!==dt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Jv=e=>{let t;for(const s in e)(s==="class"||s==="style"||Mn(s))&&((t||(t={}))[s]=e[s]);return t},Yv=(e,t)=>{const s={};for(const n in e)(!Il(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Qv(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?au(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(jf(l,n,f)&&!Gl(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?au(n,l,c):!0:!!l;return!1}function au(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(jf(t,e,i)&&!Gl(s,i))return!0}return!1}function jf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Ue(n)&&Ue(a)?!Ws(n,a):n!==a}function Kl({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Vf={},qf=()=>Object.create(Vf),zf=e=>Object.getPrototypeOf(e)===Vf;function Xv(e,t,s,n=!1){const a={},i=qf();e.propsDefaults=Object.create(null),Gf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Co(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Zv(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Fe(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(Gl(e.emitsOptions,f))continue;const p=t[f];if(o)if(He(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const m=Ge(f);a[m]=Wr(o,r,m,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{Gf(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!He(t,d)&&((u=Qt(d))===d||!He(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=Wr(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!He(t,d))&&(delete i[d],c=!0)}c&&Bs(e.attrs,"set","")}function Gf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(qs(o))continue;const c=t[o];let u;a&&He(a,u=Ge(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:Gl(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Fe(s),c=r||Oe;for(let u=0;u<i.length;u++){const d=i[u];s[d]=Wr(a,o,d,c[d],e,!He(c,d))}}return l}function Wr(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=He(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&ke(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Sa(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===Qt(s))&&(n=!0))}return n}const eb=new WeakMap;function Kf(e,t,s=!1){const n=s?eb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!ke(e)){const u=d=>{o=!0;const[f,p]=Kf(d,t,!0);De(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return Ue(e)&&n.set(e,sa),sa;if(fe(i))for(let u=0;u<i.length;u++){const d=Ge(i[u]);iu(d)&&(l[d]=Oe)}else if(i)for(const u in i){const d=Ge(u);if(iu(d)){const f=i[u],p=l[d]=fe(f)||ke(f)?{type:f}:De({},f),m=p.type;let g=!1,k=!0;if(fe(m))for(let C=0;C<m.length;++C){const v=m[C],b=ke(v)&&v.name;if(b==="Boolean"){g=!0;break}else b==="String"&&(k=!1)}else g=ke(m)&&m.name==="Boolean";p[0]=g,p[1]=k,(g||He(p,"default"))&&r.push(d)}}const c=[l,r];return Ue(e)&&n.set(e,c),c}function iu(e){return e[0]!=="$"&&!qs(e)}const Bo=e=>e==="_"||e==="_ctx"||e==="$stable",Uo=e=>fe(e)?e.map(Yt):[Yt(e)],tb=(e,t,s)=>{if(t._n)return t;const n=Io((...a)=>Uo(t(...a)),s);return n._c=!1,n},Wf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Bo(a))continue;const i=e[a];if(ke(i))t[a]=tb(a,i,n);else if(i!=null){const l=Uo(i);t[a]=()=>l}}},Jf=(e,t)=>{const s=Uo(t);e.slots.default=()=>s},Yf=(e,t,s)=>{for(const n in t)(s||!Bo(n))&&(e[n]=t[n])},sb=(e,t,s)=>{const n=e.slots=qf();if(e.vnode.shapeFlag&32){const a=t._;a?(Yf(n,t,s),s&&Bd(n,"_",a,!0)):Wf(t,n)}else t&&Jf(e,t)},nb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Oe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Yf(a,t,s):(i=!t.$stable,Wf(t,a)),l=t}else t&&(Jf(e,t),l={default:1});if(i)for(const r in a)!Bo(r)&&l[r]==null&&delete a[r]},pt=ap;function Qf(e){return Zf(e)}function Xf(e){return Zf(e,sv)}function Zf(e,t){const s=Pl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=It,insertStaticContent:m}=e,g=(y,T,P,W=null,R=null,F=null,Y=void 0,Z=null,se=!!T.dynamicChildren)=>{if(y===T)return;y&&!gs(y,T)&&(W=q(y),ie(y,R,F,!0),y=null),T.patchFlag===-2&&(se=!1,T.dynamicChildren=null);const{type:Q,ref:B,shapeFlag:ee}=T;switch(Q){case fn:k(y,T,P,W);break;case dt:C(y,T,P,W);break;case An:y==null&&v(T,P,W,Y);break;case wt:M(y,T,P,W,R,F,Y,Z,se);break;default:ee&1?E(y,T,P,W,R,F,Y,Z,se):ee&6?L(y,T,P,W,R,F,Y,Z,se):(ee&64||ee&128)&&Q.process(y,T,P,W,R,F,Y,Z,se,ge)}B!=null&&R?ra(B,y&&y.ref,F,T||y,!T):B==null&&y&&y.ref!=null&&ra(y.ref,null,F,y,!0)},k=(y,T,P,W)=>{if(y==null)n(T.el=r(T.children),P,W);else{const R=T.el=y.el;T.children!==y.children&&c(R,T.children)}},C=(y,T,P,W)=>{y==null?n(T.el=o(T.children||""),P,W):T.el=y.el},v=(y,T,P,W)=>{[y.el,y.anchor]=m(y.children,T,P,W,y.el,y.anchor)},b=({el:y,anchor:T},P,W)=>{let R;for(;y&&y!==T;)R=f(y),n(y,P,W),y=R;n(T,P,W)},x=({el:y,anchor:T})=>{let P;for(;y&&y!==T;)P=f(y),a(y),y=P;a(T)},E=(y,T,P,W,R,F,Y,Z,se)=>{if(T.type==="svg"?Y="svg":T.type==="math"&&(Y="mathml"),y==null)S(T,P,W,R,F,Y,Z,se);else{const Q=y.el&&y.el._isVueCE?y.el:null;try{Q&&Q._beginPatch(),A(y,T,R,F,Y,Z,se)}finally{Q&&Q._endPatch()}}},S=(y,T,P,W,R,F,Y,Z)=>{let se,Q;const{props:B,shapeFlag:ee,transition:oe,dirs:be}=y;if(se=y.el=l(y.type,F,B&&B.is,B),ee&8?u(se,y.children):ee&16&&w(y.children,se,null,W,R,br(y,F),Y,Z),be&&Ts(y,null,W,"created"),N(se,y,y.scopeId,Y,W),B){for(const Ae in B)Ae!=="value"&&!qs(Ae)&&i(se,Ae,null,B[Ae],F,W);"value"in B&&i(se,"value",null,B.value,F),(Q=B.onVnodeBeforeMount)&&Wt(Q,W,y)}be&&Ts(y,null,W,"beforeMount");const Te=ep(R,oe);Te&&oe.beforeEnter(se),n(se,T,P),((Q=B&&B.onVnodeMounted)||Te||be)&&pt(()=>{try{Q&&Wt(Q,W,y),Te&&oe.enter(se),be&&Ts(y,null,W,"mounted")}finally{}},R)},N=(y,T,P,W,R)=>{if(P&&p(y,P),W)for(let F=0;F<W.length;F++)p(y,W[F]);if(R){let F=R.subTree;if(T===F||cl(F.type)&&(F.ssContent===T||F.ssFallback===T)){const Y=R.vnode;N(y,Y,Y.scopeId,Y.slotScopeIds,R.parent)}}},w=(y,T,P,W,R,F,Y,Z,se=0)=>{for(let Q=se;Q<y.length;Q++){const B=y[Q]=Z?Fs(y[Q]):Yt(y[Q]);g(null,B,T,P,W,R,F,Y,Z)}},A=(y,T,P,W,R,F,Y)=>{const Z=T.el=y.el;let{patchFlag:se,dynamicChildren:Q,dirs:B}=T;se|=y.patchFlag&16;const ee=y.props||Oe,oe=T.props||Oe;let be;if(P&&bn(P,!1),(be=oe.onVnodeBeforeUpdate)&&Wt(be,P,T,y),B&&Ts(T,y,P,"beforeUpdate"),P&&bn(P,!0),(ee.innerHTML&&oe.innerHTML==null||ee.textContent&&oe.textContent==null)&&u(Z,""),Q?O(y.dynamicChildren,Q,Z,P,W,br(T,R),F):Y||D(y,T,Z,null,P,W,br(T,R),F,!1),se>0){if(se&16)j(Z,ee,oe,P,R);else if(se&2&&ee.class!==oe.class&&i(Z,"class",null,oe.class,R),se&4&&i(Z,"style",ee.style,oe.style,R),se&8){const Te=T.dynamicProps;for(let Ae=0;Ae<Te.length;Ae++){const U=Te[Ae],ce=ee[U],ye=oe[U];(ye!==ce||U==="value")&&i(Z,U,ce,ye,R,P)}}se&1&&y.children!==T.children&&u(Z,T.children)}else!Y&&Q==null&&j(Z,ee,oe,P,R);((be=oe.onVnodeUpdated)||B)&&pt(()=>{be&&Wt(be,P,T,y),B&&Ts(T,y,P,"updated")},W)},O=(y,T,P,W,R,F,Y)=>{for(let Z=0;Z<T.length;Z++){const se=y[Z],Q=T[Z],B=se.el&&(se.type===wt||!gs(se,Q)||se.shapeFlag&198)?d(se.el):P;g(se,Q,B,null,W,R,F,Y,!0)}},j=(y,T,P,W,R)=>{if(T!==P){if(T!==Oe)for(const F in T)!qs(F)&&!(F in P)&&i(y,F,T[F],null,R,W);for(const F in P){if(qs(F))continue;const Y=P[F],Z=T[F];Y!==Z&&F!=="value"&&i(y,F,Z,Y,R,W)}"value"in P&&i(y,"value",T.value,P.value,R)}},M=(y,T,P,W,R,F,Y,Z,se)=>{const Q=T.el=y?y.el:r(""),B=T.anchor=y?y.anchor:r("");let{patchFlag:ee,dynamicChildren:oe,slotScopeIds:be}=T;be&&(Z=Z?Z.concat(be):be),y==null?(n(Q,P,W),n(B,P,W),w(T.children||[],P,B,R,F,Y,Z,se)):ee>0&&ee&64&&oe&&y.dynamicChildren&&y.dynamicChildren.length===oe.length?(O(y.dynamicChildren,oe,P,R,F,Y,Z),(T.key!=null||R&&T===R.subTree)&&Ho(y,T,!0)):D(y,T,P,B,R,F,Y,Z,se)},L=(y,T,P,W,R,F,Y,Z,se)=>{T.slotScopeIds=Z,y==null?T.shapeFlag&512?R.ctx.activate(T,P,W,Y,se):J(T,P,W,R,F,Y,se):$(y,T,se)},J=(y,T,P,W,R,F,Y)=>{const Z=y.component=dp(y,W,R);if(ki(y)&&(Z.ctx.renderer=ge),pp(Z,!1,Y),Z.asyncDep){if(R&&R.registerDep(Z,V,Y),!y.el){const se=Z.subTree=at(dt);C(null,se,T,P),y.placeholder=se.el}}else V(Z,y,T,P,R,F,Y)},$=(y,T,P)=>{const W=T.component=y.component;if(Qv(y,T,P))if(W.asyncDep&&!W.asyncResolved){I(W,T,P);return}else W.next=T,W.update();else T.el=y.el,W.vnode=T},V=(y,T,P,W,R,F,Y)=>{const Z=()=>{if(y.isMounted){let{next:ee,bu:oe,u:be,parent:Te,vnode:Ae}=y;{const Je=tp(y);if(Je){ee&&(ee.el=Ae.el,I(y,ee,Y)),Je.asyncDep.then(()=>{pt(()=>{y.isUnmounted||Q()},R)});return}}let U=ee,ce;bn(y,!1),ee?(ee.el=Ae.el,I(y,ee,Y)):ee=Ae,oe&&ia(oe),(ce=ee.props&&ee.props.onVnodeBeforeUpdate)&&Wt(ce,Te,ee,Ae),bn(y,!0);const ye=Ki(y),Me=y.subTree;y.subTree=ye,g(Me,ye,d(Me.el),q(Me),y,R,F),ee.el=ye.el,U===null&&Kl(y,ye.el),be&&pt(be,R),(ce=ee.props&&ee.props.onVnodeUpdated)&&pt(()=>Wt(ce,Te,ee,Ae),R)}else{let ee;const{el:oe,props:be}=T,{bm:Te,m:Ae,parent:U,root:ce,type:ye}=y,Me=Gs(T);if(bn(y,!1),Te&&ia(Te),!Me&&(ee=be&&be.onVnodeBeforeMount)&&Wt(ee,U,T),bn(y,!0),oe&&Le){const Je=()=>{y.subTree=Ki(y),Le(oe,y.subTree,y,R,null)};Me&&ye.__asyncHydrate?ye.__asyncHydrate(oe,y,Je):Je()}else{ce.ce&&ce.ce._hasShadowRoot()&&ce.ce._injectChildStyle(ye,y.parent?y.parent.type:void 0);const Je=y.subTree=Ki(y);g(null,Je,P,W,y,R,F),T.el=Je.el}if(Ae&&pt(Ae,R),!Me&&(ee=be&&be.onVnodeMounted)){const Je=T;pt(()=>Wt(ee,U,Je),R)}(T.shapeFlag&256||U&&Gs(U.vnode)&&U.vnode.shapeFlag&256)&&y.a&&pt(y.a,R),y.isMounted=!0,T=P=W=null}};y.scope.on();const se=y.effect=new Za(Z);y.scope.off();const Q=y.update=se.run.bind(se),B=y.job=se.runIfDirty.bind(se);B.i=y,B.id=y.uid,se.scheduler=()=>Ro(B),bn(y,!0),Q()},I=(y,T,P)=>{T.component=y;const W=y.vnode.props;y.vnode=T,y.next=null,Zv(y,T.props,W,P),nb(y,T.children,P),Js(),Gc(y),Ys()},D=(y,T,P,W,R,F,Y,Z,se=!1)=>{const Q=y&&y.children,B=y?y.shapeFlag:0,ee=T.children,{patchFlag:oe,shapeFlag:be}=T;if(oe>0){if(oe&128){de(Q,ee,P,W,R,F,Y,Z,se);return}else if(oe&256){G(Q,ee,P,W,R,F,Y,Z,se);return}}be&8?(B&16&&Ie(Q,R,F),ee!==Q&&u(P,ee)):B&16?be&16?de(Q,ee,P,W,R,F,Y,Z,se):Ie(Q,R,F,!0):(B&8&&u(P,""),be&16&&w(ee,P,W,R,F,Y,Z,se))},G=(y,T,P,W,R,F,Y,Z,se)=>{y=y||sa,T=T||sa;const Q=y.length,B=T.length,ee=Math.min(Q,B);let oe;for(oe=0;oe<ee;oe++){const be=T[oe]=se?Fs(T[oe]):Yt(T[oe]);g(y[oe],be,P,null,R,F,Y,Z,se)}Q>B?Ie(y,R,F,!0,!1,ee):w(T,P,W,R,F,Y,Z,se,ee)},de=(y,T,P,W,R,F,Y,Z,se)=>{let Q=0;const B=T.length;let ee=y.length-1,oe=B-1;for(;Q<=ee&&Q<=oe;){const be=y[Q],Te=T[Q]=se?Fs(T[Q]):Yt(T[Q]);if(gs(be,Te))g(be,Te,P,null,R,F,Y,Z,se);else break;Q++}for(;Q<=ee&&Q<=oe;){const be=y[ee],Te=T[oe]=se?Fs(T[oe]):Yt(T[oe]);if(gs(be,Te))g(be,Te,P,null,R,F,Y,Z,se);else break;ee--,oe--}if(Q>ee){if(Q<=oe){const be=oe+1,Te=be<B?T[be].el:W;for(;Q<=oe;)g(null,T[Q]=se?Fs(T[Q]):Yt(T[Q]),P,Te,R,F,Y,Z,se),Q++}}else if(Q>oe)for(;Q<=ee;)ie(y[Q],R,F,!0),Q++;else{const be=Q,Te=Q,Ae=new Map;for(Q=Te;Q<=oe;Q++){const st=T[Q]=se?Fs(T[Q]):Yt(T[Q]);st.key!=null&&Ae.set(st.key,Q)}let U,ce=0;const ye=oe-Te+1;let Me=!1,Je=0;const Ke=new Array(ye);for(Q=0;Q<ye;Q++)Ke[Q]=0;for(Q=be;Q<=ee;Q++){const st=y[Q];if(ce>=ye){ie(st,R,F,!0);continue}let Ye;if(st.key!=null)Ye=Ae.get(st.key);else for(U=Te;U<=oe;U++)if(Ke[U-Te]===0&&gs(st,T[U])){Ye=U;break}Ye===void 0?ie(st,R,F,!0):(Ke[Ye-Te]=Q+1,Ye>=Je?Je=Ye:Me=!0,g(st,T[Ye],P,null,R,F,Y,Z,se),ce++)}const St=Me?ab(Ke):sa;for(U=St.length-1,Q=ye-1;Q>=0;Q--){const st=Te+Q,Ye=T[st],en=T[st+1],mn=st+1<B?en.el||sp(en):W;Ke[Q]===0?g(null,Ye,P,mn,R,F,Y,Z,se):Me&&(U<0||Q!==St[U]?ve(Ye,P,mn,2):U--)}}},ve=(y,T,P,W,R=null)=>{const{el:F,type:Y,transition:Z,children:se,shapeFlag:Q}=y;if(Q&6){ve(y.component.subTree,T,P,W);return}if(Q&128){y.suspense.move(T,P,W);return}if(Q&64){Y.move(y,T,P,ge);return}if(Y===wt){n(F,T,P);for(let ee=0;ee<se.length;ee++)ve(se[ee],T,P,W);n(y.anchor,T,P);return}if(Y===An){b(y,T,P);return}if(W!==2&&Q&1&&Z)if(W===0)Z.persisted&&!F[rs]?n(F,T,P):(Z.beforeEnter(F),n(F,T,P),pt(()=>Z.enter(F),R));else{const{leave:ee,delayLeave:oe,afterLeave:be}=Z,Te=()=>{y.ctx.isUnmounted?a(F):n(F,T,P)},Ae=()=>{const U=F._isLeaving||!!F[rs];F._isLeaving&&F[rs](!0),Z.persisted&&!U?Te():ee(F,()=>{Te(),be&&be()})};oe?oe(F,Te,Ae):Ae()}else n(F,T,P)},ie=(y,T,P,W=!1,R=!1)=>{const{type:F,props:Y,ref:Z,children:se,dynamicChildren:Q,shapeFlag:B,patchFlag:ee,dirs:oe,cacheIndex:be,memo:Te}=y;if(ee===-2&&(R=!1),Z!=null&&(Js(),ra(Z,null,P,y,!0),Ys()),be!=null&&(T.renderCache[be]=void 0),B&256){T.ctx.deactivate(y);return}const Ae=B&1&&oe,U=!Gs(y);let ce;if(U&&(ce=Y&&Y.onVnodeBeforeUnmount)&&Wt(ce,T,y),B&6)ue(y.component,P,W);else{if(B&128){y.suspense.unmount(P,W);return}Ae&&Ts(y,null,T,"beforeUnmount"),B&64?y.type.remove(y,T,P,ge,W):Q&&!Q.hasOnce&&(F!==wt||ee>0&&ee&64)?Ie(Q,T,P,!1,!0):(F===wt&&ee&384||!R&&B&16)&&Ie(se,T,P),W&&pe(y)}const ye=Te!=null&&be==null;(U&&(ce=Y&&Y.onVnodeUnmounted)||Ae||ye)&&pt(()=>{ce&&Wt(ce,T,y),Ae&&Ts(y,null,T,"unmounted"),ye&&(y.el=null)},P)},pe=y=>{const{type:T,el:P,anchor:W,transition:R}=y;if(T===wt){X(P,W);return}if(T===An){x(y);return}const F=()=>{a(P),R&&!R.persisted&&R.afterLeave&&R.afterLeave()};if(y.shapeFlag&1&&R&&!R.persisted){const{leave:Y,delayLeave:Z}=R,se=()=>Y(P,F);Z?Z(y.el,F,se):se()}else F()},X=(y,T)=>{let P;for(;y!==T;)P=f(y),a(y),y=P;a(T)},ue=(y,T,P)=>{const{bum:W,scope:R,job:F,subTree:Y,um:Z,m:se,a:Q}=y;ol(se),ol(Q),W&&ia(W),R.stop(),F&&(F.flags|=8,ie(Y,y,T,P)),Z&&pt(Z,T),pt(()=>{y.isUnmounted=!0},T)},Ie=(y,T,P,W=!1,R=!1,F=0)=>{for(let Y=F;Y<y.length;Y++)ie(y[Y],T,P,W,R)},q=y=>{if(y.shapeFlag&6)return q(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const T=f(y.anchor||y.el),P=T&&T[kf];return P?f(P):T};let re=!1;const le=(y,T,P)=>{let W;y==null?T._vnode&&(ie(T._vnode,null,null,!0),W=T._vnode.component):g(T._vnode||null,y,T,null,null,null,P),T._vnode=y,re||(re=!0,Gc(W),il(),re=!1)},ge={p:g,um:ie,m:ve,r:pe,mt:J,mc:w,pc:D,pbc:O,n:q,o:e};let me,Le;return t&&([me,Le]=t(ge)),{render:le,hydrate:me,createApp:qv(le,me)}}function br({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function bn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function ep(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Ho(e,t,s=!1){const n=e.children,a=t.children;if(fe(n)&&fe(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=Fs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Ho(l,r)),r.type===fn&&(r.patchFlag===-1&&(r=a[i]=Fs(r)),r.el=l.el),r.type===dt&&!r.el&&(r.el=l.el)}}function ab(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function tp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:tp(t)}function ol(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function sp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?sp(t.subTree):null}const cl=e=>e.__isSuspense;let Jr=0;const ib={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)rb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}ob(e,t,s,n,a,l,r,o,c)}},hydrate:cb,normalize:ub},lb=ib;function li(e,t){const s=e.props&&e.props[t];ke(s)&&s()}function rb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=np(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(li(e,"onPending"),li(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),oa(f,e.ssFallback)):f.resolve(!1,!0)}function ob(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:m,pendingBranch:g,isInFallback:k,isHydrating:C}=d;if(g)d.pendingBranch=f,gs(g,f)?(o(g,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():k&&(C||(o(m,p,s,n,a,null,i,l,r),oa(d,p)))):(d.pendingId=Jr++,C?(d.isHydrating=!1,d.activeBranch=g):c(g,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),k?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(m,p,s,n,a,null,i,l,r),oa(d,p))):m&&gs(m,f)?(o(m,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(m&&gs(m,f))o(m,f,s,n,a,d,i,l,r),oa(d,f);else if(li(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=Jr++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:v,pendingId:b}=d;v>0?setTimeout(()=>{d.pendingId===b&&d.fallback(p)},v):v===0&&d.fallback(p)}}function np(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:m,o:{parentNode:g,remove:k}}=c;let C;const v=db(e);v&&t&&t.pendingBranch&&(C=t.pendingId,t.deps++);const b=e.props?el(e.props.timeout):void 0,x=i,E={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Jr++,timeout:typeof b=="number"?b:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(S=!1,N=!1){const{vnode:w,activeBranch:A,pendingBranch:O,pendingId:j,effects:M,parentComponent:L,container:J,isInFallback:$}=E;let V=!1;if(E.isHydrating)E.isHydrating=!1;else if(!S){V=A&&O.transition&&O.transition.mode==="out-in";let G=!1;V&&(A.transition.afterLeave=()=>{j===E.pendingId&&(f(O,J,i===x&&!G?m(A):i,0),si(M),$&&w.ssFallback&&(w.ssFallback.el=null))}),A&&!E.isFallbackMountPending&&(g(A.el)===J&&(i=m(A),G=!0),p(A,L,E,!0),!V&&$&&w.ssFallback&&pt(()=>w.ssFallback.el=null,E)),V||f(O,J,i,0)}E.isFallbackMountPending=!1,oa(E,O),E.pendingBranch=null,E.isInFallback=!1;let I=E.parent,D=!1;for(;I;){if(I.pendingBranch){I.effects.push(...M),D=!0;break}I=I.parent}!D&&!V&&si(M),E.effects=[],v&&t&&t.pendingBranch&&C===t.pendingId&&(t.deps--,t.deps===0&&!N&&t.resolve()),li(w,"onResolve")},fallback(S){if(!E.pendingBranch)return;const{vnode:N,activeBranch:w,parentComponent:A,container:O,namespace:j}=E;li(N,"onFallback");const M=m(w),L=()=>{E.isFallbackMountPending=!1,E.isInFallback&&(d(null,S,O,M,A,null,j,r,o),oa(E,S))},J=S.transition&&S.transition.mode==="out-in";J&&(E.isFallbackMountPending=!0,w.transition.afterLeave=L),E.isInFallback=!0,p(w,A,null,!0),J||L()},move(S,N,w){E.activeBranch&&f(E.activeBranch,S,N,w),E.container=S},next(){return E.activeBranch&&m(E.activeBranch)},registerDep(S,N,w){const A=!!E.pendingBranch;A&&E.deps++;const O=S.vnode.el;S.asyncDep.catch(j=>{Bn(j,S,0)}).then(j=>{if(S.isUnmounted||E.isUnmounted||E.pendingId!==S.suspenseId)return;ci(),S.asyncResolved=!0;const{vnode:M}=S;Yr(S,j,!1),O&&(M.el=O);const L=!O&&S.subTree.el;N(S,M,g(O||S.subTree.el),O?null:m(S.subTree),E,l,w),L&&(M.placeholder=null,k(L)),Kl(S,M.el),A&&--E.deps===0&&E.resolve()})},unmount(S,N){E.isUnmounted=!0,E.activeBranch&&p(E.activeBranch,s,S,N),E.pendingBranch&&p(E.pendingBranch,s,S,N)}};return E}function cb(e,t,s,n,a,i,l,r,o){const c=t.suspense=np(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function ub(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=lu(n?s.default:s),e.ssFallback=n?lu(s.fallback):at(dt)}function lu(e){let t;if(ke(e)){const s=Dn&&e._c;s&&(e._d=!1,ri()),e=e(),s&&(e._d=!0,t=Mt,ip())}return fe(e)&&(e=Wv(e)),e=Yt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function ap(e,t){t&&t.pendingBranch?fe(e)?t.effects.push(...e):t.effects.push(e):si(e)}function oa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Kl(n,a))}function db(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const wt=Symbol.for("v-fgt"),fn=Symbol.for("v-txt"),dt=Symbol.for("v-cmt"),An=Symbol.for("v-stc"),Wa=[];let Mt=null;function ri(e=!1){Wa.push(Mt=e?null:[])}function ip(){Wa.pop(),Mt=Wa[Wa.length-1]||null}let Dn=1;function oi(e,t=!1){Dn+=e,e<0&&Mt&&t&&(Mt.hasOnce=!0)}function lp(e){return e.dynamicChildren=Dn>0?Mt||sa:null,ip(),Dn>0&&Mt&&Mt.push(e),e}function fb(e,t,s,n,a,i){return lp(jo(e,t,s,n,a,i,!0))}function ul(e,t,s,n,a){return lp(at(e,t,s,n,a,!0))}function Xs(e){return e?e.__v_isVNode===!0:!1}function gs(e,t){return e.type===t.type&&e.key===t.key}function pb(e){}const rp=({key:e})=>e??null,Wi=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Se(e)||gt(e)||ke(e)?{i:Rt,r:e,k:t,f:!!s}:e:null);function jo(e,t=null,s=null,n=0,a=null,i=e===wt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&rp(t),ref:t&&Wi(t),scopeId:Hl,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Rt};return r?(qo(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Se(s)?8:16),Dn>0&&!l&&Mt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Mt.push(o),o}const at=hb;function hb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Mf)&&(e=dt),Xs(e)){const r=Rs(e,t,!0);return s&&qo(r,s),Dn>0&&!i&&Mt&&(r.shapeFlag&6?Mt[Mt.indexOf(e)]=r:Mt.push(r)),r.patchFlag=-2,r}if(_b(e)&&(e=e.__vccOpts),t){t=op(t);let{class:r,style:o}=t;r&&!Se(r)&&(t.class=bi(r)),Ue(o)&&(yi(o)&&!fe(o)&&(o=De({},o)),t.style=vi(o))}const l=Se(e)?1:cl(e)?128:wf(e)?64:Ue(e)?4:ke(e)?2:0;return jo(e,t,s,n,a,l,i,!0)}function op(e){return e?yi(e)||zf(e)?De({},e):e:null}function Rs(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?up(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&rp(c),ref:t&&t.ref?s&&i?fe(i)?i.concat(Wi(t)):[i,Wi(t)]:Wi(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==wt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Rs(e.ssContent),ssFallback:e.ssFallback&&Rs(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Qs(u,o.clone(u)),u}function Vo(e=" ",t=0){return at(fn,null,e,t)}function gb(e,t){const s=at(An,null,e);return s.staticCount=t,s}function cp(e="",t=!1){return t?(ri(),ul(dt,null,e)):at(dt,null,e)}function Yt(e){return e==null||typeof e=="boolean"?at(dt):fe(e)?at(wt,null,e.slice()):Xs(e)?Fs(e):at(fn,null,String(e))}function Fs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Rs(e)}function qo(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(fe(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),qo(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!zf(t)?t._ctx=Rt:a===3&&Rt&&(Rt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else ke(t)?(t={default:t,_ctx:Rt},s=32):(t=String(t),n&64?(s=16,t=[Vo(t)]):s=8);e.children=t,e.shapeFlag|=s}function up(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=bi([t.class,n.class]));else if(a==="style")t.style=vi([t.style,n.style]);else if(Mn(a)){const i=t[a],l=n[a];l&&i!==l&&!(fe(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Il(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Wt(e,t,s,n=null){ss(e,t,7,[s,n])}const mb=Bf();let vb=0;function dp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||mb,i={uid:vb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new ko(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Kf(n,a),emitsOptions:Hf(n,a),emit:null,emitted:null,propsDefaults:Oe,inheritAttrs:n.inheritAttrs,ctx:Oe,data:Oe,props:Oe,attrs:Oe,slots:Oe,refs:Oe,setupState:Oe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Gv.bind(null,i),e.ce&&e.ce(i),i}let At=null;const qt=()=>At||Rt;let dl,ca;{const e=Pl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};dl=t("__VUE_INSTANCE_SETTERS__",s=>At=s),ca=t("__VUE_SSR_SETTERS__",s=>On=s)}const Sa=e=>{const t=At;return dl(e),e.scope.on(),()=>{e.scope.off(),dl(t)}},ci=()=>{At&&At.scope.off(),dl(null)};function fp(e){return e.vnode.shapeFlag&4}let On=!1;function pp(e,t=!1,s=!1){t&&ca(t);const{props:n,children:a}=e.vnode,i=fp(e);Xv(e,n,i,t),sb(e,a,s||t);const l=i?bb(e,t):void 0;return t&&ca(!1),l}function bb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,zr);const{setup:n}=s;if(n){Js();const a=e.setupContext=n.length>1?mp(e):null,i=Sa(e),l=wa(n,e,0,[e.props,a]),r=_o(l);if(Ys(),i(),(r||e.sp)&&!Gs(e)&&Oo(e),r){if(l.then(ci,ci),t)return l.then(o=>{Yr(e,o,t)}).catch(o=>{Bn(o,e,0)});e.asyncDep=l}else Yr(e,l,t)}else gp(e,t)}function Yr(e,t,s){ke(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Ue(t)&&(e.setupState=Ao(t)),gp(e,s)}let fl,Qr;function hp(e){fl=e,Qr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Sv))}}const yb=()=>!fl;function gp(e,t,s){const n=e.type;if(!e.render){if(!t&&fl&&!n.render){const a=n.template||$o(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=De(De({isCustomElement:i,delimiters:r},l),o);n.render=fl(a,c)}}e.render=n.render||It,Qr&&Qr(e)}{const a=Sa(e);Js();try{$v(e)}finally{Ys(),a()}}}const xb={get(e,t){return Pt(e,"get",""),e[t]}};function mp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,xb),slots:e.slots,emit:e.emit,expose:t}}function wi(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Ao(of(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ka)return Ka[s](e)},has(t,s){return s in t||s in Ka}})):e.proxy}function Xr(e,t=!0){return ke(e)?e.displayName||e.name:e.name||t&&e.__name}function _b(e){return ke(e)&&"__vccOpts"in e}const te=(e,t)=>Em(e,t,On);function Wl(e,t,s){try{oi(-1);const n=arguments.length;return n===2?Ue(t)&&!fe(t)?Xs(t)?at(e,null,[t]):at(e,t):at(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Xs(s)&&(s=[s]),at(e,t,s))}finally{oi(1)}}function kb(){}function wb(e,t,s,n){const a=s[n];if(a&&vp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function vp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(kt(s[n],t[n]))return!1;return Dn>0&&Mt&&Mt.push(e),!0}const bp="3.5.38",Sb=It,Tb=Mm,Cb=Qn,Eb=vf,Ab={createComponentInstance:dp,setupComponent:pp,renderComponentRoot:Ki,setCurrentRenderingInstance:ai,isVNode:Xs,normalizeVNode:Yt,getComponentPublicInstance:wi,ensureValidVNode:Fo,pushWarningContext:Dm,popWarningContext:Om},Rb=Ab,Ib=null,Nb=null,Db=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Zr;const ru=typeof window<"u"&&window.trustedTypes;if(ru)try{Zr=ru.createPolicy("vue",{createHTML:e=>e})}catch{}const yp=Zr?e=>Zr.createHTML(e):e=>e,Ob="http://www.w3.org/2000/svg",Lb="http://www.w3.org/1998/Math/MathML",Ms=typeof document<"u"?document:null,ou=Ms&&Ms.createElement("template"),xp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?Ms.createElementNS(Ob,e):t==="mathml"?Ms.createElementNS(Lb,e):s?Ms.createElement(e,{is:s}):Ms.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>Ms.createTextNode(e),createComment:e=>Ms.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Ms.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{ou.innerHTML=yp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=ou.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},sn="transition",Da="animation",pa=Symbol("_vtc"),_p={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},kp=De({},Do,_p),Pb=e=>(e.displayName="Transition",e.props=kp,e),Mb=Pb((e,{slots:t})=>Wl(Cf,wp(e),t)),yn=(e,t=[])=>{fe(e)?e.forEach(s=>s(...t)):e&&e(...t)},cu=e=>e?fe(e)?e.some(t=>t.length>1):e.length>1:!1;function wp(e){const t={};for(const M in e)M in _p||(t[M]=e[M]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,m=Fb(a),g=m&&m[0],k=m&&m[1],{onBeforeEnter:C,onEnter:v,onEnterCancelled:b,onLeave:x,onLeaveCancelled:E,onBeforeAppear:S=C,onAppear:N=v,onAppearCancelled:w=b}=t,A=(M,L,J,$)=>{M._enterCancelled=$,rn(M,L?u:r),rn(M,L?c:l),J&&J()},O=(M,L)=>{M._isLeaving=!1,rn(M,d),rn(M,p),rn(M,f),L&&L()},j=M=>(L,J)=>{const $=M?N:v,V=()=>A(L,M,J);yn($,[L,V]),uu(()=>{rn(L,M?o:i),_s(L,M?u:r),cu($)||du(L,n,g,V)})};return De(t,{onBeforeEnter(M){yn(C,[M]),_s(M,i),_s(M,l)},onBeforeAppear(M){yn(S,[M]),_s(M,o),_s(M,c)},onEnter:j(!1),onAppear:j(!0),onLeave(M,L){M._isLeaving=!0;const J=()=>O(M,L);_s(M,d),M._enterCancelled?(_s(M,f),eo(M)):(eo(M),_s(M,f)),uu(()=>{M._isLeaving&&(rn(M,d),_s(M,p),cu(x)||du(M,n,k,J))}),yn(x,[M,J])},onEnterCancelled(M){A(M,!1,void 0,!0),yn(b,[M])},onAppearCancelled(M){A(M,!0,void 0,!0),yn(w,[M])},onLeaveCancelled(M){O(M),yn(E,[M])}})}function Fb(e){if(e==null)return null;if(Ue(e))return[yr(e.enter),yr(e.leave)];{const t=yr(e);return[t,t]}}function yr(e){return el(e)}function _s(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[pa]||(e[pa]=new Set)).add(t)}function rn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[pa];s&&(s.delete(t),s.size||(e[pa]=void 0))}function uu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let $b=0;function du(e,t,s,n){const a=e._endId=++$b,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Sp(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Sp(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${sn}Delay`),i=n(`${sn}Duration`),l=fu(a,i),r=n(`${Da}Delay`),o=n(`${Da}Duration`),c=fu(r,o);let u=null,d=0,f=0;t===sn?l>0&&(u=sn,d=l,f=i.length):t===Da?c>0&&(u=Da,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?sn:Da:null,f=u?u===sn?i.length:o.length:0);const p=u===sn&&/\b(?:transform|all)(?:,|$)/.test(n(`${sn}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function fu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>pu(s)+pu(e[n])))}function pu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function eo(e){return(e?e.ownerDocument:document).body.offsetHeight}function Bb(e,t,s){const n=e[pa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const pl=Symbol("_vod"),zo=Symbol("_vsh"),Tp={name:"show",beforeMount(e,{value:t},{transition:s}){e[pl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Oa(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Oa(e,!0),n.enter(e)):n.leave(e,()=>{Oa(e,!1)}):Oa(e,t))},beforeUnmount(e,{value:t}){Oa(e,t)}};function Oa(e,t){e.style.display=t?e[pl]:"none",e[zo]=!t}function Ub(){Tp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Cp=Symbol("");function Hb(e){const t=qt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>hl(i,a))},n=()=>{const a=e(t.proxy);t.ce?hl(t.ce,a):to(t.subTree,a),s(a)};Lo(()=>{si(n)}),$e(()=>{ds(n,It,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function to(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{to(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)hl(e.el,t);else if(e.type===wt)e.children.forEach(s=>to(s,t));else if(e.type===An){let{el:s,anchor:n}=e;for(;s&&(hl(s,t),s!==n);)s=s.nextSibling}}function hl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Kg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Cp]=n}}const jb=/(?:^|;)\s*display\s*:/;function Vb(e,t,s){const n=e.style,a=Se(s);let i=!1;if(s&&!a){if(t)if(Se(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&ja(n,r,"")}else for(const l in t)s[l]==null&&ja(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?zb(e,l,!Se(t)&&t?t[l]:void 0,r)||ja(n,l,r):ja(n,l,"")}}else if(a){if(t!==s){const l=n[Cp];l&&(s+=";"+l),n.cssText=s,i=jb.test(s)}}else t&&e.removeAttribute("style");pl in e&&(e[pl]=i?n.display:"",e[zo]&&(n.display="none"))}const hu=/\s*!important$/;function ja(e,t,s){if(fe(s))s.forEach(n=>ja(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=qb(e,t);hu.test(s)?e.setProperty(Qt(n),s.replace(hu,""),"important"):e[n]=s}}const gu=["Webkit","Moz","ms"],xr={};function qb(e,t){const s=xr[t];if(s)return s;let n=Ge(t);if(n!=="filter"&&n in e)return xr[t]=n;n=$n(n);for(let a=0;a<gu.length;a++){const i=gu[a]+n;if(i in e)return xr[t]=i}return t}function zb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Se(n)&&s===n}const mu="http://www.w3.org/1999/xlink";function vu(e,t,s,n,a,i=zg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(mu,t.slice(6,t.length)):e.setAttributeNS(mu,t,s):s==null||i&&!Hd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":$t(s)?String(s):s)}function bu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?yp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Hd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Hs(e,t,s,n){e.addEventListener(t,s,n)}function Gb(e,t,s,n){e.removeEventListener(t,s,n)}const yu=Symbol("_vei");function Kb(e,t,s,n,a=null){const i=e[yu]||(e[yu]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Wb(t);if(n){const c=i[t]=Qb(n,a);Hs(e,r,c,o)}else l&&(Gb(e,r,l,o),i[t]=void 0)}}const xu=/(?:Once|Passive|Capture)$/;function Wb(e){let t;if(xu.test(e)){t={};let n;for(;n=e.match(xu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Qt(e.slice(2)),t]}let _r=0;const Jb=Promise.resolve(),Yb=()=>_r||(Jb.then(()=>_r=0),_r=Date.now());function Qb(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(fe(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ss(c,t,5,r)}}else ss(a,t,5,[n])};return s.value=e,s.attached=Yb(),s}const _u=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Ep=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Bb(e,n,l):t==="style"?Vb(e,s,n):Mn(t)?Il(t)||Kb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Xb(e,t,n,l))?(bu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&vu(e,t,n,l,i,t!=="value")):e._isVueCE&&(Zb(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Se(n)))?bu(e,Ge(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),vu(e,t,n,l))};function Xb(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&_u(t)&&ke(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return _u(t)&&Se(s)?!1:t in e}function Zb(e,t){const s=e._def.props;if(!s)return!1;const n=Ge(t);return Array.isArray(s)?s.some(a=>Ge(a)===n):Object.keys(s).some(a=>Ge(a)===n)}const ku={};function Ap(e,t,s){let n=_i(e,t);Nl(n)&&(n=De({},n,t));class a extends Jl{constructor(l){super(n,l,s)}}return a.def=n,a}const ey=((e,t)=>Ap(e,t,Hp)),ty=typeof HTMLElement<"u"?HTMLElement:class{};class Jl extends ty{constructor(t,s={},n=vl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==vl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(De({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Jl){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!fe(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=el(this._props[o])),(r||(r=Object.create(null)))[Ge(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)He(this,n)||Object.defineProperty(this,n,{get:()=>Es(s[n])})}_resolveProps(t){const{props:s}=t,n=fe(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Ge))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):ku;const a=Ge(t);s&&this._numberProps&&this._numberProps[a]&&(n=el(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===ku?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Qt(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Qt(t),s+""):s||this.removeAttribute(Qt(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Up(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=at(this._def,De(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Nl(l[0])?De({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),Qt(i)!==i&&a(Qt(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Rp(e){const t=qt(),s=t&&t.ce;return s||null}function sy(){const e=Rp();return e&&e.shadowRoot}function ny(e="$style"){{const t=qt();if(!t)return Oe;const s=t.type.__cssModules;if(!s)return Oe;const n=s[e];return n||Oe}}const Ip=new WeakMap,Np=new WeakMap,gl=Symbol("_moveCb"),wu=Symbol("_enterCb"),ay=e=>(delete e.props.mode,e),iy=ay({name:"TransitionGroup",props:De({},kp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=qt(),n=No();let a,i;return ql(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!uy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(ry),a.forEach(oy);const r=a.filter(cy);eo(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;_s(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[gl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[gl]=null,rn(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Fe(e),r=wp(l);let o=l.tag||wt;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[zo]&&(a.push(u),Qs(u,fa(u,r,n,s)),Ip.set(u,Dp(u.el)))}i=t.default?jl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&Qs(u,fa(u,r,n,s))}return at(o,null,i)}}}),ly=iy;function ry(e){const t=e.el;t[gl]&&t[gl](),t[wu]&&t[wu]()}function oy(e){Np.set(e,Dp(e.el))}function cy(e){const t=Ip.get(e),s=Np.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Dp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function uy(e,t,s){const n=e.cloneNode(),a=e[pa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Sp(n);return i.removeChild(n),l}const hn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return fe(t)?s=>ia(t,s):t};function dy(e){e.target.composing=!0}function Su(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const fs=Symbol("_assign");function Tu(e,t,s){return t&&(e=e.trim()),s&&(e=Ll(e)),e}const ml={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[fs]=hn(a);const i=n||a.props&&a.props.type==="number";Hs(e,t?"change":"input",l=>{l.target.composing||e[fs](Tu(e.value,s,i))}),(s||i)&&Hs(e,"change",()=>{e.value=Tu(e.value,s,i)}),t||(Hs(e,"compositionstart",dy),Hs(e,"compositionend",Su),Hs(e,"change",Su))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[fs]=hn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Ll(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Go={deep:!0,created(e,t,s){e[fs]=hn(s),Hs(e,"change",()=>{const n=e._modelValue,a=ha(e),i=e.checked,l=e[fs];if(fe(n)){const r=Ml(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Fn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Lp(e,i))})},mounted:Cu,beforeUpdate(e,t,s){e[fs]=hn(s),Cu(e,t,s)}};function Cu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(fe(t))a=Ml(t,n.props.value)>-1;else if(Fn(t))a=t.has(n.props.value);else{if(t===s)return;a=Ws(t,Lp(e,!0))}e.checked!==a&&(e.checked=a)}const Ko={created(e,{value:t},s){e.checked=Ws(t,s.props.value),e[fs]=hn(s),Hs(e,"change",()=>{e[fs](ha(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[fs]=hn(n),t!==s&&(e.checked=Ws(t,n.props.value))}},Op={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Fn(t);Hs(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Ll(ha(l)):ha(l));e[fs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[fs]=hn(n)},mounted(e,{value:t}){Eu(e,t)},beforeUpdate(e,t,s){e[fs]=hn(s)},updated(e,{value:t}){e._assigning||Eu(e,t)}};function Eu(e,t){const s=e.multiple,n=fe(t);if(!(s&&!n&&!Fn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ha(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=Ml(t,r)>-1}else l.selected=t.has(r);else if(Ws(ha(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ha(e){return"_value"in e?e._value:e.value}function Lp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Pp={created(e,t,s){Hi(e,t,s,null,"created")},mounted(e,t,s){Hi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Hi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Hi(e,t,s,n,"updated")}};function Mp(e,t){switch(e){case"SELECT":return Op;case"TEXTAREA":return ml;default:switch(t){case"checkbox":return Go;case"radio":return Ko;default:return ml}}}function Hi(e,t,s,n,a){const l=Mp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function fy(){ml.getSSRProps=({value:e})=>({value:e}),Ko.getSSRProps=({value:e},t)=>{if(t.props&&Ws(t.props.value,e))return{checked:!0}},Go.getSSRProps=({value:e},t)=>{if(fe(e)){if(t.props&&Ml(e,t.props.value)>-1)return{checked:!0}}else if(Fn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Pp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Mp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const py=["ctrl","shift","alt","meta"],hy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>py.some(s=>e[`${s}Key`]&&!t.includes(s))},gy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=hy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},my={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},vy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=Qt(a.key);if(t.some(l=>l===i||my[l]===i))return e(a)}))},Fp=De({patchProp:Ep},xp);let Ja,Au=!1;function $p(){return Ja||(Ja=Qf(Fp))}function Bp(){return Ja=Au?Ja:Xf(Fp),Au=!0,Ja}const Up=((...e)=>{$p().render(...e)}),by=((...e)=>{Bp().hydrate(...e)}),vl=((...e)=>{const t=$p().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Vp(n);if(!a)return;const i=t._component;!ke(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,jp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Hp=((...e)=>{const t=Bp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Vp(n);if(a)return s(a,!0,jp(a))},t});function jp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Vp(e){return Se(e)?document.querySelector(e):e}let Ru=!1;const yy=()=>{Ru||(Ru=!0,fy(),Ub())},xy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Cf,BaseTransitionPropsValidators:Do,Comment:dt,DeprecationTypes:Db,EffectScope:ko,ErrorCodes:Pm,ErrorTypeStrings:Tb,Fragment:wt,KeepAlive:hv,ReactiveEffect:Za,Static:An,Suspense:lb,Teleport:Ym,Text:fn,TrackOpTypes:Am,Transition:Mb,TransitionGroup:ly,TriggerOpTypes:Rm,VueElement:Jl,assertNumber:Lm,callWithAsyncErrorHandling:ss,callWithErrorHandling:wa,camelize:Ge,capitalize:$n,cloneVNode:Rs,compatUtils:Nb,computed:te,createApp:vl,createBlock:ul,createCommentVNode:cp,createElementBlock:fb,createElementVNode:jo,createHydrationRenderer:Xf,createPropsRestProxy:Mv,createRenderer:Qf,createSSRApp:Hp,createSlots:_v,createStaticVNode:gb,createTextVNode:Vo,createVNode:at,customRef:uf,defineAsyncComponent:fv,defineComponent:_i,defineCustomElement:Ap,defineEmits:Cv,defineExpose:Ev,defineModel:Iv,defineOptions:Av,defineProps:Tv,defineSSRCustomElement:ey,defineSlots:Rv,devtools:Cb,effect:Qg,effectScope:Wg,getCurrentInstance:qt,getCurrentScope:zd,getCurrentWatcher:Im,getTransitionRawChildren:jl,guardReactiveProps:op,h:Wl,handleError:Bn,hasInjectionContext:Vm,hydrate:by,hydrateOnIdle:lv,hydrateOnInteraction:uv,hydrateOnMediaQuery:cv,hydrateOnVisible:ov,initCustomFormatter:kb,initDirectivesForSSR:yy,inject:us,isMemoSame:vp,isProxy:yi,isReactive:zs,isReadonly:As,isRef:gt,isRuntimeOnly:yb,isShallow:Zt,isVNode:Xs,markRaw:of,mergeDefaults:Lv,mergeModels:Pv,mergeProps:up,nextTick:Et,nodeOps:xp,normalizeClass:bi,normalizeProps:Pg,normalizeStyle:vi,onActivated:Af,onBeforeMount:Nf,onBeforeUnmount:zl,onBeforeUpdate:Lo,onDeactivated:Rf,onErrorCaptured:Pf,onMounted:$e,onRenderTracked:Lf,onRenderTriggered:Of,onScopeDispose:Jg,onServerPrefetch:Df,onUnmounted:ft,onUpdated:ql,onWatcherCleanup:ff,openBlock:ri,patchProp:Ep,popScopeId:Um,provide:Ga,proxyRefs:Ao,pushScopeId:Bm,queuePostFlushCb:si,reactive:gn,readonly:sl,ref:h,registerRuntimeCompiler:hp,render:Up,renderList:xv,renderSlot:kv,resolveComponent:vv,resolveDirective:yv,resolveDynamicComponent:bv,resolveFilter:Ib,resolveTransitionHooks:fa,setBlockTracking:oi,setDevtoolsHook:Eb,setTransitionHooks:Qs,shallowReactive:Co,shallowReadonly:mm,shallowRef:Eo,ssrContextKey:bf,ssrUtils:Rb,stop:Xg,toDisplayString:Vd,toHandlerKey:aa,toHandlers:wv,toRaw:Fe,toRef:Tm,toRefs:km,toValue:ym,transformVNodeArgs:pb,triggerRef:bm,unref:Es,useAttrs:Ov,useCssModule:ny,useCssVars:Hb,useHost:Rp,useId:Xm,useModel:zv,useSSRContext:yf,useShadowRoot:sy,useSlots:Dv,useTemplateRef:Zm,useTransitionState:No,vModelCheckbox:Go,vModelDynamic:Pp,vModelRadio:Ko,vModelSelect:Op,vModelText:ml,vShow:Tp,version:bp,warn:Sb,watch:ds,watchEffect:qm,watchPostEffect:zm,watchSyncEffect:xf,withAsyncContext:Fv,withCtx:Io,withDefaults:Nv,withDirectives:jm,withKeys:vy,withMemo:wb,withModifiers:gy,withScopeId:Hm},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ui=Symbol(""),Ya=Symbol(""),Wo=Symbol(""),bl=Symbol(""),qp=Symbol(""),Ln=Symbol(""),zp=Symbol(""),Gp=Symbol(""),Jo=Symbol(""),Yo=Symbol(""),Si=Symbol(""),Qo=Symbol(""),Kp=Symbol(""),Xo=Symbol(""),Zo=Symbol(""),ec=Symbol(""),tc=Symbol(""),sc=Symbol(""),nc=Symbol(""),Wp=Symbol(""),Jp=Symbol(""),Yl=Symbol(""),yl=Symbol(""),ac=Symbol(""),ic=Symbol(""),di=Symbol(""),Ti=Symbol(""),lc=Symbol(""),so=Symbol(""),_y=Symbol(""),no=Symbol(""),xl=Symbol(""),ky=Symbol(""),wy=Symbol(""),rc=Symbol(""),Sy=Symbol(""),Ty=Symbol(""),oc=Symbol(""),Yp=Symbol(""),ga={[ui]:"Fragment",[Ya]:"Teleport",[Wo]:"Suspense",[bl]:"KeepAlive",[qp]:"BaseTransition",[Ln]:"openBlock",[zp]:"createBlock",[Gp]:"createElementBlock",[Jo]:"createVNode",[Yo]:"createElementVNode",[Si]:"createCommentVNode",[Qo]:"createTextVNode",[Kp]:"createStaticVNode",[Xo]:"resolveComponent",[Zo]:"resolveDynamicComponent",[ec]:"resolveDirective",[tc]:"resolveFilter",[sc]:"withDirectives",[nc]:"renderList",[Wp]:"renderSlot",[Jp]:"createSlots",[Yl]:"toDisplayString",[yl]:"mergeProps",[ac]:"normalizeClass",[ic]:"normalizeStyle",[di]:"normalizeProps",[Ti]:"guardReactiveProps",[lc]:"toHandlers",[so]:"camelize",[_y]:"capitalize",[no]:"toHandlerKey",[xl]:"setBlockTracking",[ky]:"pushScopeId",[wy]:"popScopeId",[rc]:"withCtx",[Sy]:"unref",[Ty]:"isRef",[oc]:"withMemo",[Yp]:"isMemoSame"};function Cy(e){Object.getOwnPropertySymbols(e).forEach(t=>{ga[t]=e[t]})}const is={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ey(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:is}}function fi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=is){return e&&(r?(e.helper(Ln),e.helper(ba(e.inSSR,c))):e.helper(va(e.inSSR,c)),l&&e.helper(sc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function Rn(e,t=is){return{type:17,loc:t,elements:e}}function cs(e,t=is){return{type:15,loc:t,properties:e}}function ht(e,t){return{type:16,loc:is,key:Se(e)?Ee(e,!0):e,value:t}}function Ee(e,t=!1,s=is,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function vs(e,t=is){return{type:8,loc:t,children:e}}function xt(e,t=[],s=is){return{type:14,loc:s,callee:e,arguments:t}}function ma(e,t=void 0,s=!1,n=!1,a=is){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function ao(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:is}}function Ay(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:is}}function Ry(e){return{type:21,body:e,loc:is}}function va(e,t){return e||t?Jo:Yo}function ba(e,t){return e||t?zp:Gp}function cc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(va(n,e.isComponent)),t(Ln),t(ba(n,e.isComponent)))}const Iu=new Uint8Array([123,123]),Nu=new Uint8Array([125,125]);function Du(e){return e>=97&&e<=122||e>=65&&e<=90}function es(e){return e===32||e===10||e===9||e===12||e===13}function nn(e){return e===47||e===62||es(e)}function _l(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Dt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Iy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Iu,this.delimiterClose=Nu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Iu,this.delimiterClose=Nu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?nn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Dt.TitleEnd||this.currentSequence===Dt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Dt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Dt.Cdata.length&&(this.state=28,this.currentSequence=Dt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Du(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){nn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(nn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(_l("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Du(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||nn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||nn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||nn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||nn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||nn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Dt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Dt.ScriptEnd[3]?this.startSpecial(Dt.ScriptEnd,4):t===Dt.StyleEnd[3]?this.startSpecial(Dt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Dt.TitleEnd[3]?this.startSpecial(Dt.TitleEnd,4):t===Dt.TextareaEnd[3]?this.startSpecial(Dt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Ou(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function In(e,t){const s=Ou("MODE",t),n=Ou(e,t);return s===3?n===!0:n!==!1}function pi(e,t,s,...n){return In(e,t)}function uc(e){throw e}function Qp(e){}function tt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const Xt=e=>e.type===4&&e.isStatic;function Xp(e){switch(e){case"Teleport":case"teleport":return Ya;case"Suspense":case"suspense":return Wo;case"KeepAlive":case"keep-alive":return bl;case"BaseTransition":case"base-transition":return qp}}const Ny=/^$|^\d|[^\$\w\xA0-\uFFFF]/,dc=e=>!Ny.test(e),Zp=/[A-Za-z_$\xA0-\uFFFF]/,Dy=/[\.\?\w$\xA0-\uFFFF]/,Oy=/\s+[.[]\s*|\s*[.[]\s+/g,eh=e=>e.type===4?e.content:e.loc.source,Ly=e=>{const t=eh(e).trim().replace(Oy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Zp:Dy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},th=Ly,Py=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,My=e=>Py.test(eh(e)),Fy=My;function os(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Se(t)?a.name===t:t.test(a.name)))return a}}function Ql(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&wn(i.arg,t))return i}}function wn(e,t){return!!(e&&Xt(e)&&e.content===t)}function $y(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function kr(e){return e.type===5||e.type===2}function Lu(e){return e.type===7&&e.name==="pre"}function By(e){return e.type===7&&e.name==="slot"}function kl(e){return e.type===1&&e.tagType===3}function wl(e){return e.type===1&&e.tagType===2}const Uy=new Set([di,Ti]);function sh(e,t=[]){if(e&&!Se(e)&&e.type===14){const s=e.callee;if(!Se(s)&&Uy.has(s))return sh(e.arguments[0],t.concat(e))}return[e,t]}function Sl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Se(a)&&a.type===14){const r=sh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Se(a))n=cs([t]);else if(a.type===14){const r=a.arguments[0];!Se(r)&&r.type===15?Pu(t,r)||r.properties.unshift(t):a.callee===lc?n=xt(s.helper(yl),[cs([t]),a]):a.arguments.unshift(cs([t])),!n&&(n=a)}else a.type===15?(Pu(t,a)||a.properties.unshift(t),n=a):(n=xt(s.helper(yl),[cs([t]),a]),l&&l.callee===Ti&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Pu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function hi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Hy(e){return e.type===14&&e.callee===oc?e.arguments[1].returns:e}const jy=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function nh(e){for(let t=0;t<e.length;t++)if(!es(e.charCodeAt(t)))return!1;return!0}function fc(e){return e.type===2&&nh(e.content)||e.type===12&&fc(e.content)}function ah(e){return e.type===3||fc(e)}const ih={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ea,isPreTag:ea,isIgnoreNewlineTag:ea,isCustomElement:ea,onError:uc,onWarn:Qp,comments:!1,prefixIdentifiers:!1};let Be=ih,gi=null,Ks="",Lt=null,Pe=null,Kt="",Ps=-1,_n=-1,pc=0,un=!1,io=null;const et=[],ot=new Iy(et,{onerr:Ds,ontext(e,t){ji(Ct(e,t),e,t)},ontextentity(e,t,s){ji(e,t,s)},oninterpolation(e,t){if(un)return ji(Ct(e,t),e,t);let s=e+ot.delimiterOpen.length,n=t-ot.delimiterClose.length;for(;es(Ks.charCodeAt(s));)s++;for(;es(Ks.charCodeAt(n-1));)n--;let a=Ct(s,n);a.includes("&")&&(a=Be.decodeEntities(a,!1)),lo({type:5,content:Yi(a,!1,ut(s,n)),loc:ut(e,t)})},onopentagname(e,t){const s=Ct(e,t);Lt={type:1,tag:s,ns:Be.getNamespace(s,et[0],Be.ns),tagType:0,props:[],children:[],loc:ut(e-1,t),codegenNode:void 0}},onopentagend(e){Fu(e)},onclosetag(e,t){const s=Ct(e,t);if(!Be.isVoidTag(s)){let n=!1;for(let a=0;a<et.length;a++)if(et[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ds(24,et[0].loc.start.offset);for(let l=0;l<=a;l++){const r=et.shift();Ji(r,t,l<a)}break}n||Ds(23,lh(e,60))}},onselfclosingtag(e){const t=Lt.tag;Lt.isSelfClosing=!0,Fu(e),et[0]&&et[0].tag===t&&Ji(et.shift(),e)},onattribname(e,t){Pe={type:6,name:Ct(e,t),nameLoc:ut(e,t),value:void 0,loc:ut(e)}},ondirname(e,t){const s=Ct(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!un&&n===""&&Ds(26,e),un||n==="")Pe={type:6,name:s,nameLoc:ut(e,t),value:void 0,loc:ut(e)};else if(Pe={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ee("prop")]:[],loc:ut(e)},n==="pre"){un=ot.inVPre=!0,io=Lt;const a=Lt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Xy(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ct(e,t);if(un&&!Lu(Pe))Pe.name+=s,Sn(Pe.nameLoc,t);else{const n=s[0]!=="[";Pe.arg=Yi(n?s:s.slice(1,-1),n,ut(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ct(e,t);if(un&&!Lu(Pe))Pe.name+="."+s,Sn(Pe.nameLoc,t);else if(Pe.name==="slot"){const n=Pe.arg;n&&(n.content+="."+s,Sn(n.loc,t))}else{const n=Ee(s,!0,ut(e,t));Pe.modifiers.push(n)}},onattribdata(e,t){Kt+=Ct(e,t),Ps<0&&(Ps=e),_n=t},onattribentity(e,t,s){Kt+=e,Ps<0&&(Ps=t),_n=s},onattribnameend(e){const t=Pe.loc.start.offset,s=Ct(t,e);Pe.type===7&&(Pe.rawName=s),Lt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ds(2,t)},onattribend(e,t){if(Lt&&Pe){if(Sn(Pe.loc,t),e!==0)if(Kt.includes("&")&&(Kt=Be.decodeEntities(Kt,!0)),Pe.type===6)Pe.name==="class"&&(Kt=oh(Kt).trim()),e===1&&!Kt&&Ds(13,t),Pe.value={type:2,content:Kt,loc:e===1?ut(Ps,_n):ut(Ps-1,_n+1)},ot.inSFCRoot&&Lt.tag==="template"&&Pe.name==="lang"&&Kt&&Kt!=="html"&&ot.enterRCDATA(_l("</template"),0);else{let s=0;Pe.exp=Yi(Kt,!1,ut(Ps,_n),0,s),Pe.name==="for"&&(Pe.forParseResult=qy(Pe.exp));let n=-1;Pe.name==="bind"&&(n=Pe.modifiers.findIndex(a=>a.content==="sync"))>-1&&pi("COMPILER_V_BIND_SYNC",Be,Pe.loc,Pe.arg.loc.source)&&(Pe.name="model",Pe.modifiers.splice(n,1))}(Pe.type!==7||Pe.name!=="pre")&&Lt.props.push(Pe)}Kt="",Ps=_n=-1},oncomment(e,t){Be.comments&&lo({type:3,content:Ct(e,t),loc:ut(e-4,t+3)})},onend(){const e=Ks.length;for(let t=0;t<et.length;t++)Ji(et[t],e-1),Ds(24,et[t].loc.start.offset)},oncdata(e,t){(et[0]?et[0].ns:Be.ns)!==0?ji(Ct(e,t),e,t):Ds(1,e-9)},onprocessinginstruction(e){(et[0]?et[0].ns:Be.ns)===0&&Ds(21,e-1)}}),Mu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Vy=/^\(|\)$/g;function qy(e){const t=e.loc,s=e.content,n=s.match(jy);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const m=t.start.offset+f,g=m+d.length;return Yi(d,!1,ut(m,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Vy,"").trim();const c=a.indexOf(o),u=o.match(Mu);if(u){o=o.replace(Mu,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ct(e,t){return Ks.slice(e,t)}function Fu(e){ot.inSFCRoot&&(Lt.innerLoc=ut(e+1,e+1)),lo(Lt);const{tag:t,ns:s}=Lt;s===0&&Be.isPreTag(t)&&pc++,Be.isVoidTag(t)?Ji(Lt,e):(et.unshift(Lt),(s===1||s===2)&&(ot.inXML=!0)),Lt=null}function ji(e,t,s){{const i=et[0]&&et[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Be.decodeEntities(e,!1))}const n=et[0]||gi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Sn(a.loc,s)):n.children.push({type:2,content:e,loc:ut(t,s)})}function Ji(e,t,s=!1){s?Sn(e.loc,lh(t,60)):Sn(e.loc,zy(t,62)+1),ot.inSFCRoot&&(e.children.length?e.innerLoc.end=De({},e.children[e.children.length-1].loc.end):e.innerLoc.end=De({},e.innerLoc.start),e.innerLoc.source=Ct(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(un||(n==="slot"?e.tagType=2:$u(e)?e.tagType=3:Ky(e)&&(e.tagType=1)),ot.inRCDATA||(e.children=rh(i)),a===0&&Be.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Be.isPreTag(n)&&pc--,io===e&&(un=ot.inVPre=!1,io=null),ot.inXML&&(et[0]?et[0].ns:Be.ns)===0&&(ot.inXML=!1);{const l=e.props;if(!ot.inSFCRoot&&In("COMPILER_NATIVE_TEMPLATE",Be)&&e.tag==="template"&&!$u(e)){const o=et[0]||gi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&pi("COMPILER_INLINE_TEMPLATE",Be,r.loc)&&e.children.length&&(r.value={type:2,content:Ct(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function zy(e,t){let s=e;for(;Ks.charCodeAt(s)!==t&&s<Ks.length-1;)s++;return s}function lh(e,t){let s=e;for(;Ks.charCodeAt(s)!==t&&s>=0;)s--;return s}const Gy=new Set(["if","else","else-if","for","slot"]);function $u({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Gy.has(t[s].name))return!0}return!1}function Ky({tag:e,props:t}){if(Be.isCustomElement(e))return!1;if(e==="component"||Wy(e.charCodeAt(0))||Xp(e)||Be.isBuiltInComponent&&Be.isBuiltInComponent(e)||Be.isNativeTag&&!Be.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(pi("COMPILER_IS_ON_ELEMENT",Be,n.loc))return!0}}else if(n.name==="bind"&&wn(n.arg,"is")&&pi("COMPILER_IS_ON_ELEMENT",Be,n.loc))return!0}return!1}function Wy(e){return e>64&&e<91}const Jy=/\r\n/g;function rh(e){const t=Be.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(pc)a.content=a.content.replace(Jy,`
`);else if(nh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Yy(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=oh(a.content))}return s?e.filter(Boolean):e}function Yy(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function oh(e){let t="",s=!1;for(let n=0;n<e.length;n++)es(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function lo(e){(et[0]||gi).children.push(e)}function ut(e,t){return{start:ot.getPos(e),end:t==null?t:ot.getPos(t),source:t==null?t:Ct(e,t)}}function Qy(e){return ut(e.start.offset,e.end.offset)}function Sn(e,t){e.end=ot.getPos(t),e.source=Ct(e.start.offset,t)}function Xy(e){const t={type:6,name:e.rawName,nameLoc:ut(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Yi(e,t=!1,s,n=0,a=0){return Ee(e,t,s,n)}function Ds(e,t,s){Be.onError(tt(e,ut(t,t)))}function Zy(){ot.reset(),Lt=null,Pe=null,Kt="",Ps=-1,_n=-1,et.length=0}function ex(e,t){if(Zy(),Ks=e,Be=De({},ih),t){let a;for(a in t)t[a]!=null&&(Be[a]=t[a])}ot.mode=Be.parseMode==="html"?1:Be.parseMode==="sfc"?2:0,ot.inXML=Be.ns===1||Be.ns===2;const s=t&&t.delimiters;s&&(ot.delimiterOpen=_l(s[0]),ot.delimiterClose=_l(s[1]));const n=gi=Ey([],e);return ot.parse(Ks),n.loc=ut(0,e.length),n.children=rh(n.children),gi=null,n}function tx(e,t){Qi(e,void 0,t,!!ch(e))}function ch(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!wl(t[0])?t[0]:null}function Qi(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:ts(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const m=p.patchFlag;if((m===void 0||m===512||m===1)&&dh(d,s)>=2){const g=fh(d);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:ts(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,Qi(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)Qi(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)Qi(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&fe(e.codegenNode.children))e.codegenNode.children=o(Rn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!fe(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(Rn(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!fe(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=os(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(Rn(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!fe(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ts(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=dh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ts(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=ts(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(Ln),t.removeHelper(ba(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(va(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ts(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Se(r)||$t(r))continue;const o=ts(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const sx=new Set([ac,ic,di,Ti]);function uh(e,t){if(e.type===14&&!Se(e.callee)&&sx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ts(s,t);if(s.type===14)return uh(s,t)}return 0}function dh(e,t){let s=3;const n=fh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ts(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ts(r,t):r.type===14?c=uh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function fh(e){const t=e.codegenNode;if(t.type===13)return t.props}function nx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=It,isCustomElement:u=It,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:m=!1,inSSR:g=!1,ssrCssVars:k="",bindingMetadata:C=Oe,inline:v=!1,isTS:b=!1,onError:x=uc,onWarn:E=Qp,compatConfig:S}){const N=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),w={filename:t,selfName:N&&$n(Ge(N[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:m,inSSR:g,ssrCssVars:k,bindingMetadata:C,inline:v,isTS:b,onError:x,onWarn:E,compatConfig:S,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(A){const O=w.helpers.get(A)||0;return w.helpers.set(A,O+1),A},removeHelper(A){const O=w.helpers.get(A);if(O){const j=O-1;j?w.helpers.set(A,j):w.helpers.delete(A)}},helperString(A){return`_${ga[w.helper(A)]}`},replaceNode(A){w.parent.children[w.childIndex]=w.currentNode=A},removeNode(A){const O=w.parent.children,j=A?O.indexOf(A):w.currentNode?w.childIndex:-1;!A||A===w.currentNode?(w.currentNode=null,w.onNodeRemoved()):w.childIndex>j&&(w.childIndex--,w.onNodeRemoved()),w.parent.children.splice(j,1)},onNodeRemoved:It,addIdentifiers(A){},removeIdentifiers(A){},hoist(A){Se(A)&&(A=Ee(A)),w.hoists.push(A);const O=Ee(`_hoisted_${w.hoists.length}`,!1,A.loc,2);return O.hoisted=A,O},cache(A,O=!1,j=!1){const M=Ay(w.cached.length,A,O,j);return w.cached.push(M),M}};return w.filters=new Set,w}function ax(e,t){const s=nx(e,t);Xl(e,s),t.hoistStatic&&tx(e,s),t.ssr||ix(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function ix(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=ch(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&cc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=fi(t,s(ui),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function lx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Se(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Xl(a,t))}}function Xl(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(fe(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Si);break;case 5:t.ssr||t.helper(Yl);break;case 9:for(let i=0;i<e.branches.length;i++)Xl(e.branches[i],t);break;case 10:case 11:case 1:case 0:lx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function ph(e,t){const s=Se(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(By))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Zl="/*@__PURE__*/",hh=e=>`${ga[e]}: _${ga[e]}`;function rx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${ga[g]}`},push(g,k=-2,C){p.code+=g},indent(){m(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:m(--p.indentLevel)},newline(){m(p.indentLevel)}};function m(g){p.push(`
`+"  ".repeat(g),0)}return p}function ox(e,t={}){const s=rx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";cx(e,s);const g=u?"ssrRender":"render",C=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${C}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(hh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(wr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(wr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),wr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let v=0;v<e.temps;v++)a(`${v>0?", ":""}_temp${v}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?Ft(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function cx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[Jo,Yo,Si,Qo,Kp].filter(f=>u.includes(f)).map(hh).join(", ");a(`const { ${d} } = _Vue
`,-1)}ux(e.hoists,t),i(),a("return ")}function wr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?tc:t==="component"?Xo:ec);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${hi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function ux(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Ft(i,t),n())}t.pure=!1}function hc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ci(e,t,s),s&&t.deindent(),t.push("]")}function Ci(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Se(r)?a(r,-3):fe(r)?hc(r,t):Ft(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Ft(e,t){if(Se(e)){t.push(e,-3);return}if($t(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Ft(e.codegenNode,t);break;case 2:dx(e,t);break;case 4:gh(e,t);break;case 5:fx(e,t);break;case 12:Ft(e.codegenNode,t);break;case 8:mh(e,t);break;case 3:hx(e,t);break;case 13:gx(e,t);break;case 14:vx(e,t);break;case 15:bx(e,t);break;case 17:yx(e,t);break;case 18:xx(e,t);break;case 19:_x(e,t);break;case 20:kx(e,t);break;case 21:Ci(e.body,t,!0,!1);break}}function dx(e,t){t.push(JSON.stringify(e.content),-3,e)}function gh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function fx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Zl),s(`${n(Yl)}(`),Ft(e.content,t),s(")")}function mh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Se(n)?t.push(n,-3):Ft(n,t)}}function px(e,t){const{push:s}=t;if(e.type===8)s("["),mh(e,t),s("]");else if(e.isStatic){const n=dc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function hx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Zl),s(`${n(Si)}(${JSON.stringify(e.content)})`,-3,e)}function gx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let m;o&&(m=String(o)),u&&s(n(sc)+"("),d&&s(`(${n(Ln)}(${f?"true":""}), `),a&&s(Zl);const g=d?ba(t.inSSR,p):va(t.inSSR,p);s(n(g)+"(",-2,e),Ci(mx([i,l,r,m,c]),t),s(")"),d&&s(")"),u&&(s(", "),Ft(u,t),s(")"))}function mx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function vx(e,t){const{push:s,helper:n,pure:a}=t,i=Se(e.callee)?e.callee:n(e.callee);a&&s(Zl),s(i+"(",-2,e),Ci(e.arguments,t),s(")")}function bx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];px(c,t),s(": "),Ft(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function yx(e,t){hc(e.elements,t)}function xx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${ga[rc]}(`),s("(",-2,e),fe(i)?Ci(i,t):i&&Ft(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),fe(l)?hc(l,t):Ft(l,t)):r&&Ft(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function _x(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!dc(s.content);d&&l("("),gh(s,t),d&&l(")")}else l("("),Ft(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Ft(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,Ft(a,t),u||t.indentLevel--,i&&o(!0)}function kx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(xl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Ft(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(xl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const wx=ph(/^(?:if|else|else-if)$/,(e,t,s)=>Sx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Uu(a,o,s);else{const c=Tx(n.codegenNode);c.alternate=Uu(a,o+n.branches.length-1,s)}}}));function Sx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(tt(28,t.loc)),t.exp=Ee("true",!1,a)}if(t.name==="if"){const a=Bu(e,t),i={type:9,loc:Qy(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&ah(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(tt(30,e.loc)),s.removeNode();const r=Bu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Xl(r,s),o&&o(),s.currentNode=null}else s.onError(tt(30,e.loc));break}}}function Bu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!os(e,"for")?e.children:[e],userKey:Ql(e,"key"),isTemplateIf:s}}function Uu(e,t,s){return e.condition?ao(e.condition,Hu(e,t,s),xt(s.helper(Si),['""',"true"])):Hu(e,t,s)}function Hu(e,t,s){const{helper:n}=s,a=ht("key",Ee(`${t}`,!1,is,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Sl(o,a,s),o}else return fi(s,n(ui),cs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Hy(o);return c.type===13&&cc(c,s),Sl(c,a,s),o}}function Tx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Cx=ph("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Ex(e,t,s,i=>{const l=xt(n(nc),[i.source]),r=kl(e),o=os(e,"memo"),c=Ql(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Ee(c.value.content,!0):void 0:c.exp);const d=u?ht("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=fi(s,n(ui),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let m;const{children:g}=i,k=g.length!==1||g[0].type!==1,C=wl(e)?e:r&&e.children.length===1&&wl(e.children[0])?e.children[0]:null;if(C?(m=C.codegenNode,r&&d&&Sl(m,d,s)):k?m=fi(s,n(ui),d?cs([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=g[0].codegenNode,r&&d&&Sl(m,d,s),m.isBlock!==!f&&(m.isBlock?(a(Ln),a(ba(s.inSSR,m.isComponent))):a(va(s.inSSR,m.isComponent))),m.isBlock=!f,m.isBlock?(n(Ln),n(ba(s.inSSR,m.isComponent))):n(va(s.inSSR,m.isComponent))),o){const v=ma(ro(i.parseResult,[Ee("_cached")]));v.body=Ry([vs(["const _memo = (",o.exp,")"]),vs(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(Yp)}(_cached, _memo)) return _cached`]),vs(["const _item = ",m]),Ee("_item.memo = _memo"),Ee("return _item")]),l.arguments.push(v,Ee("_cache"),Ee(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ma(ro(i.parseResult),m,!0))}})});function Ex(e,t,s,n){if(!t.exp){s.onError(tt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(tt(32,t.loc));return}vh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:kl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function vh(e,t){e.finalized||(e.finalized=!0)}function ro({value:e,key:t,index:s},n=[]){return Ax([e,t,s,...n])}function Ax(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ee("_".repeat(n+1),!1))}const ju=Ee("undefined",!1),Rx=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=os(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Ix=(e,t,s,n)=>ma(e,s,!1,!0,s.length?s[0].loc:n);function Nx(e,t,s=Ix){t.helper(rc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=os(e,"slot",!0);if(o){const{arg:k,exp:C}=o;k&&!Xt(k)&&(r=!0),i.push(ht(k||Ee("default",!0),s(C,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let k=0;k<n.length;k++){const C=n[k];let v;if(!kl(C)||!(v=os(C,"slot",!0))){C.type!==3&&d.push(C);continue}if(o){t.onError(tt(37,v.loc));break}c=!0;const{children:b,loc:x}=C,{arg:E=Ee("default",!0),exp:S,loc:N}=v;let w;Xt(E)?w=E?E.content:"default":r=!0;const A=os(C,"for"),O=s(S,A,b,x);let j,M;if(j=os(C,"if"))r=!0,l.push(ao(j.exp,Vi(E,O,p++),ju));else if(M=os(C,/^else(?:-if)?$/,!0)){let L=k,J;for(;L--&&(J=n[L],!!ah(J)););if(J&&kl(J)&&os(J,/^(?:else-)?if$/)){let $=l[l.length-1];for(;$.alternate.type===19;)$=$.alternate;$.alternate=M.exp?ao(M.exp,Vi(E,O,p++),ju):Vi(E,O,p++)}else t.onError(tt(30,M.loc))}else if(A){r=!0;const L=A.forParseResult;L?(vh(L),l.push(xt(t.helper(nc),[L.source,ma(ro(L),Vi(E,O),!0)]))):t.onError(tt(32,A.loc))}else{if(w){if(f.has(w)){t.onError(tt(38,N));continue}f.add(w),w==="default"&&(u=!0)}i.push(ht(E,O))}}if(!o){const k=(C,v)=>{const b=s(C,void 0,v,a);return t.compatConfig&&(b.isNonScopedSlot=!0),ht("default",b)};c?d.length&&!d.every(fc)&&(u?t.onError(tt(39,d[0].loc)):i.push(k(void 0,d))):i.push(k(void 0,n))}const m=r?2:Xi(e.children)?3:1;let g=cs(i.concat(ht("_",Ee(m+"",!1))),a);return l.length&&(g=xt(t.helper(Jp),[g,Rn(l)])),{slots:g,hasDynamicSlots:r}}function Vi(e,t,s){const n=[ht("name",e),ht("fn",t)];return s!=null&&n.push(ht("key",Ee(String(s),!0))),cs(n)}function Xi(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Xi(s.children))return!0;break;case 9:if(Xi(s.branches))return!0;break;case 10:case 11:if(Xi(s.children))return!0;break}}return!1}const bh=new WeakMap,Dx=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?Ox(e,t):`"${n}"`;const r=Ue(l)&&l.callee===Zo;let o,c,u=0,d,f,p,m=r||l===Ya||l===Wo||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=yh(e,t,void 0,i,r);o=g.props,u=g.patchFlag,f=g.dynamicPropNames;const k=g.directives;p=k&&k.length?Rn(k.map(C=>Px(C,t))):void 0,g.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===bl&&(m=!0,u|=1024),i&&l!==Ya&&l!==bl){const{slots:k,hasDynamicSlots:C}=Nx(e,t);c=k,C&&(u|=1024)}else if(e.children.length===1&&l!==Ya){const k=e.children[0],C=k.type,v=C===5||C===8;v&&ts(k,t)===0&&(u|=1),v||C===2?c=k:c=e.children}else c=e.children;f&&f.length&&(d=Mx(f)),e.codegenNode=fi(t,l,o,c,u===0?void 0:u,d,p,!!m,!1,i,e.loc)};function Ox(e,t,s=!1){let{tag:n}=e;const a=oo(n),i=Ql(e,"is",!1,!0);if(i)if(a||In("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ee(i.value.content,!0):(r=i.exp,r||(r=Ee("is",!1,i.arg.loc))),r)return xt(t.helper(Zo),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Xp(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Xo),t.components.add(n),hi(n,"component"))}function yh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,m=0,g=!1,k=!1,C=!1,v=!1,b=!1,x=!1;const E=[],S=O=>{c.length&&(u.push(cs(Vu(c),r)),c=[]),O&&u.push(O)},N=()=>{t.scopes.vFor>0&&c.push(ht(Ee("ref_for",!0),Ee("true")))},w=({key:O,value:j})=>{if(Xt(O)){const M=O.content,L=Mn(M);if(L&&(!n||a)&&M.toLowerCase()!=="onclick"&&M!=="onUpdate:modelValue"&&!qs(M)&&(v=!0),L&&qs(M)&&(x=!0),L&&j.type===14&&(j=j.arguments[0]),j.type===20||(j.type===4||j.type===8)&&ts(j,t)>0)return;M==="ref"?g=!0:M==="class"?k=!0:M==="style"?C=!0:M!=="key"&&!E.includes(M)&&E.push(M),n&&(M==="class"||M==="style")&&!E.includes(M)&&E.push(M)}else b=!0};for(let O=0;O<s.length;O++){const j=s[O];if(j.type===6){const{loc:M,name:L,nameLoc:J,value:$}=j;let V=!0;if(L==="ref"&&(g=!0,N()),L==="is"&&(oo(l)||$&&$.content.startsWith("vue:")||In("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(ht(Ee(L,!0,J),Ee($?$.content:"",V,$?$.loc:M)))}else{const{name:M,arg:L,exp:J,loc:$,modifiers:V}=j,I=M==="bind",D=M==="on";if(M==="slot"){n||t.onError(tt(40,$));continue}if(M==="once"||M==="memo"||M==="is"||I&&wn(L,"is")&&(oo(l)||In("COMPILER_IS_ON_ELEMENT",t))||D&&i)continue;if((I&&wn(L,"key")||D&&f&&wn(L,"vue:before-update"))&&(p=!0),I&&wn(L,"ref")&&N(),!L&&(I||D)){if(b=!0,J)if(I){if(S(),In("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift(J);continue}N(),S(),u.push(J)}else S({type:14,loc:$,callee:t.helper(lc),arguments:n?[J]:[J,"true"]});else t.onError(tt(I?34:35,$));continue}I&&V.some(de=>de.content==="prop")&&(m|=32);const G=t.directiveTransforms[M];if(G){const{props:de,needRuntime:ve}=G(j,e,t);!i&&de.forEach(w),D&&L&&!Xt(L)?S(cs(de,r)):c.push(...de),ve&&(d.push(j),$t(ve)&&bh.set(j,ve))}else Cg(M)||(d.push(j),f&&(p=!0))}}let A;if(u.length?(S(),u.length>1?A=xt(t.helper(yl),u,r):A=u[0]):c.length&&(A=cs(Vu(c),r)),b?m|=16:(k&&!n&&(m|=2),C&&!n&&(m|=4),E.length&&(m|=8),v&&(m|=32)),!p&&(m===0||m===32)&&(g||x||d.length>0)&&(m|=512),!t.inSSR&&A)switch(A.type){case 15:let O=-1,j=-1,M=!1;for(let $=0;$<A.properties.length;$++){const V=A.properties[$].key;Xt(V)?V.content==="class"?O=$:V.content==="style"&&(j=$):V.isHandlerKey||(M=!0)}const L=A.properties[O],J=A.properties[j];M?A=xt(t.helper(di),[A]):(L&&!Xt(L.value)&&(L.value=xt(t.helper(ac),[L.value])),J&&(C||J.value.type===4&&J.value.content.trim()[0]==="["||J.value.type===17)&&(J.value=xt(t.helper(ic),[J.value])));break;case 14:break;default:A=xt(t.helper(di),[xt(t.helper(Ti),[A])]);break}return{props:A,directives:d,patchFlag:m,dynamicPropNames:E,shouldUseBlock:p}}function Vu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Mn(i))&&Lx(l,a):(t.set(i,a),s.push(a))}return s}function Lx(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Rn([e.value,t.value],e.loc)}function Px(e,t){const s=[],n=bh.get(e);n?s.push(t.helperString(n)):(t.helper(ec),t.directives.add(e.name),s.push(hi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ee("true",!1,a);s.push(cs(e.modifiers.map(l=>ht(l,i)),a))}return Rn(s,e.loc)}function Mx(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function oo(e){return e==="component"||e==="Component"}const Fx=(e,t)=>{if(wl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=$x(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ma([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=xt(t.helper(Wp),l,n)}};function $x(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Ge(l.name),a.push(l)));else if(l.name==="bind"&&wn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Ge(l.arg.content);s=l.exp=Ee(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Xt(l.arg)&&(l.arg.content=Ge(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=yh(e,t,a,!1,!1);n=i,l.length&&t.onError(tt(36,l[0].loc))}return{slotName:s,slotProps:n}}const xh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(tt(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?aa(Ge(d)):`on:${d}`;r=Ee(f,!0,l.loc)}else r=vs([`${s.helperString(no)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(no)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=th(o),f=!(d||Fy(o)),p=o.content.includes(";");(f||c&&d)&&(o=vs([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[ht(r,o||Ee("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},Bx=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Ge(i.content):i.content=`${s.helperString(so)}(${i.content})`:(i.children.unshift(`${s.helperString(so)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&qu(i,"."),n.some(r=>r.content==="attr")&&qu(i,"^")),{props:[ht(i,l)]}},qu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Ux=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(kr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(kr(o))n||(n=s[i]=vs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(kr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ts(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:xt(t.helper(Qo),r)}}}}},zu=new WeakSet,Hx=(e,t)=>{if(e.type===1&&os(e,"once",!0))return zu.has(e)||t.inVOnce||t.inSSR?void 0:(zu.add(e),t.inVOnce=!0,t.helper(xl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},_h=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(tt(41,e.loc)),La();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(tt(44,n.loc)),La();if(r==="literal-const"||r==="setup-const")return s.onError(tt(45,n.loc)),La();if(!l.trim()||!th(n))return s.onError(tt(42,n.loc)),La();const o=a||Ee("modelValue",!0),c=a?Xt(a)?`onUpdate:${Ge(a.content)}`:vs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=vs([`${d} => ((`,n,") = $event)"]);const f=[ht(o,e.exp),ht(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(dc(g)?g:JSON.stringify(g))+": true").join(", "),m=a?Xt(a)?`${a.content}Modifiers`:vs([a,' + "Modifiers"']):"modelModifiers";f.push(ht(m,Ee(`{ ${p} }`,!1,e.loc,2)))}return La(f)};function La(e=[]){return{props:e}}const jx=/[\w).+\-_$\]]/,Vx=(e,t)=>{In("COMPILER_FILTERS",t)&&(e.type===5?Tl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Tl(s.exp,t)}))};function Tl(e,t){if(e.type===4)Gu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Gu(n,t):n.type===8?Tl(e,t):n.type===5&&Tl(n.content,t))}}function Gu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,m,g=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)m===void 0?(u=p+1,m=s.slice(0,p).trim()):k();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let C=p-1,v;for(;C>=0&&(v=s.charAt(C),v===" ");C--);(!v||!jx.test(v))&&(l=!0)}}m===void 0?m=s.slice(0,p).trim():u!==0&&k();function k(){g.push(s.slice(u,p).trim()),u=p+1}if(g.length){for(p=0;p<g.length;p++)m=qx(m,g[p],t);e.content=m,e.ast=void 0}}function qx(e,t,s){s.helper(tc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${hi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${hi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const Ku=new WeakSet,zx=(e,t)=>{if(e.type===1){const s=os(e,"memo");return!s||Ku.has(e)||t.inSSR?void 0:(Ku.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&cc(n,t),e.codegenNode=xt(t.helper(oc),[s.exp,ma(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},Gx=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(tt(53,n.loc)),s.exp=Ee("",!0,n.loc);else{const a=Ge(n.content);(Zp.test(a[0])||a[0]==="-")&&(s.exp=Ee(a,!1,n.loc))}}}};function Kx(e){return[[Gx,Hx,wx,zx,Cx,Vx,Fx,Dx,Rx,Ux],{on:xh,bind:Bx,model:_h}]}function Wx(e,t={}){const s=t.onError||uc,n=t.mode==="module";t.prefixIdentifiers===!0?s(tt(48)):n&&s(tt(49));const a=!1;t.cacheHandlers&&s(tt(50)),t.scopeId&&!n&&s(tt(51));const i=De({},t,{prefixIdentifiers:a}),l=Se(e)?ex(e,i):e,[r,o]=Kx();return ax(l,De({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:De({},o,t.directiveTransforms||{})})),ox(l,i)}const Jx=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const kh=Symbol(""),wh=Symbol(""),Sh=Symbol(""),Th=Symbol(""),co=Symbol(""),Ch=Symbol(""),Eh=Symbol(""),Ah=Symbol(""),Rh=Symbol(""),Ih=Symbol("");Cy({[kh]:"vModelRadio",[wh]:"vModelCheckbox",[Sh]:"vModelText",[Th]:"vModelSelect",[co]:"vModelDynamic",[Ch]:"withModifiers",[Eh]:"withKeys",[Ah]:"vShow",[Rh]:"Transition",[Ih]:"TransitionGroup"});let Kn;function Yx(e,t=!1){return Kn||(Kn=document.createElement("div")),t?(Kn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Kn.children[0].getAttribute("foo")):(Kn.innerHTML=e,Kn.textContent)}const Qx={parseMode:"html",isVoidTag:Vg,isNativeTag:e=>Ug(e)||Hg(e)||jg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:Yx,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Rh;if(e==="TransitionGroup"||e==="transition-group")return Ih},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},Xx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ee("style",!0,t.loc),exp:Zx(t.value.content,t.loc),modifiers:[],loc:t.loc})})},Zx=(e,t)=>{const s=Ud(e);return Ee(JSON.stringify(s),!1,t,3)};function pn(e,t){return tt(e,t)}const e0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(54,a)),t.children.length&&(s.onError(pn(55,a)),t.children.length=0),{props:[ht(Ee("innerHTML",!0,a),n||Ee("",!0))]}},t0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(56,a)),t.children.length&&(s.onError(pn(57,a)),t.children.length=0),{props:[ht(Ee("textContent",!0),n?ts(n,s)>0?n:xt(s.helperString(Yl),[n],a):Ee("",!0))]}},s0=(e,t,s)=>{const n=_h(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(pn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Sh,r=!1;if(a==="input"||i){const o=Ql(t,"type");if(o){if(o.type===7)l=co;else if(o.value)switch(o.value.content){case"radio":l=kh;break;case"checkbox":l=wh;break;case"file":r=!0,s.onError(pn(60,e.loc));break}}else $y(t)&&(l=co)}else a==="select"&&(l=Th);r||(n.needRuntime=s.helper(l))}else s.onError(pn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},n0=as("passive,once,capture"),a0=as("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),i0=as("left,right"),Nh=as("onkeyup,onkeydown,onkeypress"),l0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&pi("COMPILER_V_ON_NATIVE",s)||n0(o)?l.push(o):i0(o)?Xt(e)?Nh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):a0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Wu=(e,t)=>Xt(e)&&e.content.toLowerCase()==="onclick"?Ee(t,!0):e.type!==4?vs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,r0=(e,t,s)=>xh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=l0(i,a,s,e.loc);if(o.includes("right")&&(i=Wu(i,"onContextmenu")),o.includes("middle")&&(i=Wu(i,"onMouseup")),o.length&&(l=xt(s.helper(Ch),[l,JSON.stringify(o)])),r.length&&(!Xt(i)||Nh(i.content.toLowerCase()))&&(l=xt(s.helper(Eh),[l,JSON.stringify(r)])),c.length){const u=c.map($n).join("");i=Xt(i)?Ee(`${i.content}${u}`,!0):vs(["(",i,`) + "${u}"`])}return{props:[ht(i,l)]}}),o0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(62,a)),{props:[],needRuntime:s.helper(Ah)}},c0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},u0=[Xx],d0={cloak:Jx,html:e0,text:t0,model:s0,on:r0,show:o0};function f0(e,t={}){return Wx(e,De({},Qx,t,{nodeTransforms:[c0,...u0,...t.nodeTransforms||[]],directiveTransforms:De({},d0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ju=Object.create(null);function p0(e,t){if(!Se(e))if(e.nodeType)e=e.innerHTML;else return It;const s=Rg(e,t),n=Ju[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=De({hoistStatic:!0,onError:void 0,onWarn:It},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=f0(e,a),l=new Function("Vue",i)(xy);return l._rc=!0,Ju[s]=l}hp(p0);const Cl=gn({items:[]});let h0=1;function er(e,t="info",s=3e3){const n=h0++;return Cl.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>gc(n),s),n}function gc(e){const t=Cl.items.findIndex(s=>s.id===e);t>=0&&Cl.items.splice(t,1)}function xe(e,t="info",s=3e3){return er(e,t,s)}xe.success=(e,t=3e3)=>er(e,"success",t);xe.error=(e,t=5e3)=>er(e,"error",t);xe.info=(e,t=3e3)=>er(e,"info",t);xe.dismiss=gc;const g0={setup(){return{state:Cl,dismiss:gc}},template:`
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
          <span class="toast-icon" aria-hidden="true">{{ t.type === 'success' ? '✓' : t.type === 'error' ? '⚠' : 'ℹ' }}</span>
          <span class="toast-text">{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  `},$s=gn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ua=null;function ns({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ua&&ua(!1),$s.title=e,$s.message=t,$s.confirmLabel=s,$s.cancelLabel=n,$s.danger=a,$s.open=!0,new Promise(i=>{ua=i})}function Sr(e){$s.open=!1,ua&&(ua(e),ua=null)}const m0={setup(){function e(t){$s.open&&(t.key==="Escape"&&(t.stopPropagation(),Sr(!1)),t.key==="Enter"&&(t.stopPropagation(),Sr(!0)))}return $e(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:$s,settle:Sr}},template:`
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay" @click.self="settle(false)" role="dialog" aria-modal="true" :aria-label="state.title">
        <div class="modal-content confirm-dialog">
          <h3 class="text-base font-semibold mb-2">{{ state.title }}</h3>
          <p class="text-sm text-gray-400 mb-4" style="white-space: pre-wrap;">{{ state.message }}</p>
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
 */const Xn=typeof document<"u";function Dh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function v0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Dh(e.default)}const Ve=Object.assign;function Tr(e,t){const s={};for(const n in t){const a=t[n];s[n]=ys(a)?a.map(e):e(a)}return s}const Qa=()=>{},ys=Array.isArray;function Yu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Oh=/#/g,b0=/&/g,y0=/\//g,x0=/=/g,_0=/\?/g,Lh=/\+/g,k0=/%5B/g,w0=/%5D/g,Ph=/%5E/g,S0=/%60/g,Mh=/%7B/g,T0=/%7C/g,Fh=/%7D/g,C0=/%20/g;function mc(e){return e==null?"":encodeURI(""+e).replace(T0,"|").replace(k0,"[").replace(w0,"]")}function E0(e){return mc(e).replace(Mh,"{").replace(Fh,"}").replace(Ph,"^")}function uo(e){return mc(e).replace(Lh,"%2B").replace(C0,"+").replace(Oh,"%23").replace(b0,"%26").replace(S0,"`").replace(Mh,"{").replace(Fh,"}").replace(Ph,"^")}function A0(e){return uo(e).replace(x0,"%3D")}function R0(e){return mc(e).replace(Oh,"%23").replace(_0,"%3F")}function I0(e){return R0(e).replace(y0,"%2F")}function mi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const N0=/\/$/,D0=e=>e.replace(N0,"");function Cr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=M0(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:mi(l)}}function O0(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Qu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function L0(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ya(t.matched[n],s.matched[a])&&$h(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ya(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function $h(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!P0(e[s],t[s]))return!1;return!0}function P0(e,t){return ys(e)?Xu(e,t):ys(t)?Xu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Xu(e,t){return ys(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function M0(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const an={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let fo=(function(e){return e.pop="pop",e.push="push",e})({}),Er=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function F0(e){if(!e)if(Xn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),D0(e)}const $0=/^[^#]+#/;function B0(e,t){return e.replace($0,"#")+t}function U0(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const tr=()=>({left:window.scrollX,top:window.scrollY});function H0(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=U0(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Zu(e,t){return(history.state?history.state.position-t:-1)+e}const po=new Map;function j0(e,t){po.set(e,t)}function V0(e){const t=po.get(e);return po.delete(e),t}function q0(e){return typeof e=="string"||e&&typeof e=="object"}function Bh(e){return typeof e=="string"||typeof e=="symbol"}let rt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Uh=Symbol("");rt.MATCHER_NOT_FOUND+"",rt.NAVIGATION_GUARD_REDIRECT+"",rt.NAVIGATION_ABORTED+"",rt.NAVIGATION_CANCELLED+"",rt.NAVIGATION_DUPLICATED+"";function xa(e,t){return Ve(new Error,{type:e,[Uh]:!0},t)}function Os(e,t){return e instanceof Error&&Uh in e&&(t==null||!!(e.type&t))}const z0=["params","query","hash"];function G0(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of z0)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function K0(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Lh," "),i=a.indexOf("="),l=mi(i<0?a:a.slice(0,i)),r=i<0?null:mi(a.slice(i+1));if(l in t){let o=t[l];ys(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function ed(e){let t="";for(let s in e){const n=e[s];if(s=A0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(ys(n)?n.map(a=>a&&uo(a)):[n&&uo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function W0(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=ys(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const J0=Symbol(""),td=Symbol(""),sr=Symbol(""),vc=Symbol(""),ho=Symbol("");function Pa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function dn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(xa(rt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):q0(f)?o(xa(rt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Ar(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Dh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(dn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=v0(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&dn(f,s,n,l,r,a)()}))}}return i}function Y0(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>ya(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>ya(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let Q0=()=>location.protocol+"//"+location.host;function Hh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),Qu(r,"")}return Qu(s,e)+n+a}function X0(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=Hh(e,location),m=s.value,g=t.value;let k=0;if(f){if(s.value=p,t.value=f,l&&l===m){l=null;return}k=g?f.position-g.position:0}else n(p);a.forEach(C=>{C(s.value,m,{delta:k,type:fo.pop,direction:k?k>0?Er.forward:Er.back:Er.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const m=a.indexOf(f);m>-1&&a.splice(m,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(Ve({},f.state,{scroll:tr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function sd(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?tr():null}}function Z0(e){const{history:t,location:s}=window,n={value:Hh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:Q0()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,Ve({},t.state,sd(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=Ve({},a.value,t.state,{forward:o,scroll:tr()});i(u.current,u,!0),i(o,Ve({},sd(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function e_(e){e=F0(e);const t=Z0(e),s=X0(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=Ve({location:"",base:e,go:n,createHref:B0.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function t_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),e_(e)}let Tn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var bt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(bt||{});const s_={type:Tn.Static,value:""},n_=/[a-zA-Z0-9_]/;function a_(e){if(!e)return[[]];if(e==="/")return[[s_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=bt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===bt.Static?i.push({type:Tn.Static,value:c}):s===bt.Param||s===bt.ParamRegExp||s===bt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Tn.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==bt.ParamRegExp){n=s,s=bt.EscapeNext;continue}switch(s){case bt.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=bt.Param):f();break;case bt.EscapeNext:f(),s=n;break;case bt.Param:o==="("?s=bt.ParamRegExp:n_.test(o)?f():(d(),s=bt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case bt.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=bt.ParamRegExpEnd:u+=o;break;case bt.ParamRegExpEnd:d(),s=bt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===bt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const nd="[^/]+?",i_={sensitive:!1,strict:!1,start:!0,end:!0};var Ht=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Ht||{});const l_=/[.+*?^${}()[\]/\\]/g;function r_(e,t){const s=Ve({},i_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[Ht.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=Ht.Segment+(s.sensitive?Ht.BonusCaseSensitive:0);if(f.type===Tn.Static)d||(a+="/"),a+=f.value.replace(l_,"\\$&"),p+=Ht.Static;else if(f.type===Tn.Param){const{value:m,repeatable:g,optional:k,regexp:C}=f;i.push({name:m,repeatable:g,optional:k});const v=C||nd;if(v!==nd){p+=Ht.BonusCustomRegExp;try{`${v}`}catch(x){throw new Error(`Invalid custom RegExp for param "${m}" (${v}): `+x.message)}}let b=g?`((?:${v})(?:/(?:${v}))*)`:`(${v})`;d||(b=k&&c.length<2?`(?:/${b})`:"/"+b),k&&(b+="?"),a+=b,p+=Ht.Dynamic,k&&(p+=Ht.BonusOptional),g&&(p+=Ht.BonusRepeatable),v===".*"&&(p+=Ht.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Ht.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",m=i[f-1];d[m.name]=p&&m.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Tn.Static)u+=p.value;else if(p.type===Tn.Param){const{value:m,repeatable:g,optional:k}=p,C=m in c?c[m]:"";if(ys(C)&&!g)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const v=ys(C)?C.join("/"):C;if(!v)if(k)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${m}"`);u+=v}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function o_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Ht.Static+Ht.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Ht.Static+Ht.Segment?1:-1:0}function jh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=o_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(ad(n))return 1;if(ad(a))return-1}return a.length-n.length}function ad(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const c_={strict:!1,end:!0,sensitive:!1};function u_(e,t,s){const n=r_(a_(e.path),s),a=Ve(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function d_(e,t){const s=[],n=new Map;t=Yu(c_,t);function a(d){return n.get(d)}function i(d,f,p){const m=!p,g=ld(d);g.aliasOf=p&&p.record;const k=Yu(t,d),C=[g];if("alias"in d){const x=typeof d.alias=="string"?[d.alias]:d.alias;for(const E of x)C.push(ld(Ve({},g,{components:p?p.record.components:g.components,path:E,aliasOf:p?p.record:g})))}let v,b;for(const x of C){const{path:E}=x;if(f&&E[0]!=="/"){const S=f.record.path,N=S[S.length-1]==="/"?"":"/";x.path=f.record.path+(E&&N+E)}if(v=u_(x,f,k),p?p.alias.push(v):(b=b||v,b!==v&&b.alias.push(v),m&&d.name&&!rd(v)&&l(d.name)),Vh(v)&&o(v),g.children){const S=g.children;for(let N=0;N<S.length;N++)i(S[N],v,p&&p.children[N])}p=p||v}return b?()=>{l(b)}:Qa}function l(d){if(Bh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=h_(d,s);s.splice(f,0,d),d.record.name&&!rd(d)&&n.set(d.record.name,d)}function c(d,f){let p,m={},g,k;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw xa(rt.MATCHER_NOT_FOUND,{location:d});k=p.record.name,m=Ve(id(f.params,p.keys.filter(b=>!b.optional).concat(p.parent?p.parent.keys.filter(b=>b.optional):[]).map(b=>b.name)),d.params&&id(d.params,p.keys.map(b=>b.name))),g=p.stringify(m)}else if(d.path!=null)g=d.path,p=s.find(b=>b.re.test(g)),p&&(m=p.parse(g),k=p.record.name);else{if(p=f.name?n.get(f.name):s.find(b=>b.re.test(f.path)),!p)throw xa(rt.MATCHER_NOT_FOUND,{location:d,currentLocation:f});k=p.record.name,m=Ve({},f.params,d.params),g=p.stringify(m)}const C=[];let v=p;for(;v;)C.unshift(v.record),v=v.parent;return{name:k,path:g,params:m,matched:C,meta:p_(C)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function id(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function ld(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:f_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function f_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function rd(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function p_(e){return e.reduce((t,s)=>Ve(t,s.meta),{})}function h_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;jh(e,t[i])<0?n=i:s=i+1}const a=g_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function g_(e){let t=e;for(;t=t.parent;)if(Vh(t)&&jh(e,t)===0)return t}function Vh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function od(e){const t=us(sr),s=us(vc),n=te(()=>{const o=Es(e.to);return t.resolve(o)}),a=te(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(ya.bind(null,u));if(f>-1)return f;const p=cd(o[c-2]);return c>1&&cd(u)===p&&d[d.length-1].path!==p?d.findIndex(ya.bind(null,o[c-2])):f}),i=te(()=>a.value>-1&&x_(s.params,n.value.params)),l=te(()=>a.value>-1&&a.value===s.matched.length-1&&$h(s.params,n.value.params));function r(o={}){if(y_(o)){const c=t[Es(e.replace)?"replace":"push"](Es(e.to)).catch(Qa);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:te(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function m_(e){return e.length===1?e[0]:e}const v_=_i({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:od,setup(e,{slots:t}){const s=gn(od(e)),{options:n}=us(sr),a=te(()=>({[ud(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[ud(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&m_(t.default(s));return e.custom?i:Wl("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),b_=v_;function y_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function x_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!ys(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function cd(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const ud=(e,t,s)=>e??t??s,__=_i({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=us(ho),a=te(()=>e.route||n.value),i=us(td,0),l=te(()=>{let c=Es(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=te(()=>a.value.matched[l.value]);Ga(td,te(()=>l.value+1)),Ga(J0,r),Ga(ho,a);const o=h();return ds(()=>[o.value,r.value,e.name],([c,u,d],[f,p,m])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!ya(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return dd(s.default,{Component:f,route:c});const p=d.props[u],m=p?p===!0?c.params:typeof p=="function"?p(c):p:null,k=Wl(f,Ve({},m,t,{onVnodeUnmounted:C=>{C.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return dd(s.default,{Component:k,route:c})||k}}});function dd(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const k_=__;function w_(e){const t=d_(e.routes,e),s=e.parseQuery||K0,n=e.stringifyQuery||ed,a=e.history,i=Pa(),l=Pa(),r=Pa(),o=Eo(an);let c=an;Xn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Tr.bind(null,q=>""+q),d=Tr.bind(null,I0),f=Tr.bind(null,mi);function p(q,re){let le,ge;return Bh(q)?(le=t.getRecordMatcher(q),ge=re):ge=q,t.addRoute(ge,le)}function m(q){const re=t.getRecordMatcher(q);re&&t.removeRoute(re)}function g(){return t.getRoutes().map(q=>q.record)}function k(q){return!!t.getRecordMatcher(q)}function C(q,re){if(re=Ve({},re||o.value),typeof q=="string"){const T=Cr(s,q,re.path),P=t.resolve({path:T.path},re),W=a.createHref(T.fullPath);return Ve(T,P,{params:f(P.params),hash:mi(T.hash),redirectedFrom:void 0,href:W})}let le;if(q.path!=null)le=Ve({},q,{path:Cr(s,q.path,re.path).path});else{const T=Ve({},q.params);for(const P in T)T[P]==null&&delete T[P];le=Ve({},q,{params:d(T)}),re.params=d(re.params)}const ge=t.resolve(le,re),me=q.hash||"";ge.params=u(f(ge.params));const Le=O0(n,Ve({},q,{hash:E0(me),path:ge.path})),y=a.createHref(Le);return Ve({fullPath:Le,hash:me,query:n===ed?W0(q.query):q.query||{}},ge,{redirectedFrom:void 0,href:y})}function v(q){return typeof q=="string"?Cr(s,q,o.value.path):Ve({},q)}function b(q,re){if(c!==q)return xa(rt.NAVIGATION_CANCELLED,{from:re,to:q})}function x(q){return N(q)}function E(q){return x(Ve(v(q),{replace:!0}))}function S(q,re){const le=q.matched[q.matched.length-1];if(le&&le.redirect){const{redirect:ge}=le;let me=typeof ge=="function"?ge(q,re):ge;return typeof me=="string"&&(me=me.includes("?")||me.includes("#")?me=v(me):{path:me},me.params={}),Ve({query:q.query,hash:q.hash,params:me.path!=null?{}:q.params},me)}}function N(q,re){const le=c=C(q),ge=o.value,me=q.state,Le=q.force,y=q.replace===!0,T=S(le,ge);if(T)return N(Ve(v(T),{state:typeof T=="object"?Ve({},me,T.state):me,force:Le,replace:y}),re||le);const P=le;P.redirectedFrom=re;let W;return!Le&&L0(n,ge,le)&&(W=xa(rt.NAVIGATION_DUPLICATED,{to:P,from:ge}),ve(ge,ge,!0,!1)),(W?Promise.resolve(W):O(P,ge)).catch(R=>Os(R)?Os(R,rt.NAVIGATION_GUARD_REDIRECT)?R:de(R):D(R,P,ge)).then(R=>{if(R){if(Os(R,rt.NAVIGATION_GUARD_REDIRECT))return N(Ve({replace:y},v(R.to),{state:typeof R.to=="object"?Ve({},me,R.to.state):me,force:Le}),re||P)}else R=M(P,ge,!0,y,me);return j(P,ge,R),R})}function w(q,re){const le=b(q,re);return le?Promise.reject(le):Promise.resolve()}function A(q){const re=X.values().next().value;return re&&typeof re.runWithContext=="function"?re.runWithContext(q):q()}function O(q,re){let le;const[ge,me,Le]=Y0(q,re);le=Ar(ge.reverse(),"beforeRouteLeave",q,re);for(const T of ge)T.leaveGuards.forEach(P=>{le.push(dn(P,q,re))});const y=w.bind(null,q,re);return le.push(y),Ie(le).then(()=>{le=[];for(const T of i.list())le.push(dn(T,q,re));return le.push(y),Ie(le)}).then(()=>{le=Ar(me,"beforeRouteUpdate",q,re);for(const T of me)T.updateGuards.forEach(P=>{le.push(dn(P,q,re))});return le.push(y),Ie(le)}).then(()=>{le=[];for(const T of Le)if(T.beforeEnter)if(ys(T.beforeEnter))for(const P of T.beforeEnter)le.push(dn(P,q,re));else le.push(dn(T.beforeEnter,q,re));return le.push(y),Ie(le)}).then(()=>(q.matched.forEach(T=>T.enterCallbacks={}),le=Ar(Le,"beforeRouteEnter",q,re,A),le.push(y),Ie(le))).then(()=>{le=[];for(const T of l.list())le.push(dn(T,q,re));return le.push(y),Ie(le)}).catch(T=>Os(T,rt.NAVIGATION_CANCELLED)?T:Promise.reject(T))}function j(q,re,le){r.list().forEach(ge=>A(()=>ge(q,re,le)))}function M(q,re,le,ge,me){const Le=b(q,re);if(Le)return Le;const y=re===an,T=Xn?history.state:{};le&&(ge||y?a.replace(q.fullPath,Ve({scroll:y&&T&&T.scroll},me)):a.push(q.fullPath,me)),o.value=q,ve(q,re,le,y),de()}let L;function J(){L||(L=a.listen((q,re,le)=>{if(!ue.listening)return;const ge=C(q),me=S(ge,ue.currentRoute.value);if(me){N(Ve(me,{replace:!0,force:!0}),ge).catch(Qa);return}c=ge;const Le=o.value;Xn&&j0(Zu(Le.fullPath,le.delta),tr()),O(ge,Le).catch(y=>Os(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_CANCELLED)?y:Os(y,rt.NAVIGATION_GUARD_REDIRECT)?(N(Ve(v(y.to),{force:!0}),ge).then(T=>{Os(T,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&!le.delta&&le.type===fo.pop&&a.go(-1,!1)}).catch(Qa),Promise.reject()):(le.delta&&a.go(-le.delta,!1),D(y,ge,Le))).then(y=>{y=y||M(ge,Le,!1),y&&(le.delta&&!Os(y,rt.NAVIGATION_CANCELLED)?a.go(-le.delta,!1):le.type===fo.pop&&Os(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),j(ge,Le,y)}).catch(Qa)}))}let $=Pa(),V=Pa(),I;function D(q,re,le){de(q);const ge=V.list();return ge.length?ge.forEach(me=>me(q,re,le)):console.error(q),Promise.reject(q)}function G(){return I&&o.value!==an?Promise.resolve():new Promise((q,re)=>{$.add([q,re])})}function de(q){return I||(I=!q,J(),$.list().forEach(([re,le])=>q?le(q):re()),$.reset()),q}function ve(q,re,le,ge){const{scrollBehavior:me}=e;if(!Xn||!me)return Promise.resolve();const Le=!le&&V0(Zu(q.fullPath,0))||(ge||!le)&&history.state&&history.state.scroll||null;return Et().then(()=>me(q,re,Le)).then(y=>y&&H0(y)).catch(y=>D(y,q,re))}const ie=q=>a.go(q);let pe;const X=new Set,ue={currentRoute:o,listening:!0,addRoute:p,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:g,resolve:C,options:e,push:x,replace:E,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:V.add,isReady:G,install(q){q.component("RouterLink",b_),q.component("RouterView",k_),q.config.globalProperties.$router=ue,Object.defineProperty(q.config.globalProperties,"$route",{enumerable:!0,get:()=>Es(o)}),Xn&&!pe&&o.value===an&&(pe=!0,x(a.location).catch(ge=>{}));const re={};for(const ge in an)Object.defineProperty(re,ge,{get:()=>o.value[ge],enumerable:!0});q.provide(sr,ue),q.provide(vc,Co(re)),q.provide(ho,o);const le=q.unmount;X.add(q),q.unmount=function(){X.delete(q),X.size<1&&(c=an,L&&L(),L=null,o.value=an,pe=!1,I=!1),le()}}};function Ie(q){return q.reduce((re,le)=>re.then(()=>A(le)),Promise.resolve())}return ue}function qh(){return us(sr)}function S_(e){return us(vc)}const T_=[{group:"",label:"Dashboard",icon:"📊",to:{path:"/dashboard"}},{group:"",label:"Chat",icon:"💭",to:{path:"/chat"}},{group:"Operations",label:"Live",icon:"🎯",to:{path:"/operations",query:{tab:"live"}}},{group:"Operations",label:"Agents",icon:"🎯",to:{path:"/operations",query:{tab:"agents"}}},{group:"Operations",label:"Loops",icon:"🎯",to:{path:"/operations",query:{tab:"loops"}}},{group:"Operations",label:"Processes",icon:"🎯",to:{path:"/operations",query:{tab:"processes"}}},{group:"Operations",label:"Schedules",icon:"🎯",to:{path:"/operations",query:{tab:"schedules"}}},{group:"History",label:"Audit",icon:"📝",to:{path:"/history",query:{tab:"audit"}}},{group:"History",label:"Sessions",icon:"📝",to:{path:"/history",query:{tab:"sessions"}}},{group:"History",label:"Traces",icon:"📝",to:{path:"/history",query:{tab:"traces"}}},{group:"History",label:"Usage",icon:"📝",to:{path:"/history",query:{tab:"usage"}}},{group:"Capabilities",label:"Tools",icon:"🔧",to:{path:"/capabilities",query:{tab:"tools"}}},{group:"Capabilities",label:"Skills",icon:"🔧",to:{path:"/capabilities",query:{tab:"skills"}}},{group:"Capabilities",label:"Knowledge",icon:"🔧",to:{path:"/capabilities",query:{tab:"knowledge"}}},{group:"Capabilities",label:"Memory",icon:"🔧",to:{path:"/capabilities",query:{tab:"memory"}}},{group:"Capabilities",label:"Learned",icon:"🔧",to:{path:"/capabilities",query:{tab:"learned"}}},{group:"",label:"Personality",icon:"🎭",to:{path:"/personality"}},{group:"System",label:"Health",icon:"⚙️",to:{path:"/system",query:{tab:"health"}}},{group:"System",label:"Resources",icon:"⚙️",to:{path:"/system",query:{tab:"resources"}}},{group:"System",label:"Logs",icon:"⚙️",to:{path:"/system",query:{tab:"logs"}}},{group:"System",label:"Config",icon:"⚙️",to:{path:"/system",query:{tab:"config"}}},{group:"System",label:"Discord",icon:"⚙️",to:{path:"/system",query:{tab:"discord"}}},{group:"System",label:"Host Access",icon:"⚙️",to:{path:"/system",query:{tab:"host-access"}}},{group:"System",label:"API Tokens",icon:"⚙️",to:{path:"/system",query:{tab:"api-tokens"}}},{group:"System",label:"LLM Config",icon:"⚙️",to:{path:"/system",query:{tab:"llm"}}},{group:"System",label:"Internals",icon:"⚙️",to:{path:"/system",query:{tab:"internals"}}},{group:"System",label:"Update",icon:"⚙️",to:{path:"/system",query:{tab:"update"}}}],Jt=gn({open:!1,query:"",selected:0});function C_(){Jt.query="",Jt.selected=0,Jt.open=!0}function Rr(){Jt.open=!1}function E_(e,t){const s=e.label.toLowerCase(),a=((e.group?e.group+" ":"")+e.label).toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const A_={setup(){const e=qh(),t=h(null),s=te(()=>{const i=Jt.query.trim().toLowerCase();return T_.map(l=>({...l,_score:E_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ds(()=>Jt.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),ds(()=>Jt.query,()=>{Jt.selected=0});function n(i){Rr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Rr();return}if(i.key==="ArrowDown")i.preventDefault(),Jt.selected=Math.min(Jt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Jt.selected=Math.max(Jt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Jt.selected];l&&n(l)}}return{state:Jt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Rr}},template:`
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay palette-overlay" @click.self="closePalette()" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette">
          <input
            ref="inputEl"
            v-model="state.query"
            type="text"
            class="palette-input"
            placeholder="Jump to page or tab…"
            aria-label="Search pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            @keydown="onKeydown"
          />
          <div id="palette-results" class="palette-results" role="listbox">
            <div v-if="!results.length" class="palette-empty">No matches</div>
            <button
              v-for="(r, i) in results"
              :key="(r.group || 'top') + '-' + r.label"
              class="palette-item"
              :class="{ selected: i === state.selected }"
              role="option"
              :aria-selected="i === state.selected"
              @click="go(r)"
              @mousemove="state.selected = i"
            >
              <span class="palette-icon" aria-hidden="true">{{ r.icon }}</span>
              <span v-if="r.group" class="palette-group">{{ r.group }} ›</span>
              <span class="palette-label">{{ r.label }}</span>
            </button>
          </div>
          <div class="palette-footer">
            <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open <kbd>Esc</kbd> close
          </div>
        </div>
      </div>
    </transition>
  `};function bc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ta(e){const t=bc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function yc(e){const t=bc(e);return t?t.toLocaleTimeString():"—"}function zh(e){const t=bc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function _a(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function xc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Gh(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function fd(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Kh(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function R_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const I_={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
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
              <span class="dash-hero-icon" aria-hidden="true">⌀</span>
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
              {{ actionLoading.reload ? '...' : '↻ Reload' }}
            </button>
            <button @click="clearSessions" class="btn btn-ghost text-xs" :disabled="actionLoading.clearSessions">
              {{ actionLoading.clearSessions ? '...' : '✕ Clear Sessions' }}
            </button>
            <button @click="stopAllLoops" class="btn btn-ghost text-xs" :disabled="actionLoading.stopLoops || (status.loop_count || 0) === 0">
              {{ actionLoading.stopLoops ? '...' : '■ Stop Loops' }}
            </button>
          </div>
        </div>

        <!-- Stat cards grid -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div v-for="s in stats" :key="s.label"
               class="hm-card stat-card dash-stat"
               :class="s.highlight ? 'dash-stat-highlight' : ''">
            <div class="dash-stat-header">
              <span class="dash-stat-icon" :class="s.iconColor">{{ s.icon }}</span>
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
              <span class="dash-empty-icon">⚓</span>
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
              <button @click="fetchActivity" class="btn btn-ghost text-xs" :disabled="activityLoading" style="padding:2px 8px;">
                {{ activityLoading ? '...' : '↻' }}
              </button>
            </div>
            <div v-if="activityLoading && activity.length === 0" class="dash-empty"><span>Loading...</span></div>
            <div v-else-if="activity.length === 0" class="dash-empty">
              <span class="dash-empty-icon">⁂</span>
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
                <span class="dash-empty-icon">⌂</span>
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
                <span class="dash-empty-icon">✓</span>
                <span>All clear</span>
              </div>
              <div v-else class="dash-error-list">
                <div v-for="(e, i) in errors" :key="i" class="dash-error-item">
                  <div class="dash-error-top">
                    <span class="text-red-400">⚠</span>
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=te(()=>{const L=e.value.uptime_seconds||0,J=Math.floor(L/86400),$=Math.floor(L%86400/3600),V=Math.floor(L%3600/60),I=[];return J>0&&I.push(`${J}d`),$>0&&I.push(`${$}h`),(I.length===0||J===0&&$===0)&&I.push(`${V}m`),I.join(" ")}),p=te(()=>{const L=e.value.uptime_seconds||0;return 125.66*(1-Math.min(L/86400,1))}),m=te(()=>{const L=e.value;return[{label:"Guilds",value:L.guild_count??0,icon:"⌂",iconColor:"text-blue-400"},{label:"Sessions",value:L.session_count??0,icon:"☰",iconColor:"text-yellow-400"},{label:"Tools",value:L.tool_count??0,icon:"⚒",iconColor:"text-purple-400",sub:`${L.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:L.loop_count??0,icon:"⟳",iconColor:"text-green-400",color:L.loop_count>0?"text-green-400":"",highlight:L.loop_count>0},{label:"Agents",value:L.agent_running??0,icon:"⚓",iconColor:"text-cyan-400",sub:L.agent_count>0?`${L.agent_count} total`:"",subColor:"text-gray-500",highlight:(L.agent_running??0)>0},{label:"Processes",value:L.process_running??0,icon:"⚙",iconColor:"text-orange-400",sub:L.process_count>0?`${L.process_count} total`:"",subColor:"text-gray-500",highlight:(L.process_running??0)>0},{label:"Schedules",value:L.schedule_count??0,icon:"⏰",iconColor:"text-amber-400",sub:(L.schedule_failing>0?`${L.schedule_failing} failing`:"")+(L.schedule_failing>0&&L.schedule_paused>0?", ":"")+(L.schedule_paused>0?`${L.schedule_paused} paused`:"")||void 0,subColor:L.schedule_failing>0?"text-red-400":"text-yellow-400",color:L.schedule_failing>0?"text-red-400":"",highlight:L.schedule_failing>0},{label:"Users",value:L.user_count??0,icon:"☺",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"≡",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[],{label:"Alerts",value:L.monitoring&&L.monitoring.active_alerts||0,icon:"⚑",iconColor:"text-red-400",color:L.monitoring&&L.monitoring.active_alerts>0?"text-red-400":"",highlight:L.monitoring&&L.monitoring.active_alerts>0}]}),g=te(()=>{const L=e.value,J=[];J.push({label:"Bot",status:L.status==="online"?"ok":"warn",detail:L.status==="online"?"Online":"Starting"});const $=L.monitoring||{};if($.enabled){const V=$.active_alerts>0;J.push({label:"Monitoring",status:V?"error":"ok",detail:V?`${$.active_alerts} alert${$.active_alerts>1?"s":""}`:`${$.checks} checks`})}return(L.schedule_failing||0)>0?J.push({label:"Schedules",status:"error",detail:`${L.schedule_failing} failing`}):(L.schedule_count||0)>0&&J.push({label:"Schedules",status:"ok",detail:`${L.schedule_count} active`}),(L.loop_count||0)>0&&J.push({label:"Loops",status:"ok",detail:`${L.loop_count} active`}),(L.agent_running||0)>0&&J.push({label:"Agents",status:"ok",detail:`${L.agent_running} running`}),(L.process_running||0)>0&&J.push({label:"Processes",status:"ok",detail:`${L.process_running} running`}),J});async function k(){try{e.value=await K.get("/api/status"),s.value=null}catch(L){s.value=L.message}finally{t.value=!1}}async function C(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function v(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function b(){try{const L=await K.get("/api/knowledge");c.value=(Array.isArray(L)?L:[]).reduce((J,$)=>J+($.chunks||0),0)}catch{c.value=null}}async function x(){try{const L=await K.get("/api/agents");r.value=L.filter(J=>J.status==="running")}catch{}}async function E(){u.value={...u.value,reload:!0};try{await K.post("/api/reload"),xe.success("Config reloaded")}catch(L){xe.error(L.message)}u.value={...u.value,reload:!1}}async function S(){if(!await ns({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const J=e.value.session_count;e.value={...e.value,session_count:0};try{const $=await K.post("/api/sessions/clear-all");xe.success(`Cleared ${$.count} session${$.count!==1?"s":""}`),await k()}catch($){e.value={...e.value,session_count:J},xe.error($.message)}u.value={...u.value,clearSessions:!1}}async function N(){if(!await ns({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const J=e.value.loop_count;e.value={...e.value,loop_count:0};try{const $=await K.post("/api/loops/stop-all");xe.success($.result),await k()}catch($){e.value={...e.value,loop_count:J},xe.error($.message)}u.value={...u.value,stopLoops:!1}}function w(){t.value=!0,s.value=null,k(),C(),v(),x()}let A=null,O=null,j=null;function M(L){if(L.payload&&L.payload.tool_name){const J={...L.payload,_isNew:!0,_key:++d};n.value.unshift(J),n.value.length>10&&n.value.pop(),o.value++,J.error&&(i.value.unshift(J),i.value.length>5&&i.value.pop()),setTimeout(()=>{J._isNew=!1},1500),clearTimeout(j),j=setTimeout(()=>{o.value=0},1e4)}}return $e(async()=>{await Promise.all([k(),C(),v(),x(),b()]),A=setInterval(k,15e3),O=setInterval(x,1e4),qe.subscribe("events",M)}),ft(()=>{A&&clearInterval(A),O&&clearInterval(O),clearTimeout(j),qe.unsubscribe("events",M)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:m,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:C,fetchStatus:k,formatTime:yc,formatDuration:_a,retry:w,reloadConfig:E,clearSessions:S,stopAllLoops:N}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function pd(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function N_(e){if(Array.isArray(e))return e}function D_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function O_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function L_(e,t){return N_(e)||D_(e,t)||P_(e,t)||O_()}function P_(e,t){if(e){if(typeof e=="string")return pd(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?pd(e,t):void 0}}const Wh=Object.entries,hd=Object.setPrototypeOf,M_=Object.isFrozen,F_=Object.getPrototypeOf,$_=Object.getOwnPropertyDescriptor;let zt=Object.freeze,ps=Object.seal,Zn=Object.create,Jh=typeof Reflect<"u"&&Reflect,go=Jh.apply,mo=Jh.construct;zt||(zt=function(t){return t});ps||(ps=function(t){return t});go||(go=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});mo||(mo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Ls=mt(Array.prototype.forEach),B_=mt(Array.prototype.lastIndexOf),gd=mt(Array.prototype.pop),Wn=mt(Array.prototype.push),U_=mt(Array.prototype.splice),Ut=Array.isArray,Va=mt(String.prototype.toLowerCase),Ir=mt(String.prototype.toString),md=mt(String.prototype.match),Jn=mt(String.prototype.replace),vd=mt(String.prototype.indexOf),H_=mt(String.prototype.trim),j_=mt(Number.prototype.toString),V_=mt(Boolean.prototype.toString),bd=typeof BigInt>"u"?null:mt(BigInt.prototype.toString),yd=typeof Symbol>"u"?null:mt(Symbol.prototype.toString),lt=mt(Object.prototype.hasOwnProperty),Ma=mt(Object.prototype.toString),Tt=mt(RegExp.prototype.test),xn=q_(TypeError);function mt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return go(e,t,n)}}function q_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return mo(e,s)}}function Re(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Va;if(hd&&hd(e,null),!Ut(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(M_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function z_(e){for(let t=0;t<e.length;t++)lt(e,t)||(e[t]=null);return e}function Ot(e){const t=Zn(null);for(const n of Wh(e)){var s=L_(n,2);const a=s[0],i=s[1];lt(e,a)&&(Ut(i)?t[a]=z_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Ot(i):t[a]=i)}return t}function G_(e){switch(typeof e){case"string":return e;case"number":return j_(e);case"boolean":return V_(e);case"bigint":return bd?bd(e):"0";case"symbol":return yd?yd(e):"Symbol()";case"undefined":return Ma(e);case"function":case"object":{if(e===null)return Ma(e);const t=e,s=ks(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Ma(n)}return Ma(e)}default:return Ma(e)}}function ks(e,t){for(;e!==null;){const n=$_(e,t);if(n){if(n.get)return mt(n.get);if(typeof n.value=="function")return mt(n.value)}e=F_(e)}function s(){return null}return s}function K_(e){try{return Tt(e,""),!0}catch{return!1}}const xd=zt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Nr=zt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Dr=zt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),W_=zt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Or=zt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),J_=zt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),_d=zt(["#text"]),kd=zt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Lr=zt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),wd=zt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),qi=zt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Y_=ps(/{{[\w\W]*|^[\w\W]*}}/g),Q_=ps(/<%[\w\W]*|^[\w\W]*%>/g),X_=ps(/\${[\w\W]*/g),Z_=ps(/^data-[\-\w.\u00B7-\uFFFF]+$/),ek=ps(/^aria-[\-\w]+$/),Sd=ps(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),tk=ps(/^(?:\w+script|data):/i),sk=ps(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),nk=ps(/^html$/i),ak=ps(/^[a-z][.\w]*(-[.\w]+)+$/i),xs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},ik=function(){return typeof window>"u"?null:window},lk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Td=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Yh(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:ik();const t=he=>Yh(he);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==xs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=ks(f,"cloneNode"),m=ks(f,"remove"),g=ks(f,"nextSibling"),k=ks(f,"childNodes"),C=ks(f,"parentNode"),v=ks(f,"shadowRoot"),b=ks(f,"attributes"),x=l&&l.prototype?ks(l.prototype,"nodeType"):null,E=l&&l.prototype?ks(l.prototype,"nodeName"):null;if(typeof i=="function"){const he=s.createElement("template");he.content&&he.content.ownerDocument&&(s=he.content.ownerDocument)}let S,N="",w,A=!1,O=0;const j=function(){if(O>0)throw xn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},M=function(_){j(),O++;try{return S.createHTML(_)}finally{O--}},L=function(_){j(),O++;try{return S.createScriptURL(_)}finally{O--}},J=function(){return A||(w=lk(d,a),A=!0),w},$=s,V=$.implementation,I=$.createNodeIterator,D=$.createDocumentFragment,G=$.getElementsByTagName,de=n.importNode;let ve=Td();t.isSupported=typeof Wh=="function"&&typeof C=="function"&&V&&V.createHTMLDocument!==void 0;const ie=Y_,pe=Q_,X=X_,ue=Z_,Ie=ek,q=tk,re=sk,le=ak;let ge=Sd,me=null;const Le=Re({},[...xd,...Nr,...Dr,...Or,..._d]);let y=null;const T=Re({},[...kd,...Lr,...wd,...qi]);let P=Object.seal(Zn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),W=null,R=null;const F=Object.seal(Zn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let Y=!0,Z=!0,se=!1,Q=!0,B=!1,ee=!0,oe=!1,be=!1,Te=!1,Ae=!1,U=!1,ce=!1,ye=!0,Me=!1;const Je="user-content-";let Ke=!0,St=!1,st={},Ye=null;const en=Re({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let mn=null;const Ai=Re({},["audio","video","img","source","image","track"]);let Ea=null;const Ri=Re({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Hn="http://www.w3.org/1998/Math/MathML",jn="http://www.w3.org/2000/svg",Gt="http://www.w3.org/1999/xhtml";let H=Gt,ne=!1,_e=null;const Qe=Re({},[Hn,jn,Gt],Ir);let nt=Re({},["mi","mo","mn","ms","mtext"]),Nt=Re({},["annotation-xml"]);const lr=Re({},["title","style","font","a","script"]);let Aa=null;const dg=["application/xhtml+xml","text/html"],fg="text/html";let it=null,Vn=null;const pg=s.createElement("form"),Ic=function(_){return _ instanceof RegExp||_ instanceof Function},rr=function(){let _=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Vn&&Vn===_)return;(!_||typeof _!="object")&&(_={}),_=Ot(_),Aa=dg.indexOf(_.PARSER_MEDIA_TYPE)===-1?fg:_.PARSER_MEDIA_TYPE,it=Aa==="application/xhtml+xml"?Ir:Va,me=lt(_,"ALLOWED_TAGS")&&Ut(_.ALLOWED_TAGS)?Re({},_.ALLOWED_TAGS,it):Le,y=lt(_,"ALLOWED_ATTR")&&Ut(_.ALLOWED_ATTR)?Re({},_.ALLOWED_ATTR,it):T,_e=lt(_,"ALLOWED_NAMESPACES")&&Ut(_.ALLOWED_NAMESPACES)?Re({},_.ALLOWED_NAMESPACES,Ir):Qe,Ea=lt(_,"ADD_URI_SAFE_ATTR")&&Ut(_.ADD_URI_SAFE_ATTR)?Re(Ot(Ri),_.ADD_URI_SAFE_ATTR,it):Ri,mn=lt(_,"ADD_DATA_URI_TAGS")&&Ut(_.ADD_DATA_URI_TAGS)?Re(Ot(Ai),_.ADD_DATA_URI_TAGS,it):Ai,Ye=lt(_,"FORBID_CONTENTS")&&Ut(_.FORBID_CONTENTS)?Re({},_.FORBID_CONTENTS,it):en,W=lt(_,"FORBID_TAGS")&&Ut(_.FORBID_TAGS)?Re({},_.FORBID_TAGS,it):Ot({}),R=lt(_,"FORBID_ATTR")&&Ut(_.FORBID_ATTR)?Re({},_.FORBID_ATTR,it):Ot({}),st=lt(_,"USE_PROFILES")?_.USE_PROFILES&&typeof _.USE_PROFILES=="object"?Ot(_.USE_PROFILES):_.USE_PROFILES:!1,Y=_.ALLOW_ARIA_ATTR!==!1,Z=_.ALLOW_DATA_ATTR!==!1,se=_.ALLOW_UNKNOWN_PROTOCOLS||!1,Q=_.ALLOW_SELF_CLOSE_IN_ATTR!==!1,B=_.SAFE_FOR_TEMPLATES||!1,ee=_.SAFE_FOR_XML!==!1,oe=_.WHOLE_DOCUMENT||!1,Ae=_.RETURN_DOM||!1,U=_.RETURN_DOM_FRAGMENT||!1,ce=_.RETURN_TRUSTED_TYPE||!1,Te=_.FORCE_BODY||!1,ye=_.SANITIZE_DOM!==!1,Me=_.SANITIZE_NAMED_PROPS||!1,Ke=_.KEEP_CONTENT!==!1,St=_.IN_PLACE||!1,ge=K_(_.ALLOWED_URI_REGEXP)?_.ALLOWED_URI_REGEXP:Sd,H=typeof _.NAMESPACE=="string"?_.NAMESPACE:Gt,nt=lt(_,"MATHML_TEXT_INTEGRATION_POINTS")&&_.MATHML_TEXT_INTEGRATION_POINTS&&typeof _.MATHML_TEXT_INTEGRATION_POINTS=="object"?Ot(_.MATHML_TEXT_INTEGRATION_POINTS):Re({},["mi","mo","mn","ms","mtext"]),Nt=lt(_,"HTML_INTEGRATION_POINTS")&&_.HTML_INTEGRATION_POINTS&&typeof _.HTML_INTEGRATION_POINTS=="object"?Ot(_.HTML_INTEGRATION_POINTS):Re({},["annotation-xml"]);const z=lt(_,"CUSTOM_ELEMENT_HANDLING")&&_.CUSTOM_ELEMENT_HANDLING&&typeof _.CUSTOM_ELEMENT_HANDLING=="object"?Ot(_.CUSTOM_ELEMENT_HANDLING):Zn(null);if(P=Zn(null),lt(z,"tagNameCheck")&&Ic(z.tagNameCheck)&&(P.tagNameCheck=z.tagNameCheck),lt(z,"attributeNameCheck")&&Ic(z.attributeNameCheck)&&(P.attributeNameCheck=z.attributeNameCheck),lt(z,"allowCustomizedBuiltInElements")&&typeof z.allowCustomizedBuiltInElements=="boolean"&&(P.allowCustomizedBuiltInElements=z.allowCustomizedBuiltInElements),B&&(Z=!1),U&&(Ae=!0),st&&(me=Re({},_d),y=Zn(null),st.html===!0&&(Re(me,xd),Re(y,kd)),st.svg===!0&&(Re(me,Nr),Re(y,Lr),Re(y,qi)),st.svgFilters===!0&&(Re(me,Dr),Re(y,Lr),Re(y,qi)),st.mathMl===!0&&(Re(me,Or),Re(y,wd),Re(y,qi))),F.tagCheck=null,F.attributeCheck=null,lt(_,"ADD_TAGS")&&(typeof _.ADD_TAGS=="function"?F.tagCheck=_.ADD_TAGS:Ut(_.ADD_TAGS)&&(me===Le&&(me=Ot(me)),Re(me,_.ADD_TAGS,it))),lt(_,"ADD_ATTR")&&(typeof _.ADD_ATTR=="function"?F.attributeCheck=_.ADD_ATTR:Ut(_.ADD_ATTR)&&(y===T&&(y=Ot(y)),Re(y,_.ADD_ATTR,it))),lt(_,"ADD_URI_SAFE_ATTR")&&Ut(_.ADD_URI_SAFE_ATTR)&&Re(Ea,_.ADD_URI_SAFE_ATTR,it),lt(_,"FORBID_CONTENTS")&&Ut(_.FORBID_CONTENTS)&&(Ye===en&&(Ye=Ot(Ye)),Re(Ye,_.FORBID_CONTENTS,it)),lt(_,"ADD_FORBID_CONTENTS")&&Ut(_.ADD_FORBID_CONTENTS)&&(Ye===en&&(Ye=Ot(Ye)),Re(Ye,_.ADD_FORBID_CONTENTS,it)),Ke&&(me["#text"]=!0),oe&&Re(me,["html","head","body"]),me.table&&(Re(me,["tbody"]),delete W.tbody),_.TRUSTED_TYPES_POLICY){if(typeof _.TRUSTED_TYPES_POLICY.createHTML!="function")throw xn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof _.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw xn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=S;S=_.TRUSTED_TYPES_POLICY;try{N=M("")}catch(we){throw S=ae,we}}else _.TRUSTED_TYPES_POLICY===null?(S=void 0,N=""):(S===void 0&&(S=J()),S&&typeof N=="string"&&(N=M("")));(ve.uponSanitizeElement.length>0||ve.uponSanitizeAttribute.length>0)&&me===Le&&(me=Ot(me)),ve.uponSanitizeAttribute.length>0&&y===T&&(y=Ot(y)),zt&&zt(_),Vn=_},Nc=Re({},[...Nr,...Dr,...W_]),Dc=Re({},[...Or,...J_]),hg=function(_){let z=C(_);(!z||!z.tagName)&&(z={namespaceURI:H,tagName:"template"});const ae=Va(_.tagName),we=Va(z.tagName);return _e[_.namespaceURI]?_.namespaceURI===jn?z.namespaceURI===Gt?ae==="svg":z.namespaceURI===Hn?ae==="svg"&&(we==="annotation-xml"||nt[we]):!!Nc[ae]:_.namespaceURI===Hn?z.namespaceURI===Gt?ae==="math":z.namespaceURI===jn?ae==="math"&&Nt[we]:!!Dc[ae]:_.namespaceURI===Gt?z.namespaceURI===jn&&!Nt[we]||z.namespaceURI===Hn&&!nt[we]?!1:!Dc[ae]&&(lr[ae]||!Nc[ae]):!!(Aa==="application/xhtml+xml"&&_e[_.namespaceURI]):!1},hs=function(_){Wn(t.removed,{element:_});try{C(_).removeChild(_)}catch{if(m(_),!C(_))throw xn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Oc=function(_){const z=k?k(_):_.childNodes;if(z){const we=[];Ls(z,Ce=>{Wn(we,Ce)}),Ls(we,Ce=>{try{m(Ce)}catch{}})}const ae=b?b(_):null;if(ae)for(let we=ae.length-1;we>=0;--we){const Ce=ae[we],Ne=Ce&&Ce.name;if(typeof Ne=="string")try{_.removeAttribute(Ne)}catch{}}},vn=function(_,z){try{Wn(t.removed,{attribute:z.getAttributeNode(_),from:z})}catch{Wn(t.removed,{attribute:null,from:z})}if(z.removeAttribute(_),_==="is")if(Ae||U)try{hs(z)}catch{}else try{z.setAttribute(_,"")}catch{}},gg=function(_){const z=b?b(_):_.attributes;if(z)for(let ae=z.length-1;ae>=0;--ae){const we=z[ae],Ce=we&&we.name;if(!(typeof Ce!="string"||y[it(Ce)]))try{_.removeAttribute(Ce)}catch{}}},mg=function(_){const z=[_];for(;z.length>0;){const ae=z.pop();(x?x(ae):ae.nodeType)===xs.element&&gg(ae);const Ce=k?k(ae):ae.childNodes;if(Ce)for(let Ne=Ce.length-1;Ne>=0;--Ne)z.push(Ce[Ne])}},Lc=function(_){let z=null,ae=null;if(Te)_="<remove></remove>"+_;else{const Ne=md(_,/^[\r\n\t ]+/);ae=Ne&&Ne[0]}Aa==="application/xhtml+xml"&&H===Gt&&(_='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+_+"</body></html>");const we=S?M(_):_;if(H===Gt)try{z=new u().parseFromString(we,Aa)}catch{}if(!z||!z.documentElement){z=V.createDocument(H,"template",null);try{z.documentElement.innerHTML=ne?N:we}catch{}}const Ce=z.body||z.documentElement;return _&&ae&&Ce.insertBefore(s.createTextNode(ae),Ce.childNodes[0]||null),H===Gt?G.call(z,oe?"html":"body")[0]:oe?z.documentElement:Ce},Pc=function(_){return I.call(_.ownerDocument||_,_,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},or=function(_){var z,ae;_.normalize();const we=I.call(_.ownerDocument||_,_,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Ce=we.nextNode();for(;Ce;){let vt=Ce.data;Ls([ie,pe,X],Xe=>{vt=Jn(vt,Xe," ")}),Ce.data=vt,Ce=we.nextNode()}const Ne=(z=(ae=_.querySelectorAll)===null||ae===void 0?void 0:ae.call(_,"template"))!==null&&z!==void 0?z:[];Ls(Array.from(Ne),vt=>{qn(vt.content)&&or(vt.content)})},Ii=function(_){const z=E?E(_):null;return typeof z!="string"||it(z)!=="form"?!1:typeof _.nodeName!="string"||typeof _.textContent!="string"||typeof _.removeChild!="function"||_.attributes!==b(_)||typeof _.removeAttribute!="function"||typeof _.setAttribute!="function"||typeof _.namespaceURI!="string"||typeof _.insertBefore!="function"||typeof _.hasChildNodes!="function"||_.nodeType!==x(_)||_.childNodes!==k(_)},qn=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return x(_)===xs.documentFragment}catch{return!1}},Ra=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return typeof x(_)=="number"}catch{return!1}};function Is(he,_,z){Ls(he,ae=>{ae.call(t,_,z,Vn)})}const Mc=function(_){let z=null;if(Is(ve.beforeSanitizeElements,_,null),Ii(_))return hs(_),!0;const ae=it(E?E(_):_.nodeName);if(Is(ve.uponSanitizeElement,_,{tagName:ae,allowedTags:me}),ee&&_.hasChildNodes()&&!Ra(_.firstElementChild)&&Tt(/<[/\w!]/g,_.innerHTML)&&Tt(/<[/\w!]/g,_.textContent)||ee&&_.namespaceURI===Gt&&ae==="style"&&Ra(_.firstElementChild)||_.nodeType===xs.progressingInstruction||ee&&_.nodeType===xs.comment&&Tt(/<[/\w]/g,_.data))return hs(_),!0;if(W[ae]||!(F.tagCheck instanceof Function&&F.tagCheck(ae))&&!me[ae]){if(!W[ae]&&$c(ae)&&(P.tagNameCheck instanceof RegExp&&Tt(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae)))return!1;if(Ke&&!Ye[ae]){const Ce=C(_),Ne=k(_);if(Ne&&Ce){const vt=Ne.length;for(let Xe=vt-1;Xe>=0;--Xe){const ct=St?Ne[Xe]:p(Ne[Xe],!0);Ce.insertBefore(ct,g(_))}}}return hs(_),!0}return(x?x(_):_.nodeType)===xs.element&&!hg(_)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&Tt(/<\/no(script|embed|frames)/i,_.innerHTML)?(hs(_),!0):(B&&_.nodeType===xs.text&&(z=_.textContent,Ls([ie,pe,X],Ce=>{z=Jn(z,Ce," ")}),_.textContent!==z&&(Wn(t.removed,{element:_.cloneNode()}),_.textContent=z)),Is(ve.afterSanitizeElements,_,null),!1)},Fc=function(_,z,ae){if(R[z]||ye&&(z==="id"||z==="name")&&(ae in s||ae in pg))return!1;const we=y[z]||F.attributeCheck instanceof Function&&F.attributeCheck(z,_);if(!(Z&&!R[z]&&Tt(ue,z))){if(!(Y&&Tt(Ie,z))){if(!we||R[z]){if(!($c(_)&&(P.tagNameCheck instanceof RegExp&&Tt(P.tagNameCheck,_)||P.tagNameCheck instanceof Function&&P.tagNameCheck(_))&&(P.attributeNameCheck instanceof RegExp&&Tt(P.attributeNameCheck,z)||P.attributeNameCheck instanceof Function&&P.attributeNameCheck(z,_))||z==="is"&&P.allowCustomizedBuiltInElements&&(P.tagNameCheck instanceof RegExp&&Tt(P.tagNameCheck,ae)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ae))))return!1}else if(!Ea[z]){if(!Tt(ge,Jn(ae,re,""))){if(!((z==="src"||z==="xlink:href"||z==="href")&&_!=="script"&&vd(ae,"data:")===0&&mn[_])){if(!(se&&!Tt(q,Jn(ae,re,"")))){if(ae)return!1}}}}}}return!0},vg=Re({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),$c=function(_){return!vg[Va(_)]&&Tt(le,_)},Bc=function(_){Is(ve.beforeSanitizeAttributes,_,null);const z=_.attributes;if(!z||Ii(_))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let we=z.length;for(;we--;){const Ce=z[we],Ne=Ce.name,vt=Ce.namespaceURI,Xe=Ce.value,ct=it(Ne),tn=Xe;let _t=Ne==="value"?tn:H_(tn);if(ae.attrName=ct,ae.attrValue=_t,ae.keepAttr=!0,ae.forceKeepAttr=void 0,Is(ve.uponSanitizeAttribute,_,ae),_t=ae.attrValue,Me&&(ct==="id"||ct==="name")&&vd(_t,Je)!==0&&(vn(Ne,_),_t=Je+_t),ee&&Tt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,_t)){vn(Ne,_);continue}if(ct==="attributename"&&md(_t,"href")){vn(Ne,_);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){vn(Ne,_);continue}if(!Q&&Tt(/\/>/i,_t)){vn(Ne,_);continue}B&&Ls([ie,pe,X],Hc=>{_t=Jn(_t,Hc," ")});const Uc=it(_.nodeName);if(!Fc(Uc,ct,_t)){vn(Ne,_);continue}if(S&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!vt)switch(d.getAttributeType(Uc,ct)){case"TrustedHTML":{_t=M(_t);break}case"TrustedScriptURL":{_t=L(_t);break}}if(_t!==tn)try{vt?_.setAttributeNS(vt,Ne,_t):_.setAttribute(Ne,_t),Ii(_)?hs(_):gd(t.removed)}catch{vn(Ne,_)}}Is(ve.afterSanitizeAttributes,_,null)},Ni=function(_){let z=null;const ae=Pc(_);for(Is(ve.beforeSanitizeShadowDOM,_,null);z=ae.nextNode();)if(Is(ve.uponSanitizeShadowNode,z,null),Mc(z),Bc(z),qn(z.content)&&Ni(z.content),(x?x(z):z.nodeType)===xs.element){const Ce=v?v(z):z.shadowRoot;qn(Ce)&&(cr(Ce),Ni(Ce))}Is(ve.afterSanitizeShadowDOM,_,null)},cr=function(_){const z=[{node:_,shadow:null}];for(;z.length>0;){const ae=z.pop();if(ae.shadow){Ni(ae.shadow);continue}const we=ae.node,Ne=(x?x(we):we.nodeType)===xs.element,vt=k?k(we):we.childNodes;if(vt)for(let Xe=vt.length-1;Xe>=0;--Xe)z.push({node:vt[Xe],shadow:null});if(Ne){const Xe=E?E(we):null;if(typeof Xe=="string"&&it(Xe)==="template"){const ct=we.content;qn(ct)&&z.push({node:ct,shadow:null})}}if(Ne){const Xe=v?v(we):we.shadowRoot;qn(Xe)&&z.push({node:null,shadow:Xe},{node:Xe,shadow:null})}}};return t.sanitize=function(he){let _=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},z=null,ae=null,we=null,Ce=null;if(ne=!he,ne&&(he="<!-->"),typeof he!="string"&&!Ra(he)&&(he=G_(he),typeof he!="string"))throw xn("dirty is not a string, aborting");if(!t.isSupported)return he;be||rr(_),t.removed=[];const Ne=St&&typeof he!="string"&&Ra(he);if(Ne){const ct=E?E(he):he.nodeName;if(typeof ct=="string"){const tn=it(ct);if(!me[tn]||W[tn])throw xn("root node is forbidden and cannot be sanitized in-place")}if(Ii(he))throw xn("root node is clobbered and cannot be sanitized in-place");try{cr(he)}catch(tn){throw Oc(he),tn}}else if(Ra(he))z=Lc("<!---->"),ae=z.ownerDocument.importNode(he,!0),ae.nodeType===xs.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?z=ae:z.appendChild(ae),cr(ae);else{if(!Ae&&!B&&!oe&&he.indexOf("<")===-1)return S&&ce?M(he):he;if(z=Lc(he),!z)return Ae?null:ce?N:""}z&&Te&&hs(z.firstChild);const vt=Pc(Ne?he:z);try{for(;we=vt.nextNode();)Mc(we),Bc(we),qn(we.content)&&Ni(we.content)}catch(ct){throw Ne&&Oc(he),ct}if(Ne)return Ls(t.removed,ct=>{ct.element&&mg(ct.element)}),B&&or(he),he;if(Ae){if(B&&or(z),U)for(Ce=D.call(z.ownerDocument);z.firstChild;)Ce.appendChild(z.firstChild);else Ce=z;return(y.shadowroot||y.shadowrootmode)&&(Ce=de.call(n,Ce,!0)),Ce}let Xe=oe?z.outerHTML:z.innerHTML;return oe&&me["!doctype"]&&z.ownerDocument&&z.ownerDocument.doctype&&z.ownerDocument.doctype.name&&Tt(nk,z.ownerDocument.doctype.name)&&(Xe="<!DOCTYPE "+z.ownerDocument.doctype.name+`>
`+Xe),B&&Ls([ie,pe,X],ct=>{Xe=Jn(Xe,ct," ")}),S&&ce?M(Xe):Xe},t.setConfig=function(){let he=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};rr(he),be=!0},t.clearConfig=function(){Vn=null,be=!1,S=w,N=""},t.isValidAttribute=function(he,_,z){Vn||rr({});const ae=it(he),we=it(_);return Fc(ae,we,z)},t.addHook=function(he,_){typeof _=="function"&&Wn(ve[he],_)},t.removeHook=function(he,_){if(_!==void 0){const z=B_(ve[he],_);return z===-1?void 0:U_(ve[he],z,1)[0]}return gd(ve[he])},t.removeHooks=function(he){ve[he]=[]},t.removeAllHooks=function(){ve=Td()},t}var Cd=Yh();function _c(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Un=_c();function Qh(e){Un=e}var Xa={exec:()=>null};function ze(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Vt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Vt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},rk=/^(?:[ \t]*(?:\n|$))+/,ok=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,ck=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Ei=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,uk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,kc=/(?:[*+-]|\d{1,9}[.)])/,Xh=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Zh=ze(Xh).replace(/bull/g,kc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),dk=ze(Xh).replace(/bull/g,kc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),wc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,fk=/^[^\n]+/,Sc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,pk=ze(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Sc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),hk=ze(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,kc).getRegex(),nr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Tc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,gk=ze("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Tc).replace("tag",nr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),eg=ze(wc).replace("hr",Ei).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",nr).getRegex(),mk=ze(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",eg).getRegex(),Cc={blockquote:mk,code:ok,def:pk,fences:ck,heading:uk,hr:Ei,html:gk,lheading:Zh,list:hk,newline:rk,paragraph:eg,table:Xa,text:fk},Ed=ze("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Ei).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",nr).getRegex(),vk={...Cc,lheading:dk,table:Ed,paragraph:ze(wc).replace("hr",Ei).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Ed).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",nr).getRegex()},bk={...Cc,html:ze(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Tc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Xa,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:ze(wc).replace("hr",Ei).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Zh).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},yk=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,xk=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,tg=/^( {2,}|\\)\n(?!\s*$)/,_k=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,ar=/[\p{P}\p{S}]/u,Ec=/[\s\p{P}\p{S}]/u,sg=/[^\s\p{P}\p{S}]/u,kk=ze(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Ec).getRegex(),ng=/(?!~)[\p{P}\p{S}]/u,wk=/(?!~)[\s\p{P}\p{S}]/u,Sk=/(?:[^\s\p{P}\p{S}]|~)/u,Tk=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,ag=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Ck=ze(ag,"u").replace(/punct/g,ar).getRegex(),Ek=ze(ag,"u").replace(/punct/g,ng).getRegex(),ig="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Ak=ze(ig,"gu").replace(/notPunctSpace/g,sg).replace(/punctSpace/g,Ec).replace(/punct/g,ar).getRegex(),Rk=ze(ig,"gu").replace(/notPunctSpace/g,Sk).replace(/punctSpace/g,wk).replace(/punct/g,ng).getRegex(),Ik=ze("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,sg).replace(/punctSpace/g,Ec).replace(/punct/g,ar).getRegex(),Nk=ze(/\\(punct)/,"gu").replace(/punct/g,ar).getRegex(),Dk=ze(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Ok=ze(Tc).replace("(?:-->|$)","-->").getRegex(),Lk=ze("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Ok).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),El=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Pk=ze(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",El).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),lg=ze(/^!?\[(label)\]\[(ref)\]/).replace("label",El).replace("ref",Sc).getRegex(),rg=ze(/^!?\[(ref)\](?:\[\])?/).replace("ref",Sc).getRegex(),Mk=ze("reflink|nolink(?!\\()","g").replace("reflink",lg).replace("nolink",rg).getRegex(),Ac={_backpedal:Xa,anyPunctuation:Nk,autolink:Dk,blockSkip:Tk,br:tg,code:xk,del:Xa,emStrongLDelim:Ck,emStrongRDelimAst:Ak,emStrongRDelimUnd:Ik,escape:yk,link:Pk,nolink:rg,punctuation:kk,reflink:lg,reflinkSearch:Mk,tag:Lk,text:_k,url:Xa},Fk={...Ac,link:ze(/^!?\[(label)\]\((.*?)\)/).replace("label",El).getRegex(),reflink:ze(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",El).getRegex()},vo={...Ac,emStrongRDelimAst:Rk,emStrongLDelim:Ek,url:ze(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},$k={...vo,br:ze(tg).replace("{2,}","*").getRegex(),text:ze(vo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},zi={normal:Cc,gfm:vk,pedantic:bk},Fa={normal:Ac,gfm:vo,breaks:$k,pedantic:Fk},Bk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Ad=e=>Bk[e];function ws(e,t){if(t){if(Vt.escapeTest.test(e))return e.replace(Vt.escapeReplace,Ad)}else if(Vt.escapeTestNoEncode.test(e))return e.replace(Vt.escapeReplaceNoEncode,Ad);return e}function Rd(e){try{e=encodeURI(e).replace(Vt.percentDecode,"%")}catch{return null}return e}function Id(e,t){var i;const s=e.replace(Vt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Vt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Vt.slashPipe,"|");return n}function $a(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function Uk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Nd(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function Hk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Al=class{constructor(e){We(this,"options");We(this,"rules");We(this,"lexer");this.options=e||Un}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:$a(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=Hk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=$a(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:$a(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=$a(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,C=>" ".repeat(3*C.length)),f=e.split(`
`,1)[0],p=!d.trim(),m=0;if(this.options.pedantic?(m=2,u=d.trimStart()):p?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,u=d.slice(m),m+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const C=this.rules.other.nextBulletRegex(m),v=this.rules.other.hrRegex(m),b=this.rules.other.fencesBeginRegex(m),x=this.rules.other.headingBeginRegex(m),E=this.rules.other.htmlBeginRegex(m);for(;e;){const S=e.split(`
`,1)[0];let N;if(f=S,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),N=f):N=f.replace(this.rules.other.tabCharGlobal,"    "),b.test(f)||x.test(f)||E.test(f)||C.test(f)||v.test(f))break;if(N.search(this.rules.other.nonSpaceChar)>=m||!f.trim())u+=`
`+N.slice(m);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||b.test(d)||x.test(d)||v.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=S+`
`,e=e.substring(S.length+1),d=N.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,k;this.options.gfm&&(g=this.rules.other.listIsTask.exec(u),g&&(k=g[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:k,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Id(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Id(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=$a(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Uk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Nd(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Nd(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const m=f.slice(1,-1);return{type:"em",raw:f,text:m,tokens:this.lexer.inlineTokens(m)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},js=class bo{constructor(t){We(this,"tokens");We(this,"options");We(this,"state");We(this,"tokenizer");We(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Un,this.options.tokenizer=this.options.tokenizer||new Al,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Vt,block:zi.normal,inline:Fa.normal};this.options.pedantic?(s.block=zi.pedantic,s.inline=Fa.pedantic):this.options.gfm&&(s.block=zi.gfm,this.options.breaks?s.inline=Fa.breaks:s.inline=Fa.gfm),this.tokenizer.rules=s}static get rules(){return{block:zi,inline:Fa}}static lex(t,s){return new bo(s).lex(t)}static lexInline(t,s){return new bo(s).inlineTokens(t)}lex(t){t=t.replace(Vt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Vt.tabCharGlobal,"    ").replace(Vt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const u=t.slice(1);let d;this.options.extensions.startBlock.forEach(f=>{d=f.call({lexer:this},u),typeof d=="number"&&d>=0&&(c=Math.min(c,d))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const u=Object.keys(this.tokens.links);if(u.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)u.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let u;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(u=f.call({lexer:this},t,s))?(t=t.substring(u.raw.length),s.push(u),!0):!1))continue;if(u=this.tokenizer.escape(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.tag(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.link(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(u.raw.length);const f=s.at(-1);u.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(u=this.tokenizer.emStrong(t,n,l)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.codespan(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.br(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.del(t)){t=t.substring(u.raw.length),s.push(u);continue}if(u=this.tokenizer.autolink(t)){t=t.substring(u.raw.length),s.push(u);continue}if(!this.state.inLink&&(u=this.tokenizer.url(t))){t=t.substring(u.raw.length),s.push(u);continue}let d=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let m;this.options.extensions.startInline.forEach(g=>{m=g.call({lexer:this},p),typeof m=="number"&&m>=0&&(f=Math.min(f,m))}),f<1/0&&f>=0&&(d=t.substring(0,f+1))}if(u=this.tokenizer.inlineText(d)){t=t.substring(u.raw.length),u.raw.slice(-1)!=="_"&&(l=u.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=u.raw,f.text+=u.text):s.push(u);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Rl=class{constructor(e){We(this,"options");We(this,"parser");this.options=e||Un}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Vt.notSpaceStart))==null?void 0:i[0],a=e.replace(Vt.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ws(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Rd(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+ws(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Rd(e);if(a===null)return ws(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ws(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ws(e.text)}},Rc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Vs=class yo{constructor(t){We(this,"options");We(this,"renderer");We(this,"textRenderer");this.options=t||Un,this.options.renderer=this.options.renderer||new Rl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Rc}static parse(t,s){return new yo(s).parse(t)}static parseInline(t,s){return new yo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},$r,Zi=($r=class{constructor(e){We(this,"options");We(this,"block");this.options=e||Un}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?js.lex:js.lexInline}provideParser(){return this.block?Vs.parse:Vs.parseInline}},We($r,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),$r),jk=class{constructor(...e){We(this,"defaults",_c());We(this,"options",this.setOptions);We(this,"parse",this.parseMarkdown(!0));We(this,"parseInline",this.parseMarkdown(!1));We(this,"Parser",Vs);We(this,"Renderer",Rl);We(this,"TextRenderer",Rc);We(this,"Lexer",js);We(this,"Tokenizer",Al);We(this,"Hooks",Zi);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Rl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Al(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Zi;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Zi.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return js.lex(e,t??this.defaults)}parser(e,t){return Vs.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?js.lex:js.lexInline,o=i.hooks?i.hooks.provideParser():e?Vs.parse:Vs.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+ws(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Pn=new jk;function je(e,t){return Pn.parse(e,t)}je.options=je.setOptions=function(e){return Pn.setOptions(e),je.defaults=Pn.defaults,Qh(je.defaults),je};je.getDefaults=_c;je.defaults=Un;je.use=function(...e){return Pn.use(...e),je.defaults=Pn.defaults,Qh(je.defaults),je};je.walkTokens=function(e,t){return Pn.walkTokens(e,t)};je.parseInline=Pn.parseInline;je.Parser=Vs;je.parser=Vs.parse;je.Renderer=Rl;je.TextRenderer=Rc;je.Lexer=js;je.lexer=js.lex;je.Tokenizer=Al;je.Hooks=Zi;je.parse=je;je.options;je.setOptions;je.use;je.walkTokens;je.parseInline;Vs.parse;js.lex;const Vk={breaks:!0,gfm:!0};function Dd(e){if(!e)return"";try{if(typeof je<"u"&&je.parse){const t=je.parse(e,Vk);return typeof Cd<"u"?Cd.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function qk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Od={run_command:"⌘",ssh_command:"⌘",run_script:"⌘",read_file:"📄",write_file:"✏️",list_directory:"📂",search_knowledge:"🔍",ingest_document:"📚",generate_image:"🎨",analyze_image:"🖼️",analyze_pdf:"📃",browser_screenshot:"🌐",manage_process:"⚙️"};function zk(e){return Od[e]?Od[e]:"🔧"}const Gk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Ld(e){if(!e)return[];const t=e.match(Gk);return t?[...new Set(t)]:[]}const Kk={template:`
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
                    <span class="chat-tools-toggle-icon" aria-hidden="true">{{ msg._showTools ? '▼' : '▶' }}</span>
                    <span class="chat-tools-toggle-count">{{ msg.tools_used.length }}</span>
                    <span>tool{{ msg.tools_used.length > 1 ? 's' : '' }} executed</span>
                  </button>
                  <div v-if="msg._showTools" class="chat-tool-list">
                    <div v-for="t in msg.tools_used" :key="t" class="chat-tool-card">
                      <span class="chat-tool-icon">{{ getToolIcon(t) }}</span>
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
                      📎 {{ file.filename }} ({{ (file.size / 1024).toFixed(1) }} KB)
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=te(()=>t.value.trim().length>0&&!s.value),d=te(()=>{const $=qe.state;return $==="connected"?"Connected":$==="reconnecting"?"Reconnecting…":$==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=te(()=>{const $=Math.floor(i.value/4)%f.length,V=i.value;return V>3?`${f[$]} (${V}s)`:f[0]});function m(){Et(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const $=a.value;$.style.height="auto",$.style.height=Math.min($.scrollHeight,120)+"px"}function k($,V,I={}){const D={id:++o,role:$,content:V,timestamp:Date.now(),html:$==="bot"?Dd(V):"",tools_used:I.tools_used||[],is_error:I.is_error||!1,images:$==="bot"?Ld(V):[],files:I.files||[],_showTools:!1};return e.value.push(D),m(),$==="bot"&&Et(()=>C()),D}function C(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(V=>{V.setAttribute("data-copy","true"),V.style.position="relative";const I=document.createElement("button");I.className="chat-code-copy",I.textContent="Copy",I.addEventListener("click",()=>{const D=V.querySelector("code"),G=D?D.textContent:V.textContent;navigator.clipboard.writeText(G).then(()=>{I.textContent="Copied!",setTimeout(()=>{I.textContent="Copy"},1500)}).catch(()=>{})}),V.appendChild(I)})}function v($){if($===0)return!0;const V=e.value[$-1],I=e.value[$],D=new Date(V.timestamp).toDateString(),G=new Date(I.timestamp).toDateString();return D!==G}function b($){const V=new Date($),I=new Date;if(V.toDateString()===I.toDateString())return"Today";const D=new Date(I);return D.setDate(D.getDate()-1),V.toDateString()===D.toDateString()?"Yesterday":V.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function x($){t.value=$,Et(()=>j())}function E($){window.open($,"_blank","noopener")}function S($){$.target.style.display="none"}function N(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function w(){r&&(clearInterval(r),r=null),i.value=0}function A($){s.value&&(s.value=!1,w(),$.type==="chat_response"?k("bot",$.content,{tools_used:$.tools_used||[],is_error:$.is_error||!1,files:$.files||[]}):$.type==="chat_error"&&k("bot",$.error||"Unknown error",{is_error:!0}),Et(()=>{var V;return(V=a.value)==null?void 0:V.focus()}))}async function O($){try{const V=await K.post("/api/chat",{content:$,channel_id:l.value});k("bot",V.response,{tools_used:V.tools_used||[],is_error:V.is_error||!1,files:V.files||[]})}catch(V){k("bot",V.message||"Failed to send message",{is_error:!0})}}async function j(){const $=t.value.trim();!$||s.value||(k("user",$),t.value="",s.value=!0,N(),a.value&&(a.value.style.height="auto"),qe.connected?qe.sendChat($,{channelId:l.value})?L():(await O($),s.value=!1,w()):(await O($),s.value=!1,w()),Et(()=>{var V;return(V=a.value)==null?void 0:V.focus()}))}let M=null;ds(s,$=>{$||M&&(clearTimeout(M),M=null)});function L(){M=setTimeout(()=>{s.value&&(s.value=!1,w(),k("bot","Response timed out. Try again.",{is_error:!0}))},12e4)}async function J(){try{if(!l.value){const V=await K.get("/api/auth/session");l.value=V.channel_id||V.user_id||"web-user"}const $=await K.get("/api/sessions/"+encodeURIComponent(l.value));if($&&$.messages&&$.messages.length>0){for(const V of $.messages){const I=V.role==="user"?"user":"bot";let D=V.content||"";if(I==="user"){const de=D.match(/^\[.*?\]:\s*/);de&&(D=D.slice(de[0].length))}if(!D.trim())continue;const G={id:++o,role:I,content:D,timestamp:V.timestamp?V.timestamp*1e3:Date.now(),html:I==="bot"?Dd(D):"",tools_used:[],is_error:!1,images:I==="bot"?Ld(D):[],files:[],_showTools:!1};e.value.push(G)}Et(()=>{m(),C()})}}catch{}}return $e(()=>{qe.subscribe("chat",A),J(),Et(()=>{var $;return($=a.value)==null?void 0:$.focus()})}),ft(()=>{qe.unsubscribe("chat",A),M&&clearTimeout(M),w()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:j,autoResize:g,formatTime:qk,formatDate:b,showDateSeparator:v,useSuggestion:x,openImage:E,onImageError:S,getToolIcon:zk}}},ir={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=S_(),s=qh(),n=te({get(){var r;const l=t.query.tab;return l&&e.tabs.some(o=>o.id===l)?l:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(l){s.replace({query:{...t.query,tab:l}})}}),a=te(()=>{const l=e.tabs.find(r=>r.id===n.value);return(l==null?void 0:l.component)||null}),i=te(()=>{const l=e.tabs.find(r=>r.id===n.value);return(l==null?void 0:l.label)||""});return ds(i,l=>{e.groupLabel&&l&&(document.title=`Odin — ${e.groupLabel} › ${l}`)},{immediate:!0}),{activeTab:n,activeComponent:a,activeLabel:i}},template:`
    <div>
      <div class="flex border-b border-gray-700 mb-4 overflow-x-auto" role="tablist" :aria-label="groupLabel + ' navigation'">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          role="tab"
          :id="'tab-' + tab.id"
          :aria-selected="activeTab === tab.id"
          :aria-controls="'panel-' + tab.id"
          class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
          :class="activeTab === tab.id
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-gray-400 hover:text-gray-200'"
        >{{ tab.label }}</button>
      </div>
      <div role="tabpanel" :id="'panel-' + activeTab" :aria-labelledby="'tab-' + activeTab">
        <keep-alive>
          <component :is="activeComponent" :key="activeTab" />
        </keep-alive>
      </div>
    </div>
  `},Wk={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,m;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const g={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(d==="tool_end"){const g=e.value.findIndex(k=>k.tool===u.action&&k.status==="running");if(g>=0){const k=e.value[g];k.status=(p=u.metadata)!=null&&p.error?"error":"success",k.elapsed=((m=u.metadata)==null?void 0:m.elapsed_ms)||Date.now()-k.startTime,k.result=u.detail||"",k.fadingOut=!0,setTimeout(()=>{const C=e.value.indexOf(k);C>=0&&e.value.splice(C,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const g=u.tool_name||"unknown";if(u.finished)delete s.value[g];else{const C=((s.value[g]||"")+(u.chunk||"")).split(`
`);s.value[g]=C.slice(-30).join(`
`)}return}}let i=null;function l(){const c=Date.now();e.value.forEach(u=>{u.status==="running"&&(u.elapsed=c-u.startTime)})}$e(()=>{qe.on("events",a),i=setInterval(l,500)}),ft(()=>{qe.off("events",a),i&&clearInterval(i)});function r(c){return c<1e3?`${c}ms`:`${(c/1e3).toFixed(1)}s`}function o(c){return c==="running"?"⏳":c==="success"?"✅":c==="error"?"❌":"⭕"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:r,statusIcon:o}},template:`
    <div class="space-y-6">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <span class="text-2xl">🎯</span> Execution Viewer
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
              <span v-if="task.fadingOut" :class="task.status === 'error' ? 'text-red-400' : 'text-green-400'">{{ statusIcon(task.status) }}</span>
              <span v-else class="animate-pulse text-blue-400">⏳</span>
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
          <span class="text-lg">{{ statusIcon(task.status) }}</span>
          <span class="text-white font-mono text-sm flex-1">{{ task.tool }}</span>
          <span class="text-gray-400 text-xs max-w-md truncate">{{ task.result }}</span>
          <span class="text-gray-500 font-mono text-xs whitespace-nowrap">{{ formatMs(task.elapsed) }}</span>
        </div>
      </div>
    </div>
  `},Jk={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAgents()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="agents.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon">🤖</span>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=null;const r=te(()=>e.value.filter(C=>C.status==="running").length),o=te(()=>e.value.filter(C=>C.status==="completed").length),c=te(()=>e.value.filter(C=>["failed","timeout","killed"].includes(C.status)).length),u=te(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=te(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(C=>["failed","timeout","killed"].includes(C.status)):e.value.filter(C=>C.status===i.value));function f(C){return Math.min(100,Math.round(C.iteration_count/30*100))}async function p(C=!1){C=C===!0,C||(t.value=!0);try{const v=await K.get("/api/agents");e.value=Array.isArray(v)?v:[],s.value=null}catch(v){C||(s.value=v.message)}C||(t.value=!1)}async function m(C){const v=e.value.find(x=>x.id===C);if(await ns({title:"Kill agent",message:`Kill agent "${(v==null?void 0:v.label)||C}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=C;try{await K.del(`/api/agents/${encodeURIComponent(C)}`),xe.success("Agent killed"),await p()}catch(x){xe.error(x.message||"Failed to kill agent")}n.value=null}}function g(){k(),a.value&&(l=setInterval(()=>{a.value&&p(!0)},5e3))}function k(){l&&(clearInterval(l),l=null)}return $e(()=>{p(),g()}),ft(()=>{k()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:Ta,formatDuration:_a,progressPercent:f,fetchAgents:p,killAgent:m,startAutoRefresh:g,stopAutoRefresh:k}}},Yk={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchLoops()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="loops.length === 0 && !showCreate" class="hm-card empty-state">
        <span class="empty-state-icon">🔄</span>
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
                <span class="tool-expand-icon" :style="{ transform: expandedHistory[loop.id] ? 'rotate(90deg)' : '' }">&#9654;</span>
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=te(()=>e.value.reduce((S,N)=>S+(N.iteration_count||0),0)),d=te(()=>e.value.filter(S=>S.status==="running").length);function f(S){return S==="running"?"loop-status-running":S==="error"?"loop-status-error":"loop-status-stopped"}function p(S){return S==="running"?"badge-success":S==="error"?"badge-danger":S==="completed"?"badge-info":"badge-warning"}function m(S){return S==="act"?"badge-warning":S==="silent"?"badge-info":"badge-success"}function g(S){c.value={...c.value,[S]:!c.value[S]}}async function k(S=!1){S=S===!0,S||(t.value=!0);try{e.value=await K.get("/api/loops"),s.value=null}catch(N){S||(s.value=N.message)}S||(t.value=!1)}async function C(){l.value=null;const S=a.value;if(!S.goal.trim()){l.value="Goal is required";return}if(!S.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:S.goal.trim(),channel_id:S.channel_id.trim(),interval_seconds:S.interval_seconds||60,mode:S.mode,max_iterations:S.max_iterations||50};S.stop_condition.trim()&&(N.stop_condition=S.stop_condition.trim()),i.value=!0;try{const w=await K.post("/api/loops",N);xe.success(`Loop started: ${w.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await k()}catch(w){l.value=w.message}i.value=!1}async function v(S){if(await ns({title:"Stop loop",message:`Stop loop ${S}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=S;try{await K.del(`/api/loops/${encodeURIComponent(S)}`),xe.success("Loop stopped"),await k()}catch(w){xe.error(w.message||"Failed to stop loop")}r.value=null}}async function b(S){o.value=S;try{await K.post(`/api/loops/${encodeURIComponent(S)}/restart`),xe.success("Loop restarted"),await k()}catch(N){xe.error(N.message||"Failed to restart loop")}o.value=null}function x(S){S.payload&&(S.payload.loop_id||S.payload.type==="loop")&&k(!0)}let E=null;return $e(()=>{k(),qe.subscribe("events",x),E=setInterval(()=>{k(!0)},5e3)}),ft(()=>{qe.unsubscribe("events",x),E&&clearInterval(E)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:m,formatDuration:_a,formatAge:zh,toggleHistory:g,fetchLoops:k,doCreate:C,doStop:v,doRestart:b}}},Qk={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Processes</h1>
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchProcesses()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="processes.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon">⚙️</span>
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=te(()=>e.value.filter(g=>g.status==="running").length),r=te(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function u(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(k){g||(s.value=k.message)}g||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ds(n,g=>{g?d():f()});async function p(g){if(await ns({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await K.del(`/api/processes/${g}`),xe.success(`Process ${g} killed`),await u()}catch(C){xe.error(C.message||"Failed to kill process")}i.value=null}}function m(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&u(!0)}return $e(()=>{u(),qe.subscribe("events",m),d()}),ft(()=>{qe.unsubscribe("events",m),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:_a,fetchProcesses:u,doKill:p}}},Xk={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Schedules</h1>
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
      <div v-if="showCreate" class="hm-card mb-4">
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSchedules" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="schedules.length === 0 && !showCreate" class="hm-card empty-state">
        <span class="empty-state-icon">⏰</span>
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
              <td class="text-center" style="width:30px;cursor:pointer;" @click="toggleExpand(s.id)">
                <span class="text-gray-500 text-xs">{{ expandedId === s.id ? '▼' : '▶' }}</span>
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),m=h(null),g=h([]),k=h(!1),C=te(()=>e.value.filter(I=>I.cron&&!I.one_time).length),v=te(()=>e.value.filter(I=>I.one_time).length),b=te(()=>e.value.filter(I=>I.trigger).length),x=te(()=>e.value.filter(I=>I.paused).length),E=te(()=>e.value.filter(I=>I.consecutive_failures>0).length);function S(I){if(!I)return"-";const D=Date.now(),de=(new Date(I).getTime()-D)/1e3;if(de<0)return"overdue";if(de<60)return"in < 1 min";if(de<3600)return`in ${Math.floor(de/60)} min`;if(de<86400){const ie=Math.floor(de/3600),pe=Math.floor(de%3600/60);return pe>0?`in ${ie}h ${pe}m`:`in ${ie}h`}const ve=Math.floor(de/86400);return`in ${ve} day${ve!==1?"s":""}`}function N(I){return I==null?"-":I<1e3?`${I}ms`:I<6e4?`${(I/1e3).toFixed(1)}s`:_a(I/1e3)}function w(){r.value=null}async function A(){const I=a.value.cron.trim();if(I){o.value=!0;try{r.value=await K.post("/api/schedules/validate-cron",{expression:I})}catch(D){r.value={valid:!1,error:D.message}}o.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(I){s.value=I.message}t.value=!1}async function j(I){if(m.value===I){m.value=null,g.value=[];return}m.value=I,k.value=!0,g.value=[];try{g.value=await K.get(`/api/schedules/${encodeURIComponent(I)}/history?limit=10`)}catch{g.value=[]}k.value=!1}async function M(){l.value=null;const I=a.value;if(!I.description.trim()){l.value="Description is required";return}if(!I.channel_id.trim()){l.value="Channel ID is required";return}if(!I.cron.trim()&&!I.run_at.trim()){l.value="Cron expression or run_at time is required";return}const D={description:I.description.trim(),action:I.action,channel_id:I.channel_id.trim()};if(I.cron.trim()&&(D.cron=I.cron.trim()),I.run_at.trim()&&(D.run_at=I.run_at.trim()),I.action==="reminder"&&I.message.trim()&&(D.message=I.message.trim()),I.action==="check"&&(I.tool_name.trim()&&(D.tool_name=I.tool_name.trim()),I.tool_input_str.trim()))try{D.tool_input=JSON.parse(I.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",D),xe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await O()}catch(G){l.value=G.message}i.value=!1}async function L(I){u.value=I;try{const D=await K.post(`/api/schedules/${encodeURIComponent(I)}/run`);if(D.status==="failure")xe.error(`Execution failed: ${D.error||"unknown error"}`);else{const G=D.warning?`Executed (${D.warning})`:"Executed successfully";xe.success(G)}await O()}catch(D){xe.error(D.message||"Failed to trigger")}u.value=null}async function J(I){f.value=I.id;const D=!I.paused;try{await K.put(`/api/schedules/${encodeURIComponent(I.id)}`,{paused:D}),xe.success(D?"Schedule paused":"Schedule resumed"),await O()}catch(G){xe.error(G.message||"Failed to update schedule")}f.value=null}async function $(I){p.value=I;try{await K.post(`/api/schedules/${encodeURIComponent(I)}/reset-failures`),xe.success("Failure counters reset"),await O()}catch(D){xe.error(D.message||"Failed to reset")}p.value=null}async function V(I){const D=e.value.find(de=>de.id===I);if(await ns({title:"Delete schedule",message:`Delete "${(D==null?void 0:D.description)||I}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=I;try{await K.del(`/api/schedules/${encodeURIComponent(I)}`),xe.success("Schedule deleted"),await O()}catch(de){xe.error(de.message||"Failed to delete schedule")}d.value=null}}return $e(()=>{O()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:m,history:g,historyLoading:k,cronCount:C,oneTimeCount:v,webhookCount:b,pausedCount:x,failingCount:E,formatTs:Ta,formatAge:zh,formatFuture:S,formatMs:N,formatDuration:_a,onCronInput:w,validateCron:A,toggleExpand:j,fetchSchedules:O,doCreate:M,doRunNow:L,doTogglePause:J,doResetFailures:$,doDelete:V}}},Zk={components:{TabbedPage:ir},setup(){return{tabs:[{id:"live",label:"Live",component:Wk},{id:"agents",label:"Agents",component:Jk},{id:"loops",label:"Loops",component:Yk},{id:"processes",label:"Processes",component:Qk},{id:"schedules",label:"Schedules",component:Xk}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ew={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAudit" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="entries.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon">📝</span>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await K.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return $e(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Ta,formatDetail:i,truncateBlock:Gh,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Pd=[{id:"all",name:"All Sessions",icon:"☰",filters:{}},{id:"active",name:"Recently Active",icon:"⚡",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"💬",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"🌐",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"📖",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"🗜",filters:{hasCompaction:!0}}],tw=[{value:"last_active",label:"Last Active",icon:"🕑"},{value:"created_at",label:"Created",icon:"📅"},{value:"message_count",label:"Message Count",icon:"📊"}],sw={template:`
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
            <span class="sess-preset-icon">{{ preset.icon }}</span>
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
              {{ opt.icon }} {{ opt.label }}
            </option>
          </select>
          <button @click="sortAsc = !sortAsc" class="btn btn-ghost text-xs"
                  :title="sortAsc ? 'Ascending' : 'Descending'">
            {{ sortAsc ? '↑' : '↓' }}
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
            <span>★</span>
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="sessions.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon">💬</span>
        <span class="empty-state-text">No active sessions</span>
        <span class="empty-state-hint">Sessions appear when users interact with Odin via Discord or the chat interface</span>
      </div>
      <div v-else-if="filteredSessions.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon">🔍</span>
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
                {{ s.source === 'web' ? '🌐' : '💬' }}
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
                <span class="sess-expand-icon" :class="{ 'sess-expanded': expandedId === s.channel_id }">
                  ▶
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
                      <span class="text-xs text-gray-500">{{ collapsedThreads.has(ti) ? '▶' : '▼' }}</span>
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
      <div v-if="clearTarget" class="modal-overlay" @click.self="clearTarget = null" @keyup.escape="clearTarget = null" role="dialog" aria-modal="true" aria-labelledby="sess-clear-title">
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
      <div v-if="bulkClearing" class="modal-overlay" @click.self="bulkClearing = false" @keyup.escape="bulkClearing = false" role="dialog" aria-modal="true" aria-labelledby="sess-bulk-clear-title">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),m=Pd,g=tw,k=h([]),C=h(!1),v=h(""),b=h("flat"),x=h(new Set),E=h(""),S=h(""),N=h(""),w=h(null),A=h(!1);function O(){try{const U=localStorage.getItem("odin-session-presets");U&&(k.value=JSON.parse(U))}catch{}}function j(){try{localStorage.setItem("odin-session-presets",JSON.stringify(k.value))}catch{}}const M=te(()=>d.value.trim()!==""||u.value!=="all"),L=te(()=>{let U=[...e.value];const ce=Pd.find(Ke=>Ke.id===u.value),ye=ce?ce.filters:{};if(ye.source&&(U=U.filter(Ke=>Ke.source===ye.source)),ye.minMessages&&(U=U.filter(Ke=>Ke.message_count>=ye.minMessages)),ye.hasCompaction&&(U=U.filter(Ke=>Ke.has_summary)),ye.maxAge!=null){const Ke=Date.now()/1e3;U=U.filter(St=>St.last_active&&Ke-St.last_active<=ye.maxAge)}if(d.value.trim()){const Ke=d.value.toLowerCase().trim();U=U.filter(St=>(St.channel_id||"").toLowerCase().includes(Ke)||(St.last_user_id||"").toLowerCase().includes(Ke)||(St.source||"").toLowerCase().includes(Ke))}const Me=f.value,Je=p.value?1:-1;return U.sort((Ke,St)=>{const st=Ke[Me]||0,Ye=St[Me]||0;return(st-Ye)*Je}),U}),J=te(()=>{if(!a.value||!a.value.messages)return[];const U=a.value.messages;if(U.length===0)return[];const ce=[];let ye=[];for(const Me of U)Me.role==="user"&&ye.length>0&&(ce.push(ye),ye=[]),ye.push(Me);return ye.length>0&&ce.push(ye),ce}),$=te(()=>L.value.length>0&&o.value.size===L.value.length);function V(U){const ce=U.find(ye=>ye.role==="user");if(ce&&ce.content){const ye=ce.content.slice(0,120);return ye.length<ce.content.length?ye+"...":ye}return"(no user message)"}function I(U){const ce=new Set(x.value);ce.has(U)?ce.delete(U):ce.add(U),x.value=ce}function D(U){u.value=U}function G(U){u.value=U.id,U.filters.searchQuery!=null&&(d.value=U.filters.searchQuery),U.filters.sortBy&&(f.value=U.filters.sortBy)}function de(){if(!v.value.trim())return;const U={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};k.value=[...k.value,U],j(),C.value=!1,v.value=""}function ve(U){k.value=k.value.filter(ce=>ce.id!==U),j(),u.value===U&&(u.value="all")}function ie(){u.value="all",d.value="",f.value="last_active",p.value=!1}function pe(U){if(!U)return"—";const ce=Date.now()/1e3-U;if(ce<60)return"just now";if(ce<3600){const Me=Math.floor(ce/60);return`${Me} minute${Me!==1?"s":""} ago`}if(ce<86400){const Me=Math.floor(ce/3600);return`${Me} hour${Me!==1?"s":""} ago`}const ye=Math.floor(ce/86400);return`${ye} day${ye!==1?"s":""} ago`}function X(U){if(!U)return"";try{return new Date(U*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ue(U){if(!U)return"";try{return new Date(U*1e3).toLocaleString()}catch{return""}}function Ie(U){return U==="user"?"bg-gray-900/50 border border-gray-800":U==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function q(U){return U==="user"?"sess-msg-user":U==="assistant"?"sess-msg-assistant":"sess-msg-system"}function re(U){return U==="user"?"badge-info":U==="assistant"?"badge-success":"badge-warning"}function le(U){return U==="user"?"sess-dot-user":U==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ge(U){return U==="user"?"text-cyan-400":U==="assistant"?"text-indigo-400":"text-gray-500"}function me(U){return U?U.length>2e3?U.slice(0,2e3)+`
... (truncated)`:U:""}async function Le(){const U=E.value.trim();if(U){A.value=!0;try{let ce=`/api/sessions/search?q=${encodeURIComponent(U)}&limit=50`;S.value.trim()&&(ce+=`&channel_id=${encodeURIComponent(S.value.trim())}`),N.value.trim()&&(ce+=`&user_id=${encodeURIComponent(N.value.trim())}`);const ye=await K.get(ce);w.value=ye.results||[]}catch{w.value=[]}A.value=!1}}function y(){E.value="",S.value="",N.value="",w.value=null}function T(U){return U?U.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function P(U){return U==="user"?"bg-gray-900/50 border-gray-800":U==="assistant"?"bg-indigo-950/30 border-indigo-900/30":U==="summary"?"bg-amber-950/20 border-amber-900/30":U==="fts"?"bg-emerald-950/20 border-emerald-900/30":U==="channel"?"bg-purple-950/20 border-purple-900/30":"bg-gray-900/30 border-gray-800/50"}function W(U){return U==="user"?"badge-info":U==="assistant"?"badge-success":U==="summary"?"badge-warning":U==="fts"?"badge-success":"badge-info"}async function R(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(U){s.value=U.message}t.value=!1}function F(){s.value=null,R()}async function Y(U){if(n.value===U){n.value=null,a.value=null,x.value=new Set;return}n.value=U,a.value=null,i.value=!0,x.value=new Set;try{a.value=await K.get(`/api/sessions/${encodeURIComponent(U)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function Z(U){const ce=new Set(o.value);ce.has(U)?ce.delete(U):ce.add(U),o.value=ce}function se(){$.value?o.value=new Set:o.value=new Set(L.value.map(U=>U.channel_id))}function Q(U){l.value=U}async function B(){if(l.value){r.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await R()}catch(U){s.value=U.message||"Failed to clear session"}r.value=!1,l.value=null}}function ee(){c.value=!0}async function oe(){if(o.value.size!==0){r.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await R()}catch(U){s.value=U.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function be(U,ce){const ye=K._token;let Me=`/api/sessions/${encodeURIComponent(U)}/export?format=${ce}`;ye&&(Me+=`&token=${encodeURIComponent(ye)}`);const Je=document.createElement("a");Je.href=Me,Je.download=`session-${U}.${ce==="text"?"txt":"json"}`,document.body.appendChild(Je),Je.click(),document.body.removeChild(Je)}let Te=null;function Ae(U){U.payload&&U.payload.channel_id&&(clearTimeout(Te),Te=setTimeout(()=>{R(),n.value&&U.payload.channel_id===n.value&&K.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(ce=>{a.value=ce}).catch(()=>{})},2e3))}return $e(()=>{O(),R(),qe.subscribe("events",Ae)}),ft(()=>{qe.unsubscribe("events",Ae),clearTimeout(Te)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:$,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:m,sortOptions:g,filteredSessions:L,hasActiveFilters:M,customPresets:k,showSavePreset:C,newPresetName:v,threadView:b,threads:J,collapsedThreads:x,ftsQuery:E,ftsChannelId:S,ftsUserId:N,ftsResults:w,ftsSearching:A,formatAge:pe,formatTimestamp:X,formatFullTimestamp:ue,messageClass:Ie,threadMsgClass:q,roleBadge:re,roleDotClass:le,roleLabelClass:ge,truncateContent:me,threadSummary:V,fetchSessions:R,retry:F,toggleSession:Y,toggleSelect:Z,toggleSelectAll:se,confirmClear:Q,clearSession:B,confirmBulkClear:ee,doBulkClear:oe,exportSession:be,applyPreset:D,applyCustomPreset:G,saveCustomPreset:de,removeCustomPreset:ve,resetFilters:ie,toggleThread:I,runFtsSearch:Le,clearFtsSearch:y,highlightSnippet:T,ftsResultClass:P,ftsTypeBadge:W}}},nw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:R_}}},aw={components:{ContextAssemblyPanel:nw},template:`
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
                    <span class="text-gray-600">{{ isIterationExpanded('single', idx) ? '▲' : '▼' }}</span>
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
          <span class="error-icon" aria-hidden="true">⚠</span>
          <p class="text-red-400">{{ error }}</p>
          <button @click="fetchTraces" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <div v-else-if="entries.length === 0" class="hm-card empty-state">
          <span class="empty-state-icon">🔍</span>
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
                        <span class="text-gray-600">{{ isIterationExpanded('list', idx) ? '▲' : '▼' }}</span>
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(N){if(!N)return"—";try{const w=new Date(N);return isNaN(w.getTime())?N:w.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return N}}function f(N){return!N&&N!==0?"—":N<1e3?N+"ms":(N/1e3).toFixed(1)+"s"}function p(N){return!N&&N!==0?"—":N>=1e3?(N/1e3).toFixed(1)+"k":String(N)}function m(N){if(!N)return"";if(typeof N=="string")return N;try{return JSON.stringify(N,null,2)}catch{return String(N)}}function g(N){a.value===N?a.value=null:(a.value=N,c.value={})}function k(N,w){const A=N+"-"+w;c.value={...c.value,[A]:!c.value[A]}}function C(N,w){return!!c.value[N+"-"+w]}function v(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,E()}async function b(){try{const N=await K.get("/api/trajectories");e.value=N.files||[],o.value=N.count||0}catch{}}let x=0;async function E(){const N=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const w=await K.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(N!==x)return;let A=w.entries||[];u.value.tool_name&&(A=A.filter(O=>(O.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(A=A.filter(O=>O.is_error)),u.value.channel_id&&(A=A.filter(O=>O.channel_id===u.value.channel_id)),u.value.user_id&&(A=A.filter(O=>O.user_id===u.value.user_id)),t.value=A}else{const w=new URLSearchParams;u.value.channel_id&&w.set("channel_id",u.value.channel_id),u.value.user_id&&w.set("user_id",u.value.user_id),u.value.tool_name&&w.set("tool_name",u.value.tool_name),u.value.errors_only&&w.set("errors_only","true"),w.set("limit",String(u.value.limit));const A=w.toString(),O=await K.get(`/api/trajectories/search/query?${A}`);if(N!==x)return;t.value=O.results||[]}}catch(w){if(N!==x)return;n.value=w.message}N===x&&(s.value=!1)}async function S(){if(!l.value.trim())return;const N=++x;s.value=!0,n.value=null,c.value={};try{const w=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(N!==x)return;i.value=w.entry||null,i.value||(n.value="No trace found for this message ID")}catch(w){if(N!==x)return;w.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=w.message}N===x&&(s.value=!1)}return $e(async()=>{await b(),await E()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:m,truncateBlock:Gh,toggleExpand:g,toggleIteration:k,isIterationExpanded:C,clearFilters:v,fetchFiles:b,fetchTraces:E,lookupMessage:S}}},iw={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=te(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await K.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return $e(()=>{o(),i=setInterval(o,15e3)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:Kh,formatTime:yc,retry:c}}},lw={components:{TabbedPage:ir},setup(){return{tabs:[{id:"audit",label:"Audit",component:ew},{id:"sessions",label:"Sessions",component:sw},{id:"traces",label:"Traces",component:aw},{id:"usage",label:"Usage",component:iw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Pr=[{id:"system",label:"System & Commands",icon:"🖥",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"🛠",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"🤖",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"📋",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"🌐",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"📚",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"💬",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"🧩",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"🧠",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"✨",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"🔗",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"🔧",match:()=>!0}],rw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Tools</h1>
        <div class="flex gap-2 items-center">
          <div class="tl-view-toggle" role="toolbar" aria-label="View mode">
            <button @click="viewMode = 'cards'" class="tl-view-btn" :class="{ 'tl-view-active': viewMode === 'cards' }" :aria-pressed="viewMode === 'cards'" aria-label="Card view"><span aria-hidden="true">▦</span></button>
            <button @click="viewMode = 'table'" class="tl-view-btn" :class="{ 'tl-view-active': viewMode === 'table' }" :aria-pressed="viewMode === 'table'" aria-label="Table view"><span aria-hidden="true">☰</span></button>
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
        <span class="error-icon" aria-hidden="true">⚠</span>
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
              <span aria-hidden="true">{{ cat.icon }}</span> {{ cat.label }}
            </button>
          </div>
        </div>

        <!-- CARD VIEW -->
        <div v-if="viewMode === 'cards'">
          <div v-for="group in groupedTools" :key="group.label" class="mb-5">
            <div class="tl-group-header">
              <span class="tl-group-icon">{{ group.icon }}</span>
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
              <span class="tl-group-icon">{{ group.icon }}</span>
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
                      <span class="tool-expand-icon text-gray-600 mr-1">{{ expanded[t.name] ? '▼' : '▶' }}</span>
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
          <span class="empty-state-icon">🔍</span>
          <span class="empty-state-text">No tools match "{{ search }}"</span>
          <span class="empty-state-hint">Try a different search term</span>
        </div>
      </div>
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=te(()=>e.value.filter(v=>v.is_core).length),c=te(()=>e.value.filter(v=>!v.is_core).length),u=te(()=>Object.values(a.value).reduce((v,b)=>v+b,0));function d(v){for(const b of Pr)if(b.id!=="other"&&b.match(v))return b.id;return"other"}const f=te(()=>{let v=e.value;if(n.value){const b=n.value.toLowerCase();v=v.filter(x=>x.name.toLowerCase().includes(b)||(x.description||"").toLowerCase().includes(b))}return r.value&&(v=v.filter(b=>d(b.name)===r.value)),v}),p=te(()=>{const v=new Set;for(const b of e.value)v.add(d(b.name));return Pr.filter(b=>v.has(b.id))}),m=te(()=>{const v=f.value,b={};for(const E of v){const S=d(E.name);b[S]||(b[S]=[]),b[S].push(E)}const x=[];for(const E of Pr)b[E.id]&&b[E.id].length>0&&x.push({label:E.label,icon:E.icon,tools:b[E.id].sort((S,N)=>S.name.localeCompare(N.name))});return x});function g(v){i.value={...i.value,[v]:!i.value[v]}}async function k(){t.value=!0,s.value=null;try{const[v,b]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({}))]);e.value=v,a.value=b||{};const x=Object.values(b||{}).filter(E=>E>0).sort((E,S)=>E-S)}catch(v){s.value=v.message}t.value=!1}function C(){k()}return $e(()=>{k()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:m,usedCategories:p,truncate:xc,toggleExpand:g,refresh:C}}};function ow(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function cw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const uw={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSkills" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <!-- Empty state -->
      <div v-else-if="skills.length === 0 && !editing" class="hm-card empty-state">
        <span class="empty-state-icon">🧩</span>
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
                <span class="sk-card-icon">🧩</span>
                <span class="sk-card-name">{{ s.name }}</span>
                <span v-if="s.execution_count > 0" class="sk-card-runs">{{ s.execution_count.toLocaleString() }} runs</span>
              </div>
              <div class="sk-card-actions">
                <button @click.stop="testSkill(s.name)"
                        class="sk-action-btn sk-action-test"
                        :disabled="testing === s.name"
                        :title="testing === s.name ? 'Testing...' : 'Run test'">
                  {{ testing === s.name ? '⏳' : '▶' }}
                </button>
                <button @click.stop="toggleCode(s.name)"
                        class="sk-action-btn sk-action-code"
                        :title="showCode[s.name] ? 'Hide code' : 'View code'">
                  {{ showCode[s.name] ? '📖' : '📄' }}
                </button>
                <button @click.stop="editSkill(s)" class="sk-action-btn sk-action-edit" title="Edit">✎</button>
                <button @click.stop="confirmDelete(s.name)" class="sk-action-btn sk-action-delete" title="Delete">✕</button>
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
                {{ testResults[s.name].is_error ? '✘ Test Failed' : '✔ Test Passed' }}
              </div>
              <div class="sk-test-output">{{ truncate(testResults[s.name].result, 500) }}</div>
            </div>

            <!-- Code preview with line numbers -->
            <div v-if="showCode[s.name] && s.code" class="sk-code-container">
              <div class="sk-code-header">
                <span class="sk-code-filename">{{ s.name }}.py</span>
                <button @click.stop="copyCode(s.code)" class="sk-code-copy" title="Copy code">
                  {{ copied === s.name ? '✔' : '📋' }}
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
          <span class="empty-state-icon">🔍</span>
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
          <span>{{ editValidation.valid ? '✔ Valid Python structure' : '⚠ ' + editValidation.message }}</span>
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
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null" role="dialog" aria-modal="true" aria-labelledby="skill-delete-title">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),m=h(!1),g=h(null),k=h(null),C=h(!1),v=te(()=>e.value.length),b=te(()=>e.value.reduce((X,ue)=>X+(ue.execution_count||0),0)),x=te(()=>e.value.reduce((X,ue)=>X+O(ue.code),0)),E=te(()=>{if(!l.value)return e.value;const X=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(X)||(ue.description||"").toLowerCase().includes(X))}),S=te(()=>d.value?d.value.split(`
`).length:0),N=te(()=>{const X=Math.max(S.value,1);return Array.from({length:X},(ue,Ie)=>Ie+1).join(`
`)}),w=te(()=>{const X=d.value.trim();return X?X.includes("SKILL_DEFINITION")?X.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function A(X){return ow(X)}function O(X){return X?X.split(`
`).length:0}function j(X){return cw(X)}function M(X){n.value={...n.value,[X]:!n.value[X]}}async function L(X){try{await navigator.clipboard.writeText(X);const ue=e.value.find(Ie=>Ie.code===X);ue&&(r.value=ue.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function J(X){if(X.key==="Tab"){X.preventDefault();const ue=X.target,Ie=ue.selectionStart,q=ue.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(q),Et(()=>{ue.selectionStart=ue.selectionEnd=Ie+4})}}function $(X){const ue=X.target.previousElementSibling;ue&&(ue.scrollTop=X.target.scrollTop)}async function V(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(X){s.value=X.message}t.value=!1}async function I(X){i.value=X,delete a.value[X],a.value={...a.value};try{const ue=await K.post(`/api/skills/${encodeURIComponent(X)}/test`);a.value={...a.value,[X]:ue}}catch(ue){a.value={...a.value,[X]:{result:ue.message,is_error:!0}}}i.value=null}function D(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function G(X){o.value=!0,c.value="edit",u.value=X.name,d.value=X.code||"",f.value=null,p.value=null}function de(){o.value=!1,f.value=null,p.value=null}async function ve(){f.value=null,p.value=null;const X=u.value.trim(),ue=d.value.trim();if(!X){f.value="Name is required";return}if(!ue){f.value="Code is required";return}m.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:X,code:ue}),p.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(X)}`,{code:ue}),p.value="Skill updated successfully"),await V(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}m.value=!1}function ie(X){k.value=X}async function pe(){if(k.value){C.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(k.value)}`),await V()}catch{}C.value=!1,k.value=null}}return $e(()=>{V()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:m,editorRef:g,deleteTarget:k,deleting:C,enabledCount:v,totalExecutions:b,totalLines:x,displayedSkills:E,editLineCount:S,editorLineNums:N,editValidation:w,highlight:A,truncate:xc,formatTs:Ta,countLines:O,getLineNumbers:j,toggleCode:M,copyCode:L,handleEditorKey:J,syncScroll:$,fetchSkills:V,testSkill:I,showCreate:D,editSkill:G,cancelEdit:de,saveSkill:ve,confirmDelete:ie,doDelete:pe}}};function dw(e,t){if(!e||!t)return fd(e);const s=fd(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const fw={template:`
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
          <span class="empty-state-icon">🔍</span>
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSources" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="sources.length === 0 && !showIngest" class="hm-card empty-state">
        <span class="empty-state-icon">📚</span>
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
              <span class="kb-tree-arrow" :class="{ 'kb-tree-arrow-open': expanded[s.source || s.name || s] }" aria-hidden="true">
                ▶
              </span>
              <span class="kb-tree-icon">📄</span>
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
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null" role="dialog" aria-modal="true" aria-labelledby="kb-delete-title">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),m=h(null),g=h(null);let k=null;const C=h(null),v=h(!1),b=h({}),x=h({}),E=h(null),S=h(null),N=te(()=>e.value.reduce((D,G)=>D+(G.chunks||0),0)),w=te(()=>new Set(e.value.map(G=>G.uploader).filter(Boolean)).size);function A(D,G){const de=x.value[G];if(!de||de.length===0)return 0;const ve=Math.max(...de.map(ie=>ie.char_count||0));return ve===0?0:Math.round(D.char_count/ve*100)}async function O(){t.value=!0,s.value=null;try{const D=await K.get("/api/knowledge");e.value=Array.isArray(D)?D:[]}catch(D){s.value=D.message}t.value=!1}async function j(D){if(b.value[D]){b.value[D]=!1,S.value=null;return}if(b.value[D]=!0,!(x.value[D]||E.value===D)){E.value=D;try{const G=await K.get(`/api/knowledge/${encodeURIComponent(D)}/chunks`);x.value[D]=Array.isArray(G)?G:[]}catch(G){x.value[D]=[],xe.error(`Failed to load chunks: ${G.message}`)}E.value=null}}async function M(){const D=n.value.trim();if(D){i.value=!0,r.value=null,l.value=D;try{const G=await K.get(`/api/knowledge/search?q=${encodeURIComponent(D)}`);a.value=Array.isArray(G)?G:[]}catch(G){a.value=[],r.value=G.message||"Search failed"}i.value=!1}}function L(){a.value=null,n.value="",r.value=null}async function J(){d.value=null,f.value=null;const D=c.value.trim(),G=u.value.trim();if(!D){d.value="Source name is required";return}if(!G){d.value="Content is required";return}p.value=!0;try{const de=await K.post("/api/knowledge",{source:D,content:G});f.value=`Ingested ${de.chunks||0} chunks from "${D}"`,c.value="",u.value="",x.value={},await O(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(de){d.value=de.message}p.value=!1}async function $(D){m.value=D,g.value=null,k&&(clearTimeout(k),k=null);try{const G=await K.post(`/api/knowledge/${encodeURIComponent(D)}/reingest`);g.value={source:D,error:!1,message:`Re-ingested ${G.chunks||0} chunks`},delete x.value[D],await O(),k=setTimeout(()=>{g.value=null,k=null},3e3)}catch(G){g.value={source:D,error:!0,message:G.message}}m.value=null}function V(D){C.value=D}async function I(){if(C.value){v.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(C.value)}`),delete x.value[C.value],await O()}catch{}v.value=!1,C.value=null}}return $e(()=>{O()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:m,reingestResult:g,deleteTarget:C,deleting:v,expanded:b,sourceChunks:x,loadingChunks:E,selectedChunk:S,totalChunks:N,uploaderCount:w,truncate:xc,formatTs:Ta,highlightTerms:dw,chunkBarWidth:A,fetchSources:O,toggleSource:j,doSearch:M,clearSearch:L,doIngest:J,doReingest:$,confirmDelete:V,doDelete:I}}},pw={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchMemory" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="scopes.length === 0 && !showAdd" class="hm-card empty-state">
        <span class="empty-state-icon">🧠</span>
        <span class="empty-state-text">No memory entries</span>
        <span class="empty-state-hint">Click "Add Entry" or let Odin learn preferences through conversations</span>
      </div>

      <!-- Memory tree -->
      <div v-else class="mem-tree">
        <div v-for="scope in scopes" :key="scope.name" class="mem-tree-node">
          <!-- Scope header -->
          <div class="mem-tree-header" @click="toggleScope(scope.name)">
            <span class="mem-tree-arrow" :class="{ 'mem-tree-arrow-open': expanded[scope.name] }">
              ▶
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
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null" role="dialog" aria-modal="true" aria-labelledby="mem-delete-title">
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
      <div v-if="showBulkDelete" class="modal-overlay" @click.self="showBulkDelete = false" role="dialog" aria-modal="true" aria-labelledby="mem-bulk-delete-title">
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),m=h(!1),g=h(null),k=h(null),C=h(new Set),v=h(null),b=h(!1),x=h(!1),E=te(()=>e.value.reduce((ie,pe)=>ie+pe.count,0)),S=te(()=>C.value.size);function N(ie){const pe=t.value[ie];if(!pe)return[];if(!l.value.trim())return pe;const X=l.value.trim().toLowerCase();return pe.filter(ue=>ue.key.toLowerCase().includes(X)||ue.value&&ue.value.toLowerCase().includes(X))}function w(ie,pe){return C.value.has(ie+"/"+pe)}function A(ie,pe){const X=ie+"/"+pe,ue=new Set(C.value);ue.has(X)?ue.delete(X):ue.add(X),C.value=ue}function O(ie){const pe=t.value[ie];return!pe||pe.length===0?!1:pe.every(X=>C.value.has(ie+"/"+X.key))}function j(ie,pe){const X=t.value[ie];if(!X)return;const ue=new Set(C.value);for(const Ie of X){const q=ie+"/"+Ie.key;pe?ue.add(q):ue.delete(q)}C.value=ue}async function M(){s.value=!0,n.value=null;try{const ie=await K.get("/api/memory");e.value=Object.entries(ie).map(([pe,X])=>({name:pe,keys:X.keys||[],count:X.count||0}))}catch(ie){n.value=ie.message}s.value=!1}async function L(ie){if(a.value[ie]){a.value[ie]=!1;return}a.value[ie]=!0;const pe=e.value.find(ue=>ue.name===ie);if(!pe||t.value[ie]||i.value===ie)return;i.value=ie;const X=await Promise.all(pe.keys.map(async ue=>{try{const Ie=await K.get(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(ue)}`);return{key:ue,value:Ie.value||""}}catch{return{key:ue,value:"(error loading)"}}}));t.value[ie]=X,i.value=null}function J(ie,pe,X){f.value=ie+"/"+pe,p.value=X}async function $(ie,pe){m.value=!0,g.value=null;try{await K.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(pe)}`,{value:p.value});const X=t.value[ie];if(X){const ue=X.find(Ie=>Ie.key===pe);ue&&(ue.value=p.value)}f.value=null}catch(X){g.value=`Failed to save: ${X.message||"unknown error"}`}m.value=!1}async function V(ie,pe){try{await navigator.clipboard.writeText(pe.value),k.value=ie+"/"+pe.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function I(){u.value=null,d.value=null;const ie=o.value.scope.trim(),pe=o.value.key.trim(),X=o.value.value.trim();if(!ie){u.value="Scope is required";return}if(!pe){u.value="Key is required";return}if(!X){u.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(pe)}`,{value:X}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await M(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(ue){u.value=ue.message}c.value=!1}function D(ie,pe){v.value={scope:ie,key:pe}}async function G(){if(!v.value)return;b.value=!0,g.value=null;const{scope:ie,key:pe}=v.value;try{await K.del(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(pe)}`);const X=t.value[ie];X&&(t.value[ie]=X.filter(q=>q.key!==pe));const ue=e.value.find(q=>q.name===ie);ue&&(ue.count--,ue.keys=ue.keys.filter(q=>q!==pe));const Ie=new Set(C.value);Ie.delete(ie+"/"+pe),C.value=Ie}catch(X){g.value=`Failed to delete: ${X.message||"unknown error"}`}b.value=!1,v.value=null}function de(){x.value=!0}async function ve(){b.value=!0,g.value=null;const ie=[];for(const pe of C.value){const X=pe.indexOf("/");ie.push({scope:pe.slice(0,X),key:pe.slice(X+1)})}try{await K.post("/api/memory/bulk-delete",{entries:ie}),C.value=new Set,t.value={},await M()}catch(pe){g.value=`Bulk delete failed: ${pe.message||"unknown error"}`}b.value=!1,x.value=!1}return $e(()=>{M()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:m,actionError:g,copied:k,selected:C,selectedCount:S,totalEntries:E,deleteTarget:v,deleting:b,showBulkDelete:x,fetchMemory:M,toggleScope:L,startEdit:J,doEdit:$,copyValue:V,doAdd:I,confirmDelete:D,doDelete:G,confirmBulkDelete:de,doBulkDelete:ve,isSelected:w,toggleSelect:A,isScopeAllSelected:O,toggleSelectAll:j,filteredEntries:N}}},hw={template:`
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
        <span class="empty-state-icon">🧠</span>
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
              <button @click="startEdit(entry)" class="btn btn-ghost text-xs" title="Edit">✏️</button>
              <button @click="deleteEntry(entry.key)" class="btn btn-ghost text-xs text-red-400" title="Delete">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=te(()=>[...new Set(e.value.map(k=>k.category))].sort()),o=te(()=>{const g={};return e.value.forEach(k=>{g[k.category]=(g[k.category]||0)+1}),g}),c=te(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function u(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function d(g){i.value=g.key,l.value=g.content}async function f(g){try{await K.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,xe.success("Entry updated"),await m()}catch(k){xe.error(k.message||"Failed to save entry")}}async function p(g){if(await ns({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(g)),xe.success("Entry deleted"),await m()}catch(C){xe.error(C.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const g=await K.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return $e(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:Ta,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:m}}},gw={components:{TabbedPage:ir},setup(){return{tabs:[{id:"tools",label:"Tools",component:rw},{id:"skills",label:"Skills",component:uw},{id:"knowledge",label:"Knowledge",component:fw},{id:"memory",label:"Memory",component:pw},{id:"learned",label:"Learned",component:hw}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},mw={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),m=te(()=>e.value==="custom"),g=te(()=>[...i.value,...l.value]),k=te(()=>l.value.includes(e.value)),C=te(()=>{var w;return m.value?t.value||"Odin":((w=a.value[e.value])==null?void 0:w.name)||e.value}),v=te(()=>{var w;return m.value?s.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.identity)||""}),b=te(()=>{var w;return m.value?n.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.voice)||""});async function x(){u.value=!0;try{const w=await K.get("/api/personality");e.value=w.preset||"odin",t.value=w.custom_name||"",s.value=w.custom_identity||"",n.value=w.custom_voice||"",a.value=w.presets||{},i.value=w.builtin_presets||[],l.value=w.user_presets||[]}catch(w){c.value=w.message}finally{u.value=!1}}async function E(){r.value=!0,c.value=null,o.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(w){c.value=w.message}finally{r.value=!1}}async function S(){const w=d.value.trim();if(w){p.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:w,display_name:C.value,identity:v.value,voice:b.value}),f.value=!1,d.value="",await x(),e.value=w.toLowerCase().replace(/ /g,"_")}catch(A){c.value=A.message}finally{p.value=!1}}}async function N(){if(await ns({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(A){c.value=A.message}}}return $e(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:m,isUserPreset:k,previewName:C,previewIdentity:v,previewVoice:b,saving:r,saved:o,error:c,loading:u,save:E,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:S,deletePreset:N,builtinPresets:i,userPresets:l}},template:`
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
  `},vw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},bw={ok:"✔",degraded:"⚠",down:"✖",unconfigured:"—"},yw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},xw={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <!-- Overall status banner -->
        <div class="hm-card mb-4" style="padding:1.25rem 1.5rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span style="font-size:1.5rem;" :class="overallColor" aria-hidden="true">{{ overallIcon }}</span>
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
                {{ refreshing ? '...' : '↻ Refresh' }}
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
              <span class="health-card-icon" :class="statusColor(c.status)">{{ statusIcon(c.status) }}</span>
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

            <!-- Voice metadata -->
            <div v-if="c.name === 'voice' && c.metadata" class="health-card-meta">
              <div v-if="c.metadata.channel" class="health-meta-row">
                <span class="text-xs text-gray-500">Channel:</span>
                <span class="text-xs">#{{ c.metadata.channel }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">WebSocket:</span>
                <span class="text-xs" :class="c.metadata.ws_connected ? 'text-green-400' : 'text-gray-500'">
                  {{ c.metadata.ws_connected ? 'connected' : 'disconnected' }}
                </span>
              </div>
            </div>

            <!-- Monitoring metadata -->
            <div v-if="c.name === 'monitoring' && c.metadata && c.metadata.enabled" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Checks:</span>
                <span class="text-xs">{{ c.metadata.checks || 0 }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Running:</span>
                <span class="text-xs">{{ c.metadata.running || 0 }}</span>
              </div>
              <div v-if="c.metadata.active_alerts > 0" class="health-meta-row">
                <span class="text-xs text-red-400">{{ c.metadata.active_alerts }} active alert(s)</span>
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=te(()=>e.value.components||[]),i=te(()=>yw[e.value.overall]||"text-gray-400"),l=te(()=>e.value.overall==="healthy"?"✔":e.value.overall==="degraded"?"⚠":e.value.overall==="unhealthy"?"✖":"—"),r=te(()=>{const v=e.value.overall;return v==="healthy"?"All Systems Healthy":v==="degraded"?"Some Systems Degraded":v==="unhealthy"?"System Issues Detected":"Unknown"});function o(v){return vw[v]||"text-gray-400"}function c(v){return bw[v]||"?"}function u(v){return v==="ok"?"badge-success":v==="degraded"?"badge-warning":v==="down"?"badge-danger":"badge-info"}function d(v){return v==="closed"?"text-green-400":v==="half_open"?"text-yellow-400":v==="open"?"text-red-400":"text-gray-400"}function f(v){return v.replace(/_/g," ").replace(/\b\w/g,b=>b.toUpperCase())}function p(v){if(!v)return"—";try{return new Date(v).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return v}}function m(v){return v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":String(v)}async function g(){n.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null}catch(v){s.value=v.message}finally{t.value=!1,n.value=!1}}function k(){t.value=!0,s.value=null,g()}let C=null;return $e(async()=>{await g(),C=setInterval(g,3e4)}),ft(()=>{C&&clearInterval(C)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:m,fetchHealth:g,retry:k}}},_w={template:`
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
        <span class="error-icon" aria-hidden="true">⚠</span>
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=te(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=te(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await K.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return $e(()=>{c(),i=setInterval(c,3e4)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:Kh,refresh:u,retry:d}}},kw=["INFO","WARNING","ERROR"],ww=[{id:"all",name:"All Logs",icon:"☰",filters:{}},{id:"errors",name:"Errors Only",icon:"❌",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"⚠",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"🔧",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"🔥",filters:{level:"ERROR",timeRange:"last_1h"}}],Mr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Sw=[50,100,200,500],Tw={template:`
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
              <span class="sess-preset-icon">{{ preset.icon }}</span>
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
            <span>★</span>
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
              <span class="empty-state-icon">{{ logs.length === 0 ? '📄' : '🔍' }}</span>
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
            &#x2193; Jump to bottom
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
              <span class="empty-state-icon">⏳</span>
              <span class="empty-state-text">Searching...</span>
            </div>

            <!-- No results -->
            <div v-else-if="searchResults.length === 0 && searchRan" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon">🔍</span>
              <span class="empty-state-text">No entries match the search criteria</span>
            </div>

            <!-- Prompt to search -->
            <div v-else-if="searchResults.length === 0 && !searchRan" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon">📊</span>
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(qe.state||"disconnected"),c=te(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,m=kw,g=ww,k=Mr,C=h("all"),v=h(""),b=h([]),x=h(!1),E=h(""),S=h([]);function N(){try{const H=localStorage.getItem("odin-log-presets");H&&(b.value=JSON.parse(H))}catch{}}function w(){try{localStorage.setItem("odin-log-presets",JSON.stringify(b.value))}catch{}}const A=te(()=>a.value!==""||i.value.trim()!==""||v.value!==""),O=te(()=>{const H=Mr.find(ne=>ne.value===v.value);return H?H.label:""}),j=te(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(H){return H.message}}),M=24,L=te(()=>{if(t.value.length===0)return[];const H=[],ne=new Date,_e=3600*1e3;for(let Qe=M-1;Qe>=0;Qe--){const nt=new Date(ne.getTime()-(Qe+1)*_e),Nt=new Date(ne.getTime()-Qe*_e);H.push({start:nt,end:Nt,label:I(nt,Nt),shortLabel:Nt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Qe of t.value){if(!Qe._time)continue;const nt=Qe._time.getTime();for(const Nt of H)if(nt>=Nt.start.getTime()&&nt<Nt.end.getTime()){Nt.total++,Qe.level==="ERROR"?Nt.errors++:Qe.level==="WARNING"?Nt.warnings++:Nt.info++;break}}return H}),J=te(()=>{let H=1;for(const ne of L.value)ne.total>H&&(H=ne.total);return H}),$=te(()=>L.value.length===0?"":"Last 24 hours"),V=te(()=>Math.ceil(M/8));function I(H,ne){const _e={hour:"2-digit",minute:"2-digit"};return H.toLocaleTimeString([],_e)+" - "+ne.toLocaleTimeString([],_e)}function D(H,ne){return!ne||!H?"0px":Math.max(2,H/ne*100)+"%"}function G(H){const ne=de.value.findIndex(_e=>_e._time&&_e._time.getTime()>=H.start.getTime()&&_e._time.getTime()<H.end.getTime());if(ne>=0&&u.value){const _e=u.value.querySelectorAll(".log-line");_e[ne]&&(_e[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const de=te(()=>{let H=t.value;if(a.value&&(H=H.filter(ne=>(ne.level||"INFO")===a.value)),v.value){const ne=Mr.find(_e=>_e.value===v.value);if(ne&&ne.seconds){const _e=new Date(Date.now()-ne.seconds*1e3);H=H.filter(Qe=>Qe._time&&Qe._time>=_e)}}if(i.value&&!j.value)if(l.value)try{const ne=new RegExp(i.value,"i");H=H.filter(_e=>{const Qe=_e.text||_e.raw||"",nt=_e.tool||"";return ne.test(Qe)||ne.test(nt)})}catch{}else{const ne=i.value.toLowerCase();H=H.filter(_e=>{const Qe=(_e.text||_e.raw||"").toLowerCase(),nt=(_e.tool||"").toLowerCase();return Qe.includes(ne)||nt.includes(ne)})}return H});function ve(H){if(H.type==="log"&&H.line)try{const ne=typeof H.line=="string"?JSON.parse(H.line):H.line,_e=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:_e.toLocaleTimeString(),_time:_e,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(H.line),tool:"",raw:String(H.line)}}if(H.payload){const ne=H.payload,_e=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:_e.toLocaleTimeString(),_time:_e,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof H=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:H,tool:"",raw:H}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(H),tool:"",raw:null}}function ie(H){const ne=ve(H);if(s.value){S.value.push(ne);return}pe(ne)}function pe(H){t.value.push(H),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Et(()=>X())}function X(){const H=u.value;if(H){const ne=H.scrollHeight-H.scrollTop-H.clientHeight;H.scrollTo({top:H.scrollHeight,behavior:ne<500?"smooth":"instant"})}}function ue(){n.value=!0,d.value=!1,Et(()=>X())}function Ie(){const H=u.value;if(!H)return;const ne=H.scrollHeight-H.scrollTop-H.clientHeight<40;d.value=!ne&&t.value.length>0,!ne&&n.value&&(n.value=!1)}function q(){if(s.value=!s.value,!s.value&&S.value.length>0){for(const H of S.value)pe(H);S.value=[]}}function re(){t.value=[],S.value=[],d.value=!1}function le(){let H;e.value==="search"?H=ce.value.map(nt=>{const Nt=nt.error?"ERROR":"INFO",lr=nt.tool_name?`[${nt.tool_name}] `:"";return`${nt.timestamp||""} ${Nt} ${lr}${nt.result_summary||nt.message||""}`}).join(`
`):H=de.value.map(nt=>`${nt.ts} ${nt.level} ${nt.text}`).join(`
`);const ne=new Blob([H],{type:"text/plain"}),_e=URL.createObjectURL(ne),Qe=document.createElement("a");Qe.href=_e,Qe.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Qe.click(),URL.revokeObjectURL(_e)}function ge(H,ne){const _e=`${H.ts} ${H.level} ${H.text||H.raw||""}`;navigator.clipboard.writeText(_e).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function me(H){a.value=a.value===H?"":H,C.value="all"}function Le(H){return H.level==="ERROR"?"log-line-error":H.level==="WARNING"?"log-line-warning":"text-gray-300"}function y(H){return H==="ERROR"?"text-red-500 font-semibold":H==="WARNING"?"text-yellow-500":"text-blue-500"}function T(H){return H==="ERROR"?"log-chip-error":H==="WARNING"?"log-chip-warning":"log-chip-info"}function P(H){C.value=H.id;const ne=H.filters;a.value=ne.level||"",v.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function W(H){C.value=H.id,a.value=H.filters.level||"",v.value=H.filters.timeRange||"",i.value=H.filters.text||""}function R(){if(!E.value.trim())return;const H={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:a.value,timeRange:v.value,text:i.value}};b.value=[...b.value,H],w(),x.value=!1,E.value=""}function F(H){b.value=b.value.filter(ne=>ne.id!==H),w(),C.value===H&&(C.value="all")}const Y=h("all"),Z=h(""),se=h(""),Q=h(""),B=h(""),ee=h(""),oe=h(100),be=Sw,Te=h(!1),Ae=h(!1),U=h(""),ce=h([]),ye=h(null),Me=h(null);function Je(){e.value="search",ye.value||Ke()}async function Ke(){try{ye.value=await K.get("/api/logs/stats")}catch{}}function St(){const H=ee.value;if(!H){Q.value="",B.value="";return}const _e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[H];if(_e){const Qe=new Date(Date.now()-_e*1e3);Q.value=st(Qe),B.value=""}}function st(H){const ne=_e=>String(_e).padStart(2,"0");return`${H.getFullYear()}-${ne(H.getMonth()+1)}-${ne(H.getDate())}T${ne(H.getHours())}:${ne(H.getMinutes())}`}function Ye(H){if(!H)return"";const ne=new Date(H);return isNaN(ne.getTime())?"":ne.toISOString()}async function en(){Te.value=!0,U.value="",Ae.value=!0,Me.value=null;try{const H=new URLSearchParams;Y.value&&Y.value!=="all"&&H.set("level",Y.value),Z.value&&H.set("tool",Z.value),se.value&&H.set("q",se.value);const ne=Ye(Q.value),_e=Ye(B.value);ne&&H.set("start",ne),_e&&H.set("end",_e),H.set("limit",String(oe.value));const Qe=await K.get(`/api/logs/search?${H.toString()}`);ce.value=Qe.entries||[]}catch(H){U.value=H.message||"Search failed",ce.value=[]}finally{Te.value=!1}}function mn(){Y.value="all",Z.value="",se.value="",Q.value="",B.value="",ee.value="",oe.value=100,ce.value=[],Ae.value=!1,U.value="",Me.value=null}function Ai(H){Me.value=Me.value===H?null:H}function Ea(H){if(!H.timestamp)return"";try{return new Date(H.timestamp).toLocaleString()}catch{return H.timestamp}}function Ri(H){return H.type==="web_action"?`${H.status||""} (${H.execution_time_ms||0}ms)`:(H.result_summary||"").slice(0,200)}function Hn(H){return H.error?"log-line-error":"text-gray-300"}function jn(H){try{return JSON.stringify(H,null,2)}catch{return String(H)}}let Gt=null;return $e(()=>{N(),qe.subscribe("logs",ie),r.value=qe.connected,o.value=qe.state||"disconnected",Gt=qe.onStateChange;const H=qe.onStateChange;qe.onStateChange=(ne,_e)=>{o.value=ne,r.value=ne==="connected",H&&H(ne,_e)}}),ft(()=>{qe.unsubscribe("logs",ie),Gt!==void 0&&(qe.onStateChange=Gt)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:de,pauseBuffer:S,showJumpBottom:d,copiedIndex:f,regexError:j,levels:m,logPresets:g,timeRanges:k,timeRange:v,activeLogPreset:C,customLogPresets:b,showSaveLogPreset:x,newLogPresetName:E,hasActiveLogFilters:A,timeRangeLabel:O,timelineBuckets:L,timelineMax:J,timelineSpanLabel:$,timelineLabelSkip:V,togglePause:q,clearLogs:re,exportLogs:le,logLineClass:Le,levelClass:y,levelChipClass:T,toggleLevel:me,copyLine:ge,jumpToBottom:ue,onScroll:Ie,applyLogPreset:P,applyCustomLogPreset:W,saveLogCustomPreset:R,removeLogCustomPreset:F,segmentHeight:D,jumpToTimelineBucket:G,searchLevel:Y,searchTool:Z,searchKeyword:se,searchStart:Q,searchEnd:B,searchTimePreset:ee,searchLimit:oe,searchLimits:be,searching:Te,searchRan:Ae,searchError:U,searchResults:ce,searchStats:ye,expandedSearch:Me,switchToSearch:Je,runSearch:en,clearSearchFilters:mn,toggleSearchExpand:Ai,formatSearchTs:Ea,searchEntryText:Ri,searchLogLineClass:Hn,formatJson:jn,applySearchTimePreset:St}}},Cw=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Ew={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Aw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1“128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"monitoring.cooldown_minutes":{type:"number",min:0,message:"Must be non-negative"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},Fr=[{key:"core",label:"Core",icon:"⚙",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"🧠",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"💾",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"🔗",sections:["webhook","monitoring","observability","email","voice","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"🛠",sections:["tools"]},{key:"ui",label:"Web UI",icon:"🌐",sections:["web"]},{key:"automation",label:"Automation",icon:"🔄",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"🔌",sections:["issue_tracker"]}],og="••••••••",Rw=50;function Iw(e){return Cw.has(e)}function Nw(e){return e===og}function Gi(e){return JSON.parse(JSON.stringify(e))}function Nn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Dw(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Nn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Nn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function Ow(e,t,s){const n=Aw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Md(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Nn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Nn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Lw={template:`
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
              ↩ Undo
            </button>
            <button @click="redo" class="btn btn-ghost text-xs cfg-redo-btn" :disabled="!canRedo" title="Redo (Ctrl+Y)">
              Redo ↪
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
        <span class="error-icon" aria-hidden="true">⚠</span>
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
            <span class="cfg-group-icon" aria-hidden="true">{{ group.icon }}</span>
            <span class="cfg-group-label">{{ group.label }}</span>
            <span class="badge badge-info text-xs">{{ group.sections.length }}</span>
            <span v-if="editing && groupChanged(group)" class="badge badge-warning text-xs">modified</span>
            <span class="cfg-group-arrow" aria-hidden="true">{{ expandedGroups[group.key] ? '▼' : '▶' }}</span>
          </div>

          <!-- Group content -->
          <div v-if="expandedGroups[group.key]" class="cfg-group-body">
            <div v-for="section in group.sections" :key="section" class="cfg-section">
              <!-- Section header -->
              <div class="cfg-section-header cursor-pointer select-none" @click="toggleSection(section)">
                <span class="text-xs text-gray-500 font-mono">{{ expanded[section] ? '▼' : '▶' }}</span>
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
            <span class="text-xs text-gray-500 font-mono">{{ expanded[section] ? '▼' : '▶' }}</span>
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
      <div v-if="showDiffModal" class="modal-overlay" @click.self="showDiffModal = false" role="dialog" aria-modal="true" aria-labelledby="cfg-diff-title">
        <div class="modal-content" style="max-width:700px">
          <div class="flex items-center justify-between mb-4">
            <h2 id="cfg-diff-title" class="text-lg font-semibold">Review Changes</h2>
            <button @click="showDiffModal = false" class="btn btn-ghost text-xs">✕</button>
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=te(()=>d.value.length>0),m=te(()=>f.value.length>0),g=te(()=>r.value&&t.value?t.value:e.value),k=te(()=>!e.value||!t.value?!1:!Nn(e.value,t.value)),C=te(()=>!e.value||!t.value?0:Md(e.value,t.value).length),v=te(()=>{if(!r.value||!t.value)return{};const R={};for(const F of Object.keys(t.value)){const Y=t.value[F];if(typeof Y=="object"&&Y!==null&&!Array.isArray(Y))for(const Z of Object.keys(Y)){const se=Ow(F,Z,Y[Z]);se&&(R[F+"."+Z]=se)}}return R}),b=te(()=>Object.keys(v.value).length>0),x=te(()=>e.value?Object.keys(e.value).length:0),E=te(()=>N.value.length),S=te(()=>!e.value||!t.value?[]:Md(e.value,t.value)),N=te(()=>e.value?Fr.map(R=>({...R,sections:R.sections.filter(F=>F in e.value)})).filter(R=>R.sections.length>0):[]),w=te(()=>{if(!e.value)return[];const R=new Set(Fr.flatMap(F=>F.sections));return Object.keys(e.value).filter(F=>!R.has(F))});function A(R){return g.value?g.value[R]:null}function O(R){return!e.value||!t.value?!1:!Nn(e.value[R],t.value[R])}function j(R){return R.sections.some(F=>O(F))}function M(R,F){if(!e.value||!t.value)return!1;const Y=e.value[R],Z=t.value[R];return!Y||!Z?!1:!Nn(Y[F],Z[F])}function L(R){return t.value?t.value[R]:e.value[R]}function J(R,F){const Y=t.value||e.value;return Y[R]?Y[R][F]:void 0}function $(R,F){const Y=r.value&&t.value?t.value:e.value;return Y[R]?Y[R][F]:!1}function V(R,F){return v.value[R+"."+F]||null}function I(R,F){return Ew[R+"."+F]||null}function D(R,F,Y){t.value&&(F===null?t.value[R]=Y:(t.value[R]||(t.value[R]={}),t.value[R][F]=Y),t.value={...t.value})}function G(R,F,Y){if(!t.value)return;const Z=Gi(t.value);D(R,F,Y),d.value.push(Z),d.value.length>Rw&&d.value.shift(),f.value=[]}function de(R,F,Y){try{const Z=JSON.parse(Y);G(R,F,Z)}catch{}}function ve(){d.value.length!==0&&(f.value.push(Gi(t.value)),t.value=d.value.pop())}function ie(){f.value.length!==0&&(d.value.push(Gi(t.value)),t.value=f.value.pop())}function pe(R,F,Y){if(!t.value||!t.value[R])return;const Z=[...t.value[R][F]];Z.splice(Y,1),G(R,F,Z)}function X(R,F){if(!t.value||!t.value[R])return;const Y=[...t.value[R][F]||[]],Z=prompt("Enter new value:");Z!==null&&(Y.push(Z),G(R,F,Y))}function ue(R){a.value={...a.value,[R]:!a.value[R]}}function Ie(R){l.value={...l.value,[R]:!l.value[R]}}function q(R){i.value={...i.value,[R]:!i.value[R]}}function re(R){try{return JSON.stringify(R,null,2)}catch{return String(R)}}function le(R){return R==null?"null":typeof R=="object"?JSON.stringify(R,null,2):String(R)}function ge(R,F){c.value={type:R,message:F},setTimeout(()=>{c.value=null},3e3)}function me(){t.value=Gi(e.value),r.value=!0,d.value=[],f.value=[]}function Le(){r.value=!1,t.value=null,d.value=[],f.value=[]}function y(){u.value=!0}async function T(){if(!(!k.value||b.value)){o.value=!0;try{const R=Dw(e.value,t.value);if(Object.keys(R).length===0){ge("success","No changes to save."),o.value=!1;return}const F=await K.put("/api/config",R);e.value=F,r.value=!1,t.value=null,d.value=[],f.value=[],ge("success","Config saved successfully.")}catch(R){ge("error",R.message||"Failed to save config")}o.value=!1}}async function P(){s.value=!0,n.value=null;try{e.value=await K.get("/api/config");for(const R of Object.keys(e.value))a.value[R]===void 0&&(a.value[R]=!0);for(const R of Fr)l.value[R.key]===void 0&&(l.value[R.key]=!0)}catch(R){n.value=R.message}s.value=!1}function W(R){r.value&&((R.ctrlKey||R.metaKey)&&!R.shiftKey&&R.key==="z"?(R.preventDefault(),ve()):(R.ctrlKey||R.metaKey)&&(R.key==="y"||R.shiftKey&&R.key==="z"||R.shiftKey&&R.key==="Z")&&(R.preventDefault(),ie()))}return $e(()=>{P(),document.addEventListener("keydown",W)}),ft(()=>{document.removeEventListener("keydown",W)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:k,hasErrors:b,changeCount:C,REDACTED:og,showDiffModal:u,diffEntries:S,canUndo:p,canRedo:m,sectionCount:x,groupCount:E,visibleGroups:N,ungroupedSections:w,validationErrors:v,isSensitiveKey:Iw,isRedacted:Nw,sectionChanged:O,groupChanged:j,fieldChanged:M,getDisplay:A,getEdited:L,getEditedField:J,getDisplayBool:$,pushEdit:G,pushEditJson:de,getValidationError:V,getEnumOptions:I,removeArrayItem:pe,addArrayItem:X,toggleSection:ue,toggleGroup:Ie,toggleNested:q,formatJson:re,formatDiffVal:le,showToast:ge,showDiff:y,fetchConfig:P,startEdit:me,cancelEdit:Le,saveConfig:T,undo:ve,redo:ie}}},Pw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await K.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,m,g){try{await K.put("/api/discord/guild/"+p+"/config",{[m]:g}),await c()}catch(k){s.value=k.message}}async function d(p,m,g,k){try{await K.put("/api/discord/channel/"+p+"/config",{[g]:k}),await c()}catch(C){s.value=C.message}}async function f(p,m){try{await K.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return $e(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},Mw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=te(()=>{const I={};for(const D of u.value)I[D.id]=D;return I});function p(I){return f.value[I]||null}const m=te(()=>/^\d{15,25}$/.test(r.value.trim())),g=te(()=>{const I=r.value.toLowerCase().trim();return I?u.value.filter(D=>!i.value[D.id]&&(D.display_name.toLowerCase().includes(I)||D.username.toLowerCase().includes(I)||D.id.includes(I))):u.value.filter(D=>!i.value[D.id])});function k(I,D){return I?I.allowed_hosts===null||I.allowed_hosts===void 0?{allowed_hosts:[...D],default_host:I.default_host||"",allow_all:!0}:{allowed_hosts:I.allowed_hosts,default_host:I.default_host||"",allow_all:!1}:{allowed_hosts:[...D],default_host:D[0]||"",allow_all:!0}}async function C(){e.value=!0,t.value="";try{const I=await K.get("/api/host-access");s.value=I,n.value=I.available_hosts||[],a.value=k(I.default_policy,n.value);const D=I.users||{},G={};for(const[de,ve]of Object.entries(D))G[de]=k(ve,n.value);i.value=G}catch(I){t.value=I.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await K.get("/api/discord/members")||[]}catch{u.value=[]}}async function v(){try{const I=a.value.allow_all?null:a.value.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:I,default_host:a.value.default_host}),xe.success("Default policy updated")}catch(I){xe.error(I.message||"Failed to save")}}function b(I,D){a.value.allow_all=!1,D?a.value.allowed_hosts.includes(I)||a.value.allowed_hosts.push(I):(a.value.allowed_hosts=a.value.allowed_hosts.filter(G=>G!==I),a.value.default_host===I&&(a.value.default_host=a.value.allowed_hosts[0]||"")),v()}async function x(I){const D=i.value[I];if(D)try{const G=D.allow_all?null:D.allowed_hosts;await K.put(`/api/host-access/user/${I}`,{allowed_hosts:G,default_host:D.default_host});const de=p(I);xe.success(`Updated access for ${de?de.display_name:I}`)}catch(G){xe.error(G.message||"Failed to save")}}function E(I,D,G){const de=i.value[I];de&&(de.allow_all=!1,G?de.allowed_hosts.includes(D)||de.allowed_hosts.push(D):(de.allowed_hosts=de.allowed_hosts.filter(ve=>ve!==D),de.default_host===D&&(de.default_host=de.allowed_hosts[0]||"")),x(I))}function S(I,D){const G=i.value[I];G&&(G.default_host=D,x(I))}function N(){l.value=!0,r.value="",c.value=0,Et(()=>{d.value&&d.value.focus()})}function w(){o.value=!0,c.value=0}function A(){c.value<g.value.length-1&&c.value++}function O(){c.value>0&&c.value--}function j(){const I=g.value[c.value];if(I){L(I);return}m.value&&M()}function M(){const I=r.value.trim();/^\d{15,25}$/.test(I)&&(i.value[I]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},x(I),r.value="",o.value=!1,l.value=!1)}function L(I){i.value[I.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},x(I.id),r.value="",o.value=!1,l.value=!1}function J(){o.value=!1}function $(){setTimeout(()=>{o.value=!1},150)}async function V(I){const D=p(I);if(await ns({title:"Remove user override",message:`Remove the host access override for ${D?D.display_name:I}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await K.del(`/api/host-access/user/${I}`),delete i.value[I],xe.success(`Removed override for ${D?D.display_name:I}`)}catch(de){xe.error(de.message||"Failed to delete")}}return $e(C),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:g,isRawId:m,searchInput:d,fetchData:C,saveDefaultPolicy:v,toggleDefaultHost:b,getMember:p,toggleUserHost:E,setUserDefault:S,openAddUser:N,deleteUser:V,onSearchInput:w,highlightNext:A,highlightPrev:O,selectHighlighted:j,selectMember:L,closeDropdown:J,onBlur:$,addRawId:M}}},Fw={template:`
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
        <div v-if="editing" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="editing = null">
          <div class="hm-card w-full max-w-lg mx-4">
            <h3 class="text-sm font-semibold text-gray-300 mb-4">Edit Token: {{ editing.user_id }}</h3>
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=te(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=te(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(w){return w==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":w==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const w=await K.get("/api/tokens");s.value=w.tokens||[],n.value=w.available_hosts||[]}catch(w){t.value=w.message||"Failed to load tokens"}finally{e.value=!1}}function g(w){return!w||!w.trim()?[]:w.split(",").map(A=>A.trim()).filter(Boolean)}function k(w,A){const O=c.value.allowed_hosts;if(A&&!O.includes(w)&&O.push(w),!A){const j=O.indexOf(w);j>=0&&O.splice(j,1)}}function C(w,A){const O=u.value.allowed_hosts;if(A&&!O.includes(w)&&O.push(w),!A){const j=O.indexOf(w);j>=0&&O.splice(j,1)}}async function v(){var w;i.value=!0;try{const A=g(c.value.allowed_tools_str),O=c.value.host_mode,j=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,M={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:A.length?A:[]};j!==null&&(M.allowed_hosts=j),M.default_host=c.value.default_host||"";const L=await K.post("/api/tokens",M);l.value=L.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,xe.success("Token created"),await m()}catch(A){xe.error(((w=A.data)==null?void 0:w.error)||A.message||"Failed to create token")}finally{i.value=!1}}function b(w){r.value=w;const A=w.allowed_hosts;let O="default";A==null?O="default":Array.isArray(A)&&A.length===0?O="none":Array.isArray(A)&&(O="select"),u.value={username:w.username||"",tier:w.tier||"admin",label:w.label||"",host_mode:O,allowed_hosts:Array.isArray(A)?[...A]:[],default_host:w.default_host||"",allowed_tools_str:(w.allowed_tools||[]).join(", ")}}async function x(){var w;if(r.value){o.value=!0;try{const A=g(u.value.allowed_tools_str),O=u.value.host_mode,j={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:A};O==="none"?j.allowed_hosts=[]:O==="select"?j.allowed_hosts=u.value.allowed_hosts:j.allowed_hosts=null,j.default_host=u.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(r.value.user_id),j),r.value=null,xe.success("Token updated"),await m()}catch(A){xe.error(((w=A.data)==null?void 0:w.error)||A.message||"Failed to update")}finally{o.value=!1}}}async function E(w){var O;if(await ns({title:"Regenerate token",message:`Regenerate token for ${w.username||w.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const j=await K.post("/api/tokens/"+encodeURIComponent(w.user_id)+"/regenerate");l.value=j.token,xe.success("Token regenerated")}catch(j){xe.error(((O=j.data)==null?void 0:O.error)||j.message||"Failed to regenerate")}}async function S(w){var O;if(await ns({title:"Delete token",message:`Delete token for ${w.username||w.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(w.user_id)),xe.success("Token deleted"),await m()}catch(j){xe.error(((O=j.data)==null?void 0:O.error)||j.message||"Failed to delete")}}async function N(){if(l.value)try{await navigator.clipboard.writeText(l.value),xe.success("Copied to clipboard")}catch{xe.error("Copy failed — select and copy manually")}}return $e(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:m,tierBadge:p,toggleCreateHost:k,toggleEditHost:C,createToken:v,startEdit:b,saveEdit:x,confirmRegenerate:E,confirmDelete:S,copyToken:N}}},$w={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">LLM Configuration</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Configure which LLM backend Odin uses. Switch between OpenAI Codex (ChatGPT subscription),
        Kimi (Moonshot AI), and Ollama (local/remote open-source models) at any time.
      </p>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Active Provider ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Active Provider</h2>
          <div v-if="llmStatus" class="space-y-3">
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="codex" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.codex.configured"
                       class="accent-indigo-500" />
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
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="ollama" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.ollama.configured"
                       class="accent-indigo-500" />
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
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="kimi" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.kimi.configured"
                       class="accent-indigo-500" />
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
                <span class="text-green-400">● Connected</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="codexForm.enabled" @change="saveCodexConfig" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="codexForm.model" @change="saveCodexConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option value="gpt-5.5">gpt-5.5</option>
                <option value="gpt-5">gpt-5</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="codexForm.max_tokens" type="number" @keydown.enter="saveCodexConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
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
                        <span class="text-gray-600 text-xs ml-1">&#9998;</span>
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
                  <div class="text-xs text-gray-500">Waiting... <span class="inline-block animate-pulse">●</span></div>
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
                <span v-if="kimiStatus.health && kimiStatus.health.healthy" class="text-green-400">● Connected</span>
                <span v-else class="text-red-400">● Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="kimiForm.enabled" @change="saveKimiConfig" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="kimiForm.model" @change="saveKimiConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option v-if="!kimiModels.length" value="" disabled>No models available</option>
                <option v-for="m in kimiModels" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="kimiForm.max_tokens" type="number" @keydown.enter="saveKimiConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key</label>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.kimi.has_api_key && !kimiForm.api_key" class="text-xs text-green-400">● Configured</span>
                <input v-model="kimiForm.api_key" type="password" @keydown.enter="saveKimiConfig" @input="kimiKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.kimi.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
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
                <span v-if="ollamaStatus.health && ollamaStatus.health.healthy" class="text-green-400">● Connected</span>
                <span v-else class="text-red-400">● Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="ollamaForm.enabled" @change="saveOllamaConfig" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="ollamaForm.model" @change="saveOllamaConfig"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option v-if="!ollamaModels.length" value="" disabled>No models available</option>
                <option v-for="m in ollamaModels" :key="m.name" :value="m.name">{{ m.name }} ({{ formatSize(m.size) }})</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="ollamaForm.max_tokens" type="number" @keydown.enter="saveOllamaConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key <span class="text-gray-600">(optional, for remote)</span></label>
              <input v-model="ollamaForm.api_key" type="password" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfig" @input="ollamaKeyDirty = true"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Base URL</label>
              <input v-model="ollamaForm.base_url" placeholder="http://127.0.0.1:11434" @keydown.enter="saveOllamaConfig"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
          </div>
          <div v-if="ollamaStatus.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096}),a=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),i=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),l=h(!1),r=h(!1),o=h(!1),c=h(!1),u=h(!1),d=h(!1),f=h(!1),p=h({configured:!1}),m=h([]),g=h(""),k=h(!1),C=h(!1),v=h({configured:!1}),b=h([]),x=h(""),E=h(!1),S=h(!1),N=h(!0),w=h(""),A=h({configured:!1,accounts:[]}),O=h(null),j=h(null),M=h(""),L=h(null),J=h(!1),$=h(null),V=h(null),I=h("");let D=null;function G(B,ee="success"){xe(B,ee==="error"?"error":"success")}function de(B){if(!B)return"?";const ee=B/(1024*1024*1024);return ee>=1?ee.toFixed(1)+" GB":(B/(1024*1024)).toFixed(0)+" MB"}async function ve(){e.value=!0,await Promise.all([ie(),pe(),le(),X()]),e.value=!1}async function ie(){try{const B=await K.get("/api/llm/status");t.value=B,s.value=B.active_provider||"codex",B.codex&&(n.value.enabled=B.codex.enabled,n.value.model=B.codex.model||"gpt-5.5",n.value.max_tokens=B.codex.max_tokens||4096),B.ollama&&(a.value.enabled=B.ollama.enabled,a.value.base_url=B.ollama.base_url||"",a.value.model=B.ollama.model||"",a.value.max_tokens=B.ollama.max_tokens||4096),B.kimi&&(i.value.enabled=B.kimi.enabled,i.value.model=B.kimi.model||"",i.value.max_tokens=B.kimi.max_tokens||4096)}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function pe(){try{if(p.value=await K.get("/api/ollama/status"),p.value.model&&(g.value=p.value.model),p.value.configured)try{const B=await K.get("/api/ollama/models");m.value=B.models||[]}catch{m.value=[]}else if(a.value.base_url)try{const B=await K.post("/api/ollama/probe-models",{base_url:a.value.base_url});m.value=B.models||[]}catch{m.value=[]}}catch{p.value={configured:!1}}}async function X(){N.value=!0,w.value="";try{A.value=await K.get("/api/codex/status")}catch(B){w.value=B.message||"Failed to fetch Codex status"}finally{N.value=!1}}async function ue(){const B=t.value?t.value.active_provider:"codex";f.value=!0;try{const ee=await K.post("/api/llm/switch",{provider:s.value});ee.error?(s.value=B,G(ee.error,"error")):(G("Switched to "+s.value+" ("+ee.model+")"),await ve())}catch(ee){s.value=B,G(ee.message||"Switch failed","error")}finally{f.value=!1}}async function Ie(){k.value=!0;try{const B=await K.post("/api/ollama/reload");G(B.configured?"Ollama reloaded":B.reason||"Ollama not configured",B.configured?"success":"error"),await ve()}catch(B){G(B.message||"Reload failed","error")}finally{k.value=!1}}async function q(){C.value=!0;try{await K.post("/api/ollama/model",{model:g.value}),G("Model set to "+g.value),await ve()}catch(B){G(B.message||"Failed","error")}finally{C.value=!1}}async function re(){const B=a.value.base_url;if(!B){G("Enter a base URL first","error");return}d.value=!0;try{const ee=await K.post("/api/ollama/probe-models",{base_url:B});m.value=ee.models||[],m.value.length?(G(m.value.length+" model(s) found"),!a.value.model&&m.value.length&&(a.value.model=m.value[0].name)):G("No models found at "+B,"error")}catch(ee){G(ee.message||"Could not reach Ollama","error")}finally{d.value=!1}}async function le(){try{if(v.value=await K.get("/api/kimi/status"),v.value.model&&(x.value=v.value.model),v.value.configured)try{const B=await K.get("/api/kimi/models");b.value=B.models||[]}catch{b.value=[]}}catch{v.value={configured:!1}}}async function ge(){E.value=!0;try{const B=await K.post("/api/kimi/reload");G(B.configured?"Kimi reloaded":B.reason||"Kimi not configured",B.configured?"success":"error"),await ve()}catch(B){G(B.message||"Reload failed","error")}finally{E.value=!1}}async function me(){S.value=!0;try{await K.post("/api/kimi/model",{model:x.value}),G("Model set to "+x.value),await ve()}catch(B){G(B.message||"Failed","error")}finally{S.value=!1}}async function Le(){o.value=!0;try{await K.put("/api/llm/codex/config",n.value),G("Codex config saved"),await ve()}catch(B){G(B.message||"Failed","error")}finally{o.value=!1}}async function y(){c.value=!0;try{const B={...a.value};l.value||delete B.api_key,await K.put("/api/llm/ollama/config",B),G("Ollama config saved"),a.value.api_key="",l.value=!1,await ve()}catch(B){G(B.message||"Failed","error")}finally{c.value=!1}}async function T(){u.value=!0;try{const B={...i.value};r.value||delete B.api_key,await K.put("/api/llm/kimi/config",B),G("Kimi config saved"),i.value.api_key="",r.value=!1,await ve()}catch(B){G(B.message||"Failed","error")}finally{u.value=!1}}async function P(B){try{await K.post("/api/codex/account/"+B+"/activate"),G("Active account switched"),await X()}catch(ee){G(ee.message||"Failed","error")}}async function W(B){O.value=B;try{await K.post("/api/codex/account/"+B+"/refresh"),G("Token refreshed"),await X()}catch(ee){G(ee.message||"Refresh failed","error")}finally{O.value=null}}function R(B,ee){j.value=B,M.value=ee||""}async function F(B){try{await K.put("/api/codex/account/"+B+"/label",{label:M.value}),G("Label updated"),j.value=null,await X()}catch(ee){G(ee.message||"Failed","error")}}async function Y(B,ee){if(await ns({title:"Delete Codex account",message:`Delete ${ee||"account #"+(B+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+B),G("Deleted. Pool reloaded."),await X()}catch(be){G(be.message||"Failed","error")}}async function Z(){J.value=!0;try{const B=await K.post("/api/codex/device-code");$.value=B,L.value="pending",se(B)}catch(B){G(B.message||"Failed","error")}finally{J.value=!1}}async function se(B){D={cancelled:!1};const ee=D;try{const oe=await K.post("/api/codex/device-poll",{device_auth_id:B.device_auth_id,user_code:B.user_code,interval:B.interval});if(ee.cancelled)return;V.value=oe,L.value="success",await ve()}catch(oe){if(ee.cancelled)return;I.value=oe.message||"Device login failed",L.value="error"}}function Q(){D&&(D.cancelled=!0),L.value=null,$.value=null}return $e(ve),ft(()=>{D&&(D.cancelled=!0)}),{loading:e,llmStatus:t,selectedProvider:s,switching:f,codexForm:n,ollamaForm:a,kimiForm:i,savingCodex:o,savingOllama:c,savingKimi:u,probingOllama:d,ollamaKeyDirty:l,kimiKeyDirty:r,ollamaStatus:p,ollamaModels:m,ollamaSelectedModel:g,reloading:k,settingModel:C,kimiStatus:v,kimiModels:b,kimiSelectedModel:x,reloadingKimi:E,settingKimiModel:S,codexLoading:N,codexError:w,codexData:A,refreshing:O,editingLabel:j,labelValue:M,deviceState:L,deviceLoading:J,deviceInfo:$,deviceResult:V,deviceError:I,fetchAll:ve,switchProvider:ue,reloadOllama:Ie,setOllamaModel:q,reloadKimi:ge,setKimiModel:me,probeOllamaModels:re,saveCodexConfig:Le,saveOllamaConfig:y,saveKimiConfig:T,activateAccount:P,refreshAccount:W,startEditLabel:R,saveLabel:F,deleteAccount:Y,startDeviceLogin:Z,cancelDeviceLogin:Q,formatSize:de}}},Fd={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Bw(e){return Fd[e]||Fd[(e||"").toLowerCase()]||"text-gray-400"}const Uw={template:`
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
                {{ d.passed ? '✔' : '✖' }}
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
                  {{ s.state === 'available' ? '✔' : s.state === 'degraded' ? '⚠' : '✖' }}
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),u=h(null);let d=null;async function f(){const p=await Promise.allSettled([K.get("/api/startup/diagnostics"),K.get("/api/subsystems/status"),K.get("/api/pools/ssh"),K.get("/api/pools/http"),K.get("/api/risk/stats"),K.get("/api/recovery/stats"),K.get("/api/compression/stats"),K.get("/api/routing/stats"),K.get("/api/freshness/stats"),K.get("/api/governor/stats")]),m=k=>p[k].status==="fulfilled"?p[k].value:null;t.value=m(0)||{};const g=m(1);s.value=Array.isArray(g)?g:g&&g.subsystems||[],n.value=m(2)||{},a.value=m(3)||{},i.value=m(4),l.value=m(5),r.value=m(6),o.value=m(7),c.value=m(8),u.value=m(9),e.value=!1}return $e(()=>{f(),d=setInterval(f,3e4)}),ft(()=>{d&&clearInterval(d)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,routingStats:o,freshnessStats:c,governorStats:u,statusColor:Bw,formatTime:yc}}},Hw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await K.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await ns({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return $e(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},jw={components:{TabbedPage:ir},setup(){return{tabs:[{id:"health",label:"Health",component:xw},{id:"resources",label:"Resources",component:_w},{id:"logs",label:"Logs",component:Tw},{id:"config",label:"Config",component:Lw},{id:"discord",label:"Discord",component:Pw},{id:"host-access",label:"Host Access",component:Mw},{id:"api-tokens",label:"API Tokens",component:Fw},{id:"llm",label:"LLM Config",component:$w},{id:"internals",label:"Internals",component:Uw},{id:"update",label:"Update",component:Hw}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},cg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:I_,meta:{label:"Dashboard",icon:"📊"}},{path:"/chat",component:Kk,meta:{label:"Chat",icon:"💭"}},{path:"/operations",component:Zk,meta:{label:"Operations",icon:"🎯"}},{path:"/history",component:lw,meta:{label:"History",icon:"📝"}},{path:"/capabilities",component:gw,meta:{label:"Capabilities",icon:"🔧"}},{path:"/personality",component:mw,meta:{label:"Personality",icon:"🎭"}},{path:"/system",component:jw,meta:{label:"System",icon:"⚙️"}},{path:"/execution",redirect:{path:"/operations",query:{tab:"live"}}},{path:"/agents",redirect:{path:"/operations",query:{tab:"agents"}}},{path:"/loops",redirect:{path:"/operations",query:{tab:"loops"}}},{path:"/processes",redirect:{path:"/operations",query:{tab:"processes"}}},{path:"/schedules",redirect:{path:"/operations",query:{tab:"schedules"}}},{path:"/audit",redirect:{path:"/history",query:{tab:"audit"}}},{path:"/sessions",redirect:{path:"/history",query:{tab:"sessions"}}},{path:"/traces",redirect:{path:"/history",query:{tab:"traces"}}},{path:"/usage",redirect:{path:"/history",query:{tab:"usage"}}},{path:"/tools",redirect:{path:"/capabilities",query:{tab:"tools"}}},{path:"/skills",redirect:{path:"/capabilities",query:{tab:"skills"}}},{path:"/knowledge",redirect:{path:"/capabilities",query:{tab:"knowledge"}}},{path:"/memory",redirect:{path:"/capabilities",query:{tab:"memory"}}},{path:"/health",redirect:{path:"/system",query:{tab:"health"}}},{path:"/resources",redirect:{path:"/system",query:{tab:"resources"}}},{path:"/logs",redirect:{path:"/system",query:{tab:"logs"}}},{path:"/config",redirect:{path:"/system",query:{tab:"config"}}},{path:"/host-access",redirect:{path:"/system",query:{tab:"host-access"}}},{path:"/internals",redirect:{path:"/system",query:{tab:"internals"}}}],ug=w_({history:t_(),routes:cg});ug.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const Vw={template:`
    <div class="min-h-screen flex items-center justify-center" role="main">
      <div class="hm-card w-full max-w-sm">
        <h1 id="login-title" class="text-xl font-semibold mb-1 text-center">Odin</h1>
        <p class="text-gray-400 text-sm text-center mb-4">Management Interface</p>
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},qw={template:`
    <div v-if="authState === 'checking'" class="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
      <div class="spinner" aria-hidden="true"></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <login-screen v-else-if="authState === 'login'" :on-login="onLogin" :session-expired="sessionExpired" />
    <div v-else class="flex min-h-screen">
      <!-- Sidebar -->
      <aside class="hm-sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }" role="navigation" aria-label="Main navigation">
        <div class="flex items-center gap-2 px-3 py-3 border-b border-gray-800">
          <button @click="toggleSidebar" class="btn-ghost p-1 rounded sidebar-toggle-btn"
                  :aria-expanded="!sidebarCollapsed" aria-controls="sidebar-nav"
                  :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
            <span style="font-size:1.1rem;" aria-hidden="true">{{ sidebarCollapsed ? '▶' : '☰' }}</span>
          </button>
          <span class="sidebar-header-text font-semibold text-sm tracking-wide">ODIN</span>
        </div>
        <nav id="sidebar-nav" class="flex-1 py-2 overflow-y-auto" aria-label="Page navigation">
          <router-link
            v-for="r in navRoutes"
            :key="r.path"
            :to="r.path"
            class="nav-item"
            active-class="active"
            :aria-current="$route.path === r.path ? 'page' : undefined"
            @click="mobileOpen = false"
          >
            <span class="nav-icon" aria-hidden="true">{{ r.meta.icon }}</span>
            <span class="nav-label">{{ r.meta.label }}</span>
          </router-link>
        </nav>
        <div class="px-3 py-2 border-t border-gray-800 text-xs text-gray-500 sidebar-header-text">
          <div class="flex items-center gap-1.5 mb-1" aria-live="polite">
            <span class="ws-indicator" :class="'ws-' + wsState" aria-hidden="true"></span>
            <span>{{ wsLabel }}</span>
            <span v-if="wsLatency >= 0" class="text-gray-600" style="font-size:0.5625rem;">{{ wsLatency }}ms</span>
          </div>
          <div class="text-gray-600 mobile-hide" style="font-size:0.625rem;" aria-label="Keyboard shortcuts">
            <kbd class="px-1 py-0.5 bg-gray-800 rounded">Ctrl K</kbd> jump
            <kbd class="px-1 py-0.5 bg-gray-800 rounded ml-1">/</kbd> search
            <kbd class="px-1 py-0.5 bg-gray-800 rounded ml-1">Esc</kbd> close
          </div>
        </div>
        <!-- Connection toast -->
        <transition name="ws-toast">
          <div v-if="wsToast" class="ws-toast" :class="'ws-toast-' + wsToast.level" role="status" aria-live="assertive">
            {{ wsToast.text }}
          </div>
        </transition>
      </aside>

      <!-- Mobile overlay -->
      <div v-if="mobileOpen" class="fixed inset-0 bg-black/50 z-30 md:hidden" @click="mobileOpen = false" aria-hidden="true"></div>

      <!-- Main content -->
      <main id="main-content" class="hm-main" role="main">
        <header class="hm-topbar" role="banner">
          <button class="btn-ghost p-1 rounded md:hidden" @click="mobileOpen = !mobileOpen"
                  :aria-expanded="mobileOpen" aria-controls="sidebar-nav" aria-label="Open navigation menu">
            <span style="font-size:1.1rem;" aria-hidden="true">☰</span>
          </button>
          <div class="flex items-center gap-2">
            <span class="status-dot" :class="botStatus" role="img" :aria-label="'Bot status: ' + botStatus"></span>
            <span class="text-sm font-medium">Odin</span>
          </div>
          <span v-if="botUptime" class="text-xs text-gray-500" aria-label="Uptime">{{ botUptime }}</span>
          <div class="flex-1"></div>
          <button @click="logout" class="btn btn-ghost text-xs" aria-label="Log out">Logout</button>
        </header>
        <router-view />
      </main>
    </div>
    <toast-container />
    <confirm-host />
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(!1),i=h("disconnected"),l=h(-1),r=h(null);let o=null;const c=h("starting"),u=h(""),d=cg.filter(S=>S.meta);K.onSessionExpired=()=>{t.value=!0,qe.disconnect(),K.setToken(""),e.value="login"};function f(S){if((S.ctrlKey||S.metaKey)&&S.key.toLowerCase()==="k"){e.value==="ready"&&(S.preventDefault(),C_());return}if(S.key==="Escape"&&n.value){n.value=!1,S.preventDefault();return}if(S.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(S.target.tagName)){S.preventDefault();const N=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');N&&N.focus()}}$e(async()=>{document.addEventListener("keydown",f);const S=await K.check();S.ok?(e.value="ready",x()):S.needsAuth?e.value="login":(e.value="ready",x())});function p(){t.value=!1,e.value="ready",x()}async function m(){await K.logout(),qe.disconnect(),e.value="login"}function g(){s.value=!s.value}const k=te(()=>{switch(i.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function C(S,N="info",w=3e3){r.value={text:S,level:N},clearTimeout(o),o=setTimeout(()=>{r.value=null},w)}let v=null,b=!1;function x(){qe.onStatusChange=S=>{a.value=S},qe.onStateChange=(S,N)=>{i.value=S,l.value=N.latency??-1,S==="connected"?(b&&C("Connection restored","success"),b=!0):S==="reconnecting"&&N.attempt===1&&C("Connection lost — reconnecting…","warn")},qe.connect(),E(),v&&clearInterval(v),v=setInterval(E,15e3)}async function E(){try{const S=await K.get("/api/status");c.value=S.status==="online"?"online":"starting";const N=S.uptime_seconds||0,w=Math.floor(N/3600),A=Math.floor(N%3600/60);u.value=`${w}h ${A}m uptime`}catch{c.value="offline",u.value=""}}return ft(()=>{v&&clearInterval(v),qe.disconnect(),document.removeEventListener("keydown",f)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:a,wsState:i,wsLatency:l,wsLabel:k,wsToast:r,botStatus:c,botUptime:u,navRoutes:d,onLogin:p,logout:m,toggleSidebar:g}}},Ca=vl(qw);Ca.component("login-screen",Vw);Ca.component("toast-container",g0);Ca.component("confirm-host",m0);Ca.component("command-palette",A_);Ca.use(ug);Ca.mount("#app");
