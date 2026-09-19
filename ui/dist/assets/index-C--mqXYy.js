var Zv=Object.defineProperty;var Yv=(e,t,s)=>t in e?Zv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ft=(e,t,s)=>Yv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Qv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Ol("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new yr(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Ol("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new yr((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async setListenerExposure(t,s){const a=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:s})}),n=await a.json().catch(()=>null);if(!a.ok)throw new yr((n==null?void 0:n.error)||"Listener reauthentication failed",a.status,n);return n}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Ol((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Ol?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Ol extends Error{constructor(t){super(t),this.name="AuthError"}}class yr extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Xv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const z=new Qv,Xe=new Xv(z);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ls(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},Qn=[],Qt=()=>{},Jn=()=>!1,An=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),$o=e=>e.startsWith("onUpdate:"),We=Object.assign,Pc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},eg=Object.prototype.hasOwnProperty,lt=(e,t)=>eg.call(e,t),Ee=Array.isArray,Xn=e=>xi(e)==="[object Map]",Rn=e=>xi(e)==="[object Set]",Wd=e=>xi(e)==="[object Date]",tg=e=>xi(e)==="[object RegExp]",Pe=e=>typeof e=="function",Be=e=>typeof e=="string",os=e=>typeof e=="symbol",tt=e=>e!==null&&typeof e=="object",Mc=e=>(tt(e)||Pe(e))&&Pe(e.then)&&Pe(e.catch),nf=Object.prototype.toString,xi=e=>nf.call(e),sg=e=>xi(e).slice(8,-1),Bo=e=>xi(e)==="[object Object]",Uo=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ia=Ls(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),ag=Ls("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ho=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},ng=/-\w/g,pt=Ho(e=>e.replace(ng,t=>t.slice(1).toUpperCase())),ig=/\B([A-Z])/g,Ss=Ho(e=>e.replace(ig,"-$1").toLowerCase()),In=Ho(e=>e.charAt(0).toUpperCase()+e.slice(1)),ei=Ho(e=>e?`on${In(e)}`:""),jt=(e,t)=>!Object.is(e,t),ti=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},lf=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},zo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},lo=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let Kd;const jo=()=>Kd||(Kd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function lg(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const og="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",rg=Ls(og);function gl(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Be(a)?of(a):gl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Be(e)||tt(e))return e}const cg=/;(?![^(]*\))/g,dg=/:([^]+)/,ug=/\/\*[^]*?\*\//g;function of(e){const t={};return e.replace(ug,"").split(cg).forEach(s=>{if(s){const a=s.split(dg);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function bl(e){let t="";if(Be(e))t=e;else if(Ee(e))for(let s=0;s<e.length;s++){const a=bl(e[s]);a&&(t+=a+" ")}else if(tt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function pg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=bl(t)),s&&(e.style=gl(s)),e}const fg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",hg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",mg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",vg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",gg=Ls(fg),bg=Ls(hg),yg=Ls(mg),xg=Ls(vg),_g="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",wg=Ls(_g);function rf(e){return!!e||e===""}function kg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Da(e[a],t[a]);return s}function Da(e,t){if(e===t)return!0;let s=Wd(e),a=Wd(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=os(e),a=os(t),s||a)return e===t;if(s=Ee(e),a=Ee(t),s||a)return s&&a?kg(e,t):!1;if(s=tt(e),a=tt(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Da(e[l],t[l]))return!1}}return String(e)===String(t)}function Vo(e,t){return e.findIndex(s=>Da(s,t))}const cf=e=>!!(e&&e.__v_isRef===!0),df=e=>Be(e)?e:e==null?"":Ee(e)||tt(e)&&(e.toString===nf||!Pe(e.toString))?cf(e)?df(e.value):JSON.stringify(e,uf,2):String(e),uf=(e,t)=>cf(t)?uf(e,t.value):Xn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[xr(a,i)+" =>"]=n,s),{})}:Rn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>xr(s))}:os(t)?xr(t):tt(t)&&!Ee(t)&&!Bo(t)?String(t):t,xr=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Sg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let $t;class Fc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&$t&&($t.active?(this.parent=$t,this.index=($t.scopes||($t.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=$t;try{return $t=this,t()}finally{$t=s}}}on(){++this._on===1&&(this.prevScope=$t,$t=this)}off(){if(this._on>0&&--this._on===0){if($t===this)$t=this.prevScope;else{let t=$t;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function Tg(e){return new Fc(e)}function pf(){return $t}function Cg(e,t=!1){$t&&$t.cleanups.push(e)}let ht;const _r=new WeakSet;class Zi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,$t&&($t.active?$t.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,_r.has(this)&&(_r.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||hf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Jd(this),mf(this);const t=ht,s=Ks;ht=this,Ks=!0;try{return this.fn()}finally{vf(this),ht=t,Ks=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Uc(t);this.deps=this.depsTail=void 0,Jd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?_r.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Jr(this)&&this.run()}get dirty(){return Jr(this)}}let ff=0,Ui,Hi;function hf(e,t=!1){if(e.flags|=8,t){e.next=Hi,Hi=e;return}e.next=Ui,Ui=e}function $c(){ff++}function Bc(){if(--ff>0)return;if(Hi){let t=Hi;for(Hi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ui;){let t=Ui;for(Ui=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function mf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function vf(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Uc(a),Eg(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Jr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(gf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function gf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Yi)||(e.globalVersion=Yi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Jr(e))))return;e.flags|=2;const t=e.dep,s=ht,a=Ks;ht=e,Ks=!0;try{mf(e);const n=e.fn(e._value);(t.version===0||jt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{ht=s,Ks=a,vf(e),e.flags&=-3}}function Uc(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Uc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Eg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Ag(e,t){e.effect instanceof Zi&&(e=e.effect.fn);const s=new Zi(e);t&&We(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function Rg(e){e.effect.stop()}let Ks=!0;const bf=[];function Pa(){bf.push(Ks),Ks=!1}function Ma(){const e=bf.pop();Ks=e===void 0?!0:e}function Jd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ht;ht=void 0;try{t()}finally{ht=s}}}let Yi=0;class Ig{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class qo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ht||!Ks||ht===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ht)s=this.activeLink=new Ig(ht,this),ht.deps?(s.prevDep=ht.depsTail,ht.depsTail.nextDep=s,ht.depsTail=s):ht.deps=ht.depsTail=s,yf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=ht.depsTail,s.nextDep=void 0,ht.depsTail.nextDep=s,ht.depsTail=s,ht.deps===s&&(ht.deps=a)}return s}trigger(t){this.version++,Yi++,this.notify(t)}notify(t){$c();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Bc()}}}function yf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)yf(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const oo=new WeakMap,yn=Symbol(""),Zr=Symbol(""),Qi=Symbol("");function ns(e,t,s){if(Ks&&ht){let a=oo.get(e);a||oo.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new qo),n.map=a,n.key=s),n.track()}}function Ta(e,t,s,a,n,i){const l=oo.get(e);if(!l){Yi++;return}const o=r=>{r&&r.trigger()};if($c(),t==="clear")l.forEach(o);else{const r=Ee(e),c=r&&Uo(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(yn)),Xn(e)&&o(l.get(Zr)));break;case"delete":r||(o(l.get(yn)),Xn(e)&&o(l.get(Zr)));break;case"set":Xn(e)&&o(l.get(yn));break}}Bc()}function Og(e,t){const s=oo.get(e);return s&&s.get(t)}function Bn(e){const t=Qe(e);return t===e?t:(ns(t,"iterate",Qi),Cs(e)?t:t.map(Zs))}function Go(e){return ns(e=Qe(e),"iterate",Qi),e}function ra(e,t){return da(e)?ri(Oa(e)?Zs(t):t):Zs(t)}const Lg={__proto__:null,[Symbol.iterator](){return wr(this,Symbol.iterator,e=>ra(this,e))},concat(...e){return Bn(this).concat(...e.map(t=>Ee(t)?Bn(t):t))},entries(){return wr(this,"entries",e=>(e[1]=ra(this,e[1]),e))},every(e,t){return ga(this,"every",e,t,void 0,arguments)},filter(e,t){return ga(this,"filter",e,t,s=>s.map(a=>ra(this,a)),arguments)},find(e,t){return ga(this,"find",e,t,s=>ra(this,s),arguments)},findIndex(e,t){return ga(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return ga(this,"findLast",e,t,s=>ra(this,s),arguments)},findLastIndex(e,t){return ga(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return ga(this,"forEach",e,t,void 0,arguments)},includes(...e){return kr(this,"includes",e)},indexOf(...e){return kr(this,"indexOf",e)},join(e){return Bn(this).join(e)},lastIndexOf(...e){return kr(this,"lastIndexOf",e)},map(e,t){return ga(this,"map",e,t,void 0,arguments)},pop(){return Si(this,"pop")},push(...e){return Si(this,"push",e)},reduce(e,...t){return Zd(this,"reduce",e,t)},reduceRight(e,...t){return Zd(this,"reduceRight",e,t)},shift(){return Si(this,"shift")},some(e,t){return ga(this,"some",e,t,void 0,arguments)},splice(...e){return Si(this,"splice",e)},toReversed(){return Bn(this).toReversed()},toSorted(e){return Bn(this).toSorted(e)},toSpliced(...e){return Bn(this).toSpliced(...e)},unshift(...e){return Si(this,"unshift",e)},values(){return wr(this,"values",e=>ra(this,e))}};function wr(e,t,s){const a=Go(e),n=a[t]();return a!==e&&!Cs(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const Ng=Array.prototype;function ga(e,t,s,a,n,i){const l=Go(e),o=l!==e&&!Cs(e),r=l[t];if(r!==Ng[t]){const u=r.apply(e,i);return o?Zs(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ra(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function Zd(e,t,s,a){const n=Go(e),i=n!==e&&!Cs(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ra(e,c)),s.call(this,c,ra(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ra(e,r):r}function kr(e,t,s){const a=Qe(e);ns(a,"iterate",Qi);const n=a[t](...s);return(n===-1||n===!1)&&yl(s[0])?(s[0]=Qe(s[0]),a[t](...s)):n}function Si(e,t,s=[]){Pa(),$c();const a=Qe(e)[t].apply(e,s);return Bc(),Ma(),a}const Dg=Ls("__proto__,__v_isRef,__isVue"),xf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function Pg(e){os(e)||(e=String(e));const t=Qe(this);return ns(t,"has",e),t.hasOwnProperty(e)}class _f{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?Ef:Cf:i?Tf:Sf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Ee(t);if(!n){let r;if(l&&(r=Lg[s]))return r;if(s==="hasOwnProperty")return Pg}const o=Reflect.get(t,s,Nt(t)?t:a);if((os(s)?xf.has(s):Dg(s))||(n||ns(t,"get",s),i))return o;if(Nt(o)){const r=l&&Uo(s)?o:o.value;return n&&tt(r)?ro(r):r}return tt(o)?n?ro(o):an(o):o}}class wf extends _f{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Ee(t)&&Uo(s);if(!this._isShallow){const c=da(i);if(!Cs(a)&&!da(a)&&(i=Qe(i),a=Qe(a)),!l&&Nt(i)&&!Nt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:lt(t,s),r=Reflect.set(t,s,a,Nt(t)?t:n);return t===Qe(n)&&(o?jt(a,i)&&Ta(t,"set",s,a):Ta(t,"add",s,a)),r}deleteProperty(t,s){const a=lt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Ta(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!os(s)||!xf.has(s))&&ns(t,"has",s),a}ownKeys(t){return ns(t,"iterate",Ee(t)?"length":yn),Reflect.ownKeys(t)}}class kf extends _f{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Mg=new wf,Fg=new kf,$g=new wf(!0),Bg=new kf(!0),Yr=e=>e,Ll=e=>Reflect.getPrototypeOf(e);function Ug(e,t,s){return function(...a){const n=this.__v_raw,i=Qe(n),l=Xn(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Yr:t?ri:Zs;return!t&&ns(i,"iterate",r?Zr:yn),We(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Nl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Hg(e,t){const s={get(n){const i=this.__v_raw,l=Qe(i),o=Qe(n);e||(jt(n,o)&&ns(l,"get",n),ns(l,"get",o));const{has:r}=Ll(l),c=t?Yr:e?ri:Zs;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&ns(Qe(n),"iterate",yn),n.size},has(n){const i=this.__v_raw,l=Qe(i),o=Qe(n);return e||(jt(n,o)&&ns(l,"has",n),ns(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=Qe(o),c=t?Yr:e?ri:Zs;return!e&&ns(r,"iterate",yn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return We(s,e?{add:Nl("add"),set:Nl("set"),delete:Nl("delete"),clear:Nl("clear")}:{add(n){const i=Qe(this),l=Ll(i),o=Qe(n),r=!t&&!Cs(n)&&!da(n)?o:n;return l.has.call(i,r)||jt(n,r)&&l.has.call(i,n)||jt(o,r)&&l.has.call(i,o)||(i.add(r),Ta(i,"add",r,r)),this},set(n,i){!t&&!Cs(i)&&!da(i)&&(i=Qe(i));const l=Qe(this),{has:o,get:r}=Ll(l);let c=o.call(l,n);c||(n=Qe(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?jt(i,d)&&Ta(l,"set",n,i):Ta(l,"add",n,i),this},delete(n){const i=Qe(this),{has:l,get:o}=Ll(i);let r=l.call(i,n);r||(n=Qe(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Ta(i,"delete",n,void 0),c},clear(){const n=Qe(this),i=n.size!==0,l=n.clear();return i&&Ta(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=Ug(n,e,t)}),s}function Wo(e,t){const s=Hg(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(lt(s,n)&&n in a?s:a,n,i)}const zg={get:Wo(!1,!1)},jg={get:Wo(!1,!0)},Vg={get:Wo(!0,!1)},qg={get:Wo(!0,!0)},Sf=new WeakMap,Tf=new WeakMap,Cf=new WeakMap,Ef=new WeakMap;function Gg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function an(e){return da(e)?e:Ko(e,!1,Mg,zg,Sf)}function Hc(e){return Ko(e,!1,$g,jg,Tf)}function ro(e){return Ko(e,!0,Fg,Vg,Cf)}function Wg(e){return Ko(e,!0,Bg,qg,Ef)}function Ko(e,t,s,a,n){if(!tt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Gg(sg(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Oa(e){return da(e)?Oa(e.__v_raw):!!(e&&e.__v_isReactive)}function da(e){return!!(e&&e.__v_isReadonly)}function Cs(e){return!!(e&&e.__v_isShallow)}function yl(e){return e?!!e.__v_raw:!1}function Qe(e){const t=e&&e.__v_raw;return t?Qe(t):e}function Af(e){return!lt(e,"__v_skip")&&Object.isExtensible(e)&&lf(e,"__v_skip",!0),e}const Zs=e=>tt(e)?an(e):e,ri=e=>tt(e)?ro(e):e;function Nt(e){return e?e.__v_isRef===!0:!1}function f(e){return Rf(e,!1)}function zc(e){return Rf(e,!0)}function Rf(e,t){return Nt(e)?e:new Kg(e,t)}class Kg{constructor(t,s){this.dep=new qo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Qe(t),this._value=s?t:Zs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Cs(t)||da(t);t=a?t:Qe(t),jt(t,s)&&(this._rawValue=t,this._value=a?t:Zs(t),this.dep.trigger())}}function Jg(e){e.dep&&e.dep.trigger()}function ca(e){return Nt(e)?e.value:e}function Zg(e){return Pe(e)?e():ca(e)}const Yg={get:(e,t,s)=>t==="__v_raw"?e:ca(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Nt(n)&&!Nt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function jc(e){return Oa(e)?e:new Proxy(e,Yg)}class Qg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new qo,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function If(e){return new Qg(e)}function Xg(e){const t=Ee(e)?new Array(e.length):{};for(const s in e)t[s]=Of(e,s);return t}class eb{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=Qe(t);let n=!0,i=t;if(!Ee(t)||os(this._key)||!Uo(this._key))do n=!yl(i)||Cs(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=ca(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Nt(this._raw[this._key])){const s=this._object[this._key];if(Nt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Og(this._raw,this._key)}}class tb{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function sb(e,t,s){return Nt(e)?e:Pe(e)?new tb(e):tt(e)&&arguments.length>1?Of(e,t,s):f(e)}function Of(e,t,s){return new eb(e,t,s)}class ab{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new qo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Yi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&ht!==this)return hf(this,!0),!0}get value(){const t=this.dep.track();return gf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function nb(e,t,s=!1){let a,n;return Pe(e)?a=e:(a=e.get,n=e.set),new ab(a,n,s)}const ib={GET:"get",HAS:"has",ITERATE:"iterate"},lb={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Dl={},co=new WeakMap;let Ja;function ob(){return Ja}function Lf(e,t=!1,s=Ja){if(s){let a=co.get(s);a||co.set(s,a=[]),a.push(e)}}function rb(e,t,s=Ke){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:Cs(b)||n===!1||n===0?Ca(b,1):Ca(b);let d,u,p,h,m=!1,g=!1;if(Nt(e)?(u=()=>e.value,m=Cs(e)):Oa(e)?(u=()=>c(e),m=!0):Ee(e)?(g=!0,m=e.some(b=>Oa(b)||Cs(b)),u=()=>e.map(b=>{if(Nt(b))return b.value;if(Oa(b))return c(b);if(Pe(b))return r?r(b,2):b()})):Pe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Pa();try{p()}finally{Ma()}}const b=Ja;Ja=d;try{return r?r(e,3,[h]):e(h)}finally{Ja=b}}:u=Qt,t&&n){const b=u,x=n===!0?1/0:n;u=()=>Ca(b(),x)}const A=pf(),I=()=>{d.stop(),A&&A.active&&Pc(A.effects,d)};if(i&&t){const b=t;t=(...x)=>{const _=b(...x);return I(),_}}let y=g?new Array(e.length).fill(Dl):Dl;const v=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const x=d.run();if(b||n||m||(g?x.some((_,E)=>jt(_,y[E])):jt(x,y))){p&&p();const _=Ja;Ja=d;try{const E=[x,y===Dl?void 0:g&&y[0]===Dl?[]:y,h];y=x,r?r(t,3,E):t(...E)}finally{Ja=_}}}else d.run()};return o&&o(v),d=new Zi(u),d.scheduler=l?()=>l(v,!1):v,h=b=>Lf(b,!1,d),p=d.onStop=()=>{const b=co.get(d);if(b){if(r)r(b,4);else for(const x of b)x();co.delete(d)}},t?a?v(!0):y=d.run():l?l(v.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function Ca(e,t=1/0,s){if(t<=0||!tt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Nt(e))Ca(e.value,t,s);else if(Ee(e))for(let a=0;a<e.length;a++)Ca(e[a],t,s);else if(Rn(e)||Xn(e))e.forEach(a=>{Ca(a,t,s)});else if(Bo(e)){for(const a in e)Ca(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ca(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Nf=[];function cb(e){Nf.push(e)}function db(){Nf.pop()}function ub(e,t){}const pb={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},fb={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function _i(e,t,s,a){try{return a?e(...a):e()}catch(n){On(n,t,s)}}function Os(e,t,s,a){if(Pe(e)){const n=_i(e,t,s,a);return n&&Mc(n)&&n.catch(i=>{On(i,t,s)}),n}if(Ee(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Os(e[i],t,s,a));return n}}function On(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Pa(),_i(i,null,10,[e,r,c]),Ma();return}}hb(e,s,n,a,l)}function hb(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const ps=[];let la=-1;const si=[];let Za=null,qn=0;const Df=Promise.resolve();let uo=null;function At(e){const t=uo||Df;return e?t.then(this?e.bind(this):e):t}function mb(e){let t=la+1,s=ps.length;for(;t<s;){const a=t+s>>>1,n=ps[a],i=el(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function Vc(e){if(!(e.flags&1)){const t=el(e),s=ps[ps.length-1];!s||!(e.flags&2)&&t>=el(s)?ps.push(e):ps.splice(mb(t),0,e),e.flags|=1,Pf()}}function Pf(){uo||(uo=Df.then(Mf))}function Xi(e){Ee(e)?si.push(...e):Za&&e.id===-1?Za.splice(qn+1,0,e):e.flags&1||(si.push(e),e.flags|=1),Pf()}function Yd(e,t,s=la+1){for(;s<ps.length;s++){const a=ps[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;ps.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function po(e){if(si.length){const t=[...new Set(si)].sort((s,a)=>el(s)-el(a));if(si.length=0,Za){Za.push(...t);return}for(Za=t,qn=0;qn<Za.length;qn++){const s=Za[qn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Za=null,qn=0}}const el=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Mf(e){try{for(la=0;la<ps.length;la++){const t=ps[la];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),_i(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;la<ps.length;la++){const t=ps[la];t&&(t.flags&=-2)}la=-1,ps.length=0,po(),uo=null,(ps.length||si.length)&&Mf()}}let Gn,Pl=[];function Ff(e,t){var s,a;Gn=e,Gn?(Gn.enabled=!0,Pl.forEach(({event:n,args:i})=>Gn.emit(n,...i)),Pl=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Ff(i,t)}),setTimeout(()=>{Gn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Pl=[])},3e3)):Pl=[]}let Yt=null,Jo=null;function tl(e){const t=Yt;return Yt=e,Jo=e&&e.type.__scopeId||null,t}function vb(e){Jo=e}function gb(){Jo=null}const bb=e=>qc;function qc(e,t=Yt,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&il(-1);const i=tl(t);let l;try{l=e(...n)}finally{tl(i),a._d&&il(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function yb(e,t){if(Yt===null)return e;const s=kl(Yt),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=Ke]=t[n];i&&(Pe(i)&&(i={mounted:i,updated:i}),i.deep&&Ca(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function oa(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Pa(),Os(r,s,8,[e.el,o,e,t]),Ma())}}function zi(e,t){if(Zt){let s=Zt.provides;const a=Zt.parent&&Zt.parent.provides;a===s&&(s=Zt.provides=Object.create(a)),s[e]=t}}function Hs(e,t,s=!1){const a=hs();if(a||xn){let n=xn?xn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Pe(t)?t.call(a&&a.proxy):t}}function xb(){return!!(hs()||xn)}const $f=Symbol.for("v-scx"),Bf=()=>Hs($f);function _b(e,t){return xl(e,null,t)}function wb(e,t){return xl(e,null,{flush:"post"})}function Uf(e,t){return xl(e,null,{flush:"sync"})}function Dt(e,t,s){return xl(e,t,s)}function xl(e,t,s=Ke){const{immediate:a,deep:n,flush:i,once:l}=s,o=We({},s),r=t&&a||!t&&i!=="post";let c;if(Tn){if(i==="sync"){const h=Bf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Qt,h.resume=Qt,h.pause=Qt,h}}const d=Zt;o.call=(h,m,g)=>Os(h,d,m,g);let u=!1;i==="post"?o.scheduler=h=>{Ot(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():Vc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=rb(e,t,o);return Tn&&(c?c.push(p):r&&p()),p}function kb(e,t,s){const a=this.proxy,n=Be(e)?e.includes(".")?Hf(a,e):()=>a[e]:e.bind(a,a);let i;Pe(t)?i=t:(i=t.handler,s=t);const l=wi(this),o=xl(n,i.bind(a),s);return l(),o}function Hf(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const Wa=new WeakMap,zf=Symbol("_vte"),jf=e=>e.__isTeleport,mn=e=>e&&(e.disabled||e.disabled===""),Sb=e=>e&&(e.defer||e.defer===""),Qd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Xd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Qr=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},Tb={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:g,createComment:A,parentNode:I}}=c,y=mn(t.props);let{dynamicChildren:v}=t;const b=(E,C,w)=>{E.shapeFlag&16&&d(E.children,C,w,n,i,l,o,r)},x=(E=t)=>{const C=mn(E.props),w=E.target=Qr(E.props,m),R=Xr(w,E,g,h);w&&(l!=="svg"&&Qd(w)?l="svg":l!=="mathml"&&Xd(w)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(w),C||(b(E,w,R),Pi(E,!1)))},_=E=>{const C=()=>{if(Wa.get(E)===C){if(Wa.delete(E),mn(E.props)){const w=I(E.el)||s;b(E,w,E.anchor),Pi(E,!0)}x(E)}};Wa.set(E,C),Ot(C,i)};if(e==null){const E=t.el=g(""),C=t.anchor=g("");if(h(E,s,a),h(C,s,a),Sb(t.props)||i&&i.pendingBranch){_(t);return}y&&(b(t,s,C),Pi(t,!0)),x()}else{t.el=e.el;const E=t.anchor=e.anchor,C=Wa.get(e);if(C){C.flags|=8,Wa.delete(e),_(t);return}t.targetStart=e.targetStart;const w=t.target=e.target,R=t.targetAnchor=e.targetAnchor,B=mn(e.props),S=B?s:w,F=B?E:R;if(l==="svg"||Qd(w)?l="svg":(l==="mathml"||Xd(w))&&(l="mathml"),v?(p(e.dynamicChildren,v,S,n,i,l,o),sd(e,t,!0)):r||u(e,t,S,F,n,i,l,o,!1),y)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Ml(t,s,E,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Y=t.target=Qr(t.props,m);Y&&Ml(t,Y,null,c,0)}else B&&Ml(t,w,R,c,1);Pi(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!mn(p),m=Wa.get(e);if(m&&(m.flags|=8,Wa.delete(e)),u&&(n(c),n(d)),i&&n(r),!m&&l&16)for(let g=0;g<o.length;g++){const A=o[g];a(A,t,s,h,!!A.dynamicChildren)}},move:Ml,hydrate:Cb};function Ml(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!Wa.has(e)&&(!u||mn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function Cb(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(A,I){let y=I;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,A._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(A,I){I.anchor=u(l(A),I,o(A),s,a,n,i)}const m=t.target=Qr(t.props,r),g=mn(t.props);if(m){const A=m._lpa||m.firstChild;t.shapeFlag&16&&(g?(h(e,t),p(m,A),t.targetAnchor||Xr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,A),t.targetAnchor||Xr(m,t,d,c),u(A&&l(A),t,m,s,a,n,i))),Pi(t,g)}else g&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Eb=Tb;function Pi(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Xr(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[zf]=l,e&&(a(i,e,n),a(l,e,n)),l}const Fs=Symbol("_leaveCb"),Ti=Symbol("_enterCb");function Gc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Xo(()=>{e.isUnmounting=!0}),e}const Ms=[Function,Array],Wc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ms,onEnter:Ms,onAfterEnter:Ms,onEnterCancelled:Ms,onBeforeLeave:Ms,onLeave:Ms,onAfterLeave:Ms,onLeaveCancelled:Ms,onBeforeAppear:Ms,onAppear:Ms,onAfterAppear:Ms,onAppearCancelled:Ms},Vf=e=>{const t=e.subTree;return t.component?Vf(t.component):t},Ab={name:"BaseTransition",props:Wc,setup(e,{slots:t}){const s=hs(),a=Gc();return()=>{const n=t.default&&Zo(t.default(),!0),i=n&&n.length?qf(n):s.subTree?Eh():void 0;if(!i)return;const l=Qe(e),{mode:o}=l;if(a.isLeaving)return Sr(i);const r=eu(i);if(!r)return Sr(i);let c=ci(r,l,a,s,u=>c=u);r.type!==Rt&&Fa(r,c);let d=s.subTree&&eu(s.subTree);if(d&&d.type!==Rt&&!Ws(d,r)&&Vf(s).type!==Rt){let u=ci(d,l,a,s);if(Fa(d,u),o==="out-in"&&r.type!==Rt)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Sr(i);o==="in-out"&&r.type!==Rt?u.delayLeave=(p,h,m)=>{const g=Wf(a,d);g[String(d.key)]=d,p[Fs]=()=>{h(),p[Fs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function qf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Rt){t=s;break}}return t}const Gf=Ab;function Wf(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function ci(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:g,onBeforeAppear:A,onAppear:I,onAfterAppear:y,onAppearCancelled:v}=t,b=String(e.key),x=Wf(s,e),_=(w,R)=>{w&&Os(w,a,9,R)},E=(w,R)=>{const B=R[1];_(w,R),Ee(w)?w.every(S=>S.length<=1)&&B():w.length<=1&&B()},C={mode:l,persisted:o,beforeEnter(w){let R=r;if(!s.isMounted)if(i)R=A||r;else return;w[Fs]&&w[Fs](!0);const B=x[b];B&&Ws(e,B)&&B.el[Fs]&&B.el[Fs](),_(R,[w])},enter(w){if(x[b]===e)return;let R=c,B=d,S=u;if(!s.isMounted)if(i)R=I||c,B=y||d,S=v||u;else return;let F=!1;w[Ti]=j=>{F||(F=!0,j?_(S,[w]):_(B,[w]),C.delayedLeave&&C.delayedLeave(),w[Ti]=void 0)};const Y=w[Ti].bind(null,!1);R?E(R,[w,Y]):Y()},leave(w,R){const B=String(e.key);if(w[Ti]&&w[Ti](!0),s.isUnmounting)return R();_(p,[w]);let S=!1;w[Fs]=Y=>{S||(S=!0,R(),Y?_(g,[w]):_(m,[w]),w[Fs]=void 0,x[B]===e&&delete x[B])};const F=w[Fs].bind(null,!1);x[B]=e,h?E(h,[w,F]):F()},clone(w){const R=ci(w,t,s,a,n);return n&&n(R),R}};return C}function Sr(e){if(wl(e))return e=ua(e),e.children=null,e}function eu(e){if(!wl(e))return jf(e.type)&&e.children?qf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Pe(s.default))return s.default()}}function Fa(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Fa(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Zo(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Vt?(l.patchFlag&128&&n++,a=a.concat(Zo(l.children,t,o))):(t||l.type!==Rt)&&a.push(o!=null?ua(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function _l(e,t){return Pe(e)?We({name:e.name},t,{setup:e}):e}function Rb(){const e=hs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Kc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Ib(e){const t=hs(),s=zc(null);if(t){const n=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function tu(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const fo=new WeakMap;function ai(e,t,s,a,n=!1){if(Ee(e)){e.forEach((g,A)=>ai(g,t&&(Ee(t)?t[A]:t),s,a,n));return}if(La(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&ai(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?kl(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ke?o.refs={}:o.refs,u=o.setupState,p=Qe(u),h=u===Ke?Jn:g=>tu(d,g)?!1:lt(p,g),m=(g,A)=>!(A&&tu(d,A));if(c!=null&&c!==r){if(su(t),Be(c))d[c]=null,h(c)&&(u[c]=null);else if(Nt(c)){const g=t;m(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if(Pe(r))_i(r,o,12,[l,d]);else{const g=Be(r),A=Nt(r);if(g||A){const I=()=>{if(e.f){const y=g?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(n)Ee(y)&&Pc(y,i);else if(Ee(y))y.includes(i)||y.push(i);else if(g)d[r]=[i],h(r)&&(u[r]=d[r]);else{const v=[i];m(r,e.k)&&(r.value=v),e.k&&(d[e.k]=v)}}else g?(d[r]=l,h(r)&&(u[r]=l)):A&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{I(),fo.delete(e)};y.id=-1,fo.set(e,y),Ot(y,s)}else su(e),I()}}}function su(e){const t=fo.get(e);t&&(t.flags|=8,fo.delete(e))}let au=!1;const Un=()=>{au||(console.error("Hydration completed but contains mismatches."),au=!0)},Ob=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Lb=e=>e.namespaceURI.includes("MathML"),Fl=e=>{if(e.nodeType===1){if(Ob(e))return"svg";if(Lb(e))return"mathml"}},Zn=e=>e.nodeType===8;function Nb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(v,b)=>{if(!b.hasChildNodes()){s(null,v,b),po(),b._vnode=v;return}u(b.firstChild,v,null,null,null),po(),b._vnode=v},u=(v,b,x,_,E,C=!1)=>{C=C||!!b.dynamicChildren;const w=Zn(v)&&v.data==="[",R=()=>g(v,b,x,_,E,w),{type:B,ref:S,shapeFlag:F,patchFlag:Y}=b;let j=v.nodeType;b.el=v,Y===-2&&(C=!1,b.dynamicChildren=null);let L=null;switch(B){case en:j!==3?b.children===""?(r(b.el=n(""),l(v),v),L=v):L=R():(v.data!==b.children&&(Un(),v.data=b.children),L=i(v));break;case Rt:y(v)?(L=i(v),I(b.el=v.content.firstChild,v,x)):j!==8||w?L=R():L=i(v);break;case _n:if(w&&(v=i(v),j=v.nodeType),j===1||j===3){L=v;const N=!b.children.length;for(let P=0;P<b.staticCount;P++)N&&(b.children+=L.nodeType===1?L.outerHTML:L.data),P===b.staticCount-1&&(b.anchor=L),L=i(L);return w?i(L):L}else R();break;case Vt:w?L=m(v,b,x,_,E,C):L=R();break;default:if(F&1)(j!==1||b.type.toLowerCase()!==v.tagName.toLowerCase())&&!y(v)?L=R():L=p(v,b,x,_,E,C);else if(F&6){b.slotScopeIds=E;const N=l(v);if(w?L=A(v):Zn(v)&&v.data==="teleport start"?L=A(v,v.data,"teleport end"):L=i(v),t(b,N,null,x,_,Fl(N),C),La(b)&&!b.type.__asyncResolved){let P;w?(P=yt(Vt),P.anchor=L?L.previousSibling:N.lastChild):P=v.nodeType===3?nd(""):yt("div"),P.el=v,b.component.subTree=P}}else F&64?j!==8?L=R():L=b.type.hydrate(v,b,x,_,E,C,e,h):F&128&&(L=b.type.hydrate(v,b,x,_,Fl(l(v)),E,C,e,u))}return S!=null&&ai(S,null,_,b),L},p=(v,b,x,_,E,C)=>{C=C||!!b.dynamicChildren;const{type:w,props:R,patchFlag:B,shapeFlag:S,dirs:F,transition:Y}=b,j=w==="input"||w==="option";if(j||B!==-1){F&&oa(b,null,x,"created");let L=!1;if(y(v)){L=bh(null,Y)&&x&&x.vnode.props&&x.vnode.props.appear;const P=v.content.firstChild;if(L){const ae=P.getAttribute("class");ae&&(P.$cls=ae),Y.beforeEnter(P)}I(P,v,x),b.el=v=P}if(S&16&&!(R&&(R.innerHTML||R.textContent))){let P=h(v.firstChild,b,v,x,_,E,C);for(P&&!$l(v,1)&&Un();P;){const ae=P;P=P.nextSibling,o(ae)}}else if(S&8){let P=b.children;P[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(P=P.slice(1));const{textContent:ae}=v;ae!==P&&ae!==P.replace(/\r\n|\r/g,`
`)&&($l(v,0)||Un(),v.textContent=b.children)}if(R){if(j||!C||B&48){const P=v.tagName.includes("-");for(const ae in R)(j&&(ae.endsWith("value")||ae==="indeterminate")||An(ae)&&!Ia(ae)||ae[0]==="."||P&&!Ia(ae))&&a(v,ae,null,R[ae],void 0,x)}else if(R.onClick)a(v,"onClick",null,R.onClick,void 0,x);else if(B&4&&Oa(R.style))for(const P in R.style)R.style[P]}let N;(N=R&&R.onVnodeBeforeMount)&&_s(N,x,b),F&&oa(b,null,x,"beforeMount"),((N=R&&R.onVnodeMounted)||F||L)&&wh(()=>{N&&_s(N,x,b),L&&Y.enter(v),F&&oa(b,null,x,"mounted")},_)}return v.nextSibling},h=(v,b,x,_,E,C,w)=>{w=w||!!b.dynamicChildren;const R=b.children,B=R.length;let S=!1;for(let F=0;F<B;F++){const Y=w?R[F]:R[F]=ks(R[F]),j=Y.type===en;v?(j&&!w&&F+1<B&&ks(R[F+1]).type===en&&(r(n(v.data.slice(Y.children.length)),x,i(v)),v.data=Y.children),v=u(v,Y,_,E,C,w)):j&&!Y.children?r(Y.el=n(""),x):(S||(S=!0,$l(x,1)||Un()),s(null,Y,x,null,_,E,Fl(x),C))}return v},m=(v,b,x,_,E,C)=>{const{slotScopeIds:w}=b;w&&(E=E?E.concat(w):w);const R=l(v),B=h(i(v),b,R,x,_,E,C);return B&&Zn(B)&&B.data==="]"?i(b.anchor=B):(Un(),r(b.anchor=c("]"),R,B),B)},g=(v,b,x,_,E,C)=>{if($l(v.parentElement,1)||Un(),b.el=null,C){const B=A(v);for(;;){const S=i(v);if(S&&S!==B)o(S);else break}}const w=i(v),R=l(v);return o(v),s(null,b,R,w,x,_,Fl(R),E),x&&(x.vnode.el=b.el,tr(x,b.el)),w},A=(v,b="[",x="]")=>{let _=0;for(;v;)if(v=i(v),v&&Zn(v)&&(v.data===b&&_++,v.data===x)){if(_===0)return i(v);_--}return v},I=(v,b,x)=>{const _=b.parentNode;_&&_.replaceChild(v,b);let E=x;for(;E;)E.vnode.el===b&&(E.vnode.el=E.subTree.el=v),E=E.parent},y=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[d,u]}const nu="data-allow-mismatch",Db={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function $l(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(nu);)e=e.parentElement;const s=e&&e.getAttribute(nu);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(Db[t])}}const Pb=jo().requestIdleCallback||(e=>setTimeout(e,1)),Mb=jo().cancelIdleCallback||(e=>clearTimeout(e)),Fb=(e=1e4)=>t=>{const s=Pb(t,{timeout:e});return()=>Mb(s)};function $b(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const Bb=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if($b(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},Ub=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Hb=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function zb(e,t){if(Zn(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Zn(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const La=e=>!!e.type.__asyncLoader;function jb(e){Pe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),r)return new Promise((A,I)=>{r(g,()=>A(p()),()=>I(g),u+1)});throw g}).then(g=>m!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return _l({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,g,A){let I=!1;(g.bu||(g.bu=[])).push(()=>I=!0);const y=()=>{I||A()},v=i?()=>{const b=i(y,x=>zb(m,x));b&&(g.bum||(g.bum=[])).push(b)}:y;d?v():h().then(()=>!g.isUnmounted&&v())},get __asyncResolved(){return d},setup(){const m=Zt;if(Kc(m),d)return()=>Bl(d,m);const g=x=>{c=null,On(x,m,13,!a)};if(o&&m.suspense||Tn)return h().then(x=>()=>Bl(x,m)).catch(x=>(g(x),()=>a?yt(a,{error:x}):null));const A=f(!1),I=f(),y=f(!!n);let v,b;return ut(()=>{v!=null&&clearTimeout(v),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},n)),l!=null&&(v=setTimeout(()=>{if(!m.isUnmounted&&!A.value&&!I.value){const x=new Error(`Async component timed out after ${l}ms.`);g(x),I.value=x}},l)),h().then(()=>{m.isUnmounted||(A.value=!0,m.parent&&wl(m.parent.vnode)&&m.parent.update())}).catch(x=>{if(m.isUnmounted){c=null;return}g(x),I.value=x}),()=>{if(A.value&&d)return Bl(d,m);if(I.value&&a)return yt(a,{error:I.value});if(s&&!y.value)return Bl(s,m)}}})}function Bl(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=yt(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const wl=e=>e.type.__isKeepAlive,Vb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=hs(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,v,b,x,_)=>{const E=y.component;c(y,v,b,0,o),r(E.vnode,y,v,b,E,o,x,y.slotScopeIds,_),Ot(()=>{E.isDeactivated=!1,E.a&&ti(E.a);const C=y.props&&y.props.onVnodeMounted;C&&_s(C,E.parent,y)},o)},a.deactivate=y=>{const v=y.component;mo(v.m),mo(v.a),c(y,p,null,1,o),Ot(()=>{v.da&&ti(v.da);const b=y.props&&y.props.onVnodeUnmounted;b&&_s(b,v.parent,y),v.isDeactivated=!0},o)};function h(y){Tr(y),d(y,s,o,!0)}function m(y){n.forEach((v,b)=>{const x=rc(La(v)?v.type.__asyncResolved||{}:v.type);x&&!y(x)&&g(b)})}function g(y){const v=n.get(y);v&&(!l||!Ws(v,l))?h(v):l&&Tr(l),n.delete(y),i.delete(y)}Dt(()=>[e.include,e.exclude],([y,v])=>{y&&m(b=>Mi(y,b)),v&&m(b=>!Mi(v,b))},{flush:"post",deep:!0});let A=null;const I=()=>{A!=null&&(vo(s.subTree.type)?Ot(()=>{n.set(A,Ul(s.subTree))},s.subTree.suspense):n.set(A,Ul(s.subTree)))};return Ge(I),Qo(I),Xo(()=>{n.forEach(y=>{const{subTree:v,suspense:b}=s,x=Ul(v);if(y.type===x.type&&y.key===x.key){Tr(x);const _=x.component.da;_&&Ot(_,b);return}h(y)})}),()=>{if(A=null,!t.default)return l=null;const y=t.default(),v=y[0];if(y.length>1)return l=null,y;if(!$a(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let b=Ul(v);if(b.type===Rt)return l=null,b;const x=b.type,_=rc(La(b)?b.type.__asyncResolved||{}:x),{include:E,exclude:C,max:w}=e;if(E&&(!_||!Mi(E,_))||C&&_&&Mi(C,_))return b.shapeFlag&=-257,l=b,v;const R=b.key==null?x:b.key,B=n.get(R);return b.el&&(b=ua(b),v.shapeFlag&128&&(v.ssContent=b)),A=R,B?(b.el=B.el,b.component=B.component,b.transition&&Fa(b,b.transition),b.shapeFlag|=512,i.delete(R),i.add(R)):(i.add(R),w&&i.size>parseInt(w,10)&&g(i.values().next().value)),b.shapeFlag|=256,l=b,vo(v.type)?v:b}}},qb=Vb;function Mi(e,t){return Ee(e)?e.some(s=>Mi(s,t)):Be(e)?e.split(",").includes(t):tg(e)?(e.lastIndex=0,e.test(t)):!1}function Xt(e,t){Kf(e,"a",t)}function Ut(e,t){Kf(e,"da",t)}function Kf(e,t,s=Zt){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Yo(t,a,s),s){let n=s.parent;for(;n&&n.parent;)wl(n.parent.vnode)&&Gb(a,t,s,n),n=n.parent}}function Gb(e,t,s,a){const n=Yo(t,e,a,!0);ut(()=>{Pc(a[t],n)},s)}function Tr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Ul(e){return e.shapeFlag&128?e.ssContent:e}function Yo(e,t,s=Zt,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Pa();const o=wi(s),r=Os(t,s,e,l);return o(),Ma(),r});return a?n.unshift(i):n.push(i),i}}const Ba=e=>(t,s=Zt)=>{(!Tn||e==="sp")&&Yo(e,(...a)=>t(...a),s)},Jf=Ba("bm"),Ge=Ba("m"),Jc=Ba("bu"),Qo=Ba("u"),Xo=Ba("bum"),ut=Ba("um"),Zf=Ba("sp"),Yf=Ba("rtg"),Qf=Ba("rtc");function Xf(e,t=Zt){Yo("ec",e,t)}const Zc="components",Wb="directives";function Kb(e,t){return Yc(Zc,e,!0,t)||e}const eh=Symbol.for("v-ndc");function Jb(e){return Be(e)?Yc(Zc,e,!1)||e:e||eh}function Zb(e){return Yc(Wb,e)}function Yc(e,t,s=!0,a=!1){const n=Yt||Zt;if(n){const i=n.type;if(e===Zc){const o=rc(i,!1);if(o&&(o===t||o===pt(t)||o===In(pt(t))))return i}const l=iu(n[e]||i[e],t)||iu(n.appContext[e],t);return!l&&a?i:l}}function iu(e,t){return e&&(e[t]||e[pt(t)]||e[In(pt(t))])}function Yb(e,t,s,a){let n;const i=s&&s[a],l=Ee(e);if(l||Be(e)){const o=l&&Oa(e);let r=!1,c=!1;o&&(r=!Cs(e),c=da(e),e=Go(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?ri(Zs(e[d])):Zs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(tt(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Qb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Ee(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Xb(e,t,s={},a,n){if(Yt.ce||Yt.parent&&La(Yt.parent)&&Yt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),nl(),go(Vt,null,[yt("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),nl();const l=i&&Qc(i(s)),o=s.key||l&&l.key,r=go(Vt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Qc(e){return e.some(t=>$a(t)?!(t.type===Rt||t.type===Vt&&!Qc(t.children)):!0)?e:null}function ey(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:ei(a)]=e[a];return s}const ec=e=>e?Ih(e)?kl(e):ec(e.parent):null,ji=We(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>ec(e.parent),$root:e=>ec(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Xc(e),$forceUpdate:e=>e.f||(e.f=()=>{Vc(e.update)}),$nextTick:e=>e.n||(e.n=At.bind(e.proxy)),$watch:e=>kb.bind(e)}),Cr=(e,t)=>e!==Ke&&!e.__isScriptSetup&&lt(e,t),tc={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(Cr(a,t))return l[t]=1,a[t];if(n!==Ke&&lt(n,t))return l[t]=2,n[t];if(lt(i,t))return l[t]=3,i[t];if(s!==Ke&&lt(s,t))return l[t]=4,s[t];sc&&(l[t]=0)}}const c=ji[t];let d,u;if(c)return t==="$attrs"&&ns(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&lt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,lt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return Cr(n,t)?(n[t]=s,!0):a!==Ke&&lt(a,t)?(a[t]=s,!0):lt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==Ke&&o[0]!=="$"&&lt(e,o)||Cr(t,o)||lt(i,o)||lt(a,o)||lt(ji,o)||lt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:lt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},ty=We({},tc,{get(e,t){if(t!==Symbol.unscopables)return tc.get(e,t,e)},has(e,t){return t[0]!=="_"&&!rg(t)}});function sy(){return null}function ay(){return null}function ny(e){}function iy(e){}function ly(){return null}function oy(){}function ry(e,t){return null}function cy(){return th().slots}function dy(){return th().attrs}function th(e){const t=hs();return t.setupContext||(t.setupContext=Dh(t))}function sl(e){return Ee(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function uy(e,t){const s=sl(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Ee(n)||Pe(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function py(e,t){return!e||!t?e||t:Ee(e)&&Ee(t)?e.concat(t):We({},sl(e),sl(t))}function fy(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function hy(e){const t=hs(),s=Tn;let a=e();ll(),s&&ii(!1);const n=()=>{wi(t),s&&ii(!0)},i=()=>{hs()!==t&&t.scope.off(),ll(),s&&ii(!1)};return Mc(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let sc=!0;function my(e){const t=Xc(e),s=e.proxy,a=e.ctx;sc=!1,t.beforeCreate&&lu(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:g,deactivated:A,beforeDestroy:I,beforeUnmount:y,destroyed:v,unmounted:b,render:x,renderTracked:_,renderTriggered:E,errorCaptured:C,serverPrefetch:w,expose:R,inheritAttrs:B,components:S,directives:F,filters:Y}=t;if(c&&vy(c,a,null),l)for(const N in l){const P=l[N];Pe(P)&&(a[N]=P.bind(s))}if(n){const N=n.call(s,s);tt(N)&&(e.data=an(N))}if(sc=!0,i)for(const N in i){const P=i[N],ae=Pe(P)?P.bind(s,s):Pe(P.get)?P.get.bind(s,s):Qt,ne=!Pe(P)&&Pe(P.set)?P.set.bind(s):Qt,U=V({get:ae,set:ne});Object.defineProperty(a,N,{enumerable:!0,configurable:!0,get:()=>U.value,set:J=>U.value=J})}if(o)for(const N in o)sh(o[N],a,s,N);if(r){const N=Pe(r)?r.call(s):r;Reflect.ownKeys(N).forEach(P=>{zi(P,N[P])})}d&&lu(d,e,"c");function L(N,P){Ee(P)?P.forEach(ae=>N(ae.bind(s))):P&&N(P.bind(s))}if(L(Jf,u),L(Ge,p),L(Jc,h),L(Qo,m),L(Xt,g),L(Ut,A),L(Xf,C),L(Qf,_),L(Yf,E),L(Xo,y),L(ut,b),L(Zf,w),Ee(R))if(R.length){const N=e.exposed||(e.exposed={});R.forEach(P=>{Object.defineProperty(N,P,{get:()=>s[P],set:ae=>s[P]=ae,enumerable:!0})})}else e.exposed||(e.exposed={});x&&e.render===Qt&&(e.render=x),B!=null&&(e.inheritAttrs=B),S&&(e.components=S),F&&(e.directives=F),w&&Kc(e)}function vy(e,t,s=Qt){Ee(e)&&(e=ac(e));for(const a in e){const n=e[a];let i;tt(n)?"default"in n?i=Hs(n.from||a,n.default,!0):i=Hs(n.from||a):i=Hs(n),Nt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function lu(e,t,s){Os(Ee(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function sh(e,t,s,a){let n=a.includes(".")?Hf(s,a):()=>s[a];if(Be(e)){const i=t[e];Pe(i)&&Dt(n,i)}else if(Pe(e))Dt(n,e.bind(s));else if(tt(e))if(Ee(e))e.forEach(i=>sh(i,t,s,a));else{const i=Pe(e.handler)?e.handler.bind(s):t[e.handler];Pe(i)&&Dt(n,i,e)}}function Xc(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>ho(r,c,l,!0)),ho(r,t,l)),tt(t)&&i.set(t,r),r}function ho(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&ho(e,i,s,!0),n&&n.forEach(l=>ho(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=gy[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const gy={data:ou,props:ru,emits:ru,methods:Fi,computed:Fi,beforeCreate:cs,created:cs,beforeMount:cs,mounted:cs,beforeUpdate:cs,updated:cs,beforeDestroy:cs,beforeUnmount:cs,destroyed:cs,unmounted:cs,activated:cs,deactivated:cs,errorCaptured:cs,serverPrefetch:cs,components:Fi,directives:Fi,watch:yy,provide:ou,inject:by};function ou(e,t){return t?e?function(){return We(Pe(e)?e.call(this,this):e,Pe(t)?t.call(this,this):t)}:t:e}function by(e,t){return Fi(ac(e),ac(t))}function ac(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function cs(e,t){return e?[...new Set([].concat(e,t))]:t}function Fi(e,t){return e?We(Object.create(null),e,t):t}function ru(e,t){return e?Ee(e)&&Ee(t)?[...new Set([...e,...t])]:We(Object.create(null),sl(e),sl(t??{})):t}function yy(e,t){if(!e)return t;if(!t)return e;const s=We(Object.create(null),e);for(const a in t)s[a]=cs(e[a],t[a]);return s}function ah(){return{app:null,config:{isNativeTag:Jn,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let xy=0;function _y(e,t){return function(a,n=null){Pe(a)||(a=We({},a)),n!=null&&!tt(n)&&(n=null);const i=ah(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:xy++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Mh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Pe(d.install)?(l.add(d),d.install(c,...u)):Pe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||yt(a,n);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,kl(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Os(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=xn;xn=c;try{return d()}finally{xn=u}}};return c}}let xn=null;function wy(e,t,s=Ke){const a=hs(),n=pt(t),i=Ss(t),l=nh(e,n),o=If((r,c)=>{let d,u=Ke,p;return Uf(()=>{const h=e[n];jt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!jt(m,d)&&!(u!==Ke&&jt(h,u)))return;const g=a.vnode.props,A=!!(g&&(t in g||n in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${n}`in g||`onUpdate:${i}`in g));A||(d=h,c()),a.emit(`update:${t}`,m),jt(h,u)&&(jt(h,m)&&!jt(m,p)||A&&u!==Ke&&!jt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ke:o,done:!1}:{done:!0}}}},o}const nh=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${pt(t)}Modifiers`]||e[`${Ss(t)}Modifiers`];function ky(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||Ke;let n=s;const i=t.startsWith("update:"),l=i&&nh(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Be(d)?d.trim():d)),l.number&&(n=s.map(zo)));let o,r=a[o=ei(t)]||a[o=ei(pt(t))];!r&&i&&(r=a[o=ei(Ss(t))]),r&&Os(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Os(c,e,6,n)}}const Sy=new WeakMap;function ih(e,t,s=!1){const a=s?Sy:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Pe(e)){const r=c=>{const d=ih(c,t,!0);d&&(o=!0,We(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(tt(e)&&a.set(e,null),null):(Ee(i)?i.forEach(r=>l[r]=null):We(l,i),tt(e)&&a.set(e,l),l)}function er(e,t){return!e||!An(t)?!1:(t=t.slice(2).replace(/Once$/,""),lt(e,t[0].toLowerCase()+t.slice(1))||lt(e,Ss(t))||lt(e,t))}function Ql(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:g}=e,A=tl(e);let I,y;try{if(s.shapeFlag&4){const b=n||a,x=b;I=ks(c.call(x,b,d,u,h,p,m)),y=o}else{const b=t;I=ks(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:Cy(o)}}catch(b){Vi.length=0,On(b,e,1),I=yt(Rt)}let v=I;if(y&&g!==!1){const b=Object.keys(y),{shapeFlag:x}=v;b.length&&x&7&&(i&&b.some($o)&&(y=Ey(y,i)),v=ua(v,y,!1,!0))}return s.dirs&&(v=ua(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&Fa(v,s.transition),I=v,tl(A),I}function Ty(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if($a(n)){if(n.type!==Rt||n.children==="v-if"){if(s)return;s=n}}else return}return s}const Cy=e=>{let t;for(const s in e)(s==="class"||s==="style"||An(s))&&((t||(t={}))[s]=e[s]);return t},Ey=(e,t)=>{const s={};for(const a in e)(!$o(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function Ay(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?cu(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(lh(l,a,p)&&!er(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?cu(a,l,c):!0:!!l;return!1}function cu(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(lh(t,e,i)&&!er(s,i))return!0}return!1}function lh(e,t,s){const a=e[s],n=t[s];return s==="style"&&tt(a)&&tt(n)?!Da(a,n):a!==n}function tr({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const oh={},rh=()=>Object.create(oh),ch=e=>Object.getPrototypeOf(e)===oh;function Ry(e,t,s,a=!1){const n={},i=rh();e.propsDefaults=Object.create(null),dh(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Hc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function Iy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=Qe(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(er(e.emitsOptions,p))continue;const h=t[p];if(r)if(lt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=pt(p);n[m]=nc(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{dh(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!lt(t,u)&&((d=Ss(u))===u||!lt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=nc(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!lt(t,u))&&(delete i[u],c=!0)}c&&Ta(e.attrs,"set","")}function dh(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Ia(r))continue;const c=t[r];let d;n&&lt(n,d=pt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:er(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=Qe(s),c=o||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=nc(n,r,u,c[u],e,!lt(c,u))}}return l}function nc(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=lt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Pe(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=wi(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===Ss(s))&&(a=!0))}return a}const Oy=new WeakMap;function uh(e,t,s=!1){const a=s?Oy:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Pe(e)){const d=u=>{r=!0;const[p,h]=uh(u,t,!0);We(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return tt(e)&&a.set(e,Qn),Qn;if(Ee(i))for(let d=0;d<i.length;d++){const u=pt(i[d]);du(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=pt(d);if(du(u)){const p=i[d],h=l[u]=Ee(p)||Pe(p)?{type:p}:We({},p),m=h.type;let g=!1,A=!0;if(Ee(m))for(let I=0;I<m.length;++I){const y=m[I],v=Pe(y)&&y.name;if(v==="Boolean"){g=!0;break}else v==="String"&&(A=!1)}else g=Pe(m)&&m.name==="Boolean";h[0]=g,h[1]=A,(g||lt(h,"default"))&&o.push(u)}}const c=[l,o];return tt(e)&&a.set(e,c),c}function du(e){return e[0]!=="$"&&!Ia(e)}const ed=e=>e==="_"||e==="_ctx"||e==="$stable",td=e=>Ee(e)?e.map(ks):[ks(e)],Ly=(e,t,s)=>{if(t._n)return t;const a=qc((...n)=>td(t(...n)),s);return a._c=!1,a},ph=(e,t,s)=>{const a=e._ctx;for(const n in e){if(ed(n))continue;const i=e[n];if(Pe(i))t[n]=Ly(n,i,a);else if(i!=null){const l=td(i);t[n]=()=>l}}},fh=(e,t)=>{const s=td(t);e.slots.default=()=>s},hh=(e,t,s)=>{for(const a in t)(s||!ed(a))&&(e[a]=t[a])},Ny=(e,t,s)=>{const a=e.slots=rh();if(e.vnode.shapeFlag&32){const n=t._;n?(hh(a,t,s),s&&lf(a,"_",n,!0)):ph(t,a)}else t&&fh(e,t)},Dy=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=Ke;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:hh(n,t,s):(i=!t.$stable,ph(t,n)),l=t}else t&&(fh(e,t),l={default:1});if(i)for(const o in n)!ed(o)&&l[o]==null&&delete n[o]},Ot=wh;function mh(e){return gh(e)}function vh(e){return gh(e,Nb)}function gh(e,t){const s=jo();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Qt,insertStaticContent:m}=e,g=(T,M,q,re=null,$=null,Z=null,ue=void 0,H=null,ee=!!M.dynamicChildren)=>{if(T===M)return;T&&!Ws(T,M)&&(re=W(T),J(T,$,Z,!0),T=null),M.patchFlag===-2&&(ee=!1,M.dynamicChildren=null);const{type:X,ref:be,shapeFlag:he}=M;switch(X){case en:A(T,M,q,re);break;case Rt:I(T,M,q,re);break;case _n:T==null&&y(M,q,re,ue);break;case Vt:S(T,M,q,re,$,Z,ue,H,ee);break;default:he&1?x(T,M,q,re,$,Z,ue,H,ee):he&6?F(T,M,q,re,$,Z,ue,H,ee):(he&64||he&128)&&X.process(T,M,q,re,$,Z,ue,H,ee,ye)}be!=null&&$?ai(be,T&&T.ref,Z,M||T,!M):be==null&&T&&T.ref!=null&&ai(T.ref,null,Z,T,!0)},A=(T,M,q,re)=>{if(T==null)a(M.el=o(M.children),q,re);else{const $=M.el=T.el;M.children!==T.children&&c($,M.children)}},I=(T,M,q,re)=>{T==null?a(M.el=r(M.children||""),q,re):M.el=T.el},y=(T,M,q,re)=>{[T.el,T.anchor]=m(T.children,M,q,re,T.el,T.anchor)},v=({el:T,anchor:M},q,re)=>{let $;for(;T&&T!==M;)$=p(T),a(T,q,re),T=$;a(M,q,re)},b=({el:T,anchor:M})=>{let q;for(;T&&T!==M;)q=p(T),n(T),T=q;n(M)},x=(T,M,q,re,$,Z,ue,H,ee)=>{if(M.type==="svg"?ue="svg":M.type==="math"&&(ue="mathml"),T==null)_(M,q,re,$,Z,ue,H,ee);else{const X=T.el&&T.el._isVueCE?T.el:null;try{X&&X._beginPatch(),w(T,M,$,Z,ue,H,ee)}finally{X&&X._endPatch()}}},_=(T,M,q,re,$,Z,ue,H)=>{let ee,X;const{props:be,shapeFlag:he,transition:xe,dirs:Ae}=T;if(ee=T.el=l(T.type,Z,be&&be.is,be),he&8?d(ee,T.children):he&16&&C(T.children,ee,null,re,$,Er(T,Z),ue,H),Ae&&oa(T,null,re,"created"),E(ee,T,T.scopeId,ue,re),be){for(const $e in be)$e!=="value"&&!Ia($e)&&i(ee,$e,null,be[$e],Z,re);"value"in be&&i(ee,"value",null,be.value,Z),(X=be.onVnodeBeforeMount)&&_s(X,re,T)}Ae&&oa(T,null,re,"beforeMount");const Le=bh($,xe);Le&&xe.beforeEnter(ee),a(ee,M,q),((X=be&&be.onVnodeMounted)||Le||Ae)&&Ot(()=>{try{X&&_s(X,re,T),Le&&xe.enter(ee),Ae&&oa(T,null,re,"mounted")}finally{}},$)},E=(T,M,q,re,$)=>{if(q&&h(T,q),re)for(let Z=0;Z<re.length;Z++)h(T,re[Z]);if($){let Z=$.subTree;if(M===Z||vo(Z.type)&&(Z.ssContent===M||Z.ssFallback===M)){const ue=$.vnode;E(T,ue,ue.scopeId,ue.slotScopeIds,$.parent)}}},C=(T,M,q,re,$,Z,ue,H,ee=0)=>{for(let X=ee;X<T.length;X++){const be=T[X]=H?ka(T[X]):ks(T[X]);g(null,be,M,q,re,$,Z,ue,H)}},w=(T,M,q,re,$,Z,ue)=>{const H=M.el=T.el;let{patchFlag:ee,dynamicChildren:X,dirs:be}=M;ee|=T.patchFlag&16;const he=T.props||Ke,xe=M.props||Ke;let Ae;if(q&&dn(q,!1),(Ae=xe.onVnodeBeforeUpdate)&&_s(Ae,q,M,T),be&&oa(M,T,q,"beforeUpdate"),q&&dn(q,!0),(he.innerHTML&&xe.innerHTML==null||he.textContent&&xe.textContent==null)&&d(H,""),X?R(T.dynamicChildren,X,H,q,re,Er(M,$),Z):ue||P(T,M,H,null,q,re,Er(M,$),Z,!1),ee>0){if(ee&16)B(H,he,xe,q,$);else if(ee&2&&he.class!==xe.class&&i(H,"class",null,xe.class,$),ee&4&&i(H,"style",he.style,xe.style,$),ee&8){const Le=M.dynamicProps;for(let $e=0;$e<Le.length;$e++){const Me=Le[$e],Fe=he[Me],Ue=xe[Me];(Ue!==Fe||Me==="value")&&i(H,Me,Fe,Ue,$,q)}}ee&1&&T.children!==M.children&&d(H,M.children)}else!ue&&X==null&&B(H,he,xe,q,$);((Ae=xe.onVnodeUpdated)||be)&&Ot(()=>{Ae&&_s(Ae,q,M,T),be&&oa(M,T,q,"updated")},re)},R=(T,M,q,re,$,Z,ue)=>{for(let H=0;H<M.length;H++){const ee=T[H],X=M[H],be=ee.el&&(ee.type===Vt||!Ws(ee,X)||ee.shapeFlag&198)?u(ee.el):q;g(ee,X,be,null,re,$,Z,ue,!0)}},B=(T,M,q,re,$)=>{if(M!==q){if(M!==Ke)for(const Z in M)!Ia(Z)&&!(Z in q)&&i(T,Z,M[Z],null,$,re);for(const Z in q){if(Ia(Z))continue;const ue=q[Z],H=M[Z];ue!==H&&Z!=="value"&&i(T,Z,H,ue,$,re)}"value"in q&&i(T,"value",M.value,q.value,$)}},S=(T,M,q,re,$,Z,ue,H,ee)=>{const X=M.el=T?T.el:o(""),be=M.anchor=T?T.anchor:o("");let{patchFlag:he,dynamicChildren:xe,slotScopeIds:Ae}=M;Ae&&(H=H?H.concat(Ae):Ae),T==null?(a(X,q,re),a(be,q,re),C(M.children||[],q,be,$,Z,ue,H,ee)):he>0&&he&64&&xe&&T.dynamicChildren&&T.dynamicChildren.length===xe.length?(R(T.dynamicChildren,xe,q,$,Z,ue,H),(M.key!=null||$&&M===$.subTree)&&sd(T,M,!0)):P(T,M,q,be,$,Z,ue,H,ee)},F=(T,M,q,re,$,Z,ue,H,ee)=>{M.slotScopeIds=H,T==null?M.shapeFlag&512?$.ctx.activate(M,q,re,ue,ee):Y(M,q,re,$,Z,ue,ee):j(T,M,ee)},Y=(T,M,q,re,$,Z,ue)=>{const H=T.component=Rh(T,re,$);if(wl(T)&&(H.ctx.renderer=ye),Oh(H,!1,ue),H.asyncDep){if($&&$.registerDep(H,L,ue),!T.el){const ee=H.subTree=yt(Rt);I(null,ee,M,q),T.placeholder=ee.el}}else L(H,T,M,q,$,Z,ue)},j=(T,M,q)=>{const re=M.component=T.component;if(Ay(T,M,q))if(re.asyncDep&&!re.asyncResolved){N(re,M,q);return}else re.next=M,re.update();else M.el=T.el,re.vnode=M},L=(T,M,q,re,$,Z,ue)=>{const H=()=>{if(T.isMounted){let{next:he,bu:xe,u:Ae,parent:Le,vnode:$e}=T;{const je=yh(T);if(je){he&&(he.el=$e.el,N(T,he,ue)),je.asyncDep.then(()=>{Ot(()=>{T.isUnmounted||X()},$)});return}}let Me=he,Fe;dn(T,!1),he?(he.el=$e.el,N(T,he,ue)):he=$e,xe&&ti(xe),(Fe=he.props&&he.props.onVnodeBeforeUpdate)&&_s(Fe,Le,he,$e),dn(T,!0);const Ue=Ql(T),Ye=T.subTree;T.subTree=Ue,g(Ye,Ue,u(Ye.el),W(Ye),T,$,Z),he.el=Ue.el,Me===null&&tr(T,Ue.el),Ae&&Ot(Ae,$),(Fe=he.props&&he.props.onVnodeUpdated)&&Ot(()=>_s(Fe,Le,he,$e),$)}else{let he;const{el:xe,props:Ae}=M,{bm:Le,m:$e,parent:Me,root:Fe,type:Ue}=T,Ye=La(M);if(dn(T,!1),Le&&ti(Le),!Ye&&(he=Ae&&Ae.onVnodeBeforeMount)&&_s(he,Me,M),dn(T,!0),xe&&Ne){const je=()=>{T.subTree=Ql(T),Ne(xe,T.subTree,T,$,null)};Ye&&Ue.__asyncHydrate?Ue.__asyncHydrate(xe,T,je):je()}else{Fe.ce&&Fe.ce._hasShadowRoot()&&Fe.ce._injectChildStyle(Ue,T.parent?T.parent.type:void 0);const je=T.subTree=Ql(T);g(null,je,q,re,T,$,Z),M.el=je.el}if($e&&Ot($e,$),!Ye&&(he=Ae&&Ae.onVnodeMounted)){const je=M;Ot(()=>_s(he,Me,je),$)}(M.shapeFlag&256||Me&&La(Me.vnode)&&Me.vnode.shapeFlag&256)&&T.a&&Ot(T.a,$),T.isMounted=!0,M=q=re=null}};T.scope.on();const ee=T.effect=new Zi(H);T.scope.off();const X=T.update=ee.run.bind(ee),be=T.job=ee.runIfDirty.bind(ee);be.i=T,be.id=T.uid,ee.scheduler=()=>Vc(be),dn(T,!0),X()},N=(T,M,q)=>{M.component=T;const re=T.vnode.props;T.vnode=M,T.next=null,Iy(T,M.props,re,q),Dy(T,M.children,q),Pa(),Yd(T),Ma()},P=(T,M,q,re,$,Z,ue,H,ee=!1)=>{const X=T&&T.children,be=T?T.shapeFlag:0,he=M.children,{patchFlag:xe,shapeFlag:Ae}=M;if(xe>0){if(xe&128){ne(X,he,q,re,$,Z,ue,H,ee);return}else if(xe&256){ae(X,he,q,re,$,Z,ue,H,ee);return}}Ae&8?(be&16&&de(X,$,Z),he!==X&&d(q,he)):be&16?Ae&16?ne(X,he,q,re,$,Z,ue,H,ee):de(X,$,Z,!0):(be&8&&d(q,""),Ae&16&&C(he,q,re,$,Z,ue,H,ee))},ae=(T,M,q,re,$,Z,ue,H,ee)=>{T=T||Qn,M=M||Qn;const X=T.length,be=M.length,he=Math.min(X,be);let xe;for(xe=0;xe<he;xe++){const Ae=M[xe]=ee?ka(M[xe]):ks(M[xe]);g(T[xe],Ae,q,null,$,Z,ue,H,ee)}X>be?de(T,$,Z,!0,!1,he):C(M,q,re,$,Z,ue,H,ee,he)},ne=(T,M,q,re,$,Z,ue,H,ee)=>{let X=0;const be=M.length;let he=T.length-1,xe=be-1;for(;X<=he&&X<=xe;){const Ae=T[X],Le=M[X]=ee?ka(M[X]):ks(M[X]);if(Ws(Ae,Le))g(Ae,Le,q,null,$,Z,ue,H,ee);else break;X++}for(;X<=he&&X<=xe;){const Ae=T[he],Le=M[xe]=ee?ka(M[xe]):ks(M[xe]);if(Ws(Ae,Le))g(Ae,Le,q,null,$,Z,ue,H,ee);else break;he--,xe--}if(X>he){if(X<=xe){const Ae=xe+1,Le=Ae<be?M[Ae].el:re;for(;X<=xe;)g(null,M[X]=ee?ka(M[X]):ks(M[X]),q,Le,$,Z,ue,H,ee),X++}}else if(X>xe)for(;X<=he;)J(T[X],$,Z,!0),X++;else{const Ae=X,Le=X,$e=new Map;for(X=Le;X<=xe;X++){const fe=M[X]=ee?ka(M[X]):ks(M[X]);fe.key!=null&&$e.set(fe.key,X)}let Me,Fe=0;const Ue=xe-Le+1;let Ye=!1,je=0;const Q=new Array(Ue);for(X=0;X<Ue;X++)Q[X]=0;for(X=Ae;X<=he;X++){const fe=T[X];if(Fe>=Ue){J(fe,$,Z,!0);continue}let Ie;if(fe.key!=null)Ie=$e.get(fe.key);else for(Me=Le;Me<=xe;Me++)if(Q[Me-Le]===0&&Ws(fe,M[Me])){Ie=Me;break}Ie===void 0?J(fe,$,Z,!0):(Q[Ie-Le]=X+1,Ie>=je?je=Ie:Ye=!0,g(fe,M[Ie],q,null,$,Z,ue,H,ee),Fe++)}const we=Ye?Py(Q):Qn;for(Me=we.length-1,X=Ue-1;X>=0;X--){const fe=Le+X,Ie=M[fe],se=M[fe+1],Re=fe+1<be?se.el||xh(se):re;Q[X]===0?g(null,Ie,q,Re,$,Z,ue,H,ee):Ye&&(Me<0||X!==we[Me]?U(Ie,q,Re,2):Me--)}}},U=(T,M,q,re,$=null)=>{const{el:Z,type:ue,transition:H,children:ee,shapeFlag:X}=T;if(X&6){U(T.component.subTree,M,q,re);return}if(X&128){T.suspense.move(M,q,re);return}if(X&64){ue.move(T,M,q,ye);return}if(ue===Vt){a(Z,M,q);for(let he=0;he<ee.length;he++)U(ee[he],M,q,re);a(T.anchor,M,q);return}if(ue===_n){v(T,M,q);return}if(re!==2&&X&1&&H)if(re===0)H.persisted&&!Z[Fs]?a(Z,M,q):(H.beforeEnter(Z),a(Z,M,q),Ot(()=>H.enter(Z),$));else{const{leave:he,delayLeave:xe,afterLeave:Ae}=H,Le=()=>{T.ctx.isUnmounted?n(Z):a(Z,M,q)},$e=()=>{const Me=Z._isLeaving||!!Z[Fs];Z._isLeaving&&Z[Fs](!0),H.persisted&&!Me?Le():he(Z,()=>{Le(),Ae&&Ae()})};xe?xe(Z,Le,$e):$e()}else a(Z,M,q)},J=(T,M,q,re=!1,$=!1)=>{const{type:Z,props:ue,ref:H,children:ee,dynamicChildren:X,shapeFlag:be,patchFlag:he,dirs:xe,cacheIndex:Ae,memo:Le}=T;if(he===-2&&($=!1),H!=null&&(Pa(),ai(H,null,q,T,!0),Ma()),Ae!=null&&(M.renderCache[Ae]=void 0),be&256){M.ctx.deactivate(T);return}const $e=be&1&&xe,Me=!La(T);let Fe;if(Me&&(Fe=ue&&ue.onVnodeBeforeUnmount)&&_s(Fe,M,T),be&6)me(T.component,q,re);else{if(be&128){T.suspense.unmount(q,re);return}$e&&oa(T,null,M,"beforeUnmount"),be&64?T.type.remove(T,M,q,ye,re):X&&!X.hasOnce&&(Z!==Vt||he>0&&he&64)?de(X,M,q,!1,!0):(Z===Vt&&he&384||!$&&be&16)&&de(ee,M,q),re&&ie(T)}const Ue=Le!=null&&Ae==null;(Me&&(Fe=ue&&ue.onVnodeUnmounted)||$e||Ue)&&Ot(()=>{Fe&&_s(Fe,M,T),$e&&oa(T,null,M,"unmounted"),Ue&&(T.el=null)},q)},ie=T=>{const{type:M,el:q,anchor:re,transition:$}=T;if(M===Vt){K(q,re);return}if(M===_n){b(T);return}const Z=()=>{n(q),$&&!$.persisted&&$.afterLeave&&$.afterLeave()};if(T.shapeFlag&1&&$&&!$.persisted){const{leave:ue,delayLeave:H}=$,ee=()=>ue(q,Z);H?H(T.el,Z,ee):ee()}else Z()},K=(T,M)=>{let q;for(;T!==M;)q=p(T),n(T),T=q;n(M)},me=(T,M,q)=>{const{bum:re,scope:$,job:Z,subTree:ue,um:H,m:ee,a:X}=T;mo(ee),mo(X),re&&ti(re),$.stop(),Z&&(Z.flags|=8,J(ue,T,M,q)),H&&Ot(H,M),Ot(()=>{T.isUnmounted=!0},M)},de=(T,M,q,re=!1,$=!1,Z=0)=>{for(let ue=Z;ue<T.length;ue++)J(T[ue],M,q,re,$)},W=T=>{if(T.shapeFlag&6)return W(T.component.subTree);if(T.shapeFlag&128)return T.suspense.next();const M=p(T.anchor||T.el),q=M&&M[zf];return q?p(q):M};let pe=!1;const ge=(T,M,q)=>{let re;T==null?M._vnode&&(J(M._vnode,null,null,!0),re=M._vnode.component):g(M._vnode||null,T,M,null,null,null,q),M._vnode=T,pe||(pe=!0,Yd(re),po(),pe=!1)},ye={p:g,um:J,m:U,r:ie,mt:Y,mc:C,pc:P,pbc:R,n:W,o:e};let _e,Ne;return t&&([_e,Ne]=t(ye)),{render:ge,hydrate:_e,createApp:_y(ge,_e)}}function Er({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function dn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function bh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function sd(e,t,s=!1){const a=e.children,n=t.children;if(Ee(a)&&Ee(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=ka(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&sd(l,o)),o.type===en&&(o.patchFlag===-1&&(o=n[i]=ka(o)),o.el=l.el),o.type===Rt&&!o.el&&(o.el=l.el)}}function Py(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function yh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:yh(t)}function mo(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function xh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?xh(t.subTree):null}const vo=e=>e.__isSuspense;let ic=0;const My={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)$y(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}By(e,t,s,a,n,l,o,r,c)}},hydrate:Uy,normalize:Hy},Fy=My;function al(e,t){const s=e.props&&e.props[t];Pe(s)&&s()}function $y(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=_h(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(al(e,"onPending"),al(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),ni(p,e.ssFallback)):p.resolve(!1,!0)}function By(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:g,isInFallback:A,isHydrating:I}=u;if(g)u.pendingBranch=p,Ws(g,p)?(r(g,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():A&&(I||(r(m,h,s,a,n,null,i,l,o),ni(u,h)))):(u.pendingId=ic++,I?(u.isHydrating=!1,u.activeBranch=g):c(g,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),A?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,a,n,null,i,l,o),ni(u,h))):m&&Ws(m,p)?(r(m,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Ws(m,p))r(m,p,s,a,n,u,i,l,o),ni(u,p);else if(al(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=ic++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:v}=u;y>0?setTimeout(()=>{u.pendingId===v&&u.fallback(h)},y):y===0&&u.fallback(h)}}function _h(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:g,remove:A}}=c;let I;const y=zy(e);y&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const v=e.props?lo(e.props.timeout):void 0,b=i,x={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:ic++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,E=!1){const{vnode:C,activeBranch:w,pendingBranch:R,pendingId:B,effects:S,parentComponent:F,container:Y,isInFallback:j}=x;let L=!1;if(x.isHydrating)x.isHydrating=!1;else if(!_){L=w&&R.transition&&R.transition.mode==="out-in";let ae=!1;L&&(w.transition.afterLeave=()=>{B===x.pendingId&&(p(R,Y,i===b&&!ae?m(w):i,0),Xi(S),j&&C.ssFallback&&(C.ssFallback.el=null))}),w&&!x.isFallbackMountPending&&(g(w.el)===Y&&(i=m(w),ae=!0),h(w,F,x,!0),!L&&j&&C.ssFallback&&Ot(()=>C.ssFallback.el=null,x)),L||p(R,Y,i,0)}x.isFallbackMountPending=!1,ni(x,R),x.pendingBranch=null,x.isInFallback=!1;let N=x.parent,P=!1;for(;N;){if(N.pendingBranch){N.effects.push(...S),P=!0;break}N=N.parent}!P&&!L&&Xi(S),x.effects=[],y&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!E&&t.resolve()),al(C,"onResolve")},fallback(_){if(!x.pendingBranch)return;const{vnode:E,activeBranch:C,parentComponent:w,container:R,namespace:B}=x;al(E,"onFallback");const S=m(C),F=()=>{x.isFallbackMountPending=!1,x.isInFallback&&(u(null,_,R,S,w,null,B,o,r),ni(x,_))},Y=_.transition&&_.transition.mode==="out-in";Y&&(x.isFallbackMountPending=!0,C.transition.afterLeave=F),x.isInFallback=!0,h(C,w,null,!0),Y||F()},move(_,E,C){x.activeBranch&&p(x.activeBranch,_,E,C),x.container=_},next(){return x.activeBranch&&m(x.activeBranch)},registerDep(_,E,C){const w=!!x.pendingBranch;w&&x.deps++;const R=_.vnode.el;_.asyncDep.catch(B=>{On(B,_,0)}).then(B=>{if(_.isUnmounted||x.isUnmounted||x.pendingId!==_.suspenseId)return;ll(),_.asyncResolved=!0;const{vnode:S}=_;lc(_,B,!1),R&&(S.el=R);const F=!R&&_.subTree.el;E(_,S,g(R||_.subTree.el),R?null:m(_.subTree),x,l,C),F&&(S.placeholder=null,A(F)),tr(_,S.el),w&&--x.deps===0&&x.resolve()})},unmount(_,E){x.isUnmounted=!0,x.activeBranch&&h(x.activeBranch,s,_,E),x.pendingBranch&&h(x.pendingBranch,s,_,E)}};return x}function Uy(e,t,s,a,n,i,l,o,r){const c=t.suspense=_h(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Hy(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=uu(a?s.default:s),e.ssFallback=a?uu(s.fallback):yt(Rt)}function uu(e){let t;if(Pe(e)){const s=Sn&&e._c;s&&(e._d=!1,nl()),e=e(),s&&(e._d=!0,t=is,kh())}return Ee(e)&&(e=Ty(e)),e=ks(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function wh(e,t){t&&t.pendingBranch?Ee(e)?t.effects.push(...e):t.effects.push(e):Xi(e)}function ni(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,tr(a,n))}function zy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Vt=Symbol.for("v-fgt"),en=Symbol.for("v-txt"),Rt=Symbol.for("v-cmt"),_n=Symbol.for("v-stc"),Vi=[];let is=null;function nl(e=!1){Vi.push(is=e?null:[])}function kh(){Vi.pop(),is=Vi[Vi.length-1]||null}let Sn=1;function il(e,t=!1){Sn+=e,e<0&&is&&t&&(is.hasOnce=!0)}function Sh(e){return e.dynamicChildren=Sn>0?is||Qn:null,kh(),Sn>0&&is&&is.push(e),e}function jy(e,t,s,a,n,i){return Sh(ad(e,t,s,a,n,i,!0))}function go(e,t,s,a,n){return Sh(yt(e,t,s,a,n,!0))}function $a(e){return e?e.__v_isVNode===!0:!1}function Ws(e,t){return e.type===t.type&&e.key===t.key}function Vy(e){}const Th=({key:e})=>e??null,Xl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Nt(e)||Pe(e)?{i:Yt,r:e,k:t,f:!!s}:e:null);function ad(e,t=null,s=null,a=0,n=null,i=e===Vt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Th(t),ref:t&&Xl(t),scopeId:Jo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:Yt};return o?(id(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Be(s)?8:16),Sn>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const yt=qy;function qy(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===eh)&&(e=Rt),$a(e)){const o=ua(e,t,!0);return s&&id(o,s),Sn>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Qy(e)&&(e=e.__vccOpts),t){t=Ch(t);let{class:o,style:r}=t;o&&!Be(o)&&(t.class=bl(o)),tt(r)&&(yl(r)&&!Ee(r)&&(r=We({},r)),t.style=gl(r))}const l=Be(e)?1:vo(e)?128:jf(e)?64:tt(e)?4:Pe(e)?2:0;return ad(e,t,s,a,n,l,i,!0)}function Ch(e){return e?yl(e)||ch(e)?We({},e):e:null}function ua(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Ah(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Th(c),ref:t&&t.ref?s&&i?Ee(i)?i.concat(Xl(t)):[i,Xl(t)]:Xl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Vt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ua(e.ssContent),ssFallback:e.ssFallback&&ua(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&Fa(d,r.clone(d)),d}function nd(e=" ",t=0){return yt(en,null,e,t)}function Gy(e,t){const s=yt(_n,null,e);return s.staticCount=t,s}function Eh(e="",t=!1){return t?(nl(),go(Rt,null,e)):yt(Rt,null,e)}function ks(e){return e==null||typeof e=="boolean"?yt(Rt):Ee(e)?yt(Vt,null,e.slice()):$a(e)?ka(e):yt(en,null,String(e))}function ka(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ua(e)}function id(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Ee(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),id(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!ch(t)?t._ctx=Yt:n===3&&Yt&&(Yt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Pe(t)?(t={default:t,_ctx:Yt},s=32):(t=String(t),a&64?(s=16,t=[nd(t)]):s=8);e.children=t,e.shapeFlag|=s}function Ah(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=bl([t.class,a.class]));else if(n==="style")t.style=gl([t.style,a.style]);else if(An(n)){const i=t[n],l=a[n];l&&i!==l&&!(Ee(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!$o(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function _s(e,t,s,a=null){Os(e,t,7,[s,a])}const Wy=ah();let Ky=0;function Rh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Wy,i={uid:Ky++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Fc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:uh(a,n),emitsOptions:ih(a,n),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:a.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ky.bind(null,i),e.ce&&e.ce(i),i}let Zt=null;const hs=()=>Zt||Yt;let bo,ii;{const e=jo(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};bo=t("__VUE_INSTANCE_SETTERS__",s=>Zt=s),ii=t("__VUE_SSR_SETTERS__",s=>Tn=s)}const wi=e=>{const t=Zt;return bo(e),e.scope.on(),()=>{e.scope.off(),bo(t)}},ll=()=>{Zt&&Zt.scope.off(),bo(null)};function Ih(e){return e.vnode.shapeFlag&4}let Tn=!1;function Oh(e,t=!1,s=!1){t&&ii(t);const{props:a,children:n}=e.vnode,i=Ih(e);Ry(e,a,i,t),Ny(e,n,s||t);const l=i?Jy(e,t):void 0;return t&&ii(!1),l}function Jy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,tc);const{setup:a}=s;if(a){Pa();const n=e.setupContext=a.length>1?Dh(e):null,i=wi(e),l=_i(a,e,0,[e.props,n]),o=Mc(l);if(Ma(),i(),(o||e.sp)&&!La(e)&&Kc(e),o){if(l.then(ll,ll),t)return l.then(r=>{lc(e,r,t)}).catch(r=>{On(r,e,0)});e.asyncDep=l}else lc(e,l,t)}else Nh(e,t)}function lc(e,t,s){Pe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:tt(t)&&(e.setupState=jc(t)),Nh(e,s)}let yo,oc;function Lh(e){yo=e,oc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,ty))}}const Zy=()=>!yo;function Nh(e,t,s){const a=e.type;if(!e.render){if(!t&&yo&&!a.render){const n=a.template||Xc(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=We(We({isCustomElement:i,delimiters:o},l),r);a.render=yo(n,c)}}e.render=a.render||Qt,oc&&oc(e)}{const n=wi(e);Pa();try{my(e)}finally{Ma(),n()}}}const Yy={get(e,t){return ns(e,"get",""),e[t]}};function Dh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Yy),slots:e.slots,emit:e.emit,expose:t}}function kl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(jc(Af(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ji)return ji[s](e)},has(t,s){return s in t||s in ji}})):e.proxy}function rc(e,t=!0){return Pe(e)?e.displayName||e.name:e.name||t&&e.__name}function Qy(e){return Pe(e)&&"__vccOpts"in e}const V=(e,t)=>nb(e,t,Tn);function di(e,t,s){try{il(-1);const a=arguments.length;return a===2?tt(t)&&!Ee(t)?$a(t)?yt(e,null,[t]):yt(e,t):yt(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&$a(s)&&(s=[s]),yt(e,t,s))}finally{il(1)}}function Xy(){}function ex(e,t,s,a){const n=s[a];if(n&&Ph(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Ph(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(jt(s[a],t[a]))return!1;return Sn>0&&is&&is.push(e),!0}const Mh="3.5.38",tx=Qt,sx=fb,ax=Gn,nx=Ff,ix={createComponentInstance:Rh,setupComponent:Oh,renderComponentRoot:Ql,setCurrentRenderingInstance:tl,isVNode:$a,normalizeVNode:ks,getComponentPublicInstance:kl,ensureValidVNode:Qc,pushWarningContext:cb,popWarningContext:db},lx=ix,ox=null,rx=null,cx=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let cc;const pu=typeof window<"u"&&window.trustedTypes;if(pu)try{cc=pu.createPolicy("vue",{createHTML:e=>e})}catch{}const Fh=cc?e=>cc.createHTML(e):e=>e,dx="http://www.w3.org/2000/svg",ux="http://www.w3.org/1998/Math/MathML",wa=typeof document<"u"?document:null,fu=wa&&wa.createElement("template"),$h={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?wa.createElementNS(dx,e):t==="mathml"?wa.createElementNS(ux,e):s?wa.createElement(e,{is:s}):wa.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>wa.createTextNode(e),createComment:e=>wa.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>wa.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{fu.innerHTML=Fh(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=fu.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Va="transition",Ci="animation",ui=Symbol("_vtc"),Bh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Uh=We({},Wc,Bh),px=e=>(e.displayName="Transition",e.props=Uh,e),fx=px((e,{slots:t})=>di(Gf,Hh(e),t)),un=(e,t=[])=>{Ee(e)?e.forEach(s=>s(...t)):e&&e(...t)},hu=e=>e?Ee(e)?e.some(t=>t.length>1):e.length>1:!1;function Hh(e){const t={};for(const S in e)S in Bh||(t[S]=e[S]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=hx(n),g=m&&m[0],A=m&&m[1],{onBeforeEnter:I,onEnter:y,onEnterCancelled:v,onLeave:b,onLeaveCancelled:x,onBeforeAppear:_=I,onAppear:E=y,onAppearCancelled:C=v}=t,w=(S,F,Y,j)=>{S._enterCancelled=j,Ka(S,F?d:o),Ka(S,F?c:l),Y&&Y()},R=(S,F)=>{S._isLeaving=!1,Ka(S,u),Ka(S,h),Ka(S,p),F&&F()},B=S=>(F,Y)=>{const j=S?E:y,L=()=>w(F,S,Y);un(j,[F,L]),mu(()=>{Ka(F,S?r:i),aa(F,S?d:o),hu(j)||vu(F,a,g,L)})};return We(t,{onBeforeEnter(S){un(I,[S]),aa(S,i),aa(S,l)},onBeforeAppear(S){un(_,[S]),aa(S,r),aa(S,c)},onEnter:B(!1),onAppear:B(!0),onLeave(S,F){S._isLeaving=!0;const Y=()=>R(S,F);aa(S,u),S._enterCancelled?(aa(S,p),dc(S)):(dc(S),aa(S,p)),mu(()=>{S._isLeaving&&(Ka(S,u),aa(S,h),hu(b)||vu(S,a,A,Y))}),un(b,[S,Y])},onEnterCancelled(S){w(S,!1,void 0,!0),un(v,[S])},onAppearCancelled(S){w(S,!0,void 0,!0),un(C,[S])},onLeaveCancelled(S){R(S),un(x,[S])}})}function hx(e){if(e==null)return null;if(tt(e))return[Ar(e.enter),Ar(e.leave)];{const t=Ar(e);return[t,t]}}function Ar(e){return lo(e)}function aa(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ui]||(e[ui]=new Set)).add(t)}function Ka(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[ui];s&&(s.delete(t),s.size||(e[ui]=void 0))}function mu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let mx=0;function vu(e,t,s,a){const n=e._endId=++mx,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=zh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function zh(e,t){const s=window.getComputedStyle(e),a=m=>(s[m]||"").split(", "),n=a(`${Va}Delay`),i=a(`${Va}Duration`),l=gu(n,i),o=a(`${Ci}Delay`),r=a(`${Ci}Duration`),c=gu(o,r);let d=null,u=0,p=0;t===Va?l>0&&(d=Va,u=l,p=i.length):t===Ci?c>0&&(d=Ci,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Va:Ci:null,p=d?d===Va?i.length:r.length:0);const h=d===Va&&/\b(?:transform|all)(?:,|$)/.test(a(`${Va}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function gu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>bu(s)+bu(e[a])))}function bu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function dc(e){return(e?e.ownerDocument:document).body.offsetHeight}function vx(e,t,s){const a=e[ui];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const xo=Symbol("_vod"),ld=Symbol("_vsh"),jh={name:"show",beforeMount(e,{value:t},{transition:s}){e[xo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ei(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ei(e,!0),a.enter(e)):a.leave(e,()=>{Ei(e,!1)}):Ei(e,t))},beforeUnmount(e,{value:t}){Ei(e,t)}};function Ei(e,t){e.style.display=t?e[xo]:"none",e[ld]=!t}function gx(){jh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Vh=Symbol("");function bx(e){const t=hs();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>_o(i,n))},a=()=>{const n=e(t.proxy);t.ce?_o(t.ce,n):uc(t.subTree,n),s(n)};Jc(()=>{Xi(a)}),Ge(()=>{Dt(a,Qt,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),ut(()=>n.disconnect())})}function uc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{uc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)_o(e.el,t);else if(e.type===Vt)e.children.forEach(s=>uc(s,t));else if(e.type===_n){let{el:s,anchor:a}=e;for(;s&&(_o(s,t),s!==a);)s=s.nextSibling}}function _o(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=Sg(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Vh]=a}}const yx=/(?:^|;)\s*display\s*:/;function xx(e,t,s){const a=e.style,n=Be(s);let i=!1;if(s&&!n){if(t)if(Be(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&$i(a,o,"")}else for(const l in t)s[l]==null&&$i(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?wx(e,l,!Be(t)&&t?t[l]:void 0,o)||$i(a,l,o):$i(a,l,"")}}else if(n){if(t!==s){const l=a[Vh];l&&(s+=";"+l),a.cssText=s,i=yx.test(s)}}else t&&e.removeAttribute("style");xo in e&&(e[xo]=i?a.display:"",e[ld]&&(a.display="none"))}const yu=/\s*!important$/;function $i(e,t,s){if(Ee(s))s.forEach(a=>$i(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=_x(e,t);yu.test(s)?e.setProperty(Ss(a),s.replace(yu,""),"important"):e[a]=s}}const xu=["Webkit","Moz","ms"],Rr={};function _x(e,t){const s=Rr[t];if(s)return s;let a=pt(t);if(a!=="filter"&&a in e)return Rr[t]=a;a=In(a);for(let n=0;n<xu.length;n++){const i=xu[n]+a;if(i in e)return Rr[t]=i}return t}function wx(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(a)&&s===a}const _u="http://www.w3.org/1999/xlink";function wu(e,t,s,a,n,i=wg(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(_u,t.slice(6,t.length)):e.setAttributeNS(_u,t,s):s==null||i&&!rf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function ku(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Fh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=rf(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ea(e,t,s,a){e.addEventListener(t,s,a)}function kx(e,t,s,a){e.removeEventListener(t,s,a)}const Su=Symbol("_vei");function Sx(e,t,s,a,n=null){const i=e[Su]||(e[Su]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=Tx(t);if(a){const c=i[t]=Ax(a,n);Ea(e,o,c,r)}else l&&(kx(e,o,l,r),i[t]=void 0)}}const Tu=/(?:Once|Passive|Capture)$/;function Tx(e){let t;if(Tu.test(e)){t={};let a;for(;a=e.match(Tu);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Ss(e.slice(2)),t]}let Ir=0;const Cx=Promise.resolve(),Ex=()=>Ir||(Cx.then(()=>Ir=0),Ir=Date.now());function Ax(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Ee(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Os(c,t,5,o)}}else Os(n,t,5,[a])};return s.value=e,s.attached=Ex(),s}const Cu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,qh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?vx(e,a,l):t==="style"?xx(e,s,a):An(t)?$o(t)||Sx(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Rx(e,t,a,l))?(ku(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&wu(e,t,a,l,i,t!=="value")):e._isVueCE&&(Ix(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(a)))?ku(e,pt(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),wu(e,t,a,l))};function Rx(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&Cu(t)&&Pe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return Cu(t)&&Be(s)?!1:t in e}function Ix(e,t){const s=e._def.props;if(!s)return!1;const a=pt(t);return Array.isArray(s)?s.some(n=>pt(n)===a):Object.keys(s).some(n=>pt(n)===a)}const Eu={};function Gh(e,t,s){let a=_l(e,t);Bo(a)&&(a=We({},a,t));class n extends sr{constructor(l){super(a,l,s)}}return n.def=a,n}const Ox=((e,t)=>Gh(e,t,im)),Lx=typeof HTMLElement<"u"?HTMLElement:class{};class sr extends Lx{constructor(t,s={},a=So){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==So?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(We({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof sr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,At(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Ee(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=lo(this._props[r])),(o||(o=Object.create(null)))[pt(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)lt(this,a)||Object.defineProperty(this,a,{get:()=>ca(s[a])})}_resolveProps(t){const{props:s}=t,a=Ee(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(pt))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):Eu;const n=pt(t);s&&this._numberProps&&this._numberProps[n]&&(a=lo(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Eu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Ss(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Ss(t),s+""):s||this.removeAttribute(Ss(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),nm(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=yt(this._def,We(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Bo(l[0])?We({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),Ss(i)!==i&&n(Ss(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Wh(e){const t=hs(),s=t&&t.ce;return s||null}function Nx(){const e=Wh();return e&&e.shadowRoot}function Dx(e="$style"){{const t=hs();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const a=s[e];return a||Ke}}const Kh=new WeakMap,Jh=new WeakMap,wo=Symbol("_moveCb"),Au=Symbol("_enterCb"),Px=e=>(delete e.props.mode,e),Mx=Px({name:"TransitionGroup",props:We({},Uh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=hs(),a=Gc();let n,i;return Qo(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Hx(n[0].el,s.vnode.el,l)){n=[];return}n.forEach($x),n.forEach(Bx);const o=n.filter(Ux);dc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;aa(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[wo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[wo]=null,Ka(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=Qe(e),o=Hh(l);let r=l.tag||Vt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[ld]&&(n.push(d),Fa(d,ci(d,o,a,s)),Kh.set(d,Zh(d.el)))}i=t.default?Zo(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Fa(d,ci(d,o,a,s))}return yt(r,null,i)}}}),Fx=Mx;function $x(e){const t=e.el;t[wo]&&t[wo](),t[Au]&&t[Au]()}function Bx(e){Jh.set(e,Zh(e.el))}function Ux(e){const t=Kh.get(e),s=Jh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function Zh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Hx(e,t,s){const a=e.cloneNode(),n=e[ui];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=zh(a);return i.removeChild(a),l}const sn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ee(t)?s=>ti(t,s):t};function zx(e){e.target.composing=!0}function Ru(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const zs=Symbol("_assign");function Iu(e,t,s){return t&&(e=e.trim()),s&&(e=zo(e)),e}const ko={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[zs]=sn(n);const i=a||n.props&&n.props.type==="number";Ea(e,t?"change":"input",l=>{l.target.composing||e[zs](Iu(e.value,s,i))}),(s||i)&&Ea(e,"change",()=>{e.value=Iu(e.value,s,i)}),t||(Ea(e,"compositionstart",zx),Ea(e,"compositionend",Ru),Ea(e,"change",Ru))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[zs]=sn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?zo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},od={deep:!0,created(e,t,s){e[zs]=sn(s),Ea(e,"change",()=>{const a=e._modelValue,n=pi(e),i=e.checked,l=e[zs];if(Ee(a)){const o=Vo(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(Rn(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Qh(e,i))})},mounted:Ou,beforeUpdate(e,t,s){e[zs]=sn(s),Ou(e,t,s)}};function Ou(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Ee(t))n=Vo(t,a.props.value)>-1;else if(Rn(t))n=t.has(a.props.value);else{if(t===s)return;n=Da(t,Qh(e,!0))}e.checked!==n&&(e.checked=n)}const rd={created(e,{value:t},s){e.checked=Da(t,s.props.value),e[zs]=sn(s),Ea(e,"change",()=>{e[zs](pi(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[zs]=sn(a),t!==s&&(e.checked=Da(t,a.props.value))}},Yh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=Rn(t);Ea(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?zo(pi(l)):pi(l));e[zs](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,At(()=>{e._assigning=!1})}),e[zs]=sn(a)},mounted(e,{value:t}){Lu(e,t)},beforeUpdate(e,t,s){e[zs]=sn(s)},updated(e,{value:t}){e._assigning||Lu(e,t)}};function Lu(e,t){const s=e.multiple,a=Ee(t);if(!(s&&!a&&!Rn(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=pi(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Vo(t,o)>-1}else l.selected=t.has(o);else if(Da(pi(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function pi(e){return"_value"in e?e._value:e.value}function Qh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Xh={created(e,t,s){Hl(e,t,s,null,"created")},mounted(e,t,s){Hl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){Hl(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){Hl(e,t,s,a,"updated")}};function em(e,t){switch(e){case"SELECT":return Yh;case"TEXTAREA":return ko;default:switch(t){case"checkbox":return od;case"radio":return rd;default:return ko}}}function Hl(e,t,s,a,n){const l=em(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function jx(){ko.getSSRProps=({value:e})=>({value:e}),rd.getSSRProps=({value:e},t)=>{if(t.props&&Da(t.props.value,e))return{checked:!0}},od.getSSRProps=({value:e},t)=>{if(Ee(e)){if(t.props&&Vo(e,t.props.value)>-1)return{checked:!0}}else if(Rn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Xh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=em(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Vx=["ctrl","shift","alt","meta"],qx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Vx.some(s=>e[`${s}Key`]&&!t.includes(s))},Gx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=qx[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Wx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Kx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=Ss(n.key);if(t.some(l=>l===i||Wx[l]===i))return e(n)}))},tm=We({patchProp:qh},$h);let qi,Nu=!1;function sm(){return qi||(qi=mh(tm))}function am(){return qi=Nu?qi:vh(tm),Nu=!0,qi}const nm=((...e)=>{sm().render(...e)}),Jx=((...e)=>{am().hydrate(...e)}),So=((...e)=>{const t=sm().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=om(a);if(!n)return;const i=t._component;!Pe(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,lm(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),im=((...e)=>{const t=am().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=om(a);if(n)return s(n,!0,lm(n))},t});function lm(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function om(e){return Be(e)?document.querySelector(e):e}let Du=!1;const Zx=()=>{Du||(Du=!0,jx(),gx())},Yx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Gf,BaseTransitionPropsValidators:Wc,Comment:Rt,DeprecationTypes:cx,EffectScope:Fc,ErrorCodes:pb,ErrorTypeStrings:sx,Fragment:Vt,KeepAlive:qb,ReactiveEffect:Zi,Static:_n,Suspense:Fy,Teleport:Eb,Text:en,TrackOpTypes:ib,Transition:fx,TransitionGroup:Fx,TriggerOpTypes:lb,VueElement:sr,assertNumber:ub,callWithAsyncErrorHandling:Os,callWithErrorHandling:_i,camelize:pt,capitalize:In,cloneVNode:ua,compatUtils:rx,computed:V,createApp:So,createBlock:go,createCommentVNode:Eh,createElementBlock:jy,createElementVNode:ad,createHydrationRenderer:vh,createPropsRestProxy:fy,createRenderer:mh,createSSRApp:im,createSlots:Qb,createStaticVNode:Gy,createTextVNode:nd,createVNode:yt,customRef:If,defineAsyncComponent:jb,defineComponent:_l,defineCustomElement:Gh,defineEmits:ay,defineExpose:ny,defineModel:oy,defineOptions:iy,defineProps:sy,defineSSRCustomElement:Ox,defineSlots:ly,devtools:ax,effect:Ag,effectScope:Tg,getCurrentInstance:hs,getCurrentScope:pf,getCurrentWatcher:ob,getTransitionRawChildren:Zo,guardReactiveProps:Ch,h:di,handleError:On,hasInjectionContext:xb,hydrate:Jx,hydrateOnIdle:Fb,hydrateOnInteraction:Hb,hydrateOnMediaQuery:Ub,hydrateOnVisible:Bb,initCustomFormatter:Xy,initDirectivesForSSR:Zx,inject:Hs,isMemoSame:Ph,isProxy:yl,isReactive:Oa,isReadonly:da,isRef:Nt,isRuntimeOnly:Zy,isShallow:Cs,isVNode:$a,markRaw:Af,mergeDefaults:uy,mergeModels:py,mergeProps:Ah,nextTick:At,nodeOps:$h,normalizeClass:bl,normalizeProps:pg,normalizeStyle:gl,onActivated:Xt,onBeforeMount:Jf,onBeforeUnmount:Xo,onBeforeUpdate:Jc,onDeactivated:Ut,onErrorCaptured:Xf,onMounted:Ge,onRenderTracked:Qf,onRenderTriggered:Yf,onScopeDispose:Cg,onServerPrefetch:Zf,onUnmounted:ut,onUpdated:Qo,onWatcherCleanup:Lf,openBlock:nl,patchProp:qh,popScopeId:gb,provide:zi,proxyRefs:jc,pushScopeId:vb,queuePostFlushCb:Xi,reactive:an,readonly:ro,ref:f,registerRuntimeCompiler:Lh,render:nm,renderList:Yb,renderSlot:Xb,resolveComponent:Kb,resolveDirective:Zb,resolveDynamicComponent:Jb,resolveFilter:ox,resolveTransitionHooks:ci,setBlockTracking:il,setDevtoolsHook:nx,setTransitionHooks:Fa,shallowReactive:Hc,shallowReadonly:Wg,shallowRef:zc,ssrContextKey:$f,ssrUtils:lx,stop:Rg,toDisplayString:df,toHandlerKey:ei,toHandlers:ey,toRaw:Qe,toRef:sb,toRefs:Xg,toValue:Zg,transformVNodeArgs:Vy,triggerRef:Jg,unref:ca,useAttrs:dy,useCssModule:Dx,useCssVars:bx,useHost:Wh,useId:Rb,useModel:wy,useSSRContext:Bf,useShadowRoot:Nx,useSlots:cy,useTemplateRef:Ib,useTransitionState:Gc,vModelCheckbox:od,vModelDynamic:Xh,vModelRadio:rd,vModelSelect:Yh,vModelText:ko,vShow:jh,version:Mh,warn:tx,watch:Dt,watchEffect:_b,watchPostEffect:wb,watchSyncEffect:Uf,withAsyncContext:hy,withCtx:qc,withDefaults:ry,withDirectives:yb,withKeys:Kx,withMemo:ex,withModifiers:Gx,withScopeId:bb},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ol=Symbol(""),Gi=Symbol(""),cd=Symbol(""),To=Symbol(""),rm=Symbol(""),Cn=Symbol(""),cm=Symbol(""),dm=Symbol(""),dd=Symbol(""),ud=Symbol(""),Sl=Symbol(""),pd=Symbol(""),um=Symbol(""),fd=Symbol(""),hd=Symbol(""),md=Symbol(""),vd=Symbol(""),gd=Symbol(""),bd=Symbol(""),pm=Symbol(""),fm=Symbol(""),ar=Symbol(""),Co=Symbol(""),yd=Symbol(""),xd=Symbol(""),rl=Symbol(""),Tl=Symbol(""),_d=Symbol(""),pc=Symbol(""),Qx=Symbol(""),fc=Symbol(""),Eo=Symbol(""),Xx=Symbol(""),e0=Symbol(""),wd=Symbol(""),t0=Symbol(""),s0=Symbol(""),kd=Symbol(""),hm=Symbol(""),fi={[ol]:"Fragment",[Gi]:"Teleport",[cd]:"Suspense",[To]:"KeepAlive",[rm]:"BaseTransition",[Cn]:"openBlock",[cm]:"createBlock",[dm]:"createElementBlock",[dd]:"createVNode",[ud]:"createElementVNode",[Sl]:"createCommentVNode",[pd]:"createTextVNode",[um]:"createStaticVNode",[fd]:"resolveComponent",[hd]:"resolveDynamicComponent",[md]:"resolveDirective",[vd]:"resolveFilter",[gd]:"withDirectives",[bd]:"renderList",[pm]:"renderSlot",[fm]:"createSlots",[ar]:"toDisplayString",[Co]:"mergeProps",[yd]:"normalizeClass",[xd]:"normalizeStyle",[rl]:"normalizeProps",[Tl]:"guardReactiveProps",[_d]:"toHandlers",[pc]:"camelize",[Qx]:"capitalize",[fc]:"toHandlerKey",[Eo]:"setBlockTracking",[Xx]:"pushScopeId",[e0]:"popScopeId",[wd]:"withCtx",[t0]:"unref",[s0]:"isRef",[kd]:"withMemo",[hm]:"isMemoSame"};function a0(e){Object.getOwnPropertySymbols(e).forEach(t=>{fi[t]=e[t]})}const Ns={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function n0(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ns}}function cl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Ns){return e&&(o?(e.helper(Cn),e.helper(vi(e.inSSR,c))):e.helper(mi(e.inSSR,c)),l&&e.helper(gd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function wn(e,t=Ns){return{type:17,loc:t,elements:e}}function Us(e,t=Ns){return{type:15,loc:t,properties:e}}function Lt(e,t){return{type:16,loc:Ns,key:Be(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Ns,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function Js(e,t=Ns){return{type:8,loc:t,children:e}}function Bt(e,t=[],s=Ns){return{type:14,loc:s,callee:e,arguments:t}}function hi(e,t=void 0,s=!1,a=!1,n=Ns){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function hc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Ns}}function i0(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Ns}}function l0(e){return{type:21,body:e,loc:Ns}}function mi(e,t){return e||t?dd:ud}function vi(e,t){return e||t?cm:dm}function Sd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(mi(a,e.isComponent)),t(Cn),t(vi(a,e.isComponent)))}const Pu=new Uint8Array([123,123]),Mu=new Uint8Array([125,125]);function Fu(e){return e>=97&&e<=122||e>=65&&e<=90}function Rs(e){return e===32||e===10||e===9||e===12||e===13}function qa(e){return e===47||e===62||Rs(e)}function Ao(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class o0{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Pu,this.delimiterClose=Mu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Pu,this.delimiterClose=Mu}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?qa(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Rs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Fu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){qa(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(qa(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Ao("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Rs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Fu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Rs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Rs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Rs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||qa(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||qa(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||qa(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||qa(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||qa(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Rs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Rs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Rs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function $u(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function kn(e,t){const s=$u("MODE",t),a=$u(e,t);return s===3?a===!0:a!==!1}function dl(e,t,s,...a){return kn(e,t)}function Td(e){throw e}function mm(e){}function gt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Ts=e=>e.type===4&&e.isStatic;function vm(e){switch(e){case"Teleport":case"teleport":return Gi;case"Suspense":case"suspense":return cd;case"KeepAlive":case"keep-alive":return To;case"BaseTransition":case"base-transition":return rm}}const r0=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Cd=e=>!r0.test(e),gm=/[A-Za-z_$\xA0-\uFFFF]/,c0=/[\.\?\w$\xA0-\uFFFF]/,d0=/\s+[.[]\s*|\s*[.[]\s+/g,bm=e=>e.type===4?e.content:e.loc.source,u0=e=>{const t=bm(e).trim().replace(d0,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?gm:c0).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},ym=u0,p0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,f0=e=>p0.test(bm(e)),h0=f0;function Bs(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Be(t)?n.name===t:t.test(n.name)))return n}}function nr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&vn(i.arg,t))return i}}function vn(e,t){return!!(e&&Ts(e)&&e.content===t)}function m0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Or(e){return e.type===5||e.type===2}function Bu(e){return e.type===7&&e.name==="pre"}function v0(e){return e.type===7&&e.name==="slot"}function Ro(e){return e.type===1&&e.tagType===3}function Io(e){return e.type===1&&e.tagType===2}const g0=new Set([rl,Tl]);function xm(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&g0.has(s))return xm(e.arguments[0],t.concat(e))}return[e,t]}function Oo(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Be(n)&&n.type===14){const o=xm(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Be(n))a=Us([t]);else if(n.type===14){const o=n.arguments[0];!Be(o)&&o.type===15?Uu(t,o)||o.properties.unshift(t):n.callee===_d?a=Bt(s.helper(Co),[Us([t]),n]):n.arguments.unshift(Us([t])),!a&&(a=n)}else n.type===15?(Uu(t,n)||n.properties.unshift(t),a=n):(a=Bt(s.helper(Co),[Us([t]),n]),l&&l.callee===Tl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Uu(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function ul(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function b0(e){return e.type===14&&e.callee===kd?e.arguments[1].returns:e}const y0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function _m(e){for(let t=0;t<e.length;t++)if(!Rs(e.charCodeAt(t)))return!1;return!0}function Ed(e){return e.type===2&&_m(e.content)||e.type===12&&Ed(e.content)}function wm(e){return e.type===3||Ed(e)}const km={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Jn,isPreTag:Jn,isIgnoreNewlineTag:Jn,isCustomElement:Jn,onError:Td,onWarn:mm,comments:!1,prefixIdentifiers:!1};let et=km,pl=null,Na="",as=null,Ze=null,xs="",_a=-1,fn=-1,Ad=0,Ya=!1,mc=null;const vt=[],Ct=new o0(vt,{onerr:ba,ontext(e,t){zl(Jt(e,t),e,t)},ontextentity(e,t,s){zl(e,t,s)},oninterpolation(e,t){if(Ya)return zl(Jt(e,t),e,t);let s=e+Ct.delimiterOpen.length,a=t-Ct.delimiterClose.length;for(;Rs(Na.charCodeAt(s));)s++;for(;Rs(Na.charCodeAt(a-1));)a--;let n=Jt(s,a);n.includes("&")&&(n=et.decodeEntities(n,!1)),vc({type:5,content:to(n,!1,Et(s,a)),loc:Et(e,t)})},onopentagname(e,t){const s=Jt(e,t);as={type:1,tag:s,ns:et.getNamespace(s,vt[0],et.ns),tagType:0,props:[],children:[],loc:Et(e-1,t),codegenNode:void 0}},onopentagend(e){zu(e)},onclosetag(e,t){const s=Jt(e,t);if(!et.isVoidTag(s)){let a=!1;for(let n=0;n<vt.length;n++)if(vt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&ba(24,vt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=vt.shift();eo(o,t,l<n)}break}a||ba(23,Sm(e,60))}},onselfclosingtag(e){const t=as.tag;as.isSelfClosing=!0,zu(e),vt[0]&&vt[0].tag===t&&eo(vt.shift(),e)},onattribname(e,t){Ze={type:6,name:Jt(e,t),nameLoc:Et(e,t),value:void 0,loc:Et(e)}},ondirname(e,t){const s=Jt(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ya&&a===""&&ba(26,e),Ya||a==="")Ze={type:6,name:s,nameLoc:Et(e,t),value:void 0,loc:Et(e)};else if(Ze={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:Et(e)},a==="pre"){Ya=Ct.inVPre=!0,mc=as;const n=as.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=R0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=Jt(e,t);if(Ya&&!Bu(Ze))Ze.name+=s,gn(Ze.nameLoc,t);else{const a=s[0]!=="[";Ze.arg=to(a?s:s.slice(1,-1),a,Et(e,t),a?3:0)}},ondirmodifier(e,t){const s=Jt(e,t);if(Ya&&!Bu(Ze))Ze.name+="."+s,gn(Ze.nameLoc,t);else if(Ze.name==="slot"){const a=Ze.arg;a&&(a.content+="."+s,gn(a.loc,t))}else{const a=Ve(s,!0,Et(e,t));Ze.modifiers.push(a)}},onattribdata(e,t){xs+=Jt(e,t),_a<0&&(_a=e),fn=t},onattribentity(e,t,s){xs+=e,_a<0&&(_a=t),fn=s},onattribnameend(e){const t=Ze.loc.start.offset,s=Jt(t,e);Ze.type===7&&(Ze.rawName=s),as.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&ba(2,t)},onattribend(e,t){if(as&&Ze){if(gn(Ze.loc,t),e!==0)if(xs.includes("&")&&(xs=et.decodeEntities(xs,!0)),Ze.type===6)Ze.name==="class"&&(xs=Cm(xs).trim()),e===1&&!xs&&ba(13,t),Ze.value={type:2,content:xs,loc:e===1?Et(_a,fn):Et(_a-1,fn+1)},Ct.inSFCRoot&&as.tag==="template"&&Ze.name==="lang"&&xs&&xs!=="html"&&Ct.enterRCDATA(Ao("</template"),0);else{let s=0;Ze.exp=to(xs,!1,Et(_a,fn),0,s),Ze.name==="for"&&(Ze.forParseResult=_0(Ze.exp));let a=-1;Ze.name==="bind"&&(a=Ze.modifiers.findIndex(n=>n.content==="sync"))>-1&&dl("COMPILER_V_BIND_SYNC",et,Ze.loc,Ze.arg.loc.source)&&(Ze.name="model",Ze.modifiers.splice(a,1))}(Ze.type!==7||Ze.name!=="pre")&&as.props.push(Ze)}xs="",_a=fn=-1},oncomment(e,t){et.comments&&vc({type:3,content:Jt(e,t),loc:Et(e-4,t+3)})},onend(){const e=Na.length;for(let t=0;t<vt.length;t++)eo(vt[t],e-1),ba(24,vt[t].loc.start.offset)},oncdata(e,t){(vt[0]?vt[0].ns:et.ns)!==0?zl(Jt(e,t),e,t):ba(1,e-9)},onprocessinginstruction(e){(vt[0]?vt[0].ns:et.ns)===0&&ba(21,e-1)}}),Hu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,x0=/^\(|\)$/g;function _0(e){const t=e.loc,s=e.content,a=s.match(y0);if(!a)return;const[,n,i]=a,l=(u,p,h=!1)=>{const m=t.start.offset+p,g=m+u.length;return to(u,!1,Et(m,g),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(x0,"").trim();const c=n.indexOf(r),d=r.match(Hu);if(d){r=r.replace(Hu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Jt(e,t){return Na.slice(e,t)}function zu(e){Ct.inSFCRoot&&(as.innerLoc=Et(e+1,e+1)),vc(as);const{tag:t,ns:s}=as;s===0&&et.isPreTag(t)&&Ad++,et.isVoidTag(t)?eo(as,e):(vt.unshift(as),(s===1||s===2)&&(Ct.inXML=!0)),as=null}function zl(e,t,s){{const i=vt[0]&&vt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=et.decodeEntities(e,!1))}const a=vt[0]||pl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,gn(n.loc,s)):a.children.push({type:2,content:e,loc:Et(t,s)})}function eo(e,t,s=!1){s?gn(e.loc,Sm(t,60)):gn(e.loc,w0(t,62)+1),Ct.inSFCRoot&&(e.children.length?e.innerLoc.end=We({},e.children[e.children.length-1].loc.end):e.innerLoc.end=We({},e.innerLoc.start),e.innerLoc.source=Jt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(Ya||(a==="slot"?e.tagType=2:ju(e)?e.tagType=3:S0(e)&&(e.tagType=1)),Ct.inRCDATA||(e.children=Tm(i)),n===0&&et.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&et.isPreTag(a)&&Ad--,mc===e&&(Ya=Ct.inVPre=!1,mc=null),Ct.inXML&&(vt[0]?vt[0].ns:et.ns)===0&&(Ct.inXML=!1);{const l=e.props;if(!Ct.inSFCRoot&&kn("COMPILER_NATIVE_TEMPLATE",et)&&e.tag==="template"&&!ju(e)){const r=vt[0]||pl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&dl("COMPILER_INLINE_TEMPLATE",et,o.loc)&&e.children.length&&(o.value={type:2,content:Jt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function w0(e,t){let s=e;for(;Na.charCodeAt(s)!==t&&s<Na.length-1;)s++;return s}function Sm(e,t){let s=e;for(;Na.charCodeAt(s)!==t&&s>=0;)s--;return s}const k0=new Set(["if","else","else-if","for","slot"]);function ju({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&k0.has(t[s].name))return!0}return!1}function S0({tag:e,props:t}){if(et.isCustomElement(e))return!1;if(e==="component"||T0(e.charCodeAt(0))||vm(e)||et.isBuiltInComponent&&et.isBuiltInComponent(e)||et.isNativeTag&&!et.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(dl("COMPILER_IS_ON_ELEMENT",et,a.loc))return!0}}else if(a.name==="bind"&&vn(a.arg,"is")&&dl("COMPILER_IS_ON_ELEMENT",et,a.loc))return!0}return!1}function T0(e){return e>64&&e<91}const C0=/\r\n/g;function Tm(e){const t=et.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(Ad)n.content=n.content.replace(C0,`
`);else if(_m(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&E0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=Cm(n.content))}return s?e.filter(Boolean):e}function E0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Cm(e){let t="",s=!1;for(let a=0;a<e.length;a++)Rs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function vc(e){(vt[0]||pl).children.push(e)}function Et(e,t){return{start:Ct.getPos(e),end:t==null?t:Ct.getPos(t),source:t==null?t:Jt(e,t)}}function A0(e){return Et(e.start.offset,e.end.offset)}function gn(e,t){e.end=Ct.getPos(t),e.source=Jt(e.start.offset,t)}function R0(e){const t={type:6,name:e.rawName,nameLoc:Et(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function to(e,t=!1,s,a=0,n=0){return Ve(e,t,s,a)}function ba(e,t,s){et.onError(gt(e,Et(t,t)))}function I0(){Ct.reset(),as=null,Ze=null,xs="",_a=-1,fn=-1,vt.length=0}function O0(e,t){if(I0(),Na=e,et=We({},km),t){let n;for(n in t)t[n]!=null&&(et[n]=t[n])}Ct.mode=et.parseMode==="html"?1:et.parseMode==="sfc"?2:0,Ct.inXML=et.ns===1||et.ns===2;const s=t&&t.delimiters;s&&(Ct.delimiterOpen=Ao(s[0]),Ct.delimiterClose=Ao(s[1]));const a=pl=n0([],e);return Ct.parse(Na),a.loc=Et(0,e.length),a.children=Tm(a.children),pl=null,a}function L0(e,t){so(e,void 0,t,!!Em(e))}function Em(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Io(t[0])?t[0]:null}function so(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Is(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&Rm(u,s)>=2){const g=Im(u);g&&(h.props=s.hoist(g))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(a?0:Is(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,so(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)so(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)so(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ee(e.codegenNode.children))e.codegenNode.children=r(wn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ee(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(wn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ee(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Bs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(wn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ee(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Is(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=Rm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Is(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Is(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Cn),t.removeHelper(vi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(mi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Is(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Be(o)||os(o))continue;const r=Is(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const N0=new Set([yd,xd,rl,Tl]);function Am(e,t){if(e.type===14&&!Be(e.callee)&&N0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Is(s,t);if(s.type===14)return Am(s,t)}return 0}function Rm(e,t){let s=3;const a=Im(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Is(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Is(o,t):o.type===14?c=Am(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Im(e){const t=e.codegenNode;if(t.type===13)return t.props}function D0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Qt,isCustomElement:d=Qt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:g=!1,ssrCssVars:A="",bindingMetadata:I=Ke,inline:y=!1,isTS:v=!1,onError:b=Td,onWarn:x=mm,compatConfig:_}){const E=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:E&&In(pt(E[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:g,ssrCssVars:A,bindingMetadata:I,inline:y,isTS:v,onError:b,onWarn:x,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(w){const R=C.helpers.get(w)||0;return C.helpers.set(w,R+1),w},removeHelper(w){const R=C.helpers.get(w);if(R){const B=R-1;B?C.helpers.set(w,B):C.helpers.delete(w)}},helperString(w){return`_${fi[C.helper(w)]}`},replaceNode(w){C.parent.children[C.childIndex]=C.currentNode=w},removeNode(w){const R=C.parent.children,B=w?R.indexOf(w):C.currentNode?C.childIndex:-1;!w||w===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>B&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(B,1)},onNodeRemoved:Qt,addIdentifiers(w){},removeIdentifiers(w){},hoist(w){Be(w)&&(w=Ve(w)),C.hoists.push(w);const R=Ve(`_hoisted_${C.hoists.length}`,!1,w.loc,2);return R.hoisted=w,R},cache(w,R=!1,B=!1){const S=i0(C.cached.length,w,R,B);return C.cached.push(S),S}};return C.filters=new Set,C}function P0(e,t){const s=D0(e,t);ir(e,s),t.hoistStatic&&L0(e,s),t.ssr||M0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function M0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=Em(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&Sd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=cl(t,s(ol),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function F0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Be(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,ir(n,t))}}function ir(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ee(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Sl);break;case 5:t.ssr||t.helper(ar);break;case 9:for(let i=0;i<e.branches.length;i++)ir(e.branches[i],t);break;case 10:case 11:case 1:case 0:F0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function Om(e,t){const s=Be(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(v0))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const lr="/*@__PURE__*/",Lm=e=>`${fi[e]}: _${fi[e]}`;function $0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${fi[g]}`},push(g,A=-2,I){h.code+=g},indent(){m(++h.indentLevel)},deindent(g=!1){g?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(g){h.push(`
`+"  ".repeat(g),0)}return h}function B0(e,t={}){const s=$0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&a!=="module";U0(e,s);const g=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${g}(${I}) {`),l(),h&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(Lm).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Lr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Lr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Lr(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?ls(e.codegenNode,s):n("null"),h&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function U0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[dd,ud,Sl,pd,um].filter(p=>d.includes(p)).map(Lm).join(", ");n(`const { ${u} } = _Vue
`,-1)}H0(e.hoists,t),i(),n("return ")}function Lr(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?vd:t==="component"?fd:md);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${ul(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function H0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),ls(i,t),a())}t.pure=!1}function Rd(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Cl(e,t,s),s&&t.deindent(),t.push("]")}function Cl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Be(o)?n(o,-3):Ee(o)?Rd(o,t):ls(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function ls(e,t){if(Be(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:z0(e,t);break;case 4:Nm(e,t);break;case 5:j0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:Dm(e,t);break;case 3:q0(e,t);break;case 13:G0(e,t);break;case 14:K0(e,t);break;case 15:J0(e,t);break;case 17:Z0(e,t);break;case 18:Y0(e,t);break;case 19:Q0(e,t);break;case 20:X0(e,t);break;case 21:Cl(e.body,t,!0,!1);break}}function z0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Nm(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function j0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(lr),s(`${a(ar)}(`),ls(e.content,t),s(")")}function Dm(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Be(a)?t.push(a,-3):ls(a,t)}}function V0(e,t){const{push:s}=t;if(e.type===8)s("["),Dm(e,t),s("]");else if(e.isStatic){const a=Cd(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function q0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(lr),s(`${a(Sl)}(${JSON.stringify(e.content)})`,-3,e)}function G0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(a(gd)+"("),u&&s(`(${a(Cn)}(${p?"true":""}), `),n&&s(lr);const g=u?vi(t.inSSR,h):mi(t.inSSR,h);s(a(g)+"(",-2,e),Cl(W0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function W0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function K0(e,t){const{push:s,helper:a,pure:n}=t,i=Be(e.callee)?e.callee:a(e.callee);n&&s(lr),s(i+"(",-2,e),Cl(e.arguments,t),s(")")}function J0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];V0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function Z0(e,t){Rd(e.elements,t)}function Y0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${fi[wd]}(`),s("(",-2,e),Ee(i)?Cl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Ee(l)?Rd(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Q0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Cd(s.content);u&&l("("),Nm(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,ls(n,t),d||t.indentLevel--,i&&r(!0)}function X0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(Eo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(Eo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const e_=Om(/^(?:if|else|else-if)$/,(e,t,s)=>t_(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=qu(n,r,s);else{const c=s_(a.codegenNode);c.alternate=qu(n,r+a.branches.length-1,s)}}}));function t_(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(gt(28,t.loc)),t.exp=Ve("true",!1,n)}if(t.name==="if"){const n=Vu(e,t),i={type:9,loc:A0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&wm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(gt(30,e.loc)),s.removeNode();const o=Vu(e,t);l.branches.push(o);const r=a&&a(l,o,!1);ir(o,s),r&&r(),s.currentNode=null}else s.onError(gt(30,e.loc));break}}}function Vu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Bs(e,"for")?e.children:[e],userKey:nr(e,"key"),isTemplateIf:s}}function qu(e,t,s){return e.condition?hc(e.condition,Gu(e,t,s),Bt(s.helper(Sl),['""',"true"])):Gu(e,t,s)}function Gu(e,t,s){const{helper:a}=s,n=Lt("key",Ve(`${t}`,!1,Ns,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Oo(r,n,s),r}else return cl(s,a(ol),Us([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=b0(r);return c.type===13&&Sd(c,s),Oo(c,n,s),r}}function s_(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const a_=Om("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return n_(e,t,s,i=>{const l=Bt(a(bd),[i.source]),o=Ro(e),r=Bs(e,"memo"),c=nr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Lt("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=cl(s,a(ol),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:g}=i,A=g.length!==1||g[0].type!==1,I=Io(e)?e:o&&e.children.length===1&&Io(e.children[0])?e.children[0]:null;if(I?(m=I.codegenNode,o&&u&&Oo(m,u,s)):A?m=cl(s,a(ol),u?Us([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=g[0].codegenNode,o&&u&&Oo(m,u,s),m.isBlock!==!p&&(m.isBlock?(n(Cn),n(vi(s.inSSR,m.isComponent))):n(mi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(a(Cn),a(vi(s.inSSR,m.isComponent))):a(mi(s.inSSR,m.isComponent))),r){const y=hi(gc(i.parseResult,[Ve("_cached")]));y.body=l0([Js(["const _memo = (",r.exp,")"]),Js(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(hm)}(_cached, _memo)) return _cached`]),Js(["const _item = ",m]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(y,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(hi(gc(i.parseResult),m,!0))}})});function n_(e,t,s,a){if(!t.exp){s.onError(gt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(gt(32,t.loc));return}Pm(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:Ro(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=a&&a(p);return()=>{o.vFor--,h&&h()}}function Pm(e,t){e.finalized||(e.finalized=!0)}function gc({value:e,key:t,index:s},a=[]){return i_([e,t,s,...a])}function i_(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ve("_".repeat(a+1),!1))}const Wu=Ve("undefined",!1),l_=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Bs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},o_=(e,t,s,a)=>hi(e,s,!1,!0,s.length?s[0].loc:a);function r_(e,t,s=o_){t.helper(wd);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Bs(e,"slot",!0);if(r){const{arg:A,exp:I}=r;A&&!Ts(A)&&(o=!0),i.push(Lt(A||Ve("default",!0),s(I,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let A=0;A<a.length;A++){const I=a[A];let y;if(!Ro(I)||!(y=Bs(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(r){t.onError(gt(37,y.loc));break}c=!0;const{children:v,loc:b}=I,{arg:x=Ve("default",!0),exp:_,loc:E}=y;let C;Ts(x)?C=x?x.content:"default":o=!0;const w=Bs(I,"for"),R=s(_,w,v,b);let B,S;if(B=Bs(I,"if"))o=!0,l.push(hc(B.exp,jl(x,R,h++),Wu));else if(S=Bs(I,/^else(?:-if)?$/,!0)){let F=A,Y;for(;F--&&(Y=a[F],!!wm(Y)););if(Y&&Ro(Y)&&Bs(Y,/^(?:else-)?if$/)){let j=l[l.length-1];for(;j.alternate.type===19;)j=j.alternate;j.alternate=S.exp?hc(S.exp,jl(x,R,h++),Wu):jl(x,R,h++)}else t.onError(gt(30,S.loc))}else if(w){o=!0;const F=w.forParseResult;F?(Pm(F),l.push(Bt(t.helper(bd),[F.source,hi(gc(F),jl(x,R),!0)]))):t.onError(gt(32,w.loc))}else{if(C){if(p.has(C)){t.onError(gt(38,E));continue}p.add(C),C==="default"&&(d=!0)}i.push(Lt(x,R))}}if(!r){const A=(I,y)=>{const v=s(I,void 0,y,n);return t.compatConfig&&(v.isNonScopedSlot=!0),Lt("default",v)};c?u.length&&!u.every(Ed)&&(d?t.onError(gt(39,u[0].loc)):i.push(A(void 0,u))):i.push(A(void 0,a))}const m=o?2:ao(e.children)?3:1;let g=Us(i.concat(Lt("_",Ve(m+"",!1))),n);return l.length&&(g=Bt(t.helper(fm),[g,wn(l)])),{slots:g,hasDynamicSlots:o}}function jl(e,t,s){const a=[Lt("name",e),Lt("fn",t)];return s!=null&&a.push(Lt("key",Ve(String(s),!0))),Us(a)}function ao(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||ao(s.children))return!0;break;case 9:if(ao(s.branches))return!0;break;case 10:case 11:if(ao(s.children))return!0;break}}return!1}const Mm=new WeakMap,c_=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?d_(e,t):`"${a}"`;const o=tt(l)&&l.callee===hd;let r,c,d=0,u,p,h,m=o||l===Gi||l===cd||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const g=Fm(e,t,void 0,i,o);r=g.props,d=g.patchFlag,p=g.dynamicPropNames;const A=g.directives;h=A&&A.length?wn(A.map(I=>p_(I,t))):void 0,g.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===To&&(m=!0,d|=1024),i&&l!==Gi&&l!==To){const{slots:A,hasDynamicSlots:I}=r_(e,t);c=A,I&&(d|=1024)}else if(e.children.length===1&&l!==Gi){const A=e.children[0],I=A.type,y=I===5||I===8;y&&Is(A,t)===0&&(d|=1),y||I===2?c=A:c=e.children}else c=e.children;p&&p.length&&(u=f_(p)),e.codegenNode=cl(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function d_(e,t,s=!1){let{tag:a}=e;const n=bc(a),i=nr(e,"is",!1,!0);if(i)if(n||kn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ve(i.value.content,!0):(o=i.exp,o||(o=Ve("is",!1,i.arg.loc))),o)return Bt(t.helper(hd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=vm(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(fd),t.components.add(a),ul(a,"component"))}function Fm(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,g=!1,A=!1,I=!1,y=!1,v=!1,b=!1;const x=[],_=R=>{c.length&&(d.push(Us(Ku(c),o)),c=[]),R&&d.push(R)},E=()=>{t.scopes.vFor>0&&c.push(Lt(Ve("ref_for",!0),Ve("true")))},C=({key:R,value:B})=>{if(Ts(R)){const S=R.content,F=An(S);if(F&&(!a||n)&&S.toLowerCase()!=="onclick"&&S!=="onUpdate:modelValue"&&!Ia(S)&&(y=!0),F&&Ia(S)&&(b=!0),F&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&Is(B,t)>0)return;S==="ref"?g=!0:S==="class"?A=!0:S==="style"?I=!0:S!=="key"&&!x.includes(S)&&x.push(S),a&&(S==="class"||S==="style")&&!x.includes(S)&&x.push(S)}else v=!0};for(let R=0;R<s.length;R++){const B=s[R];if(B.type===6){const{loc:S,name:F,nameLoc:Y,value:j}=B;let L=!0;if(F==="ref"&&(g=!0,E()),F==="is"&&(bc(l)||j&&j.content.startsWith("vue:")||kn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Lt(Ve(F,!0,Y),Ve(j?j.content:"",L,j?j.loc:S)))}else{const{name:S,arg:F,exp:Y,loc:j,modifiers:L}=B,N=S==="bind",P=S==="on";if(S==="slot"){a||t.onError(gt(40,j));continue}if(S==="once"||S==="memo"||S==="is"||N&&vn(F,"is")&&(bc(l)||kn("COMPILER_IS_ON_ELEMENT",t))||P&&i)continue;if((N&&vn(F,"key")||P&&p&&vn(F,"vue:before-update"))&&(h=!0),N&&vn(F,"ref")&&E(),!F&&(N||P)){if(v=!0,Y)if(N){if(_(),kn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Y);continue}E(),_(),d.push(Y)}else _({type:14,loc:j,callee:t.helper(_d),arguments:a?[Y]:[Y,"true"]});else t.onError(gt(N?34:35,j));continue}N&&L.some(ne=>ne.content==="prop")&&(m|=32);const ae=t.directiveTransforms[S];if(ae){const{props:ne,needRuntime:U}=ae(B,e,t);!i&&ne.forEach(C),P&&F&&!Ts(F)?_(Us(ne,o)):c.push(...ne),U&&(u.push(B),os(U)&&Mm.set(B,U))}else ag(S)||(u.push(B),p&&(h=!0))}}let w;if(d.length?(_(),d.length>1?w=Bt(t.helper(Co),d,o):w=d[0]):c.length&&(w=Us(Ku(c),o)),v?m|=16:(A&&!a&&(m|=2),I&&!a&&(m|=4),x.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(g||b||u.length>0)&&(m|=512),!t.inSSR&&w)switch(w.type){case 15:let R=-1,B=-1,S=!1;for(let j=0;j<w.properties.length;j++){const L=w.properties[j].key;Ts(L)?L.content==="class"?R=j:L.content==="style"&&(B=j):L.isHandlerKey||(S=!0)}const F=w.properties[R],Y=w.properties[B];S?w=Bt(t.helper(rl),[w]):(F&&!Ts(F.value)&&(F.value=Bt(t.helper(yd),[F.value])),Y&&(I||Y.value.type===4&&Y.value.content.trim()[0]==="["||Y.value.type===17)&&(Y.value=Bt(t.helper(xd),[Y.value])));break;case 14:break;default:w=Bt(t.helper(rl),[Bt(t.helper(Tl),[w])]);break}return{props:w,directives:u,patchFlag:m,dynamicPropNames:x,shouldUseBlock:h}}function Ku(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||An(i))&&u_(l,n):(t.set(i,n),s.push(n))}return s}function u_(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=wn([e.value,t.value],e.loc)}function p_(e,t){const s=[],a=Mm.get(e);a?s.push(t.helperString(a)):(t.helper(md),t.directives.add(e.name),s.push(ul(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,n);s.push(Us(e.modifiers.map(l=>Lt(l,i)),n))}return wn(s,e.loc)}function f_(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function bc(e){return e==="component"||e==="Component"}const h_=(e,t)=>{if(Io(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=m_(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=hi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Bt(t.helper(pm),l,a)}};function m_(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=pt(l.name),n.push(l)));else if(l.name==="bind"&&vn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=pt(l.arg.content);s=l.exp=Ve(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Ts(l.arg)&&(l.arg.content=pt(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Fm(e,t,n,!1,!1);a=i,l.length&&t.onError(gt(36,l[0].loc))}return{slotName:s,slotProps:a}}const $m=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(gt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?ei(pt(u)):`on:${u}`;o=Ve(p,!0,l.loc)}else o=Js([`${s.helperString(fc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(fc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=ym(r),p=!(u||h0(r)),h=r.content.includes(";");(p||c&&u)&&(r=Js([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Lt(o,r||Ve("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},v_=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=pt(i.content):i.content=`${s.helperString(pc)}(${i.content})`:(i.children.unshift(`${s.helperString(pc)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Ju(i,"."),a.some(o=>o.content==="attr")&&Ju(i,"^")),{props:[Lt(i,l)]}},Ju=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},g_=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Or(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(Or(r))a||(a=s[i]=Js([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Or(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Is(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Bt(t.helper(pd),o)}}}}},Zu=new WeakSet,b_=(e,t)=>{if(e.type===1&&Bs(e,"once",!0))return Zu.has(e)||t.inVOnce||t.inSSR?void 0:(Zu.add(e),t.inVOnce=!0,t.helper(Eo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Bm=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(gt(41,e.loc)),Ai();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(gt(44,a.loc)),Ai();if(o==="literal-const"||o==="setup-const")return s.onError(gt(45,a.loc)),Ai();if(!l.trim()||!ym(a))return s.onError(gt(42,a.loc)),Ai();const r=n||Ve("modelValue",!0),c=n?Ts(n)?`onUpdate:${pt(n.content)}`:Js(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Js([`${u} => ((`,a,") = $event)"]);const p=[Lt(r,e.exp),Lt(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(g=>g.content).map(g=>(Cd(g)?g:JSON.stringify(g))+": true").join(", "),m=n?Ts(n)?`${n.content}Modifiers`:Js([n,' + "Modifiers"']):"modelModifiers";p.push(Lt(m,Ve(`{ ${h} }`,!1,e.loc,2)))}return Ai(p)};function Ai(e=[]){return{props:e}}const y_=/[\w).+\-_$\]]/,x_=(e,t)=>{kn("COMPILER_FILTERS",t)&&(e.type===5?Lo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Lo(s.exp,t)}))};function Lo(e,t){if(e.type===4)Yu(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?Yu(a,t):a.type===8?Lo(e,t):a.type===5&&Lo(a.content,t))}}function Yu(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,g=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):A();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let I=h-1,y;for(;I>=0&&(y=s.charAt(I),y===" ");I--);(!y||!y_.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&A();function A(){g.push(s.slice(d,h).trim()),d=h+1}if(g.length){for(h=0;h<g.length;h++)m=__(m,g[h],t);e.content=m,e.ast=void 0}}function __(e,t,s){s.helper(vd);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${ul(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${ul(n,"filter")}(${e}${i!==")"?","+i:i}`}}const Qu=new WeakSet,w_=(e,t)=>{if(e.type===1){const s=Bs(e,"memo");return!s||Qu.has(e)||t.inSSR?void 0:(Qu.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&Sd(a,t),e.codegenNode=Bt(t.helper(kd),[s.exp,hi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},k_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(gt(53,a.loc)),s.exp=Ve("",!0,a.loc);else{const n=pt(a.content);(gm.test(n[0])||n[0]==="-")&&(s.exp=Ve(n,!1,a.loc))}}}};function S_(e){return[[k_,b_,e_,w_,a_,x_,h_,c_,l_,g_],{on:$m,bind:v_,model:Bm}]}function T_(e,t={}){const s=t.onError||Td,a=t.mode==="module";t.prefixIdentifiers===!0?s(gt(48)):a&&s(gt(49));const n=!1;t.cacheHandlers&&s(gt(50)),t.scopeId&&!a&&s(gt(51));const i=We({},t,{prefixIdentifiers:n}),l=Be(e)?O0(e,i):e,[o,r]=S_();return P0(l,We({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:We({},r,t.directiveTransforms||{})})),B0(l,i)}const C_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Um=Symbol(""),Hm=Symbol(""),zm=Symbol(""),jm=Symbol(""),yc=Symbol(""),Vm=Symbol(""),qm=Symbol(""),Gm=Symbol(""),Wm=Symbol(""),Km=Symbol("");a0({[Um]:"vModelRadio",[Hm]:"vModelCheckbox",[zm]:"vModelText",[jm]:"vModelSelect",[yc]:"vModelDynamic",[Vm]:"withModifiers",[qm]:"withKeys",[Gm]:"vShow",[Wm]:"Transition",[Km]:"TransitionGroup"});let Hn;function E_(e,t=!1){return Hn||(Hn=document.createElement("div")),t?(Hn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Hn.children[0].getAttribute("foo")):(Hn.innerHTML=e,Hn.textContent)}const A_={parseMode:"html",isVoidTag:xg,isNativeTag:e=>gg(e)||bg(e)||yg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:E_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Wm;if(e==="TransitionGroup"||e==="transition-group")return Km},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},R_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:I_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},I_=(e,t)=>{const s=of(e);return Ve(JSON.stringify(s),!1,t,3)};function tn(e,t){return gt(e,t)}const O_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(54,n)),t.children.length&&(s.onError(tn(55,n)),t.children.length=0),{props:[Lt(Ve("innerHTML",!0,n),a||Ve("",!0))]}},L_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(56,n)),t.children.length&&(s.onError(tn(57,n)),t.children.length=0),{props:[Lt(Ve("textContent",!0),a?Is(a,s)>0?a:Bt(s.helperString(ar),[a],n):Ve("",!0))]}},N_=(e,t,s)=>{const a=Bm(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(tn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=zm,o=!1;if(n==="input"||i){const r=nr(t,"type");if(r){if(r.type===7)l=yc;else if(r.value)switch(r.value.content){case"radio":l=Um;break;case"checkbox":l=Hm;break;case"file":o=!0,s.onError(tn(60,e.loc));break}}else m0(t)&&(l=yc)}else n==="select"&&(l=jm);o||(a.needRuntime=s.helper(l))}else s.onError(tn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},D_=Ls("passive,once,capture"),P_=Ls("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),M_=Ls("left,right"),Jm=Ls("onkeyup,onkeydown,onkeypress"),F_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&dl("COMPILER_V_ON_NATIVE",s)||D_(r)?l.push(r):M_(r)?Ts(e)?Jm(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):P_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},Xu=(e,t)=>Ts(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Js(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,$_=(e,t,s)=>$m(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=F_(i,n,s,e.loc);if(r.includes("right")&&(i=Xu(i,"onContextmenu")),r.includes("middle")&&(i=Xu(i,"onMouseup")),r.length&&(l=Bt(s.helper(Vm),[l,JSON.stringify(r)])),o.length&&(!Ts(i)||Jm(i.content.toLowerCase()))&&(l=Bt(s.helper(qm),[l,JSON.stringify(o)])),c.length){const d=c.map(In).join("");i=Ts(i)?Ve(`${i.content}${d}`,!0):Js(["(",i,`) + "${d}"`])}return{props:[Lt(i,l)]}}),B_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(62,n)),{props:[],needRuntime:s.helper(Gm)}},U_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},H_=[R_],z_={cloak:C_,html:O_,text:L_,model:N_,on:$_,show:B_};function j_(e,t={}){return T_(e,We({},A_,t,{nodeTransforms:[U_,...H_,...t.nodeTransforms||[]],directiveTransforms:We({},z_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ep=Object.create(null);function V_(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Qt;const s=lg(e,t),a=ep[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=We({hoistStatic:!0,onError:void 0,onWarn:Qt},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=j_(e,n),l=new Function("Vue",i)(Yx);return l._rc=!0,ep[s]=l}Lh(V_);const No=an({items:[]});let q_=1;function or(e,t="info",s=3e3){const a=q_++;return No.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>Id(a),s),a}function Id(e){const t=No.items.findIndex(s=>s.id===e);t>=0&&No.items.splice(t,1)}function ke(e,t="info",s=3e3){return or(e,t,s)}ke.success=(e,t=3e3)=>or(e,"success",t);ke.error=(e,t=5e3)=>or(e,"error",t);ke.info=(e,t=3e3)=>or(e,"info",t);ke.dismiss=Id;const G_={setup(){return{state:No,dismiss:Id}},template:`
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
  `},Sa=an({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let li=null;function qt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return li&&li(!1),Sa.title=e,Sa.message=t,Sa.confirmLabel=s,Sa.cancelLabel=a,Sa.danger=n,Sa.open=!0,new Promise(i=>{li=i})}function tp(e){Sa.open=!1,li&&(li(e),li=null)}const W_={setup(){function e(t){Sa.open&&t.key==="Escape"&&(t.stopPropagation(),tp(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),ut(()=>document.removeEventListener("keydown",e,!0)),{state:Sa,settle:tp}},template:`
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
 */const Wn=typeof document<"u";function Zm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function K_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Zm(e.default)}const ct=Object.assign;function Nr(e,t){const s={};for(const a in t){const n=t[a];s[a]=Ys(n)?n.map(e):e(n)}return s}const Wi=()=>{},Ys=Array.isArray;function sp(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Ym=/#/g,J_=/&/g,Z_=/\//g,Y_=/=/g,Q_=/\?/g,Qm=/\+/g,X_=/%5B/g,ew=/%5D/g,Xm=/%5E/g,tw=/%60/g,ev=/%7B/g,sw=/%7C/g,tv=/%7D/g,aw=/%20/g;function Od(e){return e==null?"":encodeURI(""+e).replace(sw,"|").replace(X_,"[").replace(ew,"]")}function nw(e){return Od(e).replace(ev,"{").replace(tv,"}").replace(Xm,"^")}function xc(e){return Od(e).replace(Qm,"%2B").replace(aw,"+").replace(Ym,"%23").replace(J_,"%26").replace(tw,"`").replace(ev,"{").replace(tv,"}").replace(Xm,"^")}function iw(e){return xc(e).replace(Y_,"%3D")}function lw(e){return Od(e).replace(Ym,"%23").replace(Q_,"%3F")}function ow(e){return lw(e).replace(Z_,"%2F")}function fl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const rw=/\/$/,cw=e=>e.replace(rw,"");function Dr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=fw(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:fl(l)}}function dw(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ap(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function uw(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&gi(t.matched[a],s.matched[n])&&sv(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function gi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function sv(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!pw(e[s],t[s]))return!1;return!0}function pw(e,t){return Ys(e)?np(e,t):Ys(t)?np(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function np(e,t){return Ys(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function fw(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const Ga={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let _c=(function(e){return e.pop="pop",e.push="push",e})({}),Pr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function hw(e){if(!e)if(Wn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),cw(e)}const mw=/^[^#]+#/;function vw(e,t){return e.replace(mw,"#")+t}function gw(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const rr=()=>({left:window.scrollX,top:window.scrollY});function bw(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=gw(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function ip(e,t){return(history.state?history.state.position-t:-1)+e}const wc=new Map;function yw(e,t){wc.set(e,t)}function xw(e){const t=wc.get(e);return wc.delete(e),t}function _w(e){return typeof e=="string"||e&&typeof e=="object"}function av(e){return typeof e=="string"||typeof e=="symbol"}let Tt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const nv=Symbol("");Tt.MATCHER_NOT_FOUND+"",Tt.NAVIGATION_GUARD_REDIRECT+"",Tt.NAVIGATION_ABORTED+"",Tt.NAVIGATION_CANCELLED+"",Tt.NAVIGATION_DUPLICATED+"";function bi(e,t){return ct(new Error,{type:e,[nv]:!0},t)}function ya(e,t){return e instanceof Error&&nv in e&&(t==null||!!(e.type&t))}const ww=["params","query","hash"];function kw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of ww)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Sw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Qm," "),i=n.indexOf("="),l=fl(i<0?n:n.slice(0,i)),o=i<0?null:fl(n.slice(i+1));if(l in t){let r=t[l];Ys(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function lp(e){let t="";for(let s in e){const a=e[s];if(s=iw(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ys(a)?a.map(n=>n&&xc(n)):[a&&xc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function Tw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=Ys(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const Cw=Symbol(""),op=Symbol(""),cr=Symbol(""),Ld=Symbol(""),kc=Symbol("");function Ri(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Qa(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(bi(Tt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):_w(p)?r(bi(Tt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Mr(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Zm(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Qa(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=K_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Qa(p,s,a,l,o,n)()}))}}return i}function Ew(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>gi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>gi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let Aw=()=>location.protocol+"//"+location.host;function iv(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),ap(o,"")}return ap(s,e)+a+n}function Rw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const h=iv(e,location),m=s.value,g=t.value;let A=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}A=g?p.position-g.position:0}else a(h);n.forEach(I=>{I(s.value,m,{delta:A,type:_c.pop,direction:A?A>0?Pr.forward:Pr.back:Pr.unknown})})};function r(){l=s.value}function c(p){n.push(p);const h=()=>{const m=n.indexOf(p);m>-1&&n.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ct({},p.state,{scroll:rr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function rp(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?rr():null}}function Iw(e){const{history:t,location:s}=window,a={value:iv(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:Aw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ct({},t.state,rp(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=ct({},n.value,t.state,{forward:r,scroll:rr()});i(d.current,d,!0),i(r,ct({},rp(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function Ow(e){e=hw(e);const t=Iw(e),s=Rw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=ct({location:"",base:e,go:a,createHref:vw.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function Lw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),Ow(e)}let bn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ft=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ft||{});const Nw={type:bn.Static,value:""},Dw=/[a-zA-Z0-9_]/;function Pw(e){if(!e)return[[]];if(e==="/")return[[Nw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Ft.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Ft.Static?i.push({type:bn.Static,value:c}):s===Ft.Param||s===Ft.ParamRegExp||s===Ft.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:bn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Ft.ParamRegExp){a=s,s=Ft.EscapeNext;continue}switch(s){case Ft.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Ft.Param):p();break;case Ft.EscapeNext:p(),s=a;break;case Ft.Param:r==="("?s=Ft.ParamRegExp:Dw.test(r)?p():(u(),s=Ft.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Ft.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Ft.ParamRegExpEnd:d+=r;break;case Ft.ParamRegExpEnd:u(),s=Ft.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Ft.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const cp="[^/]+?",Mw={sensitive:!1,strict:!1,start:!0,end:!0};var us=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(us||{});const Fw=/[.+*?^${}()[\]/\\]/g;function $w(e,t){const s=ct({},Mw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[us.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=us.Segment+(s.sensitive?us.BonusCaseSensitive:0);if(p.type===bn.Static)u||(n+="/"),n+=p.value.replace(Fw,"\\$&"),h+=us.Static;else if(p.type===bn.Param){const{value:m,repeatable:g,optional:A,regexp:I}=p;i.push({name:m,repeatable:g,optional:A});const y=I||cp;if(y!==cp){h+=us.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let v=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(v=A&&c.length<2?`(?:/${v})`:"/"+v),A&&(v+="?"),n+=v,h+=us.Dynamic,A&&(h+=us.BonusOptional),g&&(h+=us.BonusRepeatable),y===".*"&&(h+=us.BonusWildcard)}d.push(h)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=us.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===bn.Static)d+=h.value;else if(h.type===bn.Param){const{value:m,repeatable:g,optional:A}=h,I=m in c?c[m]:"";if(Ys(I)&&!g)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Ys(I)?I.join("/"):I;if(!y)if(A)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function Bw(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===us.Static+us.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===us.Static+us.Segment?1:-1:0}function lv(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=Bw(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(dp(a))return 1;if(dp(n))return-1}return n.length-a.length}function dp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const Uw={strict:!1,end:!0,sensitive:!1};function Hw(e,t,s){const a=$w(Pw(e.path),s),n=ct(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function zw(e,t){const s=[],a=new Map;t=sp(Uw,t);function n(u){return a.get(u)}function i(u,p,h){const m=!h,g=pp(u);g.aliasOf=h&&h.record;const A=sp(t,u),I=[g];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const x of b)I.push(pp(ct({},g,{components:h?h.record.components:g.components,path:x,aliasOf:h?h.record:g})))}let y,v;for(const b of I){const{path:x}=b;if(p&&x[0]!=="/"){const _=p.record.path,E=_[_.length-1]==="/"?"":"/";b.path=p.record.path+(x&&E+x)}if(y=Hw(b,p,A),h?h.alias.push(y):(v=v||y,v!==y&&v.alias.push(y),m&&u.name&&!fp(y)&&l(u.name)),ov(y)&&r(y),g.children){const _=g.children;for(let E=0;E<_.length;E++)i(_[E],y,h&&h.children[E])}h=h||y}return v?()=>{l(v)}:Wi}function l(u){if(av(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=qw(u,s);s.splice(p,0,u),u.record.name&&!fp(u)&&a.set(u.record.name,u)}function c(u,p){let h,m={},g,A;if("name"in u&&u.name){if(h=a.get(u.name),!h)throw bi(Tt.MATCHER_NOT_FOUND,{location:u});A=h.record.name,m=ct(up(p.params,h.keys.filter(v=>!v.optional).concat(h.parent?h.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),u.params&&up(u.params,h.keys.map(v=>v.name))),g=h.stringify(m)}else if(u.path!=null)g=u.path,h=s.find(v=>v.re.test(g)),h&&(m=h.parse(g),A=h.record.name);else{if(h=p.name?a.get(p.name):s.find(v=>v.re.test(p.path)),!h)throw bi(Tt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});A=h.record.name,m=ct({},p.params,u.params),g=h.stringify(m)}const I=[];let y=h;for(;y;)I.unshift(y.record),y=y.parent;return{name:A,path:g,params:m,matched:I,meta:Vw(I)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function up(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function pp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:jw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function jw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function fp(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Vw(e){return e.reduce((t,s)=>ct(t,s.meta),{})}function qw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;lv(e,t[i])<0?a=i:s=i+1}const n=Gw(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Gw(e){let t=e;for(;t=t.parent;)if(ov(t)&&lv(e,t)===0)return t}function ov({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function hp(e){const t=Hs(cr),s=Hs(Ld),a=V(()=>{const r=ca(e.to);return t.resolve(r)}),n=V(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(gi.bind(null,d));if(p>-1)return p;const h=mp(r[c-2]);return c>1&&mp(d)===h&&u[u.length-1].path!==h?u.findIndex(gi.bind(null,r[c-2])):p}),i=V(()=>n.value>-1&&Yw(s.params,a.value.params)),l=V(()=>n.value>-1&&n.value===s.matched.length-1&&sv(s.params,a.value.params));function o(r={}){if(Zw(r)){const c=t[ca(e.replace)?"replace":"push"](ca(e.to)).catch(Wi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:V(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Ww(e){return e.length===1?e[0]:e}const Kw=_l({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:hp,setup(e,{slots:t}){const s=an(hp(e)),{options:a}=Hs(cr),n=V(()=>({[vp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[vp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Ww(t.default(s));return e.custom?i:di("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Jw=Kw;function Zw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Yw(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!Ys(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function mp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const vp=(e,t,s)=>e??t??s,Qw=_l({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Hs(kc),n=V(()=>e.route||a.value),i=Hs(op,0),l=V(()=>{let c=ca(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=V(()=>n.value.matched[l.value]);zi(op,V(()=>l.value+1)),zi(Cw,o),zi(kc,n);const r=f();return Dt(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!gi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return gp(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,A=di(p,ct({},m,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return gp(s.default,{Component:A,route:c})||A}}});function gp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Xw=Qw;function ek(e){const t=zw(e.routes,e),s=e.parseQuery||Sw,a=e.stringifyQuery||lp,n=e.history,i=Ri(),l=Ri(),o=Ri(),r=zc(Ga);let c=Ga;Wn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Nr.bind(null,W=>""+W),u=Nr.bind(null,ow),p=Nr.bind(null,fl);function h(W,pe){let ge,ye;return av(W)?(ge=t.getRecordMatcher(W),ye=pe):ye=W,t.addRoute(ye,ge)}function m(W){const pe=t.getRecordMatcher(W);pe&&t.removeRoute(pe)}function g(){return t.getRoutes().map(W=>W.record)}function A(W){return!!t.getRecordMatcher(W)}function I(W,pe){if(pe=ct({},pe||r.value),typeof W=="string"){const M=Dr(s,W,pe.path),q=t.resolve({path:M.path},pe),re=n.createHref(M.fullPath);return ct(M,q,{params:p(q.params),hash:fl(M.hash),redirectedFrom:void 0,href:re})}let ge;if(W.path!=null)ge=ct({},W,{path:Dr(s,W.path,pe.path).path});else{const M=ct({},W.params);for(const q in M)M[q]==null&&delete M[q];ge=ct({},W,{params:u(M)}),pe.params=u(pe.params)}const ye=t.resolve(ge,pe),_e=W.hash||"";ye.params=d(p(ye.params));const Ne=dw(a,ct({},W,{hash:nw(_e),path:ye.path})),T=n.createHref(Ne);return ct({fullPath:Ne,hash:_e,query:a===lp?Tw(W.query):W.query||{}},ye,{redirectedFrom:void 0,href:T})}function y(W){return typeof W=="string"?Dr(s,W,r.value.path):ct({},W)}function v(W,pe){if(c!==W)return bi(Tt.NAVIGATION_CANCELLED,{from:pe,to:W})}function b(W){return E(W)}function x(W){return b(ct(y(W),{replace:!0}))}function _(W,pe){const ge=W.matched[W.matched.length-1];if(ge&&ge.redirect){const{redirect:ye}=ge;let _e=typeof ye=="function"?ye(W,pe):ye;return typeof _e=="string"&&(_e=_e.includes("?")||_e.includes("#")?_e=y(_e):{path:_e},_e.params={}),ct({query:W.query,hash:W.hash,params:_e.path!=null?{}:W.params},_e)}}function E(W,pe){const ge=c=I(W),ye=r.value,_e=W.state,Ne=W.force,T=W.replace===!0,M=_(ge,ye);if(M)return E(ct(y(M),{state:typeof M=="object"?ct({},_e,M.state):_e,force:Ne,replace:T}),pe||ge);const q=ge;q.redirectedFrom=pe;let re;return!Ne&&uw(a,ye,ge)&&(re=bi(Tt.NAVIGATION_DUPLICATED,{to:q,from:ye}),U(ye,ye,!0,!1)),(re?Promise.resolve(re):R(q,ye)).catch($=>ya($)?ya($,Tt.NAVIGATION_GUARD_REDIRECT)?$:ne($):P($,q,ye)).then($=>{if($){if(ya($,Tt.NAVIGATION_GUARD_REDIRECT))return E(ct({replace:T},y($.to),{state:typeof $.to=="object"?ct({},_e,$.to.state):_e,force:Ne}),pe||q)}else $=S(q,ye,!0,T,_e);return B(q,ye,$),$})}function C(W,pe){const ge=v(W,pe);return ge?Promise.reject(ge):Promise.resolve()}function w(W){const pe=K.values().next().value;return pe&&typeof pe.runWithContext=="function"?pe.runWithContext(W):W()}function R(W,pe){let ge;const[ye,_e,Ne]=Ew(W,pe);ge=Mr(ye.reverse(),"beforeRouteLeave",W,pe);for(const M of ye)M.leaveGuards.forEach(q=>{ge.push(Qa(q,W,pe))});const T=C.bind(null,W,pe);return ge.push(T),de(ge).then(()=>{ge=[];for(const M of i.list())ge.push(Qa(M,W,pe));return ge.push(T),de(ge)}).then(()=>{ge=Mr(_e,"beforeRouteUpdate",W,pe);for(const M of _e)M.updateGuards.forEach(q=>{ge.push(Qa(q,W,pe))});return ge.push(T),de(ge)}).then(()=>{ge=[];for(const M of Ne)if(M.beforeEnter)if(Ys(M.beforeEnter))for(const q of M.beforeEnter)ge.push(Qa(q,W,pe));else ge.push(Qa(M.beforeEnter,W,pe));return ge.push(T),de(ge)}).then(()=>(W.matched.forEach(M=>M.enterCallbacks={}),ge=Mr(Ne,"beforeRouteEnter",W,pe,w),ge.push(T),de(ge))).then(()=>{ge=[];for(const M of l.list())ge.push(Qa(M,W,pe));return ge.push(T),de(ge)}).catch(M=>ya(M,Tt.NAVIGATION_CANCELLED)?M:Promise.reject(M))}function B(W,pe,ge){o.list().forEach(ye=>w(()=>ye(W,pe,ge)))}function S(W,pe,ge,ye,_e){const Ne=v(W,pe);if(Ne)return Ne;const T=pe===Ga,M=Wn?history.state:{};ge&&(ye||T?n.replace(W.fullPath,ct({scroll:T&&M&&M.scroll},_e)):n.push(W.fullPath,_e)),r.value=W,U(W,pe,ge,T),ne()}let F;function Y(){F||(F=n.listen((W,pe,ge)=>{if(!me.listening)return;const ye=I(W),_e=_(ye,me.currentRoute.value);if(_e){E(ct(_e,{replace:!0,force:!0}),ye).catch(Wi);return}c=ye;const Ne=r.value;Wn&&yw(ip(Ne.fullPath,ge.delta),rr()),R(ye,Ne).catch(T=>ya(T,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_CANCELLED)?T:ya(T,Tt.NAVIGATION_GUARD_REDIRECT)?(E(ct(y(T.to),{force:!0}),ye).then(M=>{ya(M,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&!ge.delta&&ge.type===_c.pop&&n.go(-1,!1)}).catch(Wi),Promise.reject()):(ge.delta&&n.go(-ge.delta,!1),P(T,ye,Ne))).then(T=>{T=T||S(ye,Ne,!1),T&&(ge.delta&&!ya(T,Tt.NAVIGATION_CANCELLED)?n.go(-ge.delta,!1):ge.type===_c.pop&&ya(T,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),B(ye,Ne,T)}).catch(Wi)}))}let j=Ri(),L=Ri(),N;function P(W,pe,ge){ne(W);const ye=L.list();return ye.length?ye.forEach(_e=>_e(W,pe,ge)):console.error(W),Promise.reject(W)}function ae(){return N&&r.value!==Ga?Promise.resolve():new Promise((W,pe)=>{j.add([W,pe])})}function ne(W){return N||(N=!W,Y(),j.list().forEach(([pe,ge])=>W?ge(W):pe()),j.reset()),W}function U(W,pe,ge,ye){const{scrollBehavior:_e}=e;if(!Wn||!_e)return Promise.resolve();const Ne=!ge&&xw(ip(W.fullPath,0))||(ye||!ge)&&history.state&&history.state.scroll||null;return At().then(()=>_e(W,pe,Ne)).then(T=>T&&bw(T)).catch(T=>P(T,W,pe))}const J=W=>n.go(W);let ie;const K=new Set,me={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:A,getRoutes:g,resolve:I,options:e,push:b,replace:x,go:J,back:()=>J(-1),forward:()=>J(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:L.add,isReady:ae,install(W){W.component("RouterLink",Jw),W.component("RouterView",Xw),W.config.globalProperties.$router=me,Object.defineProperty(W.config.globalProperties,"$route",{enumerable:!0,get:()=>ca(r)}),Wn&&!ie&&r.value===Ga&&(ie=!0,b(n.location).catch(ye=>{}));const pe={};for(const ye in Ga)Object.defineProperty(pe,ye,{get:()=>r.value[ye],enumerable:!0});W.provide(cr,me),W.provide(Ld,Hc(pe)),W.provide(kc,r);const ge=W.unmount;K.add(W),W.unmount=function(){K.delete(W),K.size<1&&(c=Ga,F&&F(),F=null,r.value=Ga,ie=!1,N=!1),ge()}}};function de(W){return W.reduce((pe,ge)=>pe.then(()=>w(ge)),Promise.resolve())}return me}function rv(){return Hs(cr)}function tk(e){return Hs(Ld)}const dr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=tk(),s=rv(),a=V({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Dt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},hl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),pa=e=>Number.isSafeInteger(e)&&e>=0,sk=e=>e===null||typeof e=="string",Do=(e,t)=>pa(e)&&pa(t)&&t>=e,Nd=e=>hl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&sk(e.cursor);function ak(e){return!Nd(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!pa(e.total_chars)||!pa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Do(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&Do(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function bp(e){return Nd(e)&&e.kind==="process_output"&&pa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>pa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Do(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function nk(e){return Nd(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>pa(e[t]))&&Do(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&pa(e.tools_omitted)}function Sc(e){try{return JSON.parse(e)}catch{return}}const Tc=e=>JSON.stringify(e,null,2),ik=e=>{const t=Sc(e);return t===void 0?e:Tc(t)},Vl=(e,t,s)=>`[${e}, ${t}) ${s}`;function cv(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:Tc(e)??"";let a=typeof e=="string"?Sc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=Sc(e.slice(d+c.length)),h=e.slice(0,u);bp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?ik(d):d});if(hl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||pa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...pa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],hl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(ak(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Vl(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Vl(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(bp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Vl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(nk(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Vl(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?Tc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function dv(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Fr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),lk=e=>e!==null&&typeof e=="object",ok=new Set(["_hmac","_prev_hmac"]),Cc=e=>e.replace(/\r\n?/g,`
`);function ml(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(ok.has(n)){s=!0;return}return i});return Cc(s?JSON.stringify(a):t)}catch{return Cc(t)}}function rk(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&lk(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function ck(e){var h;const t=cv(typeof e=="string"?Cc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:ml(m.text)})),a=s.map(m=>m.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Fr.inlineChars||o&&n.length>0,c=s.filter(m=>m.text).map(m=>{let g=m.text;try{g=JSON.stringify(JSON.parse(g),null,2)}catch{}return m.label?`${m.label}
${g}`:g}).join(`

`).replace(/\n$/,""),d=dv(c,Fr.previewLines,Fr.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:rk(t)}}const dk={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=V(()=>ck(e.value)),c=V(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=V(()=>a.value?c.value:r.value.formatted),u=V(()=>r.value.promoted&&r.value.preview.folded||o.value),p=V(()=>t.value?!!d.value:r.value.promoted),h=V(()=>p.value?"":r.value.summary);let m;function g(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function A(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));g()}function I(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function v(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return Dt([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,x)=>{(e.recordId===null||b[2]!==x[2])&&(t.value=!1,a.value=!1),n.value=""}),Dt([i,l,t,s,r],()=>At(A),{flush:"post"}),Ge(()=>{m=new ResizeObserver(g),A()}),ut(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:I,toggleRaw:y,copyOutput:v}},template:`
    <section class="output-renderer output-compact" :class="{ 'output-compact-expanded': expanded }" :aria-label="label">
      <div class="output-event-row">
        <div class="output-event-heading">
          <slot name="header" />
          <div class="output-compact-actions" @pointerdown.stop @keydown.stop>
            <div v-if="model.chars > 0" class="output-controls">
              <button type="button" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
              <button type="button" :aria-pressed="rawMode" @click="toggleRaw" title="Inspect raw retained record">Raw</button>
              <button type="button" @click="copyOutput" :title="rawMode ? 'Copy raw retained record' : 'Copy complete display body'">Copy</button>
            </div>
            <button type="button" class="output-expand" :aria-expanded="expanded" @click="toggleExpanded"
                    :title="canExpand ? 'More received text hidden locally — expand without retrieving' : 'Inspect already-loaded record'">
              {{ expanded ? 'Collapse' : model.promoted ? 'Expand' : 'Inspect' }}
            </button>
          </div>
          <span v-if="headerSummary.trim() || model.outcome || hasContext || model.warnings.length" class="output-control-separator output-summary-separator" aria-hidden="true"> — </span>
        </div>
        <button v-if="model.warnings.length" type="button" class="output-compact-warning" @click="expanded = true"
                @pointerdown.stop @keydown.stop :aria-label="model.warnings.join('; ') + ' — inspect record'" :title="model.warnings.join('; ')">
          <span class="output-warning-full">{{ model.warnings.join('; ') }}</span><span class="output-warning-short" aria-hidden="true">Warning</span>
        </button>
        <span ref="summaryElement" class="output-inline-summary">
          <slot name="context" />
          <span v-if="model.outcome" class="output-compact-outcome" :title="model.outcome">{{ model.outcome }}</span>
          {{ headerSummary }}
        </span>
      </div>
      <pre v-if="showBody" ref="previewElement" class="output-body output-compact-preview"
           :class="{ 'output-wrapped': wrapped, 'output-compact-folded': !expanded }">{{ expanded ? body : model.preview.text }}</pre>
      <div v-if="expanded && !rawMode" class="output-compact-detail">
        <div v-if="model.warnings.length" class="output-compact-warning-detail">{{ model.warnings.join('; ') }}</div>
        <div v-if="model.header.length" class="output-compact-envelope-detail">{{ model.header.join(' · ') }}</div>
        <slot name="details" />
      </div>
      <span v-if="copyStatus" class="output-copy-status" role="status">{{ copyStatus }}</span>
    </section>`},ur={name:"ToolOutput",components:{CompactOutput:dk},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=V(()=>cv(e.value)),l=V(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=V(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=dv(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=V(()=>o.value.some(u=>u.folded)),c=V(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Dt(()=>e.value,()=>{t.value=!1,n.value=""}),Dt(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
    <compact-output v-if="presentation === 'compact'" :value="value" :raw-value="rawValue" :label="label" :has-context="hasContext" :record-id="recordId">
      <template #header><slot name="header" /></template>
      <template #context><slot name="context" /></template>
      <template #details><slot name="details" /></template>
    </compact-output>
    <section v-else class="output-renderer" :aria-label="label">
      <div class="output-summary">
        <strong>{{ model.kind }}</strong>
        <span v-for="(item, index) in model.header" :key="index">{{ item }}</span>
      </div>
      <div class="output-controls">
        <button type="button" class="btn btn-ghost" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
        <button type="button" class="btn btn-ghost" :aria-pressed="rawMode" @click="rawMode = !rawMode">Raw</button>
        <button type="button" class="btn btn-ghost" @click="copyOutput" :title="rawMode ? 'Copy exact received value, including locally folded text' : 'Copy formatted body, including locally folded text'">Copy</button>
        <span role="status">{{ copyStatus }}</span>
      </div>
      <div v-for="(section, index) in foldedSections" :key="index" class="output-section">
        <div v-if="section.label" class="output-section-label">{{ section.label }}</div>
        <pre class="output-body" :class="{ 'output-wrapped': wrapped }">{{ section.display }}</pre>
        <span v-if="section.folded && !expanded" class="output-fold-note">More received text hidden locally.</span>
      </div>
      <button v-if="canExpand" type="button" class="btn btn-ghost output-expand" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? 'Collapse' : 'Expand received text' }}
      </button>
    </section>
  `},uk={components:{ToolOutput:ur},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var g,A,I,y,v,b,x,_,E,C,w;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(g=h.metadata)!=null&&g.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(A=h.metadata)!=null&&A.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const R=h.call_id||((I=h.metadata)==null?void 0:I.call_id)||null,B=h.agent_id||((y=h.metadata)==null?void 0:y.agent_id)||"",S={callId:R,agentId:B,agentLabel:h.agent_label||((v=h.metadata)==null?void 0:v.agent_label)||"",toolInput:h.tool_input,id:R?`${B}:${R}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((b=h.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(m==="tool_end"||m==="loop_tool"){const R=h.call_id||((x=h.metadata)==null?void 0:x.call_id)||null,B=h.agent_id||((_=h.metadata)==null?void 0:_.agent_id)||"";let S=-1;if(R&&(S=e.value.findIndex(F=>F.callId===R&&F.agentId===B&&F.status==="running")),S<0&&!R)for(let F=e.value.length-1;F>=0;F--){const Y=e.value[F];if(Y.tool===h.action&&Y.agentId===B&&Y.status==="running"){S=F;break}}if(S>=0){const F=e.value[S];F.status=h.error||(E=h.metadata)!=null&&E.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((C=h.metadata)==null?void 0:C.status))?"error":"success",F.elapsed=h.execution_time_ms??h.duration_ms??((w=h.metadata)==null?void 0:w.elapsed_ms)??Date.now()-F.startTime,F.result=h.result_summary??h.detail??"",F.fadingOut=!0,setTimeout(()=>{const Y=e.value.indexOf(F);Y>=0&&e.value.splice(Y,1),t.value.unshift(F),t.value.length>a&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const R=h.call_id||h.tool_name||"unknown";if(h.finished){const B={...s.value};delete B[R],s.value=B}else{const S=((s.value[R]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[R]:S.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,Xe.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Xe.off("events",n),i&&(clearInterval(i),i=null))}Ge(r),Xt(r),Ut(c),ut(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
              <span v-if="task.agentId" class="text-gray-400 text-xs">agent {{ task.agentLabel || task.agentId }}</span>
            </div>
            <span :class="task.fadingOut ? 'text-gray-400' : 'text-blue-400'" class="font-mono text-sm">{{ formatMs(task.elapsed) }}</span>
          </div>
          <!-- Streaming output for this tool -->
          <details v-if="task.toolInput"><summary class="text-xs text-gray-400">Arguments</summary><tool-output :value="task.toolInput" label="Tool arguments" /></details>
          <tool-output v-if="streamOutput[task.callId || task.tool]" :value="streamOutput[task.callId || task.tool]" label="Streaming tool output" />
          <tool-output v-if="task.result" :value="task.result" label="Tool result" />
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
          <tool-output :value="output" label="Live tool output" />
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
             class="flex flex-wrap items-center gap-3 py-2 border-b border-gray-700/50 last:border-0">
          <span class="text-lg"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
          <span class="text-white font-mono text-sm flex-1">{{ task.tool }}</span>
          <span v-if="task.agentId" class="text-gray-400 text-xs">agent {{ task.agentLabel || task.agentId }}</span>
          <span class="text-gray-500 font-mono text-xs whitespace-nowrap">{{ formatMs(task.elapsed) }}</span>
          <details v-if="task.toolInput" class="w-full"><summary class="text-xs text-gray-400">Arguments</summary><tool-output :value="task.toolInput" label="Recent tool arguments" /></details>
          <tool-output class="w-full" :value="task.result" label="Recent tool result" />
        </div>
      </div>
    </div>
  `};function Dd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ln(e){const t=Dd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function pk(e){const t=Dd(e);return t?t.toLocaleTimeString():"—"}function uv(e){const t=Dd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function fk(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function yi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Pd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function pv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function yp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Md(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function fv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const hv=Symbol("agent-detail-cancelled"),hk=15e3;function mk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&n(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,hv),i==null||i.abort()}}}function mv({state:e,requestDetail:t,timeoutMs:s=hk,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const g={agentId:p,cancel:null,promise:null};l=g,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const A=mk(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return g.cancel=A.cancel,g.promise=(async()=>{let I=null,y=null;try{I=await A.promise}catch(v){y=v}I!==hv&&(l!==g||e.detailId!==p||(l=null,!y&&(I===null||typeof I!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function vk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const gk={components:{ToolOutput:ur},template:`
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
                <span class="ag-detail-meta-label">Activity</span>
                <span class="ag-detail-meta-value">{{ detail.activity || 'Not recorded' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Tool executions</span>
                <span class="ag-detail-meta-value">{{ detail.tool_execution_count ?? 'Not recorded' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Parent inbox</span>
                <span class="ag-detail-meta-value">{{ detail.pending_inbox_count ?? '—' }} queued; consumed sequence {{ detail.last_consumed_sequence ?? '—' }}</span>
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
              <tool-output :value="detail.result" label="Agent result" />
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
              <tool-output :value="detail.error" label="Agent error" />
            </div>
          </template>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=V(()=>e.value.filter(P=>P.status==="running").length),r=V(()=>e.value.filter(P=>P.status==="completed").length),c=V(()=>e.value.filter(P=>["failed","timeout","killed"].includes(P.status)).length),d=V(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=V(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(P=>["failed","timeout","killed"].includes(P.status)):e.value.filter(P=>P.status===i.value));function p(P){const ae=Number(P.max_iterations)||0;return ae<=0?0:Math.min(100,Math.round(P.iteration_count/ae*100))}function h(P){return(Number(P.max_iterations)||0)>0}function m(P,ae){return P?P==="N/A"?"N/A":ae==="current_inheritance"?`inherit (currently ${P})`:P:"unknown"}function g(P){return m(P.display_model,P.display_model_source||P.display_source)}function A(P){return m(P.display_reasoning_effort,P.display_reasoning_effort_source||P.display_source)}function I(P){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[P]||""}const y=f(null),v=f(null),b=f(!1),x=f(null),_=f(""),C=mv({state:{get detail(){return y.value},set detail(P){y.value=P},get detailId(){return v.value},set detailId(P){v.value=P},get detailLoading(){return b.value},set detailLoading(P){b.value=P},get detailError(){return x.value},set detailError(P){x.value=P}},requestDetail:(P,{signal:ae})=>z.get(`/api/agents/${encodeURIComponent(P)}`,{signal:ae})});async function w(P){_.value="",await C.open(P.id)}function R(){C.close(),_.value=""}async function B(){await C.refresh()}async function S(P,ae){try{await navigator.clipboard.writeText(ae||""),_.value=P,setTimeout(()=>{_.value===P&&(_.value="")},1500)}catch{ke.error("Copy failed")}}async function F(P=!1){P=P===!0,P||(t.value=!0);try{const ae=await z.get("/api/agents");e.value=Array.isArray(ae)?ae:[],s.value=null}catch(ae){P||(s.value=ae.message)}P||(t.value=!1)}async function Y(P){const ae=e.value.find(U=>U.id===P);if(await qt({title:"Kill agent",message:`Kill agent "${(ae==null?void 0:ae.label)||P}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=P;try{await z.del(`/api/agents/${encodeURIComponent(P)}`),ke.success("Agent killed"),await F()}catch(U){ke.error(U.message||"Failed to kill agent")}a.value=null}}const j=vk({isEnabled:()=>n.value&&l,refreshList:()=>F(!0),hasOpenDetail:()=>!!v.value,refreshDetail:B});function L(){j.start()}function N(){j.stop()}return Dt(n,()=>j.sync()),Ge(()=>{l=!0,F(),L()}),Xt(()=>{l=!0,F(!0),L()}),Ut(()=>{l=!1,N()}),ut(()=>{l=!1,N(),C.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Ln,formatDuration:yi,progressPercent:p,hasProgress:h,displayModelText:g,displayEffortText:A,displaySourceLabel:I,detail:y,detailId:v,detailLoading:b,detailError:x,copied:_,openDetail:w,closeDetail:R,copyText:S,fetchAgents:F,killAgent:Y,startAutoRefresh:L,stopAutoRefresh:N}}},bk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const A=mv({state:{get detail(){return c.value},set detail(N){c.value=N},get detailId(){return d.value},set detailId(N){d.value=N},get detailLoading(){return u.value},set detailLoading(N){u.value=N},get detailError(){return p.value},set detailError(N){p.value=N}},detailLabel:"Loop detail",requestDetail:(N,{signal:P})=>z.get(`/api/loops/${encodeURIComponent(N)}?limit=100`,{signal:P})});async function I(N){h.value="",await A.open(N.id)}function y(){A.close(),h.value=""}async function v(N,P){try{await navigator.clipboard.writeText(P||""),h.value=N,setTimeout(()=>{h.value===N&&(h.value="")},1500)}catch{ke.error("Copy failed")}}const b=V(()=>e.value.reduce((N,P)=>N+(P.iteration_count||0),0)),x=V(()=>e.value.filter(N=>N.status==="running").length);function _(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function E(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function C(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}async function w(N=!1){N=N===!0,N||(t.value=!0);try{const P=await z.get("/api/loops");e.value=Array.isArray(P)?P:[],s.value=null}catch(P){N||(s.value=P.message)}N||(t.value=!1)}async function R(){l.value=null;const N=n.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const P={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(P.stop_condition=N.stop_condition.trim()),i.value=!0;try{const ae=await z.post("/api/loops",P);ke.success(`Loop started: ${ae.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await w()}catch(ae){l.value=ae.message}i.value=!1}async function B(N){if(await qt({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=N;try{await z.del(`/api/loops/${encodeURIComponent(N)}`),ke.success("Loop stopped"),await w()}catch(ae){ke.error(ae.message||"Failed to stop loop")}o.value=null}}async function S(N){r.value=N;try{await z.post(`/api/loops/${encodeURIComponent(N)}/restart`),ke.success("Loop restarted"),await w()}catch(P){ke.error(P.message||"Failed to restart loop")}r.value=null}function F(N){m&&N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&(w(!0),d.value&&A.refresh())}let Y=null;function j(){Y!==null&&clearInterval(Y),Y=null}function L(){j(),m&&(Y=setInterval(()=>{w(!0),d.value&&A.refresh()},5e3))}return Ge(()=>{m=!0,w(),Xe.subscribe("events",F),L()}),Xt(()=>{m=!0,w(!0),L()}),Ut(()=>{m=!1,j()}),ut(()=>{m=!1,Xe.unsubscribe("events",F),j(),A.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:x,statusDotClass:_,statusBadge:E,modeBadge:C,formatAge:uv,formatDuration:yi,formatTs:Ln,formatTokens:fv,openDetail:I,closeDetail:y,copyText:v,fetchLoops:w,doCreate:R,doStop:B,doRestart:S}}},yk={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=V(()=>e.value.filter(y=>y.status==="running").length),o=V(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await z.get("/api/processes"),s.value=null}catch(v){y||(s.value=v.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Dt(a,y=>{y?u():p()});async function h(y){if(await qt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await z.del(`/api/processes/${y}`),ke.success(`Process ${y} killed`),await d()}catch(b){ke.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let g=!1;function A(){g||(g=!0,d(),Xe.subscribe("events",m),u())}function I(){g&&(g=!1,Xe.unsubscribe("events",m),p())}return Ge(A),Xt(A),Ut(I),ut(I),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:yi,fetchProcesses:d,doKill:h}}},xk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function xp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function _k(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function wk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function kk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=xk.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const A of new Set([p,h])){const I=new Date(u+A*6e4);_k(I,c)===d&&(m.some(y=>y.getTime()===I.getTime())||m.push(I))}if(m.sort((A,I)=>A.getTime()-I.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(A=>({instant:A,offset:wk(A),iso:A.toISOString()}))};const g=m[0];return{state:"ok",typed:t,instant:g,iso:g.toISOString()}}const Sk=5e3;function no(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function ql(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function _p(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:no(e.data.connection)}function Tk(e){return e!=="webhook"}function wp(e,t){return!Tk(t)||(e==null?void 0:e.available)===!0}const Ck={template:`
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

      <div v-if="!schedulingAvailable" class="hm-card border-yellow-900 mb-4 text-xs text-yellow-300" role="status">
        {{ schedulingAvailabilityMessage }} Discord-delivered actions cannot be created, run, or resumed. Outbound HTTP webhooks remain available.
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
              <option value="webhook">Outbound HTTP webhook</option>
            </select>
            </label>
          </div>
          <div v-if="form.action !== 'webhook'">
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

        <div v-if="form.action === 'webhook'" class="mb-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-gray-400 text-xs block mb-1">URL
              <input v-model="form.webhook_url" type="url" class="hm-input"
                     placeholder="https://example.com/hook" />
              </label>
            </div>
            <div>
              <label class="text-gray-400 text-xs block mb-1">HTTP Method
              <select v-model="form.webhook_method" class="hm-input">
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="GET">GET</option>
                <option value="DELETE">DELETE</option>
              </select>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-gray-400 text-xs block mb-1">Headers (JSON object)
              <input v-model="form.webhook_headers_str" type="text" class="hm-input"
                     placeholder='e.g. {"Content-Type":"application/json"}' />
              </label>
            </div>
            <div>
              <label class="text-gray-400 text-xs block mb-1">Expected Status Codes
              <input v-model="form.webhook_expected_status_str" type="text" class="hm-input"
                     placeholder="e.g. 200, 201, 204" />
              </label>
            </div>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Request Body
            <textarea v-model="form.webhook_body" class="hm-input" rows="3"
                      placeholder="Optional text or JSON body"></textarea>
            </label>
          </div>
        </div>

        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating || !selectedActionAvailable">
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
                <span v-if="s.inert_reason" class="badge badge-danger mr-1">inert</span>
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
                          :disabled="togglingId === s.id || (s.paused && !actionAvailable(s.action))"
                          :title="s.paused ? 'Resume this schedule' : 'Pause this schedule'">
                    {{ togglingId === s.id ? '...' : (s.paused ? 'Resume' : 'Pause') }}
                  </button>
                  <button @click="doRunNow(s)" class="btn btn-ghost text-xs"
                          :disabled="runningId === s.id || !actionAvailable(s.action)"
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
                  <div v-if="s.inert_reason" class="mb-3 p-2 rounded" style="background: rgba(245,158,11,0.1);">
                    <div class="text-xs text-yellow-400 font-medium mb-1">Schedule is inert</div>
                    <div class="text-xs text-yellow-200">{{ s.inert_reason }}</div>
                  </div>
                  <div v-if="s.last_error" class="mb-3 p-2 rounded" style="background: rgba(239,68,68,0.1);">
                    <div class="text-xs text-red-400 font-medium mb-1">Last Error</div>
                    <div class="text-xs text-red-300 font-mono">{{ s.last_error }}</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ s.last_error_at ? formatAge(s.last_error_at) : '' }}
                      <span v-if="s.retry_at"> · Next retry: {{ formatFuture(s.retry_at) }}</span>
                      <span v-if="s.retry_count > 0"> · Retry {{ s.retry_count }}/{{ s.max_retries }}</span>
                    </div>
                  </div>

                  <!-- Schedule details: every cell is label-above-value so the
                       band stays uniform whether the value is text or the
                       report select (audit 4.5 — mixed inline/stacked cells
                       made the first detail row ragged). -->
                  <div class="sched-detail-grid mb-3 text-xs">
                    <div><span class="sched-detail-label">ID</span><span class="font-mono">{{ s.id }}</span></div>
                    <div><span class="sched-detail-label">Action</span><span>{{ s.action }}</span></div>
                    <div v-if="s.action === 'check'">
                      <label class="sched-detail-label" :for="'report-format-' + s.id">Report</label>
                      <select :id="'report-format-' + s.id"
                              :value="s.report_format || ''"
                              @change="doUpdateReportFormat(s, $event.target.value)"
                              class="hm-input text-xs"
                              :disabled="reportUpdatingId === s.id">
                        <option value="">Plain text</option>
                        <option value="paginated_embed_v1">Paginated embeds</option>
                      </select>
                    </div>
                    <div v-else><span class="sched-detail-label">Report</span><span>plain text</span></div>
                    <div><span class="sched-detail-label">Next run</span>
                      <span v-if="s.next_run">{{ formatFuture(s.next_run) }}</span>
                      <span v-else>on trigger</span>
                    </div>
                    <div><span class="sched-detail-label">Created</span><span>{{ formatTs(s.created_at) }}</span></div>
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(no(null)),n=V(()=>a.value.available),i=V(()=>ql(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=V(()=>wp(a.value,r.value.action));function p($){return wp(a.value,$)}const h=f(null),m=V(()=>kk(r.value.run_at));Dt(()=>r.value.run_at,()=>{h.value=null});const g=V(()=>{var Z;const $=m.value;return $.state==="ok"?$.instant:$.state==="ambiguous"&&h.value!==null&&((Z=$.options[h.value])==null?void 0:Z.instant)||null}),A=V(()=>{const $=g.value;return $?`${$.toLocaleString()} local — ${$.toISOString()} UTC`:""}),I=f(null),y=f(!1),v=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=f(null),x=f(null),_=f(null),E=f(null),C=f(null),w=f(null),R=f([]),B=f(!1),S=f("");let F=0;const Y=V(()=>e.value.filter($=>$.cron&&!$.one_time).length),j=V(()=>e.value.filter($=>$.one_time).length),L=V(()=>e.value.filter($=>$.trigger).length),N=V(()=>e.value.filter($=>$.paused).length),P=V(()=>e.value.filter($=>$.consecutive_failures>0).length);function ae($){if(!$)return"-";const Z=Date.now(),H=(new Date($).getTime()-Z)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const X=Math.floor(H/3600),be=Math.floor(H%3600/60);return be>0?`in ${X}h ${be}m`:`in ${X}h`}const ee=Math.floor(H/86400);return`in ${ee} day${ee!==1?"s":""}`}function ne($){return $==null?"-":$<1e3?`${$}ms`:$<6e4?`${($/1e3).toFixed(1)}s`:yi($/1e3)}function U($=r.value.cron){r.value.cron=$,xp(r.value,"cron"),I.value=null}function J($=r.value.run_at){r.value.run_at=$,xp(r.value,"run_at"),I.value=null}async function ie(){const $=r.value.cron.trim();if($){y.value=!0;try{I.value=await z.post("/api/schedules/validate-cron",{expression:$})}catch(Z){I.value={valid:!1,error:Z.message}}y.value=!1}}async function K(){t.value=!0,s.value=null;try{e.value=await z.get("/api/schedules")}catch($){s.value=$.message}t.value=!1}async function me(){try{a.value=no(await z.get("/api/schedules/status"))}catch($){a.value=_p($)||no(null)}}function de($){const Z=_p($);Z&&(a.value=Z)}async function W($){if(w.value===$){w.value=null,R.value=[];return}w.value=$,B.value=!0,R.value=[];const Z=++F;try{const ue=await z.get(`/api/schedules/${encodeURIComponent($)}/history?limit=10`);if(Z!==F||w.value!==$)return;R.value=ue,S.value=""}catch(ue){if(Z!==F||w.value!==$)return;R.value=[],S.value=ue.message||"Failed to load execution history"}Z===F&&(B.value=!1)}async function pe(){if(d.value=null,!p(r.value.action)){d.value=ql(a.value);return}const $=r.value;if(!$.description.trim()){d.value="Description is required";return}if($.action!=="webhook"&&!$.channel_id.trim()){d.value="Channel ID is required";return}if(!$.cron.trim()&&!$.run_at.trim()){d.value="Cron expression or run_at time is required";return}if($.cron.trim()&&$.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Z={description:$.description.trim(),action:$.action,channel_id:$.channel_id.trim()};if($.cron.trim()&&(Z.cron=$.cron.trim()),$.run_at.trim()){const ue=m.value;if(ue.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){d.value="One-time run time is not a valid date";return}const H=g.value;if(ue.state==="ambiguous"&&h.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!H){d.value="One-time run time could not be resolved";return}Z.run_at=H.toISOString()}if($.action==="reminder"&&$.message.trim()&&(Z.message=$.message.trim()),$.action==="check"&&($.tool_name.trim()&&(Z.tool_name=$.tool_name.trim()),$.report_format&&(Z.report_format=$.report_format),$.tool_input_str.trim()))try{Z.tool_input=JSON.parse($.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if($.action==="webhook"){if(!$.webhook_url.trim()){d.value="Webhook URL is required";return}const ue={url:$.webhook_url.trim(),method:$.webhook_method};if($.webhook_headers_str.trim())try{const H=JSON.parse($.webhook_headers_str.trim());if(!H||Array.isArray(H)||typeof H!="object")throw new Error("not an object");ue.headers=H}catch{d.value="Webhook headers must be a valid JSON object";return}if($.webhook_body&&(ue.body=$.webhook_body),$.webhook_expected_status_str.trim()){const H=$.webhook_expected_status_str.split(",").map(ee=>Number(ee.trim()));if(H.some(ee=>!Number.isInteger(ee)||ee<100||ee>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}ue.expected_status_codes=H}Z.webhook_config=ue}c.value=!0;try{await z.post("/api/schedules",Z),ke.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},I.value=null,o.value=!1,await K()}catch(ue){de(ue),d.value=ue.message}c.value=!1}async function ge($){if(!p($.action)){ke.error(ql(a.value));return}const Z=$.id;b.value=Z;try{const ue=await z.post(`/api/schedules/${encodeURIComponent(Z)}/run`);if(ue.status==="failure")ke.error(`Execution failed: ${ue.error||"unknown error"}`);else{const H=ue.warning?`Executed (${ue.warning})`:"Executed successfully";ke.success(H)}await K()}catch(ue){de(ue),ke.error(ue.message||"Failed to trigger")}b.value=null}async function ye($){if($.paused&&!p($.action)){ke.error(ql(a.value));return}_.value=$.id;const Z=!$.paused;try{await z.put(`/api/schedules/${encodeURIComponent($.id)}`,{paused:Z}),ke.success(Z?"Schedule paused":"Schedule resumed"),await K()}catch(ue){de(ue),ke.error(ue.message||"Failed to update schedule")}_.value=null}const _e=new Map;function Ne($,Z){const ue=_e.get($.id);ue&&clearTimeout(ue.timer);const H={run:()=>T($,Z),timer:null};H.timer=setTimeout(()=>{_e.delete($.id),H.run()},500),_e.set($.id,H)}async function T($,Z){C.value=$.id;try{await z.put(`/api/schedules/${encodeURIComponent($.id)}`,{report_format:Z}),ke.success(Z?"Structured report enabled":"Plain-text report enabled")}catch(ue){ke.error(`Update failed: ${ue.message}`)}finally{await K(),C.value=null}}function M(){for(const[$,Z]of[..._e])clearTimeout(Z.timer),_e.delete($),Z.run()}async function q($){E.value=$;try{await z.post(`/api/schedules/${encodeURIComponent($)}/reset-failures`),ke.success("Failure counters reset"),await K()}catch(Z){ke.error(Z.message||"Failed to reset")}E.value=null}async function re($){const Z=e.value.find(H=>H.id===$);if(await qt({title:"Delete schedule",message:`Delete "${(Z==null?void 0:Z.description)||$}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){x.value=$;try{await z.del(`/api/schedules/${encodeURIComponent($)}`),ke.success("Schedule deleted"),await K()}catch(H){ke.error(H.message||"Failed to delete schedule")}x.value=null}}return Ge(()=>{K(),me(),l=setInterval(me,Sk)}),ut(()=>{M(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:A,runAtAnalysis:m,runAtOccurrence:h,cronResult:I,validatingCron:y,cronPresets:v,runningId:b,deletingId:x,togglingId:_,resettingId:E,reportUpdatingId:C,flushReportFormatTimers:M,expandedId:w,history:R,historyLoading:B,historyError:S,cronCount:Y,oneTimeCount:j,webhookCount:L,pausedCount:N,failingCount:P,formatTs:Ln,formatAge:uv,formatFuture:ae,formatMs:ne,formatDuration:yi,onCronInput:U,onRunAtInput:J,validateCron:ie,toggleExpand:W,fetchSchedules:K,fetchSchedulingAvailability:me,doCreate:pe,doRunNow:ge,doTogglePause:ye,doUpdateReportFormat:Ne,doResetFailures:q,doDelete:re}}},vv=[{id:"live",label:"Live",component:uk},{id:"agents",label:"Agents",component:gk},{id:"loops",label:"Loops",component:bk},{id:"processes",label:"Processes",component:yk},{id:"schedules",label:"Schedules",component:Ck}],Ek={components:{TabbedPage:dr},setup(){return{tabs:vv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Ak={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Audit Log</h1>
        <div class="flex items-center gap-2">
          <button @click="verifyIntegrity" class="btn btn-ghost text-xs" :disabled="verifying">
            {{ verifying ? 'Verifying...' : 'Verify integrity' }}
          </button>
          <button @click="fetchAudit" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Tamper-evidence result (audit 7.2): the HMAC chain verifier has
           existed since v3.49.0 with no operator surface. Every state is
           rendered honestly — disabled signing and the permanent
           pre-enablement unsigned prefix are facts, not alarms. -->
      <div v-if="verifyError" class="hm-card mb-4 border-red-900">
        <p class="text-red-400 text-sm">Verification failed: {{ verifyError }}</p>
      </div>
      <div v-else-if="verifyResult && verifyResult.not_enabled" class="hm-card mb-4">
        <p class="text-xs text-gray-400">Tamper-evidence is not enabled — no signing key is configured, so the chain cannot be verified.</p>
      </div>
      <div v-else-if="verifyResult" class="hm-card mb-4" :class="verifyResult.valid ? 'audit-verify-ok' : 'border-red-900'">
        <p v-if="verifyResult.valid" class="text-sm audit-verify-valid">
          Chain valid — {{ verifyResult.verified }} signed entr{{ verifyResult.verified === 1 ? 'y' : 'ies' }} verified.
        </p>
        <p v-else class="text-sm text-red-400">
          Chain INVALID — first break at entry {{ verifyResult.first_bad }}; {{ verifyResult.verified }} verified before it.
        </p>
        <p v-if="verifyResult.unsigned_prefix > 0" class="text-xs text-gray-500 mt-1">
          {{ verifyResult.unsigned_prefix.toLocaleString() }} older entries predate signing and are permanently unsigned — expected, not tampering.
        </p>
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){a.value=a.value===m?null:m}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await z.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,a.value=null;try{const g=new URLSearchParams;n.value.tool&&g.set("tool",n.value.tool),n.value.user&&g.set("user",n.value.user),n.value.keyword&&g.set("q",n.value.keyword),n.value.date&&g.set("date",n.value.date),g.set("limit",String(n.value.limit));const A=g.toString(),I=await z.get(`/api/audit${A?"?"+A:""}`);if(m!==r)return;e.value=Array.isArray(I)?I:[]}catch(g){if(m!==r)return;s.value=g.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:Ln,formatDetail:i,truncateBlock:pv,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},kp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Rk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Ik={template:`
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
          <button v-if="ftsResults !== null || ftsError || ftsSearching" @click="clearFtsSearch" class="btn btn-ghost text-xs">
            Clear
          </button>
        </div>
        <!-- FTS results -->
        <div v-if="ftsSearching" class="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Searching...
        </div>
        <div v-if="ftsError" class="mt-3 text-red-400 text-sm" role="alert">
          {{ ftsError }} <button @click="runFtsSearch" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <div v-if="!ftsSearching && ftsResults !== null" class="mt-3">
          <div v-if="ftsStale" class="text-amber-400 text-sm">Previous results — not current for these filters.</div>
          <div v-if="ftsResults.length === 0 && !ftsStale && !ftsError" class="text-gray-500 text-sm">No results found</div>
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),g=kp,A=Rk,I=f([]),y=f(!1),v=f(""),b=f("flat"),x=f(new Set),_=f(""),E=f(""),C=f(""),w=f(null),R=f(!1),B=f(""),S=f(!1);let F=0;Dt([_,E,C],()=>{F++,R.value=!1,B.value="",S.value=w.value!==null},{flush:"sync"});function Y(){try{const se=localStorage.getItem("odin-session-presets");se&&(I.value=JSON.parse(se))}catch{}}function j(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const L=V(()=>p.value.trim()!==""||u.value!=="all"),N=V(()=>{let se=[...e.value];const Re=kp.find(rt=>rt.id===u.value),De=Re?Re.filters:{};if(De.source&&(se=se.filter(rt=>rt.source===De.source)),De.minMessages&&(se=se.filter(rt=>rt.message_count>=De.minMessages)),De.hasCompaction&&(se=se.filter(rt=>rt.has_summary)),De.maxAge!=null){const rt=Date.now()/1e3;se=se.filter(xt=>xt.last_active&&rt-xt.last_active<=De.maxAge)}if(p.value.trim()){const rt=p.value.toLowerCase().trim();se=se.filter(xt=>(xt.channel_id||"").toLowerCase().includes(rt)||(xt.last_user_id||"").toLowerCase().includes(rt)||(xt.source||"").toLowerCase().includes(rt))}const st=h.value,Gt=m.value?1:-1;return se.sort((rt,xt)=>{const Mt=rt[st]||0,vs=xt[st]||0;return(Mt-vs)*Gt}),se}),P=V(()=>{if(!n.value||!n.value.messages)return[];const se=n.value.messages;if(se.length===0)return[];const Re=[];let De=[];for(const st of se)st.role==="user"&&De.length>0&&(Re.push(De),De=[]),De.push(st);return De.length>0&&Re.push(De),Re}),ae=V(()=>N.value.length>0&&c.value.size===N.value.length);function ne(se){const Re=se.find(De=>De.role==="user");if(Re&&Re.content){const De=Re.content.slice(0,120);return De.length<Re.content.length?De+"...":De}return"(no user message)"}function U(se){const Re=new Set(x.value);Re.has(se)?Re.delete(se):Re.add(se),x.value=Re}function J(se){u.value=se}function ie(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(h.value=se.filters.sortBy)}function K(){if(!v.value.trim())return;const se={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};I.value=[...I.value,se],j(),y.value=!1,v.value=""}function me(se){I.value=I.value.filter(Re=>Re.id!==se),j(),u.value===se&&(u.value="all")}function de(){u.value="all",p.value="",h.value="last_active",m.value=!1}function W(se){if(!se)return"—";const Re=Date.now()/1e3-se;if(Re<60)return"just now";if(Re<3600){const st=Math.floor(Re/60);return`${st} minute${st!==1?"s":""} ago`}if(Re<86400){const st=Math.floor(Re/3600);return`${st} hour${st!==1?"s":""} ago`}const De=Math.floor(Re/86400);return`${De} day${De!==1?"s":""} ago`}function pe(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ge(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function ye(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function _e(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Ne(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function T(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function M(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function q(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function re(){const se=_.value.trim();if(!se)return;const Re=++F;R.value=!0,B.value="",S.value=w.value!==null;try{let De=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;E.value.trim()&&(De+=`&channel_id=${encodeURIComponent(E.value.trim())}`),C.value.trim()&&(De+=`&user_id=${encodeURIComponent(C.value.trim())}`);const st=await z.get(De);if(Re!==F)return;w.value=st.results||[],S.value=!1}catch(De){if(Re!==F)return;B.value=De.message||"Search failed. Please retry."}finally{Re===F&&(R.value=!1)}}function $(){F++,_.value="",E.value="",C.value="",w.value=null,B.value="",S.value=!1,R.value=!1}function Z(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ue(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ee=0;async function X(){const se=++ee;t.value=!0,s.value=null;try{const Re=await z.get("/api/sessions");if(se!==ee)return;e.value=Re}catch(Re){if(se!==ee)return;s.value=Re.message}se===ee&&(t.value=!1)}function be(){s.value=null,X()}async function he(se){if(a.value===se){a.value=null,n.value=null,x.value=new Set;return}a.value=se,n.value=null,i.value=!0,x.value=new Set;const Re=++l;try{const De=await z.get(`/api/sessions/${encodeURIComponent(se)}`);Re===l&&a.value===se&&(n.value=De)}catch(De){Re===l&&a.value===se&&(n.value={messages:[],summary:"",error:De.message||"Failed to load session"})}finally{Re===l&&(i.value=!1)}}function xe(se){const Re=new Set(c.value);Re.has(se)?Re.delete(se):Re.add(se),c.value=Re}function Ae(){ae.value?c.value=new Set:c.value=new Set(N.value.map(se=>se.channel_id))}function Le(se){o.value=se}async function $e(){if(o.value){r.value=!0;try{await z.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await X()}catch(se){s.value=se.message||"Failed to clear session"}r.value=!1,o.value=null}}function Me(){d.value=!0}async function Fe(){if(c.value.size!==0){r.value=!0;try{await z.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await X()}catch(se){s.value=se.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ue(se,Re){const De=`/api/sessions/${encodeURIComponent(se)}/export?format=${Re}`;try{const st=await z.getBlob(De),Gt=URL.createObjectURL(st),rt=document.createElement("a");rt.href=Gt,rt.download=`session-${se}.${Re==="text"?"txt":"json"}`,rt.click(),URL.revokeObjectURL(Gt)}catch(st){s.value=st.message||"Failed to export session"}}let Ye=null;function je(se){se.payload&&se.payload.channel_id&&(clearTimeout(Ye),Ye=setTimeout(()=>{if(X(),a.value&&se.payload.channel_id===a.value){const Re=a.value,De=l;z.get(`/api/sessions/${encodeURIComponent(Re)}`).then(st=>{De!==l||a.value!==Re||(n.value=st)}).catch(()=>{})}},2e3))}let Q=!1,we=null;function fe(){Q||(Q=!0,X(),Xe.subscribe("events",je),we=Xe.onReconnected(()=>X()))}Ge(()=>{Y(),fe()}),Xt(()=>{fe()});function Ie(){Q&&(Q=!1,Xe.unsubscribe("events",je),we&&(we(),we=null),clearTimeout(Ye))}return Ut(Ie),ut(Ie),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:ae,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:g,sortOptions:A,filteredSessions:N,hasActiveFilters:L,customPresets:I,showSavePreset:y,newPresetName:v,threadView:b,threads:P,collapsedThreads:x,ftsQuery:_,ftsChannelId:E,ftsUserId:C,ftsResults:w,ftsSearching:R,ftsError:B,ftsStale:S,formatAge:W,formatTimestamp:pe,formatFullTimestamp:ge,messageClass:ye,threadMsgClass:_e,roleBadge:Ne,roleDotClass:T,roleLabelClass:M,truncateContent:q,threadSummary:ne,fetchSessions:X,retry:be,toggleSession:he,toggleSelect:xe,toggleSelectAll:Ae,confirmClear:Le,clearSession:$e,confirmBulkClear:Me,doBulkClear:Fe,exportSession:Ue,applyPreset:J,applyCustomPreset:ie,saveCustomPreset:K,removeCustomPreset:me,resetFilters:de,toggleThread:U,runFtsSearch:re,clearFtsSearch:$,highlightSnippet:Z,ftsResultClass:ue,ftsTypeBadge:H}}},Ok={props:["trace"],template:`
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
  `,setup(){return{formatTokens:fv}}},Lk={components:{ContextAssemblyPanel:Ok},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(E){if(!E)return"—";try{const C=new Date(E);return isNaN(C.getTime())?E:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return E}}function p(E){return!E&&E!==0?"—":E<1e3?E+"ms":(E/1e3).toFixed(1)+"s"}function h(E){return!E&&E!==0?"—":E>=1e3?(E/1e3).toFixed(1)+"k":String(E)}function m(E){if(!E)return"";if(typeof E=="string")return E;try{return JSON.stringify(E,null,2)}catch{return String(E)}}function g(E){n.value===E?n.value=null:(n.value=E,c.value={})}function A(E,C){const w=E+"-"+C;c.value={...c.value,[w]:!c.value[w]}}function I(E,C){return!!c.value[E+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,x()}async function v(){try{const E=await z.get("/api/trajectories");e.value=E.files||[],r.value=E.count||0}catch{}}let b=0;async function x(){const E=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const C=await z.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(E!==b)return;let w=C.entries||[];d.value.tool_name&&(w=w.filter(R=>(R.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(w=w.filter(R=>R.is_error)),d.value.channel_id&&(w=w.filter(R=>R.channel_id===d.value.channel_id)),d.value.user_id&&(w=w.filter(R=>R.user_id===d.value.user_id)),t.value=w}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const w=C.toString(),R=await z.get(`/api/trajectories/search/query?${w}`);if(E!==b)return;t.value=R.results||[]}}catch(C){if(E!==b)return;a.value=C.message}E===b&&(s.value=!1)}async function _(){if(!l.value.trim())return;const E=++b;s.value=!0,a.value=null,c.value={};try{const C=await z.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(E!==b)return;i.value=C.entry||null,i.value||(a.value="No trace found for this message ID")}catch(C){if(E!==b)return;C.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=C.message}E===b&&(s.value=!1)}return Ge(async()=>{await v(),await x()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:pv,toggleExpand:g,toggleIteration:A,isIterationExpanded:I,clearFilters:y,fetchFiles:v,fetchTraces:x,lookupMessage:_}}};function Nk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function Dk(e){return e?`${e.approximate?"~":""}${Md(e.total||0)}`:"0"}const Pk={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Usage and Activity">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-200">Usage &amp; Activity</h2>
          <p class="text-xs text-slate-500 mt-1">Persistent statistics from settled trajectories and the read-only audit index.</p>
        </div>
        <div class="flex gap-1" aria-label="Statistics range">
          <button v-for="r in ranges" :key="r.key" class="btn text-xs"
                  :class="range === r.key ? 'btn-primary' : 'btn-ghost'"
                  @click="selectRange(r.key)">{{ r.label }}</button>
        </div>
      </div>

      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading usage data">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card"><div class="skeleton skeleton-stat"></div></div>
        </div>
      </div>

      <div v-else-if="error && !hasData" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <div v-if="error && hasData" class="hm-card border-amber-900 mb-3" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">Last refresh failed: {{ error }} — showing the last successful response.</p>
        </div>
        <div v-if="data.coverage && !data.coverage.backfill_complete" class="hm-card border-amber-900 mb-3" role="status">
          <p class="text-amber-300 text-sm">Historical indexing is still running. Recent data appears first; all-time totals are incomplete.</p>
          <p class="text-xs text-slate-500 mt-1">{{ data.coverage.sources_complete }} / {{ data.coverage.sources_indexed }} sources complete · {{ data.coverage.malformed_rows_skipped }} malformed rows skipped</p>
        </div>
        <div v-if="isStale" class="hm-card border-amber-900 mb-3 text-sm text-amber-300" role="status">
          Statistics are stale. Last successful receipt was more than 30 seconds ago.
        </div>

        <section aria-labelledby="usage-work-heading">
          <h3 id="usage-work-heading" class="text-sm font-semibold text-slate-300 mb-2">How much work happened</h3>
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ fmtNum(work.settled_turns) }}</div><div class="text-xs text-slate-400 mt-1">Settled turns</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ fmtNum(work.accepted_generations) }}</div><div class="text-xs text-slate-400 mt-1">Accepted generations</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ tokenLabel(work.input_tokens) }}</div><div class="text-xs text-slate-400 mt-1">Input processed</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ tokenLabel(work.output_tokens) }}</div><div class="text-xs text-slate-400 mt-1">Output generated</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white" :title="work.recorded_processing_ms == null ? 'Not recorded' : null">{{ fmtDuration(work.recorded_processing_ms) }}</div><div class="text-xs text-slate-400 mt-1">Recorded processing</div></div>
          </div>
          <div class="hm-card mb-5 text-xs text-slate-400" v-if="work.input_tokens">
            Input provenance: {{ fmtNum(work.input_tokens.provider_reported) }} provider-reported ·
            {{ fmtNum(work.input_tokens.estimated) }} current estimates ·
            {{ fmtNum(work.input_tokens.legacy_estimated) }} legacy estimates ·
            {{ work.input_tokens.provider_reported_percent }}% reported coverage.
            Recorded processing is summed operation time, not wall-clock uptime. A dash means timing was not recorded; unavailable samples are excluded.
          </div>
        </section>

        <div v-if="!work.settled_turns" class="hm-card text-center py-8 text-slate-500 mb-5">
          No settled usage history in this range.
        </div>

        <section v-if="(data.activity_over_time || []).length" class="hm-card min-w-0 mb-4" aria-labelledby="usage-time-heading">
          <h3 id="usage-time-heading" class="text-sm font-semibold text-slate-300 mb-3">Activity over time</h3>
          <div class="usage-activity-scroll w-full min-w-0 max-w-full overflow-x-auto">
            <div class="usage-activity-track flex items-end gap-1 h-28 min-w-full" :style="activityTrackStyle" role="img" aria-label="Daily settled turns by surface">
              <div v-for="row in data.activity_over_time" :key="row.bucket + ':' + row.surface"
                   class="flex-1 min-w-0 bg-amber-700/70 rounded-t" :style="activityBar(row.count)"
                   :title="row.bucket + ' · ' + row.surface + ': ' + row.count"></div>
            </div>
          </div>
          <p class="text-xs text-slate-500 mt-2">Daily settled work units by recorded surface. Hover a bar for its value.</p>
        </section>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <section class="hm-card" aria-labelledby="usage-kind-heading">
            <h3 id="usage-kind-heading" class="text-sm font-semibold text-slate-300 mb-3">What kind of work</h3>
            <div class="table-responsive"><table class="w-full text-sm">
              <thead><tr class="text-left text-slate-400"><th>Surface</th><th>Outcome</th><th class="text-right">Turns</th><th class="text-right">Processing</th></tr></thead>
              <tbody><tr v-for="row in data.activity || []" :key="row.surface + ':' + row.outcome" class="border-t border-slate-700">
                <td class="py-2">{{ row.surface }}</td><td>{{ row.outcome }}</td><td class="text-right">{{ fmtNum(row.count) }}</td><td class="text-right" :title="row.duration_ms == null ? 'Not recorded' : null">{{ fmtDuration(row.duration_ms) }}</td>
              </tr><tr v-if="!(data.activity || []).length"><td colspan="4" class="py-4 text-center text-slate-500">No activity yet</td></tr></tbody>
            </table></div>
          </section>

          <section class="hm-card" aria-labelledby="usage-serve-heading">
            <h3 id="usage-serve-heading" class="text-sm font-semibold text-slate-300 mb-3">What served it</h3>
            <div class="table-responsive"><table class="w-full text-sm">
              <thead><tr class="text-left text-slate-400"><th>Provider / model</th><th>Effort</th><th class="text-right">Generations</th><th class="text-right">Input</th><th class="text-right">Output</th><th class="text-right">Processing</th></tr></thead>
              <tbody><tr v-for="row in data.serving || []" :key="row.provider + ':' + row.model + ':' + row.effort" class="border-t border-slate-700">
                <td class="py-2"><span class="text-slate-500">{{ row.provider }}</span><br><span class="font-mono text-xs">{{ row.model }}</span></td><td>{{ row.effort || 'n/a' }}</td><td class="text-right">{{ fmtNum(row.generations) }}</td><td class="text-right">{{ fmtNum(row.input_tokens) }}</td><td class="text-right">{{ fmtNum(row.output_tokens) }}</td><td class="text-right" :title="row.duration_ms == null ? 'Not recorded' : null">{{ fmtDuration(row.duration_ms) }}</td>
              </tr><tr v-if="!(data.serving || []).length"><td colspan="6" class="py-4 text-center text-slate-500">No generations yet</td></tr></tbody>
            </table></div>
          </section>
        </div>

        <section class="hm-card mb-4" aria-labelledby="usage-tools-heading">
          <h3 id="usage-tools-heading" class="text-sm font-semibold text-slate-300 mb-3">What tools Odin used</h3>
          <div class="table-responsive"><table class="w-full text-sm">
            <thead><tr class="text-left text-slate-400"><th>Tool</th><th class="text-right">Executions</th><th class="text-right">Errors</th><th class="text-right">Error rate</th><th class="text-right">Average time</th></tr></thead>
            <tbody><tr v-for="row in data.tools || []" :key="row.tool_name" class="border-t border-slate-700">
              <td class="py-2 font-mono text-xs">{{ row.tool_name }}</td><td class="text-right">{{ fmtNum(row.executions) }}</td><td class="text-right">{{ fmtNum(row.errors) }}</td><td class="text-right">{{ row.error_rate_percent }}%</td><td class="text-right" :title="row.avg_duration_ms == null ? 'Not recorded' : null">{{ fmtDuration(row.avg_duration_ms) }}</td>
            </tr><tr v-if="!(data.tools || []).length"><td colspan="5" class="py-4 text-center text-slate-500">No audited tool executions yet</td></tr></tbody>
          </table></div>
        </section>

        <section class="hm-card" aria-labelledby="usage-auto-heading">
          <h3 id="usage-auto-heading" class="text-sm font-semibold text-slate-300 mb-3">Automation</h3>
          <div class="flex flex-wrap gap-2"><span v-for="row in data.automation || []" :key="row.state" class="status-badge status-info">{{ row.state }}: {{ fmtNum(row.count) }} · recoveries {{ fmtNum(row.recovery_attempts) }}</span><span v-if="!(data.automation || []).length" class="text-sm text-slate-500">No agent outcomes yet</span></div>
        </section>

        <p class="mt-4 text-xs text-slate-500">Modeled cost is not actual spend. This screen does not have invoice, cache-pricing, or historical-rate truth.</p>
      </div>
    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=V(()=>a.value.work||{}),h=V(()=>Math.max(1,...(a.value.activity_over_time||[]).map(_=>Number(_.count||0)))),m=V(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),g=_=>({height:`${Math.max(4,Math.round(Number(_||0)/h.value*100))}%`}),A=V(()=>s.value&&l.value-i.value>3e4);async function I(){const _=++d,E=n.value;try{const C=await z.get(`/api/usage?range=${encodeURIComponent(E)}`);if(_!==d||E!==n.value)return;a.value=C,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(C){_===d&&(t.value=C.message)}finally{_===d&&(e.value=!1)}}function y(_){n.value=_,e.value=!s.value,I()}function v(){e.value=!0,I()}function b(){c||(c=!0,I(),o=setInterval(I,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function x(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(b),Xt(b),Ut(x),ut(x),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:A,fmtNum:Md,fmtDuration:Nk,tokenLabel:Dk,activityTrackStyle:m,activityBar:g,selectRange:y,retry:v}}},gv=[{id:"audit",label:"Audit",component:Ak},{id:"sessions",label:"Sessions",component:Ik},{id:"traces",label:"Traces",component:Lk},{id:"usage",label:"Usage & Activity",component:Pk}],Mk={components:{TabbedPage:dr},setup(){return{tabs:gv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},$r=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Fk={template:`
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
          <div v-if="inventoryAvailable" class="tl-stat-card">
            <div class="tl-stat-value">{{ coreCount }}</div>
            <div class="tl-stat-label">Core Tools</div>
          </div>
          <div v-if="inventoryAvailable" class="tl-stat-card">
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
                      <div v-if="t.input_schema && t.input_schema.properties" class="tl-tool-params">
                        <div class="tl-tool-params-title">Parameters</div>
                        <div v-for="(prop, pname) in t.input_schema.properties" :key="pname" class="tl-tool-param">
                          <span class="tl-tool-param-name">{{ pname }}</span>
                          <span v-if="prop.type" class="tl-tool-param-type">{{ prop.type }}</span>
                          <span v-if="(t.input_schema.required || []).includes(pname)" class="tl-tool-param-req">required</span>
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

        <!-- Empty search state -->
        <div v-if="filteredTools.length === 0 && search" class="hm-card empty-state">
          <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
          <span class="empty-state-text">No tools match "{{ search }}"</span>
          <span class="empty-state-hint">Try a different search term</span>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(w){return w.source!=="builtin"?"":u[w.state]||""}function h(w,R){const B=w&&Array.isArray(w.tools)?w.tools:null;if(c.value=!!B,r.value=B?!!w.global_enabled:null,!B){e.value=R.map(Y=>({...Y,source:"unknown",enabled:void 0,state:null}));return}const S=new Set(B.map(Y=>Y.name)),F=R.filter(Y=>!S.has(Y.name)).map(Y=>({...Y,source:Y.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...B.map(Y=>({...Y,source:"builtin"})),...F]}async function m(w,R){if(d.value.has(w.name))return;const B=!!R.target.checked,S=new Set(d.value);S.add(w.name),d.value=S;try{const F=await z.post(`/api/tools/builtins/${encodeURIComponent(w.name)}/enabled`,{enabled:B});h(F,e.value),s.value=null;try{const Y=await z.get("/api/tools");h(F,Y)}catch(Y){console.warn("Built-in toggle committed; visible catalog refresh failed",Y)}}catch(F){R.target.checked=!!w.enabled,s.value=F.message||`Failed to toggle ${w.name}`}finally{const F=new Set(d.value);F.delete(w.name),d.value=F}}const g=V(()=>e.value.filter(w=>w.source==="builtin"&&w.is_core).length),A=V(()=>e.value.filter(w=>w.source==="skill").length),I=V(()=>Object.values(n.value).reduce((w,R)=>w+R,0));function y(w){for(const R of $r)if(R.id!=="other"&&R.match(w))return R.id;return"other"}const v=V(()=>{let w=e.value;if(a.value){const R=a.value.toLowerCase();w=w.filter(B=>B.name.toLowerCase().includes(R)||(B.description||"").toLowerCase().includes(R))}return o.value&&(w=w.filter(R=>y(R.name)===o.value)),w}),b=V(()=>{const w=new Set;for(const R of e.value)w.add(y(R.name));return $r.filter(R=>w.has(R.id))}),x=V(()=>{const w=v.value,R={};for(const S of w){const F=y(S.name);R[F]||(R[F]=[]),R[F].push(S)}const B=[];for(const S of $r)R[S.id]&&R[S.id].length>0&&B.push({label:S.label,icon:S.icon,tools:R[S.id].sort((F,Y)=>F.name.localeCompare(Y.name))});return B});function _(w){i.value={...i.value,[w]:!i.value[w]}}async function E(){t.value=!0,s.value=null;try{const[w,R,B]=await Promise.all([z.get("/api/tools"),z.get("/api/tools/stats").catch(()=>({})),z.get("/api/tools/builtins").catch(()=>null)]);h(B,w),n.value=R||{}}catch(w){s.value=w.message}t.value=!1}function C(){E()}return Ge(()=>{E()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:g,skillCount:A,totalUsage:I,filteredTools:v,groupedTools:x,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:Pd,toggleExpand:_,refresh:C}}};function $k(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Bk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const Uk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),g=f(null),A=f(null),I=f(!1),y=V(()=>e.value.length),v=V(()=>e.value.reduce((K,me)=>K+(me.execution_count||0),0)),b=V(()=>e.value.reduce((K,me)=>K+R(me.code),0)),x=V(()=>{if(!l.value)return e.value;const K=l.value.toLowerCase();return e.value.filter(me=>me.name.toLowerCase().includes(K)||(me.description||"").toLowerCase().includes(K))}),_=V(()=>u.value?u.value.split(`
`).length:0),E=V(()=>{const K=Math.max(_.value,1);return Array.from({length:K},(me,de)=>de+1).join(`
`)}),C=V(()=>{const K=u.value.trim();return K?K.includes("SKILL_DEFINITION")?K.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function w(K){return $k(K)}function R(K){return K?K.split(`
`).length:0}function B(K){return Bk(K)}function S(K){a.value={...a.value,[K]:!a.value[K]}}async function F(K){try{await navigator.clipboard.writeText(K);const me=e.value.find(de=>de.code===K);me&&(o.value=me.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function Y(K){if(K.key==="Tab"){K.preventDefault();const me=K.target,de=me.selectionStart,W=me.selectionEnd;u.value=u.value.substring(0,de)+"    "+u.value.substring(W),At(()=>{me.selectionStart=me.selectionEnd=de+4})}}function j(K){const me=K.target.previousElementSibling;me&&(me.scrollTop=K.target.scrollTop)}async function L(){t.value=!0,s.value=null;try{e.value=await z.get("/api/skills")}catch(K){s.value=K.message}t.value=!1}async function N(K){i.value=K,delete n.value[K],n.value={...n.value};try{const me=await z.post(`/api/skills/${encodeURIComponent(K)}/test`);n.value={...n.value,[K]:me}}catch(me){n.value={...n.value,[K]:{result:me.message,is_error:!0}}}i.value=null}function P(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function ae(K){r.value=!0,c.value="edit",d.value=K.name,u.value=K.code||"",p.value=null,h.value=null}function ne(){r.value=!1,p.value=null,h.value=null}async function U(){p.value=null,h.value=null;const K=d.value.trim(),me=u.value.trim();if(!K){p.value="Name is required";return}if(!me){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await z.post("/api/skills",{name:K,code:me}),h.value="Skill created successfully"):(await z.put(`/api/skills/${encodeURIComponent(K)}`,{code:me}),h.value="Skill updated successfully"),await L(),setTimeout(()=>{r.value=!1},800)}catch(de){p.value=de.message}m.value=!1}function J(K){A.value=K}async function ie(){if(A.value){I.value=!0;try{await z.del(`/api/skills/${encodeURIComponent(A.value)}`),await L()}catch(K){ke.error(`Failed to delete skill: ${K.message||"unknown error"}`)}I.value=!1,A.value=null}}return Ge(()=>{L()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:g,deleteTarget:A,deleting:I,enabledCount:y,totalExecutions:v,totalLines:b,displayedSkills:x,editLineCount:_,editorLineNums:E,editValidation:C,highlight:w,truncate:Pd,formatTs:Ln,countLines:R,getLineNumbers:B,toggleCode:S,copyCode:F,handleEditorKey:Y,syncScroll:j,fetchSkills:L,testSkill:N,showCreate:P,editSkill:ae,cancelEdit:ne,saveSkill:U,confirmDelete:J,doDelete:ie}}};class $s extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Hk=/^[A-Za-z_][A-Za-z0-9_]*$/;function Sp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Tp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new $s(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new $s(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new $s(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new $s(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function zk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function jk(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new $s("Server name is required.","name");if(n.length>128||!Hk.test(n))throw new $s("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new $s("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=Sp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new $s("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new $s("An HTTP endpoint is required for this connection.","url");if(d&&!zk(d))throw new $s("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new $s("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=Sp(e.allowlistText));const r=Tp(e.headerRows,e.headersRemove,"Header"),c=Tp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Vk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function qk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Gk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Wk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Kk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Jk=1e4,Zk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Br(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Yk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Qk={template:`
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
          <form class="mcp-publication-limits" @submit.prevent="saveLimits" aria-label="MCP publication limits" :aria-busy="limitsSaving ? 'true' : 'false'">
            <label class="mcp-field">
              <span>Published tools per server</span>
              <input class="hm-input" type="number" min="1" max="128" step="1" required
                :value="limitDraft.max_published_tools_per_server"
                @input="editLimit('max_published_tools_per_server', $event.target.value)"
                :disabled="mutating || !limitsAvailable" aria-describedby="mcp-limits-help" />
              <small>1-128 tools. The global limit also applies.</small>
            </label>
            <label class="mcp-field">
              <span>Published tools across MCP</span>
              <input class="hm-input" type="number" min="1" max="256" step="1" required
                :value="limitDraft.max_published_tools_global"
                @input="editLimit('max_published_tools_global', $event.target.value)"
                :disabled="mutating || !limitsAvailable" aria-describedby="mcp-limits-help" />
              <small>1-256 tools total. Excludes built-in tools and skills.</small>
            </label>
            <button type="submit" class="btn btn-primary text-xs" :disabled="mutating || !limitsAvailable || !limitDirty.size">{{ limitsSaving ? 'Saving…' : 'Save limits' }}</button>
            <p id="mcp-limits-help" class="mcp-limits-help">No restart needed. New limits apply on the next publication or tools refresh; saving does not remove existing tools. Use Refresh tools on a server to apply now. Larger catalogs use more context and may exceed the model provider's total tool limit.</p>
            <p v-if="limitsError" class="mcp-limits-error" role="alert">{{ limitsError }}</p>
          </form>
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=V(()=>Object.keys(i.value).every(Q=>{var we;return Number.isInteger((we=e.value)==null?void 0:we[Q])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),h=f({}),m=f(new Set),g=f(!1),A=f("add"),I=f(""),y=f(null),v=f(Br()),b=f(""),x=f(!1);let _=null,E=0,C=!1,w=!1;const R=Wk,B=V(()=>{var Q;return((Q=e.value)==null?void 0:Q.servers)||[]}),S=V(()=>{var Q;return!!((Q=e.value)!=null&&Q.enabled)}),F=V(()=>{var Q,we,fe,Ie;return{serverCount:((Q=e.value)==null?void 0:Q.server_count)||0,enabledCount:((we=e.value)==null?void 0:we.enabled_server_count)||0,connectedCount:((fe=e.value)==null?void 0:fe.connected_count)||0,toolCount:((Ie=e.value)==null?void 0:Ie.published_tool_count)||0}}),Y=V(()=>{var Q;return((Q=y.value)==null?void 0:Q.header_keys)||[]}),j=V(()=>{var Q;return((Q=y.value)==null?void 0:Q.env_keys)||[]}),L=V(()=>{var Q;return A.value==="edit"&&((Q=y.value)==null?void 0:Q.transport)==="http"}),N=V(()=>A.value==="add"||!L.value),P=V(()=>L.value?"Replace endpoint URL":"Endpoint URL"),ae=V(()=>L.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function ne(){U(),_=window.setInterval(()=>J({quiet:!0}),Jk)}function U(){_&&window.clearInterval(_),_=null}async function J({quiet:Q=!1}={}){if(a.value)return;const we=++E;Q||(t.value=!0);try{const fe=await z.get("/api/mcp/status");if(we!==E||!C)return;e.value=fe;for(const se of Object.keys(i.value))!l.value.has(se)&&Number.isInteger(fe[se])&&(i.value[se]=String(fe[se]));r.value="";const Ie=new Set((fe.servers||[]).map(se=>se.name));d.value=new Set([...d.value].filter(se=>Ie.has(se)))}catch(fe){we===E&&C&&(r.value=fe.message||"Failed to load MCP status")}finally{we===E&&(t.value=!1)}}function ie(Q){return s.value||c.value.has(Q)}function K(Q,we){const fe=new Set(c.value);we?fe.add(Q):fe.delete(Q),c.value=fe}function me(Q){return qk(Q.state)}function de(Q){if(me(Q)==="disabled"){if(!Q.enabled)return"Disabled — server switch off";if(!S.value)return"Disabled — global MCP is off"}return Zk[me(Q)]}function W(Q){return Q.transport==="http"?"Streamable HTTP":"stdio"}function pe(Q){return Q.negotiated_version?`${Q.era?`${String(Q.era).charAt(0).toUpperCase()}${String(Q.era).slice(1)}`:"Protocol"} · ${Q.negotiated_version}`:"Not negotiated"}function ge(Q){return Q.discovered_count?`${Q.published_count||0} published · ${Q.excluded_count||0} excluded`:"No tools discovered"}const ye=f(new Set);async function _e(Q,we){if(ye.value.has(Q.name))return;const fe=!!we.target.checked,Ie=new Set(ye.value);Ie.add(Q.name),ye.value=Ie;try{const se=await z.post(`/api/mcp/servers/${encodeURIComponent(Q.name)}/enabled`,{enabled:fe});se&&Array.isArray(se.servers)?e.value=se:await J({quiet:!0})}catch(se){we.target.checked=!!Q.enabled,ke.error(se.message||`Failed to toggle ${Q.name}`)}finally{const se=new Set(ye.value);se.delete(Q.name),ye.value=se}}function Ne(Q,we){var Ie;i.value[Q]=we;const fe=new Set(l.value);we===String((Ie=e.value)==null?void 0:Ie[Q])?fe.delete(Q):fe.add(Q),l.value=fe,n.value=""}async function T(){if(s.value||!o.value||!l.value.size)return;const Q={};for(const we of l.value){const fe=Number(i.value[we]),Ie=we==="max_published_tools_per_server"?128:256;if(!Number.isInteger(fe)||fe<1||fe>Ie){n.value=`Enter a whole number between 1 and ${Ie}.`;return}Q[we]=fe}a.value=!0,s.value=!0,n.value="",++E,t.value=!1;try{const we=await z.post("/api/mcp/limits",Q);e.value=we;for(const fe of Object.keys(i.value))Number.isInteger(we[fe])&&(i.value[fe]=String(we[fe]));l.value=new Set,ke.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(we){n.value=we.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await J({quiet:!0})}}async function M(Q){if(Q!==S.value&&!(!Q&&!await qt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await z.post("/api/mcp/enabled",{enabled:Q}),ke.success(Q?"MCP enabled":"MCP disabled"),await J({quiet:!0})}catch(we){ke.error(we.message||"Failed to update MCP state"),await J({quiet:!0})}finally{s.value=!1}}}async function q(Q){K(Q.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(Q.name)}/reconnect`,{}),ke.success(`Reconnected ${Q.name}`)}catch(we){ke.error(we.message||`Failed to reconnect ${Q.name}`)}finally{K(Q.name,!1),await J({quiet:!0})}}async function re(Q){K(Q.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(Q.name)}/refresh-tools`,{}),ke.success(`Refreshed tools from ${Q.name}`),await ue(Q.name,!0)}catch(we){ke.error(we.message||`Failed to refresh ${Q.name}`)}finally{K(Q.name,!1),await J({quiet:!0})}}async function $(Q){if(await qt({title:`Remove ${Q.name}`,message:`Remove this saved MCP server? Its ${Q.published_count||0} published tool${Q.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){K(Q.name,!0);try{await z.del(`/api/mcp/servers/${encodeURIComponent(Q.name)}`),ke.success(`Removed ${Q.name}`),delete p.value[Q.name]}catch(fe){ke.error(fe.message||`Failed to remove ${Q.name}`)}finally{K(Q.name,!1),await J({quiet:!0})}}}async function Z(Q){const we=new Set(d.value);if(we.has(Q.name)){we.delete(Q.name),d.value=we;return}we.add(Q.name),d.value=we,Object.hasOwn(p.value,Q.name)||await ue(Q.name)}async function ue(Q,we=!1){if(!we&&Object.hasOwn(p.value,Q))return;const fe=new Set(m.value);fe.add(Q),m.value=fe,h.value={...h.value,[Q]:""};try{const Ie=await z.get(`/api/mcp/servers/${encodeURIComponent(Q)}/tools`);p.value={...p.value,[Q]:Ie.tools||[]}}catch(Ie){h.value={...h.value,[Q]:Ie.message||"Failed to load tools"}}finally{const Ie=new Set(m.value);Ie.delete(Q),m.value=Ie}}function H(Q){return(p.value[Q]||[]).filter(we=>Gk(we,u.value[Q]))}function ee(Q,we){u.value={...u.value,[Q]:we}}function X(){A.value="add",I.value="",y.value=null,v.value=Br(),b.value="",g.value=!0}function be(Q){A.value="edit",I.value=Q.name,y.value=Q,v.value={...Br(),name:Q.name,enabled:!!Q.enabled,transport:Q.transport||"stdio"},b.value="",g.value=!0}function he(){x.value||(g.value=!1)}function xe(Q){g.value&&Kk(Q)}function Ae(Q){const we=Q==="headers"?"headerRows":"envRows";v.value[we].push({key:"",value:""})}function Le(Q,we){const fe=Q==="headers"?"headerRows":"envRows";v.value[fe].splice(we,1)}function $e(Q,we){const fe=Q==="headers"?"headersRemove":"envRemove",Ie=v.value[fe];v.value[fe]=Ie.includes(we)?Ie.filter(se=>se!==we):[...Ie,we]}async function Me(){var we,fe;b.value="";let Q;try{Q=jk(v.value,{mode:A.value,originalTransport:((we=y.value)==null?void 0:we.transport)||""})}catch(Ie){b.value=Ie instanceof $s?Ie.message:"Invalid MCP server configuration",await At(),(fe=document.querySelector(".mcp-editor"))==null||fe.scrollTo({top:0,behavior:"smooth"});return}if(!(A.value==="edit"&&Vk(Q,y.value)&&!await qt({title:`Change ${I.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){x.value=!0;try{A.value==="add"?await z.post("/api/mcp/servers",Q):await z.put(`/api/mcp/servers/${encodeURIComponent(I.value)}`,Q),ke.success(A.value==="add"?`Saved ${Q.name}`:`Updated ${I.value}`),g.value=!1,await J({quiet:!0})}catch(Ie){b.value=Ie.message||"Failed to save MCP server"}finally{x.value=!1}}}let Fe=null;function Ue(Q){`${(Q==null?void 0:Q.event)||""} ${(Q==null?void 0:Q.type)||""} ${(Q==null?void 0:Q.tool)||""} ${(Q==null?void 0:Q.message)||""}`.toLowerCase().includes("mcp")&&(Fe&&window.clearTimeout(Fe),Fe=window.setTimeout(()=>J({quiet:!0}),200))}function Ye(){C||(C=!0,w||(Xe.subscribe("events",Ue),w=!0),J(),ne())}function je(){C=!1,U(),Fe&&window.clearTimeout(Fe),Fe=null,w&&(Xe.unsubscribe("events",Ue),w=!1)}return Ge(Ye),Xt(Ye),Ut(je),ut(je),{status:e,loading:t,mutating:s,pageError:r,servers:B,masterEnabled:S,aggregate:F,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Ne,saveLimits:T,expandedServers:d,toolQueries:u,toolErrors:h,toolsLoading:m,editorOpen:g,editorMode:A,editingName:I,editingServer:y,form:v,formError:b,saving:x,editorGroups:R,configuredHeaderKeys:Y,configuredEnvKeys:j,savedHttpEndpoint:L,endpointRequired:N,endpointFieldLabel:P,endpointPlaceholder:ae,refreshAll:J,busy:ie,serverState:me,stateLabel:de,transportLabel:W,protocolLabel:pe,toolSummary:ge,formatAge:Yk,setMasterEnabled:M,togglePending:ye,toggleServerEnabled:_e,reconnect:q,refreshTools:re,removeServer:$,toggleTools:Z,filteredTools:H,setToolQuery:ee,openAdd:X,openEdit:be,closeEditor:he,jumpToEditorGroup:xe,addSecretRow:Ae,removeSecretRow:Le,toggleSecretRemoval:$e,saveServer:Me}}};function Xk(e,t){if(!e||!t)return yp(e);const s=yp(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const eS={template:`
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
              <div v-if="loadingChunks[s.source || s.name || s]" class="kb-chunk-loading">
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
              <div v-else-if="chunkErrors[s.source || s.name || s]" class="kb-chunk-empty kb-chunk-error text-xs">Couldn't load chunks — {{ chunkErrors[s.source || s.name || s] }}. Collapse and expand to retry.</div>
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),g=f(null);let A=null;const I=f(null),y=f(!1),v=f({}),b=f({}),x=f({}),_=f({}),E=new Map,C=f(null),w=V(()=>e.value.reduce((U,J)=>U+(J.chunks||0),0)),R=V(()=>new Set(e.value.map(J=>J.uploader).filter(Boolean)).size);function B(U,J){const ie=b.value[J];if(!ie||ie.length===0)return 0;const K=Math.max(...ie.map(me=>me.char_count||0));return K===0?0:Math.round(U.char_count/K*100)}async function S(){t.value=!0,s.value=null;try{const U=await z.get("/api/knowledge");e.value=Array.isArray(U)?U:[]}catch(U){s.value=U.message}t.value=!1}async function F(U){if(v.value[U]){v.value[U]=!1,C.value=null;return}if(v.value[U]=!0,Object.prototype.hasOwnProperty.call(b.value,U))return;if(E.has(U))return E.get(U);const J={..._.value,[U]:!0};_.value=J;const ie={...x.value};delete ie[U],x.value=ie;const K=z.get(`/api/knowledge/${encodeURIComponent(U)}/chunks`).then(me=>{b.value={...b.value,[U]:Array.isArray(me)?me:[]}}).catch(me=>{x.value={...x.value,[U]:me.message||"load failed"}}).finally(()=>{if(E.get(U)!==K)return;E.delete(U);const me={..._.value};delete me[U],_.value=me});return E.set(U,K),K}let Y=0;async function j(){const U=a.value.trim();if(!U)return;const J=++Y;i.value=!0,o.value=null,l.value=U;try{const ie=await z.get(`/api/knowledge/search?q=${encodeURIComponent(U)}`);if(J!==Y)return;n.value=Array.isArray(ie)?ie:[]}catch(ie){if(J!==Y)return;n.value=[],o.value=ie.message||"Search failed"}J===Y&&(i.value=!1)}function L(){Y+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function N(){u.value=null,p.value=null;const U=c.value.trim(),J=d.value.trim();if(!U){u.value="Source name is required";return}if(!J){u.value="Content is required";return}h.value=!0;try{const ie=await z.post("/api/knowledge",{source:U,content:J});p.value=`Ingested ${ie.chunks||0} chunks from "${U}"`,c.value="",d.value="",b.value={},await S(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(ie){u.value=ie.message}h.value=!1}async function P(U){m.value=U,g.value=null,A&&(clearTimeout(A),A=null);try{const J=await z.post(`/api/knowledge/${encodeURIComponent(U)}/reingest`);g.value={source:U,error:!1,message:`Re-ingested ${J.chunks||0} chunks`},delete b.value[U],await S(),A=setTimeout(()=>{g.value=null,A=null},3e3)}catch(J){g.value={source:U,error:!0,message:J.message}}m.value=null}function ae(U){I.value=U}async function ne(){if(I.value){y.value=!0;try{await z.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete b.value[I.value],await S()}catch(U){ke.error(`Failed to delete source: ${U.message||"unknown error"}`)}y.value=!1,I.value=null}}return Ge(()=>{S()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:g,deleteTarget:I,deleting:y,expanded:v,sourceChunks:b,chunkErrors:x,loadingChunks:_,selectedChunk:C,totalChunks:w,uploaderCount:R,truncate:Pd,formatTs:Ln,highlightTerms:Xk,chunkBarWidth:B,fetchSources:S,toggleSource:F,doSearch:j,clearSearch:L,doIngest:N,doReingest:P,confirmDelete:ae,doDelete:ne}}},tS={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),g=f(null),A=f(null),I=f(new Set),y=f(null),v=f(!1),b=f(!1),x=V(()=>e.value.reduce((J,ie)=>J+ie.count,0)),_=V(()=>I.value.size);function E(J){const ie=t.value[J];if(!ie)return[];if(!l.value.trim())return ie;const K=l.value.trim().toLowerCase();return ie.filter(me=>me.key.toLowerCase().includes(K)||me.value&&me.value.toLowerCase().includes(K))}function C(J,ie){return I.value.has(J+"/"+ie)}function w(J,ie){const K=J+"/"+ie,me=new Set(I.value);me.has(K)?me.delete(K):me.add(K),I.value=me}function R(J){const ie=t.value[J];return!ie||ie.length===0?!1:ie.every(K=>I.value.has(J+"/"+K.key))}function B(J,ie){const K=t.value[J];if(!K)return;const me=new Set(I.value);for(const de of K){const W=J+"/"+de.key;ie?me.add(W):me.delete(W)}I.value=me}async function S(){s.value=!0,a.value=null;try{const J=await z.get("/api/memory");e.value=Object.entries(J).map(([ie,K])=>({name:ie,keys:K.keys||[],count:K.count||0}))}catch(J){a.value=J.message}s.value=!1}async function F(J){if(n.value[J]){n.value[J]=!1;return}n.value[J]=!0;const ie=e.value.find(me=>me.name===J);if(!ie||t.value[J]||i.value===J)return;i.value=J;let K;try{const de=(await z.get(`/api/memory/${encodeURIComponent(J)}`)).entries||{};K=ie.keys.map(W=>Object.prototype.hasOwnProperty.call(de,W)?{key:W,value:de[W]||"",failed:!1}:{key:W,value:"",failed:!0,error:"Not found in scope"})}catch(me){K=ie.keys.map(de=>({key:de,value:"",failed:!0,error:me.message||"Failed to load"}))}t.value[J]=K,i.value=null}function Y(J,ie,K){p.value=J+"/"+ie,h.value=K}async function j(J,ie){m.value=!0,g.value=null;try{await z.put(`/api/memory/${encodeURIComponent(J)}/${encodeURIComponent(ie)}`,{value:h.value});const K=t.value[J];if(K){const me=K.find(de=>de.key===ie);me&&(me.value=h.value)}p.value=null}catch(K){g.value=`Failed to save: ${K.message||"unknown error"}`}m.value=!1}async function L(J,ie){try{await navigator.clipboard.writeText(ie.value),A.value=J+"/"+ie.key,setTimeout(()=>{A.value=null},1500)}catch{}}async function N(){d.value=null,u.value=null;const J=r.value.scope.trim(),ie=r.value.key.trim(),K=r.value.value.trim();if(!J){d.value="Scope is required";return}if(!ie){d.value="Key is required";return}if(!K){d.value="Value is required";return}c.value=!0;try{await z.put(`/api/memory/${encodeURIComponent(J)}/${encodeURIComponent(ie)}`,{value:K}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await S(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(me){d.value=me.message}c.value=!1}function P(J,ie){y.value={scope:J,key:ie}}async function ae(){if(!y.value)return;v.value=!0,g.value=null;const{scope:J,key:ie}=y.value;try{await z.del(`/api/memory/${encodeURIComponent(J)}/${encodeURIComponent(ie)}`);const K=t.value[J];K&&(t.value[J]=K.filter(W=>W.key!==ie));const me=e.value.find(W=>W.name===J);me&&(me.count--,me.keys=me.keys.filter(W=>W!==ie));const de=new Set(I.value);de.delete(J+"/"+ie),I.value=de}catch(K){g.value=`Failed to delete: ${K.message||"unknown error"}`}v.value=!1,y.value=null}function ne(){b.value=!0}async function U(){v.value=!0,g.value=null;const J=[];for(const ie of I.value){const K=ie.indexOf("/");J.push({scope:ie.slice(0,K),key:ie.slice(K+1)})}try{await z.post("/api/memory/bulk-delete",{entries:J}),I.value=new Set,t.value={},await S()}catch(ie){g.value=`Bulk delete failed: ${ie.message||"unknown error"}`}v.value=!1,b.value=!1}return Ge(()=>{S()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:g,copied:A,selected:I,selectedCount:_,totalEntries:x,deleteTarget:y,deleting:v,showBulkDelete:b,fetchMemory:S,toggleScope:F,startEdit:Y,doEdit:j,copyValue:L,doAdd:N,confirmDelete:P,doDelete:ae,confirmBulkDelete:ne,doBulkDelete:U,isSelected:C,toggleSelect:w,isScopeAllSelected:R,toggleSelectAll:B,filteredEntries:E}}},sS={template:`
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

      <section class="hm-card mb-4" aria-labelledby="automatic-learning-title">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="automatic-learning-title" class="text-sm font-semibold text-gray-300">Automatic learning</h2>
            <p class="page-lede">When off, Odin neither creates automatic lessons nor adds stored learned entries to model context. Existing entries are retained.</p>
            <p v-if="configReady" class="text-xs text-gray-500 mt-2" role="status">Current state: {{ learningEnabled ? 'On' : 'Off' }}</p>
            <p v-else-if="configError" class="text-sm text-red-400 mt-2" role="alert">{{ configError }}</p>
            <p v-else class="text-xs text-gray-500 mt-2" role="status">Checking administrator configuration…</p>
          </div>
          <label v-if="configReady" class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-gray-400">{{ learningEnabled ? 'On' : 'Off' }}</span>
            <span class="toggle-switch" :aria-busy="savingConfig ? 'true' : 'false'">
              <input type="checkbox" :checked="learningEnabled" :disabled="savingConfig"
                     aria-label="Automatic learning" @change="setLearningEnabled($event.target.checked)" />
              <span class="toggle-slider"></span>
            </span>
          </label>
        </div>
      </section>

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
        <span class="empty-state-hint">Existing entries remain available whether automatic learning is on or off</span>
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=V(()=>[...new Set(e.value.map(_=>_.category))].sort()),p=V(()=>{const x={};return e.value.forEach(_=>{x[_.category]=(x[_.category]||0)+1}),x}),h=V(()=>n.value?e.value.filter(x=>x.category===n.value):e.value);function m(x){return x==="correction"?"badge-warning":x==="operational"?"badge-info":x==="preference"?"badge-success":"badge-info"}function g(x){i.value=x.key,l.value=x.content}async function A(x){try{await z.put("/api/learned/"+encodeURIComponent(x),{content:l.value}),i.value=null,ke.success("Entry updated"),await y()}catch(_){ke.error(_.message||"Failed to save entry")}}async function I(x){if(await qt({title:"Delete learned entry",message:`Delete "${x}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/learned/"+encodeURIComponent(x)),ke.success("Entry deleted"),await y()}catch(E){ke.error(E.message||"Failed to delete entry")}}async function y(){s.value=!0,a.value=null;try{const x=await z.get("/api/learned");e.value=x.entries||[],t.value={last_reflection:x.last_reflection,count:x.count}}catch(x){a.value=x.message}s.value=!1}async function v(){var x;r.value=!1,c.value=null;try{const _=await z.get("/api/config");o.value=((x=_.learning)==null?void 0:x.enabled)===!0,r.value=!0}catch(_){c.value=_.status===403?"Administrator access is required to change automatic learning.":_.message||"Automatic learning state is unavailable."}}async function b(x){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await z.put("/api/config",{learning:{enabled:x}}),await v(),!r.value)return;ke.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(_){r.value=!1,c.value=_.status===403?"Administrator access is required to change automatic learning.":_.message||"Failed to change automatic learning."}finally{d.value=!1}}}return Ge(()=>{y(),v()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:h,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:m,formatTs:Ln,startEdit:g,saveEdit:A,deleteEntry:I,fetchEntries:y,fetchLearningConfig:v,setLearningEnabled:b}}},bv=[{id:"tools",label:"Tools",component:Fk},{id:"skills",label:"Skills",component:Uk},{id:"mcp-servers",label:"MCP Servers",component:Qk},{id:"knowledge",label:"Knowledge",component:eS},{id:"memory",label:"Memory",component:tS},{id:"learned",label:"Learned",component:sS}],aS={components:{TabbedPage:dr},setup(){return{tabs:bv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},nS={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},iS={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},lS={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},oS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=V(()=>e.value.components||[]),l=V(()=>lS[e.value.overall]||"text-gray-400"),o=V(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=V(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return nS[_]||"text-gray-400"}function d(_){return iS[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function p(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function h(_){return _.replace(/_/g," ").replace(/\b\w/g,E=>E.toUpperCase())}function m(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function g(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function A(){n.value=!0;try{e.value=await z.get("/api/health/components"),s.value=null,a.value=!0}catch(_){s.value=_.message}finally{t.value=!1,n.value=!1}}function I(){t.value=!0,s.value=null,A()}let y=null,v=!1;function b(){v||(v=!0,A(),y||(y=setInterval(A,3e4)))}function x(){v&&(v=!1,y&&(clearInterval(y),y=null))}return Ge(b),Xt(b),Ut(x),ut(x),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:g,fetchHealth:A,retry:I}}},rS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=V(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=V(()=>{if(!i.value)return[];const A=i.value,I=A.storage_total_bytes||1;return[{label:"Session Persistence",mb:A.sessions.persist_dir.total_mb,bytes:A.sessions.persist_dir.total_bytes,files:A.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(A.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:A.knowledge.db_file.total_mb,bytes:A.knowledge.db_file.total_bytes,files:A.knowledge.db_file.file_count,pct:Math.min(100,Math.round(A.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:A.trajectories.message_dir.total_mb,bytes:A.trajectories.message_dir.total_bytes,files:A.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:A.trajectories.agent_dir.total_mb,bytes:A.trajectories.agent_dir.total_bytes,files:A.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const A=await z.get("/api/resource-usage");i.value=A,t.value=null,s.value=!0}catch(A){t.value=A.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function g(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),Xt(m),Ut(g),ut(g),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Md,refresh:u,retry:p}}},cS=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),dS=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function uS(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!dS.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?ml(t):""}function pS(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!cS.has(c)));s=Object.keys(r).length?ml(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Xa=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),vl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function fS(e){const t=Xa(e)?e:{},s=Xa(t.metadata)?t.metadata:{},a=Xa(t.audit_metadata)?t.audit_metadata:{},n=Xa(t.turn)?t.turn:{},i=l=>vl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function Cp(e){return e.record?JSON.stringify(yv(e),null,2):e.text}function yv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Ec(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function Ep(e){if(!Ec(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,vl(s.channel_id),vl(s.user_id??s.actor)])}function hS(e,t,s=2e3){var i,l,o;const a=Ep(t),n=a?e.findIndex(r=>Ep(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:Ec(y)==="end"?1:0,p=[...c].sort((y,v)=>u(y)-u(v)),h=Object.assign({},...p);h.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const v=p.filter(b=>Xa(b[y])).map(b=>b[y]);v.length&&(h[y]=Object.assign({},...v))}const m=c.some(y=>Ec(y)!=="start"),g=c.find(y=>Ac(y,0).level==="ERROR"),A=(g==null?void 0:g.status)||((i=g==null?void 0:g.metadata)==null?void 0:i.status);h.status=g?["failed","error","cancelled","denied","outcome_unknown"].includes(A)?A:"failed":m?h.status||((l=h.metadata)==null?void 0:l.status)||"succeeded":"started",m&&h.status==="started"&&(h.status="succeeded"),g&&(h.error=g.error||((o=g.metadata)==null?void 0:o.error)||h.error);const I=Ac(h,r.id,r._time);Object.assign(I,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,I)}e.length>s&&e.splice(0,e.length-s)}function Ac(e,t,s=new Date){var u,p;let a=e;if(Xa(e)&&e.type==="log"&&"line"in e?a=e.line:Xa(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=Xa(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(h=>["failed","error","cancelled","denied","outcome_unknown"].includes(h))?"ERROR":vl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:vl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:fS(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function mS(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const vS={components:{ToolOutput:ur},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=V(()=>pS(e.entry)),s=V(()=>{var o;return ml(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=V(()=>{var o,r,c;return ml(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=V(()=>uS(e.entry.record)),i=V(()=>yv(e.entry)),l=V(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
    <article class="log-line log-compact-line min-w-0"
             :class="{ 'log-line-error': entry.level === 'ERROR', 'log-line-warning': entry.level === 'WARNING' }"
             :data-log-id="entry.id">
      <tool-output presentation="compact" :value="display.body" :raw-value="rawRecord || undefined" :record-id="entry.id" label="Live log record"
                   :has-context="display.status !== '' || display.duration !== null || Boolean(entry.attribution.agentId || argumentsText)">
        <template #header>
          <button class="log-ts text-gray-500 hover:text-gray-300" @click="$emit('copy', entry)"
                  title="Copy complete retained record">{{ entry.ts }}</button>
          <span class="log-level" :class="entry.level === 'ERROR' ? 'text-red-400' : 'text-blue-400'">{{ entry.level }}</span>
          <span v-if="display.action" class="log-compact-action"
                :class="{ 'log-compact-web-action': entry.record?.type === 'web_action' }" :title="display.action">{{ display.action }}</span>
          <span v-if="display.action" class="output-control-separator" aria-hidden="true"> | </span>
        </template>
        <template #context>
          <span v-if="display.status !== ''" class="text-gray-400">{{ display.status }}</span>
          <span v-if="display.duration !== null" class="text-gray-500">{{ display.duration }}ms</span>
          <span v-if="entry.attribution.agentId" class="log-compact-agent text-gray-400" :title="entry.attribution.agentId">{{ entry.attribution.label || entry.attribution.agentId }}</span>
          <span v-if="argumentsText" class="log-compact-arguments text-gray-500" data-log-arguments :title="argumentsText">{{ argumentsText }}</span>
        </template>
        <template #details>
          <div class="log-compact-attribution text-gray-500">
            <span v-if="entry.attribution.agentId">Agent {{ entry.attribution.label || entry.attribution.agentId }} ({{ entry.attribution.agentId }})</span>
            <span v-if="entry.attribution.turnId">turn {{ entry.attribution.turnId }}</span>
            <span v-if="entry.attribution.parentId">parent {{ entry.attribution.parentId }}</span>
            <span v-if="entry.attribution.rootId">root {{ entry.attribution.rootId }}</span>
            <span v-if="entry.attribution.iteration">iteration {{ entry.attribution.iteration }}</span>
            <span v-if="entry.attribution.callId">call {{ entry.attribution.callId }}</span>
          </div>
          <div v-if="argumentsText" class="log-compact-detail-arguments">
            <div class="text-gray-500">Arguments</div>
            <pre class="output-body output-wrapped">{{ argumentsText }}</pre>
          </div>
          <div v-if="errorText && errorText !== display.body" class="text-red-400">
            <span>Error</span><pre class="output-body output-wrapped">{{ errorText }}</pre>
          </div>
          <div v-if="metadataText" class="log-compact-metadata">
            <span class="text-gray-500">Metadata</span><pre class="output-body output-wrapped">{{ metadataText }}</pre>
          </div>
          <div v-if="entry.events" class="log-compact-lifecycle">
            <span class="text-gray-500">Retained lifecycle evidence ({{ lifecycle.length }} events)</span>
            <div v-for="(event, index) in lifecycle" :key="index">{{ event.type }} · {{ event.timestamp }} {{ event.status }}</div>
          </div>
        </template>
      </tool-output>
    </article>`},gS=["INFO","WARNING","ERROR"],bS=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Ur=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],yS=[50,100,200,500],xS={components:{ToolOutput:ur,LogRecord:vS},template:`
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
          <label class="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-pointer">
            <input type="checkbox" v-model="groupByTurn" class="rounded" />
            Group by turn / agent
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
          <span class="font-mono">{{ filteredLogs.length.toLocaleString() }} / {{ logs.length.toLocaleString() }} records</span>
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
            <template v-if="groupByTurn">
              <section v-for="group in groupedLogs" :key="group.key" class="mb-3 min-w-0" data-log-group>
                <h2 class="text-sm font-semibold text-gray-300 break-all">{{ group.title }} · {{ group.count }} records</h2>
                <section v-for="section in group.sections" :key="section.key" class="pl-3 border-l border-gray-700 min-w-0" data-log-agent>
                  <h3 class="text-xs text-gray-400 mt-2 break-all">{{ section.title }}<span v-if="section.parentId"> · parent {{ section.parentId }}</span><span v-if="section.rootId"> · root {{ section.rootId }}</span></h3>
                  <log-record v-for="entry in section.entries" :key="entry.id" :entry="entry" @copy="copyLine" />
                </section>
              </section>
            </template>
            <template v-else>
              <log-record v-for="entry in filteredLogs" :key="entry.id" :entry="entry" @copy="copyLine" />
            </template>
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
                    <tool-output :value="entry.tool_input" />
                  </div>
                  <div v-if="entry.result_summary">
                    <div class="text-gray-500 mb-1">Result:</div>
                    <tool-output :value="entry.result_summary" />
                  </div>
                  <div v-if="entry.error" class="mt-2">
                    <div class="text-red-400 mb-1">Error:</div>
                    <tool-output :value="entry.error" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(Xe.state||"disconnected"),u=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),g=2e3,A=gS,I=bS,y=Ur,v=f("all"),b=f(""),x=f([]),_=f(!1),E=f(""),C=f([]);function w(){try{const le=localStorage.getItem("odin-log-presets");le&&(x.value=JSON.parse(le))}catch{}}function R(){try{localStorage.setItem("odin-log-presets",JSON.stringify(x.value))}catch{}}const B=V(()=>l.value!==""||o.value.trim()!==""||b.value!==""),S=V(()=>{const le=Ur.find(Te=>Te.value===b.value);return le?le.label:""}),F=V(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(le){return le.message}}),Y=24,j=V(()=>{if(J.value.length===0)return[];const le=[],Te=new Date,He=3600*1e3;for(let Je=Y-1;Je>=0;Je--){const _t=new Date(Te.getTime()-(Je+1)*He),nt=new Date(Te.getTime()-Je*He);le.push({start:_t,end:nt,label:ae(_t,nt),shortLabel:nt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Je of J.value){if(!Je._time)continue;const _t=Je._time.getTime();for(const nt of le)if(_t>=nt.start.getTime()&&_t<nt.end.getTime()){nt.total++,Je.level==="ERROR"?nt.errors++:Je.level==="WARNING"?nt.warnings++:nt.info++;break}}return le}),L=V(()=>{let le=1;for(const Te of j.value)Te.total>le&&(le=Te.total);return le}),N=V(()=>{if(j.value.length===0)return"";const le=J.value.map(Je=>Je._time&&Je._time.getTime()).filter(Boolean);if(le.length===0)return"";const Te=new Date(Math.min(...le));return`${J.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),P=V(()=>Math.ceil(Y/8));function ae(le,Te){const He={hour:"2-digit",minute:"2-digit"};return le.toLocaleTimeString([],He)+" - "+Te.toLocaleTimeString([],He)}function ne(le,Te){return!Te||!le?"0px":Math.max(2,le/Te*100)+"%"}function U(le){const Te=J.value.findIndex(He=>He._time&&He._time.getTime()>=le.start.getTime()&&He._time.getTime()<le.end.getTime());if(Te>=0&&p.value){const He=p.value.querySelector('[data-log-id="'+J.value[Te].id+'"]');He&&(He.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const J=V(()=>{let le=t.value;if(l.value&&(le=le.filter(Te=>(Te.level||"INFO")===l.value)),b.value){const Te=Ur.find(He=>He.value===b.value);if(Te&&Te.seconds){const He=new Date(Date.now()-Te.seconds*1e3);le=le.filter(Je=>Je._time&&Je._time>=He)}}if(o.value&&!F.value)if(r.value)try{const Te=new RegExp(o.value,"i");le=le.filter(He=>{const Je=He.searchText,_t=He.tool||"";return Te.test(Je)||Te.test(_t)})}catch{}else{const Te=o.value.toLowerCase();le=le.filter(He=>{const Je=He.searchText.toLowerCase(),_t=(He.tool||"").toLowerCase();return Je.includes(Te)||_t.includes(Te)})}return le}),ie=V(()=>mS(J.value));function K(le){const Te=Ac(le,++s);if(n.value){C.value.push(Te);return}me(Te)}function me(le){hS(t.value,le,g),i.value&&At(()=>de())}function de(le=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:le?"smooth":"instant"})}function W(){i.value=!0,h.value=!1,At(()=>de(!0))}const pe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function ge(){const le=p.value;if(!le)return;const Te=le.scrollHeight-le.scrollTop-le.clientHeight<40;h.value=!i.value&&!Te&&t.value.length>0,T.value&&ye()}function ye(){const le=p.value;!le||!i.value||le.scrollHeight-le.scrollTop-le.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function _e(){i.value&&requestAnimationFrame(ye)}function Ne(le){pe.has(le.key)&&_e()}const T=f(!1);function M(){i.value&&(T.value=!0,requestAnimationFrame(ye))}function q(){T.value&&(T.value=!1,ye())}function re(){i.value&&(h.value=!1,At(()=>de()))}function $(){if(n.value=!n.value,!n.value&&C.value.length>0){for(const le of C.value)me(le);C.value=[]}}function Z(){t.value=[],C.value=[],h.value=!1}function ue(){let le;e.value==="search"?le=De.value.map(_t=>{const nt=_t.error?"ERROR":"INFO",fa=_t.tool_name?`[${_t.tool_name}] `:"";return`${_t.timestamp||""} ${nt} ${fa}${_t.result_summary||_t.message||""}`}).join(`
`):le=J.value.map(Cp).join(`

`);const Te=new Blob([le],{type:"text/plain"}),He=URL.createObjectURL(Te),Je=document.createElement("a");Je.href=He,Je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Je.click(),URL.revokeObjectURL(He)}function H(le){const Te=Cp(le);navigator.clipboard.writeText(Te).then(()=>{m.value=le.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function ee(le){l.value=l.value===le?"":le,v.value="all"}function X(le){return le.level==="ERROR"?"log-line-error":le.level==="WARNING"?"log-line-warning":"text-gray-300"}function be(le){return le==="ERROR"?"text-red-500 font-semibold":le==="WARNING"?"text-yellow-500":"text-blue-500"}function he(le){return le==="ERROR"?"log-chip-error":le==="WARNING"?"log-chip-warning":"log-chip-info"}function xe(le){v.value=le.id;const Te=le.filters;l.value=Te.level||"",b.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Ae(le){v.value=le.id,l.value=le.filters.level||"",b.value=le.filters.timeRange||"",o.value=le.filters.text||""}function Le(){if(!E.value.trim())return;const le={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};x.value=[...x.value,le],R(),_.value=!1,E.value=""}function $e(le){x.value=x.value.filter(Te=>Te.id!==le),R(),v.value===le&&(v.value="all")}const Me=f("all"),Fe=f(""),Ue=f(""),Ye=f(""),je=f(""),Q=f(""),we=f(100),fe=yS,Ie=f(!1),se=f(!1),Re=f(""),De=f([]),st=f(null),Gt=f(null);function rt(){e.value="search",st.value||xt()}async function xt(){try{st.value=await z.get("/api/logs/stats")}catch{}}function Mt(){const le=Q.value;if(!le){Ye.value="",je.value="";return}const He={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[le];if(He){const Je=new Date(Date.now()-He*1e3);Ye.value=vs(Je),je.value=""}}function vs(le){const Te=He=>String(He).padStart(2,"0");return`${le.getFullYear()}-${Te(le.getMonth()+1)}-${Te(le.getDate())}T${Te(le.getHours())}:${Te(le.getMinutes())}`}function Qs(le){if(!le)return"";const Te=new Date(le);return isNaN(Te.getTime())?"":Te.toISOString()}async function Wt(){Ie.value=!0,Re.value="",se.value=!0,Gt.value=null;try{const le=new URLSearchParams;Me.value&&Me.value!=="all"&&le.set("level",Me.value),Fe.value&&le.set("tool",Fe.value),Ue.value&&le.set("q",Ue.value);const Te=Qs(Ye.value),He=Qs(je.value);Te&&le.set("start",Te),He&&le.set("end",He),le.set("limit",String(we.value));const Je=await z.get(`/api/logs/search?${le.toString()}`);De.value=Je.entries||[]}catch(le){Re.value=le.message||"Search failed",De.value=[]}finally{Ie.value=!1}}function Ht(){Me.value="all",Fe.value="",Ue.value="",Ye.value="",je.value="",Q.value="",we.value=100,De.value=[],se.value=!1,Re.value="",Gt.value=null}function gs(le){Gt.value=Gt.value===le?null:le}function bs(le){if(!le.timestamp)return"";try{return new Date(le.timestamp).toLocaleString()}catch{return le.timestamp}}function es(le){return le.type==="web_action"?`${le.status||""} (${le.execution_time_ms||0}ms)`:(le.result_summary||"").slice(0,200)}function Ds(le){return le.error?"log-line-error":"text-gray-300"}function nn(le){try{return JSON.stringify(le,null,2)}catch{return String(le)}}let Vs=null,at=!1;function rs(){at||(at=!0,Xe.subscribe("logs",K),c.value=Xe.connected,d.value=Xe.state||"disconnected",Vs=Xe.onState(le=>{d.value=le,c.value=le==="connected"}))}function Ha(){at&&(at=!1,Xe.unsubscribe("logs",K),Vs&&(Vs(),Vs=null))}return Ge(()=>{w(),window.addEventListener("pointerup",q),window.addEventListener("pointercancel",q)}),Xt(rs),Ut(Ha),ut(()=>{Ha(),window.removeEventListener("pointerup",q),window.removeEventListener("pointercancel",q)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:ie,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:J,pauseBuffer:C,showJumpBottom:h,copiedIndex:m,regexError:F,levels:A,logPresets:I,timeRanges:y,timeRange:b,activeLogPreset:v,customLogPresets:x,showSaveLogPreset:_,newLogPresetName:E,hasActiveLogFilters:B,timeRangeLabel:S,timelineBuckets:j,timelineMax:L,timelineSpanLabel:N,timelineLabelSkip:P,togglePause:$,clearLogs:Z,exportLogs:ue,logLineClass:X,levelClass:be,levelChipClass:he,toggleLevel:ee,copyLine:H,jumpToBottom:W,onScroll:ge,onUserScrollIntent:_e,onUserScrollKey:Ne,onAutoScrollToggle:re,onPointerDown:M,applyLogPreset:xe,applyCustomLogPreset:Ae,saveLogCustomPreset:Le,removeLogCustomPreset:$e,segmentHeight:ne,jumpToTimelineBucket:U,searchLevel:Me,searchTool:Fe,searchKeyword:Ue,searchStart:Ye,searchEnd:je,searchTimePreset:Q,searchLimit:we,searchLimits:fe,searching:Ie,searchRan:se,searchError:Re,searchResults:De,searchStats:st,expandedSearch:Gt,switchToSearch:rt,runSearch:Wt,clearSearchFilters:Ht,toggleSearchExpand:gs,formatSearchTs:bs,searchEntryText:es,searchLogLineClass:Ds,formatJson:nn,applySearchTimePreset:Mt}}};function Gl(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const _S=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function wS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const oi=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],kS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Wl=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),SS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Ap(e){return SS.some(t=>e===t||e.startsWith(`${t}.`))}const xv="odin_config_center_expanded_v1",_v="odin_config_center_category_v1",TS=50,CS=650,Ii=()=>z.get("/api/config/meta");function hn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Yn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function zn(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function ES(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function AS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function wv(e,t){if(Yn(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return hn(t);const a={};for(const[n,i]of Object.entries(t)){const l=wv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function RS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=wv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function kv(e,t,s,a){if(Yn(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)kv(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function IS(){try{const e=JSON.parse(localStorage.getItem(xv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function OS(){try{const e=localStorage.getItem(_v);return oi.some(t=>t.key===e)?e:oi[0].key}catch{return oi[0].key}}const LS={template:`
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
        <section class="hm-card mb-4 p-4" aria-labelledby="listener-consent-title">
          <div class="cfgc-listener-heading">
            <h2 id="listener-consent-title" class="font-semibold">Web listener exposure</h2>
            <span :class="['cfgc-listener-state', 'state-' + listenerStatusTone]">{{ listenerStatusLabel }}</span>
          </div>
          <p class="text-sm text-gray-400 mb-3">Control whether Odin may use the configured listener beyond loopback. This setting changes the next start only; the running socket is reported separately.</p>
          <div class="cfgc-listener-facts" role="status" aria-live="polite">
            <div><span>Authorization</span><strong>{{ listenerAuthorizationCopy }}</strong></div>
            <div><span>Configured host</span><strong><code>{{ listenerState?.configured_host || config.web?.host || 'unavailable' }}</code> · {{ listenerConfiguredSourceCopy }}</strong></div>
            <div><span>Running listener</span><strong>{{ listenerRunningCopy }}</strong></div>
          </div>
          <label class="text-sm block mb-3"><input type="checkbox" v-model="listenerConsent" :disabled="listenerSaving || !listenerState" /> Allow access beyond loopback using the configured host on the next restart.</label>
          <label class="text-sm block mb-3">Re-enter a current admin API token
            <input type="password" v-model="listenerCredential" autocomplete="off" :disabled="listenerSaving" aria-label="Admin API token for listener consent" />
          </label>
          <p class="text-xs text-gray-400 mb-3">Your browser session alone cannot authorize exposure. This token is used only for this request, not saved or used to replace your session.</p>
          <button type="button" class="btn btn-ghost text-xs" @click="saveListenerConsent" :disabled="!listenerChoiceChanged || !listenerCredential.trim() || listenerSaving || hasChanges">{{ listenerSaving ? 'Saving choice…' : listenerConsent ? 'Authorize exposure' : 'Restrict to loopback' }}</button>
          <p class="text-xs text-gray-400 mt-2">Changing this does not restart Odin or alter the running socket. Restart Odin to apply it.</p>
          <p v-if="listenerMessage" role="status" class="text-sm mt-2">{{ listenerMessage }}</p>
          <p v-if="listenerError" role="alert" class="text-sm text-red-400 mt-2">{{ listenerError }}</p>
          <p v-if="listenerStatusError" role="alert" class="text-sm text-red-400 mt-2">{{ listenerStatusError }}</p>
        </section>
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
                    <section v-if="section === 'image'" class="cfgc-field-group nested cfgc-image-models" aria-label="Image model defaults">
                      <header class="cfgc-field-group-header">
                        <div>
                          <strong>Image model defaults</strong>
                          <p>Follow shipped defaults or pin the current runtime model.</p>
                          <p id="cfgc-image-model-save-note">Changes save immediately, without saving drafts. Edited model drafts remain unsaved.</p>
                        </div>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="saving" @click="refreshImageModelMetadata">
                          <odin-icon name="refresh" :size="13" /> Refresh status
                        </button>
                      </header>
                      <p v-if="imageModelError" class="cfgc-image-model-notice cfgc-field-error" role="alert">{{ imageModelError }}</p>
                      <p v-if="!meta?.image_model_defaults" class="cfgc-image-model-notice">Image model metadata is unavailable.</p>
                      <div class="cfgc-fields">
                        <div v-for="leaf in imageModelLeaves" :key="leaf" class="cfgc-field" :data-image-model="leaf">
                          <div class="cfgc-field-copy">
                            <span class="cfgc-field-label" :id="'cfgc-image-model-label-' + leaf">{{ leaf === 'image_model' ? 'Image model' : 'Outer model' }}</span>
                            <code>image.openai.{{ leaf }}</code>
                          </div>
                          <div class="cfgc-field-control cfgc-image-model-control">
                            <div class="cfgc-image-model-effective">
                              <code>{{ meta?.image_model_defaults?.[leaf]?.effective ?? 'Unavailable' }}</code>
                              <span class="cfgc-image-model-status">{{ meta?.image_model_defaults?.[leaf]?.status === 'follow' ? 'Following defaults' : meta?.image_model_defaults?.[leaf]?.status === 'pin' ? 'Pinned' : 'Unavailable' }}</span>
                            </div>
                            <div class="cfgc-image-model-choice" role="group" :aria-labelledby="'cfgc-image-model-label-' + leaf" aria-describedby="cfgc-image-model-save-note">
                              <button type="button" :aria-pressed="meta?.image_model_defaults?.[leaf]?.status === 'follow'"
                                      :disabled="saving || !meta?.image_model_defaults?.[leaf]" @click="setImageModelDefaults([leaf], 'follow')">Follow defaults</button>
                              <button type="button" :aria-pressed="meta?.image_model_defaults?.[leaf]?.status === 'pin'"
                                      :disabled="saving || !meta?.image_model_defaults?.[leaf]" @click="setImageModelDefaults([leaf], 'pin')">Pin current</button>
                            </div>
                            <p v-if="meta?.image_model_defaults?.[leaf]?.default != null && meta.image_model_defaults[leaf].default !== meta.image_model_defaults[leaf].effective" class="cfgc-image-model-shipped">
                              Shipped default: <code>{{ meta.image_model_defaults[leaf].default }}</code>
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>
                    <div v-if="section === 'tools' && hasHostsCollection()" class="cfgc-mcp-owner">
                      <span class="cfgc-mcp-owner-icon" aria-hidden="true"><odin-icon name="server" :size="18" /></span>
                      <div>
                        <strong>Managed hosts have a dedicated control plane</strong>
                        <p>{{ hostsConfigSummary() }} Host inventory is read-only here so durable config, runtime generations, access fences, and pinned trust cannot split.</p>
                      </div>
                      <router-link class="btn btn-ghost text-xs" :to="{ path: '/system', query: { tab: 'hosts' } }">
                        Open Hosts <odin-icon name="chevronRight" :size="14" />
                      </router-link>
                    </div>
                    <section v-for="fieldGroup in fieldGroups(section).filter(group => section !== 'tools' || group.path !== 'tools.hosts')" :key="fieldGroup.key" :class="['cfgc-field-group', { nested: fieldGroup.path }]">
                      <header v-if="fieldGroup.path" class="cfgc-field-group-header">
                        <div>
                          <strong>{{ fieldGroup.label }}</strong>
                          <code>{{ fieldGroup.path }}</code>
                          <p v-if="fieldGroup.description">{{ fieldGroup.description }}</p>
                        </div>
                        <span>{{ fieldGroup.entries.length }} setting{{ fieldGroup.entries.length === 1 ? '' : 's' }}</span>
                      </header>

                      <div class="cfgc-fields" :inert="saving">
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=f(!1),o=f(""),r=f(!1),c=f(""),d=f(""),u=f("");function p(k){i.value=k||null,k&&typeof k.authorized=="boolean"&&(l.value=k.authorized)}async function h(){try{const k=await z.get("/api/setup/status");p(k.listener),u.value=""}catch(k){p(null),u.value=`Listener status could not be loaded: ${k.message||"Unknown error"}`}}async function m(){if(!(!re.value||!o.value.trim()||r.value||q.value)){r.value=!0,c.value="",d.value="";try{const k=z.setListenerExposure(o.value.trim(),l.value);o.value="";const G=await k;c.value=G.message,p(G.listener)}catch(k){d.value=k.message||"Listener consent could not be saved."}finally{o.value="",r.value=!1}}}const g=f(null),A=["image_model","outer_model"],I=f(null),y=f(null),v=f(null),b=f(!1),x=f(!1),_=f(null),E=f(""),C=f("all"),w=f(OS()),R=f(IS()),B=f({}),S=f({}),F=f(""),Y=f({}),j=f({}),L=f([]),N=f([]),P=f(!1),ae=f(!1),ne=f(!1);let U=null,J=null,ie={path:null,at:0},K=0;const me=V(()=>{var k;return(((k=t.value)==null?void 0:k.fields)||[]).filter(G=>!Wl.has(G.path.split(".")[0])&&!Ap(G.path))}),de=V(()=>new Map(me.value.map(k=>[k.path,k]))),W=V(()=>Ne.value.reduce((k,G)=>k+G.sections.length,0)),pe=V(()=>me.value.length),ge=V(()=>_S),ye=V(()=>L.value.length>0),_e=V(()=>N.value.length>0),Ne=V(()=>{if(!e.value)return[];const k=new Set(oi.flatMap(Se=>Se.sections)),G=oi.map(Se=>({...Se,sections:Se.sections.filter(ze=>Object.hasOwn(e.value,ze)&&!Wl.has(ze))})).filter(Se=>Se.sections.length),te=Object.keys(e.value).filter(Se=>!k.has(Se)&&!Wl.has(Se));return te.length&&G.push({key:"other",label:"Other",icon:"folder",sections:te}),G}),T=V(()=>e.value?{...e.value,...B.value}:null),M=V(()=>{if(!e.value)return[];const k=[];for(const[G,te]of Object.entries(B.value))kv(e.value[G],te,G,k);return k.filter(G=>!Yn(G.oldVal,G.newVal)).map(G=>{const te=Ye(G.path);return{...G,label:(te==null?void 0:te.label)||zn(G.path.split(".").at(-1)),apply_mode:(te==null?void 0:te.apply_mode)||Re(G.path.split(".")[0])}})}),q=V(()=>M.value.length>0),re=V(()=>!!i.value&&l.value!==i.value.authorized),$=V(()=>{var G;const k=(G=i.value)==null?void 0:G.state;return k==="active"||k==="authorized_loopback"?"active":["pending_widening","pending_narrowing","active_rebind_pending"].includes(k)?"pending":k==="restricted"?"restricted":"unknown"}),Z=V(()=>{var k;return{active:"Exposure active",authorized_loopback:"Authorized · loopback host",pending_widening:"Authorized · restart pending",pending_narrowing:"Restriction saved · restart pending",active_rebind_pending:"Exposed · restart pending",restricted:"Loopback only",unknown:"Runtime state unavailable"}[(k=i.value)==null?void 0:k.state]||"Loading listener state"}),ue=V(()=>i.value?i.value.authorized?i.value.authorization_source==="explicit"?"Beyond-loopback access is explicitly authorized":"Beyond-loopback access is retained from this installation":"Beyond-loopback access is not authorized":"Unavailable"),H=V(()=>{var k;return{explicit:"saved explicitly in config.yml",default:"schema default; no web.host key is saved",unknown:"source could not be verified"}[(k=i.value)==null?void 0:k.configured_host_source]||"source unavailable"}),ee=V(()=>{const k=i.value;return!k||k.running_scope==="unavailable"?"Actual bound address unavailable":`${(k.listening_hosts||[]).map((te,Se)=>{var mt;const ze=(mt=k.listening_ports)==null?void 0:mt[Se];return ze?`${te}:${ze}`:te}).join(", ")} · ${k.running_scope==="loopback"?"loopback only":"accepting beyond loopback"}`}),X=V(()=>M.value.length),be=V(()=>new Set(M.value.map(k=>k.path.split(".")[0])).size),he=V(()=>!!E.value||C.value!=="all"),xe=V(()=>{const k={...j.value};for(const G of M.value){const te=Ye(G.path),Se=ce(te,G.newVal);Se&&(k[G.path]=Se)}return k}),Ae=V(()=>Object.keys(xe.value).length>0),Le=V(()=>e.value?(he.value?Ne.value:Ne.value.filter(G=>G.key===w.value)).map(G=>({...G,sections:G.sections.filter(te=>Vs(te))})).filter(G=>G.sections.length):[]),$e=V(()=>{const k=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],G=new Map(k.map(te=>[te,[]]));for(const te of M.value){const Se=G.has(te.apply_mode)?te.apply_mode:"restart";G.get(Se).push(te)}return k.filter(te=>G.get(te).length).map(te=>({key:te,label:Es(te),entries:G.get(te)}))}),Me=V(()=>M.value.filter(k=>k.apply_mode==="restart").length),Fe=V(()=>me.value.filter(k=>k.pending_restart)),Ue=V(()=>Fe.value.length);function Ye(k){const G=de.value.get(k);return G?{...G,apply_details:Gl([G])}:null}function je(k){const G=`${k}.`;return me.value.filter(te=>te.path===k||te.path.startsWith(G))}function Q(){return me.value.some(k=>k.path==="tools.hosts"||k.path.startsWith("tools.hosts."))}function we(){var te,Se;const k=((Se=(te=e.value)==null?void 0:te.tools)==null?void 0:Se.hosts)||{},G=Object.keys(k).length;return`${G} host${G===1?"":"s"} configured.`}function fe(k){return je(k).length}function Ie(k){return zn(k)}function se(k){const G=je(k);if(!G.length)return`${zn(k)} configuration.`;const te=G.find(mt=>mt.sensitivity==="public"&&mt.description)||G.find(mt=>mt.description),Se=(te==null?void 0:te.description)||"";return Se.match(/setting for (.+)\.$/i)?`${zn(k)} settings and runtime behaviour.`:Se}function Re(k){const G=[...new Set(je(k).map(te=>te.apply_mode))];return G.length===1?G[0]:G.includes("restart")?"restart":G.includes("activation_required")?"activation_required":G[0]||"restart"}function De(k){const G=[...new Set(je(k).map(te=>Es(te.apply_mode)))];return G.length?G.length===1?G[0]:`Mixed apply behaviour: ${G.join(" · ")}`:""}function st(k){return Gl(je(k))}function Gt(k){var G;return Object.hasOwn(B.value,k)?B.value[k]:(G=e.value)==null?void 0:G[k]}function rt(){const k=Gt("mcp")||{},G=Object.keys(k.servers||{}).length;return`${k.enabled?"Globally enabled":"Globally disabled"} · ${G} configured server${G===1?"":"s"}.`}function xt(k,G){return G.split(".").reduce((te,Se)=>te==null?void 0:te[Se],k)}function Mt(k){const G=T.value;return je(k).filter(te=>Ap(te.path)?!1:te.path.split(".").length<=2?!0:!te.path.includes(".*")).map(te=>({...te,key:te.path.split(".").at(-1),value:xt(G,te.path),apply_details:Gl([te]),editor:te.path==="agents.final_warning_iterations"?"warning-chips":null}))}function vs(k){const G=k.path.split(".");return G.length>2?G.slice(0,2).join("."):null}function Qs(k){const G=new Map;for(const te of Mt(k)){const Se=vs(te),ze=Se||`${k}.__root`;G.has(ze)||G.set(ze,{key:ze,path:Se,entries:[]}),G.get(ze).entries.push(te)}return[...G.values()].map(te=>{const Se=te.entries.find(ze=>ze.group_description);return{...te,label:te.path?zn(te.path.split(".").at(-1)):null,description:(Se==null?void 0:Se.group_description)||null,apply_details:Gl(te.entries),runtime_summaries:Ht(te.entries)}})}function Wt(k){return{save:k.save_effect||(k.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:k.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[k.apply_mode]||"Effective runtime state is not currently observable."}}function Ht(k){const G=new Map;for(const te of k){const Se=Wt(te),ze=`${te.apply_mode}|${Se.save}|${Se.runtime}`;G.has(ze)||G.set(ze,{key:ze,label:Es(te.apply_mode),save:Se.save,runtime:Se.runtime})}return[...G.values()]}function gs(k){if(bs(k))return k.runtime_effect||k.activation_policy||"";if(k.apply_mode==="activation_required"){const G=k.activation_policy||k.runtime_effect;return G?`Not active after saving. No activation control exists in this release. ${G}`:"Not active after saving; no activation control exists in this release."}return""}function bs(k){return k.action_available===!0&&!!(k.action_label&&k.action_endpoint)}async function es(k){if(bs(k))try{if(Te(k.path))throw new Error("Save this setting before applying its action.");const G=String(k.action_method||"POST").toLowerCase(),te={post:z.post.bind(z),put:z.put.bind(z),delete:z.del.bind(z)}[G];if(!te)throw new Error("Unsupported configuration action");await te(k.action_endpoint,k.action_body||void 0),await hr(),rn("success",`${k.action_label} completed.`)}catch(G){rn("error",G.message||`${k.action_label} failed`)}}function Ds(k,G){return[k.label,k.path,k.description,...k.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(G)}function nn(k){const G=E.value.trim().toLowerCase();return G?je(k).filter(te=>Ds(te,G)):[]}function Vs(k){const G=je(k);if(C.value!=="all"&&!G.some(Se=>Se.apply_state===C.value))return!1;const te=E.value.trim().toLowerCase();return!te||`${Ie(k)} ${k}`.toLowerCase().includes(te)?!0:G.some(Se=>Ds(Se,te))}function at(k,G){return je(k).filter(te=>te.apply_state===G).length}function rs(k){return k==="all"?pe.value:me.value.filter(G=>G.apply_state===k).length}function Ha(k){const G=k.sections.flatMap(te=>je(te));return{fields:G.length,modified:M.value.filter(te=>k.sections.includes(te.path.split(".")[0])).length,pending_restart:G.filter(te=>te.apply_state==="pending_restart").length,invalid:G.filter(te=>te.apply_state==="invalid").length,dormant:G.filter(te=>te.apply_state==="dormant").length}}function le(k){var G;return Object.hasOwn(B.value,k)&&!Yn((G=e.value)==null?void 0:G[k],B.value[k])}function Te(k){return M.value.some(G=>G.path===k||G.path.startsWith(`${k}.`))}function He(k){w.value=k,E.value="",C.value="all";try{localStorage.setItem(_v,k)}catch{}}function Je(k){C.value=k}function _t(){E.value="",C.value="all"}function nt(k){var G;return((G=Ne.value.find(te=>te.sections.includes(k)))==null?void 0:G.sections)||[]}function fa(k){const G=nt(k),te=G.find(Se=>R.value[Se]===!0);return te||G.find(Se=>R.value[Se]!==!1)||null}function Ps(k){return E.value&&!ne.value&&Vs(k)?!0:ne.value?fa(k)===k:Object.hasOwn(R.value,k)?R.value[k]===!0:!0}function ha(k){const G=!Ps(k);if(ne.value){const te={...R.value};for(const Se of nt(k))te[Se]===!0&&(te[Se]=!1);te[k]=G,R.value=te;return}R.value={...R.value,[k]:G}}function Xs(){L.value.push(hn(B.value)),L.value.length>TS&&L.value.shift(),N.value=[]}function qs(){n.value||q.value&&(Xs(),B.value={},j.value={},P.value=!1)}function ea(k,G=!1){const te=Date.now();if(G&&ie.path===k&&te-ie.at<CS){ie.at=te;return}Xs(),ie={path:k,at:te}}function ma(k,G,te){if(!G.length)return te;const Se=hn(k??{});let ze=Se;for(let mt=0;mt<G.length-1;mt+=1){const Gs=G[mt];ze[Gs]=hn(ze[Gs]??{}),ze=ze[Gs]}return ze[G.at(-1)]=te,Se}function za(k){var G;return Object.hasOwn(B.value,k)?B.value[k]:hn((G=e.value)==null?void 0:G[k])}function zt(k,G,te={}){var $n;if(n.value||Wl.has(k.path.split(".")[0]))return;const[Se,...ze]=k.path.split(".");ea(k.path,!!te.coalesce);const mt=za(Se),Gs=ze.length?ma(mt,ze,G):G,ta={...B.value};if(Yn(Gs,($n=e.value)==null?void 0:$n[Se])?delete ta[Se]:ta[Se]=Gs,B.value=ta,j.value[k.path]){const cn={...j.value};delete cn[k.path],j.value=cn}}function va(k){ie={path:null,at:0},S.value={...S.value,[k]:String(xt(T.value,k)??"")}}function ys(k){if(ie={path:null,at:0},!Object.hasOwn(S.value,k))return;const G={...S.value};delete G[k],S.value=G}function Dn(k){const G=S.value[k.path];if(ie={path:null,at:0},G===""){if(k.nullable){ys(k.path),zt(k,null,{coalesce:!0});return}j.value={...j.value,[k.path]:"Enter a number."};return}const te=Number(G);if(Number.isNaN(te)||k.type==="integer"&&!Number.isInteger(te)){j.value={...j.value,[k.path]:k.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Se={...S.value};delete Se[k.path],S.value=Se,zt(k,te,{coalesce:!0})}function Pn(k){return Object.hasOwn(S.value,k.path)?S.value[k.path]:k.value??""}function ki(k,G){if(S.value={...S.value,[k.path]:G},G===""){if(k.nullable){zt(k,null,{coalesce:!0});return}j.value={...j.value,[k.path]:"Enter a number."};return}const te=Number(G);if(!Number.isFinite(te)||k.type==="integer"&&!Number.isInteger(te)){j.value={...j.value,[k.path]:k.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(j.value[k.path]){const Se={...j.value};delete Se[k.path],j.value=Se}zt(k,te,{coalesce:!0})}function Mn(k){const G=Number.parseInt(F.value,10);if(!Number.isInteger(G)||G<1){j.value={...j.value,[k.path]:"Warning thresholds must be positive whole numbers."};return}const te=[...new Set([...k.value||[],G])].sort((Se,ze)=>ze-Se);F.value="",zt(k,te)}function Fn(k,G){zt(k,(k.value||[]).filter(te=>te!==G))}function ja(k){return k.apply_mode==="live_read"?"Odin reads the saved file value on next use.":k.apply_mode==="live_for_new_work"?"New work uses the saved file value.":k.apply_mode==="live_apply"?k.apply_handler?`Apply the saved value through ${k.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":k.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":k.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":k.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function ln(k){return k.type==="array"&&Array.isArray(k.value)&&!k.structured_container&&!k.structured_container_child&&k.sensitivity==="public"&&k.value.every(G=>["string","number","boolean"].includes(typeof G))}function Ce(k){const G=String(Y.value[k.path]??"").trim();if(!G)return;const te=[...new Set([...k.value||[],G])];Y.value={...Y.value,[k.path]:""},zt(k,te)}function D(k,G){zt(k,(k.value||[]).filter(te=>te!==G))}function ce(k,G){var Se;if(!k)return null;if((Se=k.enum)!=null&&Se.length&&!k.enum.includes(G))return`Choose one of: ${k.enum.join(", ")}`;if(k.path==="agents.final_warning_iterations"&&(!Array.isArray(G)||!G.length))return"Add at least one warning threshold.";const te=k.constraints||{};if((k.type==="integer"||k.type==="number")&&typeof G=="number"){if(te.minimum!==void 0&&G<te.minimum)return`Must be at least ${te.minimum}${k.unit?` ${k.unit}`:""}`;if(te.maximum!==void 0&&G>te.maximum)return`Must be at most ${te.maximum}${k.unit?` ${k.unit}`:""}`}return null}function O(k){return xe.value[k.path]||null}function oe(k){const G=`${k}.`;return Object.keys(xe.value).some(te=>te===k||te.startsWith(G))}function ve(){n.value||L.value.length&&(N.value.push(hn(B.value)),B.value=L.value.pop(),j.value={},S.value={},ie={path:null,at:0})}function Oe(){n.value||N.value.length&&(L.value.push(hn(B.value)),B.value=N.value.pop(),j.value={},S.value={},ie={path:null,at:0})}function bt(){!q.value||Ae.value||(P.value=!0,ae.value=!1)}function it(){P.value=!1}function wt(){qs()}function Es(k){return kS[k]||zn(k||"unknown")}function It(k){return`apply-${String(k||"unknown").replaceAll("_","-")}`}function on(k){return`cfgc-field-${k.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Rl(k){return`${on(k)}-input`}function zv(k){const G=document.getElementById(on(k))||document.getElementById(on(k.split(".").slice(0,2).join(".")));G==null||G.scrollIntoView({behavior:"smooth",block:"center"})}function rn(k,G){y.value={type:k,message:G},window.setTimeout(()=>{var te;((te=y.value)==null?void 0:te.message)===G&&(y.value=null)},3500)}function jv(){b.value=!1,C.value="pending_restart",E.value="";const k=wS(a.value);k&&(k.scrollTop=0)}function Vv(){b.value=!1}function Gd(k=1800){J&&window.clearTimeout(J),J=window.setTimeout(qv,k)}async function qv(){if(x.value){if(K+=1,K>45){x.value=!1,_.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ii(),Ue.value===0){x.value=!1,_.value=null,rn("success","Odin restarted and the saved startup settings are active.");return}}catch{}Gd(2e3)}}async function Gv(){if(!x.value){_.value=null;try{await z.post("/api/restart",{}),x.value=!0,K=0,b.value=!1,Gd()}catch(k){_.value=k.message||"Odin could not schedule a restart."}}}async function Wv(){if(!(!q.value||Ae.value||n.value)){n.value=!0;try{const k=RS(e.value,B.value),G=await z.put("/api/config",k);e.value=G,B.value={},L.value=[],N.value=[],j.value={},P.value=!1;try{t.value=await Ii(),v.value=null,b.value=Ue.value>0,rn("success",Ue.value?`Configuration saved. ${Ue.value} setting${Ue.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(te){v.value=te.message||"Unknown metadata error.",rn("error",`Configuration saved, but apply status could not be refreshed: ${v.value}`)}}catch(k){rn("error",k.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Kv(){if(!n.value){n.value=!0,g.value=null;try{t.value=await Ii(),v.value=null}catch(k){g.value=`Image model status could not be refreshed: ${k.message||"Unknown error"}`}finally{n.value=!1}}}async function Jv(k,G){if(n.value||!["follow","pin"].includes(G)||!k.length||k.some(Se=>{var ze,mt;return!A.includes(Se)||!((mt=(ze=t.value)==null?void 0:ze.image_model_defaults)!=null&&mt[Se])}))return;n.value=!0,g.value=null;let te=!1;try{const Se=await z.post("/api/config/image-models",{operations:Object.fromEntries(k.map(ze=>[ze,G])),expected_revision:t.value.image_model_revision});te=!0;for(const ze of k){const mt=`image.openai.${ze}`,Gs=xt(e.value,mt),ta=xt(Se.config,mt),$n=cn=>!Object.hasOwn(cn,"image")||!Yn(xt(cn,mt),Gs)?cn:ma(cn,mt.split("."),ta);B.value=$n(B.value),L.value=L.value.map($n),N.value=N.value.map($n),e.value=ma(e.value,mt.split("."),ta)}t.value={...t.value,image_model_defaults:Se.image_model_defaults,image_model_revision:Se.image_model_revision},rn("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(Se){g.value=`Image model operation failed: ${Se.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ii(),v.value=null}catch(Se){const ze=`Image model status could not be refreshed: ${Se.message||"Unknown error"}`;v.value=ze,g.value=te?`Image model defaults were saved, but ${ze}`:`${g.value} ${ze}`}finally{n.value=!1}}async function hr(){var k,G;if(!(q.value||n.value)){s.value=!0,I.value=null;try{const te=await z.get("/api/config"),Se=await Ii();await h(),e.value=te,t.value=Se,v.value=null;const ze=Ne.value;if(ze.some(mt=>mt.key===w.value)||(w.value=((k=ze[0])==null?void 0:k.key)||oi[0].key),ne.value){const Gs=(((G=ze.find(ta=>ta.key===w.value))==null?void 0:G.sections)||[]).find(ta=>R.value[ta]===!0);R.value=Gs?{...R.value,[Gs]:!0}:{}}}catch(te){I.value=te.message||"Unknown configuration error"}finally{s.value=!1}}}function mr(k){if(P.value||!(k.ctrlKey||k.metaKey))return;const G=k.target;G instanceof HTMLElement&&(G.matches("input, textarea, select")||G.isContentEditable)||(!k.shiftKey&&k.key.toLowerCase()==="z"?(k.preventDefault(),ve()):(k.key.toLowerCase()==="y"||k.shiftKey&&k.key.toLowerCase()==="z")&&(k.preventDefault(),Oe()))}function vr(k){ne.value=k.matches}Dt(R,k=>{try{localStorage.setItem(xv,JSON.stringify(k))}catch{}},{deep:!0});let Il=!1;function gr(){Il||(Il=!0,document.addEventListener("keydown",mr))}function br(){Il&&(Il=!1,document.removeEventListener("keydown",mr))}return Ge(()=>{var k;hr(),gr(),U=window.matchMedia("(max-width: 760px)"),vr(U),(k=U.addEventListener)==null||k.call(U,"change",vr)}),Xt(gr),Ut(br),Ut(()=>{o.value=""}),ut(()=>{var k;o.value="",br(),(k=U==null?void 0:U.removeEventListener)==null||k.call(U,"change",vr),J&&window.clearTimeout(J)}),{listenerState:i,listenerConsent:l,listenerCredential:o,listenerSaving:r,listenerMessage:c,listenerError:d,listenerStatusError:u,listenerChoiceChanged:re,listenerStatusTone:$,listenerStatusLabel:Z,listenerAuthorizationCopy:ue,listenerConfiguredSourceCopy:H,listenerRunningCopy:ee,saveListenerConsent:m,armKeydown:gr,disarmKeydown:br,handleKeydown:mr,config:e,meta:t,loading:s,saving:n,error:I,toast:y,metaRefreshError:v,restartPromptOpen:b,restartScheduled:x,restartError:_,configMain:a,imageModelError:g,imageModelLeaves:A,setImageModelDefaults:Jv,refreshImageModelMetadata:Kv,searchQuery:E,healthFilter:C,activeCategory:w,reviewOpen:P,mobileOverflowOpen:ae,warningThresholdInput:F,arrayInputs:Y,healthFilters:ge,visibleCategories:Ne,displayGroups:Le,reviewGroups:$e,sectionCount:W,fieldCount:pe,hasChanges:q,changeCount:X,changedSectionCount:be,hasDraftErrors:Ae,canUndo:ye,canRedo:_e,globalFilterActive:he,reviewRestartCount:Me,pendingRestartCount:Ue,pendingRestartFields:Fe,healthCount:rs,categoryStats:Ha,selectCategory:He,selectHealthFilter:Je,clearFilters:_t,sectionLabel:Ie,sectionDescription:se,sectionFieldCount:fe,sectionHealthCount:at,sectionApplySummary:De,sectionApplyDetails:st,sectionEntries:Mt,fieldGroups:Qs,sectionSearchHits:nn,mcpConfigSummary:rt,fieldRuntimeCopy:Wt,fieldSpecificRuntimeNote:gs,hasHonestAction:bs,runFieldAction:es,hasHostsCollection:Q,hostsConfigSummary:we,sectionChanged:le,fieldChanged:Te,isSectionExpanded:Ps,toggleSection:ha,discardAllDrafts:qs,setFieldValue:zt,setNumberFieldValue:ki,numberInputValue:Pn,beginInputEdit:va,endTextInputEdit:ys,endInputEdit:Dn,addWarningThreshold:Mn,removeWarningThreshold:Fn,isScalarArray:ln,addScalarArrayItem:Ce,removeScalarArrayItem:D,fieldError:O,sectionHasErrors:oe,undo:ve,redo:Oe,openReview:bt,closeReview:it,mobileCancel:wt,applyModeLabel:Es,applyClass:It,compactValue:ES,formatValue:AS,structuredApplyCopy:ja,fieldId:on,fieldInputId:Rl,focusField:zv,fetchConfig:hr,saveConfig:Wv,restartOdin:Gv,restartLater:Vv,reviewPendingRestart:jv}}},NS=/^\d{15,25}$/;function Sv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Tv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=V(()=>new Set((e.excludedIds||[]).map(String))),o=V(()=>{const x=s.value.toLowerCase().trim();return(e.members||[]).filter(_=>l.value.has(String(_.id))?!1:x?u(_).toLowerCase().includes(x)||String(_.username||"").toLowerCase().includes(x)||String(_.id).includes(x):!0)}),r=V(()=>{const x=s.value.trim();return o.value.length===0&&NS.test(x)&&!l.value.has(x)?x:""}),c=V(()=>o.value.length+(r.value?1:0)),d=V(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(x){return Sv(x)}function p(){a.value=!0,n.value=0}function h(){p()}function m(){const x=Math.max(c.value-1,0);n.value=Math.min(n.value+1,x)}function g(){n.value=Math.max(n.value-1,0)}function A(){const x=o.value[n.value];x?I(x):r.value&&n.value===o.value.length&&y(r.value)}function I(x){y(String(x.id))}function y(x){t("select",x),s.value="",a.value=!1,n.value=0}function v(){a.value=!1}function b(){setTimeout(v,150)}return Ge(()=>{e.autofocus&&At(()=>{var x;return(x=i.value)==null?void 0:x.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:g,selectHighlighted:A,selectMember:I,selectId:y,closeOptions:v,onBlur:b}}};function Rp(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const DS={components:{DiscordUserCombobox:Tv},template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <section class="hm-card mb-4">
        <div class="flex items-center justify-between gap-3">
          <div><h2 class="text-sm font-semibold text-gray-300">Gateway connection</h2>
            <p class="text-xs text-gray-500">Saved credential: {{ connection.persisted ? 'present' : 'absent' }}. Runtime: {{ connection.active?.state || 'unknown' }}.</p></div>
          <div class="flex gap-2"><button class="btn btn-ghost text-xs" @click="connectDiscord" :disabled="connectionBusy || !connection.persisted">Connect</button>
            <button class="btn btn-ghost text-xs" @click="detachDiscord" :disabled="connectionBusy">Detach</button></div>
        </div>
        <form class="flex gap-2 mt-3" @submit.prevent="saveDiscordCredentials">
          <input v-model="connectionToken" class="hm-input flex-1" type="password" autocomplete="off" spellcheck="false" placeholder="Discord bot token" :disabled="connectionBusy" />
          <button class="btn btn-primary text-xs" :disabled="connectionBusy || !connectionToken">{{ connectionBusy ? 'Saving…' : 'Save and connect' }}</button>
        </form>
        <p v-if="connectionError" class="text-xs text-red-400 mt-2" role="alert">{{ connectionError }}</p>
      </section>
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
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildEnabled(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':enabled')"
                    @change="setGuildConfig(guild.id, 'enabled', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Require @mention
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildMention(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':require_mention')"
                    @change="setGuildConfig(guild.id, 'require_mention', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Respond to bots
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildBots(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':respond_to_bots')"
                    @change="setGuildConfig(guild.id, 'respond_to_bots', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
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
                        :disabled="mutationPending.has('channel:' + ch.id + ':enabled')"
                        @change="setChannelConfig(ch.id, guild.id, 'enabled', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.require_mention"
                        :disabled="mutationPending.has('channel:' + ch.id + ':require_mention')"
                        @change="setChannelConfig(ch.id, guild.id, 'require_mention', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.respond_to_bots"
                        :disabled="mutationPending.has('channel:' + ch.id + ':respond_to_bots')"
                        @change="setChannelConfig(ch.id, guild.id, 'respond_to_bots', $event.target.checked, $event)" />
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),h=f({}),m=f([]);let g=0;const A=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),I=V(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),y=V(()=>new Map(m.value.map(de=>[String(de.id),de])));function v(de){return de.config&&de.config.enabled!==void 0?de.config.enabled:!0}function b(de){return Rp(de,"require_mention",c.value)}function x(de){return Rp(de,"respond_to_bots",c.value)}function _(de){return de.config&&Object.keys(de.config).length>0}function E(de){r.value[de]=!r.value[de]}function C(de){const W=de.discord||{};return{allowed_users:[...W.allowed_users||[]],channels:[...W.channels||[]],respond_to_bots:!!W.respond_to_bots,require_mention:!!W.require_mention,ignore_bot_ids:[...W.ignore_bot_ids||[]]}}async function w({showLoading:de=!0}={}){const W=++g;de&&(l.value=!0),o.value=null;try{const pe=await z.get("/api/discord/guilds");W===g&&(e.value=pe)}catch(pe){W===g&&(o.value=pe.message)}finally{de&&W===g&&(l.value=!1)}}async function R(){try{t.value=await z.get("/api/discord/connection"),n.value=null}catch(de){n.value=de.message}}async function B(de,W=null){if(!a.value){a.value=!0,n.value=null;try{const pe={operation:de};W!==null&&(pe.token=W),t.value=await z.post("/api/discord/connection",pe),de==="credentials"&&(s.value="")}catch(pe){n.value=pe.message||"Connection update failed."}finally{a.value=!1}}}function S(){return B("credentials",s.value)}function F(){return B("connect")}function Y(){return B("detach")}async function j(){l.value=!0,o.value=null;try{const[de,W,pe]=await Promise.all([z.get("/api/discord/guilds"),z.get("/api/discord/members").catch(()=>[]),z.get("/api/config")]),ge=C(pe),ye=I.value;c.value=ge,ye||(d.value=JSON.parse(JSON.stringify(ge))),m.value=W,e.value=de,p.value=null}catch(de){o.value=de.message}finally{l.value=!1}}let L=Promise.resolve();const N=f(new Set);function P(de,W){const pe=new Set(N.value);pe.add(de),N.value=pe;const ge=L.then(W);return L=ge.catch(()=>{}),ge.finally(()=>{const ye=new Set(N.value);ye.delete(de),N.value=ye})}function ae(de,W,pe,ge){const ye=(ge==null?void 0:ge.target)??null;return P(`guild:${de}:${W}`,async()=>{try{await z.put("/api/discord/guild/"+de+"/config",{[W]:pe}),await w({showLoading:!1})}catch(_e){o.value=_e.message,ye&&typeof pe=="boolean"&&(ye.checked=!pe)}})}function ne(de,W,pe,ge,ye){const _e=(ye==null?void 0:ye.target)??null;return P(`channel:${de}:${pe}`,async()=>{try{await z.put("/api/discord/channel/"+de+"/config",{[pe]:ge}),await w({showLoading:!1})}catch(Ne){o.value=Ne.message,_e&&typeof ge=="boolean"&&(_e.checked=!ge)}})}function U(de,W){return P(`channel:${de}:clear`,async()=>{try{await z.put("/api/discord/channel/"+de+"/config",{clear:!0}),await w({showLoading:!1})}catch(pe){o.value=pe.message}})}function J(de,W){const pe=String(W);if(!de.userAutocomplete)return pe;const ge=y.value.get(pe);return ge?Sv(ge):pe}function ie(de,W=null){const pe=String(W??h.value[de]??"").trim();!pe||d.value[de].includes(pe)||(d.value[de]=[...d.value[de],pe],h.value={...h.value,[de]:""})}function K(de,W){d.value[de]=d.value[de].filter(pe=>pe!==W)}async function me(){if(!(!I.value||u.value)){u.value=!0,p.value=null;try{const W=(await z.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...W.allowed_users||[]],channels:[...W.channels||[]],respond_to_bots:!!W.respond_to_bots,require_mention:!!W.require_mention,ignore_bot_ids:[...W.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(de){p.value=de.message||"Global defaults could not be saved."}finally{u.value=!1}}}return Ge(()=>{j(),R(),i=window.setInterval(R,5e3)}),ut(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:h,globalMembers:m,globalListEditors:A,globalChanged:I,guildEnabled:v,guildMention:b,guildBots:x,hasOverride:_,toggleGuild:E,fetchAll:j,fetchGuilds:w,setGuildConfig:ae,setChannelConfig:ne,clearOverride:U,mutationPending:N,globalItemLabel:J,addGlobalItem:ie,removeGlobalItem:K,saveGlobalDefaults:me,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:S,connectDiscord:F,detachDiscord:Y}}},As=e=>e==null?e:JSON.parse(JSON.stringify(e));function PS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function g(_){d+=1;const E=c.then(_,_);return c=E.catch(()=>{}),E}function A(_,E){h=As(_),m.clear();for(const[C,w]of Object.entries(E||{}))m.set(C,As(w))}function I(_){const E=As(_),C=++u;return g(async()=>{try{await e(As(E)),h=As(E),C===u&&a(As(E))}catch(w){C===u&&(n(As(h)),r(w,{kind:"default"}))}})}function y(_,E){const C=As(E),w=(p.get(_)||0)+1;return p.set(_,w),g(async()=>{try{await t(_,As(C)),m.set(_,As(C)),w===p.get(_)&&i(_,As(C))}catch(R){w===p.get(_)&&(l(_,As(m.get(_)??null)),r(R,{kind:"user",uid:_}))}})}function v(_){const E=(p.get(_)||0)+1;return p.set(_,E),g(async()=>{try{await s(_),m.delete(_),E===p.get(_)&&o(_)}catch(C){E===p.get(_)&&(l(_,As(m.get(_)??null)),r(C,{kind:"delete",uid:_}))}})}async function b(){for(;;){const _=c;if(await _,_===c)return d}}async function x(_){for(;;){const E=await b(),C=await _();if(E===d)return C}}return{seed:A,saveDefault:I,saveUser:y,deleteUser:v,whenIdle:b,readSnapshot:x,get revision(){return d}}}const MS={components:{DiscordUserCombobox:Tv},template:`
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
              <span v-if="hostDescriptions[host]" class="text-gray-500 text-xs">— {{ hostDescriptions[host] }}</span>
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
                  <div>{{ host }}</div><div v-if="hostDescriptions[host]" class="text-gray-500 text-xs font-normal">{{ hostDescriptions[host] }}</div>
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=V(()=>{const S={};for(const F of r.value)S[F.id]=F;return S});function d(S){return c.value[S]||null}function u(S,F){return S?S.allowed_hosts===null||S.allowed_hosts===void 0?{allowed_hosts:[...F],default_host:S.default_host||"",allow_all:!0}:{allowed_hosts:S.allowed_hosts,default_host:S.default_host||"",allow_all:!1}:{allowed_hosts:[...F],default_host:F[0]||"",allow_all:!0}}const p=PS({applyDefault:async S=>{const F=S.allow_all?null:S.allowed_hosts;await z.put("/api/host-access/default-policy",{allowed_hosts:F,default_host:S.default_host})},applyUser:async(S,F)=>{const Y=F.allow_all?null:F.allowed_hosts;await z.put(`/api/host-access/user/${S}`,{allowed_hosts:Y,default_host:F.default_host})},applyDelete:S=>z.del(`/api/host-access/user/${S}`),onDefaultConfirmed:()=>ke.success("Default policy updated"),onDefaultRollback:S=>{S&&(i.value=S)},onUserConfirmed:S=>{const F=d(S);ke.success(`Updated access for ${F?F.display_name:S}`)},onUserRollback:(S,F)=>{const Y={...l.value};F?Y[S]=F:delete Y[S],l.value=Y},onUserDeleted:S=>{const F={...l.value};delete F[S],l.value=F},onError:(S,F)=>{var j;const Y=F.uid?` ${((j=d(F.uid))==null?void 0:j.display_name)||F.uid}`:"";ke.error(`${S.message||"Failed to save"} — reverted${Y}`)}});let h=0;async function m(){const S=++h;e.value=!0,t.value="";try{const F=await p.readSnapshot(()=>z.get("/api/host-access"));if(S!==h)return;s.value=F,a.value=F.available_hosts||[],n.value=F.host_descriptions||{},i.value=u(F.default_policy,a.value);const Y=F.users||{},j={};for(const[L,N]of Object.entries(Y))j[L]=u(N,a.value);l.value=j,p.seed(i.value,j)}catch(F){S===h&&(t.value=F.message||"Failed to fetch host access data")}finally{S===h&&(e.value=!1)}try{const F=await z.get("/api/discord/members")||[];S===h&&(r.value=F)}catch{S===h&&(r.value=[])}}const g=500,A=new Map;function I(S,F){const Y=A.get(S);Y&&clearTimeout(Y.timer);const j={run:F,timer:null};j.timer=setTimeout(()=>{A.delete(S),F()},g),A.set(S,j)}function y(S){const F=A.get(S);F&&(clearTimeout(F.timer),A.delete(S))}function v(){for(const[S,F]of[...A])clearTimeout(F.timer),A.delete(S),F.run()}function b(){I("default",()=>p.saveDefault(i.value))}function x(S,F){i.value.allow_all=!1,F?i.value.allowed_hosts.includes(S)||i.value.allowed_hosts.push(S):(i.value.allowed_hosts=i.value.allowed_hosts.filter(Y=>Y!==S),i.value.default_host===S&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function _(S){I(`user:${S}`,()=>{const F=l.value[S];F&&p.saveUser(S,F)})}function E(S,F,Y){const j=l.value[S];j&&(j.allow_all=!1,Y?j.allowed_hosts.includes(F)||j.allowed_hosts.push(F):(j.allowed_hosts=j.allowed_hosts.filter(L=>L!==F),j.default_host===F&&(j.default_host=j.allowed_hosts[0]||"")),_(S))}function C(S,F){const Y=l.value[S];Y&&(Y.default_host=F,_(S))}function w(){o.value=!0}function R(S){!/^\d{15,25}$/.test(S)||l.value[S]||(l.value[S]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(S,l.value[S]),o.value=!1)}async function B(S){const F=d(S);await qt({title:"Remove user override",message:`Remove the host access override for ${F?F.display_name:S}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${S}`),await p.deleteUser(S),l.value[S]||ke.success(`Removed override for ${F?F.display_name:S}`))}return Ge(m),Ut(v),ut(v),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:x,getMember:d,toggleUserHost:E,setUserDefault:C,openAddUser:w,addUserById:R,deleteUser:B,flushPendingSaves:v}}},FS={template:`
    <div class="p-6 page-fade-in space-y-6">
      <div class="flex items-center justify-between">
        <div><h1 class="text-xl font-semibold">Managed Hosts</h1><p class="text-xs text-gray-500 mt-1">Live inventory, pinned SSH trust, and connection health.</p></div>
        <div class="flex gap-2"><button class="btn btn-ghost text-xs" @click="load">Refresh</button><button class="btn btn-primary text-xs" @click="beginAdd">Add Host</button></div>
      </div>
      <div v-if="error" class="hm-card border-red-900 text-red-400">{{ error }}</div>
      <div v-if="pendingReferences.length" class="hm-card border-amber-800 space-y-2">
        <div class="text-sm text-amber-300">Deletion is blocked by these references:</div>
        <ul class="text-xs text-gray-300 list-disc pl-5"><li v-for="item in pendingReferences" :key="item.kind+':'+item.location"><span class="text-gray-400">{{ item.kind }}</span> · {{ item.location }}</li></ul>
      </div>
      <div class="hm-card flex flex-wrap gap-3 items-end">
        <label class="text-xs">Default host<select class="hm-input mt-1" v-model="defaultHost"><option value="">Require explicit host</option><option v-for="host in hosts" :key="host.host_id" :value="host.alias">{{ host.alias }}</option></select></label>
        <label class="text-xs flex gap-2 items-center"><input type="checkbox" v-model="tofuEnabled" /> Allow explicit TOFU enrollment</label>
        <button class="btn btn-ghost text-xs" @click="saveSettings">Save host settings</button>
      </div>
      <div class="hm-card table-responsive" v-if="hosts.length">
        <table class="hm-table"><thead><tr><th>Alias</th><th>Endpoint</th><th>Trust</th><th>State</th><th>Last test</th><th>Actions</th></tr></thead>
        <tbody><tr v-for="host in hosts" :key="host.host_id">
          <td><div class="text-gray-200">{{ host.alias }}</div><div class="text-xs text-gray-500">{{ host.description || 'No description' }}</div></td>
          <td class="text-xs">{{ host.ssh_user }}@{{ host.address }}:{{ host.port }}<br>{{ host.os }}</td>
          <td><span class="badge">{{ host.trust_state }}</span></td>
          <td class="text-xs"><span :class="host.targetable ? 'text-emerald-400' : 'text-amber-400'">{{ host.targetable ? 'Targetable' : 'Disabled' }}</span><span v-if="host.draining"> · draining</span></td>
          <td class="text-xs">{{ host.last_test?.detail || 'Not tested this process' }}</td>
          <td><div class="flex gap-2 flex-wrap"><button class="btn btn-ghost text-xs" @click="beginEdit(host)">Edit</button><button v-if="host.trust_mode==='legacy'" class="btn btn-ghost text-xs" @click="importLegacy(host)">Enroll trusted key</button><button class="btn btn-ghost text-xs" @click="toggle(host)">{{ host.enabled ? 'Disable' : 'Enable' }}</button><button class="btn btn-ghost text-xs text-red-400" @click="remove(host)">Delete</button><button v-if="host.draining" class="btn btn-ghost text-xs text-red-400" @click="forceRevoke(host)">Force revoke</button></div></td>
        </tr></tbody></table>
      </div>
      <div v-else-if="!loading" class="hm-card text-sm text-gray-500">No managed hosts configured.</div>

      <div v-if="wizard" class="hm-card space-y-4">
        <div class="flex justify-between"><h2 class="font-semibold">{{ editing ? 'Edit host' : 'Add host' }} · Step {{ step }} of 5</h2><button class="btn btn-ghost text-xs" @click="wizard=false">Close</button></div>
        <div v-if="step===1" class="grid md:grid-cols-2 gap-3">
          <label class="text-xs">Alias<input class="hm-input mt-1" v-model="form.alias" :disabled="editing" /></label>
          <label class="text-xs">Address<input class="hm-input mt-1" v-model="form.address" /></label>
          <label class="text-xs">Port<input class="hm-input mt-1" type="number" v-model.number="form.port" /></label>
          <label class="text-xs">SSH user<input class="hm-input mt-1" v-model="form.ssh_user" /></label>
          <label class="text-xs">Operating system<select class="hm-input mt-1" v-model="form.os"><option value="linux">Linux</option><option value="macos">macOS</option></select></label>
          <label class="text-xs">Description<input class="hm-input mt-1" maxlength="200" v-model="form.description" /></label>
          <label class="text-xs">Trust mode<select class="hm-input mt-1" v-model="form.trust_mode"><option value="pinned">Pinned fingerprint</option><option value="ca">Host CA</option><option value="tofu">TOFU</option><option v-if="editing && form.trust_mode==='legacy'" value="legacy">Legacy known_hosts</option></select></label>
          <label v-if="isLocal" class="text-xs flex gap-2 items-center"><input type="checkbox" v-model="form.confirm_local" /> I understand this target executes locally inside Odin</label>
        </div>
        <div v-if="step===2" class="space-y-3"><p class="text-sm">Install Odin's public key for <code>{{ form.ssh_user }}@{{ form.address }}</code>. Odin never accepts passwords or private keys here.</p><div v-if="keyInfo"><pre class="code-block whitespace-pre-wrap">{{ keyInfo.public_key }}</pre><pre class="code-block whitespace-pre-wrap">{{ keyInfo.authorized_keys_command }}</pre><p class="text-xs text-gray-500">Fingerprint: {{ keyInfo.fingerprint }}. {{ keyInfo.permissions }}</p></div><button class="btn btn-ghost text-xs" @click="loadKey">Load public key</button></div>
        <div v-if="step===3" class="space-y-3"><p class="text-sm">Verify the host key out of band. Run <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code> on the target and paste its SHA256 fingerprint.</p><textarea class="hm-input" rows="3" v-model="fingerprintsText" placeholder="SHA256:..."></textarea><label v-if="form.trust_mode==='tofu'" class="text-xs flex gap-2"><input type="checkbox" v-model="form.confirm_tofu" /> Accept the exact scanned fingerprint under TOFU</label><button class="btn btn-primary text-xs" @click="prepare">Scan and compare</button><div v-if="observed.length" class="text-xs text-gray-400">Observed: {{ observed.join(', ') }}</div></div>
        <div v-if="step===4" class="space-y-3"><p class="text-sm">Test non-interactive authentication and platform identity before activation.</p><button class="btn btn-primary text-xs" @click="testConnection">Test connection</button><pre v-if="testResult" class="code-block whitespace-pre-wrap" role="status">{{ JSON.stringify(testResult,null,2) }}</pre></div>
        <div v-if="step===5" class="space-y-3"><p class="text-sm">Activation is live. Users with <code>allowed_hosts: null</code> gain this host automatically. Review grants on Host Access after saving.</p><button class="btn btn-primary" :disabled="!tested" @click="commit">Save and activate</button><a class="btn btn-ghost text-xs" href="#/system?tab=host-access">Open Host Access</a></div>
        <div class="flex justify-between"><button class="btn btn-ghost text-xs" :disabled="step===1" @click="step--">Back</button><button v-if="step<5 && step!==3 && step!==4" class="btn btn-ghost text-xs" @click="step++">Next</button></div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),g=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),A=f(g()),I=V(()=>["127.0.0.1","localhost","::1"].includes(A.value.address));async function y(){t.value=!0,s.value="";try{const j=await z.get("/api/hosts");e.value=j.hosts||[],o.value=j.default_host||"",r.value=!!j.tofu_enabled}catch(j){s.value=j.message}finally{t.value=!1}}async function v(){try{await z.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),ke.success("Host settings saved and published live"),await y()}catch(j){ke.error(j.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,n.value=!0}function x(){i.value=!1,A.value=g(),b()}function _(j){i.value=!0,A.value={...g(),...j},b()}async function E(){try{c.value=await z.get("/api/hosts/public-key")}catch(j){ke.error(j.message)}}async function C(j){try{const L=await z.post("/api/hosts/"+encodeURIComponent(j.alias)+"/import-legacy",{});i.value=!0,A.value={...g(),...j,trust_mode:"pinned"},b(),d.value=L.candidate_token,u.value=L.fingerprints||[],m.value=u.value.join(`
`),l.value=4,ke.info("Imported existing known_hosts trust. Test before activation.")}catch(L){ke.error(L.message)}}async function w(){try{const j=m.value.split(/\s+/).filter(Boolean),L={...A.value,expected_fingerprints:j,candidate_fingerprints:u.value},N=await z.post("/api/hosts/candidates",L);if(d.value=N.candidate_token,u.value=N.fingerprints||[],A.value.trust_mode==="tofu"&&L.candidate_fingerprints.length===0){A.value.confirm_tofu=!1,ke.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(j){ke.error(j.message)}}async function R(){var j,L;p.value=!1,h.value=null;try{const N=await z.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!N.tested,h.value=N.last_test,p.value&&(l.value=5)}catch(N){const P=(j=N.data)==null?void 0:j.last_test;P&&typeof P=="object"&&!Array.isArray(P)&&(h.value=P);const ae=(L=h.value)==null?void 0:L.detail;ke.error(typeof ae=="string"&&ae.trim()?ae:N.message)}}async function B(){try{await z.post("/api/hosts/candidates/"+d.value+"/commit",{}),ke.success("Host saved and published live"),n.value=!1,await y()}catch(j){ke.error(j.message)}}async function S(j){try{await z.post("/api/hosts/"+encodeURIComponent(j.alias)+"/enabled",{enabled:!j.enabled}),await y()}catch(L){ke.error(L.message)}}async function F(j){var L;if(await qt("Delete host "+j.alias+"? Dependencies will block deletion.")){a.value=[];try{await z.del("/api/hosts/"+encodeURIComponent(j.alias)),await y()}catch(N){a.value=Array.isArray((L=N.data)==null?void 0:L.pending_references)?N.data.pending_references:[],ke.error(N.message)}}}async function Y(j){if(await qt("Force revoke "+j.alias+"? Remote outcomes may be unknown."))try{await z.post("/api/hosts/"+encodeURIComponent(j.alias)+"/force-revoke",{}),await y()}catch(L){ke.error(L.message)}}return Ge(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:A,isLocal:I,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:y,saveSettings:v,beginAdd:x,beginEdit:_,loadKey:E,importLegacy:C,prepare:w,testConnection:R,commit:B,toggle:S,remove:F,forceRevoke:Y}}},$S={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=V(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=V(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function h(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const C=await z.get("/api/tokens");s.value=C.tokens||[],a.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function g(C){return!C||!C.trim()?[]:C.split(",").map(w=>w.trim()).filter(Boolean)}function A(C,w){const R=c.value.allowed_hosts;if(w&&!R.includes(C)&&R.push(C),!w){const B=R.indexOf(C);B>=0&&R.splice(B,1)}}function I(C,w){const R=d.value.allowed_hosts;if(w&&!R.includes(C)&&R.push(C),!w){const B=R.indexOf(C);B>=0&&R.splice(B,1)}}async function y(){var C;i.value=!0;try{const w=g(c.value.allowed_tools_str),R=c.value.host_mode,B=R==="none"?[]:R==="select"?c.value.allowed_hosts:null,S={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:w.length?w:[]};B!==null&&(S.allowed_hosts=B),S.default_host=c.value.default_host||"";const F=await z.post("/api/tokens",S);l.value=F.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,ke.success("Token created"),await m()}catch(w){ke.error(((C=w.data)==null?void 0:C.error)||w.message||"Failed to create token")}finally{i.value=!1}}function v(C){o.value=C;const w=C.allowed_hosts;let R="default";w==null?R="default":Array.isArray(w)&&w.length===0?R="none":Array.isArray(w)&&(R="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:R,allowed_hosts:Array.isArray(w)?[...w]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function b(){var C;if(o.value){r.value=!0;try{const w=g(d.value.allowed_tools_str),R=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:w};R==="none"?B.allowed_hosts=[]:R==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await z.put("/api/tokens/"+encodeURIComponent(o.value.user_id),B),o.value=null,ke.success("Token updated"),await m()}catch(w){ke.error(((C=w.data)==null?void 0:C.error)||w.message||"Failed to update")}finally{r.value=!1}}}async function x(C){var R;if(await qt({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await z.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=B.token,ke.success("Token regenerated")}catch(B){ke.error(((R=B.data)==null?void 0:R.error)||B.message||"Failed to regenerate")}}async function _(C){var R;if(await qt({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/tokens/"+encodeURIComponent(C.user_id)),ke.success("Token deleted"),await m()}catch(B){ke.error(((R=B.data)==null?void 0:R.error)||B.message||"Failed to delete")}}async function E(){if(l.value)try{await navigator.clipboard.writeText(l.value),ke.success("Copied to clipboard")}catch{ke.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:A,toggleEditHost:I,createToken:y,startEdit:v,saveEdit:b,confirmRegenerate:x,confirmDelete:_,copyToken:E}}},BS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort"]),US=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),HS=Object.freeze(["enabled","base_url","model","max_tokens"]),zS=Object.freeze(["enabled","base_url","model","max_tokens"]);function El(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function jS(e,t={}){const s=El(e,zS);return t.includeApiKey&&(s.api_key=e.api_key),s}function VS(e){return El(e,["timeout","preset","model_profiles","context_utilization"])}function Ip(e){return El(e,BS)}function Op(e){return El(e,US)}function qS(e,{includeApiKey:t=!1}={}){const s=El(e,HS);return t&&(s.api_key=e.api_key),s}function GS(e){return{timeout:e.timeout}}function Kl(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const WS={template:`
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
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Configured Provider</h2>
          <div v-if="llmStatus" class="provider-choice-list">
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="codex" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.codex.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.codex.configured ? 'text-gray-200' : 'text-gray-500'">
                  Codex (OpenAI)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.codex.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.codex.configured" class="text-xs text-gray-500">
                  {{ llmStatus.codex.model }}
                </span>
                <span v-if="llmStatus.serving_provider === 'codex'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
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
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.ollama.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.ollama.configured" class="text-xs text-gray-500">
                  {{ llmStatus.ollama.model }}
                </span>
                <span v-if="llmStatus.serving_provider === 'ollama'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
              </label>
            </div>
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="compat" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.openai_compatible.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.openai_compatible.configured ? 'text-gray-200' : 'text-gray-500'">
                  OpenAI-compatible endpoint
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.openai_compatible.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.openai_compatible.configured" class="text-xs text-gray-500">
                  {{ llmStatus.openai_compatible.model }}
                </span>
                <span v-if="llmStatus.serving_provider === 'compat'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
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
              <div class="text-xs text-gray-400 block">Agent Model
              <select v-model="agentsConfig.model" @change="saveAgentsModel"
                      class="hm-input">
                <option value="">Inherit chat model</option>
                <option value="auto">Auto — choose per spawn</option>
                <optgroup label="Codex"><option v-for="m in codexAgentModelOptions" :key="m" :value="m"
                        :disabled="agentModelOptionDisabled(m)">{{ agentModelLabel(m) }}</option></optgroup>
                <optgroup label="Compatible"><option v-for="m in compatibleAgentModels" :key="'compat:' + m" :value="'compat:' + m">{{ m }}</option></optgroup>
                <optgroup label="Ollama"><option v-for="m in ollamaAgentModels" :key="'ollama:' + m.name" :value="'ollama:' + m.name">{{ m.name }}</option></optgroup>
              </select>
              <span class="block mt-2 text-xs text-gray-400">Auto-eligible models</span>
              <div class="mt-1 max-h-28 overflow-y-auto space-y-1 text-xs text-gray-400">
                <label v-for="m in knownAgentModelRefs" :key="'allow:' + m" class="flex items-center gap-2">
                  <input type="checkbox" :checked="agentsConfig.auto_model_allowlist.includes(m)" @change="toggleAgentAutoAllowlist(m, $event)" class="provider-control" />
                  <span>{{ agentModelLabel(m) }}</span>
                </label>
              </div>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Reasoning
              <select v-model="codexForm.reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option v-if="mainEffortAllowed('none')" value="none">None</option>
                <option v-if="mainEffortAllowed('low')" value="low">Low</option>
                <option v-if="mainEffortAllowed('medium')" value="medium">Medium</option>
                <option v-if="mainEffortAllowed('high')" value="high">High</option>
                <option v-if="mainEffortAllowed('xhigh')" value="xhigh">Extra High</option>
                <option v-if="mainEffortAllowed('max')" value="max">Max</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Reasoning
              <select v-model="codexForm.agent_reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat setting</option>
                <option value="auto">Auto — choose per spawn</option>
                <option v-if="agentEffortAllowed('none')" value="none">None</option>
                <option v-if="agentEffortAllowed('low')" value="low">Low</option>
                <option v-if="agentEffortAllowed('medium')" value="medium">Medium</option>
                <option v-if="agentEffortAllowed('high')" value="high">High</option>
                <option v-if="agentEffortAllowed('xhigh')" value="xhigh">Extra High</option>
                <option v-if="agentEffortAllowed('max')" value="max">Max</option>
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
                  <span v-if="activeContextBudget?.workload_calibration?.active_workloads" class="llm-budget-density">{{ activeContextBudget.density_scope }} · {{ activeContextBudget.workload_calibration.active_workloads }} active</span>
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
                          <th>Fresh-workload target</th>
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
                          <td data-label="Fresh-workload target">
                            <span class="llm-budget-value llm-budget-effective">{{ formatCount(row.primaryChars) }}</span><small>characters · fixed prior for a new workload</small>
                            <span v-if="contextWindows.max_context_chars_pending_restart === true && row.configuredPrimaryChars !== row.primaryChars" class="llm-budget-pending">Restart pending</span>
                          </td>
                          <td data-label="Provenance">
                            <span class="llm-budget-provenance" :class="provenanceClass(row.provenance)">{{ row.provenance }}</span>
                            <span v-if="row.workloadCalibration?.active_workloads" class="llm-budget-density">{{ row.densityScope }} · {{ row.workloadCalibration.active_workloads }} active</span>
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

        <!-- ==================== OpenAI-compatible Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">OpenAI-compatible endpoint</h2>
            <div class="flex items-center gap-3">
              <div v-if="compatibleStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="compatibleStatus.configured" class="text-sm">
                <span v-if="compatibleStatus.health && compatibleStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="compatibleForm.enabled" @change="saveCompatibleConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model catalogue
              <select v-model="compatibleForm.model" @change="saveCompatibleConfigDebounced"
                      class="hm-input">
                <option v-if="!compatibleModels.length" value="" disabled>No models available</option>
                <option v-for="m in compatibleModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="compatibleForm.max_tokens" type="number" @keydown.enter="saveCompatibleConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <span class="text-xs text-gray-400">API Key</span>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.openai_compatible.has_api_key && !compatibleForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="compatibleForm.api_key" type="password" aria-label="OpenAI-compatible API key" @keydown.enter="saveCompatibleConfigNow" @input="compatibleKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.openai_compatible.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="hm-input flex-1" />
              </div>
            </div>
            <div><label class="text-xs text-gray-400 block">Base URL
              <input v-model="compatibleForm.base_url" placeholder="https://api.deepseek.com/v1" @keydown.enter="saveCompatibleConfigNow" class="hm-input" />
            </label></div>
            <div><label class="text-xs text-gray-400 block">Profile
              <select v-model="compatibleForm.preset" @change="saveCompatibleConfigDebounced" class="hm-input"><option value="deepseek">DeepSeek</option><option value="kimi">Kimi compatibility</option><option value="custom">Custom</option></select>
            </label></div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.compatible" @toggle="advancedOpen.compatible = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="compatibleForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Agent context utilization</span><input v-model.number="compatibleForm.context_utilization" type="number" min="30" max="100" class="hm-input" /></label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveCompatibleAdvancedConfigNow" :disabled="savingCompatible">Save endpoint settings</button></div>
            </div>
          </details>
          <div v-if="compatibleStatus?.health && compatibleStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ compatibleStatus.health.error }}
          </div>
        </div>

        <!-- ==================== Ollama Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Ollama (Local/Remote)</h2>
            <div class="flex items-center gap-3">
              <div v-if="ollamaStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="ollamaStatus.configured" class="text-sm">
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
          <div v-if="ollamaStatus?.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f("codex"),n=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],l=V(()=>{const O=n.value.model;return O&&!i.includes(O)?[O,...i]:i}),o=V(()=>{const O=re.value.model;return O&&O!=="auto"&&!i.includes(O)?[O,...i]:i}),r={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(O,oe)=>!!O&&!!oe&&(r[O]||[]).includes(oe),d=V(()=>{const O=re.value.model;return O&&!O.includes(":")?O:null}),u=O=>!c(n.value.model,O)&&!(n.value.agent_reasoning_effort===""&&c(d.value,O)),p=O=>{const oe=re.value.model;return oe==="auto"?!0:!c(oe||n.value.model,O)},h=V(()=>{const O=n.value.agent_reasoning_effort;return O==="auto"?null:O||n.value.reasoning_effort}),m=O=>c(O,n.value.reasoning_effort)||re.value.model===""&&c(O,h.value),g=O=>c(O,h.value),A=f({enabled:!1,model:"gpt-5.6-luna"}),I=f({unavailable_reason:null}),y=V(()=>{const O=A.value.model;return O&&!i.includes(O)?[O,...i]:i});function v(O){const oe=O.target.value;A.value.enabled=oe!=="",oe!==""&&(A.value.model=oe),Xs()}const b=f(!1),x=f({codex:!1,ollama:!1,compatible:!1}),_=f(null),E=f(!1),C=f(""),w=f(null),R=f(!1);let B=0;const S=V(()=>{var O;return Object.entries(((O=_.value)==null?void 0:O.models)||{}).map(([oe,ve])=>{var Oe,bt,it;return{model:oe,floor:ve.floor,override:ve.override,effectiveBudget:(Oe=ve.effective)==null?void 0:Oe.effective_budget,configuredPrimaryChars:(bt=ve.configured)==null?void 0:bt.primary_chars,primaryChars:(it=ve.effective)==null?void 0:it.primary_chars,provenance:ve.provenance,clampExpiresAt:ve.clamp_expires_at,densityPriorMilli:ve.density_prior_milli,densityScope:ve.density_scope,workloadCalibration:ve.workload_calibration}})}),F=V(()=>{var O;return((O=_.value)==null?void 0:O.clamps)||[]}),Y=V(()=>{var O,oe;return((oe=(O=_.value)==null?void 0:O.models)==null?void 0:oe[n.value.model])||null}),j=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),L=f({enabled:!1,base_url:"https://api.deepseek.com/v1",api_key:"",model:"deepseek-v4-flash",max_tokens:4096,timeout:300,preset:"deepseek",model_profiles:{},context_utilization:75}),N=f(!1),P=f(!1),ae=f(!1),ne=f(!1),U=f(!1),J=f(!1),ie=f(!1),K=f({configured:null}),me=f(!1),de=f([]),W=f(""),pe=f(!1),ge=f(!1),ye=f({configured:null}),_e=f(!1),Ne=f([]),T=f(""),M=f(!1),q=f(!1),re=f({model:"auto",auto_model_allowlist:[]}),$=V(()=>Ne.value.map(O=>typeof O=="string"?O:O.name).filter(Boolean)),Z=V(()=>de.value||[]),ue=V(()=>{const O=[...i,...$.value.map(oe=>`compat:${oe}`),...Z.value.map(oe=>`ollama:${oe.name}`)];for(const oe of[re.value.model,...re.value.auto_model_allowlist||[]])oe&&oe!=="auto"&&!O.includes(oe)&&O.unshift(oe);return O}),H=O=>O==="codex-auto-review"?"codex-auto-review (Codex alias → gpt-5.6-luna)":O;async function ee(){try{re.value={...re.value,...await z.get("/api/agents/model")}}catch{}}async function X(){try{const O=await z.put("/api/agents/model",{model:re.value.model||null});re.value={...re.value,...O},fe("Agent model policy saved")}catch(O){fe(O.message||"Failed to save agent model policy","error")}}async function be(O,oe){const ve=new Set(re.value.auto_model_allowlist||[]);oe.target.checked?ve.add(O):ve.delete(O);try{const Oe=await z.put("/api/agents/model",{auto_model_allowlist:[...ve]});re.value={...re.value,...Oe},fe("Agent Auto allowlist saved")}catch(Oe){fe(Oe.message||"Failed to save agent allowlist","error")}}const he=f(!0),xe=f(""),Ae=f({configured:null,accounts:[]}),Le=f(null),$e=f(null),Me=f(""),Fe=f(null),Ue=f(!1),Ye=f(null),je=f(null),Q=f("");let we=null;function fe(O,oe="success"){ke(O,oe==="error"?"error":"success")}function Ie(O){if(!O)return"?";const oe=O/(1024*1024*1024);return oe>=1?oe.toFixed(1)+" GB":(O/(1024*1024)).toFixed(0)+" MB"}function se(O){return Number.isFinite(Number(O))?Number(O).toLocaleString():"—"}function Re(O){return O==null?"automatic (model-derived)":Number(O).toLocaleString()+" characters"}function De(O){const oe=new Date(O);return Number.isNaN(oe.getTime())?"unknown":oe.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function st(O){return typeof O=="string"&&O.length>12?O.slice(0,8)+"…"+O.slice(-4):O}function Gt(O){return typeof O!="number"||!Number.isFinite(O)?"—":(O/1e3).toFixed(2)}function rt(O){return O==="temporary learned clamp"?"is-clamp":O==="override"?"is-override":"is-built-in"}function xt(O){const oe=n.value.context_budget_overrides[O.model];return O.floor!=null&&Number.isFinite(Number(oe))&&Number(oe)>O.floor}function Mt(O,oe){const ve={...n.value.context_budget_overrides};oe.target.value===""?delete ve[O]:ve[O]=Number(oe.target.value),n.value.context_budget_overrides=ve,R.value=!0}function vs(O){n.value.context_utilization=O.target.value===""?"":Number(O.target.value),R.value=!0}function Qs(O){const oe={...n.value.context_budget_overrides};delete oe[O],n.value.context_budget_overrides=oe,R.value=!0}async function Wt(){e.value=!0,await Promise.all([Ht(),bs(),rs(),ee(),es(),gs()]),e.value=!1}async function Ht({preserveBasic:O=!1,preserveAdvanced:oe=!1}={}){try{const ve=await z.get("/api/llm/status");t.value=ve,s.value=!1,a.value=ve.active_provider||"codex",ve.codex&&!ha.pending()&&(O||(n.value.enabled=ve.codex.enabled,n.value.model=ve.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=ve.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=ve.codex.agent_reasoning_effort||""),oe||(n.value.request_timeout_seconds=ve.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=ve.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...ve.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...ve.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...ve.codex.context_compression||{}},!R.value&&!ae.value&&(n.value.context_budget_overrides={...ve.codex.context_budget_overrides||{}},n.value.context_utilization=ve.codex.context_utilization??n.value.context_utilization))),ve.ollama&&!qs.pending()&&(O||(j.value.enabled=ve.ollama.enabled,j.value.base_url=ve.ollama.base_url||"",j.value.model=ve.ollama.model||"",j.value.max_tokens=ve.ollama.max_tokens||4096),oe||(j.value.timeout=ve.ollama.timeout??j.value.timeout));const Oe=ve.openai_compatible;Oe&&!ea.pending()&&(O||(L.value.enabled=Oe.enabled,L.value.base_url=Oe.base_url||L.value.base_url,L.value.model=Oe.model||L.value.model,L.value.max_tokens=Oe.max_tokens||4096,L.value.preset=Oe.preset||L.value.preset),oe||(L.value.timeout=Oe.timeout??L.value.timeout,L.value.model_profiles=Oe.model_profiles||L.value.model_profiles,L.value.context_utilization=Oe.context_utilization??L.value.context_utilization)),ve.auxiliary&&(I.value=ve.auxiliary,Xs.pending()||(A.value.enabled=ve.auxiliary.enabled,A.value.model=ve.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},openai_compatible:{configured:null}}),s.value=!0}}async function gs(){const O=++B;E.value=!0,C.value="";try{const oe=await z.get("/api/context/windows");if(O!==B)return;_.value=oe,!ae.value&&!R.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(oe.models||{}).filter(([,ve])=>ve.override!=null).map(([ve,Oe])=>[ve,Oe.override])),n.value.context_utilization=oe.utilization??n.value.context_utilization)}catch(oe){O===B&&(C.value=oe.message||"Failed to load context budgets")}finally{O===B&&(E.value=!1)}}async function bs(){try{if(K.value=await z.get("/api/ollama/status"),me.value=!1,K.value.model&&(W.value=K.value.model),K.value.configured)try{const O=await z.get("/api/ollama/models");de.value=O.models||[]}catch{de.value=[]}else if(j.value.base_url)try{const O=await z.post("/api/ollama/probe-models",{base_url:j.value.base_url});de.value=O.models||[]}catch{de.value=[]}}catch{me.value=!0}}async function es(){he.value=!0,xe.value="";try{Ae.value=await z.get("/api/codex/status")}catch(O){xe.value=O.message||"Failed to fetch Codex status"}finally{he.value=!1}}async function Ds(){const O=t.value?t.value.active_provider:"codex";ie.value=!0;try{const oe=await z.post("/api/llm/switch",{provider:a.value});oe.error?(a.value=O,fe(oe.error,"error")):(fe("Switched to "+a.value+" ("+oe.model+")"),await Wt())}catch(oe){a.value=O,fe(oe.message||"Switch failed","error")}finally{ie.value=!1}}async function nn(){pe.value=!0;try{const O=await z.post("/api/ollama/reload");fe(O.configured?"Ollama reloaded":O.reason||"Ollama not configured",O.configured?"success":"error"),await Wt()}catch(O){fe(O.message||"Reload failed","error")}finally{pe.value=!1}}async function Vs(){ge.value=!0;try{await z.post("/api/ollama/model",{model:W.value}),fe("Model set to "+W.value),await Wt()}catch(O){fe(O.message||"Failed","error")}finally{ge.value=!1}}async function at(){const O=j.value.base_url;if(!O){fe("Enter a base URL first","error");return}J.value=!0;try{const oe=await z.post("/api/ollama/probe-models",{base_url:O});de.value=oe.models||[],de.value.length?(fe(de.value.length+" model(s) found"),!j.value.model&&de.value.length&&(j.value.model=de.value[0].name)):fe("No models found at "+O,"error")}catch(oe){fe(oe.message||"Could not reach Ollama","error")}finally{J.value=!1}}async function rs(){try{if(ye.value=await z.get("/api/openai-compatible/status"),_e.value=!1,ye.value.model&&(T.value=ye.value.model),ye.value.configured)try{const O=await z.get("/api/openai-compatible/models");Ne.value=O.models||[]}catch{Ne.value=[]}}catch{_e.value=!0}}async function Ha(){M.value=!0;try{const O=await z.post("/api/openai-compatible/reload");fe(O.configured?"OpenAI-compatible reloaded":O.reason||"OpenAI-compatible not configured",O.configured?"success":"error"),await Wt()}catch(O){fe(O.message||"Reload failed","error")}finally{M.value=!1}}async function le(){q.value=!0;try{await z.post("/api/openai-compatible/model",{model:T.value}),fe("Model set to "+T.value),await Wt()}catch(O){fe(O.message||"Failed","error")}finally{q.value=!1}}async function Te(){if(ae.value){ha();return}ae.value=!0;const O=Ip(n.value);try{await z.put("/api/llm/codex/config",O),fe("Codex config saved"),await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:!0}),es()])}catch(oe){fe(oe.message||"Failed","error");const ve=JSON.stringify(Ip(n.value))!==JSON.stringify(O);await Promise.all([Ht({preserveBasic:ve,preserveAdvanced:!0}),es()])}finally{ae.value=!1}}async function He(){if(ae.value)return;ae.value=!0;const O=Op(n.value);try{await z.put("/api/llm/codex/config",O),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:O.context_budget_overrides,context_utilization:O.context_utilization})&&(R.value=!1),fe("Codex advanced settings saved"),await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:!0}),es(),gs()])}catch(oe){fe(oe.message||"Failed","error");const ve=JSON.stringify(Op(n.value))!==JSON.stringify(O);await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:ve}),es(),gs()])}finally{ae.value=!1}}async function Je(){if(ne.value){qs();return}ne.value=!0;try{const O=N.value?j.value.api_key:null,oe=qS(j.value,{includeApiKey:O!==null});await z.put("/api/llm/ollama/config",oe),fe("Ollama config saved"),O!==null&&j.value.api_key===O&&(j.value.api_key="",N.value=!1),await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:!0}),bs()])}catch(O){fe(O.message||"Failed","error")}finally{ne.value=!1}}async function _t(){if(!ne.value){ne.value=!0;try{await z.put("/api/llm/ollama/config",GS(j.value)),fe("Ollama timeout saved"),await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:!0}),bs()])}catch(O){fe(O.message||"Failed","error")}finally{ne.value=!1}}}async function nt(){if(U.value){ea();return}U.value=!0;try{const O=P.value?L.value.api_key:null,oe=jS(L.value,{includeApiKey:O!==null});await z.put("/api/openai-compatible/config",oe),fe("OpenAI-compatible config saved"),O!==null&&L.value.api_key===O&&(L.value.api_key="",P.value=!1),await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:!0}),rs()])}catch(O){fe(O.message||"Failed","error")}finally{U.value=!1}}async function fa(){if(!U.value){U.value=!0;try{await z.put("/api/openai-compatible/config",VS(L.value)),fe("OpenAI-compatible endpoint settings saved"),await Promise.all([Ht({preserveBasic:!0,preserveAdvanced:!0}),rs()])}catch(O){fe(O.message||"Failed","error")}finally{U.value=!1}}}async function Ps(){if(b.value){Xs();return}b.value=!0;try{await z.put("/api/llm/auxiliary/config",A.value),fe("Auxiliary config saved"),await Ht()}catch(O){fe(O.message||"Failed","error"),await Ht()}finally{b.value=!1}}const ha=Kl(Te),Xs=Kl(Ps),qs=Kl(Je),ea=Kl(nt),ma=()=>(ha.cancel(),Te()),za=()=>(qs.cancel(),Je()),zt=()=>(ea.cancel(),nt()),va=()=>He(),ys=()=>_t(),Dn=()=>fa();async function Pn(O){const oe=O.account_key+":"+O.model;w.value=oe;try{const ve=await z.post("/api/context/windows/clear",{account_key:O.account_key,model:O.model});fe(ve.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await gs()}catch(ve){fe(ve.message||"Failed to clear clamp","error"),await gs()}finally{w.value=null}}async function ki(O){try{await z.post("/api/codex/account/"+O+"/activate"),fe("Active account switched"),await es()}catch(oe){fe(oe.message||"Failed","error")}}async function Mn(O){Le.value=O;try{await z.post("/api/codex/account/"+O+"/refresh"),fe("Token refreshed"),await es()}catch(oe){fe(oe.message||"Refresh failed","error")}finally{Le.value=null}}function Fn(O,oe){$e.value=O,Me.value=oe||""}async function ja(O){try{await z.put("/api/codex/account/"+O+"/label",{label:Me.value}),fe("Label updated"),$e.value=null,await es()}catch(oe){fe(oe.message||"Failed","error")}}async function ln(O,oe){if(await qt({title:"Delete Codex account",message:`Delete ${oe||"account #"+(O+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/codex/account/"+O),fe("Deleted. Pool reloaded."),await es()}catch(Oe){fe(Oe.message||"Failed","error")}}async function Ce(){Ue.value=!0;try{const O=await z.post("/api/codex/device-code");Ye.value=O,Fe.value="pending",D(O)}catch(O){fe(O.message||"Failed","error")}finally{Ue.value=!1}}async function D(O){we={cancelled:!1};const oe=we;try{const ve=await z.post("/api/codex/device-poll",{device_auth_id:O.device_auth_id,user_code:O.user_code,interval:O.interval});if(oe.cancelled)return;je.value=ve,Fe.value="success",await Wt()}catch(ve){if(oe.cancelled)return;Q.value=ve.message||"Device login failed",Fe.value="error"}}function ce(){we&&(we.cancelled=!0),Fe.value=null,Ye.value=null}return Ge(Wt),ut(()=>{we&&(we.cancelled=!0),ha.cancel(),Xs.cancel(),qs.cancel(),ea.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:a,switching:ie,advancedOpen:x,codexForm:n,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:u,agentEffortAllowed:p,mainModelOptionDisabled:m,agentModelOptionDisabled:g,auxForm:A,auxData:I,auxModelOptions:y,onAuxModelChange:v,savingAux:b,saveAuxConfigDebounced:Xs,ollamaForm:j,compatibleForm:L,savingCodex:ae,savingOllama:ne,savingCompatible:U,probingOllama:J,ollamaKeyDirty:N,compatibleKeyDirty:P,fetchCodexStatus:es,ollamaStatus:K,ollamaStatusLoadFailed:me,ollamaModels:de,ollamaSelectedModel:W,reloading:pe,settingModel:ge,compatibleStatus:ye,compatibleStatusLoadFailed:_e,compatibleModels:Ne,compatibleSelectedModel:T,reloadingCompatible:M,settingCompatibleModel:q,agentsConfig:re,compatibleAgentModels:$,ollamaAgentModels:Z,knownAgentModelRefs:ue,agentModelLabel:H,saveAgentsModel:X,toggleAgentAutoAllowlist:be,codexLoading:he,codexError:xe,codexData:Ae,refreshing:Le,editingLabel:$e,labelValue:Me,contextWindows:_,contextWindowsLoading:E,contextWindowsError:C,contextBudgetRows:S,activeClampRows:F,activeContextBudget:Y,clearingClamp:w,contextPolicyDirty:R,deviceState:Fe,deviceLoading:Ue,deviceInfo:Ye,deviceResult:je,deviceError:Q,fetchAll:Wt,fetchLLMStatus:Ht,fetchOllamaStatus:bs,fetchCompatibleStatus:rs,switchProvider:Ds,reloadOllama:nn,setOllamaModel:Vs,reloadCompatible:Ha,setCompatibleModel:le,probeOllamaModels:at,saveCodexConfig:Te,saveOllamaConfig:Je,saveCompatibleConfig:nt,saveCodexAdvancedConfig:He,saveOllamaAdvancedConfig:_t,saveCompatibleAdvancedConfig:fa,saveCodexConfigDebounced:ha,saveOllamaConfigDebounced:qs,saveCompatibleConfigDebounced:ea,saveCodexConfigNow:ma,saveOllamaConfigNow:za,saveCompatibleConfigNow:zt,saveCodexAdvancedConfigNow:va,saveOllamaAdvancedConfigNow:ys,saveCompatibleAdvancedConfigNow:Dn,activateAccount:ki,refreshAccount:Mn,startEditLabel:Fn,saveLabel:ja,deleteAccount:ln,startDeviceLogin:Ce,cancelDeviceLogin:ce,formatSize:Ie,fetchContextWindows:gs,clearContextClamp:Pn,setContextOverride:Mt,setContextUtilization:vs,resetContextOverride:Qs,overrideAboveFloor:xt,formatCount:se,formatContextCeiling:Re,formatExpiry:De,shortAccountKey:st,provenanceClass:rt,formatDensity:Gt}}},Lp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function KS(e){return Lp[e]||Lp[(e||"").toLowerCase()]||"text-gray-400"}const JS={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=V(()=>{var _;return Object.values(((_=i.value)==null?void 0:_.totals)||{}).reduce((E,C)=>E+Number(C||0),0)}),u=f(""),p=f(0),h=f([]),m=V(()=>h.value.map(_=>`${_.label} (${_.path}${_.reason?`: ${_.reason}`:""})`).join("; ")),g=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let A=null;async function I(){var R;const _=await Promise.allSettled(g.map(B=>z.get(B.path))),E=B=>_[B].status==="fulfilled"?_[B].value:null;t.value=E(0)||{};const C=E(1);s.value=Array.isArray(C)?C:C&&C.subsystems||[],a.value=E(2)||{},n.value=E(3)||{},i.value=E(4),l.value=E(5),o.value=E(6),r.value=E(7),c.value=E(8);const w=_.filter(B=>B.status==="rejected");if(h.value=_.flatMap((B,S)=>{var F;return B.status==="rejected"?[{...g[S],reason:((F=B.reason)==null?void 0:F.message)||"request failed"}]:[]}),p.value=h.value.length,w.length===_.length){const B=(R=w[0])==null?void 0:R.reason;u.value=(B==null?void 0:B.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",I()}let v=!1;function b(){v||(v=!0,I(),A||(A=setInterval(I,3e4)))}function x(){v&&(v=!1,A&&(clearInterval(A),A=null))}return Ge(b),Xt(b),Ut(x),ut(x),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:g,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:KS,formatAgeSeconds:fk}}},ZS=1e4,Np=3e4;function Oi(e,t){return Math.max(0,e-t)}function Hr(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const YS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],QS={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Turn State</h1>
        <div class="flex items-center gap-2">
          <span v-if="anyStale" class="badge badge-warning text-xs">Data stale</span>
          <button @click="refreshAll" class="btn btn-ghost text-xs"
                  :disabled="turnsLoading && breakersLoading">Refresh</button>
        </div>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        Read-only current recovery posture. Historical interrupted-effect evidence
        remains available below as diagnostics, not operator work.
      </p>

      <div class="hm-card mb-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 class="text-sm font-semibold text-gray-300">Current posture</h2>
            <p class="text-xs text-gray-600 mt-1">Active work, suspended recovery, expired leases, and effects requiring a human.</p>
          </div>
          <span v-if="turnsStale" class="text-xs text-amber-500">stale — last success {{ turnsAgeSeconds }}s ago</span>
        </div>

        <div v-if="turnsAvailability === 'not_enabled'" class="text-xs text-gray-500">
          Turn durability is not enabled in this deployment.
        </div>
        <div v-else-if="turnsError && !turnsData" class="error-state">
          <p class="text-red-400 text-sm">{{ turnsError }}</p>
          <button @click="fetchTurns" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <template v-else-if="turnsData">
          <div v-if="turnsError" class="dash-load-warning text-xs mb-2">Refresh failed: {{ turnsError }} — showing last known posture</div>
          <div class="ts-count-row mb-3">
            <div class="ts-count"><span class="ts-count-value">{{ turnsData.counts.active }}</span><span class="ts-count-label">Active</span></div>
            <div class="ts-count"><span class="ts-count-value">{{ turnsData.counts.suspended }}</span><span class="ts-count-label">Suspended</span></div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.expired_active > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.expired_active }}</span><span class="ts-count-label">Expired leases</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.manual_resolution_operations > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.manual_resolution_operations }}</span><span class="ts-count-label">Manual effects</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.attention_required > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.attention_required }}</span><span class="ts-count-label">Attention</span>
            </div>
          </div>

          <div v-if="sortedTurns.length === 0" class="text-xs text-gray-500">
            No active, suspended, or manual-resolution turns.
          </div>
          <div v-else class="space-y-2">
            <div v-if="turnsData.truncated" class="text-xs text-amber-500">
              Showing {{ sortedTurns.length }} prioritized posture rows —
              {{ turnsData.omitted_turns }} older row{{ turnsData.omitted_turns === 1 ? '' : 's' }} omitted.
              <span v-if="turnsData.omitted_attention_turns > 0" role="alert">
                {{ turnsData.omitted_attention_turns }} omitted row{{ turnsData.omitted_attention_turns === 1 ? '' : 's' }} still require attention.
              </span>
            </div>
            <div v-for="t in sortedTurns" :key="t.source + ':' + t.channel_id + ':' + t.message_id"
                 class="ts-turn-row">
              <div class="ts-turn-head">
                <span class="badge text-xs" :class="priorityBadge(t).cls">{{ priorityBadge(t).label }}</span>
                <span class="text-xs text-gray-400">{{ t.source }}</span>
                <span class="text-xs text-gray-500 font-mono">{{ t.channel_id }}</span>
                <span class="text-xs text-gray-600 font-mono">{{ t.message_id }}</span>
                <span v-if="t.has_checkpoint" class="text-xs text-gray-500">checkpointed</span>
                <span class="text-xs text-gray-600 ts-turn-age">{{ ageLabel(t.last_progress_at) }}</span>
              </div>
              <div v-if="priorityOf(t) === 0" class="ts-turn-warning" role="alert">
                A human owns verification of an unresolved external effect.
              </div>
              <div v-else-if="priorityOf(t) === 1" class="ts-turn-warning" role="alert">
                The active owner lease is missing or expired; recovery should sweep or resume this turn.
              </div>
              <div v-if="t.operations.length" class="ts-op-list">
                <span v-for="op in t.operations" :key="op.tool_call_id" class="ts-op"
                      :class="{ 'ts-op-alert': op.state === 'MANUAL_RESOLUTION_REQUIRED' }">
                  {{ op.tool_name }} · {{ op.state }}<template v-if="op.iteration !== null"> · iter {{ op.iteration }}</template>
                </span>
                <span v-if="t.more_attention_evidence" class="text-xs text-amber-500" role="alert">
                  …more manual-resolution evidence retained in the ledger
                </span>
                <span v-else-if="t.operations_truncated" class="text-xs text-gray-500">…more operation evidence</span>
              </div>
            </div>
          </div>

          <div class="ts-diagnostics mt-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-sm font-semibold text-gray-400">Historical diagnostics</h3>
                <p class="text-xs text-gray-600 mt-1">Retained ambiguous-effect evidence. Diagnostic only; not counted as Attention.</p>
              </div>
              <div class="flex items-center gap-3 text-xs text-gray-500">
                <span>{{ turnsData.diagnostics.outcome_unknown.operations }} unknown operation{{ turnsData.diagnostics.outcome_unknown.operations === 1 ? '' : 's' }}</span>
                <span>{{ turnsData.diagnostics.outcome_unknown.turns }} turn{{ turnsData.diagnostics.outcome_unknown.turns === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <div v-if="turnsData.diagnostics.outcome_unknown.by_tool.length" class="ts-op-list mt-2">
              <span v-for="row in turnsData.diagnostics.outcome_unknown.by_tool" :key="row.tool_name" class="ts-op">
                {{ row.tool_name }} · {{ row.operations }}
              </span>
              <span v-if="turnsData.diagnostics.outcome_unknown.tools_truncated" class="text-xs text-gray-500">
                …{{ turnsData.diagnostics.outcome_unknown.omitted_tools }} more tool{{ turnsData.diagnostics.outcome_unknown.omitted_tools === 1 ? '' : 's' }}
              </span>
            </div>
            <p v-else class="text-xs text-gray-600 mt-2">No historical unknown-effect evidence.</p>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>

      <div class="hm-card">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-sm font-semibold text-gray-300">Model capacity breakers</h2>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-600">process lifetime</span>
            <span v-if="breakersStale" class="text-xs text-amber-500">stale — last success {{ breakersAgeSeconds }}s ago</span>
          </div>
        </div>

        <div v-if="breakersAvailability === 'not_enabled'" class="text-xs text-gray-500">
          Breaker registry is not constructed in this deployment.
        </div>
        <div v-else-if="breakersError && !breakersData" class="error-state">
          <p class="text-red-400 text-sm">{{ breakersError }}</p>
          <button @click="fetchBreakers" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <template v-else-if="breakersData">
          <div v-if="breakersError" class="dash-load-warning text-xs mb-2">Refresh failed: {{ breakersError }} — showing last known posture</div>
          <div v-if="breakersData.breakers.length === 0" class="text-xs text-gray-500">
            No breakers registered yet this process.
          </div>
          <div v-else class="table-responsive">
            <table class="hm-table">
              <thead><tr>
                <th>Provider</th><th>Model</th><th>State</th>
                <th class="text-right">Failed generations</th>
                <th class="text-right">Consecutive opens</th>
                <th class="text-right">Cooldown</th>
              </tr></thead>
              <tbody>
                <tr v-for="b in breakersData.breakers" :key="b.name">
                  <td class="text-xs">{{ b.provider }}</td>
                  <td class="text-xs font-mono">{{ b.model }}</td>
                  <td><span class="badge text-xs" :class="breakerBadge(b)">{{ b.state }}</span></td>
                  <td class="text-right text-xs">{{ b.failed_generations }}</td>
                  <td class="text-right text-xs">{{ b.consecutive_opens }}</td>
                  <td class="text-right text-xs">{{ cooldownLabel(b) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>
    </div>
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const N=++p;a.value=!0;try{const P=await z.get("/api/turn-state/turns?limit=100");if(N!==p)return;t.value=P.availability,e.value=P.availability==="available"?P.data:null,s.value=null,n.value=Date.now()}catch(P){if(N!==p)return;s.value=P.message||"Turn-state read failed",P.status===503&&(t.value="unavailable")}N===p&&(a.value=!1)}async function g(){const N=++h;r.value=!0;try{const P=await z.get("/api/turn-state/capacity-breakers");if(N!==h)return;l.value=P.availability,i.value=P.availability==="available"?P.data:null,o.value=null,c.value=Date.now()}catch(P){if(N!==h)return;o.value=P.message||"Breaker read failed",P.status===503&&(l.value="unavailable")}N===h&&(r.value=!1)}function A(){m(),g()}const I=V(()=>e.value!==null&&Oi(d.value,n.value)>Np),y=V(()=>i.value!==null&&Oi(d.value,c.value)>Np),v=V(()=>I.value||y.value),b=V(()=>Math.round(Oi(d.value,n.value)/1e3)),x=V(()=>Math.round(Oi(d.value,c.value)/1e3));function _(N){return Hr(N,d.value/1e3)}function E(N){return YS[_(N)]}const C=V(()=>{var ae;const N=[...((ae=e.value)==null?void 0:ae.turns)||[]],P=d.value/1e3;return N.sort((ne,U)=>Hr(ne,P)-Hr(U,P)||(U.last_progress_at||0)-(ne.last_progress_at||0))});function w(N){return N.state==="closed"?"badge-success":N.state==="probing"?"badge-warning":"badge-danger"}function R(N){if(N.state==="closed")return"—";const P=Oi(d.value,c.value)/1e3,ae=Math.max(0,(N.cooldown_remaining_seconds||0)-P);return ae>0?`${Math.ceil(ae)}s`:N.state==="probing"?"probe in flight":"probe eligible"}function B(N){if(!N)return"";const P=Math.max(0,Math.round(d.value/1e3-N));if(P<90)return`${P}s ago`;const ae=Math.round(P/60);return ae<90?`${ae}m ago`:`${Math.round(ae/60)}h ago`}let S=null,F=null,Y=!1;function j(){Y||(Y=!0,A(),S=setInterval(A,ZS),u=setInterval(()=>{d.value=Date.now()},1e3),F=Xe.onReconnected(A))}function L(){Y&&(Y=!1,S&&(clearInterval(S),S=null),u&&(clearInterval(u),u=null),F&&(F(),F=null))}return Ge(j),Xt(j),Ut(L),ut(L),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:I,breakersStale:y,anyStale:v,turnsAgeSeconds:b,breakersAgeSeconds:x,sortedTurns:C,priorityOf:_,priorityBadge:E,breakerBadge:w,cooldownLabel:R,ageLabel:B,fetchTurns:m,fetchBreakers:g,refreshAll:A,arm:j,disarm:L}}},XS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await z.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await qt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await z.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Dp=e=>JSON.parse(JSON.stringify(e)),e1=(e,t)=>JSON.stringify(e)===JSON.stringify(t),t1={emits:["saved"],template:`
    <section class="hm-card computer-provisioning" aria-labelledby="computer-provisioning-title">
      <div class="section-card-header">
        <div>
          <h2 id="computer-provisioning-title" class="text-sm font-semibold text-gray-300">Computer provisioning</h2>
          <p class="page-lede">Edit desired target, storage and launcher policy. All settings below require an Odin restart. Startup values remain pinned, even across disable/enable cycles.</p>
        </div>
        <span class="badge badge-warning">Restart required</span>
      </div>
      <p class="page-lede mb-3">Saving does not install dependencies, create storage, grant OS permissions, attach to a desktop or restart Odin. Enable/disable and Stop session are separate lifecycle controls above.</p>
      <p v-if="draft.platform === 'wayland' && draft.wayland_backend === 'hyprland'" class="text-sm text-amber-300 mb-3" role="note"><strong>Hyprland only: best-effort input.</strong> A hard guardian SIGKILL can leave input held. Releasing Odin's button can clobber the physical user's simultaneous same-button hold. Use Release owned input for recovery, then obtain a fresh observation. Native explicit-output capture only; there is no portal fallback. The operator must load the ABI-matched scope plugin once at setup. Saving or enabling never loads it or edits hyprland.conf.</p>
      <p v-if="message" class="text-sm text-amber-300 mb-3" role="status">{{ message }}</p>
      <p v-if="error" class="text-sm text-red-400 mb-3" role="alert">{{ error }}</p>
      <p v-if="loading" class="page-lede" role="status">Loading desired configuration and restart metadata…</p>
      <p v-if="ready" class="page-lede mb-3">{{ pending.length ? 'Saved settings still pending restart: ' + pending.join(', ') : 'No pending provisioning restart reported.' }}</p>
      <p v-if="ready && effectiveUnknown" class="page-lede mb-3">Some startup values are unknown; absence of a pending flag does not prove those settings are active.</p>
      <form v-if="ready" @submit.prevent="openReview">
        <fieldset :disabled="loading || saving || reviewing || uncertain" class="computer-provisioning-fields">
          <legend class="sr-only">Desired computer settings</legend>
          <div v-for="field in fields" :key="field.path" class="computer-provisioning-field">
            <label class="field-label" :for="fieldId(field)">{{ field.label }}</label>
            <p class="page-lede" :id="fieldId(field) + '-help'">{{ field.description }}</p>
            <select v-if="field.enum?.length" class="hm-select" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" v-model="draft[field.key]">
              <option v-for="option in field.enum" :key="String(option)" :value="option">{{ option }}</option>
            </select>
            <input v-else-if="field.type === 'boolean'" type="checkbox" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" v-model="draft[field.key]" />
            <textarea v-else-if="field.type === 'array'" class="hm-input font-mono" rows="3" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" :value="draft[field.key]" @input="edit(field, $event.target.value)" placeholder="One monitor name per line"></textarea>
            <input v-else class="hm-input font-mono" :type="['integer', 'number'].includes(field.type) ? 'number' : 'text'" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" :min="field.constraints?.minimum" :max="field.constraints?.maximum" :step="field.type === 'integer' ? 1 : 'any'" :value="draft[field.key] ?? ''" @input="edit(field, $event.target.value)" autocomplete="off" />
            <p v-if="validation[field.key]" class="text-sm text-red-400" role="alert">{{ validation[field.key] }}</p>
          </div>
        </fieldset>
        <div class="action-row mt-4">
          <button class="btn btn-primary btn-touch" type="submit" :disabled="!changes.length || invalid || loading || saving || reviewing || uncertain">Review {{ changes.length }} change{{ changes.length === 1 ? '' : 's' }}</button>
          <button class="btn btn-ghost btn-touch" type="button" @click="discard" :disabled="loading || saving || uncertain || !changes.length">Discard draft</button>
        </div>
      </form>
      <section v-if="reviewing" class="computer-provisioning-review mt-4" aria-labelledby="computer-provisioning-review-title">
        <h3 id="computer-provisioning-review-title" class="text-sm font-semibold">Review provisioning changes</h3>
        <dl class="detail-grid mt-3">
          <div v-for="change in changes" :key="change.key">
            <dt>{{ change.label }}</dt>
            <dd><strong>Saved:</strong> {{ format(original[change.key]) }}</dd>
            <dd><strong>Desired:</strong> {{ format(change.value) }}</dd>
          </div>
        </dl>
        <p class="page-lede mt-3">Only these changed provisioning fields will be saved. Running sessions keep startup settings. Nothing is enabled, stopped or restarted.</p>
        <div class="action-row mt-3">
          <button class="btn btn-primary btn-touch" type="button" @click="save" :disabled="saving || loading || invalid || uncertain || !changes.length">{{ saving ? 'Saving and checking configuration…' : 'Save reviewed provisioning' }}</button>
          <button class="btn btn-ghost btn-touch" type="button" @click="reviewing = false" :disabled="saving">Back to editing</button>
        </div>
      </section>
      <button class="btn btn-ghost btn-touch mt-3" type="button" @click="load" :disabled="loading || saving || (changes.length > 0 && !uncertain)">{{ uncertain ? 'Reload saved values (discard draft)' : 'Reload provisioning' }}</button>
      <p class="text-xs text-gray-500 mt-3">Drafts are local to this view and discarded when leaving it. Backend validation remains authoritative.</p>
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const g=(L,N)=>p&&h===L&&z.token===N,A=L=>"computer-provisioning-"+L.key,I=L=>L===null?"Unset":L===""?"Empty":JSON.stringify(L),y=L=>{const N=n.value[L.key];return L.type==="array"?String(N||"").split(/\r?\n/).map(P=>P.trim()).filter(Boolean):["integer","number"].includes(L.type)?N===""||N==null?null:Number(N):N},v=V(()=>s.value.map(L=>({...L,value:y(L)})).filter(L=>!e1(L.value,a.value[L.key]))),b=V(()=>s.value.filter(L=>L.pending_restart).map(L=>L.label)),x=V(()=>s.value.some(L=>L.apply_state==="unknown")),_=V(()=>{const L={};for(const N of s.value){const P=y(N),ae=N.constraints||{};["integer","number"].includes(N.type)&&(P===null&&!N.nullable?L[N.key]="A number is required.":P!==null&&(!Number.isFinite(P)||N.type==="integer"&&!Number.isInteger(P)||ae.minimum!=null&&P<ae.minimum||ae.maximum!=null&&P>ae.maximum)&&(L[N.key]="Enter a number within the allowed range.")),N.key==="monitor_names"&&(P.length>16||new Set(P).size!==P.length||P.some(ne=>!/^[A-Za-z0-9_.-]{1,64}$/.test(ne)))&&(L[N.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return L}),E=V(()=>Object.keys(_.value).length>0);function C(L,N){n.value[L.key]=N,u.value=""}function w(){n.value=Object.fromEntries(s.value.map(L=>[L.key,L.type==="array"?a.value[L.key].join(`
`):a.value[L.key]])),r.value=!1}async function R(L,N){const[P,ae]=await Promise.all([z.get("/api/config"),z.get("/api/config/meta")]);if(!g(L,N))return!1;const ne=(ae.fields||[]).filter(U=>/^computer\.[^.]+$/.test(U.path)&&U.path!=="computer.enabled"&&U.sensitivity==="public"&&U.apply_mode==="restart");if(!P.computer||!ne.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=ne.map(U=>({...U,key:U.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(U=>[U.key,Dp(P.computer[U.key])])),w(),m=N,i.value=!0,c.value=!1,!0}async function B(){if(!p||l.value||o.value)return;const L=++h,N=z.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await R(L,N)}catch(P){g(L,N)&&(c.value=!0,d.value=P.message||"Could not load provisioning. No changes were sent.")}finally{g(L,N)&&(l.value=!1)}}function S(){i.value&&!l.value&&!o.value&&!c.value&&v.value.length&&!E.value&&(r.value=!0)}async function F(){if(!p||!i.value||!r.value||o.value||l.value||c.value||E.value||!v.value.length)return;if(m!==z.token){j(),Y();return}const L={computer:Object.fromEntries(v.value.map(ne=>[ne.key,Dp(ne.value)]))},N=h,P=z.token;o.value=!0,d.value="",u.value="";let ae=!1;try{if(await z.put("/api/config",L),ae=!0,!g(N,P))return;await R(N,P)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(ne){g(N,P)&&(c.value=!0,r.value=!1,d.value=ae?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${ne.status===400?": "+ne.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{g(N,P)&&(o.value=!1)}}function Y(){p||(p=!0,B())}function j(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Ge(Y),Xt(Y),Ut(j),ut(j),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:x,changes:v,validation:_,invalid:E,fieldId:A,format:I,edit:C,discard:w,load:B,openReview:S,save:F}}},s1={components:{ComputerProvisioning:t1},template:`
    <div class="p-6 page-fade-in computer-page" role="region" aria-labelledby="computer-title">
      <header class="page-header mb-4">
        <div class="page-header-copy">
          <h1 id="computer-title" class="text-xl font-semibold">Computer operator</h1>
          <p class="page-lede">Private session inspection. This page never presses keys or buttons; emergency recovery may explicitly release held input.</p>
        </div>
        <div class="page-header-actions" aria-label="Emergency session controls">
          <button class="btn btn-ghost btn-touch" @click="control('pause')" :disabled="pausing" aria-label="Pause and revoke agent input">
            <odin-icon name="pause" :size="15" />
            {{ pausing ? 'Pausing…' : 'Pause / revoke input' }}
          </button>
          <button class="btn btn-danger btn-touch" @click="control('stop')" :disabled="stopping" aria-label="Stop computer session">
            <odin-icon name="error" :size="15" />
            {{ stopping ? 'Stopping…' : 'Stop session' }}
          </button>
        </div>
      </header>
      <div v-if="error" class="hm-card border-red-900 error-state mb-4" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <p v-if="remedy" class="text-amber-300">Operator action: {{ remedy }}</p>
      </div>
      <div class="hm-card computer-status-card mb-4" role="status" aria-live="polite">
        <div>
          <div class="section-eyebrow">{{ adminReady ? 'Current session' : 'Last-known session (not current)' }}</div>
          <div class="computer-state">{{ status.state || 'unknown' }}</div>
        </div>
        <span class="badge badge-info">{{ loading ? 'Checking status' : adminReady ? 'Session status' : 'Status not current' }}</span>
      </div>
      <p v-if="!adminReady" class="page-lede mb-4" role="status">{{ checkedAt ? 'Last successful status check: ' + new Date(checkedAt).toISOString() + '. ' : 'No successful status check. ' }}Preserved details are read-only history, not current readiness, consent or session authority. Refresh status independently before further operations. Emergency Pause / Stop only request revocation and remain independently authenticated by the server.</p>
      <div class="space-y-4">
      <section class="hm-card" aria-labelledby="computer-lifecycle-title">
        <div class="section-card-header">
          <div>
            <h2 id="computer-lifecycle-title" class="text-sm font-semibold text-gray-300">Administrator lifecycle controls</h2>
            <p class="page-lede">Configuration and runtime state are separate. Changes here never restart Odin.</p>
          </div>
        </div>
        <dl class="detail-grid mb-4">
          <div><dt>Configured</dt><dd>{{ enabledLabel(status.configured_enabled ?? status.enabled) }}</dd></div>
          <div><dt>Runtime lifecycle</dt><dd>{{ enabledLabel(status.runtime_enabled) }}</dd></div>
          <div><dt>Runtime generation</dt><dd>{{ status.generation ?? 'Unknown' }}</dd></div>
          <div><dt>Backend platform / environment</dt><dd>{{ status.backend?.platform || 'Unknown' }} / {{ status.backend?.environment || 'Unknown' }}</dd></div>
          <div><dt>Restart-required settings</dt><dd>{{ restartSettings }}</dd></div>
        </dl>
        <div v-if="adminReady" class="action-row mb-3">
          <button class="btn btn-primary btn-touch" @click="setEnabled(true)" :disabled="toggling || stopping || pausing || (status.configured_enabled ?? status.enabled) === true">Enable computer use</button>
          <button class="btn btn-danger btn-touch" @click="setEnabled(false)" :disabled="toggling || stopping || pausing">Disable computer use</button>
        </div>
        <p v-else class="page-lede">Lifecycle controls require a successful authenticated administrator status check.</p>
        <p v-if="toggling" class="text-sm text-amber-400" role="status">Applying lifecycle change and checking status…</p>
        <p class="page-lede">Enabling does not prove backend readiness or start a session. Session startup checks capabilities. Unavailable input remains unavailable.</p>
        <p v-if="status.backend?.input_supported === false" class="page-lede">Input unavailable: this backend cannot act. Enabling computer use does not grant mouse or keyboard control.</p>
        <p v-else-if="status.backend?.input_supported !== true" class="page-lede">Input capability is unknown. Do not assume this backend can act.</p>
        <p v-else class="page-lede">Backend reports input support; session authorization and startup checks still apply.</p>
        <p v-if="status.backend?.input_blocker" class="page-lede text-break">Readiness: {{ status.backend.readiness }}. Input blocker: {{ status.backend.input_blocker }}.</p>
        <p v-if="['application_uid_mismatch', 'application_process_unreadable'].includes(status.backend?.input_blocker)" class="page-lede">Display capture access is not application inspection access. Provision the worker under the desktop user's identity, or explicitly configure runtime_sudo and its restricted worker permissions. This page does not elevate privileges.</p>
        <p class="text-xs text-gray-500 mt-3">Runtime settings are generation-pinned. Pending restart-required settings are not live; this page does not restart Odin.</p>
      </section>
      <computer-provisioning v-if="adminReady" @saved="refresh" />
      <section v-if="status.backend?.native_backend === 'hyprland'" class="hm-card" aria-labelledby="hyprland-input-title">
        <h2 id="hyprland-input-title" class="text-sm font-semibold text-amber-300">Hyprland native input: best-effort</h2>
        <p class="page-lede">A hard guardian SIGKILL can leave owned input held. Releasing Odin's button may clobber the physical user's simultaneous same-button hold. Cooperative release acknowledgments are not receiver-side proof. These accepted residuals apply only to Hyprland.</p>
        <p class="page-lede">Native capture is limited to the explicitly consented output. There is no portal fallback. Recovery revokes input and capture, leaves the session paused, and requires renewed consent and a fresh observation.</p>
        <button class="btn btn-danger btn-touch mt-3" @click="releaseOwnedInput" :disabled="!adminReady || recovering || !status.session_id">{{ recovering ? 'Requesting owned release…' : 'Release owned input' }}</button>
        <p v-if="status.owned_input_recovery" class="page-lede" role="status">{{ status.owned_input_recovery.released ? 'Cooperative release acknowledged; receiver-side release is not verified.' : 'Release not confirmed. Inspect the desktop and use documented operator recovery; do not resume input.' }}</p>
      </section>
      <section class="hm-card" aria-labelledby="computer-accessibility-title">
        <div class="section-card-header">
          <h2 id="computer-accessibility-title" class="text-sm font-semibold text-gray-300">Desktop accessibility (AT-SPI)</h2>
          <span class="badge badge-info" role="status" aria-live="polite">{{ accessibilityLabel }}</span>
        </div>
        <p class="page-lede">AT-SPI is Linux's accessibility interface. Enabling it lets Odin target UI elements by identity and replace field contents reliably when the application exposes editable elements.</p>
        <p class="page-lede">Without accessible elements, Odin can use pixels and coordinates. Field replacement uses the explicit pixel action (replace_field_pixels): click an observed field, select all, then type. It is less reliable and needs visual verification; identity-based replace_field never silently switches paths.</p>
        <p class="page-lede">Enabled is a session setting, not proof that a particular application exposes editable elements or that input is authorized. Fresh observations, application safety checks and consent still apply.</p>
        <p class="text-xs text-gray-500 mt-3">Read-only org.a11y.Status IsEnabled check for the configured runtime operator session, refreshed with status about every 5 seconds while this page is open. {{ accessibilityDetail }}</p>
        <p class="page-lede">This page does not enable or disable accessibility. Change it explicitly in your desktop's accessibility settings; that affects your whole user session, not just Odin.</p>
      </section>
      <section v-if="status.input_admission" class="hm-card text-break" aria-labelledby="computer-input-admission-title">
        <div class="section-card-header">
          <h2 id="computer-input-admission-title" class="text-sm font-semibold text-gray-300">Input eligibility evidence</h2>
          <span class="badge badge-info">{{ status.input_admission.state }}</span>
        </div>
        <div class="detail-stack text-sm text-gray-300">
          <p><strong>{{ status.input_admission.state }}</strong>: {{ status.input_admission.code }}</p>
          <p v-if="status.input_admission.compositor">Compositor: {{ status.input_admission.compositor.name }} {{ status.input_admission.compositor.version }} ({{ status.input_admission.compositor.backend }}). Build: {{ status.input_admission.compositor.build_id }}.</p>
          <p>{{ status.input_admission.reason }}</p>
          <p>Operator action: {{ status.input_admission.remedy }}</p>
          <p>Probe scope: {{ status.input_admission.probe_scope }}.</p>
        </div>
        <p v-if="status.input_admission.probe_scope === 'same_stack_disposable'" class="page-lede">Behavior was tested in a separate disposable compositor with the matched stack, not by abandoning held input on your desktop.</p>
        <p class="page-lede">Eligibility evidence does not replace current backend consent, source mapping or application checks. Opening this page runs no input probe.</p>
      </section>
      <section v-if="!attached" class="hm-card" aria-labelledby="computer-apps-title">
        <div class="section-card-header">
          <h2 id="computer-apps-title" class="text-sm font-semibold text-gray-300">Application profiles</h2>
        </div>
        <ul v-if="applicationProfiles.length" class="profile-list mb-3">
          <li v-for="profile in applicationProfiles" :key="profile.id" class="profile-list-item">
            <strong>{{ profile.label }}</strong>: {{ profile.input === 'supported' ? 'Input eligible' : 'Capture only' }}
            <span v-if="profile.input === 'capture_only'"> (application provenance unavailable)</span>
            <p v-if="profile.task_scope" class="page-lede">{{ profile.task_scope }}</p>
          </li>
        </ul>
        <p v-else class="page-lede">No application profiles reported for this backend.</p>
        <p class="page-lede">Profiles describe supported scope, not installation, focus, permission or task success. Input readiness is checked against a fresh observation.</p>
      </section>
      <section v-else class="hm-card text-break" aria-labelledby="computer-attached-title">
        <div class="section-card-header">
          <h2 id="computer-attached-title" class="text-sm font-semibold text-gray-300">Attached application</h2>
        </div>
        <p class="page-lede">Focus the application you want help with, then ask in ordinary chat. There is no application allowlist. Normal dialogs, file pickers, menus and document open/new/close/reopen are ordinary use. Session Stop only detaches input; applications stay open.</p>
        <p class="page-lede">Denied classes remain blocked: terminals, shells, authentication and password prompts, polkit, keyring, sudo and Odin control-plane windows. Session authorization, current target checks and input-release checks still apply.</p>
        <dl class="detail-grid mt-4 mb-3">
          <div><dt>Observed executable</dt><dd>{{ status.application_provenance?.exe_basename || 'Not observed' }}</dd></div>
          <div><dt>Observed WM_CLASS</dt><dd>{{ status.application_provenance?.wm_class || 'Not observed' }}</dd></div>
          <div><dt>Observed PID</dt><dd>{{ status.application_provenance?.pid ?? 'Not observed' }}</dd></div>
          <div><dt>Trusted executable metadata</dt><dd>{{ status.application_provenance?.trusted_executable === true ? 'Yes' : status.application_provenance?.trusted_executable === false ? 'No' : 'Unknown' }}</dd></div>
          <div v-if="status.application_provenance?.script_identity"><dt>Script identity evidence</dt><dd>{{ scriptIdentity }}</dd></div>
          <div><dt>Pointer</dt><dd>{{ status.backend?.pointer || 'unknown' }}</dd></div>
          <div><dt>Keyboard focus</dt><dd>{{ status.backend?.keyboard_focus || 'unknown' }}</dd></div>
          <div><dt>Widget focus</dt><dd>{{ status.backend?.widget_focus || 'unknown' }}</dd></div>
        </dl>
        <p class="page-lede">Provenance describes the last observed target, not application approval or task success. Untrusted executable metadata is evidence, not an application refusal. Focus within one window may be shared even with an independent pointer. Unknown capabilities are not proof of independence.</p>
        <p v-if="inputLimits" class="page-lede">Per-call input bounds: {{ inputLimits }}. These limits are not application restrictions.</p>
      </section>
      <div v-if="status.state === 'unavailable'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Disabled or unavailable. Check configured state, lifecycle state and backend prerequisites separately.</div>
      <div v-if="status.state === 'paused'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">{{ adminReady ? 'Agent input is revoked.' : 'Last-known session was paused; this is not current evidence of revocation.' }} This inspector does not provide remote mouse or keyboard control. Resume requires a renewed generation and fresh evidence.</div>
      <div v-if="adminReady && status.state === 'unknown'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Outcome is unknown. Refresh status; do not replay the last action.</div>
      <section v-if="status.recovery" class="hm-card" aria-labelledby="computer-recovery-title">
        <div class="section-card-header">
          <h2 id="computer-recovery-title" class="text-sm font-semibold text-gray-300">Recovery evidence</h2>
          <span class="badge" :class="status.recovery.complete ? 'badge-success' : 'badge-warning'">{{ status.recovery.complete ? 'Verified' : 'Review required' }}</span>
        </div>
        <p>{{ status.recovery.status }}: {{ status.recovery.reason }}. Cleanup {{ status.recovery.complete ? 'verified' : 'not verified' }}.</p>
        <p class="page-lede">Reconciliation only inspects the recorded workload. It never sends input, terminates applications or replays actions.</p>
        <button v-if="status.state === 'quarantined'" class="btn btn-ghost btn-touch mt-3" @click="recover" :disabled="recovering || !adminReady">{{ recovering ? 'Checking recorded workload…' : 'Verify recorded workload absence' }}</button>
        <div v-if="status.state === 'quarantined' && status.session_id" class="mt-3">
          <p class="text-amber-300">Manual reconciliation is an operator attestation, not verified cleanup. Independently inspect the desktop: no held input, owned master devices or workers may remain. Known running workers also block this request. The failed action remains unknown and is never replayed.</p>
          <label class="block mt-2" for="computer-reconciliation-ack">Type ACKNOWLEDGE UNVERIFIED CLEANUP {{ status.session_id }}</label>
          <input id="computer-reconciliation-ack" v-model="reconciliationAck" class="input w-full mt-2" autocomplete="off" :disabled="recovering || !adminReady">
          <button class="btn btn-ghost btn-touch mt-3" @click="reconcile" :disabled="recovering || !adminReady || reconciliationAck !== 'ACKNOWLEDGE UNVERIFIED CLEANUP ' + status.session_id">Acknowledge unverified cleanup</button>
        </div>
      </section>
      <section class="hm-card" aria-labelledby="computer-session-title">
        <div class="section-card-header">
          <h2 id="computer-session-title" class="text-sm font-semibold text-gray-300">Session details</h2>
        </div>
        <dl class="detail-grid">
          <div><dt>Owner</dt><dd>{{ status.owner_id || '—' }}</dd></div>
          <div><dt>Session</dt><dd class="text-break">{{ status.session_id || '—' }}</dd></div>
          <div v-if="!attached"><dt>Application</dt><dd>{{ status.app || '—' }}</dd></div>
          <div><dt>Last action / verification</dt><dd>{{ status.last_action || '—' }} / {{ status.last_verification || 'unavailable' }}</dd></div>
        </dl>
      </section>

      <section class="hm-card" aria-labelledby="computer-evidence-title">
        <div class="section-card-header">
          <div>
            <h2 id="computer-evidence-title" class="text-sm font-semibold text-gray-300">Visual evidence</h2>
            <p class="page-lede">Frames are captured only on request. Opening or refreshing this view never captures or posts an image.</p>
          </div>
          <div class="action-row">
            <button class="btn btn-ghost btn-touch" @click="refresh" :disabled="loading"><odin-icon name="refresh" :size="15" /> Refresh status</button>
            <button class="btn btn-primary btn-touch" @click="observe" :disabled="observing || !adminReady || !status.available"><odin-icon name="eye" :size="15" /> {{ observing ? 'Observing…' : 'Observe / view frame' }}</button>
            <button v-if="frameUrl" class="btn btn-ghost btn-touch" @click="clearFrame">Hide frame</button>
          </div>
        </div>
        <figure v-if="frameUrl" class="evidence-figure">
          <figcaption class="text-xs text-gray-500 mb-3">{{ freshness }} · Captured {{ frame.captured_at }} · Private evidence expires {{ frame.expires_at }}</figcaption>
          <img class="evidence-frame" :src="frameUrl" alt="Requested frame from the authorized application; read-only" />
        </figure>
        <p v-else-if="frameExpired" class="text-sm text-amber-400" role="status">Frame expired. Observe again for current evidence.</p>
      </section>

      <section class="hm-card" aria-labelledby="computer-export-title">
        <form @submit.prevent="exportFile">
          <div class="section-card-header">
            <div>
              <h2 id="computer-export-title" class="text-sm font-semibold text-gray-300">Export a saved workspace file</h2>
              <p class="page-lede">Choose one exact filename, not a host path. Downloads are never executed.</p>
            </div>
          </div>
          <label class="field-label" for="computer-export-name">Filename</label>
          <div class="export-controls mt-2">
            <input id="computer-export-name" class="hm-input export-name" v-model="name" maxlength="100" required autocomplete="off" placeholder="drawing.png" />
            <button class="btn btn-primary btn-touch" type="submit" :disabled="exporting || !adminReady || !status.available">{{ exporting ? 'Preparing…' : 'Prepare export' }}</button>
          </div>
        </form>
        <div v-if="artifact" class="artifact-row mt-4">
          <button class="btn btn-ghost btn-touch" @click="download" :disabled="downloading || !adminReady"><odin-icon name="download" :size="15" /> Download {{ artifact.name }}</button>
          <span class="text-xs text-gray-500">Expires {{ artifact.expires_at }}</span>
        </div>
      </section>
      </div>
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),h=f(""),m=f(null),g=f(""),A=f(!1),I=f(Date.now()),y=f(""),v=f(null);let b=0,x=null,_=!1,E=z.token,C=0,w=null,R=null,B=!1;const S=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",F=V(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),Y=V(()=>{var ee;const H=Date.parse(((ee=e.value.accessibility)==null?void 0:ee.checked_at)||"");return c.value&&Number.isFinite(H)&&I.value-H<15e3&&I.value>=H-5e3}),j=V(()=>{var H;return Y.value?S((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),L=V(()=>{var H;return Y.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),N=V(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,ee])=>`${H}: ${ee}`).join(", ")),P=V(()=>{var ee;const H=(ee=e.value.application_provenance)==null?void 0:ee.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),ae=V(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),ne=V(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),U=V(()=>{var ee,X;const H=Date.parse(((ee=m.value)==null?void 0:ee.captured_at)||"");return Number.isFinite(H)&&I.value<H+Math.min(1e4,((X=m.value)==null?void 0:X.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function J(){g.value&&URL.revokeObjectURL(g.value),g.value="",m.value=null}function ie(){b++,J(),v.value=null,c.value=!1,w==null||w.abort(),w=null,t.value=!1,h.value="",s.value=!1,i.value=!1,l.value=!1}function K(H,ee){return _&&H===b&&ee===z.token}function me(){return _&&c.value&&R===z.token&&Date.now()-u.value<15e3}function de(H,ee="mutation"){var be,he;ie(),B=!0,p.value="";const X=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(X)?(u.value=0,R=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:X===503?"unavailable":"unknown"}),o.value=X===401||X===403||X===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":X===410?"Evidence or artifact expired. Observe or prepare the export again.":ee==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":ee==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",ee==="mutation"&&![401,403,404].includes(X)&&typeof((be=H.data)==null?void 0:be.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((he=H.data)==null?void 0:he.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function W(){if(t.value||r.value||a.value||n.value||d.value||!_)return;const H=b,ee=z.token;t.value=!0,C=Date.now();const X=new AbortController;w=X;try{const be=await z.get("/api/computer",{signal:X.signal});if(!K(H,ee))return;pe(be)}catch(be){K(H,ee)&&de(be,"read")}finally{w===X&&(w=null,t.value=!1)}}function pe(H,ee=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&ie(),e.value=H,u.value=Date.now(),R=z.token,c.value=!(r.value&&ee!=="toggle")&&!(a.value&&ee!=="stop")&&!(n.value&&ee!=="pause")&&!(d.value&&ee!=="recovery"),o.value="",p.value="",B=!c.value}async function ge(H){if(!me()||r.value||a.value||n.value||d.value)return;ie();const ee=b,X=z.token;r.value=!0;let be=!1;try{if(await z.post("/api/computer/enabled",{enabled:H}),be=!0,!K(ee,X))return;const he=await z.get("/api/computer");K(ee,X)&&pe(he,"toggle")}catch(he){K(ee,X)&&de(he,be?"acknowledged":"mutation")}finally{r.value=!1}}async function ye(H){if(!_||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;ie();const ee=b,X=z.token,be=H==="stop"?a:n;be.value=!0;let he=!1;try{if(await z.post("/api/computer/"+H,{}),he=!0,K(ee,X)){const xe=await z.get("/api/computer");K(ee,X)&&pe(xe,H)}}catch(xe){K(ee,X)&&de(xe,he?"acknowledged":"mutation")}finally{be.value=!1}}async function _e(){var be;if(!me()||d.value||((be=e.value.backend)==null?void 0:be.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;ie();const ee=b,X=z.token;d.value=!0;try{const he=await z.post("/api/computer/release_owned_input",H);K(ee,X)&&pe(he,"recovery")}catch(he){K(ee,X)&&de(he,"mutation")}finally{d.value=!1}}async function Ne(){return M(!1)}async function T(){return M(!0)}async function M(H){var Ae;if(!me()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const ee={session_id:e.value.session_id,generation:e.value.session_generation};if(!ee.session_id||!Number.isInteger(ee.generation))return;if(H){if(h.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+ee.session_id)return;ee.acknowledgment=h.value}const X=H?((Ae=e.value.recovery)==null?void 0:Ae.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";ie();const be=b,he=z.token;d.value=!0;let xe=!1;try{const Le=await z.post("/api/computer/"+X,ee);xe=!0,K(be,he)&&pe(Le,"recovery")}catch(Le){K(be,he)&&de(Le,xe?"acknowledged":"mutation")}finally{d.value=!1}}async function q(){var X;if(!me()||s.value||!e.value.available)return;J(),A.value=!1;const H=b,ee=z.token;s.value=!0;try{const be=await z.post("/api/computer/observe",{});if(!K(H,ee))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((X=be.frame)==null?void 0:X.evidence_id)||""))throw new Error("Invalid evidence");const he=await z.getBlob("/api/computer/evidence/"+be.frame.evidence_id);if(!K(H,ee))return;if(!["image/png","image/jpeg"].includes(he.type)||he.size>2097152||!Number.isFinite(Date.parse(be.frame.expires_at))||Date.parse(be.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=be.frame,g.value=URL.createObjectURL(he),o.value=""}catch(be){K(H,ee)&&de(be)}finally{H===b&&(s.value=!1)}}async function re(){if(!me()||i.value||!e.value.available)return;v.value=null;const H=b,ee=z.token;i.value=!0;try{const X=await z.post("/api/computer/export",{name:y.value});K(H,ee)&&(v.value=X,o.value="")}catch(X){K(H,ee)&&de(X)}finally{H===b&&(i.value=!1)}}async function $(){if(!me()||l.value||!v.value)return;const H=b,ee=z.token,X=v.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((X==null?void 0:X.artifact_id)||""))throw new Error("Invalid export");const be=await z.getBlob("/api/computer/download/"+X.artifact_id);if(!K(H,ee))return;const he=URL.createObjectURL(be),xe=document.createElement("a");xe.href=he,xe.download=X.name,xe.click(),setTimeout(()=>URL.revokeObjectURL(he),1e3)}catch(be){K(H,ee)&&de(be)}finally{H===b&&(l.value=!1)}}function Z(){_||(E!==z.token&&(E=z.token,ie(),u.value=0,R=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),_=!0,W(),x=setInterval(()=>{I.value=Date.now(),E!==z.token&&(E=z.token,ie(),u.value=0,R=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&I.value-u.value>=15e3&&ie(),m.value&&Date.parse(m.value.expires_at)<=I.value&&(J(),A.value=!0),v.value&&Date.parse(v.value.expires_at)<=I.value&&(v.value=null),!B&&I.value-C>=5e3&&W()},500))}function ue(){_=!1,clearInterval(x),x=null,ie(),c.value=!1}return Ge(Z),Xt(Z),Ut(ue),ut(ue),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:m,frameUrl:g,frameExpired:A,freshness:U,name:y,artifact:v,refresh:W,control:ye,observe:q,clearFrame:J,exportFile:re,download:$,toggling:r,adminReady:c,enabledLabel:S,restartSettings:ne,setEnabled:ge,recovering:d,recover:Ne,reconcile:T,releaseOwnedInput:_e,reconciliationAck:h,applicationProfiles:ae,attached:F,scriptIdentity:P,inputLimits:N,accessibilityLabel:j,accessibilityDetail:L}}},Cv=[{id:"health",label:"Health",component:oS},{id:"resources",label:"Resources",component:rS},{id:"logs",label:"Logs",component:xS},{id:"config",label:"Config",component:LS},{id:"discord",label:"Discord",component:DS},{id:"hosts",label:"Hosts",component:FS},{id:"host-access",label:"Host Access",component:MS},{id:"api-tokens",label:"API Tokens",component:$S},{id:"llm",label:"LLM Config",component:WS},{id:"internals",label:"Internals",component:JS},{id:"turn-state",label:"Turn State",component:QS},{id:"computer",label:"Computer",component:s1},{id:"update",label:"Update",component:XS}],a1={components:{TabbedPage:dr},setup(){return{tabs:Cv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Jl=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),n1=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Jl("Operations","operations","/operations",vv),...Jl("History","history","/history",gv),...Jl("Capabilities","capabilities","/capabilities",bv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Jl("System","system","/system",Cv)],ws=an({open:!1,query:"",selected:0});function Pp(){ws.query="",ws.selected=0,ws.open=!0}function zr(){ws.open=!1}function i1(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const l1={setup(){const e=rv(),t=f(null),s=V(()=>{const i=ws.query.trim().toLowerCase();return n1.map(l=>({...l,_score:i1(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Dt(()=>ws.open,async i=>{var l;i&&(await At(),(l=t.value)==null||l.focus())}),Dt(()=>ws.query,()=>{ws.selected=0});function a(i){zr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),zr();return}if(i.key==="ArrowDown")i.preventDefault(),ws.selected=Math.min(ws.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ws.selected=Math.max(ws.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ws.selected];l&&a(l)}}return{state:ws,results:s,inputEl:t,go:a,onKeydown:n,closePalette:zr}},template:`
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
  `},Rc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Rc));const o1={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>di("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[di("path",{d:Rc[e.name]||Rc.info})])}},r1=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Mp(e){return[...e.querySelectorAll(r1)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const c1={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Mp(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Mp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},d1={template:`
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
              <div v-if="errors.length === 0 && errorsError" class="dash-empty dash-load-failed">
                <span class="dash-empty-icon"><odin-icon name="warning" :size="21" /></span>
                <span>Couldn't load recent errors</span>
              </div>
              <div v-else-if="errors.length === 0" class="dash-empty">
                <span class="dash-empty-icon"><odin-icon name="success" :size="21" /></span>
                <span>All clear</span>
              </div>
              <div v-else class="dash-error-list">
                <div v-if="errorsError" class="dash-load-warning text-xs">Refresh failed — showing known errors</div>
                <div v-for="(e, i) in errors" :key="i" class="dash-error-item">
                  <div class="dash-error-top">
                    <span class="text-red-400"><odin-icon name="warning" :size="16" /></span>
                    <span class="dash-error-tool">{{ e.tool_name }}</span>
                    <span class="dash-error-time">{{ formatTime(e.timestamp) }}</span>
                  </div>
                  <div v-if="e.error" class="dash-error-msg">{{ e.error }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=V(()=>{const ne=e.value.uptime_seconds||0,U=Math.floor(ne/86400),J=Math.floor(ne%86400/3600),ie=Math.floor(ne%3600/60),K=[];return U>0&&K.push(`${U}d`),J>0&&K.push(`${J}h`),(K.length===0||U===0&&J===0)&&K.push(`${ie}m`),K.join(" ")}),m=V(()=>{const ne=e.value.uptime_seconds||0;return 125.66*(1-Math.min(ne/86400,1))}),g=V(()=>{const ne=e.value;return[{label:"Guilds",value:ne.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:ne.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:ne.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${ne.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:ne.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:ne.loop_count>0?"text-green-400":"",highlight:ne.loop_count>0},{label:"Agents",value:ne.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:ne.agent_count>0?`${ne.agent_count} total`:"",subColor:"text-gray-500",highlight:(ne.agent_running??0)>0},{label:"Processes",value:ne.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:ne.process_count>0?`${ne.process_count} total`:"",subColor:"text-gray-500",highlight:(ne.process_running??0)>0},{label:"Schedules",value:ne.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(ne.schedule_failing>0?`${ne.schedule_failing} failing`:"")+(ne.schedule_failing>0&&ne.schedule_paused>0?", ":"")+(ne.schedule_paused>0?`${ne.schedule_paused} paused`:"")||void 0,subColor:ne.schedule_failing>0?"text-red-400":"text-yellow-400",color:ne.schedule_failing>0?"text-red-400":"",highlight:ne.schedule_failing>0},{label:"Users",value:ne.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),A=V(()=>{const ne=e.value,U=[];return U.push({label:"Bot",status:ne.status==="online"?"ok":"warn",detail:ne.status==="online"?"Online":"Starting"}),(ne.schedule_failing||0)>0?U.push({label:"Schedules",status:"error",detail:`${ne.schedule_failing} failing`}):(ne.schedule_count||0)>0&&U.push({label:"Schedules",status:"ok",detail:`${ne.schedule_count} configured`}),(ne.loop_count||0)>0&&U.push({label:"Loops",status:"ok",detail:`${ne.loop_count} active`}),(ne.agent_running||0)>0&&U.push({label:"Agents",status:"ok",detail:`${ne.agent_running} running`}),(ne.process_running||0)>0&&U.push({label:"Processes",status:"ok",detail:`${ne.process_running} running`}),U});async function I(){try{e.value=await z.get("/api/status"),s.value=null}catch(ne){s.value=ne.message}finally{t.value=!1}}let y=0,v=0,b=0,x=0;function _(ne,U){const J=new Set;return[...U,...ne].filter(ie=>{const K=ie._hmac||JSON.stringify([ie.timestamp,ie.tool_name,ie.user_id,ie.result_summary,ie.error]);return J.has(K)?!1:(J.add(K),!0)})}async function E(){const ne=++y,U=b;n.value=!0;try{const J=await z.get("/api/audit?limit=10");if(ne!==y)return;const ie=U===b?[]:a.value.filter(K=>(K._liveEpoch||0)>U);a.value=_(J,ie).slice(0,10),c.value=ie.length}catch{}ne===y&&(n.value=!1)}async function C(){const ne=++v,U=x;l.value=!0;try{const J=await z.get("/api/audit?error_only=1&limit=5");if(ne!==v)return;const ie=U===x?[]:i.value.filter(K=>(K._liveErrorEpoch||0)>U);i.value=_(J,ie).slice(0,5),o.value=!1}catch{if(ne!==v)return;o.value=U===x||i.value.length===0}ne===v&&(l.value=!1)}async function w(){try{const ne=await z.get("/api/knowledge");d.value=(Array.isArray(ne)?ne:[]).reduce((U,J)=>U+(J.chunks||0),0)}catch{d.value=null}}async function R(){try{const ne=await z.get("/api/agents");r.value=ne.filter(U=>U.status==="running")}catch{}}async function B(){u.value={...u.value,reload:!0};try{await z.post("/api/reload"),ke.success("Config reloaded")}catch(ne){ke.error(ne.message)}u.value={...u.value,reload:!1}}async function S(){if(!await qt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const U=e.value.session_count;e.value={...e.value,session_count:0};try{const J=await z.post("/api/sessions/clear-all");ke.success(`Cleared ${J.count} session${J.count!==1?"s":""}`),await I()}catch(J){e.value={...e.value,session_count:U},ke.error(J.message)}u.value={...u.value,clearSessions:!1}}async function F(){if(!await qt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const U=e.value.loop_count;e.value={...e.value,loop_count:0};try{const J=await z.post("/api/loops/stop-all");ke.success(J.result),await I()}catch(J){e.value={...e.value,loop_count:U},ke.error(J.message)}u.value={...u.value,stopLoops:!1}}function Y(){t.value=!0,s.value=null,I(),E(),C(),R()}let j=null,L=null,N=null;function P(ne){if(ne.payload&&ne.payload.tool_name){b+=1;const U={...ne.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(U),a.value.length>10&&a.value.pop(),c.value++,U.error&&(x+=1,U._liveErrorEpoch=x,o.value=!1,i.value.unshift(U),i.value.length>5&&i.value.pop()),setTimeout(()=>{U._isNew=!1},1500),clearTimeout(N),N=setTimeout(()=>{c.value=0},1e4)}}let ae=null;return Ge(async()=>{await Promise.all([I(),E(),C(),R(),w()]),j=setInterval(I,15e3),L=setInterval(R,1e4),Xe.subscribe("events",P),ae=Xe.onReconnected(()=>{E(),C()})}),ut(()=>{j&&clearInterval(j),L&&clearInterval(L),clearTimeout(N),Xe.unsubscribe("events",P),ae&&(ae(),ae=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:g,healthIndicators:A,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:E,fetchErrors:C,fetchStatus:I,onEvent:P,formatTime:pk,formatDuration:yi,retry:Y,reloadConfig:B,clearSessions:S,stopAllLoops:F}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Fp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function u1(e){if(Array.isArray(e))return e}function p1(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function f1(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function h1(e,t){return u1(e)||p1(e,t)||m1(e,t)||f1()}function m1(e,t){if(e){if(typeof e=="string")return Fp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Fp(e,t):void 0}}const Ev=Object.entries,$p=Object.setPrototypeOf,v1=Object.isFrozen,g1=Object.getPrototypeOf,b1=Object.getOwnPropertyDescriptor;let ms=Object.freeze,js=Object.seal,Kn=Object.create,Av=typeof Reflect<"u"&&Reflect,Ic=Av.apply,Oc=Av.construct;ms||(ms=function(t){return t});js||(js=function(t){return t});Ic||(Ic=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});Oc||(Oc=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const xa=Pt(Array.prototype.forEach),y1=Pt(Array.prototype.lastIndexOf),Bp=Pt(Array.prototype.pop),jn=Pt(Array.prototype.push),x1=Pt(Array.prototype.splice),ds=Array.isArray,Bi=Pt(String.prototype.toLowerCase),jr=Pt(String.prototype.toString),Up=Pt(String.prototype.match),Vn=Pt(String.prototype.replace),Hp=Pt(String.prototype.indexOf),_1=Pt(String.prototype.trim),w1=Pt(Number.prototype.toString),k1=Pt(Boolean.prototype.toString),zp=typeof BigInt>"u"?null:Pt(BigInt.prototype.toString),jp=typeof Symbol>"u"?null:Pt(Symbol.prototype.toString),St=Pt(Object.prototype.hasOwnProperty),Li=Pt(Object.prototype.toString),Kt=Pt(RegExp.prototype.test),pn=S1(TypeError);function Pt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return Ic(e,t,a)}}function S1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return Oc(e,s)}}function qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Bi;if($p&&$p(e,null),!ds(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(v1(t)||(t[a]=i),n=i)}e[n]=!0}return e}function T1(e){for(let t=0;t<e.length;t++)St(e,t)||(e[t]=null);return e}function ss(e){const t=Kn(null);for(const a of Ev(e)){var s=h1(a,2);const n=s[0],i=s[1];St(e,n)&&(ds(i)?t[n]=T1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ss(i):t[n]=i)}return t}function C1(e){switch(typeof e){case"string":return e;case"number":return w1(e);case"boolean":return k1(e);case"bigint":return zp?zp(e):"0";case"symbol":return jp?jp(e):"Symbol()";case"undefined":return Li(e);case"function":case"object":{if(e===null)return Li(e);const t=e,s=na(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Li(a)}return Li(e)}default:return Li(e)}}function na(e,t){for(;e!==null;){const a=b1(e,t);if(a){if(a.get)return Pt(a.get);if(typeof a.value=="function")return Pt(a.value)}e=g1(e)}function s(){return null}return s}function E1(e){try{return Kt(e,""),!0}catch{return!1}}const Vp=ms(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Vr=ms(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),qr=ms(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),A1=ms(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Gr=ms(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),R1=ms(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),qp=ms(["#text"]),Gp=ms(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Wr=ms(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Wp=ms(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Zl=ms(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),I1=js(/{{[\w\W]*|^[\w\W]*}}/g),O1=js(/<%[\w\W]*|^[\w\W]*%>/g),L1=js(/\${[\w\W]*/g),N1=js(/^data-[\-\w.\u00B7-\uFFFF]+$/),D1=js(/^aria-[\-\w]+$/),Kp=js(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),P1=js(/^(?:\w+script|data):/i),M1=js(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),F1=js(/^html$/i),$1=js(/^[a-z][.\w]*(-[.\w]+)+$/i),sa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},B1=function(){return typeof window>"u"?null:window},U1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Jp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Rv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:B1();const t=Ce=>Rv(Ce);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==sa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=na(p,"cloneNode"),m=na(p,"remove"),g=na(p,"nextSibling"),A=na(p,"childNodes"),I=na(p,"parentNode"),y=na(p,"shadowRoot"),v=na(p,"attributes"),b=l&&l.prototype?na(l.prototype,"nodeType"):null,x=l&&l.prototype?na(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ce=s.createElement("template");Ce.content&&Ce.content.ownerDocument&&(s=Ce.content.ownerDocument)}let _,E="",C,w=!1,R=0;const B=function(){if(R>0)throw pn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},S=function(D){B(),R++;try{return _.createHTML(D)}finally{R--}},F=function(D){B(),R++;try{return _.createScriptURL(D)}finally{R--}},Y=function(){return w||(C=U1(u,n),w=!0),C},j=s,L=j.implementation,N=j.createNodeIterator,P=j.createDocumentFragment,ae=j.getElementsByTagName,ne=a.importNode;let U=Jp();t.isSupported=typeof Ev=="function"&&typeof I=="function"&&L&&L.createHTMLDocument!==void 0;const J=I1,ie=O1,K=L1,me=N1,de=D1,W=P1,pe=M1,ge=$1;let ye=Kp,_e=null;const Ne=qe({},[...Vp,...Vr,...qr,...Gr,...qp]);let T=null;const M=qe({},[...Gp,...Wr,...Wp,...Zl]);let q=Object.seal(Kn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),re=null,$=null;const Z=Object.seal(Kn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,H=!0,ee=!1,X=!0,be=!1,he=!0,xe=!1,Ae=!1,Le=!1,$e=!1,Me=!1,Fe=!1,Ue=!0,Ye=!1;const je="user-content-";let Q=!0,we=!1,fe={},Ie=null;const se=qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Re=null;const De=qe({},["audio","video","img","source","image","track"]);let st=null;const Gt=qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),rt="http://www.w3.org/1998/Math/MathML",xt="http://www.w3.org/2000/svg",Mt="http://www.w3.org/1999/xhtml";let vs=Mt,Qs=!1,Wt=null;const Ht=qe({},[rt,xt,Mt],jr);let gs=qe({},["mi","mo","mn","ms","mtext"]),bs=qe({},["annotation-xml"]);const es=qe({},["title","style","font","a","script"]);let Ds=null;const nn=["application/xhtml+xml","text/html"],Vs="text/html";let at=null,rs=null;const Ha=s.createElement("form"),le=function(D){return D instanceof RegExp||D instanceof Function},Te=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(rs&&rs===D)return;(!D||typeof D!="object")&&(D={}),D=ss(D),Ds=nn.indexOf(D.PARSER_MEDIA_TYPE)===-1?Vs:D.PARSER_MEDIA_TYPE,at=Ds==="application/xhtml+xml"?jr:Bi,_e=St(D,"ALLOWED_TAGS")&&ds(D.ALLOWED_TAGS)?qe({},D.ALLOWED_TAGS,at):Ne,T=St(D,"ALLOWED_ATTR")&&ds(D.ALLOWED_ATTR)?qe({},D.ALLOWED_ATTR,at):M,Wt=St(D,"ALLOWED_NAMESPACES")&&ds(D.ALLOWED_NAMESPACES)?qe({},D.ALLOWED_NAMESPACES,jr):Ht,st=St(D,"ADD_URI_SAFE_ATTR")&&ds(D.ADD_URI_SAFE_ATTR)?qe(ss(Gt),D.ADD_URI_SAFE_ATTR,at):Gt,Re=St(D,"ADD_DATA_URI_TAGS")&&ds(D.ADD_DATA_URI_TAGS)?qe(ss(De),D.ADD_DATA_URI_TAGS,at):De,Ie=St(D,"FORBID_CONTENTS")&&ds(D.FORBID_CONTENTS)?qe({},D.FORBID_CONTENTS,at):se,re=St(D,"FORBID_TAGS")&&ds(D.FORBID_TAGS)?qe({},D.FORBID_TAGS,at):ss({}),$=St(D,"FORBID_ATTR")&&ds(D.FORBID_ATTR)?qe({},D.FORBID_ATTR,at):ss({}),fe=St(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ss(D.USE_PROFILES):D.USE_PROFILES:!1,ue=D.ALLOW_ARIA_ATTR!==!1,H=D.ALLOW_DATA_ATTR!==!1,ee=D.ALLOW_UNKNOWN_PROTOCOLS||!1,X=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=D.SAFE_FOR_TEMPLATES||!1,he=D.SAFE_FOR_XML!==!1,xe=D.WHOLE_DOCUMENT||!1,$e=D.RETURN_DOM||!1,Me=D.RETURN_DOM_FRAGMENT||!1,Fe=D.RETURN_TRUSTED_TYPE||!1,Le=D.FORCE_BODY||!1,Ue=D.SANITIZE_DOM!==!1,Ye=D.SANITIZE_NAMED_PROPS||!1,Q=D.KEEP_CONTENT!==!1,we=D.IN_PLACE||!1,ye=E1(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:Kp,vs=typeof D.NAMESPACE=="string"?D.NAMESPACE:Mt,gs=St(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(D.MATHML_TEXT_INTEGRATION_POINTS):qe({},["mi","mo","mn","ms","mtext"]),bs=St(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ss(D.HTML_INTEGRATION_POINTS):qe({},["annotation-xml"]);const ce=St(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ss(D.CUSTOM_ELEMENT_HANDLING):Kn(null);if(q=Kn(null),St(ce,"tagNameCheck")&&le(ce.tagNameCheck)&&(q.tagNameCheck=ce.tagNameCheck),St(ce,"attributeNameCheck")&&le(ce.attributeNameCheck)&&(q.attributeNameCheck=ce.attributeNameCheck),St(ce,"allowCustomizedBuiltInElements")&&typeof ce.allowCustomizedBuiltInElements=="boolean"&&(q.allowCustomizedBuiltInElements=ce.allowCustomizedBuiltInElements),be&&(H=!1),Me&&($e=!0),fe&&(_e=qe({},qp),T=Kn(null),fe.html===!0&&(qe(_e,Vp),qe(T,Gp)),fe.svg===!0&&(qe(_e,Vr),qe(T,Wr),qe(T,Zl)),fe.svgFilters===!0&&(qe(_e,qr),qe(T,Wr),qe(T,Zl)),fe.mathMl===!0&&(qe(_e,Gr),qe(T,Wp),qe(T,Zl))),Z.tagCheck=null,Z.attributeCheck=null,St(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?Z.tagCheck=D.ADD_TAGS:ds(D.ADD_TAGS)&&(_e===Ne&&(_e=ss(_e)),qe(_e,D.ADD_TAGS,at))),St(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?Z.attributeCheck=D.ADD_ATTR:ds(D.ADD_ATTR)&&(T===M&&(T=ss(T)),qe(T,D.ADD_ATTR,at))),St(D,"ADD_URI_SAFE_ATTR")&&ds(D.ADD_URI_SAFE_ATTR)&&qe(st,D.ADD_URI_SAFE_ATTR,at),St(D,"FORBID_CONTENTS")&&ds(D.FORBID_CONTENTS)&&(Ie===se&&(Ie=ss(Ie)),qe(Ie,D.FORBID_CONTENTS,at)),St(D,"ADD_FORBID_CONTENTS")&&ds(D.ADD_FORBID_CONTENTS)&&(Ie===se&&(Ie=ss(Ie)),qe(Ie,D.ADD_FORBID_CONTENTS,at)),Q&&(_e["#text"]=!0),xe&&qe(_e,["html","head","body"]),_e.table&&(qe(_e,["tbody"]),delete re.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw pn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw pn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const O=_;_=D.TRUSTED_TYPES_POLICY;try{E=S("")}catch(oe){throw _=O,oe}}else D.TRUSTED_TYPES_POLICY===null?(_=void 0,E=""):(_===void 0&&(_=Y()),_&&typeof E=="string"&&(E=S("")));(U.uponSanitizeElement.length>0||U.uponSanitizeAttribute.length>0)&&_e===Ne&&(_e=ss(_e)),U.uponSanitizeAttribute.length>0&&T===M&&(T=ss(T)),ms&&ms(D),rs=D},He=qe({},[...Vr,...qr,...A1]),Je=qe({},[...Gr,...R1]),_t=function(D){let ce=I(D);(!ce||!ce.tagName)&&(ce={namespaceURI:vs,tagName:"template"});const O=Bi(D.tagName),oe=Bi(ce.tagName);return Wt[D.namespaceURI]?D.namespaceURI===xt?ce.namespaceURI===Mt?O==="svg":ce.namespaceURI===rt?O==="svg"&&(oe==="annotation-xml"||gs[oe]):!!He[O]:D.namespaceURI===rt?ce.namespaceURI===Mt?O==="math":ce.namespaceURI===xt?O==="math"&&bs[oe]:!!Je[O]:D.namespaceURI===Mt?ce.namespaceURI===xt&&!bs[oe]||ce.namespaceURI===rt&&!gs[oe]?!1:!Je[O]&&(es[O]||!He[O]):!!(Ds==="application/xhtml+xml"&&Wt[D.namespaceURI]):!1},nt=function(D){jn(t.removed,{element:D});try{I(D).removeChild(D)}catch{if(m(D),!I(D))throw pn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},fa=function(D){const ce=A?A(D):D.childNodes;if(ce){const oe=[];xa(ce,ve=>{jn(oe,ve)}),xa(oe,ve=>{try{m(ve)}catch{}})}const O=v?v(D):null;if(O)for(let oe=O.length-1;oe>=0;--oe){const ve=O[oe],Oe=ve&&ve.name;if(typeof Oe=="string")try{D.removeAttribute(Oe)}catch{}}},Ps=function(D,ce){try{jn(t.removed,{attribute:ce.getAttributeNode(D),from:ce})}catch{jn(t.removed,{attribute:null,from:ce})}if(ce.removeAttribute(D),D==="is")if($e||Me)try{nt(ce)}catch{}else try{ce.setAttribute(D,"")}catch{}},ha=function(D){const ce=v?v(D):D.attributes;if(ce)for(let O=ce.length-1;O>=0;--O){const oe=ce[O],ve=oe&&oe.name;if(!(typeof ve!="string"||T[at(ve)]))try{D.removeAttribute(ve)}catch{}}},Xs=function(D){const ce=[D];for(;ce.length>0;){const O=ce.pop();(b?b(O):O.nodeType)===sa.element&&ha(O);const ve=A?A(O):O.childNodes;if(ve)for(let Oe=ve.length-1;Oe>=0;--Oe)ce.push(ve[Oe])}},qs=function(D){let ce=null,O=null;if(Le)D="<remove></remove>"+D;else{const Oe=Up(D,/^[\r\n\t ]+/);O=Oe&&Oe[0]}Ds==="application/xhtml+xml"&&vs===Mt&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const oe=_?S(D):D;if(vs===Mt)try{ce=new d().parseFromString(oe,Ds)}catch{}if(!ce||!ce.documentElement){ce=L.createDocument(vs,"template",null);try{ce.documentElement.innerHTML=Qs?E:oe}catch{}}const ve=ce.body||ce.documentElement;return D&&O&&ve.insertBefore(s.createTextNode(O),ve.childNodes[0]||null),vs===Mt?ae.call(ce,xe?"html":"body")[0]:xe?ce.documentElement:ve},ea=function(D){return N.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},ma=function(D){var ce,O;D.normalize();const oe=N.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let ve=oe.nextNode();for(;ve;){let bt=ve.data;xa([J,ie,K],it=>{bt=Vn(bt,it," ")}),ve.data=bt,ve=oe.nextNode()}const Oe=(ce=(O=D.querySelectorAll)===null||O===void 0?void 0:O.call(D,"template"))!==null&&ce!==void 0?ce:[];xa(Array.from(Oe),bt=>{zt(bt.content)&&ma(bt.content)})},za=function(D){const ce=x?x(D):null;return typeof ce!="string"||at(ce)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==v(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==b(D)||D.childNodes!==A(D)},zt=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return b(D)===sa.documentFragment}catch{return!1}},va=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return typeof b(D)=="number"}catch{return!1}};function ys(Ce,D,ce){xa(Ce,O=>{O.call(t,D,ce,rs)})}const Dn=function(D){let ce=null;if(ys(U.beforeSanitizeElements,D,null),za(D))return nt(D),!0;const O=at(x?x(D):D.nodeName);if(ys(U.uponSanitizeElement,D,{tagName:O,allowedTags:_e}),he&&D.hasChildNodes()&&!va(D.firstElementChild)&&Kt(/<[/\w!]/g,D.innerHTML)&&Kt(/<[/\w!]/g,D.textContent)||he&&D.namespaceURI===Mt&&O==="style"&&va(D.firstElementChild)||D.nodeType===sa.progressingInstruction||he&&D.nodeType===sa.comment&&Kt(/<[/\w]/g,D.data))return nt(D),!0;if(re[O]||!(Z.tagCheck instanceof Function&&Z.tagCheck(O))&&!_e[O]){if(!re[O]&&Mn(O)&&(q.tagNameCheck instanceof RegExp&&Kt(q.tagNameCheck,O)||q.tagNameCheck instanceof Function&&q.tagNameCheck(O)))return!1;if(Q&&!Ie[O]){const ve=I(D),Oe=A(D);if(Oe&&ve){const bt=Oe.length;for(let it=bt-1;it>=0;--it){const wt=we?Oe[it]:h(Oe[it],!0);ve.insertBefore(wt,g(D))}}}return nt(D),!0}return(b?b(D):D.nodeType)===sa.element&&!_t(D)||(O==="noscript"||O==="noembed"||O==="noframes")&&Kt(/<\/no(script|embed|frames)/i,D.innerHTML)?(nt(D),!0):(be&&D.nodeType===sa.text&&(ce=D.textContent,xa([J,ie,K],ve=>{ce=Vn(ce,ve," ")}),D.textContent!==ce&&(jn(t.removed,{element:D.cloneNode()}),D.textContent=ce)),ys(U.afterSanitizeElements,D,null),!1)},Pn=function(D,ce,O){if($[ce]||Ue&&(ce==="id"||ce==="name")&&(O in s||O in Ha))return!1;const oe=T[ce]||Z.attributeCheck instanceof Function&&Z.attributeCheck(ce,D);if(!(H&&!$[ce]&&Kt(me,ce))){if(!(ue&&Kt(de,ce))){if(!oe||$[ce]){if(!(Mn(D)&&(q.tagNameCheck instanceof RegExp&&Kt(q.tagNameCheck,D)||q.tagNameCheck instanceof Function&&q.tagNameCheck(D))&&(q.attributeNameCheck instanceof RegExp&&Kt(q.attributeNameCheck,ce)||q.attributeNameCheck instanceof Function&&q.attributeNameCheck(ce,D))||ce==="is"&&q.allowCustomizedBuiltInElements&&(q.tagNameCheck instanceof RegExp&&Kt(q.tagNameCheck,O)||q.tagNameCheck instanceof Function&&q.tagNameCheck(O))))return!1}else if(!st[ce]){if(!Kt(ye,Vn(O,pe,""))){if(!((ce==="src"||ce==="xlink:href"||ce==="href")&&D!=="script"&&Hp(O,"data:")===0&&Re[D])){if(!(ee&&!Kt(W,Vn(O,pe,"")))){if(O)return!1}}}}}}return!0},ki=qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Mn=function(D){return!ki[Bi(D)]&&Kt(ge,D)},Fn=function(D){ys(U.beforeSanitizeAttributes,D,null);const ce=D.attributes;if(!ce||za(D))return;const O={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:T,forceKeepAttr:void 0};let oe=ce.length;for(;oe--;){const ve=ce[oe],Oe=ve.name,bt=ve.namespaceURI,it=ve.value,wt=at(Oe),Es=it;let It=Oe==="value"?Es:_1(Es);if(O.attrName=wt,O.attrValue=It,O.keepAttr=!0,O.forceKeepAttr=void 0,ys(U.uponSanitizeAttribute,D,O),It=O.attrValue,Ye&&(wt==="id"||wt==="name")&&Hp(It,je)!==0&&(Ps(Oe,D),It=je+It),he&&Kt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,It)){Ps(Oe,D);continue}if(wt==="attributename"&&Up(It,"href")){Ps(Oe,D);continue}if(O.forceKeepAttr)continue;if(!O.keepAttr){Ps(Oe,D);continue}if(!X&&Kt(/\/>/i,It)){Ps(Oe,D);continue}be&&xa([J,ie,K],Rl=>{It=Vn(It,Rl," ")});const on=at(D.nodeName);if(!Pn(on,wt,It)){Ps(Oe,D);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!bt)switch(u.getAttributeType(on,wt)){case"TrustedHTML":{It=S(It);break}case"TrustedScriptURL":{It=F(It);break}}if(It!==Es)try{bt?D.setAttributeNS(bt,Oe,It):D.setAttribute(Oe,It),za(D)?nt(D):Bp(t.removed)}catch{Ps(Oe,D)}}ys(U.afterSanitizeAttributes,D,null)},ja=function(D){let ce=null;const O=ea(D);for(ys(U.beforeSanitizeShadowDOM,D,null);ce=O.nextNode();)if(ys(U.uponSanitizeShadowNode,ce,null),Dn(ce),Fn(ce),zt(ce.content)&&ja(ce.content),(b?b(ce):ce.nodeType)===sa.element){const ve=y?y(ce):ce.shadowRoot;zt(ve)&&(ln(ve),ja(ve))}ys(U.afterSanitizeShadowDOM,D,null)},ln=function(D){const ce=[{node:D,shadow:null}];for(;ce.length>0;){const O=ce.pop();if(O.shadow){ja(O.shadow);continue}const oe=O.node,Oe=(b?b(oe):oe.nodeType)===sa.element,bt=A?A(oe):oe.childNodes;if(bt)for(let it=bt.length-1;it>=0;--it)ce.push({node:bt[it],shadow:null});if(Oe){const it=x?x(oe):null;if(typeof it=="string"&&at(it)==="template"){const wt=oe.content;zt(wt)&&ce.push({node:wt,shadow:null})}}if(Oe){const it=y?y(oe):oe.shadowRoot;zt(it)&&ce.push({node:null,shadow:it},{node:it,shadow:null})}}};return t.sanitize=function(Ce){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ce=null,O=null,oe=null,ve=null;if(Qs=!Ce,Qs&&(Ce="<!-->"),typeof Ce!="string"&&!va(Ce)&&(Ce=C1(Ce),typeof Ce!="string"))throw pn("dirty is not a string, aborting");if(!t.isSupported)return Ce;Ae||Te(D),t.removed=[];const Oe=we&&typeof Ce!="string"&&va(Ce);if(Oe){const wt=x?x(Ce):Ce.nodeName;if(typeof wt=="string"){const Es=at(wt);if(!_e[Es]||re[Es])throw pn("root node is forbidden and cannot be sanitized in-place")}if(za(Ce))throw pn("root node is clobbered and cannot be sanitized in-place");try{ln(Ce)}catch(Es){throw fa(Ce),Es}}else if(va(Ce))ce=qs("<!---->"),O=ce.ownerDocument.importNode(Ce,!0),O.nodeType===sa.element&&O.nodeName==="BODY"||O.nodeName==="HTML"?ce=O:ce.appendChild(O),ln(O);else{if(!$e&&!be&&!xe&&Ce.indexOf("<")===-1)return _&&Fe?S(Ce):Ce;if(ce=qs(Ce),!ce)return $e?null:Fe?E:""}ce&&Le&&nt(ce.firstChild);const bt=ea(Oe?Ce:ce);try{for(;oe=bt.nextNode();)Dn(oe),Fn(oe),zt(oe.content)&&ja(oe.content)}catch(wt){throw Oe&&fa(Ce),wt}if(Oe)return xa(t.removed,wt=>{wt.element&&Xs(wt.element)}),be&&ma(Ce),Ce;if($e){if(be&&ma(ce),Me)for(ve=P.call(ce.ownerDocument);ce.firstChild;)ve.appendChild(ce.firstChild);else ve=ce;return(T.shadowroot||T.shadowrootmode)&&(ve=ne.call(a,ve,!0)),ve}let it=xe?ce.outerHTML:ce.innerHTML;return xe&&_e["!doctype"]&&ce.ownerDocument&&ce.ownerDocument.doctype&&ce.ownerDocument.doctype.name&&Kt(F1,ce.ownerDocument.doctype.name)&&(it="<!DOCTYPE "+ce.ownerDocument.doctype.name+`>
`+it),be&&xa([J,ie,K],wt=>{it=Vn(it,wt," ")}),_&&Fe?S(it):it},t.setConfig=function(){let Ce=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Ce),Ae=!0},t.clearConfig=function(){rs=null,Ae=!1,_=C,E=""},t.isValidAttribute=function(Ce,D,ce){rs||Te({});const O=at(Ce),oe=at(D);return Pn(O,oe,ce)},t.addHook=function(Ce,D){typeof D=="function"&&jn(U[Ce],D)},t.removeHook=function(Ce,D){if(D!==void 0){const ce=y1(U[Ce],D);return ce===-1?void 0:x1(U[Ce],ce,1)[0]}return Bp(U[Ce])},t.removeHooks=function(Ce){U[Ce]=[]},t.removeAllHooks=function(){U=Jp()},t}var Zp=Rv();function Fd(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Nn=Fd();function Iv(e){Nn=e}var Ki={exec:()=>null};function dt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(fs.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var fs={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},H1=/^(?:[ \t]*(?:\n|$))+/,z1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,j1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Al=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,V1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,$d=/(?:[*+-]|\d{1,9}[.)])/,Ov=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Lv=dt(Ov).replace(/bull/g,$d).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),q1=dt(Ov).replace(/bull/g,$d).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Bd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,G1=/^[^\n]+/,Ud=/(?!\s*\])(?:\\.|[^\[\]\\])+/,W1=dt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Ud).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),K1=dt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,$d).getRegex(),pr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Hd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,J1=dt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Hd).replace("tag",pr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Nv=dt(Bd).replace("hr",Al).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",pr).getRegex(),Z1=dt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Nv).getRegex(),zd={blockquote:Z1,code:z1,def:W1,fences:j1,heading:V1,hr:Al,html:J1,lheading:Lv,list:K1,newline:H1,paragraph:Nv,table:Ki,text:G1},Yp=dt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Al).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",pr).getRegex(),Y1={...zd,lheading:q1,table:Yp,paragraph:dt(Bd).replace("hr",Al).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Yp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",pr).getRegex()},Q1={...zd,html:dt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Hd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Ki,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:dt(Bd).replace("hr",Al).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Lv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},X1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,eT=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Dv=/^( {2,}|\\)\n(?!\s*$)/,tT=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,fr=/[\p{P}\p{S}]/u,jd=/[\s\p{P}\p{S}]/u,Pv=/[^\s\p{P}\p{S}]/u,sT=dt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,jd).getRegex(),Mv=/(?!~)[\p{P}\p{S}]/u,aT=/(?!~)[\s\p{P}\p{S}]/u,nT=/(?:[^\s\p{P}\p{S}]|~)/u,iT=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Fv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,lT=dt(Fv,"u").replace(/punct/g,fr).getRegex(),oT=dt(Fv,"u").replace(/punct/g,Mv).getRegex(),$v="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",rT=dt($v,"gu").replace(/notPunctSpace/g,Pv).replace(/punctSpace/g,jd).replace(/punct/g,fr).getRegex(),cT=dt($v,"gu").replace(/notPunctSpace/g,nT).replace(/punctSpace/g,aT).replace(/punct/g,Mv).getRegex(),dT=dt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Pv).replace(/punctSpace/g,jd).replace(/punct/g,fr).getRegex(),uT=dt(/\\(punct)/,"gu").replace(/punct/g,fr).getRegex(),pT=dt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),fT=dt(Hd).replace("(?:-->|$)","-->").getRegex(),hT=dt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",fT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Po=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,mT=dt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Po).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Bv=dt(/^!?\[(label)\]\[(ref)\]/).replace("label",Po).replace("ref",Ud).getRegex(),Uv=dt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Ud).getRegex(),vT=dt("reflink|nolink(?!\\()","g").replace("reflink",Bv).replace("nolink",Uv).getRegex(),Vd={_backpedal:Ki,anyPunctuation:uT,autolink:pT,blockSkip:iT,br:Dv,code:eT,del:Ki,emStrongLDelim:lT,emStrongRDelimAst:rT,emStrongRDelimUnd:dT,escape:X1,link:mT,nolink:Uv,punctuation:sT,reflink:Bv,reflinkSearch:vT,tag:hT,text:tT,url:Ki},gT={...Vd,link:dt(/^!?\[(label)\]\((.*?)\)/).replace("label",Po).getRegex(),reflink:dt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Po).getRegex()},Lc={...Vd,emStrongRDelimAst:cT,emStrongLDelim:oT,url:dt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},bT={...Lc,br:dt(Dv).replace("{2,}","*").getRegex(),text:dt(Lc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Yl={normal:zd,gfm:Y1,pedantic:Q1},Ni={normal:Vd,gfm:Lc,breaks:bT,pedantic:gT},yT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Qp=e=>yT[e];function ia(e,t){if(t){if(fs.escapeTest.test(e))return e.replace(fs.escapeReplace,Qp)}else if(fs.escapeTestNoEncode.test(e))return e.replace(fs.escapeReplaceNoEncode,Qp);return e}function Xp(e){try{e=encodeURI(e).replace(fs.percentDecode,"%")}catch{return null}return e}function ef(e,t){var i;const s=e.replace(fs.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(fs.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(fs.slashPipe,"|");return a}function Di(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function xT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function tf(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function _T(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Mo=class{constructor(e){ft(this,"options");ft(this,"rules");ft(this,"lexer");this.options=e||Nn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Di(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=_T(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Di(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Di(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Di(t[0],`
`).split(`
`),a="",n="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");a=a?`${a}
${c}`:c,n=n?`${n}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,m=h.raw+`
`+s.join(`
`),g=this.blockquote(m);i[i.length-1]=g,a=a.substring(0,a.length-h.raw.length)+g.raw,n=n.substring(0,n.length-h.text.length)+g.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,m=h.raw+`
`+s.join(`
`),g=this.list(m);i[i.length-1]=g,a=a.substring(0,a.length-p.raw.length)+g.raw,n=n.substring(0,n.length-h.raw.length)+g.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:a,tokens:i,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const a=s.length>1,n={type:"list",raw:"",ordered:a,start:a?+s.slice(0,-1):"",loose:!1,items:[]};s=a?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=a?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const I=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),v=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),x=this.rules.other.htmlBeginRegex(m);for(;e;){const _=e.split(`
`,1)[0];let E;if(p=_,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),E=p):E=p.replace(this.rules.other.tabCharGlobal,"    "),v.test(p)||b.test(p)||x.test(p)||I.test(p)||y.test(p))break;if(E.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+E.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=_+`
`,e=e.substring(_.length+1),u=E.slice(m)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,A;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(A=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!g,checked:A,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=ef(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(ef(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Di(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=xT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),tf(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return tf(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Aa=class Nc{constructor(t){ft(this,"tokens");ft(this,"options");ft(this,"state");ft(this,"tokenizer");ft(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Nn,this.options.tokenizer=this.options.tokenizer||new Mo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:fs,block:Yl.normal,inline:Ni.normal};this.options.pedantic?(s.block=Yl.pedantic,s.inline=Ni.pedantic):this.options.gfm&&(s.block=Yl.gfm,this.options.breaks?s.inline=Ni.breaks:s.inline=Ni.gfm),this.tokenizer.rules=s}static get rules(){return{block:Yl,inline:Ni}}static lex(t,s){return new Nc(s).lex(t)}static lexInline(t,s){return new Nc(s).inlineTokens(t)}lex(t){t=t.replace(fs.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(fs.tabCharGlobal,"    ").replace(fs.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(g=>{m=g.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Fo=class{constructor(e){ft(this,"options");ft(this,"parser");this.options=e||Nn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(fs.notSpaceStart))==null?void 0:i[0],n=e.replace(fs.endingNewline,"")+`
`;return a?'<pre><code class="language-'+ia(a)+'">'+(s?n:ia(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:ia(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+ia(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ia(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=Xp(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+ia(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=Xp(e);if(n===null)return ia(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ia(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ia(e.text)}},qd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ra=class Dc{constructor(t){ft(this,"options");ft(this,"renderer");ft(this,"textRenderer");this.options=t||Nn,this.options.renderer=this.options.renderer||new Fo,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new qd}static parse(t,s){return new Dc(s).parse(t)}static parseInline(t,s){return new Dc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},Kr,io=(Kr=class{constructor(e){ft(this,"options");ft(this,"block");this.options=e||Nn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Aa.lex:Aa.lexInline}provideParser(){return this.block?Ra.parse:Ra.parseInline}},ft(Kr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Kr),wT=class{constructor(...e){ft(this,"defaults",Fd());ft(this,"options",this.setOptions);ft(this,"parse",this.parseMarkdown(!0));ft(this,"parseInline",this.parseMarkdown(!1));ft(this,"Parser",Ra);ft(this,"Renderer",Fo);ft(this,"TextRenderer",qd);ft(this,"Lexer",Aa);ft(this,"Tokenizer",Mo);ft(this,"Hooks",io);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Fo(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Mo(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new io;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];io.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Aa.lex(e,t??this.defaults)}parser(e,t){return Ra.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Aa.lex:Aa.lexInline,r=i.hooks?i.hooks.provideParser():e?Ra.parse:Ra.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+ia(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},En=new wT;function ot(e,t){return En.parse(e,t)}ot.options=ot.setOptions=function(e){return En.setOptions(e),ot.defaults=En.defaults,Iv(ot.defaults),ot};ot.getDefaults=Fd;ot.defaults=Nn;ot.use=function(...e){return En.use(...e),ot.defaults=En.defaults,Iv(ot.defaults),ot};ot.walkTokens=function(e,t){return En.walkTokens(e,t)};ot.parseInline=En.parseInline;ot.Parser=Ra;ot.parser=Ra.parse;ot.Renderer=Fo;ot.TextRenderer=qd;ot.Lexer=Aa;ot.lexer=Aa.lex;ot.Tokenizer=Mo;ot.Hooks=io;ot.parse=ot;ot.options;ot.setOptions;ot.use;ot.walkTokens;ot.parseInline;Ra.parse;Aa.lex;const kT={breaks:!0,gfm:!0};function sf(e){if(!e)return"";try{if(typeof ot<"u"&&ot.parse){const t=ot.parse(e,kT);return typeof Zp<"u"?Zp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function ST(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const TT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function CT(e){return TT[e]||"wrench"}const ET=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function af(e){if(!e)return[];const t=e.match(ET);return t?[...new Set(t)]:[]}const AT={template:`
    <div class="chat-container page-fade-in" role="region" aria-label="Chat">
      <div v-if="historyError" class="chat-history-warning" role="alert">{{ historyError }}</div>
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=V(()=>t.value.trim().length>0&&!s.value),p=f(Xe.state||"disconnected");let h=null;const m=V(()=>{const L=p.value;return L==="connected"?"Connected":L==="reconnecting"?"Reconnecting…":L==="connecting"?"Connecting…":"REST fallback"}),g=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],A=V(()=>{const L=Math.floor(l.value/4)%g.length,N=l.value;return N>3?`${g[L]} (${N}s)`:g[0]});function I(){At(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const L=i.value;L.style.height="auto",L.style.height=Math.min(L.scrollHeight,120)+"px"}function v(L,N,P={}){const ae={id:++c,role:L,content:N,timestamp:Date.now(),html:L==="bot"?sf(N):"",tools_used:P.tools_used||[],is_error:P.is_error||!1,images:L==="bot"?af(N):[],files:P.files||[],_showTools:!1};return e.value.push(ae),I(),L==="bot"&&At(()=>b()),ae}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(N=>{N.setAttribute("data-copy","true"),N.style.position="relative";const P=document.createElement("button");P.className="chat-code-copy",P.textContent="Copy",P.addEventListener("click",()=>{const ae=N.querySelector("code"),ne=ae?ae.textContent:N.textContent;navigator.clipboard.writeText(ne).then(()=>{P.textContent="Copied!",setTimeout(()=>{P.textContent="Copy"},1500)}).catch(()=>{})}),N.appendChild(P)})}function x(L){if(L===0)return!0;const N=e.value[L-1],P=e.value[L],ae=new Date(N.timestamp).toDateString(),ne=new Date(P.timestamp).toDateString();return ae!==ne}function _(L){const N=new Date(L),P=new Date;if(N.toDateString()===P.toDateString())return"Today";const ae=new Date(P);return ae.setDate(ae.getDate()-1),N.toDateString()===ae.toDateString()?"Yesterday":N.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function E(L){t.value=L,At(()=>Y())}function C(L){window.open(L,"_blank","noopener")}function w(L){L.target.style.display="none"}function R(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function B(){r&&(clearInterval(r),r=null),l.value=0}function S(L){s.value&&(s.value=!1,B(),L.type==="chat_response"?v("bot",L.content,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]}):L.type==="chat_error"&&v("bot",L.error||"Unknown error",{is_error:!0}),At(()=>{var N;return(N=i.value)==null?void 0:N.focus()}))}async function F(L){try{const N=await z.post("/api/chat",{content:L,channel_id:o.value});v("bot",N.response,{tools_used:N.tools_used||[],is_error:N.is_error||!1,files:N.files||[]})}catch(N){v("bot",N.message||"Failed to send message",{is_error:!0})}}async function Y(){const L=t.value.trim();if(!L||s.value)return;v("user",L),t.value="",s.value=!0,R(),i.value&&(i.value.style.height="auto"),Xe.connected&&Xe.sendChat(L,{channelId:o.value})||(await F(L),s.value=!1,B()),At(()=>{var P;return(P=i.value)==null?void 0:P.focus()})}async function j(){a.value="";try{if(!o.value){const N=await z.get("/api/auth/session");o.value=N.channel_id||N.user_id||"web-user"}const L=await z.get("/api/sessions/"+encodeURIComponent(o.value));if(L&&L.messages&&L.messages.length>0){for(const N of L.messages){const P=N.role==="user"?"user":"bot";let ae=N.content||"";if(P==="user"){const U=ae.match(/^\[.*?\]:\s*/);U&&(ae=ae.slice(U[0].length))}if(!ae.trim())continue;const ne={id:++c,role:P,content:ae,timestamp:N.timestamp?N.timestamp*1e3:Date.now(),html:P==="bot"?sf(ae):"",tools_used:[],is_error:!1,images:P==="bot"?af(ae):[],files:[],_showTools:!1};e.value.push(ne)}At(()=>{I(),b()})}}catch(L){L&&L.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",ke.error(a.value))}}return Ge(()=>{Xe.subscribe("chat",S),p.value=Xe.state||"disconnected",h=Xe.onState(L=>{p.value=L}),j(),At(()=>{var L;return(L=i.value)==null?void 0:L.focus()})}),ut(()=>{Xe.unsubscribe("chat",S),h&&(h(),h=null),B()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:m,typingText:A,suggestions:d,send:Y,autoResize:y,formatTime:ST,formatDate:_,showDateSeparator:x,useSuggestion:E,openImage:C,onImageError:w,getToolIcon:CT,loadHistory:j}}},RT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=V(()=>e.value==="custom"),g=V(()=>[...i.value,...l.value]),A=V(()=>l.value.includes(e.value)),I=V(()=>{var C;return m.value?t.value||"Odin":((C=n.value[e.value])==null?void 0:C.name)||e.value}),y=V(()=>{var C;return m.value?s.value||"(empty — will use Odin default)":((C=n.value[e.value])==null?void 0:C.identity)||""}),v=V(()=>{var C;return m.value?a.value||"(empty — will use Odin default)":((C=n.value[e.value])==null?void 0:C.voice)||""});async function b(){d.value=!0;try{const C=await z.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",a.value=C.custom_voice||"",n.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function x(){o.value=!0,c.value=null,r.value=!1;try{await z.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(C){c.value=C.message}finally{o.value=!1}}async function _(){const C=u.value.trim();if(C){h.value=!0,c.value=null;try{await z.post("/api/personality/presets",{name:C,display_name:I.value,identity:y.value,voice:v.value}),p.value=!1,u.value="",await b(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(w){c.value=w.message}finally{h.value=!1}}}async function E(){if(await qt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await z.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(w){c.value=w.message}}}return Ge(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:g,isCustom:m,isUserPreset:A,previewName:I,previewIdentity:y,previewVoice:v,saving:o,saved:r,error:c,loading:d,save:x,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:_,deletePreset:E,builtinPresets:i,userPresets:l}},template:`
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
  `},IT={props:["onComplete"],template:`
    <main class="login-shell" role="main" aria-labelledby="setup-title">
      <section class="login-panel" aria-describedby="setup-copy">
        <div class="login-brand" aria-hidden="true"><odin-icon name="brand" :size="30" /></div>
        <p class="login-eyebrow">First-install setup</p>
        <h1 id="setup-title" class="login-title">Odin</h1>
        <p id="setup-copy" class="login-subtitle">Finish initialization with an optional web credential. Discord can be attached now or later.</p>
        <p class="text-xs text-gray-500 mb-4">Setup does not widen the loopback listener. For remote access, set Web authentication, finish setup, sign in as administrator, then explicitly save listener consent in System → Config. An operator restart is required.</p>

        <p class="text-sm text-gray-400 mb-4" role="status" aria-live="polite">{{ statusMessage }}</p>
        <div v-if="error" class="mb-3 text-red-400 text-sm" role="alert">{{ error }}</div>
        <button v-if="completed" @click="onComplete" class="btn btn-primary w-full justify-center mb-4">Continue</button>

        <form v-else @submit.prevent="save" aria-label="Initial setup">
          <label for="setup-web-token" class="text-xs text-gray-400 block mb-1">Web API token</label>
          <input id="setup-web-token" v-model="webApiToken" type="password" class="hm-input mb-3"
                 autocomplete="new-password" placeholder="Set one now, or continue without it" />

          <label for="setup-discord-token" class="text-xs text-gray-400 block mb-1">Discord token <span class="text-gray-500">optional</span></label>
          <input id="setup-discord-token" v-model="discordToken" type="password" class="hm-input mb-2"
                 autocomplete="off" placeholder="Attach Discord now, or leave blank" />
          <p class="text-xs text-gray-500 mb-4">Discord attachment is saved without scheduling a restart.</p>

          <button type="submit" class="btn btn-primary w-full justify-center" :disabled="saving">
            <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            {{ saving ? 'Saving…' : 'Save setup' }}
          </button>
        </form>

        <div class="mt-5 pt-4 border-t border-gray-700">
          <h2 class="text-sm font-semibold text-gray-300 mb-2">Codex device sign-in</h2>
          <p class="text-xs text-gray-500 mb-3">Optional. You may sign in before or after saving setup.</p>
          <button v-if="!deviceState" @click="startDeviceLogin" class="btn btn-ghost text-xs" :disabled="deviceLoading">
            {{ deviceLoading ? 'Requesting code…' : 'Start device sign-in' }}
          </button>
          <div v-else-if="deviceState === 'pending'" class="p-3 bg-gray-800 rounded border border-gray-700">
            <p class="text-sm text-gray-300 mb-1">Open <a :href="deviceInfo.verify_url" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline">{{ deviceInfo.verify_url }}</a></p>
            <p class="text-sm text-gray-300">Enter code: <code class="bg-gray-900 px-2 py-1 rounded font-bold text-white">{{ deviceInfo.user_code }}</code></p>
            <p class="text-xs text-gray-500 mt-3" role="status" aria-live="polite">Connecting account…</p>
            <button @click="cancelDeviceLogin" class="btn btn-ghost text-xs mt-2">Cancel</button>
          </div>
          <div v-else-if="deviceState === 'ready'" class="p-3 bg-green-900/30 rounded border border-green-800" role="status">
            <p class="text-green-400 text-sm">Device account ready{{ deviceResult.email ? ': ' + deviceResult.email : '' }}.</p>
            <button @click="clearDeviceState" class="btn btn-ghost text-xs mt-2">Done</button>
          </div>
          <div v-else class="p-3 bg-red-900/30 rounded border border-red-800" role="alert">
            <p class="text-red-400 text-sm">{{ deviceError }}</p>
            <button @click="clearDeviceState" class="btn btn-ghost text-xs mt-2">Try again</button>
          </div>
        </div>
      </section>
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,h=null;function m(){return p+=1,h==null||h.abort(),h=null,p}function g(x,_,E){return typeof z.postWithOptions=="function"?z.postWithOptions(x,_,{signal:E}):z.post(x,_)}async function A(){var E,C,w;a.value=!0,i.value="",l.value="Saving setup…";const x={},_=!!s.value.trim();t.value.trim()&&(x.web_api_token=t.value.trim()),s.value.trim()&&(x.discord_token=s.value.trim());try{const R=z.post("/api/setup/complete",x);t.value="",s.value="";const B=await R,S=((E=B.discord)==null?void 0:E.state)||B.discord_status;if(S==="failed"?(i.value=((C=B.discord)==null?void 0:C.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):S==="connecting"?l.value="Saved. Connecting Discord…":S==="ready"?l.value="Saved. Discord ready.":_?l.value="Saved. Discord token stored; attachment status is pending.":l.value=B.message||"Setup saved. Ready to sign in.",(w=B.restart_required)!=null&&w.length){const F=B.message||`Restart Odin to apply: ${B.restart_required.join(", ")}`;l.value.includes(F)||(l.value+=` ${F}`)}n.value=!0}catch(R){i.value=R.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function I(){const x=m(),_=typeof AbortController=="function"?new AbortController:null;h=_,o.value=!0,u.value="";try{const E=await g("/api/codex/device-code",void 0,_==null?void 0:_.signal);if(x!==p)return;c.value=E,r.value="pending";const C=await g("/api/codex/device-poll",{device_auth_id:E.device_auth_id,user_code:E.user_code,interval:E.interval},_==null?void 0:_.signal);if(x!==p)return;d.value=C||{},r.value="ready"}catch(E){x===p&&(E==null?void 0:E.name)!=="AbortError"&&(u.value=E.message||"Device sign-in failed.",r.value="failed")}finally{x===p&&(o.value=!1,h=null)}}function y(){m(),o.value=!1,b()}function v(){var x;(x=e.onComplete)==null||x.call(e)}function b(){r.value="",c.value=null,d.value={},u.value=""}return ut(()=>{m()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:A,onComplete:v,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:I,cancelDeviceLogin:y,clearDeviceState:b}}},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Hv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:d1,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:AT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:Ek,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Mk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:aS,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:RT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:a1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/hosts",redirect:kt("/system","hosts")},{path:"/internals",redirect:kt("/system","internals")}],Ji=ek({history:Lw(),routes:Hv});Ji.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const OT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{z.setPersist(n.value),await z.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},LT={template:`
    <div v-if="authState === 'checking'" class="app-loading" role="status" aria-label="Loading">
      <div class="brand-loader"><odin-icon name="brand" :size="28" /></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <setup-page v-else-if="authState === 'setup'" :on-complete="onSetupComplete" />
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
      </aside>

      <!-- Outside the aside on purpose: the mobile sidebar is translated
           off-canvas, and a transformed ancestor becomes the containing
           block for position:fixed — a toast mounted inside it renders
           off-screen with the rail (audit 4.1). -->
      <transition name="ws-toast">
        <div v-if="wsToast" class="ws-toast" :class="'ws-toast-' + wsToast.level" role="status" aria-live="assertive">
          {{ wsToast.text }}
        </div>
      </transition>

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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),g=f(""),A=Hv.filter(U=>U.meta),I=V(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:A.filter(J=>J.meta.section===U)})).filter(U=>U.routes.length)),y=V(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),v=V(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=V(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function x(){Xe.disconnect(),L&&(clearInterval(L),L=null)}z.onSessionExpired=()=>{t.value=!0,x(),z.setToken(""),e.value="login"};function _(U){var J;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),Pp());return}if(a.value&&U.key==="Tab"){const ie=[...((J=n.value)==null?void 0:J.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(ie.length){const K=ie[0],me=ie[ie.length-1];if(U.shiftKey&&(document.activeElement===K||!n.value.contains(document.activeElement))){U.preventDefault(),me.focus();return}if(!U.shiftKey&&(document.activeElement===me||!n.value.contains(document.activeElement))){U.preventDefault(),K.focus();return}}}if(U.key==="Escape"&&a.value){a.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const ie=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');ie&&ie.focus()}}function E(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function C(){try{const U=await z.get("/api/setup/status");if(U.mode==="pending"||U.needed===!0)return x(),e.value="setup",!0}catch(U){U==null||U.name}return!1}Ge(async()=>{if(document.addEventListener("keydown",_),o=window.matchMedia("(max-width: 900px)"),E(),o.addEventListener("change",E),await C())return;const U=await z.check();U.ok?(e.value="ready",ae()):U.needsAuth?e.value="login":(e.value="ready",ae())});function w(){t.value=!1,e.value="ready",ae()}async function R(){if(await C())return;const U=await z.check();U.ok?(e.value="ready",ae()):U.needsAuth?e.value="login":(e.value="ready",ae())}async function B(){x(),e.value="login",await z.logout()}function S(){s.value=!s.value}function F(){a.value=!a.value}Dt(a,async U=>{var J,ie;if(U)r=document.activeElement,await At(),(ie=(J=n.value)==null?void 0:J.querySelector(".nav-item"))==null||ie.focus();else if(r!=null&&r.isConnected){const K=r;r=null,requestAnimationFrame(()=>K.focus())}});const Y=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function j(U,J="info",ie=3e3){p.value={text:U,level:J},clearTimeout(h),h=setTimeout(()=>{p.value=null},ie)}let L=null,N=!1,P=[];function ae(){for(const U of P)U();P=[Xe.onStatus(U=>{c.value=U}),Xe.onLatencyChange(U=>{u.value=U}),Xe.onState((U,J)=>{d.value=U,U==="connected"?(N&&j("Connection restored","success"),N=!0):U==="reconnecting"&&J.attempt===1&&j("Connection lost — reconnecting…","warn")})],Xe.connect(),ne(),L&&clearInterval(L),L=setInterval(ne,15e3)}async function ne(){try{const U=await z.get("/api/status");m.value=U.status==="online"?"online":"starting";const J=U.uptime_seconds||0,ie=Math.floor(J/3600),K=Math.floor(J%3600/60);g.value=`${ie}h ${K}m uptime`}catch{m.value="offline",g.value=""}}return ut(()=>{L&&clearInterval(L);for(const U of P)U();P=[],Xe.disconnect(),document.removeEventListener("keydown",_),o==null||o.removeEventListener("change",E)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:Y,wsToast:p,botStatus:m,botUptime:g,navRoutes:A,navGroups:I,currentPage:y,currentSection:v,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:w,onSetupComplete:R,logout:B,toggleSidebar:S,toggleMobileNavigation:F,openPalette:Pp}}},Ua=So(LT);Ua.component("odin-icon",o1);Ua.component("login-screen",OT);Ua.component("setup-page",IT);Ua.component("toast-container",G_);Ua.component("confirm-host",W_);Ua.component("command-palette",l1);Ua.directive("modal-focus",c1);Ua.use(Ji);Ua.mount("#app");
