var yg=Object.defineProperty;var xg=(e,t,s)=>t in e?yg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var We=(e,t,s)=>xg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class _g{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null){this._lastActivity=Date.now();const a={method:t,headers:this._headers()};n!==null&&(a.body=JSON.stringify(n));const i=await fetch(s,a);if(i.status===401)throw new ur("Unauthorized");const l=await i.json().catch(()=>null);if(!i.ok){const r=(l==null?void 0:l.error)||`HTTP ${i.status}`;throw new kg(r,i.status,l)}return l}get(t){return this._request("GET",t)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ur((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ur?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ur extends Error{constructor(t){super(t),this.name="AuthError"}}class kg extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class wg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error")for(const l of this._handlers.chat||[])l(a)},this._ws.onclose=()=>{this._ws=null,this._stopPing(),this._latency=-1,this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const K=new _g,qe=new wg(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function as(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Pe={},sa=[],It=()=>{},ea=()=>!1,Mn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Il=e=>e.startsWith("onUpdate:"),Oe=Object.assign,_o=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Sg=Object.prototype.hasOwnProperty,He=(e,t)=>Sg.call(e,t),fe=Array.isArray,na=e=>ka(e)==="[object Map]",Fn=e=>ka(e)==="[object Set]",Vc=e=>ka(e)==="[object Date]",Tg=e=>ka(e)==="[object RegExp]",ke=e=>typeof e=="function",Te=e=>typeof e=="string",$t=e=>typeof e=="symbol",Ue=e=>e!==null&&typeof e=="object",ko=e=>(Ue(e)||ke(e))&&ke(e.then)&&ke(e.catch),Bd=Object.prototype.toString,ka=e=>Bd.call(e),Cg=e=>ka(e).slice(8,-1),Nl=e=>ka(e)==="[object Object]",Dl=e=>Te(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,qs=as(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Eg=as("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ol=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Ag=/-\w/g,Ke=Ol(e=>e.replace(Ag,t=>t.slice(1).toUpperCase())),Rg=/\B([A-Z])/g,Qt=Ol(e=>e.replace(Rg,"-$1").toLowerCase()),$n=Ol(e=>e.charAt(0).toUpperCase()+e.slice(1)),aa=Ol(e=>e?`on${$n(e)}`:""),kt=(e,t)=>!Object.is(e,t),ia=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Ud=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Ll=e=>{const t=parseFloat(e);return isNaN(t)?e:t},el=e=>{const t=Te(e)?Number(e):NaN;return isNaN(t)?e:t};let qc;const Pl=()=>qc||(qc=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Ig(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Ng="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Dg=as(Ng);function vi(e){if(fe(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Te(n)?Hd(n):vi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Te(e)||Ue(e))return e}const Og=/;(?![^(]*\))/g,Lg=/:([^]+)/,Pg=/\/\*[^]*?\*\//g;function Hd(e){const t={};return e.replace(Pg,"").split(Og).forEach(s=>{if(s){const n=s.split(Lg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function bi(e){let t="";if(Te(e))t=e;else if(fe(e))for(let s=0;s<e.length;s++){const n=bi(e[s]);n&&(t+=n+" ")}else if(Ue(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Mg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Te(t)&&(e.class=bi(t)),s&&(e.style=vi(s)),e}const Fg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",$g="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Bg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Ug="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Hg=as(Fg),jg=as($g),Vg=as(Bg),qg=as(Ug),zg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Kg=as(zg);function jd(e){return!!e||e===""}function Gg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Ws(e[n],t[n]);return s}function Ws(e,t){if(e===t)return!0;let s=Vc(e),n=Vc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=$t(e),n=$t(t),s||n)return e===t;if(s=fe(e),n=fe(t),s||n)return s&&n?Gg(e,t):!1;if(s=Ue(e),n=Ue(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!Ws(e[l],t[l]))return!1}}return String(e)===String(t)}function Ml(e,t){return e.findIndex(s=>Ws(s,t))}const Vd=e=>!!(e&&e.__v_isRef===!0),qd=e=>Te(e)?e:e==null?"":fe(e)||Ue(e)&&(e.toString===Bd||!ke(e.toString))?Vd(e)?qd(e.value):JSON.stringify(e,zd,2):String(e),zd=(e,t)=>Vd(t)?zd(e,t.value):na(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[dr(n,i)+" =>"]=a,s),{})}:Fn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>dr(s))}:$t(t)?dr(t):Ue(t)&&!fe(t)&&!Nl(t)?String(t):t,dr=(e,t="")=>{var s;return $t(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Wg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let yt;class wo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&yt&&(yt.active?(this.parent=yt,this.index=(yt.scopes||(yt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=yt;try{return yt=this,t()}finally{yt=s}}}on(){++this._on===1&&(this.prevScope=yt,yt=this)}off(){if(this._on>0&&--this._on===0){if(yt===this)yt=this.prevScope;else{let t=yt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Jg(e){return new wo(e)}function Kd(){return yt}function Yg(e,t=!1){yt&&yt.cleanups.push(e)}let Ze;const fr=new WeakSet;class Za{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,yt&&(yt.active?yt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,fr.has(this)&&(fr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Wd(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,zc(this),Jd(this);const t=Ze,s=ms;Ze=this,ms=!0;try{return this.fn()}finally{Yd(this),Ze=t,ms=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Co(t);this.deps=this.depsTail=void 0,zc(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?fr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Ur(this)&&this.run()}get dirty(){return Ur(this)}}let Gd=0,qa,za;function Wd(e,t=!1){if(e.flags|=8,t){e.next=za,za=e;return}e.next=qa,qa=e}function So(){Gd++}function To(){if(--Gd>0)return;if(za){let t=za;for(za=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;qa;){let t=qa;for(qa=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Jd(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Yd(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Co(n),Qg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Ur(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Qd(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Qd(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===ei)||(e.globalVersion=ei,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Ur(e))))return;e.flags|=2;const t=e.dep,s=Ze,n=ms;Ze=e,ms=!0;try{Jd(e);const a=e.fn(e._value);(t.version===0||kt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{Ze=s,ms=n,Yd(e),e.flags&=-3}}function Co(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Co(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Qg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Xg(e,t){e.effect instanceof Za&&(e=e.effect.fn);const s=new Za(e);t&&Oe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Zg(e){e.effect.stop()}let ms=!0;const Xd=[];function Js(){Xd.push(ms),ms=!1}function Ys(){const e=Xd.pop();ms=e===void 0?!0:e}function zc(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Ze;Ze=void 0;try{t()}finally{Ze=s}}}let ei=0;class em{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Fl{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Ze||!ms||Ze===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Ze)s=this.activeLink=new em(Ze,this),Ze.deps?(s.prevDep=Ze.depsTail,Ze.depsTail.nextDep=s,Ze.depsTail=s):Ze.deps=Ze.depsTail=s,Zd(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=Ze.depsTail,s.nextDep=void 0,Ze.depsTail.nextDep=s,Ze.depsTail=s,Ze.deps===s&&(Ze.deps=n)}return s}trigger(t){this.version++,ei++,this.notify(t)}notify(t){So();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{To()}}}function Zd(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Zd(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const tl=new WeakMap,Cn=Symbol(""),Hr=Symbol(""),ti=Symbol("");function Pt(e,t,s){if(ms&&Ze){let n=tl.get(e);n||tl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Fl),a.map=n,a.key=s),a.track()}}function Bs(e,t,s,n,a,i){const l=tl.get(e);if(!l){ei++;return}const r=o=>{o&&o.trigger()};if(So(),t==="clear")l.forEach(r);else{const o=fe(e),c=o&&Dl(s);if(o&&s==="length"){const u=Number(n);l.forEach((d,f)=>{(f==="length"||f===ti||!$t(f)&&f>=u)&&r(d)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(ti)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Cn)),na(e)&&r(l.get(Hr)));break;case"delete":o||(r(l.get(Cn)),na(e)&&r(l.get(Hr)));break;case"set":na(e)&&r(l.get(Cn));break}}To()}function tm(e,t){const s=tl.get(e);return s&&s.get(t)}function zn(e){const t=Fe(e);return t===e?t:(Pt(t,"iterate",ti),Zt(e)?t:t.map(bs))}function $l(e){return Pt(e=Fe(e),"iterate",ti),e}function Cs(e,t){return As(e)?da(zs(e)?bs(t):t):bs(t)}const sm={__proto__:null,[Symbol.iterator](){return pr(this,Symbol.iterator,e=>Cs(this,e))},concat(...e){return zn(this).concat(...e.map(t=>fe(t)?zn(t):t))},entries(){return pr(this,"entries",e=>(e[1]=Cs(this,e[1]),e))},every(e,t){return Ns(this,"every",e,t,void 0,arguments)},filter(e,t){return Ns(this,"filter",e,t,s=>s.map(n=>Cs(this,n)),arguments)},find(e,t){return Ns(this,"find",e,t,s=>Cs(this,s),arguments)},findIndex(e,t){return Ns(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ns(this,"findLast",e,t,s=>Cs(this,s),arguments)},findLastIndex(e,t){return Ns(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ns(this,"forEach",e,t,void 0,arguments)},includes(...e){return hr(this,"includes",e)},indexOf(...e){return hr(this,"indexOf",e)},join(e){return zn(this).join(e)},lastIndexOf(...e){return hr(this,"lastIndexOf",e)},map(e,t){return Ns(this,"map",e,t,void 0,arguments)},pop(){return Ia(this,"pop")},push(...e){return Ia(this,"push",e)},reduce(e,...t){return Kc(this,"reduce",e,t)},reduceRight(e,...t){return Kc(this,"reduceRight",e,t)},shift(){return Ia(this,"shift")},some(e,t){return Ns(this,"some",e,t,void 0,arguments)},splice(...e){return Ia(this,"splice",e)},toReversed(){return zn(this).toReversed()},toSorted(e){return zn(this).toSorted(e)},toSpliced(...e){return zn(this).toSpliced(...e)},unshift(...e){return Ia(this,"unshift",e)},values(){return pr(this,"values",e=>Cs(this,e))}};function pr(e,t,s){const n=$l(e),a=n[t]();return n!==e&&!Zt(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const nm=Array.prototype;function Ns(e,t,s,n,a,i){const l=$l(e),r=l!==e&&!Zt(e),o=l[t];if(o!==nm[t]){const d=o.apply(e,i);return r?bs(d):d}let c=s;l!==e&&(r?c=function(d,f){return s.call(this,Cs(e,d),f,e)}:s.length>2&&(c=function(d,f){return s.call(this,d,f,e)}));const u=o.call(l,c,n);return r&&a?a(u):u}function Kc(e,t,s,n){const a=$l(e),i=a!==e&&!Zt(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,u,d){return r&&(r=!1,c=Cs(e,c)),s.call(this,c,Cs(e,u),d,e)}):s.length>3&&(l=function(c,u,d){return s.call(this,c,u,d,e)}));const o=a[t](l,...n);return r?Cs(e,o):o}function hr(e,t,s){const n=Fe(e);Pt(n,"iterate",ti);const a=n[t](...s);return(a===-1||a===!1)&&yi(s[0])?(s[0]=Fe(s[0]),n[t](...s)):a}function Ia(e,t,s=[]){Js(),So();const n=Fe(e)[t].apply(e,s);return To(),Ys(),n}const am=as("__proto__,__v_isRef,__isVue"),ef=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter($t));function im(e){$t(e)||(e=String(e));const t=Fe(this);return Pt(t,"has",e),t.hasOwnProperty(e)}class tf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?of:rf:i?lf:af).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=fe(t);if(!a){let o;if(l&&(o=sm[s]))return o;if(s==="hasOwnProperty")return im}const r=Reflect.get(t,s,gt(t)?t:n);if(($t(s)?ef.has(s):am(s))||(a||Pt(t,"get",s),i))return r;if(gt(r)){const o=l&&Dl(s)?r:r.value;return a&&Ue(o)?sl(o):o}return Ue(r)?a?sl(r):gn(r):r}}class sf extends tf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=fe(t)&&Dl(s);if(!this._isShallow){const c=As(i);if(!Zt(n)&&!As(n)&&(i=Fe(i),n=Fe(n)),!l&&gt(i)&&!gt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:He(t,s),o=Reflect.set(t,s,n,gt(t)?t:a);return t===Fe(a)&&(r?kt(n,i)&&Bs(t,"set",s,n):Bs(t,"add",s,n)),o}deleteProperty(t,s){const n=He(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Bs(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!$t(s)||!ef.has(s))&&Pt(t,"has",s),n}ownKeys(t){return Pt(t,"iterate",fe(t)?"length":Cn),Reflect.ownKeys(t)}}class nf extends tf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const lm=new sf,rm=new nf,om=new sf(!0),cm=new nf(!0),jr=e=>e,Di=e=>Reflect.getPrototypeOf(e);function um(e,t,s){return function(...n){const a=this.__v_raw,i=Fe(a),l=na(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),u=s?jr:t?da:bs;return!t&&Pt(i,"iterate",o?Hr:Cn),Oe(Object.create(c),{next(){const{value:d,done:f}=c.next();return f?{value:d,done:f}:{value:r?[u(d[0]),u(d[1])]:u(d),done:f}}})}}function Oi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function dm(e,t){const s={get(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);e||(kt(a,r)&&Pt(l,"get",a),Pt(l,"get",r));const{has:o}=Di(l),c=t?jr:e?da:bs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Pt(Fe(a),"iterate",Cn),a.size},has(a){const i=this.__v_raw,l=Fe(i),r=Fe(a);return e||(kt(a,r)&&Pt(l,"has",a),Pt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Fe(r),c=t?jr:e?da:bs;return!e&&Pt(o,"iterate",Cn),r.forEach((u,d)=>a.call(i,c(u),c(d),l))}};return Oe(s,e?{add:Oi("add"),set:Oi("set"),delete:Oi("delete"),clear:Oi("clear")}:{add(a){const i=Fe(this),l=Di(i),r=Fe(a),o=!t&&!Zt(a)&&!As(a)?r:a;return l.has.call(i,o)||kt(a,o)&&l.has.call(i,a)||kt(r,o)&&l.has.call(i,r)||(i.add(o),Bs(i,"add",o,o)),this},set(a,i){!t&&!Zt(i)&&!As(i)&&(i=Fe(i));const l=Fe(this),{has:r,get:o}=Di(l);let c=r.call(l,a);c||(a=Fe(a),c=r.call(l,a));const u=o.call(l,a);return l.set(a,i),c?kt(i,u)&&Bs(l,"set",a,i):Bs(l,"add",a,i),this},delete(a){const i=Fe(this),{has:l,get:r}=Di(i);let o=l.call(i,a);o||(a=Fe(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&Bs(i,"delete",a,void 0),c},clear(){const a=Fe(this),i=a.size!==0,l=a.clear();return i&&Bs(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=um(a,e,t)}),s}function Bl(e,t){const s=dm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(He(s,a)&&a in n?s:n,a,i)}const fm={get:Bl(!1,!1)},pm={get:Bl(!1,!0)},hm={get:Bl(!0,!1)},gm={get:Bl(!0,!0)},af=new WeakMap,lf=new WeakMap,rf=new WeakMap,of=new WeakMap;function mm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function gn(e){return As(e)?e:Ul(e,!1,lm,fm,af)}function Eo(e){return Ul(e,!1,om,pm,lf)}function sl(e){return Ul(e,!0,rm,hm,rf)}function vm(e){return Ul(e,!0,cm,gm,of)}function Ul(e,t,s,n,a){if(!Ue(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=mm(Cg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function zs(e){return As(e)?zs(e.__v_raw):!!(e&&e.__v_isReactive)}function As(e){return!!(e&&e.__v_isReadonly)}function Zt(e){return!!(e&&e.__v_isShallow)}function yi(e){return e?!!e.__v_raw:!1}function Fe(e){const t=e&&e.__v_raw;return t?Fe(t):e}function cf(e){return!He(e,"__v_skip")&&Object.isExtensible(e)&&Ud(e,"__v_skip",!0),e}const bs=e=>Ue(e)?gn(e):e,da=e=>Ue(e)?sl(e):e;function gt(e){return e?e.__v_isRef===!0:!1}function h(e){return uf(e,!1)}function Ao(e){return uf(e,!0)}function uf(e,t){return gt(e)?e:new bm(e,t)}class bm{constructor(t,s){this.dep=new Fl,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Fe(t),this._value=s?t:bs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||Zt(t)||As(t);t=n?t:Fe(t),kt(t,s)&&(this._rawValue=t,this._value=n?t:bs(t),this.dep.trigger())}}function ym(e){e.dep&&e.dep.trigger()}function Es(e){return gt(e)?e.value:e}function xm(e){return ke(e)?e():Es(e)}const _m={get:(e,t,s)=>t==="__v_raw"?e:Es(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return gt(a)&&!gt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Ro(e){return zs(e)?e:new Proxy(e,_m)}class km{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Fl,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function df(e){return new km(e)}function wm(e){const t=fe(e)?new Array(e.length):{};for(const s in e)t[s]=ff(e,s);return t}class Sm{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=$t(s)?s:String(s),this._raw=Fe(t);let a=!0,i=t;if(!fe(t)||$t(this._key)||!Dl(this._key))do a=!yi(i)||Zt(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Es(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&gt(this._raw[this._key])){const s=this._object[this._key];if(gt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return tm(this._raw,this._key)}}class Tm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Cm(e,t,s){return gt(e)?e:ke(e)?new Tm(e):Ue(e)&&arguments.length>1?ff(e,t,s):h(e)}function ff(e,t,s){return new Sm(e,t,s)}class Em{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Fl(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=ei-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&Ze!==this)return Wd(this,!0),!0}get value(){const t=this.dep.track();return Qd(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Am(e,t,s=!1){let n,a;return ke(e)?n=e:(n=e.get,a=e.set),new Em(n,a,s)}const Rm={GET:"get",HAS:"has",ITERATE:"iterate"},Im={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Li={},nl=new WeakMap;let on;function Nm(){return on}function pf(e,t=!1,s=on){if(s){let n=nl.get(s);n||nl.set(s,n=[]),n.push(e)}}function Dm(e,t,s=Pe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:Zt(x)||a===!1||a===0?Us(x,1):Us(x);let u,d,f,p,m=!1,g=!1;if(gt(e)?(d=()=>e.value,m=Zt(e)):zs(e)?(d=()=>c(e),m=!0):fe(e)?(g=!0,m=e.some(x=>zs(x)||Zt(x)),d=()=>e.map(x=>{if(gt(x))return x.value;if(zs(x))return c(x);if(ke(x))return o?o(x,2):x()})):ke(e)?t?d=o?()=>o(e,2):e:d=()=>{if(f){Js();try{f()}finally{Ys()}}const x=on;on=u;try{return o?o(e,3,[p]):e(p)}finally{on=x}}:d=It,t&&a){const x=d,R=a===!0?1/0:a;d=()=>Us(x(),R)}const k=Kd(),E=()=>{u.stop(),k&&k.active&&_o(k.effects,u)};if(i&&t){const x=t;t=(...R)=>{const S=x(...R);return E(),S}}let v=g?new Array(e.length).fill(Li):Li;const b=x=>{if(!(!(u.flags&1)||!u.dirty&&!x))if(t){const R=u.run();if(x||a||m||(g?R.some((S,D)=>kt(S,v[D])):kt(R,v))){f&&f();const S=on;on=u;try{const D=[R,v===Li?void 0:g&&v[0]===Li?[]:v,p];v=R,o?o(t,3,D):t(...D)}finally{on=S}}}else u.run()};return r&&r(b),u=new Za(d),u.scheduler=l?()=>l(b,!1):b,p=x=>pf(x,!1,u),f=u.onStop=()=>{const x=nl.get(u);if(x){if(o)o(x,4);else for(const R of x)R();nl.delete(u)}},t?n?b(!0):v=u.run():l?l(b.bind(null,!0),!0):u.run(),E.pause=u.pause.bind(u),E.resume=u.resume.bind(u),E.stop=E,E}function Us(e,t=1/0,s){if(t<=0||!Ue(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,gt(e))Us(e.value,t,s);else if(fe(e))for(let n=0;n<e.length;n++)Us(e[n],t,s);else if(Fn(e)||na(e))e.forEach(n=>{Us(n,t,s)});else if(Nl(e)){for(const n in e)Us(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Us(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const hf=[];function Om(e){hf.push(e)}function Lm(){hf.pop()}function Pm(e,t){}const Mm={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Fm={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function wa(e,t,s,n){try{return n?e(...n):e()}catch(a){Bn(a,t,s)}}function ss(e,t,s,n){if(ke(e)){const a=wa(e,t,s,n);return a&&ko(a)&&a.catch(i=>{Bn(i,t,s)}),a}if(fe(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ss(e[i],t,s,n));return a}}function Bn(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Pe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const u=r.ec;if(u){for(let d=0;d<u.length;d++)if(u[d](e,o,c)===!1)return}r=r.parent}if(i){Js(),wa(i,null,10,[e,o,c]),Ys();return}}$m(e,s,a,n,l)}function $m(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const jt=[];let Ss=-1;const la=[];let cn=null,Yn=0;const gf=Promise.resolve();let al=null;function Et(e){const t=al||gf;return e?t.then(this?e.bind(this):e):t}function Bm(e){let t=Ss+1,s=jt.length;for(;t<s;){const n=t+s>>>1,a=jt[n],i=ni(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Io(e){if(!(e.flags&1)){const t=ni(e),s=jt[jt.length-1];!s||!(e.flags&2)&&t>=ni(s)?jt.push(e):jt.splice(Bm(t),0,e),e.flags|=1,mf()}}function mf(){al||(al=gf.then(vf))}function si(e){fe(e)?la.push(...e):cn&&e.id===-1?cn.splice(Yn+1,0,e):e.flags&1||(la.push(e),e.flags|=1),mf()}function Gc(e,t,s=Ss+1){for(;s<jt.length;s++){const n=jt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;jt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function il(e){if(la.length){const t=[...new Set(la)].sort((s,n)=>ni(s)-ni(n));if(la.length=0,cn){cn.push(...t);return}for(cn=t,Yn=0;Yn<cn.length;Yn++){const s=cn[Yn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}cn=null,Yn=0}}const ni=e=>e.id==null?e.flags&2?-1:1/0:e.id;function vf(e){try{for(Ss=0;Ss<jt.length;Ss++){const t=jt[Ss];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),wa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ss<jt.length;Ss++){const t=jt[Ss];t&&(t.flags&=-2)}Ss=-1,jt.length=0,il(),al=null,(jt.length||la.length)&&vf()}}let Qn,Pi=[];function bf(e,t){var s,n;Qn=e,Qn?(Qn.enabled=!0,Pi.forEach(({event:a,args:i})=>Qn.emit(a,...i)),Pi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{bf(i,t)}),setTimeout(()=>{Qn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Pi=[])},3e3)):Pi=[]}let Rt=null,Hl=null;function ai(e){const t=Rt;return Rt=e,Hl=e&&e.type.__scopeId||null,t}function Um(e){Hl=e}function Hm(){Hl=null}const jm=e=>No;function No(e,t=Rt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&oi(-1);const i=ai(t);let l;try{l=e(...a)}finally{ai(i),n._d&&oi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Vm(e,t){if(Rt===null)return e;const s=wi(Rt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Pe]=t[a];i&&(ke(i)&&(i={mounted:i,updated:i}),i.deep&&Us(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Ts(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Js(),ss(o,s,8,[e.el,r,e,t]),Ys())}}function Ka(e,t){if(At){let s=At.provides;const n=At.parent&&At.parent.provides;n===s&&(s=At.provides=Object.create(n)),s[e]=t}}function us(e,t,s=!1){const n=qt();if(n||En){let a=En?En._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&ke(t)?t.call(n&&n.proxy):t}}function qm(){return!!(qt()||En)}const yf=Symbol.for("v-scx"),xf=()=>us(yf);function zm(e,t){return xi(e,null,t)}function Km(e,t){return xi(e,null,{flush:"post"})}function _f(e,t){return xi(e,null,{flush:"sync"})}function ds(e,t,s){return xi(e,t,s)}function xi(e,t,s=Pe){const{immediate:n,deep:a,flush:i,once:l}=s,r=Oe({},s),o=t&&n||!t&&i!=="post";let c;if(On){if(i==="sync"){const p=xf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=It,p.resume=It,p.pause=It,p}}const u=At;r.call=(p,m,g)=>ss(p,u,m,g);let d=!1;i==="post"?r.scheduler=p=>{pt(p,u&&u.suspense)}:i!=="sync"&&(d=!0,r.scheduler=(p,m)=>{m?p():Io(p)}),r.augmentJob=p=>{t&&(p.flags|=4),d&&(p.flags|=2,u&&(p.id=u.uid,p.i=u))};const f=Dm(e,t,r);return On&&(c?c.push(f):o&&f()),f}function Gm(e,t,s){const n=this.proxy,a=Te(e)?e.includes(".")?kf(n,e):()=>n[e]:e.bind(n,n);let i;ke(t)?i=t:(i=t.handler,s=t);const l=Sa(this),r=xi(a,i.bind(n),s);return l(),r}function kf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const ln=new WeakMap,wf=Symbol("_vte"),Sf=e=>e.__isTeleport,kn=e=>e&&(e.disabled||e.disabled===""),Wm=e=>e&&(e.defer||e.defer===""),Wc=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Jc=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Vr=(e,t)=>{const s=e&&e.to;return Te(s)?t?t(s):null:s},Jm={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:u,pc:d,pbc:f,o:{insert:p,querySelector:m,createText:g,createComment:k,parentNode:E}}=c,v=kn(t.props);let{dynamicChildren:b}=t;const x=(D,w,I)=>{D.shapeFlag&16&&u(D.children,w,I,a,i,l,r,o)},R=(D=t)=>{const w=kn(D.props),I=D.target=Vr(D.props,m),L=qr(I,D,g,p);I&&(l!=="svg"&&Wc(I)?l="svg":l!=="mathml"&&Jc(I)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(I),w||(x(D,I,L),Ba(D,!1)))},S=D=>{const w=()=>{if(ln.get(D)===w){if(ln.delete(D),kn(D.props)){const I=E(D.el)||s;x(D,I,D.anchor),Ba(D,!0)}R(D)}};ln.set(D,w),pt(w,i)};if(e==null){const D=t.el=g(""),w=t.anchor=g("");if(p(D,s,n),p(w,s,n),Wm(t.props)||i&&i.pendingBranch){S(t);return}v&&(x(t,s,w),Ba(t,!0)),R()}else{t.el=e.el;const D=t.anchor=e.anchor,w=ln.get(e);if(w){w.flags|=8,ln.delete(e),S(t);return}t.targetStart=e.targetStart;const I=t.target=e.target,L=t.targetAnchor=e.targetAnchor,H=kn(e.props),F=H?s:I,P=H?D:L;if(l==="svg"||Wc(I)?l="svg":(l==="mathml"||Jc(I))&&(l="mathml"),b?(f(e.dynamicChildren,b,F,a,i,l,r),jo(e,t,!0)):o||d(e,t,F,P,a,i,l,r,!1),v)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Mi(t,s,D,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const W=t.target=Vr(t.props,m);W&&Mi(t,W,null,c,0)}else H&&Mi(t,I,L,c,1);Ba(t,v)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:u,target:d,props:f}=e,p=i||!kn(f),m=ln.get(e);if(m&&(m.flags|=8,ln.delete(e)),d&&(a(c),a(u)),i&&a(o),!m&&l&16)for(let g=0;g<r.length;g++){const k=r[g];n(k,t,s,p,!!k.dynamicChildren)}},move:Mi,hydrate:Ym};function Mi(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:u}=e,d=i===2;if(d&&n(l,t,s),!ln.has(e)&&(!d||kn(u))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);d&&n(r,t,s)}function Ym(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:u}},d){function f(k,E){let v=E;for(;v;){if(v&&v.nodeType===8){if(v.data==="teleport start anchor")t.targetStart=v;else if(v.data==="teleport anchor"){t.targetAnchor=v,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}v=l(v)}}function p(k,E){E.anchor=d(l(k),E,r(k),s,n,a,i)}const m=t.target=Vr(t.props,o),g=kn(t.props);if(m){const k=m._lpa||m.firstChild;t.shapeFlag&16&&(g?(p(e,t),f(m,k),t.targetAnchor||qr(m,t,u,c,r(e)===m?e:null)):(t.anchor=l(e),f(m,k),t.targetAnchor||qr(m,t,u,c),d(k&&l(k),t,m,s,n,a,i))),Ba(t,g)}else g&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Qm=Jm;function Ba(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function qr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[wf]=l,e&&(n(i,e,a),n(l,e,a)),l}const rs=Symbol("_leaveCb"),Na=Symbol("_enterCb");function Do(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return $e(()=>{e.isMounted=!0}),zl(()=>{e.isUnmounting=!0}),e}const ls=[Function,Array],Oo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ls,onEnter:ls,onAfterEnter:ls,onEnterCancelled:ls,onBeforeLeave:ls,onLeave:ls,onAfterLeave:ls,onLeaveCancelled:ls,onBeforeAppear:ls,onAppear:ls,onAfterAppear:ls,onAppearCancelled:ls},Tf=e=>{const t=e.subTree;return t.component?Tf(t.component):t},Xm={name:"BaseTransition",props:Oo,setup(e,{slots:t}){const s=qt(),n=Do();return()=>{const a=t.default&&jl(t.default(),!0),i=a&&a.length?Cf(a):s.subTree?up():void 0;if(!i)return;const l=Fe(e),{mode:r}=l;if(n.isLeaving)return gr(i);const o=Yc(i);if(!o)return gr(i);let c=fa(o,l,n,s,d=>c=d);o.type!==dt&&Qs(o,c);let u=s.subTree&&Yc(s.subTree);if(u&&u.type!==dt&&!gs(u,o)&&Tf(s).type!==dt){let d=fa(u,l,n,s);if(Qs(u,d),r==="out-in"&&o.type!==dt)return n.isLeaving=!0,d.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete d.afterLeave,u=void 0},gr(i);r==="in-out"&&o.type!==dt?d.delayLeave=(f,p,m)=>{const g=Af(n,u);g[String(u.key)]=u,f[rs]=()=>{p(),f[rs]=void 0,delete c.delayedLeave,u=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,u=void 0}}:u=void 0}else u&&(u=void 0);return i}}};function Cf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==dt){t=s;break}}return t}const Ef=Xm;function Af(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function fa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:u,onEnterCancelled:d,onBeforeLeave:f,onLeave:p,onAfterLeave:m,onLeaveCancelled:g,onBeforeAppear:k,onAppear:E,onAfterAppear:v,onAppearCancelled:b}=t,x=String(e.key),R=Af(s,e),S=(I,L)=>{I&&ss(I,n,9,L)},D=(I,L)=>{const H=L[1];S(I,L),fe(I)?I.every(F=>F.length<=1)&&H():I.length<=1&&H()},w={mode:l,persisted:r,beforeEnter(I){let L=o;if(!s.isMounted)if(i)L=k||o;else return;I[rs]&&I[rs](!0);const H=R[x];H&&gs(e,H)&&H.el[rs]&&H.el[rs](),S(L,[I])},enter(I){if(R[x]===e)return;let L=c,H=u,F=d;if(!s.isMounted)if(i)L=E||c,H=v||u,F=b||d;else return;let P=!1;I[Na]=B=>{P||(P=!0,B?S(F,[I]):S(H,[I]),w.delayedLeave&&w.delayedLeave(),I[Na]=void 0)};const W=I[Na].bind(null,!1);L?D(L,[I,W]):W()},leave(I,L){const H=String(e.key);if(I[Na]&&I[Na](!0),s.isUnmounting)return L();S(f,[I]);let F=!1;I[rs]=W=>{F||(F=!0,L(),W?S(g,[I]):S(m,[I]),I[rs]=void 0,R[H]===e&&delete R[H])};const P=I[rs].bind(null,!1);R[H]=e,p?D(p,[I,P]):P()},clone(I){const L=fa(I,t,s,n,a);return a&&a(L),L}};return w}function gr(e){if(ki(e))return e=Rs(e),e.children=null,e}function Yc(e){if(!ki(e))return Sf(e.type)&&e.children?Cf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&ke(s.default))return s.default()}}function Qs(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Qs(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function jl(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===wt?(l.patchFlag&128&&a++,n=n.concat(jl(l.children,t,r))):(t||l.type!==dt)&&n.push(r!=null?Rs(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function _i(e,t){return ke(e)?Oe({name:e.name},t,{setup:e}):e}function Zm(){const e=qt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Lo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function ev(e){const t=qt(),s=Ao(null);if(t){const a=t.refs===Pe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Qc(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const ll=new WeakMap;function ra(e,t,s,n,a=!1){if(fe(e)){e.forEach((g,k)=>ra(g,t&&(fe(t)?t[k]:t),s,n,a));return}if(Ks(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&ra(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?wi(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,u=r.refs===Pe?r.refs={}:r.refs,d=r.setupState,f=Fe(d),p=d===Pe?ea:g=>Qc(u,g)?!1:He(f,g),m=(g,k)=>!(k&&Qc(u,k));if(c!=null&&c!==o){if(Xc(t),Te(c))u[c]=null,p(c)&&(d[c]=null);else if(gt(c)){const g=t;m(c,g.k)&&(c.value=null),g.k&&(u[g.k]=null)}}if(ke(o))wa(o,r,12,[l,u]);else{const g=Te(o),k=gt(o);if(g||k){const E=()=>{if(e.f){const v=g?p(o)?d[o]:u[o]:m()||!e.k?o.value:u[e.k];if(a)fe(v)&&_o(v,i);else if(fe(v))v.includes(i)||v.push(i);else if(g)u[o]=[i],p(o)&&(d[o]=u[o]);else{const b=[i];m(o,e.k)&&(o.value=b),e.k&&(u[e.k]=b)}}else g?(u[o]=l,p(o)&&(d[o]=l)):k&&(m(o,e.k)&&(o.value=l),e.k&&(u[e.k]=l))};if(l){const v=()=>{E(),ll.delete(e)};v.id=-1,ll.set(e,v),pt(v,s)}else Xc(e),E()}}}function Xc(e){const t=ll.get(e);t&&(t.flags|=8,ll.delete(e))}let Zc=!1;const Kn=()=>{Zc||(console.error("Hydration completed but contains mismatches."),Zc=!0)},tv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",sv=e=>e.namespaceURI.includes("MathML"),Fi=e=>{if(e.nodeType===1){if(tv(e))return"svg";if(sv(e))return"mathml"}},ta=e=>e.nodeType===8;function nv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,u=(b,x)=>{if(!x.hasChildNodes()){s(null,b,x),il(),x._vnode=b;return}d(x.firstChild,b,null,null,null),il(),x._vnode=b},d=(b,x,R,S,D,w=!1)=>{w=w||!!x.dynamicChildren;const I=ta(b)&&b.data==="[",L=()=>g(b,x,R,S,D,I),{type:H,ref:F,shapeFlag:P,patchFlag:W}=x;let B=b.nodeType;x.el=b,W===-2&&(w=!1,x.dynamicChildren=null);let j=null;switch(H){case fn:B!==3?x.children===""?(o(x.el=a(""),l(b),b),j=b):j=L():(b.data!==x.children&&(Kn(),b.data=x.children),j=i(b));break;case dt:v(b)?(j=i(b),E(x.el=b.content.firstChild,b,R)):B!==8||I?j=L():j=i(b);break;case An:if(I&&(b=i(b),B=b.nodeType),B===1||B===3){j=b;const N=!x.children.length;for(let O=0;O<x.staticCount;O++)N&&(x.children+=j.nodeType===1?j.outerHTML:j.data),O===x.staticCount-1&&(x.anchor=j),j=i(j);return I?i(j):j}else L();break;case wt:I?j=m(b,x,R,S,D,w):j=L();break;default:if(P&1)(B!==1||x.type.toLowerCase()!==b.tagName.toLowerCase())&&!v(b)?j=L():j=f(b,x,R,S,D,w);else if(P&6){x.slotScopeIds=D;const N=l(b);if(I?j=k(b):ta(b)&&b.data==="teleport start"?j=k(b,b.data,"teleport end"):j=i(b),t(x,N,null,R,S,Fi(N),w),Ks(x)&&!x.type.__asyncResolved){let O;I?(O=at(wt),O.anchor=j?j.previousSibling:N.lastChild):O=b.nodeType===3?qo(""):at("div"),O.el=b,x.component.subTree=O}}else P&64?B!==8?j=L():j=x.type.hydrate(b,x,R,S,D,w,e,p):P&128&&(j=x.type.hydrate(b,x,R,S,Fi(l(b)),D,w,e,d))}return F!=null&&ra(F,null,S,x),j},f=(b,x,R,S,D,w)=>{w=w||!!x.dynamicChildren;const{type:I,props:L,patchFlag:H,shapeFlag:F,dirs:P,transition:W}=x,B=I==="input"||I==="option";if(B||H!==-1){P&&Ts(x,null,R,"created");let j=!1;if(v(b)){j=tp(null,W)&&R&&R.vnode.props&&R.vnode.props.appear;const O=b.content.firstChild;if(j){const z=O.getAttribute("class");z&&(O.$cls=z),W.beforeEnter(O)}E(O,b,R),x.el=b=O}if(F&16&&!(L&&(L.innerHTML||L.textContent))){let O=p(b.firstChild,x,b,R,S,D,w);for(O&&!$i(b,1)&&Kn();O;){const z=O;O=O.nextSibling,r(z)}}else if(F&8){let O=x.children;O[0]===`
`&&(b.tagName==="PRE"||b.tagName==="TEXTAREA")&&(O=O.slice(1));const{textContent:z}=b;z!==O&&z!==O.replace(/\r\n|\r/g,`
`)&&($i(b,0)||Kn(),b.textContent=x.children)}if(L){if(B||!w||H&48){const O=b.tagName.includes("-");for(const z in L)(B&&(z.endsWith("value")||z==="indeterminate")||Mn(z)&&!qs(z)||z[0]==="."||O&&!qs(z))&&n(b,z,null,L[z],void 0,R)}else if(L.onClick)n(b,"onClick",null,L.onClick,void 0,R);else if(H&4&&zs(L.style))for(const O in L.style)L.style[O]}let N;(N=L&&L.onVnodeBeforeMount)&&Wt(N,R,x),P&&Ts(x,null,R,"beforeMount"),((N=L&&L.onVnodeMounted)||P||j)&&ip(()=>{N&&Wt(N,R,x),j&&W.enter(b),P&&Ts(x,null,R,"mounted")},S)}return b.nextSibling},p=(b,x,R,S,D,w,I)=>{I=I||!!x.dynamicChildren;const L=x.children,H=L.length;let F=!1;for(let P=0;P<H;P++){const W=I?L[P]:L[P]=Yt(L[P]),B=W.type===fn;b?(B&&!I&&P+1<H&&Yt(L[P+1]).type===fn&&(o(a(b.data.slice(W.children.length)),R,i(b)),b.data=W.children),b=d(b,W,S,D,w,I)):B&&!W.children?o(W.el=a(""),R):(F||(F=!0,$i(R,1)||Kn()),s(null,W,R,null,S,D,Fi(R),w))}return b},m=(b,x,R,S,D,w)=>{const{slotScopeIds:I}=x;I&&(D=D?D.concat(I):I);const L=l(b),H=p(i(b),x,L,R,S,D,w);return H&&ta(H)&&H.data==="]"?i(x.anchor=H):(Kn(),o(x.anchor=c("]"),L,H),H)},g=(b,x,R,S,D,w)=>{if($i(b.parentElement,1)||Kn(),x.el=null,w){const H=k(b);for(;;){const F=i(b);if(F&&F!==H)r(F);else break}}const I=i(b),L=l(b);return r(b),s(null,x,L,I,R,S,Fi(L),D),R&&(R.vnode.el=x.el,Gl(R,x.el)),I},k=(b,x="[",R="]")=>{let S=0;for(;b;)if(b=i(b),b&&ta(b)&&(b.data===x&&S++,b.data===R)){if(S===0)return i(b);S--}return b},E=(b,x,R)=>{const S=x.parentNode;S&&S.replaceChild(b,x);let D=R;for(;D;)D.vnode.el===x&&(D.vnode.el=D.subTree.el=b),D=D.parent},v=b=>b.nodeType===1&&b.tagName==="TEMPLATE";return[u,d]}const eu="data-allow-mismatch",av={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function $i(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(eu);)e=e.parentElement;const s=e&&e.getAttribute(eu);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(av[t])}}const iv=Pl().requestIdleCallback||(e=>setTimeout(e,1)),lv=Pl().cancelIdleCallback||(e=>clearTimeout(e)),rv=(e=1e4)=>t=>{const s=iv(t,{timeout:e});return()=>lv(s)};function ov(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const cv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(ov(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},uv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},dv=(e=[])=>(t,s)=>{Te(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function fv(e,t){if(ta(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(ta(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Ks=e=>!!e.type.__asyncLoader;function pv(e){ke(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,u,d=0;const f=()=>(d++,c=null,p()),p=()=>{let m;return c||(m=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((k,E)=>{o(g,()=>k(f()),()=>E(g),d+1)});throw g}).then(g=>m!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),u=g,g)))};return _i({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(m,g,k){let E=!1;(g.bu||(g.bu=[])).push(()=>E=!0);const v=()=>{E||k()},b=i?()=>{const x=i(v,R=>fv(m,R));x&&(g.bum||(g.bum=[])).push(x)}:v;u?b():p().then(()=>!g.isUnmounted&&b())},get __asyncResolved(){return u},setup(){const m=At;if(Lo(m),u)return()=>Bi(u,m);const g=R=>{c=null,Bn(R,m,13,!n)};if(r&&m.suspense||On)return p().then(R=>()=>Bi(R,m)).catch(R=>(g(R),()=>n?at(n,{error:R}):null));const k=h(!1),E=h(),v=h(!!a);let b,x;return ft(()=>{b!=null&&clearTimeout(b),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{m.isUnmounted||(v.value=!1)},a)),l!=null&&(b=setTimeout(()=>{if(!m.isUnmounted&&!k.value&&!E.value){const R=new Error(`Async component timed out after ${l}ms.`);g(R),E.value=R}},l)),p().then(()=>{m.isUnmounted||(k.value=!0,m.parent&&ki(m.parent.vnode)&&m.parent.update())}).catch(R=>{if(m.isUnmounted){c=null;return}g(R),E.value=R}),()=>{if(k.value&&u)return Bi(u,m);if(E.value&&n)return at(n,{error:E.value});if(s&&!v.value)return Bi(s,m)}}})}function Bi(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=at(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ki=e=>e.type.__isKeepAlive,hv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=qt(),n=s.ctx;if(!n.renderer)return()=>{const v=t.default&&t.default();return v&&v.length===1?v[0]:v};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:u,o:{createElement:d}}}=n,f=d("div");n.activate=(v,b,x,R,S)=>{const D=v.component;c(v,b,x,0,r),o(D.vnode,v,b,x,D,r,R,v.slotScopeIds,S),pt(()=>{D.isDeactivated=!1,D.a&&ia(D.a);const w=v.props&&v.props.onVnodeMounted;w&&Wt(w,D.parent,v)},r)},n.deactivate=v=>{const b=v.component;ol(b.m),ol(b.a),c(v,f,null,1,r),pt(()=>{b.da&&ia(b.da);const x=v.props&&v.props.onVnodeUnmounted;x&&Wt(x,b.parent,v),b.isDeactivated=!0},r)};function p(v){mr(v),u(v,s,r,!0)}function m(v){a.forEach((b,x)=>{const R=Zr(Ks(b)?b.type.__asyncResolved||{}:b.type);R&&!v(R)&&g(x)})}function g(v){const b=a.get(v);b&&(!l||!gs(b,l))?p(b):l&&mr(l),a.delete(v),i.delete(v)}ds(()=>[e.include,e.exclude],([v,b])=>{v&&m(x=>Ua(v,x)),b&&m(x=>!Ua(b,x))},{flush:"post",deep:!0});let k=null;const E=()=>{k!=null&&(cl(s.subTree.type)?pt(()=>{a.set(k,Ui(s.subTree))},s.subTree.suspense):a.set(k,Ui(s.subTree)))};return $e(E),ql(E),zl(()=>{a.forEach(v=>{const{subTree:b,suspense:x}=s,R=Ui(b);if(v.type===R.type&&v.key===R.key){mr(R);const S=R.component.da;S&&pt(S,x);return}p(v)})}),()=>{if(k=null,!t.default)return l=null;const v=t.default(),b=v[0];if(v.length>1)return l=null,v;if(!Xs(b)||!(b.shapeFlag&4)&&!(b.shapeFlag&128))return l=null,b;let x=Ui(b);if(x.type===dt)return l=null,x;const R=x.type,S=Zr(Ks(x)?x.type.__asyncResolved||{}:R),{include:D,exclude:w,max:I}=e;if(D&&(!S||!Ua(D,S))||w&&S&&Ua(w,S))return x.shapeFlag&=-257,l=x,b;const L=x.key==null?R:x.key,H=a.get(L);return x.el&&(x=Rs(x),b.shapeFlag&128&&(b.ssContent=x)),k=L,H?(x.el=H.el,x.component=H.component,x.transition&&Qs(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),I&&i.size>parseInt(I,10)&&g(i.values().next().value)),x.shapeFlag|=256,l=x,cl(b.type)?b:x}}},gv=hv;function Ua(e,t){return fe(e)?e.some(s=>Ua(s,t)):Te(e)?e.split(",").includes(t):Tg(e)?(e.lastIndex=0,e.test(t)):!1}function Rf(e,t){Nf(e,"a",t)}function If(e,t){Nf(e,"da",t)}function Nf(e,t,s=At){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Vl(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ki(a.parent.vnode)&&mv(n,t,s,a),a=a.parent}}function mv(e,t,s,n){const a=Vl(t,e,n,!0);ft(()=>{_o(n[t],a)},s)}function mr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Ui(e){return e.shapeFlag&128?e.ssContent:e}function Vl(e,t,s=At,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Js();const r=Sa(s),o=ss(t,s,e,l);return r(),Ys(),o});return n?a.unshift(i):a.push(i),i}}const Zs=e=>(t,s=At)=>{(!On||e==="sp")&&Vl(e,(...n)=>t(...n),s)},Df=Zs("bm"),$e=Zs("m"),Po=Zs("bu"),ql=Zs("u"),zl=Zs("bum"),ft=Zs("um"),Of=Zs("sp"),Lf=Zs("rtg"),Pf=Zs("rtc");function Mf(e,t=At){Vl("ec",e,t)}const Mo="components",vv="directives";function bv(e,t){return Fo(Mo,e,!0,t)||e}const Ff=Symbol.for("v-ndc");function yv(e){return Te(e)?Fo(Mo,e,!1)||e:e||Ff}function xv(e){return Fo(vv,e)}function Fo(e,t,s=!0,n=!1){const a=Rt||At;if(a){const i=a.type;if(e===Mo){const r=Zr(i,!1);if(r&&(r===t||r===Ke(t)||r===$n(Ke(t))))return i}const l=tu(a[e]||i[e],t)||tu(a.appContext[e],t);return!l&&n?i:l}}function tu(e,t){return e&&(e[t]||e[Ke(t)]||e[$n(Ke(t))])}function _v(e,t,s,n){let a;const i=s&&s[n],l=fe(e);if(l||Te(e)){const r=l&&zs(e);let o=!1,c=!1;r&&(o=!Zt(e),c=As(e),e=$l(e)),a=new Array(e.length);for(let u=0,d=e.length;u<d;u++)a[u]=t(o?c?da(bs(e[u])):bs(e[u]):e[u],u,void 0,i&&i[u])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Ue(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const u=r[o];a[o]=t(e[u],u,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function kv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(fe(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function wv(e,t,s={},n,a){if(Rt.ce||Rt.parent&&Ks(Rt.parent)&&Rt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),ri(),ul(wt,null,[at("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),ri();const l=i&&$o(i(s)),r=s.key||l&&l.key,o=ul(wt,{key:(r&&!$t(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function $o(e){return e.some(t=>Xs(t)?!(t.type===dt||t.type===wt&&!$o(t.children)):!0)?e:null}function Sv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:aa(n)]=e[n];return s}const zr=e=>e?pp(e)?wi(e):zr(e.parent):null,Ga=Oe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>zr(e.parent),$root:e=>zr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Bo(e),$forceUpdate:e=>e.f||(e.f=()=>{Io(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Gm.bind(e)}),vr=(e,t)=>e!==Pe&&!e.__isScriptSetup&&He(e,t),Kr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(vr(n,t))return l[t]=1,n[t];if(a!==Pe&&He(a,t))return l[t]=2,a[t];if(He(i,t))return l[t]=3,i[t];if(s!==Pe&&He(s,t))return l[t]=4,s[t];Gr&&(l[t]=0)}}const c=Ga[t];let u,d;if(c)return t==="$attrs"&&Pt(e.attrs,"get",""),c(e);if((u=r.__cssModules)&&(u=u[t]))return u;if(s!==Pe&&He(s,t))return l[t]=4,s[t];if(d=o.config.globalProperties,He(d,t))return d[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return vr(a,t)?(a[t]=s,!0):n!==Pe&&He(n,t)?(n[t]=s,!0):He(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Pe&&r[0]!=="$"&&He(e,r)||vr(t,r)||He(i,r)||He(n,r)||He(Ga,r)||He(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:He(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Tv=Oe({},Kr,{get(e,t){if(t!==Symbol.unscopables)return Kr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Dg(t)}});function Cv(){return null}function Ev(){return null}function Av(e){}function Rv(e){}function Iv(){return null}function Nv(){}function Dv(e,t){return null}function Ov(){return $f().slots}function Lv(){return $f().attrs}function $f(e){const t=qt();return t.setupContext||(t.setupContext=vp(t))}function ii(e){return fe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Pv(e,t){const s=ii(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?fe(a)||ke(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Mv(e,t){return!e||!t?e||t:fe(e)&&fe(t)?e.concat(t):Oe({},ii(e),ii(t))}function Fv(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function $v(e){const t=qt(),s=On;let n=e();ci(),s&&ca(!1);const a=()=>{Sa(t),s&&ca(!0)},i=()=>{qt()!==t&&t.scope.off(),ci(),s&&ca(!1)};return ko(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Gr=!0;function Bv(e){const t=Bo(e),s=e.proxy,n=e.ctx;Gr=!1,t.beforeCreate&&su(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:u,beforeMount:d,mounted:f,beforeUpdate:p,updated:m,activated:g,deactivated:k,beforeDestroy:E,beforeUnmount:v,destroyed:b,unmounted:x,render:R,renderTracked:S,renderTriggered:D,errorCaptured:w,serverPrefetch:I,expose:L,inheritAttrs:H,components:F,directives:P,filters:W}=t;if(c&&Uv(c,n,null),l)for(const N in l){const O=l[N];ke(O)&&(n[N]=O.bind(s))}if(a){const N=a.call(s,s);Ue(N)&&(e.data=gn(N))}if(Gr=!0,i)for(const N in i){const O=i[N],z=ke(O)?O.bind(s,s):ke(O.get)?O.get.bind(s,s):It,ue=!ke(O)&&ke(O.set)?O.set.bind(s):It,ve=ee({get:z,set:ue});Object.defineProperty(n,N,{enumerable:!0,configurable:!0,get:()=>ve.value,set:se=>ve.value=se})}if(r)for(const N in r)Bf(r[N],n,s,N);if(o){const N=ke(o)?o.call(s):o;Reflect.ownKeys(N).forEach(O=>{Ka(O,N[O])})}u&&su(u,e,"c");function j(N,O){fe(O)?O.forEach(z=>N(z.bind(s))):O&&N(O.bind(s))}if(j(Df,d),j($e,f),j(Po,p),j(ql,m),j(Rf,g),j(If,k),j(Mf,w),j(Pf,S),j(Lf,D),j(zl,v),j(ft,x),j(Of,I),fe(L))if(L.length){const N=e.exposed||(e.exposed={});L.forEach(O=>{Object.defineProperty(N,O,{get:()=>s[O],set:z=>s[O]=z,enumerable:!0})})}else e.exposed||(e.exposed={});R&&e.render===It&&(e.render=R),H!=null&&(e.inheritAttrs=H),F&&(e.components=F),P&&(e.directives=P),I&&Lo(e)}function Uv(e,t,s=It){fe(e)&&(e=Wr(e));for(const n in e){const a=e[n];let i;Ue(a)?"default"in a?i=us(a.from||n,a.default,!0):i=us(a.from||n):i=us(a),gt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function su(e,t,s){ss(fe(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Bf(e,t,s,n){let a=n.includes(".")?kf(s,n):()=>s[n];if(Te(e)){const i=t[e];ke(i)&&ds(a,i)}else if(ke(e))ds(a,e.bind(s));else if(Ue(e))if(fe(e))e.forEach(i=>Bf(i,t,s,n));else{const i=ke(e.handler)?e.handler.bind(s):t[e.handler];ke(i)&&ds(a,i,e)}}function Bo(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>rl(o,c,l,!0)),rl(o,t,l)),Ue(t)&&i.set(t,o),o}function rl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&rl(e,i,s,!0),a&&a.forEach(l=>rl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=Hv[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const Hv={data:nu,props:au,emits:au,methods:Ha,computed:Ha,beforeCreate:Bt,created:Bt,beforeMount:Bt,mounted:Bt,beforeUpdate:Bt,updated:Bt,beforeDestroy:Bt,beforeUnmount:Bt,destroyed:Bt,unmounted:Bt,activated:Bt,deactivated:Bt,errorCaptured:Bt,serverPrefetch:Bt,components:Ha,directives:Ha,watch:Vv,provide:nu,inject:jv};function nu(e,t){return t?e?function(){return Oe(ke(e)?e.call(this,this):e,ke(t)?t.call(this,this):t)}:t:e}function jv(e,t){return Ha(Wr(e),Wr(t))}function Wr(e){if(fe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Bt(e,t){return e?[...new Set([].concat(e,t))]:t}function Ha(e,t){return e?Oe(Object.create(null),e,t):t}function au(e,t){return e?fe(e)&&fe(t)?[...new Set([...e,...t])]:Oe(Object.create(null),ii(e),ii(t??{})):t}function Vv(e,t){if(!e)return t;if(!t)return e;const s=Oe(Object.create(null),e);for(const n in t)s[n]=Bt(e[n],t[n]);return s}function Uf(){return{app:null,config:{isNativeTag:ea,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let qv=0;function zv(e,t){return function(n,a=null){ke(n)||(n=Oe({},n)),a!=null&&!Ue(a)&&(a=null);const i=Uf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:qv++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:yp,get config(){return i.config},set config(u){},use(u,...d){return l.has(u)||(u&&ke(u.install)?(l.add(u),u.install(c,...d)):ke(u)&&(l.add(u),u(c,...d))),c},mixin(u){return i.mixins.includes(u)||i.mixins.push(u),c},component(u,d){return d?(i.components[u]=d,c):i.components[u]},directive(u,d){return d?(i.directives[u]=d,c):i.directives[u]},mount(u,d,f){if(!o){const p=c._ceVNode||at(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),d&&t?t(p,u):e(p,u,f),o=!0,c._container=u,u.__vue_app__=c,wi(p.component)}},onUnmount(u){r.push(u)},unmount(){o&&(ss(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(u,d){return i.provides[u]=d,c},runWithContext(u){const d=En;En=c;try{return u()}finally{En=d}}};return c}}let En=null;function Kv(e,t,s=Pe){const n=qt(),a=Ke(t),i=Qt(t),l=Hf(e,a),r=df((o,c)=>{let u,d=Pe,f;return _f(()=>{const p=e[a];kt(u,p)&&(u=p,c())}),{get(){return o(),s.get?s.get(u):u},set(p){const m=s.set?s.set(p):p;if(!kt(m,u)&&!(d!==Pe&&kt(p,d)))return;const g=n.vnode.props,k=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));k||(u=p,c()),n.emit(`update:${t}`,m),kt(p,d)&&(kt(p,m)&&!kt(m,f)||k&&d!==Pe&&!kt(m,u))&&c(),d=p,f=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Pe:r,done:!1}:{done:!0}}}},r}const Hf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${Ke(t)}Modifiers`]||e[`${Qt(t)}Modifiers`];function Gv(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Pe;let a=s;const i=t.startsWith("update:"),l=i&&Hf(n,t.slice(7));l&&(l.trim&&(a=s.map(u=>Te(u)?u.trim():u)),l.number&&(a=s.map(Ll)));let r,o=n[r=aa(t)]||n[r=aa(Ke(t))];!o&&i&&(o=n[r=aa(Qt(t))]),o&&ss(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ss(c,e,6,a)}}const Wv=new WeakMap;function jf(e,t,s=!1){const n=s?Wv:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!ke(e)){const o=c=>{const u=jf(c,t,!0);u&&(r=!0,Oe(l,u))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Ue(e)&&n.set(e,null),null):(fe(i)?i.forEach(o=>l[o]=null):Oe(l,i),Ue(e)&&n.set(e,l),l)}function Kl(e,t){return!e||!Mn(t)?!1:(t=t.slice(2).replace(/Once$/,""),He(e,t[0].toLowerCase()+t.slice(1))||He(e,Qt(t))||He(e,t))}function Gi(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:u,props:d,data:f,setupState:p,ctx:m,inheritAttrs:g}=e,k=ai(e);let E,v;try{if(s.shapeFlag&4){const x=a||n,R=x;E=Yt(c.call(R,x,u,d,p,f,m)),v=r}else{const x=t;E=Yt(x.length>1?x(d,{attrs:r,slots:l,emit:o}):x(d,null)),v=t.props?r:Yv(r)}}catch(x){Wa.length=0,Bn(x,e,1),E=at(dt)}let b=E;if(v&&g!==!1){const x=Object.keys(v),{shapeFlag:R}=b;x.length&&R&7&&(i&&x.some(Il)&&(v=Qv(v,i)),b=Rs(b,v,!1,!0))}return s.dirs&&(b=Rs(b,null,!1,!0),b.dirs=b.dirs?b.dirs.concat(s.dirs):s.dirs),s.transition&&Qs(b,s.transition),E=b,ai(k),E}function Jv(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Xs(a)){if(a.type!==dt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Yv=e=>{let t;for(const s in e)(s==="class"||s==="style"||Mn(s))&&((t||(t={}))[s]=e[s]);return t},Qv=(e,t)=>{const s={};for(const n in e)(!Il(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Xv(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?iu(n,l,c):!!l;if(o&8){const u=t.dynamicProps;for(let d=0;d<u.length;d++){const f=u[d];if(Vf(l,n,f)&&!Kl(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?iu(n,l,c):!0:!!l;return!1}function iu(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Vf(t,e,i)&&!Kl(s,i))return!0}return!1}function Vf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Ue(n)&&Ue(a)?!Ws(n,a):n!==a}function Gl({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const qf={},zf=()=>Object.create(qf),Kf=e=>Object.getPrototypeOf(e)===qf;function Zv(e,t,s,n=!1){const a={},i=zf();e.propsDefaults=Object.create(null),Gf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Eo(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function eb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Fe(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const u=e.vnode.dynamicProps;for(let d=0;d<u.length;d++){let f=u[d];if(Kl(e.emitsOptions,f))continue;const p=t[f];if(o)if(He(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const m=Ke(f);a[m]=Jr(o,r,m,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{Gf(e,t,a,i)&&(c=!0);let u;for(const d in r)(!t||!He(t,d)&&((u=Qt(d))===d||!He(t,u)))&&(o?s&&(s[d]!==void 0||s[u]!==void 0)&&(a[d]=Jr(o,r,d,void 0,e,!0)):delete a[d]);if(i!==r)for(const d in i)(!t||!He(t,d))&&(delete i[d],c=!0)}c&&Bs(e.attrs,"set","")}function Gf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(qs(o))continue;const c=t[o];let u;a&&He(a,u=Ke(o))?!i||!i.includes(u)?s[u]=c:(r||(r={}))[u]=c:Kl(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Fe(s),c=r||Pe;for(let u=0;u<i.length;u++){const d=i[u];s[d]=Jr(a,o,d,c[d],e,!He(c,d))}}return l}function Jr(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=He(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&ke(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const u=Sa(a);n=c[s]=o.call(null,t),u()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===Qt(s))&&(n=!0))}return n}const tb=new WeakMap;function Wf(e,t,s=!1){const n=s?tb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!ke(e)){const u=d=>{o=!0;const[f,p]=Wf(d,t,!0);Oe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(u),e.extends&&u(e.extends),e.mixins&&e.mixins.forEach(u)}if(!i&&!o)return Ue(e)&&n.set(e,sa),sa;if(fe(i))for(let u=0;u<i.length;u++){const d=Ke(i[u]);lu(d)&&(l[d]=Pe)}else if(i)for(const u in i){const d=Ke(u);if(lu(d)){const f=i[u],p=l[d]=fe(f)||ke(f)?{type:f}:Oe({},f),m=p.type;let g=!1,k=!0;if(fe(m))for(let E=0;E<m.length;++E){const v=m[E],b=ke(v)&&v.name;if(b==="Boolean"){g=!0;break}else b==="String"&&(k=!1)}else g=ke(m)&&m.name==="Boolean";p[0]=g,p[1]=k,(g||He(p,"default"))&&r.push(d)}}const c=[l,r];return Ue(e)&&n.set(e,c),c}function lu(e){return e[0]!=="$"&&!qs(e)}const Uo=e=>e==="_"||e==="_ctx"||e==="$stable",Ho=e=>fe(e)?e.map(Yt):[Yt(e)],sb=(e,t,s)=>{if(t._n)return t;const n=No((...a)=>Ho(t(...a)),s);return n._c=!1,n},Jf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Uo(a))continue;const i=e[a];if(ke(i))t[a]=sb(a,i,n);else if(i!=null){const l=Ho(i);t[a]=()=>l}}},Yf=(e,t)=>{const s=Ho(t);e.slots.default=()=>s},Qf=(e,t,s)=>{for(const n in t)(s||!Uo(n))&&(e[n]=t[n])},nb=(e,t,s)=>{const n=e.slots=zf();if(e.vnode.shapeFlag&32){const a=t._;a?(Qf(n,t,s),s&&Ud(n,"_",a,!0)):Jf(t,n)}else t&&Yf(e,t)},ab=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Pe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Qf(a,t,s):(i=!t.$stable,Jf(t,a)),l=t}else t&&(Yf(e,t),l={default:1});if(i)for(const r in a)!Uo(r)&&l[r]==null&&delete a[r]},pt=ip;function Xf(e){return ep(e)}function Zf(e){return ep(e,nv)}function ep(e,t){const s=Pl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:u,parentNode:d,nextSibling:f,setScopeId:p=It,insertStaticContent:m}=e,g=(y,T,M,G=null,A=null,$=null,J=void 0,Z=null,te=!!T.dynamicChildren)=>{if(y===T)return;y&&!gs(y,T)&&(G=V(y),se(y,A,$,!0),y=null),T.patchFlag===-2&&(te=!1,T.dynamicChildren=null);const{type:Q,ref:pe,shapeFlag:ie}=T;switch(Q){case fn:k(y,T,M,G);break;case dt:E(y,T,M,G);break;case An:y==null&&v(T,M,G,J);break;case wt:F(y,T,M,G,A,$,J,Z,te);break;default:ie&1?R(y,T,M,G,A,$,J,Z,te):ie&6?P(y,T,M,G,A,$,J,Z,te):(ie&64||ie&128)&&Q.process(y,T,M,G,A,$,J,Z,te,ge)}pe!=null&&A?ra(pe,y&&y.ref,$,T||y,!T):pe==null&&y&&y.ref!=null&&ra(y.ref,null,$,y,!0)},k=(y,T,M,G)=>{if(y==null)n(T.el=r(T.children),M,G);else{const A=T.el=y.el;T.children!==y.children&&c(A,T.children)}},E=(y,T,M,G)=>{y==null?n(T.el=o(T.children||""),M,G):T.el=y.el},v=(y,T,M,G)=>{[y.el,y.anchor]=m(y.children,T,M,G,y.el,y.anchor)},b=({el:y,anchor:T},M,G)=>{let A;for(;y&&y!==T;)A=f(y),n(y,M,G),y=A;n(T,M,G)},x=({el:y,anchor:T})=>{let M;for(;y&&y!==T;)M=f(y),a(y),y=M;a(T)},R=(y,T,M,G,A,$,J,Z,te)=>{if(T.type==="svg"?J="svg":T.type==="math"&&(J="mathml"),y==null)S(T,M,G,A,$,J,Z,te);else{const Q=y.el&&y.el._isVueCE?y.el:null;try{Q&&Q._beginPatch(),I(y,T,A,$,J,Z,te)}finally{Q&&Q._endPatch()}}},S=(y,T,M,G,A,$,J,Z)=>{let te,Q;const{props:pe,shapeFlag:ie,transition:ce,dirs:ye}=y;if(te=y.el=l(y.type,$,pe&&pe.is,pe),ie&8?u(te,y.children):ie&16&&w(y.children,te,null,G,A,br(y,$),J,Z),ye&&Ts(y,null,G,"created"),D(te,y,y.scopeId,J,G),pe){for(const Ee in pe)Ee!=="value"&&!qs(Ee)&&i(te,Ee,null,pe[Ee],$,G);"value"in pe&&i(te,"value",null,pe.value,$),(Q=pe.onVnodeBeforeMount)&&Wt(Q,G,y)}ye&&Ts(y,null,G,"beforeMount");const Se=tp(A,ce);Se&&ce.beforeEnter(te),n(te,T,M),((Q=pe&&pe.onVnodeMounted)||Se||ye)&&pt(()=>{try{Q&&Wt(Q,G,y),Se&&ce.enter(te),ye&&Ts(y,null,G,"mounted")}finally{}},A)},D=(y,T,M,G,A)=>{if(M&&p(y,M),G)for(let $=0;$<G.length;$++)p(y,G[$]);if(A){let $=A.subTree;if(T===$||cl($.type)&&($.ssContent===T||$.ssFallback===T)){const J=A.vnode;D(y,J,J.scopeId,J.slotScopeIds,A.parent)}}},w=(y,T,M,G,A,$,J,Z,te=0)=>{for(let Q=te;Q<y.length;Q++){const pe=y[Q]=Z?Fs(y[Q]):Yt(y[Q]);g(null,pe,T,M,G,A,$,J,Z)}},I=(y,T,M,G,A,$,J)=>{const Z=T.el=y.el;let{patchFlag:te,dynamicChildren:Q,dirs:pe}=T;te|=y.patchFlag&16;const ie=y.props||Pe,ce=T.props||Pe;let ye;if(M&&bn(M,!1),(ye=ce.onVnodeBeforeUpdate)&&Wt(ye,M,T,y),pe&&Ts(T,y,M,"beforeUpdate"),M&&bn(M,!0),(ie.innerHTML&&ce.innerHTML==null||ie.textContent&&ce.textContent==null)&&u(Z,""),Q?L(y.dynamicChildren,Q,Z,M,G,br(T,A),$):J||O(y,T,Z,null,M,G,br(T,A),$,!1),te>0){if(te&16)H(Z,ie,ce,M,A);else if(te&2&&ie.class!==ce.class&&i(Z,"class",null,ce.class,A),te&4&&i(Z,"style",ie.style,ce.style,A),te&8){const Se=T.dynamicProps;for(let Ee=0;Ee<Se.length;Ee++){const C=Se[Ee],X=ie[C],be=ce[C];(be!==X||C==="value")&&i(Z,C,X,be,A,M)}}te&1&&y.children!==T.children&&u(Z,T.children)}else!J&&Q==null&&H(Z,ie,ce,M,A);((ye=ce.onVnodeUpdated)||pe)&&pt(()=>{ye&&Wt(ye,M,T,y),pe&&Ts(T,y,M,"updated")},G)},L=(y,T,M,G,A,$,J)=>{for(let Z=0;Z<T.length;Z++){const te=y[Z],Q=T[Z],pe=te.el&&(te.type===wt||!gs(te,Q)||te.shapeFlag&198)?d(te.el):M;g(te,Q,pe,null,G,A,$,J,!0)}},H=(y,T,M,G,A)=>{if(T!==M){if(T!==Pe)for(const $ in T)!qs($)&&!($ in M)&&i(y,$,T[$],null,A,G);for(const $ in M){if(qs($))continue;const J=M[$],Z=T[$];J!==Z&&$!=="value"&&i(y,$,Z,J,A,G)}"value"in M&&i(y,"value",T.value,M.value,A)}},F=(y,T,M,G,A,$,J,Z,te)=>{const Q=T.el=y?y.el:r(""),pe=T.anchor=y?y.anchor:r("");let{patchFlag:ie,dynamicChildren:ce,slotScopeIds:ye}=T;ye&&(Z=Z?Z.concat(ye):ye),y==null?(n(Q,M,G),n(pe,M,G),w(T.children||[],M,pe,A,$,J,Z,te)):ie>0&&ie&64&&ce&&y.dynamicChildren&&y.dynamicChildren.length===ce.length?(L(y.dynamicChildren,ce,M,A,$,J,Z),(T.key!=null||A&&T===A.subTree)&&jo(y,T,!0)):O(y,T,M,pe,A,$,J,Z,te)},P=(y,T,M,G,A,$,J,Z,te)=>{T.slotScopeIds=Z,y==null?T.shapeFlag&512?A.ctx.activate(T,M,G,J,te):W(T,M,G,A,$,J,te):B(y,T,te)},W=(y,T,M,G,A,$,J)=>{const Z=y.component=fp(y,G,A);if(ki(y)&&(Z.ctx.renderer=ge),hp(Z,!1,J),Z.asyncDep){if(A&&A.registerDep(Z,j,J),!y.el){const te=Z.subTree=at(dt);E(null,te,T,M),y.placeholder=te.el}}else j(Z,y,T,M,A,$,J)},B=(y,T,M)=>{const G=T.component=y.component;if(Xv(y,T,M))if(G.asyncDep&&!G.asyncResolved){N(G,T,M);return}else G.next=T,G.update();else T.el=y.el,G.vnode=T},j=(y,T,M,G,A,$,J)=>{const Z=()=>{if(y.isMounted){let{next:ie,bu:ce,u:ye,parent:Se,vnode:Ee}=y;{const Je=sp(y);if(Je){ie&&(ie.el=Ee.el,N(y,ie,J)),Je.asyncDep.then(()=>{pt(()=>{y.isUnmounted||Q()},A)});return}}let C=ie,X;bn(y,!1),ie?(ie.el=Ee.el,N(y,ie,J)):ie=Ee,ce&&ia(ce),(X=ie.props&&ie.props.onVnodeBeforeUpdate)&&Wt(X,Se,ie,Ee),bn(y,!0);const be=Gi(y),Le=y.subTree;y.subTree=be,g(Le,be,d(Le.el),V(Le),y,A,$),ie.el=be.el,C===null&&Gl(y,be.el),ye&&pt(ye,A),(X=ie.props&&ie.props.onVnodeUpdated)&&pt(()=>Wt(X,Se,ie,Ee),A)}else{let ie;const{el:ce,props:ye}=T,{bm:Se,m:Ee,parent:C,root:X,type:be}=y,Le=Ks(T);if(bn(y,!1),Se&&ia(Se),!Le&&(ie=ye&&ye.onVnodeBeforeMount)&&Wt(ie,C,T),bn(y,!0),ce&&De){const Je=()=>{y.subTree=Gi(y),De(ce,y.subTree,y,A,null)};Le&&be.__asyncHydrate?be.__asyncHydrate(ce,y,Je):Je()}else{X.ce&&X.ce._hasShadowRoot()&&X.ce._injectChildStyle(be,y.parent?y.parent.type:void 0);const Je=y.subTree=Gi(y);g(null,Je,M,G,y,A,$),T.el=Je.el}if(Ee&&pt(Ee,A),!Le&&(ie=ye&&ye.onVnodeMounted)){const Je=T;pt(()=>Wt(ie,C,Je),A)}(T.shapeFlag&256||C&&Ks(C.vnode)&&C.vnode.shapeFlag&256)&&y.a&&pt(y.a,A),y.isMounted=!0,T=M=G=null}};y.scope.on();const te=y.effect=new Za(Z);y.scope.off();const Q=y.update=te.run.bind(te),pe=y.job=te.runIfDirty.bind(te);pe.i=y,pe.id=y.uid,te.scheduler=()=>Io(pe),bn(y,!0),Q()},N=(y,T,M)=>{T.component=y;const G=y.vnode.props;y.vnode=T,y.next=null,eb(y,T.props,G,M),ab(y,T.children,M),Js(),Gc(y),Ys()},O=(y,T,M,G,A,$,J,Z,te=!1)=>{const Q=y&&y.children,pe=y?y.shapeFlag:0,ie=T.children,{patchFlag:ce,shapeFlag:ye}=T;if(ce>0){if(ce&128){ue(Q,ie,M,G,A,$,J,Z,te);return}else if(ce&256){z(Q,ie,M,G,A,$,J,Z,te);return}}ye&8?(pe&16&&Ie(Q,A,$),ie!==Q&&u(M,ie)):pe&16?ye&16?ue(Q,ie,M,G,A,$,J,Z,te):Ie(Q,A,$,!0):(pe&8&&u(M,""),ye&16&&w(ie,M,G,A,$,J,Z,te))},z=(y,T,M,G,A,$,J,Z,te)=>{y=y||sa,T=T||sa;const Q=y.length,pe=T.length,ie=Math.min(Q,pe);let ce;for(ce=0;ce<ie;ce++){const ye=T[ce]=te?Fs(T[ce]):Yt(T[ce]);g(y[ce],ye,M,null,A,$,J,Z,te)}Q>pe?Ie(y,A,$,!0,!1,ie):w(T,M,G,A,$,J,Z,te,ie)},ue=(y,T,M,G,A,$,J,Z,te)=>{let Q=0;const pe=T.length;let ie=y.length-1,ce=pe-1;for(;Q<=ie&&Q<=ce;){const ye=y[Q],Se=T[Q]=te?Fs(T[Q]):Yt(T[Q]);if(gs(ye,Se))g(ye,Se,M,null,A,$,J,Z,te);else break;Q++}for(;Q<=ie&&Q<=ce;){const ye=y[ie],Se=T[ce]=te?Fs(T[ce]):Yt(T[ce]);if(gs(ye,Se))g(ye,Se,M,null,A,$,J,Z,te);else break;ie--,ce--}if(Q>ie){if(Q<=ce){const ye=ce+1,Se=ye<pe?T[ye].el:G;for(;Q<=ce;)g(null,T[Q]=te?Fs(T[Q]):Yt(T[Q]),M,Se,A,$,J,Z,te),Q++}}else if(Q>ce)for(;Q<=ie;)se(y[Q],A,$,!0),Q++;else{const ye=Q,Se=Q,Ee=new Map;for(Q=Se;Q<=ce;Q++){const st=T[Q]=te?Fs(T[Q]):Yt(T[Q]);st.key!=null&&Ee.set(st.key,Q)}let C,X=0;const be=ce-Se+1;let Le=!1,Je=0;const Ge=new Array(be);for(Q=0;Q<be;Q++)Ge[Q]=0;for(Q=ye;Q<=ie;Q++){const st=y[Q];if(X>=be){se(st,A,$,!0);continue}let Ye;if(st.key!=null)Ye=Ee.get(st.key);else for(C=Se;C<=ce;C++)if(Ge[C-Se]===0&&gs(st,T[C])){Ye=C;break}Ye===void 0?se(st,A,$,!0):(Ge[Ye-Se]=Q+1,Ye>=Je?Je=Ye:Le=!0,g(st,T[Ye],M,null,A,$,J,Z,te),X++)}const St=Le?ib(Ge):sa;for(C=St.length-1,Q=be-1;Q>=0;Q--){const st=Se+Q,Ye=T[st],en=T[st+1],mn=st+1<pe?en.el||np(en):G;Ge[Q]===0?g(null,Ye,M,mn,A,$,J,Z,te):Le&&(C<0||Q!==St[C]?ve(Ye,M,mn,2):C--)}}},ve=(y,T,M,G,A=null)=>{const{el:$,type:J,transition:Z,children:te,shapeFlag:Q}=y;if(Q&6){ve(y.component.subTree,T,M,G);return}if(Q&128){y.suspense.move(T,M,G);return}if(Q&64){J.move(y,T,M,ge);return}if(J===wt){n($,T,M);for(let ie=0;ie<te.length;ie++)ve(te[ie],T,M,G);n(y.anchor,T,M);return}if(J===An){b(y,T,M);return}if(G!==2&&Q&1&&Z)if(G===0)Z.persisted&&!$[rs]?n($,T,M):(Z.beforeEnter($),n($,T,M),pt(()=>Z.enter($),A));else{const{leave:ie,delayLeave:ce,afterLeave:ye}=Z,Se=()=>{y.ctx.isUnmounted?a($):n($,T,M)},Ee=()=>{const C=$._isLeaving||!!$[rs];$._isLeaving&&$[rs](!0),Z.persisted&&!C?Se():ie($,()=>{Se(),ye&&ye()})};ce?ce($,Se,Ee):Ee()}else n($,T,M)},se=(y,T,M,G=!1,A=!1)=>{const{type:$,props:J,ref:Z,children:te,dynamicChildren:Q,shapeFlag:pe,patchFlag:ie,dirs:ce,cacheIndex:ye,memo:Se}=y;if(ie===-2&&(A=!1),Z!=null&&(Js(),ra(Z,null,M,y,!0),Ys()),ye!=null&&(T.renderCache[ye]=void 0),pe&256){T.ctx.deactivate(y);return}const Ee=pe&1&&ce,C=!Ks(y);let X;if(C&&(X=J&&J.onVnodeBeforeUnmount)&&Wt(X,T,y),pe&6)oe(y.component,M,G);else{if(pe&128){y.suspense.unmount(M,G);return}Ee&&Ts(y,null,T,"beforeUnmount"),pe&64?y.type.remove(y,T,M,ge,G):Q&&!Q.hasOnce&&($!==wt||ie>0&&ie&64)?Ie(Q,T,M,!1,!0):($===wt&&ie&384||!A&&pe&16)&&Ie(te,T,M),G&&de(y)}const be=Se!=null&&ye==null;(C&&(X=J&&J.onVnodeUnmounted)||Ee||be)&&pt(()=>{X&&Wt(X,T,y),Ee&&Ts(y,null,T,"unmounted"),be&&(y.el=null)},M)},de=y=>{const{type:T,el:M,anchor:G,transition:A}=y;if(T===wt){Y(M,G);return}if(T===An){x(y);return}const $=()=>{a(M),A&&!A.persisted&&A.afterLeave&&A.afterLeave()};if(y.shapeFlag&1&&A&&!A.persisted){const{leave:J,delayLeave:Z}=A,te=()=>J(M,$);Z?Z(y.el,$,te):te()}else $()},Y=(y,T)=>{let M;for(;y!==T;)M=f(y),a(y),y=M;a(T)},oe=(y,T,M)=>{const{bum:G,scope:A,job:$,subTree:J,um:Z,m:te,a:Q}=y;ol(te),ol(Q),G&&ia(G),A.stop(),$&&($.flags|=8,se(J,y,T,M)),Z&&pt(Z,T),pt(()=>{y.isUnmounted=!0},T)},Ie=(y,T,M,G=!1,A=!1,$=0)=>{for(let J=$;J<y.length;J++)se(y[J],T,M,G,A)},V=y=>{if(y.shapeFlag&6)return V(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const T=f(y.anchor||y.el),M=T&&T[wf];return M?f(M):T};let re=!1;const le=(y,T,M)=>{let G;y==null?T._vnode&&(se(T._vnode,null,null,!0),G=T._vnode.component):g(T._vnode||null,y,T,null,null,null,M),T._vnode=y,re||(re=!0,Gc(G),il(),re=!1)},ge={p:g,um:se,m:ve,r:de,mt:W,mc:w,pc:O,pbc:L,n:V,o:e};let me,De;return t&&([me,De]=t(ge)),{render:le,hydrate:me,createApp:zv(le,me)}}function br({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function bn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function tp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function jo(e,t,s=!1){const n=e.children,a=t.children;if(fe(n)&&fe(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=Fs(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&jo(l,r)),r.type===fn&&(r.patchFlag===-1&&(r=a[i]=Fs(r)),r.el=l.el),r.type===dt&&!r.el&&(r.el=l.el)}}function ib(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function sp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:sp(t)}function ol(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function np(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?np(t.subTree):null}const cl=e=>e.__isSuspense;let Yr=0;const lb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)ob(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}cb(e,t,s,n,a,l,r,o,c)}},hydrate:ub,normalize:db},rb=lb;function li(e,t){const s=e.props&&e.props[t];ke(s)&&s()}function ob(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:u}}=o,d=u("div"),f=e.suspense=ap(e,a,n,t,d,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,d,null,n,f,i,l),f.deps>0?(li(e,"onPending"),li(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),oa(f,e.ssFallback)):f.resolve(!1,!0)}function cb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:u}}){const d=t.suspense=e.suspense;d.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:m,pendingBranch:g,isInFallback:k,isHydrating:E}=d;if(g)d.pendingBranch=f,gs(g,f)?(o(g,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():k&&(E||(o(m,p,s,n,a,null,i,l,r),oa(d,p)))):(d.pendingId=Yr++,E?(d.isHydrating=!1,d.activeBranch=g):c(g,a,d),d.deps=0,d.effects.length=0,d.hiddenContainer=u("div"),k?(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0?d.resolve():(o(m,p,s,n,a,null,i,l,r),oa(d,p))):m&&gs(m,f)?(o(m,f,s,n,a,d,i,l,r),d.resolve(!0)):(o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0&&d.resolve()));else if(m&&gs(m,f))o(m,f,s,n,a,d,i,l,r),oa(d,f);else if(li(t,"onPending"),d.pendingBranch=f,f.shapeFlag&512?d.pendingId=f.component.suspenseId:d.pendingId=Yr++,o(null,f,d.hiddenContainer,null,a,d,i,l,r),d.deps<=0)d.resolve();else{const{timeout:v,pendingId:b}=d;v>0?setTimeout(()=>{d.pendingId===b&&d.fallback(p)},v):v===0&&d.fallback(p)}}function ap(e,t,s,n,a,i,l,r,o,c,u=!1){const{p:d,m:f,um:p,n:m,o:{parentNode:g,remove:k}}=c;let E;const v=fb(e);v&&t&&t.pendingBranch&&(E=t.pendingId,t.deps++);const b=e.props?el(e.props.timeout):void 0,x=i,R={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Yr++,timeout:typeof b=="number"?b:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!u,isHydrating:u,isUnmounted:!1,effects:[],resolve(S=!1,D=!1){const{vnode:w,activeBranch:I,pendingBranch:L,pendingId:H,effects:F,parentComponent:P,container:W,isInFallback:B}=R;let j=!1;if(R.isHydrating)R.isHydrating=!1;else if(!S){j=I&&L.transition&&L.transition.mode==="out-in";let z=!1;j&&(I.transition.afterLeave=()=>{H===R.pendingId&&(f(L,W,i===x&&!z?m(I):i,0),si(F),B&&w.ssFallback&&(w.ssFallback.el=null))}),I&&!R.isFallbackMountPending&&(g(I.el)===W&&(i=m(I),z=!0),p(I,P,R,!0),!j&&B&&w.ssFallback&&pt(()=>w.ssFallback.el=null,R)),j||f(L,W,i,0)}R.isFallbackMountPending=!1,oa(R,L),R.pendingBranch=null,R.isInFallback=!1;let N=R.parent,O=!1;for(;N;){if(N.pendingBranch){N.effects.push(...F),O=!0;break}N=N.parent}!O&&!j&&si(F),R.effects=[],v&&t&&t.pendingBranch&&E===t.pendingId&&(t.deps--,t.deps===0&&!D&&t.resolve()),li(w,"onResolve")},fallback(S){if(!R.pendingBranch)return;const{vnode:D,activeBranch:w,parentComponent:I,container:L,namespace:H}=R;li(D,"onFallback");const F=m(w),P=()=>{R.isFallbackMountPending=!1,R.isInFallback&&(d(null,S,L,F,I,null,H,r,o),oa(R,S))},W=S.transition&&S.transition.mode==="out-in";W&&(R.isFallbackMountPending=!0,w.transition.afterLeave=P),R.isInFallback=!0,p(w,I,null,!0),W||P()},move(S,D,w){R.activeBranch&&f(R.activeBranch,S,D,w),R.container=S},next(){return R.activeBranch&&m(R.activeBranch)},registerDep(S,D,w){const I=!!R.pendingBranch;I&&R.deps++;const L=S.vnode.el;S.asyncDep.catch(H=>{Bn(H,S,0)}).then(H=>{if(S.isUnmounted||R.isUnmounted||R.pendingId!==S.suspenseId)return;ci(),S.asyncResolved=!0;const{vnode:F}=S;Qr(S,H,!1),L&&(F.el=L);const P=!L&&S.subTree.el;D(S,F,g(L||S.subTree.el),L?null:m(S.subTree),R,l,w),P&&(F.placeholder=null,k(P)),Gl(S,F.el),I&&--R.deps===0&&R.resolve()})},unmount(S,D){R.isUnmounted=!0,R.activeBranch&&p(R.activeBranch,s,S,D),R.pendingBranch&&p(R.pendingBranch,s,S,D)}};return R}function ub(e,t,s,n,a,i,l,r,o){const c=t.suspense=ap(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),u=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),u}function db(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=ru(n?s.default:s),e.ssFallback=n?ru(s.fallback):at(dt)}function ru(e){let t;if(ke(e)){const s=Dn&&e._c;s&&(e._d=!1,ri()),e=e(),s&&(e._d=!0,t=Mt,lp())}return fe(e)&&(e=Jv(e)),e=Yt(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function ip(e,t){t&&t.pendingBranch?fe(e)?t.effects.push(...e):t.effects.push(e):si(e)}function oa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Gl(n,a))}function fb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const wt=Symbol.for("v-fgt"),fn=Symbol.for("v-txt"),dt=Symbol.for("v-cmt"),An=Symbol.for("v-stc"),Wa=[];let Mt=null;function ri(e=!1){Wa.push(Mt=e?null:[])}function lp(){Wa.pop(),Mt=Wa[Wa.length-1]||null}let Dn=1;function oi(e,t=!1){Dn+=e,e<0&&Mt&&t&&(Mt.hasOnce=!0)}function rp(e){return e.dynamicChildren=Dn>0?Mt||sa:null,lp(),Dn>0&&Mt&&Mt.push(e),e}function pb(e,t,s,n,a,i){return rp(Vo(e,t,s,n,a,i,!0))}function ul(e,t,s,n,a){return rp(at(e,t,s,n,a,!0))}function Xs(e){return e?e.__v_isVNode===!0:!1}function gs(e,t){return e.type===t.type&&e.key===t.key}function hb(e){}const op=({key:e})=>e??null,Wi=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Te(e)||gt(e)||ke(e)?{i:Rt,r:e,k:t,f:!!s}:e:null);function Vo(e,t=null,s=null,n=0,a=null,i=e===wt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&op(t),ref:t&&Wi(t),scopeId:Hl,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Rt};return r?(zo(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Te(s)?8:16),Dn>0&&!l&&Mt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Mt.push(o),o}const at=gb;function gb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Ff)&&(e=dt),Xs(e)){const r=Rs(e,t,!0);return s&&zo(r,s),Dn>0&&!i&&Mt&&(r.shapeFlag&6?Mt[Mt.indexOf(e)]=r:Mt.push(r)),r.patchFlag=-2,r}if(kb(e)&&(e=e.__vccOpts),t){t=cp(t);let{class:r,style:o}=t;r&&!Te(r)&&(t.class=bi(r)),Ue(o)&&(yi(o)&&!fe(o)&&(o=Oe({},o)),t.style=vi(o))}const l=Te(e)?1:cl(e)?128:Sf(e)?64:Ue(e)?4:ke(e)?2:0;return Vo(e,t,s,n,a,l,i,!0)}function cp(e){return e?yi(e)||Kf(e)?Oe({},e):e:null}function Rs(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?dp(a||{},t):a,u={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&op(c),ref:t&&t.ref?s&&i?fe(i)?i.concat(Wi(t)):[i,Wi(t)]:Wi(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==wt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Rs(e.ssContent),ssFallback:e.ssFallback&&Rs(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Qs(u,o.clone(u)),u}function qo(e=" ",t=0){return at(fn,null,e,t)}function mb(e,t){const s=at(An,null,e);return s.staticCount=t,s}function up(e="",t=!1){return t?(ri(),ul(dt,null,e)):at(dt,null,e)}function Yt(e){return e==null||typeof e=="boolean"?at(dt):fe(e)?at(wt,null,e.slice()):Xs(e)?Fs(e):at(fn,null,String(e))}function Fs(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Rs(e)}function zo(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(fe(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),zo(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Kf(t)?t._ctx=Rt:a===3&&Rt&&(Rt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else ke(t)?(t={default:t,_ctx:Rt},s=32):(t=String(t),n&64?(s=16,t=[qo(t)]):s=8);e.children=t,e.shapeFlag|=s}function dp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=bi([t.class,n.class]));else if(a==="style")t.style=vi([t.style,n.style]);else if(Mn(a)){const i=t[a],l=n[a];l&&i!==l&&!(fe(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Il(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function Wt(e,t,s,n=null){ss(e,t,7,[s,n])}const vb=Uf();let bb=0;function fp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||vb,i={uid:bb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new wo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Wf(n,a),emitsOptions:jf(n,a),emit:null,emitted:null,propsDefaults:Pe,inheritAttrs:n.inheritAttrs,ctx:Pe,data:Pe,props:Pe,attrs:Pe,slots:Pe,refs:Pe,setupState:Pe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Gv.bind(null,i),e.ce&&e.ce(i),i}let At=null;const qt=()=>At||Rt;let dl,ca;{const e=Pl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};dl=t("__VUE_INSTANCE_SETTERS__",s=>At=s),ca=t("__VUE_SSR_SETTERS__",s=>On=s)}const Sa=e=>{const t=At;return dl(e),e.scope.on(),()=>{e.scope.off(),dl(t)}},ci=()=>{At&&At.scope.off(),dl(null)};function pp(e){return e.vnode.shapeFlag&4}let On=!1;function hp(e,t=!1,s=!1){t&&ca(t);const{props:n,children:a}=e.vnode,i=pp(e);Zv(e,n,i,t),nb(e,a,s||t);const l=i?yb(e,t):void 0;return t&&ca(!1),l}function yb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Kr);const{setup:n}=s;if(n){Js();const a=e.setupContext=n.length>1?vp(e):null,i=Sa(e),l=wa(n,e,0,[e.props,a]),r=ko(l);if(Ys(),i(),(r||e.sp)&&!Ks(e)&&Lo(e),r){if(l.then(ci,ci),t)return l.then(o=>{Qr(e,o,t)}).catch(o=>{Bn(o,e,0)});e.asyncDep=l}else Qr(e,l,t)}else mp(e,t)}function Qr(e,t,s){ke(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Ue(t)&&(e.setupState=Ro(t)),mp(e,s)}let fl,Xr;function gp(e){fl=e,Xr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Tv))}}const xb=()=>!fl;function mp(e,t,s){const n=e.type;if(!e.render){if(!t&&fl&&!n.render){const a=n.template||Bo(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Oe(Oe({isCustomElement:i,delimiters:r},l),o);n.render=fl(a,c)}}e.render=n.render||It,Xr&&Xr(e)}{const a=Sa(e);Js();try{Bv(e)}finally{Ys(),a()}}}const _b={get(e,t){return Pt(e,"get",""),e[t]}};function vp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,_b),slots:e.slots,emit:e.emit,expose:t}}function wi(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Ro(cf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ga)return Ga[s](e)},has(t,s){return s in t||s in Ga}})):e.proxy}function Zr(e,t=!0){return ke(e)?e.displayName||e.name:e.name||t&&e.__name}function kb(e){return ke(e)&&"__vccOpts"in e}const ee=(e,t)=>Am(e,t,On);function Wl(e,t,s){try{oi(-1);const n=arguments.length;return n===2?Ue(t)&&!fe(t)?Xs(t)?at(e,null,[t]):at(e,t):at(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Xs(s)&&(s=[s]),at(e,t,s))}finally{oi(1)}}function wb(){}function Sb(e,t,s,n){const a=s[n];if(a&&bp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function bp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(kt(s[n],t[n]))return!1;return Dn>0&&Mt&&Mt.push(e),!0}const yp="3.5.38",Tb=It,Cb=Fm,Eb=Qn,Ab=bf,Rb={createComponentInstance:fp,setupComponent:hp,renderComponentRoot:Gi,setCurrentRenderingInstance:ai,isVNode:Xs,normalizeVNode:Yt,getComponentPublicInstance:wi,ensureValidVNode:$o,pushWarningContext:Om,popWarningContext:Lm},Ib=Rb,Nb=null,Db=null,Ob=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let eo;const ou=typeof window<"u"&&window.trustedTypes;if(ou)try{eo=ou.createPolicy("vue",{createHTML:e=>e})}catch{}const xp=eo?e=>eo.createHTML(e):e=>e,Lb="http://www.w3.org/2000/svg",Pb="http://www.w3.org/1998/Math/MathML",Ms=typeof document<"u"?document:null,cu=Ms&&Ms.createElement("template"),_p={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?Ms.createElementNS(Lb,e):t==="mathml"?Ms.createElementNS(Pb,e):s?Ms.createElement(e,{is:s}):Ms.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>Ms.createTextNode(e),createComment:e=>Ms.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Ms.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{cu.innerHTML=xp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=cu.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},sn="transition",Da="animation",pa=Symbol("_vtc"),kp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},wp=Oe({},Oo,kp),Mb=e=>(e.displayName="Transition",e.props=wp,e),Fb=Mb((e,{slots:t})=>Wl(Ef,Sp(e),t)),yn=(e,t=[])=>{fe(e)?e.forEach(s=>s(...t)):e&&e(...t)},uu=e=>e?fe(e)?e.some(t=>t.length>1):e.length>1:!1;function Sp(e){const t={};for(const F in e)F in kp||(t[F]=e[F]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:u=r,leaveFromClass:d=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,m=$b(a),g=m&&m[0],k=m&&m[1],{onBeforeEnter:E,onEnter:v,onEnterCancelled:b,onLeave:x,onLeaveCancelled:R,onBeforeAppear:S=E,onAppear:D=v,onAppearCancelled:w=b}=t,I=(F,P,W,B)=>{F._enterCancelled=B,rn(F,P?u:r),rn(F,P?c:l),W&&W()},L=(F,P)=>{F._isLeaving=!1,rn(F,d),rn(F,p),rn(F,f),P&&P()},H=F=>(P,W)=>{const B=F?D:v,j=()=>I(P,F,W);yn(B,[P,j]),du(()=>{rn(P,F?o:i),_s(P,F?u:r),uu(B)||fu(P,n,g,j)})};return Oe(t,{onBeforeEnter(F){yn(E,[F]),_s(F,i),_s(F,l)},onBeforeAppear(F){yn(S,[F]),_s(F,o),_s(F,c)},onEnter:H(!1),onAppear:H(!0),onLeave(F,P){F._isLeaving=!0;const W=()=>L(F,P);_s(F,d),F._enterCancelled?(_s(F,f),to(F)):(to(F),_s(F,f)),du(()=>{F._isLeaving&&(rn(F,d),_s(F,p),uu(x)||fu(F,n,k,W))}),yn(x,[F,W])},onEnterCancelled(F){I(F,!1,void 0,!0),yn(b,[F])},onAppearCancelled(F){I(F,!0,void 0,!0),yn(w,[F])},onLeaveCancelled(F){L(F),yn(R,[F])}})}function $b(e){if(e==null)return null;if(Ue(e))return[yr(e.enter),yr(e.leave)];{const t=yr(e);return[t,t]}}function yr(e){return el(e)}function _s(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[pa]||(e[pa]=new Set)).add(t)}function rn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[pa];s&&(s.delete(t),s.size||(e[pa]=void 0))}function du(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Bb=0;function fu(e,t,s,n){const a=e._endId=++Bb,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Tp(e,t);if(!l)return n();const c=l+"end";let u=0;const d=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++u>=o&&d()};setTimeout(()=>{u<o&&d()},r+1),e.addEventListener(c,f)}function Tp(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${sn}Delay`),i=n(`${sn}Duration`),l=pu(a,i),r=n(`${Da}Delay`),o=n(`${Da}Duration`),c=pu(r,o);let u=null,d=0,f=0;t===sn?l>0&&(u=sn,d=l,f=i.length):t===Da?c>0&&(u=Da,d=c,f=o.length):(d=Math.max(l,c),u=d>0?l>c?sn:Da:null,f=u?u===sn?i.length:o.length:0);const p=u===sn&&/\b(?:transform|all)(?:,|$)/.test(n(`${sn}Property`).toString());return{type:u,timeout:d,propCount:f,hasTransform:p}}function pu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>hu(s)+hu(e[n])))}function hu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function to(e){return(e?e.ownerDocument:document).body.offsetHeight}function Ub(e,t,s){const n=e[pa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const pl=Symbol("_vod"),Ko=Symbol("_vsh"),Cp={name:"show",beforeMount(e,{value:t},{transition:s}){e[pl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Oa(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Oa(e,!0),n.enter(e)):n.leave(e,()=>{Oa(e,!1)}):Oa(e,t))},beforeUnmount(e,{value:t}){Oa(e,t)}};function Oa(e,t){e.style.display=t?e[pl]:"none",e[Ko]=!t}function Hb(){Cp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Ep=Symbol("");function jb(e){const t=qt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>hl(i,a))},n=()=>{const a=e(t.proxy);t.ce?hl(t.ce,a):so(t.subTree,a),s(a)};Po(()=>{si(n)}),$e(()=>{ds(n,It,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function so(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{so(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)hl(e.el,t);else if(e.type===wt)e.children.forEach(s=>so(s,t));else if(e.type===An){let{el:s,anchor:n}=e;for(;s&&(hl(s,t),s!==n);)s=s.nextSibling}}function hl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Wg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Ep]=n}}const Vb=/(?:^|;)\s*display\s*:/;function qb(e,t,s){const n=e.style,a=Te(s);let i=!1;if(s&&!a){if(t)if(Te(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&ja(n,r,"")}else for(const l in t)s[l]==null&&ja(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Kb(e,l,!Te(t)&&t?t[l]:void 0,r)||ja(n,l,r):ja(n,l,"")}}else if(a){if(t!==s){const l=n[Ep];l&&(s+=";"+l),n.cssText=s,i=Vb.test(s)}}else t&&e.removeAttribute("style");pl in e&&(e[pl]=i?n.display:"",e[Ko]&&(n.display="none"))}const gu=/\s*!important$/;function ja(e,t,s){if(fe(s))s.forEach(n=>ja(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=zb(e,t);gu.test(s)?e.setProperty(Qt(n),s.replace(gu,""),"important"):e[n]=s}}const mu=["Webkit","Moz","ms"],xr={};function zb(e,t){const s=xr[t];if(s)return s;let n=Ke(t);if(n!=="filter"&&n in e)return xr[t]=n;n=$n(n);for(let a=0;a<mu.length;a++){const i=mu[a]+n;if(i in e)return xr[t]=i}return t}function Kb(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Te(n)&&s===n}const vu="http://www.w3.org/1999/xlink";function bu(e,t,s,n,a,i=Kg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(vu,t.slice(6,t.length)):e.setAttributeNS(vu,t,s):s==null||i&&!jd(s)?e.removeAttribute(t):e.setAttribute(t,i?"":$t(s)?String(s):s)}function yu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?xp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=jd(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function Hs(e,t,s,n){e.addEventListener(t,s,n)}function Gb(e,t,s,n){e.removeEventListener(t,s,n)}const xu=Symbol("_vei");function Wb(e,t,s,n,a=null){const i=e[xu]||(e[xu]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Jb(t);if(n){const c=i[t]=Xb(n,a);Hs(e,r,c,o)}else l&&(Gb(e,r,l,o),i[t]=void 0)}}const _u=/(?:Once|Passive|Capture)$/;function Jb(e){let t;if(_u.test(e)){t={};let n;for(;n=e.match(_u);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Qt(e.slice(2)),t]}let _r=0;const Yb=Promise.resolve(),Qb=()=>_r||(Yb.then(()=>_r=0),_r=Date.now());function Xb(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(fe(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ss(c,t,5,r)}}else ss(a,t,5,[n])};return s.value=e,s.attached=Qb(),s}const ku=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Ap=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Ub(e,n,l):t==="style"?qb(e,s,n):Mn(t)?Il(t)||Wb(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Zb(e,t,n,l))?(yu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&bu(e,t,n,l,i,t!=="value")):e._isVueCE&&(ey(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Te(n)))?yu(e,Ke(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),bu(e,t,n,l))};function Zb(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&ku(t)&&ke(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return ku(t)&&Te(s)?!1:t in e}function ey(e,t){const s=e._def.props;if(!s)return!1;const n=Ke(t);return Array.isArray(s)?s.some(a=>Ke(a)===n):Object.keys(s).some(a=>Ke(a)===n)}const wu={};function Rp(e,t,s){let n=_i(e,t);Nl(n)&&(n=Oe({},n,t));class a extends Jl{constructor(l){super(n,l,s)}}return a.def=n,a}const ty=((e,t)=>Rp(e,t,jp)),sy=typeof HTMLElement<"u"?HTMLElement:class{};class Jl extends sy{constructor(t,s={},n=vl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==vl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Oe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Jl){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!fe(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=el(this._props[o])),(r||(r=Object.create(null)))[Ke(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)He(this,n)||Object.defineProperty(this,n,{get:()=>Es(s[n])})}_resolveProps(t){const{props:s}=t,n=fe(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(Ke))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):wu;const a=Ke(t);s&&this._numberProps&&this._numberProps[a]&&(n=el(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===wu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Qt(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Qt(t),s+""):s||this.removeAttribute(Qt(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Hp(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=at(this._def,Oe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Nl(l[0])?Oe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),Qt(i)!==i&&a(Qt(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",u=document.createTreeWalker(o,1);o.setAttribute(c,"");let d;for(;d=u.nextNode();)d.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Ip(e){const t=qt(),s=t&&t.ce;return s||null}function ny(){const e=Ip();return e&&e.shadowRoot}function ay(e="$style"){{const t=qt();if(!t)return Pe;const s=t.type.__cssModules;if(!s)return Pe;const n=s[e];return n||Pe}}const Np=new WeakMap,Dp=new WeakMap,gl=Symbol("_moveCb"),Su=Symbol("_enterCb"),iy=e=>(delete e.props.mode,e),ly=iy({name:"TransitionGroup",props:Oe({},wp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=qt(),n=Do();let a,i;return ql(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!dy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(oy),a.forEach(cy);const r=a.filter(uy);to(s.vnode.el),r.forEach(o=>{const c=o.el,u=c.style;_s(c,l),u.transform=u.webkitTransform=u.transitionDuration="";const d=c[gl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",d),c[gl]=null,rn(c,l))};c.addEventListener("transitionend",d)}),a=[]}),()=>{const l=Fe(e),r=Sp(l);let o=l.tag||wt;if(a=[],i)for(let c=0;c<i.length;c++){const u=i[c];u.el&&u.el instanceof Element&&!u.el[Ko]&&(a.push(u),Qs(u,fa(u,r,n,s)),Np.set(u,Op(u.el)))}i=t.default?jl(t.default()):[];for(let c=0;c<i.length;c++){const u=i[c];u.key!=null&&Qs(u,fa(u,r,n,s))}return at(o,null,i)}}}),ry=ly;function oy(e){const t=e.el;t[gl]&&t[gl](),t[Su]&&t[Su]()}function cy(e){Dp.set(e,Op(e.el))}function uy(e){const t=Np.get(e),s=Dp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Op(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function dy(e,t,s){const n=e.cloneNode(),a=e[pa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Tp(n);return i.removeChild(n),l}const hn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return fe(t)?s=>ia(t,s):t};function fy(e){e.target.composing=!0}function Tu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const fs=Symbol("_assign");function Cu(e,t,s){return t&&(e=e.trim()),s&&(e=Ll(e)),e}const ml={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[fs]=hn(a);const i=n||a.props&&a.props.type==="number";Hs(e,t?"change":"input",l=>{l.target.composing||e[fs](Cu(e.value,s,i))}),(s||i)&&Hs(e,"change",()=>{e.value=Cu(e.value,s,i)}),t||(Hs(e,"compositionstart",fy),Hs(e,"compositionend",Tu),Hs(e,"change",Tu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[fs]=hn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Ll(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Go={deep:!0,created(e,t,s){e[fs]=hn(s),Hs(e,"change",()=>{const n=e._modelValue,a=ha(e),i=e.checked,l=e[fs];if(fe(n)){const r=Ml(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(Fn(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Pp(e,i))})},mounted:Eu,beforeUpdate(e,t,s){e[fs]=hn(s),Eu(e,t,s)}};function Eu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(fe(t))a=Ml(t,n.props.value)>-1;else if(Fn(t))a=t.has(n.props.value);else{if(t===s)return;a=Ws(t,Pp(e,!0))}e.checked!==a&&(e.checked=a)}const Wo={created(e,{value:t},s){e.checked=Ws(t,s.props.value),e[fs]=hn(s),Hs(e,"change",()=>{e[fs](ha(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[fs]=hn(n),t!==s&&(e.checked=Ws(t,n.props.value))}},Lp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Fn(t);Hs(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Ll(ha(l)):ha(l));e[fs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[fs]=hn(n)},mounted(e,{value:t}){Au(e,t)},beforeUpdate(e,t,s){e[fs]=hn(s)},updated(e,{value:t}){e._assigning||Au(e,t)}};function Au(e,t){const s=e.multiple,n=fe(t);if(!(s&&!n&&!Fn(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ha(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=Ml(t,r)>-1}else l.selected=t.has(r);else if(Ws(ha(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ha(e){return"_value"in e?e._value:e.value}function Pp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Mp={created(e,t,s){Hi(e,t,s,null,"created")},mounted(e,t,s){Hi(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Hi(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Hi(e,t,s,n,"updated")}};function Fp(e,t){switch(e){case"SELECT":return Lp;case"TEXTAREA":return ml;default:switch(t){case"checkbox":return Go;case"radio":return Wo;default:return ml}}}function Hi(e,t,s,n,a){const l=Fp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function py(){ml.getSSRProps=({value:e})=>({value:e}),Wo.getSSRProps=({value:e},t)=>{if(t.props&&Ws(t.props.value,e))return{checked:!0}},Go.getSSRProps=({value:e},t)=>{if(fe(e)){if(t.props&&Ml(e,t.props.value)>-1)return{checked:!0}}else if(Fn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Mp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Fp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const hy=["ctrl","shift","alt","meta"],gy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>hy.some(s=>e[`${s}Key`]&&!t.includes(s))},my=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=gy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},vy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},by=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=Qt(a.key);if(t.some(l=>l===i||vy[l]===i))return e(a)}))},$p=Oe({patchProp:Ap},_p);let Ja,Ru=!1;function Bp(){return Ja||(Ja=Xf($p))}function Up(){return Ja=Ru?Ja:Zf($p),Ru=!0,Ja}const Hp=((...e)=>{Bp().render(...e)}),yy=((...e)=>{Up().hydrate(...e)}),vl=((...e)=>{const t=Bp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=qp(n);if(!a)return;const i=t._component;!ke(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Vp(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),jp=((...e)=>{const t=Up().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=qp(n);if(a)return s(a,!0,Vp(a))},t});function Vp(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function qp(e){return Te(e)?document.querySelector(e):e}let Iu=!1;const xy=()=>{Iu||(Iu=!0,py(),Hb())},_y=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Ef,BaseTransitionPropsValidators:Oo,Comment:dt,DeprecationTypes:Ob,EffectScope:wo,ErrorCodes:Mm,ErrorTypeStrings:Cb,Fragment:wt,KeepAlive:gv,ReactiveEffect:Za,Static:An,Suspense:rb,Teleport:Qm,Text:fn,TrackOpTypes:Rm,Transition:Fb,TransitionGroup:ry,TriggerOpTypes:Im,VueElement:Jl,assertNumber:Pm,callWithAsyncErrorHandling:ss,callWithErrorHandling:wa,camelize:Ke,capitalize:$n,cloneVNode:Rs,compatUtils:Db,computed:ee,createApp:vl,createBlock:ul,createCommentVNode:up,createElementBlock:pb,createElementVNode:Vo,createHydrationRenderer:Zf,createPropsRestProxy:Fv,createRenderer:Xf,createSSRApp:jp,createSlots:kv,createStaticVNode:mb,createTextVNode:qo,createVNode:at,customRef:df,defineAsyncComponent:pv,defineComponent:_i,defineCustomElement:Rp,defineEmits:Ev,defineExpose:Av,defineModel:Nv,defineOptions:Rv,defineProps:Cv,defineSSRCustomElement:ty,defineSlots:Iv,devtools:Eb,effect:Xg,effectScope:Jg,getCurrentInstance:qt,getCurrentScope:Kd,getCurrentWatcher:Nm,getTransitionRawChildren:jl,guardReactiveProps:cp,h:Wl,handleError:Bn,hasInjectionContext:qm,hydrate:yy,hydrateOnIdle:rv,hydrateOnInteraction:dv,hydrateOnMediaQuery:uv,hydrateOnVisible:cv,initCustomFormatter:wb,initDirectivesForSSR:xy,inject:us,isMemoSame:bp,isProxy:yi,isReactive:zs,isReadonly:As,isRef:gt,isRuntimeOnly:xb,isShallow:Zt,isVNode:Xs,markRaw:cf,mergeDefaults:Pv,mergeModels:Mv,mergeProps:dp,nextTick:Et,nodeOps:_p,normalizeClass:bi,normalizeProps:Mg,normalizeStyle:vi,onActivated:Rf,onBeforeMount:Df,onBeforeUnmount:zl,onBeforeUpdate:Po,onDeactivated:If,onErrorCaptured:Mf,onMounted:$e,onRenderTracked:Pf,onRenderTriggered:Lf,onScopeDispose:Yg,onServerPrefetch:Of,onUnmounted:ft,onUpdated:ql,onWatcherCleanup:pf,openBlock:ri,patchProp:Ap,popScopeId:Hm,provide:Ka,proxyRefs:Ro,pushScopeId:Um,queuePostFlushCb:si,reactive:gn,readonly:sl,ref:h,registerRuntimeCompiler:gp,render:Hp,renderList:_v,renderSlot:wv,resolveComponent:bv,resolveDirective:xv,resolveDynamicComponent:yv,resolveFilter:Nb,resolveTransitionHooks:fa,setBlockTracking:oi,setDevtoolsHook:Ab,setTransitionHooks:Qs,shallowReactive:Eo,shallowReadonly:vm,shallowRef:Ao,ssrContextKey:yf,ssrUtils:Ib,stop:Zg,toDisplayString:qd,toHandlerKey:aa,toHandlers:Sv,toRaw:Fe,toRef:Cm,toRefs:wm,toValue:xm,transformVNodeArgs:hb,triggerRef:ym,unref:Es,useAttrs:Lv,useCssModule:ay,useCssVars:jb,useHost:Ip,useId:Zm,useModel:Kv,useSSRContext:xf,useShadowRoot:ny,useSlots:Ov,useTemplateRef:ev,useTransitionState:Do,vModelCheckbox:Go,vModelDynamic:Mp,vModelRadio:Wo,vModelSelect:Lp,vModelText:ml,vShow:Cp,version:yp,warn:Tb,watch:ds,watchEffect:zm,watchPostEffect:Km,watchSyncEffect:_f,withAsyncContext:$v,withCtx:No,withDefaults:Dv,withDirectives:Vm,withKeys:by,withMemo:Sb,withModifiers:my,withScopeId:jm},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ui=Symbol(""),Ya=Symbol(""),Jo=Symbol(""),bl=Symbol(""),zp=Symbol(""),Ln=Symbol(""),Kp=Symbol(""),Gp=Symbol(""),Yo=Symbol(""),Qo=Symbol(""),Si=Symbol(""),Xo=Symbol(""),Wp=Symbol(""),Zo=Symbol(""),ec=Symbol(""),tc=Symbol(""),sc=Symbol(""),nc=Symbol(""),ac=Symbol(""),Jp=Symbol(""),Yp=Symbol(""),Yl=Symbol(""),yl=Symbol(""),ic=Symbol(""),lc=Symbol(""),di=Symbol(""),Ti=Symbol(""),rc=Symbol(""),no=Symbol(""),ky=Symbol(""),ao=Symbol(""),xl=Symbol(""),wy=Symbol(""),Sy=Symbol(""),oc=Symbol(""),Ty=Symbol(""),Cy=Symbol(""),cc=Symbol(""),Qp=Symbol(""),ga={[ui]:"Fragment",[Ya]:"Teleport",[Jo]:"Suspense",[bl]:"KeepAlive",[zp]:"BaseTransition",[Ln]:"openBlock",[Kp]:"createBlock",[Gp]:"createElementBlock",[Yo]:"createVNode",[Qo]:"createElementVNode",[Si]:"createCommentVNode",[Xo]:"createTextVNode",[Wp]:"createStaticVNode",[Zo]:"resolveComponent",[ec]:"resolveDynamicComponent",[tc]:"resolveDirective",[sc]:"resolveFilter",[nc]:"withDirectives",[ac]:"renderList",[Jp]:"renderSlot",[Yp]:"createSlots",[Yl]:"toDisplayString",[yl]:"mergeProps",[ic]:"normalizeClass",[lc]:"normalizeStyle",[di]:"normalizeProps",[Ti]:"guardReactiveProps",[rc]:"toHandlers",[no]:"camelize",[ky]:"capitalize",[ao]:"toHandlerKey",[xl]:"setBlockTracking",[wy]:"pushScopeId",[Sy]:"popScopeId",[oc]:"withCtx",[Ty]:"unref",[Cy]:"isRef",[cc]:"withMemo",[Qp]:"isMemoSame"};function Ey(e){Object.getOwnPropertySymbols(e).forEach(t=>{ga[t]=e[t]})}const is={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ay(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:is}}function fi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,u=is){return e&&(r?(e.helper(Ln),e.helper(ba(e.inSSR,c))):e.helper(va(e.inSSR,c)),l&&e.helper(nc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:u}}function Rn(e,t=is){return{type:17,loc:t,elements:e}}function cs(e,t=is){return{type:15,loc:t,properties:e}}function ht(e,t){return{type:16,loc:is,key:Te(e)?Ae(e,!0):e,value:t}}function Ae(e,t=!1,s=is,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function vs(e,t=is){return{type:8,loc:t,children:e}}function xt(e,t=[],s=is){return{type:14,loc:s,callee:e,arguments:t}}function ma(e,t=void 0,s=!1,n=!1,a=is){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function io(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:is}}function Ry(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:is}}function Iy(e){return{type:21,body:e,loc:is}}function va(e,t){return e||t?Yo:Qo}function ba(e,t){return e||t?Kp:Gp}function uc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(va(n,e.isComponent)),t(Ln),t(ba(n,e.isComponent)))}const Nu=new Uint8Array([123,123]),Du=new Uint8Array([125,125]);function Ou(e){return e>=97&&e<=122||e>=65&&e<=90}function es(e){return e===32||e===10||e===9||e===12||e===13}function nn(e){return e===47||e===62||es(e)}function _l(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Dt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Ny{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Nu,this.delimiterClose=Du,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Nu,this.delimiterClose=Du}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?nn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Dt.TitleEnd||this.currentSequence===Dt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Dt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Dt.Cdata.length&&(this.state=28,this.currentSequence=Dt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Ou(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){nn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(nn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(_l("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Ou(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||nn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||nn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||nn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||nn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||nn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Dt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Dt.ScriptEnd[3]?this.startSpecial(Dt.ScriptEnd,4):t===Dt.StyleEnd[3]?this.startSpecial(Dt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Dt.TitleEnd[3]?this.startSpecial(Dt.TitleEnd,4):t===Dt.TextareaEnd[3]?this.startSpecial(Dt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Dt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Lu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function In(e,t){const s=Lu("MODE",t),n=Lu(e,t);return s===3?n===!0:n!==!1}function pi(e,t,s,...n){return In(e,t)}function dc(e){throw e}function Xp(e){}function tt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const Xt=e=>e.type===4&&e.isStatic;function Zp(e){switch(e){case"Teleport":case"teleport":return Ya;case"Suspense":case"suspense":return Jo;case"KeepAlive":case"keep-alive":return bl;case"BaseTransition":case"base-transition":return zp}}const Dy=/^$|^\d|[^\$\w\xA0-\uFFFF]/,fc=e=>!Dy.test(e),eh=/[A-Za-z_$\xA0-\uFFFF]/,Oy=/[\.\?\w$\xA0-\uFFFF]/,Ly=/\s+[.[]\s*|\s*[.[]\s+/g,th=e=>e.type===4?e.content:e.loc.source,Py=e=>{const t=th(e).trim().replace(Ly,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?eh:Oy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},sh=Py,My=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Fy=e=>My.test(th(e)),$y=Fy;function os(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Te(t)?a.name===t:t.test(a.name)))return a}}function Ql(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&wn(i.arg,t))return i}}function wn(e,t){return!!(e&&Xt(e)&&e.content===t)}function By(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function kr(e){return e.type===5||e.type===2}function Pu(e){return e.type===7&&e.name==="pre"}function Uy(e){return e.type===7&&e.name==="slot"}function kl(e){return e.type===1&&e.tagType===3}function wl(e){return e.type===1&&e.tagType===2}const Hy=new Set([di,Ti]);function nh(e,t=[]){if(e&&!Te(e)&&e.type===14){const s=e.callee;if(!Te(s)&&Hy.has(s))return nh(e.arguments[0],t.concat(e))}return[e,t]}function Sl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Te(a)&&a.type===14){const r=nh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Te(a))n=cs([t]);else if(a.type===14){const r=a.arguments[0];!Te(r)&&r.type===15?Mu(t,r)||r.properties.unshift(t):a.callee===rc?n=xt(s.helper(yl),[cs([t]),a]):a.arguments.unshift(cs([t])),!n&&(n=a)}else a.type===15?(Mu(t,a)||a.properties.unshift(t),n=a):(n=xt(s.helper(yl),[cs([t]),a]),l&&l.callee===Ti&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Mu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function hi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function jy(e){return e.type===14&&e.callee===cc?e.arguments[1].returns:e}const Vy=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function ah(e){for(let t=0;t<e.length;t++)if(!es(e.charCodeAt(t)))return!1;return!0}function pc(e){return e.type===2&&ah(e.content)||e.type===12&&pc(e.content)}function ih(e){return e.type===3||pc(e)}const lh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ea,isPreTag:ea,isIgnoreNewlineTag:ea,isCustomElement:ea,onError:dc,onWarn:Xp,comments:!1,prefixIdentifiers:!1};let Be=lh,gi=null,Gs="",Lt=null,Me=null,Gt="",Ps=-1,_n=-1,hc=0,un=!1,lo=null;const et=[],ot=new Ny(et,{onerr:Ds,ontext(e,t){ji(Ct(e,t),e,t)},ontextentity(e,t,s){ji(e,t,s)},oninterpolation(e,t){if(un)return ji(Ct(e,t),e,t);let s=e+ot.delimiterOpen.length,n=t-ot.delimiterClose.length;for(;es(Gs.charCodeAt(s));)s++;for(;es(Gs.charCodeAt(n-1));)n--;let a=Ct(s,n);a.includes("&")&&(a=Be.decodeEntities(a,!1)),ro({type:5,content:Yi(a,!1,ut(s,n)),loc:ut(e,t)})},onopentagname(e,t){const s=Ct(e,t);Lt={type:1,tag:s,ns:Be.getNamespace(s,et[0],Be.ns),tagType:0,props:[],children:[],loc:ut(e-1,t),codegenNode:void 0}},onopentagend(e){$u(e)},onclosetag(e,t){const s=Ct(e,t);if(!Be.isVoidTag(s)){let n=!1;for(let a=0;a<et.length;a++)if(et[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ds(24,et[0].loc.start.offset);for(let l=0;l<=a;l++){const r=et.shift();Ji(r,t,l<a)}break}n||Ds(23,rh(e,60))}},onselfclosingtag(e){const t=Lt.tag;Lt.isSelfClosing=!0,$u(e),et[0]&&et[0].tag===t&&Ji(et.shift(),e)},onattribname(e,t){Me={type:6,name:Ct(e,t),nameLoc:ut(e,t),value:void 0,loc:ut(e)}},ondirname(e,t){const s=Ct(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!un&&n===""&&Ds(26,e),un||n==="")Me={type:6,name:s,nameLoc:ut(e,t),value:void 0,loc:ut(e)};else if(Me={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ae("prop")]:[],loc:ut(e)},n==="pre"){un=ot.inVPre=!0,lo=Lt;const a=Lt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Zy(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ct(e,t);if(un&&!Pu(Me))Me.name+=s,Sn(Me.nameLoc,t);else{const n=s[0]!=="[";Me.arg=Yi(n?s:s.slice(1,-1),n,ut(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ct(e,t);if(un&&!Pu(Me))Me.name+="."+s,Sn(Me.nameLoc,t);else if(Me.name==="slot"){const n=Me.arg;n&&(n.content+="."+s,Sn(n.loc,t))}else{const n=Ae(s,!0,ut(e,t));Me.modifiers.push(n)}},onattribdata(e,t){Gt+=Ct(e,t),Ps<0&&(Ps=e),_n=t},onattribentity(e,t,s){Gt+=e,Ps<0&&(Ps=t),_n=s},onattribnameend(e){const t=Me.loc.start.offset,s=Ct(t,e);Me.type===7&&(Me.rawName=s),Lt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ds(2,t)},onattribend(e,t){if(Lt&&Me){if(Sn(Me.loc,t),e!==0)if(Gt.includes("&")&&(Gt=Be.decodeEntities(Gt,!0)),Me.type===6)Me.name==="class"&&(Gt=ch(Gt).trim()),e===1&&!Gt&&Ds(13,t),Me.value={type:2,content:Gt,loc:e===1?ut(Ps,_n):ut(Ps-1,_n+1)},ot.inSFCRoot&&Lt.tag==="template"&&Me.name==="lang"&&Gt&&Gt!=="html"&&ot.enterRCDATA(_l("</template"),0);else{let s=0;Me.exp=Yi(Gt,!1,ut(Ps,_n),0,s),Me.name==="for"&&(Me.forParseResult=zy(Me.exp));let n=-1;Me.name==="bind"&&(n=Me.modifiers.findIndex(a=>a.content==="sync"))>-1&&pi("COMPILER_V_BIND_SYNC",Be,Me.loc,Me.arg.loc.source)&&(Me.name="model",Me.modifiers.splice(n,1))}(Me.type!==7||Me.name!=="pre")&&Lt.props.push(Me)}Gt="",Ps=_n=-1},oncomment(e,t){Be.comments&&ro({type:3,content:Ct(e,t),loc:ut(e-4,t+3)})},onend(){const e=Gs.length;for(let t=0;t<et.length;t++)Ji(et[t],e-1),Ds(24,et[t].loc.start.offset)},oncdata(e,t){(et[0]?et[0].ns:Be.ns)!==0?ji(Ct(e,t),e,t):Ds(1,e-9)},onprocessinginstruction(e){(et[0]?et[0].ns:Be.ns)===0&&Ds(21,e-1)}}),Fu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,qy=/^\(|\)$/g;function zy(e){const t=e.loc,s=e.content,n=s.match(Vy);if(!n)return;const[,a,i]=n,l=(d,f,p=!1)=>{const m=t.start.offset+f,g=m+d.length;return Yi(d,!1,ut(m,g),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(qy,"").trim();const c=a.indexOf(o),u=o.match(Fu);if(u){o=o.replace(Fu,"").trim();const d=u[1].trim();let f;if(d&&(f=s.indexOf(d,c+o.length),r.key=l(d,f,!0)),u[2]){const p=u[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+d.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ct(e,t){return Gs.slice(e,t)}function $u(e){ot.inSFCRoot&&(Lt.innerLoc=ut(e+1,e+1)),ro(Lt);const{tag:t,ns:s}=Lt;s===0&&Be.isPreTag(t)&&hc++,Be.isVoidTag(t)?Ji(Lt,e):(et.unshift(Lt),(s===1||s===2)&&(ot.inXML=!0)),Lt=null}function ji(e,t,s){{const i=et[0]&&et[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Be.decodeEntities(e,!1))}const n=et[0]||gi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Sn(a.loc,s)):n.children.push({type:2,content:e,loc:ut(t,s)})}function Ji(e,t,s=!1){s?Sn(e.loc,rh(t,60)):Sn(e.loc,Ky(t,62)+1),ot.inSFCRoot&&(e.children.length?e.innerLoc.end=Oe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Oe({},e.innerLoc.start),e.innerLoc.source=Ct(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(un||(n==="slot"?e.tagType=2:Bu(e)?e.tagType=3:Wy(e)&&(e.tagType=1)),ot.inRCDATA||(e.children=oh(i)),a===0&&Be.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Be.isPreTag(n)&&hc--,lo===e&&(un=ot.inVPre=!1,lo=null),ot.inXML&&(et[0]?et[0].ns:Be.ns)===0&&(ot.inXML=!1);{const l=e.props;if(!ot.inSFCRoot&&In("COMPILER_NATIVE_TEMPLATE",Be)&&e.tag==="template"&&!Bu(e)){const o=et[0]||gi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&pi("COMPILER_INLINE_TEMPLATE",Be,r.loc)&&e.children.length&&(r.value={type:2,content:Ct(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Ky(e,t){let s=e;for(;Gs.charCodeAt(s)!==t&&s<Gs.length-1;)s++;return s}function rh(e,t){let s=e;for(;Gs.charCodeAt(s)!==t&&s>=0;)s--;return s}const Gy=new Set(["if","else","else-if","for","slot"]);function Bu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Gy.has(t[s].name))return!0}return!1}function Wy({tag:e,props:t}){if(Be.isCustomElement(e))return!1;if(e==="component"||Jy(e.charCodeAt(0))||Zp(e)||Be.isBuiltInComponent&&Be.isBuiltInComponent(e)||Be.isNativeTag&&!Be.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(pi("COMPILER_IS_ON_ELEMENT",Be,n.loc))return!0}}else if(n.name==="bind"&&wn(n.arg,"is")&&pi("COMPILER_IS_ON_ELEMENT",Be,n.loc))return!0}return!1}function Jy(e){return e>64&&e<91}const Yy=/\r\n/g;function oh(e){const t=Be.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(hc)a.content=a.content.replace(Yy,`
`);else if(ah(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Qy(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=ch(a.content))}return s?e.filter(Boolean):e}function Qy(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function ch(e){let t="",s=!1;for(let n=0;n<e.length;n++)es(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function ro(e){(et[0]||gi).children.push(e)}function ut(e,t){return{start:ot.getPos(e),end:t==null?t:ot.getPos(t),source:t==null?t:Ct(e,t)}}function Xy(e){return ut(e.start.offset,e.end.offset)}function Sn(e,t){e.end=ot.getPos(t),e.source=Ct(e.start.offset,t)}function Zy(e){const t={type:6,name:e.rawName,nameLoc:ut(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Yi(e,t=!1,s,n=0,a=0){return Ae(e,t,s,n)}function Ds(e,t,s){Be.onError(tt(e,ut(t,t)))}function ex(){ot.reset(),Lt=null,Me=null,Gt="",Ps=-1,_n=-1,et.length=0}function tx(e,t){if(ex(),Gs=e,Be=Oe({},lh),t){let a;for(a in t)t[a]!=null&&(Be[a]=t[a])}ot.mode=Be.parseMode==="html"?1:Be.parseMode==="sfc"?2:0,ot.inXML=Be.ns===1||Be.ns===2;const s=t&&t.delimiters;s&&(ot.delimiterOpen=_l(s[0]),ot.delimiterClose=_l(s[1]));const n=gi=Ay([],e);return ot.parse(Gs),n.loc=ut(0,e.length),n.children=oh(n.children),gi=null,n}function sx(e,t){Qi(e,void 0,t,!!uh(e))}function uh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!wl(t[0])?t[0]:null}function Qi(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let u=0;u<i.length;u++){const d=i[u];if(d.type===1&&d.tagType===0){const f=n?0:ts(d,s);if(f>0){if(f>=2){d.codegenNode.patchFlag=-1,l.push(d);continue}}else{const p=d.codegenNode;if(p.type===13){const m=p.patchFlag;if((m===void 0||m===512||m===1)&&fh(d,s)>=2){const g=ph(d);g&&(p.props=s.hoist(g))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(d.type===12&&(n?0:ts(d,s))>=2){d.codegenNode.type===14&&d.codegenNode.arguments.length>0&&d.codegenNode.arguments.push("-1"),l.push(d);continue}if(d.type===1){const f=d.tagType===1;f&&s.scopes.vSlot++,Qi(d,e,s,!1,a),f&&s.scopes.vSlot--}else if(d.type===11)Qi(d,e,s,d.children.length===1,!0);else if(d.type===9)for(let f=0;f<d.branches.length;f++)Qi(d.branches[f],e,s,d.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&fe(e.codegenNode.children))e.codegenNode.children=o(Rn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!fe(e.codegenNode.children)&&e.codegenNode.children.type===15){const u=c(e.codegenNode,"default");u&&(u.returns=o(Rn(u.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!fe(t.codegenNode.children)&&t.codegenNode.children.type===15){const u=os(e,"slot",!0),d=u&&u.arg&&c(t.codegenNode,u.arg);d&&(d.returns=o(Rn(d.returns)),r=!0)}}if(!r)for(const u of l)u.codegenNode=s.cache(u.codegenNode);function o(u){const d=s.cache(u);return d.needArraySpread=!0,d}function c(u,d){if(u.children&&!fe(u.children)&&u.children.type===15){const f=u.children.properties.find(p=>p.key===d||p.key.content===d);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ts(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=fh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ts(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const u=ts(c.exp,t);if(u===0)return s.set(e,0),0;u<l&&(l=u)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(Ln),t.removeHelper(ba(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(va(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ts(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Te(r)||$t(r))continue;const o=ts(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const nx=new Set([ic,lc,di,Ti]);function dh(e,t){if(e.type===14&&!Te(e.callee)&&nx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ts(s,t);if(s.type===14)return dh(s,t)}return 0}function fh(e,t){let s=3;const n=ph(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ts(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ts(r,t):r.type===14?c=dh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function ph(e){const t=e.codegenNode;if(t.type===13)return t.props}function ax(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=It,isCustomElement:u=It,expressionPlugins:d=[],scopeId:f=null,slotted:p=!0,ssr:m=!1,inSSR:g=!1,ssrCssVars:k="",bindingMetadata:E=Pe,inline:v=!1,isTS:b=!1,onError:x=dc,onWarn:R=Xp,compatConfig:S}){const D=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),w={filename:t,selfName:D&&$n(Ke(D[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:u,expressionPlugins:d,scopeId:f,slotted:p,ssr:m,inSSR:g,ssrCssVars:k,bindingMetadata:E,inline:v,isTS:b,onError:x,onWarn:R,compatConfig:S,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(I){const L=w.helpers.get(I)||0;return w.helpers.set(I,L+1),I},removeHelper(I){const L=w.helpers.get(I);if(L){const H=L-1;H?w.helpers.set(I,H):w.helpers.delete(I)}},helperString(I){return`_${ga[w.helper(I)]}`},replaceNode(I){w.parent.children[w.childIndex]=w.currentNode=I},removeNode(I){const L=w.parent.children,H=I?L.indexOf(I):w.currentNode?w.childIndex:-1;!I||I===w.currentNode?(w.currentNode=null,w.onNodeRemoved()):w.childIndex>H&&(w.childIndex--,w.onNodeRemoved()),w.parent.children.splice(H,1)},onNodeRemoved:It,addIdentifiers(I){},removeIdentifiers(I){},hoist(I){Te(I)&&(I=Ae(I)),w.hoists.push(I);const L=Ae(`_hoisted_${w.hoists.length}`,!1,I.loc,2);return L.hoisted=I,L},cache(I,L=!1,H=!1){const F=Ry(w.cached.length,I,L,H);return w.cached.push(F),F}};return w.filters=new Set,w}function ix(e,t){const s=ax(e,t);Xl(e,s),t.hoistStatic&&sx(e,s),t.ssr||lx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function lx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=uh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&uc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=fi(t,s(ui),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function rx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Te(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Xl(a,t))}}function Xl(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(fe(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Si);break;case 5:t.ssr||t.helper(Yl);break;case 9:for(let i=0;i<e.branches.length;i++)Xl(e.branches[i],t);break;case 10:case 11:case 1:case 0:rx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function hh(e,t){const s=Te(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Uy))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Zl="/*@__PURE__*/",gh=e=>`${ga[e]}: _${ga[e]}`;function ox(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:u=!1,isTS:d=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:u,isTS:d,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${ga[g]}`},push(g,k=-2,E){p.code+=g},indent(){m(++p.indentLevel)},deindent(g=!1){g?--p.indentLevel:m(--p.indentLevel)},newline(){m(p.indentLevel)}};function m(g){p.push(`
`+"  ".repeat(g),0)}return p}function cx(e,t={}){const s=ox(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:u}=s,d=Array.from(e.helpers),f=d.length>0,p=!i&&n!=="module";ux(e,s);const g=u?"ssrRender":"render",E=(u?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${E}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${d.map(gh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(wr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(wr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),wr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let v=0;v<e.temps;v++)a(`${v>0?", ":""}_temp${v}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),u||a("return "),e.codegenNode?Ft(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function ux(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,u=Array.from(e.helpers);if(u.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const d=[Yo,Qo,Si,Xo,Wp].filter(f=>u.includes(f)).map(gh).join(", ");a(`const { ${d} } = _Vue
`,-1)}dx(e.hoists,t),i(),a("return ")}function wr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?sc:t==="component"?Zo:tc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${hi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function dx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Ft(i,t),n())}t.pure=!1}function gc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ci(e,t,s),s&&t.deindent(),t.push("]")}function Ci(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Te(r)?a(r,-3):fe(r)?gc(r,t):Ft(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Ft(e,t){if(Te(e)){t.push(e,-3);return}if($t(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Ft(e.codegenNode,t);break;case 2:fx(e,t);break;case 4:mh(e,t);break;case 5:px(e,t);break;case 12:Ft(e.codegenNode,t);break;case 8:vh(e,t);break;case 3:gx(e,t);break;case 13:mx(e,t);break;case 14:bx(e,t);break;case 15:yx(e,t);break;case 17:xx(e,t);break;case 18:_x(e,t);break;case 19:kx(e,t);break;case 20:wx(e,t);break;case 21:Ci(e.body,t,!0,!1);break}}function fx(e,t){t.push(JSON.stringify(e.content),-3,e)}function mh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function px(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Zl),s(`${n(Yl)}(`),Ft(e.content,t),s(")")}function vh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Te(n)?t.push(n,-3):Ft(n,t)}}function hx(e,t){const{push:s}=t;if(e.type===8)s("["),vh(e,t),s("]");else if(e.isStatic){const n=fc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function gx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Zl),s(`${n(Si)}(${JSON.stringify(e.content)})`,-3,e)}function mx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:u,isBlock:d,disableTracking:f,isComponent:p}=e;let m;o&&(m=String(o)),u&&s(n(nc)+"("),d&&s(`(${n(Ln)}(${f?"true":""}), `),a&&s(Zl);const g=d?ba(t.inSSR,p):va(t.inSSR,p);s(n(g)+"(",-2,e),Ci(vx([i,l,r,m,c]),t),s(")"),d&&s(")"),u&&(s(", "),Ft(u,t),s(")"))}function vx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function bx(e,t){const{push:s,helper:n,pure:a}=t,i=Te(e.callee)?e.callee:n(e.callee);a&&s(Zl),s(i+"(",-2,e),Ci(e.arguments,t),s(")")}function yx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:u}=l[o];hx(c,t),s(": "),Ft(u,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function xx(e,t){gc(e.elements,t)}function _x(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${ga[oc]}(`),s("(",-2,e),fe(i)?Ci(i,t):i&&Ft(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),fe(l)?gc(l,t):Ft(l,t)):r&&Ft(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function kx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const d=!fc(s.content);d&&l("("),mh(s,t),d&&l(")")}else l("("),Ft(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Ft(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const u=a.type===19;u||t.indentLevel++,Ft(a,t),u||t.indentLevel--,i&&o(!0)}function wx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(xl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Ft(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(xl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Sx=hh(/^(?:if|else|else-if)$/,(e,t,s)=>Tx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Hu(a,o,s);else{const c=Cx(n.codegenNode);c.alternate=Hu(a,o+n.branches.length-1,s)}}}));function Tx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(tt(28,t.loc)),t.exp=Ae("true",!1,a)}if(t.name==="if"){const a=Uu(e,t),i={type:9,loc:Xy(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&ih(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(tt(30,e.loc)),s.removeNode();const r=Uu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Xl(r,s),o&&o(),s.currentNode=null}else s.onError(tt(30,e.loc));break}}}function Uu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!os(e,"for")?e.children:[e],userKey:Ql(e,"key"),isTemplateIf:s}}function Hu(e,t,s){return e.condition?io(e.condition,ju(e,t,s),xt(s.helper(Si),['""',"true"])):ju(e,t,s)}function ju(e,t,s){const{helper:n}=s,a=ht("key",Ae(`${t}`,!1,is,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Sl(o,a,s),o}else return fi(s,n(ui),cs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=jy(o);return c.type===13&&uc(c,s),Sl(c,a,s),o}}function Cx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Ex=hh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Ax(e,t,s,i=>{const l=xt(n(ac),[i.source]),r=kl(e),o=os(e,"memo"),c=Ql(e,"key",!1,!0);c&&c.type;let u=c&&(c.type===6?c.value?Ae(c.value.content,!0):void 0:c.exp);const d=u?ht("key",u):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=fi(s,n(ui),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let m;const{children:g}=i,k=g.length!==1||g[0].type!==1,E=wl(e)?e:r&&e.children.length===1&&wl(e.children[0])?e.children[0]:null;if(E?(m=E.codegenNode,r&&d&&Sl(m,d,s)):k?m=fi(s,n(ui),d?cs([d]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=g[0].codegenNode,r&&d&&Sl(m,d,s),m.isBlock!==!f&&(m.isBlock?(a(Ln),a(ba(s.inSSR,m.isComponent))):a(va(s.inSSR,m.isComponent))),m.isBlock=!f,m.isBlock?(n(Ln),n(ba(s.inSSR,m.isComponent))):n(va(s.inSSR,m.isComponent))),o){const v=ma(oo(i.parseResult,[Ae("_cached")]));v.body=Iy([vs(["const _memo = (",o.exp,")"]),vs(["if (_cached && _cached.el",...u?[" && _cached.key === ",u]:[],` && ${s.helperString(Qp)}(_cached, _memo)) return _cached`]),vs(["const _item = ",m]),Ae("_item.memo = _memo"),Ae("return _item")]),l.arguments.push(v,Ae("_cache"),Ae(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ma(oo(i.parseResult),m,!0))}})});function Ax(e,t,s,n){if(!t.exp){s.onError(tt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(tt(32,t.loc));return}bh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:u,index:d}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:u,objectIndexAlias:d,parseResult:a,children:kl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function bh(e,t){e.finalized||(e.finalized=!0)}function oo({value:e,key:t,index:s},n=[]){return Rx([e,t,s,...n])}function Rx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ae("_".repeat(n+1),!1))}const Vu=Ae("undefined",!1),Ix=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=os(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Nx=(e,t,s,n)=>ma(e,s,!1,!0,s.length?s[0].loc:n);function Dx(e,t,s=Nx){t.helper(oc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=os(e,"slot",!0);if(o){const{arg:k,exp:E}=o;k&&!Xt(k)&&(r=!0),i.push(ht(k||Ae("default",!0),s(E,void 0,n,a)))}let c=!1,u=!1;const d=[],f=new Set;let p=0;for(let k=0;k<n.length;k++){const E=n[k];let v;if(!kl(E)||!(v=os(E,"slot",!0))){E.type!==3&&d.push(E);continue}if(o){t.onError(tt(37,v.loc));break}c=!0;const{children:b,loc:x}=E,{arg:R=Ae("default",!0),exp:S,loc:D}=v;let w;Xt(R)?w=R?R.content:"default":r=!0;const I=os(E,"for"),L=s(S,I,b,x);let H,F;if(H=os(E,"if"))r=!0,l.push(io(H.exp,Vi(R,L,p++),Vu));else if(F=os(E,/^else(?:-if)?$/,!0)){let P=k,W;for(;P--&&(W=n[P],!!ih(W)););if(W&&kl(W)&&os(W,/^(?:else-)?if$/)){let B=l[l.length-1];for(;B.alternate.type===19;)B=B.alternate;B.alternate=F.exp?io(F.exp,Vi(R,L,p++),Vu):Vi(R,L,p++)}else t.onError(tt(30,F.loc))}else if(I){r=!0;const P=I.forParseResult;P?(bh(P),l.push(xt(t.helper(ac),[P.source,ma(oo(P),Vi(R,L),!0)]))):t.onError(tt(32,I.loc))}else{if(w){if(f.has(w)){t.onError(tt(38,D));continue}f.add(w),w==="default"&&(u=!0)}i.push(ht(R,L))}}if(!o){const k=(E,v)=>{const b=s(E,void 0,v,a);return t.compatConfig&&(b.isNonScopedSlot=!0),ht("default",b)};c?d.length&&!d.every(pc)&&(u?t.onError(tt(39,d[0].loc)):i.push(k(void 0,d))):i.push(k(void 0,n))}const m=r?2:Xi(e.children)?3:1;let g=cs(i.concat(ht("_",Ae(m+"",!1))),a);return l.length&&(g=xt(t.helper(Yp),[g,Rn(l)])),{slots:g,hasDynamicSlots:r}}function Vi(e,t,s){const n=[ht("name",e),ht("fn",t)];return s!=null&&n.push(ht("key",Ae(String(s),!0))),cs(n)}function Xi(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Xi(s.children))return!0;break;case 9:if(Xi(s.branches))return!0;break;case 10:case 11:if(Xi(s.children))return!0;break}}return!1}const yh=new WeakMap,Ox=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?Lx(e,t):`"${n}"`;const r=Ue(l)&&l.callee===ec;let o,c,u=0,d,f,p,m=r||l===Ya||l===Jo||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=xh(e,t,void 0,i,r);o=g.props,u=g.patchFlag,f=g.dynamicPropNames;const k=g.directives;p=k&&k.length?Rn(k.map(E=>Mx(E,t))):void 0,g.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===bl&&(m=!0,u|=1024),i&&l!==Ya&&l!==bl){const{slots:k,hasDynamicSlots:E}=Dx(e,t);c=k,E&&(u|=1024)}else if(e.children.length===1&&l!==Ya){const k=e.children[0],E=k.type,v=E===5||E===8;v&&ts(k,t)===0&&(u|=1),v||E===2?c=k:c=e.children}else c=e.children;f&&f.length&&(d=Fx(f)),e.codegenNode=fi(t,l,o,c,u===0?void 0:u,d,p,!!m,!1,i,e.loc)};function Lx(e,t,s=!1){let{tag:n}=e;const a=co(n),i=Ql(e,"is",!1,!0);if(i)if(a||In("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ae(i.value.content,!0):(r=i.exp,r||(r=Ae("is",!1,i.arg.loc))),r)return xt(t.helper(ec),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Zp(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Zo),t.components.add(n),hi(n,"component"))}function xh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const u=[],d=[],f=o.length>0;let p=!1,m=0,g=!1,k=!1,E=!1,v=!1,b=!1,x=!1;const R=[],S=L=>{c.length&&(u.push(cs(qu(c),r)),c=[]),L&&u.push(L)},D=()=>{t.scopes.vFor>0&&c.push(ht(Ae("ref_for",!0),Ae("true")))},w=({key:L,value:H})=>{if(Xt(L)){const F=L.content,P=Mn(F);if(P&&(!n||a)&&F.toLowerCase()!=="onclick"&&F!=="onUpdate:modelValue"&&!qs(F)&&(v=!0),P&&qs(F)&&(x=!0),P&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ts(H,t)>0)return;F==="ref"?g=!0:F==="class"?k=!0:F==="style"?E=!0:F!=="key"&&!R.includes(F)&&R.push(F),n&&(F==="class"||F==="style")&&!R.includes(F)&&R.push(F)}else b=!0};for(let L=0;L<s.length;L++){const H=s[L];if(H.type===6){const{loc:F,name:P,nameLoc:W,value:B}=H;let j=!0;if(P==="ref"&&(g=!0,D()),P==="is"&&(co(l)||B&&B.content.startsWith("vue:")||In("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(ht(Ae(P,!0,W),Ae(B?B.content:"",j,B?B.loc:F)))}else{const{name:F,arg:P,exp:W,loc:B,modifiers:j}=H,N=F==="bind",O=F==="on";if(F==="slot"){n||t.onError(tt(40,B));continue}if(F==="once"||F==="memo"||F==="is"||N&&wn(P,"is")&&(co(l)||In("COMPILER_IS_ON_ELEMENT",t))||O&&i)continue;if((N&&wn(P,"key")||O&&f&&wn(P,"vue:before-update"))&&(p=!0),N&&wn(P,"ref")&&D(),!P&&(N||O)){if(b=!0,W)if(N){if(S(),In("COMPILER_V_BIND_OBJECT_ORDER",t)){u.unshift(W);continue}D(),S(),u.push(W)}else S({type:14,loc:B,callee:t.helper(rc),arguments:n?[W]:[W,"true"]});else t.onError(tt(N?34:35,B));continue}N&&j.some(ue=>ue.content==="prop")&&(m|=32);const z=t.directiveTransforms[F];if(z){const{props:ue,needRuntime:ve}=z(H,e,t);!i&&ue.forEach(w),O&&P&&!Xt(P)?S(cs(ue,r)):c.push(...ue),ve&&(d.push(H),$t(ve)&&yh.set(H,ve))}else Eg(F)||(d.push(H),f&&(p=!0))}}let I;if(u.length?(S(),u.length>1?I=xt(t.helper(yl),u,r):I=u[0]):c.length&&(I=cs(qu(c),r)),b?m|=16:(k&&!n&&(m|=2),E&&!n&&(m|=4),R.length&&(m|=8),v&&(m|=32)),!p&&(m===0||m===32)&&(g||x||d.length>0)&&(m|=512),!t.inSSR&&I)switch(I.type){case 15:let L=-1,H=-1,F=!1;for(let B=0;B<I.properties.length;B++){const j=I.properties[B].key;Xt(j)?j.content==="class"?L=B:j.content==="style"&&(H=B):j.isHandlerKey||(F=!0)}const P=I.properties[L],W=I.properties[H];F?I=xt(t.helper(di),[I]):(P&&!Xt(P.value)&&(P.value=xt(t.helper(ic),[P.value])),W&&(E||W.value.type===4&&W.value.content.trim()[0]==="["||W.value.type===17)&&(W.value=xt(t.helper(lc),[W.value])));break;case 14:break;default:I=xt(t.helper(di),[xt(t.helper(Ti),[I])]);break}return{props:I,directives:d,patchFlag:m,dynamicPropNames:R,shouldUseBlock:p}}function qu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Mn(i))&&Px(l,a):(t.set(i,a),s.push(a))}return s}function Px(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Rn([e.value,t.value],e.loc)}function Mx(e,t){const s=[],n=yh.get(e);n?s.push(t.helperString(n)):(t.helper(tc),t.directives.add(e.name),s.push(hi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ae("true",!1,a);s.push(cs(e.modifiers.map(l=>ht(l,i)),a))}return Rn(s,e.loc)}function Fx(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function co(e){return e==="component"||e==="Component"}const $x=(e,t)=>{if(wl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=Bx(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ma([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=xt(t.helper(Jp),l,n)}};function Bx(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=Ke(l.name),a.push(l)));else if(l.name==="bind"&&wn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=Ke(l.arg.content);s=l.exp=Ae(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Xt(l.arg)&&(l.arg.content=Ke(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=xh(e,t,a,!1,!1);n=i,l.length&&t.onError(tt(36,l[0].loc))}return{slotName:s,slotProps:n}}const _h=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(tt(35,a));let r;if(l.type===4)if(l.isStatic){let d=l.content;d.startsWith("vue:")&&(d=`vnode-${d.slice(4)}`);const f=t.tagType!==0||d.startsWith("vnode")||!/[A-Z]/.test(d)?aa(Ke(d)):`on:${d}`;r=Ae(f,!0,l.loc)}else r=vs([`${s.helperString(ao)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(ao)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const d=sh(o),f=!(d||$y(o)),p=o.content.includes(";");(f||c&&d)&&(o=vs([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let u={props:[ht(r,o||Ae("() => {}",!1,a))]};return n&&(u=n(u)),c&&(u.props[0].value=s.cache(u.props[0].value)),u.props.forEach(d=>d.key.isHandlerKey=!0),u},Ux=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=Ke(i.content):i.content=`${s.helperString(no)}(${i.content})`:(i.children.unshift(`${s.helperString(no)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&zu(i,"."),n.some(r=>r.content==="attr")&&zu(i,"^")),{props:[ht(i,l)]}},zu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Hx=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(kr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(kr(o))n||(n=s[i]=vs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(kr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ts(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:xt(t.helper(Xo),r)}}}}},Ku=new WeakSet,jx=(e,t)=>{if(e.type===1&&os(e,"once",!0))return Ku.has(e)||t.inVOnce||t.inSSR?void 0:(Ku.add(e),t.inVOnce=!0,t.helper(xl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},kh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(tt(41,e.loc)),La();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(tt(44,n.loc)),La();if(r==="literal-const"||r==="setup-const")return s.onError(tt(45,n.loc)),La();if(!l.trim()||!sh(n))return s.onError(tt(42,n.loc)),La();const o=a||Ae("modelValue",!0),c=a?Xt(a)?`onUpdate:${Ke(a.content)}`:vs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let u;const d=s.isTS?"($event: any)":"$event";u=vs([`${d} => ((`,n,") = $event)"]);const f=[ht(o,e.exp),ht(c,u)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(g=>g.content).map(g=>(fc(g)?g:JSON.stringify(g))+": true").join(", "),m=a?Xt(a)?`${a.content}Modifiers`:vs([a,' + "Modifiers"']):"modelModifiers";f.push(ht(m,Ae(`{ ${p} }`,!1,e.loc,2)))}return La(f)};function La(e=[]){return{props:e}}const Vx=/[\w).+\-_$\]]/,qx=(e,t)=>{In("COMPILER_FILTERS",t)&&(e.type===5?Tl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Tl(s.exp,t)}))};function Tl(e,t){if(e.type===4)Gu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Gu(n,t):n.type===8?Tl(e,t):n.type===5&&Tl(n.content,t))}}function Gu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,u=0,d,f,p,m,g=[];for(p=0;p<s.length;p++)if(f=d,d=s.charCodeAt(p),n)d===39&&f!==92&&(n=!1);else if(a)d===34&&f!==92&&(a=!1);else if(i)d===96&&f!==92&&(i=!1);else if(l)d===47&&f!==92&&(l=!1);else if(d===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)m===void 0?(u=p+1,m=s.slice(0,p).trim()):k();else{switch(d){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(d===47){let E=p-1,v;for(;E>=0&&(v=s.charAt(E),v===" ");E--);(!v||!Vx.test(v))&&(l=!0)}}m===void 0?m=s.slice(0,p).trim():u!==0&&k();function k(){g.push(s.slice(u,p).trim()),u=p+1}if(g.length){for(p=0;p<g.length;p++)m=zx(m,g[p],t);e.content=m,e.ast=void 0}}function zx(e,t,s){s.helper(sc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${hi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${hi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const Wu=new WeakSet,Kx=(e,t)=>{if(e.type===1){const s=os(e,"memo");return!s||Wu.has(e)||t.inSSR?void 0:(Wu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&uc(n,t),e.codegenNode=xt(t.helper(cc),[s.exp,ma(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},Gx=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(tt(53,n.loc)),s.exp=Ae("",!0,n.loc);else{const a=Ke(n.content);(eh.test(a[0])||a[0]==="-")&&(s.exp=Ae(a,!1,n.loc))}}}};function Wx(e){return[[Gx,jx,Sx,Kx,Ex,qx,$x,Ox,Ix,Hx],{on:_h,bind:Ux,model:kh}]}function Jx(e,t={}){const s=t.onError||dc,n=t.mode==="module";t.prefixIdentifiers===!0?s(tt(48)):n&&s(tt(49));const a=!1;t.cacheHandlers&&s(tt(50)),t.scopeId&&!n&&s(tt(51));const i=Oe({},t,{prefixIdentifiers:a}),l=Te(e)?tx(e,i):e,[r,o]=Wx();return ix(l,Oe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Oe({},o,t.directiveTransforms||{})})),cx(l,i)}const Yx=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const wh=Symbol(""),Sh=Symbol(""),Th=Symbol(""),Ch=Symbol(""),uo=Symbol(""),Eh=Symbol(""),Ah=Symbol(""),Rh=Symbol(""),Ih=Symbol(""),Nh=Symbol("");Ey({[wh]:"vModelRadio",[Sh]:"vModelCheckbox",[Th]:"vModelText",[Ch]:"vModelSelect",[uo]:"vModelDynamic",[Eh]:"withModifiers",[Ah]:"withKeys",[Rh]:"vShow",[Ih]:"Transition",[Nh]:"TransitionGroup"});let Gn;function Qx(e,t=!1){return Gn||(Gn=document.createElement("div")),t?(Gn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Gn.children[0].getAttribute("foo")):(Gn.innerHTML=e,Gn.textContent)}const Xx={parseMode:"html",isVoidTag:qg,isNativeTag:e=>Hg(e)||jg(e)||Vg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:Qx,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Ih;if(e==="TransitionGroup"||e==="transition-group")return Nh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},Zx=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ae("style",!0,t.loc),exp:e0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},e0=(e,t)=>{const s=Hd(e);return Ae(JSON.stringify(s),!1,t,3)};function pn(e,t){return tt(e,t)}const t0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(54,a)),t.children.length&&(s.onError(pn(55,a)),t.children.length=0),{props:[ht(Ae("innerHTML",!0,a),n||Ae("",!0))]}},s0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(56,a)),t.children.length&&(s.onError(pn(57,a)),t.children.length=0),{props:[ht(Ae("textContent",!0),n?ts(n,s)>0?n:xt(s.helperString(Yl),[n],a):Ae("",!0))]}},n0=(e,t,s)=>{const n=kh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(pn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Th,r=!1;if(a==="input"||i){const o=Ql(t,"type");if(o){if(o.type===7)l=uo;else if(o.value)switch(o.value.content){case"radio":l=wh;break;case"checkbox":l=Sh;break;case"file":r=!0,s.onError(pn(60,e.loc));break}}else By(t)&&(l=uo)}else a==="select"&&(l=Ch);r||(n.needRuntime=s.helper(l))}else s.onError(pn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},a0=as("passive,once,capture"),i0=as("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),l0=as("left,right"),Dh=as("onkeyup,onkeydown,onkeypress"),r0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&pi("COMPILER_V_ON_NATIVE",s)||a0(o)?l.push(o):l0(o)?Xt(e)?Dh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):i0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Ju=(e,t)=>Xt(e)&&e.content.toLowerCase()==="onclick"?Ae(t,!0):e.type!==4?vs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,o0=(e,t,s)=>_h(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=r0(i,a,s,e.loc);if(o.includes("right")&&(i=Ju(i,"onContextmenu")),o.includes("middle")&&(i=Ju(i,"onMouseup")),o.length&&(l=xt(s.helper(Eh),[l,JSON.stringify(o)])),r.length&&(!Xt(i)||Dh(i.content.toLowerCase()))&&(l=xt(s.helper(Ah),[l,JSON.stringify(r)])),c.length){const u=c.map($n).join("");i=Xt(i)?Ae(`${i.content}${u}`,!0):vs(["(",i,`) + "${u}"`])}return{props:[ht(i,l)]}}),c0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(pn(62,a)),{props:[],needRuntime:s.helper(Rh)}},u0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},d0=[Zx],f0={cloak:Yx,html:t0,text:s0,model:n0,on:o0,show:c0};function p0(e,t={}){return Jx(e,Oe({},Xx,t,{nodeTransforms:[u0,...d0,...t.nodeTransforms||[]],directiveTransforms:Oe({},f0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Yu=Object.create(null);function h0(e,t){if(!Te(e))if(e.nodeType)e=e.innerHTML;else return It;const s=Ig(e,t),n=Yu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Oe({hoistStatic:!0,onError:void 0,onWarn:It},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=p0(e,a),l=new Function("Vue",i)(_y);return l._rc=!0,Yu[s]=l}gp(h0);const Cl=gn({items:[]});let g0=1;function er(e,t="info",s=3e3){const n=g0++;return Cl.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>mc(n),s),n}function mc(e){const t=Cl.items.findIndex(s=>s.id===e);t>=0&&Cl.items.splice(t,1)}function xe(e,t="info",s=3e3){return er(e,t,s)}xe.success=(e,t=3e3)=>er(e,"success",t);xe.error=(e,t=5e3)=>er(e,"error",t);xe.info=(e,t=3e3)=>er(e,"info",t);xe.dismiss=mc;const m0={setup(){return{state:Cl,dismiss:mc}},template:`
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
  `},$s=gn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ua=null;function ns({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ua&&ua(!1),$s.title=e,$s.message=t,$s.confirmLabel=s,$s.cancelLabel=n,$s.danger=a,$s.open=!0,new Promise(i=>{ua=i})}function Sr(e){$s.open=!1,ua&&(ua(e),ua=null)}const v0={setup(){function e(t){$s.open&&(t.key==="Escape"&&(t.stopPropagation(),Sr(!1)),t.key==="Enter"&&(t.stopPropagation(),Sr(!0)))}return $e(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:$s,settle:Sr}},template:`
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
 */const Xn=typeof document<"u";function Oh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function b0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Oh(e.default)}const Ve=Object.assign;function Tr(e,t){const s={};for(const n in t){const a=t[n];s[n]=ys(a)?a.map(e):e(a)}return s}const Qa=()=>{},ys=Array.isArray;function Qu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Lh=/#/g,y0=/&/g,x0=/\//g,_0=/=/g,k0=/\?/g,Ph=/\+/g,w0=/%5B/g,S0=/%5D/g,Mh=/%5E/g,T0=/%60/g,Fh=/%7B/g,C0=/%7C/g,$h=/%7D/g,E0=/%20/g;function vc(e){return e==null?"":encodeURI(""+e).replace(C0,"|").replace(w0,"[").replace(S0,"]")}function A0(e){return vc(e).replace(Fh,"{").replace($h,"}").replace(Mh,"^")}function fo(e){return vc(e).replace(Ph,"%2B").replace(E0,"+").replace(Lh,"%23").replace(y0,"%26").replace(T0,"`").replace(Fh,"{").replace($h,"}").replace(Mh,"^")}function R0(e){return fo(e).replace(_0,"%3D")}function I0(e){return vc(e).replace(Lh,"%23").replace(k0,"%3F")}function N0(e){return I0(e).replace(x0,"%2F")}function mi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const D0=/\/$/,O0=e=>e.replace(D0,"");function Cr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=F0(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:mi(l)}}function L0(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Xu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function P0(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ya(t.matched[n],s.matched[a])&&Bh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ya(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Bh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!M0(e[s],t[s]))return!1;return!0}function M0(e,t){return ys(e)?Zu(e,t):ys(t)?Zu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Zu(e,t){return ys(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function F0(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const an={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let po=(function(e){return e.pop="pop",e.push="push",e})({}),Er=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function $0(e){if(!e)if(Xn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),O0(e)}const B0=/^[^#]+#/;function U0(e,t){return e.replace(B0,"#")+t}function H0(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const tr=()=>({left:window.scrollX,top:window.scrollY});function j0(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=H0(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function ed(e,t){return(history.state?history.state.position-t:-1)+e}const ho=new Map;function V0(e,t){ho.set(e,t)}function q0(e){const t=ho.get(e);return ho.delete(e),t}function z0(e){return typeof e=="string"||e&&typeof e=="object"}function Uh(e){return typeof e=="string"||typeof e=="symbol"}let rt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Hh=Symbol("");rt.MATCHER_NOT_FOUND+"",rt.NAVIGATION_GUARD_REDIRECT+"",rt.NAVIGATION_ABORTED+"",rt.NAVIGATION_CANCELLED+"",rt.NAVIGATION_DUPLICATED+"";function xa(e,t){return Ve(new Error,{type:e,[Hh]:!0},t)}function Os(e,t){return e instanceof Error&&Hh in e&&(t==null||!!(e.type&t))}const K0=["params","query","hash"];function G0(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of K0)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function W0(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Ph," "),i=a.indexOf("="),l=mi(i<0?a:a.slice(0,i)),r=i<0?null:mi(a.slice(i+1));if(l in t){let o=t[l];ys(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function td(e){let t="";for(let s in e){const n=e[s];if(s=R0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(ys(n)?n.map(a=>a&&fo(a)):[n&&fo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function J0(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=ys(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Y0=Symbol(""),sd=Symbol(""),sr=Symbol(""),bc=Symbol(""),go=Symbol("");function Pa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function dn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(xa(rt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):z0(f)?o(xa(rt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},u=i(()=>e.call(n&&n.instances[a],t,s,c));let d=Promise.resolve(u);e.length<3&&(d=d.then(c)),d.catch(f=>o(f))})}function Ar(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Oh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(dn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(u=>{if(!u)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const d=b0(u)?u.default:u;l.mods[r]=u,l.components[r]=d;const f=(d.__vccOpts||d)[t];return f&&dn(f,s,n,l,r,a)()}))}}return i}function Q0(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>ya(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>ya(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let X0=()=>location.protocol+"//"+location.host;function jh(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),Xu(r,"")}return Xu(s,e)+n+a}function Z0(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=jh(e,location),m=s.value,g=t.value;let k=0;if(f){if(s.value=p,t.value=f,l&&l===m){l=null;return}k=g?f.position-g.position:0}else n(p);a.forEach(E=>{E(s.value,m,{delta:k,type:po.pop,direction:k?k>0?Er.forward:Er.back:Er.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const m=a.indexOf(f);m>-1&&a.splice(m,1)};return i.push(p),p}function u(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(Ve({},f.state,{scroll:tr()}),"")}}function d(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",u),document.removeEventListener("visibilitychange",u)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",u),document.addEventListener("visibilitychange",u),{pauseListeners:o,listen:c,destroy:d}}function nd(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?tr():null}}function e_(e){const{history:t,location:s}=window,n={value:jh(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,u){const d=e.indexOf("#"),f=d>-1?(s.host&&document.querySelector("base")?e:e.slice(d))+o:X0()+e+o;try{t[u?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[u?"replace":"assign"](f)}}function l(o,c){i(o,Ve({},t.state,nd(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const u=Ve({},a.value,t.state,{forward:o,scroll:tr()});i(u.current,u,!0),i(o,Ve({},nd(n.value,o,null),{position:u.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function t_(e){e=$0(e);const t=e_(e),s=Z0(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=Ve({location:"",base:e,go:n,createHref:U0.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function s_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),t_(e)}let Tn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var bt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(bt||{});const n_={type:Tn.Static,value:""},a_=/[a-zA-Z0-9_]/;function i_(e){if(!e)return[[]];if(e==="/")return[[n_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=bt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",u="";function d(){c&&(s===bt.Static?i.push({type:Tn.Static,value:c}):s===bt.Param||s===bt.ParamRegExp||s===bt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Tn.Param,value:c,regexp:u,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==bt.ParamRegExp){n=s,s=bt.EscapeNext;continue}switch(s){case bt.Static:o==="/"?(c&&d(),l()):o===":"?(d(),s=bt.Param):f();break;case bt.EscapeNext:f(),s=n;break;case bt.Param:o==="("?s=bt.ParamRegExp:a_.test(o)?f():(d(),s=bt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case bt.ParamRegExp:o===")"?u[u.length-1]=="\\"?u=u.slice(0,-1)+o:s=bt.ParamRegExpEnd:u+=o;break;case bt.ParamRegExpEnd:d(),s=bt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,u="";break;default:t("Unknown state");break}}return s===bt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),d(),l(),a}const ad="[^/]+?",l_={sensitive:!1,strict:!1,start:!0,end:!0};var Ht=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Ht||{});const r_=/[.+*?^${}()[\]/\\]/g;function o_(e,t){const s=Ve({},l_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const u=c.length?[]:[Ht.Root];s.strict&&!c.length&&(a+="/");for(let d=0;d<c.length;d++){const f=c[d];let p=Ht.Segment+(s.sensitive?Ht.BonusCaseSensitive:0);if(f.type===Tn.Static)d||(a+="/"),a+=f.value.replace(r_,"\\$&"),p+=Ht.Static;else if(f.type===Tn.Param){const{value:m,repeatable:g,optional:k,regexp:E}=f;i.push({name:m,repeatable:g,optional:k});const v=E||ad;if(v!==ad){p+=Ht.BonusCustomRegExp;try{`${v}`}catch(x){throw new Error(`Invalid custom RegExp for param "${m}" (${v}): `+x.message)}}let b=g?`((?:${v})(?:/(?:${v}))*)`:`(${v})`;d||(b=k&&c.length<2?`(?:/${b})`:"/"+b),k&&(b+="?"),a+=b,p+=Ht.Dynamic,k&&(p+=Ht.BonusOptional),g&&(p+=Ht.BonusRepeatable),v===".*"&&(p+=Ht.BonusWildcard)}u.push(p)}n.push(u)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Ht.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const u=c.match(l),d={};if(!u)return null;for(let f=1;f<u.length;f++){const p=u[f]||"",m=i[f-1];d[m.name]=p&&m.repeatable?p.split("/"):p}return d}function o(c){let u="",d=!1;for(const f of e){(!d||!u.endsWith("/"))&&(u+="/"),d=!1;for(const p of f)if(p.type===Tn.Static)u+=p.value;else if(p.type===Tn.Param){const{value:m,repeatable:g,optional:k}=p,E=m in c?c[m]:"";if(ys(E)&&!g)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const v=ys(E)?E.join("/"):E;if(!v)if(k)f.length<2&&(u.endsWith("/")?u=u.slice(0,-1):d=!0);else throw new Error(`Missing required param "${m}"`);u+=v}}return u||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function c_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Ht.Static+Ht.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Ht.Static+Ht.Segment?1:-1:0}function Vh(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=c_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(id(n))return 1;if(id(a))return-1}return a.length-n.length}function id(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const u_={strict:!1,end:!0,sensitive:!1};function d_(e,t,s){const n=o_(i_(e.path),s),a=Ve(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function f_(e,t){const s=[],n=new Map;t=Qu(u_,t);function a(d){return n.get(d)}function i(d,f,p){const m=!p,g=rd(d);g.aliasOf=p&&p.record;const k=Qu(t,d),E=[g];if("alias"in d){const x=typeof d.alias=="string"?[d.alias]:d.alias;for(const R of x)E.push(rd(Ve({},g,{components:p?p.record.components:g.components,path:R,aliasOf:p?p.record:g})))}let v,b;for(const x of E){const{path:R}=x;if(f&&R[0]!=="/"){const S=f.record.path,D=S[S.length-1]==="/"?"":"/";x.path=f.record.path+(R&&D+R)}if(v=d_(x,f,k),p?p.alias.push(v):(b=b||v,b!==v&&b.alias.push(v),m&&d.name&&!od(v)&&l(d.name)),qh(v)&&o(v),g.children){const S=g.children;for(let D=0;D<S.length;D++)i(S[D],v,p&&p.children[D])}p=p||v}return b?()=>{l(b)}:Qa}function l(d){if(Uh(d)){const f=n.get(d);f&&(n.delete(d),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(d);f>-1&&(s.splice(f,1),d.record.name&&n.delete(d.record.name),d.children.forEach(l),d.alias.forEach(l))}}function r(){return s}function o(d){const f=g_(d,s);s.splice(f,0,d),d.record.name&&!od(d)&&n.set(d.record.name,d)}function c(d,f){let p,m={},g,k;if("name"in d&&d.name){if(p=n.get(d.name),!p)throw xa(rt.MATCHER_NOT_FOUND,{location:d});k=p.record.name,m=Ve(ld(f.params,p.keys.filter(b=>!b.optional).concat(p.parent?p.parent.keys.filter(b=>b.optional):[]).map(b=>b.name)),d.params&&ld(d.params,p.keys.map(b=>b.name))),g=p.stringify(m)}else if(d.path!=null)g=d.path,p=s.find(b=>b.re.test(g)),p&&(m=p.parse(g),k=p.record.name);else{if(p=f.name?n.get(f.name):s.find(b=>b.re.test(f.path)),!p)throw xa(rt.MATCHER_NOT_FOUND,{location:d,currentLocation:f});k=p.record.name,m=Ve({},f.params,d.params),g=p.stringify(m)}const E=[];let v=p;for(;v;)E.unshift(v.record),v=v.parent;return{name:k,path:g,params:m,matched:E,meta:h_(E)}}e.forEach(d=>i(d));function u(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:u,getRoutes:r,getRecordMatcher:a}}function ld(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function rd(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:p_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function p_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function od(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function h_(e){return e.reduce((t,s)=>Ve(t,s.meta),{})}function g_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Vh(e,t[i])<0?n=i:s=i+1}const a=m_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function m_(e){let t=e;for(;t=t.parent;)if(qh(t)&&Vh(e,t)===0)return t}function qh({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function cd(e){const t=us(sr),s=us(bc),n=ee(()=>{const o=Es(e.to);return t.resolve(o)}),a=ee(()=>{const{matched:o}=n.value,{length:c}=o,u=o[c-1],d=s.matched;if(!u||!d.length)return-1;const f=d.findIndex(ya.bind(null,u));if(f>-1)return f;const p=ud(o[c-2]);return c>1&&ud(u)===p&&d[d.length-1].path!==p?d.findIndex(ya.bind(null,o[c-2])):f}),i=ee(()=>a.value>-1&&__(s.params,n.value.params)),l=ee(()=>a.value>-1&&a.value===s.matched.length-1&&Bh(s.params,n.value.params));function r(o={}){if(x_(o)){const c=t[Es(e.replace)?"replace":"push"](Es(e.to)).catch(Qa);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:ee(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function v_(e){return e.length===1?e[0]:e}const b_=_i({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:cd,setup(e,{slots:t}){const s=gn(cd(e)),{options:n}=us(sr),a=ee(()=>({[dd(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[dd(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&v_(t.default(s));return e.custom?i:Wl("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),y_=b_;function x_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function __(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!ys(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function ud(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const dd=(e,t,s)=>e??t??s,k_=_i({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=us(go),a=ee(()=>e.route||n.value),i=us(sd,0),l=ee(()=>{let c=Es(i);const{matched:u}=a.value;let d;for(;(d=u[c])&&!d.components;)c++;return c}),r=ee(()=>a.value.matched[l.value]);Ka(sd,ee(()=>l.value+1)),Ka(Y0,r),Ka(go,a);const o=h();return ds(()=>[o.value,r.value,e.name],([c,u,d],[f,p,m])=>{u&&(u.instances[d]=c,p&&p!==u&&c&&c===f&&(u.leaveGuards.size||(u.leaveGuards=p.leaveGuards),u.updateGuards.size||(u.updateGuards=p.updateGuards))),c&&u&&(!p||!ya(u,p)||!f)&&(u.enterCallbacks[d]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,u=e.name,d=r.value,f=d&&d.components[u];if(!f)return fd(s.default,{Component:f,route:c});const p=d.props[u],m=p?p===!0?c.params:typeof p=="function"?p(c):p:null,k=Wl(f,Ve({},m,t,{onVnodeUnmounted:E=>{E.component.isUnmounted&&(d.instances[u]=null)},ref:o}));return fd(s.default,{Component:k,route:c})||k}}});function fd(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const w_=k_;function S_(e){const t=f_(e.routes,e),s=e.parseQuery||W0,n=e.stringifyQuery||td,a=e.history,i=Pa(),l=Pa(),r=Pa(),o=Ao(an);let c=an;Xn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const u=Tr.bind(null,V=>""+V),d=Tr.bind(null,N0),f=Tr.bind(null,mi);function p(V,re){let le,ge;return Uh(V)?(le=t.getRecordMatcher(V),ge=re):ge=V,t.addRoute(ge,le)}function m(V){const re=t.getRecordMatcher(V);re&&t.removeRoute(re)}function g(){return t.getRoutes().map(V=>V.record)}function k(V){return!!t.getRecordMatcher(V)}function E(V,re){if(re=Ve({},re||o.value),typeof V=="string"){const T=Cr(s,V,re.path),M=t.resolve({path:T.path},re),G=a.createHref(T.fullPath);return Ve(T,M,{params:f(M.params),hash:mi(T.hash),redirectedFrom:void 0,href:G})}let le;if(V.path!=null)le=Ve({},V,{path:Cr(s,V.path,re.path).path});else{const T=Ve({},V.params);for(const M in T)T[M]==null&&delete T[M];le=Ve({},V,{params:d(T)}),re.params=d(re.params)}const ge=t.resolve(le,re),me=V.hash||"";ge.params=u(f(ge.params));const De=L0(n,Ve({},V,{hash:A0(me),path:ge.path})),y=a.createHref(De);return Ve({fullPath:De,hash:me,query:n===td?J0(V.query):V.query||{}},ge,{redirectedFrom:void 0,href:y})}function v(V){return typeof V=="string"?Cr(s,V,o.value.path):Ve({},V)}function b(V,re){if(c!==V)return xa(rt.NAVIGATION_CANCELLED,{from:re,to:V})}function x(V){return D(V)}function R(V){return x(Ve(v(V),{replace:!0}))}function S(V,re){const le=V.matched[V.matched.length-1];if(le&&le.redirect){const{redirect:ge}=le;let me=typeof ge=="function"?ge(V,re):ge;return typeof me=="string"&&(me=me.includes("?")||me.includes("#")?me=v(me):{path:me},me.params={}),Ve({query:V.query,hash:V.hash,params:me.path!=null?{}:V.params},me)}}function D(V,re){const le=c=E(V),ge=o.value,me=V.state,De=V.force,y=V.replace===!0,T=S(le,ge);if(T)return D(Ve(v(T),{state:typeof T=="object"?Ve({},me,T.state):me,force:De,replace:y}),re||le);const M=le;M.redirectedFrom=re;let G;return!De&&P0(n,ge,le)&&(G=xa(rt.NAVIGATION_DUPLICATED,{to:M,from:ge}),ve(ge,ge,!0,!1)),(G?Promise.resolve(G):L(M,ge)).catch(A=>Os(A)?Os(A,rt.NAVIGATION_GUARD_REDIRECT)?A:ue(A):O(A,M,ge)).then(A=>{if(A){if(Os(A,rt.NAVIGATION_GUARD_REDIRECT))return D(Ve({replace:y},v(A.to),{state:typeof A.to=="object"?Ve({},me,A.to.state):me,force:De}),re||M)}else A=F(M,ge,!0,y,me);return H(M,ge,A),A})}function w(V,re){const le=b(V,re);return le?Promise.reject(le):Promise.resolve()}function I(V){const re=Y.values().next().value;return re&&typeof re.runWithContext=="function"?re.runWithContext(V):V()}function L(V,re){let le;const[ge,me,De]=Q0(V,re);le=Ar(ge.reverse(),"beforeRouteLeave",V,re);for(const T of ge)T.leaveGuards.forEach(M=>{le.push(dn(M,V,re))});const y=w.bind(null,V,re);return le.push(y),Ie(le).then(()=>{le=[];for(const T of i.list())le.push(dn(T,V,re));return le.push(y),Ie(le)}).then(()=>{le=Ar(me,"beforeRouteUpdate",V,re);for(const T of me)T.updateGuards.forEach(M=>{le.push(dn(M,V,re))});return le.push(y),Ie(le)}).then(()=>{le=[];for(const T of De)if(T.beforeEnter)if(ys(T.beforeEnter))for(const M of T.beforeEnter)le.push(dn(M,V,re));else le.push(dn(T.beforeEnter,V,re));return le.push(y),Ie(le)}).then(()=>(V.matched.forEach(T=>T.enterCallbacks={}),le=Ar(De,"beforeRouteEnter",V,re,I),le.push(y),Ie(le))).then(()=>{le=[];for(const T of l.list())le.push(dn(T,V,re));return le.push(y),Ie(le)}).catch(T=>Os(T,rt.NAVIGATION_CANCELLED)?T:Promise.reject(T))}function H(V,re,le){r.list().forEach(ge=>I(()=>ge(V,re,le)))}function F(V,re,le,ge,me){const De=b(V,re);if(De)return De;const y=re===an,T=Xn?history.state:{};le&&(ge||y?a.replace(V.fullPath,Ve({scroll:y&&T&&T.scroll},me)):a.push(V.fullPath,me)),o.value=V,ve(V,re,le,y),ue()}let P;function W(){P||(P=a.listen((V,re,le)=>{if(!oe.listening)return;const ge=E(V),me=S(ge,oe.currentRoute.value);if(me){D(Ve(me,{replace:!0,force:!0}),ge).catch(Qa);return}c=ge;const De=o.value;Xn&&V0(ed(De.fullPath,le.delta),tr()),L(ge,De).catch(y=>Os(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_CANCELLED)?y:Os(y,rt.NAVIGATION_GUARD_REDIRECT)?(D(Ve(v(y.to),{force:!0}),ge).then(T=>{Os(T,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&!le.delta&&le.type===po.pop&&a.go(-1,!1)}).catch(Qa),Promise.reject()):(le.delta&&a.go(-le.delta,!1),O(y,ge,De))).then(y=>{y=y||F(ge,De,!1),y&&(le.delta&&!Os(y,rt.NAVIGATION_CANCELLED)?a.go(-le.delta,!1):le.type===po.pop&&Os(y,rt.NAVIGATION_ABORTED|rt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(ge,De,y)}).catch(Qa)}))}let B=Pa(),j=Pa(),N;function O(V,re,le){ue(V);const ge=j.list();return ge.length?ge.forEach(me=>me(V,re,le)):console.error(V),Promise.reject(V)}function z(){return N&&o.value!==an?Promise.resolve():new Promise((V,re)=>{B.add([V,re])})}function ue(V){return N||(N=!V,W(),B.list().forEach(([re,le])=>V?le(V):re()),B.reset()),V}function ve(V,re,le,ge){const{scrollBehavior:me}=e;if(!Xn||!me)return Promise.resolve();const De=!le&&q0(ed(V.fullPath,0))||(ge||!le)&&history.state&&history.state.scroll||null;return Et().then(()=>me(V,re,De)).then(y=>y&&j0(y)).catch(y=>O(y,V,re))}const se=V=>a.go(V);let de;const Y=new Set,oe={currentRoute:o,listening:!0,addRoute:p,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:g,resolve:E,options:e,push:x,replace:R,go:se,back:()=>se(-1),forward:()=>se(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:j.add,isReady:z,install(V){V.component("RouterLink",y_),V.component("RouterView",w_),V.config.globalProperties.$router=oe,Object.defineProperty(V.config.globalProperties,"$route",{enumerable:!0,get:()=>Es(o)}),Xn&&!de&&o.value===an&&(de=!0,x(a.location).catch(ge=>{}));const re={};for(const ge in an)Object.defineProperty(re,ge,{get:()=>o.value[ge],enumerable:!0});V.provide(sr,oe),V.provide(bc,Eo(re)),V.provide(go,o);const le=V.unmount;Y.add(V),V.unmount=function(){Y.delete(V),Y.size<1&&(c=an,P&&P(),P=null,o.value=an,de=!1,N=!1),le()}}};function Ie(V){return V.reduce((re,le)=>re.then(()=>I(le)),Promise.resolve())}return oe}function zh(){return us(sr)}function T_(e){return us(bc)}const C_=[{group:"",label:"Dashboard",icon:"📊",to:{path:"/dashboard"}},{group:"",label:"Chat",icon:"💭",to:{path:"/chat"}},{group:"Operations",label:"Live",icon:"🎯",to:{path:"/operations",query:{tab:"live"}}},{group:"Operations",label:"Agents",icon:"🎯",to:{path:"/operations",query:{tab:"agents"}}},{group:"Operations",label:"Loops",icon:"🎯",to:{path:"/operations",query:{tab:"loops"}}},{group:"Operations",label:"Processes",icon:"🎯",to:{path:"/operations",query:{tab:"processes"}}},{group:"Operations",label:"Schedules",icon:"🎯",to:{path:"/operations",query:{tab:"schedules"}}},{group:"History",label:"Audit",icon:"📝",to:{path:"/history",query:{tab:"audit"}}},{group:"History",label:"Sessions",icon:"📝",to:{path:"/history",query:{tab:"sessions"}}},{group:"History",label:"Traces",icon:"📝",to:{path:"/history",query:{tab:"traces"}}},{group:"History",label:"Usage",icon:"📝",to:{path:"/history",query:{tab:"usage"}}},{group:"Capabilities",label:"Tools",icon:"🔧",to:{path:"/capabilities",query:{tab:"tools"}}},{group:"Capabilities",label:"Skills",icon:"🔧",to:{path:"/capabilities",query:{tab:"skills"}}},{group:"Capabilities",label:"Knowledge",icon:"🔧",to:{path:"/capabilities",query:{tab:"knowledge"}}},{group:"Capabilities",label:"Memory",icon:"🔧",to:{path:"/capabilities",query:{tab:"memory"}}},{group:"Capabilities",label:"Learned",icon:"🔧",to:{path:"/capabilities",query:{tab:"learned"}}},{group:"",label:"Personality",icon:"🎭",to:{path:"/personality"}},{group:"System",label:"Health",icon:"⚙️",to:{path:"/system",query:{tab:"health"}}},{group:"System",label:"Resources",icon:"⚙️",to:{path:"/system",query:{tab:"resources"}}},{group:"System",label:"Logs",icon:"⚙️",to:{path:"/system",query:{tab:"logs"}}},{group:"System",label:"Config",icon:"⚙️",to:{path:"/system",query:{tab:"config"}}},{group:"System",label:"Discord",icon:"⚙️",to:{path:"/system",query:{tab:"discord"}}},{group:"System",label:"Host Access",icon:"⚙️",to:{path:"/system",query:{tab:"host-access"}}},{group:"System",label:"API Tokens",icon:"⚙️",to:{path:"/system",query:{tab:"api-tokens"}}},{group:"System",label:"LLM Config",icon:"⚙️",to:{path:"/system",query:{tab:"llm"}}},{group:"System",label:"Internals",icon:"⚙️",to:{path:"/system",query:{tab:"internals"}}},{group:"System",label:"Update",icon:"⚙️",to:{path:"/system",query:{tab:"update"}}}],Jt=gn({open:!1,query:"",selected:0});function E_(){Jt.query="",Jt.selected=0,Jt.open=!0}function Rr(){Jt.open=!1}function A_(e,t){const s=e.label.toLowerCase(),a=((e.group?e.group+" ":"")+e.label).toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const R_={setup(){const e=zh(),t=h(null),s=ee(()=>{const i=Jt.query.trim().toLowerCase();return C_.map(l=>({...l,_score:A_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ds(()=>Jt.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),ds(()=>Jt.query,()=>{Jt.selected=0});function n(i){Rr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Rr();return}if(i.key==="ArrowDown")i.preventDefault(),Jt.selected=Math.min(Jt.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Jt.selected=Math.max(Jt.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Jt.selected];l&&n(l)}}return{state:Jt,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Rr}},template:`
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
  `};function yc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ta(e){const t=yc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function xc(e){const t=yc(e);return t?t.toLocaleTimeString():"—"}function Kh(e){const t=yc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function _a(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function _c(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Gh(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function pd(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Wh(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function I_(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const N_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let d=0;const f=ee(()=>{const P=e.value.uptime_seconds||0,W=Math.floor(P/86400),B=Math.floor(P%86400/3600),j=Math.floor(P%3600/60),N=[];return W>0&&N.push(`${W}d`),B>0&&N.push(`${B}h`),(N.length===0||W===0&&B===0)&&N.push(`${j}m`),N.join(" ")}),p=ee(()=>{const P=e.value.uptime_seconds||0;return 125.66*(1-Math.min(P/86400,1))}),m=ee(()=>{const P=e.value;return[{label:"Guilds",value:P.guild_count??0,icon:"⌂",iconColor:"text-blue-400"},{label:"Sessions",value:P.session_count??0,icon:"☰",iconColor:"text-yellow-400"},{label:"Tools",value:P.tool_count??0,icon:"⚒",iconColor:"text-purple-400",sub:`${P.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:P.loop_count??0,icon:"⟳",iconColor:"text-green-400",color:P.loop_count>0?"text-green-400":"",highlight:P.loop_count>0},{label:"Agents",value:P.agent_running??0,icon:"⚓",iconColor:"text-cyan-400",sub:P.agent_count>0?`${P.agent_count} total`:"",subColor:"text-gray-500",highlight:(P.agent_running??0)>0},{label:"Processes",value:P.process_running??0,icon:"⚙",iconColor:"text-orange-400",sub:P.process_count>0?`${P.process_count} total`:"",subColor:"text-gray-500",highlight:(P.process_running??0)>0},{label:"Schedules",value:P.schedule_count??0,icon:"⏰",iconColor:"text-amber-400",sub:(P.schedule_failing>0?`${P.schedule_failing} failing`:"")+(P.schedule_failing>0&&P.schedule_paused>0?", ":"")+(P.schedule_paused>0?`${P.schedule_paused} paused`:"")||void 0,subColor:P.schedule_failing>0?"text-red-400":"text-yellow-400",color:P.schedule_failing>0?"text-red-400":"",highlight:P.schedule_failing>0},{label:"Users",value:P.user_count??0,icon:"☺",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"≡",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=ee(()=>{const P=e.value,W=[];return W.push({label:"Bot",status:P.status==="online"?"ok":"warn",detail:P.status==="online"?"Online":"Starting"}),(P.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${P.schedule_failing} failing`}):(P.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${P.schedule_count} configured`}),(P.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${P.loop_count} active`}),(P.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${P.agent_running} running`}),(P.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${P.process_running} running`}),W});async function k(){try{e.value=await K.get("/api/status"),s.value=null}catch(P){s.value=P.message}finally{t.value=!1}}async function E(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function v(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function b(){try{const P=await K.get("/api/knowledge");c.value=(Array.isArray(P)?P:[]).reduce((W,B)=>W+(B.chunks||0),0)}catch{c.value=null}}async function x(){try{const P=await K.get("/api/agents");r.value=P.filter(W=>W.status==="running")}catch{}}async function R(){u.value={...u.value,reload:!0};try{await K.post("/api/reload"),xe.success("Config reloaded")}catch(P){xe.error(P.message)}u.value={...u.value,reload:!1}}async function S(){if(!await ns({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const B=await K.post("/api/sessions/clear-all");xe.success(`Cleared ${B.count} session${B.count!==1?"s":""}`),await k()}catch(B){e.value={...e.value,session_count:W},xe.error(B.message)}u.value={...u.value,clearSessions:!1}}async function D(){if(!await ns({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const B=await K.post("/api/loops/stop-all");xe.success(B.result),await k()}catch(B){e.value={...e.value,loop_count:W},xe.error(B.message)}u.value={...u.value,stopLoops:!1}}function w(){t.value=!0,s.value=null,k(),E(),v(),x()}let I=null,L=null,H=null;function F(P){if(P.payload&&P.payload.tool_name){const W={...P.payload,_isNew:!0,_key:++d};n.value.unshift(W),n.value.length>10&&n.value.pop(),o.value++,W.error&&(i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return $e(async()=>{await Promise.all([k(),E(),v(),x(),b()]),I=setInterval(k,15e3),L=setInterval(x,1e4),qe.subscribe("events",F)}),ft(()=>{I&&clearInterval(I),L&&clearInterval(L),clearTimeout(H),qe.unsubscribe("events",F)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:m,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:u,fetchActivity:E,fetchStatus:k,formatTime:xc,formatDuration:_a,retry:w,reloadConfig:R,clearSessions:S,stopAllLoops:D}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function hd(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function D_(e){if(Array.isArray(e))return e}function O_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(u){c=!0,a=u}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function L_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function P_(e,t){return D_(e)||O_(e,t)||M_(e,t)||L_()}function M_(e,t){if(e){if(typeof e=="string")return hd(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?hd(e,t):void 0}}const Jh=Object.entries,gd=Object.setPrototypeOf,F_=Object.isFrozen,$_=Object.getPrototypeOf,B_=Object.getOwnPropertyDescriptor;let zt=Object.freeze,ps=Object.seal,Zn=Object.create,Yh=typeof Reflect<"u"&&Reflect,mo=Yh.apply,vo=Yh.construct;zt||(zt=function(t){return t});ps||(ps=function(t){return t});mo||(mo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});vo||(vo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Ls=mt(Array.prototype.forEach),U_=mt(Array.prototype.lastIndexOf),md=mt(Array.prototype.pop),Wn=mt(Array.prototype.push),H_=mt(Array.prototype.splice),Ut=Array.isArray,Va=mt(String.prototype.toLowerCase),Ir=mt(String.prototype.toString),vd=mt(String.prototype.match),Jn=mt(String.prototype.replace),bd=mt(String.prototype.indexOf),j_=mt(String.prototype.trim),V_=mt(Number.prototype.toString),q_=mt(Boolean.prototype.toString),yd=typeof BigInt>"u"?null:mt(BigInt.prototype.toString),xd=typeof Symbol>"u"?null:mt(Symbol.prototype.toString),lt=mt(Object.prototype.hasOwnProperty),Ma=mt(Object.prototype.toString),Tt=mt(RegExp.prototype.test),xn=z_(TypeError);function mt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return mo(e,t,n)}}function z_(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return vo(e,s)}}function Re(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Va;if(gd&&gd(e,null),!Ut(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(F_(t)||(t[n]=i),a=i)}e[a]=!0}return e}function K_(e){for(let t=0;t<e.length;t++)lt(e,t)||(e[t]=null);return e}function Ot(e){const t=Zn(null);for(const n of Jh(e)){var s=P_(n,2);const a=s[0],i=s[1];lt(e,a)&&(Ut(i)?t[a]=K_(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Ot(i):t[a]=i)}return t}function G_(e){switch(typeof e){case"string":return e;case"number":return V_(e);case"boolean":return q_(e);case"bigint":return yd?yd(e):"0";case"symbol":return xd?xd(e):"Symbol()";case"undefined":return Ma(e);case"function":case"object":{if(e===null)return Ma(e);const t=e,s=ks(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Ma(n)}return Ma(e)}default:return Ma(e)}}function ks(e,t){for(;e!==null;){const n=B_(e,t);if(n){if(n.get)return mt(n.get);if(typeof n.value=="function")return mt(n.value)}e=$_(e)}function s(){return null}return s}function W_(e){try{return Tt(e,""),!0}catch{return!1}}const _d=zt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Nr=zt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Dr=zt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),J_=zt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Or=zt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),Y_=zt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),kd=zt(["#text"]),wd=zt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Lr=zt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Sd=zt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),qi=zt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Q_=ps(/{{[\w\W]*|^[\w\W]*}}/g),X_=ps(/<%[\w\W]*|^[\w\W]*%>/g),Z_=ps(/\${[\w\W]*/g),ek=ps(/^data-[\-\w.\u00B7-\uFFFF]+$/),tk=ps(/^aria-[\-\w]+$/),Td=ps(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),sk=ps(/^(?:\w+script|data):/i),nk=ps(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),ak=ps(/^html$/i),ik=ps(/^[a-z][.\w]*(-[.\w]+)+$/i),xs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},lk=function(){return typeof window>"u"?null:window},rk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Cd=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Qh(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:lk();const t=he=>Qh(he);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==xs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const u=e.DOMParser,d=e.trustedTypes,f=r.prototype,p=ks(f,"cloneNode"),m=ks(f,"remove"),g=ks(f,"nextSibling"),k=ks(f,"childNodes"),E=ks(f,"parentNode"),v=ks(f,"shadowRoot"),b=ks(f,"attributes"),x=l&&l.prototype?ks(l.prototype,"nodeType"):null,R=l&&l.prototype?ks(l.prototype,"nodeName"):null;if(typeof i=="function"){const he=s.createElement("template");he.content&&he.content.ownerDocument&&(s=he.content.ownerDocument)}let S,D="",w,I=!1,L=0;const H=function(){if(L>0)throw xn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},F=function(_){H(),L++;try{return S.createHTML(_)}finally{L--}},P=function(_){H(),L++;try{return S.createScriptURL(_)}finally{L--}},W=function(){return I||(w=rk(d,a),I=!0),w},B=s,j=B.implementation,N=B.createNodeIterator,O=B.createDocumentFragment,z=B.getElementsByTagName,ue=n.importNode;let ve=Cd();t.isSupported=typeof Jh=="function"&&typeof E=="function"&&j&&j.createHTMLDocument!==void 0;const se=Q_,de=X_,Y=Z_,oe=ek,Ie=tk,V=sk,re=nk,le=ik;let ge=Td,me=null;const De=Re({},[..._d,...Nr,...Dr,...Or,...kd]);let y=null;const T=Re({},[...wd,...Lr,...Sd,...qi]);let M=Object.seal(Zn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),G=null,A=null;const $=Object.seal(Zn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let J=!0,Z=!0,te=!1,Q=!0,pe=!1,ie=!0,ce=!1,ye=!1,Se=!1,Ee=!1,C=!1,X=!1,be=!0,Le=!1;const Je="user-content-";let Ge=!0,St=!1,st={},Ye=null;const en=Re({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let mn=null;const Ai=Re({},["audio","video","img","source","image","track"]);let Ea=null;const Ri=Re({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Hn="http://www.w3.org/1998/Math/MathML",jn="http://www.w3.org/2000/svg",Kt="http://www.w3.org/1999/xhtml";let U=Kt,ne=!1,_e=null;const Qe=Re({},[Hn,jn,Kt],Ir);let nt=Re({},["mi","mo","mn","ms","mtext"]),Nt=Re({},["annotation-xml"]);const lr=Re({},["title","style","font","a","script"]);let Aa=null;const fg=["application/xhtml+xml","text/html"],pg="text/html";let it=null,Vn=null;const hg=s.createElement("form"),Nc=function(_){return _ instanceof RegExp||_ instanceof Function},rr=function(){let _=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Vn&&Vn===_)return;(!_||typeof _!="object")&&(_={}),_=Ot(_),Aa=fg.indexOf(_.PARSER_MEDIA_TYPE)===-1?pg:_.PARSER_MEDIA_TYPE,it=Aa==="application/xhtml+xml"?Ir:Va,me=lt(_,"ALLOWED_TAGS")&&Ut(_.ALLOWED_TAGS)?Re({},_.ALLOWED_TAGS,it):De,y=lt(_,"ALLOWED_ATTR")&&Ut(_.ALLOWED_ATTR)?Re({},_.ALLOWED_ATTR,it):T,_e=lt(_,"ALLOWED_NAMESPACES")&&Ut(_.ALLOWED_NAMESPACES)?Re({},_.ALLOWED_NAMESPACES,Ir):Qe,Ea=lt(_,"ADD_URI_SAFE_ATTR")&&Ut(_.ADD_URI_SAFE_ATTR)?Re(Ot(Ri),_.ADD_URI_SAFE_ATTR,it):Ri,mn=lt(_,"ADD_DATA_URI_TAGS")&&Ut(_.ADD_DATA_URI_TAGS)?Re(Ot(Ai),_.ADD_DATA_URI_TAGS,it):Ai,Ye=lt(_,"FORBID_CONTENTS")&&Ut(_.FORBID_CONTENTS)?Re({},_.FORBID_CONTENTS,it):en,G=lt(_,"FORBID_TAGS")&&Ut(_.FORBID_TAGS)?Re({},_.FORBID_TAGS,it):Ot({}),A=lt(_,"FORBID_ATTR")&&Ut(_.FORBID_ATTR)?Re({},_.FORBID_ATTR,it):Ot({}),st=lt(_,"USE_PROFILES")?_.USE_PROFILES&&typeof _.USE_PROFILES=="object"?Ot(_.USE_PROFILES):_.USE_PROFILES:!1,J=_.ALLOW_ARIA_ATTR!==!1,Z=_.ALLOW_DATA_ATTR!==!1,te=_.ALLOW_UNKNOWN_PROTOCOLS||!1,Q=_.ALLOW_SELF_CLOSE_IN_ATTR!==!1,pe=_.SAFE_FOR_TEMPLATES||!1,ie=_.SAFE_FOR_XML!==!1,ce=_.WHOLE_DOCUMENT||!1,Ee=_.RETURN_DOM||!1,C=_.RETURN_DOM_FRAGMENT||!1,X=_.RETURN_TRUSTED_TYPE||!1,Se=_.FORCE_BODY||!1,be=_.SANITIZE_DOM!==!1,Le=_.SANITIZE_NAMED_PROPS||!1,Ge=_.KEEP_CONTENT!==!1,St=_.IN_PLACE||!1,ge=W_(_.ALLOWED_URI_REGEXP)?_.ALLOWED_URI_REGEXP:Td,U=typeof _.NAMESPACE=="string"?_.NAMESPACE:Kt,nt=lt(_,"MATHML_TEXT_INTEGRATION_POINTS")&&_.MATHML_TEXT_INTEGRATION_POINTS&&typeof _.MATHML_TEXT_INTEGRATION_POINTS=="object"?Ot(_.MATHML_TEXT_INTEGRATION_POINTS):Re({},["mi","mo","mn","ms","mtext"]),Nt=lt(_,"HTML_INTEGRATION_POINTS")&&_.HTML_INTEGRATION_POINTS&&typeof _.HTML_INTEGRATION_POINTS=="object"?Ot(_.HTML_INTEGRATION_POINTS):Re({},["annotation-xml"]);const q=lt(_,"CUSTOM_ELEMENT_HANDLING")&&_.CUSTOM_ELEMENT_HANDLING&&typeof _.CUSTOM_ELEMENT_HANDLING=="object"?Ot(_.CUSTOM_ELEMENT_HANDLING):Zn(null);if(M=Zn(null),lt(q,"tagNameCheck")&&Nc(q.tagNameCheck)&&(M.tagNameCheck=q.tagNameCheck),lt(q,"attributeNameCheck")&&Nc(q.attributeNameCheck)&&(M.attributeNameCheck=q.attributeNameCheck),lt(q,"allowCustomizedBuiltInElements")&&typeof q.allowCustomizedBuiltInElements=="boolean"&&(M.allowCustomizedBuiltInElements=q.allowCustomizedBuiltInElements),pe&&(Z=!1),C&&(Ee=!0),st&&(me=Re({},kd),y=Zn(null),st.html===!0&&(Re(me,_d),Re(y,wd)),st.svg===!0&&(Re(me,Nr),Re(y,Lr),Re(y,qi)),st.svgFilters===!0&&(Re(me,Dr),Re(y,Lr),Re(y,qi)),st.mathMl===!0&&(Re(me,Or),Re(y,Sd),Re(y,qi))),$.tagCheck=null,$.attributeCheck=null,lt(_,"ADD_TAGS")&&(typeof _.ADD_TAGS=="function"?$.tagCheck=_.ADD_TAGS:Ut(_.ADD_TAGS)&&(me===De&&(me=Ot(me)),Re(me,_.ADD_TAGS,it))),lt(_,"ADD_ATTR")&&(typeof _.ADD_ATTR=="function"?$.attributeCheck=_.ADD_ATTR:Ut(_.ADD_ATTR)&&(y===T&&(y=Ot(y)),Re(y,_.ADD_ATTR,it))),lt(_,"ADD_URI_SAFE_ATTR")&&Ut(_.ADD_URI_SAFE_ATTR)&&Re(Ea,_.ADD_URI_SAFE_ATTR,it),lt(_,"FORBID_CONTENTS")&&Ut(_.FORBID_CONTENTS)&&(Ye===en&&(Ye=Ot(Ye)),Re(Ye,_.FORBID_CONTENTS,it)),lt(_,"ADD_FORBID_CONTENTS")&&Ut(_.ADD_FORBID_CONTENTS)&&(Ye===en&&(Ye=Ot(Ye)),Re(Ye,_.ADD_FORBID_CONTENTS,it)),Ge&&(me["#text"]=!0),ce&&Re(me,["html","head","body"]),me.table&&(Re(me,["tbody"]),delete G.tbody),_.TRUSTED_TYPES_POLICY){if(typeof _.TRUSTED_TYPES_POLICY.createHTML!="function")throw xn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof _.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw xn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ae=S;S=_.TRUSTED_TYPES_POLICY;try{D=F("")}catch(we){throw S=ae,we}}else _.TRUSTED_TYPES_POLICY===null?(S=void 0,D=""):(S===void 0&&(S=W()),S&&typeof D=="string"&&(D=F("")));(ve.uponSanitizeElement.length>0||ve.uponSanitizeAttribute.length>0)&&me===De&&(me=Ot(me)),ve.uponSanitizeAttribute.length>0&&y===T&&(y=Ot(y)),zt&&zt(_),Vn=_},Dc=Re({},[...Nr,...Dr,...J_]),Oc=Re({},[...Or,...Y_]),gg=function(_){let q=E(_);(!q||!q.tagName)&&(q={namespaceURI:U,tagName:"template"});const ae=Va(_.tagName),we=Va(q.tagName);return _e[_.namespaceURI]?_.namespaceURI===jn?q.namespaceURI===Kt?ae==="svg":q.namespaceURI===Hn?ae==="svg"&&(we==="annotation-xml"||nt[we]):!!Dc[ae]:_.namespaceURI===Hn?q.namespaceURI===Kt?ae==="math":q.namespaceURI===jn?ae==="math"&&Nt[we]:!!Oc[ae]:_.namespaceURI===Kt?q.namespaceURI===jn&&!Nt[we]||q.namespaceURI===Hn&&!nt[we]?!1:!Oc[ae]&&(lr[ae]||!Dc[ae]):!!(Aa==="application/xhtml+xml"&&_e[_.namespaceURI]):!1},hs=function(_){Wn(t.removed,{element:_});try{E(_).removeChild(_)}catch{if(m(_),!E(_))throw xn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Lc=function(_){const q=k?k(_):_.childNodes;if(q){const we=[];Ls(q,Ce=>{Wn(we,Ce)}),Ls(we,Ce=>{try{m(Ce)}catch{}})}const ae=b?b(_):null;if(ae)for(let we=ae.length-1;we>=0;--we){const Ce=ae[we],Ne=Ce&&Ce.name;if(typeof Ne=="string")try{_.removeAttribute(Ne)}catch{}}},vn=function(_,q){try{Wn(t.removed,{attribute:q.getAttributeNode(_),from:q})}catch{Wn(t.removed,{attribute:null,from:q})}if(q.removeAttribute(_),_==="is")if(Ee||C)try{hs(q)}catch{}else try{q.setAttribute(_,"")}catch{}},mg=function(_){const q=b?b(_):_.attributes;if(q)for(let ae=q.length-1;ae>=0;--ae){const we=q[ae],Ce=we&&we.name;if(!(typeof Ce!="string"||y[it(Ce)]))try{_.removeAttribute(Ce)}catch{}}},vg=function(_){const q=[_];for(;q.length>0;){const ae=q.pop();(x?x(ae):ae.nodeType)===xs.element&&mg(ae);const Ce=k?k(ae):ae.childNodes;if(Ce)for(let Ne=Ce.length-1;Ne>=0;--Ne)q.push(Ce[Ne])}},Pc=function(_){let q=null,ae=null;if(Se)_="<remove></remove>"+_;else{const Ne=vd(_,/^[\r\n\t ]+/);ae=Ne&&Ne[0]}Aa==="application/xhtml+xml"&&U===Kt&&(_='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+_+"</body></html>");const we=S?F(_):_;if(U===Kt)try{q=new u().parseFromString(we,Aa)}catch{}if(!q||!q.documentElement){q=j.createDocument(U,"template",null);try{q.documentElement.innerHTML=ne?D:we}catch{}}const Ce=q.body||q.documentElement;return _&&ae&&Ce.insertBefore(s.createTextNode(ae),Ce.childNodes[0]||null),U===Kt?z.call(q,ce?"html":"body")[0]:ce?q.documentElement:Ce},Mc=function(_){return N.call(_.ownerDocument||_,_,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},or=function(_){var q,ae;_.normalize();const we=N.call(_.ownerDocument||_,_,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Ce=we.nextNode();for(;Ce;){let vt=Ce.data;Ls([se,de,Y],Xe=>{vt=Jn(vt,Xe," ")}),Ce.data=vt,Ce=we.nextNode()}const Ne=(q=(ae=_.querySelectorAll)===null||ae===void 0?void 0:ae.call(_,"template"))!==null&&q!==void 0?q:[];Ls(Array.from(Ne),vt=>{qn(vt.content)&&or(vt.content)})},Ii=function(_){const q=R?R(_):null;return typeof q!="string"||it(q)!=="form"?!1:typeof _.nodeName!="string"||typeof _.textContent!="string"||typeof _.removeChild!="function"||_.attributes!==b(_)||typeof _.removeAttribute!="function"||typeof _.setAttribute!="function"||typeof _.namespaceURI!="string"||typeof _.insertBefore!="function"||typeof _.hasChildNodes!="function"||_.nodeType!==x(_)||_.childNodes!==k(_)},qn=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return x(_)===xs.documentFragment}catch{return!1}},Ra=function(_){if(!x||typeof _!="object"||_===null)return!1;try{return typeof x(_)=="number"}catch{return!1}};function Is(he,_,q){Ls(he,ae=>{ae.call(t,_,q,Vn)})}const Fc=function(_){let q=null;if(Is(ve.beforeSanitizeElements,_,null),Ii(_))return hs(_),!0;const ae=it(R?R(_):_.nodeName);if(Is(ve.uponSanitizeElement,_,{tagName:ae,allowedTags:me}),ie&&_.hasChildNodes()&&!Ra(_.firstElementChild)&&Tt(/<[/\w!]/g,_.innerHTML)&&Tt(/<[/\w!]/g,_.textContent)||ie&&_.namespaceURI===Kt&&ae==="style"&&Ra(_.firstElementChild)||_.nodeType===xs.progressingInstruction||ie&&_.nodeType===xs.comment&&Tt(/<[/\w]/g,_.data))return hs(_),!0;if(G[ae]||!($.tagCheck instanceof Function&&$.tagCheck(ae))&&!me[ae]){if(!G[ae]&&Bc(ae)&&(M.tagNameCheck instanceof RegExp&&Tt(M.tagNameCheck,ae)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ae)))return!1;if(Ge&&!Ye[ae]){const Ce=E(_),Ne=k(_);if(Ne&&Ce){const vt=Ne.length;for(let Xe=vt-1;Xe>=0;--Xe){const ct=St?Ne[Xe]:p(Ne[Xe],!0);Ce.insertBefore(ct,g(_))}}}return hs(_),!0}return(x?x(_):_.nodeType)===xs.element&&!gg(_)||(ae==="noscript"||ae==="noembed"||ae==="noframes")&&Tt(/<\/no(script|embed|frames)/i,_.innerHTML)?(hs(_),!0):(pe&&_.nodeType===xs.text&&(q=_.textContent,Ls([se,de,Y],Ce=>{q=Jn(q,Ce," ")}),_.textContent!==q&&(Wn(t.removed,{element:_.cloneNode()}),_.textContent=q)),Is(ve.afterSanitizeElements,_,null),!1)},$c=function(_,q,ae){if(A[q]||be&&(q==="id"||q==="name")&&(ae in s||ae in hg))return!1;const we=y[q]||$.attributeCheck instanceof Function&&$.attributeCheck(q,_);if(!(Z&&!A[q]&&Tt(oe,q))){if(!(J&&Tt(Ie,q))){if(!we||A[q]){if(!(Bc(_)&&(M.tagNameCheck instanceof RegExp&&Tt(M.tagNameCheck,_)||M.tagNameCheck instanceof Function&&M.tagNameCheck(_))&&(M.attributeNameCheck instanceof RegExp&&Tt(M.attributeNameCheck,q)||M.attributeNameCheck instanceof Function&&M.attributeNameCheck(q,_))||q==="is"&&M.allowCustomizedBuiltInElements&&(M.tagNameCheck instanceof RegExp&&Tt(M.tagNameCheck,ae)||M.tagNameCheck instanceof Function&&M.tagNameCheck(ae))))return!1}else if(!Ea[q]){if(!Tt(ge,Jn(ae,re,""))){if(!((q==="src"||q==="xlink:href"||q==="href")&&_!=="script"&&bd(ae,"data:")===0&&mn[_])){if(!(te&&!Tt(V,Jn(ae,re,"")))){if(ae)return!1}}}}}}return!0},bg=Re({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Bc=function(_){return!bg[Va(_)]&&Tt(le,_)},Uc=function(_){Is(ve.beforeSanitizeAttributes,_,null);const q=_.attributes;if(!q||Ii(_))return;const ae={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let we=q.length;for(;we--;){const Ce=q[we],Ne=Ce.name,vt=Ce.namespaceURI,Xe=Ce.value,ct=it(Ne),tn=Xe;let _t=Ne==="value"?tn:j_(tn);if(ae.attrName=ct,ae.attrValue=_t,ae.keepAttr=!0,ae.forceKeepAttr=void 0,Is(ve.uponSanitizeAttribute,_,ae),_t=ae.attrValue,Le&&(ct==="id"||ct==="name")&&bd(_t,Je)!==0&&(vn(Ne,_),_t=Je+_t),ie&&Tt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,_t)){vn(Ne,_);continue}if(ct==="attributename"&&vd(_t,"href")){vn(Ne,_);continue}if(ae.forceKeepAttr)continue;if(!ae.keepAttr){vn(Ne,_);continue}if(!Q&&Tt(/\/>/i,_t)){vn(Ne,_);continue}pe&&Ls([se,de,Y],jc=>{_t=Jn(_t,jc," ")});const Hc=it(_.nodeName);if(!$c(Hc,ct,_t)){vn(Ne,_);continue}if(S&&typeof d=="object"&&typeof d.getAttributeType=="function"&&!vt)switch(d.getAttributeType(Hc,ct)){case"TrustedHTML":{_t=F(_t);break}case"TrustedScriptURL":{_t=P(_t);break}}if(_t!==tn)try{vt?_.setAttributeNS(vt,Ne,_t):_.setAttribute(Ne,_t),Ii(_)?hs(_):md(t.removed)}catch{vn(Ne,_)}}Is(ve.afterSanitizeAttributes,_,null)},Ni=function(_){let q=null;const ae=Mc(_);for(Is(ve.beforeSanitizeShadowDOM,_,null);q=ae.nextNode();)if(Is(ve.uponSanitizeShadowNode,q,null),Fc(q),Uc(q),qn(q.content)&&Ni(q.content),(x?x(q):q.nodeType)===xs.element){const Ce=v?v(q):q.shadowRoot;qn(Ce)&&(cr(Ce),Ni(Ce))}Is(ve.afterSanitizeShadowDOM,_,null)},cr=function(_){const q=[{node:_,shadow:null}];for(;q.length>0;){const ae=q.pop();if(ae.shadow){Ni(ae.shadow);continue}const we=ae.node,Ne=(x?x(we):we.nodeType)===xs.element,vt=k?k(we):we.childNodes;if(vt)for(let Xe=vt.length-1;Xe>=0;--Xe)q.push({node:vt[Xe],shadow:null});if(Ne){const Xe=R?R(we):null;if(typeof Xe=="string"&&it(Xe)==="template"){const ct=we.content;qn(ct)&&q.push({node:ct,shadow:null})}}if(Ne){const Xe=v?v(we):we.shadowRoot;qn(Xe)&&q.push({node:null,shadow:Xe},{node:Xe,shadow:null})}}};return t.sanitize=function(he){let _=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},q=null,ae=null,we=null,Ce=null;if(ne=!he,ne&&(he="<!-->"),typeof he!="string"&&!Ra(he)&&(he=G_(he),typeof he!="string"))throw xn("dirty is not a string, aborting");if(!t.isSupported)return he;ye||rr(_),t.removed=[];const Ne=St&&typeof he!="string"&&Ra(he);if(Ne){const ct=R?R(he):he.nodeName;if(typeof ct=="string"){const tn=it(ct);if(!me[tn]||G[tn])throw xn("root node is forbidden and cannot be sanitized in-place")}if(Ii(he))throw xn("root node is clobbered and cannot be sanitized in-place");try{cr(he)}catch(tn){throw Lc(he),tn}}else if(Ra(he))q=Pc("<!---->"),ae=q.ownerDocument.importNode(he,!0),ae.nodeType===xs.element&&ae.nodeName==="BODY"||ae.nodeName==="HTML"?q=ae:q.appendChild(ae),cr(ae);else{if(!Ee&&!pe&&!ce&&he.indexOf("<")===-1)return S&&X?F(he):he;if(q=Pc(he),!q)return Ee?null:X?D:""}q&&Se&&hs(q.firstChild);const vt=Mc(Ne?he:q);try{for(;we=vt.nextNode();)Fc(we),Uc(we),qn(we.content)&&Ni(we.content)}catch(ct){throw Ne&&Lc(he),ct}if(Ne)return Ls(t.removed,ct=>{ct.element&&vg(ct.element)}),pe&&or(he),he;if(Ee){if(pe&&or(q),C)for(Ce=O.call(q.ownerDocument);q.firstChild;)Ce.appendChild(q.firstChild);else Ce=q;return(y.shadowroot||y.shadowrootmode)&&(Ce=ue.call(n,Ce,!0)),Ce}let Xe=ce?q.outerHTML:q.innerHTML;return ce&&me["!doctype"]&&q.ownerDocument&&q.ownerDocument.doctype&&q.ownerDocument.doctype.name&&Tt(ak,q.ownerDocument.doctype.name)&&(Xe="<!DOCTYPE "+q.ownerDocument.doctype.name+`>
`+Xe),pe&&Ls([se,de,Y],ct=>{Xe=Jn(Xe,ct," ")}),S&&X?F(Xe):Xe},t.setConfig=function(){let he=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};rr(he),ye=!0},t.clearConfig=function(){Vn=null,ye=!1,S=w,D=""},t.isValidAttribute=function(he,_,q){Vn||rr({});const ae=it(he),we=it(_);return $c(ae,we,q)},t.addHook=function(he,_){typeof _=="function"&&Wn(ve[he],_)},t.removeHook=function(he,_){if(_!==void 0){const q=U_(ve[he],_);return q===-1?void 0:H_(ve[he],q,1)[0]}return md(ve[he])},t.removeHooks=function(he){ve[he]=[]},t.removeAllHooks=function(){ve=Cd()},t}var Ed=Qh();function kc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Un=kc();function Xh(e){Un=e}var Xa={exec:()=>null};function ze(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Vt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Vt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},ok=/^(?:[ \t]*(?:\n|$))+/,ck=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,uk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Ei=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,dk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,wc=/(?:[*+-]|\d{1,9}[.)])/,Zh=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,eg=ze(Zh).replace(/bull/g,wc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),fk=ze(Zh).replace(/bull/g,wc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Sc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,pk=/^[^\n]+/,Tc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,hk=ze(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Tc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),gk=ze(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,wc).getRegex(),nr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Cc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,mk=ze("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Cc).replace("tag",nr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),tg=ze(Sc).replace("hr",Ei).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",nr).getRegex(),vk=ze(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",tg).getRegex(),Ec={blockquote:vk,code:ck,def:hk,fences:uk,heading:dk,hr:Ei,html:mk,lheading:eg,list:gk,newline:ok,paragraph:tg,table:Xa,text:pk},Ad=ze("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Ei).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",nr).getRegex(),bk={...Ec,lheading:fk,table:Ad,paragraph:ze(Sc).replace("hr",Ei).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Ad).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",nr).getRegex()},yk={...Ec,html:ze(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Cc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Xa,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:ze(Sc).replace("hr",Ei).replace("heading",` *#{1,6} *[^
]`).replace("lheading",eg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},xk=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,_k=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,sg=/^( {2,}|\\)\n(?!\s*$)/,kk=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,ar=/[\p{P}\p{S}]/u,Ac=/[\s\p{P}\p{S}]/u,ng=/[^\s\p{P}\p{S}]/u,wk=ze(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Ac).getRegex(),ag=/(?!~)[\p{P}\p{S}]/u,Sk=/(?!~)[\s\p{P}\p{S}]/u,Tk=/(?:[^\s\p{P}\p{S}]|~)/u,Ck=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,ig=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Ek=ze(ig,"u").replace(/punct/g,ar).getRegex(),Ak=ze(ig,"u").replace(/punct/g,ag).getRegex(),lg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Rk=ze(lg,"gu").replace(/notPunctSpace/g,ng).replace(/punctSpace/g,Ac).replace(/punct/g,ar).getRegex(),Ik=ze(lg,"gu").replace(/notPunctSpace/g,Tk).replace(/punctSpace/g,Sk).replace(/punct/g,ag).getRegex(),Nk=ze("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,ng).replace(/punctSpace/g,Ac).replace(/punct/g,ar).getRegex(),Dk=ze(/\\(punct)/,"gu").replace(/punct/g,ar).getRegex(),Ok=ze(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Lk=ze(Cc).replace("(?:-->|$)","-->").getRegex(),Pk=ze("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Lk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),El=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,Mk=ze(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",El).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),rg=ze(/^!?\[(label)\]\[(ref)\]/).replace("label",El).replace("ref",Tc).getRegex(),og=ze(/^!?\[(ref)\](?:\[\])?/).replace("ref",Tc).getRegex(),Fk=ze("reflink|nolink(?!\\()","g").replace("reflink",rg).replace("nolink",og).getRegex(),Rc={_backpedal:Xa,anyPunctuation:Dk,autolink:Ok,blockSkip:Ck,br:sg,code:_k,del:Xa,emStrongLDelim:Ek,emStrongRDelimAst:Rk,emStrongRDelimUnd:Nk,escape:xk,link:Mk,nolink:og,punctuation:wk,reflink:rg,reflinkSearch:Fk,tag:Pk,text:kk,url:Xa},$k={...Rc,link:ze(/^!?\[(label)\]\((.*?)\)/).replace("label",El).getRegex(),reflink:ze(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",El).getRegex()},bo={...Rc,emStrongRDelimAst:Ik,emStrongLDelim:Ak,url:ze(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Bk={...bo,br:ze(sg).replace("{2,}","*").getRegex(),text:ze(bo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},zi={normal:Ec,gfm:bk,pedantic:yk},Fa={normal:Rc,gfm:bo,breaks:Bk,pedantic:$k},Uk={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Rd=e=>Uk[e];function ws(e,t){if(t){if(Vt.escapeTest.test(e))return e.replace(Vt.escapeReplace,Rd)}else if(Vt.escapeTestNoEncode.test(e))return e.replace(Vt.escapeReplaceNoEncode,Rd);return e}function Id(e){try{e=encodeURI(e).replace(Vt.percentDecode,"%")}catch{return null}return e}function Nd(e,t){var i;const s=e.replace(Vt.findPipe,(l,r,o)=>{let c=!1,u=r;for(;--u>=0&&o[u]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Vt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Vt.slashPipe,"|");return n}function $a(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function Hk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Dd(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function jk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Al=class{constructor(e){We(this,"options");We(this,"rules");We(this,"lexer");this.options=e||Un}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:$a(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=jk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=$a(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:$a(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,E=>" ".repeat(3*E.length)),f=e.split(`
`,1)[0],p=!d.trim(),m=0;if(this.options.pedantic?(m=2,u=d.trimStart()):p?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,u=d.slice(m),m+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const E=this.rules.other.nextBulletRegex(m),v=this.rules.other.hrRegex(m),b=this.rules.other.fencesBeginRegex(m),x=this.rules.other.headingBeginRegex(m),R=this.rules.other.htmlBeginRegex(m);for(;e;){const S=e.split(`
`,1)[0];let D;if(f=S,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),D=f):D=f.replace(this.rules.other.tabCharGlobal,"    "),b.test(f)||x.test(f)||R.test(f)||E.test(f)||v.test(f))break;if(D.search(this.rules.other.nonSpaceChar)>=m||!f.trim())u+=`
`+D.slice(m);else{if(p||d.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||b.test(d)||x.test(d)||v.test(d))break;u+=`
`+f}!p&&!f.trim()&&(p=!0),c+=S+`
`,e=e.substring(S.length+1),d=D.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,k;this.options.gfm&&(g=this.rules.other.listIsTask.exec(u),g&&(k=g[0]!=="[ ] ",u=u.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:k,loose:!1,text:u,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(d=>d.type==="space"),u=c.length>0&&c.some(d=>this.rules.other.anyLine.test(d.raw));a.loose=u}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Nd(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Nd(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=$a(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Hk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Dd(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Dd(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const u=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(u.lastIndex=0,t=t.slice(-1*e.length+i);(n=u.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const d=[...n[0]][0].length,f=e.slice(0,i+n.index+d+r);if(Math.min(i,r)%2){const m=f.slice(1,-1);return{type:"em",raw:f,text:m,tokens:this.lexer.inlineTokens(m)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},js=class yo{constructor(t){We(this,"tokens");We(this,"options");We(this,"state");We(this,"tokenizer");We(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Un,this.options.tokenizer=this.options.tokenizer||new Al,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Vt,block:zi.normal,inline:Fa.normal};this.options.pedantic?(s.block=zi.pedantic,s.inline=Fa.pedantic):this.options.gfm&&(s.block=zi.gfm,this.options.breaks?s.inline=Fa.breaks:s.inline=Fa.gfm),this.tokenizer.rules=s}static get rules(){return{block:zi,inline:Fa}}static lex(t,s){return new yo(s).lex(t)}static lexInline(t,s){return new yo(s).inlineTokens(t)}lex(t){t=t.replace(Vt.carriageReturn,`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ws(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Id(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+ws(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Id(e);if(a===null)return ws(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ws(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ws(e.text)}},Ic=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Vs=class xo{constructor(t){We(this,"options");We(this,"renderer");We(this,"textRenderer");this.options=t||Un,this.options.renderer=this.options.renderer||new Rl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Ic}static parse(t,s){return new xo(s).parse(t)}static parseInline(t,s){return new xo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,u=this.options.extensions.renderers[c.type].call({parser:this},c);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=u||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,u=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],u+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:u,text:u,tokens:[{type:"text",raw:u,text:u,escaped:!0}]}):n+=u;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Br,Zi=(Br=class{constructor(e){We(this,"options");We(this,"block");this.options=e||Un}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?js.lex:js.lexInline}provideParser(){return this.block?Vs.parse:Vs.parseInline}},We(Br,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Br),Vk=class{constructor(...e){We(this,"defaults",kc());We(this,"options",this.setOptions);We(this,"parse",this.parseMarkdown(!0));We(this,"parseInline",this.parseMarkdown(!1));We(this,"Parser",Vs);We(this,"Renderer",Rl);We(this,"TextRenderer",Ic);We(this,"Lexer",js);We(this,"Tokenizer",Al);We(this,"Hooks",Zi);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Rl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Al(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Zi;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Zi.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(d=>o.call(a,d));const u=r.call(a,c);return o.call(a,u)}:a[l]=(...c)=>{let u=r.apply(a,c);return u===!1&&(u=o.apply(a,c)),u}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return js.lex(e,t??this.defaults)}parser(e,t){return Vs.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?js.lex:js.lexInline,o=i.hooks?i.hooks.provideParser():e?Vs.parse:Vs.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let u=o(c,i);return i.hooks&&(u=i.hooks.postprocess(u)),u}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+ws(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Pn=new Vk;function je(e,t){return Pn.parse(e,t)}je.options=je.setOptions=function(e){return Pn.setOptions(e),je.defaults=Pn.defaults,Xh(je.defaults),je};je.getDefaults=kc;je.defaults=Un;je.use=function(...e){return Pn.use(...e),je.defaults=Pn.defaults,Xh(je.defaults),je};je.walkTokens=function(e,t){return Pn.walkTokens(e,t)};je.parseInline=Pn.parseInline;je.Parser=Vs;je.parser=Vs.parse;je.Renderer=Rl;je.TextRenderer=Ic;je.Lexer=js;je.lexer=js.lex;je.Tokenizer=Al;je.Hooks=Zi;je.parse=je;je.options;je.setOptions;je.use;je.walkTokens;je.parseInline;Vs.parse;js.lex;const qk={breaks:!0,gfm:!0};function Od(e){if(!e)return"";try{if(typeof je<"u"&&je.parse){const t=je.parse(e,qk);return typeof Ed<"u"?Ed.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function zk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const Ld={run_command:"⌘",ssh_command:"⌘",run_script:"⌘",read_file:"📄",write_file:"✏️",list_directory:"📂",search_knowledge:"🔍",ingest_document:"📚",generate_image:"🎨",analyze_image:"🖼️",analyze_pdf:"📃",browser_screenshot:"🌐",manage_process:"⚙️"};function Kk(e){return Ld[e]?Ld[e]:"🔧"}const Gk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Pd(e){if(!e)return[];const t=e.match(Gk);return t?[...new Set(t)]:[]}const Wk={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],u=ee(()=>t.value.trim().length>0&&!s.value),d=ee(()=>{const B=qe.state;return B==="connected"?"Connected":B==="reconnecting"?"Reconnecting…":B==="connecting"?"Connecting…":"REST fallback"}),f=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],p=ee(()=>{const B=Math.floor(i.value/4)%f.length,j=i.value;return j>3?`${f[B]} (${j}s)`:f[0]});function m(){Et(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function g(){if(!a.value)return;const B=a.value;B.style.height="auto",B.style.height=Math.min(B.scrollHeight,120)+"px"}function k(B,j,N={}){const O={id:++o,role:B,content:j,timestamp:Date.now(),html:B==="bot"?Od(j):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:B==="bot"?Pd(j):[],files:N.files||[],_showTools:!1};return e.value.push(O),m(),B==="bot"&&Et(()=>E()),O}function E(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(j=>{j.setAttribute("data-copy","true"),j.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const O=j.querySelector("code"),z=O?O.textContent:j.textContent;navigator.clipboard.writeText(z).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),j.appendChild(N)})}function v(B){if(B===0)return!0;const j=e.value[B-1],N=e.value[B],O=new Date(j.timestamp).toDateString(),z=new Date(N.timestamp).toDateString();return O!==z}function b(B){const j=new Date(B),N=new Date;if(j.toDateString()===N.toDateString())return"Today";const O=new Date(N);return O.setDate(O.getDate()-1),j.toDateString()===O.toDateString()?"Yesterday":j.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function x(B){t.value=B,Et(()=>H())}function R(B){window.open(B,"_blank","noopener")}function S(B){B.target.style.display="none"}function D(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function w(){r&&(clearInterval(r),r=null),i.value=0}function I(B){s.value&&(s.value=!1,w(),B.type==="chat_response"?k("bot",B.content,{tools_used:B.tools_used||[],is_error:B.is_error||!1,files:B.files||[]}):B.type==="chat_error"&&k("bot",B.error||"Unknown error",{is_error:!0}),Et(()=>{var j;return(j=a.value)==null?void 0:j.focus()}))}async function L(B){try{const j=await K.post("/api/chat",{content:B,channel_id:l.value});k("bot",j.response,{tools_used:j.tools_used||[],is_error:j.is_error||!1,files:j.files||[]})}catch(j){k("bot",j.message||"Failed to send message",{is_error:!0})}}async function H(){const B=t.value.trim();!B||s.value||(k("user",B),t.value="",s.value=!0,D(),a.value&&(a.value.style.height="auto"),qe.connected?qe.sendChat(B,{channelId:l.value})?P():(await L(B),s.value=!1,w()):(await L(B),s.value=!1,w()),Et(()=>{var j;return(j=a.value)==null?void 0:j.focus()}))}let F=null;ds(s,B=>{B||F&&(clearTimeout(F),F=null)});function P(){F=setTimeout(()=>{s.value&&(s.value=!1,w(),k("bot","Response timed out. Try again.",{is_error:!0}))},12e4)}async function W(){try{if(!l.value){const j=await K.get("/api/auth/session");l.value=j.channel_id||j.user_id||"web-user"}const B=await K.get("/api/sessions/"+encodeURIComponent(l.value));if(B&&B.messages&&B.messages.length>0){for(const j of B.messages){const N=j.role==="user"?"user":"bot";let O=j.content||"";if(N==="user"){const ue=O.match(/^\[.*?\]:\s*/);ue&&(O=O.slice(ue[0].length))}if(!O.trim())continue;const z={id:++o,role:N,content:O,timestamp:j.timestamp?j.timestamp*1e3:Date.now(),html:N==="bot"?Od(O):"",tools_used:[],is_error:!1,images:N==="bot"?Pd(O):[],files:[],_showTools:!1};e.value.push(z)}Et(()=>{m(),E()})}}catch{}}return $e(()=>{qe.subscribe("chat",I),W(),Et(()=>{var B;return(B=a.value)==null?void 0:B.focus()})}),ft(()=>{qe.unsubscribe("chat",I),F&&clearTimeout(F),w()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:u,wsStatus:d,typingText:p,suggestions:c,send:H,autoResize:g,formatTime:zk,formatDate:b,showDateSeparator:v,useSuggestion:x,openImage:R,onImageError:S,getToolIcon:Kk}}},ir={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=T_(),s=zh(),n=ee({get(){var r;const l=t.query.tab;return l&&e.tabs.some(o=>o.id===l)?l:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(l){s.replace({query:{...t.query,tab:l}})}}),a=ee(()=>{const l=e.tabs.find(r=>r.id===n.value);return(l==null?void 0:l.component)||null}),i=ee(()=>{const l=e.tabs.find(r=>r.id===n.value);return(l==null?void 0:l.label)||""});return ds(i,l=>{e.groupLabel&&l&&(document.title=`Odin — ${e.groupLabel} › ${l}`)},{immediate:!0}),{activeTab:n,activeComponent:a,activeLabel:i}},template:`
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
  `},Jk={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(c){var f,p,m;const u=c.payload||c,d=u.type||c.type;if(d==="tool_start"){const g={id:`${u.action}-${Date.now()}`,tool:u.action,actor:u.actor||"",channel:u.channel_id||"",iteration:((f=u.metadata)==null?void 0:f.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(g);return}if(d==="tool_end"){const g=e.value.findIndex(k=>k.tool===u.action&&k.status==="running");if(g>=0){const k=e.value[g];k.status=(p=u.metadata)!=null&&p.error?"error":"success",k.elapsed=((m=u.metadata)==null?void 0:m.elapsed_ms)||Date.now()-k.startTime,k.result=u.detail||"",k.fadingOut=!0,setTimeout(()=>{const E=e.value.indexOf(k);E>=0&&e.value.splice(E,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(d==="tool_stream"){const g=u.tool_name||"unknown";if(u.finished)delete s.value[g];else{const E=((s.value[g]||"")+(u.chunk||"")).split(`
`);s.value[g]=E.slice(-30).join(`
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
  `},Yk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=null;const r=ee(()=>e.value.filter(E=>E.status==="running").length),o=ee(()=>e.value.filter(E=>E.status==="completed").length),c=ee(()=>e.value.filter(E=>["failed","timeout","killed"].includes(E.status)).length),u=ee(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),d=ee(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(E=>["failed","timeout","killed"].includes(E.status)):e.value.filter(E=>E.status===i.value));function f(E){return Math.min(100,Math.round(E.iteration_count/30*100))}async function p(E=!1){E=E===!0,E||(t.value=!0);try{const v=await K.get("/api/agents");e.value=Array.isArray(v)?v:[],s.value=null}catch(v){E||(s.value=v.message)}E||(t.value=!1)}async function m(E){const v=e.value.find(x=>x.id===E);if(await ns({title:"Kill agent",message:`Kill agent "${(v==null?void 0:v.label)||E}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=E;try{await K.del(`/api/agents/${encodeURIComponent(E)}`),xe.success("Agent killed"),await p()}catch(x){xe.error(x.message||"Failed to kill agent")}n.value=null}}function g(){k(),a.value&&(l=setInterval(()=>{a.value&&p(!0)},5e3))}function k(){l&&(clearInterval(l),l=null)}return $e(()=>{p(),g()}),ft(()=>{k()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:u,filteredAgents:d,formatTs:Ta,formatDuration:_a,progressPercent:f,fetchAgents:p,killAgent:m,startAutoRefresh:g,stopAutoRefresh:k}}},Qk={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h({}),u=ee(()=>e.value.reduce((S,D)=>S+(D.iteration_count||0),0)),d=ee(()=>e.value.filter(S=>S.status==="running").length);function f(S){return S==="running"?"loop-status-running":S==="error"?"loop-status-error":"loop-status-stopped"}function p(S){return S==="running"?"badge-success":S==="error"?"badge-danger":S==="completed"?"badge-info":"badge-warning"}function m(S){return S==="act"?"badge-warning":S==="silent"?"badge-info":"badge-success"}function g(S){c.value={...c.value,[S]:!c.value[S]}}async function k(S=!1){S=S===!0,S||(t.value=!0);try{e.value=await K.get("/api/loops"),s.value=null}catch(D){S||(s.value=D.message)}S||(t.value=!1)}async function E(){l.value=null;const S=a.value;if(!S.goal.trim()){l.value="Goal is required";return}if(!S.channel_id.trim()){l.value="Channel ID is required";return}const D={goal:S.goal.trim(),channel_id:S.channel_id.trim(),interval_seconds:S.interval_seconds||60,mode:S.mode,max_iterations:S.max_iterations||50};S.stop_condition.trim()&&(D.stop_condition=S.stop_condition.trim()),i.value=!0;try{const w=await K.post("/api/loops",D);xe.success(`Loop started: ${w.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await k()}catch(w){l.value=w.message}i.value=!1}async function v(S){if(await ns({title:"Stop loop",message:`Stop loop ${S}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=S;try{await K.del(`/api/loops/${encodeURIComponent(S)}`),xe.success("Loop stopped"),await k()}catch(w){xe.error(w.message||"Failed to stop loop")}r.value=null}}async function b(S){o.value=S;try{await K.post(`/api/loops/${encodeURIComponent(S)}/restart`),xe.success("Loop restarted"),await k()}catch(D){xe.error(D.message||"Failed to restart loop")}o.value=null}function x(S){S.payload&&(S.payload.loop_id||S.payload.type==="loop")&&k(!0)}let R=null;return $e(()=>{k(),qe.subscribe("events",x),R=setInterval(()=>{k(!0)},5e3)}),ft(()=>{qe.unsubscribe("events",x),R&&clearInterval(R)}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,expandedHistory:c,totalIterations:u,runningCount:d,statusDotClass:f,statusBadge:p,modeBadge:m,formatDuration:_a,formatAge:Kh,toggleHistory:g,fetchLoops:k,doCreate:E,doStop:v,doRestart:b}}},Xk={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=ee(()=>e.value.filter(g=>g.status==="running").length),r=ee(()=>e.value.filter(g=>g.status!=="running").length);function o(g){return g==="running"?"loop-status-running":g==="failed"||g==="error"?"loop-status-error":"loop-status-stopped"}function c(g){return g==="running"?"badge-success":g==="completed"||g==="exited"?"badge-info":g==="killed"||g==="error"||g==="failed"?"badge-danger":"badge-warning"}async function u(g=!1){g=g===!0,g||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(k){g||(s.value=k.message)}g||(t.value=!1)}function d(){f(),n.value&&(a=setInterval(()=>{t.value||u(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ds(n,g=>{g?d():f()});async function p(g){if(await ns({title:"Kill process",message:`Kill process ${g}?`,confirmLabel:"Kill",danger:!0})){i.value=g;try{await K.del(`/api/processes/${g}`),xe.success(`Process ${g} killed`),await u()}catch(E){xe.error(E.message||"Failed to kill process")}i.value=null}}function m(g){g.payload&&(g.payload.pid||g.payload.type==="process")&&u(!0)}return $e(()=>{u(),qe.subscribe("events",m),d()}),ft(()=>{qe.unsubscribe("events",m),f()}),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:_a,fetchProcesses:u,doKill:p}}},Zk={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],u=h(null),d=h(null),f=h(null),p=h(null),m=h(null),g=h([]),k=h(!1),E=ee(()=>e.value.filter(N=>N.cron&&!N.one_time).length),v=ee(()=>e.value.filter(N=>N.one_time).length),b=ee(()=>e.value.filter(N=>N.trigger).length),x=ee(()=>e.value.filter(N=>N.paused).length),R=ee(()=>e.value.filter(N=>N.consecutive_failures>0).length);function S(N){if(!N)return"-";const O=Date.now(),ue=(new Date(N).getTime()-O)/1e3;if(ue<0)return"overdue";if(ue<60)return"in < 1 min";if(ue<3600)return`in ${Math.floor(ue/60)} min`;if(ue<86400){const se=Math.floor(ue/3600),de=Math.floor(ue%3600/60);return de>0?`in ${se}h ${de}m`:`in ${se}h`}const ve=Math.floor(ue/86400);return`in ${ve} day${ve!==1?"s":""}`}function D(N){return N==null?"-":N<1e3?`${N}ms`:N<6e4?`${(N/1e3).toFixed(1)}s`:_a(N/1e3)}function w(){r.value=null}async function I(){const N=a.value.cron.trim();if(N){o.value=!0;try{r.value=await K.post("/api/schedules/validate-cron",{expression:N})}catch(O){r.value={valid:!1,error:O.message}}o.value=!1}}async function L(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(N){s.value=N.message}t.value=!1}async function H(N){if(m.value===N){m.value=null,g.value=[];return}m.value=N,k.value=!0,g.value=[];try{g.value=await K.get(`/api/schedules/${encodeURIComponent(N)}/history?limit=10`)}catch{g.value=[]}k.value=!1}async function F(){l.value=null;const N=a.value;if(!N.description.trim()){l.value="Description is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}if(!N.cron.trim()&&!N.run_at.trim()){l.value="Cron expression or run_at time is required";return}const O={description:N.description.trim(),action:N.action,channel_id:N.channel_id.trim()};if(N.cron.trim()&&(O.cron=N.cron.trim()),N.run_at.trim()&&(O.run_at=N.run_at.trim()),N.action==="reminder"&&N.message.trim()&&(O.message=N.message.trim()),N.action==="check"&&(N.tool_name.trim()&&(O.tool_name=N.tool_name.trim()),N.tool_input_str.trim()))try{O.tool_input=JSON.parse(N.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",O),xe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await L()}catch(z){l.value=z.message}i.value=!1}async function P(N){u.value=N;try{const O=await K.post(`/api/schedules/${encodeURIComponent(N)}/run`);if(O.status==="failure")xe.error(`Execution failed: ${O.error||"unknown error"}`);else{const z=O.warning?`Executed (${O.warning})`:"Executed successfully";xe.success(z)}await L()}catch(O){xe.error(O.message||"Failed to trigger")}u.value=null}async function W(N){f.value=N.id;const O=!N.paused;try{await K.put(`/api/schedules/${encodeURIComponent(N.id)}`,{paused:O}),xe.success(O?"Schedule paused":"Schedule resumed"),await L()}catch(z){xe.error(z.message||"Failed to update schedule")}f.value=null}async function B(N){p.value=N;try{await K.post(`/api/schedules/${encodeURIComponent(N)}/reset-failures`),xe.success("Failure counters reset"),await L()}catch(O){xe.error(O.message||"Failed to reset")}p.value=null}async function j(N){const O=e.value.find(ue=>ue.id===N);if(await ns({title:"Delete schedule",message:`Delete "${(O==null?void 0:O.description)||N}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){d.value=N;try{await K.del(`/api/schedules/${encodeURIComponent(N)}`),xe.success("Schedule deleted"),await L()}catch(ue){xe.error(ue.message||"Failed to delete schedule")}d.value=null}}return $e(()=>{L()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:u,deletingId:d,togglingId:f,resettingId:p,expandedId:m,history:g,historyLoading:k,cronCount:E,oneTimeCount:v,webhookCount:b,pausedCount:x,failingCount:R,formatTs:Ta,formatAge:Kh,formatFuture:S,formatMs:D,formatDuration:_a,onCronInput:w,validateCron:I,toggleExpand:H,fetchSchedules:L,doCreate:F,doRunNow:P,doTogglePause:W,doResetFailures:B,doDelete:j}}},ew={components:{TabbedPage:ir},setup(){return{tabs:[{id:"live",label:"Live",component:Jk},{id:"agents",label:"Agents",component:Yk},{id:"loops",label:"Loops",component:Qk},{id:"processes",label:"Processes",component:Xk},{id:"schedules",label:"Schedules",component:Zk}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},tw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const u=c.toString(),d=await K.get(`/api/audit${u?"?"+u:""}`);e.value=Array.isArray(d)?d:[]}catch(c){s.value=c.message}t.value=!1}return $e(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Ta,formatDetail:i,truncateBlock:Gh,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Md=[{id:"all",name:"All Sessions",icon:"☰",filters:{}},{id:"active",name:"Recently Active",icon:"⚡",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"💬",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"🌐",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"📖",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"🗜",filters:{hasCompaction:!0}}],sw=[{value:"last_active",label:"Last Active",icon:"🕑"},{value:"created_at",label:"Created",icon:"📅"},{value:"message_count",label:"Message Count",icon:"📊"}],nw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),u=h("all"),d=h(""),f=h("last_active"),p=h(!1),m=Md,g=sw,k=h([]),E=h(!1),v=h(""),b=h("flat"),x=h(new Set),R=h(""),S=h(""),D=h(""),w=h(null),I=h(!1);function L(){try{const C=localStorage.getItem("odin-session-presets");C&&(k.value=JSON.parse(C))}catch{}}function H(){try{localStorage.setItem("odin-session-presets",JSON.stringify(k.value))}catch{}}const F=ee(()=>d.value.trim()!==""||u.value!=="all"),P=ee(()=>{let C=[...e.value];const X=Md.find(Ge=>Ge.id===u.value),be=X?X.filters:{};if(be.source&&(C=C.filter(Ge=>Ge.source===be.source)),be.minMessages&&(C=C.filter(Ge=>Ge.message_count>=be.minMessages)),be.hasCompaction&&(C=C.filter(Ge=>Ge.has_summary)),be.maxAge!=null){const Ge=Date.now()/1e3;C=C.filter(St=>St.last_active&&Ge-St.last_active<=be.maxAge)}if(d.value.trim()){const Ge=d.value.toLowerCase().trim();C=C.filter(St=>(St.channel_id||"").toLowerCase().includes(Ge)||(St.last_user_id||"").toLowerCase().includes(Ge)||(St.source||"").toLowerCase().includes(Ge))}const Le=f.value,Je=p.value?1:-1;return C.sort((Ge,St)=>{const st=Ge[Le]||0,Ye=St[Le]||0;return(st-Ye)*Je}),C}),W=ee(()=>{if(!a.value||!a.value.messages)return[];const C=a.value.messages;if(C.length===0)return[];const X=[];let be=[];for(const Le of C)Le.role==="user"&&be.length>0&&(X.push(be),be=[]),be.push(Le);return be.length>0&&X.push(be),X}),B=ee(()=>P.value.length>0&&o.value.size===P.value.length);function j(C){const X=C.find(be=>be.role==="user");if(X&&X.content){const be=X.content.slice(0,120);return be.length<X.content.length?be+"...":be}return"(no user message)"}function N(C){const X=new Set(x.value);X.has(C)?X.delete(C):X.add(C),x.value=X}function O(C){u.value=C}function z(C){u.value=C.id,C.filters.searchQuery!=null&&(d.value=C.filters.searchQuery),C.filters.sortBy&&(f.value=C.filters.sortBy)}function ue(){if(!v.value.trim())return;const C={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:d.value,sortBy:f.value}};k.value=[...k.value,C],H(),E.value=!1,v.value=""}function ve(C){k.value=k.value.filter(X=>X.id!==C),H(),u.value===C&&(u.value="all")}function se(){u.value="all",d.value="",f.value="last_active",p.value=!1}function de(C){if(!C)return"—";const X=Date.now()/1e3-C;if(X<60)return"just now";if(X<3600){const Le=Math.floor(X/60);return`${Le} minute${Le!==1?"s":""} ago`}if(X<86400){const Le=Math.floor(X/3600);return`${Le} hour${Le!==1?"s":""} ago`}const be=Math.floor(X/86400);return`${be} day${be!==1?"s":""} ago`}function Y(C){if(!C)return"";try{return new Date(C*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function oe(C){if(!C)return"";try{return new Date(C*1e3).toLocaleString()}catch{return""}}function Ie(C){return C==="user"?"bg-gray-900/50 border border-gray-800":C==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function V(C){return C==="user"?"sess-msg-user":C==="assistant"?"sess-msg-assistant":"sess-msg-system"}function re(C){return C==="user"?"badge-info":C==="assistant"?"badge-success":"badge-warning"}function le(C){return C==="user"?"sess-dot-user":C==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ge(C){return C==="user"?"text-cyan-400":C==="assistant"?"text-indigo-400":"text-gray-500"}function me(C){return C?C.length>2e3?C.slice(0,2e3)+`
... (truncated)`:C:""}async function De(){const C=R.value.trim();if(C){I.value=!0;try{let X=`/api/sessions/search?q=${encodeURIComponent(C)}&limit=50`;S.value.trim()&&(X+=`&channel_id=${encodeURIComponent(S.value.trim())}`),D.value.trim()&&(X+=`&user_id=${encodeURIComponent(D.value.trim())}`);const be=await K.get(X);w.value=be.results||[]}catch{w.value=[]}I.value=!1}}function y(){R.value="",S.value="",D.value="",w.value=null}function T(C){return C?C.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function M(C){return C==="user"?"bg-gray-900/50 border-gray-800":C==="assistant"?"bg-indigo-950/30 border-indigo-900/30":C==="summary"?"bg-amber-950/20 border-amber-900/30":C==="fts"?"bg-emerald-950/20 border-emerald-900/30":C==="channel"?"bg-purple-950/20 border-purple-900/30":"bg-gray-900/30 border-gray-800/50"}function G(C){return C==="user"?"badge-info":C==="assistant"?"badge-success":C==="summary"?"badge-warning":C==="fts"?"badge-success":"badge-info"}async function A(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(C){s.value=C.message}t.value=!1}function $(){s.value=null,A()}async function J(C){if(n.value===C){n.value=null,a.value=null,x.value=new Set;return}n.value=C,a.value=null,i.value=!0,x.value=new Set;try{a.value=await K.get(`/api/sessions/${encodeURIComponent(C)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function Z(C){const X=new Set(o.value);X.has(C)?X.delete(C):X.add(C),o.value=X}function te(){B.value?o.value=new Set:o.value=new Set(P.value.map(C=>C.channel_id))}function Q(C){l.value=C}async function pe(){if(l.value){r.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await A()}catch(C){s.value=C.message||"Failed to clear session"}r.value=!1,l.value=null}}function ie(){c.value=!0}async function ce(){if(o.value.size!==0){r.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await A()}catch(C){s.value=C.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function ye(C,X){const be=K._token;let Le=`/api/sessions/${encodeURIComponent(C)}/export?format=${X}`;be&&(Le+=`&token=${encodeURIComponent(be)}`);const Je=document.createElement("a");Je.href=Le,Je.download=`session-${C}.${X==="text"?"txt":"json"}`,document.body.appendChild(Je),Je.click(),document.body.removeChild(Je)}let Se=null;function Ee(C){C.payload&&C.payload.channel_id&&(clearTimeout(Se),Se=setTimeout(()=>{A(),n.value&&C.payload.channel_id===n.value&&K.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(X=>{a.value=X}).catch(()=>{})},2e3))}return $e(()=>{L(),A(),qe.subscribe("events",Ee)}),ft(()=>{qe.unsubscribe("events",Ee),clearTimeout(Se)}),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:B,bulkClearing:c,activePreset:u,searchQuery:d,sortBy:f,sortAsc:p,filterPresets:m,sortOptions:g,filteredSessions:P,hasActiveFilters:F,customPresets:k,showSavePreset:E,newPresetName:v,threadView:b,threads:W,collapsedThreads:x,ftsQuery:R,ftsChannelId:S,ftsUserId:D,ftsResults:w,ftsSearching:I,formatAge:de,formatTimestamp:Y,formatFullTimestamp:oe,messageClass:Ie,threadMsgClass:V,roleBadge:re,roleDotClass:le,roleLabelClass:ge,truncateContent:me,threadSummary:j,fetchSessions:A,retry:$,toggleSession:J,toggleSelect:Z,toggleSelectAll:te,confirmClear:Q,clearSession:pe,confirmBulkClear:ie,doBulkClear:ce,exportSession:ye,applyPreset:O,applyCustomPreset:z,saveCustomPreset:ue,removeCustomPreset:ve,resetFilters:se,toggleThread:N,runFtsSearch:De,clearFtsSearch:y,highlightSnippet:T,ftsResultClass:M,ftsTypeBadge:G}}},aw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:I_}}},iw={components:{ContextAssemblyPanel:aw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),u=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function d(D){if(!D)return"—";try{const w=new Date(D);return isNaN(w.getTime())?D:w.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return D}}function f(D){return!D&&D!==0?"—":D<1e3?D+"ms":(D/1e3).toFixed(1)+"s"}function p(D){return!D&&D!==0?"—":D>=1e3?(D/1e3).toFixed(1)+"k":String(D)}function m(D){if(!D)return"";if(typeof D=="string")return D;try{return JSON.stringify(D,null,2)}catch{return String(D)}}function g(D){a.value===D?a.value=null:(a.value=D,c.value={})}function k(D,w){const I=D+"-"+w;c.value={...c.value,[I]:!c.value[I]}}function E(D,w){return!!c.value[D+"-"+w]}function v(){u.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,R()}async function b(){try{const D=await K.get("/api/trajectories");e.value=D.files||[],o.value=D.count||0}catch{}}let x=0;async function R(){const D=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const w=await K.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${u.value.limit}`);if(D!==x)return;let I=w.entries||[];u.value.tool_name&&(I=I.filter(L=>(L.tools_used||[]).includes(u.value.tool_name))),u.value.errors_only&&(I=I.filter(L=>L.is_error)),u.value.channel_id&&(I=I.filter(L=>L.channel_id===u.value.channel_id)),u.value.user_id&&(I=I.filter(L=>L.user_id===u.value.user_id)),t.value=I}else{const w=new URLSearchParams;u.value.channel_id&&w.set("channel_id",u.value.channel_id),u.value.user_id&&w.set("user_id",u.value.user_id),u.value.tool_name&&w.set("tool_name",u.value.tool_name),u.value.errors_only&&w.set("errors_only","true"),w.set("limit",String(u.value.limit));const I=w.toString(),L=await K.get(`/api/trajectories/search/query?${I}`);if(D!==x)return;t.value=L.results||[]}}catch(w){if(D!==x)return;n.value=w.message}D===x&&(s.value=!1)}async function S(){if(!l.value.trim())return;const D=++x;s.value=!0,n.value=null,c.value={};try{const w=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(D!==x)return;i.value=w.entry||null,i.value||(n.value="No trace found for this message ID")}catch(w){if(D!==x)return;w.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=w.message}D===x&&(s.value=!1)}return $e(async()=>{await b(),await R()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:u,expandedIterations:c,formatTs:d,formatDuration:f,formatTokens:p,formatJSON:m,truncateBlock:Gh,toggleExpand:g,toggleIteration:k,isIterationExpanded:E,clearFilters:v,fetchFiles:b,fetchTraces:R,lookupMessage:S}}},lw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=ee(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const u=await K.get("/api/usage");s.value=u,n.value=u.totals||n.value,t.value=null}catch(u){t.value=u.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};return $e(()=>{o(),i=setInterval(o,15e3)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:Wh,formatTime:xc,retry:c}}},rw={components:{TabbedPage:ir},setup(){return{tabs:[{id:"audit",label:"Audit",component:tw},{id:"sessions",label:"Sessions",component:nw},{id:"traces",label:"Traces",component:iw},{id:"usage",label:"Usage",component:lw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Pr=[{id:"system",label:"System & Commands",icon:"🖥",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"🛠",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"🤖",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"📋",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"🌐",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"📚",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"💬",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"🧩",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"🧠",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"✨",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"🔗",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"🔧",match:()=>!0}],ow={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=ee(()=>e.value.filter(v=>v.is_core).length),c=ee(()=>e.value.filter(v=>!v.is_core).length),u=ee(()=>Object.values(a.value).reduce((v,b)=>v+b,0));function d(v){for(const b of Pr)if(b.id!=="other"&&b.match(v))return b.id;return"other"}const f=ee(()=>{let v=e.value;if(n.value){const b=n.value.toLowerCase();v=v.filter(x=>x.name.toLowerCase().includes(b)||(x.description||"").toLowerCase().includes(b))}return r.value&&(v=v.filter(b=>d(b.name)===r.value)),v}),p=ee(()=>{const v=new Set;for(const b of e.value)v.add(d(b.name));return Pr.filter(b=>v.has(b.id))}),m=ee(()=>{const v=f.value,b={};for(const R of v){const S=d(R.name);b[S]||(b[S]=[]),b[S].push(R)}const x=[];for(const R of Pr)b[R.id]&&b[R.id].length>0&&x.push({label:R.label,icon:R.icon,tools:b[R.id].sort((S,D)=>S.name.localeCompare(D.name))});return x});function g(v){i.value={...i.value,[v]:!i.value[v]}}async function k(){t.value=!0,s.value=null;try{const[v,b]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({}))]);e.value=v,a.value=b||{};const x=Object.values(b||{}).filter(R=>R>0).sort((R,S)=>R-S)}catch(v){s.value=v.message}t.value=!1}function E(){k()}return $e(()=>{k()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:u,filteredTools:f,groupedTools:m,usedCategories:p,truncate:_c,toggleExpand:g,refresh:E}}};function cw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function uw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const dw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),u=h(""),d=h(""),f=h(null),p=h(null),m=h(!1),g=h(null),k=h(null),E=h(!1),v=ee(()=>e.value.length),b=ee(()=>e.value.reduce((Y,oe)=>Y+(oe.execution_count||0),0)),x=ee(()=>e.value.reduce((Y,oe)=>Y+L(oe.code),0)),R=ee(()=>{if(!l.value)return e.value;const Y=l.value.toLowerCase();return e.value.filter(oe=>oe.name.toLowerCase().includes(Y)||(oe.description||"").toLowerCase().includes(Y))}),S=ee(()=>d.value?d.value.split(`
`).length:0),D=ee(()=>{const Y=Math.max(S.value,1);return Array.from({length:Y},(oe,Ie)=>Ie+1).join(`
`)}),w=ee(()=>{const Y=d.value.trim();return Y?Y.includes("SKILL_DEFINITION")?Y.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function I(Y){return cw(Y)}function L(Y){return Y?Y.split(`
`).length:0}function H(Y){return uw(Y)}function F(Y){n.value={...n.value,[Y]:!n.value[Y]}}async function P(Y){try{await navigator.clipboard.writeText(Y);const oe=e.value.find(Ie=>Ie.code===Y);oe&&(r.value=oe.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function W(Y){if(Y.key==="Tab"){Y.preventDefault();const oe=Y.target,Ie=oe.selectionStart,V=oe.selectionEnd;d.value=d.value.substring(0,Ie)+"    "+d.value.substring(V),Et(()=>{oe.selectionStart=oe.selectionEnd=Ie+4})}}function B(Y){const oe=Y.target.previousElementSibling;oe&&(oe.scrollTop=Y.target.scrollTop)}async function j(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(Y){s.value=Y.message}t.value=!1}async function N(Y){i.value=Y,delete a.value[Y],a.value={...a.value};try{const oe=await K.post(`/api/skills/${encodeURIComponent(Y)}/test`);a.value={...a.value,[Y]:oe}}catch(oe){a.value={...a.value,[Y]:{result:oe.message,is_error:!0}}}i.value=null}function O(){o.value=!0,c.value="create",u.value="",d.value="",f.value=null,p.value=null}function z(Y){o.value=!0,c.value="edit",u.value=Y.name,d.value=Y.code||"",f.value=null,p.value=null}function ue(){o.value=!1,f.value=null,p.value=null}async function ve(){f.value=null,p.value=null;const Y=u.value.trim(),oe=d.value.trim();if(!Y){f.value="Name is required";return}if(!oe){f.value="Code is required";return}m.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:Y,code:oe}),p.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(Y)}`,{code:oe}),p.value="Skill updated successfully"),await j(),setTimeout(()=>{o.value=!1},800)}catch(Ie){f.value=Ie.message}m.value=!1}function se(Y){k.value=Y}async function de(){if(k.value){E.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(k.value)}`),await j()}catch{}E.value=!1,k.value=null}}return $e(()=>{j()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:u,editCode:d,editError:f,editSuccess:p,saving:m,editorRef:g,deleteTarget:k,deleting:E,enabledCount:v,totalExecutions:b,totalLines:x,displayedSkills:R,editLineCount:S,editorLineNums:D,editValidation:w,highlight:I,truncate:_c,formatTs:Ta,countLines:L,getLineNumbers:H,toggleCode:F,copyCode:P,handleEditorKey:W,syncScroll:B,fetchSkills:j,testSkill:N,showCreate:O,editSkill:z,cancelEdit:ue,saveSkill:ve,confirmDelete:se,doDelete:de}}};function fw(e,t){if(!e||!t)return pd(e);const s=pd(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const pw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),u=h(""),d=h(null),f=h(null),p=h(!1),m=h(null),g=h(null);let k=null;const E=h(null),v=h(!1),b=h({}),x=h({}),R=h(null),S=h(null),D=ee(()=>e.value.reduce((O,z)=>O+(z.chunks||0),0)),w=ee(()=>new Set(e.value.map(z=>z.uploader).filter(Boolean)).size);function I(O,z){const ue=x.value[z];if(!ue||ue.length===0)return 0;const ve=Math.max(...ue.map(se=>se.char_count||0));return ve===0?0:Math.round(O.char_count/ve*100)}async function L(){t.value=!0,s.value=null;try{const O=await K.get("/api/knowledge");e.value=Array.isArray(O)?O:[]}catch(O){s.value=O.message}t.value=!1}async function H(O){if(b.value[O]){b.value[O]=!1,S.value=null;return}if(b.value[O]=!0,!(x.value[O]||R.value===O)){R.value=O;try{const z=await K.get(`/api/knowledge/${encodeURIComponent(O)}/chunks`);x.value[O]=Array.isArray(z)?z:[]}catch(z){x.value[O]=[],xe.error(`Failed to load chunks: ${z.message}`)}R.value=null}}async function F(){const O=n.value.trim();if(O){i.value=!0,r.value=null,l.value=O;try{const z=await K.get(`/api/knowledge/search?q=${encodeURIComponent(O)}`);a.value=Array.isArray(z)?z:[]}catch(z){a.value=[],r.value=z.message||"Search failed"}i.value=!1}}function P(){a.value=null,n.value="",r.value=null}async function W(){d.value=null,f.value=null;const O=c.value.trim(),z=u.value.trim();if(!O){d.value="Source name is required";return}if(!z){d.value="Content is required";return}p.value=!0;try{const ue=await K.post("/api/knowledge",{source:O,content:z});f.value=`Ingested ${ue.chunks||0} chunks from "${O}"`,c.value="",u.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(ue){d.value=ue.message}p.value=!1}async function B(O){m.value=O,g.value=null,k&&(clearTimeout(k),k=null);try{const z=await K.post(`/api/knowledge/${encodeURIComponent(O)}/reingest`);g.value={source:O,error:!1,message:`Re-ingested ${z.chunks||0} chunks`},delete x.value[O],await L(),k=setTimeout(()=>{g.value=null,k=null},3e3)}catch(z){g.value={source:O,error:!0,message:z.message}}m.value=null}function j(O){E.value=O}async function N(){if(E.value){v.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(E.value)}`),delete x.value[E.value],await L()}catch{}v.value=!1,E.value=null}}return $e(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:u,ingestError:d,ingestSuccess:f,ingesting:p,reingesting:m,reingestResult:g,deleteTarget:E,deleting:v,expanded:b,sourceChunks:x,loadingChunks:R,selectedChunk:S,totalChunks:D,uploaderCount:w,truncate:_c,formatTs:Ta,highlightTerms:fw,chunkBarWidth:I,fetchSources:L,toggleSource:H,doSearch:F,clearSearch:P,doIngest:W,doReingest:B,confirmDelete:j,doDelete:N}}},hw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),u=h(null),d=h(null),f=h(null),p=h(""),m=h(!1),g=h(null),k=h(null),E=h(new Set),v=h(null),b=h(!1),x=h(!1),R=ee(()=>e.value.reduce((se,de)=>se+de.count,0)),S=ee(()=>E.value.size);function D(se){const de=t.value[se];if(!de)return[];if(!l.value.trim())return de;const Y=l.value.trim().toLowerCase();return de.filter(oe=>oe.key.toLowerCase().includes(Y)||oe.value&&oe.value.toLowerCase().includes(Y))}function w(se,de){return E.value.has(se+"/"+de)}function I(se,de){const Y=se+"/"+de,oe=new Set(E.value);oe.has(Y)?oe.delete(Y):oe.add(Y),E.value=oe}function L(se){const de=t.value[se];return!de||de.length===0?!1:de.every(Y=>E.value.has(se+"/"+Y.key))}function H(se,de){const Y=t.value[se];if(!Y)return;const oe=new Set(E.value);for(const Ie of Y){const V=se+"/"+Ie.key;de?oe.add(V):oe.delete(V)}E.value=oe}async function F(){s.value=!0,n.value=null;try{const se=await K.get("/api/memory");e.value=Object.entries(se).map(([de,Y])=>({name:de,keys:Y.keys||[],count:Y.count||0}))}catch(se){n.value=se.message}s.value=!1}async function P(se){if(a.value[se]){a.value[se]=!1;return}a.value[se]=!0;const de=e.value.find(oe=>oe.name===se);if(!de||t.value[se]||i.value===se)return;i.value=se;const Y=await Promise.all(de.keys.map(async oe=>{try{const Ie=await K.get(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(oe)}`);return{key:oe,value:Ie.value||""}}catch{return{key:oe,value:"(error loading)"}}}));t.value[se]=Y,i.value=null}function W(se,de,Y){f.value=se+"/"+de,p.value=Y}async function B(se,de){m.value=!0,g.value=null;try{await K.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`,{value:p.value});const Y=t.value[se];if(Y){const oe=Y.find(Ie=>Ie.key===de);oe&&(oe.value=p.value)}f.value=null}catch(Y){g.value=`Failed to save: ${Y.message||"unknown error"}`}m.value=!1}async function j(se,de){try{await navigator.clipboard.writeText(de.value),k.value=se+"/"+de.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function N(){u.value=null,d.value=null;const se=o.value.scope.trim(),de=o.value.key.trim(),Y=o.value.value.trim();if(!se){u.value="Scope is required";return}if(!de){u.value="Key is required";return}if(!Y){u.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`,{value:Y}),d.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await F(),setTimeout(()=>{r.value=!1,d.value=null},800)}catch(oe){u.value=oe.message}c.value=!1}function O(se,de){v.value={scope:se,key:de}}async function z(){if(!v.value)return;b.value=!0,g.value=null;const{scope:se,key:de}=v.value;try{await K.del(`/api/memory/${encodeURIComponent(se)}/${encodeURIComponent(de)}`);const Y=t.value[se];Y&&(t.value[se]=Y.filter(V=>V.key!==de));const oe=e.value.find(V=>V.name===se);oe&&(oe.count--,oe.keys=oe.keys.filter(V=>V!==de));const Ie=new Set(E.value);Ie.delete(se+"/"+de),E.value=Ie}catch(Y){g.value=`Failed to delete: ${Y.message||"unknown error"}`}b.value=!1,v.value=null}function ue(){x.value=!0}async function ve(){b.value=!0,g.value=null;const se=[];for(const de of E.value){const Y=de.indexOf("/");se.push({scope:de.slice(0,Y),key:de.slice(Y+1)})}try{await K.post("/api/memory/bulk-delete",{entries:se}),E.value=new Set,t.value={},await F()}catch(de){g.value=`Bulk delete failed: ${de.message||"unknown error"}`}b.value=!1,x.value=!1}return $e(()=>{F()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:u,addSuccess:d,editingKey:f,editValue:p,saving:m,actionError:g,copied:k,selected:E,selectedCount:S,totalEntries:R,deleteTarget:v,deleting:b,showBulkDelete:x,fetchMemory:F,toggleScope:P,startEdit:W,doEdit:B,copyValue:j,doAdd:N,confirmDelete:O,doDelete:z,confirmBulkDelete:ue,doBulkDelete:ve,isSelected:w,toggleSelect:I,isScopeAllSelected:L,toggleSelectAll:H,filteredEntries:D}}},gw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=ee(()=>[...new Set(e.value.map(k=>k.category))].sort()),o=ee(()=>{const g={};return e.value.forEach(k=>{g[k.category]=(g[k.category]||0)+1}),g}),c=ee(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function u(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function d(g){i.value=g.key,l.value=g.content}async function f(g){try{await K.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,xe.success("Entry updated"),await m()}catch(k){xe.error(k.message||"Failed to save entry")}}async function p(g){if(await ns({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(g)),xe.success("Entry deleted"),await m()}catch(E){xe.error(E.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const g=await K.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return $e(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:u,formatTs:Ta,startEdit:d,saveEdit:f,deleteEntry:p,fetchEntries:m}}},mw={components:{TabbedPage:ir},setup(){return{tabs:[{id:"tools",label:"Tools",component:ow},{id:"skills",label:"Skills",component:dw},{id:"knowledge",label:"Knowledge",component:pw},{id:"memory",label:"Memory",component:hw},{id:"learned",label:"Learned",component:gw}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},vw={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),u=h(!0),d=h(""),f=h(!1),p=h(!1),m=ee(()=>e.value==="custom"),g=ee(()=>[...i.value,...l.value]),k=ee(()=>l.value.includes(e.value)),E=ee(()=>{var w;return m.value?t.value||"Odin":((w=a.value[e.value])==null?void 0:w.name)||e.value}),v=ee(()=>{var w;return m.value?s.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.identity)||""}),b=ee(()=>{var w;return m.value?n.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.voice)||""});async function x(){u.value=!0;try{const w=await K.get("/api/personality");e.value=w.preset||"odin",t.value=w.custom_name||"",s.value=w.custom_identity||"",n.value=w.custom_voice||"",a.value=w.presets||{},i.value=w.builtin_presets||[],l.value=w.user_presets||[]}catch(w){c.value=w.message}finally{u.value=!1}}async function R(){r.value=!0,c.value=null,o.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(w){c.value=w.message}finally{r.value=!1}}async function S(){const w=d.value.trim();if(w){p.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:w,display_name:E.value,identity:v.value,voice:b.value}),f.value=!1,d.value="",await x(),e.value=w.toLowerCase().replace(/ /g,"_")}catch(I){c.value=I.message}finally{p.value=!1}}}async function D(){if(await ns({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(I){c.value=I.message}}}return $e(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:m,isUserPreset:k,previewName:E,previewIdentity:v,previewVoice:b,saving:r,saved:o,error:c,loading:u,save:R,showSavePreset:f,newPresetName:d,savingPreset:p,saveAsPreset:S,deletePreset:D,builtinPresets:i,userPresets:l}},template:`
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
  `},bw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},yw={ok:"✔",degraded:"⚠",down:"✖",unconfigured:"—"},xw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},_w={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=ee(()=>e.value.components||[]),i=ee(()=>xw[e.value.overall]||"text-gray-400"),l=ee(()=>e.value.overall==="healthy"?"✔":e.value.overall==="degraded"?"⚠":e.value.overall==="unhealthy"?"✖":"—"),r=ee(()=>{const v=e.value.overall;return v==="healthy"?"All Systems Healthy":v==="degraded"?"Some Systems Degraded":v==="unhealthy"?"System Issues Detected":"Unknown"});function o(v){return bw[v]||"text-gray-400"}function c(v){return yw[v]||"?"}function u(v){return v==="ok"?"badge-success":v==="degraded"?"badge-warning":v==="down"?"badge-danger":"badge-info"}function d(v){return v==="closed"?"text-green-400":v==="half_open"?"text-yellow-400":v==="open"?"text-red-400":"text-gray-400"}function f(v){return v.replace(/_/g," ").replace(/\b\w/g,b=>b.toUpperCase())}function p(v){if(!v)return"—";try{return new Date(v).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return v}}function m(v){return v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":String(v)}async function g(){n.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null}catch(v){s.value=v.message}finally{t.value=!1,n.value=!1}}function k(){t.value=!0,s.value=null,g()}let E=null;return $e(async()=>{await g(),E=setInterval(g,3e4)}),ft(()=>{E&&clearInterval(E)}),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:u,circuitColor:d,formatName:f,formatTime:p,formatNumber:m,fetchHealth:g,retry:k}}},kw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=ee(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=ee(()=>{if(!a.value)return[];const f=a.value,p=f.storage_total_bytes||1;return[{label:"Session Persistence",mb:f.sessions.persist_dir.total_mb,bytes:f.sessions.persist_dir.total_bytes,files:f.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(f.sessions.persist_dir.total_bytes/p*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:f.knowledge.db_file.total_mb,bytes:f.knowledge.db_file.total_bytes,files:f.knowledge.db_file.file_count,pct:Math.min(100,Math.round(f.knowledge.db_file.total_bytes/p*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:f.trajectories.message_dir.total_mb,bytes:f.trajectories.message_dir.total_bytes,files:f.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.message_dir.total_bytes/p*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:f.trajectories.agent_dir.total_mb,bytes:f.trajectories.agent_dir.total_bytes,files:f.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(f.trajectories.agent_dir.total_bytes/p*100)),color:"res-bar-amber"}]});async function c(){try{const f=await K.get("/api/resource-usage");a.value=f,t.value=null}catch(f){t.value=f.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function u(){s.value=!0,await c()}function d(){e.value=!0,t.value=null,c()}return $e(()=>{c(),i=setInterval(c,3e4)}),ft(()=>{i&&clearInterval(i)}),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:Wh,refresh:u,retry:d}}},ww=["INFO","WARNING","ERROR"],Sw=[{id:"all",name:"All Logs",icon:"☰",filters:{}},{id:"errors",name:"Errors Only",icon:"❌",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"⚠",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"🔧",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"🔥",filters:{level:"ERROR",timeRange:"last_1h"}}],Mr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Tw=[50,100,200,500],Cw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(qe.state||"disconnected"),c=ee(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),u=h(null),d=h(!1),f=h(null),p=2e3,m=ww,g=Sw,k=Mr,E=h("all"),v=h(""),b=h([]),x=h(!1),R=h(""),S=h([]);function D(){try{const U=localStorage.getItem("odin-log-presets");U&&(b.value=JSON.parse(U))}catch{}}function w(){try{localStorage.setItem("odin-log-presets",JSON.stringify(b.value))}catch{}}const I=ee(()=>a.value!==""||i.value.trim()!==""||v.value!==""),L=ee(()=>{const U=Mr.find(ne=>ne.value===v.value);return U?U.label:""}),H=ee(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(U){return U.message}}),F=24,P=ee(()=>{if(t.value.length===0)return[];const U=[],ne=new Date,_e=3600*1e3;for(let Qe=F-1;Qe>=0;Qe--){const nt=new Date(ne.getTime()-(Qe+1)*_e),Nt=new Date(ne.getTime()-Qe*_e);U.push({start:nt,end:Nt,label:N(nt,Nt),shortLabel:Nt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Qe of t.value){if(!Qe._time)continue;const nt=Qe._time.getTime();for(const Nt of U)if(nt>=Nt.start.getTime()&&nt<Nt.end.getTime()){Nt.total++,Qe.level==="ERROR"?Nt.errors++:Qe.level==="WARNING"?Nt.warnings++:Nt.info++;break}}return U}),W=ee(()=>{let U=1;for(const ne of P.value)ne.total>U&&(U=ne.total);return U}),B=ee(()=>P.value.length===0?"":"Last 24 hours"),j=ee(()=>Math.ceil(F/8));function N(U,ne){const _e={hour:"2-digit",minute:"2-digit"};return U.toLocaleTimeString([],_e)+" - "+ne.toLocaleTimeString([],_e)}function O(U,ne){return!ne||!U?"0px":Math.max(2,U/ne*100)+"%"}function z(U){const ne=ue.value.findIndex(_e=>_e._time&&_e._time.getTime()>=U.start.getTime()&&_e._time.getTime()<U.end.getTime());if(ne>=0&&u.value){const _e=u.value.querySelectorAll(".log-line");_e[ne]&&(_e[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const ue=ee(()=>{let U=t.value;if(a.value&&(U=U.filter(ne=>(ne.level||"INFO")===a.value)),v.value){const ne=Mr.find(_e=>_e.value===v.value);if(ne&&ne.seconds){const _e=new Date(Date.now()-ne.seconds*1e3);U=U.filter(Qe=>Qe._time&&Qe._time>=_e)}}if(i.value&&!H.value)if(l.value)try{const ne=new RegExp(i.value,"i");U=U.filter(_e=>{const Qe=_e.text||_e.raw||"",nt=_e.tool||"";return ne.test(Qe)||ne.test(nt)})}catch{}else{const ne=i.value.toLowerCase();U=U.filter(_e=>{const Qe=(_e.text||_e.raw||"").toLowerCase(),nt=(_e.tool||"").toLowerCase();return Qe.includes(ne)||nt.includes(ne)})}return U});function ve(U){if(U.type==="log"&&U.line)try{const ne=typeof U.line=="string"?JSON.parse(U.line):U.line,_e=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:_e.toLocaleTimeString(),_time:_e,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(U.line),tool:"",raw:String(U.line)}}if(U.payload){const ne=U.payload,_e=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:_e.toLocaleTimeString(),_time:_e,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof U=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:U,tool:"",raw:U}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(U),tool:"",raw:null}}function se(U){const ne=ve(U);if(s.value){S.value.push(ne);return}de(ne)}function de(U){t.value.push(U),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Et(()=>Y())}function Y(){const U=u.value;if(U){const ne=U.scrollHeight-U.scrollTop-U.clientHeight;U.scrollTo({top:U.scrollHeight,behavior:ne<500?"smooth":"instant"})}}function oe(){n.value=!0,d.value=!1,Et(()=>Y())}function Ie(){const U=u.value;if(!U)return;const ne=U.scrollHeight-U.scrollTop-U.clientHeight<40;d.value=!ne&&t.value.length>0,!ne&&n.value&&(n.value=!1)}function V(){if(s.value=!s.value,!s.value&&S.value.length>0){for(const U of S.value)de(U);S.value=[]}}function re(){t.value=[],S.value=[],d.value=!1}function le(){let U;e.value==="search"?U=X.value.map(nt=>{const Nt=nt.error?"ERROR":"INFO",lr=nt.tool_name?`[${nt.tool_name}] `:"";return`${nt.timestamp||""} ${Nt} ${lr}${nt.result_summary||nt.message||""}`}).join(`
`):U=ue.value.map(nt=>`${nt.ts} ${nt.level} ${nt.text}`).join(`
`);const ne=new Blob([U],{type:"text/plain"}),_e=URL.createObjectURL(ne),Qe=document.createElement("a");Qe.href=_e,Qe.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Qe.click(),URL.revokeObjectURL(_e)}function ge(U,ne){const _e=`${U.ts} ${U.level} ${U.text||U.raw||""}`;navigator.clipboard.writeText(_e).then(()=>{f.value=ne,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function me(U){a.value=a.value===U?"":U,E.value="all"}function De(U){return U.level==="ERROR"?"log-line-error":U.level==="WARNING"?"log-line-warning":"text-gray-300"}function y(U){return U==="ERROR"?"text-red-500 font-semibold":U==="WARNING"?"text-yellow-500":"text-blue-500"}function T(U){return U==="ERROR"?"log-chip-error":U==="WARNING"?"log-chip-warning":"log-chip-info"}function M(U){E.value=U.id;const ne=U.filters;a.value=ne.level||"",v.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function G(U){E.value=U.id,a.value=U.filters.level||"",v.value=U.filters.timeRange||"",i.value=U.filters.text||""}function A(){if(!R.value.trim())return;const U={id:"custom-"+Date.now(),name:R.value.trim(),filters:{level:a.value,timeRange:v.value,text:i.value}};b.value=[...b.value,U],w(),x.value=!1,R.value=""}function $(U){b.value=b.value.filter(ne=>ne.id!==U),w(),E.value===U&&(E.value="all")}const J=h("all"),Z=h(""),te=h(""),Q=h(""),pe=h(""),ie=h(""),ce=h(100),ye=Tw,Se=h(!1),Ee=h(!1),C=h(""),X=h([]),be=h(null),Le=h(null);function Je(){e.value="search",be.value||Ge()}async function Ge(){try{be.value=await K.get("/api/logs/stats")}catch{}}function St(){const U=ie.value;if(!U){Q.value="",pe.value="";return}const _e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[U];if(_e){const Qe=new Date(Date.now()-_e*1e3);Q.value=st(Qe),pe.value=""}}function st(U){const ne=_e=>String(_e).padStart(2,"0");return`${U.getFullYear()}-${ne(U.getMonth()+1)}-${ne(U.getDate())}T${ne(U.getHours())}:${ne(U.getMinutes())}`}function Ye(U){if(!U)return"";const ne=new Date(U);return isNaN(ne.getTime())?"":ne.toISOString()}async function en(){Se.value=!0,C.value="",Ee.value=!0,Le.value=null;try{const U=new URLSearchParams;J.value&&J.value!=="all"&&U.set("level",J.value),Z.value&&U.set("tool",Z.value),te.value&&U.set("q",te.value);const ne=Ye(Q.value),_e=Ye(pe.value);ne&&U.set("start",ne),_e&&U.set("end",_e),U.set("limit",String(ce.value));const Qe=await K.get(`/api/logs/search?${U.toString()}`);X.value=Qe.entries||[]}catch(U){C.value=U.message||"Search failed",X.value=[]}finally{Se.value=!1}}function mn(){J.value="all",Z.value="",te.value="",Q.value="",pe.value="",ie.value="",ce.value=100,X.value=[],Ee.value=!1,C.value="",Le.value=null}function Ai(U){Le.value=Le.value===U?null:U}function Ea(U){if(!U.timestamp)return"";try{return new Date(U.timestamp).toLocaleString()}catch{return U.timestamp}}function Ri(U){return U.type==="web_action"?`${U.status||""} (${U.execution_time_ms||0}ms)`:(U.result_summary||"").slice(0,200)}function Hn(U){return U.error?"log-line-error":"text-gray-300"}function jn(U){try{return JSON.stringify(U,null,2)}catch{return String(U)}}let Kt=null;return $e(()=>{D(),qe.subscribe("logs",se),r.value=qe.connected,o.value=qe.state||"disconnected",Kt=qe.onStateChange;const U=qe.onStateChange;qe.onStateChange=(ne,_e)=>{o.value=ne,r.value=ne==="connected",U&&U(ne,_e)}}),ft(()=>{qe.unsubscribe("logs",se),Kt!==void 0&&(qe.onStateChange=Kt)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:u,filteredLogs:ue,pauseBuffer:S,showJumpBottom:d,copiedIndex:f,regexError:H,levels:m,logPresets:g,timeRanges:k,timeRange:v,activeLogPreset:E,customLogPresets:b,showSaveLogPreset:x,newLogPresetName:R,hasActiveLogFilters:I,timeRangeLabel:L,timelineBuckets:P,timelineMax:W,timelineSpanLabel:B,timelineLabelSkip:j,togglePause:V,clearLogs:re,exportLogs:le,logLineClass:De,levelClass:y,levelChipClass:T,toggleLevel:me,copyLine:ge,jumpToBottom:oe,onScroll:Ie,applyLogPreset:M,applyCustomLogPreset:G,saveLogCustomPreset:A,removeLogCustomPreset:$,segmentHeight:O,jumpToTimelineBucket:z,searchLevel:J,searchTool:Z,searchKeyword:te,searchStart:Q,searchEnd:pe,searchTimePreset:ie,searchLimit:ce,searchLimits:ye,searching:Se,searchRan:Ee,searchError:C,searchResults:X,searchStats:be,expandedSearch:Le,switchToSearch:Je,runSearch:en,clearSearchFilters:mn,toggleSearchExpand:Ai,formatSearchTs:Ea,searchEntryText:Ri,searchLogLineClass:Hn,formatJson:jn,applySearchTimePreset:St}}},Ew=new Set(["token","api_token","secret","ssh_key_path","credentials_path","api_key","password"]),Aw={"logging.level":["DEBUG","INFO","WARNING","ERROR","CRITICAL"]},Rw={"discord.allowed_users":{type:"array",itemType:"string",message:"Must be a list of user IDs"},"discord.channels":{type:"array",itemType:"string",message:"Must be a list of channel IDs"},"openai_codex.max_tokens":{type:"number",min:1,max:128e3,message:"Must be 1“128000"},"sessions.max_history":{type:"number",min:1,max:1e4,message:"Must be 1–10000"},"sessions.max_age_hours":{type:"number",min:1,message:"Must be at least 1"},"learning.max_entries":{type:"number",min:1,message:"Must be at least 1"},"learning.consolidation_target":{type:"number",min:1,message:"Must be at least 1"},"browser.default_timeout_ms":{type:"number",min:100,message:"Must be at least 100ms"},"browser.viewport_width":{type:"number",min:100,max:7680,message:"Must be 100–7680"},"browser.viewport_height":{type:"number",min:100,max:4320,message:"Must be 100–4320"},"tools.command_timeout_seconds":{type:"number",min:10,max:3600,message:"Must be 10–3600 seconds"}},Fr=[{key:"core",label:"Core",icon:"⚙",sections:["timezone","discord","logging","permissions","personality","graceful_degradation"]},{key:"llm",label:"LLM & AI",icon:"🧠",sections:["llm_provider","openai_codex","ollama","kimi","context","agents"]},{key:"data",label:"Data & Storage",icon:"💾",sections:["sessions","learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"🔗",sections:["webhook","observability","email","browser","comfyui","mcp","slack"]},{key:"infra",label:"Infrastructure",icon:"🛠",sections:["tools"]},{key:"ui",label:"Web UI",icon:"🌐",sections:["web"]},{key:"automation",label:"Automation",icon:"🔄",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"integrations",label:"Integrations",icon:"🔌",sections:["issue_tracker"]}],cg="••••••••",Iw=50;function Nw(e){return Ew.has(e)}function Dw(e){return e===cg}function Ki(e){return JSON.parse(JSON.stringify(e))}function Nn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Ow(e,t){const s={};for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Nn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i)){const l={};for(const r of Object.keys(i))Nn(a[r],i[r])||(l[r]=i[r]);Object.keys(l).length>0&&(s[n]=l)}else s[n]=i}return s}function Lw(e,t,s){const n=Rw[e+"."+t];if(!n)return null;if(n.type==="number"){const a=Number(s);if(isNaN(a))return"Must be a number";if(n.min!==void 0&&a<n.min)return n.message||"Value too low";if(n.max!==void 0&&a>n.max)return n.message||"Value too high"}return n.type==="array"&&!Array.isArray(s)?n.message||"Must be an array":null}function Fd(e,t){const s=[];for(const n of Object.keys(t)){if(!(n in e))continue;const a=e[n],i=t[n];if(!Nn(a,i))if(typeof a=="object"&&a!==null&&!Array.isArray(a)&&typeof i=="object"&&i!==null&&!Array.isArray(i))for(const l of Object.keys(i))Nn(a[l],i[l])||s.push({section:n,key:l,oldVal:a[l],newVal:i[l]});else s.push({section:n,key:null,oldVal:a,newVal:i})}return s}const Pw={template:`
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
    </div>`,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h({}),i=h({}),l=h({}),r=h(!1),o=h(!1),c=h(null),u=h(!1),d=h([]),f=h([]),p=ee(()=>d.value.length>0),m=ee(()=>f.value.length>0),g=ee(()=>r.value&&t.value?t.value:e.value),k=ee(()=>!e.value||!t.value?!1:!Nn(e.value,t.value)),E=ee(()=>!e.value||!t.value?0:Fd(e.value,t.value).length),v=ee(()=>{if(!r.value||!t.value)return{};const A={};for(const $ of Object.keys(t.value)){const J=t.value[$];if(typeof J=="object"&&J!==null&&!Array.isArray(J))for(const Z of Object.keys(J)){const te=Lw($,Z,J[Z]);te&&(A[$+"."+Z]=te)}}return A}),b=ee(()=>Object.keys(v.value).length>0),x=ee(()=>e.value?Object.keys(e.value).length:0),R=ee(()=>D.value.length),S=ee(()=>!e.value||!t.value?[]:Fd(e.value,t.value)),D=ee(()=>e.value?Fr.map(A=>({...A,sections:A.sections.filter($=>$ in e.value)})).filter(A=>A.sections.length>0):[]),w=ee(()=>{if(!e.value)return[];const A=new Set(Fr.flatMap($=>$.sections));return Object.keys(e.value).filter($=>!A.has($))});function I(A){return g.value?g.value[A]:null}function L(A){return!e.value||!t.value?!1:!Nn(e.value[A],t.value[A])}function H(A){return A.sections.some($=>L($))}function F(A,$){if(!e.value||!t.value)return!1;const J=e.value[A],Z=t.value[A];return!J||!Z?!1:!Nn(J[$],Z[$])}function P(A){return t.value?t.value[A]:e.value[A]}function W(A,$){const J=t.value||e.value;return J[A]?J[A][$]:void 0}function B(A,$){const J=r.value&&t.value?t.value:e.value;return J[A]?J[A][$]:!1}function j(A,$){return v.value[A+"."+$]||null}function N(A,$){return Aw[A+"."+$]||null}function O(A,$,J){t.value&&($===null?t.value[A]=J:(t.value[A]||(t.value[A]={}),t.value[A][$]=J),t.value={...t.value})}function z(A,$,J){if(!t.value)return;const Z=Ki(t.value);O(A,$,J),d.value.push(Z),d.value.length>Iw&&d.value.shift(),f.value=[]}function ue(A,$,J){try{const Z=JSON.parse(J);z(A,$,Z)}catch{}}function ve(){d.value.length!==0&&(f.value.push(Ki(t.value)),t.value=d.value.pop())}function se(){f.value.length!==0&&(d.value.push(Ki(t.value)),t.value=f.value.pop())}function de(A,$,J){if(!t.value||!t.value[A])return;const Z=[...t.value[A][$]];Z.splice(J,1),z(A,$,Z)}function Y(A,$){if(!t.value||!t.value[A])return;const J=[...t.value[A][$]||[]],Z=prompt("Enter new value:");Z!==null&&(J.push(Z),z(A,$,J))}function oe(A){a.value={...a.value,[A]:!a.value[A]}}function Ie(A){l.value={...l.value,[A]:!l.value[A]}}function V(A){i.value={...i.value,[A]:!i.value[A]}}function re(A){try{return JSON.stringify(A,null,2)}catch{return String(A)}}function le(A){return A==null?"null":typeof A=="object"?JSON.stringify(A,null,2):String(A)}function ge(A,$){c.value={type:A,message:$},setTimeout(()=>{c.value=null},3e3)}function me(){t.value=Ki(e.value),r.value=!0,d.value=[],f.value=[]}function De(){r.value=!1,t.value=null,d.value=[],f.value=[]}function y(){u.value=!0}async function T(){if(!(!k.value||b.value)){o.value=!0;try{const A=Ow(e.value,t.value);if(Object.keys(A).length===0){ge("success","No changes to save."),o.value=!1;return}const $=await K.put("/api/config",A);e.value=$,r.value=!1,t.value=null,d.value=[],f.value=[],ge("success","Config saved successfully.")}catch(A){ge("error",A.message||"Failed to save config")}o.value=!1}}async function M(){s.value=!0,n.value=null;try{e.value=await K.get("/api/config");for(const A of Object.keys(e.value))a.value[A]===void 0&&(a.value[A]=!0);for(const A of Fr)l.value[A.key]===void 0&&(l.value[A.key]=!0)}catch(A){n.value=A.message}s.value=!1}function G(A){r.value&&((A.ctrlKey||A.metaKey)&&!A.shiftKey&&A.key==="z"?(A.preventDefault(),ve()):(A.ctrlKey||A.metaKey)&&(A.key==="y"||A.shiftKey&&A.key==="z"||A.shiftKey&&A.key==="Z")&&(A.preventDefault(),se()))}return $e(()=>{M(),document.addEventListener("keydown",G)}),ft(()=>{document.removeEventListener("keydown",G)}),{config:e,displayConfig:g,editValues:t,loading:s,error:n,expanded:a,expandedNested:i,expandedGroups:l,editing:r,saving:o,toast:c,hasChanges:k,hasErrors:b,changeCount:E,REDACTED:cg,showDiffModal:u,diffEntries:S,canUndo:p,canRedo:m,sectionCount:x,groupCount:R,visibleGroups:D,ungroupedSections:w,validationErrors:v,isSensitiveKey:Nw,isRedacted:Dw,sectionChanged:L,groupChanged:H,fieldChanged:F,getDisplay:I,getEdited:P,getEditedField:W,getDisplayBool:B,pushEdit:z,pushEditJson:ue,getValidationError:j,getEnumOptions:N,removeArrayItem:de,addArrayItem:Y,toggleSection:oe,toggleGroup:Ie,toggleNested:V,formatJson:re,formatDiffVal:le,showToast:ge,showDiff:y,fetchConfig:M,startEdit:me,cancelEdit:De,saveConfig:T,undo:ve,redo:se}}},Mw={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await K.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function u(p,m,g){try{await K.put("/api/discord/guild/"+p+"/config",{[m]:g}),await c()}catch(k){s.value=k.message}}async function d(p,m,g,k){try{await K.put("/api/discord/channel/"+p+"/config",{[g]:k}),await c()}catch(E){s.value=E.message}}async function f(p,m){try{await K.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return $e(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:u,setChannelConfig:d,clearOverride:f}}},Fw={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),u=h([]),d=h(null),f=ee(()=>{const N={};for(const O of u.value)N[O.id]=O;return N});function p(N){return f.value[N]||null}const m=ee(()=>/^\d{15,25}$/.test(r.value.trim())),g=ee(()=>{const N=r.value.toLowerCase().trim();return N?u.value.filter(O=>!i.value[O.id]&&(O.display_name.toLowerCase().includes(N)||O.username.toLowerCase().includes(N)||O.id.includes(N))):u.value.filter(O=>!i.value[O.id])});function k(N,O){return N?N.allowed_hosts===null||N.allowed_hosts===void 0?{allowed_hosts:[...O],default_host:N.default_host||"",allow_all:!0}:{allowed_hosts:N.allowed_hosts,default_host:N.default_host||"",allow_all:!1}:{allowed_hosts:[...O],default_host:O[0]||"",allow_all:!0}}async function E(){e.value=!0,t.value="";try{const N=await K.get("/api/host-access");s.value=N,n.value=N.available_hosts||[],a.value=k(N.default_policy,n.value);const O=N.users||{},z={};for(const[ue,ve]of Object.entries(O))z[ue]=k(ve,n.value);i.value=z}catch(N){t.value=N.message||"Failed to fetch host access data"}finally{e.value=!1}try{u.value=await K.get("/api/discord/members")||[]}catch{u.value=[]}}async function v(){try{const N=a.value.allow_all?null:a.value.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:N,default_host:a.value.default_host}),xe.success("Default policy updated")}catch(N){xe.error(N.message||"Failed to save")}}function b(N,O){a.value.allow_all=!1,O?a.value.allowed_hosts.includes(N)||a.value.allowed_hosts.push(N):(a.value.allowed_hosts=a.value.allowed_hosts.filter(z=>z!==N),a.value.default_host===N&&(a.value.default_host=a.value.allowed_hosts[0]||"")),v()}async function x(N){const O=i.value[N];if(O)try{const z=O.allow_all?null:O.allowed_hosts;await K.put(`/api/host-access/user/${N}`,{allowed_hosts:z,default_host:O.default_host});const ue=p(N);xe.success(`Updated access for ${ue?ue.display_name:N}`)}catch(z){xe.error(z.message||"Failed to save")}}function R(N,O,z){const ue=i.value[N];ue&&(ue.allow_all=!1,z?ue.allowed_hosts.includes(O)||ue.allowed_hosts.push(O):(ue.allowed_hosts=ue.allowed_hosts.filter(ve=>ve!==O),ue.default_host===O&&(ue.default_host=ue.allowed_hosts[0]||"")),x(N))}function S(N,O){const z=i.value[N];z&&(z.default_host=O,x(N))}function D(){l.value=!0,r.value="",c.value=0,Et(()=>{d.value&&d.value.focus()})}function w(){o.value=!0,c.value=0}function I(){c.value<g.value.length-1&&c.value++}function L(){c.value>0&&c.value--}function H(){const N=g.value[c.value];if(N){P(N);return}m.value&&F()}function F(){const N=r.value.trim();/^\d{15,25}$/.test(N)&&(i.value[N]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},x(N),r.value="",o.value=!1,l.value=!1)}function P(N){i.value[N.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},x(N.id),r.value="",o.value=!1,l.value=!1}function W(){o.value=!1}function B(){setTimeout(()=>{o.value=!1},150)}async function j(N){const O=p(N);if(await ns({title:"Remove user override",message:`Remove the host access override for ${O?O.display_name:N}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await K.del(`/api/host-access/user/${N}`),delete i.value[N],xe.success(`Removed override for ${O?O.display_name:N}`)}catch(ue){xe.error(ue.message||"Failed to delete")}}return $e(E),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:u,filteredMembers:g,isRawId:m,searchInput:d,fetchData:E,saveDefaultPolicy:v,toggleDefaultHost:b,getMember:p,toggleUserHost:R,setUserDefault:S,openAddUser:D,deleteUser:j,onSearchInput:w,highlightNext:I,highlightPrev:L,selectHighlighted:H,selectMember:P,closeDropdown:W,onBlur:B,addRawId:F}}},$w={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=ee(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=ee(()=>u.value.host_mode==="select"?u.value.allowed_hosts:u.value.host_mode==="none"?[]:n.value);function p(w){return w==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":w==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const w=await K.get("/api/tokens");s.value=w.tokens||[],n.value=w.available_hosts||[]}catch(w){t.value=w.message||"Failed to load tokens"}finally{e.value=!1}}function g(w){return!w||!w.trim()?[]:w.split(",").map(I=>I.trim()).filter(Boolean)}function k(w,I){const L=c.value.allowed_hosts;if(I&&!L.includes(w)&&L.push(w),!I){const H=L.indexOf(w);H>=0&&L.splice(H,1)}}function E(w,I){const L=u.value.allowed_hosts;if(I&&!L.includes(w)&&L.push(w),!I){const H=L.indexOf(w);H>=0&&L.splice(H,1)}}async function v(){var w;i.value=!0;try{const I=g(c.value.allowed_tools_str),L=c.value.host_mode,H=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,F={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:I.length?I:[]};H!==null&&(F.allowed_hosts=H),F.default_host=c.value.default_host||"";const P=await K.post("/api/tokens",F);l.value=P.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,xe.success("Token created"),await m()}catch(I){xe.error(((w=I.data)==null?void 0:w.error)||I.message||"Failed to create token")}finally{i.value=!1}}function b(w){r.value=w;const I=w.allowed_hosts;let L="default";I==null?L="default":Array.isArray(I)&&I.length===0?L="none":Array.isArray(I)&&(L="select"),u.value={username:w.username||"",tier:w.tier||"admin",label:w.label||"",host_mode:L,allowed_hosts:Array.isArray(I)?[...I]:[],default_host:w.default_host||"",allowed_tools_str:(w.allowed_tools||[]).join(", ")}}async function x(){var w;if(r.value){o.value=!0;try{const I=g(u.value.allowed_tools_str),L=u.value.host_mode,H={username:u.value.username,tier:u.value.tier,label:u.value.label,allowed_tools:I};L==="none"?H.allowed_hosts=[]:L==="select"?H.allowed_hosts=u.value.allowed_hosts:H.allowed_hosts=null,H.default_host=u.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,xe.success("Token updated"),await m()}catch(I){xe.error(((w=I.data)==null?void 0:w.error)||I.message||"Failed to update")}finally{o.value=!1}}}async function R(w){var L;if(await ns({title:"Regenerate token",message:`Regenerate token for ${w.username||w.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await K.post("/api/tokens/"+encodeURIComponent(w.user_id)+"/regenerate");l.value=H.token,xe.success("Token regenerated")}catch(H){xe.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to regenerate")}}async function S(w){var L;if(await ns({title:"Delete token",message:`Delete token for ${w.username||w.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(w.user_id)),xe.success("Token deleted"),await m()}catch(H){xe.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to delete")}}async function D(){if(l.value)try{await navigator.clipboard.writeText(l.value),xe.success("Copied to clipboard")}catch{xe.error("Copy failed — select and copy manually")}}return $e(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:u,createDefaultHostOptions:d,editDefaultHostOptions:f,fetchData:m,tierBadge:p,toggleCreateHost:k,toggleEditHost:E,createToken:v,startEdit:b,saveEdit:x,confirmRegenerate:R,confirmDelete:S,copyToken:D}}};function $r(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Bw={template:`
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
                <input type="checkbox" v-model="codexForm.enabled" @change="saveCodexConfigDebounced" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="codexForm.model" @change="saveCodexConfigDebounced"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
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
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Reasoning</label>
              <select v-model="codexForm.reasoning_effort" @change="saveCodexConfigDebounced"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
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
                <input type="checkbox" v-model="kimiForm.enabled" @change="saveKimiConfigDebounced" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="kimiForm.model" @change="saveKimiConfigDebounced"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option v-if="!kimiModels.length" value="" disabled>No models available</option>
                <option v-for="m in kimiModels" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="kimiForm.max_tokens" type="number" @keydown.enter="saveKimiConfigNow"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key</label>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.kimi.has_api_key && !kimiForm.api_key" class="text-xs text-green-400">● Configured</span>
                <input v-model="kimiForm.api_key" type="password" @keydown.enter="saveKimiConfigNow" @input="kimiKeyDirty = true"
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
                <input type="checkbox" v-model="ollamaForm.enabled" @change="saveOllamaConfigDebounced" class="accent-indigo-500" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400">Model</label>
              <select v-model="ollamaForm.model" @change="saveOllamaConfigDebounced"
                      class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                <option v-if="!ollamaModels.length" value="" disabled>No models available</option>
                <option v-for="m in ollamaModels" :key="m.name" :value="m.name">{{ m.name }} ({{ formatSize(m.size) }})</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400">Max Tokens</label>
              <input v-model.number="ollamaForm.max_tokens" type="number" @keydown.enter="saveOllamaConfigNow"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">API Key <span class="text-gray-600">(optional, for remote)</span></label>
              <input v-model="ollamaForm.api_key" type="password" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfigNow" @input="ollamaKeyDirty = true"
                     class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200" />
            </div>
            <div>
              <label class="text-xs text-gray-400">Base URL</label>
              <input v-model="ollamaForm.base_url" placeholder="http://127.0.0.1:11434" @keydown.enter="saveOllamaConfigNow"
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium"}),a=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),i=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),l=h(!1),r=h(!1),o=h(!1),c=h(!1),u=h(!1),d=h(!1),f=h(!1),p=h({configured:!1}),m=h([]),g=h(""),k=h(!1),E=h(!1),v=h({configured:!1}),b=h([]),x=h(""),R=h(!1),S=h(!1),D=h(!0),w=h(""),I=h({configured:!1,accounts:[]}),L=h(null),H=h(null),F=h(""),P=h(null),W=h(!1),B=h(null),j=h(null),N=h("");let O=null;function z(C,X="success"){xe(C,X==="error"?"error":"success")}function ue(C){if(!C)return"?";const X=C/(1024*1024*1024);return X>=1?X.toFixed(1)+" GB":(C/(1024*1024)).toFixed(0)+" MB"}async function ve(){e.value=!0,await Promise.all([se(),de(),le(),Y()]),e.value=!1}async function se(){try{const C=await K.get("/api/llm/status");t.value=C,s.value=C.active_provider||"codex",C.codex&&!M.pending()&&(n.value.enabled=C.codex.enabled,n.value.model=C.codex.model||"gpt-5.5",n.value.reasoning_effort=C.codex.reasoning_effort||"medium",n.value.max_tokens=C.codex.max_tokens||4096),C.ollama&&!G.pending()&&(a.value.enabled=C.ollama.enabled,a.value.base_url=C.ollama.base_url||"",a.value.model=C.ollama.model||"",a.value.max_tokens=C.ollama.max_tokens||4096),C.kimi&&!A.pending()&&(i.value.enabled=C.kimi.enabled,i.value.model=C.kimi.model||"",i.value.max_tokens=C.kimi.max_tokens||4096)}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function de(){try{if(p.value=await K.get("/api/ollama/status"),p.value.model&&(g.value=p.value.model),p.value.configured)try{const C=await K.get("/api/ollama/models");m.value=C.models||[]}catch{m.value=[]}else if(a.value.base_url)try{const C=await K.post("/api/ollama/probe-models",{base_url:a.value.base_url});m.value=C.models||[]}catch{m.value=[]}}catch{p.value={configured:!1}}}async function Y(){D.value=!0,w.value="";try{I.value=await K.get("/api/codex/status")}catch(C){w.value=C.message||"Failed to fetch Codex status"}finally{D.value=!1}}async function oe(){const C=t.value?t.value.active_provider:"codex";f.value=!0;try{const X=await K.post("/api/llm/switch",{provider:s.value});X.error?(s.value=C,z(X.error,"error")):(z("Switched to "+s.value+" ("+X.model+")"),await ve())}catch(X){s.value=C,z(X.message||"Switch failed","error")}finally{f.value=!1}}async function Ie(){k.value=!0;try{const C=await K.post("/api/ollama/reload");z(C.configured?"Ollama reloaded":C.reason||"Ollama not configured",C.configured?"success":"error"),await ve()}catch(C){z(C.message||"Reload failed","error")}finally{k.value=!1}}async function V(){E.value=!0;try{await K.post("/api/ollama/model",{model:g.value}),z("Model set to "+g.value),await ve()}catch(C){z(C.message||"Failed","error")}finally{E.value=!1}}async function re(){const C=a.value.base_url;if(!C){z("Enter a base URL first","error");return}d.value=!0;try{const X=await K.post("/api/ollama/probe-models",{base_url:C});m.value=X.models||[],m.value.length?(z(m.value.length+" model(s) found"),!a.value.model&&m.value.length&&(a.value.model=m.value[0].name)):z("No models found at "+C,"error")}catch(X){z(X.message||"Could not reach Ollama","error")}finally{d.value=!1}}async function le(){try{if(v.value=await K.get("/api/kimi/status"),v.value.model&&(x.value=v.value.model),v.value.configured)try{const C=await K.get("/api/kimi/models");b.value=C.models||[]}catch{b.value=[]}}catch{v.value={configured:!1}}}async function ge(){R.value=!0;try{const C=await K.post("/api/kimi/reload");z(C.configured?"Kimi reloaded":C.reason||"Kimi not configured",C.configured?"success":"error"),await ve()}catch(C){z(C.message||"Reload failed","error")}finally{R.value=!1}}async function me(){S.value=!0;try{await K.post("/api/kimi/model",{model:x.value}),z("Model set to "+x.value),await ve()}catch(C){z(C.message||"Failed","error")}finally{S.value=!1}}async function De(){if(o.value){M();return}o.value=!0;try{await K.put("/api/llm/codex/config",n.value),z("Codex config saved"),await Promise.all([se(),Y()])}catch(C){z(C.message||"Failed","error"),await Promise.all([se(),Y()])}finally{o.value=!1}}async function y(){if(c.value){G();return}c.value=!0;try{const C={...a.value},X=l.value?a.value.api_key:null;X===null&&delete C.api_key,await K.put("/api/llm/ollama/config",C),z("Ollama config saved"),X!==null&&a.value.api_key===X&&(a.value.api_key="",l.value=!1),await Promise.all([se(),de()])}catch(C){z(C.message||"Failed","error")}finally{c.value=!1}}async function T(){if(u.value){A();return}u.value=!0;try{const C={...i.value},X=r.value?i.value.api_key:null;X===null&&delete C.api_key,await K.put("/api/llm/kimi/config",C),z("Kimi config saved"),X!==null&&i.value.api_key===X&&(i.value.api_key="",r.value=!1),await Promise.all([se(),le()])}catch(C){z(C.message||"Failed","error")}finally{u.value=!1}}const M=$r(De),G=$r(y),A=$r(T),$=()=>(M.cancel(),De()),J=()=>(G.cancel(),y()),Z=()=>(A.cancel(),T());async function te(C){try{await K.post("/api/codex/account/"+C+"/activate"),z("Active account switched"),await Y()}catch(X){z(X.message||"Failed","error")}}async function Q(C){L.value=C;try{await K.post("/api/codex/account/"+C+"/refresh"),z("Token refreshed"),await Y()}catch(X){z(X.message||"Refresh failed","error")}finally{L.value=null}}function pe(C,X){H.value=C,F.value=X||""}async function ie(C){try{await K.put("/api/codex/account/"+C+"/label",{label:F.value}),z("Label updated"),H.value=null,await Y()}catch(X){z(X.message||"Failed","error")}}async function ce(C,X){if(await ns({title:"Delete Codex account",message:`Delete ${X||"account #"+(C+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+C),z("Deleted. Pool reloaded."),await Y()}catch(Le){z(Le.message||"Failed","error")}}async function ye(){W.value=!0;try{const C=await K.post("/api/codex/device-code");B.value=C,P.value="pending",Se(C)}catch(C){z(C.message||"Failed","error")}finally{W.value=!1}}async function Se(C){O={cancelled:!1};const X=O;try{const be=await K.post("/api/codex/device-poll",{device_auth_id:C.device_auth_id,user_code:C.user_code,interval:C.interval});if(X.cancelled)return;j.value=be,P.value="success",await ve()}catch(be){if(X.cancelled)return;N.value=be.message||"Device login failed",P.value="error"}}function Ee(){O&&(O.cancelled=!0),P.value=null,B.value=null}return $e(ve),ft(()=>{O&&(O.cancelled=!0),M.cancel(),G.cancel(),A.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:f,codexForm:n,ollamaForm:a,kimiForm:i,savingCodex:o,savingOllama:c,savingKimi:u,probingOllama:d,ollamaKeyDirty:l,kimiKeyDirty:r,ollamaStatus:p,ollamaModels:m,ollamaSelectedModel:g,reloading:k,settingModel:E,kimiStatus:v,kimiModels:b,kimiSelectedModel:x,reloadingKimi:R,settingKimiModel:S,codexLoading:D,codexError:w,codexData:I,refreshing:L,editingLabel:H,labelValue:F,deviceState:P,deviceLoading:W,deviceInfo:B,deviceResult:j,deviceError:N,fetchAll:ve,switchProvider:oe,reloadOllama:Ie,setOllamaModel:V,reloadKimi:ge,setKimiModel:me,probeOllamaModels:re,saveCodexConfig:De,saveOllamaConfig:y,saveKimiConfig:T,saveCodexConfigDebounced:M,saveOllamaConfigDebounced:G,saveKimiConfigDebounced:A,saveCodexConfigNow:$,saveOllamaConfigNow:J,saveKimiConfigNow:Z,activateAccount:te,refreshAccount:Q,startEditLabel:pe,saveLabel:ie,deleteAccount:ce,startDeviceLogin:ye,cancelDeviceLogin:Ee,formatSize:ue}}},$d={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Uw(e){return $d[e]||$d[(e||"").toLowerCase()]||"text-gray-400"}const Hw={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),u=h(null);let d=null;async function f(){const p=await Promise.allSettled([K.get("/api/startup/diagnostics"),K.get("/api/subsystems/status"),K.get("/api/pools/ssh"),K.get("/api/pools/http"),K.get("/api/risk/stats"),K.get("/api/recovery/stats"),K.get("/api/compression/stats"),K.get("/api/routing/stats"),K.get("/api/freshness/stats"),K.get("/api/governor/stats")]),m=k=>p[k].status==="fulfilled"?p[k].value:null;t.value=m(0)||{};const g=m(1);s.value=Array.isArray(g)?g:g&&g.subsystems||[],n.value=m(2)||{},a.value=m(3)||{},i.value=m(4),l.value=m(5),r.value=m(6),o.value=m(7),c.value=m(8),u.value=m(9),e.value=!1}return $e(()=>{f(),d=setInterval(f,3e4)}),ft(()=>{d&&clearInterval(d)}),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,routingStats:o,freshnessStats:c,governorStats:u,statusColor:Uw,formatTime:xc}}},jw={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const d=await K.get("/api/update/check");e.value=d.current||"",t.value=d.latest||"",s.value=d.update_available||!1,n.value=d.changelog||"",d.error&&(r.value=d.error),o.value=!0}catch(d){r.value=d.message}finally{a.value=!1}}async function u(){if(await ns({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return $e(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:u}},template:`
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
  `},Vw={components:{TabbedPage:ir},setup(){return{tabs:[{id:"health",label:"Health",component:_w},{id:"resources",label:"Resources",component:kw},{id:"logs",label:"Logs",component:Cw},{id:"config",label:"Config",component:Pw},{id:"discord",label:"Discord",component:Mw},{id:"host-access",label:"Host Access",component:Fw},{id:"api-tokens",label:"API Tokens",component:$w},{id:"llm",label:"LLM Config",component:Bw},{id:"internals",label:"Internals",component:Hw},{id:"update",label:"Update",component:jw}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},ug=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:N_,meta:{label:"Dashboard",icon:"📊"}},{path:"/chat",component:Wk,meta:{label:"Chat",icon:"💭"}},{path:"/operations",component:ew,meta:{label:"Operations",icon:"🎯"}},{path:"/history",component:rw,meta:{label:"History",icon:"📝"}},{path:"/capabilities",component:mw,meta:{label:"Capabilities",icon:"🔧"}},{path:"/personality",component:vw,meta:{label:"Personality",icon:"🎭"}},{path:"/system",component:Vw,meta:{label:"System",icon:"⚙️"}},{path:"/execution",redirect:{path:"/operations",query:{tab:"live"}}},{path:"/agents",redirect:{path:"/operations",query:{tab:"agents"}}},{path:"/loops",redirect:{path:"/operations",query:{tab:"loops"}}},{path:"/processes",redirect:{path:"/operations",query:{tab:"processes"}}},{path:"/schedules",redirect:{path:"/operations",query:{tab:"schedules"}}},{path:"/audit",redirect:{path:"/history",query:{tab:"audit"}}},{path:"/sessions",redirect:{path:"/history",query:{tab:"sessions"}}},{path:"/traces",redirect:{path:"/history",query:{tab:"traces"}}},{path:"/usage",redirect:{path:"/history",query:{tab:"usage"}}},{path:"/tools",redirect:{path:"/capabilities",query:{tab:"tools"}}},{path:"/skills",redirect:{path:"/capabilities",query:{tab:"skills"}}},{path:"/knowledge",redirect:{path:"/capabilities",query:{tab:"knowledge"}}},{path:"/memory",redirect:{path:"/capabilities",query:{tab:"memory"}}},{path:"/health",redirect:{path:"/system",query:{tab:"health"}}},{path:"/resources",redirect:{path:"/system",query:{tab:"resources"}}},{path:"/logs",redirect:{path:"/system",query:{tab:"logs"}}},{path:"/config",redirect:{path:"/system",query:{tab:"config"}}},{path:"/host-access",redirect:{path:"/system",query:{tab:"host-access"}}},{path:"/internals",redirect:{path:"/system",query:{tab:"internals"}}}],dg=S_({history:s_(),routes:ug});dg.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const qw={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},zw={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(!1),i=h("disconnected"),l=h(-1),r=h(null);let o=null;const c=h("starting"),u=h(""),d=ug.filter(S=>S.meta);K.onSessionExpired=()=>{t.value=!0,qe.disconnect(),K.setToken(""),e.value="login"};function f(S){if((S.ctrlKey||S.metaKey)&&S.key.toLowerCase()==="k"){e.value==="ready"&&(S.preventDefault(),E_());return}if(S.key==="Escape"&&n.value){n.value=!1,S.preventDefault();return}if(S.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(S.target.tagName)){S.preventDefault();const D=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');D&&D.focus()}}$e(async()=>{document.addEventListener("keydown",f);const S=await K.check();S.ok?(e.value="ready",x()):S.needsAuth?e.value="login":(e.value="ready",x())});function p(){t.value=!1,e.value="ready",x()}async function m(){await K.logout(),qe.disconnect(),e.value="login"}function g(){s.value=!s.value}const k=ee(()=>{switch(i.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function E(S,D="info",w=3e3){r.value={text:S,level:D},clearTimeout(o),o=setTimeout(()=>{r.value=null},w)}let v=null,b=!1;function x(){qe.onStatusChange=S=>{a.value=S},qe.onStateChange=(S,D)=>{i.value=S,l.value=D.latency??-1,S==="connected"?(b&&E("Connection restored","success"),b=!0):S==="reconnecting"&&D.attempt===1&&E("Connection lost — reconnecting…","warn")},qe.connect(),R(),v&&clearInterval(v),v=setInterval(R,15e3)}async function R(){try{const S=await K.get("/api/status");c.value=S.status==="online"?"online":"starting";const D=S.uptime_seconds||0,w=Math.floor(D/3600),I=Math.floor(D%3600/60);u.value=`${w}h ${I}m uptime`}catch{c.value="offline",u.value=""}}return ft(()=>{v&&clearInterval(v),qe.disconnect(),document.removeEventListener("keydown",f)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:a,wsState:i,wsLatency:l,wsLabel:k,wsToast:r,botStatus:c,botUptime:u,navRoutes:d,onLogin:p,logout:m,toggleSidebar:g}}},Ca=vl(zw);Ca.component("login-screen",qw);Ca.component("toast-container",m0);Ca.component("confirm-host",v0);Ca.component("command-palette",R_);Ca.use(dg);Ca.mount("#app");
